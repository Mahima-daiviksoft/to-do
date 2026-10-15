# Chapter 10 — Testing, Debugging and Monitoring

> **Goal:** be able to prove your real-time code works (unit, integration, end-to-end and
> load tests), find out why it doesn't (debug logs, DevTools, Admin UI), and know what's
> happening in production (metrics, logs, traces, alerts).

---

## 10.1 ELI5

- **Testing** = practising the pizza phone call with a pretend customer before opening
  the shop.
- **Debugging** = recording the phone calls to find out where the order got mixed up.
- **Monitoring** = a big screen in the shop showing how many phones are ringing, how many
  calls dropped, and how long customers wait.

---

## 10.2 Unit testing handlers (no network)

Keep business logic in plain functions/services, and make handlers thin. Then unit-test
handlers with fake sockets:

```js
// handlers/chat.js
exports.makeSendMessage = ({ messages, io }) => async (socket, payload, ack) => {
  if (!payload?.text) return ack({ ok: false, error: { code: "VALIDATION" } });
  const msg = await messages.create(socket.data.user.id, payload);
  io.to(`conversation:${payload.conversationId}`).emit("message:new", msg);
  ack({ ok: true, data: { id: msg.id } });
};

// handlers/chat.test.js (jest/vitest style)
test("sends and broadcasts", async () => {
  const emit = vi.fn();
  const io = { to: vi.fn(() => ({ emit })) };
  const messages = { create: vi.fn(async () => ({ id: "m1" })) };
  const ack = vi.fn();
  const socket = { data: { user: { id: "u1" } } };

  await makeSendMessage({ messages, io })(socket, { conversationId: "c1", text: "hi" }, ack);

  expect(io.to).toHaveBeenCalledWith("conversation:c1");
  expect(emit).toHaveBeenCalledWith("message:new", { id: "m1" });
  expect(ack).toHaveBeenCalledWith({ ok: true, data: { id: "m1" } });
});
```

There are also community mocking libraries (e.g. `socket.io-mock`), but fake objects
as above are usually enough.

---

## 10.3 Integration testing with a real server and real clients

Spin up a real server on a **random port** (`listen(0)`), connect real clients, assert
on events. The test below was **run and passes** on socket.io 4.8.4 with Node's built-in
test runner (`node --test`); the same structure works in Jest, Vitest, Mocha.

```js
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { createServer } = require("node:http");
const { Server } = require("socket.io");
const { io: ioc } = require("socket.io-client");

function waitFor(socket, event) {
  return new Promise((resolve) => socket.once(event, resolve));
}

let io, serverSocket, clientSocket, port;

before(async () => {
  const httpServer = createServer();
  io = new Server(httpServer);
  io.use((socket, next) => {
    if (socket.handshake.auth.token === "good") { socket.data.user = { id: "u1" }; return next(); }
    const err = new Error("unauthorized"); err.data = { code: "AUTH" }; next(err);
  });
  await new Promise((resolve) => httpServer.listen(0, resolve));   // random free port
  port = httpServer.address().port;
  io.on("connection", (socket) => {
    serverSocket = socket;
    socket.on("sum", (a, b, ack) => ack(a + b));
    socket.on("join", (room, ack) => { socket.join(room); ack(); });
  });
  clientSocket = ioc(`http://localhost:${port}`, { auth: { token: "good" }, transports: ["websocket"] });
  await waitFor(clientSocket, "connect");
});

after(() => { io.close(); clientSocket.disconnect(); });   // ALWAYS clean up, or the runner hangs

test("server -> client event", async () => {
  const p = waitFor(clientSocket, "hello");   // start listening BEFORE triggering
  serverSocket.emit("hello", "world");
  assert.equal(await p, "world");
});

test("client -> server with ack", async () => {
  const result = await clientSocket.timeout(1000).emitWithAck("sum", 2, 3);
  assert.equal(result, 5);
});

test("server -> client with ack", async () => {
  clientSocket.once("question", (cb) => cb(42));
  const answer = await serverSocket.timeout(1000).emitWithAck("question");
  assert.equal(answer, 42);
});

test("rejects bad token", async () => {
  const bad = ioc(`http://localhost:${port}`, { auth: { token: "bad" }, transports: ["websocket"] });
  const err = await waitFor(bad, "connect_error");
  assert.equal(err.message, "unauthorized");
  assert.deepEqual(err.data, { code: "AUTH" });
  assert.equal(bad.active, false);           // middleware rejection → no auto-reconnect
  bad.disconnect();
});

