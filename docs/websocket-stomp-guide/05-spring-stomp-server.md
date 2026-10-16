# Chapter 5: Spring WebSocket + STOMP, the Server Side

> **Goal:** build and *understand* a production-grade STOMP server with Spring Boot. You'll learn the
> internal message flow, every annotation, every configuration hook, and the "why" behind them.
> Code targets Spring Boot 3.x/4.x (Spring Framework 6.x/7.x, `jakarta.*`). Spring has supported
> WebSocket/STOMP since **Spring Framework 4.0 (2013)**, and the core model hasn't changed since.

---

## 5.1 ELI5

Spring is like a **big office building**:

* The **front door** (`/ws` endpoint) is where visitors (clients) come in through the WebSocket tunnel.
* A **receptionist** (`clientInboundChannel`) takes every note visitors hand in.
* Notes addressed to **"/app/…"** go to **office workers** (your `@MessageMapping` methods). They read the note, do work, and may write a reply.
* Notes addressed to **"/topic/…"** or **"/queue/…"** go to the **mailroom** (the broker), which photocopies them to everyone who asked to receive that kind of note (subscribers).
* A **courier** (`clientOutboundChannel`) carries notes back out to visitors.
* The **intercom** (`SimpMessagingTemplate`) lets anyone in the building (a REST controller, a scheduled job) drop a note into the mailroom.

---

## 5.2 Dependencies

**Maven:**
```xml
<dependency>
  <groupId>org.springframework.boot</groupId>
  <artifactId>spring-boot-starter-websocket</artifactId>
</dependency>

<!-- Only if you use an external broker relay (RabbitMQ/ActiveMQ).
     Spring's reference docs say: add io.projectreactor.netty:reactor-netty and io.netty:netty-all -->
<dependency>
  <groupId>io.projectreactor.netty</groupId>
  <artifactId>reactor-netty</artifactId>
</dependency>
<dependency>
  <groupId>io.netty</groupId>
  <artifactId>netty-all</artifactId>
</dependency>

<!-- Optional: security for messages -->
<dependency>
  <groupId>org.springframework.boot</groupId>
  <artifactId>spring-boot-starter-security</artifactId>
</dependency>
<dependency>
  <groupId>org.springframework.security</groupId>
  <artifactId>spring-security-messaging</artifactId>
</dependency>

<!-- Optional: @Valid on payloads -->
<dependency>
  <groupId>org.springframework.boot</groupId>
  <artifactId>spring-boot-starter-validation</artifactId>
</dependency>
```

**Gradle:**
```groovy
implementation 'org.springframework.boot:spring-boot-starter-websocket'
implementation 'io.projectreactor.netty:reactor-netty'                        // relay only
implementation 'io.netty:netty-all'                                          // relay only
implementation 'org.springframework.security:spring-security-messaging'       // security
```

`spring-boot-starter-websocket` brings `spring-websocket` + `spring-messaging` + an embedded servlet container with WebSocket support (Tomcat by default).

> Note: Spring's STOMP support is part of the **Servlet stack** (Spring MVC). **Spring WebFlux** has a
> reactive `WebSocketHandler` API but **no built-in STOMP broker/annotation support**. On WebFlux you
> handle raw WebSocket messages yourself, or consider RSocket.

---

## 5.3 The minimal working configuration

```java
package com.example.realtime.config;

import org.springframework.context.annotation.Configuration;
import org.springframework.messaging.simp.config.MessageBrokerRegistry;
import org.springframework.web.socket.config.annotation.EnableWebSocketMessageBroker;
import org.springframework.web.socket.config.annotation.StompEndpointRegistry;
import org.springframework.web.socket.config.annotation.WebSocketMessageBrokerConfigurer;

@Configuration
@EnableWebSocketMessageBroker            // turns on STOMP over WebSocket + message broker infrastructure
public class WebSocketConfig implements WebSocketMessageBrokerConfigurer {

    @Override
    public void registerStompEndpoints(StompEndpointRegistry registry) {
        registry.addEndpoint("/ws")                         // HTTP URL for the WebSocket handshake
                .setAllowedOriginPatterns("https://*.example.com", "http://localhost:[*]");
        // .withSockJS();  // optional: add SockJS fallback (then clients use http(s)://host/ws)
    }

    @Override
    public void configureMessageBroker(MessageBrokerRegistry registry) {
        registry.setApplicationDestinationPrefixes("/app"); // client SEND to /app/** → @MessageMapping
        registry.enableSimpleBroker("/topic", "/queue");    // in-memory broker handles /topic/** and /queue/**
        registry.setUserDestinationPrefix("/user");         // default is "/user"
    }
}
```

What each piece means:

| Code | Meaning |
|------|---------|
| `@EnableWebSocketMessageBroker` | Registers all beans: channels, handlers, broker, `SimpMessagingTemplate`, etc. (via `DelegatingWebSocketMessageBrokerConfiguration`) |
| `addEndpoint("/ws")` | Clients connect to `ws(s)://host:port/<context-path>/ws` |
| `setAllowedOrigins` / `setAllowedOriginPatterns` | Which `Origin` headers are accepted. **Default is same-origin only** (since Spring 4.1.5). Wildcard `*` with `setAllowedOrigins` is not allowed together with credentials in newer versions; use patterns |
| `withSockJS()` | Enables SockJS fallback transports (Chapter 6) |
| `setApplicationDestinationPrefixes("/app")` | Messages whose destination starts with `/app` go to **annotated controller methods** |
| `enableSimpleBroker("/topic","/queue")` | Messages (and subscriptions) to these prefixes go to the **in-memory broker** |
| `setUserDestinationPrefix("/user")` | Destinations starting with `/user` are **translated** to per-session destinations (§5.10) |

