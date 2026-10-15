# Chapter 1: Foundations, or How Computers Talk

> **Goal of this chapter:** understand the ground WebSocket stands on. Everything later (handshakes,
> frames, heart-beats, load balancer timeouts) makes sense only after this.

---

## 1.1 ELI5: computers sending letters

Think of the internet as a giant postal system.

* Every computer has an **address** (an *IP address*, like `142.250.183.14`).
* Each computer runs many programs, so letters also need a **room number** (a *port*, like `443`).
* An address plus a port (`142.250.183.14:443`) is like "House 14, Room 443".

When your phone opens a web page, it is sending a letter to "House X, Room 443" saying "please
give me the page", and the server sends a letter back.

---

## 1.2 The layers (just enough networking)

Networking is built in **layers**. Each layer trusts the one below it and offers something nicer to the one above.

```
+---------------------------------------------------------------+
| Application layer   HTTP, WebSocket, STOMP, MQTT, SMTP ...    |  <- what this book is about
+---------------------------------------------------------------+
| Security layer      TLS (makes https:// and wss://)            |
+---------------------------------------------------------------+
| Transport layer     TCP (reliable, ordered)  /  UDP (fast)     |
+---------------------------------------------------------------+
| Internet layer      IP (addresses, routing)                    |
+---------------------------------------------------------------+
| Link layer          Wi-Fi, Ethernet, 4G/5G                     |
+---------------------------------------------------------------+
```

### 1.2.1 IP: the address on the envelope
IP moves *packets* from one computer to another. Packets can get lost, duplicated, or arrive out of order. IP does not care.

### 1.2.2 TCP: the reliable, ordered pipe
**TCP (Transmission Control Protocol)** makes IP's messy packets look like a clean, ordered
**stream of bytes**:

* **Connection-oriented.** A *three-way handshake* (`SYN` → `SYN-ACK` → `ACK`) opens a connection.
* **Reliable.** Lost packets are re-sent.
* **Ordered.** Bytes arrive in the order they were sent.
* **Flow control.** A receiver advertises a *window*: "I can take N more bytes." If the receiver is slow, the sender must wait. This becomes **backpressure** (Chapter 9).
* **Congestion control.** The sender slows down if the network is congested.
* **Full-duplex.** Both sides can send at the same time.

> **Key point:** TCP is a **byte stream**, not a message stream. If you send "HELLO" then "WORLD",
> the receiver might read "HELLOWOR" and then "LD". Anything built on TCP must define its own
> **message boundaries** (framing). WebSocket does this with *frames*, and STOMP adds its own framing
> on top with a `NULL` byte terminator.

> **Pitfall: TCP "half-open" connections.** If a phone loses signal or a laptop goes to sleep, the other side
> is **not told**. The server still thinks the connection is open until it tries to send and fails, or until
> a timeout fires. That is why WebSocket has **ping/pong** and STOMP has **heart-beats**. You will see this
> problem again and again in this book.

### 1.2.3 UDP
Fire-and-forget packets with no ordering or reliability. Used by games, video calls (WebRTC), and QUIC (which
HTTP/3 runs on). Classic WebSocket runs on **TCP**, not UDP.

### 1.2.4 TLS: the locked envelope
**TLS** encrypts the TCP stream and proves the server's identity using certificates.
`https://` = HTTP over TLS. `wss://` = WebSocket over TLS. In production **always use `wss://`**
(Chapter 8 explains why; also, many proxies break unencrypted WebSocket traffic).

---

## 1.3 HTTP: the request/response model

**HTTP** works like a waiter in a restaurant:

1. The client (you) sends a **request**: `GET /menu`.
2. The server (the kitchen) sends a **response**: `200 OK` plus the menu.
3. The waiter does not come back unless you call again.

```http
GET /api/orders/42 HTTP/1.1
Host: shop.example.com
Accept: application/json

HTTP/1.1 200 OK
Content-Type: application/json
Content-Length: 27

{"id":42,"status":"PACKED"}
```

