# Appendix B: Runnable Sample: Real-Time Shared To-Do Lists (Spring Boot + STOMP + TypeScript/React Native)

A small but **production-shaped** project that puts the book's patterns into working, tested code.
Companion to [The WebSocket + STOMP Book](../../docs/websocket-stomp-guide/README.md).

```
examples/stomp-todo/
├── server/   Spring Boot 4.1 (Spring Framework 7, Spring Security 7, Java 21): STOMP over WebSocket
├── client/   TypeScript client for web / Node / React Native + React hook + runnable demos
├── docker-compose.yml + rabbitmq/   RabbitMQ with the STOMP plugin (for relay mode)
└── README.md (this file)
```

## What it demonstrates (and where the book explains it)

| Feature | Where in the code | Book chapter |
|---|---|---|
| STOMP endpoint, `/app` + `/topic` + `/queue` + `/user` prefixes | `server/.../ws/WebSocketConfig.java` | 5 |
| Simple broker **with heart-beats** (TaskScheduler), SpEL selector disabled | `WebSocketConfig#configureMessageBroker` | 4, 5, 8 |
| Broker relay switch (`app.broker.mode=relay`) incl. multi-instance user destinations | same | 7 |
| **JWT on the CONNECT frame**, token expiry enforced on later frames | `ws/JwtConnectInterceptor.java` | 8 |
| Message authorisation, **deny by default**, without the CSRF-on-CONNECT of `@EnableWebSocketSecurity` | `WebSocketConfig#messageAuthorizationManager` | 8 |
| **Per-list membership checks on SUBSCRIBE** (IDOR protection) | `ws/SubscriptionGuard.java` | 8 |
| Per-session **rate limiting** | `ws/RateLimitInterceptor.java` | 8 |
| Clean, non-leaky **STOMP ERROR frames** | `ws/CustomStompErrorHandler.java` | 5, 8 |
| `@SubscribeMapping` snapshot, `@MessageMapping` commands, `@SendToUser(broadcast=false)` acks | `ws/TodoWsController.java` | 5 |
| Business errors as MESSAGEs on `/user/queue/errors` (connection survives) | `ws/WsExceptionHandlers.java` | 4, 5 |
| **Per-list sequence numbers**, **idempotency keys**, **optimistic versions**, bounded event log | `todo/TodoService.java` | 9, 11 |
| REST **snapshot + resync** endpoints (`410 Gone` → reload) | `web/ApiController.java` | 9 |
| Presence (multi-tab aware, idempotent disconnect handling) | `ws/PresenceTracker.java` | 5 |
| Transport limits (size, send buffer/time, time-to-first-message) | `WebSocketConfig#configureWebSocketTransport` | 5, 9 |
| Integration tests with a real `WebSocketStompClient` (11 tests) | `server/src/test/...` | 10 |
| Client: one connection, token refresh, heart-beats, **exponential backoff + jitter**, re-subscribe on reconnect | `client/src/TodoRealtimeClient.ts` | 3, 6 |
| Client: **subscribe-then-snapshot**, duplicate dropping, **gap detection + resync**, command outbox + acks | same | 9 |
| React / React Native hook | `client/src/useTodoList.ts` | 6 |

## Prerequisites

* Java 21+, Maven 3.9+ (server)
* Node.js 22+ (client demos use the built-in `WebSocket` and `fetch`)
* Docker (only for relay mode)

## Run it

```bash
# 1) server
cd examples/stomp-todo/server
mvn spring-boot:run            # http://localhost:8080, STOMP endpoint ws://localhost:8080/ws

# 2) client demo (another terminal)
cd examples/stomp-todo/client
npm install
npm run demo
```

Demo users: **anna** and **bob** share list **L1**; **carol** owns **L2** only. Tokens come from a
**dev-only** endpoint (`POST /api/dev-token {"user":"anna"}`), which you disable with `app.dev-tokens=false`.

Output from a real run of `npm run demo`:

```
bob status: live
bob sees L1 @seq 0: (empty)

--- anna adds two items
bob sees L1 @seq 1: [ ] Buy milk (v1)
bob sees L1 @seq 2: [ ] Buy milk (v1) | [ ] Walk the dog (v1)

--- anna completes "Buy milk"
bob sees L1 @seq 3: [x] Buy milk (v2) | [ ] Walk the dog (v1)

--- anna retries the same command twice (same clientRequestId)
bob sees L1 @seq 4: [x] Buy milk (v2) | [ ] Walk the dog (v1) | [ ] Only once please (v1)
first ack duplicate=false, second ack duplicate=true

--- anna edits with a stale version → CONFLICT (connection stays open)
anna got: CONFLICT

--- carol (not a member) tries to read L1 over REST
carol GET /api/lists/L1 → HTTP 403
```

