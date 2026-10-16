# Chapter 8 — Scaling: Multiple Servers, Sticky Sessions, Adapters, Load Balancers and Kubernetes

> **Goal:** run Socket.IO on many processes and machines correctly. The two words you must
> say in any scaling interview are **"sticky sessions"** and **"adapter"** — and you must
> be able to explain *why* each is needed.

---

## 8.1 ELI5

One pizza shop (server) can only answer so many phones. So you open **more branches**.
Two new problems appear:

1. **"Which branch am I talking to?"** If you use the "ask and wait on the line" method
   (long-polling), every call must go to the **same branch**, because only that branch
   remembers your order. The receptionist who routes calls must always send you to the
   same branch → **sticky sessions**.
2. **"How do I tell everyone in every branch?"** If branch A wants to announce "free
   pizza for room 'Main Street'", customers of Main Street might be on branch B and C.
   Branches need an **intercom** connecting them → the **adapter** (e.g. Redis pub/sub).

---

## 8.2 How far can one server go?

A single Node.js process can typically hold **tens of thousands** of mostly-idle
WebSocket connections (10k–100k+ depending on memory, message rate, payload size,
compression, and your handler logic). The bottlenecks are usually:

- **CPU** (single-threaded event loop): JSON encoding/decoding, broadcast fan-out,
  your handler logic, TLS (if terminated in Node).
- **Memory**: per-connection buffers (more with `perMessageDeflate`), `socket.data`,
  rooms, pending acks, connection-state-recovery packet storage.
- **File descriptors**: each connection = 1 fd → raise `ulimit -n`.
- **Fan-out**: broadcasting 1 message to 10 000 sockets = 10 000 writes. At 100 msg/s →
  1 M writes/s. *Messages × recipients* is the metric that matters.

Load test your real workload (Chapter 10) — don't trust generic numbers.

Then you scale **horizontally**: several Node processes (on one machine via cluster/PM2)
and/or several machines/containers behind a load balancer.

---

## 8.3 Problem 1 — Sticky sessions (session affinity)

### Why they are required

With the **HTTP long-polling** transport, one Socket.IO connection = **many HTTP
requests** (handshake GET, data GETs, POSTs, then the WebSocket upgrade request). The
Engine.IO session (`sid`) lives in the **memory of the server that did the handshake**.

```
Client ── GET handshake ──▶ LB ──▶ Server A   (creates sid=abc)
Client ── POST sid=abc ───▶ LB ──▶ Server B   ✗ 400 {"code":1,"message":"Session ID unknown"}
```

So the load balancer must route **all requests of a session to the same server**.

Even when polling upgrades to WebSocket quickly, the first few requests are polling, and
the WebSocket upgrade request itself must reach the server that holds the `sid`.

### When you DON'T need sticky sessions

If clients use **WebSocket only** (`transports: ["websocket"]`), one connection = one TCP
connection that stays on one server → no sticky sessions needed.

```js
// client
const socket = io(URL, { transports: ["websocket"] });
// (optionally also restrict the server: new Server({ transports: ["websocket"] }))
```

Trade-off: no polling fallback (users behind WebSocket-hostile proxies fail to connect).
Many companies accept this for mobile apps and internal tools.

### Ways to get sticky sessions

| Method | How | Notes |
|---|---|---|
| **IP hash** | nginx `ip_hash` / `hash $remote_addr consistent`; HAProxy `balance source` | Simple; uneven distribution behind NAT (whole office on one server); breaks if a client's IP changes (mobile) |
| **Cookie-based** | LB sets a cookie identifying the server (AWS ALB stickiness, HAProxy `cookie`, nginx Plus `sticky`, Traefik sticky cookies, ingress-nginx affinity) | Best distribution. **Cross-origin**: client needs `withCredentials: true`, server CORS `credentials: true` so the browser sends the LB cookie on polling requests |
| **Socket.IO `cookie` option** | `new Server({ cookie: { name: "io", httpOnly: true, sameSite: "strict", maxAge: 86400 } })` → Engine.IO sets an `io=<sid>` cookie that the LB can hash on | Useful with LBs that can route on an arbitrary cookie value |
| **Node cluster** | `@socket.io/sticky` (master routes by sid) + `@socket.io/cluster-adapter` | Single machine, multiple cores |
| **PM2** | `@socket.io/pm2` (a PM2 fork with sticky sessions) + cluster adapter | Single machine |
| **Query/URL-based routing** | e.g. route by `?shard=` or by subdomain | Custom architectures |

