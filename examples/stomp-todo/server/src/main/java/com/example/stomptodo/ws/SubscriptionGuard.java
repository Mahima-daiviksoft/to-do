package com.example.stomptodo.ws;

import java.security.Principal;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import com.example.stomptodo.todo.ListAccessService;
import com.example.stomptodo.todo.TodoModels;

import org.springframework.messaging.Message;
import org.springframework.messaging.MessageChannel;
import org.springframework.messaging.simp.stomp.StompCommand;
import org.springframework.messaging.simp.stomp.StompHeaderAccessor;
import org.springframework.messaging.support.ChannelInterceptor;
import org.springframework.messaging.support.MessageHeaderAccessor;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Component;

/**
 * Data-level authorisation for SUBSCRIBE: role checks can't answer "is anna a member of list L2?".
 * Throwing here produces a STOMP ERROR frame and closes the connection, which is appropriate for a
 * client that tries to read data it doesn't own.
 */
@Component
public class SubscriptionGuard implements ChannelInterceptor {

    private static final Pattern LIST_DEST =
            Pattern.compile("^/(?:topic|app)/todo\\.list\\.(" + TodoModels.ID_REGEX + ")$");

    private final ListAccessService access;

    public SubscriptionGuard(ListAccessService access) {
        this.access = access;
    }

    @Override
    public Message<?> preSend(Message<?> message, MessageChannel channel) {
        StompHeaderAccessor accessor = MessageHeaderAccessor.getAccessor(message, StompHeaderAccessor.class);
        if (accessor == null || !StompCommand.SUBSCRIBE.equals(accessor.getCommand())) {
            return message;
        }
        Principal user = accessor.getUser();
        String destination = accessor.getDestination();
        if (user == null || destination == null) {
            throw new AccessDeniedException("Unauthenticated subscription");
        }
        Matcher m = LIST_DEST.matcher(destination);
        if (m.matches()) {
            access.requireMember(user.getName(), m.group(1));
            return message;
        }
        if (destination.startsWith("/user/queue/") || destination.equals("/topic/presence")) {
            return message;
        }
        throw new AccessDeniedException("Subscription to " + destination + " is not allowed");
    }
}
