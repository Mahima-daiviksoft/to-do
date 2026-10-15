# Chapter 10: Testing, Debugging & the Bug Encyclopedia

> **Goal:** test real-time features confidently, debug any problem methodically, and look up any symptom
> to find its cause and fix. Keep this chapter open during incidents.

---

## 10.1 ELI5

When the telephone doesn't work, you don't randomly shake it. You check, **in order**: Is it plugged in?
Is there a dial tone? Did the other person pick up? Are you speaking the same language? Did they hear you?
Debugging WebSocket/STOMP is the same: check **layer by layer, from bottom to top**.

---

## 10.2 Testing strategy (the pyramid)

| Level | What | Tools |
|-------|------|-------|
| Unit | Controller methods, services, interceptors, converters | JUnit, Mockito |
| Slice/integration | Full Spring context + real WebSocket + STOMP client | `@SpringBootTest(webEnvironment = RANDOM_PORT)`, `WebSocketStompClient`, Awaitility |
| Broker integration | Relay with a real RabbitMQ | Testcontainers |
| Front-end unit | Hooks/components with a mocked STOMP client | Jest/Vitest, mock client |
| End-to-end | Two browsers see each other's updates | Playwright/Cypress (two contexts) |
| Contract | Message schemas stay compatible | JSON Schema / AsyncAPI validation in CI |
| Load/soak/chaos | Capacity, leaks, resilience | k6, Gatling, pod-kill scripts |

### 10.2.1 Unit testing a controller (no WebSocket at all)

```java
class TodoWsControllerTest {
    TodoService todos = mock(TodoService.class);
    ListAccessService access = mock(ListAccessService.class);
    TodoWsController controller = new TodoWsController(todos, access);

    @Test
    void upsertChecksMembershipAndDelegates() {
        Principal anna = () -> "anna";
        TodoCommand cmd = new TodoCommand("L1", null, "Buy milk", false, null, "req-1");
        controller.upsert(cmd, anna);
        verify(access).requireMember("anna", "L1");
        verify(todos).upsert(cmd, "anna");
    }
}
```

### 10.2.2 Unit testing an interceptor (build STOMP messages by hand)

```java
@Test
void rejectsSubscriptionToForeignList() {
    ListAccessService access = mock(ListAccessService.class);
    when(access.isMember("anna", "L2")).thenReturn(false);
    SubscriptionGuard guard = new SubscriptionGuard(access);

    StompHeaderAccessor acc = StompHeaderAccessor.create(StompCommand.SUBSCRIBE);
    acc.setDestination("/topic/lists.L2");
    acc.setSubscriptionId("sub-0");
    acc.setSessionId("s1");
    acc.setUser(() -> "anna");
    acc.setLeaveMutable(true);                                    // so getAccessor(...) works inside the interceptor
    Message<byte[]> msg = MessageBuilder.createMessage(new byte[0], acc.getMessageHeaders());

    assertThrows(AccessDeniedException.class, () -> guard.preSend(msg, mock(MessageChannel.class)));
}
```

### 10.2.3 Full integration test with a real STOMP client

