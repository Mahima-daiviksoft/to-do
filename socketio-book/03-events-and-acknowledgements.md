# Chapter 3 — Events, Emitting, Listening and Acknowledgements

> **Goal:** master the core of Socket.IO — sending and receiving events, what data you can
> send, request/response with acknowledgements, timeouts, promises, catch-all listeners,
> volatile and compressed events, reserved event names, and ordering.

---

## 3.1 ELI5: events are labelled envelopes

Every message in Socket.IO is like an envelope with:

- a **label** written on the front (the event name, e.g. `"chat:message"`),
- **things inside** (zero or more arguments: strings, numbers, objects, files…),
- optionally a **reply slip** ("please sign and send back") — the acknowledgement.

The receiver has a box per label (`socket.on("chat:message", handler)`); when an envelope
with that label arrives, the handler opens it.

---

## 3.2 `emit` and `on` — the basics

```js
// sender
socket.emit("hello", "world");

// receiver
socket.on("hello", (arg) => {
  console.log(arg); // "world"
});
```

Works in **both directions** with the same API:

| Direction | Sender | Receiver |
|---|---|---|
| client → server | `socket.emit()` in browser | `socket.on()` inside `io.on("connection")` |
| server → client | `socket.emit()` / `io.emit()` on server | `socket.on()` in browser |

### Multiple arguments

You can send **any number of arguments**:

```js
socket.emit("move", 10, 20, { piece: "knight" }, Uint8Array.from([1, 2, 3]));

socket.on("move", (x, y, meta, bytes) => { /* ... */ });
```

> **Best practice:** prefer **one object argument** for anything non-trivial
> (`emit("move", { x, y, piece })`). It's self-documenting, easier to validate, extend and
> version, and avoids argument-order bugs.

### What data can you send? (serialization rules)

Socket.IO's default parser serializes arguments with `JSON.stringify` semantics, **plus
special handling for binary**.

| Type | Supported? | What arrives |
|---|---|---|
| `string`, `number`, `boolean`, `null` | ✅ | same |
| plain objects, arrays | ✅ | deep copies |
| `Buffer` (Node), `ArrayBuffer`, typed arrays (`Uint8Array`…), `Blob`/`File` (browser) | ✅ binary | In Node receiver: `Buffer`; in browser receiver: `ArrayBuffer` (default `binaryType`) |
| `Date` | ⚠️ | becomes an **ISO string** (`toJSON`) — convert back yourself |
| `Map`, `Set` | ❌ | become `{}` — convert to arrays/objects first (`[...map]`, `Object.fromEntries(map)`) |
| `undefined` | ⚠️ | object properties with `undefined` are dropped; `undefined` in arrays becomes `null` |
| `NaN`, `Infinity` | ⚠️ | become `null` |
| `BigInt` | ❌ | `JSON.stringify` throws `TypeError` — convert to string |
| functions | ❌ (except as the **last** argument, which becomes an **ack callback**) | — |
| class instances | ⚠️ | only own enumerable properties; prototype/methods lost; `toJSON()` is honoured |
| circular references | ❌ | throws |

```js
// ❌ Common mistake
socket.emit("stats", new Map([["a", 1]])); // receiver gets {}

// ✅ Fix
socket.emit("stats", Object.fromEntries(map));
```

> With the **msgpack parser** (`socket.io-msgpack-parser`) the rules differ (e.g. Dates and
> binary are encoded natively by msgpack). Both sides must use the **same parser**.

### Binary data example

```js
// server: send a file
const fs = require("node:fs");
socket.emit("image", fs.readFileSync("cat.png")); // Buffer

// browser
socket.on("image", (buf) => {             // ArrayBuffer
  const blob = new Blob([buf], { type: "image/png" });
  img.src = URL.createObjectURL(blob);
});

// browser: upload a file selected in <input type="file">
input.addEventListener("change", () => {
  socket.emit("upload", input.files[0], (status) => console.log(status));
});

// server
socket.on("upload", (file, ack) => {        // Buffer
  fs.writeFile("/tmp/upload", file, (err) => ack({ ok: !err }));
});
```

