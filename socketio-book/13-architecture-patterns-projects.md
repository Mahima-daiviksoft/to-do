# Chapter 13 — Architecture, Patterns, Organisational Best Practices and Full Projects

> **Goal:** design real-time features the way experienced teams do: proven patterns
> (presence, typing, read receipts, notifications, live data, collaboration, games,
> tracking, uploads, progress), a reference architecture for big organisations, team
> standards, and a "what to do when…" decision guide.

---

## 13.1 Reference architecture (large organisation)

```
           ┌─────────── Clients (web, iOS, Android) ───────────┐
           │  socket.io-client  ·  REST/GraphQL for CRUD/history │
           └───────────────┬─────────────────────┬──────────────┘
                           │ wss (sticky)        │ https
                    ┌──────▼──────┐        ┌─────▼─────┐
                    │  LB / Ingress│        │ API GW    │
                    └──────┬──────┘        └─────┬─────┘
         ┌─────────────────▼───────────┐   ┌─────▼────────────┐
         │ Realtime Gateway (Socket.IO)│   │ Domain services   │
         │ N pods, stateless           │   │ (orders, chat,    │
         │ auth, rooms, fan-out        │   │  billing, …)      │
         └───┬───────────────▲─────────┘   └───┬──────────────┘
             │ adapter        │ consume         │ publish domain events
         ┌───▼────┐      ┌────┴──────────────────▼───┐
         │ Redis  │      │ Broker (Kafka/RabbitMQ/SQS)│
         │(adapter│      └────────────────────────────┘
         │presence│
         │ratelim)│        ┌──────────┐
         └────────┘        │ Database │  (source of truth: messages, notifications)
                           └──────────┘
```

Principles:

1. **The gateway owns connections, not business logic.** It authenticates, authorizes
   subscriptions (room joins), validates, and fans out. Domain services publish events to
   a broker; the gateway consumes and emits to rooms (or services use an emitter).
2. **Database is the source of truth.** Sockets deliver *notifications of change*; clients
   can always re-sync via REST/acks.
3. **Commands via socket or HTTP, both fine** — but commands must be idempotent and
   acknowledged. Many teams send *writes via HTTP* (easier caching, auth, retries,
   observability) and use sockets only for *server→client push*. Both are valid; be
   consistent.
4. **Stateless gateway pods** + adapter + sticky sessions → horizontal scaling.
5. **Contracts** (event names, payload schemas) are versioned and shared.

---

## 13.2 Pattern: Presence (online/offline) — robust version

Requirements: a user is online if **any** of their devices is connected; no flicker on
brief reconnections; correct across many nodes; self-healing after crashes.

```js
// Redis keys:
//   presence:conn:<userId>  -> sorted set of connectionIds, score = lastSeen (ms)
const GRACE_MS = 10_000;     // wait before announcing "offline"
const STALE_MS = 60_000;     // connections not refreshed for this long are dead (crashed node)

io.on("connection", async (socket) => {
  const userId = socket.data.user.id;
  const connKey = `presence:conn:${userId}`;
  const connId = `${process.env.HOSTNAME}:${socket.id}`;

  const wasOnline = (await redis.zCard(connKey)) > 0;
  await redis.zAdd(connKey, { score: Date.now(), value: connId });
  if (!wasOnline) io.to(`presence:${userId}`).emit("presence:update", { userId, online: true });

  // heartbeat to refresh lastSeen (crash safety)
  const hb = setInterval(() => redis.zAdd(connKey, { score: Date.now(), value: connId }), 20_000);

  socket.on("disconnect", async () => {
    clearInterval(hb);
    await redis.zRem(connKey, connId);
    setTimeout(async () => {
      await redis.zRemRangeByScore(connKey, 0, Date.now() - STALE_MS); // drop stale entries
      if ((await redis.zCard(connKey)) === 0) {
        await redis.set(`presence:lastSeen:${userId}`, Date.now());
        io.to(`presence:${userId}`).emit("presence:update", { userId, online: false });
      }
    }, GRACE_MS);
  });

  // subscribe to presence of contacts (authorized!)
  socket.on("presence:subscribe", async ({ userIds }, ack) => {
    const allowed = await contacts.filterVisible(userId, userIds.slice(0, 500));
    await socket.join(allowed.map((id) => `presence:${id}`));
    const states = await Promise.all(allowed.map(async (id) => ({
      userId: id, online: (await redis.zCard(`presence:conn:${id}`)) > 0,
    })));
    ack?.({ ok: true, data: states });
  });
});
```

