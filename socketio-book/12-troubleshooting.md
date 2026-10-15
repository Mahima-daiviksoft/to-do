# Chapter 12 — Troubleshooting: Common Bugs, Symptoms, Causes and Fixes

> **Goal:** a field manual. Each entry: **Symptom → Likely causes → How to confirm → Fix.**
> Read it once fully; come back to it during incidents. Entries are grouped by area.

---

## 12.0 First-aid kit (do these first, every time)

1. **Log the reasons.** Server: `disconnect` reason + `io.engine.on("connection_error")`
   (code/message). Client: `connect_error` (`err.message`, `err.data`, `socket.active`)
   and `disconnect` reason.
2. **Open DevTools → Network → filter `socket.io`.** Look at the handshake response, the
   WebSocket (101?) and its Messages tab.
3. **`curl` the handshake:** `curl -i "https://host/socket.io/?EIO=4&transport=polling"`
   → must return `0{"sid":…}`.
4. **Enable debug logs:** `DEBUG=engine,socket.io*` (server), `localStorage.debug = "socket.io-client:*"` (browser).
5. **Check versions** of client and server (`npm ls socket.io socket.io-client`).
6. **Reproduce without the proxy** (directly against Node) to split app bugs from
   infrastructure bugs.

---

## A. Connection problems

### A1. Client can't connect at all — `xhr poll error` / `websocket error` in `connect_error`
- **Causes:** wrong URL/port; server not running; server attached to a different HTTP
  server (`app.listen` bug); firewall; HTTPS page connecting to `http://`/`ws://` (mixed
  content blocked); certificate errors.
- **Confirm:** curl the handshake; check the browser console for mixed-content/TLS errors.
- **Fix:** `httpServer.listen(...)` (the one passed to `new Server`); use `https://`;
  correct URL; valid certificate.

### A2. 404 on `/socket.io/?EIO=4…`
- **Causes:** `app.listen()` instead of `httpServer.listen()`; client `path` ≠ server
  `path`; proxy not forwarding `/socket.io/`; serving behind a sub-path (`/api`) without
  adjusting `path`; Next.js/Vite dev server receiving the request instead of the
  Socket.IO server.
- **Fix:** listen on the correct server; align `path` on both sides (e.g.
  `path: "/api/socket.io/"`); proxy rule for the path; in Vite dev, configure
  `server.proxy` with `ws: true` for `/socket.io`.

### A3. CORS error in the browser
```
Access to XMLHttpRequest at '…/socket.io/?EIO=4&transport=polling…' from origin '…' has been blocked by CORS policy
```
- **Causes:** no `cors` option (v3+ default is no CORS); origin mismatch (`http` vs `https`,
  port, trailing slash `https://app.com/` ≠ `https://app.com`); `credentials: true` with
  `origin: "*"`; client `withCredentials: true` without server `credentials: true`.
- **Fix:** `cors: { origin: ["https://app.example.com"], credentials: true }` exactly
  matching; or serve frontend and API on the same origin. Note: a CORS error can also be a
  **masked 4xx/5xx** from a proxy that doesn't add CORS headers on errors — check the
  actual status.

### A4. `connect_error: "Invalid namespace"`
- **Cause:** the client connects to a namespace the server doesn't define — often by
  accident: `io("https://api.example.com/api")` thinking `/api` is a path.
- **Fix:** define `io.of("/api")`, or use `io("https://api.example.com", { path: "/api/socket.io/" })`.

### A5. `connect_error` with your middleware's message (e.g. `"unauthorized"`)
- **Cause:** `io.use` called `next(err)`.
- **Behaviour:** `socket.active === false` → **no automatic retry**.
- **Fix:** refresh credentials then `socket.connect()`; show login. Check token
  presence/format (`auth` vs `query`), clock skew for JWT `exp`/`nbf`, algorithm/secret
  mismatch between services.

