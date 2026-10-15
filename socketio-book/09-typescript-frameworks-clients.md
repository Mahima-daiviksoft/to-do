# Chapter 9 — TypeScript, Frontend Frameworks, Mobile and Other Languages

> **Goal:** use Socket.IO correctly in real stacks: fully typed events with TypeScript,
> React (hooks, context, StrictMode), Vue, Angular, Next.js, NestJS, React Native, native
> mobile, and servers/clients in other languages.

---

## 9.1 TypeScript — fully typed events

Since v4, both `Server` and client `Socket` accept **generic event maps**. Define them
**once** in a shared package and import from both sides — this is the single most
valuable practice for large teams (typos and payload mismatches become compile errors).

### Shared event definitions

```ts
// packages/realtime-contracts/src/events.ts
export interface Message {
  id: string;
  conversationId: string;
  authorId: string;
  text: string;
  createdAt: string; // ISO (Dates become strings on the wire!)
}

export type Ack<T> = (res: { ok: true; data: T } | { ok: false; error: { code: string; message?: string } }) => void;

// events the SERVER emits to clients (client listens)
export interface ServerToClientEvents {
  "message:new": (msg: Message) => void;
  "user:typing": (p: { conversationId: string; userId: string }) => void;
  "presence:update": (p: { userId: string; online: boolean }) => void;
  "noArg": () => void;
  "withAck": (question: string, callback: (answer: number) => void) => void;
}

// events the CLIENT emits to the server (server listens)
export interface ClientToServerEvents {
  "message:send": (p: { conversationId: string; text: string; clientMsgId: string }, ack: Ack<{ id: string }>) => void;
  "conversation:join": (p: { conversationId: string }, ack: Ack<{ history: Message[] }>) => void;
  "typing": (p: { conversationId: string }) => void;
}

// events between Socket.IO servers (serverSideEmit)
export interface InterServerEvents {
  "cache:invalidate": (key: string) => void;
}

// type of socket.data
export interface SocketData {
  user: { id: string; name: string; roles: string[] };
}
```

### Typed server

```ts
import { Server, Socket } from "socket.io";
import type { ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData } from "@acme/realtime-contracts";

const io = new Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>(httpServer, {
  cors: { origin: process.env.WEB_ORIGIN },
});

type AppSocket = Socket<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;

io.on("connection", (socket: AppSocket) => {
  socket.data.user.name;                                   // typed

  socket.on("message:send", async (payload, ack) => {      // payload & ack typed
    const msg = await messages.create(socket.data.user.id, payload);
    io.to(`conversation:${payload.conversationId}`).emit("message:new", msg); // typed
    ack({ ok: true, data: { id: msg.id } });
  });

  // @ts-expect-error — unknown event
  socket.emit("mesage:new", {});
});

io.serverSideEmit("cache:invalidate", "users:1");          // typed
io.on("cache:invalidate", (key) => cache.delete(key));     // typed
```

### Typed client

```ts
import { io, Socket } from "socket.io-client";
import type { ClientToServerEvents, ServerToClientEvents } from "@acme/realtime-contracts";

// NOTE: generic order is REVERSED on the client: <ListenEvents, EmitEvents>
const socket: Socket<ServerToClientEvents, ClientToServerEvents> = io(URL);

socket.on("message:new", (msg) => render(msg));          // msg: Message
socket.emit("typing", { conversationId: "c1" });

const res = await socket.timeout(5000).emitWithAck("message:send", { conversationId: "c1", text: "hi", clientMsgId: crypto.randomUUID() });
```