Key ideas to explain in interviews: **count connections per user**, **grace period**,
**TTL/heartbeat for crash safety**, **subscribe to presence rooms** instead of
broadcasting every presence change to everyone (O(N²) problem), **authorize** who can see
whose presence, **last seen** timestamp.

---

## 13.3 Pattern: Typing indicator

```js
// client: emit at most every 2 s while typing; stop event when idle
let typingTimer, lastSent = 0;
input.addEventListener("input", () => {
  const now = Date.now();
  if (now - lastSent > 2000) {
    socket.volatile.emit("typing:start", { conversationId });
    lastSent = now;
  }
  clearTimeout(typingTimer);
  typingTimer = setTimeout(() => socket.volatile.emit("typing:stop", { conversationId }), 3000);
});

// server: relay to others in the conversation (membership checked)
socket.on("typing:start", ({ conversationId }) => {
  if (!socket.rooms.has(`conversation:${conversationId}`)) return;
  socket.to(`conversation:${conversationId}`).volatile.emit("typing", { conversationId, userId: socket.data.user.id, typing: true });
});

// receiving client: auto-expire the indicator after 5 s without refresh (in case "stop" is lost)
```

Properties: **volatile** (losing one is fine), **throttled**, **self-expiring** on the
receiver, **excludes sender**, no DB writes.

---

## 13.4 Pattern: Chat message flow with optimistic UI, acks and dedupe

```
Client                                   Server                               Others
  | render "sending…" (clientMsgId)        |                                     |
  |-- message:send {clientMsgId,text} ---->| validate, authorize                 |
  |                                        | INSERT … ON CONFLICT(clientMsgId) DO NOTHING (idempotent)
  |                                        |-- io.to(conv).emit(message:new) --->| render
  |<-- ack {ok, id, createdAt} ------------|                                     |
  | replace temp message with server data  |                                     |
  | (also receives message:new → dedupe by id/clientMsgId)                       |
  | on timeout → retry with SAME clientMsgId (safe) or show "tap to retry"       |
```

- **Ordering in the conversation**: server-assigned monotonic ids/timestamps; clients sort
  by server order, not by arrival.
- **Missed messages**: on `connect`, `sync` from last known id (Chapter 5).
- **Read receipts**: client emits `conversation:read { conversationId, upToMessageId }`
  (throttled); server stores per-user pointer and emits `receipt:update` to the room —
  store a **pointer** per user, not a flag per message.
- **Delivery receipts** ("delivered" ✓✓): the recipient client acks receipt or reports its
  latest received id on sync.
- **Unread counts**: computed from the read pointer; push `unread:update` to `user:<id>`.

---

## 13.5 Pattern: Notifications system

1. Service creates a notification → **persist** in DB (`notifications` table with
   `user_id`, `read_at`).
2. Publish event → gateway → `io.to("user:" + userId).emit("notification:new", n)`.
3. Clients online get it instantly; offline users see it on next load (REST
   `GET /notifications?unread=true`) and/or via **push notifications** (FCM/APNs/Web Push)
   — Socket.IO doesn't reach closed apps.
4. Mark as read via event or REST; broadcast `notification:read` to the user's other devices
   (`user:<id>` room) so badges sync across tabs.
