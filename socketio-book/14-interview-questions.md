# Chapter 14 — Interview Question Bank (Entry Level → Senior/Architect)

> **How to use this chapter:** questions are grouped by topic and tagged by level:
> **[E]** entry/junior, **[M]** mid-level, **[S]** senior/lead/architect.
> Answers are written the way you should *say* them: start with a one-line direct
> answer, then the depth. Chapter references point to the full explanation.
>
> The question list was assembled from the topics interviewers and hiring guides
> consistently probe for Socket.IO / real-time roles — WebSocket vs Socket.IO, rooms vs
> namespaces, reconnection and dropped connections, authentication and data leaks,
> horizontal scaling with the Redis adapter and sticky sessions, and practical
> scenarios such as chat apps with rooms and presence or multiplayer games — plus the
> standard "design a real-time chat system" system-design round (stateless servers,
> pub/sub fan-out, offline delivery via last-seen ids, presence with TTL heartbeats,
> ordering, backoff), and the version-specific details that appear in technical
> screens.

---

## Part A — Fundamentals

**A1. [E] What is Socket.IO?**
A library for low-latency, bidirectional, event-based communication between clients and
a server. It has a Node.js server (`socket.io`) and clients (`socket.io-client` for
browser/Node, plus Java, Swift, C++, Python, etc.). It's built on Engine.IO, which handles
the low-level connection (HTTP long-polling, WebSocket, WebTransport), heartbeats and
transport upgrades; Socket.IO adds named events, acknowledgements, rooms, namespaces,
broadcasting, automatic reconnection, buffering, middleware and multi-server adapters.

**A2. [E] Is Socket.IO the same as WebSocket? Can a WebSocket client connect to a Socket.IO server?**
No. WebSocket is a protocol (RFC 6455) for a full-duplex channel. Socket.IO is a library
with its own protocol that *may use* WebSocket as a transport. Every Socket.IO message
carries metadata (Engine.IO packet type, Socket.IO packet type, namespace, ack id), e.g.
`42["chat","hi"]`. A plain WebSocket client doesn't speak that protocol (it would have to
handle the `0{…}` open packet, send `40` to connect to a namespace, answer pings `2` with
`3`, encode events), and a Socket.IO client can't connect to a plain WebSocket server.

**A3. [E] Why use Socket.IO instead of raw WebSockets?**
Polling fallback when WebSocket is blocked; automatic reconnection with exponential
back-off; heartbeat-based disconnection detection; buffering while offline; named events;
acknowledgements (request/response, with timeouts and promises); rooms and broadcasting;
namespaces/multiplexing; middleware for auth; binary support with automatic serialization;
horizontal scaling via adapters; connection state recovery; a typed API; an admin UI. With
raw WebSockets you'd build all that yourself.

**A4. [E] When would you NOT use Socket.IO?**
When clients must be standard WebSocket clients (third-party devices, `graphql-ws`,
MQTT-over-WS); when only one-way server→client updates are needed (SSE is simpler); for
extremely latency-sensitive/high-frequency use where every byte matters (custom binary
over raw WS, WebRTC/WebTransport datagrams); for durable messaging needs (use a broker
behind it); in serverless runtimes that can't hold connections; or when a managed service
is preferable.

**A5. [E] Explain polling, long polling, SSE and WebSocket.**
Short polling: client requests every N seconds — simple, wasteful, latency up to N.
Long polling: server holds the request until data is available, client immediately
re-requests — near-real-time over plain HTTP, but header overhead and a separate request
for sending. SSE: a long-lived HTTP response streaming text events server→client with
automatic reconnection — one-way, text-only. WebSocket: an HTTP request upgraded (101
Switching Protocols) to a persistent full-duplex framed channel — lowest overhead/latency,
text and binary, no built-in reconnection. Socket.IO uses long polling and WebSocket
(and optionally WebTransport). (Ch. 1)

**A6. [E] What are the main components on the server and client?**
Server: `Server` (io), `Namespace`, `Socket` (one per client per namespace), internal
`Client` (one per connection), `Adapter` (rooms/broadcast), parser, Engine.IO server and
socket, transport. Client: `Socket` (per namespace) and `Manager` (owns the Engine.IO
connection and reconnection, accessible via `socket.io`). (Ch. 7)

**A7. [E] How do you set up Socket.IO with Express?**
Create an HTTP server from the Express app and pass it to Socket.IO; listen on the HTTP
server:
```js
const app = express();
const httpServer = http.createServer(app);
const io = new Server(httpServer, { cors: { origin: "https://app.example.com" } });
io.on("connection", (socket) => { /* … */ });
httpServer.listen(3000);   // NOT app.listen(3000)
```
`app.listen()` would create a second server Socket.IO isn't attached to → 404s on
`/socket.io/`.

**A8. [E] What does `io.on("connection", socket => …)` give you?**
It fires once for each client connecting to the main namespace (after middleware
accepted it). `socket` is that client's server-side Socket: `socket.id`,
`socket.handshake` (headers, query, auth, address…), `socket.data`, `socket.rooms`,
`socket.emit/on/join/leave/disconnect`, etc. You register that client's event handlers
inside it.

**A9. [E] What is `socket.id`? Can I use it as a user id?**
A random identifier of a Socket.IO socket in a namespace. It changes on every
reconnection (unless connection state recovery restored the session), it's different per
namespace and per tab. So no — use your authenticated user id, and a `user:<id>` room to
reach all of a user's sockets. Also, since v3 it differs from the Engine.IO session id
(`socket.conn.id`) for security.

**A10. [E] What's the difference between `socket.emit`, `io.emit`, `socket.broadcast.emit`?**
`socket.emit` → only that client. `io.emit` → every client in the main namespace (incl.
the "sender"). `socket.broadcast.emit` → every client in the socket's namespace except
that socket. Add rooms: `io.to(room).emit` (everyone in room), `socket.to(room).emit`
(everyone in room except sender). (Ch. 2 cheat sheet)

**A11. [E] Can a client broadcast to other clients directly?**
No. `broadcast`, rooms and `to()` exist only on the server. The client emits to the
server, which relays (after validating/authorizing).

**A12. [E] Which transports does Socket.IO use and in which order?**
By default the client starts with HTTP long-polling, then tries to upgrade to WebSocket
(client default list `["polling", "websocket", "webtransport"]`; WebTransport only if the
server enables it). You can change the order or restrict (`transports: ["websocket"]`).

**A13. [M] Why does Socket.IO start with polling and not WebSocket?**
Reliability: polling works almost everywhere and gives an immediately usable connection;
some proxies/antivirus accept a WebSocket handshake but then fail, and waiting for that to
time out would delay the user. Once connected, the client tests WebSocket in the
background (`2probe`/`3probe`) and upgrades without losing or reordering packets. The
trade-off: more initial requests and the need for sticky sessions in multi-node setups.

**A14. [M] What changed between Socket.IO v2 and v3/v4?**
v3 (Nov 2020) was the breaking release: CORS no longer enabled by default; heartbeat
direction reversed (server pings, client pongs); reconnection events moved to the Manager
(`socket.io.on("reconnect")`); `socket.rooms` is a `Set`; `auth` option and
`socket.handshake.auth`; middleware errors → `connect_error` with `err.data`; no implicit
default-namespace connection; `maxHttpBufferSize` 1 MB default (was 100 MB); `cookie` and
`perMessageDeflate` off by default; Engine.IO v4 payload encoding (`\x1e` separator);
socket id ≠ engine id; rewritten in TypeScript. v4 is compatible with v3 clients; it
added typed events, `io.except`, `fetchSockets/socketsJoin/socketsLeave/disconnectSockets`,
`serverSideEmit`, ack timeouts, broadcast acks, `emitWithAck`, connection state recovery,
client retries, `io.engine.use`, WebTransport, uWebSockets.js support. v2 clients need
`allowEIO3: true` on a v3/v4 server.