---

## 5.4 The architecture: channels and handlers

This diagram is the most important thing in the chapter. Learn to draw it from memory.

### 5.4.1 With the simple (in-memory) broker

```
                                 ┌───────────────────────────────┐
  WebSocket   ┌──────────────┐   │  SimpAnnotationMethod         │
  client ────►│ request      │──►│  MessageHandler               │──┐  return value /
  (STOMP)     │ channel      │   │  (@MessageMapping methods)    │  │  SimpMessagingTemplate
              │ "clientIn-   │   └───────────────────────────────┘  │
              │  bound-      │   /app/**                            ▼
              │  Channel"    │                              ┌──────────────┐
              │              │──────────────────────────────►│ brokerChannel│
              │              │   /topic/**, /queue/**        └──────┬───────┘
              │              │   (SUBSCRIBE, SEND direct)           │
              └──────────────┘                                      ▼
                     │                              ┌───────────────────────────┐
                     │  /user/**                    │ SimpleBrokerMessageHandler│
                     └──►UserDestinationMessage     │ (in-memory subscriptions) │
                         Handler ─► brokerChannel   └────────────┬──────────────┘
                                                                 │
              ┌──────────────┐                                   │
  client ◄────│ response     │◄──────────────────────────────────┘
              │ channel      │
              │ "clientOut-  │
              │  boundChannel│
              └──────────────┘
```

### 5.4.2 With an external broker (STOMP broker relay)

```
 client ──► clientInboundChannel ──► SimpAnnotationMethodMessageHandler ──► brokerChannel
                     │                                                         │
                     │ /topic/**, /queue/**                                    ▼
                     └────────────────────────────────────────► StompBrokerRelayMessageHandler
                                                                   │   ▲   (one TCP connection
                                                                   ▼   │    per client session,
                                                         RabbitMQ / ActiveMQ    + 1 "system" connection)
 client ◄── clientOutboundChannel ◄───────────────────────────────────┘
```

### 5.4.3 The three channels

| Channel bean | Carries | Default executor |
|--------------|---------|------------------|
| `clientInboundChannel` | Messages **from** WebSocket clients | Thread pool; core size = 2 × available processors |
| `clientOutboundChannel` | Messages **to** WebSocket clients | Thread pool; core size = 2 × available processors |
| `brokerChannel` | Messages from server-side application code **to** the broker | Configurable via `configureBrokerChannel` |

### 5.4.4 The main beans (names you'll see in logs and stack traces)

| Bean / class | Job |
|--------------|-----|
| `SubProtocolWebSocketHandler` | The `WebSocketHandler` registered at `/ws`. Delegates to sub-protocol handlers. Manages sessions, decorates them with `ConcurrentWebSocketSessionDecorator` (send limits) |
| `StompSubProtocolHandler` | Decodes WebSocket messages into STOMP `Message`s (with `StompDecoder`/`BufferingStompDecoder`), sends them to `clientInboundChannel`; encodes outbound messages (`StompEncoder`) |
| `SimpAnnotationMethodMessageHandler` | Finds and invokes `@MessageMapping`/`@SubscribeMapping` methods for `/app/**` |
| `SimpleBrokerMessageHandler` | In-memory broker: keeps a subscription registry (`DefaultSubscriptionRegistry`), fans out messages |
| `StompBrokerRelayMessageHandler` | Forwards messages to an external STOMP broker over TCP (Reactor Netty) |
| `UserDestinationMessageHandler` | Translates `/user/...` destinations to unique session destinations |
| `SimpMessagingTemplate` (`brokerMessagingTemplate`) | Send to the broker from anywhere |
| `DefaultSimpUserRegistry` | Tracks connected users and their sessions/subscriptions |
| `WebSocketMessageBrokerStats` | Periodically logs stats (every 30 min by default) |

### 5.4.5 Spring's message abstraction (spring-messaging)

```java
public interface Message<T> {
    T getPayload();            // byte[] from the wire, or your object after conversion
    MessageHeaders getHeaders(); // immutable map: simpMessageType, simpSessionId, simpDestination,
                                 // nativeHeaders (the raw STOMP headers), simpUser, ...
}
```

* **`MessageChannel`**: `send(Message)`. **`SubscribableChannel`**: has subscribers (`MessageHandler`s). `ExecutorSubscribableChannel` invokes them on a thread pool.
* **`MessageHeaderAccessor`** family helps read/write headers: `SimpMessageHeaderAccessor` (generic), `StompHeaderAccessor` (STOMP specifics like command, native headers, login).
* **Native headers** = the real STOMP headers (`Authorization`, `destination`, custom ones), stored under `nativeHeaders`. Access with `accessor.getFirstNativeHeader("Authorization")`.
* **`SimpMessageType`**: `CONNECT`, `CONNECT_ACK`, `MESSAGE`, `SUBSCRIBE`, `UNSUBSCRIBE`, `HEARTBEAT`, `DISCONNECT`, `DISCONNECT_ACK`, `OTHER`.

### 5.4.6 Follow one message end-to-end

