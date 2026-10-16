# Chapter 18 — WebTransport in Practice (HTTP/3)

> **Goal:** understand what WebTransport is, when it's worth it, and set it up end to end
> with Socket.IO — certificates, the HTTP/3 server, browser and Node clients, upgrades,
> deployment and debugging.
>
> **How this chapter was checked:** the server and client code below was run with
> `socket.io` 4.8.4, `@fails-components/webtransport` 1.6.10 (+ its quiche HTTP/3 transport)
> and Node 22. Results: a WebTransport-only client connected and exchanged acks; a client
> using the default transport order connected over polling and **upgraded directly to
> WebTransport**. Browser behaviour is described from the WebTransport specification and
> browser documentation (not executed here — no browser in this environment).

---

## 18.1 ELI5

WebSocket is a walkie-talkie that runs over **one rope** (a TCP connection). If one
message gets stuck on the rope (a lost network packet), **every message behind it waits**
— even unrelated ones. That's called *head-of-line blocking*.

WebTransport runs over **HTTP/3 (QUIC)**, which is like having **many small ropes** inside
one connection: a stuck message only blocks its own rope. It can also send "throw-away"
messages (datagrams) that are never retried. It connects faster too.

Socket.IO can use WebTransport as a third transport, next to polling and WebSocket.

---

## 18.2 What WebTransport brings (and what Socket.IO uses)

| Property | WebSocket | WebTransport |
|---|---|---|
| Underlying protocol | TCP (+ TLS) | QUIC over **UDP** (TLS 1.3 built in) |
| Head-of-line blocking | Yes (one TCP stream) | Not across streams |
| Connection setup | TCP + TLS handshakes | Faster (QUIC combines them; 0-RTT resumption possible) |
| Network changes (Wi-Fi ↔ 4G) | Connection breaks | QUIC supports connection migration |
| Unreliable datagrams | No | Yes |
| Requires TLS | Optional (`ws://`) | **Always** (HTTPS only) |
| Proxy/firewall friendliness | Good (TCP 443) | UDP 443 is blocked on some networks |

Socket.IO uses a WebTransport **bidirectional stream** as its transport (reliable,
ordered — the same guarantees as WebSocket), so your application code doesn't change.
The benefits you get are mostly faster connection setup and better behaviour on lossy or
changing networks. Socket.IO's API does not expose unreliable datagrams.

**Is it worth it?** For most apps, WebSocket is fine. Consider WebTransport for
mobile-heavy audiences on lossy networks, latency-sensitive interactive apps, or when you
already run HTTP/3 infrastructure. Always keep WebSocket/polling as fallbacks — UDP may be
blocked and browser support isn't universal (check current support tables, e.g. caniuse,
before relying on it; Safari historically lagged behind Chromium and Firefox).

---

## 18.3 Requirements

1. **HTTPS with a valid certificate.** Browsers refuse WebTransport without TLS.
   - In production: a normal CA-signed certificate for your domain.
   - In development: a self-signed certificate **pinned by hash** with the
     `serverCertificateHashes` option. The WebTransport spec restricts such certificates:
     **ECDSA** keys (e.g. P-256) and a **validity of at most 14 days**.
2. **An HTTP/3 server.** Node.js has no built-in HTTP/3 server (as of Node 22), so you add
   one: `@fails-components/webtransport` (with its quiche-based transport package).
3. **UDP open** on the port (typically 443) through firewalls, security groups and load
   balancers.
4. `"webtransport"` added to the server's `transports` option (it is **disabled by
   default** on the server).

---

## 18.4 Step 1 — certificates

Development certificate (ECDSA P-256, 14 days), plus its SHA-256 fingerprint for pinning:

```bash
openssl req -new -x509 -nodes \
  -newkey ec -pkeyopt ec_paramgen_curve:prime256v1 \
  -keyout key.pem -out cert.pem -days 14 \
  -subj '/CN=localhost' -addext "subjectAltName=DNS:localhost,IP:127.0.0.1"

# SHA-256 of the DER-encoded certificate, as hex (used by serverCertificateHashes)
node -e 'const {X509Certificate,createHash}=require("crypto");const fs=require("fs");
const c=new X509Certificate(fs.readFileSync("cert.pem"));
console.log(createHash("sha256").update(c.raw).digest("hex"))' > cert.hash
```

