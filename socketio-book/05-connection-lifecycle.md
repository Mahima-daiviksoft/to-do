# Chapter 5 — Connection Lifecycle: Connect, Disconnect, Reconnect, Heartbeats, Recovery and Delivery Guarantees

> **Goal:** know exactly what happens from the first byte to the last, every event fired on
> both sides, every disconnect reason, how reconnection works, how dead connections are
> detected, what happens to messages sent while offline, and how to get stronger delivery
> guarantees. This chapter is where senior interviews are won or lost.

---

## 5.1 ELI5

- **Connecting** is like dialling a friend: first you say "hello, it's me" (handshake),
  your friend may check who you are (middleware), then says "come in" (`connect`).
- **Heartbeat**: every 25 seconds your friend asks "still there?" (ping) and you answer
  "yes!" (pong). If you don't answer in 20 seconds, your friend hangs up.
- **Disconnect**: the call ends — because someone hung up on purpose, or the line broke.
- **Reconnect**: if the line broke by accident, your phone redials automatically, waiting
  a bit longer each time (1 s, 2 s, 4 s… up to 5 s, with a bit of randomness so a
  thousand phones don't all redial at the exact same moment).
- **Buffering**: things you said while the line was dead are written on a notepad and
  said again when the line comes back.
- **Connection state recovery**: if you were away only a short time, your friend
  remembers what group chats you were in and tells you what you missed.

---

## 5.2 Server-side lifecycle events

```js
// Engine.IO level (low-level connection, before any namespace)
io.engine.on("initial_headers", (headers, req) => { /* modify handshake response headers */ });
io.engine.on("headers", (headers, req) => { /* modify headers of every HTTP response */ });
io.engine.on("connection", (rawSocket) => { /* Engine.IO socket established */ });
io.engine.on("connection_error", (err) => {
  console.log(err.req);      // the request object
  console.log(err.code);     // the error code, e.g. 1
  console.log(err.message);  // the error message, e.g. "Session ID unknown"
  console.log(err.context);  // extra context
});

// Socket.IO level (per namespace)
io.use((socket, next) => { /* middleware: runs before "connection" */ next(); });

io.on("connection", (socket) => {
  socket.on("disconnecting", (reason, description) => { /* still in rooms */ });
  socket.on("disconnect", (reason, description) => { /* rooms already left */ });
  socket.on("error", (err) => { /* errors from socket.use() middleware */ });
});
```

`io.on("connect")` is an alias of `io.on("connection")`.

### Engine.IO `connection_error` codes (know these for debugging)

| Code | Message | Typical cause |
|---|---|---|
| 0 | `Transport unknown` | Client asked for a transport not enabled on the server (e.g. server `transports: ["websocket"]`, client polling) |
| 1 | `Session ID unknown` | The `sid` isn't known by **this** server → **missing sticky sessions** in a multi-server setup, or the server restarted |
| 2 | `Bad handshake method` | Handshake not done with GET |
| 3 | `Bad request` | Malformed request (e.g. invalid `Origin` header, bad query) |
| 4 | `Forbidden` | Rejected by `allowRequest` |
| 5 | `Unsupported protocol version` | v2 client (`EIO=3`) on a v3/v4 server without `allowEIO3: true` |

### Server-side disconnect reasons (memorise)

| Reason | Meaning | Side that initiated |
|---|---|---|
| `server namespace disconnect` | You called `socket.disconnect()` on the server | Server |
| `client namespace disconnect` | The client called `socket.disconnect()` | Client |
| `server shutting down` | The server is closing (`io.close()`) | Server |
| `ping timeout` | Client didn't answer a PING within `pingTimeout` | Network / client |
| `transport close` | The connection was closed (user closed tab, lost network, proxy cut it) | Network / client |
| `transport error` | The connection encountered an error | Network |
| `parse error` | Server received an invalid packet | Client bug / attack |
| `forced close` | The low-level Engine.IO connection was closed by the server (e.g. `socket.conn.close()`) | Server |
| `forced server close` | The server closed the whole underlying connection — e.g. `socket.disconnect(true)` on one namespace closes the connection, and the client's sockets in *other* namespaces get this reason | Server |

The second argument `description` (when available) gives low-level details (e.g. the
underlying error/close code).

> Interview note: `socket.disconnect(true)` on the server closes the **underlying
> connection** (all namespaces of that client); `socket.disconnect()` (or `false`) only
> leaves **that namespace**.

---

## 5.3 Client-side lifecycle events

```js
const socket = io(URL);

// --- Socket events (per namespace) ---
socket.on("connect", () => {
  console.log(socket.id, socket.connected, socket.recovered);
});

socket.on("connect_error", (err) => {
  // fired when: low-level connection can't be established, OR middleware rejected (next(err))
  console.log(err.message);   // e.g. "xhr poll error", "websocket error", "timeout", or your middleware message
  console.log(err.data);      // extra data from server middleware (err.data = {...})
  console.log(socket.active); // true → will retry automatically; false → you must call socket.connect()
});

socket.on("disconnect", (reason, details) => {
  console.log(reason);        // see table below
  console.log(socket.active); // true if automatic reconnection will happen
});

// --- Manager events (the connection; one per multiplexed connection) ---
socket.io.on("open", () => {});                        // Engine.IO connection opened
socket.io.on("error", (err) => {});                    // connection error
socket.io.on("ping", () => {});                        // a PING was received from the server
socket.io.on("packet", (packet) => {});                // any packet
socket.io.on("close", (reason, description) => {});    // underlying connection closed
socket.io.on("reconnect_attempt", (attempt) => {});    // before each attempt
socket.io.on("reconnect_error", (err) => {});          // an attempt failed
socket.io.on("reconnect", (attempt) => {});            // success after `attempt` tries
socket.io.on("reconnect_failed", () => {});            // gave up (reconnectionAttempts reached)

// --- Engine.IO level (transport) ---
socket.io.engine.on("upgrade", (transport) => console.log("upgraded to", transport.name));
socket.io.engine.transport.name; // "polling" | "websocket" | "webtransport"
```

> **v2 → v3 trap:** in v2 you wrote `socket.on("reconnect", …)`. Since v3 the reconnection
> events are on the **Manager** (`socket.io.on("reconnect", …)`). Writing
> `socket.on("reconnect")` in v3/v4 silently does nothing — a very common bug when
> migrating.

### Client-side disconnect reasons

| Reason | Meaning | Auto-reconnect? |
|---|---|---|
| `io server disconnect` | Server called `socket.disconnect()` | **No** — call `socket.connect()` yourself if appropriate |
| `io client disconnect` | You called `socket.disconnect()` on the client | **No** |
| `ping timeout` | No PING from server within `pingInterval + pingTimeout` | Yes |
| `transport close` | Connection closed (user lost network, server restarted, proxy timeout) | Yes |
| `transport error` | Connection error (e.g. server killed during a polling cycle) | Yes |
| `parse error` | Client received an invalid packet | Yes |

```js
socket.on("disconnect", (reason) => {
  if (reason === "io server disconnect") {
    // the server kicked us (e.g. session expired, banned).
    // Decide: refresh the token and reconnect, or show a "you've been logged out" UI.
  }
  // otherwise the client will try to reconnect automatically
});
```

### Client socket properties

| Property | Meaning |
|---|---|
| `socket.id` | Socket id, `undefined` until connected; new value on each reconnection (unless recovered) |
| `socket.connected` / `socket.disconnected` | Current state |
| `socket.active` | `true` if the socket is connected **or will try to reconnect**. `false` after `disconnect()` or a server-side disconnect/middleware rejection |
| `socket.recovered` | `true` if connection state recovery succeeded on the last connect (v4.6+) |
| `socket.io` | The Manager |
| `socket.auth` | The auth payload (can be updated before reconnecting) |
| `socket.sendBuffer` | Packets emitted while disconnected, waiting to be sent |
| `socket.receiveBuffer` | Packets received before the `connect` was processed |

### Client methods

```js
socket.connect();     // (alias: socket.open()) — connect manually (autoConnect: false, or after a server disconnect)
socket.disconnect();  // (alias: socket.close()) — disconnect; no auto-reconnection
socket.io.reconnection(false); // turn off automatic reconnection on the fly
socket.io.opts.query = { ... }; // change query for the NEXT connection attempt (engine-level)
socket.auth = { token: newToken }; // change auth for the NEXT CONNECT packet
```

---

## 5.4 The complete connection sequence (step by step with real packets)

These packets were captured from a real Socket.IO 4.8.4 server using the polling
transport:

```
1) GET /socket.io/?EIO=4&transport=polling
   ← 0{"sid":"HSJR3YuCOE9jPqHEAAAA","upgrades":["websocket"],"pingInterval":25000,"pingTimeout":20000,"maxPayload":1000000}
      ^ Engine.IO OPEN packet (type 0) with session id, possible upgrades, heartbeat settings, max payload

2) POST /socket.io/?EIO=4&transport=polling&sid=HSJR3YuCOE9jPqHEAAAA
   body: 40
      ^ Engine.IO MESSAGE (4) containing Socket.IO CONNECT (0) to namespace "/"
   ← ok

3) GET /socket.io/?EIO=4&transport=polling&sid=HSJR3YuCOE9jPqHEAAAA
   ← 40{"sid":"KykvYCRwmIsIifIyAAAA"}
      ^ Socket.IO CONNECT reply with the Socket.IO socket id (different from the Engine.IO sid)

4) POST … body: 421["hello","world"]
      ^ MESSAGE(4) + EVENT(2) + ack id 1 + ["event", ...args]

5) GET …
   ← 431[{"ok":true}]
      ^ MESSAGE(4) + ACK(3) + ack id 1 + [response args]
```

Then, typically within milliseconds, the **upgrade** to WebSocket:

```
6) GET /socket.io/?EIO=4&transport=websocket&sid=HSJR3YuCOE9jPqHEAAAA   (Upgrade: websocket)
   → 2probe            (client sends PING with "probe" over the new WebSocket)
   ← 3probe            (server answers PONG "probe")
   (client pauses polling: waits for in-flight polling requests to finish)
   → 5                 (client sends UPGRADE packet over the WebSocket)
   (server closes the polling transport with a NOOP (6) to the pending GET if needed)
   — from now on everything flows over the WebSocket —
   ← 2                 (server PING every pingInterval)
   → 3                 (client PONG)
```

If the WebSocket fails (blocked by proxy/firewall), the client just stays on polling;
the user doesn't notice except for higher latency/overhead.

### Why start with polling and then upgrade? (classic question)

1. **Reliability first:** polling works nearly everywhere. Some proxies/antivirus
   accept the WebSocket handshake but then never deliver data — if the client went
   WebSocket-only, the user would wait for a timeout (could be many seconds) before
   falling back. Starting with polling gives an immediately working connection.
2. **Then optimise:** upgrade to WebSocket in the background for lower latency/overhead.

Trade-offs of the default:

- More HTTP requests at start; **requires sticky sessions** when you have multiple servers
  (the polling requests and the WebSocket upgrade must hit the same server).
- You can skip polling with `transports: ["websocket"]` on the client → no sticky sessions
  needed and faster connection — but **no fallback** if WebSocket is blocked. Many
  companies do this for internal/mobile apps where the network is known. A middle ground:
  `transports: ["websocket", "polling"]` (try WebSocket first) and on `connect_error`
  revert to `["polling", "websocket"]`:

```js
const socket = io({ transports: ["websocket", "polling"] });
socket.on("connect_error", () => {
  // revert to classic upgrade
  socket.io.opts.transports = ["polling", "websocket"];
});
```

(With 4.8+, the client option `tryAllTransports: true` makes the client try the next
transport in the list if the first one fails, instead of giving up.)

---

## 5.5 Heartbeat (ping/pong) mechanism in depth

### Why we need heartbeats

TCP itself might not notice a dead peer for a very long time: if a phone goes into a
tunnel, or a laptop sleeps, or a NAT/proxy silently drops the mapping, no FIN/RST packet
is ever sent. The server would keep a "zombie" socket forever (memory leak, wrong
presence status: "Alice is online" when she isn't). Proxies and load balancers also cut
**idle** connections (e.g. AWS ALB default idle timeout 60 s, nginx
`proxy_read_timeout` default 60 s) — regular traffic keeps them alive.

### How it works in Socket.IO v3/v4 (Engine.IO v4)

```
server ──PING(2)──▶ client           every pingInterval (default 25 000 ms)
server ◀──PONG(3)── client           client must reply within pingTimeout (default 20 000 ms)
```

- **Server side:** after sending a PING, if no PONG arrives within `pingTimeout`, the
  server closes the connection with reason **`ping timeout`**.
- **Client side:** the client expects a PING at least every `pingInterval + pingTimeout`
  (45 s by default). If nothing arrives in that window, it closes with **`ping timeout`**
  and starts reconnecting.
- Since 4.8 the client also tracks the **expiration timestamp** of that timer, because
  timers may be throttled/frozen (laptop suspended, phone locked); when the app wakes up
  and tries to emit, it detects the expired heartbeat instead of writing into a dead
  connection (the packet is buffered and sent after reconnection).
- The values are sent to the client in the handshake (`pingInterval`, `pingTimeout`), so
  you configure them **on the server only**.

**Worst-case detection time** of a dead client on the server ≈ `pingInterval +
pingTimeout` = 45 s by default.

### Tuning

```js
const io = new Server(httpServer, {
  pingInterval: 10000, // ping every 10 s
  pingTimeout: 5000,   // 5 s to answer
});
```

- **Lower values** → faster dead-connection detection, more traffic (tiny packets though),
  more false positives on slow mobile networks or with busy event loops.
- **Higher values** → fewer packets, slower detection.
- Keep `pingInterval` **below the idle timeout of every proxy/load balancer** in the path
  (ALB, nginx, Cloudflare (100 s), corporate proxies), otherwise idle connections get cut
  → `transport close` loops every N seconds. Classic bug: "clients disconnect exactly
  every 60 seconds" = proxy idle timeout < heartbeat interval or nginx `proxy_read_timeout`.
- **Event loop blocking:** if your Node.js process blocks the event loop for longer than
  `pingTimeout` (heavy sync computation, huge JSON.parse, sync crypto), it can't process
  PONGs/send PINGs on time → mass `ping timeout` disconnects. Monitor event loop lag.
- **Browser background tabs:** browsers throttle timers in background tabs (≥1 s, or
  even 1 min for intensive throttling in Chrome after 5 min hidden). Because the **server**
  sends pings (v3+), the client only needs to *respond*, which works fine even when
  throttled (receiving a message isn't throttled the same way). This was the main reason
  for reversing the heartbeat direction in v3/Engine.IO v4.

---

## 5.6 Automatic reconnection in depth

### The algorithm (exponential back-off with jitter)

Client options (with defaults, verified in source):

```js
io(URL, {
  reconnection: true,            // enable auto-reconnection
  reconnectionAttempts: Infinity,// max attempts before "reconnect_failed"
  reconnectionDelay: 1000,       // initial delay (ms)
  reconnectionDelayMax: 5000,    // max delay (ms)
  randomizationFactor: 0.5,      // jitter factor (0 ≤ x ≤ 1)
  timeout: 20000,                // each connection attempt's timeout
});
```

Delay for attempt *n* (0-based) is computed roughly as:

```
base   = reconnectionDelay * 2^n             // 1000, 2000, 4000, 8000, …
jitter = random * randomizationFactor * base // up to ±50%
delay  = base ± jitter, capped at reconnectionDelayMax
```

So with defaults: ~1 s (0.5–1.5 s), ~2 s (1–3 s), ~4 s (2–5 s), then 5 s max for every
next attempt (the cap applies after jitter).

**Why jitter?** If a server restarts with 50 000 connected clients and they all reconnect
after exactly 1 s, 2 s, 4 s… the server gets 50 000 simultaneous handshakes in waves —
the **thundering herd**, which can crash the server again (and again). Randomization
spreads reconnections over time. For very large deployments you may *increase*
`reconnectionDelayMax` (e.g. 10–30 s) and keep the randomization.

### What triggers / doesn't trigger reconnection

- **Triggers:** `ping timeout`, `transport close`, `transport error`, `parse error`, and
  failure of the initial low-level connection (server down → `connect_error` and retry).
- **Does NOT trigger:**
  - client called `socket.disconnect()` → `"io client disconnect"`;
  - server called `socket.disconnect()` → `"io server disconnect"`;
  - **middleware rejection** (`next(new Error(...))` in `io.use`) → `connect_error` with
    `socket.active === false` — the client will **not** retry automatically, because
    retrying with the same credentials would fail again. You fix the cause (e.g. refresh
    token) and call `socket.connect()`.

```js
socket.on("connect_error", async (err) => {
  if (socket.active) {
    // temporary failure, the socket will automatically try to reconnect
  } else {
    // the connection was denied by the server (middleware)
    if (err.message === "TOKEN_EXPIRED") {
      socket.auth.token = await refreshToken();
      socket.connect();
    } else {
      showLoginScreen();
    }
  }
});
```

### State that is lost on reconnection (unless recovered)

On the **server**, a reconnection creates a **brand-new `Socket` object** with a new id:

- rooms are **empty** (only its own id-room),
- `socket.data` is empty (middleware runs again and must set it),
- event listeners are registered again in `io.on("connection")`.

Therefore: **derive all state from the authenticated user in the connection handler**
(e.g. re-join `user:<id>` and the user's conversation rooms from the DB), and/or let the
client tell the server what it wants to re-subscribe to on each `connect`:

```js
// client
socket.on("connect", () => {
  // re-subscribe after every (re)connection
  socket.emit("subscribe", { rooms: [...currentSubscriptions] });
});
```

On the **client**, the same `Socket` object is reused and **your listeners stay
registered** — which leads to the next famous bug.

### Famous bug: registering listeners inside `connect`

```js
// ❌ every reconnection adds ANOTHER "chat" listener → messages appear 2x, 3x, 4x…
socket.on("connect", () => {
  socket.on("chat", renderMessage);
});

// ✅ register once, outside
socket.on("chat", renderMessage);
socket.on("connect", () => { /* only connection-related logic */ });
```

(Same bug happens in React components that call `socket.on()` in `useEffect` without a
cleanup `socket.off()` — Chapter 9.)

---

## 5.7 Client buffering (offline emits) and its dangers

By default, when the client is **disconnected**, `socket.emit()` doesn't fail — the
packet is pushed into **`socket.sendBuffer`**, and all buffered packets are sent **when the
connection is (re)established** (in order).

Good: user sends a chat message during a 2-second network blip → delivered after
reconnection.

Bad: a 10-minute offline period with a "mouse position" emitted 60 times/second → 36 000
stale packets flood the server on reconnection.

Fixes:

```js
// 1. Use volatile for droppable events (not buffered)
socket.volatile.emit("cursor", pos);

// 2. Check connection state
if (socket.connected) socket.emit("cursor", pos);

// 3. Clear the buffer on reconnect if stale data shouldn't be sent
socket.on("connect", () => { socket.sendBuffer = []; });  // drop what was queued while offline
```

> Server-side there is **no** per-socket offline buffer for disconnected clients: once a
> socket is disconnected, the server-side Socket object is gone; emits to it (or to rooms
> it was in) simply don't reach it. (Exception: connection state recovery, below.)

---

## 5.8 Connection State Recovery (v4.6+) — deep dive

### The problem

A client loses its connection for 3 seconds (elevator, Wi-Fi handover). Without recovery:

- it reconnects with a **new id**, **no rooms**, **no `socket.data`**;
- every event broadcast during those 3 s is **lost** for that client.

### The feature

```js
const io = new Server(httpServer, {
  connectionStateRecovery: {
    // how long the server keeps the session (and the packets) after a disconnection
    maxDisconnectionDuration: 2 * 60 * 1000, // default: 2 minutes
    // skip the middlewares upon successful recovery
    skipMiddlewares: true,                    // default: true
  },
});

io.on("connection", (socket) => {
  if (socket.recovered) {
    // recovery was successful: socket.id, socket.rooms and socket.data were restored,
    // and missed packets were (or will be) sent to the client
  } else {
    // new or unrecoverable session → do the normal setup (join rooms, etc.)
  }
});
```

Client:

```js
socket.on("connect", () => {
  if (socket.recovered) {
    // any event missed during the disconnection period has been received
  } else {
    // new or unrecoverable session → re-fetch state via HTTP/acks
  }
});
```

### How it works under the hood (verified in source)

1. When CSR is enabled, the server sends the client a **private session id (`pid`)** in
   the CONNECT reply (alongside `sid`).
2. Every **event packet** sent through the adapter's broadcast (and, with CSR enabled,
   even `socket.emit()` to a single socket is routed through `adapter.broadcast` to the
   socket's own room) gets a unique **offset** appended as an extra last argument. The
   client strips it and remembers the **last offset** it processed.
3. When the socket disconnects for a **recoverable reason** (`transport error`,
   `transport close`, `forced close`, `ping timeout`, `server shutting down`,
   `forced server close`), the adapter **persists the session**: `{ sid, pid, rooms, data }`.
   (A deliberate `disconnect()` by client or server is **not** recoverable.)
4. On reconnection, the client sends `{ pid, offset }` in the CONNECT packet's auth
   payload.
5. The server looks up the session; if found, not expired, and the offset is known, it
   restores `id`, `rooms`, `data`, sets `socket.recovered = true`, and sends every stored
   packet **after** that offset that matches the socket's rooms.

### Limitations (very important for real systems)

- **Packets with acknowledgements are not stored** (a callback can't be serialized), and
  **volatile packets are not stored**.
- The in-memory adapter keeps **all broadcast packets in memory** for
  `maxDisconnectionDuration` → memory cost proportional to broadcast volume. Size it.
- It's a **best-effort** optimisation, not a guarantee: it fails if the server restarted
  (with the in-memory adapter), the duration expired, or the offset is unknown. Your app
  must still handle `socket.recovered === false` (re-sync state from the DB/API).
- **Adapter support** (from each adapter's official feature table): ✅ default
  in-memory adapter, ✅ **Redis Streams** adapter, ✅ **MongoDB** adapter (since 0.3.0).
  ❌ classic **Redis pub/sub adapter** (pub/sub has no storage), ❌ **Postgres** adapter.
  Check your adapter's docs before relying on it.
- With `skipMiddlewares: true`, middleware doesn't re-run on recovery — fine for auth
  if tokens can't be revoked within 2 minutes; set it to `false` if you need re-auth.

---

## 5.9 Delivery guarantees (at-most-once vs at-least-once vs exactly-once)

### Default guarantees

- **Ordering:** guaranteed (per socket connection, both directions).
- **Arrival:** **at-most-once**. A message may be lost if:
  - the connection breaks while the message is in flight,
  - the client is disconnected when the server emits (server→client),
  - the server crashes after receiving but before processing,
  - a volatile packet is dropped.
- **Client→server while disconnected:** buffered and sent on reconnection (but lost if the
  page is closed/reloaded before reconnecting, because the buffer is in memory).

### Getting at-least-once: client → server

1. Use **acks**: the client knows the server got it.
2. Retry on timeout (`retries` + `ackTimeout` options in v4.6+, or manually).
3. Make server handlers **idempotent** (client-generated unique id + unique DB index).
4. Optionally persist pending messages client-side (IndexedDB/localStorage) to survive
   reloads ("outbox pattern").

### Getting at-least-once: server → client

Option A — **connection state recovery** (best-effort, short disconnections).

Option B — **offset/sequence-based sync** (the robust, standard approach):

1. Persist every message in a database with a monotonically increasing id/timestamp per
   conversation (or a global sequence).
2. The client keeps track of the **last id** it processed (per conversation), stored in
   memory/localStorage.
3. On **every (re)connection**, the client asks "give me everything after id X" (via an
   ack or HTTP), then continues receiving live events.
4. De-duplicate on the client by id (an event may arrive both live and via sync).

```js
// server
io.on("connection", async (socket) => {
  socket.on("sync", async ({ conversationId, afterId }, ack) => {
    if (!(await acl.canRead(socket.data.user.id, conversationId))) return ack({ ok: false });
    const missed = await messages.findAfter(conversationId, afterId, { limit: 500 });
    ack({ ok: true, data: missed });
  });
});

// client
let lastId = loadLastId();
socket.on("connect", async () => {
  const res = await socket.timeout(10000).emitWithAck("sync", { conversationId, afterId: lastId });
  res.data.forEach(handleMessage);
});
socket.on("message", handleMessage);

const seen = new Set();
function handleMessage(m) {
  if (seen.has(m.id)) return;     // dedupe
  seen.add(m.id);
  lastId = Math.max(lastId, m.id);
  render(m);
}
```

Option C — **per-message client acks** (the server re-sends unacknowledged messages):
heavier; mostly used for critical notifications.

### Exactly-once?

Over a network, "exactly-once delivery" is impossible in general; what you implement is
**at-least-once delivery + idempotent processing = effectively-once processing**. Say
exactly this in interviews.

---

## 5.10 Timeouts summary (one table to rule them all)

| Setting | Side | Default | What it controls |
|---|---|---|---|
| `pingInterval` | server | 25 000 ms | Time between PINGs |
| `pingTimeout` | server | 20 000 ms | Time to wait for PONG |
| `upgradeTimeout` | server | 10 000 ms | Time to complete polling→WebSocket upgrade |
| `connectTimeout` | server | 45 000 ms | Time for a client to send the CONNECT for a namespace after the Engine.IO handshake (else the raw connection is closed) |
| `maxDisconnectionDuration` | server (CSR) | 120 000 ms | How long a session is kept for recovery |
| `timeout` | client | 20 000 ms | Connection attempt timeout → `connect_error` "timeout" |
| `reconnectionDelay` | client | 1 000 ms | Initial reconnection delay |
| `reconnectionDelayMax` | client | 5 000 ms | Max reconnection delay |
| `randomizationFactor` | client | 0.5 | Jitter |
| `ackTimeout` | client | none | Default ack timeout (used with `retries`) |
| `socket.timeout(ms)` | both | none | Per-emit ack timeout |
| `requestsTimeout` | Redis adapter | 5 000 ms | Timeout for inter-server requests (fetchSockets, etc.) |

---

## 5.11 Handling token expiry / re-authentication on long-lived connections

A WebSocket connection can outlive the access token used to authenticate it (tokens
expire in 15 min; connections last hours). Options:

1. **Validate only at connection time** (most common): when the token expires the
   connection stays authenticated until it drops. Acceptable for many apps.
2. **Server-side expiry timer:** at connection, schedule a disconnect at token expiry:
   ```js
   io.use((socket, next) => { /* verify JWT → socket.data.exp = payload.exp */ next(); });
   io.on("connection", (socket) => {
     const ms = socket.data.exp * 1000 - Date.now();
     const t = setTimeout(() => {
       socket.emit("auth:expired");
       socket.disconnect(true);
     }, ms);
     socket.on("disconnect", () => clearTimeout(t));
   });
   ```
   Client: on `io server disconnect` or `auth:expired`, refresh the token, set
   `socket.auth`, call `socket.connect()`.
3. **In-band refresh:** client sends `auth:refresh` with a new token before expiry; server
   verifies and updates `socket.data.exp` (and resets the timer).
4. **Revocation (logout, ban, password change):** `io.in("user:" + id).disconnectSockets(true)`
   — cluster-wide with an adapter.
5. **Per-event authorization checks** for sensitive operations (check permissions at the
   time of the action, not only at connect).

Use `auth` as a **function** so every reconnection picks up the latest token:

```js
const socket = io(URL, {
  auth: (cb) => cb({ token: localStorage.getItem("accessToken") }),
});
```

---

## 5.12 Page lifecycle (browser specifics)

- **Page reload/close:** the browser closes the connection; the server sees
  `transport close` (it can't distinguish "closed tab" from "lost network" — use a grace
  period for presence, Chapter 13).
- `closeOnBeforeunload` (client option, default **false** in current versions; it was
  `true` in some earlier 4.x releases): when `true`, the client closes the connection
  silently on `beforeunload`, so every browser behaves the same (Firefox closes the
  connection on `beforeunload`, Chrome doesn't) and no `disconnect` event fires at the
  Socket.IO level while the page is unloading. Only matters if your client code reacts to
  `disconnect` during a reload.
- **Mobile background:** iOS/Android suspend apps; the connection dies; reconnect when
  foregrounded. Use **push notifications** (APNs/FCM) for delivery while the app is in
  the background — Socket.IO can't deliver to a suspended app.
- **`navigator.onLine` / `online` event:** you can call `socket.connect()` on the
  browser's `online` event to reconnect faster than waiting for the back-off.
- **Visibility:** pause high-frequency subscriptions when `document.hidden`.

---

## 5.13 Chapter summary

- Server events: `connection`, `disconnecting`, `disconnect`, `error`; Engine
  `connection_error` with codes 0–5 (code 1 = Session ID unknown = sticky session issue).
- Client events: `connect`, `connect_error`, `disconnect`; Manager: `reconnect*`,
  `error`, `ping`, `open`, `close`.
- Disconnect reasons and which ones auto-reconnect (not `io server disconnect`/
  `io client disconnect`, not middleware rejection).
- Heartbeat: server PINGs every 25 s, 20 s to PONG; client times out after 45 s of no PING.
- Reconnection: exponential back-off with jitter (1 s → 5 s max, ±50%).
- Client buffers emits while disconnected (use volatile or clear `sendBuffer`).
- Connection state recovery restores id, rooms, data, missed packets for short
  disconnections — best effort; not for packets with acks or volatile; adapter dependent.
- Default delivery: at-most-once, ordered. At-least-once = acks + retries + idempotency
  (client→server) and persisted messages + offset sync + dedupe (server→client).

Next: [Chapter 6 — Middleware, authentication and security](06-middleware-auth-security.md)