Binary is sent as separate WebSocket binary frames (a `BINARY_EVENT` packet with
placeholders + attachments — see Chapter 7). Over polling it is base64-encoded.

> **Limits:** a single message larger than `maxHttpBufferSize` (default **1 MB**) causes the
> server to **close the connection** (the client sees a disconnect, typically
> `"transport close"`/`"transport error"`). For big files use **HTTP uploads** (multipart,
> pre-signed S3 URLs) or **chunk** the file into pieces with acks for flow control
> (Chapter 13 shows a chunked upload pattern).

---

## 3.3 Listener management

### Server-side and client-side `Socket` listener methods

Both server and client sockets behave like an `EventEmitter`:

```js
socket.on("event", listener);        // add listener
socket.once("event", listener);      // add one-time listener
socket.off("event", listener);       // remove a specific listener (alias: removeListener)
socket.off("event");                 // remove all listeners for this event (client)
socket.removeAllListeners("event");  // remove all listeners for this event
socket.removeAllListeners();         // remove ALL listeners (careful: also reserved ones like disconnect)
socket.listeners("event");           // array of listeners
```

On the **client**, `socket.off()` with no arguments removes all listeners.

### Catch-all listeners (`onAny`) — great for logging/debugging

```js
// incoming
socket.onAny((eventName, ...args) => {
  console.log("IN ", eventName, args);
});

// outgoing (v4.5+)
socket.onAnyOutgoing((eventName, ...args) => {
  console.log("OUT", eventName, args);
});

socket.prependAny(listener);         // run before other catch-all listeners
socket.offAny(listener);             // remove one
socket.offAny();                     // remove all
socket.listenersAny();               // list
socket.prependAnyOutgoing(listener);
socket.offAnyOutgoing(listener);
socket.listenersAnyOutgoing();
```

Notes:
- `onAny` does **not** receive acknowledgement packets, and the ack callback (if any) is the
  last element of `args`.
- Reserved events (`connect`, `disconnect`, …) are **not** passed to `onAny`.

### Server-side per-event middleware: `socket.use()`

Runs for **every incoming event** on that socket before the handler (Chapter 6 covers
it fully):

```js
socket.use(([event, ...args], next) => {
  if (event === "admin:action" && !socket.data.user?.isAdmin) {
    return next(new Error("unauthorized"));
  }
  next();
});

// errors from socket.use() are emitted as an "error" event on the server socket
socket.on("error", (err) => {
  if (err && err.message === "unauthorized") socket.emit("app:error", "unauthorized");
});
```

---

## 3.4 Acknowledgements (request/response)

### ELI5

Normally, `emit` is "fire and forget" — like throwing a paper plane over a wall. You don't
know if anyone caught it. An **acknowledgement** is like attaching a self-addressed
envelope: the receiver puts their answer inside and sends it back to *you specifically*.

### Callback style (works in both directions)

```js
// client
socket.emit("order:create", { item: "pizza" }, (response) => {
  console.log(response); // { ok: true, orderId: 42 }
});

// server
socket.on("order:create", async (payload, callback) => {
  const order = await orders.create(payload);
  callback({ ok: true, orderId: order.id });
});
```

Server → client works the same:

```js
// server
socket.emit("are-you-there", (answer) => console.log(answer));

// client
socket.on("are-you-there", (callback) => callback("yes"));
```

Rules (all asked in interviews):

1. The ack function **must be the last argument** of `emit`.
2. The receiver gets it as the **last argument** of the handler.
3. Call it **at most once**. Calling twice: the second call is ignored (the ack id is
   consumed after the first reply).
4. You can pass **multiple arguments** to the callback: `callback(err, data)`.
5. Arguments follow the same serialization rules (JSON + binary).
6. **Not calling the callback** means the sender waits forever (memory held for the
   pending ack) unless a timeout is used. Always reply — even on errors.
7. The handler cannot know in advance whether the sender passed an ack, so validate:
   `if (typeof callback !== "function") return;` (malicious or buggy clients might not
   pass one, and calling `undefined()` throws inside your handler).

### The error-first convention

Socket.IO itself doesn't impose a format. Pick one convention for the whole organisation.
Two popular choices:

```js
// (a) Node-style error-first
callback(null, { orderId: 42 });           // success
callback({ code: "OUT_OF_STOCK" });         // error

// (b) Envelope style (recommended — easy to type & evolve)
callback({ ok: true, data: { orderId: 42 } });
callback({ ok: false, error: { code: "OUT_OF_STOCK", message: "Pizza unavailable" } });
```

### Acks with timeout

What if the other side never answers (network loss, buggy handler)? Use `timeout()`:

```js
// client or server (server-side since v4.5)
socket.timeout(5000).emit("order:create", payload, (err, response) => {
  if (err) {
    // the other side did not acknowledge the event in the given delay
    return showError("Server did not respond");
  }
  console.log(response);
});
```

When `timeout()` is used, the callback gets an **extra first argument** `err` (an `Error`
with message `"operation has timed out"`) — `null` on success. This is the #1 confusion
with timeouts: **with `.timeout()`, the first callback arg is the error.**

### Promise style: `emitWithAck()` (v4.6+)

```js
// client
try {
  const response = await socket.timeout(5000).emitWithAck("order:create", payload);
  console.log(response);
} catch (err) {
  // timed out (only possible when a timeout was set)
}

// server, to one client
const answer = await socket.timeout(3000).emitWithAck("are-you-there");
```

