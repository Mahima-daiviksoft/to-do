import { Client, ReconnectionTimeMode, type IMessage, type StompSubscription } from '@stomp/stompjs';
import type {
  CommandAck, ConnectionStatus, ErrorDto, ListSnapshot, ListState, TodoCommand, TodoEvent, TodoItem,
} from './types';

/**
 * Production-style STOMP client for the to-do server. It implements the patterns from the book:
 *  - one shared connection, JWT in the CONNECT frame, token refreshed before every (re)connect
 *  - heart-beats, connection timeout, exponential reconnect backoff with per-client jitter
 *  - subscriptions re-created after every reconnect
 *  - subscribe-then-snapshot, per-list sequence numbers, duplicate dropping, gap detection + REST resync
 *  - commands with idempotency keys, resent after reconnect, resolved by acks/errors
 *  - React Native workarounds behind a flag
 */
export interface TodoRealtimeOptions {
  /** e.g. "http://localhost:8080" (use your LAN IP / 10.0.2.2 from Android emulators) */
  baseUrl: string;
  /** Must return a fresh, valid access token (refresh it here if it's close to expiry). */
  getToken: () => Promise<string>;
  /** Enables stompjs's React Native workarounds (NULL-byte truncation). */
  reactNative?: boolean;
  /** How long a command may wait for its ack (including while offline). Default 15 s. */
  commandTimeoutMs?: number;
  debug?: (msg: string) => void;
}

export class CommandError extends Error {
  constructor(public readonly error: ErrorDto) {
    super(`${error.code}: ${error.message}`);
  }
}

interface PendingCommand {
  destination: string;
  command: TodoCommand;
  resolve: (ack: CommandAck) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

const newRequestId = (): string =>
  globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;

export class TodoRealtimeClient {
  private readonly client: Client;
  private readonly trackers = new Map<string, ListTracker>();
  private readonly pending = new Map<string, PendingCommand>();
  private readonly statusListeners = new Set<(s: ConnectionStatus) => void>();
  private readonly errorListeners = new Set<(e: ErrorDto) => void>();
  private _status: ConnectionStatus = 'offline';

  constructor(private readonly opts: TodoRealtimeOptions) {
    const wsUrl = opts.baseUrl.replace(/^http/, 'ws').replace(/\/$/, '') + '/ws';
    this.client = new Client({
      brokerURL: wsUrl,
      heartbeatIncoming: 10_000,
      heartbeatOutgoing: 10_000,
      connectionTimeout: 8_000,
      // Jitter: every client starts from a different delay, so a server restart doesn't cause a reconnect storm.
      reconnectDelay: 1_000 + Math.floor(Math.random() * 2_000),
      reconnectTimeMode: ReconnectionTimeMode.EXPONENTIAL,
      maxReconnectDelay: 30_000,
      // If the connection attempt times out or heart-beats stop, drop the socket immediately instead of waiting for
      // a close handshake that may never complete (seen with a socket stuck in CONNECTING): reconnect starts at once.
      discardWebsocketOnCommFailure: true,
      forceBinaryWSFrames: !!opts.reactNative,
      appendMissingNULLonIncoming: !!opts.reactNative,
      debug: opts.debug ?? (() => {}),
      beforeConnect: async () => {
        // NEVER let beforeConnect throw: stompjs 7.x awaits it without try/catch, so a rejection becomes an
        // unhandled promise rejection AND silently ends the reconnect loop. On failure we keep the previous
        // headers; the attempt then fails (or is rejected by the server) and the normal backoff retries.
        try {
          this.client.connectHeaders = { Authorization: `Bearer ${await opts.getToken()}` };
        }
        catch (err) {
          opts.debug?.(`getToken failed, retrying with backoff: ${String(err)}`);
        }
      },
      onConnect: () => this.onConnected(),
      onStompError: (frame) => {
        // The server sends ERROR (then closes) for auth failures, forbidden subscriptions and rate limiting.
        opts.debug?.(`STOMP ERROR ${frame.headers['message']}: ${frame.body}`);
        if (frame.headers['message'] === 'UNAUTHORIZED') this.setStatus('unauthorized');
      },
      onWebSocketClose: () => {
        if (this.client.active && this._status !== 'unauthorized') this.setStatus('reconnecting');
      },
    });
  }

  // ------------------------------------------------------------------ lifecycle

  get status(): ConnectionStatus {
    return this._status;
  }

  start(): void {
    this.setStatus('connecting');
    this.client.activate();
  }