**A15. [M] Are Socket.IO client and server versions independent?**
Yes, they're separate packages, but they must speak compatible protocols: a v3/v4 client
with a v3/v4 server; a v2 client with a v4 server only with `allowEIO3`; never a v3/v4
client with a v2 server. Third-party clients have their own compatibility tables.

**A16. [E] What is `serveClient`?**
A server option (default `true`) that serves the client bundle at
`/socket.io/socket.io.js`. Set it to `false` when you bundle `socket.io-client` yourself.

**A17. [E] What's the difference between the URL path and the `path` option?**
In `io("https://host/admin")`, `/admin` is the **namespace**. The HTTP path where the
server listens is the `path` option (default `/socket.io/`), which must match on both
sides. Confusing the two causes "Invalid namespace" or 404 errors.

**A18. [E] What is the default `maxHttpBufferSize` and what happens if exceeded?**
1 MB (`1e6` bytes). A single message larger than that makes the server close the
connection. Increase it deliberately, chunk the data, or use HTTP for large files.

---

## Part B — Events, data and acknowledgements

**B1. [E] How do you send and receive events?**
`socket.emit("name", ...args)` and `socket.on("name", (...args) => {})`, symmetric on
both sides. Any number of arguments; prefer one object.

**B2. [E] What data types can be sent?**
Anything JSON-serializable plus binary (`Buffer`, `ArrayBuffer`, typed arrays, `Blob`/
`File`). Dates become ISO strings, `Map`/`Set` become `{}`, `undefined` properties are
dropped, `NaN`/`Infinity` → `null`, `BigInt` throws, functions can't be sent except as the
last argument which becomes an ack callback. (Ch. 3)

**B3. [E] What is an acknowledgement?**
A callback passed as the last argument of `emit`; the receiver gets it as the last
argument of its handler and calls it to send a response back to the sender — request/
response over the socket.
```js
socket.emit("create", data, (res) => console.log(res));
socket.on("create", (data, cb) => cb({ ok: true }));
```

**B4. [M] What happens if the receiver never calls the ack? How do you handle it?**
The sender waits forever and keeps the callback in memory. Use `socket.timeout(ms).emit(...)`
— the callback then receives an error as first argument on timeout — or
`await socket.timeout(ms).emitWithAck(...)` which rejects. On the receiver, always call
the ack in every code path (including errors), and verify `typeof ack === "function"`.

**B5. [M] What's `emitWithAck`?**
(v4.6+) A Promise-based version of emit-with-ack: `const res = await socket.emitWithAck("x", data)`.
Combined with `timeout(ms)` it rejects on timeout. On the server with broadcast
(`io.timeout(ms).emitWithAck`) it resolves to an array of responses.

**B6. [M] Can you use acknowledgements with broadcasts?**
Yes, since v4.5, with a timeout: `io.timeout(5000).emit("x", (err, responses) => {})` —
`responses` is an array, one per client; `err` is set if some clients didn't answer in
time. Without `.timeout()` the callback fires almost immediately with a timeout error.
Works across nodes with supporting adapters.

**B7. [M] What does the `.timeout()` modifier change in the callback signature?**
It adds an `err` first parameter: `(err, response)`. Forgetting this is a classic bug —
people read the response from the first argument.

**B8. [M] What are volatile events? Give use cases.**
`socket.volatile.emit(...)` — the packet is dropped (instead of buffered) if the
underlying transport isn't currently writable — on the server (e.g. no pending polling
request) and on the client (which includes being disconnected). For superseded high-frequency data: cursor/mouse positions, typing
indicators, game state ticks, live prices, sensor readings.

**B9. [M] What happens to events emitted by the client while disconnected?**
They're buffered in `socket.sendBuffer` and sent upon reconnection (in order). Risk:
flooding the server with stale events after long offline periods. Mitigate with volatile,
`if (socket.connected)` checks, or clearing `sendBuffer` on reconnect.

**B10. [M] What are reserved event names?**
`connect`, `connect_error`, `disconnect`, `disconnecting`, `newListener`, `removeListener`.
Emitting them throws. Server-side namespace events (`connection`, `connect`,
`new_namespace`) are also reserved for `serverSideEmit`.

**B11. [M] What are catch-all listeners?**
`socket.onAny((event, ...args) => {})` for incoming events and (4.5+)
`socket.onAnyOutgoing(...)` for outgoing; plus `prependAny`, `offAny`, `listenersAny`.
Useful for logging, metrics, debugging. They don't receive reserved events.

**B12. [M] Does Socket.IO guarantee message ordering?**
Yes — per connection, in both directions, regardless of transport and across the upgrade.
Not across different sockets or across nodes. Async handlers can still finish out of
order; serialize with a per-key queue if processing order matters.

**B13. [M] What is the delivery guarantee by default?**
At-most-once: messages can be lost if the connection breaks or the client is
disconnected when the server emits. Plus ordering. The client buffers its own emits while
disconnected (in memory only).

**B14. [S] How would you implement at-least-once delivery in both directions?**
Client→server: acks + retries (v4.6 `retries` and `ackTimeout` options, or manual) +
idempotent server handlers (client-generated id + unique constraint) + optional
persistent outbox on the client. Server→client: persist messages with monotonic ids;
client tracks the last processed id; on every (re)connection the client syncs "everything
after id X"; client dedupes by id. Optionally connection state recovery for short
disconnections. "Exactly-once" is achieved as at-least-once + idempotent processing.

**B15. [M] How do client `retries` work?**
With `ackTimeout` and `retries` options set, each emit waits for an ack; if none in
`ackTimeout`, it's re-sent, up to `retries` times. Packets are queued and sent one at a
time to preserve order. The server may receive duplicates → idempotency required.

**B16. [M] How do you send binary/files?**
Pass a `Buffer`/`ArrayBuffer`/`Blob`/`File` as an argument; Socket.IO detects binary and
sends it as attachments (binary WebSocket frames, base64 in polling). Respect
`maxHttpBufferSize`; for large files chunk with acks (backpressure, resume) or use HTTP
uploads.

**B17. [M] What does `socket.compress(false)` do?**
Disables compression for that packet (relevant if `perMessageDeflate` is enabled or for
HTTP compression in polling). Useful for already-compressed data to save CPU.

**B18. [S] Why is `perMessageDeflate` disabled by default?**
Compression contexts consume significant memory per connection and CPU per message, and
most real-time messages are small. Enable it only for large compressible payloads, with a
threshold and `noContextTakeover` options.

**B19. [M] How do you handle errors in event handlers?**
Socket.IO doesn't catch them: a sync throw propagates (can crash) and async rejections
become unhandled rejections (crash by default in modern Node). Wrap handlers in a helper
that validates, try/catches, logs, and always acks with an error envelope
`{ ok: false, error: { code } }`.

**B20. [M] What's `socket.send()`?**
Shorthand for `emit("message", ...)`; listened with `on("message")`.

---

## Part C — Rooms, namespaces, broadcasting

**C1. [E] What is a room?**
A server-side named group of sockets used for broadcasting to a subset of clients.
Sockets join/leave rooms only on the server; rooms are created on first join and deleted
when empty; sockets leave all rooms on disconnect; each socket is in a room named after
its id.

**C2. [E] How do you send a private message to one user?**
Join each socket to `user:<userId>` at connection (after auth) and emit
`io.to("user:" + userId).emit(...)` — reaches all their tabs/devices and works across
nodes and reconnections. To a single socket: `io.to(socketId).emit(...)`.

