# Appendix A: Beyond Spring STOMP (Other Stacks, Protocols and Integrations)

> **Goal:** fill the gaps around the main book: raw WebSocket APIs in Java (Jakarta, Spring, WebFlux), RSocket,
> Spring Session, a Kafka-backed real-time gateway, WebSocket over HTTP/2 in practice, Node.js, Socket.IO,
> SignalR, Go, GraphQL subscriptions, CRDT sync (Yjs) and MQTT over WebSocket. You don't need to master all of
> these, but interviewers love "how does X compare to STOMP?" and real companies mix stacks.

---

## A.1 ELI5

STOMP is one language you can speak on the WebSocket telephone line. Other teams use other languages on the same
line (Socket.IO, SignalR, GraphQL subscriptions, MQTT, Yjs), or talk on the line with no shared language at all (raw
WebSocket). Knowing the neighbours helps you choose well and explain your choice.

---

## A.2 Jakarta WebSocket (JSR 356) `@ServerEndpoint`

The **standard Java API** for raw WebSocket, implemented by Tomcat, Jetty, Undertow and others. No STOMP, no
broker: you get sessions and messages.

```java
@ServerEndpoint(value = "/raw/echo",
                decoders = ChatDecoder.class, encoders = ChatEncoder.class)
public class EchoEndpoint {

    private static final Set<Session> SESSIONS = ConcurrentHashMap.newKeySet();

    @OnOpen
    public void onOpen(Session session, EndpointConfig config) {
        session.setMaxIdleTimeout(0);                         // rely on app heart-beats instead
        session.setMaxTextMessageBufferSize(64 * 1024);
        SESSIONS.add(session);
    }

    @OnMessage
    public void onMessage(Session session, ChatMessage msg) {   // decoded by ChatDecoder
        for (Session s : SESSIONS) {
            if (s.isOpen()) s.getAsyncRemote().sendObject(msg); // async send; see thread-safety note
        }
    }

    @OnClose
    public void onClose(Session session, CloseReason reason) { SESSIONS.remove(session); }

    @OnError
    public void onError(Session session, Throwable t) { SESSIONS.remove(session); }
}
```

In **Spring Boot**, register annotated endpoints with a `ServerEndpointExporter` bean (embedded container):

```java
@Bean
public ServerEndpointExporter serverEndpointExporter() { return new ServerEndpointExporter(); }
```

Key facts:
* `@ServerEndpoint` classes are instantiated **per connection** by the container by default, so they aren't Spring singletons. Injecting Spring beans needs `SpringConfigurator` or a custom `ServerEndpointConfig.Configurator`.
* `Session.getBasicRemote()` is **blocking**; `getAsyncRemote()` is non-blocking. Sending concurrently to the same session from multiple threads can throw `IllegalStateException` (Tomcat: `TEXT_PARTIAL_WRITING`). Serialise sends per session.
* `Encoder`/`Decoder` classes convert between objects and text/binary.
* `@ClientEndpoint` + `ContainerProvider.getWebSocketContainer().connectToServer(...)` for Java clients.
* **Interview point:** `@ServerEndpoint` is *not* how Spring STOMP works. Spring STOMP uses `@EnableWebSocketMessageBroker` + `@MessageMapping`.

---

## A.3 Spring's raw `WebSocketHandler` API (servlet stack)

When you want Spring integration (beans, security, interceptors) without STOMP:

```java
@Configuration
@EnableWebSocket
public class RawConfig implements WebSocketConfigurer {
    private final GameSocketHandler handler;
    public RawConfig(GameSocketHandler handler) { this.handler = handler; }

    @Override
    public void registerWebSocketHandlers(WebSocketHandlerRegistry registry) {
        registry.addHandler(handler, "/game")
                .addInterceptors(new HttpSessionHandshakeInterceptor())
                .setAllowedOriginPatterns("https://*.example.com");
    }
}

@Component
public class GameSocketHandler extends TextWebSocketHandler {
    private final Map<String, WebSocketSession> sessions = new ConcurrentHashMap<>();

    @Override
    public void afterConnectionEstablished(WebSocketSession raw) {
        // Make sends thread-safe + bounded: 5 s send limit, 256 KB buffer, drop or terminate on overflow
        WebSocketSession s = new ConcurrentWebSocketSessionDecorator(raw, 5_000, 256 * 1024,
                ConcurrentWebSocketSessionDecorator.OverflowStrategy.DROP);
        sessions.put(raw.getId(), s);
    }

    @Override
    protected void handleTextMessage(WebSocketSession session, TextMessage message) throws Exception {
        TextMessage out = new TextMessage("echo:" + message.getPayload());
        for (WebSocketSession s : sessions.values()) if (s.isOpen()) s.sendMessage(out);
    }

    @Override
    public void afterConnectionClosed(WebSocketSession session, CloseStatus status) {
        sessions.remove(session.getId());
    }

    @Override
    public boolean supportsPartialMessages() { return false; }   // true → receive fragments (handle buffering yourself)
}
```

Notes:
* `BinaryWebSocketHandler` for binary protocols (protobuf, game state).
* `PerConnectionWebSocketHandler` creates a handler instance per connection (when you want per-connection state in fields).
* `OverflowStrategy.DROP` drops the **oldest** buffered messages instead of closing the session when the *buffer* limit is exceeded; good for "latest state" streams. Exceeding the *send time* limit still terminates the session.
* Heart-beats: send `PingMessage`s from a scheduler and track `PongMessage`s in `handlePongMessage`.
* You get no destinations, subscriptions or user routing, so you build them. This is the main reason teams pick STOMP.

---

## A.4 Spring WebFlux reactive WebSocket

WebFlux (Netty or servlet containers in reactive mode) has its own `org.springframework.web.reactive.socket.WebSocketHandler`.
**No STOMP support** here.

```java
@Configuration
public class ReactiveWsConfig {
    @Bean
    public HandlerMapping wsMapping(PriceHandler handler) {
        return new SimpleUrlHandlerMapping(Map.of("/prices", handler), -1);   // order before annotated controllers
    }
    // Needed only if you are NOT using the WebFlux config (@EnableWebFlux / Boot auto-config):
    // @Bean WebSocketHandlerAdapter handlerAdapter() { return new WebSocketHandlerAdapter(); }
}

@Component
public class PriceHandler implements WebSocketHandler {
    private final Sinks.Many<String> prices = Sinks.many().multicast().directBestEffort(); // drops for slow subscribers

    public void publish(String json) { prices.tryEmitNext(json); }

    @Override
    public Mono<Void> handle(WebSocketSession session) {
        Mono<Void> input = session.receive()                           // Flux<WebSocketMessage>
                .map(WebSocketMessage::getPayloadAsText)
                .doOnNext(cmd -> { /* handle client commands */ })
                .then();
        Mono<Void> output = session.send(prices.asFlux()
                .onBackpressureLatest()                                 // conflation: keep only latest when slow
                .map(session::textMessage));
        return Mono.zip(input, output).then();                         // completes when either side ends
    }
}
```

* `session.receive()` returns a `Flux<WebSocketMessage>`; `session.send(Publisher)` returns `Mono<Void>`. The handler's returned `Mono<Void>` signals when the session is done.
* Reactive streams give **real backpressure** semantics (`onBackpressureLatest`, `onBackpressureBuffer(n)`, `limitRate`).
* Payload buffers (`DataBuffer`) are released by the framework when you map them in the pipeline; if you hold raw messages beyond the pipeline, call `retain()`/release correctly.
* Client: `ReactorNettyWebSocketClient().execute(uri, session -> ...)`.
* When to choose: fully reactive stack, high connection counts on Netty, streaming pipelines. If you want STOMP semantics, stay on Spring MVC or use RSocket.

---

## A.5 RSocket (application protocol with reactive semantics)

RSocket is a binary application protocol with four interaction models:
**request-response**, **fire-and-forget**, **request-stream**, **request-channel** (bidirectional streams), plus
**flow control** (`request(n)`), **resumption** and **metadata** routing. It can run over TCP or **WebSocket**.