5. Don't push to users who aren't connected through sockets *and* via push for the same
   notification without dedupe on the client.

---

## 13.6 Pattern: Live data subscriptions (dashboards, tickers, sports scores)

```js
socket.on("ticker:subscribe", async ({ symbols }, ack) => {
  const allowed = symbols.filter(isValidSymbol).slice(0, 50);   // cap per socket
  await socket.join(allowed.map((s) => `ticker:${s}`));
  ack?.({ ok: true, data: await snapshot(allowed) });          // initial snapshot
});
socket.on("ticker:unsubscribe", ({ symbols }) => symbols.forEach((s) => socket.leave(`ticker:${s}`)));

// market data consumer (one per node or via a single publisher + adapter)
feed.on("tick", (t) => latest.set(t.symbol, t));
setInterval(() => {                                              // coalesce to 4 updates/s
  for (const [symbol, t] of latest) io.to(`ticker:${symbol}`).volatile.emit("tick", t);
  latest.clear();
}, 250);
```

Patterns: **snapshot + deltas**, **subscription rooms**, **coalescing**, **volatile**,
**caps**. If every node consumes the full feed itself, emit with `io.local` to avoid
re-broadcasting through the adapter (each node delivers to its own sockets).

---

## 13.7 Pattern: Collaborative editing

Naively relaying edits causes conflicts. Use a convergence algorithm:

- **OT (Operational Transformation)** — Google Docs style; server transforms concurrent ops
  (e.g. ShareDB).
- **CRDTs** — e.g. **Yjs** or **Automerge**: every client applies updates in any order and
  converges. Socket.IO can be the transport (e.g. the `y-socket.io` provider, or relay
  binary Yjs updates yourself).

Socket.IO responsibilities: rooms per document (`doc:<id>`), authorization, relaying
binary updates (`socket.to(room).emit("doc:update", update)`), awareness (cursors —
volatile, throttled), persistence of document state (periodically snapshot to DB),
initial sync on join (state vector exchange in Yjs). Mention **binary** payloads and
**ordering per doc**.

---

## 13.8 Pattern: Multiplayer game (server-authoritative)

```js
// server: authoritative simulation at a fixed tick rate
const TICK_MS = 50; // 20 Hz
setInterval(() => {
  for (const match of matches.values()) {
    match.applyInputs();               // inputs queued from clients
    match.step(TICK_MS);
    io.to(`match:${match.id}`).volatile.compress(false).emit("state", match.snapshot()); // compact snapshot
  }
}, TICK_MS);

socket.on("input", ({ seq, keys }) => {
  const match = matches.get(socket.data.matchId);
  match?.queueInput(socket.data.playerId, seq, keys);  // validate: rate, legal moves (anti-cheat)
});
```

- Clients send **inputs**, not positions (anti-cheat); server validates.
- Clients do **prediction + reconciliation** using input sequence numbers, and
  **interpolation** of other players between snapshots.
- `volatile` for state snapshots; binary/msgpack for compactness.
- One match = one room; matchmaking assigns players to a node (or route all players of a
  match to the same node — sharding by match id — to keep simulation local).
- For twitchy shooters, TCP-based transports (WebSocket) suffer head-of-line blocking;
  consider WebRTC data channels / WebTransport datagrams.

---

## 13.9 Pattern: Live location tracking (delivery/ride apps)

- Driver app emits location every N seconds (adaptive: faster when moving), **volatile**,
  throttled; server validates (speed sanity), stores **latest** in Redis (GEOADD) and
  appends to a history store in batches.
- Riders/customers join `trip:<id>` (authorized) and receive throttled updates.
- Dispatchers subscribe to geo areas (`geo:<geohash-prefix>` rooms) — update the driver's
  area room membership when it moves across cells.
- Background location on mobile requires native background modes + HTTP fallback (sockets
  die in background).

---

## 13.10 Pattern: Chunked file upload with flow control

