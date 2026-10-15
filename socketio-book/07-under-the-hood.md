# Chapter 7 — Under the Hood: Engine.IO, Transports, the Protocol, Parsers and Adapters

> **Goal:** understand exactly what travels on the wire and which internal component does
> what. This is what lets you debug anything with the browser's Network tab, and what
> senior interviews probe ("explain the upgrade mechanism", "what's an adapter?",
> "why sticky sessions?").
>
> All packet captures below come from a real Socket.IO **4.8.4** server.

---

## 7.1 ELI5

Sending a Socket.IO message is like sending a parcel:

1. You write a **letter** ("chat", "hi") — your event.
2. The **Socket.IO parser** puts it in an **envelope** and writes on it: "this is an
   EVENT, for department `/admin`, reply slip #7" → `42/admin,7["chat","hi"]`.
3. **Engine.IO** puts the envelope in a **box** marked "MESSAGE" → adds a `4` in front.
4. The **transport** is the **delivery truck**: either a long-polling truck (HTTP requests)
   or a WebSocket truck (an always-open road). If the road is blocked, the old truck still
   delivers.
5. On arrival, everything is unpacked in reverse order.

The **adapter** is the **post office sorting room**: it knows which people are in which
groups (rooms) and, with several post offices (servers), it forwards parcels between them.

---

## 7.2 The architecture (server side)

```
                   ┌──────────────────────────── Server (io) ───────────────────────────┐
HTTP server ──▶    │  Engine.IO Server (io.engine)                                       │
(node:http)        │    └─ Engine.IO Socket (socket.conn) ── Transport (polling|ws|wt)  │
                   │          ▲                                                          │
                   │          │ 1 per client connection                                  │
                   │  Client (internal) ── decoder/encoder (socket.io-parser)            │
                   │     └─ 1 Socket per joined Namespace                                │
                   │  Namespace "/" ─── Adapter (rooms: Map<Room, Set<SocketId>>)       │
                   │  Namespace "/admin" ─── Adapter                                     │
                   └─────────────────────────────────────────────────────────────────────┘
```

| Component | Package | Responsibility |
|---|---|---|
| `Server` | `socket.io` | Entry point, options, namespaces, attaches to HTTP server |
| `Namespace` | `socket.io` | Group of sockets with own handlers/middleware/adapter |
| `Socket` | `socket.io` | One client in one namespace; emit/on/join/leave |
| `Client` | `socket.io` (internal) | One per Engine.IO connection; demultiplexes packets to namespace Sockets |
| `Adapter` | `socket.io-adapter` (+ Redis etc.) | Stores room membership, performs broadcasts, inter-server communication |
| Parser | `socket.io-parser` | Encodes/decodes Socket.IO packets (JSON + binary attachments) |
| Engine.IO `Server` / `Socket` | `engine.io` | Handshake, transports, upgrade, heartbeat, low-level packets |
| Engine.IO parser | `engine.io-parser` | Encodes Engine.IO packets and payloads |
| `ws` | `ws` | Default WebSocket server implementation (`wsEngine`) |

Client side mirrors it: `Socket` (per namespace) → `Manager` (connection, reconnection)
→ `engine.io-client` `Socket` → transports.

---

## 7.3 Engine.IO protocol (v4)

### Engine.IO packet types

| Type | Name | Direction | Purpose |
|---|---|---|---|
| `0` | **open** | S→C | Handshake response (sid, upgrades, pingInterval, pingTimeout, maxPayload) |
| `1` | **close** | both | Request to close the transport |
| `2` | **ping** | S→C (also `2probe` C→S during upgrade) | Heartbeat |
| `3` | **pong** | C→S (also `3probe` S→C during upgrade) | Heartbeat reply |
| `4` | **message** | both | Carries an application (Socket.IO) packet |
| `5` | **upgrade** | C→S | Completes the transport upgrade |
| `6` | **noop** | S→C | Used to close a pending poll during upgrade |

### The handshake (open packet) — real capture

```
GET /socket.io/?EIO=4&transport=polling&t=<cache-buster>
← 0{"sid":"HSJR3YuCOE9jPqHEAAAA","upgrades":["websocket"],"pingInterval":25000,"pingTimeout":20000,"maxPayload":1000000}
```

