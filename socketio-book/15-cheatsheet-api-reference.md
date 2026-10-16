# Chapter 15 — Cheat Sheet, API Reference and Glossary

> Quick reference for daily work and last-minute interview revision. Verified against
> `socket.io@4.8.4` / `socket.io-client@4.8.4`.

---

## 15.1 Server API

### `Server` (`io`)

| API | Description |
|---|---|
| `new Server(httpServer?, options?)` / `new Server(port, options?)` | Create a server |
| `io.listen(port \| httpServer)` / `io.attach(...)` | Attach/listen |
| `io.attachApp(uwsApp)` | Attach to uWebSockets.js (4.4+) |
| `io.on("connection", (socket) => …)` | New connection on main namespace (alias `connect`) |
| `io.use((socket, next) => …)` | Connection middleware (main namespace) |
| `io.of(name \| RegExp \| fn)` | Get/create a namespace (dynamic with RegExp/fn) |
| `io.sockets` | Main namespace (`io.of("/")`) |
| `io.emit(ev, ...args)` | Broadcast to all in main namespace |
| `io.to(room \| room[])` / `io.in(...)` | Target rooms |
| `io.except(room \| room[])` | Exclude rooms |
| `io.local` | Only this node |
| `io.volatile` | Droppable |
| `io.compress(bool)` | Compression flag |
| `io.timeout(ms)` | Ack timeout for broadcast with acks |
| `io.emitWithAck(...)` (with `timeout`) | Promise of responses array |
| `io.fetchSockets()` | `Promise<(Socket\|RemoteSocket)[]>` cluster-wide |
| `io.socketsJoin(rooms)` / `io.socketsLeave(rooms)` | Bulk join/leave |
| `io.disconnectSockets(close?)` | Bulk disconnect |
| `io.serverSideEmit(ev, ...args)` / `serverSideEmitWithAck` | Events to other servers |
| `io.on(ev, handler)` for server-side events | Receive `serverSideEmit` events |
| `io.allSockets()` | `Promise<Set<SocketId>>` (older API; prefer `fetchSockets`) |
| `io.close()` | Close all connections and the HTTP server (Promise) |
| `io.engine` | Engine.IO server: `clientsCount`, `generateId`, `use()`, events `connection`, `connection_error`, `headers`, `initial_headers` |
| `io.adapter(Adapter)` | Set adapter (or `adapter` option) |
| `io.path()`, `io.serveClient()`, `io.connectTimeout()` | Getters/setters |

### `Namespace`

`nsp.name`, `nsp.sockets` (Map of local sockets), `nsp.adapter`, `nsp.use()`,
`nsp.on("connection")`, `nsp.emit`, `nsp.to/in/except`, `nsp.local`, `nsp.volatile`,
`nsp.compress`, `nsp.timeout`, `nsp.fetchSockets`, `nsp.socketsJoin/socketsLeave`,
`nsp.disconnectSockets`, `nsp.serverSideEmit`.

### Server-side `Socket`

| API | Description |
|---|---|
| `socket.id` | Socket id (per namespace) |
| `socket.handshake` | `{ headers, time, address, xdomain, secure, issued, url, query, auth }` |
| `socket.data` | Arbitrary per-socket data (serialized for `fetchSockets`) |
| `socket.rooms` | `Set<Room>` (includes own id) |
| `socket.nsp` | Namespace |
| `socket.conn` | Engine.IO socket (`transport.name`, `remoteAddress`, `on("upgrade")`, `writeBuffer`) |
| `socket.request` | First HTTP request |
| `socket.connected` / `socket.disconnected` | State |
| `socket.recovered` | CSR succeeded (4.6+) |
| `socket.emit(ev, ...args[, ack])` | Emit to this client |
| `socket.emitWithAck(ev, ...args)` | Promise ack (use with `timeout`) |
| `socket.timeout(ms)` | Ack timeout (4.5+) |
| `socket.volatile`, `socket.compress(bool)` | Flags |
| `socket.broadcast` | Broadcast to all except this socket |
| `socket.to(room)` / `socket.in(room)` / `socket.except(room)` | Broadcast to rooms, excluding sender |
| `socket.join(room \| room[])` / `socket.leave(room)` | Room membership |
| `socket.on/once/off/removeAllListeners/listeners` | Listeners |
| `socket.onAny/prependAny/offAny/listenersAny` | Catch-all incoming |
| `socket.onAnyOutgoing/prependAnyOutgoing/offAnyOutgoing/listenersAnyOutgoing` | Catch-all outgoing |
| `socket.use(([ev, ...args], next) => …)` | Per-event middleware |
| `socket.send(...args)` | Emit `"message"` |
| `socket.disconnect(close?)` | Leave namespace; `true` closes the connection |
| Events | `disconnecting`, `disconnect`, `error` |

---

## 15.2 Client API

### `io(url?, options?)` → `Socket`

