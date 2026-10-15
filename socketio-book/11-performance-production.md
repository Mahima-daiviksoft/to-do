# Chapter 11 — Performance Tuning and Running in Production

> **Goal:** make Socket.IO fast and cheap, avoid memory leaks, deploy and shut down
> safely, evolve your event API without breaking old clients, and operate it like a
> senior engineer.

---

## 11.1 ELI5

A fast pizza shop: phones with good batteries (efficient WebSocket engine), short
sentences (small payloads), one loudspeaker announcement instead of calling each customer
(broadcast to rooms, encode once), not answering every tiny question immediately but
grouping them (batching/throttling), no forgotten orders piling up in the corner (memory
leaks), and a calm closing routine at night that tells customers "we're closing, call
the other branch" (graceful shutdown).

---

## 11.2 Server-level performance tuning

### 1. Native add-ons for `ws`

```bash
npm install --save-optional bufferutil utf-8-validate
```

- `bufferutil` speeds up masking/unmasking of WebSocket frames.
- `utf-8-validate` speeds up UTF-8 validation of text frames (less important on recent
  Node versions that provide a fast built-in validator).
- They're optional: `ws` falls back to JS implementations if they're missing.

### 2. Use uWebSockets.js (v4.4+)

`uWebSockets.js` is a C++ HTTP/WebSocket server with much lower memory per connection
and higher throughput than Node's `http` + `ws`.

```js
const { App } = require("uWebSockets.js");   // installed from GitHub, not npm registry
const { Server } = require("socket.io");

const app = App();
const io = new Server();

io.attachApp(app);

io.on("connection", (socket) => { /* ... */ });

app.listen(3000, (token) => {
  if (!token) console.warn("port already in use");
});
```