Query parameters:

| Param | Meaning |
|---|---|
| `EIO=4` | Engine.IO protocol version (v3/v4 clients send 4; v2 clients send 3) |
| `transport` | `polling` / `websocket` / `webtransport` |
| `sid` | Session id (on every request after the handshake) |
| `t` | Cache-busting timestamp (polling) |
| + your `query` option params | |

Note `"upgrades":["websocket"]` — what this transport may be upgraded to. When the
handshake itself happens over WebSocket the list is empty (nothing to upgrade to):

```
(WebSocket-only connection) ← 0{"sid":"u1NewvylZUVY8NNBAAAA","upgrades":[],"pingInterval":2000,"pingTimeout":1000,"maxPayload":1000000}
```

`maxPayload` tells the client the max bytes per polling payload (= server's
`maxHttpBufferSize`), so the client can split its writes across several requests.

### HTTP long-polling transport

- **Receiving (server → client):** the client keeps **one `GET` pending**. The server
  answers it when it has packets (or when it sends a ping). Then the client sends a new
  `GET` immediately.
- **Sending (client → server):** the client sends **`POST`** requests with packets in the
  body. Only one POST at a time; packets emitted meanwhile are batched in the next POST.
- **Payload format (EIO v4):** multiple packets in one HTTP body are separated by the
  **record separator character `\x1e`** (ASCII 30).
- **Binary over polling:** encoded as **base64 with a `b` prefix**.

Real capture: one polling GET returning **three** packets (CONNECT reply, a binary event
header, and its binary attachment), separated by `\x1e`:

```
40/admin,{"sid":"l_dmkQgfXzZ8Ld6XAAAB"}␞451-/admin,["bin",{"_placeholder":true,"num":0},"txt"]␞bAQID
```

`bAQID` = `b` + base64(`01 02 03`) — the bytes `[1,2,3]`.

Why polling needs **sticky sessions**: the session (`sid`) lives in the memory of **one**
server. Each GET/POST is a separate HTTP request; if the load balancer sends one to
another server, that server answers **400 `{"code":1,"message":"Session ID unknown"}`**.

### WebSocket transport

- One WebSocket per connection; each Engine.IO packet = **one WebSocket frame**.
- Text packets are sent as text frames (`4…` for messages, `2`/`3` for ping/pong).
- **Binary** packets are sent as **binary frames** with the raw bytes (no prefix, no base64).

Real capture over WebSocket (connecting to namespace `/admin`, receiving a binary
event, sending an event with an ack, heartbeat):

```
→ 40/admin,
← 0{"sid":"u1NewvylZUVY8NNBAAAA","upgrades":[],"pingInterval":2000,"pingTimeout":1000,"maxPayload":1000000}
← 40/admin,{"sid":"O8qU3PmyyZeZYZZHAAAA"}
← 451-/admin,["bin",{"_placeholder":true,"num":0},"txt"]
← (binary frame) 01 02 03
→ 42/admin,7["q"]
← 43/admin,7["answer"]
← 2
→ 3
```

### The upgrade mechanism (polling → WebSocket)

```
Client                                         Server
  |--- GET  ?transport=polling  (handshake) ----->|
  |<-- 0{"sid":…,"upgrades":["websocket"]…} ------|
  |--- POST 40 (CONNECT) ------------------------>|
  |<-- 40{"sid":…} (via pending GET) -------------|
  |                                                |
  |=== WS  ?transport=websocket&sid=… (upgrade) ==>|   (101 Switching Protocols)
  |=== 2probe ====================================>|   test the new road
  |<== 3probe =====================================|   it works!
  |  (client pauses polling: waits for the pending  |
  |   GET/POST to complete; server ends the pending |
  |   GET with a 6 "noop")                          |
  |=== 5 (upgrade) ===============================>|   switch!
  |<== buffered packets now flow over WebSocket ===|
```

- The `upgradeTimeout` (default 10 s) limits how long the server waits for the upgrade to
  complete; on timeout the WebSocket is closed and the client stays on polling.
