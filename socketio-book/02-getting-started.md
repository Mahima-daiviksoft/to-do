# Chapter 2 — Getting Started: Your First Server and Client

> **Goal:** build a working real-time app from scratch, understand every line, and learn the
> different ways to set up the server (standalone, with `http`, with Express, with HTTPS,
> with other frameworks) and the client (CDN, bundler, Node).

---

## 2.1 Install

```bash
# server
npm install socket.io

# client (when using a bundler such as Vite/Webpack, or in Node.js)
npm install socket.io-client
```

- `socket.io` (server) **also serves the client bundle** by default at
  `/socket.io/socket.io.js` (option `serveClient: true`). Handy for demos; in real projects
  you normally install `socket.io-client` via npm and bundle it.
- Requirements: a supported Node.js version (Node 10+ is technically supported by
  socket.io 4; use a current LTS in practice).

Optional performance add-ons for the `ws` WebSocket engine (native modules):

```bash
npm install --save-optional bufferutil utf-8-validate
```

(See Chapter 11. On recent Node versions `ws` can use Node's built-in `buffer.isUtf8()`,
so `utf-8-validate` matters less; `bufferutil` still speeds up frame masking/unmasking.)

---

## 2.2 The smallest possible server

```js
// server.js  (CommonJS)
const { Server } = require("socket.io");

const io = new Server(3000); // creates an HTTP server listening on port 3000

io.on("connection", (socket) => {
  console.log("a client connected:", socket.id);

  socket.emit("welcome", "Hello from the server!"); // send to THIS client

  socket.on("ping-me", (msg) => {                    // listen to THIS client
    console.log("client says:", msg);
  });

  socket.on("disconnect", (reason) => {
    console.log("client left:", socket.id, reason);
  });
});
```

ESM version:

```js
// server.mjs
import { Server } from "socket.io";
const io = new Server(3000);
```

**Line-by-line (ELI5):**

- `new Server(3000)` — "Open a pizza shop at door number 3000."
- `io.on("connection", (socket) => {...})` — "Every time a new customer walks in, give me
  their personal phone line (`socket`)."
- `socket.id` — a random unique id for this connection (e.g. `"KykvYCRwmIsIifIyAAAA"`).
  **It changes on every reconnection** — never use it as a user id.
- `socket.emit("welcome", ...)` — "Say 'welcome' to *this* customer only."
- `socket.on("ping-me", ...)` — "When *this* customer says 'ping-me', do this."
- `socket.on("disconnect", ...)` — "When this customer leaves (or the line dies)."

## 2.3 The smallest possible client (Node.js)

```js
// client.js
const { io } = require("socket.io-client");

const socket = io("http://localhost:3000");

socket.on("connect", () => {
  console.log("connected with id", socket.id);
  socket.emit("ping-me", "hi server!");
});

socket.on("welcome", (msg) => console.log(msg));

socket.on("disconnect", (reason) => console.log("disconnected:", reason));
```

Run `node server.js` then `node client.js`. You'll see both sides talk.

## 2.4 The browser client — three ways

### (a) Served by the server itself

```html
<script src="/socket.io/socket.io.js"></script>
<script>
  const socket = io(); // no URL → connects to the host that served the page
</script>
```

### (b) From a CDN

```html
<script src="https://cdn.socket.io/4.8.1/socket.io.min.js"
        integrity="(use the SRI hash from the official docs)"
        crossorigin="anonymous"></script>
<script>
  const socket = io("https://api.example.com");
</script>
```

(Also available from jsDelivr/cdnjs/unpkg. Pin the exact version.)

### (c) With a bundler (the normal way in React/Vue/Angular apps)

```js
import { io } from "socket.io-client";
const socket = io("https://api.example.com");
```

Bundle size: the 4.8.4 `socket.io.min.js` is ~47 KB minified, ~14.8 KB gzipped. There is also a
`socket.io.msgpack.min.js` build using the msgpack parser, and an "es" build for
tree-shaking.

### URL forms of `io()`

```js
io();                                 // same origin, main namespace "/"
io("/admin");                         // same origin, namespace "/admin"
io("https://api.example.com");        // other origin, namespace "/"
io("https://api.example.com/admin");  // other origin, namespace "/admin"
io("https://api.example.com", { path: "/my-custom-path/" }); // custom HTTP path
```

