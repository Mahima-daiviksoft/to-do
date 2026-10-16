# Chapter 23 — Hands-On Labs and Exercises (with Solutions)

> **Goal:** turn reading into skill. Four labs let you *see* the protocol, the
> load-balancer behaviour and session recovery with your own eyes; then 18 exercises from
> beginner to senior, each with a solution.
>
> **Every lab output below is real** (Socket.IO 4.8.4, Node 22, nginx 1.24, HAProxy 2.8,
> Redis 7). Exercises 5, 6 and 7 were run as automated tests and pass; the others reuse
> code already verified in earlier chapters (references given).

Setup for all labs:

```bash
mkdir sio-labs && cd sio-labs && npm init -y
npm install socket.io socket.io-client @socket.io/redis-adapter redis
```

---

## Lab A — Speak the protocol by hand with `curl`

**Goal:** understand exactly what a Socket.IO client does, by doing it yourself.

```js
// lab-server.js
const { Server } = require("socket.io");
const io = new Server(3000);
io.on("connection", (socket) => {
  socket.on("hello", (name, ack) => ack(`hi ${name}!`));
  socket.emit("welcome", "you are connected");
});
```

Run `node lab-server.js`, then in another terminal:

```bash
B="http://localhost:3000/socket.io/?EIO=4&transport=polling"

# 1) Engine.IO handshake
OPEN=$(curl -s "$B"); echo "$OPEN"
SID=$(echo "${OPEN:1}" | python3 -c "import sys,json;print(json.load(sys.stdin)['sid'])")

# 2) Socket.IO CONNECT to the main namespace
curl -s -X POST -d '40' "$B&sid=$SID"

# 3) Receive (long-poll): the CONNECT reply + the "welcome" event, separated by \x1e
curl -s "$B&sid=$SID" | cat -v

# 4) Emit "hello" with ack id 1
curl -s -X POST -d '421["hello","curl"]' "$B&sid=$SID"

# 5) Receive the ack
curl -s "$B&sid=$SID"

# 6) A made-up session id (what you get without sticky sessions)
curl -s "http://localhost:3000/socket.io/?EIO=4&transport=polling&sid=doesnotexist"

# 7) An old (v2) client protocol version
curl -s "http://localhost:3000/socket.io/?EIO=3&transport=polling"
```

Real output:

```
1) 0{"sid":"wZjDFReArxzgbgpgAAAA","upgrades":["websocket"],"pingInterval":25000,"pingTimeout":20000,"maxPayload":1000000}
2) ok
3) 40{"sid":"d2PtE1O5hpksWhMjAAAA"}^^42["welcome","you are connected"]
4) ok
5) 431["hi curl!"]
6) {"code":1,"message":"Session ID unknown"}
7) {"code":5,"message":"Unsupported protocol version"}
```

(`^^` is how `cat -v` prints the `\x1e` record separator.)

