# Chapter 8: Security

> **Goal:** make a STOMP/WebSocket system that can't be hijacked, eavesdropped, abused, or used to read
> other users' data, and explain every attack and defence in interviews.

---

## 8.1 ELI5

Your post office needs:
1. **Locked trucks** so nobody can read letters on the road → **TLS (`wss://`)**.
2. **A guard at the door** who checks ID cards → **authentication**.
3. **Rules about mailboxes**: "You can read *your* mailbox, not your neighbour's." → **authorisation** of SUBSCRIBE and SEND.
4. **A check that the visitor really came from your own website, not a trick website** → **Origin check** (CSWSH protection).
5. **Limits** so one naughty kid can't stuff a million letters in the slot → **rate limits, size limits, connection limits**.
6. **Not trusting what's written in letters** → **input validation, output encoding**.

---

## 8.2 Threat model (memorise this list)

| # | Threat | Example | Defence |
|---|--------|---------|---------|
| 1 | Eavesdropping / tampering | Wi-Fi attacker reads chat | `wss://` only, HSTS, modern TLS |
| 2 | **Cross-Site WebSocket Hijacking (CSWSH)** | `evil.com` opens a socket to your server; the browser attaches the victim's cookie | **Check `Origin`**; don't rely on cookies alone (token in CONNECT); SameSite cookies; Spring Security CSRF on CONNECT |
| 3 | Missing authentication | Anyone connects and subscribes | Authenticate at handshake or CONNECT; reject unauthenticated frames |
| 4 | **Broken authorisation on SUBSCRIBE** | User subscribes to `/topic/orders.123` that belongs to someone else (IDOR) | Authorise every SUBSCRIBE by destination + ownership |
| 5 | Broken authorisation on SEND | User sends directly to `/topic/admin.broadcast`, bypassing your controller | Deny client SEND to broker prefixes; only allow `/app/**` |
| 6 | Wildcard subscriptions | Subscribe `/topic/**` or `/topic/orders.#` (RabbitMQ) to see everything | Deny pattern subscriptions; exact-match rules |
| 7 | Token leakage | Token in URL query → access logs, proxy logs | Tokens in CONNECT headers; short-lived one-time tickets if in URL; redact logs |
| 8 | Stale auth | Token expires/revoked but socket stays open for days | Enforce expiry on each message; server-side session termination; max connection age |
| 9 | Denial of service | Connection floods, huge frames, subscription floods, message floods, slow readers | Limits at LB and app: connections/IP, `messageSizeLimit`, rate limits, `sendBufferSizeLimit`, `timeToFirstMessage` |
| 10 | Injection | XSS via chat message rendered as HTML; SpEL injection (CVE-2018-1270) | Encode output; validate input; patch Spring; disable unused selector header |
| 11 | Information leakage | Stack traces in ERROR frames; user enumeration via presence topics | Generic error messages; authorise presence data |
| 12 | Message spoofing | Client sets `from: "admin"` in payload | **Never trust identity fields from the client**; take identity from `Principal` |
| 13 | Broker exposure | RabbitMQ Web STOMP open to internet with `guest` | Keep broker private; dedicated creds; TLS to broker |
| 14 | Compression side channels | Secrets + attacker data compressed together (CRIME/BREACH style) | Avoid compressing secrets with attacker-controlled data |

---

## 8.3 Transport security: `wss://`