| API | Description |
|---|---|
| `socket.id` | Undefined until connected; changes on reconnect (unless recovered) |
| `socket.connected` / `socket.disconnected` / `socket.active` / `socket.recovered` | State |
| `socket.io` | The Manager |
| `socket.auth` | Auth payload (object or function) |
| `socket.sendBuffer` / `socket.receiveBuffer` | Buffers |
| `socket.connect()` / `socket.open()` | Connect manually |
| `socket.disconnect()` / `socket.close()` | Disconnect (no auto-reconnect) |
| `socket.emit`, `emitWithAck`, `timeout`, `volatile`, `compress`, `send` | Emitting |
| `socket.on/once/off/listeners`, `onAny…`, `onAnyOutgoing…` | Listening |
| Events | `connect`, `connect_error`, `disconnect` |

### `Manager` (`socket.io`)

`socket.io.engine` (Engine.IO client: `transport.name`, `on("upgrade")`),
`socket.io.opts`, `socket.io.reconnection(bool)`, `reconnectionAttempts(n)`,
`reconnectionDelay(ms)`, `reconnectionDelayMax(ms)`, `randomizationFactor(n)`,
`timeout(ms)`, `socket.io.socket(nsp)`. Events: `open`, `error`, `ping`, `packet`,
`close`, `reconnect_attempt`, `reconnect`, `reconnect_error`, `reconnect_failed`.

---

## 15.3 Options with defaults

### Server

| Option | Default |
|---|---|
| `path` | `"/socket.io/"` |
| `serveClient` | `true` |
| `adapter` | in-memory |
| `parser` | default parser |
| `connectTimeout` | `45000` |
| `connectionStateRecovery` | off (`{ maxDisconnectionDuration: 120000, skipMiddlewares: true }` when enabled) |
| `cleanupEmptyChildNamespaces` | `false` |
| `pingInterval` | `25000` |
| `pingTimeout` | `20000` |
| `upgradeTimeout` | `10000` |
| `maxHttpBufferSize` | `1e6` |
| `allowRequest` | — |
| `transports` | `["polling", "websocket"]` |
| `allowUpgrades` | `true` |
| `perMessageDeflate` | `false` |
| `httpCompression` | `true` (threshold 1024) |
| `wsEngine` | `ws` Server |
| `cors` | — (disabled) |
| `cookie` | `false` |
| `allowEIO3` | `false` |

### Client

| Option | Default |
|---|---|
| `reconnection` | `true` |
| `reconnectionAttempts` | `Infinity` |
| `reconnectionDelay` | `1000` |
| `reconnectionDelayMax` | `5000` |
| `randomizationFactor` | `0.5` |
| `timeout` | `20000` |
| `autoConnect` | `true` |
| `auth` | — |
| `ackTimeout` / `retries` | — |
| `path` | `"/socket.io/"` |
| `transports` | `["polling", "websocket", "webtransport"]` |
| `upgrade` | `true` |
| `rememberUpgrade` | `false` |
| `tryAllTransports` | `false` |
| `withCredentials` | `false` |
| `forceNew` | `false` |
| `multiplex` | `true` |
| `closeOnBeforeunload` | `false` |
| `query`, `extraHeaders` | — |

---

## 15.4 Emit cheat sheet

```js
socket.emit("e", data);                     // this client
io.emit("e", data);                         // everyone (main namespace)
socket.broadcast.emit("e", data);           // everyone except sender
io.to("r").emit("e", data);                 // room r
socket.to("r").emit("e", data);             // room r except sender
io.to(["a", "b"]).emit("e");                // a ∪ b, once each
io.except("banned").emit("e");              // everyone except room
io.to(socketId).emit("e");                  // one socket
io.of("/admin").to("r").emit("e");          // room in namespace
io.local.emit("e");                         // this node only
socket.volatile.emit("e");                  // droppable
socket.compress(false).emit("e");           // no compression
socket.emit("e", data, (res) => {});        // ack
socket.timeout(5000).emit("e", (err, res) => {});          // ack + timeout
await socket.timeout(5000).emitWithAck("e", data);         // promise
io.timeout(5000).emit("e", (err, responses) => {});        // broadcast ack
io.serverSideEmit("e", data);               // other servers
```

## 15.5 Disconnect reasons

| Server | Client |
|---|---|
| `server namespace disconnect` | `io server disconnect` (no auto-reconnect) |
| `client namespace disconnect` | `io client disconnect` (no auto-reconnect) |
| `server shutting down` | `ping timeout` |
| `ping timeout` | `transport close` |
| `transport close` | `transport error` |
| `transport error` | `parse error` |
| `parse error` | |
| `forced close` | |
| `forced server close` | |

## 15.6 Protocol cheat sheet

