# Chapter 6 — Middleware, Authentication and Security

> **Goal:** protect your real-time API like you protect your REST API — authenticate every
> connection, authorize every action, validate every payload, limit abuse, and know the
> attacks specific to WebSockets.

---

## 6.1 ELI5

Your server is a **party**.

- The **bouncer at the door** (connection middleware `io.use`) checks every guest's
  ticket (token/cookie) before they enter. No ticket → "Sorry, you can't come in"
  (`connect_error`).
- Inside, a **staff member near the VIP room** (per-event middleware `socket.use`, or
  checks inside handlers) checks if you're allowed to do specific things.
- Guests may try to **shout too much** (spam) → **rate limiting**.
- Guests may bring **weird packages** (bad payloads) → **validation**.
- A sneaky neighbour may try to **sneak in using your ticket** via a fake website →
  **Cross-Site WebSocket Hijacking** protection (origin checks).

---

## 6.2 The three middleware levels

| Level | API | Runs | Typical use |
|---|---|---|---|
| **HTTP / Engine.IO** | `io.engine.use((req, res, next) => …)` (v4.6+), or `allowRequest` option | On every HTTP request of the Engine.IO connection (handshake, polling requests, WebSocket upgrade request) | Express middleware: `express-session`, `helmet`, `passport`, cookie parsing |
| **Namespace (connection)** | `io.use((socket, next) => …)` / `io.of("/x").use(…)` | **Once per connection** to that namespace, before `connection` | Authentication, loading the user, connection limits |
| **Socket (per event)** | `socket.use(([event, ...args], next) => …)` | Every **incoming** event for that socket | Authorization per event, rate limiting, validation, logging |

### 6.2.1 Namespace (connection) middleware — `io.use`

```js
io.use((socket, next) => {
  // runs for every incoming connection on the main namespace
  if (isValid(socket.handshake.auth.token)) {
    next();                                   // accept
  } else {
    const err = new Error("not authorized");  // reject
    err.data = { code: "AUTH_INVALID", hint: "please log in again" }; // extra details for the client
    next(err);
  }
});
```

Rules and facts:

1. **You must call `next()`** — otherwise the client stays stuck "connecting". If it has
   not joined any namespace after `connectTimeout` (default 45 s), the server closes the
   underlying connection and the client retries — and gets stuck again. Forgetting
   `next()` in one code path is a classic bug ("client never connects, no error").
2. Middlewares run **in registration order**; `next(err)` stops the chain.
3. `next(err)` → the client receives **`connect_error`** with `err.message` and
   `err.data`. The client does **not** auto-reconnect after a middleware rejection
   (`socket.active === false`).
4. The socket is **not yet connected** in a middleware: don't emit to it or join rooms
   there — do that in the `connection` handler. Also, if the connection is eventually
   rejected, no `disconnect` event fires for it, so don't allocate resources in
   middleware that you only release on `disconnect`.
5. Middleware can be **async**:
   ```js
   io.use(async (socket, next) => {
     try {
       socket.data.user = await auth.verify(socket.handshake.auth.token);
       next();
     } catch (e) {
       next(new Error("unauthorized"));
     }
   });
   ```
6. Middlewares are per namespace. `io.use` = main namespace only. To protect
   `/admin`, use `io.of("/admin").use(...)`. (Dynamic namespace parent: `io.of(/regex/).use`.)
7. With connection state recovery and `skipMiddlewares: true`, middleware is skipped for
   recovered sessions.

### 6.2.2 Engine-level middleware — `io.engine.use` (v4.6+)

Runs Express-compatible middleware on the raw HTTP request(s):

```js
const session = require("express-session");

const sessionMiddleware = session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, secure: true, sameSite: "lax" },
});

app.use(sessionMiddleware);        // for Express routes
io.engine.use(sessionMiddleware);  // for Socket.IO requests

io.on("connection", (socket) => {
  const session = socket.request.session;   // same session as Express
  if (!session.userId) return socket.disconnect(true);
  socket.join(`user:${session.userId}`);
});
```