### Resilience demo (reconnect, re-subscribe, resync)

```bash
npm run resilience      # then restart the server when it says so
```
In a real run, after the restart bob went `reconnecting` → (backoff 2.2 s, then 4.4 s) → `live`, re-subscribed, noticed the
server's sequence went **backwards** (in-memory state lost), reloaded the snapshot, and then received the new item live.

### Tests

```bash
cd server && mvn test     # 11 end-to-end tests: auth, forged tokens, snapshot, broadcast order, idempotency,
                          # conflicts, validation, forbidden subscriptions, spoofed topic publishes, REST resync
cd ../client && npm run typecheck
```

## Use it from this React Native app

```tsx
// App.tsx (sketch)
import { TodoRealtimeClient } from './examples/stomp-todo/client/src/TodoRealtimeClient';
import { useTodoList } from './examples/stomp-todo/client/src/useTodoList';

const client = new TodoRealtimeClient({
  baseUrl: 'http://10.0.2.2:8080',      // Android emulator → your machine. iOS simulator: http://localhost:8080
  getToken: () => auth.getFreshToken(),  // your auth
  reactNative: true,                     // stompjs NULL-byte workarounds (forceBinaryWSFrames, appendMissingNULLonIncoming)
});
client.start();                          // after login; client.stop() on logout

function ListScreen() {
  const { state, status, add, toggle } = useTodoList(client, 'L1');
  // render state.items, show `status` ("reconnecting", ...) in the UI
}
```
Add `@stomp/stompjs` to the app's dependencies. Android 9+ and iOS block cleartext `ws://` by default; use `wss://` or a
dev-only exception. Reconnect on `AppState` `active`; use push notifications for background delivery (Chapter 6).

## Relay mode (RabbitMQ)

```bash
cd examples/stomp-todo
docker compose up -d                       # RabbitMQ + STOMP plugin on 61613, UI on 15672
cd server
mvn spring-boot:run -Dspring-boot.run.arguments="--app.broker.mode=relay --app.broker.relay.client-login=stomp --app.broker.relay.client-passcode=stomp-dev-password --app.broker.relay.system-login=stomp --app.broker.relay.system-passcode=stomp-dev-password"
```

> **Honesty note:** the relay configuration compiles and follows Spring's documentation, but it was **not executed** while
> writing this sample (no Docker daemon was available). Simple-broker mode was fully tested. Also note: with RabbitMQ,
> Spring's `/user/queue/...` destinations become per-session queues that RabbitMQ makes **durable and not auto-deleted**
> by default. For production, switch to auto-delete destinations (e.g., `/user/exchange/amq.direct/acks`) or add an
> expiry policy (Chapter 7 §7.5.3).

## Things deliberately left simple (do these in production)

* **Storage is in memory.** Restarting loses data, and multiple server instances don't share it. Use a database; publish
  events after commit or through an outbox (Chapter 9).
* **HS256 dev tokens.** Validate tokens from your identity provider (issuer URI / JWKS) instead, and remove the dev-token endpoint.
* **Presence is per instance.** Use Redis with TTLs in a cluster.
* **Allowed origins** are localhost only (`app.allowed-origin-patterns`).
* Add metrics (session gauges, executor queues, close codes), alerts and load tests (Chapter 9).

## Two production gotchas this sample uncovered (now in the book)

1. **`setPreserveReceiveOrder(true)` swallows inbound interceptor exceptions** (Spring Framework 7.0.x, checked in
   `OrderedMessageChannelDecorator`): a rejected CONNECT or SUBSCRIBE is only logged. The client gets **no ERROR frame
   and the connection stays open**, so the client just hangs. This sample therefore doesn't enable it. See Chapter 10, bug C10.
2. **stompjs `beforeConnect` must never throw**: stompjs 7.x awaits it without a try/catch, so a failing token fetch
   (e.g., auth server down) becomes an unhandled rejection and **silently stops the reconnect loop**. Also, with
   Node's WebSocket a connection attempt can get stuck; `discardWebsocketOnCommFailure: true` lets the reconnect continue.
   See Chapter 10, bugs G11 and G12.
