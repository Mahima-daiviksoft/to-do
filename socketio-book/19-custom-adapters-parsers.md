# Chapter 19 — Writing a Custom Adapter and a Custom Parser

> **Goal:** understand the two main extension points of Socket.IO well enough to build
> your own: an **adapter** (how servers in a cluster talk to each other) and a **parser**
> (how packets are encoded on the wire).
>
> **How this chapter was checked:** both the adapter and the parser below were run.
> The adapter was used by two Socket.IO 4.8.4 servers in separate processes connected
> through Redis 7: a broadcast crossed servers, `fetchSockets()` returned sockets from both
> servers, `serverSideEmit()` reached the other server, and `serverCount()` returned 2.
> The parser round-tripped a JavaScript `Date` as a real `Date` in both directions.

---

## 19.1 ELI5

- An **adapter** is the post office inside each server. It knows which customers are in
  which rooms, and when there are several post offices it sends letters between them. You
  write a custom one when you want the post offices to talk through a different "road"
  (NATS, Kafka, a database, a cloud service…).
- A **parser** is the envelope format. The default one writes JSON. You write a custom one
  when you want a different envelope (MessagePack, Protobuf, JSON that keeps Dates…).

---

## 19.2 When should you write a custom adapter?

Almost never — first check the official ones (Redis, Redis Streams, MongoDB, Postgres,
cluster, GCP Pub/Sub, AWS SQS, Azure Service Bus) and community ones. Valid reasons:

- your organisation's standard bus is something else (NATS, Kafka, RabbitMQ, ZeroMQ);
- you need special routing (per-tenant isolation, cross-region rules);
- you're building a platform/product on top of Socket.IO.

Writing one is also the best way to *really* understand clustering — a frequent senior
interview topic.

---

## 19.3 The adapter API

Every namespace has one adapter instance. The base class `Adapter` (in
`socket.io-adapter`) is the in-memory implementation; distributed adapters override parts
of it.

| Method | Called when |
|---|---|
| `addAll(id, rooms)` / `del(id, room)` / `delAll(id)` | a local socket joins/leaves rooms |
| `broadcast(packet, opts)` | `io.emit`, `io.to(...).emit`, `socket.broadcast.emit`… |
| `broadcastWithAck(packet, opts, clientCountCallback, ack)` | broadcast with `timeout()` + ack |
| `addSockets(opts, rooms)` / `delSockets(opts, rooms)` | `io.socketsJoin` / `io.socketsLeave` |
| `disconnectSockets(opts, close)` | `io.disconnectSockets` |
| `fetchSockets(opts)` | `io.fetchSockets` |
| `serverSideEmit(packet)` | `io.serverSideEmit` |
| `serverCount()` | number of servers in the cluster |
| `persistSession(session)` / `restoreSession(pid, offset)` | connection state recovery |
| `init()` / `close()` | lifecycle |

Writing all of that by hand is error-prone. Since `socket.io-adapter` 2.5.3, two base classes
do the hard part:

- **`ClusterAdapter`** — implements every cluster operation (broadcasts, requests with
  responses, acks, fetchSockets…) on top of two abstract methods:
  - `doPublish(message)` → send a message to **all other** servers; returns an *offset*
    (only meaningful for connection state recovery);
  - `doPublishResponse(requesterUid, response)` → send a response to **one** server.
  Your transport calls `this.onMessage(message, offset)` and `this.onResponse(response)`
  when something arrives.
- **`ClusterAdapterWithHeartbeat`** — the same, plus heartbeats so each server knows how
  many servers are alive (needed to know how many responses to wait for in
  `fetchSockets()` / `serverSideEmit` with ack). Options: `heartbeatInterval` (default
  5 000 ms), `heartbeatTimeout` (default 10 000 ms).

Each server has a random `uid`; messages from yourself are ignored automatically.

---

## 19.4 A complete adapter in ~50 lines (verified)

A Redis pub/sub adapter written from scratch on `ClusterAdapterWithHeartbeat`, using the
`redis` (node-redis v4+) client and MessagePack (`notepack.io`) so binary payloads survive:

```js
// mini-redis-adapter.js
const { ClusterAdapterWithHeartbeat } = require("socket.io-adapter");
const { encode, decode } = require("notepack.io"); // msgpack: keeps Buffers (binary) intact

function createAdapter(pubClient, subClient, opts = {}) {
  const prefix = opts.channelPrefix ?? "mini-sio";
  const namespaceToAdapters = new Map(); // nsp name -> adapter (one adapter per namespace)

  // one shared subscription for every namespace of this server
  subClient.pSubscribe(`${prefix}#*`, (raw, channel) => {
    const [, nspName, target] = channel.toString().split("#"); // "mini-sio#/#all" or "mini-sio#/#<uid>"
    const adapter = namespaceToAdapters.get(nspName);
    if (!adapter) return;
    const message = decode(raw);
    if (target === "all") adapter.onMessage(message);   // a message for every server
    else adapter.onResponse(message);                   // a response addressed to this server
  }, true /* receive Buffers */);

  return function (nsp) {
    const adapter = new MiniRedisAdapter(nsp, pubClient, prefix, opts);
    namespaceToAdapters.set(nsp.name, adapter);
    const close = adapter.close.bind(adapter);
    adapter.close = () => { namespaceToAdapters.delete(nsp.name); close(); };
    return adapter;
  };
}

class MiniRedisAdapter extends ClusterAdapterWithHeartbeat {
  constructor(nsp, pubClient, prefix, opts) {
    super(nsp, opts);           // opts: { heartbeatInterval, heartbeatTimeout }
    this.pub = pubClient;
    this.prefix = prefix;
  }

  // send a message to ALL other servers (broadcasts, socketsJoin, fetchSockets requests, heartbeats…)
  async doPublish(message) {
    await this.pub.publish(`${this.prefix}#${this.nsp.name}#all`, encode(message));
    return ""; // an offset, only meaningful for adapters that support connection state recovery
  }

  // send a response to ONE server (the one that made a request, e.g. fetchSockets)
  async doPublishResponse(requesterUid, response) {
    await this.pub.publish(`${this.prefix}#${this.nsp.name}#${requesterUid}`, encode(response));
  }
}

module.exports = { createAdapter };
```

Using it:

```js
const { Server } = require("socket.io");
const { createClient } = require("redis");
const { createAdapter } = require("./mini-redis-adapter");

const pub = createClient({ url: process.env.REDIS_URL });
const sub = pub.duplicate();
pub.on("error", console.error);
sub.on("error", console.error);
await Promise.all([pub.connect(), sub.connect()]);

const io = new Server(port, { adapter: createAdapter(pub, sub, { heartbeatInterval: 1000 }) });