Remember to regenerate before the 14 days expire (and update the pinned hash in clients).

---

## 18.5 Step 2 — the server (verified)

```js
// wt-server.mjs
import { readFileSync } from "node:fs";
import { createServer } from "node:https";
import { Server } from "socket.io";
import { Http3Server } from "@fails-components/webtransport";

const key = readFileSync("./key.pem");
const cert = readFileSync("./cert.pem");

// 1) a classic HTTPS server for polling + websocket (TCP)
const httpsServer = createServer({ key, cert });
const io = new Server(httpsServer, {
  transports: ["polling", "websocket", "webtransport"],   // WebTransport must be enabled explicitly
});

io.on("connection", (socket) => {
  console.log("server: connected via", socket.conn.transport.name);
  socket.conn.on("upgrade", (t) => console.log("server: upgraded to", t.name));
  socket.on("ping-me", (msg, ack) => ack("pong: " + msg));
});

httpsServer.listen(3443);

// 2) an HTTP/3 server on the same port number — but UDP
const h3Server = new Http3Server({
  port: 3443,
  host: "0.0.0.0",
  secret: "change-me",   // used by QUIC for stateless tokens — use a real random secret
  cert,
  privKey: key,
});
h3Server.startServer();

// 3) hand every WebTransport session opened on /socket.io/ to Engine.IO
const stream = await h3Server.sessionStream("/socket.io/");
const reader = stream.getReader();
while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  io.engine.onWebTransportSession(value);
}
```

Key points:
- TCP 3443 (HTTPS: polling/WebSocket) and UDP 3443 (HTTP/3: WebTransport) can share the
  same port number because they are different protocols.
- `io.engine.onWebTransportSession(session)` is the Engine.IO hook (added in
  `engine.io` 6.5, shipped with `socket.io` 4.7) that adopts a WebTransport session.
- The session path must match the Socket.IO `path` (`/socket.io/` by default).

---

## 18.6 Step 3 — clients

### Browser

```js
import { io } from "socket.io-client";

const socket = io("https://localhost:3443", {
  // default order is ["polling", "websocket", "webtransport"]; you can keep it
  transportOptions: {
    webtransport: {
      // only for self-signed dev certificates; omit in production with a CA-signed cert
      serverCertificateHashes: [{ algorithm: "sha-256", value: hexToBytes(CERT_HASH_HEX) }],
    },
  },
});

function hexToBytes(hex) {
  return new Uint8Array(hex.match(/../g).map((h) => parseInt(h, 16)));
}

socket.on("connect", () => {
  console.log("transport:", socket.io.engine.transport.name);
  socket.io.engine.on("upgrade", (t) => console.log("upgraded to", t.name)); // "webtransport"
});
```

### Node.js (uses a WebTransport implementation from the same package) — verified

Node has no global `WebTransport`, so the test client installs the one from
`@fails-components/webtransport`:

```js
// wt-client.mjs
import { readFileSync } from "node:fs";
import { WebTransport, quicheLoaded } from "@fails-components/webtransport";
import { io } from "socket.io-client";

await quicheLoaded;
globalThis.WebTransport = WebTransport;               // browsers have this natively

const hash = Buffer.from(readFileSync("./cert.hash", "utf8").trim(), "hex");

const socket = io("https://localhost:3443", {
  transports: ["webtransport"],                       // WebTransport only
  transportOptions: {
    webtransport: { serverCertificateHashes: [{ algorithm: "sha-256", value: hash }] },
  },
});

socket.on("connect", async () => {
  console.log("client: transport =", socket.io.engine.transport.name);
  console.log("client: ack =", await socket.timeout(3000).emitWithAck("ping-me", "hi"));
});
```

Real output:

```
client: transport = webtransport
client: ack = pong: hi
server: connected via webtransport
```

### Upgrade behaviour — verified

With the default transport order (`["polling", "websocket", "webtransport"]`) and the
server advertising WebTransport, the connection **started on polling and upgraded
straight to WebTransport**, skipping WebSocket:

```
client: connected via polling
client: upgraded to webtransport
server: connected via polling
server: upgraded to webtransport
```

This matches the client source: when `"webtransport"` is among the server's advertised
upgrades, the client probes it in preference to WebSocket. If the WebTransport probe
fails (UDP blocked, unsupported browser), the client stays on polling; with
`tryAllTransports: true` (4.8+) a failing initial transport makes the client try the next
one in the list.

