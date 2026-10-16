# Chapter 11: Architecture, Design Patterns & Organisational Best Practices

> **Goal:** design real-time systems the way strong senior engineers and architects do, and run them in a
> big organisation with many teams, environments, audits and on-call rotations.

---

## 11.1 ELI5

Building one walkie-talkie is easy. Running a **city-wide radio network** means rules: who gets which channel,
what words to use, what to do when a tower breaks, how to add new channels without confusing old radios, and who
fixes things at 3 a.m. That's what this chapter is about.

---

## 11.2 Decision framework: should this feature be real-time at all?

Ask:
1. **Does the user need it within seconds?** If minutes are fine → polling/refresh/email.
2. **Direction?** Server→client only → consider **SSE**. Both ways, high frequency → **WebSocket**.
3. **Online only?** Offline users need **push notifications / inbox** anyway.
4. **Audience size per message?** 1 (private) vs 10 (room) vs 1M (broadcast) changes the design.
5. **Message rate?** 1/min vs 50/s per client: conflation, binary formats.
6. **Consistency needs?** Is missing an event acceptable? (UI hint → yes; balance update → no → resync/ack design.)
7. **Ops maturity?** Stateful infra, brokers, on-call. Or buy a managed service.

**Why STOMP (vs raw WebSocket/custom JSON)?** Standard framing, pub/sub semantics, Spring integration
(`@MessageMapping`, user destinations, security), broker interoperability, mature clients. **Why not?** Very
high-frequency binary data (games, audio), non-Spring stacks where Socket.IO/SignalR are idiomatic, or when you
need features STOMP lacks (built-in replay → consider Kafka-backed gateways, Ably, etc.).

### Architecture Decision Record (ADR) template
```
# ADR-012: Real-time updates for shared to-do lists
Status: Accepted (2026-10-01)
Context: Users collaborate on lists; changes must appear on other devices within 2s. Mobile + web.
Decision: STOMP over WebSocket via Spring Boot "realtime-gateway"; RabbitMQ relay in prod; JWT in CONNECT;
          events carry per-list sequence numbers; clients resync via REST after reconnect.
Alternatives: SSE (no client→server channel needed? we need typing/presence → rejected), polling (latency/cost),
          Firebase (data residency), Socket.IO (Java stack).
Consequences: Stateful service to operate; RabbitMQ capacity planning; need LB timeouts; on-call runbook.
```

---

## 11.3 Reference architecture for a company

```
                      ┌───────────────── Edge ──────────────────┐
 Web / Mobile ─wss──► │ CDN/WAF → L7 Load Balancer (timeouts,   │
                      │ origin allow-list, connection limits)    │
                      └───────────────┬─────────────────────────┘
                                      ▼
                     ┌──────────────────────────────────┐
                     │   Realtime Gateway (Spring Boot) │  N stateless-ish instances
                     │   - STOMP endpoint /ws           │  (state = live connections)
                     │   - AuthN (JWT on CONNECT)       │
                     │   - AuthZ (subscribe/send rules) │
                     │   - Thin @MessageMapping → calls │
                     │     domain services via REST/gRPC│
                     └──────┬──────────────▲────────────┘
                            │ relay / backplane
                            ▼              │
                     ┌───────────────────────────────┐
                     │ RabbitMQ (STOMP) / Redis / Kafka│
                     └──────▲────────────────────────┘
                            │ domain events (outbox → Kafka → gateway consumer)
          ┌─────────────────┴──────────────────┐
          │ Domain services (orders, todo, chat)│  own their DB; never hold sockets
          └─────────────────────────────────────┘
```

Principles:
* **Separate the real-time gateway** from domain services. Domain teams publish **events**; the gateway owns connections, auth, fan-out. Domain services stay stateless and independently deployable.
* **Events in, pushes out:** the gateway consumes domain events (Kafka/RabbitMQ) and maps them to STOMP destinations, so domain teams don't need to know about WebSockets.
* **Commands via REST** (or `/app` messages forwarded to services). Many companies send **commands over HTTP** (easy auth, idempotency, retries, observability) and use WebSocket **only for server→client pushes**. That's a valid, simpler design.
* **Gateway is horizontally scalable**; connection state is disposable (clients reconnect + resync).