  async stop(): Promise<void> {
    await this.client.deactivate();          // sends DISCONNECT, stops reconnecting
    for (const p of this.pending.values()) {
      clearTimeout(p.timer);
      p.reject(new Error('Client stopped'));
    }
    this.pending.clear();
    this.setStatus('offline');
  }

  onStatus(listener: (s: ConnectionStatus) => void): () => void {
    this.statusListeners.add(listener);
    listener(this._status);
    return () => this.statusListeners.delete(listener);
  }

  onError(listener: (e: ErrorDto) => void): () => void {
    this.errorListeners.add(listener);
    return () => this.errorListeners.delete(listener);
  }

  private setStatus(s: ConnectionStatus): void {
    if (s === this._status) return;
    this._status = s;
    this.statusListeners.forEach((l) => l(s));
  }

  private onConnected(): void {
    this.setStatus('live');
    this.client.subscribe('/user/queue/acks', (m) => this.onAck(JSON.parse(m.body) as CommandAck));
    this.client.subscribe('/user/queue/errors', (m) => this.onCommandError(JSON.parse(m.body) as ErrorDto));
    // Subscriptions die with the connection: re-create them and resync every watched list.
    for (const tracker of this.trackers.values()) tracker.attach();
    // Resend commands that were never acknowledged. Safe because the server dedupes by clientRequestId.
    for (const p of this.pending.values()) this.publish(p.destination, p.command);
  }

  // ------------------------------------------------------------------ lists

  /** Watch a list. The callback receives a new immutable state on every change. Returns an unsubscribe function. */
  watchList(listId: string, onChange: (state: ListState) => void): () => void {
    let tracker = this.trackers.get(listId);
    if (!tracker) {
      tracker = new ListTracker(listId, this.client, (path) => this.fetchJson(path), this.opts.debug);
      this.trackers.set(listId, tracker);
      if (this.client.connected) tracker.attach();
    }
    tracker.listeners.add(onChange);
    onChange(tracker.state);
    return () => {
      tracker.listeners.delete(onChange);
      if (tracker.listeners.size === 0) {
        tracker.detach();
        this.trackers.delete(listId);
      }
    };
  }

  // ------------------------------------------------------------------ commands

  addItem(listId: string, title: string): Promise<CommandAck> {
    return this.send('/app/todo.upsert', { listId, title, done: false, clientRequestId: newRequestId() });
  }

  updateItem(listId: string, item: TodoItem, changes: { title?: string; done?: boolean }): Promise<CommandAck> {
    return this.send('/app/todo.upsert', {
      listId, itemId: item.id, ...changes, expectedVersion: item.version, clientRequestId: newRequestId(),
    });
  }

  deleteItem(listId: string, itemId: string): Promise<CommandAck> {
    return this.send('/app/todo.delete', { listId, itemId, clientRequestId: newRequestId() });
  }

  /** Low-level: send any command. If offline, it's queued and sent after reconnect. */
  send(destination: string, command: TodoCommand): Promise<CommandAck> {
    return new Promise<CommandAck>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(command.clientRequestId);
        reject(new Error(`No acknowledgement for ${command.clientRequestId} within timeout`));
      }, this.opts.commandTimeoutMs ?? 15_000);
      this.pending.set(command.clientRequestId, { destination, command, resolve, reject, timer });
      if (this.client.connected) this.publish(destination, command);
    });
  }

  private publish(destination: string, command: TodoCommand): void {
    this.client.publish({
      destination,
      body: JSON.stringify(command),
      headers: { 'content-type': 'application/json' },     // Spring picks the JSON converter from this header
    });
  }

  private onAck(ack: CommandAck): void {
    const p = this.pending.get(ack.clientRequestId);
    if (!p) return;
    clearTimeout(p.timer);
    this.pending.delete(ack.clientRequestId);
    p.resolve(ack);
  }

  private onCommandError(error: ErrorDto): void {
    const p = error.clientRequestId ? this.pending.get(error.clientRequestId) : undefined;
    if (p && error.clientRequestId) {
      clearTimeout(p.timer);
      this.pending.delete(error.clientRequestId);
      p.reject(new CommandError(error));
    }
    this.errorListeners.forEach((l) => l(error));
    if (error.code === 'CONFLICT') {
      // Someone else changed the item: make sure we show the latest state.
      for (const t of this.trackers.values()) void t.resync();
    }
  }

  // ------------------------------------------------------------------ REST

  private async fetchJson(path: string): Promise<{ status: number; body: unknown }> {
    const res = await fetch(this.opts.baseUrl.replace(/\/$/, '') + path, {
      headers: { Authorization: `Bearer ${await this.opts.getToken()}` },
    });
    const text = await res.text();
    return { status: res.status, body: text ? JSON.parse(text) : null };
  }
}