Spring Boot:
```properties
spring.rsocket.server.mapping-path=/rsocket
spring.rsocket.server.transport=websocket
```
```java
@Controller
public class PriceRSocketController {
    @MessageMapping("prices.{symbol}")                 // routing metadata, same annotation name as STOMP!
    public Flux<Price> stream(@DestinationVariable String symbol) { return priceService.stream(symbol); }

    @MessageMapping("orders.place")
    public Mono<OrderAck> place(OrderRequest req) { return orderService.place(req); }
}
```
Browser client: `rsocket-js`. **Comparison with STOMP:** RSocket has built-in request/response, backpressure and
resumption, but it's binary, less widely adopted, has fewer brokers/tools, and its browser libraries are less mature.
STOMP is simpler and ubiquitous with brokers. Use RSocket for reactive service-to-service or advanced streaming needs.

---

## A.6 Spring Session integration (keep HTTP sessions alive)

Problem: with **cookie/HTTP-session authentication**, a user may be active only over WebSocket for an hour. The HTTP
session isn't touched, so it **expires**, and the next REST call fails, or worse, the WebSocket keeps working for a
logged-out user.

Spring Session provides `AbstractSessionWebSocketMessageBrokerConfigurer`, which:
* keeps the HTTP `Session` alive on incoming WebSocket messages, and
* closes WebSocket sessions when the HTTP session is terminated (logout/expiry).

```java
@Configuration
@EnableScheduling
@EnableWebSocketMessageBroker
public class WebSocketConfig<S extends Session> extends AbstractSessionWebSocketMessageBrokerConfigurer<S> {

    @Override
    protected void configureStompEndpoints(StompEndpointRegistry registry) {   // note: not registerStompEndpoints
        registry.addEndpoint("/ws").setAllowedOriginPatterns("https://app.example.com");
    }

    @Override
    public void configureMessageBroker(MessageBrokerRegistry registry) {
        registry.enableSimpleBroker("/queue/", "/topic/");
        registry.setApplicationDestinationPrefixes("/app");
    }
}
```
Combine with a Spring Session store (`spring-session-data-redis` / JDBC) for clustering. Not needed if you use stateless JWTs in CONNECT.

---

## A.7 A Kafka-backed real-time gateway (complete pattern)

Large companies often keep domain services ignorant of WebSockets: they publish **events to Kafka**, and a **real-time
gateway** pushes them to connected clients.

```
 order-service ──► Kafka topic "user-notifications" (key = userId) ──► realtime-gateway pods ──► STOMP clients
 todo-service  ──► Kafka topic "list-events" (key = listId)        ──►        "
```

### A.7.1 Broadcast-style consumption (simple, every pod gets everything)
Each gateway pod uses a **unique consumer group** so it receives **all** events, then delivers to its local sessions.