---

## 11.4 Destination naming conventions (write them down!)

A consistent, documented scheme prevents bugs and security holes.

```
Client → server (commands)       /app/{domain}.{action}              /app/todo.upsert, /app/chat.send
Public broadcast                  /topic/{domain}.{scope}             /topic/system.announcements
Entity-scoped                     /topic/{domain}.{entityType}.{id}   /topic/todo.list.L1, /topic/chat.room.42
Tenant-scoped                     /topic/t.{tenantId}.{domain}...     /topic/t.acme.orders.123
Private per user                  /user/queue/{purpose}               /user/queue/notifications, /user/queue/errors
Request/reply initial data        /app/{domain}.{resource}            (@SubscribeMapping) /app/todo.lists
```

Rules:
* **Dots** as separators (RabbitMQ-friendly), lowercase, no spaces.
* IDs must be **validated** (regex) and **authorised**.
* Never encode secrets or PII (emails) in destinations (they appear in logs and broker UIs).
* Keep a **registry** (AsyncAPI) of every destination: owner team, payload schema, auth rule, rate.

---

## 11.5 Message envelope and versioning

Use a consistent envelope for every event:

```jsonc
// (comments added for explanation; real JSON has none)
{
  "id": "01J9Z6Q7T4M8K2H5V3B1C0D9EF",          // unique event id (ULID/UUID) for dedupe
  "type": "todo.item.updated",                  // event type
  "version": 2,                                  // schema version of `data`
  "seq": 1842,                                   // per-entity sequence for ordering/gap detection
  "occurredAt": "2026-10-15T10:21:33.120Z",
  "correlationId": "c-7f2a…",                    // trace across systems / ties to clientRequestId
  "actor": { "id": "u-123", "type": "user" },
  "data": { "listId": "L1", "itemId": "I9", "title": "Buy milk", "done": true }
}
```

Versioning rules (consumers in the field may be **old app versions for months**, especially mobile):
* **Additive changes only** within a version (add optional fields; never remove/rename/retype).
* Clients **ignore unknown fields** and unknown event `type`s.
* Breaking change → new `version` or new `type`, and the server sends **both** until old clients are gone (or negotiate by client version sent in CONNECT headers, e.g., `client-version: 5.2.0`).
* Track client versions in metrics to know when it's safe to drop old formats.

### AsyncAPI (document your real-time API like OpenAPI documents REST)

```yaml
asyncapi: 3.0.0
info: { title: Realtime Gateway, version: 1.4.0 }
servers:
  production:
    host: api.example.com
    pathname: /ws
    protocol: wss          # STOMP over WebSocket; document the STOMP layer in description/bindings
channels:
  todoList:
    address: /topic/todo.list.{listId}
    parameters: { listId: { description: "List id, must be a member" } }
    messages:
      itemUpdated: { $ref: '#/components/messages/TodoItemUpdated' }
operations:
  receiveTodoUpdates:
    action: receive
    channel: { $ref: '#/channels/todoList' }
components:
  messages:
    TodoItemUpdated:
      payload:
        type: object
        required: [id, type, seq, data]
        properties:
          id: { type: string }
          type: { const: todo.item.updated }
          seq: { type: integer }
          data: { $ref: '#/components/schemas/TodoItem' }
```

Generate docs and TypeScript/Java types from it; validate in CI.

---

## 11.6 Design patterns catalogue

