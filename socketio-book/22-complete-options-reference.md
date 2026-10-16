# Chapter 22 — Complete Options Reference (Server and Client)

> **Goal:** every configuration option of the Socket.IO server and client — not just the
> common ones — with its default, what it does, and when you'd change it.
>
> **Source of truth:** the option lists were extracted from the TypeScript declarations
> shipped in `socket.io` 4.8.4, `engine.io` 6.6.11, `socket.io-client` 4.8.4 and
> `engine.io-client` 6.6.x, and the defaults from the code that applies them. Where the
> declaration comment and runtime behaviour differ, the runtime behaviour is given.

The Socket.IO server's options are the union of three layers:
**Socket.IO options** + **Engine.IO server options** + **Engine.IO attach options**.
The client's options are **Manager options** + **Socket options** + **Engine.IO client
options**. All can be passed in the single options object.

---

## 22.1 Server — Socket.IO layer

| Option | Default | What it does | When to change |
|---|---|---|---|
| `path` | `"/socket.io/"` | HTTP path the server intercepts | Serving under a prefix (`/api/socket.io/`), or several Socket.IO servers on one host. Must match the client's `path` |
| `serveClient` | `true` | Serve `/socket.io/socket.io.js` (and `.map`, `.esm` variants) | Set `false` when you bundle `socket.io-client` (smaller attack surface, no version disclosure) |
| `adapter` | in-memory `Adapter` | Room storage and broadcasting implementation | Multi-server: Redis, Redis Streams, Mongo, Postgres, cluster… (Chapter 8) |
| `parser` | default `socket.io-parser` | Packet encoder/decoder | msgpack or custom parser (Chapter 19) — same on clients |
| `connectTimeout` | `45000` ms | Time for a client to join a namespace after the Engine.IO handshake before the raw connection is closed | Lower to drop half-open connections faster; it's also the delay before a client stuck in a middleware that never calls `next()` is cut |
| `connectionStateRecovery` | disabled | `{ maxDisconnectionDuration: 120000, skipMiddlewares: true }` when enabled — restore id, rooms, data, missed packets | Enable for short-disconnection resilience with a compatible adapter (Chapter 5.8) |
| `cleanupEmptyChildNamespaces` | `false` | Remove dynamic child namespaces once they have no sockets | Enable with dynamic namespaces per tenant/room |

## 22.2 Server — Engine.IO layer

