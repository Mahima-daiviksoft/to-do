# Chapter 12: Interview Questions & Answers, Part 2

> Levels: **[E]** entry, **[M]** mid, **[S]** senior/lead. [Part 1](12-interview-questions.md) covered fundamentals,
> the WebSocket protocol, the browser API, STOMP and Spring.

---

## F. Security

**F1. [E] How do you secure a WebSocket connection?**
Use `wss://` (TLS), validate the `Origin` header, authenticate (handshake session or token in STOMP CONNECT), authorise every SUBSCRIBE and SEND, validate input, limit sizes/rates/connections, and avoid leaking tokens in URLs/logs.

**F2. [M] What is Cross-Site WebSocket Hijacking (CSWSH)?**
A malicious site opens a WebSocket to your server from the victim's browser; since CORS doesn't apply to WebSockets and the browser may attach cookies, a cookie-authenticated socket gets established on the attacker's behalf, letting them read/send messages as the victim. Prevent it with Origin allow-lists, token-based auth in the CONNECT frame (not cookies alone), SameSite cookies, and CSRF tokens on CONNECT (Spring Security's default).

**F3. [M] How do you authenticate STOMP clients with JWT in Spring?**
Client sends `Authorization: Bearer <jwt>` as a CONNECT header. A `ChannelInterceptor` on `clientInboundChannel` checks `StompCommand.CONNECT`, decodes/validates the JWT (`JwtDecoder`), converts it to an `Authentication`, and calls `accessor.setUser(auth)` using the accessor from `MessageHeaderAccessor.getAccessor`. The config class gets `@Order(Ordered.HIGHEST_PRECEDENCE + 99)` so it runs before Spring Security's message authorisation. Spring keeps the user for the session.

**F4. [M] Why not put the token in the WebSocket URL?**
URLs are logged by proxies, load balancers, servers and may stay in browser history; leaked tokens are replayable. If you must (e.g., gateway auth), use short-lived, single-use tickets.

**F5. [M] How do you authorise subscriptions?**
With Spring Security message rules (`simpSubscribeDestMatchers(...)`) for coarse checks, plus a custom `ChannelInterceptor` on SUBSCRIBE that parses the destination (e.g., `/topic/orders.{id}`) and verifies ownership/membership. Deny by default, block wildcard subscriptions, and handle revocation (close sessions or stop delivery when membership changes).

**F6. [M] How would you stop clients from publishing directly to `/topic/...`?**
Allow client SEND only to `/app/**` (Spring Security `simpDestMatchers("/app/**")...` + `simpTypeMatchers(MESSAGE, SUBSCRIBE).denyAll()` + `anyMessage().denyAll()`), so all broadcasts come from server code after validation.

**F7. [M] How do you deal with token expiry for long-lived connections?**
Store expiry in session attributes at CONNECT; reject inbound messages after expiry; close sessions server-side when the token expires or is revoked (track `WebSocketSession`s via a decorator factory); enforce a maximum connection age; client refreshes tokens in `beforeConnect` and reconnects.

**F8. [M] What is CSRF protection in Spring WebSocket security?**
With `@EnableWebSocketSecurity`, Spring Security requires a valid CSRF token in the CONNECT frame headers by default, protecting cookie-authenticated sessions against CSWSH. Clients obtain the token from the server and add it to `connectHeaders`. For pure header-token auth you can configure the security interceptors manually without the CSRF interceptor.

**F9. [M] Should you trust the `sender` field in a chat message payload?**
Never. Set identity on the server from the authenticated Principal; ignore or overwrite client-supplied identity fields.

**F10. [S] What DoS vectors exist for WebSocket servers and how do you mitigate them?**
Connection floods (LB/IP limits, per-user session caps), idle unauthenticated sockets (`timeToFirstMessage`, auth deadline), huge frames (`messageSizeLimit`, container buffers), message floods (per-session rate limits), subscription floods (caps, no wildcards), slow readers (send buffer/time limits), expensive handlers (bounded pools, timeouts), reconnect storms (client jitter, 1013 close code).

**F11. [M] How do you prevent XSS through chat messages?**
Treat message content as untrusted: render as text (React escapes by default), sanitise any HTML (DOMPurify), validate length/charset on the server, and use a Content Security Policy.

**F12. [S] What known vulnerabilities affected Spring's STOMP support?**
CVE-2018-1270 (and CVE-2018-1275 for an incomplete 4.3.x fix): the simple broker evaluated the SUBSCRIBE `selector` header as SpEL with a full evaluation context, allowing remote code execution. Fixed by using `SimpleEvaluationContext` (5.0.5 / 4.3.16+). Lesson: patch dependencies and disable unused features.

**F13. [S] Is checking the Origin header enough?**
No. It stops browser-based CSWSH but not non-browser clients (who can forge Origin). You still need real authentication and authorisation. Defence in depth: Origin + token auth + per-destination authorisation + rate limits.

**F14. [M] Does the broker relay pass the end user's identity to RabbitMQ?**
No. The relay uses configured `clientLogin`/`systemLogin` credentials. The Spring application must enforce user-level security before forwarding frames. Never expose the broker's STOMP port publicly.

**F15. [S] How do you isolate tenants in a multi-tenant real-time system?**
Derive tenant from the authenticated token (not payload), include tenant id in destination naming (`/topic/t.{tenant}.…`), authorise tenant on every SUBSCRIBE/SEND, separate vhosts/brokers for strict isolation, per-tenant rate limits and metrics.