Important properties:

| Property | Meaning | Why it matters for real-time |
|----------|---------|------------------------------|
| Client-initiated | Only the client can start a conversation | The server **cannot push** "your order shipped!" on its own |
| Stateless | Each request stands alone | Every request repeats headers (cookies, auth), which costs bytes |
| Header overhead | Often 500 bytes to several KB per request | Bad for tiny, frequent updates |
| Half-duplex per request | Request goes, then response comes | No simultaneous two-way talk within one exchange |

### HTTP versions in one table

| Version | Year | Key idea | Relation to WebSocket |
|---------|------|----------|-----------------------|
| HTTP/1.0 | 1996 | New TCP connection per request | – |
| HTTP/1.1 | 1997/1999 (RFC 2068/2616; now RFC 9112) | Keep-alive, `Upgrade` header | **The classic WebSocket handshake uses HTTP/1.1 `Upgrade`** |
| HTTP/2 | 2015 (RFC 7540, now RFC 9113) | Multiplexed streams on one TCP connection, binary framing | WebSocket over HTTP/2 via RFC 8441 (extended CONNECT) |
| HTTP/3 | 2022 (RFC 9114) | Runs on QUIC (UDP) | WebSocket over HTTP/3 via RFC 9220 |

---

## 1.4 The real-time problem

"Real-time" on the web means **the server needs to tell the client something the moment it happens**:

* A chat message arrives.
* A stock price changes.
* A delivery driver moves on the map.
* Someone edits the shared document.
* A long job finishes.
* A to-do item gets assigned to you by a teammate.

HTTP alone cannot do this because **the server cannot start a conversation**. People invented
several workarounds. You must know all of them for interviews.

### 1.4.1 Short polling

> **ELI5:** a kid in the back seat asking "Are we there yet?" every 5 seconds.

```js
setInterval(async () => {
  const res = await fetch('/api/notifications?since=' + lastId);
  render(await res.json());
}, 5000);
```

* **Pros:** dead simple; works everywhere; stateless servers; easy to cache and load balance.
* **Cons:** latency up to the interval; most responses are empty ("No, not yet"); wasted CPU, bandwidth and battery; thousands of clients become thousands of requests per second.

### 1.4.2 Long polling

> **ELI5:** You ask "Are we there yet?" and the parent **doesn't answer until we arrive** (or until a
> minute passes). Then you immediately ask again.

1. Client sends a request.
2. Server **holds** it open until there is data or a timeout (for example 30 s).
3. Server responds; the client immediately sends a new request.

* **Pros:** near-real-time; works over plain HTTP and through most proxies.
* **Cons:** one held request per client; a full HTTP request/response per message; message ordering and loss in the gap between requests must be handled (use a cursor like `since=lastId`); timeouts on proxies; tricky at scale.
* Historically called **Comet** (along with HTTP streaming). SockJS and CometD use it as a fallback.

### 1.4.3 HTTP streaming / Server-Sent Events (SSE)

> **ELI5:** The parent keeps talking on a one-way walkie-talkie: "We're at the bridge... now the
> tunnel... now the shop." You can listen, but to talk back you must use something else.

SSE (`EventSource` in browsers, `Content-Type: text/event-stream`) keeps one HTTP response open and the server
writes events into it:

```
event: orderUpdated
id: 1001
data: {"id":42,"status":"SHIPPED"}

```

* **Pros:** simple; plain HTTP; **automatic reconnect** with `Last-Event-ID` built into the browser API; works nicely with HTTP/2 multiplexing; good for one-way feeds (notifications, dashboards, LLM token streaming).
* **Cons:** **server → client only**; text only (UTF-8); the browser `EventSource` API cannot set custom headers (no `Authorization` header); over HTTP/1.1 browsers limit concurrent connections per domain (commonly 6), so many tabs can exhaust it (HTTP/2 fixes this).

### 1.4.4 WebSocket

> **ELI5:** A telephone call. One call, then both people talk whenever they want.