Recommended client configurations:

| Goal | Client option |
|---|---|
| Best compatibility (default) | default `transports`; WebTransport used when possible |
| Skip polling, prefer WT, fall back to WS | `transports: ["webtransport", "websocket"]`, `tryAllTransports: true` |
| WT only (testing) | `transports: ["webtransport"]` |

---

## 18.7 Deployment considerations

- **Load balancers:** you need one that forwards **UDP/QUIC** (e.g. AWS NLB with UDP
  listeners, or an HTTP/3-aware proxy). Many classic L7 load balancers terminate HTTP/1.1
  and HTTP/2 only. Check whether your edge (CDN, ALB, ingress) supports WebTransport
  *pass-through*; HTTP/3 support for normal requests does not imply WebTransport support.
- **Sticky sessions:** a WebTransport-only connection is a single QUIC connection, so like
  WebSocket-only it doesn't need stickiness — but a client that **starts on polling and
  upgrades** needs the upgrade to reach the same node, i.e. sticky routing that works
  across TCP and UDP (often by client IP). QUIC connection migration can change the client
  address mid-connection — consider this when routing by IP.
- **Firewalls:** open UDP 443 (and your health checks). Corporate networks frequently block
  UDP → keep fallbacks.
- **Certificates:** production must use CA-signed certs; `serverCertificateHashes` is
  for dev/self-signed scenarios with the ≤14-day/ECDSA constraints.
- **Monitoring:** add the transport name to your metrics (`socket.conn.transport.name`) to
  see what share of users actually get WebTransport.

---

## 18.8 Troubleshooting WebTransport

| Symptom | Likely cause | Fix |
|---|---|---|
| Always stays on polling/WebSocket | `"webtransport"` missing from server `transports`; session stream not wired to `io.engine.onWebTransportSession`; UDP blocked | Enable it; wire the session stream; open UDP |
| `serverCertificateHashes is not valid fingerprint` (Node polyfill) | Hash not the SHA-256 of the DER certificate, or wrong encoding | Hash `X509Certificate.raw`; pass bytes (`Uint8Array`/`Buffer`), not a hex string |
| Browser refuses the connection with a self-signed cert | Certificate is RSA or valid for more than 14 days | ECDSA P-256, `-days 14` (or less), regenerate regularly |
| Works on localhost, fails in production | LB/CDN doesn't pass QUIC/WebTransport; UDP closed | UDP-capable LB, open ports, keep fallback |
| `connect_error: webtransport error` | Server unreachable on UDP, TLS mismatch, path mismatch | Check `sessionStream` path = `path`; cert; port |

---

## 18.9 Interview questions for this chapter

**Q1. [M] What is WebTransport and how does it differ from WebSocket?**
A browser API over HTTP/3 (QUIC/UDP) offering multiple independent streams (no
head-of-line blocking across streams), unreliable datagrams, faster connection setup and
connection migration; always encrypted. WebSocket is a single ordered TCP stream.

**Q2. [M] How do you enable WebTransport in Socket.IO?**
Add `"webtransport"` to the server's `transports`, run an HTTP/3 server
(`@fails-components/webtransport` in Node), and pass each session from
`h3Server.sessionStream("/socket.io/")` to `io.engine.onWebTransportSession()`. Clients
use it automatically when advertised (or `transports: ["webtransport"]`).

**Q3. [S] Does Socket.IO's WebTransport transport give you unreliable delivery?**
No — it uses a reliable bidirectional stream, so semantics match WebSocket. The gains are
setup latency and resilience on lossy/changing networks.

**Q4. [M] What certificate constraints apply to `serverCertificateHashes`?**
ECDSA certificate with a validity of at most 14 days; you pin the SHA-256 of the DER
certificate. In production use a normal CA-signed certificate.

**Q5. [S] Why should you keep WebSocket/polling fallbacks?**
UDP is blocked on some networks, and browser/platform support for WebTransport is not
universal.

**Q6. [M] With default client settings, which transport does a client end up on when the server offers WebTransport?**
It starts on polling and upgrades directly to WebTransport (verified), falling back to
staying on polling if the probe fails.

Next: [Chapter 19 — Custom adapters and custom parsers](19-custom-adapters-parsers.md)