- Because polling is paused and flushed before switching, **no packet is lost or
  reordered** during the upgrade.
- `rememberUpgrade: true` (client) → if a previous connection successfully used
  WebSocket, the next one starts directly with WebSocket (stored in memory per page —
  uses a static flag).
- `upgrade: false` (client) → stay on the first transport.

### WebTransport (v4.7+)

- HTTP/3 (QUIC) based transport; requires HTTPS and an HTTP/3 server (e.g.
  `@fails-components/webtransport`), plus enabling `"webtransport"` in the server's
  `transports`.
- The client lists `"webtransport"` in its default transports; it's used if the server
  advertises it in `upgrades`.
- Benefits: no head-of-line blocking across streams, faster connection setup (0/1-RTT).
  Use for advanced cases; WebSocket is the practical default.

---

## 7.4 Socket.IO protocol (v5)

### Socket.IO packet types

| Type | Name | Example | Meaning |
|---|---|---|---|
| `0` | **CONNECT** | `0` / `0/admin,{"token":"…"}` (C→S) ; `0{"sid":"…"}` (S→C) | Connect to a namespace (with auth payload); server reply carries the socket id (and `pid` with CSR) |
| `1` | **DISCONNECT** | `1/admin,` | Leave a namespace |
| `2` | **EVENT** | `2["hello","world"]` / `2/admin,13["q"]` | An event, optional ack id |
| `3` | **ACK** | `313["answer"]` | Acknowledgement for ack id 13 |
| `4` | **CONNECT_ERROR** | `4{"message":"not authorized","data":{…}}` | Namespace connection refused (middleware error / invalid namespace) |
| `5` | **BINARY_EVENT** | `51-["bin",{"_placeholder":true,"num":0}]` | Event with N binary attachments |
| `6` | **BINARY_ACK** | `61-15[{"_placeholder":true,"num":0}]` | Ack with binary attachments |

On the wire each Socket.IO packet travels inside an Engine.IO **message** (`4`), which
is why you see `40`, `42`, `43`, `44`, `45`… in the Network tab.

### Packet format

```
<packet type>[<# of binary attachments>-][<namespace>,][<ack id>][JSON-stringified payload]
```

- Namespace is omitted when it's the main namespace `/`.
- Ack id is present only when the sender expects an acknowledgement.

Decoding real examples:

| Raw (as seen in DevTools) | Engine.IO | Socket.IO | Meaning |
|---|---|---|---|
| `40` | message | CONNECT `/` | client asks to join `/` |
| `40{"sid":"KykvYCRwmIsIifIyAAAA"}` | message | CONNECT reply | joined `/`, socket id |
| `421["hello","world"]` | message | EVENT, ack id 1 | `emit("hello","world", cb)` |
| `431[{"ok":true}]` | message | ACK 1 | `cb({ok:true})` |
| `42/admin,7["q"]` | message | EVENT in `/admin`, ack 7 | |
| `451-/admin,["bin",{"_placeholder":true,"num":0},"txt"]` | message | BINARY_EVENT, 1 attachment, `/admin` | followed by 1 binary frame |
| `44{"message":"not authorized"}` | message | CONNECT_ERROR | middleware rejected |
| `41` | message | DISCONNECT `/` | |
| `2` / `3` | ping / pong | — | heartbeat |

### Binary handling

1. The parser walks the arguments, finds `Buffer`/`ArrayBuffer`/`Blob` etc.
2. Replaces each with a placeholder `{"_placeholder":true,"num":<index>}`.
3. Sends the JSON header packet (`BINARY_EVENT` with the count) followed by each binary
   **attachment** as a separate Engine.IO message (binary frame / `b`-base64 in polling).
4. The receiver buffers the header until all attachments arrive, then reconstructs the
   arguments.

Implications:
- One logical binary event = several frames.
- A message with **many small buffers** is less efficient than one combined buffer.
- Security: attackers can send malformed attachment counts — keep `socket.io-parser`
  patched (historic CVEs) and keep `maxHttpBufferSize` sane.

### Why can't a plain WebSocket client talk to Socket.IO?