With **Passport** (session-based):

```js
function onlyForHandshake(middleware) {
  return (req, res, next) => {
    const isHandshake = req._query.sid === undefined; // first request has no sid yet
    if (isHandshake) middleware(req, res, next);
    else next();
  };
}

io.engine.use(onlyForHandshake(sessionMiddleware));
io.engine.use(onlyForHandshake(passport.session()));
io.engine.use(onlyForHandshake((req, res, next) => {
  if (req.user) next();
  else { res.writeHead(401); res.end(); }
}));

io.on("connection", (socket) => {
  const user = socket.request.user;
});
```

`helmet` can also be applied: `io.engine.use(helmet())`.

Before 4.6, people used a wrapper: `const wrap = (mw) => (socket, next) => mw(socket.request, {}, next); io.use(wrap(sessionMiddleware));` — you'll see it in older code bases.

> Note: with the WebSocket transport, there's **no `res` object to write headers to**
> after the upgrade, so cookies set in middleware during a WebSocket-only connection
> can't be sent back. That's why session cookies should be created by your normal HTTP
> login route, not by the socket.

### 6.2.3 `allowRequest` — the earliest gate

```js
const io = new Server(httpServer, {
  allowRequest: (req, callback) => {
    const origin = req.headers.origin;
    const allowed = ALLOWED_ORIGINS.includes(origin);
    callback(null, allowed);   // (err: string | null | undefined, success: boolean)
  },
});
```

- Runs for the handshake / upgrade requests, **before** any Socket.IO logic.
- A `false` result → HTTP 403 → Engine `connection_error` code 4 `Forbidden`; client
  `connect_error` (with `socket.active === true`, it will keep retrying — because at this
  level it looks like a transport failure).
- Great place for **origin checks** (against CSWSH), IP allow/deny lists, quick
  connection rate limiting.

### 6.2.4 Per-event middleware — `socket.use`

```js
io.on("connection", (socket) => {
  socket.use(([event, ...args], next) => {
    logger.debug({ event, sid: socket.id }, "incoming event");
    next();
  });

  socket.use(([event], next) => {
    if (event.startsWith("admin:") && !socket.data.user.isAdmin) {
      return next(new Error("forbidden"));
    }
    next();
  });

  socket.on("error", (err) => {
    // errors passed to next(err) in socket.use() land here; they are NOT sent to the client automatically
    socket.emit("app:error", { message: err.message });
  });
});
```

- Calling `next(err)` **prevents the event handler from running** and emits an
  **`error`** event on the server socket.
- The ack callback (if any) is the last element of `args` — you can reply directly:
  ```js
  socket.use(([event, ...args], next) => {
    const ack = typeof args.at(-1) === "function" ? args.at(-1) : null;
    if (rateLimited(socket)) return ack ? ack({ ok: false, error: "RATE_LIMITED" }) : undefined;
    next();
  });
  ```
- Not calling `next()` silently drops the event.

---

## 6.3 What's available on `socket.handshake`

```js
io.use((socket, next) => {
  socket.handshake === {
    headers: {/* the headers of the initial HTTP request */},
    time: "Fri Oct 16 2026 10:00:00 GMT+0000",  // creation date as string
    address: "::ffff:127.0.0.1",                // IP of the client (or of the proxy!)
    xdomain: false,                             // cross-domain?
    secure: false,                              // TLS?
    issued: 1760608800000,                      // creation date (ms timestamp)
    url: "/socket.io/?EIO=4&transport=polling&t=…", // request URL
    query: { EIO: "4", transport: "polling", t: "…" /* + your query params */ },
    auth: { token: "…" /* from the client's auth option */ },
  };
  next();
});
```

Also: `socket.request` (the first `http.IncomingMessage`), `socket.conn` (Engine.IO
socket: `socket.conn.transport.name`, `socket.conn.remoteAddress`, `socket.conn.protocol`).

### Getting the real client IP behind a proxy

