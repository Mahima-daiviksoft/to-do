# Chapter 7: Message Brokers, Clustering & Scaling

> **Goal:** run STOMP for thousands to millions of users. Understand simple broker vs broker relay,
> configure RabbitMQ/ActiveMQ, scale horizontally, configure load balancers/proxies/Kubernetes, and
> deploy without dropping everyone.

---

## 7.1 ELI5

One post office (one server) can only serve so many houses. When the town grows, you open **more post
offices**. But now a letter from someone near post office A to someone near post office B must travel
between offices. You need a **central sorting hub** that all post offices are connected to. That hub is
the **external message broker** (RabbitMQ, ActiveMQ) or a **backplane** (Redis, Kafka).

---

## 7.2 Simple broker vs broker relay

| | Simple broker (`enableSimpleBroker`) | STOMP broker relay (`enableStompBrokerRelay`) |
|---|---|---|
| Where | In-memory, inside your Spring app | External broker (RabbitMQ, ActiveMQ, Artemis) |
| Setup | Zero | Run & operate a broker |
| Clustering | **No**: each instance only knows its own subscribers | **Yes**: broker connects all instances |
| STOMP features | Subset: no ACK/NACK, no transactions, limited receipts | Full (whatever the broker supports) |
| Persistence/durability | None (lost on restart) | Durable queues, persistent messages, DLQs |
| Throughput | Very high for one node (no network hop) | Network hop to broker; broker becomes a shared resource |
| Connections | None extra | **One TCP connection per client session** + one shared "system" connection |
| Destination semantics | Every destination is pub/sub | Broker-defined (`/queue` competing consumers, `/topic` fan-out, `/exchange`...) |
| Best for | Single instance, dev, prototypes, small apps, or with a custom backplane | Clusters, enterprise, reliability needs |

> **Interview tip:** "Why do my users on server 2 not receive messages sent on server 1?" → Simple broker
> isn't clustered. Use a broker relay or a pub/sub backplane.

---

## 7.3 How the broker relay works internally

```
             Spring instance A                                     RabbitMQ / ActiveMQ
 ┌───────────────────────────────────────────┐                ┌─────────────────────┐
 │ client session s1 ─ TCP conn #1 (clientLogin) ─────────────►│                     │
 │ client session s2 ─ TCP conn #2 (clientLogin) ─────────────►│   STOMP adapter     │
 │ ...                                        │                │   (port 61613)      │
 │ "system" session  ─ TCP conn (systemLogin) ───────────────►│                     │
 │   used by SimpMessagingTemplate / @SendTo  │                └─────────────────────┘
 └───────────────────────────────────────────┘
```