1. Browser sends `SEND destination:/app/chat.send` with JSON body.
2. Tomcat receives the WebSocket text message → `SubProtocolWebSocketHandler.handleMessage`.
3. `StompSubProtocolHandler` decodes STOMP → `Message<byte[]>` with headers (`simpSessionId`, `simpUser`, `simpDestination=/app/chat.send`).
4. Sent to **`clientInboundChannel`** (interceptors run: your auth interceptor, Spring Security's authorization).
5. A thread from the inbound pool delivers it to `SimpAnnotationMethodMessageHandler` (destination starts with `/app`), which strips `/app` and matches `@MessageMapping("chat.send")` (or `/chat.send`).
6. Payload converted from JSON → `ChatMessage` via `MessageConverter` (Jackson).
7. Your method returns `ChatMessage`; `SendToMethodReturnValueHandler` sends it to **`brokerChannel`** with destination from `@SendTo`, or the default `/topic/chat.send`.
8. `SimpleBrokerMessageHandler` finds sessions subscribed to that destination and, for each, sends a `MESSAGE` to **`clientOutboundChannel`**.
9. `StompSubProtocolHandler` encodes to a STOMP MESSAGE frame → WebSocket text message → browser.

---

## 5.5 Annotated controllers

```java
@Controller
public class ChatController {

    @MessageMapping("/chat.send")            // client sends to /app/chat.send
    @SendTo("/topic/chat.public")            // broadcast result to all subscribers
    public ChatMessage send(@Payload @Valid ChatMessage msg, Principal principal) {
        return msg.withSender(principal.getName()).withTimestamp(Instant.now());
    }
}
```

### 5.5.1 `@MessageMapping`
* Maps messages by **destination** (after the application prefix is removed).
* Can be on the class (prefix) and on methods.
* Supports Ant-style patterns (`/chat.*`, `/rooms/**`) and template variables (`/rooms/{roomId}`) read with `@DestinationVariable`.
* Default path separator is `/`. To use dots (`chat.room.1`, common with RabbitMQ), configure `registry.setPathMatcher(new AntPathMatcher("."))`.
* Message-handling methods are invoked on the **inbound channel thread pool**, concurrently. They must be **thread-safe** (no mutable shared state without synchronisation).

### 5.5.2 Supported method arguments

| Argument | What you get |
|----------|--------------|
| `Message<?>` | Full message |
| `MessageHeaders` | All headers |
| `MessageHeaderAccessor`, `SimpMessageHeaderAccessor`, `StompHeaderAccessor` | Typed header access |
| `@Payload` (optional annotation) | Converted body; supports `@Valid`/`@Validated` |
| `@Header("name")` | One header. Spring looks in the top-level message headers first and then in the native STOMP headers, so `@Header("Authorization")` finds a STOMP header sent by the client |
| `@Headers Map<String,Object>` | All headers |
| `@DestinationVariable` | Value from destination template `{var}` |
| `java.security.Principal` | Authenticated user from the WebSocket session |

Session id: `@Header("simpSessionId") String sessionId` or `SimpMessageHeaderAccessor#getSessionId()`.
Session attributes: `SimpMessageHeaderAccessor#getSessionAttributes()` (a per-WebSocket-session `Map`, filled by handshake interceptors or your code).

### 5.5.3 Return values

| Situation | Where the return value goes |
|-----------|----------------------------|
| `@MessageMapping`, no `@SendTo` | `brokerChannel`, destination = **`/topic` + input destination** (e.g., `/app/greet` → `/topic/greet`) |
| `@SendTo("/topic/x")` | `brokerChannel` to `/topic/x` (supports `{var}` placeholders from the destination) |
| `@SendToUser("/queue/x")` | The current user's `/user/queue/x` (all their sessions, unless `broadcast = false` → only the session that sent the message) |
| `void` / `null` | Nothing sent |
| `CompletableFuture`/`ListenableFuture`/reactive types | Sent when completed (async) |

`@SendTo` and `@SendToUser` can also be placed on the class (they then apply to all methods in it), and a method-level annotation overrides a class-level one.

### 5.5.4 `@SubscribeMapping`: request/reply on subscribe

```java
@SubscribeMapping("/rooms")         // client SUBSCRIBEs to /app/rooms
public List<Room> listRooms() {      // return value goes DIRECTLY back to that client (clientOutboundChannel)
    return roomService.findAll();    // not through the broker, not to other subscribers
}
```

* Handles only `SUBSCRIBE` frames whose destination matches.
* The return value is sent **once, only to the subscribing client**, unless `@SendTo`/`@SendToUser` is present.
* The broker does not store this subscription (it's under `/app`, not a broker prefix).
* Classic use: **load initial data** when the UI subscribes. Unsubscribing is unnecessary but harmless.

### 5.5.5 Exception handling

```java
@Controller
public class ChatController {

    @MessageMapping("/chat.send")
    public void send(@Payload @Valid ChatMessage msg) { ... }

    @MessageExceptionHandler
    @SendToUser(destinations = "/queue/errors", broadcast = false)
    public ErrorDto handle(MethodArgumentNotValidException ex) {
        return new ErrorDto("VALIDATION_FAILED", ex.getMessage());
    }
}

// Global (since Spring 5.3): @ControllerAdvice also applies to @MessageExceptionHandler
@ControllerAdvice
public class GlobalWsExceptionHandler {
    @MessageExceptionHandler(AccessDeniedException.class)
    @SendToUser(destinations = "/queue/errors", broadcast = false)
    public ErrorDto accessDenied(AccessDeniedException ex) {
        return new ErrorDto("FORBIDDEN", "You can't do that");
    }
}
```

* `MethodArgumentNotValidException` here is **`org.springframework.messaging.handler.annotation.support.MethodArgumentNotValidException`**, not the MVC one (a common import mistake).
* Exceptions **not** handled by a `@MessageExceptionHandler` are logged and **the client receives nothing**. Silent failures are a classic bug.
* Exceptions thrown in **interceptors** on `clientInboundChannel` (e.g., auth failure on CONNECT) become a STOMP **ERROR frame** and the connection closes. Customise with `StompSubProtocolErrorHandler` (§5.13).

### 5.5.6 Validation
With `spring-boot-starter-validation` on the classpath, `@Payload @Valid ChatMessage msg` validates using
Bean Validation (`@NotBlank`, `@Size(max = 2000)`...). You can also provide a validator via
`WebSocketMessageBrokerConfigurer#getValidator()`.

---

## 5.6 Sending from anywhere: `SimpMessagingTemplate`

```java
@Service
@RequiredArgsConstructor
public class OrderNotifier {

    private final SimpMessagingTemplate messaging;   // or SimpMessageSendingOperations

    public void orderShipped(Order order) {
        // broadcast to everyone watching this order
        messaging.convertAndSend("/topic/orders." + order.getId(), OrderEvent.shipped(order));

        // private to the owner (all their sessions)
        messaging.convertAndSendToUser(order.getOwnerUsername(), "/queue/notifications",
                new Notification("Your order shipped!"));

        // with custom STOMP headers (they become MESSAGE headers)
        messaging.convertAndSend("/topic/orders." + order.getId(), OrderEvent.shipped(order),
                Map.of("event-type", "ORDER_SHIPPED", "correlation-id", order.getTraceId()));
    }
}
```

* Works from REST controllers, `@Scheduled` jobs, Kafka listeners, `@TransactionalEventListener`s, etc.
* `convertAndSend` sends to **`brokerChannel`**, so the destination must be a **broker** destination (`/topic`, `/queue`) or a **user** destination. Sending to `/app/...` from the template does **not** invoke your `@MessageMapping` methods.
* Converts the payload using the configured `MessageConverter`s (Jackson JSON by default with Boot).
* `setUserDestinationPrefix` must match the registry's if you configure it manually (Boot/`@EnableWebSocketMessageBroker` wires it for you).

> **Pattern: send after commit.** If you notify inside a DB transaction and the transaction rolls back,
> clients received a lie. Publish domain events and send in `@TransactionalEventListener(phase = AFTER_COMMIT)`.

---

## 5.7 Destinations and patterns

```java
@Controller
@MessageMapping("rooms")
public class RoomController {

    @MessageMapping("{roomId}/send")                        // /app/rooms/42/send
    @SendTo("/topic/rooms.{roomId}")                         // placeholders resolved from destination vars
    public ChatMessage send(@DestinationVariable String roomId, ChatMessage msg) {
        return msg.inRoom(roomId);
    }
}
```

* **Simple broker subscription patterns:** the simple broker's `DefaultSubscriptionRegistry` matches subscriptions using the `PathMatcher`. Clients **can** subscribe to patterns like `/topic/prices.*` (with a dot-separator matcher), and senders publish to concrete destinations. Be careful: pattern subscriptions are matched for each message and can be abused (subscribe to `/topic/**` to see everything). Restrict with security rules.
* **Simple broker selector header:** the simple broker supports a `selector` header on SUBSCRIBE carrying a Spring Expression Language (SpEL) expression evaluated against message headers (e.g., `headers.foo == 'bar'`). The header name is configurable via `setSelectorHeaderName(...)` on the simple broker registration (pass `null` to turn the feature off). This feature was the source of **CVE-2018-1270** (remote code execution through a crafted selector, fixed in Spring 5.0.5 / 4.3.16 by evaluating with a restricted `SimpleEvaluationContext`). Turn it off if you don't use it, and keep Spring patched.
* **RabbitMQ** has its own destination grammar (Chapter 7). With RabbitMQ use `.` as separator in `/topic` routing keys.

---

## 5.8 Configuring the broker in detail

```java
@Configuration
@EnableWebSocketMessageBroker
public class WebSocketConfig implements WebSocketMessageBrokerConfigurer {

    @Bean
    public ThreadPoolTaskScheduler wsHeartbeatScheduler() {
        ThreadPoolTaskScheduler s = new ThreadPoolTaskScheduler();
        s.setPoolSize(1);
        s.setThreadNamePrefix("ws-heartbeat-");
        s.initialize();
        return s;
    }

    @Override
    public void configureMessageBroker(MessageBrokerRegistry registry) {
        registry.setApplicationDestinationPrefixes("/app");
        registry.setUserDestinationPrefix("/user");
        registry.setPathMatcher(new AntPathMatcher("."));       // optional: dot-separated destinations
        registry.setPreservePublishOrder(true);                 // ordered delivery per session (5.1+)
        registry.setCacheLimit(1024);                           // destination cache for the simple broker

        registry.enableSimpleBroker("/topic", "/queue")
                .setTaskScheduler(wsHeartbeatScheduler())       // REQUIRED for heart-beats to work
                .setHeartbeatValue(new long[] {10_000, 10_000}); // server can send every 10s, wants client every 10s
    }
}
```

**Heart-beat defaults for the simple broker:** `0,0` (disabled) unless a `TaskScheduler` is configured; once a scheduler is set, the default becomes `10000,10000`.

> **Pitfall: circular bean dependency.** Injecting a `TaskScheduler` bean that depends on the WebSocket
> configuration into the configurer can create a cycle. Defining a dedicated scheduler as shown, or using
> `@Lazy`, avoids it. (Spring's docs show `@Lazy TaskScheduler messageBrokerTaskScheduler` injection.)

### 5.8.1 External broker relay (production for clusters)

```java
@Override
public void configureMessageBroker(MessageBrokerRegistry registry) {
    registry.setApplicationDestinationPrefixes("/app");
    registry.setPathMatcher(new AntPathMatcher("."));
    registry.enableStompBrokerRelay("/topic", "/queue", "/exchange", "/amq/queue")
            .setRelayHost("rabbitmq.internal")
            .setRelayPort(61613)
            .setVirtualHost("/")                          // STOMP "host" header sent in CONNECT
            .setClientLogin("ws-client").setClientPasscode("***")   // used for each client session's connection
            .setSystemLogin("ws-system").setSystemPasscode("***")   // used for the shared "system" connection
            .setSystemHeartbeatSendInterval(10_000)
            .setSystemHeartbeatReceiveInterval(10_000)
            .setUserDestinationBroadcast("/topic/unresolved-user-destination")  // multi-instance user dests
            .setUserRegistryBroadcast("/topic/simp-user-registry");             // multi-instance user registry
    // .setTcpClient(customReactorNettyTcpClient) for multiple broker addresses / TLS
}
```

Full details in Chapter 7.

---

## 5.9 Transport and container configuration

```java
@Override
public void configureWebSocketTransport(WebSocketTransportRegistration registration) {
    registration
        .setMessageSizeLimit(128 * 1024)       // max inbound STOMP message size (default 64 KB)
        .setSendBufferSizeLimit(512 * 1024)    // max bytes buffered per session when client is slow (default 512 KB)
        .setSendTimeLimit(15 * 1000)           // max time for a single send to a session (default 10 s)
        .setTimeToFirstMessage(30 * 1000);     // close if no STOMP frame (CONNECT) arrives in time (default 60 s)
    // .addDecoratorFactory(handler -> new MyLoggingWebSocketHandlerDecorator(handler));
}
```

| Setting | Default | Meaning / when to change |
|---------|---------|--------------------------|
| `messageSizeLimit` | 64 KB | Larger inbound frames → session closed. STOMP frames split across multiple WebSocket messages are re-assembled up to this size. Raise if clients legitimately send bigger messages |
| `sendBufferSizeLimit` | 512 KB | If a client is slow, outbound messages queue per session. Exceeding the limit **closes the session** (or drops, depending on overflow strategy) |
| `sendTimeLimit` | 10 s | If one send blocks longer than this, the session is considered unreliable and closed |
| `timeToFirstMessage` | 60 s | Protects against clients that connect and never send CONNECT (resource exhaustion) |

**Container-level buffer sizes** (raw WebSocket messages):

```java
@Bean
public ServletServerContainerFactoryBean createWebSocketContainer() {
    ServletServerContainerFactoryBean container = new ServletServerContainerFactoryBean();
    container.setMaxTextMessageBufferSize(128 * 1024);
    container.setMaxBinaryMessageBufferSize(128 * 1024);
    container.setMaxSessionIdleTimeout(0L);   // ms; 0 = no container idle timeout (rely on heart-beats)
    return container;
}
```

> **Pitfall: two limits.** A message must pass **both** the container's per-message buffer (Tomcat's
> default text/binary buffer is **8 KB**; a single WebSocket message bigger than that is rejected with close
> code **1009**) **and** Spring's STOMP `messageSizeLimit` (64 KB, which applies after Spring re-assembles a
> STOMP frame that a client split across several WebSocket messages). "Works locally with small payloads, fails
> in prod with big JSON" is often this. Symptoms: close code **1009**, or the session is closed with a
> "message too big"/`StompConversionException` log line. Fix: raise both limits deliberately, or (better)
> keep messages small and fetch large data over HTTP.

---

## 5.10 User destinations: private messages explained

> **ELI5:** Everyone subscribes to the **same-looking** mailbox name `/user/queue/notifications`, but
> Spring secretly gives each person (each session) their **own** box behind the scenes, so nobody
> can read anyone else's mail.

### 5.10.1 How it works

**Client side:**
```js
client.subscribe('/user/queue/notifications', cb);
```

**Server side:**
```java
messaging.convertAndSendToUser("anna", "/queue/notifications", payload);
```

What happens:

1. On **SUBSCRIBE** to `/user/queue/notifications`, `UserDestinationMessageHandler` (via `DefaultUserDestinationResolver`) rewrites it to a **session-unique** destination: `/queue/notifications-user{sessionId}` (e.g., `/queue/notifications-userwmv3cnnv`). The broker stores *that* subscription.
2. `convertAndSendToUser("anna", "/queue/notifications", x)` sends to `/user/anna/queue/notifications`.
3. The resolver looks up **all sessions of user "anna"** in the `SimpUserRegistry` and sends to each `/queue/notifications-user{sessionId}`.
4. Each of anna's tabs/devices receives it; nobody else does.

Requirements & gotchas:
* The user is identified by **`Principal#getName()`**. If the session has **no Principal**, sending by username can't work (there's no name→session mapping). Set the user at handshake or CONNECT (Chapter 8).
* The name you pass to `convertAndSendToUser` must equal `principal.getName()` exactly. With JWT this is usually the `sub` claim. With OAuth2 resource server it's the `sub` by default unless you change `principalClaimName`. A mismatch (email vs id) = messages vanish silently.
* With **@SendToUser**, the current user is taken from the incoming message's Principal.
* **Multiple server instances:** sessions on other instances aren't in the local registry. Enable `userDestinationBroadcast` and `userRegistryBroadcast` on the broker relay (Chapter 7).
* With an external broker, each session-unique destination becomes a **broker queue** (e.g., RabbitMQ). Ensure they're auto-deleted when sessions end.