Engine.IO: `0` open · `1` close · `2` ping · `3` pong · `4` message · `5` upgrade · `6` noop.
Socket.IO: `0` CONNECT · `1` DISCONNECT · `2` EVENT · `3` ACK · `4` CONNECT_ERROR ·
`5` BINARY_EVENT · `6` BINARY_ACK.
Format: `<type>[<attachments>-][<nsp>,][<ackId>][<json>]` → `42/admin,7["q"]`.
Engine errors: `0` Transport unknown · `1` Session ID unknown · `2` Bad handshake method ·
`3` Bad request · `4` Forbidden · `5` Unsupported protocol version.

## 15.7 Ecosystem packages

| Package | Purpose |
|---|---|
| `socket.io` / `socket.io-client` | Server / client |
| `engine.io` / `engine.io-client` / `engine.io-parser` | Low-level layer |
| `socket.io-parser` / `socket.io-msgpack-parser` | Parsers |
| `socket.io-adapter` | Base & in-memory adapter, `ClusterAdapter` base |
| `@socket.io/redis-adapter` | Redis pub/sub (and sharded) adapter |
| `@socket.io/redis-streams-adapter` | Redis Streams adapter |
| `@socket.io/mongo-adapter` / `@socket.io/postgres-adapter` | DB adapters |
| `@socket.io/cluster-adapter` / `@socket.io/sticky` / `@socket.io/pm2` | Single-machine multi-core |
| `@socket.io/gcp-pubsub-adapter` / `@socket.io/aws-sqs-adapter` / `@socket.io/azure-service-bus-adapter` | Cloud adapters |
| `@socket.io/redis-emitter` / `@socket.io/postgres-emitter` / `@socket.io/mongo-emitter` | Emit from other processes |
| `@socket.io/admin-ui` | Admin dashboard |
| `rate-limiter-flexible`, `zod` | Rate limiting, validation (third-party) |
| Artillery | Load testing |

---

## 15.8 Glossary

- **Ack (acknowledgement):** callback-based reply to an emitted event.
- **Adapter:** stores rooms and performs broadcasts; distributed adapters link servers.
- **At-most-once / at-least-once / exactly-once:** delivery guarantees; Socket.IO default
  is at-most-once.
- **Back-off (exponential) & jitter:** growing randomized delays between reconnection attempts.
- **Broadcast:** one emit to many sockets.
- **Connection state recovery (CSR):** restoring id, rooms, data and missed packets after a
  short disconnection.
- **CSWSH:** Cross-Site WebSocket Hijacking.
- **Emitter:** library to emit through an adapter from non-Socket.IO processes.
- **Engine.IO:** low-level transport layer under Socket.IO.
- **Fan-out:** number of deliveries a broadcast generates.
- **Handshake:** first request establishing the session (`sid`, ping settings).
- **Heartbeat:** ping/pong to detect dead connections.
- **Idempotency:** processing a duplicate request has no extra effect.
- **Long polling:** server holds HTTP requests open until data is available.
- **Manager:** client object owning the connection and reconnection.
- **Multiplexing:** several namespaces sharing one connection.
- **Namespace:** client-chosen channel with its own handlers, middleware, rooms.
- **Parser:** encodes/decodes Socket.IO packets.
- **Presence:** online/offline tracking.
- **Room:** server-side group of sockets for broadcasting.
- **Sticky session (session affinity):** routing a client's requests to the same server.
- **Thundering herd:** many clients reconnecting simultaneously.
- **Transport:** polling, WebSocket, WebTransport.
- **Upgrade:** switching from polling to WebSocket.
- **Volatile:** an emit that may be dropped instead of buffered.

---

## 15.9 The 30-second final revision

1. Socket.IO ≠ WebSocket; Engine.IO underneath; polling → WebSocket upgrade.
2. Events + acks (+ timeout, emitWithAck), volatile, binary, reserved names.
3. Rooms (server-side, auto id-room, auto-leave) vs namespaces (client-chosen, own middleware).
4. `socket.to` excludes sender; `io.to` doesn't; multiple `to` = union.
5. Heartbeat: server pings 25 s / 20 s timeout; reconnection 1–5 s with jitter.
6. Disconnect reasons; no auto-reconnect after server/client disconnect or middleware rejection.
7. At-most-once by default; at-least-once = acks + retries + idempotency + sync.
8. CSR (4.6): restore session; limitations; adapter support.
9. Auth via `auth` + `io.use`; CORS ≠ WebSocket protection; check Origin; authorize every action.
10. Scale: sticky sessions + adapter (Redis/Streams…); emitters; proxy Upgrade headers & timeouts.
11. Production: graceful shutdown, metrics (disconnect reasons, event loop lag), leaks, versioning.
12. Common bugs: `app.listen`, CORS, path vs namespace, duplicate listeners, rooms lost on
    reconnect, async connection handler, missing sticky sessions/adapter, ack without
    timeout.

**You've finished Part I.** Part II goes beyond the core: [Chapter 16 — Native mobile
clients](16-native-mobile-clients.md). Or go back to [the table of contents](README.md).