`socket.handshake.address` is the IP of the **direct peer** — your load balancer.
Read `X-Forwarded-For` **only if you trust your proxy** (otherwise anyone can spoof it):

```js
function clientIp(socket) {
  const xff = socket.handshake.headers["x-forwarded-for"];
  return xff ? xff.split(",")[0].trim() : socket.handshake.address;
}
```

(With Cloudflare: `cf-connecting-ip`. With nginx, make sure it sets `X-Forwarded-For`/
`X-Real-IP` and that clients cannot reach Node directly.)

---

## 6.4 Authentication strategies

### 6.4.1 Token in the `auth` payload (recommended for SPAs/mobile)

```js
// client
const socket = io("https://api.example.com", {
  auth: { token: accessToken },
  // or dynamic (re-evaluated on every connection attempt → picks up refreshed tokens):
  // auth: (cb) => cb({ token: localStorage.getItem("accessToken") }),
});

// server
const jwt = require("jsonwebtoken");

io.use((socket, next) => {
  const token = socket.handshake.auth?.token;
  if (!token) return next(new Error("NO_TOKEN"));
  try {
    const payload = jwt.verify(token, process.env.JWT_PUBLIC_KEY, {
      algorithms: ["RS256"],            // ALWAYS pin algorithms
      audience: "realtime-api",
      issuer: "https://auth.example.com",
    });
    socket.data.user = { id: payload.sub, roles: payload.roles, exp: payload.exp };
    next();
  } catch (e) {
    const err = new Error(e.name === "TokenExpiredError" ? "TOKEN_EXPIRED" : "TOKEN_INVALID");
    next(err);
  }
});
```

**Why `auth` and not the query string?**

- The `auth` payload travels **inside the CONNECT packet** (the message body), not the URL.
- Query strings end up in **server/proxy/CDN access logs**, browser history and
  monitoring tools → token leak.
- `auth` is per **namespace** (each namespace can authenticate differently).

**Why not headers?** Browsers' `WebSocket` API **cannot set custom headers**.
`extraHeaders` works for polling in browsers and for everything in Node.js clients, but
in the browser the WebSocket handshake won't carry them. So `Authorization` headers are
unreliable for browser clients → use `auth` (or cookies).

### 6.4.2 Cookie / session-based

- Use `io.engine.use(sessionMiddleware)` (above).
- Cross-origin: client `withCredentials: true`; server `cors: { origin: <exact>, credentials: true }`;
  cookie `SameSite=None; Secure` if truly cross-site.
- Same-origin deployments (frontend and API on the same domain) avoid most of this pain.
- **Cookies are sent automatically by the browser** → vulnerable to **CSWSH** (next
  section) unless you check `Origin`.

### 6.4.3 Short-lived "socket ticket" pattern (high-security)

1. Client calls `POST /api/socket-ticket` (authenticated via normal session/JWT).
2. Server returns a **single-use, 30-second** random ticket stored in Redis
   (`ticket → userId`).
3. Client connects with `auth: { ticket }`.
4. Middleware atomically consumes the ticket (`GETDEL`) and loads the user.

Benefits: long-lived credentials never travel over the socket; replay window tiny.

### 6.4.4 Authorization is not authentication

Authenticating the connection is not enough. **Every event that touches data must check
permissions**:

```js
socket.on("conversation:join", async ({ conversationId }, ack) => {
  // ❌ trusting the client: "I'm allowed in conversation 42"
  // ✅ checking server-side:
  const allowed = await acl.isMember(socket.data.user.id, conversationId);
  if (!allowed) return ack?.({ ok: false, error: "FORBIDDEN" });
  await socket.join(`conversation:${conversationId}`);
  ack?.({ ok: true });
});
```

Never accept identity fields from the payload (`{ userId: 5, text }`) — always use
`socket.data.user.id`.

---

## 6.5 Cross-Site WebSocket Hijacking (CSWSH) — the WebSocket-specific attack