### 5.10.2 Sending to a specific session (no Principal needed)

```java
private MessageHeaders headersForSession(String sessionId) {
    SimpMessageHeaderAccessor accessor = SimpMessageHeaderAccessor.create(SimpMessageType.MESSAGE);
    accessor.setSessionId(sessionId);
    accessor.setLeaveMutable(true);
    return accessor.getMessageHeaders();
}

// The "user" argument is the session id itself:
messaging.convertAndSendToUser(sessionId, "/queue/reply", payload, headersForSession(sessionId));
```

Useful for anonymous users (e.g., a public support widget). The client still subscribes to `/user/queue/reply`.

### 5.10.3 `@SendToUser` broadcast vs single session

```java
@MessageMapping("/report.generate")
@SendToUser(destinations = "/queue/report", broadcast = false)  // only the tab that asked
public Report generate(ReportRequest req) { ... }
```

`broadcast = true` (default) → all sessions of that user (all tabs/devices).

---

## 5.11 Session lifecycle events

Spring publishes `ApplicationEvent`s you can listen to with `@EventListener`:

| Event | When |
|-------|------|
| `SessionConnectEvent` | A new STOMP CONNECT arrived (before the broker responds). Contains the CONNECT message incl. native headers, session id, user |
| `SessionConnectedEvent` | Broker replied CONNECTED (shortly after connect). Message is the CONNECTED (`CONNECT_ACK`), the original CONNECT is in header `simpConnectMessage` |
| `SessionSubscribeEvent` | A SUBSCRIBE arrived |
| `SessionUnsubscribeEvent` | An UNSUBSCRIBE arrived |
| `SessionDisconnectEvent` | The STOMP session ended: DISCONNECT frame **or** WebSocket closed. **May be published more than once per session** → handlers must be idempotent. Has `getCloseStatus()` |
| `BrokerAvailabilityEvent` | Broker became available/unavailable (important for relay: TCP to RabbitMQ lost) |

