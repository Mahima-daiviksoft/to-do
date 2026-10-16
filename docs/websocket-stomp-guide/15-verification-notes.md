# Appendix C: Verification Notes and Sources

> This appendix records **how the facts in this book were checked**, so you know what to trust and what to
> re-check for your own versions. Verification pass done in October 2026.

## How it was checked

The rendered documentation sites (docs.spring.io, stomp.github.io, rabbitmq.com) weren't reachable from the
environment used to write this book, so the facts were checked against **primary sources one level deeper**:

* the **source code** of Spring Framework (`main` branch, version 7.1.0-SNAPSHOT at the time), Spring Security,
  Spring Boot and Apache Tomcat,
* the **AsciiDoc sources** of the Spring Framework and Spring Security reference documentation (the same text
  that's published on docs.spring.io),
* the **RabbitMQ documentation sources** (rabbitmq-website repository),
* the published **`@stomp/stompjs` 7.5.0** npm package (its compiled source),
* web searches for cloud provider limits and industry announcements.

## Facts confirmed against source code / docs sources

| Fact (chapter) | Confirmed in |
|---|---|
| Simple broker heart-beats need a `TaskScheduler`; default becomes `10000,10000` once set; `@Lazy` hint to avoid cycles (Ch 5) | `SimpleBrokerMessageHandler` javadoc + reference doc "handle-simple-broker" |
| Simple broker read check = `max(client cx, server sy) × 3`, write = `max(client cy, server sx)` (Ch 4) | `SimpleBrokerMessageHandler.SessionInfo`, `HEARTBEAT_MULTIPLIER = 3` |
| Simple broker supports "only a subset of STOMP commands (no acks, receipts, …)" (Ch 4/7) | Reference doc "handle-broker-relay" |
| Spring sends a RECEIPT for a DISCONNECT that carries a `receipt` header (Ch 4) | `StompSubProtocolHandler#getDisconnectReceipt` |
| Relay defaults: logins `guest`, system heart-beats 10000/10000, reconnect every 5 s, "Message broker not active" error, read check ×3 (Ch 7) | `StompBrokerRelayMessageHandler` |
| Relay needs `reactor-netty` + `netty-all` (Ch 5/7) | Reference doc "handle-broker-relay" |
| Transport defaults: 64 KB message, 512 KB send buffer, 10 s send time, 60 s time to first message (Ch 5) | `WebSocketTransportRegistration` javadoc |
| Slow session closed with `CloseStatus.SESSION_NOT_RELIABLE` = **4500**; overflow strategies `TERMINATE` (default) / `DROP` (Ch 2/9) | `CloseStatus`, `ConcurrentWebSocketSessionDecorator` |
| Sessions closed with `GOING_AWAY` (1001) on shutdown (Ch 7) | `SubProtocolWebSocketHandler#stop` |
| Channel thread pools default to 2 × processors; `maxPoolSize` ineffective with unbounded queue (Ch 9) | Reference doc "configuration-performance" |
| `ChannelRegistration.executor(Executor)` since **6.2** (virtual threads) (Ch 9) | `ChannelRegistration` |
| `setPreservePublishOrder` / `setPreserveReceiveOrder` semantics (Ch 5/9) | Reference doc "ordered-messages" |
| `@Order(Ordered.HIGHEST_PRECEDENCE + 99)` for the CONNECT auth interceptor (Ch 8) | Reference doc "authentication-token-based" |
| `SessionDisconnectEvent` may be published more than once; be idempotent (Ch 5) | Reference doc "application-context-events" |
| RabbitMQ auto-delete user queues via `/exchange/amq.direct/...`; `userDestinationBroadcast` (Ch 7) | Reference doc "user-destination" |
| `@SendToUser` without a user falls back to the session id with `broadcast=false`; else `MissingSessionUserException` (Ch 10/12) | `SendToMethodReturnValueHandler` |
| `MappingJackson2MessageConverter` deprecated for removal in 7.0; `JacksonJsonMessageConverter` since 7.0 (Ch 5/6) | Source of both classes |
| `WebSocketStompClient`: heart-beat `0,0` until `setTaskScheduler`, then `10000,10000`; `connectAsync`; receipt timeout 15 s; consider disabling heart-beats when simulating many clients (Ch 6/9) | `WebSocketStompClient` + reference doc "client" |
| `@EnableWebSocketSecurity` requires CSRF on CONNECT; CSRF "not configurable" with the annotation; manual configuration alternative (Ch 8) | Spring Security reference doc "websocket" |
| `AbstractSecurityWebSocketMessageBrokerConfigurer` / `MessageSecurityMetadataSourceRegistry` **removed in Spring Security 7** (Ch 8/11) | Spring Security reference doc "websocket" |
| Spring Security secures only the inbound channel (Ch 8) | Spring Security reference doc |
| Allowed-origins default = same origin since Spring 4.1.5 (Ch 5/8) | Spring Security reference doc |
| Tomcat WebSocket text/binary buffers default **8 KB** (Ch 2/5) | Tomcat `Constants.DEFAULT_BUFFER_SIZE`, `WsWebSocketContainer` |
| Spring Boot `server.tomcat.max-connections` default **8192**, accept count 100 (Ch 10) | Spring Boot `TomcatServerProperties` |
| stompjs 7.5.0 defaults: `reconnectDelay` 5000, LINEAR/EXPONENTIAL modes (no jitter), `maxReconnectDelay` 15 min, heart-beats 10000/10000, `heartbeatToleranceMultiplier` 2, `heartbeatStrategy` Interval/Worker, `connectionTimeout` 0, `maxWebSocketChunkSize` 8 KB, RN workarounds, `TypeError: There is no underlying STOMP connection` (Ch 6) | `@stomp/stompjs` 7.5.0 package source |
| RabbitMQ: STOMP port 61613; Web STOMP 15674 `/ws`; `/queue/` queues durable, non-exclusive, non-auto-delete by default; `/topic` subscribe queues auto-delete non-durable; durable subscriptions via `durable:true` + `auto-delete:false` (Ch 7) | RabbitMQ docs sources (stomp.md, web-stomp.md) |
| WebSocket handshake Accept example `s3pPLMBiTxaQ9kYGzzhZRbK+xOo=` and masking example bytes (Ch 2) | Recomputed with OpenSSL/Python |

## Facts confirmed by web search (secondary sources; re-check provider docs for your account/region)

| Fact | Notes |
|---|---|
| ingress-nginx retired March 2026 (announced Nov 2025; reaffirmed Jan 2026) | Kubernetes blog posts |
| AWS ALB idle timeout default 60 s, range 1–4000 s | AWS docs (translated pages), re:Post |
| AWS API Gateway WebSocket: 2 h max duration, 10 min idle, 128 KB message, 32 KB frame; 1009 on oversize | AWS quota table |
| GCP HTTPS LB backend service timeout (default 30 s) acts as WebSocket max lifetime | Community + docs quotes |
| Cloudflare closes WebSockets idle for ~100 s (Enterprise can adjust) | Community/support reports |

## Not independently re-verified in this pass

* The exact wording of the STOMP 1.2 specification (the stomp.github.io source wasn't reachable). Key protocol rules
  (heart-beat formula, ack modes, header escaping and its CONNECT/CONNECTED exemption) are consistent with the Spring and
  stompjs implementations above and with spec quotations found in search results.
* RFC 6455 text (well established; examples recomputed).
* Browser-specific behaviour (bfcache, SharedWorker support, background throttling) changes often. Test your target browsers.

## Sources

* Spring Framework source and reference docs: https://github.com/spring-projects/spring-framework (published at https://docs.spring.io/spring-framework/reference/web/websocket.html)
* Spring Security WebSocket docs: https://github.com/spring-projects/spring-security (published at https://docs.spring.io/spring-security/reference/servlet/integrations/websocket.html)
* Spring Boot source: https://github.com/spring-projects/spring-boot
* Apache Tomcat source: https://github.com/apache/tomcat
* `@stomp/stompjs`: https://www.npmjs.com/package/@stomp/stompjs and https://stomp-js.github.io/
* RabbitMQ STOMP docs: https://www.rabbitmq.com/docs/stomp and https://www.rabbitmq.com/docs/web-stomp
* STOMP 1.2 specification: https://stomp.github.io/stomp-specification-1.2.html
* RFC 6455: https://www.rfc-editor.org/rfc/rfc6455
* Kubernetes ingress-nginx retirement: https://kubernetes.io/blog/2025/11/11/ingress-nginx-retirement/ and https://kubernetes.io/blog/2026/01/29/ingress-nginx-statement/
* AWS API Gateway WebSocket quotas: https://docs.aws.amazon.com/apigateway/latest/developerguide/apigateway-execution-service-websocket-limits-table.html
* AWS ALB attributes: https://docs.aws.amazon.com/elasticloadbalancing/latest/application/edit-load-balancer-attributes.html

Back to the [README](README.md).