* One HTTP request **upgrades** to a persistent, **full-duplex** connection.
* After the handshake, messages carry only **2–14 bytes** of framing overhead (Chapter 2).
* Both sides can send at any time.
* Text and binary data.

### 1.4.5 Other options you should be able to name

| Technology | One-liner |
|------------|-----------|
| **WebRTC DataChannel** | Peer-to-peer (browser↔browser), runs over SCTP/DTLS/UDP, can be unreliable/unordered; needs signalling (often done *via* WebSocket!) |
| **WebTransport** | Newer API over HTTP/3 (QUIC); multiple streams + unreliable datagrams; no head-of-line blocking. Browser support is still growing. |
| **HTTP/2 Server Push** | **Not** a real-time messaging tool; it pushed resources (CSS/JS) into the cache. Chrome removed it (2022). Never answer "use HTTP/2 push for chat" in an interview. |
| **gRPC streaming** | Bi-directional streaming over HTTP/2; great service-to-service; in browsers needs gRPC-Web, which does not support client streaming / bidi streaming. |
| **MQTT** | Lightweight pub/sub protocol for IoT; can run over WebSocket (MQTT over WS). |
| **Socket.IO** | A library with its **own protocol** (Engine.IO) that *may use* WebSocket. A plain WebSocket client **cannot** talk to a Socket.IO server. |
| **SignalR** | Microsoft's real-time library for .NET; negotiates WebSocket → SSE → long polling. |
| **Push notifications (FCM/APNs)** | OS-level push to mobile devices when the app is in background; complements, not replaces, WebSocket. |

### 1.4.6 The comparison table (memorise this)

| | Short polling | Long polling | SSE | WebSocket |
|---|---|---|---|---|
| Direction | Client pull | Client pull (server delays) | Server → client | **Both ways** |
| Latency | Up to interval | Low | Low | **Lowest** |
| Overhead per message | Full HTTP req+resp | Full HTTP req+resp | Small (event text) | **Tiny (2–14 bytes frame header)** |
| Connection | New/reused per poll | Held, re-opened per message | One long response | One persistent connection |
| Binary data | Yes (HTTP body) | Yes | No (text only) | Yes |
| Auto reconnect | N/A | Manual | **Built-in** | **Manual** (or library) |
| Proxy/firewall friendliness | Best | Good | Good | Usually good with `wss://`; old proxies can break it |
| Server complexity | Lowest | Medium | Low–medium | Higher (stateful connections) |
| Typical use | Rare updates | Fallback | Feeds, notifications, AI token streams | Chat, games, collaboration, trading, live tracking |

> **Interview tip: "When would you NOT use WebSocket?"**
> When updates are rare (polling is simpler), when data flows only server → client (SSE is simpler and
> auto-reconnects), when you need offline/background delivery on mobile (push notifications), when
> responses must be cacheable by CDNs (HTTP), or when the team cannot afford stateful infrastructure.

---

## 1.5 Why do we need STOMP on top of WebSocket?

WebSocket gives you a pipe that carries **messages** (text or binary). That's it. It does **not** say:

* What does a message *mean*? Is it a chat message, a subscription request, an error?
* **Where** is it going? (No concept of "topic" or "destination".)
* How do I **subscribe** to only some kinds of messages?
* How do I know the server **received** my message? (No receipts/acks.)
* How do I send **headers/metadata** (content type, correlation ID)?
* How does a **broker** route one message to 10,000 subscribers?

Without a sub-protocol, every team invents its own ad-hoc JSON format:

```json
{"type":"subscribe","channel":"room-1"}
{"type":"chat","channel":"room-1","text":"hi"}
```

…and then re-invents acks, errors, heart-beats and routing, often badly. **STOMP** (Simple Text Oriented
Messaging Protocol) is a standard, tiny, text-based messaging protocol that already defines all of this:

```
SUBSCRIBE
id:sub-0
destination:/topic/room-1

^@
```

Because it's a standard:

* Off-the-shelf **clients** exist (stompjs, Java, Python, Go, .NET, Ruby…).
* Off-the-shelf **brokers** speak it (RabbitMQ, ActiveMQ Classic/Artemis…).
* Frameworks like **Spring** can route messages to annotated methods (`@MessageMapping`) just like `@RequestMapping` for HTTP.

```
 +----------------------------+
 | Your app's messages (JSON) |   e.g. {"text":"hi"}
 +----------------------------+
 | STOMP frame                |   SEND / destination:/app/chat / body
 +----------------------------+
 | WebSocket frame            |   opcode=text, FIN=1, masked payload
 +----------------------------+
 | TLS                        |   encrypted bytes
 +----------------------------+
 | TCP                        |   ordered reliable byte stream
 +----------------------------+
```

---

## 1.6 Publish/subscribe and messaging vocabulary

Before STOMP, learn the words messaging people use:

| Term | ELI5 | Technical |
|------|------|-----------|
| **Message** | A letter | A unit of data with headers + body |
| **Producer / Publisher** | Person who writes letters | Component that sends messages |
| **Consumer / Subscriber** | Person who reads letters | Component that receives messages |
| **Destination** | The name on the mailbox | A string identifying where a message goes, e.g. `/topic/prices` |
| **Topic (pub/sub)** | A radio station: everyone tuned in hears every song | One message → **all** current subscribers |
| **Queue (point-to-point)** | A ticket counter: each customer is served by one clerk | One message → **one** consumer (competing consumers) |
| **Broker** | The post office | Middleware that stores and routes messages |
| **Subscription** | Telling the post office "send me kitchen letters" | Registration of interest in a destination |
| **Ack (acknowledgement)** | "Got it!" | Consumer confirms processing so the broker can forget the message |
| **Durable** | Mailbox that keeps letters while you're on holiday | Messages/subscriptions survive disconnects/restarts |
| **Fan-out** | Photocopying one letter for everyone | Delivering one message to many subscribers |
| **At-most-once / at-least-once / exactly-once** | Maybe / definitely, maybe twice / exactly once | Delivery guarantees (Chapter 9) |

> **Important:** In STOMP, the spec says destination strings are **opaque** and broker-specific.
> `/topic/...` and `/queue/...` are only *conventions*. Spring's simple broker treats every
> destination as pub/sub; RabbitMQ gives `/queue/` and `/topic/` real, different meanings (Chapter 7).

---

## 1.7 Stateful vs stateless servers (why WebSocket is "harder")

A REST server can be **stateless**: any request can go to any server instance. A WebSocket server is
**stateful**: each server instance holds **open connections** to specific clients.

Consequences (all covered later):

1. **Load balancing** must support long-lived connections and the `Upgrade` mechanism.
2. **Scaling out**: if user A is connected to server 1 and user B to server 2, a message from A to B
   must cross servers → you need a **broker** or a pub/sub backplane (Chapter 7).
3. **Deployments** drop connections → clients must **reconnect** gracefully (Chapter 9).
4. **Memory**: each connection costs memory (buffers, session objects).
5. **Timeouts**: proxies close "idle" connections → **heart-beats** are required.
6. **Observability**: "requests per second" is no longer the only metric; you track *concurrent connections*, *messages/sec*, *send buffer sizes*, etc.

---

## 1.8 Chapter summary

* TCP is a reliable byte stream; it needs framing and can silently half-open.
* HTTP is request/response, client-initiated, header-heavy, so not great for server push.
* Workarounds: short polling, long polling, SSE. Each has trade-offs.
* WebSocket = one upgraded HTTP connection that becomes a full-duplex message channel with tiny overhead.
* STOMP = a standard messaging language on top of WebSocket (destinations, subscribe, ack, receipts, errors, heart-beats).
* Brokers route messages: topics (fan-out) vs queues (one consumer).
* WebSocket servers are stateful, and that drives most of the hard problems in production.

Next: [Chapter 2: The WebSocket Protocol](02-websocket-protocol.md)