```java
@Component
@RequiredArgsConstructor
@Slf4j
public class PresenceTracker {

    private final SimpMessagingTemplate messaging;
    private final Map<String, String> sessionToUser = new ConcurrentHashMap<>();

    @EventListener
    public void onConnected(SessionConnectedEvent event) {
        StompHeaderAccessor acc = StompHeaderAccessor.wrap(event.getMessage());
        Principal user = event.getUser();
        if (user != null) {
            sessionToUser.put(acc.getSessionId(), user.getName());
            messaging.convertAndSend("/topic/presence", new Presence(user.getName(), true));
        }
    }

    @EventListener
    public void onDisconnect(SessionDisconnectEvent event) {
        String username = sessionToUser.remove(event.getSessionId());   // idempotent: second call gets null
        if (username != null && !sessionToUser.containsValue(username)) { // last session of this user
            messaging.convertAndSend("/topic/presence", new Presence(username, false));
        }
        log.info("Disconnected session={} status={}", event.getSessionId(), event.getCloseStatus());
    }
}
```

> **Pitfall:** Events are published **synchronously** on the thread that handles the message/close. Don't
> do slow work (DB calls, HTTP calls) directly in listeners. Hand off with `@Async` or a queue.
> In a **cluster**, local in-memory presence maps are wrong; use Redis or the multi-server user registry.