test("room broadcast excludes sender", async () => {
  const other = ioc(`http://localhost:${port}`, { auth: { token: "good" }, transports: ["websocket"] });
  await waitFor(other, "connect");
  await clientSocket.emitWithAck("join", "r1");
  await other.emitWithAck("join", "r1");
  let selfGot = false;
  clientSocket.once("news", () => (selfGot = true));
  const p = waitFor(other, "news");
  io.of("/").sockets.get(clientSocket.id).to("r1").emit("news", "x"); // the SENDER's server-side socket
  assert.equal(await p, "x");
  await new Promise((r) => setTimeout(r, 50));
  assert.equal(selfGot, false);
  other.disconnect();
});
```

> **A real lesson from writing this test:** the first version used the global
> `serverSocket` for the room test — but `serverSocket` had been **overwritten** when the
> second client connected, so it pointed to the *other* client's socket, and
> `socket.to("r1")` excluded the very client that was supposed to receive the event.
> The test hung forever. Moral: in tests (and in production code!), never keep "the
> current socket" in a shared variable; look sockets up by id (`io.of("/").sockets.get(id)`)
> or keep per-connection state inside the `connection` closure.

### Integration testing tips

- `transports: ["websocket"]` in tests makes them faster and deterministic (no upgrade).
  Also test polling at least once if your users rely on it.
- Register the listener **before** triggering the action (race conditions otherwise).
- Use **timeouts** on acks in tests, so failures fail fast instead of hanging.
- Always `disconnect()` clients and `io.close()` the server in `after`/`afterAll`;
  otherwise Jest says "did not exit one second after the test run" / runners hang.
- Use `forceNew: true` when a test needs several independent clients to the same URL and
  namespace — or simply call `ioc()` again (a second `io()` to the same namespace creates a
  new Manager anyway — see Chapter 4).
- Testing **multi-node behaviour**: start 2 servers in the test with the Redis adapter
  (Redis via Docker/Testcontainers), connect clients to different ports, assert that a
  broadcast on server A reaches a client on server B.
- Testing **reconnection**: `io.close()` or `serverSocket.disconnect(true)` (note: a
  server-side `disconnect()` gives `io server disconnect` → no auto-reconnect; to simulate
  network loss use `serverSocket.conn.close()` → client sees `transport close` and
  reconnects).
- Testing **timeouts**: use fake timers carefully — Socket.IO uses real timers internally
  for heartbeats; prefer small real timeouts in tests.

---

## 10.4 End-to-end tests (browser)

Use Playwright/Cypress against the real app:

- Open **two browser contexts** (two users) and assert that a message sent in one
  appears in the other.
- Use `page.waitForEvent("websocket")` (Playwright) to inspect frames, or assert on UI.
- Simulate offline: `context.setOffline(true)` → assert "reconnecting…" UI → back online →
  assert recovery/sync.

```js
// Playwright sketch
const alice = await browser.newContext(); const bob = await browser.newContext();
const pa = await alice.newPage(); const pb = await bob.newPage();
await Promise.all([pa.goto(url + "/chat/c1"), pb.goto(url + "/chat/c1")]);
await pa.fill("#input", "hello bob"); await pa.press("#input", "Enter");
await expect(pb.locator(".message").last()).toHaveText(/hello bob/);
```

---

## 10.5 Load testing

What to measure: **max concurrent connections**, **connection rate** (handshakes/s),
**message throughput** (in and out, especially broadcast fan-out), **latency
percentiles** (p50/p95/p99 of ack round-trip or emit→receive), **memory per
connection**, **CPU**, **event loop lag**, **Redis throughput**, **reconnection storm
behaviour** (kill a node and watch).

Tools:

- **Artillery** — has a built-in Socket.IO engine (`engine: socketio`), scenario files
  with `emit`, acks, think times. Very common in interviews and companies.
  ```yaml
  config:
    target: "https://rt.staging.example.com"
    phases: [{ duration: 300, arrivalRate: 50 }]   # 50 new virtual users per second for 5 min
    engines: { socketio: {} }
    socketio: { transports: ["websocket"] }
  scenarios:
    - engine: socketio
      flow:
        - emit: { channel: "conversation:join", data: { conversationId: "load-1" } }
        - loop:
            - emit: { channel: "message:send", data: { conversationId: "load-1", text: "hi" } }
            - think: 5
          count: 20
  ```
- **Custom Node scripts** with `socket.io-client` (spawn N clients across several machines;
  a single Node process can simulate several thousand clients).
- **k6** speaks raw WebSocket; it doesn't implement the Socket.IO protocol natively
  (you'd have to hand-encode `40`, `42[...]`, answer pings with `3`) — prefer Artillery or
  custom scripts.

Load-testing pitfalls: the **load generator** becomes the bottleneck (CPU, ephemeral
ports, file descriptors), so distribute it; test through the **real load balancer**;
include realistic **idle** connections (most real connections are idle); test the
**polling** path too if you allow it (much more expensive server-side).

---

## 10.6 Debugging

### Debug logs (the `debug` module)

Socket.IO, Engine.IO and the client use the [`debug`](https://www.npmjs.com/package/debug)
package — logs are off by default.

Server (Node):

```bash
DEBUG=socket.io* node server.js                 # Socket.IO layer (server, namespace, socket, parser, adapter)
DEBUG=engine,socket.io* node server.js          # + Engine.IO server
DEBUG=* node server.js                          # everything (very noisy)
```

Node client:

```bash
DEBUG=socket.io-client:*,engine.io-client:* node client.js
```

Browser client:

```js
localStorage.debug = "socket.io-client:*";  // then reload the page
localStorage.debug = "*";                   // everything
```

Typical log lines: `socket.io:socket emitting packet with ack id 1`,
`engine:socket transport is now writable`, `engine upgrade completed`.

> Note: the minified browser bundle (`socket.io.min.js`) strips debug logs; use the
> non-minified build or an npm-bundled dev build to see them.

### Browser DevTools

1. **Network tab**, filter `socket.io`:
   - Handshake: `GET …?EIO=4&transport=polling` → response `0{"sid":…}`. If it's
     HTML/404/CORS error → path/URL/proxy/CORS problem.
   - WebSocket: `…transport=websocket` → status **101**. Click it → **Messages** tab shows
     every frame (`2`, `3`, `40`, `42[…]`).
   - Repeated polling requests and no 101 → WebSocket upgrade failing (proxy headers).
   - `400` with `{"code":1,"message":"Session ID unknown"}` → sticky sessions missing.
2. **Console**: CORS errors, `WebSocket connection to … failed`, mixed content
   (`ws://` from an `https://` page is blocked — use `wss://`).

