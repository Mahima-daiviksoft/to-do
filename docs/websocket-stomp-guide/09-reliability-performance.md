# Chapter 9: Reliability, Performance & Tuning

> **Goal:** make real-time messaging that doesn't lose important data, doesn't fall over under load, and
> degrades gracefully. This is what separates "it works on my laptop" from senior-level production work.

---

## 9.1 ELI5

* **Reliability** = letters don't get lost, don't arrive twice in a harmful way, and arrive in the right order when order matters.
* **Performance** = the post office handles lots of letters quickly without its sorting room overflowing.
* **Resilience** = when a truck breaks down, letters still get delivered later, and everybody knows what happened.

---

## 9.2 Delivery guarantees: what STOMP over WebSocket really gives you

| Guarantee | Meaning | Where you get it |
|-----------|---------|------------------|
| **At-most-once** | Delivered 0 or 1 times; may be lost | Default: simple broker, `ack:auto`, disconnected clients miss messages |
| **At-least-once** | Delivered ≥1 times; duplicates possible | Full broker + durable queue + `ack:client(-individual)` + redelivery; **plus** client-side dedupe |
| **Exactly-once** (effectively-once) | Effect applied once | **Not a transport property.** At-least-once + idempotent processing (dedupe by message id) |

**Truth bomb for interviews:** With Spring's simple broker, if a client is disconnected for 3 seconds (tunnel,
deploy, Wi-Fi switch), **every message published in those 3 seconds is lost for that client**. TCP's reliability
only covers bytes on a *live* connection. Design for it:

### 9.2.1 The "WebSocket as notification, database as truth" pattern (most important pattern in this book)
1. All state lives in a database (source of truth).
2. Every change gets a **monotonic version/sequence number** or event id.
3. WebSocket pushes **events** (or just "something changed, version N").
4. Client tracks the **last version** it applied.
5. On (re)connect or **gap detected** (received N+2 after N), the client **fetches missed changes** via REST (`GET /lists/L1/events?after=N`) or a full snapshot.

```ts
let lastSeq = 0;
function onEvent(e: { seq: number; ... }) {
  if (e.seq <= lastSeq) return;                 // duplicate or stale → ignore (idempotent)
  if (e.seq > lastSeq + 1) return resync();     // gap → fetch missing
  apply(e); lastSeq = e.seq;
}
client.onConnect = () => { subscribeAll(); resync(); };   // after reconnect always resync
```

### 9.2.2 Subscribe-then-snapshot (avoid the race)
If you **fetch the snapshot first and subscribe second**, changes between the two are lost. Correct order:
1. Subscribe to the live topic; **buffer** incoming events.
2. Fetch snapshot (with its version `V`).
3. Apply buffered events with `seq > V`, drop the rest.
4. Continue live.

### 9.2.3 Server-side: the transactional outbox
If your service writes to the DB and then publishes to the broker, a crash between the two loses the event (or the
reverse publishes a lie). **Outbox pattern:** write the event into an `outbox` table in the **same DB transaction**, and
a relay process (polling or CDC like Debezium) publishes it to the broker/WebSocket layer and marks it sent. Gives
at-least-once publish; consumers dedupe by event id.

Simpler alternative for small apps: `@TransactionalEventListener(phase = AFTER_COMMIT)` (no lie on rollback, but
an event can be lost if the process crashes right after commit; the REST resync covers that).

### 9.2.4 Client → server reliability
* Client sends a command with a **`clientRequestId`** (UUID).
* Server processes **idempotently** (unique constraint on request id, or a processed-ids cache with TTL).
* Server replies (to `/user/queue/acks` or via the resulting event containing `clientRequestId`).
* Client retries if no confirmation within a timeout (or after reconnect). Duplicates are harmless.
* STOMP `receipt` confirms the broker/server **received** the frame, not that your business logic succeeded.

### 9.2.5 Durable delivery to offline users
WebSocket is for **online** users. For offline users:
* Store notifications in DB (inbox table), show on next login.
* Send **push notifications** (FCM/APNs) or email for important ones.
* With RabbitMQ you *can* use durable per-user queues, but per-user durable queues for millions of users are an operational burden. The DB inbox is usually better.

---

## 9.3 Ordering

| Layer | Ordering behaviour |
|-------|--------------------|
| TCP / one WebSocket connection | Ordered |
| Spring inbound channel (thread pool) | **Not ordered by default** across messages of one session → `setPreserveReceiveOrder(true)` (6.1+) |
| Spring outbound channel | **Not ordered by default** → `setPreservePublishOrder(true)` (5.1+) |
| Simple broker fan-out | Per subscriber, follows outbound ordering setting |
| RabbitMQ single queue, single consumer | Ordered (redeliveries can reorder) |
| Multiple publishers / instances | **No global order**. Use per-entity sequence numbers |
| Kafka backplane | Ordered per partition (partition by entity id) |

