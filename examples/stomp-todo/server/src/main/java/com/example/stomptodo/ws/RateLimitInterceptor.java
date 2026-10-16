package com.example.stomptodo.ws;

import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

import com.example.stomptodo.AppProperties;

import org.springframework.context.event.EventListener;
import org.springframework.messaging.Message;
import org.springframework.messaging.MessageChannel;
import org.springframework.messaging.MessageDeliveryException;
import org.springframework.messaging.simp.stomp.StompCommand;
import org.springframework.messaging.simp.stomp.StompHeaderAccessor;
import org.springframework.messaging.support.ChannelInterceptor;
import org.springframework.messaging.support.MessageHeaderAccessor;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.messaging.SessionDisconnectEvent;

/** Per-session token bucket for SEND frames. Abusive clients get an ERROR frame and are disconnected. */
@Component
public class RateLimitInterceptor implements ChannelInterceptor {

    private final int perSecond;
    private final Map<String, Bucket> buckets = new ConcurrentHashMap<>();

    public RateLimitInterceptor(AppProperties props) {
        this.perSecond = props.limits().messagesPerSecond();
    }

    @Override
    public Message<?> preSend(Message<?> message, MessageChannel channel) {
        StompHeaderAccessor accessor = MessageHeaderAccessor.getAccessor(message, StompHeaderAccessor.class);
        if (accessor == null || !StompCommand.SEND.equals(accessor.getCommand()) || accessor.getSessionId() == null) {
            return message;
        }
        Bucket bucket = buckets.computeIfAbsent(accessor.getSessionId(), id -> new Bucket(perSecond));
        if (!bucket.tryConsume()) {
            throw new MessageDeliveryException("Rate limit exceeded");
        }
        return message;
    }

    /** Disconnect events can arrive more than once per session; remove() is idempotent. */
    @EventListener
    public void onDisconnect(SessionDisconnectEvent event) {
        buckets.remove(event.getSessionId());
    }

    int trackedSessions() {
        return buckets.size();
    }

    private static final class Bucket {
        private final int capacity;
        private double tokens;
        private long lastRefillNanos = System.nanoTime();

        Bucket(int capacity) {
            this.capacity = capacity;
            this.tokens = capacity;
        }

        synchronized boolean tryConsume() {
            long now = System.nanoTime();
            tokens = Math.min(capacity, tokens + (now - lastRefillNanos) / 1_000_000_000.0 * capacity);
            lastRefillNanos = now;
            if (tokens >= 1) {
                tokens -= 1;
                return true;
            }
            return false;
        }
    }
}