### Logging every event (temporary, dev/staging)

```js
io.on("connection", (socket) => {
  socket.onAny((event, ...args) => logger.debug({ sid: socket.id, event, args }, "in"));
  socket.onAnyOutgoing((event, ...args) => logger.debug({ sid: socket.id, event }, "out"));
});

// client
socket.onAny((event, ...args) => console.debug("⬇", event, args));
socket.onAnyOutgoing((event, ...args) => console.debug("⬆", event, args));
```

Don't log full payloads in production (PII, volume).

### Engine-level errors on the server

```js
io.engine.on("connection_error", (err) => {
  logger.warn({ code: err.code, message: err.message, context: err.context, url: err.req?.url }, "engine connection error");
});
```

The error code tells you the cause (0 Transport unknown, 1 Session ID unknown → sticky
sessions, 3 Bad request, 4 Forbidden → `allowRequest`, 5 protocol mismatch).

### A systematic debugging procedure (use in incidents)

1. **Can the client reach the server?** `curl https://host/socket.io/?EIO=4&transport=polling`
   → expect `0{…}`.
2. **Is it CORS?** browser console; check `cors.origin` exactly matches (scheme + host +
   port, no trailing slash).
3. **Is the path right?** client `path` == server `path`; URL path is the namespace.
4. **Versions compatible?** v2 client vs v4 server → `allowEIO3` or upgrade.
5. **Does middleware reject?** `connect_error` message/data; server logs.
6. **Does WebSocket upgrade?** DevTools 101; proxy `Upgrade` headers.
7. **Multi-node?** `Session ID unknown` → sticky sessions; events not reaching other
   node's clients → adapter misconfigured / different Redis `key`.
8. **Disconnect reason?** log `disconnect` reasons on both sides (`ping timeout` →
   event-loop blocking or network; `transport close` every N seconds → proxy idle timeout).
9. **Turn on DEBUG** on both sides and reproduce.

---

## 10.7 Admin UI (`@socket.io/admin-ui`)

A dashboard showing servers, connected sockets (with handshake details, rooms, data),
rooms, events, and lets you join/leave/disconnect sockets.