Rules of thumb:
* Most apps need **per-entity** ordering (per chat room, per document), not global.
* Put a **sequence number per entity** in each event, generated where the state changes (DB row version).
* Clients drop stale versions (last-writer-wins by version).

---

## 9.4 Heart-beats and timeouts: tuning table

| Setting | Recommended starting point | Why |
|---------|---------------------------|-----|
| STOMP heart-beat (both ways) | 10 s – 25 s | Below every idle timeout in the path; fast dead-peer detection |
| Proxy/LB idle timeout | ≥ 2–3 × heart-beat (e.g., 60–3600 s) | Never kill healthy connections |
| Client `connectionTimeout` | 5–10 s | Don't hang forever on half-open connects |
| Client reconnect delay | 1 s → backoff to 30 s, with jitter | Avoid thundering herds |
| Spring `timeToFirstMessage` | 10–30 s | Kill sockets that never CONNECT |
| Spring `sendTimeLimit` | 10–20 s | Kill stuck writes to dead clients |
| Spring `sendBufferSizeLimit` | 512 KB – few MB | Bound memory for slow clients |
| Mobile | 10–20 s heart-beats | Networks change often; NAT timeouts are short |

Trade-off: shorter heart-beats → faster detection but more traffic/battery (each beat is 1 byte of payload but a
packet and radio wake-up on mobile). 100k connections × 1 beat/10 s each way = 20k tiny packets/s. Fine for servers, measurable for phones.

---

## 9.5 Slow consumers and backpressure