io.on("connection", (socket) => {
  socket.data.name = socket.handshake.auth.name;
  socket.join("room1");
  socket.on("go", async (ack) => {
    io.to("room1").emit("hello", `from ${port}`);                          // cross-server broadcast
    const names = (await io.fetchSockets()).map((s) => s.data.name).sort(); // cross-server fetch
    io.serverSideEmit("ping-servers", port);                                // server-to-server
    ack({ names, servers: await io.of("/").adapter.serverCount() });
  });
});
io.on("ping-servers", (from) => console.log(`server ${port} got serverSideEmit from ${from}`));
```

Real output with two servers (ports 4001 and 4002), Alice on 4001 and Bob on 4002:

```
bob (on server 4002) received: from 4001
ack: { names: [ 'alice', 'bob' ], servers: 2 }
(server 4002 log) server 4002 got serverSideEmit from 4001
```

### A bug I hit while writing it (and what it teaches)

The first version did `channel.split("#")` and crashed with
`TypeError: channel.split is not a function`. With node-redis' **buffer mode** (the `true`
argument to `pSubscribe`, needed to receive binary message bodies), the **channel name is
a Buffer too**. Fix: `channel.toString()`. Lesson: in pub/sub adapters, be explicit about
binary vs string at every boundary — payloads must stay binary (msgpack, attachments),
channel names are text.

### Design decisions you must make in a real adapter

1. **Channel layout.** One channel for everything (simple, every server gets everything) vs
   per-room channels (servers only receive rooms they host — what the sharded Redis adapter
   does in `dynamic` mode).
2. **Encoding.** MessagePack (binary-safe, compact) vs JSON (must handle Buffers yourself).
3. **Delivery guarantees.** Pub/sub loses messages during disconnects. A log-based
   transport (Redis Streams, Kafka, NATS JetStream) can resume from an offset and enables
   **connection state recovery**: return the stored message id from `doPublish`, and
   implement `persistSession` / `restoreSession` (see the Redis Streams adapter source as
   a reference).
4. **Request timeouts.** `fetchSockets()` and acks wait for every live server; heartbeats
   decide who is alive. Tune `heartbeatInterval`/`heartbeatTimeout`.
5. **Message size limits** of your bus (Postgres `NOTIFY` is limited to 8000 bytes — the
   Postgres adapter stores bigger payloads in a table).
6. **Cleanup.** Unsubscribe and clear timers in `close()`.

### Testing a custom adapter

Run 2–3 servers (separate processes, or several `Server` instances on different ports in
one test) against a real bus (Redis in Docker/Testcontainers) and assert:

- broadcast to all / to a room / with `except` reaches clients on every server exactly once;
- `socket.to(room)` excludes the sender everywhere;
- `fetchSockets()` returns sockets from all servers, with `data`;
- `socketsJoin` / `socketsLeave` / `disconnectSockets` affect remote sockets;
- `serverSideEmit` with and without ack;
- broadcast with ack collects responses from all servers;
- a server going down is removed after `heartbeatTimeout` (no hanging requests);
- binary payloads survive.

---

## 19.5 Parsers

### The contract

A parser module exports two classes, `Encoder` and `Decoder`. Both client and server must
be configured with the **same** parser (`new Server({ parser })`, `io(url, { parser })`).

```js
class Encoder {
  /** packet: { type, nsp, data?, id? } → array of strings and/or binary chunks */
  encode(packet) { /* … */ return [chunk1, chunk2]; }
}

class Decoder extends Emitter {           // from "@socket.io/component-emitter"
  add(chunk) {                            // called for every chunk received from the transport
    /* … when a whole packet has been decoded: */ this.emit("decoded", packet);
  }
  destroy() {}                            // called when the connection closes
}
```

Packet types: `0` CONNECT, `1` DISCONNECT, `2` EVENT, `3` ACK, `4` CONNECT_ERROR (plus
`5`/`6` binary variants used by the default parser). **Validate decoded packets**: a
throw inside `add()` makes the connection close, which is the right reaction to garbage
from a malicious client — and historic security advisories in `socket.io-parser` were
exactly about insufficient validation (Chapter 6.10).

### Example: a JSON parser that preserves `Date` objects (verified)

The default parser turns Dates into ISO strings. This parser tags them so the receiver gets
real `Date` objects back (JSON-only: no binary support, which is fine for many apps):

```js
// date-parser.js
const { Emitter } = require("@socket.io/component-emitter");

const DATE_TAG = "__date__";

const replacer = function (key, value) {
  // JSON.stringify calls Date#toJSON() BEFORE the replacer, so read the original value from `this`
  const original = this[key];
  return original instanceof Date ? { [DATE_TAG]: original.toISOString() } : value;
};
const reviver = (key, value) =>
  value && typeof value === "object" && typeof value[DATE_TAG] === "string" ? new Date(value[DATE_TAG]) : value;

class Encoder {
  encode(packet) {
    return [JSON.stringify(packet, replacer)];      // must return an ARRAY of encoded chunks
  }
}

class Decoder extends Emitter {
  add(chunk) {
    if (typeof chunk !== "string") throw new Error("binary not supported by this parser");
    const packet = JSON.parse(chunk, reviver);
    if (!isPacketValid(packet)) throw new Error("invalid packet");   // a throw closes the connection
    this.emit("decoded", packet);
  }
  destroy() {}
}