```js
const { instrument } = require("@socket.io/admin-ui");

const io = new Server(httpServer, {
  cors: { origin: ["https://admin.socket.io"], credentials: true },
});

instrument(io, {
  auth: {
    type: "basic",
    username: "admin",
    password: process.env.ADMIN_UI_BCRYPT_HASH,   // bcrypt hash ($2b$…; $2y$ not supported by bcrypt pkg)
  },
  mode: process.env.NODE_ENV === "production" ? "production" : "development", // production = less detail, less memory
  readonly: true,                                     // forbid join/leave/disconnect from the UI
  namespaceName: "/admin",                            // default; creates a namespace for the UI
  // serverId: `${os.hostname()}#${process.pid}`,     // distinct ids if several servers per machine
  // store: new RedisStore(redisClient),              // for basic auth across multiple servers
});
```

Then open https://admin.socket.io (a static site; it connects from your browser to your
server) or self-host the UI files from the package's `ui/dist` folder. `auth` is
**mandatory** (`auth: false` explicitly disables authentication — only in local dev).
Works with v4 servers and in clusters (with an adapter). Security: it creates an
`/admin` namespace on your server — protect it, consider disabling it in production, or
expose it only on an internal network.

---

## 10.8 Monitoring in production

### Key metrics (put these on a dashboard)

| Metric | How to get it | Why |
|---|---|---|
| Connected clients (Engine.IO) | `io.engine.clientsCount` | Capacity; sudden drops = incident |
| Sockets per namespace | `io.of("/x").sockets.size` (local) | Feature usage |
| Connections/disconnections per second | counters in `connection`/`disconnect` | Reconnection storms |
| **Disconnect reasons** | counter labelled by `reason` | `ping timeout` spikes → event loop/network; `transport close` periodic → proxy timeouts |
| `connect_error` rate & messages | client telemetry; server middleware rejections | Auth problems, outages |
| Transport distribution | `socket.conn.transport.name`, `socket.conn.on("upgrade")` | % stuck on polling (proxy issues, cost) |
| Events in/out per second (by name) | `socket.onAny`/`onAnyOutgoing` counters | Traffic shape, abuse |
| Ack latency (p50/p95/p99) | measure time from receive to ack, and client-side emit→ack | User-perceived latency |
| Event loop lag | `perf_hooks.monitorEventLoopDelay()` | Root cause of ping timeouts and latency |
| Heap/RSS memory | `process.memoryUsage()` | Leaks (listeners, rooms, pending acks) |
| Redis adapter health | Redis latency, pub/sub channels, client output buffers | Cross-node delivery |
| Handler errors | counter in your `safe()` wrapper | Bugs |

### Prometheus example (`prom-client`)

```js
const client = require("prom-client");

const connected = new client.Gauge({ name: "socketio_connected_clients", help: "Connected Engine.IO clients" });
const disconnects = new client.Counter({ name: "socketio_disconnects_total", help: "Disconnects", labelNames: ["reason"] });
const eventsIn = new client.Counter({ name: "socketio_events_in_total", help: "Incoming events", labelNames: ["event"] });
const handlerDuration = new client.Histogram({
  name: "socketio_handler_duration_seconds", help: "Handler duration", labelNames: ["event"],
  buckets: [0.005, 0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5],
});

setInterval(() => connected.set(io.engine.clientsCount), 5000).unref();

io.on("connection", (socket) => {
  socket.on("disconnect", (reason) => disconnects.inc({ reason }));
  socket.onAny((event) => eventsIn.inc({ event }));   // event names must be a FIXED set (label cardinality!)
});

app.get("/metrics", async (_req, res) => {
  res.set("Content-Type", client.register.contentType);
  res.end(await client.register.metrics());
});
```

> Label **cardinality**: never use socket ids, user ids or dynamic event names as metric
> labels — it explodes your time-series database. This is another reason event names
> must be static.

### Tracing

OpenTelemetry has a Socket.IO instrumentation
(`@opentelemetry/instrumentation-socket.io`) that creates spans for emits and received
events. Propagate a **correlation id** in payloads (or in the ack envelope) to connect
HTTP requests, queue messages and socket events in logs.

### Structured logging

Log with context on every line: `socketId`, `userId`, `namespace`, `event`, `transport`,
`ip` (careful with PII), `nodeId`/hostname. Log connection lifecycle at info level,
events at debug level.

### Client-side telemetry

Send to your analytics/RUM: time to connect, `connect_error` messages, reconnect counts,
time spent disconnected, transport used, ack latency. Many real outages (corporate proxy
blocking WebSocket, a CDN misconfiguration) are only visible from the client side.

### Alerts (examples)

- Connected clients drop > 30% in 5 min.
- `ping timeout` disconnect rate > baseline × 3.
- Event loop lag p99 > 200 ms for 5 min.
- Handler error rate > 1%.
- Redis adapter errors / reconnects.
- `connect_error` rate from clients > X%.

---

## 10.9 Chapter summary

- Unit-test thin handlers with fakes; integration-test with a real server on port 0 and
  real clients; always clean up; register listeners before triggering.
- E2E with two browser contexts; load test with Artillery/custom clients through the real LB.
- Debug with `DEBUG=…`, `localStorage.debug`, DevTools Network/Messages, `onAny`, engine
  `connection_error` codes, and a systematic checklist.
- Admin UI for live inspection (protect it).
- Monitor connections, disconnect reasons, transports, event rates, ack latency, event
  loop lag, memory, Redis; keep metric labels low-cardinality.

Next: [Chapter 11 — Performance and production](11-performance-production.md)