| Pattern | Problem | Solution |
|---------|---------|----------|
| **Notification + fetch** | Big payloads, consistency | Push small "changed (id, version)" events; client fetches via REST |
| **Snapshot + stream** | Initial state + live updates without gaps | Subscribe first, fetch snapshot (or `@SubscribeMapping`), apply buffered events with seq > snapshot version |
| **Resync on reconnect** | Missed events while offline | Client stores last seq; REST `?after=seq` or full reload |
| **Idempotent commands** | Retries cause duplicates | `clientRequestId` + server dedupe |
| **Optimistic UI** | Latency | Apply locally, reconcile on server event, roll back on error |
| **Conflation** | High-frequency updates | Latest-value-per-key every X ms |
| **Batching** | Many tiny messages | Send arrays every X ms |
| **Fan-out on write** | Broadcast to many | Broker/backplane fan-out, topic per scope |
| **Request/reply over STOMP** | RPC-like call | `@SendToUser(broadcast=false)` reply or `reply-to` + `correlation-id` headers |
| **Presence with TTL** | Who's online across a cluster | Redis keys with TTL refreshed by heart-beats/events; publish presence changes |
| **Outbox** | Reliable event publishing | Event row in same transaction; relay publishes |
| **Gateway pattern** | Many teams, one connection | Central real-time gateway consuming domain events |
| **Backplane** | Scale simple broker | Redis/Kafka fan-out between nodes |
| **Circuit breaker on push** | Downstream overload | Shed non-critical events (typing indicators) first |

---

## 11.7 Worked designs (interview-ready)

### 11.7.1 Chat application (Slack/WhatsApp-like, web + mobile)
* **Destinations:** `/topic/chat.room.{roomId}` (channels), `/user/queue/dm` (direct messages), `/user/queue/receipts` (delivered/read), `/topic/chat.room.{roomId}.typing` (ephemeral).
* **Send:** `/app/chat.send` with `clientMsgId`; server validates membership, persists (DB with per-room `seq`), then publishes after commit.
* **History:** REST paginated `GET /rooms/{id}/messages?before=seq`.
* **Reliability:** clients dedupe by `clientMsgId`/`id`, detect gaps with `seq`, resync on reconnect; offline → push notification.
* **Typing indicators:** ephemeral, rate-limited (max 1 per 3 s per user), never persisted, dropped first under load.
* **Read receipts:** batched ("read up to seq N"), not per message.
* **Presence:** Redis TTL keys, publish only changes; for huge orgs, presence only for contacts/visible users.
* **Scale:** gateway + RabbitMQ relay or Kafka partitioned by roomId → per-room ordering.
* **Security:** room membership checked on SUBSCRIBE and SEND; sender from Principal; XSS-safe rendering; attachments via pre-signed URLs, not over the socket.

### 11.7.2 Notification system
* `/user/queue/notifications` for online users; persist all in an **inbox table** (unread counts via REST).
* Domain services emit events → notification service decides channels (in-app, push, email) → gateway pushes in-app.
* On connect: client fetches unread count + latest notifications via REST, then listens.

### 11.7.3 Live dashboard / stock ticker
* `/topic/prices.{symbol}`; client subscribes only to visible symbols.
* **Conflation** (e.g., 4–10 updates/s per symbol), deltas, binary encoding for very high rates.
* Slow clients get dropped (send limits) and resync with snapshot.
* Separate critical (order fills: `/user/queue/fills`, at-least-once with resync) from best-effort market data.

### 11.7.4 Collaborative to-do list (this repo's domain)
* Events per list with `seq`; snapshot via `@SubscribeMapping("/todo.list.{id}")` or REST.
* Conflict handling: optimistic concurrency (`expectedVersion`) → conflict error to `/user/queue/errors` → client refetches item.
* Offline-first mobile: local DB (SQLite/WatermelonDB/Realm), outbox of commands with `clientRequestId`, replay on reconnect.
* For rich-text **collaborative editing** use OT/CRDT (e.g., Yjs/Automerge). Those usually have their own sync protocol over WebSocket; STOMP can carry their binary updates but is rarely the best fit.

### 11.7.5 Live location tracking (delivery app)
* Driver app publishes location every 3–5 s to `/app/driver.location` (HTTP is also fine).
* Server stores latest location (Redis GEO), publishes to `/topic/order.{orderId}.location` for the customer (authorised to that order only).
* Conflate; send only when moved > N meters.

### 11.7.6 Long-running job progress
* Client starts job via REST → gets `jobId`.
* Subscribes to `/user/queue/jobs` or `/topic/job.{jobId}` (authorised).
* Worker publishes progress via the event pipeline; final state persisted; client polls REST once on reconnect.