**Connected users:** inject `SimpUserRegistry`:
```java
int online = simpUserRegistry.getUserCount();
SimpUser anna = simpUserRegistry.getUser("anna");           // sessions & subscriptions
Set<SimpSubscription> subs = simpUserRegistry.findSubscriptions(s -> s.getDestination().startsWith("/topic/rooms."));
```

---

## 5.12 Interceptors

### 5.12.1 `HandshakeInterceptor` (HTTP level, before 101)

```java
public class TenantHandshakeInterceptor implements HandshakeInterceptor {
    @Override
    public boolean beforeHandshake(ServerHttpRequest request, ServerHttpResponse response,
                                   WebSocketHandler wsHandler, Map<String, Object> attributes) {
        String tenant = request.getHeaders().getFirst("X-Tenant-Id");      // from proxy, or query param
        if (tenant == null) { response.setStatusCode(HttpStatus.BAD_REQUEST); return false; } // reject
        attributes.put("tenantId", tenant);   // becomes WebSocket session attribute (SimpMessageHeaderAccessor#getSessionAttributes)
        return true;
    }
    @Override
    public void afterHandshake(ServerHttpRequest req, ServerHttpResponse res, WebSocketHandler h, Exception ex) {}
}

registry.addEndpoint("/ws")
        .addInterceptors(new TenantHandshakeInterceptor(), new HttpSessionHandshakeInterceptor())
        .setHandshakeHandler(new CustomPrincipalHandshakeHandler());
```

* `HttpSessionHandshakeInterceptor` copies `HttpSession` attributes into WebSocket session attributes.
* **`DefaultHandshakeHandler#determineUser`** can be overridden to assign a `Principal` at handshake time (e.g., generate an anonymous UUID principal so user destinations work for guests):

```java
public class CustomPrincipalHandshakeHandler extends DefaultHandshakeHandler {
    @Override
    protected Principal determineUser(ServerHttpRequest request, WebSocketHandler wsHandler,
                                      Map<String, Object> attributes) {
        Principal user = request.getPrincipal();   // from Spring Security if the handshake was authenticated
        return user != null ? user : new AnonymousPrincipal(UUID.randomUUID().toString());
    }
}
```

### 5.12.2 `ChannelInterceptor` (STOMP level, every message)

```java
public class LoggingAndAuthInterceptor implements ChannelInterceptor {

    @Override
    public Message<?> preSend(Message<?> message, MessageChannel channel) {
        StompHeaderAccessor acc = MessageHeaderAccessor.getAccessor(message, StompHeaderAccessor.class);
        if (acc == null) return message;
        if (StompCommand.CONNECT.equals(acc.getCommand())) {
            // authenticate using native header; acc.setUser(...) (see Chapter 8)
        }
        return message;          // return null to silently drop; throw to reject (→ ERROR frame for inbound)
    }

    @Override
    public void afterSendCompletion(Message<?> message, MessageChannel channel, boolean sent, Exception ex) {
        // metrics, cleanup (e.g., clear ThreadLocal / MDC)
    }
}

@Override
public void configureClientInboundChannel(ChannelRegistration registration) {
    registration.interceptors(new LoggingAndAuthInterceptor());
    registration.taskExecutor().corePoolSize(8).maxPoolSize(32).queueCapacity(10_000);
}

@Override
public void configureClientOutboundChannel(ChannelRegistration registration) {
    registration.taskExecutor().corePoolSize(8).maxPoolSize(32);
}
```