---

## 8.4 Problem 2 — Broadcasting across servers: adapters

### Why it's required

```
User A connected to Server 1, in room "game:7"
User B connected to Server 2, in room "game:7"

Server 1: io.to("game:7").emit("move")   → reaches only User A ✗
```

The default **in-memory adapter** only knows local sockets. A distributed **adapter**
forwards the broadcast to all other servers, which deliver it to their local sockets.

```
          ┌──────────── Redis / Postgres / Mongo / Pub-Sub / IPC ────────────┐
          │                                                                   │
   ┌──────┴─────┐               ┌─────────────┐               ┌─────────────┐ │
   │  Server 1  │──── publish ──▶ (broker) ───▶ │  Server 2   │ ─▶ │ Server 3 │─┘
   │ io.to(r)…  │               └─────────────┘               └─────────────┘
   └────────────┘
```

### Official / well-known adapters

| Adapter | Package | Backend | Highlights |
|---|---|---|---|
| **Redis** | `@socket.io/redis-adapter` | Redis Pub/Sub | Most popular; also a **sharded** variant for Redis 7 sharded pub/sub; ❌ no connection state recovery |
| **Redis Streams** | `@socket.io/redis-streams-adapter` | Redis Streams | Survives temporary Redis disconnections without losing packets; ✅ connection state recovery |
| **MongoDB** | `@socket.io/mongo-adapter` | MongoDB change streams (replica set required) | ✅ CSR (since 0.3.0) |
| **Postgres** | `@socket.io/postgres-adapter` | `LISTEN/NOTIFY` (+ attachment table for payloads > 8 KB) | ❌ CSR |
| **Cluster** | `@socket.io/cluster-adapter` | Node.js `cluster` IPC | Multiple cores on one machine |
| **GCP Pub/Sub** | `@socket.io/gcp-pubsub-adapter` | Google Cloud Pub/Sub | |
| **AWS SQS** | `@socket.io/aws-sqs-adapter` | AWS SNS + SQS | |
| **Azure Service Bus** | `@socket.io/azure-service-bus-adapter` | Azure Service Bus | |
| **Azure Web PubSub** | `@azure/web-pubsub-socket.io` | Managed service | Azure hosts the connections for you |
| Community | e.g. AMQP (RabbitMQ), NATS adapters | | Check maintenance status |

All official ones support "socket management" (`fetchSockets`, `socketsJoin`, …),
inter-server communication (`serverSideEmit`) and broadcast with acks.

### Redis adapter — setup (`redis` package)

```js
const { createServer } = require("node:http");
const { Server } = require("socket.io");
const { createClient } = require("redis");
const { createAdapter } = require("@socket.io/redis-adapter");

async function main() {
  const pubClient = createClient({ url: process.env.REDIS_URL });
  const subClient = pubClient.duplicate();   // a subscriber connection can't publish → 2 clients

  pubClient.on("error", (err) => logger.error({ err }, "redis pub error"));
  subClient.on("error", (err) => logger.error({ err }, "redis sub error"));

  await Promise.all([pubClient.connect(), subClient.connect()]);

  const httpServer = createServer();
  const io = new Server(httpServer, {
    adapter: createAdapter(pubClient, subClient, {
      key: "socket.io",          // channel prefix (namespace your apps if they share Redis!)
      requestsTimeout: 5000,     // for fetchSockets etc.
    }),
  });

  httpServer.listen(3000);
}
main();
```

With **ioredis**:

```js
const { Redis } = require("ioredis");
const pubClient = new Redis(process.env.REDIS_URL);
const subClient = pubClient.duplicate();
const io = new Server({ adapter: createAdapter(pubClient, subClient) });
```