* Always use **`wss://`** in production (TLS). Pages on HTTPS **must** use `wss://` (mixed content).
* TLS also improves **connectivity** (proxies can't inspect/break the upgrade inside a TLS tunnel).
* Terminate TLS at the LB or at the app; if terminated at the LB, the LB→app hop should be inside a trusted network or re-encrypted (zero-trust environments).
* Use TLS for the **relay → broker** connection too (`.secure()` on the Reactor Netty client; RabbitMQ STOMP TLS port).

---

## 8.4 Cross-Site WebSocket Hijacking (CSWSH): the #1 WebSocket-specific attack

### 8.4.1 How it works
1. Victim is logged in to `app.example.com` (session cookie).
2. Victim visits `evil.com`.
3. `evil.com` runs `new WebSocket('wss://app.example.com/ws')`.
4. **CORS does not apply to WebSockets.** The browser happily performs the handshake and attaches the victim's cookies (depending on `SameSite`).
5. If the server authenticates by cookie alone and doesn't check `Origin`, the attacker's page now has an **authenticated socket**: it can read the victim's private messages and send messages as the victim.

### 8.4.2 Defences (use several)
1. **Validate `Origin`** at the handshake against an allow-list. In Spring: `setAllowedOrigins(...)`/`setAllowedOriginPatterns(...)` (default = same origin only). **Never** use `setAllowedOriginPatterns("*")` in production with cookie auth.
2. **Don't authenticate by cookie alone**: require a token in the STOMP CONNECT header (the attacker's page doesn't know it).
3. **SameSite cookies** (`Lax`/`Strict`) reduce cookie sending on cross-site requests. A WebSocket handshake from `evil.com` to your site is a cross-site request, so `SameSite=Lax/Strict` cookies are generally not sent. But be careful: "same-site" ≠ "same-origin" (a compromised `sub.example.com` is same-site).
4. **Spring Security CSRF on CONNECT**: `@EnableWebSocketSecurity` requires a CSRF token in the CONNECT frame by default.

> `Origin` can be forged by **non-browser** clients (curl, scripts). That's fine: CSWSH is about abusing a
> victim's *browser*, which always sends the real Origin. Non-browser clients must still authenticate with credentials they actually own.

---

## 8.5 Authentication options

| Option | Where | When to use |
|--------|-------|-------------|
| **A. Authenticate the HTTP handshake** | Spring Security filter chain on `/ws` (session cookie, or token in query/cookie) | Classic web apps with server sessions; the `Principal` from the HTTP request becomes the WebSocket user automatically |
| **B. Authenticate the STOMP CONNECT frame** | `ChannelInterceptor` reads `Authorization` native header | SPAs/mobile with JWT/OAuth2 access tokens; **most common today** |
| C. Ticket in query string | Handshake | When a proxy/gateway must authenticate before upgrade; use short-lived, one-time tickets |
| D. mTLS | TLS layer | Service-to-service |

Spring's docs say it plainly: for token-based auth, **authenticate on the STOMP CONNECT frame** because browsers can't send headers on the handshake.

### 8.5.1 Option A: handshake auth with Spring Security (cookie session)

```java
@Bean
SecurityFilterChain http(HttpSecurity http) throws Exception {
    http.authorizeHttpRequests(a -> a
            .requestMatchers("/ws/**").authenticated()      // handshake requires a logged-in session
            .anyRequest().authenticated())
        .formLogin(Customizer.withDefaults());
    return http.build();
}
```
The authenticated `Principal` of the HTTP request is attached to the WebSocket session and to every STOMP message (`simpUser`). Combine with Origin checks + CSRF on CONNECT.

### 8.5.2 Option B: JWT in the STOMP CONNECT frame (recommended for SPAs/mobile)

```java
@Configuration
@Order(Ordered.HIGHEST_PRECEDENCE + 99)                 // run BEFORE Spring Security's message interceptors
@RequiredArgsConstructor
public class WebSocketAuthConfig implements WebSocketMessageBrokerConfigurer {

    private final JwtDecoder jwtDecoder;                 // from spring-security-oauth2-resource-server
    private final JwtAuthenticationConverter jwtAuthConverter = new JwtAuthenticationConverter();

    @Override
    public void configureClientInboundChannel(ChannelRegistration registration) {
        registration.interceptors(new ChannelInterceptor() {
            @Override
            public Message<?> preSend(Message<?> message, MessageChannel channel) {
                StompHeaderAccessor acc = MessageHeaderAccessor.getAccessor(message, StompHeaderAccessor.class);
                if (acc != null && StompCommand.CONNECT.equals(acc.getCommand())) {
                    String header = acc.getFirstNativeHeader("Authorization");
                    if (header == null || !header.startsWith("Bearer ")) {
                        throw new BadCredentialsException("Missing bearer token");
                    }
                    try {
                        Jwt jwt = jwtDecoder.decode(header.substring(7));          // verifies signature, exp, nbf, iss (if configured)
                        AbstractAuthenticationToken auth = jwtAuthConverter.convert(jwt);
                        acc.setUser(auth);                                         // becomes Principal for this session
                        acc.getSessionAttributes().put("tokenExp", jwt.getExpiresAt());
                    } catch (JwtException e) {
                        throw new BadCredentialsException("Invalid token", e);     // → STOMP ERROR, connection closed
                    }
                }
                return message;
            }
        });
    }
}
```

Important details:
* **`@Order(Ordered.HIGHEST_PRECEDENCE + 99)`**: Spring's docs recommend this so your interceptor is registered **before** Spring Security's authorization interceptor; otherwise the CONNECT is rejected as unauthenticated before you set the user.
* Use **`MessageHeaderAccessor.getAccessor(...)`** (mutable accessor), not `StompHeaderAccessor.wrap(...)` (copy).
* **You only need to set the user on CONNECT.** Spring remembers it for the session (`StompSubProtocolHandler` stores it) and attaches it to later messages.
* The thrown exception becomes an ERROR frame (customise via `StompSubProtocolErrorHandler`, Chapter 5) and the socket closes. The client shouldn't blindly retry with the same token.
* With the **broker relay**, the broker still sees `clientLogin` credentials, not the user's. Your Spring layer is the security boundary.

Client:
```ts
new Client({ brokerURL: 'wss://api.example.com/ws',
             beforeConnect: async (c) => { c.connectHeaders = { Authorization: `Bearer ${await token()}` }; } });
```

### 8.5.3 Option C: one-time ticket
1. Client calls `POST /api/ws-ticket` with its normal `Authorization` header → server stores `ticket → userId` in Redis for 30 s.
2. Client connects `wss://api.example.com/ws?ticket=abc`.
3. A `HandshakeInterceptor`/`DefaultHandshakeHandler#determineUser` consumes (deletes) the ticket and assigns the Principal.
Logs only ever contain a dead, single-use ticket.

---

## 8.6 Authorisation of messages with Spring Security

### 8.6.1 Modern configuration (`@EnableWebSocketSecurity`, Spring Security 5.8+/6+)

```java
@Configuration
@EnableWebSocketSecurity
public class WebSocketSecurityConfig {

    @Bean
    AuthorizationManager<Message<?>> messageAuthorizationManager(
            MessageMatcherDelegatingAuthorizationManager.Builder messages) {
        messages
            .nullDestMatcher().authenticated()                                   // CONNECT, DISCONNECT, HEARTBEAT, UNSUBSCRIBE...
            .simpSubscribeDestMatchers("/user/queue/errors").permitAll()
            .simpDestMatchers("/app/**").hasRole("USER")                          // client SENDs only to controllers
            .simpSubscribeDestMatchers("/user/**", "/topic/lists.*").hasRole("USER")
            .simpTypeMatchers(SimpMessageType.MESSAGE, SimpMessageType.SUBSCRIBE).denyAll() // everything else: no
            .anyMessage().denyAll();
        return messages.build();
    }
}
```

What this does:
* Messages without a destination (CONNECT, etc.) need an authenticated user.
* Clients may only **SEND** to `/app/**`, so they **cannot SEND directly to `/topic/**`** to impersonate the server.
* Subscriptions only to allowed patterns.
* **Deny by default** (`anyMessage().denyAll()`): new destinations are blocked until someone thinks about them.

**Legacy configuration** (`AbstractSecurityWebSocketMessageBrokerConfigurer`, `configureInbound(MessageSecurityMetadataSourceRegistry)`) is **deprecated**. Migrate to `@EnableWebSocketSecurity` + `AuthorizationManager`.

### 8.6.2 CSRF and `@EnableWebSocketSecurity`
* By default, `@EnableWebSocketSecurity` requires a **CSRF token** in the CONNECT frame headers (because browser cookie-authenticated sessions are vulnerable to CSWSH). The client fetches the token (e.g., from a `/csrf` endpoint or a meta tag) and adds it to `connectHeaders` using the header name from the `CsrfToken` (commonly `X-CSRF-TOKEN` / `X-XSRF-TOKEN`). In Spring Security 6 the expected value is the masked (XOR-encoded) token form by default. Send the value your server's `CsrfToken` provides.
* If you use **only header tokens (JWT in CONNECT)** and no cookies, CSRF provides little value. At the time of writing, `@EnableWebSocketSecurity` has no simple switch to disable CSRF. Spring Security's docs show the alternative: **don't use the annotation**, and register the components yourself:

```java
@Configuration
@Order(Ordered.HIGHEST_PRECEDENCE + 100)          // after your JWT CONNECT interceptor (+99)
@RequiredArgsConstructor
public class WebSocketSecurityNoCsrfConfig implements WebSocketMessageBrokerConfigurer {
    private final ApplicationContext context;
    private final AuthorizationManager<Message<?>> authorizationManager;   // the bean built above

    @Override
    public void addArgumentResolvers(List<HandlerMethodArgumentResolver> resolvers) {
        resolvers.add(new AuthenticationPrincipalArgumentResolver());       // enables @AuthenticationPrincipal
    }

    @Override
    public void configureClientInboundChannel(ChannelRegistration registration) {
        AuthorizationChannelInterceptor authz = new AuthorizationChannelInterceptor(authorizationManager);
        authz.setAuthorizationEventPublisher(new SpringAuthorizationEventPublisher(context));
        registration.interceptors(new SecurityContextChannelInterceptor(), authz);   // no CSRF interceptor
    }
}
```

(Verify against the Spring Security version you use; this area has evolved across 5.8 → 6.x → 7.x.)

### 8.6.3 Fine-grained (ownership) authorisation on SUBSCRIBE

Role checks aren't enough: "is user anna a **member of list L1**?" requires data. Do it in an interceptor:

```java
@Component
@RequiredArgsConstructor
public class SubscriptionGuard implements ChannelInterceptor {
    private static final Pattern LIST_TOPIC = Pattern.compile("^/topic/lists\\.([A-Za-z0-9-]{1,64})$");
    private final ListAccessService access;

    @Override
    public Message<?> preSend(Message<?> message, MessageChannel channel) {
        StompHeaderAccessor acc = MessageHeaderAccessor.getAccessor(message, StompHeaderAccessor.class);
        if (acc == null || !StompCommand.SUBSCRIBE.equals(acc.getCommand())) return message;

        String dest = acc.getDestination();
        Principal user = acc.getUser();
        if (user == null || dest == null) throw new AccessDeniedException("Unauthenticated");

        Matcher m = LIST_TOPIC.matcher(dest);
        if (m.matches()) {
            if (!access.isMember(user.getName(), m.group(1))) {
                throw new AccessDeniedException("Not a member of list");   // → ERROR + close
            }
            return message;
        }
        if (dest.startsWith("/user/queue/") || dest.equals("/topic/announcements")) return message;
        throw new AccessDeniedException("Unknown destination");        // deny by default
    }
}
```

Register it in `configureClientInboundChannel` (after the auth interceptor).

**Alternative: soft rejection.** Throwing produces an ERROR and **kills the whole connection**. Sometimes you
want to reject only the subscription: return `null` from `preSend` to **silently drop** the SUBSCRIBE and send
an error to `/user/queue/errors` via `SimpMessagingTemplate`. Choose consciously; silent drops can confuse clients.

**Note on performance:** the check runs once per SUBSCRIBE (not per message), so a DB/cache lookup is fine.
But **membership can change later**: when a user is removed from a list, you must also **terminate their existing
subscription**. Either close their sessions, or have the server-side logic filter (e.g., send list events only
via user destinations to current members). Revocation is a commonly missed requirement.

### 8.6.4 Authorising SENDs
Put **business authorisation in the controller/service** (`access.requireMember(...)`), just like REST. Interceptor
rules handle coarse checks; services handle data-level checks. `@PreAuthorize` works on `@MessageMapping` methods
when method security is enabled (`@EnableMethodSecurity`), since the `SecurityContext` is populated for message handling
by Spring Security's `SecurityContextChannelInterceptor`.

### 8.6.5 Never trust client-provided identity
```java
// WRONG
@MessageMapping("/chat.send") @SendTo("/topic/chat")
public ChatMessage send(ChatMessage m) { return m; }          // client can set m.sender = "ceo"

// RIGHT
public ChatMessage send(ChatMessage m, Principal p) { return m.withSender(p.getName()); }
```

---

## 8.7 Token expiry and revocation while connected

A JWT is checked at CONNECT. The socket may live for **days**. Strategies:

1. **Check expiry on every inbound message** (cheap):
```java
@Override
public Message<?> preSend(Message<?> message, MessageChannel channel) {
    SimpMessageHeaderAccessor acc = MessageHeaderAccessor.getAccessor(message, SimpMessageHeaderAccessor.class);
    if (acc != null && acc.getSessionAttributes() != null) {
        Instant exp = (Instant) acc.getSessionAttributes().get("tokenExp");
        if (exp != null && Instant.now().isAfter(exp)) throw new CredentialsExpiredException("Token expired");
    }
    return message;
}
```
This stops expired clients from **sending**, but they still **receive** subscribed messages.

2. **Server-initiated close of expired/revoked sessions.** Keep references to `WebSocketSession`s and close them:
```java
@Component
public class SessionRegistry implements WebSocketHandlerDecoratorFactory {
    private final Map<String, WebSocketSession> sessions = new ConcurrentHashMap<>();
    @Override
    public WebSocketHandler decorate(WebSocketHandler handler) {
        return new WebSocketHandlerDecorator(handler) {
            @Override public void afterConnectionEstablished(WebSocketSession s) throws Exception {
                sessions.put(s.getId(), s); super.afterConnectionEstablished(s);
            }
            @Override public void afterConnectionClosed(WebSocketSession s, CloseStatus st) throws Exception {
                sessions.remove(s.getId()); super.afterConnectionClosed(s, st);
            }
        };
    }
    public void close(String sessionId, CloseStatus status) throws IOException {
        WebSocketSession s = sessions.get(sessionId);
        if (s != null && s.isOpen()) s.close(status);
    }
}
// register: registration.addDecoratorFactory(sessionRegistry) in configureWebSocketTransport
```
A scheduled job closes sessions whose `tokenExp` passed, or listens to a "user revoked/logged out" event and closes all their sessions (`new CloseStatus(4001, "token expired")`). The client refreshes the token in `beforeConnect` and reconnects. (The WebSocket session id equals the STOMP `simpSessionId`.)

3. **Max connection age** (e.g., 1–12 hours) forces periodic re-authentication.

4. **Refresh-in-band** (advanced): client sends a new token via a `/app/auth.refresh` message; server validates and updates the session's expiry.

---

## 8.8 Denial-of-service protections

| Attack | Control |
|--------|---------|
| Too many connections from one IP/user | LB/WAF connection limits; per-user session cap in a CONNECT interceptor (`simpUserRegistry.getUser(name).getSessions().size()`) |
| Connect but never send CONNECT | `setTimeToFirstMessage` (default 60 s; lower it, e.g., 10 s) |
| Huge frames | `setMessageSizeLimit`; container buffer sizes; LB body limits |
| Message floods | Per-session rate limiting (token bucket) in an inbound interceptor; close abusive sessions |
| Subscription floods | Cap subscriptions per session; deny wildcard destinations |
| Slow readers (memory blow-up) | `setSendBufferSizeLimit`, `setSendTimeLimit` (sessions get closed) |
| Expensive handlers | Bounded inbound thread pool + queue; timeouts in handlers; offload heavy work |
| Reconnect storms | Client jitter/backoff; server-side `429`-like close code (1013 Try Again Later) with longer retry |

Rate limit example (per session, simple token bucket):
```java
public class RateLimitInterceptor implements ChannelInterceptor {
    private final Map<String, Bucket> buckets = new ConcurrentHashMap<>();   // Bucket4j, or roll your own
    @Override
    public Message<?> preSend(Message<?> message, MessageChannel channel) {
        StompHeaderAccessor acc = MessageHeaderAccessor.getAccessor(message, StompHeaderAccessor.class);
        if (acc == null || acc.getCommand() != StompCommand.SEND) return message;
        Bucket b = buckets.computeIfAbsent(acc.getSessionId(),
                id -> Bucket.builder().addLimit(Bandwidth.simple(20, Duration.ofSeconds(1))).build());
        if (!b.tryConsume(1)) throw new MessageDeliveryException("Rate limit exceeded");
        return message;
    }
    // remove bucket on SessionDisconnectEvent to avoid memory leaks
}
```

---

## 8.9 Input validation and output encoding

* Validate payloads (`@Valid`), lengths, enums, IDs; reject unknown fields if strict.
* Treat message content like any untrusted input: **render as text** in the UI (`textContent`, React's default escaping); never `innerHTML`/`dangerouslySetInnerHTML` without sanitising (DOMPurify).
* Validate **destination variables** (`@DestinationVariable`) with regexes; they come from the client.
* Avoid deserialising polymorphic types from client JSON (Jackson default typing → RCE gadgets).
* Keep Spring updated. Known STOMP-related CVEs: **CVE-2018-1270** and **CVE-2018-1275** (SpEL injection via the simple broker `selector` header; 1275 covered an incomplete fix for 4.3.x). Upgrading Spring fixed them; disabling the selector header removes the surface entirely.

---

## 8.10 Logging and privacy

* **Never log CONNECT headers raw** (tokens, passwords). Redact `Authorization`, `passcode`, cookies.
* Turn off `debug` in stompjs in production (it can print frames).
* Don't log full message bodies at INFO (PII). Log ids, sizes, destinations.
* For audit trails (financial/healthcare), log **who sent what to which destination when**, with correlation IDs, to a secure store.
* Multi-tenant: include `tenantId` in every destination and **authorise it**; never let tenant come from the payload.

---

## 8.11 Security checklist (copy into your PR template)

- [ ] `wss://` everywhere; HSTS on the domain.
- [ ] Allowed origins = explicit allow-list (no `*`).
- [ ] Authentication at handshake or CONNECT; unauthenticated frames rejected.
- [ ] `@Order(HIGHEST_PRECEDENCE + 99)` on the CONNECT auth interceptor.
- [ ] Client SEND allowed only to `/app/**`; SUBSCRIBE only to allow-listed destinations; deny by default.
- [ ] Ownership checks for parameterised topics (`/topic/orders.{id}`); handles revocation.
- [ ] No wildcard subscriptions from clients.
- [ ] Identity from `Principal`, never payload.
- [ ] Token expiry enforced (per-message check + server-side close + max connection age).
- [ ] Size limits, rate limits, connection caps, `timeToFirstMessage`.
- [ ] Generic ERROR messages; no stack traces.
- [ ] Logs redacted; stompjs debug off.
- [ ] Broker not internet-exposed; dedicated creds; TLS to broker.
- [ ] Dependencies patched (Spring, Tomcat, Netty, stompjs).
- [ ] Pen-test WebSocket endpoints (Burp/ZAP support WebSocket message tampering).

Next: [Chapter 9: Reliability, Performance & Tuning](09-reliability-performance.md)
