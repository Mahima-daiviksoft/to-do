# Chapter 13: Cheat Sheet & Glossary

---

## 13.1 One-page cheat sheet

### WebSocket handshake
```
GET /ws HTTP/1.1                         HTTP/1.1 101 Switching Protocols
Host: h                                  Upgrade: websocket
Upgrade: websocket                       Connection: Upgrade
Connection: Upgrade                      Sec-WebSocket-Accept: base64(sha1(key+GUID))
Sec-WebSocket-Key: <16 random bytes b64> Sec-WebSocket-Protocol: v12.stomp
Sec-WebSocket-Version: 13
Origin: https://app
Sec-WebSocket-Protocol: v12.stomp, v11.stomp
GUID = 258EAFA5-E914-47DA-95CA-C5AB0DC85B11
```

### Frame
```
FIN|RSV1-3|opcode(4) | MASK|len(7) | [len16|len64] | [mask key 4B] | payload
opcodes: 0 cont, 1 text, 2 binary, 8 close, 9 ping, A pong
client→server masked; control frames ≤125 B, unfragmented
```

### Close codes
`1000` normal · `1001` going away · `1002` protocol · `1003` unsupported · `1005*` no status · `1006*` abnormal ·
`1007` bad data · `1008` policy · `1009` too big · `1010` extension · `1011` internal · `1012` restart ·
`1013` try later · `1015*` TLS · `3000–3999` libs · `4000–4999` app. (`*` never sent on the wire)

### STOMP frames
```
COMMAND\nheader:value\n\nbody\0
Client: CONNECT/STOMP SEND SUBSCRIBE UNSUBSCRIBE ACK NACK BEGIN COMMIT ABORT DISCONNECT
Server: CONNECTED MESSAGE RECEIPT ERROR
```