With a **Redis Cluster** (ioredis):

```js
const { Cluster } = require("ioredis");
const pubClient = new Cluster([{ host: "redis-1", port: 6379 }, { host: "redis-2", port: 6379 }]);
const subClient = pubClient.duplicate();
```

**Sharded** pub/sub (Redis ≥ 7, with the `redis` package):

```js
const { createShardedAdapter } = require("@socket.io/redis-adapter");
const io = new Server({ adapter: createShardedAdapter(pubClient, subClient /*, { subscriptionMode: "dynamic" } */) });
```

> Gotchas:
> - **Always attach `error` listeners** to Redis clients; an unhandled `error` event
>   crashes Node.
> - Two different apps sharing one Redis must use different `key` prefixes, or they'll
>   receive each other's broadcasts.
> - The **subscriber** connection can't run normal commands; use the pub client (or
>   another client) for app data.
> - If Redis goes down: local broadcasts still work; cross-server broadcasts are lost
>   while it's down (pub/sub has no buffering).
> - With the classic adapter every node receives every broadcast (pattern subscription)
>   — the sharded adapter in `dynamic` mode reduces this.

### Redis Streams adapter

```js
const { createClient } = require("redis");
const { createAdapter } = require("@socket.io/redis-streams-adapter");

const redisClient = createClient({ url: process.env.REDIS_URL });
await redisClient.connect();

const io = new Server({
  adapter: createAdapter(redisClient, {
    streamName: "socket.io",   // default
    maxLen: 10_000,            // approximate stream trimming
    readCount: 100,            // XREAD batch size
  }),
  connectionStateRecovery: { maxDisconnectionDuration: 2 * 60 * 1000 },
});
```