> **Very common confusion:** the part after the host in the URL is the **namespace**, not
> the HTTP path! `io("https://example.com/chat")` connects to namespace `/chat` using the
> HTTP path `/socket.io/`. To change the HTTP path you use the `path` option (and the same
> `path` on the server).

---

## 2.5 Attaching to an existing HTTP server (the usual way)

Your app usually already has an HTTP server (for REST endpoints, static files…). Attach
Socket.IO to it so both share the **same port**.

### With Node's `http`

```js
const { createServer } = require("node:http");
const { Server } = require("socket.io");

const httpServer = createServer((req, res) => {
  res.end("regular HTTP response");
});

const io = new Server(httpServer, { /* options */ });

io.on("connection", (socket) => { /* ... */ });

httpServer.listen(3000);
```

Socket.IO intercepts only requests whose path starts with `/socket.io/` (configurable); all
other requests go to your handler.

### With Express (most common in interviews and in companies)

```js
const express = require("express");
const { createServer } = require("node:http");
const { Server } = require("socket.io");

const app = express();
const httpServer = createServer(app);   // <-- wrap the express app in an http server
const io = new Server(httpServer, {
  cors: { origin: "http://localhost:5173" }, // the frontend dev server origin
});

app.get("/", (req, res) => res.send("API is up"));

io.on("connection", (socket) => {
  console.log("connected", socket.id);
});

httpServer.listen(3000, () => console.log("listening on :3000"));
```

> **Bug #1 of all time:** calling `app.listen(3000)` instead of `httpServer.listen(3000)`.
> `app.listen()` creates a **new, different** HTTP server that Socket.IO is not attached to,
> so the client gets `404` on `/socket.io/...`. Always listen on the server you passed to
> `new Server()`.
>
> (Alternatively: `const server = app.listen(3000); const io = new Server(server);` — this
> works because `app.listen` *returns* the http server it created.)

### With HTTPS

```js
const { readFileSync } = require("node:fs");
const { createServer } = require("node:https");
const { Server } = require("socket.io");

const httpsServer = createServer({
  key: readFileSync("/path/to/key.pem"),
  cert: readFileSync("/path/to/cert.pem"),
});
const io = new Server(httpsServer);
httpsServer.listen(443);
```

In production TLS is usually terminated by a load balancer / reverse proxy (nginx, ALB,
Cloudflare), and Node listens on plain HTTP behind it. The client still uses
`https://`/`wss://`.

### With HTTP/2

```js
const { readFileSync } = require("node:fs");
const { createSecureServer } = require("node:http2");
const { Server } = require("socket.io");

const httpServer = createSecureServer({
  allowHTTP1: true, // REQUIRED: WebSocket upgrade still uses HTTP/1.1
  key: readFileSync("key.pem"),
  cert: readFileSync("cert.pem"),
});
const io = new Server(httpServer);
httpServer.listen(3000);
```

### With other frameworks

- **Fastify:** `fastify-socket.io` plugin, or `new Server(fastify.server)` after
  `fastify.ready()`.
- **Koa:** `const server = http.createServer(app.callback()); new Server(server)`.
- **NestJS:** `@nestjs/websockets` + `@nestjs/platform-socket.io`, `@WebSocketGateway()`
  (Chapter 9).
- **Next.js:** a custom server, or a separate Socket.IO service (Chapter 9). Serverless
  functions (Vercel functions, AWS Lambda) are **not** suitable for hosting long-lived
  Socket.IO servers.
- **Deno / Bun:** there is an official Deno port of the server; Bun runs the Node package
  through its Node compatibility layer. Test your exact runtime version before relying on
  it in production.
- **uWebSockets.js:** `io.attachApp(uwsApp)` (Chapter 11).

### Standalone (Socket.IO creates the HTTP server)

```js
const io = new Server(3000, { /* options */ });
// or
const io = new Server({ /* options */ });
io.listen(3000);
```

---

## 2.6 CORS — you will hit this on day one