Key details:
* Use **`MessageHeaderAccessor.getAccessor(message, StompHeaderAccessor.class)`** to get the **mutable** accessor of the message. `StompHeaderAccessor.wrap(message)` creates a **copy**; changes to a copy (like `setUser`) are lost unless you build a new message. "My `setUser` doesn't stick" is this bug.
* `preSend` runs on the **caller's thread** (for inbound: the WebSocket container's I/O thread), before the message is handed to the executor. `ExecutorChannelInterceptor#beforeHandle/afterMessageHandled` run on the executor thread (where your controller runs) and are the right place for `ThreadLocal`s like `SecurityContextHolder`, MDC logging context, tenant context.
* Interceptor **order** matters (your auth interceptor must run before Spring Security's authorization). See Chapter 8.

---

## 5.13 Customising STOMP ERROR frames

```java
public class CustomStompErrorHandler extends StompSubProtocolErrorHandler {
    @Override
    public Message<byte[]> handleClientMessageProcessingError(Message<byte[]> clientMessage, Throwable ex) {
        Throwable cause = ex.getCause() != null ? ex.getCause() : ex;
        if (cause instanceof AccessDeniedException || cause instanceof BadCredentialsException) {
            StompHeaderAccessor acc = StompHeaderAccessor.create(StompCommand.ERROR);
            acc.setMessage("UNAUTHORIZED");               // ERROR frame "message" header
            acc.setLeaveMutable(true);
            return MessageBuilder.createMessage("Invalid or expired token".getBytes(StandardCharsets.UTF_8),
                                                acc.getMessageHeaders());
        }
        return super.handleClientMessageProcessingError(clientMessage, ex);
    }
}

@Override
public void registerStompEndpoints(StompEndpointRegistry registry) {
    registry.addEndpoint("/ws").setAllowedOriginPatterns("https://*.example.com");
    registry.setErrorHandler(new CustomStompErrorHandler());
}
```

Never put stack traces or internal details into ERROR frames (information leak).

---

## 5.14 Message ordering

By default the inbound and outbound channels use thread pools, so **messages from/to the same client can be
processed out of order**. Options:

* `registry.setPreservePublishOrder(true)` (`MessageBrokerRegistry`, 5.1+): messages published **to the same client session** from the broker are sent **in order** (one at a time per session). Small performance cost.
* `registry.setPreserveReceiveOrder(true)` (`StompEndpointRegistry`, 6.1+): messages **from the same client session** are handed to the inbound channel in order.
* Without these, if order matters, add a sequence number to messages and reorder/ignore stale ones on the client.

---

## 5.15 Message converters

Spring Boot auto-configures JSON conversion with Boot's Jackson `ObjectMapper` (so your `spring.jackson.*`
settings and modules like `JavaTimeModule` apply).

```java
@Override
public boolean configureMessageConverters(List<MessageConverter> messageConverters) {
    // Add custom converters (e.g., protobuf). Return true to also add the default converters; false to use only yours.
    messageConverters.add(new MyProtobufMessageConverter());
    return true;
}
```