/**
 * Keeps one list in sync: live events + snapshot/resync, ordered by seq.
 */
class ListTracker {
  readonly listeners = new Set<(s: ListState) => void>();
  state: ListState;
  private subscription?: StompSubscription;
  private buffer: TodoEvent[] | null = null;   // non-null while (re)syncing
  private resyncRunning = false;
  private resyncAgain = false;

  constructor(
    private readonly listId: string,
    private readonly client: Client,
    private readonly fetchJson: (path: string) => Promise<{ status: number; body: unknown }>,
    private readonly debug?: (msg: string) => void,
  ) {
    this.state = { listId, seq: 0, items: [], syncing: true };
  }

  /** Subscribe FIRST, then load: events that arrive during the load are buffered, so nothing is missed. */
  attach(): void {
    this.subscription = this.client.subscribe(`/topic/todo.list.${this.listId}`, (m: IMessage) =>
      this.onEvent(JSON.parse(m.body) as TodoEvent));
    void this.resync();
  }

  detach(): void {
    if (this.client.connected) this.subscription?.unsubscribe();
    this.subscription = undefined;
  }

  private onEvent(e: TodoEvent): void {
    if (this.buffer) {
      this.buffer.push(e);
      return;
    }
    if (e.seq <= this.state.seq) return;                 // duplicate / already applied
    if (e.seq > this.state.seq + 1) {                    // gap: we missed something
      this.debug?.(`gap in ${this.listId}: have ${this.state.seq}, got ${e.seq}; resyncing`);
      this.buffer = [e];
      void this.resync();
      return;
    }
    this.apply([e]);
  }

  async resync(): Promise<void> {
    if (this.resyncRunning) {
      this.resyncAgain = true;
      return;
    }
    this.resyncRunning = true;
    this.buffer ??= [];
    this.emit({ ...this.state, syncing: true });
    try {
      do {
        this.resyncAgain = false;
        await this.catchUp();
      } while (this.resyncAgain);
      // Apply what arrived while we were loading, in order; anything still out of order triggers a reload.
      const buffered = (this.buffer ?? []).sort((a, b) => a.seq - b.seq);
      this.buffer = null;
      for (const e of buffered) this.onEvent(e);
      if (!this.buffer) this.emit({ ...this.state, syncing: false });
    }
    catch (err) {
      this.debug?.(`resync of ${this.listId} failed: ${String(err)}`);
      this.buffer = null;
      this.emit({ ...this.state, syncing: false });
    }
    finally {
      this.resyncRunning = false;
    }
  }

  private async catchUp(): Promise<void> {
    if (this.state.seq > 0) {
      const res = await this.fetchJson(`/api/lists/${this.listId}/events?after=${this.state.seq}`);
      if (res.status === 200) {
        this.apply(res.body as TodoEvent[]);
        return;
      }
      if (res.status !== 410) throw new Error(`events: HTTP ${res.status}`);
      // 410 Gone: the server's event log no longer reaches back that far → full snapshot.
    }
    const res = await this.fetchJson(`/api/lists/${this.listId}`);
    if (res.status !== 200) throw new Error(`snapshot: HTTP ${res.status}`);
    const snap = res.body as ListSnapshot;
    this.state = { listId: this.listId, seq: snap.seq, items: snap.items, syncing: true };
  }

  private apply(events: TodoEvent[]): void {
    let items = this.state.items;
    let seq = this.state.seq;
    for (const e of events) {
      if (e.seq <= seq) continue;
      seq = e.seq;
      if (e.type === 'todo.item.deleted') {
        items = items.filter((i) => i.id !== e.item.id);
      }
      else if (e.type === 'todo.item.created' || e.type === 'todo.item.updated') {
        const existing = items.find((i) => i.id === e.item.id);
        if (!existing) items = [...items, e.item];
        else if (e.item.version >= existing.version) items = items.map((i) => (i.id === e.item.id ? e.item : i));
      }
      // Unknown event types: ignore the payload but keep the seq (forward compatibility).
    }
    this.state = { ...this.state, seq, items };
    if (!this.buffer) this.emit(this.state);
  }

  private emit(state: ListState): void {
    this.state = state;
    this.listeners.forEach((l) => l(state));
  }
}