Because it would need to: open the right URL (`/socket.io/?EIO=4&transport=websocket`),
parse the `0{...}` open packet, send `40` to join a namespace, answer every `2` with `3`
(or be disconnected after `pingTimeout`), and encode/decode `42[...]`/binary attachments.
That *is* the Socket.IO protocol — which is exactly what client libraries implement.

---

## 7.5 Parsers

The **parser** turns packets into wire format and back. Both sides **must use the same
parser**.

| Parser | Package | Notes |
|---|---|---|
| Default | `socket.io-parser` | JSON + separate binary attachments; human-readable in DevTools |
| MessagePack | `socket.io-msgpack-parser` | Binary encoding of everything; smaller payloads for some data, handles binary inline (no attachments); not human-readable; numbers/strings encoding differs slightly |
| Custom | implement `Encoder`/`Decoder` | e.g. protobuf-based, compression, encryption |

```js
// server
const customParser = require("socket.io-msgpack-parser");
const io = new Server(httpServer, { parser: customParser });

// client
import customParser from "socket.io-msgpack-parser";
const socket = io(URL, { parser: customParser });
```

When does msgpack help? Payloads with lots of numbers/binary; when it doesn't: mostly
textual payloads (similar size, more CPU in JS). **Measure** before switching. Also note
the Redis adapter has its own `parser` option for messages between servers (msgpack by
default via `notepack.io`).

---

## 7.6 Adapters (internals)

### What an adapter does

Every namespace has an **adapter** instance (`io.of("/").adapter`). Its job:

1. Store **room membership**: `rooms: Map<Room, Set<SocketId>>` and
   `sids: Map<SocketId, Set<Room>>`.
2. **Broadcast**: given `{ rooms, except, flags }`, compute the target sockets and write
   the (once-encoded) packet to each.
3. In a cluster: **forward** broadcasts and requests (fetchSockets, socketsJoin,
   serverSideEmit, broadcast acks…) to other servers and handle theirs.
4. For connection state recovery: persist sessions and packets (`SessionAwareAdapter`
   in the in-memory adapter, or Redis Streams / MongoDB adapters).

The **default in-memory adapter** does (1) and (2) only for the local process — which is
why a multi-server deployment needs another adapter.

### Broadcast algorithm (simplified, in-memory adapter)

```
broadcast(packet, { rooms, except, flags }):
  encoded = encoder.encode(packet)        # encode ONCE
  if rooms is empty → targets = all sockets in namespace
  else targets = union of sockets of each room (each socket once)
  remove sockets in any "except" room
  for each target socket → socket.client.writeToEngine(encoded, flags)
```