> **Interview / bug note:** on the server the order is `Server<ListenEvents (client→server),
> EmitEvents (server→client), …>`; on the client it's `Socket<ListenEvents (server→client),
> EmitEvents (client→server)>`. Both are "what I listen to, what I emit" from that side's
> perspective. Mixing them up gives confusing type errors.

### Typing acks with timeout

When you use `socket.timeout(ms).emit(..., cb)`, the type system automatically adds the
`err` first parameter to the callback (`DecorateAcknowledgements`). With broadcast,
`io.timeout(ms).emit(...)` types the callback as `(err, responses[])`.

### Runtime validation is still needed

Types vanish at runtime. A malicious client can send anything. Pair the TS interfaces
with runtime schemas (zod/valibot/typebox) — or **derive** TS types from schemas:

```ts
const SendSchema = z.object({ conversationId: z.string().uuid(), text: z.string().max(2000), clientMsgId: z.string().uuid() });
type SendPayload = z.infer<typeof SendSchema>;
```

---

## 9.2 React

### The rules (each prevents a real, common bug)

1. **Create the socket once** — at module level or in a context provider — **not** inside
   a component body (that creates a new connection per render).
2. **Register listeners in `useEffect` and remove them in the cleanup** (`socket.off(event, handler)`
   with the **same function reference**) — otherwise listeners accumulate on every
   re-mount → duplicated messages and memory leaks.
3. **React 18+ StrictMode** mounts/unmounts/re-mounts effects in development → effects
   run twice. Correct cleanup makes this harmless. Don't "fix" it by removing StrictMode.
4. Avoid **stale closures**: handlers registered once capture old state — use functional
   `setState(prev => …)` or refs.
5. Decide **where** connect/disconnect happens (e.g. connect after login, disconnect on
   logout) — `autoConnect: false` helps.

### socket module

```ts
// src/socket.ts
import { io, Socket } from "socket.io-client";
import type { ServerToClientEvents, ClientToServerEvents } from "@acme/realtime-contracts";

export const socket: Socket<ServerToClientEvents, ClientToServerEvents> = io(import.meta.env.VITE_WS_URL, {
  autoConnect: false,                                   // connect explicitly after login
  auth: (cb) => cb({ token: localStorage.getItem("token") }), // fresh token on each (re)connect
  transports: ["websocket", "polling"],
});
```

### Connection state hook

```tsx
import { useEffect, useState } from "react";
import { socket } from "./socket";

export function useSocketStatus() {
  const [connected, setConnected] = useState(socket.connected);

  useEffect(() => {
    const onConnect = () => setConnected(true);
    const onDisconnect = () => setConnected(false);
    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    return () => {
      socket.off("connect", onConnect);       // same references → removes exactly these
      socket.off("disconnect", onDisconnect);
    };
  }, []);

  return connected;
}
```

### Generic event hook

```tsx
import { useEffect, useRef } from "react";
import { socket } from "./socket";

export function useSocketEvent<E extends keyof ServerToClientEvents>(event: E, handler: ServerToClientEvents[E]) {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;                 // always call the latest handler (no stale closure)

  useEffect(() => {
    const listener = ((...args: any[]) => (handlerRef.current as any)(...args)) as any;
    socket.on(event, listener);
    return () => { socket.off(event, listener); };
  }, [event]);
}

// usage
function Chat({ conversationId }: { conversationId: string }) {
  const [messages, setMessages] = useState<Message[]>([]);

  useSocketEvent("message:new", (msg) => {
    if (msg.conversationId === conversationId) setMessages((prev) => [...prev, msg]); // functional update
  });

  useEffect(() => {
    let cancelled = false;
    socket.timeout(5000).emitWithAck("conversation:join", { conversationId })
      .then((res) => { if (!cancelled && res.ok) setMessages(res.data.history); })
      .catch(() => {/* timeout */});
    return () => { cancelled = true; /* optionally emit "conversation:leave" */ };
  }, [conversationId]);

  return <MessageList messages={messages} />;
}
```

### Connect on login, disconnect on logout

```tsx
useEffect(() => {
  if (user) socket.connect();
  return () => { socket.disconnect(); };
}, [user]);
```

### Where to put socket data in state management

- Small apps: component state + context.
- Redux Toolkit: a **middleware** that owns the socket and dispatches actions on events
  (don't put the socket object in the store — it's not serializable).
- React Query/TanStack Query: on events, `queryClient.setQueryData` or
  `invalidateQueries` → server state stays the source of truth.
- Zustand: a store action subscribes once and updates state.

### Next.js

- **Client components only** (`"use client"`) for `socket.io-client` — sockets don't exist
  during server rendering. Guard against SSR (`useEffect` runs only in the browser).
- Hosting the **server**:
  - Use a **custom server** (`server.js` that creates the Next handler and a Socket.IO
    `Server` on the same `http` server), or
  - better for production: run Socket.IO as a **separate service** (its own deployment)
    and point the client at it (CORS).
  - **Serverless/edge functions (Vercel functions, Lambda) can't host Socket.IO** — they
    are short-lived and don't keep connections. Use a long-running Node host, or a
    managed service.

```js
// server.js (custom Next.js server)
const { createServer } = require("node:http");
const next = require("next");
const { Server } = require("socket.io");

const app = next({ dev: process.env.NODE_ENV !== "production" });
const handler = app.getRequestHandler();

