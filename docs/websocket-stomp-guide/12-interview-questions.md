# Chapter 12: Interview Questions & Answers, Part 1

> **How to use this chapter:** questions are grouped by topic and tagged by level:
> **[E]** entry/junior, **[M]** mid-level, **[S]** senior/lead/architect. Each answer is written the way you
> should *say* it in an interview: direct answer first, then the "why", then a detail that shows depth.
> These cover the questions commonly asked at product companies, service companies, fintech, and
> e-commerce for Java/Spring, full-stack, front-end, and system-design rounds.
>
> Part 1: Fundamentals, WebSocket protocol, browser API, STOMP, Spring.
> [Part 2](12-interview-questions-part2.md): Security, scaling & brokers, reliability & performance,
> debugging scenarios, system design, coding tasks, behavioural, rapid-fire.

---

## A. Fundamentals & comparisons

**A1. [E] What is a WebSocket?**
A protocol (RFC 6455) that provides a **persistent, full-duplex** communication channel over a single TCP connection.
It starts as an HTTP/1.1 request with `Upgrade: websocket`; the server answers `101 Switching Protocols`, and from then
on both sides exchange lightweight **frames** at any time. It's used for real-time features like chat, live
dashboards, notifications, collaboration and games.

**A2. [E] Why not just use HTTP for real-time?**
HTTP is request/response and client-initiated: the server can't push data unprompted. Emulating push with polling
wastes requests (most return nothing), adds latency equal to the interval, and repeats headers each time. WebSocket
keeps one connection open with 2–14 bytes of framing overhead per message and lets the server push instantly.

**A3. [E] Explain short polling, long polling, SSE, and WebSocket.**
* *Short polling:* client requests every N seconds. Simple, wasteful, latency up to N.
* *Long polling:* server holds the request until data arrives or a timeout, then the client re-requests. Near real-time but one full HTTP exchange per message.
* *SSE:* one long HTTP response streaming `text/event-stream` events, **server→client only**, text only, auto-reconnect with `Last-Event-ID` built in.
* *WebSocket:* bidirectional, binary or text, lowest overhead, but you implement reconnect/heart-beats and run stateful infrastructure.

**A4. [M] When would you choose SSE over WebSocket?**
When data flows only server→client (notifications, feeds, progress, LLM token streaming), when you want built-in
reconnect/resume, simpler infrastructure (plain HTTP, works great with HTTP/2 multiplexing), and no need for
binary. Client→server actions can go over normal REST calls.

**A5. [M] When should you NOT use WebSocket?**
Infrequent updates (polling is simpler), one-way feeds (SSE), cacheable content (HTTP/CDN), background/offline delivery
on mobile (push notifications), request/response APIs (REST/gRPC), very large file transfers (HTTP with resumable
uploads), or teams without capacity to operate stateful connection infrastructure.

**A6. [M] Is WebSocket built on HTTP?**
Only the **opening handshake** is HTTP (an HTTP/1.1 GET with Upgrade). After `101`, the connection speaks the WebSocket
framing protocol directly over TCP (or TLS). It's "HTTP-compatible" so it can use ports 80/443 and pass through HTTP
infrastructure. Over HTTP/2 (RFC 8441) and HTTP/3 (RFC 9220), it's bootstrapped with an extended CONNECT on a stream.

**A7. [E] What ports and URL schemes does WebSocket use?**
`ws://` (default port 80) and `wss://` (TLS, default 443). Fragments (`#`) aren't allowed in WebSocket URIs.

**A8. [M] What's the difference between WebSocket and a raw TCP socket?**
TCP is a byte stream with no message boundaries, no browser access, no HTTP-compatible handshake. WebSocket adds a
handshake through HTTP infrastructure, message framing (text/binary), masking, control frames (ping/pong/close),
origin-based security, and a browser API. Browsers can't open raw TCP sockets.

**A9. [M] Is WebSocket stateful or stateless? Implications?**
Stateful: each server holds live connections. Implications: load balancers must support upgrades and long connections;
scaling out needs a broker/backplane so messages reach users on other instances; deployments disconnect clients
(need reconnect + resync); memory per connection; heart-beats needed to survive idle timeouts; metrics shift to
concurrent connections and message rates.

**A10. [E] What is full-duplex?**
Both parties can send at the same time, independently. HTTP/1.1 is effectively half-duplex per exchange (request, then response).

**A11. [M] Compare WebSocket with WebRTC and WebTransport.**
WebRTC: peer-to-peer media and data channels over UDP (SCTP/DTLS), can be unreliable/unordered, needs signalling
(often done via WebSocket) and STUN/TURN. WebTransport: client-server over HTTP/3/QUIC with multiple streams and
unreliable datagrams, no head-of-line blocking; newer with growing support. WebSocket: single ordered reliable TCP
stream, universally supported.