```js
// client
async function upload(file) {
  const CHUNK = 256 * 1024; // < maxHttpBufferSize
  const { uploadId } = await socket.timeout(5000).emitWithAck("upload:start", { name: file.name, size: file.size, type: file.type });
  for (let offset = 0; offset < file.size; offset += CHUNK) {
    const chunk = await file.slice(offset, offset + CHUNK).arrayBuffer();
    await socket.timeout(10000).emitWithAck("upload:chunk", { uploadId, offset, chunk }); // ack = backpressure
    onProgress(Math.min(1, (offset + CHUNK) / file.size));
  }
  return socket.timeout(10000).emitWithAck("upload:end", { uploadId });
}

// server
socket.on("upload:chunk", async ({ uploadId, offset, chunk }, ack) => {
  const u = uploads.get(uploadId);
  if (!u || u.owner !== socket.id || offset !== u.received) return ack({ ok: false, error: "BAD_STATE" });
  await u.stream.write(chunk);    // Buffer
  u.received += chunk.length;
  ack({ ok: true });
});
```

Each chunk waits for its ack → natural **backpressure**; offsets allow **resume** after
reconnection. For large files, HTTP (multipart/resumable/pre-signed S3 URLs) is usually
better; use this pattern when you need upload over an existing socket.

---

## 13.11 Pattern: Long-running job progress