```java
@Component
@RequiredArgsConstructor
public class KafkaToStompBridge {
    private final SimpMessagingTemplate messaging;
    private final ObjectMapper json;

    @KafkaListener(topics = "list-events",
                   groupId = "realtime-gateway-#{T(java.util.UUID).randomUUID().toString()}") // unique group per pod
    public void onListEvent(ConsumerRecord<String, String> rec) throws IOException {
        JsonNode event = json.readTree(rec.value());
        String listId = rec.key();
        messaging.convertAndSend("/topic/todo.list." + listId, event);     // simple broker: only local subscribers get it
    }

    @KafkaListener(topics = "user-notifications",
                   groupId = "realtime-gateway-#{T(java.util.UUID).randomUUID().toString()}")
    public void onNotification(ConsumerRecord<String, String> rec) throws IOException {
        messaging.convertAndSendToUser(rec.key(), "/queue/notifications", json.readTree(rec.value()));
        // no-op on pods where this user has no session
    }
}
```
* Set `auto.offset.reset=latest` for broadcast groups (a new pod doesn't need history; clients resync via REST).
* Random group ids leave stale groups behind in Kafka. Use a stable per-pod id (e.g., the StatefulSet pod name) instead of a random UUID in production.
* Cost: every pod processes every event. Fine up to a few thousand events/s.

### A.7.2 Targeted routing (scales further)
1. On connect, the gateway records `userId → podId` in Redis (TTL refreshed by heart-beats/events, removed on disconnect).
2. A **router** service consumes `user-notifications`, looks up the pod, and forwards to that pod's own channel (a Redis channel `pod:{podId}` or a per-pod Kafka partition).
3. If the user is offline → push notification / inbox only.
This avoids every pod processing every message, but adds a lookup and a moving part.

### A.7.3 Ordering and reliability
* Key Kafka records by entity id (`listId`, `conversationId`) → per-entity ordering within a partition.
* Include `seq` in the event so clients can detect gaps; resync via REST on reconnect.
* The gateway is **not** a durable store: if a pod restarts, its clients reconnect and resync.

---

## A.8 WebSocket over HTTP/2 and HTTP/3 in practice

* **Browsers** can bootstrap WebSockets over HTTP/2 (RFC 8441) when the server advertises `SETTINGS_ENABLE_CONNECT_PROTOCOL`. If it doesn't, they open a separate HTTP/1.1 connection with the classic Upgrade. **Your code doesn't change**; `new WebSocket(url)` is the same.
* **Servers/proxies** vary: some implement RFC 8441 (e.g., Jetty and Envoy support it), many deployments don't, and often the edge speaks HTTP/2 to browsers while forwarding WebSockets to the app over HTTP/1.1 Upgrade. Check each hop's documentation before relying on it.
* **Benefits:** many WebSockets share one TCP+TLS connection (fewer handshakes, fewer sockets on mobile). **Drawbacks:** TCP head-of-line blocking affects all streams on that connection; per-stream flow control interacts with WebSocket backpressure; less mature tooling.
* **HTTP/3 (RFC 9220)** removes TCP head-of-line blocking via QUIC; support is still emerging. **WebTransport** is the HTTP/3-native alternative with unreliable datagrams.
* **Practical advice:** don't architect around HTTP/2 WebSockets; treat them as a transparent optimisation where available.

---

## A.9 Node.js

### A.9.1 Raw WebSocket server
See Chapter 3 §3.9 (`ws` library with ping/pong liveness). For STOMP semantics in Node, teams usually either:
* put **RabbitMQ Web STOMP** (or ActiveMQ) behind their auth layer, or
* use Socket.IO / their own JSON protocol on `ws`.

### A.9.2 STOMP client in Node
```js
// Node 22+ has a global WebSocket. On older Node, polyfill it with the 'ws' package:
// import { WebSocket } from 'ws'; Object.assign(globalThis, { WebSocket });
import { Client } from '@stomp/stompjs';

const client = new Client({
  brokerURL: 'ws://localhost:8080/ws',
  connectHeaders: { Authorization: `Bearer ${process.env.TOKEN}` },
  onConnect: () => {
    client.subscribe('/topic/todo.list.L1', (m) => console.log('event', m.body));
    client.publish({ destination: '/app/todo.upsert', body: JSON.stringify({ listId: 'L1', title: 'from node' }),
                     headers: { 'content-type': 'application/json' } });
  },
});
client.activate();
```
For STOMP over **TCP** (e.g., to RabbitMQ 61613) Node has libraries such as `stompit`; check maintenance status before adopting.

---

## A.10 Socket.IO in depth (and how it differs from STOMP)

**Architecture:** Socket.IO (server: Node; clients: JS, Swift, Java, Python, etc.) sits on **Engine.IO**, which handles transports
(HTTP long-polling first, then upgrade to WebSocket by default; or WebSocket-only if configured), heart-beats and
reconnection.

| Concept | Socket.IO | STOMP equivalent |
|---------|-----------|------------------|
| Event | `socket.emit('chat', data)` / `socket.on('chat', fn)` | SEND to destination / MESSAGE on subscription |
| Rooms | `socket.join('room-1')`, `io.to('room-1').emit(...)` (server-side membership) | Client SUBSCRIBE to `/topic/room-1` |
| Namespaces | `io.of('/admin')` (multiplex logical channels) | Destination prefixes |
| Acknowledgements | `socket.emit('save', data, (ack) => ...)` callback (request/response built in) | Receipts / reply queues |
| Broadcast | `socket.broadcast.emit` | Topic publish |
| Middleware | `io.use((socket, next) => ...)` (auth) | Channel interceptors |
| Scaling | **Adapters** (Redis, Redis Streams, Postgres, cluster adapter) | Broker relay / backplane |
| Sticky sessions | **Required** when HTTP long-polling is enabled (multiple requests per session) | Only for SockJS fallbacks |
| Recovery | Connection state recovery (v4.6+) can restore rooms and missed packets for brief disconnects | Your resync design |

**Key differences to say in interviews:**
* Socket.IO's room membership is **server-controlled** (`join`), so authorisation lives in your join logic. STOMP subscriptions are **client-requested**, so you must authorise SUBSCRIBE.
* Socket.IO has its own wire protocol, so you can't connect with a plain WebSocket or STOMP client.
* Socket.IO is idiomatic in Node ecosystems; STOMP is idiomatic with Spring/RabbitMQ.

---

## A.11 ASP.NET Core SignalR

* **Hubs**: server classes whose methods clients invoke (`connection.invoke("SendMessage", user, text)`), and the server calls client methods (`Clients.Group("room").SendAsync("ReceiveMessage", ...)`).
* **Transports** negotiated: WebSockets → Server-Sent Events → Long Polling. A `negotiate` HTTP request precedes the connection unless you configure WebSockets-only with `skipNegotiation`.
* **Protocols:** JSON or MessagePack hub protocols.
* **Groups** (server-managed membership), **users** (by `IUserIdProvider`), **connections**.
* **Scale-out:** Redis backplane or **Azure SignalR Service** (managed connections). Sticky sessions are required for multi-server setups unless all clients use WebSockets with negotiation skipped, or you use Azure SignalR Service.
* **Comparison:** SignalR ≈ Socket.IO for .NET: RPC-style hub calls, server-managed groups. STOMP ≈ messaging with destinations. Java/Spring shops pick STOMP; .NET shops pick SignalR.

---

## A.12 Go

* Libraries: **`github.com/gorilla/websocket`** (classic, widely used; the project was archived in 2022 and later revived under new maintainers) and **`github.com/coder/websocket`** (formerly `nhooyr.io/websocket`, context-aware, minimal).
* **Concurrency rule (gorilla):** at most **one concurrent writer** and **one concurrent reader** per connection. Typical pattern: one goroutine `readPump`, one goroutine `writePump` fed by a buffered channel; the write pump also sends pings on a ticker; the read pump sets a read deadline extended on each pong.
* STOMP in Go: `github.com/go-stomp/stomp` (client and a simple server, over TCP; wrap a WebSocket as `net.Conn` if needed).

```go
// writePump sketch (gorilla)
ticker := time.NewTicker(pingPeriod)
for {
    select {
    case msg, ok := <-c.send:
        c.conn.SetWriteDeadline(time.Now().Add(writeWait))
        if !ok { c.conn.WriteMessage(websocket.CloseMessage, []byte{}); return }
        if err := c.conn.WriteMessage(websocket.TextMessage, msg); err != nil { return }
    case <-ticker.C:
        c.conn.SetWriteDeadline(time.Now().Add(writeWait))
        if err := c.conn.WriteMessage(websocket.PingMessage, nil); err != nil { return }
    }
}
```

---

## A.13 GraphQL subscriptions over WebSocket

* Modern protocol: **`graphql-transport-ws`** (implemented by the `graphql-ws` library). Message types: `connection_init` (with auth payload), `connection_ack`, `subscribe`, `next`, `error`, `complete`, `ping`, `pong`.
* Legacy protocol: `subscriptions-transport-ws` (Apollo, deprecated), which confusingly uses the sub-protocol name **`graphql-ws`**. Client and server must use the **same** protocol; this mismatch is a classic bug.
* Auth goes in `connection_init`'s payload (the same idea as STOMP CONNECT headers).
* **Spring for GraphQL** supports subscriptions over WebSocket (`spring.graphql.websocket.path=/graphql`) with `@SubscriptionMapping` returning a `Flux`.
* Comparison: GraphQL subscriptions give typed, client-selected fields per event; STOMP gives free-form messages. Scaling needs the same backplane thinking.

---

## A.14 CRDT-based sync (collaborative editing): Yjs

* **Yjs** is a CRDT library; documents converge regardless of update order. **y-websocket** syncs them over WebSocket with a small binary protocol: **sync step 1** (state vector), **sync step 2** (missing updates), then incremental **updates**; plus **awareness** messages (cursors, presence).
* Servers: `y-websocket` server, **Hocuspocus** (auth, persistence hooks, Redis scaling), `y-redis`.
* Persistence: store merged document state (e.g., in a DB/S3) and/or update logs.
* Why not STOMP? You *can* carry Yjs updates as binary STOMP bodies on a `/topic/doc.{id}`, but you lose the ready-made sync handshake, awareness and persistence integrations. Most teams use the Yjs ecosystem directly and keep STOMP for other real-time features.
* **OT vs CRDT:** OT (Google Docs style) transforms operations via a central server; CRDTs merge without central coordination (better offline, more metadata).

---

## A.15 MQTT over WebSocket

* MQTT brokers (Mosquitto, EMQX, HiveMQ, RabbitMQ's Web MQTT plugin) expose WebSocket listeners; browser clients like **mqtt.js** connect with sub-protocol `mqtt`.
* Topic wildcards `+` (one level) and `#` (multi-level), separator `/`; QoS 0/1/2; retained messages; last will; session persistence.
* Choose MQTT when IoT devices and browsers share the same pub/sub fabric. Choose STOMP when you're in the Spring/RabbitMQ web-app world.

---

## A.16 The big comparison table

| | STOMP/WS | Raw WS | Socket.IO | SignalR | GraphQL subs | RSocket | MQTT/WS | Yjs |
|---|---|---|---|---|---|---|---|---|
| Style | Messaging (destinations) | Bytes/messages | Events + rooms | RPC hubs + groups | Typed queries | Reactive streams | IoT pub/sub | CRDT sync |
| Ecosystem | Spring, RabbitMQ, ActiveMQ | Any | Node | .NET | Any GraphQL | Spring, Java | IoT brokers | Collab editors |
| Who controls membership | Client subscribes (authorise!) | You | Server (`join`) | Server (groups) | Client query (authorise!) | Client request | Client subscribe (ACLs) | Doc-level auth |
| Request/response | Convention | You | Built-in acks | Built-in invoke | Queries/mutations | Built-in | Convention | n/a |
| Backpressure | Limits/prefetch | You | Limited | Limited | Limited | **Built-in** | QoS/inflight | n/a |
| Fallback transports | SockJS | No | Long-polling | SSE, long-polling | No | No | No | No |
| Browser client maturity | High | Native | High | High | High | Medium | High | High |

---

## A.17 Summary
* Raw WebSocket APIs (Jakarta, Spring `WebSocketHandler`, WebFlux) give full control with no messaging semantics.
* RSocket adds reactive streams, backpressure and resumption; Spring Session keeps cookie sessions aligned with sockets.
* A Kafka-backed gateway decouples domain teams from WebSockets.
* Socket.IO and SignalR are framework-specific alternatives with server-managed rooms/groups; GraphQL subscriptions, MQTT and Yjs serve specialised needs.
* The same production rules apply everywhere: auth on connect, authorise membership, heart-beats, backoff with jitter, resync, backplane for scale.

Back to the [README](README.md) · See also [Appendix B: Runnable sample project](../../examples/stomp-todo/README.md) and [Appendix C: Verification notes](15-verification-notes.md).