### A6. Client stays "connecting" forever, no error, then reconnects every ~45 s
- **Cause:** a connection middleware never calls `next()` in some code path (e.g. an
  `await` that never resolves, a missing `return next()` after a condition, an exception
  in async middleware that's swallowed).
- **Confirm:** server debug logs show the handshake but no `connection`; the raw connection
  is closed after `connectTimeout` (45 s).
- **Fix:** ensure every path calls `next()`/`next(err)`; wrap async middleware in try/catch.

### A7. `connect_error: "timeout"`
- **Cause:** the connection attempt exceeded the client `timeout` (20 s): server overloaded
  (event loop blocked), network very slow, proxy buffering.
- **Fix:** investigate server load/event loop lag; proxy buffering off; increase
  `timeout` only if the network is genuinely slow.

### A8. `{"code":5,"message":"Unsupported protocol version"}` / client says "v2.x server with a v3.x client"
- **Cause:** version mismatch. v2 client → v3/v4 server needs `allowEIO3: true`. v3/v4
  client → v2 server is impossible (upgrade the server).
- **Fix:** align versions; use `allowEIO3` temporarily during migrations. Third-party
  clients (Swift/Java/Flutter/Python/Go): check their compatibility table.

### A9. `{"code":0,"message":"Transport unknown"}`
- **Cause:** client requests a transport disabled on the server (e.g. server
  `transports: ["websocket"]` but client starts with polling).
- **Fix:** align `transports` on both sides.

### A10. Works locally, fails in production
- **Usual suspects:** proxy WebSocket headers; sticky sessions; CORS with the real domain;
  TLS; `path` behind a prefix; CDN; corporate proxy at the client; different env vars.
- **Fix:** go through the first-aid kit against production; compare proxy configs.

### A11. Works in the browser, fails from a mobile app
- **Causes:** client library version incompatible with server protocol; cleartext HTTP
  blocked on Android/iOS (ATS); `localhost` used on a device; self-signed certs;
  polling issues on React Native.
- **Fix:** compatible client version; HTTPS; real host/IP; `transports: ["websocket"]` on RN.

---

## B. Transport / upgrade / proxy problems

### B1. Never upgrades to WebSocket (stays on polling)
- **Symptoms:** DevTools shows a polling request every ~25 s and no `transport=websocket`
  101; higher latency; `socket.io.engine.transport.name === "polling"`.
- **Causes:** proxy missing `proxy_http_version 1.1` + `Upgrade`/`Connection` headers;
  load balancer without WebSocket support; corporate proxy/antivirus; `upgrade: false` or
  `transports: ["polling"]` somewhere; server `allowUpgrades: false`.
- **Fix:** proxy configuration (Chapter 8); verify with `wscat`/`websocat` directly.

### B2. Random `400 Bad Request` with `{"code":1,"message":"Session ID unknown"}`
- **Cause:** **missing sticky sessions** with multiple nodes (polling requests reaching a
  node that didn't create the session), or the node restarted.
- **Fix:** enable sticky sessions (cookie/IP hash, `@socket.io/sticky` for cluster/PM2),
  or `transports: ["websocket"]`. With ALB cookies cross-origin → `withCredentials: true`.

### B3. Clients disconnect every 60 s (or another fixed interval) with `transport close`
- **Cause:** a proxy/LB **idle timeout** or `proxy_read_timeout` lower than the traffic
  interval, or a misconfigured heartbeat (`pingInterval` raised above the LB timeout).
- **Fix:** proxy timeouts > `pingInterval` (e.g. 120 s+); keep defaults for heartbeats.

### B4. WebSocket works but some users can't connect at all
- **Cause:** you forced `transports: ["websocket"]` and those users are behind
  WebSocket-blocking networks.
- **Fix:** allow polling fallback (`["websocket", "polling"]` + fallback on
  `connect_error`, or `tryAllTransports: true` in 4.8+), with sticky sessions.

### B5. Mixed content: `ws://` blocked on `https://` pages
- **Fix:** use `https://` URL in `io()` (the client derives `wss://`), terminate TLS at the
  proxy.

### B6. `WebSocket is closed before the connection is established`
- **Causes:** the socket disconnected during connection (component unmounted and
  `socket.disconnect()` called — e.g. React StrictMode double effect), proxy rejected the
  upgrade, server crashed. Mostly harmless in dev StrictMode.
- **Fix:** don't create/destroy the socket in effects that StrictMode double-invokes, or
  accept the dev-only warning; check proxy upgrade config.

---

## C. Events not received / received wrongly

### C1. Events are received 2×, 3×, N× (duplicates growing over time)
- **Causes (by frequency):**
  1. Listener registered **inside `socket.on("connect")`** → one extra listener per reconnection.
  2. React/Vue component registering `socket.on` without `socket.off` cleanup (or with a
     *different* function reference) → one extra per mount/re-render.
  3. Multiple `io()` calls (each creates a new connection) → each connection gets the event.
  4. Server registers handlers in a loop or per-request (e.g. `io.on("connection")` inside
     an Express route).
  5. Client-side retries (`retries` option) without server idempotency.
- **Confirm:** `socket.listeners("event").length`; count connections in DevTools.
- **Fix:** register once / cleanup with the same reference; single socket instance;
  dedupe by message id.

### C2. Client never receives an event the server "sent"
- Event name **typo / case mismatch** (`"chatMessage"` vs `"chat:message"`). → shared typed
  event map.
- Emitting to the **wrong namespace** (`io.emit` = main namespace; the client is on `/chat`).
- Emitting to a **room the socket isn't in** (join failed/authorization; or socket
  reconnected → new socket not re-joined).
- Using `socket.to(room)` when the **sender itself** should receive it (`socket.to` excludes the sender).
- Emitting **before the client registered** its listener (e.g. emitted in `connection`
  handler, but the client attaches `socket.on("welcome")` asynchronously later) → register
  listeners before connecting (`autoConnect: false` then `connect()`), or have the client
  request the data (`emitWithAck("init")`).
- **Multi-node without adapter**: the target client is on another server.
- Different Redis `key` prefix between nodes / emitter.
- The client was **disconnected** at that moment (at-most-once) → sync strategy.
- `volatile` packet dropped.
- Payload > `maxHttpBufferSize` → the connection was closed instead.

### C3. Server never receives a client event
- **Handlers registered after an `await` in an `async` connection handler.** The client
  emits right after `connect`; the packet arrives while the server is still awaiting (DB
  call), finds no listener and is **silently dropped** (verified on 4.8.4):
  ```js
  // ❌ events sent during the await are lost
  io.on("connection", async (socket) => {
    const rooms = await db.loadRooms(socket.data.user.id);
    socket.on("hello", handler);
  });
  // ✅ register synchronously first, then do async work (or do it in io.use middleware)
  io.on("connection", (socket) => {
    socket.on("hello", handler);
    db.loadRooms(socket.data.user.id).then((rooms) => socket.join(rooms));
  });
  ```
- Handler registered on the wrong namespace's connection handler.
- Client emitting before connection *and* `volatile` (dropped) — or emits buffered but
  page reloaded before reconnecting.
- A `socket.use()` middleware not calling `next()`, or calling `next(err)` (check the
  server socket's `error` event).
- Rate limiter dropping silently.
- Event name is reserved → `emit` threw on the client (check console).

### C4. The ack callback never fires
- Receiver handler doesn't call the callback in some path (error path!), or the handler
  threw before calling it.
- Receiver expected the callback at a different argument position (e.g. client sent
  `emit("x", cb)` but server handler is `(data, cb)` → `data` is the callback, `cb`
  undefined → `cb is not a function`).
- Middleware dropped the event.
- Connection lost in between.
- **Fix:** always use `timeout()`/`ackTimeout` on the sender; validate `typeof ack ===
  "function"` on the receiver; wrap handlers so errors still ack.

### C5. Ack callback's first argument is an Error/null unexpectedly
- **Cause:** you used `.timeout()` — callback signature becomes `(err, ...responses)`.
- **Fix:** `(err, response) => {}` with timeout; `(response) => {}` without.

### C6. Broadcast ack returns immediately with "operation has timed out"
- **Cause:** `io.emit("x", cb)` / `io.to(room).emit("x", cb)` **without** `.timeout()`.
- **Fix:** `io.timeout(5000).emit("x", (err, responses) => …)`.

### C7. Received data looks wrong (Date is a string, Map is `{}`, BigInt error)
- **Cause:** JSON serialization rules (Chapter 3).
- **Fix:** convert explicitly; send ISO strings/epoch numbers; arrays for Map/Set;
  strings for BigInt.

### C8. Events arrive in the "wrong order" in processing
- **Cause:** async handlers completing out of order; or events from different sockets/
  nodes (no global ordering).
- **Fix:** per-key queue; sequence numbers; server-assigned versions.

### C9. "Cannot emit reserved event" error
- **Cause:** `socket.emit("connect" | "disconnect" | "connect_error" | "disconnecting" | "newListener" | "removeListener")`.
- **Fix:** rename your event.

---

## D. Disconnections and reconnection

### D1. Mass `ping timeout` disconnections
- **Causes:** **event loop blocked** on the server (sync CPU work, huge JSON, GC pauses
  from memory pressure); overloaded Node; network congestion; client devices sleeping
  (normal in small amounts).
- **Confirm:** event loop lag metric spikes at the same time; CPU 100%.
- **Fix:** move CPU work off the loop; scale out; reduce message volume; fix memory
  pressure.

### D2. Client doesn't reconnect after disconnect
- **Cause:** reason `io server disconnect` (server called `disconnect()`), `io client
  disconnect`, or middleware rejection — auto-reconnect is intentionally disabled.
- **Fix:** handle those cases explicitly (`socket.connect()` after fixing auth).

### D3. `socket.on("reconnect")` never fires
- **Cause:** v3+ moved it to the Manager.
- **Fix:** `socket.io.on("reconnect", …)`, or simply use `socket.on("connect")` (fires on
  every successful connection, including reconnections).

### D4. After reconnection, the user no longer receives room messages
- **Cause:** a reconnection creates a **new server-side socket** with no rooms; you joined
  rooms only on explicit client actions.
- **Fix:** re-join rooms in `connection` based on the user (DB), or have the client
  re-subscribe on every `connect`; or enable connection state recovery (and still handle
  `recovered === false`).

### D5. Reconnection storm after a deploy/outage (servers overloaded, crash loop)
- **Cause:** all clients reconnect simultaneously; expensive handshake (auth DB queries,
  loading rooms).
- **Fix:** keep jitter; increase `reconnectionDelayMax` for large fleets; make connection
  setup cheap (cache, JWT instead of DB lookups); rate-limit handshakes at the edge; scale
  ahead of deploys; roll deploys slowly; CSR with `skipMiddlewares`.

### D6. `socket.id` changed / server lost my identity
- **Cause:** ids change on reconnection (expected).
- **Fix:** use authenticated user ids and user rooms.

### D7. A flood of old events hits the server when a client comes back online
- **Cause:** client `sendBuffer` accumulated emits while offline.
- **Fix:** `volatile` for droppable events; `if (socket.connected)` guards; clear
  `socket.sendBuffer` on reconnect when stale.

### D8. Presence shows users "online" long after they left (or flickers)
- **Causes:** dead connections only detected after `pingInterval + pingTimeout`; presence
  tracked per socket instead of per user (multiple tabs); node crash left stale Redis
  entries; immediate "offline" on brief reconnections → flicker.
- **Fix:** count sockets per user (online if ≥ 1); TTL-based heartbeats in Redis; grace
  period (e.g. 5–10 s) before broadcasting "offline" (Chapter 13).

---

## E. Scaling / multi-node problems

### E1. Broadcasts reach only some users
- **Cause:** no adapter (in-memory per node), adapter not applied to the namespace in use,
  Redis connection broken, different `key` prefixes, emitter/adapter mismatch.
- **Confirm:** connect two clients to two different nodes and test; check Redis
  `PUBSUB CHANNELS socket.io*`.
- **Fix:** configure the adapter on every node; same `key`; Redis error handlers.

### E2. `fetchSockets()` is slow or times out
- **Cause:** one node slow/dead → waits `requestsTimeout` (5 s); huge numbers of sockets.
- **Fix:** don't use on hot paths; maintain presence/counters in Redis; tune timeout.

### E3. Redis adapter suddenly stops delivering cross-node messages
- **Causes:** subscriber disconnected (and not resubscribed), Redis `client-output-buffer-limit
  pubsub` exceeded → Redis kills slow subscribers; network partition.
- **Fix:** monitor/alert on Redis client reconnects; raise limits carefully; consider the
  Redis Streams adapter (resumes from offset).

### E4. Process crashes with an unhandled `'error'` event from Redis
- **Fix:** `pubClient.on("error", …)` and `subClient.on("error", …)`.

### E5. Uneven load across nodes
- **Cause:** IP-hash stickiness behind NAT (corporate networks); long-lived connections
  stay where they started after scale-out.
- **Fix:** cookie-based stickiness; least-connection balancing for new connections;
  periodic gentle rebalancing (disconnect a fraction of clients on overloaded nodes).

---

## F. Performance and memory

### F1. Memory grows steadily until OOM
- **Causes:** see Chapter 11 leak table (global listeners, timers, maps, pending acks,
  perMessageDeflate, CSR buffers, dynamic namespaces).
- **Confirm:** heap snapshots; `MaxListenersExceededWarning`; memory vs connection count
  correlation (if memory grows while connections are flat → leak).
- **Fix:** clean up on `disconnect`; timeouts on acks; disable/tune compression.

### F2. High CPU with few messages
- **Causes:** heavy compression, huge payloads JSON-encoded often, many polling clients
  (HTTP overhead), TLS in Node, logging every event at info level, `fetchSockets` loops.
- **Fix:** profile (`node --cpu-prof`, clinic.js flame graphs) and fix hot spots.

### F3. Latency spikes
- **Causes:** event loop blocking, GC, Redis latency, big broadcasts, Nagle/proxy buffering.
- **Fix:** measure event loop lag; split work; `proxy_buffering off`; smaller messages.

### F4. Server closes the connection when sending a file/large message
- **Cause:** payload > `maxHttpBufferSize` (1 MB default).
- **Fix:** increase deliberately, chunk with acks, or use HTTP uploads.

---

## G. Framework-specific

### G1. React: multiple connections in DevTools
- **Cause:** `io()` inside a component body or in an effect without cleanup; StrictMode
  double-invoking effects; hot module reload creating new sockets.
- **Fix:** module-level singleton or context; cleanup with `disconnect()` if you create
  in effects.

### G2. React: handler sees stale state
- **Cause:** closure captured old state when the listener was registered.
- **Fix:** functional `setState(prev => …)`, refs, or re-register on deps change with
  proper cleanup.

### G3. Angular: UI not updating on socket events
- **Cause:** handler running outside Angular zone.
- **Fix:** `NgZone.run`, signals, or `ChangeDetectorRef.markForCheck()`.

### G4. Next.js: "window is not defined" / socket created on the server
- **Fix:** client components only, create sockets in effects or lazily; don't import the
  client socket in server components.

### G5. Jest: "did not exit one second after the test run has completed"
- **Fix:** disconnect clients and `io.close()` in `afterAll`; `forceExit` is a last resort.

### G6. NestJS: guard doesn't run on connection
- **Cause:** guards run per message, not on the connection handshake.
- **Fix:** authenticate in `handleConnection` or with `server.use()` middleware in `afterInit`.

---

## H. Security incidents

### H1. Someone receives other users' messages
- **Causes:** room join not authorized (client asked to join any room); identity taken
  from payload; `io.emit` instead of `io.to(room)`; room name collision (`"1"` used for
  both user 1 and conversation 1 → prefix rooms by type: `user:1`, `conv:1`).
- **Fix:** authorize joins; prefixes; audit emits.

### H2. Abuse / spam floods
- **Fix:** per-user Redis rate limits; connection caps per user/IP; edge rate limiting;
  disconnect offenders; reduce `maxHttpBufferSize`.

### H3. Server crashes on a malicious packet
- **Fix:** update `socket.io`, `engine.io`, `socket.io-parser`, `ws` (historic CVEs);
  handlers wrapped; process manager auto-restart; alerting.

---

## 12.9 Incident runbook template (copy to your wiki)

```
Title: Realtime connections dropping / not connecting
1. Impact: % of clients affected? (connected clients graph, connect_error rate)
2. Recent changes? (deploys of app/proxy/LB/Redis, certificate renewals, config)
3. Check disconnect reasons distribution (ping timeout / transport close / server disconnect)
4. Check event loop lag, CPU, memory per node
5. Check Redis health (latency, connected clients, pubsub buffers)
6. Check LB/proxy error logs (502/400 Session ID unknown/timeouts)
7. curl the handshake from outside; test WebSocket with wscat/websocat
8. Mitigate: roll back / scale out / raise timeouts / disable heavy feature flag
9. Post-incident: add the missing metric/alert, update this runbook
```

---

## 12.10 Chapter summary

Most real-world Socket.IO problems come from a short list: **wrong server listened on,
CORS, path vs namespace confusion, proxy WebSocket headers/timeouts, missing sticky
sessions, missing adapter, listeners registered repeatedly, rooms lost on reconnection,
acks without timeouts, blocked event loop, and version mismatches.** Know these by heart
and you can fix 95% of issues in minutes.

Next: [Chapter 13 — Architecture, patterns and projects](13-architecture-patterns-projects.md)