**Questions to answer yourself** (answers in Chapter 7): Why are the two `sid` values
different? What does the `4` prefix mean? What would happen if you waited 45+ seconds
before step 3 without answering pings? *(The server sends `2` pings in the long-poll
responses; if you don't POST `3` back within `pingTimeout`, the session is closed.)*

---

## Lab B — Load balancers, sticky sessions and the Redis adapter

**Goal:** reproduce the two scaling problems (Chapter 8) and their fixes.

Requirements: Redis on `localhost:6379` (here: port 6390), nginx, HAProxy.

```js
// node.js — one Socket.IO node; run 3 copies on ports 5001-5003
const { Server } = require("socket.io");
const { createClient } = require("redis");
const { createAdapter } = require("@socket.io/redis-adapter");

(async () => {
  const pub = createClient({ url: "redis://localhost:6390" }); const sub = pub.duplicate();
  pub.on("error", console.error); sub.on("error", console.error);
  await Promise.all([pub.connect(), sub.connect()]);
  const port = Number(process.argv[2]);
  const io = new Server(port, { adapter: createAdapter(pub, sub) });
  io.engine.on("connection_error", (e) => console.log(`[${port}] engine error code=${e.code} ${e.message}`));
  io.on("connection", (s) => {
    s.join("all");
    s.on("whoami", (ack) => ack({ node: port, transport: s.conn.transport.name }));
    s.on("shout", (m) => io.to("all").emit("shout", `${m} (via node ${port})`));
  });
})();
```

```nginx
# nginx.conf (listen 8080) — the Chapter 8 configuration
events { worker_connections 1024; }
http {
  map $http_upgrade $connection_upgrade { default upgrade; '' close; }
  upstream socket_nodes {
    hash $remote_addr consistent;
    server 127.0.0.1:5001; server 127.0.0.1:5002; server 127.0.0.1:5003;
  }
  server {
    listen 8080;
    location /socket.io/ {
      proxy_pass http://socket_nodes;
      proxy_http_version 1.1;
      proxy_set_header Upgrade $http_upgrade;
      proxy_set_header Connection $connection_upgrade;
      proxy_set_header Host $host;
      proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
      proxy_read_timeout 120s;
      proxy_send_timeout 120s;
      proxy_buffering off;
    }
  }
}
```

```haproxy
# haproxy-cookie.cfg (port 8081): round-robin + cookie stickiness
defaults
  mode http
  timeout connect 5s
  timeout client 120s
  timeout server 120s
  timeout tunnel 1h
frontend http_front
  bind *:8081
  default_backend socket_nodes
backend socket_nodes
  balance roundrobin
  cookie SERVERID insert indirect nocache
  server app01 127.0.0.1:5001 check cookie app01
  server app02 127.0.0.1:5002 check cookie app02
  server app03 127.0.0.1:5003 check cookie app03
```

Make a second HAProxy config on port 8082 **without** the two `cookie` parts (pure
round-robin). Start: three nodes, `nginx -c $PWD/nginx.conf`, `haproxy -f haproxy-cookie.cfg`,
`haproxy -f haproxy-nosticky.cfg`. Then connect clients:

```js
// lbtest.js (abridged)
const test = (label, url, opts) => /* connect with reconnection:false, call "whoami" */;
await test("nginx (polling→websocket)", "http://localhost:8080");
await test("haproxy cookie sticky, polling only", "http://localhost:8081", { transports: ["polling"], withCredentials: true });
await test("haproxy cookie sticky, NO withCredentials", "http://localhost:8081", { transports: ["polling"] });
await test("haproxy NO sticky, polling only", "http://localhost:8082", { transports: ["polling"] });
await test("haproxy NO sticky, websocket only", "http://localhost:8082", { transports: ["websocket"] });
// cross-node broadcast: client A on node 5001 shouts, client B on node 5002 listens
```

Real results:

```
nginx (polling→websocket): OK node=5001 transport=websocket (client: websocket)
haproxy cookie sticky, polling only: OK (3 runs → nodes 5001, 5002, 5003)
haproxy cookie sticky, NO withCredentials: connect_error xhr poll error / xhr post error (3 of 3 runs)
haproxy NO sticky, polling only: connect_error xhr poll error
haproxy NO sticky, websocket only: OK node=5002 transport=websocket
cross-node broadcast received by B: hello (via node 5001)

node logs:  [5002] engine error code=1 Session ID unknown   (several, from the failing cases)
```

**What you learned:** (1) polling needs stickiness, WebSocket-only doesn't; (2) cookie
stickiness only works if the client sends the cookie back (`withCredentials: true` — in
browsers this matters for cross-origin setups); (3) the failure signature is always
`Session ID unknown` (engine error code 1); (4) the Redis adapter makes broadcasts cross
nodes.

**Extension:** remove `proxy_http_version 1.1` and the `Upgrade`/`Connection` headers from
the nginx config and watch the client stay on `polling`.

---

## Lab C — Connection state recovery

```js
const { Server } = require("socket.io");
const { io } = require("socket.io-client");

const srv = new Server(4600, { connectionStateRecovery: { maxDisconnectionDuration: 60_000 } });
srv.on("connection", (socket) => {
  console.log(`server: connection id=${socket.id} recovered=${socket.recovered} rooms=${[...socket.rooms]}`);
  if (!socket.recovered) {
    socket.join("news");
    socket.data.name = "alice";
  }
  socket.on("cut-me", () => socket.conn.close());     // simulate a network drop (recoverable)
});

const client = io("http://localhost:4600", { reconnectionDelay: 300, reconnectionDelayMax: 300 });
client.on("connect", () => console.log(`client: connect id=${client.id} recovered=${client.recovered}`));
client.on("disconnect", (r) => {
  console.log("client: disconnect", r);
  srv.to("news").emit("news", "sent while you were offline");   // broadcast during the outage
});
client.on("news", (m) => console.log("client: news ->", m));

let step = 0;
client.on("connect", async () => {
  if (++step === 1) {
    srv.to("news").emit("news", "first news");
    setTimeout(() => client.emit("cut-me"), 200);
  } else {
    const [s] = await srv.fetchSockets();
    console.log("server: socket.data after recovery =", s.data);
    setTimeout(() => { client.close(); srv.close(); }, 200);
  }
});
```

Real output:

```
server: connection id=kZ7vlpsnXqdTmdgRAAAA recovered=false rooms=kZ7vlpsnXqdTmdgRAAAA
client: connect id=kZ7vlpsnXqdTmdgRAAAA recovered=false
client: news -> first news
client: disconnect transport close
server: connection id=kZ7vlpsnXqdTmdgRAAAA recovered=true rooms=kZ7vlpsnXqdTmdgRAAAA,news
client: news -> sent while you were offline
client: connect id=kZ7vlpsnXqdTmdgRAAAA recovered=true
server: socket.data after recovery = { name: 'alice' }
```

**What you learned:** after recovery the **same socket id**, **rooms** and **`socket.data`**
come back, and the event broadcast during the outage is replayed. Note the order: the
missed `news` arrived **before** the client's `connect` handler ran — so register your
event listeners before connecting, and don't assume `connect` comes first.

**Extension:** change `socket.conn.close()` to `socket.disconnect()` (a deliberate
server-side disconnect) — recovery won't happen (`io server disconnect` is not a
recoverable reason and the client doesn't even reconnect automatically).

---

## Lab D — WebTransport

Follow Chapter 18 step by step (certificate, HTTP/3 server, Node client with the
`@fails-components/webtransport` implementation). Expected: `client: transport =
webtransport`, and with default client transports, polling → **upgrade to
webtransport**.

---

## Exercises

Levels: **[E]** entry, **[M]** mid, **[S]** senior. Try each before reading the solution.

### Exercise 1 [E] — Echo with acknowledgement
Write a server event `echo` that returns whatever it receives, and a client that prints
the response with a 3-second timeout.

<details><summary>Solution</summary>

```js
// server
io.on("connection", (socket) => {
  socket.on("echo", (data, ack) => { if (typeof ack === "function") ack(data); });
});
// client
const res = await socket.timeout(3000).emitWithAck("echo", { hello: "world" });
console.log(res); // { hello: "world" }
```
</details>

### Exercise 2 [E] — Join/leave rooms with notifications
Implement `room:join` / `room:leave`; notify **other** members (not the sender) with
`room:user-joined` / `room:user-left`; ack with `{ ok: true }`.

<details><summary>Solution</summary>

```js
socket.on("room:join", async (room, ack) => {
  await socket.join(room);
  socket.to(room).emit("room:user-joined", { id: socket.id, room });
  ack?.({ ok: true });
});
socket.on("room:leave", async (room, ack) => {
  await socket.leave(room);
  socket.to(room).emit("room:user-left", { id: socket.id, room });
  ack?.({ ok: true });
});
socket.on("disconnecting", () => {
  for (const room of socket.rooms) if (room !== socket.id) socket.to(room).emit("room:user-left", { id: socket.id, room });
});
```
In production: authorize the join first (Chapter 4.7).
</details>

### Exercise 3 [E] — Private messages that reach every device
User 42 has a phone and two tabs open. Send them a DM from a REST endpoint.

<details><summary>Solution</summary>

Join a user room at connection (after auth) and emit to it:
```js
io.on("connection", (socket) => socket.join(`user:${socket.data.user.id}`));
app.post("/api/dm", (req, res) => {
  io.to(`user:${req.body.to}`).emit("dm:new", { from: req.user.id, text: req.body.text });
  res.sendStatus(202);
});
```
Never map userId → socket.id (breaks with multiple devices, reconnections, multiple servers).
</details>

### Exercise 4 [M] — Typing indicator
Throttle to one event per 2 s per user, droppable, excluded sender, auto-expiring on the
receiver.

<details><summary>Solution</summary>See Chapter 13.3 (client throttle + `volatile`, server
`socket.to(room).volatile.emit`, receiver timeout of ~5 s).</details>

### Exercise 5 [M] — Auth with token expiry *(tested)*
Reject connections without a valid token. Disconnect the client exactly when its token
expires; the client must not auto-reconnect with the expired token.

<details><summary>Solution</summary>

```js
io.use((socket, next) => {
  const payload = verifyToken(socket.handshake.auth.token);   // throws/returns null if invalid
  if (!payload) return next(new Error("UNAUTHORIZED"));
  socket.data.exp = payload.exp * 1000;
  next();
});

io.on("connection", (socket) => {
  const timer = setTimeout(() => {
    socket.emit("auth:expired");
    socket.disconnect(true);
  }, Math.max(0, socket.data.exp - Date.now()));
  socket.on("disconnect", () => clearTimeout(timer));
});

// client
socket.on("disconnect", async (reason) => {
  if (reason === "io server disconnect") {        // no automatic reconnection for this reason
    await refreshToken();                          // auth is a function → picks up the new token
    socket.connect();
  }
});
```
Test result: bad token → `connect_error: UNAUTHORIZED`; valid short token → client
`disconnect` with reason `io server disconnect` and `socket.active === false`.
</details>

### Exercise 6 [M] — Rate limiter without libraries *(tested)*
Allow bursts of 5 events, refilling 5 tokens/second; over-limit events must receive
`{ ok: false, error: "RATE_LIMITED" }` via their ack and must not reach handlers.

<details><summary>Solution</summary>

```js
io.on("connection", (socket) => {
  let tokens = 5, last = Date.now();
  socket.use(([event, ...args], next) => {
    const now = Date.now();
    tokens = Math.min(5, tokens + ((now - last) / 1000) * 5);
    last = now;
    if (tokens < 1) {
      const ack = args.at(-1);
      if (typeof ack === "function") ack({ ok: false, error: "RATE_LIMITED" });
      return;                                  // don't call next(): the handler never runs
    }
    tokens -= 1;
    next();
  });
});
```
Test result: 8 simultaneous emits → 5 succeeded, 3 got `RATE_LIMITED`. In a cluster,
key the limiter by user id in Redis (Chapter 6.7).
</details>

### Exercise 7 [M] — A live poll with broadcast acks *(tested)*
A host starts a poll; every connected client answers; the host receives all answers
within 1 s — and still gets the answers that arrived if someone doesn't respond.

<details><summary>Solution</summary>

```js
socket.on("start-poll", (question, ack) => {
  // callback form: on timeout `err` is set, but `answers` still has every reply received
  io.timeout(1000).emit("poll", question, (err, answers) => ack({ complete: !err, answers }));
});

// voters
socket.on("poll", (question, ack) => ack("yes"));
```
Test result: with one connected client that never answered, the result was
`{ complete: false, answers: [3 answers] }`. The Promise form
(`await io.timeout(1000).emitWithAck(...)`) **rejected** in the same situation and lost
the 3 answers — that's why the callback form is the right choice here.
</details>

### Exercise 8 [M] — Fix the bug: duplicated messages
```js
socket.on("connect", () => {
  socket.on("chat", (m) => render(m));
});
```
<details><summary>Solution</summary>Each reconnection adds another listener. Register
`socket.on("chat", render)` once, outside the `connect` handler (Chapter 5.6).</details>

### Exercise 9 [M] — Fix the bug: events lost right after connecting
```js
io.on("connection", async (socket) => {
  const rooms = await db.roomsFor(socket.data.user.id);
  socket.join(rooms);
  socket.on("message:send", handler);
});
```
<details><summary>Solution</summary>Events sent by the client during the `await` find no
listener and are dropped (verified in Chapter 12, C3). Register handlers synchronously first,
or load the rooms in an `io.use` middleware and keep the `connection` handler synchronous
(Chapter 13.17).</details>

### Exercise 10 [M] — Fix the bug: "Cannot GET /socket.io/"
```js
const app = express();
const server = http.createServer(app);
const io = new Server(server);
app.listen(3000);
```
<details><summary>Solution</summary>`app.listen()` creates a second HTTP server that
Socket.IO isn't attached to. Use `server.listen(3000)`.</details>

### Exercise 11 [M] — Fix the bug: the ack callback receives `null` as the response
```js
socket.timeout(5000).emit("getUser", 42, (user) => console.log(user.name));
```
<details><summary>Solution</summary>With `.timeout()`, the first callback argument is the
error: `(err, user) => { if (err) …; console.log(user.name); }`.</details>

### Exercise 12 [M] — Write an integration test
Test that a broadcast to a room excludes the sender.
<details><summary>Solution</summary>Chapter 10.3, test "room broadcast excludes sender"
(and the lesson about not keeping "the current socket" in a shared variable).</details>

### Exercise 13 [S] — Online users across a cluster
Show "N users online" (distinct users, multiple tabs count once), correct with 10 nodes.
<details><summary>Solution</summary>Per-user connection sets in Redis with heartbeats and a
grace period (Chapter 13.2); count users with `SCARD` on a set of online user ids updated
when a user's connection count goes 0→1 / 1→0. Avoid `fetchSockets()` for this at scale.</details>

### Exercise 14 [S] — Never lose a chat message
Messages must survive offline periods, reloads and lost acks, without duplicates.
<details><summary>Solution</summary>Client outbox in IndexedDB with client ids + idempotent
server insert (Chapter 21, verified across a simulated reload) + server-side persistence
with sync-after-last-id on every connect + client dedupe (Chapter 5.9).</details>

### Exercise 15 [S] — Upload a 20 MB file over the socket
<details><summary>Solution</summary>Chunk it (e.g. 256 KB) and await an ack per chunk for
backpressure and resumability (Chapter 13.10) — or better, upload over HTTP to object
storage and use the socket only for progress.</details>

### Exercise 16 [S] — Kick a banned user everywhere, now
<details><summary>Solution</summary>
`io.in("user:" + id).emit("session:revoked"); io.in("user:" + id).disconnectSockets(true);`
— cluster-wide with an adapter; also revoke tokens so reconnection fails in middleware.</details>

### Exercise 17 [S] — Protect against Cross-Site WebSocket Hijacking
<details><summary>Solution</summary>`allowRequest` origin allow-list (verified: forged origin
→ HTTP 403 for polling / 400 for the WebSocket upgrade, engine code 4), token auth in
`auth` rather than ambient cookies, SameSite cookies (Chapter 6.5).</details>

### Exercise 18 [S] — Design review
Your team proposes: "one namespace per chat conversation, created dynamically; the client
connects to `/conv-<id>` to join a conversation." Review it.
<details><summary>Solution</summary>Namespaces are client-chosen, so authorization must be
done in namespace middleware for every connection; thousands of dynamic namespaces cost
memory (need `cleanupEmptyChildNamespaces`), each one is a separate Socket object and
CONNECT round-trip, and server-side membership changes (removing someone from a
conversation) are harder. Rooms (`conversation:<id>`) joined by the server after
authorization are simpler and cheaper; keep namespaces for separating concerns
(`/admin`) or tenants.</details>

Next: [Chapter 24 — Visual guide (diagrams)](24-visual-guide.md)