**C3. [M] Difference between `io.to(room).emit` and `socket.to(room).emit`?**
`io.to` sends to all sockets in the room (including the current one if it's in it);
`socket.to` excludes the sender.

**C4. [M] What happens with `io.to("a").to("b").emit()`? Does a socket in both receive it twice?**
It's a union (sockets in a OR b); each socket receives it once. There's no built-in
intersection.

**C5. [M] What is a namespace? How is it different from a room?**
A namespace is a communication channel the **client chooses** to connect to, with its own
event handlers, middleware and rooms, multiplexed over the same underlying connection. A
room is a **server-managed** group inside a namespace used for broadcasting. Use rooms for
grouping users (chats, documents, users); namespaces for separating concerns or
permissions (`/admin` with its own auth middleware), or multi-tenancy via dynamic
namespaces.

**C6. [M] What is multiplexing?**
Multiple namespace sockets sharing a single underlying Engine.IO connection on the client
(one Manager). `io(url)` and `io(url + "/admin")` share one WebSocket. `forceNew: true` or
`multiplex: false` creates separate connections. Calling `io()` twice for the same URL
**and same namespace** also creates a new connection.

**C7. [M] What are dynamic namespaces?**
Namespaces matched by a RegExp or function, created on demand:
`io.of(/^\/tenant-\w+$/)`. The parent namespace's middleware and handlers apply to all
children; `socket.nsp` is the child; `parent.emit` broadcasts to all children.
`cleanupEmptyChildNamespaces: true` deletes empty children.

**C8. [M] How do you get all sockets in a room, across several servers?**
`await io.in("room").fetchSockets()` — returns local `Socket`s and `RemoteSocket`s (id,
handshake, rooms, data; can emit/join/leave/disconnect). Requires an adapter that
supports it (Redis etc.). Expensive — don't use on hot paths.

**C9. [M] How do you make a user (all their sockets, any server) join/leave a room or disconnect?**
`io.in("user:" + id).socketsJoin("room")`, `socketsLeave("room")`,
`disconnectSockets(true)`.

**C10. [M] What's the difference between `disconnecting` and `disconnect`?**
`disconnecting` fires before the socket leaves its rooms (so `socket.rooms` is still
populated — useful to notify rooms); `disconnect` fires after (rooms empty).

**C11. [M] What are adapter room events?**
`io.of("/").adapter.on("create-room" | "delete-room" | "join-room" | "leave-room", …)`.
They fire for private id-rooms too and are local to each node.

**C12. [S] How would you list "real" rooms (not socket-id rooms)?**
`[...adapter.rooms.keys()].filter(r => !adapter.sids.has(r))` (local node only).

**C13. [M] What does `io.local.emit` do?**
Broadcasts only to sockets connected to the current node, skipping the adapter's
cross-node forwarding.

**C14. [M] What's `io.except()`?**
Excludes sockets in given rooms from a broadcast: `io.except("banned").emit(...)`,
`io.to("room1").except("room2").emit(...)`.

**C15. [M] Is `socket.join` sync or async?**
With the default in-memory adapter it's synchronous; with some adapters it can return a
Promise (`Promise<void> | void`). `await socket.join(room)` is safe in both cases.

**C16. [S] Room design for a Slack-like app?**
`user:<id>` (all devices), `channel:<id>` (members), `workspace:<id>` (announcements),
maybe `presence:<id>` (subscribers to someone's presence), `thread:<id>` if threads are
subscribed separately. Joins authorized on the server, re-joined from the DB on every
connection; membership changes propagated cluster-wide with `socketsJoin/socketsLeave`.

---

## Part D — Connection lifecycle and reliability

**D1. [E] Which events does the client receive on connection problems?**
`connect_error` (couldn't connect or rejected by middleware), `disconnect` (with reason),
and Manager events `reconnect_attempt`, `reconnect`, `reconnect_error`,
`reconnect_failed` on `socket.io`.

**D2. [M] List the client disconnect reasons and which ones auto-reconnect.**
`io server disconnect` (server called disconnect — no auto-reconnect), `io client
disconnect` (client called disconnect — no), `ping timeout`, `transport close`,
`transport error`, `parse error` (all auto-reconnect).

**D3. [M] List server-side disconnect reasons.**
`server namespace disconnect`, `client namespace disconnect`, `server shutting down`,
`ping timeout`, `transport close`, `transport error`, `parse error`, `forced close`,
`forced server close`.

**D4. [M] How does the heartbeat work in v4?**
The server sends a PING every `pingInterval` (25 s); the client must answer PONG within
`pingTimeout` (20 s), otherwise the server closes with `ping timeout`. The client expects
a PING within `pingInterval + pingTimeout` (45 s) or closes with `ping timeout` and
reconnects. The values are sent in the handshake. In v2 the direction was reversed.

**D5. [S] Why did v3 reverse the heartbeat direction?**
Browsers throttle timers in background tabs; a client-driven ping could be delayed and
the server would wrongly consider the client dead. Server-driven pings only require the
client to respond to a received message, which isn't affected the same way.

**D6. [M] Why are heartbeats needed if TCP exists?**
TCP may not detect a dead peer for a long time (sleeping laptop, lost mobile network,
NAT dropping state — no FIN/RST sent). Heartbeats detect zombies, update presence, and
keep proxies/LBs from closing idle connections.

**D7. [M] Explain the reconnection algorithm.**
Exponential back-off with jitter: delay starts at `reconnectionDelay` (1 s), doubles each
attempt, randomized ±`randomizationFactor` (50%), capped at `reconnectionDelayMax` (5 s),
unlimited attempts by default (`reconnectionAttempts: Infinity`). Each attempt has a
`timeout` (20 s). Jitter avoids thundering-herd reconnection storms.

**D8. [M] After reconnecting, my user no longer receives room messages. Why?**
A reconnection creates a new server-side socket with a new id and no rooms or data.
Re-join rooms in the `connection` handler based on the authenticated user (DB), or have
the client re-subscribe on every `connect`, or use connection state recovery (and still
handle the non-recovered case).

**D9. [M] Why do I get duplicate messages after reconnection?**
Listeners registered inside `socket.on("connect")` (or React effects without cleanup)
accumulate. Register listeners once outside `connect`, or remove them with `off` using the
same reference.

**D10. [M] `socket.on("reconnect")` doesn't fire — why?**
Since v3 reconnection events are on the Manager: `socket.io.on("reconnect", …)`.

**D11. [M] What's `socket.active`?**
True if the socket is connected or will try to reconnect automatically. In
`connect_error`, `socket.active === false` means the server rejected the connection
(middleware) and you must fix and call `socket.connect()` yourself.

**D12. [S] What is connection state recovery and how does it work?**
(v4.6+) Enabled with `connectionStateRecovery: { maxDisconnectionDuration, skipMiddlewares }`.
The server gives the client a private session id (`pid`); each emitted event gets an
offset appended (client tracks the last one). On a recoverable disconnect (transport
error/close, ping timeout, forced close, server shutting down), the adapter stores
`{sid, pid, rooms, data}`. On reconnection the client sends `{pid, offset}`; if the session
exists and hasn't expired, the server restores id, rooms, data, sets
`socket.recovered = true`, and replays missed packets. Limits: not for packets with acks
or volatile packets; memory for stored packets; best-effort; requires a supporting
adapter (in-memory, Redis Streams, MongoDB — not the classic Redis pub/sub adapter, not
Postgres).

**D13. [S] Clients should not miss chat messages even after a 10-minute outage. Design it.**
Persist messages in the DB before broadcasting (server-assigned increasing ids per
conversation). Clients store the last seen id per conversation; on every `connect` they
call `sync(afterId)` via ack or HTTP (paginated); live events continue meanwhile; dedupe
by id; render sorted by server id. Push notifications for apps in background. CSR can
reduce sync load for short blips but isn't relied on.

**D14. [M] What happens on page reload?**
The browser closes the connection; the server sees `transport close`; the new page
creates a new connection with a new socket id. The server can't distinguish reload from
network loss → presence grace periods.

**D15. [M] What timeouts exist? (pingInterval, pingTimeout, upgradeTimeout, connectTimeout, client timeout…)**
See Ch. 5 table: 25 s / 20 s / 10 s / 45 s on the server; client `timeout` 20 s;
reconnection delays 1–5 s; `ackTimeout` none by default; Redis adapter
`requestsTimeout` 5 s.

**D16. [M] What's `connectTimeout` on the server?**
Time (45 s) a client has, after the Engine.IO handshake, to successfully join a
namespace; if it hasn't, the server closes the low-level connection. Relevant when
middleware never calls `next()`.

**D17. [S] How do you handle access-token expiry on long-lived connections?**
Validate at connection; store `exp` in `socket.data`; schedule a disconnect at expiry (or
emit `auth:expired`); client refreshes the token and reconnects (use `auth` as a function
so each attempt reads the latest token) or performs in-band refresh; revoke with
`io.in("user:" + id).disconnectSockets(true)`; re-check permissions on sensitive events.

**D18. [M] How do you detect on the client that the connection is down and show a banner?**
Listen to `disconnect` (show "reconnecting…") and `connect` (hide), use `socket.connected`
for initial state; optionally Manager `reconnect_attempt` for attempt counts and
`reconnect_failed` for a final error.

**D19. [S] How do mobile apps receive messages in the background?**
They don't via Socket.IO — the OS suspends the app and the connection dies. Use push
notifications (APNs/FCM) for background delivery, and sync on foreground.

---

## Part E — Middleware, authentication and security

**E1. [E] How do you authenticate Socket.IO connections?**
Client sends credentials in the `auth` option (`io(url, { auth: { token } })`); server
middleware `io.use((socket, next) => …)` verifies `socket.handshake.auth.token`, sets
`socket.data.user`, and calls `next()` or `next(new Error("unauthorized"))`. Alternatively
cookies/sessions via `io.engine.use(sessionMiddleware)`.

**E2. [M] Why `auth` instead of query string or headers?**
Query strings end up in logs/history (token leakage). Browser WebSocket API can't set
custom headers (`extraHeaders` only applies to polling in browsers). `auth` is sent in the
CONNECT packet body and is per-namespace.

**E3. [M] What does the client receive when middleware rejects?**
A `connect_error` event with `err.message` and `err.data` (from `err.data` set on the
server). The client doesn't auto-reconnect (`socket.active === false`).

**E4. [M] What are the middleware types?**
`io.engine.use()` (Express-style, raw HTTP requests, v4.6+), `io.use()` / `nsp.use()`
(once per connection per namespace), `socket.use()` (per incoming event; `next(err)` emits
`error` on the server socket), plus the `allowRequest` option (earliest gate).

**E5. [M] How do you share an Express session with Socket.IO?**
`io.engine.use(sessionMiddleware)` then `socket.request.session` in handlers. For
Passport: apply session + `passport.session()` for the handshake request only, then
`socket.request.user`. (Pre-4.6: wrap middleware with `io.use(wrap(mw))`.)

**E6. [S] What is Cross-Site WebSocket Hijacking and how do you prevent it?**
A malicious site opens a WebSocket to your server from the victim's browser; cookies are
attached automatically, and WebSocket handshakes aren't protected by CORS/SOP. If you
authenticate only via cookies, the attacker gets an authenticated channel. Prevent by
checking `Origin` (`allowRequest`), using tokens (not ambient cookies), SameSite cookies,
short-lived tickets.

**E7. [M] How do you configure CORS and what's a common mistake?**
`new Server(httpServer, { cors: { origin: ["https://app.com"], credentials: true } })`;
client `withCredentials: true` if cookies are needed. Mistakes: `origin: "*"` with
credentials, trailing slashes/ports mismatches, believing CORS protects the WebSocket
transport (it doesn't).

**E8. [M] How do you authorize actions, not just connections?**
Every event checks permissions server-side using `socket.data.user` (never ids from the
payload), especially room joins and data access; per-event middleware (`socket.use`) for
role checks; re-validate for sensitive operations.

**E9. [M] How do you rate-limit Socket.IO events?**
`socket.use` middleware with `rate-limiter-flexible` keyed by user id (Redis-backed in
clusters); reply with `RATE_LIMITED` via ack; disconnect repeat offenders; cap
connections per user/IP; edge rate limits for handshakes.

**E10. [M] What security risks exist with broadcasting user content?**
XSS (render with `textContent`/framework escaping), data leaks to wrong rooms (authorize
joins, prefix rooms), oversized payloads (validation, `maxHttpBufferSize`), injection into
DB queries (validate/parameterize).

**E11. [S] How would you protect against DoS on a Socket.IO server?**
Edge protections (WAF, connection/request rate limits), `maxHttpBufferSize` lowered,
per-user rate limits, connection caps, validation of payload size/shape, timeouts on
acks, limiting dynamic room/namespace creation, slow-consumer disconnects, keeping
`engine.io`/`socket.io-parser`/`ws` patched (historic crash CVEs), autoscaling and
process restarts.

**E12. [M] How do you get the real client IP behind a proxy?**
`socket.handshake.address` gives the proxy IP; read `x-forwarded-for` (first entry) or
`cf-connecting-ip` only when your proxy is trusted and sets it.

**E13. [M] Is `socket.handshake.auth` trustworthy?**
It's client-supplied — trustworthy only after you verify it (e.g. JWT signature check).

**E14. [S] Name some real vulnerabilities in the Socket.IO ecosystem.**
Permissive default CORS in `socket.io` < 2.4.0; an unhandled `error` event that could crash
`socket.io` < 4.6.2; uncaught exceptions from crafted requests in `engine.io` (fixed in
6.2.1 / 6.4.2) and polling connection exhaustion (fixed in 6.6.7); `socket.io-parser`
decoding/validation bugs and attachment-based memory exhaustion (fixed in 4.0.5, 4.2.3,
4.2.6, 4.2.7); `ws` DoS via many headers (8.17.1), memory disclosure (8.20.1) and
fragment-based memory exhaustion (8.21.0). Pattern: malicious clients crashing or
exhausting servers with malformed/oversized packets. Lesson: keep the whole stack patched
(check the lockfile with `npm ls ws engine.io socket.io-parser`), keep
`maxHttpBufferSize` small, rate-limit, and restart crashed processes. (Ch. 6.10 has the
full table with advisory ids.)

---

## Part F — Internals and protocol

**F1. [M] What is Engine.IO?**
The low-level layer: handshake, transports (polling/WebSocket/WebTransport), upgrade
mechanism, heartbeats, packet encoding (Engine.IO protocol v4). Socket.IO (protocol v5)
runs on top of it.

**F2. [M] Describe the handshake.**
Client: `GET /socket.io/?EIO=4&transport=polling`. Server: `0{"sid":"…","upgrades":["websocket"],
"pingInterval":25000,"pingTimeout":20000,"maxPayload":1000000}`. Then the client sends a
Socket.IO CONNECT `40` (with auth payload if any), server responds `40{"sid":"<socket id>"}`
or `44{"message":…}` on error.

**F3. [S] Explain the upgrade mechanism.**
After connecting over polling, the client opens a WebSocket with the same `sid`, sends
`2probe`, server answers `3probe`; the client pauses polling (waits for pending requests;
the server closes a pending GET with a `6` noop), sends `5` (upgrade), and all traffic
moves to the WebSocket; buffered packets flush. No loss/reordering. `upgradeTimeout`
(10 s) bounds it.

**F4. [M] Engine.IO packet types?**
0 open, 1 close, 2 ping, 3 pong, 4 message, 5 upgrade, 6 noop.

**F5. [M] Socket.IO packet types?**
0 CONNECT, 1 DISCONNECT, 2 EVENT, 3 ACK, 4 CONNECT_ERROR, 5 BINARY_EVENT, 6 BINARY_ACK.

**F6. [M] Decode `42/admin,7["q"]` and `431[{"ok":true}]`.**
First: Engine.IO message (4) + Socket.IO EVENT (2) in namespace `/admin` with ack id 7,
event `q`. Second: message (4) + ACK (3) for ack id 1 with response `{ok:true}`.

**F7. [S] How is binary data transmitted?**
The parser replaces binary values with placeholders `{"_placeholder":true,"num":i}`,
sends a BINARY_EVENT header like `451-["bin",{"_placeholder":true,"num":0}]` (1
attachment), then each attachment as a separate Engine.IO message: a raw binary WebSocket
frame, or `b<base64>` over polling. The receiver reassembles.

**F8. [M] How are multiple packets sent over polling?**
Concatenated in one HTTP body separated by the record separator `\x1e` (Engine.IO v4).

**F9. [M] What's the parser and why change it?**
It encodes/decodes Socket.IO packets. Default: JSON + binary attachments. Alternatives:
`socket.io-msgpack-parser` (smaller for numeric/binary data), custom parsers. Both sides
must match.

**F10. [S] What is the adapter and what does the default one do?**
Per-namespace component storing room membership (`rooms`, `sids` maps) and performing
broadcasts (computing recipients, encoding once, writing to each). The default in-memory
adapter works within one process; distributed adapters forward broadcasts and requests
(fetchSockets, socketsJoin, serverSideEmit, broadcast acks) between nodes, and some
persist sessions for CSR.

**F11. [S] Why does `io.emit` to 10k sockets not serialize 10k times?**
The adapter encodes the packet once and writes the same encoded buffer/string to each
target client.

**F12. [M] What are `socket.conn` and `socket.request`?**
`socket.conn` is the underlying Engine.IO socket (transport, `remoteAddress`, `id`,
`readyState`, `upgrade` event). `socket.request` is the first HTTP request (headers,
session/user if middleware attached them).

**F13. [M] How can you see which transport a client uses?**
Server: `socket.conn.transport.name` and `socket.conn.once("upgrade", t => …)`. Client:
`socket.io.engine.transport.name` and `socket.io.engine.on("upgrade", …)`.

**F14. [S] What is `rememberUpgrade`?**
Client option: if a previous connection successfully used WebSocket (static flag in the
page), start directly with WebSocket next time.

**F15. [M] What's WebTransport support?**
Since 4.7, an HTTP/3-based transport (requires HTTPS and an HTTP/3 server, enabled in
server `transports`). Benefits: no head-of-line blocking, faster setup; limited browser
support so WebSocket stays the default.

---

## Part G — Scaling and architecture

**G1. [M] How do you scale Socket.IO horizontally?**
Run multiple processes/servers behind a load balancer with (1) **sticky sessions** (or
WebSocket-only transport) so all HTTP requests of a session reach the same node, and
(2) a distributed **adapter** (Redis, Redis Streams, MongoDB, Postgres, cluster, cloud
pub/sub) so broadcasts and room operations span all nodes. Keep nodes stateless (state in
DB/Redis), use user rooms, and handle reconnection storms.

**G2. [M] Why are sticky sessions needed?**
With HTTP long-polling, a session is many separate HTTP requests; the session lives in
the memory of the node that did the handshake. If a request hits another node, it answers
`400 {"code":1,"message":"Session ID unknown"}`. Even the WebSocket upgrade request must
reach the node holding the session.

**G3. [M] When are sticky sessions not needed?**
When clients connect with `transports: ["websocket"]` only — a single long-lived TCP
connection stays on one node. Trade-off: no polling fallback.

**G4. [M] How do you implement sticky sessions?**
IP hash (nginx `ip_hash`/`hash $remote_addr consistent`, HAProxy `balance source`),
cookie-based affinity (AWS ALB stickiness, HAProxy `cookie`, ingress-nginx
`affinity: cookie`, nginx Plus `sticky`), Socket.IO's `cookie` option for cookie hashing,
`@socket.io/sticky` for Node cluster, `@socket.io/pm2` for PM2. Cross-origin cookie
stickiness needs `withCredentials: true` on the client.

**G5. [M] Why isn't the Node.js cluster module enough by itself?**
It distributes TCP connections round-robin; a polling session's requests use different
TCP connections and would hit different workers. `@socket.io/sticky` makes the primary
route by `sid`, and `@socket.io/cluster-adapter` lets workers broadcast to each other.

**G6. [M] How does the Redis adapter work?**
Each node publishes broadcasts to Redis channels (`socket.io#/#` or
`socket.io#/#<room>#` for single-room broadcasts) and pattern-subscribes to
`socket.io#/#*`; on receiving, a node broadcasts to its local sockets (ignoring its own
messages). Requests (fetchSockets, socketsJoin, serverSideEmit, broadcast acks) use
request/response channels with a `requestsTimeout` (5 s). It needs two Redis connections
(pub and sub).

**G7. [S] Limitations of the Redis pub/sub adapter?**
Pub/sub is fire-and-forget: a node disconnected from Redis misses messages; every node
receives every broadcast (pattern subscription) → fan-out cost; no connection state
recovery; Redis `client-output-buffer-limit pubsub` can disconnect slow subscribers.
Alternatives: sharded adapter (Redis 7 sharded pub/sub, dynamic per-room subscriptions),
Redis Streams adapter (resumes from offset, supports CSR).

**G8. [M] How do you emit from a process that isn't a Socket.IO server (worker/cron/microservice)?**
Use an emitter (`@socket.io/redis-emitter`, Postgres/Mongo emitters) that publishes into
the adapter's channels: `emitter.to("user:1").emit("x", data)`. Or publish to a broker
consumed by the realtime gateway. Emitters can't receive acks.

**G9. [M] What is `serverSideEmit`?**
Events between Socket.IO servers in a cluster: `io.serverSideEmit("reload", data)` →
other nodes receive via `io.on("reload")`; with ack and timeout you get responses from
each node (4.5+). Use for cache invalidation/config coordination.

**G10. [M] How do you configure nginx for Socket.IO?**
`proxy_http_version 1.1; proxy_set_header Upgrade $http_upgrade; proxy_set_header Connection "upgrade";`
plus Host/X-Forwarded-For headers, `proxy_read_timeout` above the ping interval (e.g.
120 s+), sticky upstream (`hash $remote_addr consistent` or `ip_hash`), and
`proxy_buffering off`.

**G11. [S] Clients disconnect every 60 seconds in production — what's happening?**
Almost certainly an idle timeout in a proxy/LB (nginx `proxy_read_timeout` 60 s default,
ALB 60 s idle timeout) shorter than the traffic gap — e.g. heartbeat interval increased
above it, or some proxy not counting traffic. Fix timeouts > `pingInterval`; check
disconnect reason (`transport close`) and the periodicity.

**G12. [S] How many connections can one Node server handle? How do you size a cluster?**
Typically tens of thousands per process; depends on memory per connection, message rates,
fan-out (messages × recipients), compression, handler work. Load-test real traffic,
measure memory per connection, CPU per message, event loop lag; size with headroom
(2–3× peak) and for reconnection storms when a node dies (remaining nodes absorb its
clients). Raise `ulimit -n`, watch ephemeral ports on proxies.

**G13. [S] How do you deploy without disconnecting everyone at once?**
Rolling deploys a few nodes at a time; readiness probe fails first so LB stops new
connections; graceful shutdown (`io.close()`) after a drain delay; clients reconnect with
jitter to other nodes; CSR with a shared store (Redis Streams) to recover sessions; watch
connection metrics between steps.

**G14. [S] How do you autoscale socket servers?**
On connection count / memory / event loop lag (custom metrics), not just CPU. Remember
scale-out only affects new connections; scale-in disconnects clients (graceful
shutdown). Pre-scale for known peaks.

**G15. [S] Design presence for millions of users.**
Track connections per user in Redis (set/sorted set with heartbeat timestamps, TTL for
crash safety); user online if ≥1 live connection; grace period before "offline"; publish
presence changes only to subscribers (`presence:<userId>` rooms for contacts/visible
users) rather than to everyone; store last seen; batch/coalesce updates; shard Redis.

**G16. [S] How do you avoid the "everyone receives everything" fan-out problem with big rooms?**
Avoid huge chatty rooms; send compact notifications and let clients fetch details over
HTTP/CDN; coalesce updates per tick; shard large rooms; use sharded Redis adapter
(dynamic subscriptions); `io.local` when each node consumes the source itself; separate
read-heavy broadcast infrastructure (e.g. a dedicated fan-out tier).

**G17. [S] How would you integrate Socket.IO in a microservices architecture?**
A dedicated realtime gateway service owns connections, auth and rooms; domain services
publish domain events to a broker (Kafka/RabbitMQ/SNS-SQS); the gateway consumes and emits
to rooms (or services use the Redis emitter). Commands go via HTTP or socket→gateway→
service (RPC/broker). DB remains the source of truth; clients re-sync on reconnect.

**G18. [M] Can Socket.IO run on serverless (Lambda, Vercel functions)?**
Not as a server — those runtimes are short-lived and don't keep connections. Use
long-running containers/VMs, or managed services (Azure Web PubSub for Socket.IO,
API Gateway WebSockets with a different protocol, Ably/Pusher).

**G19. [S] Multi-region deployment?**
Route users to the nearest region (geo-DNS); each region has its own Socket.IO cluster and
adapter; cross-region events go through a global broker/replication (with higher latency);
keep users of the same conversation in one "home" region if strong ordering is needed, or
accept per-region ordering + server ids for convergence.

---

## Part H — Performance and production

**H1. [M] How do you improve Socket.IO performance?**
Install `bufferutil`/`utf-8-validate`; consider uWebSockets.js via `io.attachApp`; keep
`perMessageDeflate` off unless needed; discard `socket.request` if unused; broadcast via
rooms (encode once); smaller payloads/diffs; throttle/coalesce/volatile for
high-frequency data; msgpack parser if measured beneficial; WebSocket-only where possible;
keep the event loop free (worker threads); horizontal scaling.

**H2. [M] Common causes of memory leaks in Socket.IO apps?**
Listeners added to global emitters per connection and never removed; per-socket timers
not cleared; maps of sockets never cleaned; pending acks without timeouts; client
listener accumulation; large `socket.data`; CSR packet storage; dynamic namespaces;
compression contexts.

**H3. [M] What causes mass `ping timeout` disconnections?**
Blocked event loop (CPU-heavy sync work, large JSON, GC pressure) preventing timely
PING/PONG processing; overloaded servers; network issues. Check event-loop lag metrics.

**H4. [M] How do you shut down gracefully?**
Fail readiness, wait for LB to drain new connections, optionally notify clients, call
`await io.close()` (disconnects sockets with `server shutting down` and closes the HTTP
server), close Redis/DB, exit. Handle SIGTERM.

**H5. [S] How do you version a Socket.IO event API?**
Additive changes only; new event names for breaking changes (`x:v2`) with a deprecation
window; send client version in `auth` and reject too-old clients with `UPGRADE_REQUIRED`;
shared contract package + AsyncAPI docs.

**H6. [M] What metrics do you monitor?**
Connected clients (`io.engine.clientsCount`), connect/disconnect rates, disconnect reasons,
`connect_error` rates, transport distribution, events per second by name, ack latency,
handler errors, event loop lag, memory, Redis health. Low-cardinality labels only.

**H7. [M] How do you debug Socket.IO?**
`DEBUG=socket.io*,engine` on the server, `localStorage.debug = "socket.io-client:*"` in the
browser; DevTools Network (handshake response, 101 WebSocket, Messages tab);
`onAny/onAnyOutgoing` logging; `io.engine.on("connection_error")` codes; Admin UI; curl
the handshake.

**H8. [M] What does `io.engine.on("connection_error")` tell you?**
Low-level failures with codes: 0 Transport unknown, 1 Session ID unknown (sticky
sessions!), 2 Bad handshake method, 3 Bad request, 4 Forbidden (`allowRequest`),
5 Unsupported protocol version.

**H9. [M] What is the Socket.IO Admin UI?**
`@socket.io/admin-ui`: `instrument(io, { auth: {...}, mode, readonly })` creates an `/admin`
namespace; the UI (admin.socket.io or self-hosted) shows servers, sockets, rooms, events,
and can join/leave/disconnect sockets. Protect it.

**H10. [M] How do you test Socket.IO code?**
Unit-test thin handlers with fakes; integration tests with a real server on port 0 and
real `socket.io-client` instances (wait for events with promises, use ack timeouts,
always close); E2E with Playwright (two contexts); load tests with Artillery's Socket.IO
engine or custom clients through the real LB.

---

## Part I — Frameworks, TypeScript, clients

**I1. [M] How do you type Socket.IO events in TypeScript?**
Define `ServerToClientEvents`, `ClientToServerEvents`, `InterServerEvents`, `SocketData`
interfaces; `new Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>()`
on the server; `Socket<ServerToClientEvents, ClientToServerEvents>` on the client (reversed
order: listen, emit). Share them in a package; still validate at runtime.

**I2. [M] How do you use Socket.IO in React correctly?**
Single socket instance (module/context), `autoConnect: false` and connect after login;
register listeners in `useEffect` with cleanup `socket.off(event, sameHandler)`; avoid
stale closures (functional updates/refs); StrictMode-safe; don't create sockets in render.

**I3. [M] Why do I see two connections in React development?**
`io()` called in a component/effect that StrictMode runs twice (mount→unmount→mount), or
on every render, or HMR. Create the socket outside components; cleanup properly.

**I4. [M] How do you integrate with Angular?**
An injectable service wrapping the socket; expose events as Observables that `off` on
unsubscribe; run handlers in `NgZone` (or update signals) so change detection runs.

**I5. [M] How does NestJS support Socket.IO?**
`@WebSocketGateway()` classes with `@SubscribeMessage()` handlers (return value = ack),
`@WebSocketServer()` for the server/namespace, lifecycle hooks
(`afterInit`, `handleConnection`, `handleDisconnect`), guards/pipes/filters per message,
`IoAdapter` subclass for the Redis adapter.

**I6. [M] How do you use Socket.IO with Next.js?**
Client code only in client components/effects; the server either a custom Node server
attaching Socket.IO to the same HTTP server, or (better) a separate long-running service.
Not on serverless functions.

**I7. [M] What's special about React Native?**
Use `transports: ["websocket"]`; real device IPs; HTTPS (cleartext blocked by default);
handle AppState (background disconnects) and push notifications.

**I8. [M] Which clients exist for other platforms?**
Official: JavaScript, Java (Android), Swift (iOS), C++ — plus Python (`python-socketio`),
Dart/Flutter, .NET, Rust, Go community clients. Check protocol compatibility tables.

---

## Part J — Scenario / debugging questions (very common for experienced roles)

**J1. [M] Users report the app works at home but not at the office.**
Corporate proxy/firewall blocks/breaks WebSocket. If you forced WebSocket-only, add polling
fallback (with sticky sessions); use TLS (`wss`) since proxies tamper less with encrypted
traffic; check `connect_error` telemetry by network.

**J2. [M] After adding a second server, clients randomly reconnect and some messages are missing.**
Missing sticky sessions (`Session ID unknown`) and/or missing adapter (broadcasts don't
cross nodes). Add both; verify with clients on different nodes.

**J3. [M] Messages appear twice in the chat UI.**
Duplicate listeners (registered in `connect` handler or effects without cleanup), multiple
socket instances, or retries without dedupe. Fix registration, single instance, dedupe by
message id/clientMsgId.

**J4. [M] The client never receives the "welcome" event emitted right at connection.**
The client registered the listener after connecting (race). Register listeners before
connecting (`autoConnect: false` → register → `connect()`), or request initial state via
an ack.

**J5. [S] The server misses the first event the client sends after connecting.**
Handlers registered after an `await` in an async `connection` handler — events arriving
meanwhile have no listener and are dropped. Register handlers synchronously first; do
async loading in middleware or afterwards.

**J6. [M] CPU spikes to 100% and mass ping timeouts happen when a big room is active.**
Fan-out of a high-frequency event to many recipients and/or big payloads; event loop
saturation. Throttle/coalesce, volatile, smaller payloads, shard rooms, scale out, profile.

**J7. [M] Clients disconnect exactly every 60 s with "transport close".**
Proxy idle timeout — see G11.

**J8. [M] `connect_error: xhr poll error` in production only.**
URL/port/path wrong, server down, CORS-masked proxy errors, TLS issues, proxy not routing
`/socket.io/`. Curl the handshake, check proxy logs.

**J9. [M] The WebSocket never upgrades — polling every 25 seconds in DevTools.**
Proxy missing Upgrade headers / HTTP 1.1; LB without WebSocket support. Fix proxy config.

**J10. [S] Memory grows linearly with time even with constant connections.**
A leak: listeners/timers not cleaned on disconnect, pending acks without timeout, maps,
CSR storage. Heap snapshots comparing before/after many connect/disconnect cycles.

**J11. [S] After a deploy, the cluster went down repeatedly.**
Reconnection storm / thundering herd: all clients reconnect to remaining nodes at once,
expensive handshakes (DB lookups) overwhelm them. Jitter + larger max delay, cheap
handshakes (JWT), edge rate limits, slower rolling deploys, pre-scaling.

**J12. [M] An ack callback receives `Error: operation has timed out` immediately on a broadcast.**
Broadcast with ack without `.timeout()`. Use `io.timeout(ms).emit(...)`.

**J13. [S] A user removed from a group still receives group messages.**
Their sockets are still in the room. On membership change call
`io.in("user:" + id).socketsLeave("group:" + gid)` (cluster-wide), and check membership in
handlers rather than relying solely on room membership.

**J14. [S] Some users see other tenants' notifications.**
Room name collisions (`"42"` used for several entity types/tenants), client-chosen rooms
without authorization. Prefix rooms by type and tenant, authorize joins.

**J15. [M] After upgrading the server to v4, old mobile apps can't connect.**
They use a v2 client (Engine.IO v3). Enable `allowEIO3: true` temporarily, then update the
apps (compatible client versions).

**J16. [M] `socket.emit` throws "is a reserved event name".**
Using `connect`, `disconnect`, etc. as custom names. Rename.

**J17. [S] Presence flickers online/offline when users refresh.**
No grace period; per-socket presence. Count connections per user and delay offline
announcements by a few seconds.

**J18. [S] Redis restarted and cross-node broadcasts silently stopped on one node.**
Subscriber didn't resubscribe / client in a broken state; missing error handling. Ensure
reconnect logic and error listeners, monitor adapter health, consider Streams adapter.

**J19. [M] Large file upload disconnects the client.**
Exceeds `maxHttpBufferSize`. Chunk with acks or use HTTP upload; adjust limit carefully.

**J20. [M] Node test runner/Jest hangs after Socket.IO tests.**
Open handles: clients not disconnected / server not closed. Clean up in `after`.

---

## Part K — Coding questions (write the code)

**K1. [E] Write a server that echoes every message back to the sender and broadcasts a join notice.**
```js
io.on("connection", (socket) => {
  socket.broadcast.emit("user:joined", socket.id);
  socket.on("echo", (msg, ack) => {
    socket.emit("echo", msg);
    if (typeof ack === "function") ack({ ok: true });
  });
});
```

**K2. [M] Implement JWT auth middleware with an error payload.**
```js
io.use((socket, next) => {
  try {
    const p = jwt.verify(socket.handshake.auth?.token, PUBLIC_KEY, { algorithms: ["RS256"] });
    socket.data.user = { id: p.sub, roles: p.roles };
    next();
  } catch (e) {
    const err = new Error(e.name === "TokenExpiredError" ? "TOKEN_EXPIRED" : "UNAUTHORIZED");
    err.data = { reason: e.name };
    next(err);
  }
});
```

**K3. [M] Implement chat rooms with join authorization and history in the ack.**
(See Ch. 4 worked example: `channel:join` checks ACL, `await socket.join`, notifies others
with `socket.to`, acks with history.)

**K4. [M] Implement a typing indicator with throttling and auto-expiry.**
(Ch. 13.3.)

**K5. [M] Write a promise-based `request()` helper with timeout and error envelope on the client.**
```js
async function request(event, payload, ms = 5000) {
  const res = await socket.timeout(ms).emitWithAck(event, payload); // rejects on timeout
  if (!res.ok) throw Object.assign(new Error(res.error.code), res.error);
  return res.data;
}
```

**K6. [M] Count online users across a cluster.**
Approximate & cheap: Redis counter/sets maintained in connection/disconnect (with TTL
heartbeats). Exact but expensive: `(await io.fetchSockets()).length`; distinct users:
`new Set((await io.fetchSockets()).map(s => s.data.user.id)).size`.

**K7. [M] Kick a user from all devices.**
```js
io.in(`user:${userId}`).emit("session:revoked");
io.in(`user:${userId}`).disconnectSockets(true);
```

**K8. [M] Write a per-socket rate limiter without libraries (token bucket).**
```js
io.on("connection", (socket) => {
  let tokens = 10, last = Date.now();
  socket.use(([event, ...args], next) => {
    const now = Date.now();
    tokens = Math.min(10, tokens + ((now - last) / 1000) * 5); // refill 5/s, burst 10
    last = now;
    if (tokens < 1) {
      const ack = typeof args.at(-1) === "function" ? args.at(-1) : null;
      return ack?.({ ok: false, error: { code: "RATE_LIMITED" } });
    }
    tokens -= 1;
    next();
  });
});
```

**K9. [S] Write a handler wrapper that validates with zod, catches errors and always acks.**
(Ch. 3.10 / 13.17 `safe()`.)

**K10. [S] Implement message sync on reconnect with dedupe on the client.**
(Ch. 5.9 option B.)

**K11. [M] Test that a broadcast excludes the sender.**
(Ch. 10.3 test "room broadcast excludes sender".)

**K12. [S] Set up the Redis adapter with error handling.**
(Ch. 8.4.)

**K13. [M] React hook that subscribes to an event safely.**
(Ch. 9.2 `useSocketEvent`.)

**K14. [S] Broadcast to all clients and collect their responses within 3 seconds.**
```js
try {
  const responses = await io.timeout(3000).emitWithAck("health:check");
  console.log(`${responses.length} clients answered`);
} catch (err) {
  // some clients did not respond in time
}
```

**K15. [S] Chunked upload with acks and resume.**
(Ch. 13.10.)

---

## Part L — System design rounds

**L1. [S] Design a WhatsApp/Slack-like chat system.**
Structure your answer:
1. **Requirements:** 1:1 and group chat, delivery/read receipts, presence, typing, media,
   history, push notifications, multi-device; scale (e.g. 10M concurrent), latency
   (< 300 ms p95), durability (no message loss), ordering per conversation.
2. **Connection tier:** Socket.IO gateway nodes (stateless) behind L7 LB with sticky
   sessions (or WS-only for mobile), TLS; auth via token in `auth`; `user:<id>` rooms;
   heartbeat defaults; capacity ~50–100k connections/node → hundreds of nodes; graceful
   deploys.
3. **Message flow:** client `message:send` with `clientMsgId` → validate/authorize →
   persist (Cassandra/Scylla/Postgres partitioned by conversation, server-assigned
   time-ordered ids) → publish to fan-out (adapter or broker) → `io.to(conversation room
   or member user rooms).emit` → ack to sender. Idempotency via `clientMsgId`.
4. **Offline/missed delivery:** last-seen id sync on reconnect; push notifications for
   offline/background users; dedupe.
5. **Fan-out:** small groups → per-member user rooms; large channels → room subscriptions
   or pull-on-notify; Redis sharded pub/sub / Kafka for cross-node.
6. **Presence/typing:** Redis TTL heartbeats, grace periods, subscription-based presence
   broadcast; typing volatile & throttled.
7. **Receipts:** per-user read pointer per conversation; batched updates.
8. **Media:** HTTP upload to object storage (pre-signed URLs), message carries the URL.
9. **Ordering & consistency:** per-conversation ordering via server ids; clients sort.
10. **Security:** authz per conversation, rate limits, E2E encryption option.
11. **Observability & ops:** metrics, alerts, rolling deploys, multi-region.

**L2. [S] Design a live notifications service for 50M users.**
Persist notifications; gateway with user rooms; event-driven pipeline from services via
broker; presence-aware routing (only push via socket if online, else mobile push);
read-state sync across devices; unread counters in Redis; backpressure and batching;
priority lanes.

**L3. [S] Design a live sports score/stock ticker for millions of viewers.**
Subscription rooms per match/symbol, snapshot on subscribe + coalesced deltas (e.g. 4/s),
volatile delivery, each node consuming the feed and using `io.local` (avoid adapter
fan-out), CDN for heavy data, WebSocket-only for efficiency, horizontal scaling by viewer
count.

**L4. [S] Design collaborative document editing (Google Docs).**
Rooms per document; CRDT (Yjs) or OT (ShareDB) for convergence; binary update relay;
awareness/cursors volatile & throttled; persistence snapshots + update log; initial sync
via state vectors; authorization per doc; ordering per doc (route a doc's editors to the
same node or rely on CRDT commutativity); offline editing merges on reconnect.

**L5. [S] Design a real-time multiplayer game backend.**
Matchmaking assigns matches to nodes (all players of a match on one node); authoritative
simulation tick loop; clients send inputs with sequence numbers; server broadcasts
compact snapshots (volatile, binary/msgpack) at 10–30 Hz; client prediction and
interpolation; anti-cheat validation; reconnect within grace period resumes the same
player slot (CSR or game-level session tokens).

**L6. [S] Design a ride-hailing live location system.**
Drivers emit throttled volatile location; gateway writes latest to Redis GEO and batches
history; trip rooms for riders; geo-cell rooms for dispatch; adaptive frequency; push and
HTTP fallback for background; scale by region.

**L7. [S] Design a live auction platform.**
Bids as acknowledged commands; atomic conditional DB/Redis updates; broadcast accepted
state with versions; server-authoritative timers with clock-offset; anti-sniping;
idempotency; audit log; high-traffic rooms coalesced.

---

## Part M — Experience / behavioural questions (prepare your stories)

- **"Tell me about a real-time feature you built."** Cover requirements, why Socket.IO,
  architecture (rooms, auth, scaling), a problem you hit (e.g. duplicate listeners, sticky
  sessions, proxy timeouts, reconnection storms), how you diagnosed it (metrics, DEBUG,
  DevTools), the fix, and the measurable result.
- **"How did you ensure reliability?"** Acks, idempotency, sync on reconnect, CSR,
  monitoring disconnect reasons, graceful deploys.
- **"How did you scale it?"** Adapter choice and why, stickiness approach, load tests and
  numbers, bottleneck found (fan-out, event loop) and fix.
- **"A production incident involving WebSockets?"** Use the runbook structure from
  Ch. 12.9.
- **"How do you keep the event API maintainable across teams?"** Contracts package,
  naming conventions, ack envelope, AsyncAPI docs, review checklist, versioning.

---

## Part N — Rapid-fire (one-liners)

1. Default path? → `/socket.io/`.
2. Default pingInterval / pingTimeout? → 25 000 / 20 000 ms.
3. Default maxHttpBufferSize? → 1 MB (1e6).
4. Default connectTimeout? → 45 000 ms.
5. Default upgradeTimeout? → 10 000 ms.
6. Default client reconnection delay / max / jitter? → 1 000 ms / 5 000 ms / 0.5.
7. Default reconnectionAttempts? → Infinity.
8. Default client connection timeout? → 20 000 ms.
9. Is CORS enabled by default (v3+)? → No.
10. Is perMessageDeflate enabled by default? → No.
11. Is the `io` cookie enabled by default? → No.
12. Default transports (server)? → `["polling", "websocket"]`.
13. What is `io.sockets`? → Alias of `io.of("/")`.
14. Room every socket joins automatically? → Its own id.
15. Are rooms client-side? → No, server-only.
16. Event to read rooms before leaving? → `disconnecting`.
17. Where are reconnection events (v3+)? → `socket.io` (Manager).
18. Property telling if the client will auto-reconnect? → `socket.active`.
19. Promise-based ack API? → `emitWithAck`.
20. Ack timeout API? → `socket.timeout(ms)`.
21. Drop-if-not-ready modifier? → `volatile`.
22. Broadcast only to sockets connected to THIS node? → `io.local`.
23. Server-to-server events? → `serverSideEmit`.
24. Fetch sockets cluster-wide? → `fetchSockets()`.
25. Accept v2 clients? → `allowEIO3: true`.
26. Express middleware on engine? → `io.engine.use()` (4.6+).
27. Engine error "Session ID unknown" code? → 1.
28. Engine error for disabled transport? → 0 "Transport unknown".
29. Packet `42` means? → Engine.IO message + Socket.IO event.
30. Polling payload separator (EIO4)? → `\x1e`.
31. Binary over polling prefix? → `b` + base64.
32. Upgrade probe packets? → `2probe` / `3probe`, then `5`.
33. CSR introduced in? → 4.6.
34. WebTransport support introduced in? → 4.7.
35. uWebSockets.js support via? → `io.attachApp(app)` (4.4+).
36. Adapters supporting CSR? → in-memory, Redis Streams, MongoDB.
37. Package for sticky sessions in Node cluster? → `@socket.io/sticky`.
38. Package to emit from non-Socket.IO processes? → `@socket.io/redis-emitter` (and others).
39. Admin dashboard package? → `@socket.io/admin-ui`.
40. Can `socket.emit("disconnect")` be used? → No, reserved.