---

## 11.8 Organisational best practices

### 11.8.1 Ownership and governance
* One team owns the **real-time platform** (gateway, broker, client SDK, docs, runbooks). Domain teams own **their events**.
* **Destination registry** (AsyncAPI) reviewed like an API change; security review for new destinations (auth rule mandatory).
* **Shared client SDK** (TypeScript + Kotlin/Swift wrappers) encapsulating connection, reconnect, resync, auth, metrics. Teams shouldn't each write their own STOMP setup.

### 11.8.2 Environments and configuration
* Same topology in staging as prod (proxy, LB timeouts, broker relay). "Works in dev with simple broker, fails in prod with RabbitMQ" is a classic.
* Externalise: allowed origins, broker host/creds (secret manager), heart-beat values, limits, feature flags.
* Never commit broker passwords; rotate credentials.

### 11.8.3 Code organisation (Spring)
```
realtime-gateway/
  config/        WebSocketConfig, WebSocketSecurityConfig, BrokerRelayConfig, TransportLimits
  security/      JwtConnectInterceptor, SubscriptionGuard, RateLimitInterceptor, CustomStompErrorHandler
  controller/    *WsController (thin: validate, authorise, delegate)
  events/        Domain event consumers → SimpMessagingTemplate publishers
  presence/      PresenceService (Redis)
  metrics/       WsMetrics, executor binders
  docs/          asyncapi.yaml
```
* Controllers thin; business logic in services (testable without sockets).
* All destination strings in **one constants class** (no string typos scattered around).

### 11.8.4 Code review checklist for real-time changes
- [ ] New destination documented (AsyncAPI) with schema, owner, auth rule.
- [ ] SUBSCRIBE/SEND authorisation implemented and tested (including negative tests).
- [ ] Identity from Principal; tenant isolation.
- [ ] Payload backward compatible; unknown fields ignored by clients.
- [ ] Event has id + seq; client handles duplicates/gaps; resync path exists.
- [ ] Published after commit/outbox.
- [ ] Rate and size reasonable; conflation if high-frequency.
- [ ] No blocking calls in handlers without pool sizing.
- [ ] Metrics/logs added; no PII/tokens logged.
- [ ] Client unsubscribes on cleanup.

### 11.8.5 SLOs and on-call
Example SLOs:
* **Connection success rate** ≥ 99.5% (successful CONNECTED / attempts, excluding auth failures).
* **Push latency** p95 < 1 s from event commit to client receipt (sampled).
* **Unexpected disconnect rate** < X per connection-hour.

Runbook entries (each with symptoms, dashboards, mitigation, escalation):
1. Mass disconnect / reconnect storm.
2. Broker unavailable (relay).
3. Auth failures spike (JWKS/IdP problem, clock skew, key rotation).
4. Memory pressure on gateway pods.
5. Message lag / backlog in broker or Kafka consumer.
6. Single tenant/customer can't connect (proxy, origin, firewall).

### 11.8.6 Release practices
* Rolling deploys with **connection draining** and jittered client reconnect.
* **Canary** gateway instances: route a small % of new connections; compare error/close-code rates.
* **Feature flags** for new event types (server sends only when flag on; client ignores unknown types anyway).
* Mobile: keep old payload versions alive long enough; force-upgrade path for truly breaking changes.
* Chaos drills: kill a gateway pod, restart a broker node, inject latency. Verify recovery and resync.

### 11.8.7 Compliance and audit
* Data residency: brokers and gateways in the right region; per-region topics.
* Retention: real-time messages that matter must also be persisted (audit/compliance), not only pushed.
* Access logs: who connected when, from where (IP), which user, close reason.
* Pen tests include WebSocket (CSWSH, IDOR on subscriptions, injection, DoS).

---

## 11.9 Anti-patterns (and what to do instead)

