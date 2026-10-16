package com.example.stomptodo.ws;

import java.nio.charset.StandardCharsets;

import org.jspecify.annotations.Nullable;

import org.springframework.messaging.Message;
import org.springframework.messaging.MessageDeliveryException;
import org.springframework.messaging.simp.stomp.StompCommand;
import org.springframework.messaging.simp.stomp.StompHeaderAccessor;
import org.springframework.messaging.support.MessageBuilder;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.authorization.AuthorizationDeniedException;
import org.springframework.security.core.AuthenticationException;
import org.springframework.web.socket.messaging.StompSubProtocolErrorHandler;

/**
 * Turns exceptions thrown by inbound interceptors into short, stable STOMP ERROR frames
 * (no stack traces or internals leak to clients). Clients can switch on the "message" header.
 */
public class CustomStompErrorHandler extends StompSubProtocolErrorHandler {

    @Override
    public @Nullable Message<byte[]> handleClientMessageProcessingError(@Nullable Message<byte[]> clientMessage, Throwable ex) {
        Throwable cause = rootCause(ex);
        if (cause instanceof AuthenticationException) {
            return error("UNAUTHORIZED", cause.getMessage());
        }
        if (cause instanceof AccessDeniedException || cause instanceof AuthorizationDeniedException) {
            return error("FORBIDDEN", "Access denied");
        }
        if (cause instanceof MessageDeliveryException && "Rate limit exceeded".equals(cause.getMessage())) {
            return error("RATE_LIMITED", "Too many messages");
        }
        return super.handleClientMessageProcessingError(clientMessage, ex);
    }

    private static Throwable rootCause(Throwable ex) {
        Throwable t = ex;
        while (t.getCause() != null && t.getCause() != t) {
            if (t instanceof AuthenticationException || t instanceof AccessDeniedException) {
                return t;
            }
            t = t.getCause();
        }
        return t;
    }

    private static Message<byte[]> error(String code, String detail) {
        StompHeaderAccessor accessor = StompHeaderAccessor.create(StompCommand.ERROR);
        accessor.setMessage(code);
        accessor.setLeaveMutable(true);
        return MessageBuilder.createMessage(detail.getBytes(StandardCharsets.UTF_8), accessor.getMessageHeaders());
    }
}