If the page is served from `http://localhost:5173` and the Socket.IO server runs at
`http://localhost:3000`, the browser treats that as **cross-origin**. Since v3 Socket.IO
does **not** allow cross-origin requests by default. Symptom in the browser console:

```
Access to XMLHttpRequest at 'http://localhost:3000/socket.io/?EIO=4&transport=polling&t=...'
from origin 'http://localhost:5173' has been blocked by CORS policy
```

Fix on the server:

```js
const io = new Server(httpServer, {
  cors: {
    origin: ["http://localhost:5173", "https://app.example.com"],
    methods: ["GET", "POST"],      // optional; defaults of the `cors` package are fine
    credentials: true,             // only if you need cookies (see below)
  },
});
```

The `cors` option is passed to the popular [`cors`](https://www.npmjs.com/package/cors)
npm package, so it accepts the same options (`origin` can be a string, array, RegExp, or a
function `(origin, callback) => callback(null, true|false)`).

If you need cookies (e.g. session-cookie authentication), the **client** must also set:

```js
const socket = io("https://api.example.com", { withCredentials: true });
```

and the server must set `credentials: true` **and** a specific origin (not `"*"` —
browsers reject `Access-Control-Allow-Origin: *` with credentials).

> **Important nuance (interview favourite):** CORS applies to the **HTTP long-polling**
> requests (they are XHR/fetch). The **WebSocket** handshake is **not** subject to CORS in
> browsers — any website can open a WebSocket to your server. So to protect WebSocket
> connections from malicious sites you must check the `Origin` header yourself (with
> `allowRequest`) and/or use proper authentication (tokens). See Chapter 6 (Cross-Site
> WebSocket Hijacking).

---

## 2.7 A complete first project: a mini chat (with explanations)

### Server — `index.js`

```js
const express = require("express");
const { createServer } = require("node:http");
const { join } = require("node:path");
const { Server } = require("socket.io");

const app = express();
const server = createServer(app);
const io = new Server(server);

app.get("/", (req, res) => {
  res.sendFile(join(__dirname, "index.html"));
});

io.on("connection", (socket) => {
  // 1. Tell everybody else someone joined
  socket.broadcast.emit("system", "A user joined");

  // 2. When this user sends a chat message, send it to EVERYONE (including the sender)
  socket.on("chat message", (msg, ack) => {
    if (typeof msg !== "string" || msg.length === 0 || msg.length > 500) {
      return typeof ack === "function" && ack({ ok: false, error: "invalid message" });
    }
    io.emit("chat message", { text: msg, from: socket.id, at: Date.now() });
    if (typeof ack === "function") ack({ ok: true });
  });

  // 3. Typing indicator — to everyone except the sender, and it's OK to lose it
  socket.on("typing", () => socket.broadcast.volatile.emit("typing", socket.id));

  socket.on("disconnect", () => io.emit("system", "A user left"));
});

server.listen(3000, () => console.log("http://localhost:3000"));
```

### Client — `index.html`

```html
<!doctype html>
<html>
  <body>
    <ul id="messages"></ul>
    <p id="typing"></p>
    <form id="form"><input id="input" autocomplete="off" /><button>Send</button></form>

    <script src="/socket.io/socket.io.js"></script>
    <script>
      const socket = io();
      const form = document.getElementById("form");
      const input = document.getElementById("input");
      const messages = document.getElementById("messages");

      function addLine(text) {
        const li = document.createElement("li");
        li.textContent = text;           // textContent, NOT innerHTML → prevents XSS
        messages.appendChild(li);
      }

      form.addEventListener("submit", (e) => {
        e.preventDefault();
        if (!input.value) return;
        socket.emit("chat message", input.value, (res) => {
          if (!res.ok) alert(res.error);   // server acknowledged
        });
        input.value = "";
      });

      input.addEventListener("input", () => socket.emit("typing"));

      socket.on("chat message", (m) => addLine(m.from.slice(0, 5) + ": " + m.text));
      socket.on("system", (t) => addLine("[system] " + t));
      socket.on("typing", (id) => {
        document.getElementById("typing").textContent = id.slice(0, 5) + " is typing…";
        clearTimeout(window.__t);
        window.__t = setTimeout(() => (document.getElementById("typing").textContent = ""), 1000);
      });
    </script>
  </body>
</html>
```

**What you just used (each is a later chapter):**

| Code | Meaning |
|---|---|
| `socket.emit` | send to one client |
| `io.emit` | send to all connected clients (of the main namespace) |
| `socket.broadcast.emit` | send to all **except** this socket |
| `volatile` | OK to drop if the client isn't ready to receive |
| `(msg, ack) => ack(...)` | acknowledgement (request/response) |
| `textContent` | basic XSS prevention for user-generated content |

---

## 2.8 The "emit cheat-sheet" (memorise — asked in nearly every interview)

```js
io.on("connection", (socket) => {
  // to the sender only
  socket.emit("hello", "you");

  // to all clients in the current namespace, including the sender
  io.emit("hello", "everyone");

  // to all clients except the sender
  socket.broadcast.emit("hello", "everyone but you");

  // to all clients in room "game", except the sender
  socket.to("game").emit("hello", "players but you");

  // to all clients in room "game1" and/or "game2", except the sender
  socket.to("game1").to("game2").emit("hello");

  // to all clients in room "game", including the sender
  io.in("game").emit("hello");          // .in() is an alias of .to()

  // to all clients in namespace "/admin"
  io.of("/admin").emit("hello");

  // to room "notifications" in namespace "/admin"
  io.of("/admin").to("notifications").emit("hello");

  // to an individual socket by id (private message) — each socket auto-joins a room named by its id
  io.to(otherSocketId).emit("hello");

  // to everyone except those in room "banned"
  io.except("banned").emit("hello");

  // with acknowledgement
  socket.emit("question", "do you like pizza?", (answer) => {});

  // with acknowledgement + timeout
  socket.timeout(5000).emit("question", (err, answer) => {});

  // promise style
  const answer = await socket.timeout(5000).emitWithAck("question");

  // without compression
  socket.compress(false).emit("uncompressed", "that's rough");

  // may be dropped if the client is not ready to receive
  socket.volatile.emit("maybe", "do you really need it?");

  // to all clients on THIS node only (when using multiple nodes + adapter)
  io.local.emit("hi", "my lovely babies");

  // to all connected clients
  io.emit("an event sent to all connected clients");
});
```

Client side:

```js
socket.emit("hello", "server");                       // basic
socket.emit("question", (answer) => {});              // with ack
socket.timeout(5000).emit("question", (err, answer) => {}); // ack + timeout
const answer = await socket.emitWithAck("question");  // promise (no timeout unless ackTimeout/timeout set)
socket.volatile.emit("mouse-move", { x, y });         // droppable
socket.compress(false).emit("x");
```

> A **client cannot broadcast**. `socket.broadcast` exists **only on the server**. If a
> client wants to send to others, it sends to the server and the server relays.

---

## 2.9 Server options at a glance (details in later chapters)

```js
const io = new Server(httpServer, {
  // ---- Socket.IO-level options ----
  path: "/socket.io/",                // HTTP path handled
  serveClient: true,                  // serve /socket.io/socket.io.js
  adapter: undefined,                 // e.g. createAdapter(pub, sub) for Redis
  parser: undefined,                  // custom parser e.g. require("socket.io-msgpack-parser")
  connectTimeout: 45000,              // ms a client has to join a namespace after the Engine.IO handshake
  connectionStateRecovery: undefined, // { maxDisconnectionDuration: 120000, skipMiddlewares: true }
  cleanupEmptyChildNamespaces: false, // for dynamic namespaces

  // ---- Engine.IO-level options ----
  pingInterval: 25000,                // ms between server pings
  pingTimeout: 20000,                 // ms to wait for a pong before closing
  upgradeTimeout: 10000,              // ms to complete a transport upgrade
  maxHttpBufferSize: 1e6,             // max message size in bytes (1 MB) before closing the socket
  allowRequest: undefined,            // (req, callback) => callback(err, allowed)
  transports: ["polling", "websocket"], // (+ "webtransport" if enabled)
  allowUpgrades: true,
  perMessageDeflate: false,           // WebSocket compression (off by default)
  httpCompression: true,              // gzip/deflate for polling (threshold 1024 bytes)
  wsEngine: require("ws").Server,     // WebSocket server implementation
  cors: undefined,                    // options passed to the `cors` package
  cookie: false,                      // the "io" cookie (sticky session helper)
  allowEIO3: false,                   // accept Socket.IO v2 clients
  initialPacket: undefined,
});
```

All defaults above were verified against `socket.io@4.8.4` / `engine.io@6.6.11` source.

## 2.10 Client options at a glance

```js
const socket = io("https://api.example.com", {
  // ---- Manager (connection/reconnection) options ----
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 1000,     // initial delay
  reconnectionDelayMax: 5000,  // max delay
  randomizationFactor: 0.5,    // jitter: delay ± 50%
  timeout: 20000,              // connection timeout (before connect_error)
  autoConnect: true,           // connect immediately on io()
  parser: undefined,

  // ---- Socket options ----
  auth: { token: "abc" },      // or (cb) => cb({ token: getToken() })
  ackTimeout: undefined,       // default timeout for acks (used with retries)
  retries: undefined,          // number of retries for emits (at-least-once)

  // ---- Engine.IO (low-level) options ----
  path: "/socket.io/",
  transports: ["polling", "websocket", "webtransport"], // order to try (client default)
  upgrade: true,               // try to upgrade polling -> websocket
  rememberUpgrade: false,      // skip polling next time if WS worked before
  tryAllTransports: false,     // (4.8+) try next transport if the first fails
  query: { roomHint: "x" },    // extra query params on the handshake
  extraHeaders: { "x-foo": "bar" }, // NOT applied to browser WebSocket (browser API can't set headers)
  withCredentials: false,      // send cookies cross-origin (polling)
  forceNew: false,             // create a new Manager (separate connection)
  multiplex: true,             // share connection across namespaces
  closeOnBeforeunload: false,  // close silently on page unload
  timestampRequests: true,     // cache-buster `t=` on polling requests
});
```

> On the client the default `transports` includes `"webtransport"`, but it is only tried
> if the server enables it — with the default server setup you get polling → websocket.

---

## 2.11 Project structure for anything bigger than a demo

Don't put everything inside `io.on("connection")`. A maintainable layout:

```
src/
  server.ts              # creates http server + io, wires everything
  socket/
    index.ts             # createSocketServer(httpServer) → io
    middlewares/
      auth.ts            # io.use(authMiddleware)
      rateLimit.ts
    handlers/
      chat.handler.ts    # registerChatHandlers(io, socket)
      presence.handler.ts
      notification.handler.ts
    schemas/             # zod/joi payload schemas
    events.ts            # TypeScript event maps (shared with client!)
  services/              # business logic (NOT socket-aware)
  repositories/          # DB access
```

```js
// socket/handlers/chat.handler.js
module.exports = (io, socket) => {
  const sendMessage = async (payload, ack) => { /* validate → service → emit */ };
  const deleteMessage = async (payload, ack) => { /* ... */ };

  socket.on("chat:send", sendMessage);
  socket.on("chat:delete", deleteMessage);
};

// socket/index.js
const registerChatHandlers = require("./handlers/chat.handler");
const registerPresenceHandlers = require("./handlers/presence.handler");

io.on("connection", (socket) => {
  registerChatHandlers(io, socket);
  registerPresenceHandlers(io, socket);
});
```

This is the structure recommended by the official docs ("application structure") and
used by most companies. Chapter 13 expands it into a full organisational standard.

---

## 2.12 Chapter summary

- `new Server(httpServer, options)` attaches Socket.IO to an existing server; **listen on
  that same server**.
- The client connects with `io(url, options)`; the URL path is the **namespace**; the HTTP
  path is the `path` option.
- CORS must be configured since v3; WebSocket handshakes are not protected by CORS.
- Emit cheat sheet: `socket.emit`, `io.emit`, `socket.broadcast.emit`, `socket.to(room)`,
  `io.to(room)`, `io.of(nsp)`, `io.except()`, acks, `timeout`, `emitWithAck`, `volatile`,
  `compress`, `local`.
- Organise handlers by feature, keep business logic out of socket handlers.

Next: [Chapter 3 — Events and acknowledgements](03-events-and-acknowledgements.md)