Defaults (when not using Boot's customization): `StringMessageConverter`, `ByteArrayMessageConverter`, and a Jackson JSON converter if Jackson is present. The Jackson 2 converter is `MappingJackson2MessageConverter`, which is **deprecated for removal since Spring Framework 7.0**. Its Jackson 3 replacement is **`JacksonJsonMessageConverter` (since 7.0)**. On Spring 6.x / Boot 3.x keep using `MappingJackson2MessageConverter`; on Spring 7 / Boot 4 use `JacksonJsonMessageConverter`.

Conversion is chosen by the `content-type` header. **Clients should send `content-type:application/json`** for JSON payloads (stompjs doesn't add it automatically). Without it Spring still attempts conversion with the available converters, and the behaviour can surprise you (e.g., the target type is `String` and you get raw JSON).

---

## 5.16 Monitoring: `WebSocketMessageBrokerStats`

Spring logs a line like this every 30 minutes (INFO, category `org.springframework.web.socket.config.WebSocketMessageBrokerStats`):

```
WebSocketSession[11 current WS(5)-HttpStream(6)-HttpPoll(0), 372 total, 0 closed abnormally
(0 connect failure, 0 send limit, 0 transport error)], stompSubProtocol[processed CONNECT(302)-CONNECTED(221)-DISCONNECT(0)],
stompBrokerRelay[null], inboundChannel[pool size = 8, active threads = 0, queued tasks = 0, completed tasks = 5862],
outboundChannel[pool size = 8, active threads = 0, queued tasks = 0, completed tasks = 3218],
sockJsScheduler[pool size = 4, active threads = 0, queued tasks = 0, completed tasks = 27]
```

How to read it:
* `closed abnormally (... send limit ...)` → slow clients exceeding `sendBufferSizeLimit`/`sendTimeLimit`.
* `connect failure` → sessions closed before CONNECTED (timeouts, auth failures).
* `queued tasks` growing on inbound/outbound → thread pool saturated (slow controllers or slow clients).
* Change the frequency with `stats.setLoggingPeriod(ms)`. Expose numbers to Prometheus via Micrometer gauges you register yourself (Chapter 9).

---

## 5.17 Plain WebSocket in Spring (without STOMP), for completeness

```java
@Configuration
@EnableWebSocket
public class RawWsConfig implements WebSocketConfigurer {
    @Override
    public void registerWebSocketHandlers(WebSocketHandlerRegistry registry) {
        registry.addHandler(new EchoHandler(), "/raw").setAllowedOriginPatterns("https://*.example.com");
    }
}

public class EchoHandler extends TextWebSocketHandler {
    @Override public void afterConnectionEstablished(WebSocketSession s) { }
    @Override protected void handleTextMessage(WebSocketSession s, TextMessage m) throws IOException {
        s.sendMessage(new TextMessage("echo: " + m.getPayload()));
    }
    @Override public void afterConnectionClosed(WebSocketSession s, CloseStatus status) { }
}
```

* `WebSocketSession.sendMessage` is **not thread-safe** for concurrent sends. Wrap with `ConcurrentWebSocketSessionDecorator` if multiple threads send to the same session ("TEXT_PARTIAL_WRITING" / `IllegalStateException: The remote endpoint was in state [TEXT_PARTIAL_WRITING]` is the classic Tomcat symptom).
* Jakarta WebSocket (JSR 356) `@ServerEndpoint` also works but doesn't integrate with Spring messaging.
* When to choose raw over STOMP: custom binary protocols, game loops, proxies, or very high-frequency data where STOMP's text overhead matters.

---

## 5.18 Complete example: a real-time to-do list server

A realistic feature: users share to-do lists; changes appear live on all members' devices.

```java
// --- DTOs ---
public record TodoItem(String id, String listId, String title, boolean done, long version) {}
public record TodoEvent(String type, TodoItem item, String actor, Instant at) {}       // type: CREATED/UPDATED/DELETED
public record TodoCommand(@NotBlank String listId, String itemId, @Size(max = 500) String title, Boolean done,
                          Long expectedVersion, @NotBlank String clientRequestId) {}
public record ErrorDto(String code, String message, String clientRequestId) {}

// --- Config ---
@Configuration
@EnableWebSocketMessageBroker
public class WsConfig implements WebSocketMessageBrokerConfigurer {
    @Override
    public void registerStompEndpoints(StompEndpointRegistry r) {
        r.addEndpoint("/ws").setAllowedOriginPatterns("https://app.example.com", "http://localhost:[*]");
    }
    @Override
    public void configureMessageBroker(MessageBrokerRegistry r) {
        r.setApplicationDestinationPrefixes("/app");
        r.enableSimpleBroker("/topic", "/queue")
         .setTaskScheduler(heartbeatScheduler())
         .setHeartbeatValue(new long[]{10_000, 10_000});
        r.setPreservePublishOrder(true);
    }
    @Bean ThreadPoolTaskScheduler heartbeatScheduler() {
        var s = new ThreadPoolTaskScheduler(); s.setPoolSize(1); s.setThreadNamePrefix("wss-hb-"); s.initialize(); return s;
    }
}

// --- Controller ---
@Controller
@RequiredArgsConstructor
public class TodoWsController {
    private final TodoService todos;
    private final ListAccessService access;

    /** Initial snapshot when the client subscribes to /app/lists/{listId} */
    @SubscribeMapping("/lists/{listId}")
    public List<TodoItem> snapshot(@DestinationVariable String listId, Principal user) {
        access.requireMember(user.getName(), listId);
        return todos.findByList(listId);
    }

    /** Client sends to /app/todos.upsert */
    @MessageMapping("/todos.upsert")
    public void upsert(@Payload @Valid TodoCommand cmd, Principal user) {
        access.requireMember(user.getName(), cmd.listId());
        todos.upsert(cmd, user.getName());           // publishes TodoChanged domain event; idempotent by clientRequestId
    }

    @MessageExceptionHandler({OptimisticLockingFailureException.class})
    @SendToUser(destinations = "/queue/errors", broadcast = false)
    public ErrorDto conflict(OptimisticLockingFailureException ex) {
        return new ErrorDto("CONFLICT", "Item changed by someone else, please refresh", null);
    }
}

// --- Fan-out after DB commit ---
@Component
@RequiredArgsConstructor
public class TodoBroadcaster {
    private final SimpMessagingTemplate messaging;

    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void on(TodoChanged e) {
        messaging.convertAndSend("/topic/lists." + e.item().listId(),
                new TodoEvent(e.type(), e.item(), e.actor(), Instant.now()));
    }
}
```

Client flow (Chapter 6 has the code):
1. Connect with JWT in CONNECT headers.
2. `subscribe('/topic/lists.L1')` for live changes **and** `subscribe('/app/lists/L1')` for the snapshot. Subscribe to the topic **first** so no change is missed between snapshot and live stream, and use `version` to discard stale events.
3. `subscribe('/user/queue/errors')`.
4. `publish('/app/todos.upsert', {...clientRequestId})` and optimistically update the UI; reconcile when the event arrives.

Security note: authorise **subscriptions** to `/topic/lists.{id}` (only members!), see Chapter 8.

---

## 5.19 Chapter summary

* `@EnableWebSocketMessageBroker` + `WebSocketMessageBrokerConfigurer`: endpoints, broker, prefixes, channels, transport, converters.
* Three channels (inbound, outbound, broker), and messages flow through handlers: annotation handler (`/app`), broker (`/topic`, `/queue`), user destination handler (`/user`).
* `@MessageMapping`, `@SubscribeMapping`, `@SendTo`, `@SendToUser`, `@MessageExceptionHandler`, `@DestinationVariable`, `Principal`.
* `SimpMessagingTemplate` sends to the broker from anywhere. `convertAndSendToUser` resolves user → sessions.
* Heart-beats with the simple broker need a `TaskScheduler`.
* Transport limits: 64 KB message, 512 KB send buffer, 10 s send time, 60 s time to first message (defaults).
* Ordering requires `setPreservePublishOrder` / `setPreserveReceiveOrder`.
* Events (`SessionConnectedEvent`, `SessionDisconnectEvent`...) for presence; disconnect may fire twice.

Next: [Chapter 6: Clients](06-clients.md)