- Uses **one** Redis connection (it reads with `XREAD BLOCK`).
- A node that loses Redis briefly **resumes from its last stream offset** → no lost
  broadcasts (as long as `maxLen` wasn't exceeded).
- Sessions for connection state recovery are stored as Redis keys (`sio:session:` prefix).

### Postgres adapter (if you already run Postgres and don't want Redis)

```js
const { Pool } = require("pg");
const { createAdapter } = require("@socket.io/postgres-adapter");

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
await pool.query(`
  CREATE TABLE IF NOT EXISTS socket_io_attachments (
    id bigserial UNIQUE,
    created_at timestamptz DEFAULT NOW(),
    payload bytea
  );
`);
const io = new Server({ adapter: createAdapter(pool) });
```

NOTIFY payloads are limited to 8000 bytes; bigger packets go through the attachments
table. Fine for moderate traffic; Redis is usually faster for high volume.

### Node.js cluster (multi-core on one machine)

```js
const cluster = require("node:cluster");
const http = require("node:http");
const { availableParallelism } = require("node:os");
const { Server } = require("socket.io");
const { setupMaster, setupWorker } = require("@socket.io/sticky");
const { createAdapter, setupPrimary } = require("@socket.io/cluster-adapter");

if (cluster.isPrimary) {
  const httpServer = http.createServer();
  setupMaster(httpServer, { loadBalancingMethod: "least-connection" }); // sticky sessions
  setupPrimary();                                                         // adapter IPC hub
  httpServer.listen(3000);
  for (let i = 0; i < availableParallelism(); i++) cluster.fork();
  cluster.on("exit", (worker) => { console.log(`worker ${worker.process.pid} died`); cluster.fork(); });
} else {
  const httpServer = http.createServer();
  const io = new Server(httpServer);
  io.adapter(createAdapter());
  setupWorker(io);              // receives connections handed over by the primary
  io.on("connection", (socket) => { /* ... */ });
}
```

> Why can't plain `cluster` work? Node's cluster module distributes **TCP connections**
> round-robin; HTTP polling requests of one session use *different* TCP connections and
> would land on different workers. `@socket.io/sticky` makes the primary inspect the
> `sid` and route to the right worker.

---

## 8.5 Emitting from outside Socket.IO servers: emitters

A background worker (e.g. processing payments) wants to notify users but is **not** a
Socket.IO server (no HTTP server, no client connections). Use an **emitter**: it
publishes into the adapter's channel; Socket.IO servers deliver.

```js
const { Emitter } = require("@socket.io/redis-emitter");
const { createClient } = require("redis");

const redisClient = createClient({ url: process.env.REDIS_URL });
await redisClient.connect();
const emitter = new Emitter(redisClient /*, { key: "socket.io" } must match the adapter */);

emitter.to(`user:${userId}`).emit("payment:succeeded", { orderId });
emitter.of("/admin").emit("stats", stats);
emitter.except("banned").emit("announcement", text);
emitter.in("room1").socketsJoin("room2");
emitter.in(`user:${userId}`).disconnectSockets();
emitter.serverSideEmit("cache:invalidate", key);
```

Limitations: emitters **can't receive acks** and can't fetch sockets (no response
channel). Equivalent packages exist for Postgres (`@socket.io/postgres-emitter`) and
MongoDB (`@socket.io/mongo-emitter`). The emitter must match the adapter: the Redis
emitter speaks the classic Redis **pub/sub** adapter's format, so check your adapter's
docs for a compatible emitter before mixing them (e.g. with the Redis *Streams* adapter).

**Architecture tip:** many companies use a **message broker** (Kafka/RabbitMQ/SQS) for
domain events, and a thin "realtime gateway" service (Socket.IO servers) that consumes
those events and emits to rooms. The gateway owns connections; other services never talk
to sockets directly.

---

## 8.6 Inter-server communication: `serverSideEmit`

```js
// on any server
io.serverSideEmit("config:reload", { version: 42 });

// every OTHER server receives it (not the sender)
io.on("config:reload", ({ version }) => reloadConfig(version));

// with acknowledgement (v4.5+)
io.timeout(5000).serverSideEmit("ping", (err, responses) => {
  // responses: one per other server
});
const responses = await io.timeout(5000).serverSideEmitWithAck("health");
```

Use for cluster-wide cache invalidation, config reloads, coordination. Reserved names
apply (`connection`, `connect`, `new_namespace`).

---

## 8.7 Load balancer and reverse proxy configuration

> **Lab-verified (October 2026):** the nginx and HAProxy configurations in this section were
> run (nginx 1.24, HAProxy 2.8) in front of three Socket.IO 4.8.4 nodes sharing the Redis
> adapter. Results:
>
> | Setup | Result |
> |---|---|
> | nginx config below (hash on client IP, Upgrade headers) | connected, **upgraded to WebSocket** |
> | HAProxy round-robin + `cookie SERVERID insert`, polling-only client with `withCredentials: true` | connected every time, connections spread over nodes 5001/5002/5003 |
> | Same HAProxy, client **without** `withCredentials` | **failed** every time (`xhr poll error` / `xhr post error`); nodes logged `engine error code=1 Session ID unknown` — the LB cookie wasn't sent back, so requests landed on random nodes |
> | HAProxy round-robin **without** stickiness, polling-only | **failed**: `Session ID unknown` (code 1) |
> | HAProxy round-robin without stickiness, **WebSocket-only** client | connected — no stickiness needed |
> | Client on node 5001 broadcasts, client on node 5002 listening | received via the Redis adapter |
>
> The full lab (configs, node script, test script) is in Chapter 23 so you can reproduce it.


### nginx

```nginx
http {
  map $http_upgrade $connection_upgrade {   # recommended: only set "upgrade" when needed
    default upgrade;
    ''      close;
  }

  upstream socket_nodes {
    # sticky sessions (pick one)
    hash $remote_addr consistent;   # whole client IP
    # ip_hash;                      # first 3 octets of IPv4 (coarser)
    # sticky cookie srv_id expires=1h; # nginx Plus only

    server app01:3000;
    server app02:3000;
    server app03:3000;
  }

  server {
    listen 443 ssl;
    server_name api.example.com;
    # ssl_certificate ... ssl_certificate_key ...

    location /socket.io/ {
      proxy_pass http://socket_nodes;

      proxy_http_version 1.1;                          # REQUIRED for WebSocket
      proxy_set_header Upgrade $http_upgrade;          # REQUIRED
      proxy_set_header Connection $connection_upgrade; # REQUIRED

      proxy_set_header Host $host;
      proxy_set_header X-Real-IP $remote_addr;
      proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
      proxy_set_header X-Forwarded-Proto $scheme;

      proxy_read_timeout 120s;   # must exceed pingInterval (25 s) comfortably; default is 60 s
      proxy_send_timeout 120s;
      proxy_buffering off;       # don't buffer long-polling responses
    }
  }
}
```

Missing `proxy_http_version 1.1` or the `Upgrade`/`Connection` headers is the **#1
reason** "WebSocket doesn't work behind nginx" (clients silently stay on polling, or
get `websocket error`). In DevTools you'll see polling requests every ~25 s and no
`transport=websocket` 101 response.

If you serve Socket.IO under a sub-path (`/api/socket.io/`), set `path` on both client
and server, or rewrite carefully.

### HAProxy

```haproxy
frontend http_front
  bind *:443 ssl crt /etc/ssl/site.pem
  default_backend socket_nodes
  timeout client 120s

backend socket_nodes
  balance roundrobin
  cookie SERVERID insert indirect nocache   # cookie-based stickiness
  timeout server 120s
  timeout tunnel 1h                          # for long-lived WebSocket connections
  server app01 app01:3000 check cookie app01
  server app02 app02:3000 check cookie app02
```

(Or `balance source` for IP-based stickiness.)

### Apache httpd

Needs `mod_proxy`, `mod_proxy_http`, `mod_proxy_wstunnel` (or `ProxyPass … upgrade=websocket`
in 2.4.47+), and `mod_proxy_balancer` with `stickysession` for multiple nodes.

### AWS

- **ALB** (Application Load Balancer): supports WebSocket natively. Enable **target group
  stickiness** (load-balancer-generated cookie `AWSALB`, or application cookie). For
  cross-origin, set client `withCredentials: true` and server CORS `credentials: true`
  so the ALB cookie is sent on polling requests. **Idle timeout default 60 s** → keep
  `pingInterval` (25 s) below it (it is, by default) or raise it.
- **NLB** (Network Load Balancer, layer 4): passes TCP through; stickiness by source IP;
  idle timeout for TCP is 350 s.
- **API Gateway WebSocket APIs** are **not** Socket.IO servers (custom WS protocol with
  routes) — you can't point a Socket.IO client at them.
- **Elastic Beanstalk**: enable WebSocket in its nginx proxy config.
- **ECS/EKS**: same as below for Kubernetes.

### Cloudflare / CDNs

- WebSockets supported (proxy enabled). Cloudflare closes idle connections after ~100 s
  of inactivity → heartbeats (25 s) keep them alive.
- Cloudflare **load balancing** has session affinity (cookie) options.
- Long-polling requests through CDNs: ensure they're not cached (`t=` param and headers
  handle this).