**F16. [M] What should never appear in logs for a STOMP system?**
CONNECT `Authorization`/`passcode` headers, cookies, full message bodies with PII. Disable verbose client debug logging in production.

---

## G. Brokers, clustering & scaling

**G1. [E] Why doesn't the simple broker work with multiple server instances?**
Each instance has its own in-memory subscription registry; a message published on instance A only reaches clients connected to A. Use an external broker relay or a pub/sub backplane.

**G2. [M] How does the STOMP broker relay work?**
Spring opens a TCP connection to the broker for each client session (forwarding the client's frames for broker destinations and returning MESSAGE frames) and one shared "system" connection for messages sent by server code. It requires Reactor Netty and publishes `BrokerAvailabilityEvent` on connectivity changes.

**G3. [M] Which brokers support STOMP?**
RabbitMQ (STOMP plugin, port 61613; Web STOMP plugin, port 15674 `/ws`), ActiveMQ Classic, ActiveMQ Artemis, Apache Apollo (retired), plus others. Amazon MQ offers managed ActiveMQ/RabbitMQ.

**G4. [M] Explain RabbitMQ STOMP destinations.**
`/exchange/<name>[/<pattern>]` (publish to/bind from an exchange), `/queue/<name>` (queue created if needed; competing consumers), `/amq/queue/<name>` (existing queue), `/topic/<routing-key>` (via `amq.topic`, wildcards `*` and `#` with dot-separated words), `/temp-queue/<name>` (temporary reply queues).

**G5. [M] How do user destinations work across a cluster?**
Configure the relay with `userDestinationBroadcast` (unresolved user messages are broadcast so the instance holding the user's session delivers them) and `userRegistryBroadcast` (instances share their user registries → multi-server `SimpUserRegistry`).

**G6. [S] The relay opens one TCP connection per client. What if you have 500k users?**
That's 500k broker connections: heavy for any broker. Alternatives: backplane pattern (simple broker per node + Redis/Kafka fan-out between nodes), shard users across broker clusters, or a dedicated real-time gateway that consumes from Kafka with a small number of connections and fans out locally.

**G7. [M] Describe a Redis-based backplane.**
Each instance runs a simple broker for its own clients and subscribes to a Redis pub/sub channel. To broadcast, an instance publishes to Redis; every instance receives it and calls `SimpMessagingTemplate` locally. Redis pub/sub is at-most-once (missed during disconnects); use Redis Streams/Kafka for replay; shard channels for scale.

**G8. [M] Do WebSockets need sticky sessions?**
Not for pure WebSocket, because a connection stays on the backend it was established with. Sticky sessions are needed for SockJS HTTP fallback transports (many HTTP requests per logical session) and helpful if you keep server-side state that survives reconnects.

**G9. [M] How do you configure Nginx for WebSocket?**
`proxy_http_version 1.1; proxy_set_header Upgrade $http_upgrade; proxy_set_header Connection $connection_upgrade;` (with a `map` on `$http_upgrade`), long `proxy_read_timeout`/`proxy_send_timeout`, `proxy_buffering off`, forward Host/X-Forwarded headers.

**G10. [M] Why do connections drop every 60 seconds behind a load balancer?**
The LB/proxy idle timeout (60 s default for Nginx and AWS ALB) closes connections without traffic. Fix with heart-beats shorter than the timeout and/or longer timeouts.

**G11. [S] How do you autoscale WebSocket servers?**
CPU is a poor signal (idle connections cost memory). Scale on connections per pod, memory, or message throughput via custom metrics. Since existing connections don't rebalance to new pods, use least-connection balancing and optionally a max connection age with jitter to gradually rebalance.

**G12. [S] How do you deploy WebSocket servers without disrupting users?**
Rolling deploys with readiness gating and `preStop` delays (stop new connections, then close existing ones with 1001), clients reconnect with jitter and resync, keep payloads backward compatible across versions, add capacity headroom, canary new versions and watch close codes/connection success rates.

**G13. [M] What OS limits matter for many connections?**
File descriptors (`ulimit -n`), ephemeral port ranges for proxy→backend connections, `somaxconn`/SYN backlog for reconnect bursts, memory for socket buffers and TLS, container/pod limits, Tomcat `max-connections` (8192 default in Spring Boot).

**G14. [S] Estimate capacity for a broadcast-heavy system.**
Deliveries/s = publishes/s × subscribers per message. E.g., 50 msgs/s to a 20k-subscriber topic = 1M deliveries/s → network bandwidth (1M × message size) and outbound processing dominate. Mitigate with conflation, batching, smaller payloads, sharding audiences, and more nodes.

**G15. [M] How does RabbitMQ prefetch relate to STOMP?**
The SUBSCRIBE `prefetch-count` header limits unacknowledged messages delivered to a consumer when using `client`/`client-individual` ack, giving backpressure and fair dispatch among competing consumers.

**G16. [S] How would you avoid per-session queue leaks with RabbitMQ user destinations?**
Use destinations RabbitMQ creates as auto-delete (e.g., `/exchange/amq.direct/<name>` for user destinations, per Spring's docs) or apply policies with `x-expires`; monitor queue counts.

**G17. [M] Can browsers connect directly to RabbitMQ Web STOMP?**
Yes, but you lose Spring's application layer (`@MessageMapping`, user destinations, custom authorisation), expose the broker publicly, and must manage broker-level auth (e.g., OAuth2 plugin) and permissions per user. Most enterprises keep a gateway in front.

**G18. [S] What changes when moving from a single node to multi-region?**
Users connect to the nearest region; cross-region messages need replication (federation/shovel in RabbitMQ, Kafka MirrorMaker, or a global pub/sub); latency and ordering across regions; data residency; presence aggregation; failover strategies (DNS/GSLB) with client reconnect.

---

## H. Reliability & performance

**H1. [M] What delivery guarantee does STOMP over WebSocket give?**
By default effectively at-most-once: messages are lost if the client is disconnected or the simple broker restarts. At-least-once requires a durable broker queue, client acks and redelivery, and idempotent consumers; "exactly-once" is achieved as at-least-once + deduplication.

**H2. [S] How do you make sure clients don't miss updates during disconnects?**
Persist state/events in a database with per-entity sequence numbers; clients track the last seq; on reconnect or gap detection they fetch missed events (REST `?after=seq`) or a snapshot; WebSocket messages act as notifications. Subscribe before fetching the snapshot and merge by seq.

**H3. [M] How do you handle duplicate messages?**
Give each event a unique id and/or per-entity sequence; consumers ignore ids already processed or seqs ≤ last applied. For commands, the client sends an idempotency key (`clientRequestId`) and the server dedupes.

**H4. [S] How do you avoid publishing events for transactions that roll back?**
Publish after commit (`@TransactionalEventListener(phase = AFTER_COMMIT)`) or use the transactional outbox pattern with a relay/CDC for at-least-once publication.

**H5. [M] What's backpressure in WebSocket systems?**
Mechanisms to cope when a receiver can't keep up. Browser `send()` doesn't block (watch `bufferedAmount`); servers buffer per session. Spring bounds buffers (`sendBufferSizeLimit`, `sendTimeLimit`) and closes slow sessions. Application strategies: conflation, batching, deltas, dropping non-critical updates, broker prefetch.

**H6. [M] What is conflation?**
Sending only the latest value per key at a fixed interval instead of every intermediate update (e.g., price ticks), reducing load and helping slow clients.

**H7. [M] How do you choose heart-beat intervals?**
Shorter than the smallest idle timeout in the path (proxies, LBs, NAT), typically 10–25 s; balance faster failure detection against traffic/battery cost; mobile may need shorter intervals due to NAT timeouts.

**H8. [S] Why might `maxPoolSize` have no effect on Spring's inbound channel executor?**
`ThreadPoolTaskExecutor` creates threads beyond `corePoolSize` only when the queue is full; the default queue is unbounded, so the pool never grows. Increase `corePoolSize` or bound the queue (with a rejection strategy).

**H9. [M] What metrics would you monitor?**
Active sessions, connects/disconnects per second by close code, CONNECT failures, inbound/outbound message rates and sizes, executor active threads/queue sizes, send-limit closes, handler latency, end-to-end latency, broker health (connections, queue depth, unacked, memory), relay availability.

**H10. [M] How would you load test a STOMP server?**
k6/Gatling/Artillery/JMeter sending raw STOMP frames over WebSocket, or Java clients with `WebSocketStompClient`. Simulate realistic idle/active mixes, subscriptions, fan-out, reconnect storms, slow clients; run soak tests for leaks; distribute load generators to avoid client-side port/fd limits; measure p95/p99 latency.

**H11. [S] JSON vs binary payloads: when to switch?**
When message rate × size makes bandwidth/CPU significant (market data, telemetry, games). Protobuf/MessagePack reduce size and parse time; send as binary frames with an appropriate content-type and a custom MessageConverter. Otherwise JSON's debuggability wins.

**H12. [M] Does enabling compression always help?**
No. It helps large text payloads and bandwidth-limited clients but costs CPU and per-connection memory (significant at 100k+ connections) and can introduce side-channel risk. Measure.

**H13. [S] How do you ensure ordering for a chat room across a cluster?**
Assign a per-room sequence number at write time (DB sequence/row version, or a single partition per room in Kafka); deliver in that order (partition by room); clients reorder/dedupe by seq and resync on gaps. Enable Spring's publish ordering per session.

**H14. [M] How do you build presence ("online" status) reliably?**
Track sessions per user (multiple tabs/devices); store in Redis with TTL refreshed periodically or on activity; mark offline when the last session disconnects or TTL expires (handles crashes where disconnect events never fire); publish only changes; limit presence fan-out to relevant users.

---

## I. Debugging & scenario questions

**I1. [M] Users report messages stop arriving after about a minute of inactivity. What's going on?**
Almost certainly an idle timeout (proxy/LB, e.g., 60 s) killing silent connections. Check close codes (1006 at ~60 s), heart-beat negotiation (maybe `0,0` because the simple broker has no TaskScheduler), and proxy timeouts. Fix: enable heart-beats (10–25 s), raise timeouts, and make sure clients reconnect and resync.

**I2. [M] It works locally but in production the handshake fails with 400/200. Why?**
The reverse proxy/ingress isn't forwarding `Upgrade`/`Connection` or uses HTTP/1.0 upstream, or the SPA's fallback route returns `index.html` (200) for `/ws`. Fix proxy config and routing order.

**I3. [M] After deploying a second instance, some users miss messages. Why?**
The simple broker is per-instance. Users connected to instance B don't get messages published on instance A. Use a broker relay or backplane; for user destinations, enable user destination broadcast.

**I4. [M] `convertAndSendToUser` works for some users but not others.**
Check that `Principal#getName()` matches the name passed (e.g., some users' principal is email, others id), that those users have a Principal at all, that they subscribed to `/user/queue/...`, and whether they're connected to another instance.

**I5. [M] The React app shows every message twice.**
Duplicate subscriptions: multiple client instances, subscribing on every render, subscribing both in `onConnect` and in components, StrictMode double effects without cleanup, or reconnect without unsubscribing old handlers. Use a singleton client with ref-counted subscriptions and cleanup.

**I6. [M] Mobile (React Native) app connects but never gets CONNECTED.**
NULL-terminator truncation in RN's WebSocket. Set `forceBinaryWSFrames` and `appendMissingNULLonIncoming`. Also check `TextEncoder` availability, cleartext restrictions and host addresses.

**I7. [S] Server memory keeps growing during peak hours and the app eventually crashes.**
Suspect slow clients buffering outbound messages (check send limits), unbounded inbound queue due to blocking handlers, maps keyed by session not cleaned on disconnect, or subscriptions never unsubscribed. Take heap dumps, check `WebSocketMessageBrokerStats` queue sizes, configure send limits, bound queues, conflate high-frequency topics.

**I8. [M] Clients get an ERROR frame immediately after CONNECT.**
An inbound interceptor threw: invalid/expired token, missing CSRF token with `@EnableWebSocketSecurity`, interceptor ordering (Spring Security authorisation running before your auth interceptor), or unauthorised destination. Read the ERROR `message` header; check server logs.

**I9. [S] After a deploy, the system collapses under reconnects.**
Thundering herd: all clients reconnect simultaneously with a fixed delay, overwhelming remaining instances, auth services (JWKS/IdP) and snapshot REST endpoints. Mitigate with exponential backoff + jitter, rolling deploys, capacity headroom, caching of snapshots, rate limiting reconnects, 1013 "try again later".

**I10. [M] Messages arrive out of order in the UI.**
Thread-pool-based channels can reorder. Enable `setPreservePublishOrder(true)` / `setPreserveReceiveOrder(true)` or include sequence numbers and reorder/drop stale events client-side.

**I11. [M] A big JSON message closes the connection with 1009.**
It exceeds the container buffer (Tomcat 8 KB default per message) or Spring's `messageSizeLimit`. Raise limits deliberately or redesign to send references.

**I12. [S] Only one corporate customer can't connect.**
Their proxy/firewall/TLS inspection blocks or breaks WebSocket. Confirm via their close codes and network logs; ensure `wss://` on 443; offer SockJS fallback or polling; check their Origin (embedded portals) and IP allow-lists.

**I13. [M] `@MessageMapping` method isn't invoked even though the client sends.**
Destination prefix mismatch (`/chat` vs `/app/chat`), path separator mismatch (dots vs slashes without `AntPathMatcher(".")`), controller not scanned, or security rules silently dropping the message.

**I14. [M] User removed from a project still receives its updates.**
Authorisation happened only at SUBSCRIBE. Implement revocation: on membership change, close the user's sessions (forcing re-subscribe with checks) or route updates via per-user delivery that re-checks membership.

---

## J. System design questions (with answer outlines)

**J1. [S] Design a chat system like WhatsApp/Slack.**
Requirements: 1:1 and group chat, delivery/read receipts, presence, typing, history, offline delivery, multi-device.
* *Connection layer:* real-time gateway (STOMP over WebSocket), JWT on CONNECT, heart-beats, LB with long timeouts.
* *Write path:* client sends `/app/chat.send` with `clientMsgId` → message service validates membership → persists with per-conversation `seq` (DB/Cassandra) → event to Kafka (partition by conversationId).
* *Fan-out:* gateway consumers deliver to `/topic/conv.{id}` or per-user queues; offline recipients get push notifications.
* *Reliability:* dedupe by `clientMsgId`, ordered by `seq`, resync history via REST on reconnect, delivery receipts as batched "delivered/read up to seq".
* *Presence/typing:* Redis TTL, ephemeral, rate-limited.
* *Scale:* shard gateways, Kafka partitions, conflation of typing/presence, hot group handling (large channels → pull model).
* *Security:* membership checks on subscribe/send, E2E encryption discussion, XSS, rate limits.

**J2. [S] Design a real-time notification service for 10M users.**
Producers emit domain events → notification service applies preferences → persists to an inbox (for unread counts/history) → pushes in-app via gateway user destinations if online (presence lookup) else mobile push/email. Gateways scale horizontally with a backplane (Kafka/Redis keyed by userId → gateway node mapping in Redis to avoid broadcasting to all nodes). Clients on connect fetch unread count via REST.

**J3. [S] Design a live sports score / stock ticker for millions of viewers.**
Huge fan-out, read-only, latest-value semantics. Use conflation at the source (e.g., 1–4 updates/s), a hierarchical fan-out (origin → regional relays/edges → gateways), small binary/delta payloads, CDN-backed snapshots for initial state, SSE or WebSocket depending on the need for client→server; drop intermediate updates for slow clients; no per-user state.

**J4. [S] Design collaborative document editing.**
Use OT or CRDTs (Yjs/Automerge) for merging; WebSocket for low-latency sync of operations; server persists operation log/snapshots; awareness (cursors) as ephemeral, conflated messages; per-document routing (all collaborators of a document to the same node or a document actor); offline edits merged via CRDT on reconnect. STOMP can transport updates but many CRDT libraries ship their own protocols.

**J5. [S] Design live order tracking for a food delivery app.**
Driver location updates via app (HTTP or WS) every few seconds → location service (Redis GEO, latest-only) → publish to `/topic/order.{id}.location` (authorised to customer/restaurant). Order status changes from order service events. Conflation, battery-friendly intervals, push notifications for status changes when app is backgrounded, resync on foreground.

**J6. [S] Design an online auction/bidding system.**
Bids via REST/command with idempotency key; strong consistency for the highest bid (single writer per auction: DB row lock or partitioned actor); broadcast new highest bid with `seq` to `/topic/auction.{id}`; clients show server-confirmed state; end-of-auction timing on the server; anti-sniping extension rules; rate limits; audit log.

**J7. [S] Your simple-broker Spring app must scale from 1 to 20 instances. Plan the migration.**
Choose relay (RabbitMQ) vs backplane (Redis/Kafka) based on connection counts and features; switch destinations/naming (dots); configure user destination & registry broadcast or redesign presence in Redis; LB/proxy timeouts; remove local in-memory state; load test; staged rollout with metrics.

---

## K. Coding / whiteboard tasks

**K1. [M] Write the Spring config for a STOMP endpoint with a simple broker and heart-beats.**
See Chapter 5 §5.8. Key lines: `@EnableWebSocketMessageBroker`, `addEndpoint("/ws").setAllowedOriginPatterns(...)`, `setApplicationDestinationPrefixes("/app")`, `enableSimpleBroker("/topic","/queue").setTaskScheduler(ts).setHeartbeatValue(new long[]{10000,10000})`.

**K2. [M] Write a CONNECT-frame JWT interceptor.**
See Chapter 8 §8.5.2. Mention `getAccessor`, `StompCommand.CONNECT`, `getFirstNativeHeader("Authorization")`, `setUser`, exception → ERROR, `@Order(HIGHEST_PRECEDENCE + 99)`.

**K3. [M] Write a React hook that subscribes to a destination and cleans up.**
See Chapter 6 §6.6. Mention singleton client, `useEffect` cleanup, ref for callback, re-subscription on reconnect.

**K4. [M] Write the STOMP frames to connect, subscribe and send.**
```
CONNECT
accept-version:1.2
host:example.com
heart-beat:10000,10000

^@
SUBSCRIBE
id:sub-0
destination:/topic/news

^@
SEND
destination:/app/news.post
content-type:application/json
content-length:15

{"title":"Hi!"}^@
```
(`content-length` = 15 bytes for `{"title":"Hi!"}`.)

**K5. [S] Implement exponential backoff with jitter.**
```ts
const delay = Math.random() * Math.min(maxDelay, base * 2 ** attempt);   // "full jitter"
```
Reset `attempt` on successful connect; stop on permanent auth errors.

**K6. [S] Compute the Sec-WebSocket-Accept for a given key.**
`base64(sha1(key + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"))`, e.g., key `dGhlIHNhbXBsZSBub25jZQ==` → `s3pPLMBiTxaQ9kYGzzhZRbK+xOo=`.

**K7. [S] Parse a WebSocket frame header.**
```java
int b0 = buf[0] & 0xFF, b1 = buf[1] & 0xFF;
boolean fin = (b0 & 0x80) != 0; int opcode = b0 & 0x0F;
boolean masked = (b1 & 0x80) != 0; long len = b1 & 0x7F; int off = 2;
if (len == 126) { len = ((buf[2] & 0xFF) << 8) | (buf[3] & 0xFF); off = 4; }
else if (len == 127) { len = 0; for (int i = 2; i < 10; i++) len = (len << 8) | (buf[i] & 0xFF); off = 10; }
byte[] mask = masked ? Arrays.copyOfRange(buf, off, off + 4) : null; if (masked) off += 4;
// payload[i] ^= mask[i % 4]
```

**K8. [S] Write a subscription authorisation interceptor for `/topic/orders.{id}`.**
See Chapter 8 §8.6.3: regex the destination, look up ownership, throw `AccessDeniedException` (or drop + error queue).

---

## L. Behavioural / experience questions (prepare your stories)

**L1. Tell me about a real-time feature you built.** Structure: problem → why WebSocket/STOMP → architecture (gateway, broker, auth) → hardest problem (e.g., missed updates on reconnect → seq + resync) → results (latency, load reduction) → what you'd do differently.

**L2. Describe a production incident with WebSockets.** E.g., mass disconnects every 60 s after an infra change (new LB with default idle timeout) → detected via close-code dashboards → mitigated by raising timeouts → fixed permanently with heart-beats and alerting → postmortem: add LB config to IaC review checklist.

**L3. How did you scale a real-time system?** Simple broker → RabbitMQ relay or Redis backplane, capacity tests, metrics-driven autoscaling.

**L4. How did you ensure security?** CSWSH protection, JWT on CONNECT, destination authorisation with ownership, pen-test findings fixed.

**L5. How do you onboard other teams to your real-time platform?** SDKs, AsyncAPI docs, destination naming rules, review process, examples, runbooks.

---

## M. Rapid-fire (one-liners)

| Q | A |
|---|---|
| WebSocket RFC? | 6455 (Dec 2011) |
| Handshake status code? | 101 |
| Magic GUID? | 258EAFA5-E914-47DA-95CA-C5AB0DC85B11 |
| `Sec-WebSocket-Version`? | 13 |
| Who masks frames? | Client → server only |
| Max control frame payload? | 125 bytes |
| Close code for abnormal closure? | 1006 (never sent on the wire) |
| Close code: message too big? | 1009 |
| Close code: policy violation? | 1008 |
| App-defined close codes? | 4000–4999 |
| Opcode for ping/pong/close? | 0x9 / 0xA / 0x8 |
| STOMP frame terminator? | NULL byte (`\0`) |
| STOMP default port over TCP? | 61613 (conventional) |
| RabbitMQ Web STOMP port? | 15674 (`/ws`) |
| STOMP sub-protocol names? | v10.stomp, v11.stomp, v12.stomp |
| Required CONNECT headers (1.2)? | accept-version, host |
| Required SUBSCRIBE headers? | destination, id |
| Required MESSAGE headers? | destination, message-id, subscription |
| Default ack mode? | auto |
| Cumulative ack mode? | client |
| ERROR frame consequence? | Server closes the connection |
| Heart-beat formula? | max(sender's cx, receiver's cy); 0 disables |
| Spring default app prefix? | None, you set it (commonly `/app`) |
| Spring default user prefix? | `/user` |
| Spring STOMP message size default? | 64 KB |
| Spring send buffer limit default? | 512 KB |
| Spring send time limit default? | 10 s |
| Spring time to first message default? | 60 s |
| Default return destination of @MessageMapping? | `/topic` + input destination |
| Annotation for initial data on subscribe? | `@SubscribeMapping` |
| Relay dependency? | Reactor Netty |
| SockJS heart-beat default (Spring)? | 25 s |
| Do pure WebSockets need sticky sessions? | No (SockJS fallback does) |
| CORS applies to WebSocket? | No: check Origin |
| Browser can send ping? | No |
| Browser can set Authorization header? | No |

---

## N. Tricky "gotcha" questions

1. **"Is `Sec-WebSocket-Key` used for security?"** No; it only proves protocol understanding.
2. **"Does masking encrypt data?"** No; it prevents proxy cache poisoning. TLS encrypts.
3. **"Can the server send a 1006 close code?"** No; 1005, 1006 and 1015 are reserved for local reporting.
4. **"Does a STOMP RECEIPT mean subscribers got the message?"** No; only that the server processed the frame.
5. **"Will the simple broker redeliver unacked messages?"** No; it doesn't support acks.
6. **"Does `@SubscribeMapping`'s return value go through the broker?"** No; directly to the subscribing client (unless `@SendTo`).
7. **"Do STOMP heart-beats use WebSocket ping frames?"** No; they're EOL bytes inside the WebSocket data stream.
8. **"Can two subscriptions on one connection share an id?"** No; ids must be unique per connection.
9. **"Can `ws.close(1001)` be called from browser JS?"** No; only 1000 or 3000–4999.
10. **"If the client sends `destination: /topic/a` (with space), what's the destination?"** `" /topic/a"`: values aren't trimmed.
11. **"Does `SessionDisconnectEvent` fire exactly once?"** Not guaranteed; can fire multiple times.
12. **"Does HTTP/2 Server Push replace WebSockets?"** No (and it's deprecated in browsers).
13. **"Will TCP tell me immediately when the client disappears?"** No; half-open connections need heart-beats.
14. **"Does `maxPoolSize` grow Spring's inbound pool?"** Not with the default unbounded queue.
15. **"Is SockJS a WebSocket implementation?"** It's an emulation layer with its own protocol, using WebSocket when possible.
16. **"Does turning on `setPreserveReceiveOrder(true)` change error behaviour?"** Yes (Spring 7.0.x): exceptions from inbound interceptors are only logged, so no ERROR frame is sent and the connection stays open.
17. **"What close code does a Spring STOMP client see after an ERROR frame?"** 1002 (`PROTOCOL_ERROR`); Spring closes the session after sending ERROR.
18. **"What happens if stompjs's `beforeConnect` throws?"** In 7.x the rejection is unhandled and no further reconnect is scheduled, so always catch inside it.

---

## O. More questions (added after a research pass on common interview topics)

**O1. [E] People call WebSocket "TCP for the web" and STOMP "HTTP for the web". What does that mean?**
WebSocket gives browsers a raw, bidirectional message pipe (like TCP gives programs a byte pipe). STOMP adds HTTP-like structure on top (a command, headers and a body), so both sides agree on what a message means and where it goes.

**O2. [E] Walk me through how `/app/**` messages reach a controller.**
The client SENDs to `/app/chat.send`. Spring sees the application prefix `/app`, strips it, and matches the remainder (`/chat.send`) against `@MessageMapping` patterns. The payload is converted by a `MessageConverter` and the method is invoked on a `clientInboundChannel` thread.

**O3. [M] How does Spring find the "right connection" when you call `convertAndSendToUser`?**
It doesn't look up a socket directly. It sends to `/user/{name}/queue/x`; `UserDestinationMessageHandler` asks `SimpUserRegistry` for the sessions of `{name}` and rewrites the destination to each session's unique queue (`/queue/x-user{sessionId}`). The broker delivers to the subscription the client created by subscribing to `/user/queue/x`.

**O4. [M] Which Spring component sends STOMP heart-beats on the server?**
The **broker**: `SimpleBrokerMessageHandler` (when a `TaskScheduler` is configured) or the external broker via the relay. There is **no** "HeartbeatInterceptor" class in Spring's STOMP support (see section P).

**O5. [M] What changed for WebSocket/STOMP in Spring Framework 7 / Spring Security 7?**
`MappingJackson2MessageConverter` is deprecated for removal and replaced by the Jackson 3 based `JacksonJsonMessageConverter`. Spring Security 7 **removed** `AbstractSecurityWebSocketMessageBrokerConfigurer` and `MessageSecurityMetadataSourceRegistry`, so you must use `@EnableWebSocketSecurity` with an `AuthorizationManager<Message<?>>`. (Spring 6.2 had already added `ChannelRegistration.executor(Executor)` for custom executors such as virtual threads.)

**O6. [M] How do you run Spring's message channels on virtual threads?**
Since 6.2: `registration.executor(new VirtualThreadTaskExecutor("ws-in-"))` in `configureClientInboundChannel` (and similarly for outbound). Load test it, and remember ordering still needs the preserve-order flags.

**O7. [M] What happens when the simple broker's subscriber is too slow?**
Messages queue in `ConcurrentWebSocketSessionDecorator`. Spring uses its `TERMINATE` overflow strategy and closes the session with `CloseStatus.SESSION_NOT_RELIABLE` (4500) when the send time or buffer limit is exceeded. The decorator also has a `DROP` strategy if you use it directly.

**O8. [M] Does Spring Security protect outbound messages?**
No. It secures only the `clientInboundChannel`; you protect data by authorising SUBSCRIBE frames. That's a performance decision, since one inbound message can fan out to thousands of outbound ones.

**O9. [M] Why should clients be denied SUBSCRIBE to `/queue/**` directly?**
Because user destinations resolve to `/queue/...-user{sessionId}` names. A client allowed to subscribe to `/queue/**` (or guess those names) could read other users' private messages. Allow `/user/queue/**` and deny the raw broker prefix.

**O10. [M] How do typing indicators usually work in a chat design?**
They are ephemeral events sent over the existing socket, rate-limited, never persisted. Server-side they're often a short-TTL key (e.g., 5 s in Redis) so no explicit "stopped typing" event is needed. They're the first thing to shed under load.

**O11. [M] How is presence implemented at scale?**
A per-user key with a short TTL refreshed by heart-beats/activity (offline when it expires, which handles crashes that never fire disconnect events), published as change events only to interested users. A user→gateway-node map (e.g., in Redis) lets you route private messages to the right node instead of broadcasting to all nodes.

**O12. [S] How many WebSocket connections can one server handle?**
There's no single number: it depends on memory per connection (kernel buffers, container buffers such as Tomcat's 8 KB per-session message buffers, framework objects, your state), message rate and fan-out. Public write-ups quote tens to hundreds of thousands per node. In an interview, state assumptions (e.g., ~20–50 KB per connection → ~20k–50k per GB of heap) and say you'd **measure** with a load test. Also mention OS limits (file descriptors), Tomcat's `max-connections` (Spring Boot default **8192**) and ephemeral ports.

**O13. [S] With 10 million users, how do you route a message to the one gateway node holding the recipient's socket?**
Keep a connection registry (userId → nodeId, with TTL) in Redis or a similar store. Producers publish to that node's channel/partition, not to all nodes. Alternatives: consistent hashing of users to gateway clusters, or Kafka partitions keyed by userId with each gateway consuming its assigned partitions.

**O14. [M] What does `wasClean` in the browser close event mean?**
`true` if the closing handshake completed (close frames exchanged); `false` if the connection dropped (typically code 1006).

**O15. [M] Your WebSocket works through Nginx but drops at exactly 60 s, even with Nginx timeouts raised. What else?**
Another hop: an AWS ALB in front (default idle timeout 60 s, configurable 1–4000 s), a corporate proxy, or the backend container's idle timeout. Heart-beats shorter than the smallest idle timeout fix all of them at once.

**O16. [M] What are AWS API Gateway WebSocket limits worth knowing?**
2-hour max connection duration, 10-minute idle timeout, 128 KB message payload, 32 KB frame size (non-adjustable). An oversized message closes the connection with 1009. It doesn't speak STOMP natively.

**O17. [M] Why might a GCP HTTPS load balancer drop WebSockets after 30 seconds?**
Its backend service timeout (default 30 s) acts as the maximum WebSocket connection lifetime. Raise it (e.g., 3600 s+).

**O18. [M] Your company still runs the community ingress-nginx controller for WebSockets. Any concern?**
Yes: it was retired in March 2026 (no more releases or security patches). Plan migration to a Gateway API implementation or another maintained controller, and re-verify WebSocket timeouts there.

**O19. [M] What's the difference between `@SendToUser` with and without an authenticated user?**
With a user: sent to that user's sessions (all, or only the current one with `broadcast = false`). Without a user: Spring falls back to the **current session id** and forces `broadcast = false`. If neither exists, it throws `MissingSessionUserException`.

**O20. [M] Can a STOMP client receive messages for destinations it never subscribed to?**
No. MESSAGE frames are only sent for active subscriptions (each carries the `subscription` id). A frame that arrives after a client-side unsubscribe reaches stompjs's `onUnhandledMessage`.

**O21. [M] What's the role of `ExecutorChannelInterceptor`?**
Its `beforeHandle`/`afterMessageHandled` run on the thread that actually handles the message (the executor thread). That's the right place to set and clear `ThreadLocal`s such as the security context, MDC logging keys or tenant context. `preSend` runs on the sending thread.

**O22. [S] How do you version a real-time API used by mobile apps that update slowly?**
Use an envelope with `type` and `version`; make additive changes only; clients ignore unknown fields/types; the client sends its version in CONNECT headers so the server can adapt or reject; track client versions in metrics; keep old formats until usage is negligible. Document everything in AsyncAPI.

**O23. [M] How would you test that a subscription is active before sending in an integration test?**
Use STOMP receipts (`setAutoReceipt(true)` + `addReceiptTask`) where supported, a round-trip ping through the same session, or Awaitility polling `SimpUserRegistry#findSubscriptions`. Avoid fixed sleeps.

**O24. [M] Why is RabbitMQ's `/queue/<name>` risky for Spring user destinations?**
RabbitMQ creates `/queue/` queues as **durable, non-exclusive, non-auto-deleted** by default, so per-session user queues (`/queue/x-user{sessionId}`) pile up after sessions end. Use `/exchange/amq.direct/...` (auto-delete) or expiry policies.

**O25. [S] How do you do a zero-downtime broker (RabbitMQ) upgrade under the relay?**
Cluster RabbitMQ with quorum queues for durable data; upgrade node by node; front the cluster with a TCP LB or rotate addresses in a custom `TcpClient`; Spring's relay reconnects its system session every 5 s and publishes `BrokerAvailabilityEvent`; clients get disconnected sessions and reconnect with jitter; verify user-destination queues and bindings come back.

**O26. [M] What does `heartbeatToleranceMultiplier` do in stompjs?**
The client treats the server as dead if no data arrives within `multiplier × incoming heart-beat interval` (default 2). Raise it for flaky mobile networks or throttled background tabs.

**O27. [M] How do you avoid a reconnect storm with stompjs?**
Use `reconnectTimeMode: ReconnectionTimeMode.EXPONENTIAL` with `maxReconnectDelay`, and add your own randomness (stompjs doesn't add jitter), e.g., a random initial `reconnectDelay` per client or adjusting it in `onWebSocketClose`.

**O28. [S] Where do you terminate TLS for WebSockets and why?**
Usually at the load balancer (offloads CPU/memory, central cert management); re-encrypt to the backend in zero-trust networks. Consider per-connection TLS memory cost if terminating on the app nodes.

**O29. [M] What's the difference between `SessionConnectEvent` and `SessionConnectedEvent`?**
`SessionConnectEvent` fires when the client's CONNECT arrives (has the native CONNECT headers). `SessionConnectedEvent` fires after the broker has answered with CONNECTED; the original CONNECT is in its `simpConnectMessage` header.

**O30. [M] Is `@ServerEndpoint` how Spring Boot does STOMP?**
No. `@ServerEndpoint` and `@ClientEndpoint` are **Jakarta WebSocket (JSR 356)** annotations for raw WebSocket endpoints. Spring STOMP uses `@EnableWebSocketMessageBroker`, `@MessageMapping` and friends (see Appendix A).

---

## P. Common wrong answers you will find online (don't repeat them)

| Wrong claim | Correct answer |
|-------------|----------------|
| "Spring Boot sends STOMP heart-beats through a `HeartbeatInterceptor`." | No such Spring STOMP class. Heart-beats are negotiated in CONNECT/CONNECTED and sent by the broker (simple broker with a `TaskScheduler`, or the external broker via the relay) and by clients. |
| "Spring Boot creates STOMP endpoints with `@ServerEndpoint`/`@ClientEndpoint`." | Those are Jakarta WebSocket (JSR 356) annotations for raw WebSocket. STOMP uses `@EnableWebSocketMessageBroker` + `@MessageMapping`. |
| "`Sec-WebSocket-Key` secures the connection." | It only proves the server speaks WebSocket. Security = TLS + Origin + auth. |
| "Masking encrypts client data." | It prevents proxy cache poisoning; the key is sent in clear. |
| "CORS protects WebSocket endpoints." | CORS doesn't apply; check `Origin` (CSWSH). |
| "The simple broker supports acks/redelivery." | It doesn't support acks, receipts (except DISCONNECT) or transactions. |
| "WebSocket guarantees delivery because it's on TCP." | Only while the connection lives; disconnects lose messages. You need ids, resync and persistence. |
| "Use HTTP/2 Server Push for real-time." | It was for cache preloading and has been removed from Chrome. |
| "1006 is sent by the server when something fails." | 1006 is never sent; it's reported locally when the connection dropped without a close frame. |
| "Sticky sessions are always required for WebSockets." | Only for SockJS HTTP fallbacks (or app-specific reconnect state). |
| "Set `maxPoolSize` to scale Spring's inbound channel." | With the default unbounded queue the pool never grows past `corePoolSize`. |
| "`AbstractSecurityWebSocketMessageBrokerConfigurer` is the way to secure messages." | Deprecated in 5.8/6 and removed in Spring Security 7. |


Back to the [README](README.md) · Next: [Chapter 13: Cheat Sheet & Glossary](13-cheatsheet-glossary.md)
