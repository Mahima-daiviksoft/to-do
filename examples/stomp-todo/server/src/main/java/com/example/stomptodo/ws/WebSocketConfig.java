package com.example.stomptodo.ws;

import java.util.List;

import com.example.stomptodo.AppProperties;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.messaging.Message;
import org.springframework.messaging.simp.config.ChannelRegistration;
import org.springframework.messaging.simp.config.MessageBrokerRegistry;
import org.springframework.scheduling.concurrent.ThreadPoolTaskScheduler;
import org.springframework.security.authorization.AuthorizationManager;
import org.springframework.security.messaging.access.intercept.AuthorizationChannelInterceptor;
import org.springframework.security.messaging.access.intercept.MessageMatcherDelegatingAuthorizationManager;
import org.springframework.security.messaging.context.SecurityContextChannelInterceptor;
import org.springframework.web.socket.config.annotation.EnableWebSocketMessageBroker;
import org.springframework.web.socket.config.annotation.StompEndpointRegistry;
import org.springframework.web.socket.config.annotation.WebSocketMessageBrokerConfigurer;
import org.springframework.web.socket.config.annotation.WebSocketTransportRegistration;

/**
 * STOMP over WebSocket configuration.
 *
 * <p>Inbound interceptor order matters and is set explicitly here:
 * <ol>
 *   <li>{@link JwtConnectInterceptor}: authenticates CONNECT, sets the session user</li>
 *   <li>{@link SecurityContextChannelInterceptor}: exposes that user as the SecurityContext while handling</li>
 *   <li>{@link AuthorizationChannelInterceptor}: coarse rules (deny by default)</li>
 *   <li>{@link SubscriptionGuard}: per-list membership checks on SUBSCRIBE</li>
 *   <li>{@link RateLimitInterceptor}: per-session SEND rate limit</li>
 * </ol>
 * We don't use {@code @EnableWebSocketSecurity} because it enforces a CSRF token on CONNECT, which is
 * meaningless for bearer tokens. This is the manual setup the Spring Security reference describes.
 */
@Configuration
@EnableWebSocketMessageBroker
public class WebSocketConfig implements WebSocketMessageBrokerConfigurer {

    private final AppProperties props;
    private final JwtConnectInterceptor jwtConnectInterceptor;
    private final SubscriptionGuard subscriptionGuard;
    private final RateLimitInterceptor rateLimitInterceptor;
    private final int inboundThreads;

    public WebSocketConfig(AppProperties props, JwtConnectInterceptor jwtConnectInterceptor,
                           SubscriptionGuard subscriptionGuard, RateLimitInterceptor rateLimitInterceptor,
                           @Value("${app.ws.inbound-threads:0}") int inboundThreads) {
        this.props = props;
        this.inboundThreads = inboundThreads;
        this.jwtConnectInterceptor = jwtConnectInterceptor;
        this.subscriptionGuard = subscriptionGuard;
        this.rateLimitInterceptor = rateLimitInterceptor;
    }

    @Override
    public void registerStompEndpoints(StompEndpointRegistry registry) {
        registry.addEndpoint("/ws")
                .setAllowedOriginPatterns(props.allowedOriginPatterns().toArray(String[]::new));
        registry.setErrorHandler(new CustomStompErrorHandler());
        // NOT using registry.setPreserveReceiveOrder(true): in Spring 7.0.x the ordering decorator catches and only
        // logs exceptions thrown by inbound interceptors, so a rejected CONNECT/SUBSCRIBE would get no ERROR frame
        // and the connection would stay open. (Verified against OrderedMessageChannelDecorator; see the book, Ch 10.)
    }

    @Override
    public void configureMessageBroker(MessageBrokerRegistry registry) {
        registry.setApplicationDestinationPrefixes("/app");
        registry.setUserDestinationPrefix("/user");
        registry.setPreservePublishOrder(true);

        if (props.broker().isRelay()) {
            AppProperties.Relay relay = props.broker().relay();
            registry.enableStompBrokerRelay("/topic", "/queue")
                    .setRelayHost(relay.host())
                    .setRelayPort(relay.port())
                    .setVirtualHost(relay.virtualHost())
                    .setClientLogin(relay.clientLogin())
                    .setClientPasscode(relay.clientPasscode())
                    .setSystemLogin(relay.systemLogin())
                    .setSystemPasscode(relay.systemPasscode())
                    .setUserDestinationBroadcast("/topic/unresolved-user-destination")
                    .setUserRegistryBroadcast("/topic/simp-user-registry");
        }
        else {
            registry.enableSimpleBroker("/topic", "/queue")
                    .setTaskScheduler(heartbeatScheduler())          // without a scheduler: no heart-beats
                    .setHeartbeatValue(new long[] {10_000, 10_000})
                    .setSelectorHeaderName(null);                     // we don't use SpEL selectors: turn them off
        }
    }

    @Override
    public void configureClientInboundChannel(ChannelRegistration registration) {
        registration.interceptors(
                jwtConnectInterceptor,
                new SecurityContextChannelInterceptor(),
                new AuthorizationChannelInterceptor(messageAuthorizationManager()),
                subscriptionGuard,
                rateLimitInterceptor);
        if (inboundThreads > 0) {
            // Default is 2 x CPU cores. Tests use 1 thread so frames of a session are handled strictly in order.
            registration.taskExecutor().corePoolSize(inboundThreads);
        }
    }

    @Override
    public void configureWebSocketTransport(WebSocketTransportRegistration registration) {
        registration
                .setMessageSizeLimit(64 * 1024)
                .setSendBufferSizeLimit(512 * 1024)
                .setSendTimeLimit(10_000)
                .setTimeToFirstMessage(15_000);       // a socket that doesn't send CONNECT within 15 s is closed
    }

    @Bean
    ThreadPoolTaskScheduler heartbeatScheduler() {
        ThreadPoolTaskScheduler scheduler = new ThreadPoolTaskScheduler();
        scheduler.setPoolSize(1);
        scheduler.setThreadNamePrefix("wss-heartbeat-");
        scheduler.initialize();
        return scheduler;
    }

    /** Deny by default. Clients may only SEND to /app/**, and SUBSCRIBE to an allow-list. */
    static AuthorizationManager<Message<?>> messageAuthorizationManager() {
        return MessageMatcherDelegatingAuthorizationManager.builder()
                .nullDestMatcher().authenticated()                                  // CONNECT, DISCONNECT, UNSUBSCRIBE, heart-beats
                .simpSubscribeDestMatchers(subscribeAllowList()).authenticated()
                .simpMessageDestMatchers("/app/**").authenticated()
                .anyMessage().denyAll()
                .build();
    }

    static String[] subscribeAllowList() {
        return List.of("/user/queue/**", "/topic/todo.list.*", "/app/todo.list.*", "/topic/presence")
                .toArray(String[]::new);
    }
}