### 9.5.1 What happens with a slow client in Spring
* Messages to a session go through `ConcurrentWebSocketSessionDecorator`. Only **one thread sends** to a session at a time; others **buffer** messages in a per-session queue.
* If buffered bytes exceed **`sendBufferSizeLimit`** or a send takes longer than **`sendTimeLimit`**, the session is closed (Spring's `CloseStatus.SESSION_NOT_RELIABLE`, 4500), and stats count it under "send limit".
* Without these limits, one slow client on a bad network could make the server buffer unbounded data → `OutOfMemoryError`.

### 9.5.2 Strategies
1. **Bound buffers** (above), so the slow client gets disconnected and resyncs on reconnect.
2. **Conflation/coalescing:** for state that changes frequently (prices, positions, cursors), send only the **latest** value per key every X ms. A slow client doesn't need 50 stale prices.
3. **Batching:** send arrays of events every 50–250 ms instead of one frame per event (fewer frames, less overhead).
4. **Deltas:** send changes, not full objects.
5. **Smaller audiences:** shard topics (per room, per symbol), subscribe only to what's visible on screen.
6. **Prioritise:** separate critical messages (orders) from high-volume ones (market data); maybe separate connections/endpoints.

Coalescing example (server side, per destination, latest-wins):
```java
@Component
@RequiredArgsConstructor
public class PriceConflator {
    private final SimpMessagingTemplate messaging;
    private final ConcurrentHashMap<String, Price> latest = new ConcurrentHashMap<>();

    public void onTick(Price p) { latest.put(p.symbol(), p); }         // called thousands of times/s

    @Scheduled(fixedRate = 200)                                        // 5 updates/s per symbol max
    public void flush() {
        for (String symbol : latest.keySet()) {
            Price p = latest.remove(symbol);
            if (p != null) messaging.convertAndSend("/topic/prices." + symbol, p);
        }
    }
}
```

---

## 9.6 Thread pools and blocking

* `clientInboundChannel` threads run your `@MessageMapping` methods. **Blocking** (slow DB, HTTP calls) in handlers occupies these threads; when all are busy, messages **queue** (default queue capacity is unbounded) → latency grows, memory grows.
* Default core size = 2 × CPUs. For I/O-bound handlers, either **increase the pool** (e.g., 50–200) or **offload** to another executor and reply asynchronously (return `CompletableFuture`).
* Set a **bounded queue** + rejection policy for back-pressure on inbound traffic only if you have a plan for rejected messages (clients must retry).
* `clientOutboundChannel` mostly writes to sockets. Thread count rarely needs to be high unless clients are slow (limits handle that).
* Java 21 **virtual threads**: since **Spring Framework 6.2**, `ChannelRegistration.executor(Executor)` lets you plug any `Executor` into a channel (it takes precedence over `taskExecutor()` settings). Example:
  ```java
  @Override
  public void configureClientInboundChannel(ChannelRegistration r) {
      r.executor(new VirtualThreadTaskExecutor("ws-in-"));   // org.springframework.core.task.VirtualThreadTaskExecutor
  }
  ```
  **Load test** before adopting: virtual threads help handlers that block on I/O, but they don't fix slow clients or fan-out costs. Keep `setPreservePublishOrder`/`setPreserveReceiveOrder` in mind, since ordering is still not guaranteed across threads.
* Watch `WebSocketMessageBrokerStats` (`queued tasks`) or custom metrics on executor queue sizes.

```java
@Override
public void configureClientInboundChannel(ChannelRegistration r) {
    r.taskExecutor().corePoolSize(32).maxPoolSize(64).keepAliveSeconds(60).queueCapacity(50_000);
}
```

> Note: with `ThreadPoolTaskExecutor`, `maxPoolSize` only takes effect when the **queue is full**. With an unbounded
> queue, the pool never grows beyond `corePoolSize`. A very common misconfiguration.

---

## 9.7 Payload size and format

* JSON is fine for most apps. Optimise only with data:
  * Short field names for high-frequency messages; omit nulls (`spring.jackson.default-property-inclusion=non_null`).
  * Numbers instead of strings; epoch millis instead of ISO strings for hot paths.
* **Binary formats** (Protocol Buffers, MessagePack, CBOR, FlatBuffers) shrink payloads 30–80% and parse faster; send as binary WebSocket frames with STOMP `content-type: application/x-protobuf` and a custom `MessageConverter`.
* **Compression** (`permessage-deflate`): big wins for verbose JSON, costs CPU and memory per connection. Measure.
* Keep messages **small** (< a few KB). For big content, send an id/URL and fetch over HTTP (CDN-cacheable, resumable).

---

## 9.8 Observability: what to measure

### 9.8.1 Metrics (Micrometer → Prometheus/Grafana/Datadog)

| Metric | Why |
|--------|-----|
| Active WebSocket sessions (per instance, per transport) | Capacity, imbalance |
| Connects/s, disconnects/s, by close code | Reconnect storms, auth failures, proxy timeouts (1006) |
| STOMP CONNECT failures (auth) | Token problems, attacks |
| Inbound messages/s, outbound messages/s | Throughput, fan-out |
| Message size histogram | Detect oversized payloads |
| Inbound/outbound executor active threads + queue size | Saturation |
| Sessions closed due to send limits | Slow clients / network problems |
| Handler latency (`@MessageMapping` timing) | Slow business logic |
| End-to-end latency (publish ts → client receive ts, sampled) | User-visible lag |
| Broker: connections, queue depth, unacked, memory alarms | Broker health |
| `BrokerAvailabilityEvent` state | Relay connectivity |
| Subscriptions count per destination (top N) | Hot topics |

Session gauge example:
```java
@Component
public class WsMetrics {
    private final AtomicInteger sessions = new AtomicInteger();
    public WsMetrics(MeterRegistry registry, SimpUserRegistry users) {
        Gauge.builder("ws.sessions.active", sessions, AtomicInteger::get).register(registry);
        Gauge.builder("ws.users.connected", users, SimpUserRegistry::getUserCount).register(registry);
    }
    @EventListener void on(SessionConnectedEvent e) { sessions.incrementAndGet(); }
    @EventListener void on(SessionDisconnectEvent e) { /* guard against double events with a Set<sessionId> */ sessions.decrementAndGet(); }
}
```
(Because `SessionDisconnectEvent` can fire twice, track session ids in a concurrent set and decrement only when removal succeeds.)

Executor metrics:
```java
@Bean
public MeterBinder wsExecutorMetrics(@Qualifier("clientInboundChannelExecutor") ThreadPoolTaskExecutor in,
                                     @Qualifier("clientOutboundChannelExecutor") ThreadPoolTaskExecutor out) {
    return registry -> {
        new ExecutorServiceMetrics(in.getThreadPoolExecutor(), "ws.inbound", List.of()).bindTo(registry);
        new ExecutorServiceMetrics(out.getThreadPoolExecutor(), "ws.outbound", List.of()).bindTo(registry);
    };
}
```
(Bean names `clientInboundChannelExecutor` / `clientOutboundChannelExecutor` / `brokerChannelExecutor` are Spring's defaults, and by default they are `ThreadPoolTaskExecutor`s. If you plugged in a custom executor, adapt the binding.)

### 9.8.2 Logging
* Log connect/disconnect with session id, user id, close code, duration, client version, IP (respect privacy rules).
* Use **MDC** with session id/user id in an `ExecutorChannelInterceptor` (`beforeHandle` → put, `afterMessageHandled` → clear) so handler logs are traceable.
* Spring debug logging for troubleshooting: `logging.level.org.springframework.web.socket=DEBUG`, `logging.level.org.springframework.messaging=DEBUG` (very verbose; never leave on in prod).

### 9.8.3 Tracing
* Propagate a **trace/correlation id** in STOMP headers (`traceparent` style) from client → server → broker → consumers. Create spans manually around handlers (Micrometer Observation API) since auto-instrumentation for STOMP is limited.

### 9.8.4 Alerts
* Session count drops > 30% in 1 min (mass disconnect).
* Connect rate spikes (reconnect storm).
* Close code 1006 rate increase (network/proxy issue).
* Inbound queue size > threshold for 5 min.
* Broker unavailable.
* Send-limit closes increasing.

---

## 9.9 Load testing

| Tool | STOMP support |
|------|---------------|
| **Gatling** | WebSocket support; write STOMP frames as text (`"CONNECT\naccept-version:1.2\n\n\u0000"`), check responses |
| **k6** | `k6/ws` and the newer `k6/websockets` (browser-like API) modules; send raw STOMP frames |
| **Artillery** | WebSocket engine; raw frames |
| **JMeter** | WebSocket Samplers plugin; raw frames |
| **Custom Java/Kotlin** | `WebSocketStompClient`/Krossbow to simulate realistic clients |

k6 sketch:
```js
import ws from 'k6/ws';
import { check } from 'k6';
export const options = { vus: 1000, duration: '5m' };
const NUL = '\u0000';
export default function () {
  const res = ws.connect('wss://staging.example.com/ws', { headers: { 'Sec-WebSocket-Protocol': 'v12.stomp' } }, (socket) => {
    socket.on('open', () => {
      socket.send(`CONNECT\naccept-version:1.2\nhost:staging\nheart-beat:10000,10000\nAuthorization:Bearer ${__ENV.TOKEN}\n\n${NUL}`);
    });
    socket.on('message', (m) => {
      if (m.startsWith('CONNECTED')) {
        socket.send(`SUBSCRIBE\nid:sub-0\ndestination:/topic/chat.public\n\n${NUL}`);
        socket.setInterval(() => socket.send(`SEND\ndestination:/app/chat.send\ncontent-type:application/json\n\n{"text":"hi"}${NUL}`), 5000);
      }
    });
    socket.setInterval(() => socket.send('\n'), 10000);   // client heart-beat
    socket.setTimeout(() => socket.close(), 290000);
  });
  check(res, { 'status 101': (r) => r && r.status === 101 });
}
```

Load-test lessons:
* Load generators hit their own limits (ephemeral ports, fds, CPU). Use several machines/IPs.
* Test **realistic mixes**: mostly idle connections + bursts; reconnect storms (kill a pod mid-test); slow clients (throttle network).
* Measure **end-to-end latency percentiles** (p50/p95/p99), not just throughput.
* Soak tests (hours) find memory leaks (subscriptions not cleaned, presence maps growing).

---

## 9.10 Graceful degradation

* If WebSocket can't connect after N tries, fall back to **polling** for critical screens (or SockJS).
* Show **connection status** in the UI ("Live", "Reconnecting…", "Offline, showing data from 10:42").
* Queue user actions offline (outbox) and replay with idempotency keys.
* Feature flags to **turn off** real-time features (e.g., typing indicators) under load while keeping core ones.
* Server-side **load shedding**: reject new connections with close code **1013 (Try Again Later)** when overloaded; clients back off longer.

---

## 9.11 Reliability checklist

- [ ] Every event has an id/sequence; clients dedupe and detect gaps.
- [ ] Clients resync via REST after reconnect.
- [ ] Subscribe-then-snapshot ordering.
- [ ] Commands carry idempotency keys; server dedupes.
- [ ] Events published after commit (or via outbox).
- [ ] Ordering requirements identified; per-entity sequence or `preservePublishOrder`.
- [ ] Heart-beats < all idle timeouts; timeouts tuned.
- [ ] Send buffer/time limits configured; conflation for high-frequency data.
- [ ] Handlers non-blocking or pool sized; bounded queues considered.
- [ ] Metrics + alerts on sessions, close codes, queues, broker.
- [ ] Load, soak and chaos (pod kill, broker restart, network loss) tested.
- [ ] Offline delivery via DB inbox/push for important notifications.

Next: [Chapter 10: Testing, Debugging & the Bug Encyclopedia](10-testing-debugging-troubleshooting.md)