**ELI5:** a bad website (evil.com) tells your browser "please open a WebSocket to
bank.com". The browser **automatically attaches your bank.com cookies**. If bank.com
authenticates sockets only by cookie and doesn't check where the request came from,
evil.com now has a live, authenticated socket as you — it can read your data and send
commands.

Why it happens: **the Same-Origin Policy / CORS does not apply to WebSocket
handshakes**. Browsers send the `Origin` header but don't block cross-origin WebSocket
connections; the server must decide.

Note: with the default `["polling", "websocket"]` transports, the initial polling request
**is** subject to CORS, which helps — but an attacker can force `transports: ["websocket"]`
to skip polling entirely, so you must protect the WebSocket path too.

Defences (use several):

1. **Check `Origin`** on the handshake and upgrade (`allowRequest`) against an allow-list.
2. **Token-based auth** in `auth` (not automatically sent by the browser) instead of, or in
   addition to, cookies.
3. `SameSite=Lax`/`Strict` cookies (cross-site WebSocket requests won't carry `Strict`/
   `Lax` cookies in modern browsers — but don't rely on this alone).
4. Short-lived tickets.

```js
const ALLOWED = new Set(["https://app.example.com", "https://admin.example.com"]);

const io = new Server(httpServer, {
  cors: { origin: [...ALLOWED], credentials: true },
  allowRequest: (req, cb) => cb(null, ALLOWED.has(req.headers.origin)),
});
```

(Non-browser clients — mobile apps, Node scripts — may not send `Origin`. Decide
explicitly: allow missing origin only if authentication is token-based.)

---

## 6.6 Input validation (never trust the client)

Anything the client sends can be malicious: wrong types, huge strings, prototype
pollution keys (`__proto__`), negative numbers, deeply nested objects.

```js
const { z } = require("zod");

const SendMessage = z.object({
  conversationId: z.string().uuid(),
  text: z.string().trim().min(1).max(2000),
  clientMsgId: z.string().uuid(),
});

socket.on("message:send", async (raw, ack) => {
  if (typeof ack !== "function") return;          // require ack for commands
  const parsed = SendMessage.safeParse(raw);
  if (!parsed.success) return ack({ ok: false, error: "VALIDATION", details: parsed.error.flatten() });
  // ... use parsed.data only
});
```

Checklist:

- Validate **types, lengths, ranges, formats**, and **number of arguments**.
- Reject unknown keys (`.strict()`), especially before spreading into DB queries (NoSQL
  injection: `{ "$gt": "" }`).
- Sanitize/escape user content **at render time** on clients (`textContent`, React's
  escaping) to prevent **XSS** — broadcasting HTML received from one user to everyone is
  a fast way to an XSS worm.
- Use parameterized queries (SQL injection still exists over sockets!).
- Limit the size of **arrays**/nesting to avoid CPU exhaustion.
- Validate **binary** payloads (type, size, magic bytes) before storing.

---

## 6.7 Rate limiting and abuse prevention

### Per-socket event rate limiting

```js
const { RateLimiterMemory } = require("rate-limiter-flexible"); // or RateLimiterRedis for clusters

const limiter = new RateLimiterMemory({ points: 20, duration: 1 }); // 20 events / second

io.on("connection", (socket) => {
  socket.use(async ([event, ...args], next) => {
    try {
      await limiter.consume(socket.data.user?.id ?? socket.id); // key per user (or per IP)
      next();
    } catch {
      const ack = typeof args.at(-1) === "function" ? args.at(-1) : null;
      ack?.({ ok: false, error: "RATE_LIMITED" });
      // optionally disconnect repeat offenders
    }
  });
});
```

Use **per-user** keys (users can open many sockets) and **Redis-backed** limiters in a
cluster (`RateLimiterRedis`) so limits are global, not per process.

### Connection limits

```js
// limit concurrent connections per user (register this as the LAST middleware)
io.use(async (socket, next) => {
  const key = `conn:${socket.data.user.id}`;
  const count = await redis.incr(key);
  await redis.expire(key, 3600);
  if (count > 10) { await redis.decr(key); return next(new Error("TOO_MANY_CONNECTIONS")); }
  next();
});

io.on("connection", (socket) => {
  socket.on("disconnect", () => redis.decr(`conn:${socket.data.user.id}`));
});
```

(Careful: process crashes leave counters inflated → in real systems prefer a Redis sorted
set of `socketId → lastSeen` cleaned by expiry, so stale entries disappear by themselves.)

Connection-rate limits per IP at the **edge** (nginx `limit_conn`/`limit_req`, WAF,
Cloudflare) are cheaper than in Node.

### Payload size

- `maxHttpBufferSize` (default **1 MB**) — max size of a single message. Larger → the
  server **closes the connection**. Lower it (e.g. `1e5` = 100 KB) if you only send small
  JSON, to limit memory abuse.
- On polling, this also limits the request body size.

### Other DoS considerations

- **Slow consumers**: a client that doesn't read causes server-side write buffers to
  grow. Monitor `socket.conn.transport.writable`/buffer sizes; disconnect clients whose
  buffers exceed limits (e.g. check `socket.conn.writeBuffer.length`).
- **Too many rooms / namespaces** created by client input (dynamic namespace names or
  room names from user input) → memory growth. Validate names, cap counts, use
  `cleanupEmptyChildNamespaces`.
- **Expensive handlers**: an event that triggers a heavy DB query can be spammed →
  rate limit and cache.
- **Pending acks**: server-side `socket.emit(..., ack)` without timeout to a client that
  never answers keeps callbacks in memory → always use `timeout()`.

---

## 6.8 Transport security

- **Always use TLS** (`https://` → `wss://`) in production. Without it, tokens and data are
  readable by anyone on the network, and many proxies mangle unencrypted WebSocket traffic
  (another reason WebSocket "doesn't work" on some networks — TLS hides it from them).
- Terminate TLS at the load balancer or in Node (`https.createServer`).
- HSTS on your domains.
- Don't disable certificate validation in Node clients (`rejectUnauthorized: false`) except
  in local development.

---

## 6.9 Information leakage

- Don't send **internal error messages/stack traces** to clients (`err.message` from DB
  drivers can leak schema/SQL). Map to error codes.