**A12. [M] What is Socket.IO and can a WebSocket client talk to a Socket.IO server?**
Socket.IO is a library with its own protocol (Engine.IO underneath) that uses WebSocket or HTTP long-polling, adding
rooms, acknowledgements, reconnection. Its packets have their own framing, so a **plain WebSocket client can't talk to
a Socket.IO server** (and vice versa) without the Socket.IO client.

**A13. [M] Was HTTP/2 Server Push a replacement for WebSockets?**
No. It pushed resources into the browser cache in anticipation of requests (e.g., CSS), not application messages to
JavaScript, and Chrome removed it in 2022. Real-time alternatives on HTTP/2 are SSE or WebSocket over HTTP/2 (RFC 8441).

**A14. [E] What is pub/sub? Topic vs queue?**
Publish/subscribe decouples senders from receivers through named destinations. A **topic** delivers each message to
**all** current subscribers (fan-out); a **queue** delivers each message to **one** of the consumers (competing
consumers, load balancing). In STOMP, destination semantics are broker-defined: `/topic` and `/queue` are conventions.

**A15. [S] How does TCP's reliability relate to message reliability in WebSocket apps?**
TCP guarantees ordered delivery of bytes **only while the connection lives**. If the connection drops, bytes in
flight and messages published while disconnected are lost; neither side automatically knows what the other received.
Application-level reliability needs ids/sequence numbers, acks, persistence and resync after reconnect.

---

## B. WebSocket protocol (RFC 6455)

**B1. [E] Describe the WebSocket handshake.**
Client sends `GET /path HTTP/1.1` with `Host`, `Upgrade: websocket`, `Connection: Upgrade`, `Sec-WebSocket-Key`
(base64 of 16 random bytes), `Sec-WebSocket-Version: 13`, and optionally `Origin`, `Sec-WebSocket-Protocol`,
`Sec-WebSocket-Extensions`. Server answers `HTTP/1.1 101 Switching Protocols` with `Upgrade`, `Connection` and
`Sec-WebSocket-Accept`, plus the selected sub-protocol/extensions. Then frames flow.

**B2. [M] How is `Sec-WebSocket-Accept` computed and why?**
`base64(SHA-1(Sec-WebSocket-Key + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"))`. It proves the server understood the
WebSocket handshake (not some HTTP server or cache blindly replying), preventing cross-protocol confusion and stale cached
responses. It is **not** authentication or encryption.

**B3. [M] What status code indicates a successful handshake? What if the server returns 200 or 302?**
`101 Switching Protocols`. Anything else is a failed handshake. Browsers don't follow redirects for WebSocket; a 200
typically means the request hit a normal page (misrouting or a proxy not forwarding Upgrade).

**B4. [M] Describe the structure of a WebSocket frame.**
Byte 0: FIN (1 bit), RSV1–3 (3 bits), opcode (4 bits). Byte 1: MASK bit + 7-bit payload length. If length is 126, the
next 2 bytes hold the length; if 127, the next 8 bytes. Then a 4-byte masking key if MASK=1, then the payload.
Overhead: 2–14 bytes.

**B5. [E] List the opcodes.**
0x0 continuation, 0x1 text, 0x2 binary, 0x8 close, 0x9 ping, 0xA pong; 0x3–0x7 and 0xB–0xF reserved.

**B6. [M] What is masking and why do only clients mask?**
Clients XOR the payload with a random 4-byte key per frame. It prevents attacker-controlled JavaScript from producing
predictable bytes on the wire that confused intermediaries could misinterpret as HTTP requests (cache poisoning, per the
2011 Huang et al. research). The server isn't attacker-scriptable in that model, so server frames aren't masked. A server
must close the connection (1002) on an unmasked client frame. Masking is not encryption: the key is in the frame.

**B7. [M] What is fragmentation? Can control frames be fragmented?**
A message can be split into frames: first frame has the opcode and FIN=0, following frames use opcode 0 (continuation),
the last has FIN=1. It allows streaming messages of unknown size and keeps the connection responsive. Control frames
can't be fragmented and must be ≤125 bytes, but they **can be interleaved** between fragments of a data message.

**B8. [M] What's the difference between a frame and a message?**
A message is the application-level unit (one text or binary payload). A frame is the wire unit. One message = one or
more frames. APIs like the browser's deliver whole messages.