app.prepare().then(() => {
  const httpServer = createServer(handler);
  const io = new Server(httpServer);
  io.on("connection", (socket) => { /* ... */ });
  httpServer.listen(3000);
});
```

---

## 9.3 Vue 3

```js
// socket.js
import { reactive } from "vue";
import { io } from "socket.io-client";

export const state = reactive({ connected: false, messages: [] });

export const socket = io(import.meta.env.VITE_WS_URL, { autoConnect: false });

socket.on("connect", () => { state.connected = true; });
socket.on("disconnect", () => { state.connected = false; });
socket.on("message:new", (m) => { state.messages.push(m); });   // registered ONCE at module level
```

In components using component-scoped listeners, register in `onMounted` and remove in
`onBeforeUnmount`/`onUnmounted` with `socket.off(event, handler)`. With **Pinia**,
subscribe once in a store action (`bindEvents()`), guarded against double binding.

## 9.4 Angular

Wrap the socket in an injectable **service**, expose events as **RxJS Observables**, and
let subscriptions handle cleanup:

```ts
@Injectable({ providedIn: "root" })
export class RealtimeService implements OnDestroy {
  private socket = io(environment.wsUrl, { autoConnect: false, auth: (cb) => cb({ token: this.auth.token }) });

  constructor(private auth: AuthService, private zone: NgZone) {}

  connect() { this.socket.connect(); }

  on<T>(event: string): Observable<T> {
    return new Observable<T>((subscriber) => {
      const handler = (data: T) => this.zone.run(() => subscriber.next(data)); // run inside Angular zone → change detection
      this.socket.on(event, handler);
      return () => this.socket.off(event, handler);                            // teardown on unsubscribe
    });
  }

  emitWithAck<T>(event: string, payload: unknown): Promise<T> {
    return this.socket.timeout(5000).emitWithAck(event, payload);
  }

  ngOnDestroy() { this.socket.disconnect(); }
}
```

(`ngx-socket-io` is a popular wrapper library.) With zoneless Angular / signals, update
signals in the handler instead of `zone.run`.

---

## 9.5 NestJS (server)

```ts
// chat.gateway.ts
import {
  WebSocketGateway, WebSocketServer, SubscribeMessage, MessageBody, ConnectedSocket,
  OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect,
} from "@nestjs/websockets";
import { Server, Socket } from "socket.io";

@WebSocketGateway({ namespace: "/chat", cors: { origin: process.env.WEB_ORIGIN } })
export class ChatGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server: Server;  // the Namespace ("/chat") instance when a namespace is set

  afterInit(server: Server) { /* e.g. server.use(authMiddleware) */ }

  handleConnection(client: Socket) { /* ... */ }
  handleDisconnect(client: Socket) { /* ... */ }

  @SubscribeMessage("message:send")
  async onMessage(@MessageBody() dto: SendMessageDto, @ConnectedSocket() client: Socket) {
    const msg = await this.messages.create(client.data.user.id, dto);
    this.server.to(`conversation:${dto.conversationId}`).emit("message:new", msg);
    return { ok: true, data: { id: msg.id } };   // returned value becomes the ACK response
  }
}
```

NestJS specifics to know:

- Packages: `@nestjs/websockets` + `@nestjs/platform-socket.io`.
- **Return value of a `@SubscribeMessage` handler = acknowledgement** (if the client passed
  a callback). Returning `{ event, data }` (a `WsResponse`) emits an event back instead.
- Guards (`@UseGuards(WsAuthGuard)`), Pipes (`ValidationPipe` with class-validator DTOs),
  Interceptors and **exception filters** (`WsException`, `BaseWsExceptionFilter`) work on
  gateways. Note: guards run per message, **not** on connection — do connection auth in
  `handleConnection` (disconnect if invalid) or in a `server.use()` middleware in
  `afterInit`/a custom adapter.
- **Redis adapter** in Nest: extend `IoAdapter`, override `createIOServer` to call
  `server.adapter(createAdapter(pub, sub))`, then `app.useWebSocketAdapter(redisIoAdapter)`.

```ts
export class RedisIoAdapter extends IoAdapter {
  private adapterConstructor: ReturnType<typeof createAdapter>;
  async connectToRedis() {
    const pubClient = createClient({ url: process.env.REDIS_URL });
    const subClient = pubClient.duplicate();
    await Promise.all([pubClient.connect(), subClient.connect()]);
    this.adapterConstructor = createAdapter(pubClient, subClient);
  }
  createIOServer(port: number, options?: ServerOptions) {
    const server = super.createIOServer(port, options);
    server.adapter(this.adapterConstructor);
    return server;
  }
}
// main.ts
const redisIoAdapter = new RedisIoAdapter(app);
await redisIoAdapter.connectToRedis();
app.useWebSocketAdapter(redisIoAdapter);
```

---

## 9.6 React Native / Expo

```js
import { io } from "socket.io-client";
const socket = io("https://api.example.com", { transports: ["websocket"] });
```

- `transports: ["websocket"]` is commonly recommended in React Native: the polling
  transport relies on XHR implementations that sometimes behave differently, and
  WebSocket is reliable on mobile networks.
- Use the device's real address (not `localhost`) when testing on a device/emulator
  (Android emulator → `10.0.2.2`, or your LAN IP). Android blocks cleartext `http://`
  by default (use HTTPS or allow cleartext for dev).