| Anti-pattern | Why it's bad | Do instead |
|--------------|--------------|------------|
| One WebSocket per component/screen | Many sockets, duplicates, leaks | One connection, shared client, ref-counted subs |
| Using WebSocket as the source of truth | Messages lost on disconnect | DB is truth; push is notification; resync |
| Sending huge payloads (files, big lists) over the socket | Size limits, head-of-line blocking, memory | Send ids/URLs, fetch over HTTP/CDN |
| Trusting `from`/`userId` in payloads | Impersonation | Principal from session |
| `setAllowedOriginPatterns("*")` with cookies | CSWSH | Allow-list |
| No authorisation on SUBSCRIBE | Data leaks (IDOR) | Per-destination ownership checks |
| Simple broker in a multi-instance deployment | Messages reach only some users | Relay or backplane |
| No heart-beats | Silent dead connections, proxy timeouts | 10–25 s heart-beats |
| Fixed-interval reconnect for everyone | Thundering herd | Backoff + jitter |
| Business logic inside interceptors | Untestable, slow | Interceptors for cross-cutting only |
| Blocking I/O in `@MessageMapping` with default pool | Latency collapse | Size pools / async |
| Publishing before DB commit | Clients see rolled-back data | After-commit listeners / outbox |
| No message schema/versioning | Breaking old mobile apps | Envelope + additive changes + AsyncAPI |
| Logging full frames in prod | Token/PII leaks, cost | Redacted, sampled logs |
| Per-message DB lookup for authorisation on every MESSAGE | Expensive | Authorise on SUBSCRIBE, revoke on change |

---

## 11.10 Migration guides

### 11.10.1 From polling to WebSocket
1. Keep the polling endpoint (fallback + resync).
2. Add WebSocket push of "changed" events; reduce polling interval to a slow safety net (e.g., 5 min) or only on reconnect.
3. Measure load reduction and latency; remove polling for supported clients later.

### 11.10.2 From simple broker to broker relay
1. Introduce RabbitMQ in staging with the STOMP plugin; dedicated users/vhost.
2. Switch `enableSimpleBroker` → `enableStompBrokerRelay` with the same prefixes; switch to `.` separators if using wildcards (affects client destinations, so plan client rollout).
3. Fix user destinations to auto-delete (`/exchange/amq.direct/...`) or add queue expiry policies.
4. Enable `userDestinationBroadcast` and `userRegistryBroadcast`.
5. Load test (broker connections = clients!); add broker monitoring; then scale gateway instances.

### 11.10.3 Removing SockJS
1. Measure the share of `HttpStream`/`HttpPoll` sessions (`WebSocketMessageBrokerStats`).
2. Add a raw WebSocket endpoint alongside SockJS (`/ws-native`), migrate clients to `brokerURL`.
3. Remove SockJS when fallback usage is negligible.

### 11.10.4 From legacy `stomp.js` (`Stomp.over`) to `@stomp/stompjs`
`Stomp.over(socket)` → `new Client({ webSocketFactory | brokerURL })`; `connect(headers, cb)` → `connectHeaders` + `onConnect`; `send(dest, headers, body)` → `publish({ destination, headers, body })`; `disconnect` → `deactivate`; move subscriptions into `onConnect`.

### 11.10.5 From `AbstractSecurityWebSocketMessageBrokerConfigurer` to `@EnableWebSocketSecurity` (mandatory for Spring Security 7, where the old class is removed)
Replace `configureInbound(MessageSecurityMetadataSourceRegistry)` rules with an `AuthorizationManager<Message<?>>` bean built from `MessageMatcherDelegatingAuthorizationManager.Builder`; handle CSRF (on by default); keep your CONNECT auth interceptor ordered before security.

---

## 11.11 Chapter summary
* Decide deliberately whether a feature needs real-time and which technology.
* Central real-time gateway + domain events is the scalable organisational pattern.
* Document destinations, schemas and auth rules (AsyncAPI); version payloads additively.
* Patterns: notification+fetch, snapshot+stream, resync, idempotent commands, conflation, outbox, presence with TTL.
* Run it like a product: SDK, runbooks, SLOs, canaries, chaos drills, security reviews.

Next: [Chapter 12: Interview Questions & Answers](12-interview-questions.md)