| Option | Default | What it does | When to change |
|---|---|---|---|
| `pingInterval` | `25000` ms | Interval between server PINGs | Faster dead-connection detection (lower) or fewer wakeups (higher); keep below every proxy idle timeout |
| `pingTimeout` | `20000` ms | Time to wait for a PONG before closing (`ping timeout`) | Raise on very slow networks; lower for faster detection |
| `upgradeTimeout` | `10000` ms | Max time to complete a transport upgrade | Rarely |
| `maxHttpBufferSize` | `1e6` (1 MB) | Max size of one message (and polling body); larger → connection closed | Lower (e.g. `1e5`) for small JSON apps (DoS protection); raise deliberately for bigger payloads |
| `allowRequest` | — | `(req, cb) => cb(err, allowed)` called for handshake/upgrade requests | Origin checks (CSWSH), IP rules, early rejection |
| `transports` | `["polling", "websocket"]` | Allowed transports (`"webtransport"` opt-in) | WebSocket-only setups; enable WebTransport |
| `allowUpgrades` | `true` | Allow polling → WebSocket/WebTransport upgrades | Rarely disabled (debugging) |
| `perMessageDeflate` | `false` | WebSocket compression (`true` or `ws` options; threshold defaults to 1024) | Large compressible messages; costs memory/CPU per connection |
| `httpCompression` | `true` (threshold 1024 bytes) | gzip/deflate for polling responses | Disable if a proxy already compresses |
| `wsEngine` | `require("ws").Server` | WebSocket server implementation (must match the `ws` interface) | Alternative engines (e.g. the C++ `eiows` addon mentioned in engine.io's docs) — verify maintenance |
| `initialPacket` | — | Extra packet concatenated to the handshake response | Rare |
| `cookie` | `false` | Set an `io` cookie (`name`, `path`, `httpOnly`, `sameSite`, …; defaults when enabled: `name: "io"`, `path: "/"`, `httpOnly: true`, `sameSite: "lax"`) | Cookie-based sticky sessions at a load balancer |
| `cors` | — (disabled) | Options for the `cors` package, applied to HTTP (polling) requests | Cross-origin browsers. **Doesn't protect WebSocket** (Chapter 6.5) |
| `allowEIO3` | `false` | Accept Socket.IO v2 clients (Engine.IO protocol 3) | During v2 → v4 migrations |

## 22.3 Server — attach layer

| Option | Default | What it does | When to change |
|---|---|---|---|
| `path` | (see above) | Path to capture | — |
| `destroyUpgrade` | `true` | For WebSocket upgrade requests on **other** paths, end the socket if nothing has written a response within `destroyUpgradeTimeout` (engine.io checks `socket.bytesWritten <= 0`) | Set `false` if another upgrade handler on the same HTTP server may take **longer than the timeout** to answer (e.g. it does async authentication before completing the handshake). A second WebSocket server that answers immediately is not affected |
| `destroyUpgradeTimeout` | `1000` ms | Delay before unhandled upgrade requests are ended | Rarely |
| `addTrailingSlash` | `true` | Normalize the path with a trailing slash (`/socket.io/`) | Set `false` (and on the client) if a proxy/router strips trailing slashes and you get 404s |

> **When `destroyUpgrade` bites:** "my other WebSocket endpoint on the same server fails
> to connect, but only when its handshake is slow" → its upgrade handler awaited something
> (DB/auth) for more than 1 s before answering, and engine.io ended the idle socket. Set
> `destroyUpgrade: false` or raise `destroyUpgradeTimeout`. (Behaviour read from
> `engine.io` 6.6.11 `attach()`.)

---

## 22.4 Client — Manager options (the connection)

| Option | Default | What it does |
|---|---|---|
| `forceNew` | `false` | Always create a new Manager (separate connection) |
| `multiplex` | `true` | Reuse the cached Manager for other namespaces on the same URL |
| `path` | `"/socket.io/"` | HTTP path (must match server) |
| `reconnection` | `true` | Automatic reconnection |
| `reconnectionAttempts` | `Infinity` | Max attempts before `reconnect_failed` |
| `reconnectionDelay` | `1000` ms | Initial back-off |
| `reconnectionDelayMax` | `5000` ms | Max back-off (cap applied after jitter) |
| `randomizationFactor` | `0.5` | Jitter (±50%) |
| `timeout` | `20000` ms | Timeout of each connection attempt (`connect_error: timeout`) |
| `autoConnect` | `true` | Connect immediately in `io()`; set `false` to call `socket.connect()` later (e.g. after login, after registering listeners) |
| `parser` | default | Must match the server's parser |

## 22.5 Client — Socket options (per namespace)

| Option | Default | What it does |
|---|---|---|
| `auth` | — | Object or `(cb) => cb({...})` sent in the CONNECT packet → `socket.handshake.auth`. Use the function form to refresh tokens on every attempt |
| `ackTimeout` | — | Default timeout for acks; enables the error-first ack signature |
| `retries` | — | Number of retries for unacknowledged emits (requires acks; packets queued one at a time) |

## 22.6 Client — Engine.IO options (transport level)

| Option | Default | What it does / when to use |
|---|---|---|
| `transports` | `["polling", "websocket", "webtransport"]` | Order of transports. Accepts names or (4.8+) implementations: `[Fetch, WebSocket]` |
| `tryAllTransports` | `false` | (4.8+) If the first transport fails, try the next ones instead of aborting |
| `upgrade` | `true` | Try to upgrade from polling |
| `rememberUpgrade` | `false` | If WebSocket worked before (in this page), start directly with it |
| `query` | — | Extra query parameters on every Engine.IO request (`socket.handshake.query`) |
| `extraHeaders` | — | Extra HTTP headers. **In browsers only applies to polling**; Node applies them to all transports |
| `withCredentials` | `false` | Send cookies with cross-origin polling requests (needed for cookie auth and LB-cookie stickiness — verified in Chapter 23). In Node, also enables the client's cookie jar |
| `timestampRequests` | timestamps on (the client adds `t=` unless set to `false`) | Cache-busting parameter on polling requests |
| `timestampParam` | `"t"` | Name of that parameter |
| `requestTimeout` | — | Timeout for polling HTTP requests (ms) |
| `transportOptions` | `{}` | Per-transport overrides, e.g. `{ polling: { extraHeaders }, webtransport: { serverCertificateHashes } }` |
| `closeOnBeforeunload` | `false` | Close silently on `beforeunload` (uniform behaviour across browsers) |
| `addTrailingSlash` | `true` | Match the server's setting |
| `protocols` | `[]` | WebSocket sub-protocols |
| `perMessageDeflate` | `{ threshold: 1024 }` | WebSocket compression settings (Node client) |
| `useNativeTimers` | `false` | Use native timers even if mocked (fake timers in tests) |
| `autoUnref` | `false` | Heartbeat timer doesn't keep the Node process alive |
| `host`, `hostname`, `secure`, `port` | from URL | Override parts of the URL |
| `agent` | `false` | HTTP agent (Node), e.g. for proxies |
| `pfx`, `key`, `passphrase`, `cert`, `ca`, `ciphers` | — | TLS options (Node) |
| `rejectUnauthorized` | `true` | Verify TLS certificates (Node). Never `false` in production |

---

## 22.7 Configuration recipes

### Small internal app, single server

```js
new Server(httpServer, { serveClient: false, maxHttpBufferSize: 1e5, cors: { origin: APP_ORIGIN } });
```

### Public SPA behind a load balancer, cookies for auth

```js
// server
new Server(httpServer, {
  serveClient: false,
  cors: { origin: ["https://app.example.com"], credentials: true },
  allowRequest: (req, cb) => cb(null, req.headers.origin === "https://app.example.com"),
  adapter: createAdapter(pub, sub),
  maxHttpBufferSize: 1e5,
});
// client
io("https://rt.example.com", { withCredentials: true });
```

### Mobile apps only, no sticky sessions

```js
// server
new Server(httpServer, { transports: ["websocket"], serveClient: false, adapter: createAdapter(pub, sub) });
// clients: transports ["websocket"] / forceWebsockets(true) / setTransports(['websocket'])
```

### High-churn mobile networks, recovery

```js
new Server(httpServer, {
  pingInterval: 20000, pingTimeout: 15000,
  connectionStateRecovery: { maxDisconnectionDuration: 60_000 },
  adapter: createAdapter(redisClient),   // from "@socket.io/redis-streams-adapter" (supports recovery)
});
```

### Sharing the HTTP server with another WebSocket service whose handshake is slow

```js
new Server(httpServer, { path: "/socket.io/", destroyUpgrade: false });
```

### Large fleets (thundering herd protection) — client

```js
io(URL, { reconnectionDelay: 2000, reconnectionDelayMax: 30000, randomizationFactor: 0.5 });
```

Next: [Chapter 23 — Hands-on exercises and labs (with solutions)](23-exercises-and-labs.md)