* For each WebSocket client CONNECT, Spring opens a **dedicated TCP connection** to the broker and sends a STOMP CONNECT using **`clientLogin`/`clientPasscode`** (not the end-user's credentials!). Default `guest`/`guest`.
* Messages from server-side code (`brokerChannel`: `SimpMessagingTemplate`, `@SendTo` return values) go over a single shared **system connection** (`systemLogin`/`systemPasscode`), with heart-beats (default 10 s both ways).
* Frames from clients to broker destinations (`/topic/**`, `/queue/**`) are **forwarded** as-is; MESSAGE frames from the broker are forwarded back to the right WebSocket session.
* Client heart-beats are negotiated **with the broker** (the relay passes the client's heart-beat header through).
* If the system connection drops, Spring publishes **`BrokerAvailabilityEvent(false)`**, `SimpMessagingTemplate` sends fail with `MessageDeliveryException` ("Message broker not active"), and new client CONNECTs get an ERROR. Spring reconnects automatically (every 5 s by default).
* Requires **Reactor Netty** on the classpath (`spring-boot-starter-reactor-netty` or `io.projectreactor.netty:reactor-netty`).

> **Capacity implication:** 50,000 WebSocket users across your app instances = **~50,000 TCP connections to
> the broker**. Size the broker (file descriptors, memory, Erlang process limits for RabbitMQ) accordingly. If
> that's too many, use the **backplane pattern** (§7.7) instead.

### 7.3.1 Full relay configuration

```java
@Override
public void configureMessageBroker(MessageBrokerRegistry registry) {
    registry.setApplicationDestinationPrefixes("/app");
    registry.setPathMatcher(new AntPathMatcher("."));          // RabbitMQ topic routing keys use dots
    registry.enableStompBrokerRelay("/topic", "/queue", "/exchange", "/amq/queue", "/temp-queue")
            .setRelayHost("rabbitmq.internal")
            .setRelayPort(61613)
            .setVirtualHost("/")                               // "host" header in STOMP CONNECT
            .setClientLogin("ws-client")
            .setClientPasscode(env.getRequiredProperty("broker.client.password"))
            .setSystemLogin("ws-system")
            .setSystemPasscode(env.getRequiredProperty("broker.system.password"))
            .setSystemHeartbeatSendInterval(10_000)
            .setSystemHeartbeatReceiveInterval(10_000)
            .setAutoStartup(true)
            .setUserDestinationBroadcast("/topic/unresolved-user-destination")
            .setUserRegistryBroadcast("/topic/simp-user-registry");
}
```

### 7.3.2 Multiple broker nodes / TLS / failover

The relay connects to one host:port. For failover, put the broker cluster behind a TCP load balancer, or supply
a custom `TcpClient` that rotates through addresses:

```java
@Override
public void configureMessageBroker(MessageBrokerRegistry registry) {
    registry.enableStompBrokerRelay("/topic", "/queue").setTcpClient(createTcpClient());
    registry.setApplicationDestinationPrefixes("/app");
}

private ReactorNettyTcpClient<byte[]> createTcpClient() {
    Iterator<InetSocketAddress> addresses = Iterables.cycle(List.of(
            new InetSocketAddress("rabbit-1", 61614), new InetSocketAddress("rabbit-2", 61614))).iterator(); // Guava cycle, or your own round-robin
    return new ReactorNettyTcpClient<>(
            client -> client.remoteAddress(addresses::next).secure(),   // .secure() enables TLS (STOMP over TLS is often port 61614)
            new StompReactorNettyCodec());
}
```

(Spring's reference documentation shows this approach; adapt the address-rotation code to your utilities.)

---

## 7.4 User destinations in a cluster

Problem: user anna is connected to instance B. Instance A calls `convertAndSendToUser("anna", ...)`. A's local
`SimpUserRegistry` doesn't know anna's sessions.

Spring's solution (broker relay only):
* **`setUserDestinationBroadcast("/topic/unresolved-user-destination")`**: if a user destination can't be resolved locally, it is broadcast to this topic; every instance listens and the one that has anna's sessions delivers it.
* **`setUserRegistryBroadcast("/topic/simp-user-registry")`**: each instance periodically broadcasts its local user registry, so every instance has a `MultiServerUserRegistry` view of **all** users (useful for "who's online" counts across the cluster).

---

## 7.5 RabbitMQ in depth

### 7.5.1 Enabling STOMP

```bash
rabbitmq-plugins enable rabbitmq_stomp        # STOMP over TCP, port 61613 (TLS commonly 61614)
rabbitmq-plugins enable rabbitmq_web_stomp    # STOMP over WebSocket, port 15674, path /ws
```

`docker run -d -p 5672:5672 -p 15672:15672 -p 61613:61613 rabbitmq:3-management` then enable the plugin inside
(or build an image with `RUN rabbitmq-plugins enable --offline rabbitmq_stomp`).

> The `guest` user can only connect from **localhost** by default. Create dedicated users for the relay.

### 7.5.2 RabbitMQ STOMP destinations

| Destination | SUBSCRIBE behaviour | SEND behaviour | Use |
|-------------|--------------------|----------------|-----|
| `/exchange/<exchange>[/<routing-pattern>]` | Creates an exclusive, auto-delete queue bound to the exchange with the pattern | Publishes to the exchange with routing key | Full control over AMQP routing |
| `/queue/<name>` | Subscribes to queue `<name>` (created if needed); several subscribers **compete** | Sends to that queue via default exchange | Work queues, point-to-point |
| `/amq/queue/<name>` | Subscribes to an **existing** queue (not created) | Sends to existing queue | Queues managed elsewhere (AMQP apps) |
| `/topic/<routing-key>` | Creates a queue bound to `amq.topic` with the routing key/pattern (auto-delete by default; durable with `durable:true`+`auto-delete:false` and a stable `id`/`x-queue-name`) | Publishes to `amq.topic` | Pub/sub with wildcards |
| `/temp-queue/<name>` | (Used in `reply-to`) | Creates a temporary private reply queue | Request/reply |

**Topic wildcards** (AMQP style, dot-separated):
* `*` matches exactly one word: `/topic/prices.*` matches `prices.AAPL`, not `prices.us.AAPL`.
* `#` matches zero or more words: `/topic/prices.#` matches `prices`, `prices.AAPL`, `prices.us.AAPL`.

**Useful headers:**

| Header | Frame | Effect |
|--------|-------|--------|
| `prefetch-count` | SUBSCRIBE | Max unacked messages delivered (with `ack:client`/`client-individual`) |
| `durable` / `auto-delete` / `exclusive` | SUBSCRIBE | Queue properties |
| `x-queue-name` | SUBSCRIBE | Explicit name for the generated queue |
| `x-message-ttl`, `x-expires`, `x-max-length`, `x-dead-letter-exchange`, `x-queue-type` | SUBSCRIBE | Queue arguments (TTL, expiry, length limit, DLX, quorum/stream queues) |
| `persistent:true` | SEND | Message is persisted (if the queue is durable) |
| `reply-to` | SEND | Reply destination, e.g. `/temp-queue/r` |
| `x-stream-offset` | SUBSCRIBE | Where to start reading a stream queue |

### 7.5.3 User destinations with RabbitMQ (avoid queue leaks)
Spring's `/user/queue/x` becomes `/queue/x-user{sessionId}` → RabbitMQ creates a **durable-ish named queue per
session** that may outlive the session. Spring's docs recommend using destinations that RabbitMQ makes
**auto-delete**, e.g. have clients subscribe to `/user/exchange/amq.direct/position-updates` and send with
`convertAndSendToUser(user, "/exchange/amq.direct/position-updates", payload)`. Then the per-session queue
is auto-deleted when the session ends. Alternatively set `x-expires`/policies on such queues. **Monitor queue
counts** in production: a steadily growing count = leak.

### 7.5.4 RabbitMQ operational tips
* Use **quorum queues** for durable work queues; classic queues for transient per-session queues.
* Set **policies** (`rabbitmqctl set_policy`) for TTL/expiry/max-length instead of per-subscribe headers where possible.
* Watch: connections count, channels, memory alarms (publishers get **blocked**), file descriptors, unacked messages.
* For very high fan-out to browsers, consider **RabbitMQ Web STOMP** directly (browsers connect to RabbitMQ), but then you lose Spring's `@MessageMapping`, auth integration and user destinations; and you expose the broker to the internet. Most enterprises keep Spring in front.

---

## 7.6 ActiveMQ Classic and ActiveMQ Artemis

**ActiveMQ Classic** (`activemq.xml`):
```xml
<transportConnectors>
  <transportConnector name="stomp" uri="stomp://0.0.0.0:61613?transport.maxFrameSize=1048576"/>
  <transportConnector name="ws" uri="ws://0.0.0.0:61614"/>
</transportConnectors>
```
`/queue/x` → JMS queue `x`; `/topic/x` → JMS topic `x`. Supports JMS-style `selector` header on SUBSCRIBE,
durable topic subscriptions (`activemq.subscriptionName` + client-id), `persistent:true` on SEND.

**ActiveMQ Artemis**: acceptors in `broker.xml`, e.g.
```xml
<acceptor name="stomp">tcp://0.0.0.0:61613?protocols=STOMP;anycastPrefix=/queue/;multicastPrefix=/topic/</acceptor>
```
`anycastPrefix`/`multicastPrefix` map `/queue/` to anycast (point-to-point) and `/topic/` to multicast (pub/sub).
STOMP over WebSocket is supported on acceptors (the default all-protocols acceptor on 61616 accepts it too).

---

## 7.7 The backplane pattern (simple broker + Redis/Kafka)

When you want horizontal scale **without** one broker TCP connection per user:

```
 clients ──ws──► instance A (simple broker) ─┐                ┌─► instance A re-publishes locally
 clients ──ws──► instance B (simple broker) ─┼── Redis pub/sub ┼─► instance B re-publishes locally
 clients ──ws──► instance C (simple broker) ─┘   (or Kafka)    └─► instance C re-publishes locally
```

1. Any instance that wants to broadcast publishes to Redis (or Kafka), **not** directly to its local broker.
2. Every instance subscribes to Redis and, on receive, calls `SimpMessagingTemplate.convertAndSend(...)` locally.
3. Each local simple broker delivers to its own connected clients.

```java
public record ClusterEnvelope(String destination, String user, String payloadJson, Map<String, String> headers) {}

@Service
@RequiredArgsConstructor
public class ClusterMessaging {
    private final StringRedisTemplate redis;
    private final ObjectMapper json;

    public void broadcast(String destination, Object payload) throws JsonProcessingException {
        redis.convertAndSend("ws-broadcast", json.writeValueAsString(
            new ClusterEnvelope(destination, null, json.writeValueAsString(payload), Map.of())));
    }
    public void toUser(String user, String destination, Object payload) throws JsonProcessingException {
        redis.convertAndSend("ws-broadcast", json.writeValueAsString(
            new ClusterEnvelope(destination, user, json.writeValueAsString(payload), Map.of())));
    }
}

@Configuration
public class RedisBackplaneConfig {
    @Bean
    RedisMessageListenerContainer container(RedisConnectionFactory cf, SimpMessagingTemplate messaging, ObjectMapper json) {
        var c = new RedisMessageListenerContainer();
        c.setConnectionFactory(cf);
        c.addMessageListener((message, pattern) -> {
            try {
                ClusterEnvelope env = json.readValue(message.getBody(), ClusterEnvelope.class);
                Object payload = json.readTree(env.payloadJson());
                if (env.user() == null) messaging.convertAndSend(env.destination(), payload);
                else messaging.convertAndSendToUser(env.user(), env.destination(), payload);  // no-op if user not on this node
            } catch (IOException e) { /* log + metric */ }
        }, new ChannelTopic("ws-broadcast"));
        return c;
    }
}
```

Trade-offs:
* **Redis pub/sub** is fire-and-forget (at-most-once): if an instance is disconnected from Redis briefly, it misses messages. **Redis Streams** or **Kafka** give replay at the cost of complexity.
* Every instance receives every message (fine up to a point). For huge scale, **shard** channels (e.g., per room/tenant) and only subscribe to shards with local subscribers.
* Simple and cheap; very common in practice.

---

## 7.8 Capacity planning

### 7.8.1 How many connections can one server hold?
It depends on memory per connection and message rate, not a magic number. Rough components per connection
in a Spring/Tomcat stack: socket buffers (kernel), Tomcat WebSocket session and buffers (the 8 KB default text/binary
buffers are allocated per session), Spring session objects, `ConcurrentWebSocketSessionDecorator` buffers when
clients are slow, the subscription registry entries, plus your own per-session state.

**Measure it:** load test with N idle connections, then N connections × your real message rate, and watch heap,
GC, CPU, and p99 latency. Many teams see **tens of thousands of mostly idle STOMP connections per instance** on a
few GB of heap; heavy traffic lowers that.

### 7.8.2 OS and network limits
* **File descriptors:** each socket = 1 fd. Raise `ulimit -n` (e.g., `LimitNOFILE=1000000` in systemd, container `ulimits`).
* **Ephemeral ports** between a proxy and backend: one (src IP, dst IP, dst port) tuple supports ~28k–64k concurrent connections (`net.ipv4.ip_local_port_range`). For huge numbers, add more backend IPs/ports or more proxy IPs.
* **Kernel tuning:** `net.core.somaxconn`, `tcp_max_syn_backlog` for reconnect storms; TCP keepalive settings.
* **Memory for TLS:** TLS sessions add memory. Terminate TLS at the load balancer to offload, or account for it.

### 7.8.3 Fan-out math (the hidden cost)
Messages/second **delivered** = messages/sec published × subscribers per message.
Example: 100 rooms × 1 msg/s × 1,000 users per room = **100,000 deliveries/s**. The outbound channel and network,
not your controllers, become the bottleneck. Mitigations: batching/coalescing (send the latest state every 100–250 ms
instead of every tick), deltas instead of full objects, binary formats, smaller audiences (shard topics), and
dropping intermediate updates for slow clients.

---

## 7.9 Load balancers and reverse proxies

### 7.9.1 Requirements
1. Forward `Upgrade` and `Connection` headers (HTTP/1.1 to backend).
2. Long **idle/read timeouts** (or rely on heart-beats shorter than the timeout).
3. **Sticky sessions**: **not needed for pure WebSocket** (one TCP connection stays on one backend), but **required for SockJS HTTP fallbacks** and helpful if you keep server-side state across reconnects.
4. Balance by **least connections** rather than round-robin (connections are long-lived).
5. **Connection draining** on deploys.

### 7.9.2 Nginx

```nginx
map $http_upgrade $connection_upgrade {
    default upgrade;
    ''      close;
}

upstream realtime_backend {
    least_conn;
    server app1:8080 max_fails=3 fail_timeout=10s;
    server app2:8080 max_fails=3 fail_timeout=10s;
    # ip_hash;   # or sticky (nginx plus / cookie) if you use SockJS fallbacks
}

server {
    listen 443 ssl;
    server_name api.example.com;
    # ssl_certificate ...;

    location /ws {
        proxy_pass http://realtime_backend;
        proxy_http_version 1.1;                          # REQUIRED (Upgrade is HTTP/1.1)
        proxy_set_header Upgrade $http_upgrade;          # REQUIRED (hop-by-hop headers aren't forwarded by default)
        proxy_set_header Connection $connection_upgrade; # REQUIRED
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 3600s;                        # default 60s; keep > heart-beat interval at least
        proxy_send_timeout 3600s;
        proxy_buffering off;
    }
}
```

> Spring behind a proxy: set `server.forward-headers-strategy=framework` (or `native`) so Spring sees the
> original scheme/host. This matters for **origin checks** and SockJS URLs.

### 7.9.3 HAProxy
```
defaults
    timeout connect 5s
    timeout client  60s
    timeout server  60s
    timeout tunnel  1h          # applies once the connection is upgraded to WebSocket
backend realtime
    balance leastconn
    server app1 10.0.0.1:8080 check
    server app2 10.0.0.2:8080 check
```

### 7.9.4 Cloud load balancers (verify current limits in provider docs)
* **AWS ALB:** native WebSocket support; idle timeout default **60 s** (raise it, and heart-beat below it). Stickiness is optional (needed for SockJS).
* **AWS NLB:** TCP passthrough; TCP idle timeout default 350 s.
* **AWS API Gateway WebSocket APIs:** managed connections with Lambda integrations. It doesn't speak STOMP natively; it has limits such as 2-hour max connection duration, 10-minute idle timeout, 128 KB messages.
* **GCP HTTP(S) LB:** WebSockets supported; the backend service **timeout** acts as the max connection lifetime for WebSockets (default 30 s, so raise it!).
* **Azure Application Gateway / Front Door:** WebSocket supported; check idle timeouts.
* **Cloudflare:** proxies WebSockets; idle connections without traffic may be closed after ~100 s; also connections can be closed during Cloudflare deploys → reconnect logic.

### 7.9.5 Kubernetes
* **Service** type ClusterIP/LoadBalancer works (TCP).
* **Ingress (NGINX-based):** WebSocket works; raise timeouts:
  ```yaml
  metadata:
    annotations:
      nginx.ingress.kubernetes.io/proxy-read-timeout: "3600"
      nginx.ingress.kubernetes.io/proxy-send-timeout: "3600"
      # for SockJS fallbacks:
      nginx.ingress.kubernetes.io/affinity: "cookie"
  ```
  (The community `ingress-nginx` controller has been announced for retirement; many clusters are moving to **Gateway API** implementations such as Envoy Gateway, Istio, NGINX Gateway Fabric, or cloud-native gateways. Check WebSocket timeout settings on whichever you use.)
* **Istio/Envoy:** WebSocket upgrade supported; set route `timeout: 0s` (disabled) or long; idle timeouts via `DestinationRule`/`EnvoyFilter` (`idle_timeout`).
* **HPA:** CPU-based autoscaling is a poor fit (idle connections use memory, not CPU). Scale on **connection count** or **memory** with custom metrics.
* **Imbalance after scale-out:** new pods get no existing connections. Options: accept it; enforce a **max connection age** (server closes connections older than X hours with jitter, clients reconnect and spread); use least-connections balancing.

---

## 7.10 Deployments without pain

When a pod/instance stops, all its WebSocket clients disconnect. To make that harmless:

1. **Clients reconnect** automatically with **jitter** (spread the herd).
2. **Readiness first:** on shutdown, mark the instance **not ready** (remove from LB) before closing connections. In Kubernetes, use a `preStop` hook (e.g., `sleep 10`) so endpoints update.
3. **Close gracefully:** Spring closes sessions when the context stops (`SubProtocolWebSocketHandler` closes sessions with status **1001 Going Away**). Clients should treat 1001/1012 as "reconnect soon".
4. **`terminationGracePeriodSeconds`** long enough for in-flight work.
5. **Roll slowly** (maxUnavailable small) so the remaining pods can absorb reconnects; scale up before deploying if needed.
6. **Resync after reconnect** (REST fetch "since last event id") so nobody misses updates during the switch.
7. **Version compatibility:** during rolling deploys old and new servers run side by side. Keep message formats **backward compatible** (add fields, don't rename/remove; version your payloads).

Spring Boot: `server.shutdown=graceful` waits for active **HTTP requests**; WebSocket sessions are closed when
the WebSocket infrastructure stops. Test your shutdown sequence explicitly.

---

## 7.11 Managed real-time services (when not to build it yourself)

| Service | STOMP? | Notes |
|---------|--------|-------|
| Amazon MQ (ActiveMQ/RabbitMQ) | Yes (broker) | Managed broker for the Spring relay |
| AWS API Gateway WebSocket | No | Custom JSON; Lambda-based; connection IDs |
| Azure Web PubSub / SignalR Service | No STOMP | Own protocols (and MQTT for Web PubSub) |
| Pusher, Ably, PubNub | No | SaaS pub/sub with SDKs, presence, history |
| CloudAMQP | Yes (RabbitMQ) | Managed RabbitMQ with STOMP plugin |

Choose managed services when real-time isn't your core competency and the cost/lock-in is acceptable.

---

## 7.12 Chapter summary

* Simple broker = in-memory, single-node, partial STOMP. Relay = external broker, cluster-ready, full STOMP, one TCP connection per client to the broker.
* For multi-instance user destinations: `userDestinationBroadcast` + `userRegistryBroadcast`.
* RabbitMQ: `/exchange`, `/queue`, `/amq/queue`, `/topic` (amq.topic, `*`/`#`, dot-separated), `/temp-queue`; watch for per-session queue leaks.
* Backplane alternative: simple broker on each node + Redis/Kafka fan-out.
* Proxies must forward Upgrade/Connection and have long timeouts. Sticky sessions only for SockJS fallbacks.
* Plan capacity on connections, memory, fan-out; deploy with draining + jittered reconnect + resync.

Next: [Chapter 8: Security](08-security.md)