function isPacketValid({ type, data, nsp, id }) {
  const isNamespaceValid = typeof nsp === "string";
  const isAckIdValid = id === undefined || Number.isInteger(id);
  if (!isNamespaceValid || !isAckIdValid) return false;
  switch (type) {
    case 0: return data === undefined || typeof data === "object";     // CONNECT
    case 1: return data === undefined;                                 // DISCONNECT
    case 2: return Array.isArray(data) && typeof data[0] === "string"; // EVENT
    case 3: return Array.isArray(data);                                // ACK
    case 4: return typeof data === "object";                           // CONNECT_ERROR
    default: return false;
  }
}

module.exports = { Encoder, Decoder };
```

Test (real output):

```js
const parser = require("./date-parser");
const io = new Server(4400, { parser });
io.on("connection", (s) =>
  s.on("when", (d, ack) => ack({ isDate: d instanceof Date, plusOneDay: new Date(+d + 86400000) })));

const c = ioClient("http://localhost:4400", { parser });
const r = await c.timeout(2000).emitWithAck("when", new Date("2026-01-01T00:00:00Z"));
// → server saw a Date: true | client got a Date back: true 2026-01-02T00:00:00.000Z
```

The subtle part (a classic JavaScript gotcha): `JSON.stringify` calls `Date#toJSON()`
**before** passing the value to the replacer, so `value` is already a string — you must
look at `this[key]` to see the original `Date`.

### MessagePack parser (official)

```js
// server
const msgpackParser = require("socket.io-msgpack-parser");
const io = new Server(httpServer, { parser: msgpackParser });

// client
import msgpackParser from "socket.io-msgpack-parser";
const socket = io(URL, { parser: msgpackParser });
// or the prebuilt browser bundle: socket.io.msgpack.min.js
```

Binary-encodes everything (no separate attachments). Smaller for numeric/binary-heavy
data; similar for text-heavy data. Not human-readable in DevTools. Every client (including
mobile clients) must support the same parser — check before adopting.

### Other ideas for custom parsers

- **Protobuf / FlatBuffers** with a schema per event (very compact, typed, but every
  client must share the schemas).
- **Compression** of large textual payloads (but prefer `perMessageDeflate` first).
- **Per-message encryption** (prefer TLS + application-level E2EE, Chapter 21).
- **Validation in the parser** (reject unknown event names early).

---

## 19.6 Interview questions for this chapter

**Q1. [S] What do you need to implement to build a cluster adapter today?**
Extend `ClusterAdapterWithHeartbeat` (or `ClusterAdapter`) from `socket.io-adapter` and
implement `doPublish(message)` (to all servers) and `doPublishResponse(uid, response)` (to
one server); feed incoming traffic to `onMessage()` / `onResponse()`. The base class
implements broadcasts, acks, `fetchSockets`, `socketsJoin/Leave`, `disconnectSockets`,
`serverSideEmit`, and server counting via heartbeats.

**Q2. [S] Why do heartbeats matter in a cluster adapter?**
Requests like `fetchSockets()` wait for one response per server; heartbeats tell each node
how many servers are alive so it neither waits for dead nodes nor misses live ones.

**Q3. [S] How would an adapter support connection state recovery?**
Use a log-based bus (streams), return the stored message id as the offset from
`doPublish`, and implement `persistSession` / `restoreSession` so missed packets can be
replayed from the offset.

**Q4. [M] What must a custom parser export?**
`Encoder` with `encode(packet)` returning an array of chunks, and `Decoder` (an event
emitter) with `add(chunk)` emitting `"decoded"` and `destroy()`. Same parser on both sides.

**Q5. [M] Why validate packets in the decoder?**
Malformed input from malicious clients must not crash or confuse the server; throwing
closes that connection. Past parser vulnerabilities came from insufficient validation.

**Q6. [M] Why does a naive "keep Dates" replacer not work with `JSON.stringify`?**
`toJSON()` runs before the replacer, so the replacer sees a string; inspect `this[key]`.

Next: [Chapter 20 — Other runtimes: Electron, service workers, Bun, Deno](20-other-runtimes.md)