```java
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class ChatIntegrationTest {

    @LocalServerPort int port;
    @Autowired TestTokens tokens;            // helper that mints JWTs signed with the test key

    WebSocketStompClient stompClient;

    @BeforeEach
    void setup() {
        stompClient = new WebSocketStompClient(new StandardWebSocketClient());
        stompClient.setMessageConverter(new MappingJackson2MessageConverter());
    }

    @AfterEach
    void tearDown() { stompClient.stop(); }

    private StompSession connect(String user) throws Exception {
        StompHeaders h = new StompHeaders();
        h.add("Authorization", "Bearer " + tokens.forUser(user));
        return stompClient.connectAsync("ws://localhost:" + port + "/ws", new WebSocketHttpHeaders(), h,
                new StompSessionHandlerAdapter() {}).get(5, TimeUnit.SECONDS);
    }

    @Test
    void messageIsBroadcastToRoom() throws Exception {
        BlockingQueue<ChatMessage> received = new LinkedBlockingQueue<>();
        StompSession bob = connect("bob");
        bob.subscribe("/topic/chat.public", new StompFrameHandler() {
            public Type getPayloadType(StompHeaders headers) { return ChatMessage.class; }
            public void handleFrame(StompHeaders headers, Object payload) { received.add((ChatMessage) payload); }
        });

        // Make sure the SUBSCRIBE has been processed before sending (avoid race): use a receipt
        // or a small await. Receipts need setTaskScheduler on the client and broker support.
        Thread.sleep(200);   // simplest; prefer receipts or polling a /app/ping round-trip

        StompSession anna = connect("anna");
        anna.send("/app/chat.send", new ChatMessage(null, "hello"));

        ChatMessage msg = received.poll(5, TimeUnit.SECONDS);
        assertThat(msg).isNotNull();
        assertThat(msg.sender()).isEqualTo("anna");      // server set identity, not client
        assertThat(msg.text()).isEqualTo("hello");
    }

    @Test
    void connectWithoutTokenFails() {
        assertThatThrownBy(() -> stompClient.connectAsync("ws://localhost:" + port + "/ws",
                new StompSessionHandlerAdapter() {}).get(5, TimeUnit.SECONDS))
            .isInstanceOf(Exception.class);
    }
}
```