**B9. [M] What are ping and pong frames?**
Control frames for keep-alive/liveness. Receiving a ping requires replying with a pong carrying the same payload. An
unsolicited pong can be a one-way heart-beat. Browsers auto-reply to pings, but JS can't send pings, which is why app-level
heart-beats (like STOMP's) exist.

**B10. [M] Explain the closing handshake.**
One side sends a Close frame (optional 2-byte status code + UTF-8 reason ≤123 bytes), stops sending data, the other replies with a Close frame, and the TCP connection closes (server closes TCP first, ideally). If TCP dies without close frames, the API reports 1006.

**B11. [E/M] Name common close codes.**
1000 normal, 1001 going away, 1002 protocol error, 1003 unsupported data, 1005 no status (reserved), 1006 abnormal (reserved, never sent), 1007 invalid payload (e.g., bad UTF-8), 1008 policy violation, 1009 message too big, 1010 mandatory extension, 1011 internal error, 1012 service restart, 1013 try again later, 1015 TLS failure (reserved). 3000–3999 for libraries/frameworks, 4000–4999 private use.

**B12. [M] What does close code 1006 mean and how do you debug it?**
"Abnormal closure": the connection was lost without a close frame. The code is generated locally, never sent. Causes: network loss, server crash, proxy/LB idle timeout, TLS errors, the server killing the TCP connection. Debug with timing (exactly 60 s → proxy timeout), server logs, LB logs, heart-beat configuration, mobile network transitions.

**B13. [M] What's a sub-protocol? Give STOMP's.**
An application-level protocol negotiated in the handshake via `Sec-WebSocket-Protocol`. The client offers a list; the
server selects one. STOMP: `v10.stomp`, `v11.stomp`, `v12.stomp`.

**B14. [M] What is `permessage-deflate`? Trade-offs?**
RFC 7692 extension compressing each message with DEFLATE (RSV1 marks compressed messages). It saves bandwidth for
text/JSON but costs CPU and memory per connection (sliding windows with context takeover), and mixing secrets with
attacker-controlled data in the same compression context can enable CRIME/BREACH-style leaks.

**B15. [M] Text vs binary frames?**
Text frames must contain valid UTF-8 (otherwise close 1007); binary frames can be any bytes. Binary is used for
protobuf/MessagePack, images, or when bodies may contain NULL bytes.

**B16. [S] How does WebSocket work over HTTP/2?**
HTTP/2 has no Upgrade mechanism. RFC 8441 adds `SETTINGS_ENABLE_CONNECT_PROTOCOL`; the client sends an extended
CONNECT (`:method CONNECT`, `:protocol websocket`) on a new stream; the server returns `:status 200`; there's no
Sec-WebSocket-Key/Accept exchange. Many WebSockets can share one TCP connection. RFC 9220 does the same for HTTP/3.

**B17. [M] What is the maximum message size?**
The protocol allows payloads up to 2^63−1 bytes per frame. In practice servers impose limits (Tomcat 8 KB message buffer
by default, Spring STOMP 64 KB, API Gateway 128 KB), and exceeding them causes close 1009. Design messages to be small.

**B18. [S] Why must proxies be configured specially for WebSocket?**
`Upgrade` and `Connection` are **hop-by-hop** headers that proxies normally don't forward, and proxies often default to
HTTP/1.0 upstream or short read timeouts. You must forward the headers with HTTP/1.1 (Nginx: `proxy_http_version 1.1`,
`proxy_set_header Upgrade $http_upgrade`, `Connection "upgrade"`) and raise idle timeouts.

**B19. [M] Does the Same-Origin Policy / CORS apply to WebSocket?**
No. Any page can open a WebSocket to any server, and the browser includes the page's `Origin` header and cookies per
SameSite rules. Servers must validate `Origin` to prevent Cross-Site WebSocket Hijacking.

**B20. [S] Why does the RFC require the server to close the TCP connection first?**
So the server ends up in TCP TIME_WAIT instead of the client, letting the client reopen a connection immediately.

**B21. [M] What does "half-open connection" mean and how do you detect it?**
One side believes the connection is open while the other side is gone (e.g., phone lost signal, NAT entry expired). TCP
doesn't notice until it sends data and retransmissions fail (can take many minutes). Detect with ping/pong or
application heart-beats and a timeout.

**B22. [S] Could you implement a WebSocket server by hand? What's hard?**
Yes: parse the HTTP upgrade, compute Accept, parse frames. Hard parts: partial TCP reads/buffering, fragmentation,
masking, UTF-8 validation across fragments, control frames during fragmented messages, close handshake, backpressure,
extensions, limits. In production, use a mature library.

---

## C. Browser API & clients

**C1. [E] How do you open a WebSocket in the browser?**
`const ws = new WebSocket('wss://host/ws', ['v12.stomp']);` then handle `open`, `message`, `error`, `close`, and send with `ws.send(data)` after `open`.

**C2. [E] What are the readyState values?**
0 CONNECTING, 1 OPEN, 2 CLOSING, 3 CLOSED.

**C3. [M] Can you set custom headers (Authorization) on a browser WebSocket?**
No. The constructor only takes URL and protocols. Workarounds: cookies (with Origin checks), token in a query parameter
(logged, so use short-lived tickets), the sub-protocol hack, or authenticating in the first message (STOMP CONNECT headers, the usual choice).

**C4. [M] What does `bufferedAmount` tell you?**
Bytes queued by `send()` not yet transmitted. Use it for client-side backpressure (pause sending when high). `send()` never blocks.

**C5. [M] Does the browser WebSocket reconnect automatically?**
No (unlike `EventSource`). Implement reconnect with exponential backoff + jitter, re-subscribe, and resync state. Libraries like stompjs (`reconnectDelay`) do the reconnect part.

**C6. [M] Why is `onerror` useless for diagnostics?**
Browsers intentionally hide error details to prevent network probing from web pages. Use DevTools and the `close` event's code/reason.

**C7. [M] What can you pass to `close()`?**
Code 1000 or 3000–4999 (others throw `InvalidAccessError`) and a reason ≤123 UTF-8 bytes (else `SyntaxError`).

**C8. [S] How would you share one WebSocket across many tabs?**
SharedWorker owning the socket with `MessagePort` communication, or leader election (Web Locks/BroadcastChannel) where one tab holds the connection and rebroadcasts. Trade-off: complexity vs connection count.

**C9. [M] What's "thundering herd" in reconnects and how do you prevent it?**
When a server restarts, all clients reconnect at the same moment and overload the remaining capacity. Prevent with exponential backoff, random jitter, rolling deploys, and server-side load shedding (close code 1013).

**C10. [M] How do you handle WebSocket in React correctly?**
One shared client (module singleton/context), subscriptions in `useEffect` with cleanup (unsubscribe), ref-counted per destination to avoid duplicates, a ref for the latest callback to avoid re-subscribing, and functional state updates to avoid stale closures. Be aware that StrictMode double-invokes effects in development.

**C11. [M] What special issues exist with STOMP on React Native?**
RN's WebSocket historically truncated text frames at the NULL byte that terminates STOMP frames. Fix with stompjs options `forceBinaryWSFrames: true` and `appendMissingNULLonIncoming: true`. Older engines need a `TextEncoder` polyfill. Android emulator must use `10.0.2.2` for host localhost; Android/iOS block cleartext `ws://` by default; background apps get suspended, so you need push notifications and resync on foreground.

**C12. [M] What's SockJS and is it still needed?**
A WebSocket emulation library/protocol that falls back to HTTP streaming/polling when WebSocket is blocked (old proxies, IE). Spring supports it via `.withSockJS()`. Today it's rarely needed: WebSocket over `wss://443` works almost everywhere. Keep it only if metrics show users on fallback transports. Fallback transports require sticky sessions.

**C13. [S] What happens to a WebSocket when a laptop sleeps or a phone changes networks?**
The TCP connection usually dies silently (half-open). Without heart-beats the client may think it's connected for minutes. With heart-beats, the library detects missing traffic, closes, and reconnects; the app must then re-subscribe and resync missed data.

---

## D. STOMP protocol

**D1. [E] What is STOMP?**
Simple (or Streaming) Text Oriented Messaging Protocol: a simple, text-based, frame-oriented messaging protocol (HTTP-like frames) that defines commands such as CONNECT, SEND, SUBSCRIBE, ACK and MESSAGE, so clients and brokers in any language can interoperate. It runs over TCP or WebSocket.

**D2. [E] Why use STOMP over WebSocket instead of raw WebSocket?**
WebSocket only moves messages; it has no notion of destinations, subscriptions, headers, acknowledgements, receipts or errors. STOMP standardises those, gives you broker interoperability (RabbitMQ, ActiveMQ), many client libraries, and lets Spring route messages to `@MessageMapping` methods. Without it you'd invent an ad-hoc protocol.

**D3. [E] Describe the STOMP frame format.**
```
COMMAND\n
header1:value1\n
header2:value2\n
\n
body\0
```
Command line, header lines, a blank line, an optional body, and a NULL byte terminator. In 1.2 lines can end with CRLF.

**D4. [E] List client and server frames.**
Client: CONNECT (or STOMP), SEND, SUBSCRIBE, UNSUBSCRIBE, ACK, NACK, BEGIN, COMMIT, ABORT, DISCONNECT. Server: CONNECTED, MESSAGE, RECEIPT, ERROR.

**D5. [M] What headers does CONNECT require in STOMP 1.2?**
`accept-version` and `host`. Optional: `login`, `passcode`, `heart-beat`. Custom headers (like `Authorization`) are allowed and are how token auth is usually done.

**D6. [M] How is the version negotiated?**
Client lists versions in `accept-version`; server picks the highest common one and returns it in CONNECTED's `version` header. If there's none, the server sends ERROR with a `version` header listing supported versions and closes. If `accept-version` is absent, 1.0 is assumed.

**D7. [M] Explain STOMP heart-beating and its negotiation.**
CONNECT has `heart-beat:cx,cy` (client can send every cx ms; wants to receive every cy ms); CONNECTED has `sx,sy`.
Client→server interval = 0 if cx=0 or sy=0, else max(cx, sy). Server→client = 0 if sx=0 or cy=0, else max(sx, cy).
A heart-beat is an EOL sent when idle; any traffic counts. If nothing arrives within the interval (plus tolerance), the peer is considered dead and the connection is closed.

**D8. [M] Example: client `heart-beat:5000,10000`, server `heart-beat:20000,0`. Result?**
Client→server: sy=0 → **no** client heart-beats. Server→client: sx=20000, cy=10000 → max = **20000 ms**.

**D9. [M] What are the ack modes?**
`auto` (default; message considered delivered when sent), `client` (client must ACK; **cumulative**, so acking a message acks all earlier ones on that subscription), `client-individual` (must ACK each message individually; not cumulative). Unacked messages may be redelivered if the client disconnects.

**D10. [M] How do ACK/NACK work in 1.2 vs 1.1?**
In 1.2, the MESSAGE carries an `ack` header, and ACK/NACK send `id:<that value>`. In 1.1, ACK/NACK used `subscription` and `message-id` headers. NACK (since 1.1) tells the broker the message wasn't consumed; the broker may redeliver, dead-letter or discard it.

**D11. [M] What is a receipt?**
Any client frame except CONNECT can include `receipt:<id>`; the server replies with `RECEIPT receipt-id:<id>` after processing it. Since STOMP is stream-based, it also implies receipt of all earlier frames. Used for confirming sends, subscriptions, and graceful DISCONNECT. It doesn't confirm delivery to subscribers.

**D12. [M] What happens when the server sends ERROR?**
It contains a `message` header and details in the body (and `receipt-id` if related to a frame with a receipt). The server **must close the connection** right after. So ERROR is fatal and shouldn't be used for ordinary business validation errors (send those as regular MESSAGEs to a user error queue).

**D13. [M] What's the purpose of the `id` header in SUBSCRIBE?**
Required since 1.1. It uniquely identifies the subscription within the connection, enables multiple subscriptions to the same destination, appears in MESSAGE's `subscription` header so the client can dispatch, and is used by UNSUBSCRIBE.

**D14. [M] What does `content-length` do? Why is it important?**
It gives the body size in **bytes (octets)**. With it, the body may contain NULL bytes (binary). Without it, the body ends at the first NULL. A classic bug: computing it from string length (characters) breaks non-ASCII text.

**D15. [M] How are special characters in headers handled?**
STOMP 1.1+ escapes them inside header names/values: a newline is written as the two characters `\n`, a colon as `\c`, a backslash as `\\`, and (1.2) a carriage return as `\r`. Any other escape (like `\t`) is a fatal protocol error. CONNECT and CONNECTED frames are not escaped (backward compatibility with 1.0). Header values aren't trimmed, so `destination: /x` has a value with a leading space.

**D16. [M] What if a header is repeated?**
Only the first occurrence is used.

**D17. [M] Which frames can have a body?**
Only SEND, MESSAGE and ERROR.

**D18. [M] What are STOMP transactions?**
`BEGIN transaction:tx1`, then SEND/ACK/NACK frames with `transaction:tx1` are buffered until `COMMIT` (applied atomically) or `ABORT` (discarded). Uncommitted transactions are aborted on DISCONNECT or connection failure. Broker support varies (Spring's simple broker doesn't support them).

**D19. [M] How do you disconnect gracefully?**
Send `DISCONNECT` with a `receipt`, wait for the RECEIPT (guarantees earlier frames were received), then close the socket.

**D20. [M] What's the STOMP command used for?**
An alias of CONNECT (1.1+), letting servers distinguish STOMP from HTTP on the same port. Most clients still send CONNECT for compatibility with 1.0 servers.

**D21. [M] What's new in STOMP 1.1 and 1.2?**
1.1: heart-beating, NACK, version negotiation, virtual hosting (`host`), header escaping/UTF-8, required SUBSCRIBE `id`, `client-individual` mode, STOMP frame. 1.2: CRLF line endings, simplified ACK/NACK via `ack`/`id`, `\r` escape, clarified repeated headers, connection lingering, clarified id scopes.

**D22. [M] Does STOMP define what `/topic` and `/queue` mean?**
No. Destinations are opaque strings interpreted by the server/broker. `/topic` (fan-out) and `/queue` (point-to-point) are common conventions. RabbitMQ also has `/exchange/...`, `/amq/queue/...`, `/temp-queue/...`. Spring's simple broker treats all destinations as pub/sub.

**D23. [S] Compare STOMP with MQTT and AMQP.**
STOMP: text, very simple, opaque destinations, ack modes, great for browsers/Spring. MQTT: compact binary, topic hierarchy with `+`/`#` wildcards, QoS 0/1/2, retained messages, last will; ideal for IoT/mobile. AMQP 0-9-1: binary, rich routing (exchanges, bindings), confirms; back-end messaging (RabbitMQ). AMQP 1.0: standardised enterprise messaging (Artemis, Azure Service Bus).

**D24. [S] What are STOMP's limitations?**
Text overhead, ERROR is always fatal, no built-in request/reply correlation (conventions only), destination semantics vary by broker, no replay/history, spec unchanged since 2012, and no flow control beyond broker features like prefetch.

**D25. [M] How does request/reply work over STOMP?**
By convention: the client sends with `reply-to` (e.g., a temp queue or user queue) and a `correlation-id`; the responder sends the reply there with the same correlation id. In Spring, `@SendToUser(broadcast = false)` or `@SubscribeMapping` covers most request/reply needs.

**D26. [M] Can STOMP carry binary data?**
Yes: include `content-length` and an appropriate `content-type`, and preferably send as binary WebSocket frames. stompjs offers `binaryBody`.

---

## E. Spring WebSocket / STOMP

**E1. [E] How do you enable STOMP over WebSocket in Spring Boot?**
Add `spring-boot-starter-websocket`, create a `@Configuration` with `@EnableWebSocketMessageBroker` implementing `WebSocketMessageBrokerConfigurer`, register an endpoint (`registry.addEndpoint("/ws")`), set application prefixes (`/app`) and enable a broker (`enableSimpleBroker("/topic", "/queue")` or a relay).

**E2. [E] What do `setApplicationDestinationPrefixes` and `enableSimpleBroker` do?**
Messages whose destination starts with the application prefix (e.g., `/app`) are routed to `@MessageMapping` methods. Messages and subscriptions with broker prefixes (e.g., `/topic`, `/queue`) go to the broker, which fans them out to subscribers.

**E3. [M] Explain the three channels in Spring's STOMP support.**
`clientInboundChannel` carries messages from WebSocket clients; `clientOutboundChannel` carries messages to clients; `brokerChannel` carries messages from server-side application code to the broker. Inbound/outbound are backed by thread pools (2 × CPUs core size by default). Interceptors can be attached to them.

**E4. [M] Walk through what happens when a client SENDs to `/app/chat`.**
`SubProtocolWebSocketHandler` receives the WebSocket message → `StompSubProtocolHandler` decodes it into a `Message` → `clientInboundChannel` (interceptors run) → `SimpAnnotationMethodMessageHandler` matches `@MessageMapping("/chat")` → payload converted (Jackson) → method invoked → return value sent to `brokerChannel` (to `@SendTo` or default `/topic/chat`) → broker finds subscribers → `clientOutboundChannel` → encoded STOMP MESSAGE → WebSocket.

**E5. [M] What's the default destination of a `@MessageMapping` return value?**
The input destination with the application prefix replaced by `/topic`, e.g., `/app/greeting` → `/topic/greeting`. Override with `@SendTo` or `@SendToUser`.

**E6. [M] `@SendTo` vs `@SendToUser`?**
`@SendTo` sends to a broker destination (all subscribers). `@SendToUser` sends to the current user's user destination (`/user/queue/...`): all their sessions by default, or only the originating session with `broadcast = false`. Without an authenticated user, `@SendToUser` falls back to the current session.

**E7. [M] What's `@SubscribeMapping` used for?**
Handling SUBSCRIBE frames to application destinations (e.g., `/app/rooms`). The return value is sent **directly back to that client** via the outbound channel, not through the broker, which makes it ideal for loading initial data when a UI component subscribes.

**E8. [M] How do you send a message from a REST controller or scheduled job?**
Inject `SimpMessagingTemplate` (or `SimpMessageSendingOperations`) and call `convertAndSend("/topic/x", payload)` or `convertAndSendToUser(username, "/queue/x", payload)`.

**E9. [M] Can `SimpMessagingTemplate.convertAndSend("/app/x")` trigger a `@MessageMapping`?**
No. The template sends to the `brokerChannel`; only client messages arriving on the inbound channel are routed to annotated handlers. Call the service directly instead.

**E10. [M] Explain user destinations.**
Clients subscribe to `/user/queue/x`; Spring's `UserDestinationMessageHandler` translates it to a session-unique destination like `/queue/x-user{sessionId}`. Server code calls `convertAndSendToUser("anna", "/queue/x", payload)` → `/user/anna/queue/x` → resolved via `SimpUserRegistry` to all of anna's sessions. Requires a Principal whose `getName()` matches.

**E11. [S] Why might `convertAndSendToUser` not deliver?**
Principal name mismatch (e.g., email vs id vs JWT `sub`), no Principal set on the session, client subscribed to `/queue/x` instead of `/user/queue/x`, user connected to another instance (need relay with user destination broadcast), wrong user prefix configuration, or the broker prefix (`/queue`) not enabled.

**E12. [M] How do you get the current user in a `@MessageMapping` method?**
Add a `java.security.Principal` parameter (or `@AuthenticationPrincipal` with Spring Security's argument resolver), or read `SimpMessageHeaderAccessor#getUser()`.

**E13. [M] How do you access the session id and session attributes?**
`SimpMessageHeaderAccessor#getSessionId()` / `@Header("simpSessionId")`, and `getSessionAttributes()` for the per-session map (populated by handshake interceptors like `HttpSessionHandshakeInterceptor` or your code).

**E14. [M] `HandshakeInterceptor` vs `ChannelInterceptor`?**
`HandshakeInterceptor` runs once during the HTTP upgrade (can reject with an HTTP status, copy attributes, inspect HTTP headers/cookies). `ChannelInterceptor` runs for every STOMP message on a channel (`preSend`, `postSend`, `afterSendCompletion`) and is used for CONNECT authentication, authorisation, logging, rate limiting.

**E15. [M] Why must you use `MessageHeaderAccessor.getAccessor(message, StompHeaderAccessor.class)` in an interceptor rather than `StompHeaderAccessor.wrap(message)`?**
`getAccessor` returns the message's own mutable accessor, so `setUser(...)` changes the actual message/session. `wrap` creates a copy, so changes are lost unless you build and return a new message.

**E16. [M] How do you handle exceptions in message handlers?**
`@MessageExceptionHandler` methods in the controller or a `@ControllerAdvice` (supported since 5.3), typically combined with `@SendToUser("/queue/errors")` to report errors to the client. Unhandled exceptions are only logged, so the client receives nothing. Exceptions in inbound interceptors become STOMP ERROR frames (customisable via `StompSubProtocolErrorHandler`).

**E17. [M] How do you validate STOMP payloads?**
Annotate the payload `@Valid`/`@Validated` with Bean Validation on the classpath (or provide a validator via `getValidator()`), and handle `org.springframework.messaging.handler.annotation.support.MethodArgumentNotValidException`.

**E18. [M] How do you configure heart-beats with the simple broker?**
`registry.enableSimpleBroker("/topic","/queue").setTaskScheduler(scheduler).setHeartbeatValue(new long[]{10000,10000})`. Without a TaskScheduler, the simple broker doesn't do heart-beats (it answers `0,0`).

**E19. [M] What transport limits does Spring have and what are the defaults?**
`WebSocketTransportRegistration`: `messageSizeLimit` 64 KB, `sendBufferSizeLimit` 512 KB, `sendTimeLimit` 10 s, `timeToFirstMessage` 60 s. Plus container limits (e.g., Tomcat 8 KB message buffers via `ServletServerContainerFactoryBean`).

**E20. [S] What happens when a client is too slow to receive messages?**
Spring's `ConcurrentWebSocketSessionDecorator` buffers outbound messages per session; if the buffer exceeds `sendBufferSizeLimit` or a send takes longer than `sendTimeLimit`, the session is closed (status 4500 "session not reliable"). This protects server memory. The client reconnects and resyncs.

**E21. [S] Is message order guaranteed in Spring STOMP?**
Not by default, because the inbound and outbound channels use thread pools. Enable `MessageBrokerRegistry#setPreservePublishOrder(true)` (5.1+) for outbound per-session order and `StompEndpointRegistry#setPreserveReceiveOrder(true)` (6.1+) for inbound per-session order; or use sequence numbers.

**E22. [M] What session events does Spring publish?**
`SessionConnectEvent`, `SessionConnectedEvent`, `SessionSubscribeEvent`, `SessionUnsubscribeEvent`, `SessionDisconnectEvent` (may fire more than once per session, so handlers must be idempotent), and `BrokerAvailabilityEvent`.

**E23. [M] How would you track online users?**
Listen to connected/disconnect events (count sessions per user, since a user can have many tabs), or query `SimpUserRegistry`. In a cluster use the multi-server user registry (relay `userRegistryBroadcast`) or Redis with TTLs. Publish presence changes to a topic.

**E24. [M] Simple broker vs STOMP broker relay?**
Simple broker: in-memory, no setup, single instance only, subset of STOMP (no acks/transactions/limited receipts). Relay: forwards to RabbitMQ/ActiveMQ over TCP, supports clustering and full broker features, needs Reactor Netty, opens one TCP connection per client session plus a system connection.

**E25. [M] What are `clientLogin`/`systemLogin` in the relay?**
`clientLogin/Passcode`: credentials the relay uses for each client session's TCP connection to the broker. `systemLogin/Passcode`: credentials for the shared system connection used to send messages from application code. End-user identity is not passed to the broker; Spring is the security boundary.

**E26. [M] How do you use dot-separated destinations?**
`registry.setPathMatcher(new AntPathMatcher("."))` so `@MessageMapping("chat.room.{id}")` matches `/app/chat.room.42`. Useful with RabbitMQ, whose topic routing keys use dots.

**E27. [M] How do you add SockJS fallback?**
`registry.addEndpoint("/ws").withSockJS()`. Clients use `new SockJS('https://host/ws')` (via stompjs `webSocketFactory`). Native WebSocket clients then use `/ws/websocket`. Fallback transports need sticky sessions in clusters.

**E28. [M] How do you configure allowed origins?**
`addEndpoint("/ws").setAllowedOrigins("https://app.example.com")` or `setAllowedOriginPatterns("https://*.example.com")`. Default is same origin only. Avoid `*` in production, especially with cookie auth.

**E29. [S] How do you size Spring's channel thread pools?**
Inbound threads run your handlers: for blocking I/O handlers increase core size or make handlers async; the queue is unbounded by default, so with `ThreadPoolTaskExecutor` `maxPoolSize` only matters if you bound the queue. Outbound rarely needs tuning except with many slow clients. Monitor active threads and queue sizes via `WebSocketMessageBrokerStats` or Micrometer.

**E30. [M] What does `WebSocketMessageBrokerStats` show?**
Periodic (30 min default) INFO logs with current WebSocket sessions by transport, total sessions, abnormal closes (connect failures, send limit, transport errors), STOMP frames processed (CONNECT/CONNECTED/DISCONNECT), relay status, and inbound/outbound/SockJS thread pool stats.

**E31. [M] How do you return a value asynchronously from a `@MessageMapping`?**
Return a `CompletableFuture`/`ListenableFuture` (or reactive types); Spring sends the result when it completes, freeing the inbound thread.

**E32. [M] How do you customise JSON conversion?**
Spring Boot uses its auto-configured `ObjectMapper` for messaging. For custom converters, override `configureMessageConverters` (return true to keep defaults). Clients should send `content-type:application/json`.

**E33. [S] How do you send to a specific session (not a user)?**
Create headers with `SimpMessageHeaderAccessor.create(SimpMessageType.MESSAGE)`, `setSessionId(id)`, `setLeaveMutable(true)`, and call `convertAndSendToUser(sessionId, "/queue/x", payload, accessor.getMessageHeaders())`. The client subscribes to `/user/queue/x`.

**E34. [M] How do you write an integration test for a STOMP endpoint?**
`@SpringBootTest(webEnvironment = RANDOM_PORT)`, a `WebSocketStompClient` with a JSON converter, `connectAsync` to `ws://localhost:{port}/ws` with auth headers, subscribe with a `StompFrameHandler` that pushes to a `BlockingQueue`, send, and `poll` with a timeout. Avoid subscribe/send races with receipts or a round-trip.

**E35. [M] Is Spring's STOMP support available in WebFlux?**
No built-in STOMP broker/annotation support in WebFlux. WebFlux has a reactive `WebSocketHandler` for raw messages; for higher-level reactive messaging consider RSocket.

**E36. [S] Explain `SubProtocolWebSocketHandler`.**
The `WebSocketHandler` registered for STOMP endpoints. It delegates to sub-protocol handlers by negotiated `Sec-WebSocket-Protocol` (STOMP by default), manages session lifecycle, wraps sessions in `ConcurrentWebSocketSessionDecorator` with buffer/time limits, checks `timeToFirstMessage`, and closes sessions on shutdown.

**E37. [M] What's `SimpMessageType`?**
The Spring-level message type in headers: CONNECT, CONNECT_ACK, MESSAGE, SUBSCRIBE, UNSUBSCRIBE, HEARTBEAT, DISCONNECT, DISCONNECT_ACK, OTHER. Security matchers (e.g., `simpTypeMatchers`) use it.

**E38. [M] How do you access a custom STOMP header the client sent with SEND?**
`@Header("myHeader") String v` (Spring checks top-level then native headers) or `StompHeaderAccessor#getFirstNativeHeader("myHeader")`.

**E39. [M] Can you use `@PreAuthorize` on `@MessageMapping` methods?**
Yes, with method security enabled; Spring Security's `SecurityContextChannelInterceptor` populates the `SecurityContext` from the message's user during handling.

**E40. [S] What happens on application shutdown?**
The WebSocket infrastructure stops and `SubProtocolWebSocketHandler` closes open sessions (status 1001 Going Away). Clients reconnect to other instances. Combine with readiness probes, `preStop` delays and jittered reconnects for smooth rollouts.

**E41. [M] How do you raise the max message size for big payloads?**
`registration.setMessageSizeLimit(...)` in `configureWebSocketTransport`, and container buffers via `ServletServerContainerFactoryBean#setMaxTextMessageBufferSize`. But prefer sending references and fetching large data over HTTP.

**E42. [S] How does the selector header work in the simple broker and why is it sensitive?**
A SUBSCRIBE `selector` header holds a SpEL expression evaluated against message headers to filter deliveries. It caused CVE-2018-1270/1275 (SpEL injection → RCE in old versions, fixed by using `SimpleEvaluationContext`). Configure the header name with `setSelectorHeaderName`, or disable it (null) if unused.

**E43. [M] What's `@DestinationVariable`?**
Extracts template variables from the message destination, e.g., `@MessageMapping("/rooms/{roomId}")` → `@DestinationVariable String roomId`. Validate it, since it's client input.

**E44. [M] Where does the Principal of a WebSocket session come from?**
From the HTTP handshake request (`request.getPrincipal()` via Spring Security / `DefaultHandshakeHandler#determineUser`), or set on the STOMP CONNECT message by an interceptor (`accessor.setUser`). Spring then associates it with the session for subsequent messages.

**E45. [M] What is `SimpUserRegistry`?**
A registry of connected users, their sessions and subscriptions (`getUser`, `getUsers`, `getUserCount`, `findSubscriptions`). Default local implementation; a multi-server view is available with the relay's user registry broadcast.

Continue to [Part 2](12-interview-questions-part2.md).