Encoding once and reusing the buffer for every recipient is a key performance property
(`io.emit` to 10 000 sockets doesn't serialize 10 000 times).

### Redis adapter internals (pub/sub)

```
Server A: io.to("room1").emit("x")
   ├─ broadcast locally (A's sockets in room1)
   └─ PUBLISH socket.io#/#room1# <msgpack([serverUid, packet, {rooms, except, flags}])>
      (to a single room → channel "socket.io#/#room1#"; otherwise "socket.io#/#")

Server B and C: PSUBSCRIBE "socket.io#/#*" → receive → ignore if it's their own uid
               → broadcast locally to THEIR sockets in room1
```

- The classic adapter uses a **pattern subscription** (`PSUBSCRIBE socket.io#/#*`), so
  **every server receives every broadcast**, even for rooms where it has no sockets.
  At very large scale this fan-out becomes the bottleneck.
- Requests like `fetchSockets()` / `socketsJoin()` / `serverSideEmit()` use dedicated
  channels: `socket.io-request#/#` and `socket.io-response#/#`, with `requestsTimeout`
  (default 5 s).
- The **sharded** adapter (`createShardedAdapter`, Redis 7+ sharded pub/sub) has a
  `subscriptionMode` option: `"static"` (fixed channels per namespace), `"dynamic"`
  (default — one channel per *public* room, a server subscribes only to rooms it has
  sockets in), `"dynamic-private"` (also creates channels for private socket-id rooms).
- Redis **pub/sub is fire-and-forget**: if a server is disconnected from Redis
  momentarily, it misses broadcasts during that time. The Redis **Streams** adapter
  fixes this (it can resume reading the stream from the last offset) and supports
  connection state recovery.

More in Chapter 8.

### Writing a custom adapter (rare, but shows mastery)

Adapters extend `Adapter` from `socket.io-adapter` and override methods like
`broadcast`, `addAll`, `del`, `delAll`, `fetchSockets`, `addSockets`, `delSockets`,
`disconnectSockets`, `serverSideEmit`, `broadcastWithAck`, `persistSession`,
`restoreSession`. The `ClusterAdapter` / `ClusterAdapterWithHeartbeat` base classes in
`socket.io-adapter` let you implement only the transport (how messages travel between
nodes) — that's how the Redis Streams, Postgres, MongoDB, cluster and cloud adapters are
built.

---

## 7.7 What happens during `socket.emit("chat", "hi")` (server → client), step by step

1. `Socket#emit` checks the name isn't reserved, builds `{ type: EVENT, data: ["chat","hi"], nsp: "/" }`,
   and registers an ack callback if the last arg is a function (assigns an id).
2. (With connection state recovery enabled, it goes through `adapter.broadcast` to the
   socket's own room so the packet gets an offset and is stored.)
3. The parser **encodes**: `2["chat","hi"]` (plus attachments if binary).
4. `Client#writeToEngine` → if `volatile` and transport not writable → dropped.
5. Engine.IO wraps it as a message: `42["chat","hi"]`, pushes it to the `writeBuffer`,
   and **flushes** when the transport is writable (immediately for WebSocket; on the next
   pending GET for polling — several packets may be batched with `\x1e`).
6. `ws` writes a WebSocket frame (compressed if `perMessageDeflate` enabled and above
   threshold).
7. Client side: engine.io-client receives the frame, decodes the Engine.IO packet type
   `4`, passes `2["chat","hi"]` to the Manager's decoder.
8. The decoder yields the packet; the Manager routes it to the Socket for namespace `/`.
9. If the socket isn't connected yet, the packet is stored in `receiveBuffer`; otherwise
   `onAny` listeners run, then `chat` listeners with `"hi"`.

---

## 7.8 Debugging the wire yourself

- **Browser DevTools → Network → filter "socket.io"**:
  - polling requests appear as XHR/fetch with the payloads in Response/Payload tabs;
  - the WebSocket appears as `?EIO=4&transport=websocket` with a **Messages** tab showing
    every frame (`2`, `3`, `42[...]`). Use this to verify what's actually sent.
- **Node:** `DEBUG=socket.io*,engine*` (server) or `DEBUG=socket.io-client:*,engine.io-client:*`
  (Node client); in the browser `localStorage.debug = "socket.io-client:*"` then reload.
  (Chapter 10.)
- **`curl` handshake test** (is the server reachable and speaking Socket.IO?):
  ```bash
  curl "https://api.example.com/socket.io/?EIO=4&transport=polling"
  # expect: 0{"sid":"…","upgrades":["websocket"],"pingInterval":25000,…}
  ```
  If you get HTML/404 → wrong path or proxy routing. `{"code":0,"message":"Transport unknown"}`
  → transport disabled. `{"code":5,…}` → protocol version mismatch.

---

## 7.9 Chapter summary

- Two protocols: **Engine.IO v4** (open/close/ping/pong/message/upgrade/noop = 0–6) and
  **Socket.IO v5** (CONNECT/DISCONNECT/EVENT/ACK/CONNECT_ERROR/BINARY_EVENT/BINARY_ACK = 0–6).
- `42["event",…]` = Engine.IO message (4) + Socket.IO event (2).
- Polling: GET to receive (held open), POST to send, `\x1e` separator, binary as `b`+base64.
- WebSocket: one frame per packet, binary frames raw.
- Upgrade: `2probe`/`3probe`, pause polling, `5`, no loss/reordering.
- Parsers: default JSON+attachments, msgpack optional; both sides must match.
- Adapters: room storage + broadcast + inter-server communication; in-memory by default.

Next: [Chapter 8 — Scaling](08-scaling.md)