### Heroku / Render / Railway / Fly.io etc.

Most support WebSockets. Heroku's router supports **session affinity** as a feature flag
(`heroku features:enable http-session-affinity`); its 55-second idle timeout is reset
by heartbeat traffic.

---

## 8.8 Kubernetes

Typical setup: Deployment with N replicas → Service → Ingress (ingress-nginx) → clients.

**Ingress-nginx sticky sessions + timeouts:**

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: realtime
  annotations:
    nginx.ingress.kubernetes.io/affinity: "cookie"
    nginx.ingress.kubernetes.io/session-cookie-name: "route"
    nginx.ingress.kubernetes.io/session-cookie-max-age: "172800"
    nginx.ingress.kubernetes.io/proxy-read-timeout: "3600"
    nginx.ingress.kubernetes.io/proxy-send-timeout: "3600"
spec:
  ingressClassName: nginx
  rules:
    - host: rt.example.com
      http:
        paths:
          - path: /socket.io/
            pathType: Prefix
            backend:
              service: { name: realtime, port: { number: 3000 } }
```

(ingress-nginx handles the `Upgrade` headers for WebSocket automatically.)

Other notes:

- `Service.spec.sessionAffinity: ClientIP` gives IP stickiness at the Service level, but
  behind an Ingress all traffic comes from the ingress pods — use Ingress-level affinity.
- **Graceful shutdown on rolling deploys:** when a pod is terminated, every client on it
  disconnects and reconnects elsewhere. Spread this out:
  - `terminationGracePeriodSeconds` long enough,
  - a `preStop` hook (e.g. `sleep 10`) so the endpoint is removed from the LB first,
  - on `SIGTERM`: stop accepting new connections, optionally notify clients, then
    `io.close()` (Chapter 11),
  - roll pods slowly (`maxSurge`, `maxUnavailable`) to avoid a reconnection storm on the
    remaining pods.
- **Autoscaling:** CPU-based HPA is often misleading for socket servers (idle connections
  use memory, not CPU). Scale on **connection count** / event-loop lag via custom metrics
  (Prometheus adapter). Note that scale-out doesn't move existing connections — new pods
  only get *new* connections. Scale-in disconnects clients.
- **Readiness probes:** mark not-ready during shutdown so no new connections arrive.
- **Liveness probes:** don't make them depend on Redis; a Redis outage shouldn't restart
  all pods.

---

## 8.9 Capacity planning & OS tuning checklist

- `ulimit -n` (open files) ≥ expected connections × ~1.2 (e.g. 100 000+); systemd
  `LimitNOFILE`.
- Kernel: `net.core.somaxconn`, `net.ipv4.tcp_max_syn_backlog` for connection bursts;
  `net.ipv4.ip_local_port_range` on **proxies** (each upstream connection uses an
  ephemeral port — a single nginx → single Node upstream is limited to ~28k–64k
  connections per destination IP:port; add more upstream IPs/ports or use more Node
  processes).
- Memory: measure per-connection memory in a load test (heap snapshot); disable
  `perMessageDeflate` unless needed; keep `socket.data` small.
- Node: `--max-old-space-size` appropriate to container memory.
- Redis: monitor pub/sub throughput, `client-output-buffer-limit pubsub` (slow
  subscribers get disconnected when their output buffer exceeds limits → that node
  silently stops receiving broadcasts until reconnect!).

---

## 8.10 Scaling patterns and anti-patterns

**Patterns**

- **Stateless socket servers**: keep durable state in DB/Redis; any node can serve any
  user after reconnection.
- **User rooms** (`user:<id>`) instead of id maps → works across nodes.
- **Presence in Redis** (sets/sorted sets with TTL heartbeats) rather than
  `fetchSockets()` on every request.
- **Partition by tenant/region** for very large systems (separate clusters per region;
  route via DNS/geo).
- **Gateway pattern**: Socket.IO servers only handle connections; business logic in
  services; communication via broker/emitter.
- **Backpressure**: throttle/coalesce high-frequency updates (send state every 100 ms,
  not every change).

**Anti-patterns**

- Storing `userId → socket` objects in a local `Map` and trying to emit from another node.
- Calling `io.fetchSockets()` on hot paths.
- Broadcasting huge payloads to huge rooms (send a "changed" notification + let clients
  fetch via HTTP/CDN instead).
- One giant room everybody is in, with chatty events.
- Forgetting sticky sessions → random `400 Session ID unknown` and reconnect loops.
- No `error` handler on Redis clients.

---

## 8.11 Chapter summary

- Two problems at scale: **sticky sessions** (for polling) and **cross-node broadcast**
  (adapter).
- Sticky sessions via IP hash, LB cookies, `@socket.io/sticky`; or skip them with
  WebSocket-only transports.
- Adapters: Redis (classic, sharded), Redis Streams (resilient, CSR), Mongo, Postgres,
  cluster, cloud. Emitters let non-socket processes broadcast.
- `serverSideEmit` for server-to-server events.
- Proxy config: HTTP/1.1 + `Upgrade`/`Connection` headers + timeouts > ping interval.
- Kubernetes: ingress cookie affinity, long timeouts, graceful shutdown, scale on
  connections.

Next: [Chapter 9 — TypeScript, frameworks and clients](09-typescript-frameworks-clients.md)
