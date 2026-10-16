package com.example.stomptodo.ws;

import java.security.Principal;
import java.util.Map;
import java.util.Set;
import java.util.TreeSet;
import java.util.concurrent.ConcurrentHashMap;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import org.springframework.context.event.EventListener;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.messaging.SessionConnectedEvent;
import org.springframework.web.socket.messaging.SessionDisconnectEvent;

/**
 * Single-node presence: who is online, counting multiple tabs/devices per user.
 * In a cluster, keep this in Redis with TTLs instead (see the book, Chapter 9 and 11).
 */
@Component
public class PresenceTracker {

    public static final String PRESENCE_TOPIC = "/topic/presence";
    private static final Logger log = LoggerFactory.getLogger(PresenceTracker.class);

    private final SimpMessagingTemplate messaging;
    private final Map<String, String> sessionToUser = new ConcurrentHashMap<>();

    public PresenceTracker(SimpMessagingTemplate messaging) {
        this.messaging = messaging;
    }

    public record Presence(Set<String> online) {}

    @EventListener
    public void onConnected(SessionConnectedEvent event) {
        Principal user = event.getUser();
        String sessionId = (String) event.getMessage().getHeaders().get("simpSessionId");
        if (user != null && sessionId != null) {
            sessionToUser.put(sessionId, user.getName());
            log.info("connected session={} user={}", sessionId, user.getName());
            publish();
        }
    }

    @EventListener
    public void onDisconnect(SessionDisconnectEvent event) {
        String user = sessionToUser.remove(event.getSessionId());     // idempotent: a 2nd event finds nothing
        if (user != null) {
            log.info("disconnected session={} user={} status={}", event.getSessionId(), user, event.getCloseStatus());
            publish();
        }
    }

    public Set<String> online() {
        return new TreeSet<>(sessionToUser.values());
    }

    private void publish() {
        messaging.convertAndSend(PRESENCE_TOPIC, new Presence(online()));
    }
}