Without any timeout (`.timeout()` or the client's `ackTimeout` option), the promise only
settles when the other side answers — it may hang forever.

### Broadcast with acknowledgements (server, v4.5+)

```js
io.timeout(5000).emit("health-check", (err, responses) => {
  if (err) {
    // some clients did not answer in time; `responses` has the ones that did
  }
  console.log(responses); // one entry per client that answered
});

// promise version
try {
  const responses = await io.timeout(5000).emitWithAck("health-check");
} catch (e) {
  // some clients did not acknowledge in time
}

// to a room
const answers = await io.to("room-42").timeout(5000).emitWithAck("vote");
```

- **Promise vs callback when some clients don't answer (verified):** `emitWithAck`
  *rejects* on timeout, so you lose the answers that did arrive. The callback form gives
  you both: `io.timeout(1000).emit("poll", q, (err, answers) => …)` — `err` is set, and
  `answers` still contains every reply received in time. Use the callback form for polls,
  health checks and anything where partial results are useful.
- **Always use `.timeout()` with broadcast acks.** (In the 4.8 source, the broadcast
  timer is `setTimeout(..., this.flags.timeout)`; without a timeout it fires almost
  immediately with an error.)
- Works across a cluster with adapters that support it (Redis adapter etc.).

### Acks don't work with `socket.broadcast` the same way?

`socket.broadcast.timeout(…).emit(…, cb)` and `socket.to(room).timeout(…).emit(…, cb)`
are also `BroadcastOperator`s, so they behave like `io.timeout()`: one callback with an
array of responses.

### Client-side automatic retries — at-least-once from client (v4.6+)

```js
const socket = io({
  ackTimeout: 10000, // wait up to 10 s for the server to ack each emit
  retries: 3,        // then retry up to 3 times
});

// this event will be retried until acknowledged (or 3 retries exhausted)
socket.emit("payment:submit", payload, (err, res) => {
  if (err) {/* all retries failed */}
});
```

How it works:

- Packets are queued and sent **one at a time** (in order); the next packet waits for the
  previous one's ack.
- If no ack arrives within `ackTimeout`, the packet is re-sent (up to `retries` times).
- **The server may receive the same event more than once** → your server handler must be
  **idempotent** (e.g. dedupe by a client-generated message id). That's the definition of
  *at-least-once*.

```js
// client: include a unique id
socket.emit("message:send", { id: crypto.randomUUID(), text });

// server: dedupe
socket.on("message:send", async (msg, ack) => {
  const inserted = await db.messages.insertIfNotExists(msg.id, msg); // unique index on id
  ack({ ok: true, duplicate: !inserted });
});
```

You can also apply retries to a single emit with a timeout:
`socket.timeout(5000).emit(...)` (no retries) vs. the `retries` option (global).

### Ack patterns in production

1. **"Command" events** (create order, send message, join room) → **always ack**, with a
   timeout, with an envelope `{ ok, data | error }`.
2. **"Fire-and-forget" signals** (typing, cursor move, mouse position) → no ack, often
   `volatile`.
3. **Server-originated notifications** → generally no ack (client may be offline). If you
   need confirmation of delivery, store in DB and let the client "mark as read" via an
   event or HTTP call.

---

## 3.5 Volatile events

```js
socket.volatile.emit("cursor", { x, y });
io.volatile.emit("price", tick);
```

**ELI5:** "If you can't hear me right now, forget it; I'll say a newer thing soon anyway."

Behaviour:

- **Server side:** the packet is **discarded** if the underlying transport is not
  currently writable (e.g. a polling request isn't open, or the socket is buffering) —
  instead of being buffered.
- **Client side:** the packet is discarded if the low-level transport is not currently
  writable — which includes the time when the socket is disconnected — instead of being
  added to `sendBuffer` like a normal emit.

Use for **high-frequency, superseded data**: positions, typing indicators, live prices,
game state ticks, sensor readings. Never for things that matter individually (payments,
chat messages).

---

## 3.6 Compression

```js
socket.compress(false).emit("blob", bigBuffer); // disable compression for this packet
```

- Applies to **WebSocket per-message deflate** (if enabled with `perMessageDeflate` —
  **off by default** on the server since v3) and to **HTTP compression** of polling
  responses (`httpCompression`, on by default, threshold 1 KB).
- Default `compress` flag is `true` (i.e. "compress if the transport supports it and it
  is enabled").
- Disable for already-compressed data (images, video, gzip) → saves CPU.

Why is `perMessageDeflate` off by default? Each WebSocket with compression keeps a zlib
context (~hundreds of KB of memory per connection with default window bits), and
compression costs CPU — at 10k+ connections it can be a major memory/CPU cost (and
historically caused memory fragmentation issues in Node). Enable it only when messages
are big and compressible, and tune `threshold`, `zlibDeflateOptions`, `serverNoContextTakeover`.

---

## 3.7 Reserved event names (cannot emit these)

Calling `socket.emit("connect")` throws: `"connect" is a reserved event name`.

| Side | Reserved names |
|---|---|
| Server `Socket` | `connect`, `connect_error`, `disconnect`, `disconnecting`, `newListener`, `removeListener` |
| Client `Socket` | `connect`, `connect_error`, `disconnect`, `disconnecting`, `newListener`, `removeListener` |

Also avoid naming your own events like Manager events (`reconnect`, `reconnect_attempt`,
`error`, `ping`) — they're on a different object (`socket.io`), so it technically works,
but it confuses readers. The built-in `"message"` event is used by `socket.send()`:

```js
socket.send("hi");        // same as socket.emit("message", "hi")
socket.on("message", ...);
```

---

## 3.8 Event naming conventions (organisational best practice)

Pick a convention and enforce it (lint rule / TypeScript event maps):

- **`domain:action`** — `chat:message`, `chat:typing`, `order:created`, `room:join`.
  (Recommended in the official docs' application-structure guide.)
- Use **past tense for facts the server announces** (`order:created`,
  `user:joined`) and **imperative for commands the client requests** (`order:create`,
  `room:join`).
- Lowercase, no spaces, no dynamic parts in names (put ids in the payload, not in the
  event name — `room:message` + `{ roomId }`, not `room-123-message`). Dynamic event names
  break typing, documentation and metrics, and can cause listener leaks.
- Version breaking payload changes: `order:created:v2` or a `version` field.
- Keep a **single shared file** describing events (TypeScript interfaces shared by client
  and server, or an AsyncAPI document).

---

## 3.9 Ordering guarantees

- Socket.IO guarantees **message ordering** for a given socket (packets are sent and
  received in emit order), **in both directions**, regardless of the transport and even
  during the polling→WebSocket upgrade (Engine.IO pauses polling and flushes before
  switching).
- Ordering is **not** guaranteed **across different sockets** (e.g. events from user A and
  user B), and **not across server processes** in a cluster for broadcasts originating on
  different nodes.
- With **async handlers**, *processing* may finish out of order even if *arrival* was in
  order:

```js
// ⚠️ arrival order: A then B — completion order can be B then A
socket.on("doc:edit", async (op) => {
  await db.apply(op);          // A may take longer than B
});
```

If processing order matters, serialize per socket (or per document) with a queue:

```js
const queue = [];
let busy = false;
socket.on("doc:edit", (op, ack) => { queue.push([op, ack]); drain(); });

async function drain() {
  if (busy) return;
  busy = true;
  while (queue.length) {
    const [op, ack] = queue.shift();
    try { await db.apply(op); ack?.({ ok: true }); }
    catch (e) { ack?.({ ok: false, error: e.message }); }
  }
  busy = false;
}
```

(Libraries like `p-queue` with `concurrency: 1` do this neatly. For collaborative editing
you'd also use OT/CRDT — Chapter 13.)

---

## 3.10 Async handlers and errors — a production must-know

Socket.IO **does not catch errors thrown inside your event handlers** for you, and it does
not catch rejected promises from `async` handlers:

```js
// ❌ An exception here goes up to the EventEmitter → can crash the process
socket.on("x", (data) => {
  JSON.parse(data); // throws on bad input
});

// ❌ An unhandled rejection: in Node 15+ unhandled rejections crash the process by default
socket.on("y", async () => {
  await somethingThatRejects();
});
```

**Fix: wrap every handler.** A small helper:

```js
const safe = (handler) => async (...args) => {
  const ack = typeof args[args.length - 1] === "function" ? args.pop() : null;
  try {
    const result = await handler(...args);
    ack?.({ ok: true, data: result });
  } catch (err) {
    logger.error({ err }, "socket handler failed");
    ack?.({ ok: false, error: { code: err.code ?? "INTERNAL", message: "Something went wrong" } });
  }
};

socket.on("order:create", safe(async (payload) => {
  const valid = OrderSchema.parse(payload);   // zod validation throws on bad input
  return orderService.create(socket.data.user.id, valid);
}));
```

This gives you: validation, consistent ack envelopes, logging, no crashes. Combine with
`process.on("unhandledRejection")` logging as a last resort (not as error handling).

---

## 3.11 `send()` and `message`

```js
socket.send("hello");               // emits a "message" event
socket.on("message", (data) => {}); // receives it
io.send("to everyone");
```

Rarely used in modern code; named events are clearer.

---

## 3.12 Emitting from outside a connection handler

You often need to emit from a REST controller, a cron job, or a queue consumer.

```js
// keep a reference to io (module export, DI container, app.set("io", io) in Express…)
app.post("/api/orders", async (req, res) => {
  const order = await createOrder(req.body);
  req.app.get("io").to(`user:${order.userId}`).emit("order:created", order);
  res.status(201).json(order);
});
```

From a **different process** (worker, microservice) that is *not* a Socket.IO server,
use an **emitter** (`@socket.io/redis-emitter`, or the Postgres/MongoDB emitters) — see
Chapter 8.

Emitting to a **user** rather than a socket: make each socket join a room named after the
user id in the `connection` handler (`socket.join("user:" + userId)`), then emit to that
room. This handles multiple tabs/devices and reconnections (socket ids change; user ids
don't). This is *the* standard pattern.

---

## 3.13 Chapter summary

- `emit(name, ...args)` / `on(name, handler)` in both directions; prefer one object arg.
- Data: JSON-serializable + binary. Dates→strings, Map/Set→`{}`, BigInt throws.
- Acks = request/response; last argument; call once; always reply; validate it's a function.
- `timeout(ms)` adds an `err` first argument; `emitWithAck` returns a Promise.
- Broadcast acks require `.timeout()` and give an array of responses.
- Client `retries` + `ackTimeout` = at-least-once from client → make handlers idempotent.
- `volatile` = droppable; `compress(false)` for pre-compressed data.
- Reserved names: connect, connect_error, disconnect, disconnecting, newListener, removeListener.
- Order is guaranteed per socket, but async processing can reorder — queue if needed.
- Wrap handlers to catch errors (sync and async) and always ack.

Next: [Chapter 4 — Rooms, namespaces and broadcasting](04-rooms-namespaces-broadcasting.md)