| Frame | Required headers |
|---|---|
| CONNECT | accept-version, host (opt: login, passcode, heart-beat) |
| CONNECTED | version (opt: session, server, heart-beat) |
| SEND | destination |
| SUBSCRIBE | destination, id (opt: ack=auto/client/client-individual) |
| UNSUBSCRIBE | id |
| ACK / NACK | id (= MESSAGE's ack header) |
| BEGIN/COMMIT/ABORT | transaction |
| MESSAGE | destination, message-id, subscription |
| RECEIPT | receipt-id |
| ERROR | (message) → connection closes |

**Heart-beat:** client→server = (cx==0‖sy==0) ? 0 : max(cx,sy); server→client = (sx==0‖cy==0) ? 0 : max(sx,cy).
**Escapes (1.2):** `\r` `\n` `\c` `\\`; none in CONNECT/CONNECTED. First repeated header wins. Bodies only on SEND/MESSAGE/ERROR.

### Spring essentials
```java
@Configuration @EnableWebSocketMessageBroker
class Cfg implements WebSocketMessageBrokerConfigurer {
  public void registerStompEndpoints(StompEndpointRegistry r) {
    r.addEndpoint("/ws").setAllowedOriginPatterns("https://*.example.com"); // .withSockJS()
  }
  public void configureMessageBroker(MessageBrokerRegistry r) {
    r.setApplicationDestinationPrefixes("/app");
    r.enableSimpleBroker("/topic","/queue").setTaskScheduler(ts).setHeartbeatValue(new long[]{10000,10000});
    // r.enableStompBrokerRelay("/topic","/queue").setRelayHost(..).setRelayPort(61613)...
    r.setUserDestinationPrefix("/user");
    r.setPreservePublishOrder(true);
  }
  public void configureClientInboundChannel(ChannelRegistration reg) { reg.interceptors(jwtConnectInterceptor); }
  public void configureWebSocketTransport(WebSocketTransportRegistration t) {
    t.setMessageSizeLimit(64*1024).setSendBufferSizeLimit(512*1024).setSendTimeLimit(10_000).setTimeToFirstMessage(30_000);
  }
}
```

| Annotation / API | Purpose |
|---|---|
| `@MessageMapping("/x")` | Handle client SEND to `/app/x` |
| `@SubscribeMapping("/x")` | Reply once to SUBSCRIBE `/app/x` |
| `@SendTo("/topic/y")` | Broadcast return value |
| `@SendToUser("/queue/z")` | Return value to current user (`broadcast=false` → one session) |
| `@MessageExceptionHandler` | Handle exceptions (also in `@ControllerAdvice`) |
| `@DestinationVariable`, `@Header`, `@Headers`, `@Payload`, `Principal` | Method args |
| `SimpMessagingTemplate.convertAndSend / convertAndSendToUser` | Push from anywhere |
| `SimpUserRegistry` | Who's connected |
| `Session*Event`, `BrokerAvailabilityEvent` | Lifecycle |
| `StompSubProtocolErrorHandler` | Customise ERROR frames |
| `WebSocketMessageBrokerStats` | Built-in stats log |

### stompjs essentials
```ts
const c = new Client({ brokerURL: 'wss://h/ws', reconnectDelay: 5000, heartbeatIncoming: 10000, heartbeatOutgoing: 10000,
  beforeConnect: async () => { c.connectHeaders = { Authorization: `Bearer ${await token()}` }; },
  onConnect: () => { c.subscribe('/topic/x', m => use(JSON.parse(m.body))); },
  onStompError: f => console.error(f.headers.message) });
c.activate();
c.publish({ destination: '/app/y', body: JSON.stringify(d), headers: { 'content-type': 'application/json' } });
await c.deactivate();
// React Native: forceBinaryWSFrames: true, appendMissingNULLonIncoming: true
```

### Nginx
```nginx
map $http_upgrade $connection_upgrade { default upgrade; '' close; }
location /ws { proxy_pass http://backend; proxy_http_version 1.1;
  proxy_set_header Upgrade $http_upgrade; proxy_set_header Connection $connection_upgrade;
  proxy_read_timeout 3600s; proxy_send_timeout 3600s; proxy_buffering off; }
```

### Top 10 rules
1. `wss://` + Origin allow-list + token in CONNECT.
2. Authorise every SUBSCRIBE and SEND; deny by default; identity from Principal.
3. Heart-beats 10–25 s, shorter than every idle timeout.
4. Reconnect with backoff + jitter; re-subscribe in `onConnect`.
5. DB is truth; events carry ids/seq; resync after reconnect.
6. Publish after commit (or outbox); idempotent commands.
7. Simple broker = single instance; cluster → relay or backplane.
8. Bound buffers (send limits), size pools, conflate high-frequency data.
9. Small messages; big data over HTTP.
10. Measure: sessions, close codes, queues, latency; load + chaos test.

---

## 13.2 Glossary

| Term | Definition |
|------|------------|
| **ABORT** | STOMP frame cancelling a transaction |
| **ACK / NACK** | STOMP frames acknowledging (or rejecting) a message for `client`/`client-individual` subscriptions |
| **accept-version** | CONNECT header listing STOMP versions the client supports |
| **AMQP** | Advanced Message Queuing Protocol; binary messaging protocol (0-9-1 RabbitMQ, 1.0 OASIS standard) |
| **AsyncAPI** | Specification for documenting message-driven APIs (channels, messages, payloads) |
| **At-least-once / at-most-once / exactly-once** | Delivery guarantees: ≥1, ≤1, exactly 1 (effectively via dedupe) |
| **Backplane** | Pub/sub layer (Redis, Kafka) connecting multiple server instances so messages reach all their clients |
| **Backpressure** | Mechanism to slow producers when consumers can't keep up |
| **bfcache** | Browser back/forward cache; pages with open WebSockets may be evicted or have connections closed |
| **Binary frame** | WebSocket opcode 0x2, arbitrary bytes |
| **Broker** | Server that routes/stores messages between producers and consumers |
| **Broker relay** | Spring's `StompBrokerRelayMessageHandler` forwarding STOMP to an external broker |
| **brokerChannel** | Spring channel for messages from application code to the broker |
| **bufferedAmount** | Browser WebSocket property: bytes queued but not yet sent |
| **ChannelInterceptor** | Spring hook on message channels (`preSend`, `postSend`, `afterSendCompletion`) |
| **clientInboundChannel / clientOutboundChannel** | Spring channels for messages from / to WebSocket clients |
| **Close frame / handshake** | Opcode 0x8 frame with status code + reason; both sides exchange before TCP close |
| **Comet** | Umbrella term for long polling/HTTP streaming push techniques |
| **Conflation** | Sending only the latest value per key at intervals |
| **CONNECT / CONNECTED** | STOMP frames to open a session / server confirmation |
| **content-length** | STOMP header: body size in bytes; allows NULLs in body |
| **Context takeover** | permessage-deflate option to reuse the compression dictionary across messages |
| **Continuation frame** | Opcode 0x0, subsequent fragment of a message |
| **Control frame** | Close, ping, pong (≤125 bytes, not fragmented) |
| **CSWSH** | Cross-Site WebSocket Hijacking: attacker page opening an authenticated socket via victim's cookies |
| **Destination** | STOMP address string (e.g., `/topic/x`), broker-defined semantics |
| **DISCONNECT** | STOMP frame to close a session gracefully (with receipt) |
| **Durable subscription/queue** | Survives disconnects/restarts and keeps messages |
| **EOL** | End of line: LF, or CRLF in STOMP 1.2 |
| **ERROR** | STOMP server frame reporting an error; connection then closes |
| **Exchange** | RabbitMQ routing entity (direct, topic, fanout, headers) |
| **Extended CONNECT** | HTTP/2 (RFC 8441) / HTTP/3 (RFC 9220) mechanism to bootstrap WebSockets |
| **Fan-out** | Delivering one message to many subscribers |
| **FIN bit** | Marks the final frame of a message |
| **Fragmentation** | Splitting a message into multiple frames |
| **Full-duplex** | Both sides can send simultaneously |
| **Half-open connection** | One side thinks the connection is alive while the other is gone |
| **HandshakeInterceptor** | Spring hook around the HTTP upgrade |
| **Heart-beat** | Periodic EOL (STOMP) or ping/pong (WebSocket) to prove liveness |
| **host header** | STOMP CONNECT header naming a virtual host |
| **Idempotency key** | Client-generated id letting the server ignore duplicate commands |
| **Jitter** | Randomness added to retry delays to spread load |
| **Long polling** | Server holds a request open until data is available |
| **Masking** | XOR of client payloads with a random 4-byte key (anti cache-poisoning) |
| **MESSAGE** | STOMP server frame delivering a message to a subscription |
| **message-id** | Unique id of a MESSAGE frame |
| **MQTT** | Lightweight pub/sub protocol for IoT, QoS 0/1/2 |
| **Native headers** | Spring's term for the raw STOMP headers inside a `Message` |
| **Opcode** | 4-bit WebSocket frame type |
| **Origin** | Header carrying the page's origin; checked to prevent CSWSH |
| **Outbox pattern** | Writing events to a DB table in the same transaction for reliable publishing |
| **permessage-deflate** | WebSocket compression extension (RFC 7692) |
| **Ping / Pong** | WebSocket control frames for liveness |
| **Prefetch** | Max unacked messages a broker sends to a consumer |
| **Presence** | Tracking which users are online |
| **Principal** | Authenticated user identity attached to a WebSocket session |
| **Pub/Sub** | Publish/subscribe messaging pattern |
| **Queue** | Point-to-point destination; each message to one consumer |
| **readyState** | Browser WebSocket state: 0 CONNECTING, 1 OPEN, 2 CLOSING, 3 CLOSED |
| **RECEIPT / receipt-id** | STOMP server confirmation of a frame that carried a `receipt` header |
| **Resync** | Fetching missed data after reconnect or gap detection |
| **RFC 6455** | The WebSocket protocol specification |
| **RSV bits** | Reserved frame bits used by extensions (RSV1 = compressed in permessage-deflate) |
| **Sec-WebSocket-Accept** | Server handshake header proving WebSocket support |
| **Sec-WebSocket-Key** | Client handshake nonce |
| **Sec-WebSocket-Protocol** | Sub-protocol negotiation header |
| **SEND** | STOMP frame to send a message to a destination |
| **Sequence number (seq)** | Monotonic per-entity counter for ordering/gap detection |
| **SimpMessagingTemplate** | Spring API to send messages to the broker |
| **SimpUserRegistry** | Spring registry of connected users/sessions/subscriptions |
| **Simple broker** | Spring's in-memory STOMP broker |
| **SockJS** | WebSocket emulation protocol/library with HTTP fallbacks |
| **SSE** | Server-Sent Events: one-way server push over HTTP |
| **Sticky session** | LB routing a client's requests to the same backend |
| **STOMP** | Simple/Streaming Text Oriented Messaging Protocol |
| **Sub-protocol** | Application protocol negotiated over WebSocket (e.g., `v12.stomp`) |
| **SUBSCRIBE / UNSUBSCRIBE** | STOMP frames to start/stop receiving messages from a destination |
| **subscription header** | MESSAGE header carrying the matching SUBSCRIBE id |
| **Text frame** | Opcode 0x1, UTF-8 payload |
| **Thundering herd** | Many clients reconnecting/retrying simultaneously |
| **TLS** | Transport Layer Security; makes `wss://` |
| **Topic** | Pub/sub destination; each message to all subscribers |
| **Transaction (STOMP)** | BEGIN/COMMIT/ABORT grouping SEND/ACK frames atomically |
| **User destination** | Spring `/user/...` destinations resolved to per-session destinations |
| **Virtual host** | Broker namespace (RabbitMQ vhost), selected by STOMP `host` header |
| **WebSocketStompClient** | Spring's Java STOMP client |
| **WebTransport** | HTTP/3-based API with streams and datagrams |
| **wss://** | WebSocket over TLS |

---

## 13.3 Study plan

| Day | Read | Practice |
|-----|------|----------|
| 1 | Ch 1–2 | Decode frames by hand; compute an Accept key |
| 2 | Ch 3–4 | Write raw STOMP frames with wscat/Postman; build the TinyStomp client |
| 3 | Ch 5 | Build a Spring chat with `/app`, `/topic`, `/user/queue` |
| 4 | Ch 6 | React (or React Native) client with reconnect + resync |
| 5 | Ch 7 | Switch to RabbitMQ relay with Docker; run 2 instances behind Nginx |
| 6 | Ch 8 | Add JWT CONNECT auth + subscription authorisation + tests |
| 7 | Ch 9–10 | Add metrics, load test with k6, break things on purpose and fix them using the Bug Encyclopedia |
| 8 | Ch 11 | Write an ADR + AsyncAPI doc for your app |
| 9–10 | Ch 12–13 | Answer all questions aloud; do 2 system designs on a whiteboard |

Back to the [README](README.md).