1. Client starts the job via HTTP → gets `jobId`.
2. Client emits `job:subscribe { jobId }` (authorized) → joins `job:<jobId>`; ack returns
   current status (so a late subscriber isn't stuck).
3. Workers publish progress via **emitter**: `emitter.to("job:" + id).emit("job:progress", { pct })`,
   throttled (e.g. at most every 500 ms).
4. On completion: `job:done` with result URL; job status persisted so a reconnecting
   client can query it.

---

## 13.12 Pattern: Auctions / inventory / anything with races

- Server is the authority; clients send **bids** (commands with ack).
- Use **atomic DB operations** (`UPDATE … SET price = $1 WHERE id = $2 AND price < $1`
  or Redis Lua scripts) — never "read, compare in JS, write" across nodes.
- Broadcast the **accepted** state with a version number; clients ignore older versions.
- Server time for deadlines (send `serverNow` so clients can compute clock offset).
- Anti-sniping extensions handled server-side.

---

## 13.13 Pattern: Multi-tenancy

Options:

1. **Room prefixes per tenant** (`t:<tenantId>:…`), tenant id from the authenticated user
   — simplest, works with one namespace.
2. **Dynamic namespaces per tenant** (`/tenant-<id>`) with tenant-specific middleware;
   `cleanupEmptyChildNamespaces: true`.
3. **Separate clusters** per large tenant/region (isolation, data residency).

Always derive the tenant from auth, never from the client's choice, and include the
tenant in every room name to prevent cross-tenant leaks.

---

## 13.14 Pattern: RPC over sockets

Acks give you request/response. A typed RPC helper:

```ts
async function rpc<T>(event: string, payload: unknown, ms = 8000): Promise<T> {
  const res = await socket.timeout(ms).emitWithAck(event, payload);
  if (!res.ok) throw Object.assign(new Error(res.error.message ?? res.error.code), { code: res.error.code });
  return res.data as T;
}
```

Use for interactions that are inherently bound to the live session (join room + get
history). For generic CRUD prefer HTTP (caching, tooling).

---

## 13.15 Organisational standards (put these in your engineering handbook)

### Code structure

- Feature-based handler modules: `registerXHandlers(io, socket, deps)`.
- Handlers are thin: validate → authorize → call service → emit/ack.
- Services are transport-agnostic (callable from HTTP, jobs, tests).
- A single `createRealtimeServer(httpServer, config)` factory used by app and tests.

### Event contract standards

- Naming: `domain:action` lowercase; commands imperative (`message:send`), facts past
  tense (`message:created`) — pick and document one style.
- Single **object payload**; ids as strings; times as ISO strings or epoch ms (documented).
- **Ack envelope**: `{ ok: true, data } | { ok: false, error: { code, message?, details? } }`.
- **Error codes** catalogue: `VALIDATION`, `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`,
  `RATE_LIMITED`, `CONFLICT`, `INTERNAL`, `UPGRADE_REQUIRED`.
- Every command has a timeout on the client and is idempotent on the server
  (`clientMsgId`/`requestId`).
- Contracts in a shared package (TS types + zod schemas), documented with AsyncAPI;
  breaking changes require a new event name/version and a deprecation window.

### Room naming

- `type:id` (`user:42`, `conversation:9`, `org:3:role:admin`), never bare ids.
- Room membership changes only on the server, after authorization.

### Reliability standards

- Clients: one socket instance; listeners registered once; re-sync on every `connect`;
  handle `connect_error` with `socket.active`; UI shows connection state.
- Servers: wrapped handlers; graceful shutdown; adapter + stickiness; CSR where useful.

### Observability standards

- Required metrics & alerts (Chapter 10); logs include `socketId`, `userId`, `event`.
- Dashboards per environment; runbooks linked from alerts.

### Security standards

- Chapter 6 checklist as a PR template section for any realtime change.

### Code review checklist for Socket.IO changes

- [ ] Event name follows convention and exists in the contract package.
- [ ] Payload validated; ack always called (all paths); timeout on sender side.
- [ ] Authorization check for every data access/room join.
- [ ] Right broadcast target (`socket.to` vs `io.to` vs `socket.emit`), right namespace.
- [ ] Works with multiple nodes (no local maps), works after reconnection.
- [ ] No listener/timer leak; cleanup on `disconnect`/unmount.
- [ ] High-frequency events throttled/volatile.
- [ ] Backward compatible with old clients.
- [ ] Tests: integration test for the event (happy path + auth failure + validation failure).
- [ ] Metrics/logging added.

### Ownership & SLOs

- A team owns the realtime gateway; others integrate via events.
- SLO examples: 99.9% of connection attempts succeed within 3 s; p95 event delivery
  latency < 300 ms; < 0.1% handler error rate.

---

## 13.16 "What do I do when…?" — decision guide

| Situation | Do this |
|---|---|
| You need to notify a specific user from a REST endpoint | `io.to("user:" + id).emit(...)` (user room joined at connection) |
| Same, from a worker process | Redis emitter / broker → gateway |
| You need to know if a user is online | Presence in Redis (Section 13.2), not `fetchSockets` per request |
| Users complain messages are missing after network blips | Persist + `sync` on connect + dedupe; optionally CSR |
| Duplicate messages in the UI | Listener cleanup / single socket / dedupe by id |
| You added a 2nd server and things broke | Sticky sessions + adapter |
| Server CPU spikes when a popular room is active | Coalesce/throttle, smaller payloads, volatile, shard rooms, notification + HTTP fetch |
| Token expires during long sessions | Expiry timer + refresh flow; `auth` as a function |
| A user must be kicked out everywhere | `io.in("user:" + id).disconnectSockets(true)` |
| You must send a 50 MB file | HTTP upload (pre-signed URL); socket only for progress |
| Mobile app needs messages while backgrounded | Push notifications (FCM/APNs) |
| Corporate users can't connect via WebSocket | Keep polling fallback + sticky sessions |
| You want zero sticky-session complexity | `transports: ["websocket"]` (accept no fallback) |
| Need guaranteed processing of client commands | Ack + retries + idempotent handler |
| Need server push guaranteed | DB persistence + offsets + client sync |
| Thousands of tenants | Room prefixes or dynamic namespaces + cleanup |
| Need to broadcast to rooms A AND B (intersection) | Dedicated combined room or filter via `fetchSockets` (rarely) |
| Need to deploy without disconnect storms | Graceful shutdown, slow rolling deploy, jitter |
| Debugging "it doesn't connect" | Chapter 12 first-aid kit |

---

## 13.17 Full mini-project: production-style chat server (all pieces together)

```js
// src/realtime/index.js
const { Server } = require("socket.io");
const { createAdapter } = require("@socket.io/redis-adapter");
const { z } = require("zod");

function safe(socket, handler) {
  return async (...args) => {
    const ack = typeof args.at(-1) === "function" ? args.pop() : null;
    try {
      const data = await handler(...args);
      ack?.({ ok: true, data });
    } catch (err) {
      const code = err.code ?? (err instanceof z.ZodError ? "VALIDATION" : "INTERNAL");
      if (code === "INTERNAL") socket.data.log.error({ err }, "handler failed");
      ack?.({ ok: false, error: { code, message: code === "INTERNAL" ? "Internal error" : err.message } });
    }
  };
}

const forbidden = () => Object.assign(new Error("Forbidden"), { code: "FORBIDDEN" });

exports.createRealtimeServer = async function ({ httpServer, redis, auth, chat, logger, config }) {
  const pub = redis.duplicate(); const sub = redis.duplicate();
  pub.on("error", (err) => logger.error({ err }, "redis pub"));
  sub.on("error", (err) => logger.error({ err }, "redis sub"));
  await Promise.all([pub.connect(), sub.connect()]);

  const io = new Server(httpServer, {
    cors: { origin: config.webOrigins, credentials: true },
    allowRequest: (req, cb) => cb(null, !req.headers.origin || config.webOrigins.includes(req.headers.origin)),
    serveClient: false,
    maxHttpBufferSize: 1e5,
    adapter: createAdapter(pub, sub, { key: "chat-rt" }),
    connectionStateRecovery: undefined, // classic Redis adapter doesn't support CSR → we use sync
  });

  io.use(async (socket, next) => {
    try {
      socket.data.user = await auth.verifyAccessToken(socket.handshake.auth?.token);
      socket.data.log = logger.child({ sid: socket.id, uid: socket.data.user.id });
      next();
    } catch (e) {
      next(Object.assign(new Error(e.code === "EXPIRED" ? "TOKEN_EXPIRED" : "UNAUTHORIZED"), { data: { code: e.code } }));
    }
  });

  io.use(async (socket, next) => {
    // load the rooms BEFORE "connection", so handlers can be registered synchronously
    try {
      socket.data.conversationIds = await chat.conversationIdsFor(socket.data.user.id);
      next();
    } catch (err) {
      next(new Error("INTERNAL"));
    }
  });

  io.on("connection", (socket) => {   // NOT async: register every handler synchronously
    const { id: userId } = socket.data.user;
    socket.data.log.info({ transport: socket.conn.transport.name }, "connected");
    socket.join(`user:${userId}`);
    // re-join conversations from the source of truth (works after any reconnection)
    socket.join(socket.data.conversationIds.map((id) => `conversation:${id}`));

    const Send = z.object({ conversationId: z.string(), text: z.string().trim().min(1).max(4000), clientMsgId: z.string().uuid() }).strict();
    const Sync = z.object({ conversationId: z.string(), afterId: z.string().nullable() }).strict();

    socket.on("message:send", safe(socket, async (raw) => {
      const p = Send.parse(raw);
      if (!socket.rooms.has(`conversation:${p.conversationId}`)) throw forbidden();
      const { message, created } = await chat.createMessageIdempotent(userId, p);
      if (created) io.to(`conversation:${p.conversationId}`).emit("message:new", message);
      return { id: message.id, createdAt: message.createdAt };
    }));

    socket.on("conversation:sync", safe(socket, async (raw) => {
      const p = Sync.parse(raw);
      if (!socket.rooms.has(`conversation:${p.conversationId}`)) throw forbidden();
      return chat.messagesAfter(p.conversationId, p.afterId, 500);
    }));

    socket.on("typing:start", ({ conversationId } = {}) => {
      if (typeof conversationId !== "string" || !socket.rooms.has(`conversation:${conversationId}`)) return;
      socket.to(`conversation:${conversationId}`).volatile.emit("typing", { conversationId, userId });
    });

    socket.on("disconnect", (reason) => socket.data.log.info({ reason }, "disconnected"));
  });

  // used by other modules (REST controllers) to push events
  chat.on("conversation:member-added", ({ conversationId, userId }) =>
    io.in(`user:${userId}`).socketsJoin(`conversation:${conversationId}`)); // cluster-wide
  chat.on("conversation:member-removed", ({ conversationId, userId }) =>
    io.in(`user:${userId}`).socketsLeave(`conversation:${conversationId}`));

  return io;
};
```

```js
// client (browser)
import { io } from "socket.io-client";

export const socket = io(RT_URL, {
  autoConnect: false,
  transports: ["websocket", "polling"],
  auth: (cb) => cb({ token: tokenStore.get() }),
  withCredentials: true,
});

const lastIds = new Map(); // conversationId -> last message id
const seen = new Set();

socket.on("message:new", onMessage);              // registered ONCE
socket.on("typing", showTyping);

socket.on("connect", async () => {
  ui.setConnected(true);
  for (const conversationId of openConversations()) {
    try {
      const res = await socket.timeout(10000).emitWithAck("conversation:sync", { conversationId, afterId: lastIds.get(conversationId) ?? null });
      if (res.ok) res.data.forEach(onMessage);
    } catch { /* timeout: will retry on next connect or via user action */ }
  }
});

socket.on("disconnect", () => ui.setConnected(false));

socket.on("connect_error", async (err) => {
  if (!socket.active) {
    if (err.message === "TOKEN_EXPIRED") { await tokenStore.refresh(); socket.connect(); }
    else ui.showLogin();
  }
});

function onMessage(m) {
  if (seen.has(m.id)) return;
  seen.add(m.id);
  lastIds.set(m.conversationId, m.id);
  ui.renderMessage(m);
}

export async function sendMessage(conversationId, text) {
  const clientMsgId = crypto.randomUUID();
  ui.renderPending(clientMsgId, text);
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await socket.timeout(8000).emitWithAck("message:send", { conversationId, text, clientMsgId });
      if (res.ok) return ui.confirmPending(clientMsgId, res.data);
      return ui.failPending(clientMsgId, res.error.code);   // business error: don't retry
    } catch { /* timeout → retry with the SAME clientMsgId (idempotent server) */ }
  }
  ui.failPending(clientMsgId, "TIMEOUT");
}
```

This small codebase demonstrates almost every best practice in this book: auth in
middleware, async loading done in middleware so the `connection` handler registers every
listener synchronously (events emitted by the client right after `connect` are never
lost), origin check, CORS allow-list, payload size limit, Redis adapter with error
handlers, user rooms, re-joining from DB on every connection, cluster-wide room
management with `socketsJoin`, validated & authorized handlers with an ack envelope,
idempotent writes, volatile typing, client single registration, sync on connect, dedupe,
token-expiry handling, retries with the same id.

---

## 13.18 Chapter summary

- Architecture: stateless gateway + adapter + broker + DB as source of truth.
- Patterns: presence (per-user count, grace, TTL), typing (volatile, throttled),
  chat flow (optimistic UI, idempotent, ack, sync, dedupe), notifications (persist + push),
  live data (snapshot + coalesced deltas), collaboration (CRDT/OT), games (authoritative
  ticks), tracking, chunked uploads, job progress, auctions (atomic ops), multi-tenancy.
- Standards: naming, ack envelope, error codes, contracts, review checklist, SLOs.

Next: [Chapter 14 — Interview question bank](14-interview-questions.md)
