# Chapter 4 — Rooms, Namespaces and Broadcasting

> **Goal:** understand how to send messages to *groups* of clients. Rooms and namespaces
> are the most-asked Socket.IO interview topic after "what is Socket.IO".

---

## 4.1 ELI5

Imagine a big **school** (the Socket.IO server).

- The school has separate **buildings**: the main building, the sports building, the
  teachers' building. Those are **namespaces** (`/`, `/sports`, `/admin`). You choose which
  building to enter, and each building can have its own guard (middleware) and rules
  (handlers). Students *choose* buildings.
- Inside each building there are **classrooms**: "Math 101", "Art club". Those are
  **rooms**. The **principal (server)** puts students into classrooms and takes them out.
  Students can't walk into a room by themselves — they have to *ask* the server, which
  decides.
- The principal can use the **loudspeaker** to talk to: everyone in a building
  (`io.of("/sports").emit`), everyone in a classroom (`io.to("math-101").emit`), everyone
  except one kid (`socket.broadcast.emit`), and so on. That's **broadcasting**.
- Every student also has a **private room with their own name on it** (the socket's id)
  — so the principal can whisper to one student by sending to that room.

---

## 4.2 Rooms

### What a room is

A **room** is an arbitrary **server-side** channel name that sockets can **join** and
**leave**. It is used to broadcast events to a subset of clients.

Key facts:

1. Rooms are a **server-only** concept. The client doesn't know which rooms it's in
   (unless you tell it). There is **no** `socket.join()` on the client.
2. A room is just a **string** (any string: `"room-42"`, `"user:123"`, `"org:9:admins"`).
3. Rooms are **created automatically** when the first socket joins and **deleted
   automatically** when the last socket leaves.
4. Every socket **automatically joins a room named after its own id** (`socket.id`).
   That's how `io.to(socketId).emit()` works for private messages.
5. Sockets **automatically leave all their rooms on disconnect**. You don't need to clean
   up.
6. Rooms belong to a **namespace**: room `"chess"` in `/` is unrelated to room `"chess"`
   in `/games`.
7. A socket can be in **any number** of rooms.

### Join / leave

```js
io.on("connection", (socket) => {
  socket.join("some room");                 // join one room
  socket.join(["room1", "room2"]);          // join several
  socket.leave("some room");                // leave one
  console.log(socket.rooms);                // Set { <socket.id>, "room1", "room2" }
});
```

`socket.join()` returns `void` with the default in-memory adapter, but may return a
**Promise** with some adapters (the type is `Promise<void> | void`). Writing
`await socket.join(room)` is safe either way and future-proof.

### Broadcasting to rooms

```js
io.to("room1").emit("event");                    // everyone in room1 (incl. the sender, if in it)
socket.to("room1").emit("event");                // everyone in room1 EXCEPT the sender
io.to("room1").to("room2").emit("event");        // union: in room1 OR room2 — each socket receives it ONCE
io.to(["room1", "room2"]).emit("event");         // same, array form
io.except("room3").emit("event");                // everyone except sockets in room3
io.to("room1").except("room2").emit("event");    // in room1 but not in room2
io.to(socketId).emit("private", "hi");           // one specific socket
io.in("room1").emit("event");                    // `in` is an alias of `to`
```

> **Interview trap:** joining `to("a").to("b")` is a **union**, not an intersection, and a
> socket in both rooms receives the event **only once** (the adapter de-duplicates).
> There's no built-in intersection — implement it with a dedicated room
> (`"a&b"`) or `fetchSockets()` + filtering.

> **Interview trap 2:** `socket.to(room).emit()` excludes the *sender*.
> `io.to(room).emit()` includes everyone in the room (the sender too, if it's in the room).

### Typical room usages (patterns)

| Use case | Room naming |
|---|---|
| Chat channel / conversation | `conversation:<id>` |
| All devices/tabs of a user | `user:<userId>` ← **most important pattern** |
| Organisation/tenant broadcast | `org:<orgId>` |
| Role-based broadcast | `org:<orgId>:role:admin` |
| A document being edited | `doc:<docId>` |
| A game match | `match:<matchId>` |
| Subscribers to a resource (e.g. stock) | `ticker:AAPL` |
| Geographic/area | `geo:<geohash>` |

### The per-user room pattern (memorise)

```js
io.use(authMiddleware); // sets socket.data.user

io.on("connection", (socket) => {
  const userId = socket.data.user.id;
  socket.join(`user:${userId}`);   // all tabs/devices of this user share this room
});

// anywhere in the app (REST controller, job, etc.)
io.to(`user:${userId}`).emit("notification", payload);
```

Why: socket ids change on every reconnection and a user may have several tabs/devices;
the user room is stable and covers all of them. **Never** store "userId → socketId" in a
plain variable map — it breaks with multiple tabs, reconnections and multiple servers.

### Room lifecycle events (adapter events)

```js
io.of("/").adapter.on("create-room", (room) => console.log(`room ${room} was created`));
io.of("/").adapter.on("delete-room", (room) => console.log(`room ${room} was deleted`));
io.of("/").adapter.on("join-room", (room, id) => console.log(`socket ${id} joined ${room}`));
io.of("/").adapter.on("leave-room", (room, id) => console.log(`socket ${id} left ${room}`));
```

Note: these fire for the **socket's own private room** too (`room === id`). These events
are emitted **locally** on each server (with the Redis adapter each node only sees its own
sockets' joins).

### Inspecting rooms

```js
io.of("/").adapter.rooms;   // Map<Room, Set<SocketId>>  (LOCAL node only)
io.of("/").adapter.sids;    // Map<SocketId, Set<Room>>  (LOCAL node only)

// cluster-aware (works with adapters):
const sockets = await io.in("room1").fetchSockets();
sockets.length;                                       // number of sockets in room1

const ids = await io.in("room1").allSockets();        // Set<SocketId> (older API)
```

> `adapter.rooms` contains **both** real rooms and every socket's private id-room.
> To list "real" rooms only, filter out keys that are also in `adapter.sids`:
> ```js
> const { rooms, sids } = io.of("/").adapter;
> const realRooms = [...rooms.keys()].filter((r) => !sids.has(r));
> ```

### `disconnecting` vs `disconnect` — read rooms before they're gone

```js
socket.on("disconnecting", (reason) => {
  // socket.rooms is still populated here
  for (const room of socket.rooms) {
    if (room !== socket.id) socket.to(room).emit("user:left", socket.id);
  }
});

socket.on("disconnect", (reason) => {
  // socket.rooms is EMPTY here
});
```

---

## 4.3 Server-side utility methods (bulk operations) — v4+

These work on the local server **and across a cluster** (when the adapter supports it):

```js
// make all sockets join room1
io.socketsJoin("room1");

// make all sockets in room1 also join room2 and room3
io.in("room1").socketsJoin(["room2", "room3"]);

// make the socket with id `theSocketId` join room1 (works even if it's connected on another node!)
io.in(theSocketId).socketsJoin("room1");

// make all sockets leave room1
io.socketsLeave("room1");
io.in("room1").socketsLeave(["room2", "room3"]);

// disconnect all sockets / those in a room
io.disconnectSockets();
io.in("room1").disconnectSockets();
io.in(theSocketId).disconnectSockets(true); // true = close the underlying connection too

// fetch sockets (RemoteSocket objects when on another node)
const sockets = await io.fetchSockets();
const roomSockets = await io.in("room1").fetchSockets();
for (const s of sockets) {
  s.id; s.handshake; s.rooms; s.data;      // readable
  s.emit("hello");                         // writable operations work remotely
  s.join("room2"); s.leave("room2");
  s.disconnect();
}
```

**Practical examples**

```js
// a user was removed from an organisation → kick all their sockets out of the org room
io.in(`user:${userId}`).socketsLeave(`org:${orgId}`);

// a user was banned → disconnect every device
io.in(`user:${userId}`).disconnectSockets(true);

// how many people are viewing document 42 right now (cluster-wide)?
const viewers = (await io.in("doc:42").fetchSockets()).map((s) => s.data.user.name);
```

> **Performance warning:** `fetchSockets()` across a cluster asks *every* node and
> waits for responses (with a timeout, default 5000 ms in the Redis adapter's
> `requestsTimeout`). Don't call it on hot paths (every message). For presence counts at
> scale, maintain counters in Redis instead (Chapter 13).

`socket.data` is the place to store per-socket info (user id, name, roles). It is
**serialized** and returned by `fetchSockets()` on other nodes, so keep it small and
JSON-serializable.

---

## 4.4 Broadcasting — all the flavours

**Broadcast** = send to many sockets with one call. The server builds/encodes the packet
**once** and writes it to every target socket (efficient).

```js
io.emit("x");                       // all sockets in the main namespace "/"
io.of("/admin").emit("x");          // all sockets in namespace /admin
socket.broadcast.emit("x");         // all sockets in the socket's namespace except the sender
socket.to("r").emit("x");           // room r, except sender
io.to("r").emit("x");               // room r
io.except("r").emit("x");           // all except room r
io.local.emit("x");                 // only sockets connected to THIS server node (cluster)
io.volatile.emit("x");              // droppable
io.compress(false).emit("x");
io.timeout(5000).emit("x", (err, responses) => {}); // with acks
```

Modifiers chain in any order before `emit`:

```js
io.of("/game").to("match:7").except("spectators").volatile.compress(false).emit("tick", state);
```

### The "broadcast to everyone except the sender" is a server responsibility

The client can't broadcast. Pattern:

```js
// client
socket.emit("cursor:move", { x, y });

// server: relay to others in the same doc
socket.on("cursor:move", (pos) => {
  socket.to(`doc:${socket.data.docId}`).volatile.emit("cursor:move", { id: socket.id, ...pos });
});
```

### Broadcasting from multiple servers

With several Socket.IO servers (processes/containers), `io.emit()` on server A only
reaches clients connected to server A **unless you configure an adapter** (Redis etc.)
that forwards the broadcast to all other servers. That's Chapter 8. `io.local` lets you
deliberately skip the adapter.

---

## 4.5 Namespaces

### What a namespace is

A **namespace** is a communication channel that lets you **split the logic of your
application over a single shared connection** (this sharing is called **multiplexing**).

Each namespace has its own:

- event handlers (`io.of("/admin").on("connection", ...)`),
- rooms (independent per namespace),
- middleware (`io.of("/admin").use(...)`).

The default (main) namespace is `"/"`. `io.sockets` is an alias for `io.of("/")`, and
`io.on("connection")`, `io.emit()`, `io.use()`, `io.to()` are shortcuts for the main
namespace.

```js
// server
io.of("/").on("connection", (socket) => {});        // same as io.on("connection")
io.of("/orders").on("connection", (socket) => {});
io.of("/users").on("connection", (socket) => {});

// client
const mainSocket = io("https://example.com");          // namespace "/"
const ordersSocket = io("https://example.com/orders"); // namespace "/orders"
const usersSocket = io("https://example.com/users");   // namespace "/users"
// ↑ all three share ONE underlying WebSocket connection (multiplexing)
```

### When to use namespaces vs rooms (classic interview question)

| | Namespace | Room |
|---|---|---|
| Who decides membership | **Client** chooses which namespace to connect to | **Server** joins/leaves sockets |
| Separate handlers/middleware | ✅ Yes | ❌ No (same handlers) |
| Scope | Separation of **concerns/features/permissions** | **Grouping of users** for broadcasting |
| Number | Few, mostly static (`/`, `/admin`, `/chat`) — or dynamic for multi-tenancy | Many, dynamic (one per conversation/user/doc) |
| Connection | Each namespace = separate `Socket` object; shared transport | Rooms live inside a namespace |
| Typical use | `/admin` with admin-only auth middleware; separating product areas; multi-tenant `/tenant-<id>` | chat channels, user rooms, game matches |

Rule of thumb: **use rooms by default**; use namespaces when you need different
middleware/authorization or a separate set of event handlers.

### Namespace middleware (per-namespace auth)

```js
const admin = io.of("/admin");

admin.use(async (socket, next) => {
  const user = await verify(socket.handshake.auth.token);
  if (user?.role !== "admin") return next(new Error("forbidden"));
  socket.data.user = user;
  next();
});

admin.on("connection", (socket) => {
  socket.on("user:ban", banHandler);
});
```

Clients connecting to `/admin` without being admins get `connect_error`; their
connection to `/` is unaffected.

### Dynamic namespaces

Create namespaces on the fly (great for **multi-tenancy**):

```js
// with a RegExp
const workspaces = io.of(/^\/workspace-\w+$/);

workspaces.use(tenantAuth);                   // middleware for every matching child namespace

workspaces.on("connection", (socket) => {
  const workspace = socket.nsp;               // the child Namespace, e.g. "/workspace-acme"
  console.log(workspace.name);
  workspace.emit("hello");                    // broadcast to everyone in THIS child namespace
});

// broadcast to ALL child namespaces matched by the parent
workspaces.emit("maintenance", "in 5 minutes");
```

```js
// with a function (async check, e.g. tenant exists in DB)
io.of(async (name, auth, next) => {
  const ok = name.startsWith("/tenant-") && (await tenants.exists(name.slice(8)));
  next(null, ok);   // (error, allowed)
});
```

- Child namespaces are created on first connection. With
  `cleanupEmptyChildNamespaces: true` (v4.6+, server option), a child namespace with no
  sockets left is removed (prevents memory growth with many tenants).
- Connecting to a namespace that doesn't exist (and doesn't match any dynamic pattern)
  gives the client a `connect_error` with message **`"Invalid namespace"`**.

### Multiplexing in detail (client side)

```js
const a = io("https://example.com");        // Manager #1 created for this URL
const b = io("https://example.com/admin");  // reuses Manager #1 → same connection
const c = io("https://example.com/admin", { forceNew: true }); // new Manager → new connection
const d = io("https://example.com", { multiplex: false });     // new Manager too
```

- A client-side **`Manager`** owns the Engine.IO connection (transport, reconnection);
  each **`Socket`** belongs to a Manager and represents one namespace.
- Access the Manager via `socket.io` (yes, the property is literally named `io`).
- Two `io()` calls for the **same URL and the same namespace**: the client's lookup
  function notices the namespace is already used on the cached Manager and creates a
  **new Manager → a second, separate connection**. This is a classic source of
  "duplicate connections" bugs (e.g. calling `io()` inside a React component that
  re-renders). Create the socket **once** and share it (Chapter 9).
- Two `io()` calls for the same URL but **different namespaces** reuse the cached
  Manager → one shared connection (multiplexing).
- **Query parameters/`extraHeaders` are per Manager**, shared by all namespaces on it;
  **`auth` is per namespace Socket**.

### Namespace-level vs main-namespace properties

| Property | Meaning |
|---|---|
| `socket.nsp` | the Namespace the socket belongs to |
| `io.of("/x").sockets` | `Map<SocketId, Socket>` of **local** sockets in this namespace |
| `io.of("/x").adapter` | the adapter instance for this namespace |
| `io._nsps` | `Map<string, Namespace>` of all namespaces (private-ish) |

---

## 4.6 Socket IDs — what they are and aren't

- `socket.id` (Socket.IO) is a random 20-character id, generated per namespace connection.
  It is **not** the same as the Engine.IO id (`socket.conn.id`) since v3 — exposing the
  engine id would allow session hijacking of the underlying connection.
- On the **client**, `socket.id` is **undefined until connected** and **changes after
  each reconnection** (unless connection state recovery restored the session).
- Since it's random and ephemeral, **don't use it as an identity**; use your
  authenticated user id. Don't trust a socket id *sent by a client* as authorization
  ("delete messages of socket X") — always use `socket.data.user` from auth.
- You can customise the Engine.IO id with `io.engine.generateId = (req) => uuid()`.
  (The Socket.IO-level id is generated internally.)

---

## 4.7 Worked example: a chat with channels and private messages

```js
io.use(authMiddleware); // → socket.data.user = { id, name }

io.on("connection", (socket) => {
  const { id: userId, name } = socket.data.user;
  socket.join(`user:${userId}`);

  socket.on("channel:join", async ({ channelId }, ack) => {
    if (!(await acl.canJoin(userId, channelId))) return ack?.({ ok: false, error: "FORBIDDEN" });
    await socket.join(`channel:${channelId}`);
    socket.to(`channel:${channelId}`).emit("channel:user-joined", { channelId, userId, name });
    ack?.({ ok: true, data: { history: await messages.last(channelId, 50) } });
  });

  socket.on("channel:leave", async ({ channelId }, ack) => {
    await socket.leave(`channel:${channelId}`);
    socket.to(`channel:${channelId}`).emit("channel:user-left", { channelId, userId });
    ack?.({ ok: true });
  });

  socket.on("channel:message", async ({ channelId, text, clientMsgId }, ack) => {
    if (!socket.rooms.has(`channel:${channelId}`)) return ack?.({ ok: false, error: "NOT_A_MEMBER" });
    const msg = await messages.save({ channelId, userId, text, clientMsgId }); // persisted first!
    io.to(`channel:${channelId}`).emit("channel:message", msg); // includes sender's other tabs
    ack?.({ ok: true, data: { id: msg.id } });
  });

  socket.on("dm:send", async ({ toUserId, text }, ack) => {
    const msg = await dms.save({ from: userId, to: toUserId, text });
    io.to(`user:${toUserId}`).to(`user:${userId}`).emit("dm:message", msg); // both parties, all devices
    ack?.({ ok: true });
  });
});
```

Things to notice (interviewers notice them too):
- membership is **authorized server-side** before joining;
- messages are **persisted before broadcasting** (so reconnecting clients can fetch them);
- the sender's **other tabs** get the message (`io.to` not `socket.to`);
- DMs use **user rooms**, not socket ids;
- every command is **acked**.

---

## 4.8 Chapter summary

- Rooms: server-side groups; join/leave on server; auto-created/deleted; auto-left on
  disconnect; every socket is in its own id-room.
- `io.to()` includes sender; `socket.to()`/`socket.broadcast` excludes sender; multiple
  `to()` = union (no duplicates); `except()` excludes.
- Utility methods: `socketsJoin`, `socketsLeave`, `disconnectSockets`, `fetchSockets` —
  cluster-aware.
- Use the `user:<id>` room pattern instead of a userId→socketId map.
- Namespaces: client-chosen channels with their own handlers, middleware and rooms,
  multiplexed over one connection; dynamic namespaces for multi-tenancy.
- Use rooms for grouping, namespaces for separation of concerns/permissions.

Next: [Chapter 5 — Connection lifecycle](05-connection-lifecycle.md)