- Don't broadcast **full user objects** (emails, phone numbers) to rooms — send minimal
  public projections.
- `socket.data` is sent between servers with `fetchSockets()` — fine, but don't put
  secrets there unnecessarily.
- Remove `serveClient` (set `false`) if you bundle the client yourself — less attack
  surface, no version disclosure.
- The **Admin UI** must be protected with authentication (`auth: { type: "basic", … }`)
  and preferably not exposed publicly (Chapter 10).

---

## 6.10 Keep dependencies updated — real vulnerabilities have happened

Real advisories have been published for every layer of the stack. This table was pulled
from the **npm / GitHub advisory database** (October 2026); each row links to the advisory
by its GHSA id (`https://github.com/advisories/<id>`):

| Package | Affected versions | Severity | Issue | GHSA id |
|---|---|---|---|---|
| `socket.io` | < 2.4.0 | moderate | CORS misconfiguration (all origins allowed by default) | GHSA-fxwf-4rqh-v8g3 |
| `socket.io` | < 2.5.1, and ≥ 3.0.0 < 4.6.2 | moderate | Unhandled `error` event (can crash the process) | GHSA-25hc-qcg6-38wj |
| `engine.io` | ≥ 4.0.0 < 6.2.1 | moderate | Uncaught exception from a crafted request | GHSA-r7qp-cfhv-p84w |
| `engine.io` | ≥ 5.1.0 < 6.4.2 | moderate | Uncaught exception vulnerability | GHSA-q9mw-68c2-j6m5 |
| `engine.io` | ≥ 4.1.0 < 6.6.7 | **high** | Polling transport connection exhaustion | GHSA-r635-g3xr-vw7x |
| `socket.io-parser` | ≥ 4.0.0 < 4.0.5 | **critical** | Insufficient validation when decoding a packet | GHSA-qm95-pgcg-qqfq |
| `socket.io-parser` | ≥ 4.0.4 < 4.2.3 | moderate | Insufficient validation when decoding a packet | GHSA-cqmj-92xf-r6r9 |
| `socket.io-parser` | ≥ 4.0.0 < 4.2.6 | **high** | Unbounded number of binary attachments | GHSA-677m-j7p3-52f9 |
| `socket.io-parser` | ≥ 4.0.0 < 4.2.7 | **high** | Zero-attachment memory exhaustion | GHSA-2m8v-j782-fhvr |
| `ws` | ≥ 8.0.0 < 8.17.1 | **high** | DoS with a request containing many HTTP headers | GHSA-3h5v-q93c-6h6q |
| `ws` | ≥ 8.0.0 < 8.20.1 | moderate | Uninitialized memory disclosure | GHSA-58qx-3vcg-4xpx |
| `ws` | ≥ 8.0.0 < 8.21.0 | **high** | Memory exhaustion DoS from tiny fragments | GHSA-96hv-2xvq-fx4p |