Tips:
* **Race between SUBSCRIBE and SEND** is the #1 cause of flaky WebSocket tests. Use receipts (`session.setAutoReceipt(true)` + `subscribe(...).addReceiptTask(latch::countDown)`, where the server supports receipts), or a "ping" round-trip through the same session, or Awaitility polling of `SimpUserRegistry` subscriptions.
* Use `BlockingQueue.poll(timeout)` or Awaitility, never fixed long sleeps.
* Test negative paths: forbidden subscriptions, invalid payloads → error queue, expired tokens.
* Test **user destinations** with two sessions for the same user (both receive) and a different user (doesn't).

### 10.2.4 Broker relay tests with Testcontainers

```java
@Testcontainers
@SpringBootTest(webEnvironment = RANDOM_PORT)
class RelayIT {
    @Container
    static RabbitMQContainer rabbit = new RabbitMQContainer("rabbitmq:3-management")
            .withPluginsEnabled("rabbitmq_stomp")      // API name may differ by Testcontainers version;
            .withExposedPorts(5672, 15672, 61613);     // alternatively execInContainer("rabbitmq-plugins","enable","rabbitmq_stomp")

    @DynamicPropertySource
    static void props(DynamicPropertyRegistry r) {
        r.add("broker.relay.host", rabbit::getHost);
        r.add("broker.relay.port", () -> rabbit.getMappedPort(61613));
    }
    // ... same client-based tests; plus: restart broker and assert BrokerAvailabilityEvent + recovery
}
```

### 10.2.5 Front-end tests
* Wrap the STOMP client behind your own small interface (`RealtimeClient { subscribe, publish, onState }`) so components can be tested with a fake that you control (`fake.emit('/topic/x', payload)`).
* For lower-level tests, libraries such as **mock-socket** can fake the browser `WebSocket`.
* **Playwright E2E:** open two browser contexts logged in as different users; act in one and `expect(page2.getByText('Buy milk')).toBeVisible()` in the other. Also test offline: `context.setOffline(true)` → assert "Reconnecting…" → `setOffline(false)` → assert resync.

### 10.2.6 Contract tests for messages
* Define payload schemas (JSON Schema or **AsyncAPI** document listing channels/destinations, messages, and payloads).
* In CI: validate server-produced sample messages against the schema; generate TypeScript types for the client from the same schema; fail on breaking changes (removed/renamed fields).

---

## 10.3 The debugging method: layer by layer

```
 Layer 7c  App logic        Did my handler run? Was the right data sent? Did UI render it?
 Layer 7b  STOMP routing    Destination/prefix correct? Subscribed? Authorised? Converted?
 Layer 7a  STOMP session    CONNECT → CONNECTED? ERROR frame? Heart-beats negotiated?
 Layer 6   WebSocket        101 received? Close code? Frames flowing?
 Layer 5   HTTP/proxy       Upgrade headers forwarded? Timeouts? Status code?
 Layer 4   TLS/TCP/DNS      Resolves? Port open? Cert valid? Firewall?
```

**Step-by-step:**
1. **Browser DevTools → Network → WS.** Is there a request to `/ws`? Status **101**? If not, look at the status code (Chapter 2 §2.3.5 table).
2. **Messages tab.** Do you see `CONNECT` going up and `CONNECTED` coming down? If you see `ERROR`, read its `message` header and body.
3. Check **heart-beat** header values in CONNECT/CONNECTED.
4. Check your **SUBSCRIBE** frames: exact destination string, `id`.
5. Send and verify the **SEND** frame destination (`/app/...`) and `content-type`.
6. Do **MESSAGE** frames arrive? With which `subscription` id? If MESSAGE frames arrive but the UI doesn't update → client code bug (wrong callback, parse error, state bug).
7. **Server logs** with `DEBUG` on `org.springframework.messaging` and `org.springframework.web.socket` (temporarily): you'll see each message, destination, handler resolution, and broker deliveries.
8. **`WebSocketMessageBrokerStats`** log line: session counts, abnormal closes, queue sizes.
9. **Close code** in `onWebSocketClose` (1000/1001/1006/1008/1009/1011/4xxx) narrows it down fast.
10. Reproduce with **raw tools** (`wscat`/`websocat`/Postman) to separate client-library bugs from server bugs.
11. **Behind proxies:** test directly against the app (port-forward to the pod) vs through the LB. If direct works and LB doesn't, it's proxy config.
12. **Packet level:** Wireshark/tcpdump on the server (`tcpdump -i any port 8080 -A`) for unencrypted internal hops.

---

## 10.4 The Bug Encyclopedia (symptom → cause → fix)

### A. Connection & handshake problems

| # | Symptom | Likely cause | Fix |
|---|---------|--------------|-----|
| A1 | `WebSocket connection to 'wss://.../ws' failed` with **404** | Wrong path; app has `server.servlet.context-path` (e.g., `/api` → `/api/ws`); SockJS endpoint used with raw WS; gateway route missing | Use the correct full path; for SockJS endpoints use SockJS client or `/ws/websocket`; add route |
| A2 | Handshake returns **200** | Request hit an HTML page (SPA fallback / static route) or proxy didn't treat it as upgrade | Route `/ws` to the backend before SPA fallback; fix proxy Upgrade headers |
| A3 | **403** on handshake | Origin not allowed (`setAllowedOrigins`); Spring Security HTTP rules deny `/ws`; CSRF in HTTP layer (rare for GET) | Add origin to allow-list (exact scheme+host+port); `permitAll` or authenticate `/ws` deliberately |
| A4 | **400** "Can "Upgrade" only to "WebSocket"" / "Connection header must include Upgrade" | Proxy stripped/rewrote `Upgrade`/`Connection` | Nginx: `proxy_http_version 1.1` + `Upgrade` + `Connection` headers |
| A5 | Works locally, fails in prod behind Nginx/Ingress | Same as A4, or HTTP/2-only hop without extended CONNECT | Fix proxy config; ensure HTTP/1.1 upgrade to backend |
| A6 | Browser: "Mixed Content: ... insecure WebSocket endpoint" | `ws://` from an `https://` page | Use `wss://` |
| A7 | SockJS: CORS error on `/ws/info` | SockJS uses XHR → CORS applies; origin not allowed | `setAllowedOriginPatterns(...)` on the endpoint |
| A8 | Android emulator can't connect to `ws://localhost:8080` | `localhost` = the emulator | Use `10.0.2.2` (emulator) or LAN IP (device) |
| A9 | Android: `CLEARTEXT communication not permitted` | Android 9+ blocks cleartext | Use `wss://`, or dev-only network security config |
| A10 | iOS: connection fails to `ws://` | ATS blocks non-TLS | `wss://` or dev-only ATS exception |
| A11 | Immediate close **1006** with no response, only in some environments | TLS certificate invalid/self-signed; corporate proxy; firewall | Fix certificate chain; test with `openssl s_client`; try SockJS/443 |
| A12 | Spring log: "Handshake failed due to invalid Upgrade header: null" | Plain HTTP request reached WS endpoint (health check, crawler, misrouted) | Usually harmless; make health checks hit `/actuator/health` |
| A13 | "Unexpected server response: 502/504" | LB can't reach backend / backend slow / backend not listening on that port | Check target health, ports, security groups |
| A14 | New connections refused at ~8k per instance | Tomcat `server.tomcat.max-connections` (default 8192) reached | Raise `max-connections` (+ fds), or scale out |
| A15 | Connection fails only on corporate networks | Proxy blocks/breaks WebSocket | Use `wss://` on 443; enable SockJS fallbacks |

### B. Connection drops and reconnects

| # | Symptom | Likely cause | Fix |
|---|---------|--------------|-----|
| B1 | Drops every **~60 s** when idle | Nginx/ALB idle timeout (60 s default) with no heart-beats | Enable heart-beats (10–25 s) + raise proxy timeouts |
| B2 | Drops after exactly **30 s** on GCP | Backend service timeout = WS max duration | Raise backend service timeout (e.g., 3600 s+) |
| B3 | Drops around **100 s** idle behind Cloudflare | Cloudflare idle timeout | Heart-beats < 100 s |
| B4 | Frequent **1006** on mobile | Network changes, background suspension | Heart-beats, reconnect with backoff, resync, push notifications for background |
| B5 | Client: "did not receive server activity for the last N ms" then reconnect | Heart-beats were negotiated but the server's beats (or any data) don't reach the client in time: outbound thread pool saturated, a proxy buffering the stream, long GC pauses, or the browser throttling timers in a background tab | Check the outbound pool and GC logs, set `proxy_buffering off`, give heart-beats more tolerance, and resync when a tab becomes visible again |
| B6 | Server closes sessions with **4500** / stats show "send limit" | Slow client exceeded `sendBufferSizeLimit`/`sendTimeLimit` | Reduce message rate (conflate/batch), raise limits moderately, investigate client network |
| B7 | **1009** close | Message larger than container buffer or Spring limit | Raise `setMessageSizeLimit` and container buffers, or send smaller messages |
| B8 | Everyone disconnects at deploy and servers spike | Expected disconnect + synchronized reconnect (thundering herd) | Jittered backoff, rolling deploy, readiness/preStop, capacity headroom |
| B9 | Infinite reconnect loop, each attempt gets ERROR "Invalid token" | Token expired; client reuses old token | Refresh in `beforeConnect`; on auth ERROR force re-login; don't retry identical credentials forever |
| B10 | Connection closes ~60 s after connect without traffic, server log "no messages received" | `timeToFirstMessage` exceeded: client never sent CONNECT (e.g., RN NULL issue, client bug) | Fix client CONNECT; check RN flags |
| B11 | RabbitMQ log "missed heartbeats from client, timeout: Xs" and closes | Client heart-beats not reaching broker in time (blocked JS thread, mobile sleep) | Increase interval; avoid blocking main thread; reconnect |
| B12 | Connections slowly become unbalanced across pods | Long-lived connections don't rebalance | Least-conn LB; max connection age with jitter |

### C. STOMP session problems

| # | Symptom | Likely cause | Fix |
|---|---------|--------------|-----|
| C1 | WebSocket opens but `onConnect` never fires | CONNECT not sent/parsed: RN NULL chopping; wrong sub-protocol; server not STOMP endpoint (raw handler) | RN: `forceBinaryWSFrames` + `appendMissingNULLonIncoming`; check endpoint config |
| C2 | Immediately ERROR + close after CONNECT | Exception in an inbound interceptor (auth failed, CSRF missing) | Read ERROR `message`; fix token/CSRF; customise error handler for clearer messages |
| C3 | ERROR "Failed to send message to ExecutorSubscribableChannel[clientInboundChannel]; nested exception is ... AccessDeniedException" | Spring Security authorisation denied the frame | Fix message security rules or interceptor order (`@Order(HIGHEST_PRECEDENCE + 99)`) |
| C4 | `MissingCsrfTokenException` / "Could not verify the provided CSRF token because no token was found" on CONNECT | `@EnableWebSocketSecurity` requires CSRF token in CONNECT | Send the CSRF header in `connectHeaders`, or configure without CSRF for header-token auth (Chapter 8) |
| C5 | `Principal` is `null` in `@MessageMapping` | User never set: used `StompHeaderAccessor.wrap()` copy, or interceptor not on inbound channel, or handshake unauthenticated | Use `MessageHeaderAccessor.getAccessor(...)` + `setUser` on CONNECT |
| C6 | CONNECTED received but heart-beat header is `0,0` | Simple broker without TaskScheduler; or client sent `0,0` | Configure `setTaskScheduler` + `setHeartbeatValue` |
| C7 | `BeanCurrentlyInCreationException` / circular dependency when injecting TaskScheduler | Scheduler depends on message broker config | Dedicated scheduler bean or `@Lazy` injection |
| C8 | Old client gets ERROR on ACK | Client sends 1.1-style ACK (`message-id`/`subscription`) to a 1.2 session | Use 1.2 `id` = MESSAGE `ack` header (update library) |
| C9 | ERROR "Broker not available" / `MessageDeliveryException: Message broker not active` | Relay can't reach broker (down, wrong host/port, credentials, network policy, reactor-netty missing) | Check `BrokerAvailabilityEvent` logs, broker connectivity, credentials, add `spring-boot-starter-reactor-netty` |

### D. Routing & delivery problems

| # | Symptom | Likely cause | Fix |
|---|---------|--------------|-----|
| D1 | `@MessageMapping` method never called | Client sends to `/chat.send` instead of `/app/chat.send`; prefix mismatch; class not a Spring `@Controller` bean; path separator mismatch (`.` vs `/`) | Align prefix; component scanning; consistent `PathMatcher` |
| D2 | Return value of `@MessageMapping` not received by client | Client subscribed to a different destination than the default (`/topic` + input destination) | Use explicit `@SendTo`; subscribe to the right topic |
| D3 | `SimpMessagingTemplate.convertAndSend("/app/x")` doesn't invoke controller | Template sends to **broker** channel; `/app` only routes **client** messages | Call the service directly; or send to broker destinations only |
| D4 | Message sent to `/queue/x` silently disappears | Broker only configured for `/topic` (`enableSimpleBroker("/topic")`) | Add the prefix to the broker config |
| D5 | Subscribed but receives nothing | Subscribed **before** connected (exception swallowed); typo in destination; leading/trailing spaces in header; destination not authorised (dropped) | Subscribe in `onConnect`; log frames; check security rules |
| D6 | `convertAndSendToUser` messages never arrive | Name mismatch with `Principal#getName()` (email vs id vs `sub`); client subscribed to `/queue/x` instead of **`/user/queue/x`**; no Principal on session; user connected to **another instance** | Align names; subscribe with `/user` prefix; set Principal; enable user destination broadcast (relay) |
| D7 | Users on server A don't get messages sent on server B | Simple broker per instance | Broker relay or Redis/Kafka backplane |
| D8 | Duplicate messages in UI | Multiple subscriptions to same destination (React re-renders, StrictMode, subscribing in `onConnect` and in components, multiple Client instances) | Single client + ref-counted subscriptions; unsubscribe on cleanup |
| D9 | Messages lost after reconnect | No re-subscribe; events during downtime not replayed | Subscribe in `onConnect`; resync via REST with last seq |
| D10 | Messages arrive out of order | Thread pools; multiple producers | `setPreservePublishOrder(true)`, `setPreserveReceiveOrder(true)`; sequence numbers |
| D11 | Client logs "Unhandled received MESSAGE" | MESSAGE for a subscription that was already unsubscribed (in-flight), or subscription id mismatch | Usually benign; ensure ids are unique; handle `onUnhandledMessage` |
| D12 | `@SendToUser` reply goes to all tabs | `broadcast = true` default | `@SendToUser(broadcast = false)` |
| D13 | `@SendToUser` for anonymous users | No Principal → Spring falls back to the **session** (single session delivery) | Works for the current session; for later pushes keep session id or assign anonymous Principal in handshake |
| D14 | RabbitMQ wildcard subscription doesn't match | Using `/` separators in routing keys (`/topic/prices/AAPL`) with `*`/`#` | Use dots: `/topic/prices.AAPL`, `AntPathMatcher(".")` |
| D15 | RabbitMQ ERROR "not_found" | `/amq/queue/x` where queue x doesn't exist | Declare queue first, or use `/queue/x` |
| D16 | RabbitMQ queue count grows forever | Per-session user queues (`/queue/x-user...`) not auto-deleted | Use `/exchange/amq.direct/...` user destinations, policies with `x-expires` |
| D17 | Subscription works for user A but A can still see list after being removed | Authorisation only at SUBSCRIBE time | Revoke: close sessions / re-check on change / send through user destinations |

### E. Payload / conversion problems

| # | Symptom | Likely cause | Fix |
|---|---------|--------------|-----|
| E1 | Handler receives `null` fields / conversion error | Missing `content-type: application/json`; record/class not deserialisable; unknown properties failing | Send content-type; check Jackson config; `@JsonIgnoreProperties(ignoreUnknown = true)` |
| E2 | `MessageConversionException: Cannot convert from [[B] to [com.x.Dto]` | No suitable converter (Jackson missing, wrong content-type like `text/plain`) | Add Jackson; set content-type; register converter |
| E3 | Dates arrive as arrays `[2024,1,1,...]` or fail | Jackson without JavaTimeModule / custom ObjectMapper not used for messaging | Use Boot's ObjectMapper (auto-configured), or register modules in your converter |
| E4 | Client gets `"\"hello\""` (double-quoted) | Returning a `String` converted as JSON | Return an object, or configure `StringMessageConverter` precedence |
| E5 | Non-ASCII text garbled / frames corrupted | `content-length` computed in characters; wrong charset | Let the library compute; UTF-8 everywhere |
| E6 | `JSON.parse` error in client | Body isn't JSON (string/error text); binary body read as text | Check `content-type`; use `binaryBody` for binary |
| E7 | Large payload fails only for some users | Over message size limits (B7) | Limits or redesign |
| E8 | `@Valid` not triggering | Missing validation starter / `@Valid` | Add starter and annotation |
| E9 | `MethodArgumentNotValidException` handler not invoked | Imported MVC class instead of `org.springframework.messaging.handler.annotation.support.MethodArgumentNotValidException` | Fix import |

### F. Server performance & stability

| # | Symptom | Likely cause | Fix |
|---|---------|--------------|-----|
| F1 | Latency grows under load, CPU low | Blocking handlers saturating inbound pool; `maxPoolSize` ineffective with unbounded queue | Increase core size; offload blocking work; async returns |
| F2 | `OutOfMemoryError` | Slow clients buffering; unbounded executor queues; leaked maps (presence, rate-limit buckets); huge subscriptions | Send limits; bounded queues; cleanup on disconnect; heap dump analysis |
| F3 | `IllegalStateException: The remote endpoint was in state [TEXT_PARTIAL_WRITING]` | Concurrent sends to a raw `WebSocketSession` | Wrap with `ConcurrentWebSocketSessionDecorator` or single-threaded sending |
| F4 | GC pauses → heart-beat timeouts → mass reconnects | Large heap, allocation-heavy fan-out | GC tuning (G1/ZGC), reduce allocations, conflation, more instances |
| F5 | Broker CPU/memory high, connections at limit | Relay creates 1 TCP connection per client | Size broker, or move to backplane pattern |
| F6 | `SessionDisconnectEvent` handlers run twice | Documented behaviour | Make handlers idempotent |
| F7 | Wrong "online" counts in cluster | Local in-memory presence | Redis-based presence with TTL, or `userRegistryBroadcast` |
| F8 | Autoscaler doesn't add pods while sockets max out | HPA on CPU | Scale on connection count/memory custom metrics |

### G. Client-specific problems

| # | Symptom | Likely cause | Fix |
|---|---------|--------------|-----|
| G1 | `TypeError: There is no underlying STOMP connection` | `publish`/`subscribe` before connected or after disconnect | Check `client.connected`; outbox; subscribe in `onConnect` |
| G2 | Two connections in dev (React) | StrictMode double-invokes effects | Singleton client; tolerate in dev |
| G3 | Memory leak in SPA | Subscriptions/listeners not cleaned on unmount | Unsubscribe in effect cleanup |
| G4 | Stale state in callbacks | Closure captured old state | Functional `setState(prev => ...)`, refs |
| G5 | React Native: `ReferenceError: TextEncoder` | Missing polyfill on old RN/JSC | Import `text-encoding` polyfill |
| G6 | React Native: frames garbled / never CONNECTED | NULL byte truncation | `forceBinaryWSFrames: true`, `appendMissingNULLonIncoming: true` |
| G7 | Old tutorial code `Stomp.over(...)` doesn't reconnect | Legacy API with a socket instance | Migrate to `new Client({...})` + `activate()` |
| G8 | Token visible in logs | `debug` enabled in production, or token in URL | Disable debug; CONNECT headers; redact |
| G9 | Background tab stops receiving / timers throttled | Browser throttles timers in background tabs; heart-beats may be delayed | Use stompjs's worker-based heart-beat ticker option if available in your version; generous heart-beat tolerances; resync on `visibilitychange` |
| G10 | App reconnect hammering after server outage | Fixed short `reconnectDelay` across all clients | Exponential backoff + jitter (adjust `reconnectDelay` in `onWebSocketClose`) |

---

## 10.5 "What do I do when…" playbook

**…users report "real-time stopped working" (incident)?**
1. Check dashboards: session count, connect rate, close codes, broker availability.
2. Are connections being established (101s at LB)? If not → LB/proxy/certificate/DNS.
3. Are CONNECTs failing (ERROR)? → auth provider/JWKS endpoint down? clock skew? CSRF change?
4. Are messages produced? Check the producing service logs and the broker (queue depth, publish rates).
5. Are messages routed? Check broker bindings/subscriptions; relay availability events.
6. Mitigate first (roll back recent deploy, scale out, restart a stuck broker node), then root-cause.

**…a deploy causes a spike of errors?**
Jittered reconnect present? Readiness gating? Maybe the new version changed message formats (backward compatibility!) or security rules (403/ERROR).

**…memory grows steadily over days?**
Heap dump: look for `ConcurrentWebSocketSessionDecorator` buffers (slow clients), your own maps keyed by session id (missing cleanup on disconnect), `DefaultSubscriptionRegistry` sizes (subscriptions never unsubscribed), executor queues.

**…one customer says they never get updates but others do?**
Their network/proxy (corporate) → check their close codes/transport; their user id mapping (D6); authorisation for their tenant; they're subscribed to the wrong destination after a client version mismatch.

**…messages are slow (seconds of delay)?**
Inbound/outbound queue sizes, GC pauses, broker queue backlogs, proxy buffering (`proxy_buffering off`), client main-thread blocking (huge re-renders per message → batch UI updates).

**…you must add a new real-time feature fast?**
Reuse the existing connection, define destination naming + authorisation rule + schema first, add to AsyncAPI doc, implement with resync story, load test fan-out.

---

## 10.6 Useful log/config snippets

```properties
# Temporarily, when debugging locally
logging.level.org.springframework.web.socket=DEBUG
logging.level.org.springframework.messaging=DEBUG
logging.level.org.springframework.security.messaging=DEBUG
logging.level.org.springframework.web.socket.config.WebSocketMessageBrokerStats=INFO
```

```java
// Log every inbound STOMP command (redacting secrets) for troubleshooting
public class StompAuditInterceptor implements ChannelInterceptor {
    private static final Logger log = LoggerFactory.getLogger(StompAuditInterceptor.class);
    @Override
    public Message<?> preSend(Message<?> m, MessageChannel c) {
        StompHeaderAccessor a = MessageHeaderAccessor.getAccessor(m, StompHeaderAccessor.class);
        if (a != null && a.getCommand() != null) {
            log.debug("in cmd={} session={} user={} dest={} subId={}",
                a.getCommand(), a.getSessionId(),
                a.getUser() != null ? a.getUser().getName() : null,
                a.getDestination(), a.getSubscriptionId());
        }
        return m;
    }
}
```

Next: [Chapter 11: Architecture, Design Patterns & Organisational Best Practices](11-architecture-best-practices.md)