- Handle app state: disconnect/pause when the app goes to background (`AppState`), and
  reconnect when it returns; use push notifications (FCM/APNs) for background delivery.

## 9.7 Native mobile clients

| Platform | Official client | Notes |
|---|---|---|
| iOS / macOS | **Socket.IO-Client-Swift** | `SocketManager(socketURL:config:)`, `manager.defaultSocket`; config options like `.log(true)`, `.compress`, `.forceWebsockets(true)`; check version compatibility (v16+ for Socket.IO v3/v4 servers) |
| Android / Java | **socket.io-client-java** | `IO.socket(uri, options)`; v2.x of the Java client for Socket.IO v3/v4 servers; callbacks run on a background thread → post UI updates to the main thread |
| C++ | socket.io-client-cpp | v3.x for Socket.IO v3/v4 |
| Dart / Flutter | `socket_io_client` (community) | Match its major version to your server version per its compatibility table |
| Python | `python-socketio` | Both client and server |
| .NET | `SocketIOClient` (community) | |
| Rust | `rust_socketio` (client), `socketioxide` (server) | |
| Go | e.g. `googollee/go-socket.io` (server; historically v2-only for a long time — check protocol support), others | Verify protocol v5 support before choosing |

**Always check each client's compatibility table** with your server version — mismatched
protocol versions are a top cause of "it connects in the browser but not on Android/iOS".

## 9.8 Server implementations in other languages

| Language | Library | Notes |
|---|---|---|
| Python | `python-socketio` (+ ASGI/WSGI integrations: aiohttp, FastAPI via ASGI app, Flask-SocketIO) | Mature, supports Redis/Kafka/RabbitMQ managers for scaling |
| Java | `netty-socketio` (historically v2 protocol; check forks for v4), Spring integrations | Check protocol version |
| Go | various (`googollee/go-socket.io`, `zishang520/socket.io`) | Check protocol support |
| Rust | `socketioxide` | Tower/axum/hyper integration |
| Deno | official port (`deno.land/x/socket_io`) | |
| PHP | community (`workerman/phpsocket.io`) | |
| Elixir/.NET | prefer native solutions (Phoenix Channels, SignalR) | |

Interop works as long as both sides implement the same **protocol versions** (Engine.IO
v4 / Socket.IO v5 for modern clients).

---

## 9.9 Node.js-to-Node.js (server-side client)

Use `socket.io-client` in Node to connect services or to write integration tests/load
tests:

```js
const { io } = require("socket.io-client");
const socket = io("https://rt.example.com", {
  transports: ["websocket"],
  auth: { token: SERVICE_TOKEN },
  extraHeaders: { "x-service": "billing" }, // works in Node (not in browsers' WebSocket)
});
```

Note: a Node client keeps the process alive while connected; call `socket.disconnect()`
to let it exit.

---

## 9.10 Chapter summary

- Share typed event maps between client and server; remember the reversed generic order
  on the client; still validate at runtime.
- React: one socket instance, listeners in `useEffect` with `off` cleanup, functional
  updates/refs to avoid stale closures, StrictMode-safe.
- Vue/Angular: register once in a module/service; Angular → Observables + teardown.
- Next.js: client components only; host Socket.IO on a long-running server, not
  serverless.
- NestJS: gateways, return value = ack, guards per message, Redis via custom `IoAdapter`.
- Mobile: prefer WebSocket transport; check client/server compatibility tables.

Next: [Chapter 10 — Testing, debugging and monitoring](10-testing-debugging-monitoring.md)