(Older major lines — e.g. `ws` 5–7, `socket.io-parser` 3.x — had their own advisories and
backported fixes; check the advisory pages for your exact version.)

A fresh `npm install socket.io@4.8.4` in October 2026 resolved to `engine.io@6.6.11`,
`socket.io-parser@4.2.7` and `ws@8.21.3` — all past the fixes above. **But transitive
versions are pinned by your lockfile**: an old `package-lock.json` can keep a vulnerable
`ws` or `socket.io-parser` even after you bump `socket.io`. Run `npm ls ws engine.io
socket.io-parser` to see what you actually ship.

Notice the pattern: almost every issue is "a malicious client sends a malformed or
oversized packet and crashes or exhausts the server". That's why `maxHttpBufferSize`,
rate limits and patching matter even for internal apps.

Lessons: run `npm audit` / Dependabot / Snyk in CI, keep `socket.io`, `engine.io`,
`socket.io-parser` and `ws` patched, and add a `process.on("uncaughtException")` logger +
process manager restarts as defence in depth.

---

## 6.11 Security checklist (copy into your team's PR template)

- [ ] TLS everywhere (`wss://`).
- [ ] `cors.origin` is an explicit allow-list (never `"*"` with credentials).
- [ ] `allowRequest` checks `Origin` (CSWSH protection), especially with cookie auth.
- [ ] Connection authenticated in `io.use` (token in `auth`, not query string).
- [ ] Token expiry handled (disconnect/refresh), revocation via `disconnectSockets`.
- [ ] Every event handler authorizes the action and validates input (schema).
- [ ] No identity taken from payloads; use `socket.data.user`.
- [ ] Room joins authorized server-side.
- [ ] Rate limits per user/IP (Redis-backed in clusters); connection caps.
- [ ] `maxHttpBufferSize` sized for your messages.
- [ ] Errors mapped to codes, no stack traces to clients.
- [ ] User-generated content escaped on render (XSS).
- [ ] Admin UI protected or disabled in production.
- [ ] `serveClient: false` if not needed.
- [ ] Dependencies scanned and up to date.
- [ ] Handlers wrapped (no crash on throw/reject).

---

## 6.12 Chapter summary

- Three middleware levels: `io.engine.use` (HTTP), `io.use` (connection), `socket.use`
  (per event), plus the `allowRequest` gate.
- `next(err)` in connection middleware → client `connect_error` with `message`/`data`, no
  auto-reconnect.
- Authenticate with `auth` payload (or cookies + origin checks); never trust identity
  from payloads; authorize every action.
- CSWSH: WebSocket isn't covered by CORS → check `Origin`.
- Validate inputs, rate-limit, limit sizes, escape output, keep deps patched.

Next: [Chapter 7 — Under the hood](07-under-the-hood.md)