Caveats: different HTTP API (Express middleware doesn't plug in directly), native
dependency to build/ship, fewer people know it. Use when connection density/cost matters.

### 3. Alternative `wsEngine`

The `wsEngine` option lets you replace `ws` with a compatible implementation (e.g. a
native one). Verify maintenance status before adopting any alternative engine.

### 4. Discard the initial HTTP request object

Each Engine.IO connection keeps a reference to its first HTTP request (`socket.request`),
which holds headers, the parsed URL, etc. — memory per connection. If you don't need it
after the handshake:

```js
io.engine.on("connection", (rawSocket) => {
  rawSocket.request = null;
});
```

(Verified on 4.8.4: `socket.handshake.headers` is still available in your `connection`
handler; only `socket.request` becomes `null`. Don't do this if you use
`socket.request.session`/`socket.request.user` from `io.engine.use()` middleware.)

### 5. Compression trade-offs

- `perMessageDeflate` (WebSocket) is **off** by default. Turning it on reduces bandwidth
  for large compressible text but costs CPU and **significant memory per connection**.
  If you enable it, tune:
  ```js
  new Server(httpServer, {
    perMessageDeflate: {
      threshold: 2048,                 // only compress messages larger than 2 KB
      zlibDeflateOptions: { level: 3 }, // cheaper compression
      serverNoContextTakeover: true,   // don't keep compression context between messages → less memory
      clientNoContextTakeover: true,
    },
  });
  ```
- `httpCompression` (polling) is on by default with a 1 KB threshold — fine.
- Use `socket.compress(false)` for already-compressed binary.

### 6. Parser choice

The default JSON parser is fast in V8. `socket.io-msgpack-parser` can reduce size for
numeric/binary-heavy payloads. Measure with your real messages; switch only with
evidence (and switch both client and server).

### 7. Heartbeat settings

Shorter `pingInterval` = more packets (tiny) and faster detection; longer = fewer
wakeups. Defaults are reasonable; with 1M connections, 25 s interval = 40k pings/s per
cluster — still fine. Don't go below a few seconds.

### 8. Node process settings

- Run **one process per CPU core** (cluster/PM2/containers) with sticky sessions + adapter.
- Set container memory limits and `--max-old-space-size` consistently.
- Keep the **event loop free**: CPU-heavy work (image processing, big JSON, crypto, PDF)
  → worker threads or other services. A blocked loop delays **every** socket and causes
  `ping timeout` storms.

---

## 11.3 Application-level performance

### Encode once: broadcast instead of looping

```js
// ❌ serializes N times, N writes through the full emit path
for (const s of await io.in("room").fetchSockets()) s.emit("update", bigPayload);

// ✅ encodes once, adapter fans out (and works across nodes)
io.to("room").emit("update", bigPayload);
```

### Send less data

- Send **diffs/patches**, not entire objects (`{ id, field: newValue }`).
- Short property names only if traffic is huge (readability matters more usually).
- Don't broadcast large payloads to large rooms: broadcast a **small notification**
  ("doc 42 changed, version 17") and let clients fetch details via HTTP (cacheable, CDN).
- Strip server-only fields; use DTO projections.

### Throttle, debounce, batch, coalesce

```js
// client: throttle cursor updates to 20/s and use volatile
let last = 0;
document.addEventListener("mousemove", (e) => {
  const now = performance.now();
  if (now - last < 50) return;
  last = now;
  socket.volatile.emit("cursor", { x: e.clientX, y: e.clientY });
});
```

```js
// server: coalesce many updates into one tick per room every 100 ms
const pending = new Map(); // room -> latest state
function queueUpdate(room, state) { pending.set(room, state); }
setInterval(() => {
  for (const [room, state] of pending) io.to(room).volatile.emit("state", state);
  pending.clear();
}, 100);
```

### Rooms over filtering

Let the adapter select recipients (rooms) instead of iterating sockets and checking
conditions. Precompute rooms for common audiences (`org:1:admins`).

### Avoid expensive per-event work

- Cache permission checks (e.g. "is user in conversation" cached in `socket.data` or
  Redis with TTL; invalidate on membership change).
- Avoid DB queries on very high-frequency events (typing, cursor).
- Batch DB writes for high-volume streams.

### Backpressure / slow clients

A client on a bad network can't keep up; the server buffers outgoing packets for it
(`socket.conn.writeBuffer`). For high-throughput streams:

- prefer `volatile` (drop when not writable),
- send snapshots instead of every delta,
- disconnect consumers whose buffers grow beyond a limit:
  ```js
  setInterval(() => {
    for (const [, s] of io.of("/").sockets) {
      if (s.conn.writeBuffer.length > 1000) s.disconnect(true);
    }
  }, 10_000).unref();
  ```

---

## 11.4 Memory leaks — the usual suspects

| Leak | Example | Fix |
|---|---|---|
| Listeners on **global** emitters per connection | `bus.on("price", (p) => socket.emit("price", p))` in `connection` handler, never removed | Remove on `disconnect`, or better: use rooms (`io.to("prices").emit`) |
| Timers per socket | `setInterval(() => socket.emit(...), 1000)` | `clearInterval` on `disconnect` |
| Maps of sockets/users never cleaned | `users.set(socket.id, …)` without delete | Delete on `disconnect` (and prefer rooms/Redis) |
| Pending acks without timeout | `socket.emit("x", cb)` to unresponsive clients | `socket.timeout(ms).emit(…)` |
| Client-side listener accumulation | `socket.on` inside React effect without `off` / inside `connect` handler | Cleanup / register once |
| Huge `socket.data` | storing user profile + permissions blob | Keep ids only |
| Connection state recovery buffer | high broadcast volume × 2-minute window | Lower `maxDisconnectionDuration`, use Streams adapter with `maxLen` |
| Dynamic namespaces never removed | tenants created on the fly | `cleanupEmptyChildNamespaces: true` |
| `perMessageDeflate` | zlib contexts per connection | Disable or tune |
| Retained `socket.request` | per-connection request objects | `rawSocket.request = null` (if unused) |

```js
// ✅ correct per-socket resource management
io.on("connection", (socket) => {
  const onPrice = (p) => socket.volatile.emit("price", p);
  priceBus.on("price", onPrice);
  const timer = setInterval(() => socket.emit("tick"), 5000);

  socket.on("disconnect", () => {
    priceBus.off("price", onPrice);
    clearInterval(timer);
  });
});
```

Diagnose with heap snapshots (Chrome DevTools via `node --inspect`, or `heapdump`),
comparing two snapshots after many connect/disconnect cycles; look for retained `Socket`
objects. Node's `MaxListenersExceededWarning` on a global emitter is a strong leak hint.

---

## 11.5 Graceful shutdown and deployments

When a server restarts, all its clients disconnect and reconnect (to other nodes, with
back-off). Make it smooth:

```js
let shuttingDown = false;

app.get("/health/ready", (_req, res) => res.status(shuttingDown ? 503 : 200).end());

async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, "shutting down");

  // 1) give the load balancer time to stop sending NEW connections (readiness probe fails)
  await new Promise((r) => setTimeout(r, 10_000));

  // 2) optionally tell clients so they can show a notice / reconnect elsewhere with jitter
  io.emit("server:restarting");

  // 3) close Socket.IO: disconnects all sockets ("server shutting down") and closes the HTTP server
  await io.close();

  // 4) close other resources
  await Promise.allSettled([pubClient.quit(), subClient.quit(), db.end()]);
  process.exit(0);
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
```

Notes:

- `io.close()` closes all client connections **and the underlying HTTP server** (returns
  a Promise in v4).
- Clients see `transport close` (or the reason relayed) and reconnect automatically with
  jitter. With **connection state recovery** + a shared store (Redis Streams adapter),
  `server shutting down` is a recoverable reason, so sessions can resume on another node.
- **Rolling deploys:** replace pods/instances gradually; each step moves ~1/N of the
  connections; watch connection counts before continuing.
- **Blue/green with long-lived connections:** old (blue) servers keep their connections
  until you drain them — plan a deliberate drain step.
- **Spread reconnection storms:** if you disconnect many clients at once, consider
  disconnecting in batches over a few seconds.

---

## 11.6 Evolving your event API (versioning & backward compatibility)

Mobile apps and long-open browser tabs run **old client versions** for weeks. Rules:

1. **Additive changes only** (new optional fields, new events) are safe.
2. **Never rename/remove** an event or required field without a deprecation period.
3. Introduce breaking changes as **new events** (`order:updated:v2`) or with a `v` field;
   emit both old and new during migration.
4. Send the **client version** at connection (`auth: { token, clientVersion }`); reject
   unsupported versions with a clear error:
   ```js
   io.use((socket, next) => {
     if (semver.lt(socket.handshake.auth.clientVersion ?? "0.0.0", MIN_CLIENT)) {
       const err = new Error("UPGRADE_REQUIRED");
       err.data = { minVersion: MIN_CLIENT };
       return next(err);
     }
     next();
   });
   ```
5. Keep the event contracts in a **shared, versioned package** (TS types + runtime
   schemas) and/or an **AsyncAPI** specification (the OpenAPI equivalent for
   event-driven APIs) — generate docs from it.
6. Upgrading Socket.IO itself: v3 → v4 is non-breaking for clients; v2 → v4 requires
   `allowEIO3: true` during the migration window, then migrating clients.
7. When you deploy a new **web** client, old tabs keep the old JS: either keep backward
   compatibility, or emit `app:new-version` to prompt a reload.

---

## 11.7 Configuration per environment

```js
const io = new Server(httpServer, {
  path: process.env.SIO_PATH ?? "/socket.io/",
  cors: { origin: process.env.WEB_ORIGINS.split(","), credentials: true },
  serveClient: false,
  pingInterval: Number(process.env.SIO_PING_INTERVAL ?? 25000),
  pingTimeout: Number(process.env.SIO_PING_TIMEOUT ?? 20000),
  maxHttpBufferSize: Number(process.env.SIO_MAX_BUFFER ?? 1e6),
  transports: (process.env.SIO_TRANSPORTS ?? "polling,websocket").split(","),
  connectionStateRecovery: process.env.SIO_CSR === "1" ? { maxDisconnectionDuration: 60_000 } : undefined,
  adapter: await buildAdapter(),  // in-memory locally, Redis in staging/prod
});
```

Keep dev/staging/prod as similar as possible (same adapter type, same proxy) — many
production-only bugs come from "it works on localhost" without a proxy or a second node.

---

## 11.8 Cost optimisation

- Idle connections cost memory: scale servers on **memory/connection count**.
- Prefer WebSocket-only for clients that can (polling costs many HTTP requests).
- Reduce message volume (throttle, coalesce, volatile, diffs).
- Consider uWebSockets.js for high connection density.
- Disconnect idle users after long inactivity (e.g. background tabs for > 30 min) and
  reconnect on visibility change — can cut concurrent connections dramatically.
- Managed alternatives (Azure Web PubSub for Socket.IO, Ably, Pusher) trade money for ops
  effort — evaluate total cost.

---

## 11.9 Production readiness checklist

**Correctness**
- [ ] Handlers wrapped (sync + async errors), always ack commands.
- [ ] Inputs validated, actions authorized, idempotency for retried commands.
- [ ] State derived from DB/user on (re)connection; client re-syncs on `connect`.
- [ ] Client listeners registered once, cleaned up in UI frameworks.

**Scalability**
- [ ] Adapter configured (Redis/Streams/…) with error handlers and unique `key`.
- [ ] Sticky sessions or WebSocket-only transport.
- [ ] Proxy: HTTP/1.1 + Upgrade headers + timeouts > ping interval.
- [ ] No local userId→socket maps; user rooms instead.
- [ ] Load tested at 2–3× expected peak, including reconnection storms.

**Reliability**
- [ ] Graceful shutdown; readiness probe; rolling deploy strategy.
- [ ] Reconnection back-off sane; jitter on.
- [ ] Missed-message strategy (CSR and/or offset sync).

**Security** — see Chapter 6 checklist.

**Observability**
- [ ] Metrics: connections, disconnect reasons, transports, event rates, ack latency,
  event loop lag, memory, errors.
- [ ] Structured logs with socket/user ids; DEBUG toggle available.
- [ ] Alerts and runbooks (Chapter 12).

---

## 11.10 Chapter summary

- Speed: `bufferutil`, uWebSockets.js via `attachApp`, discard `request`, careful
  compression, measured parser choice, keep event loop free.
- App-level: broadcast via rooms (encode once), smaller payloads, throttle/coalesce,
  volatile, backpressure handling.
- Leaks: global listeners, timers, maps, pending acks, client listener accumulation.
- Graceful shutdown with readiness, `io.close()`, staged drains; rolling deploys.
- Version your event API; clients lag behind.

Next: [Chapter 12 — Troubleshooting](12-troubleshooting.md)
