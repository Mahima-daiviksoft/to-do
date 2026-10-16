package com.example.stomptodo.ws;

import com.example.stomptodo.todo.TodoModels.ErrorDto;
import com.example.stomptodo.todo.TodoModels.TodoCommand;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import com.example.stomptodo.todo.ConflictException;
import org.springframework.messaging.Message;
import org.springframework.messaging.handler.annotation.MessageExceptionHandler;
// NOTE: the messaging variant, not the Spring MVC one
import org.springframework.messaging.handler.annotation.support.MethodArgumentNotValidException;
import org.springframework.messaging.simp.annotation.SendToUser;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.web.bind.annotation.ControllerAdvice;

/**
 * Business errors become ordinary MESSAGE frames on /user/queue/errors, so the connection survives.
 * (A STOMP ERROR frame would close the connection.)
 */
@ControllerAdvice
public class WsExceptionHandlers {

    private static final Logger log = LoggerFactory.getLogger(WsExceptionHandlers.class);

    @MessageExceptionHandler
    @SendToUser(destinations = "/queue/errors", broadcast = false)
    public ErrorDto validation(MethodArgumentNotValidException ex, Message<?> message) {
        return new ErrorDto("VALIDATION_FAILED", "Invalid command", requestId(message));
    }

    @MessageExceptionHandler
    @SendToUser(destinations = "/queue/errors", broadcast = false)
    public ErrorDto conflict(ConflictException ex, Message<?> message) {
        return new ErrorDto("CONFLICT", ex.getMessage(), requestId(message));
    }

    @MessageExceptionHandler
    @SendToUser(destinations = "/queue/errors", broadcast = false)
    public ErrorDto forbidden(AccessDeniedException ex, Message<?> message) {
        return new ErrorDto("FORBIDDEN", "Access denied", requestId(message));
    }

    @MessageExceptionHandler
    @SendToUser(destinations = "/queue/errors", broadcast = false)
    public ErrorDto badRequest(IllegalArgumentException ex, Message<?> message) {
        return new ErrorDto("BAD_REQUEST", ex.getMessage(), requestId(message));
    }

    @MessageExceptionHandler
    @SendToUser(destinations = "/queue/errors", broadcast = false)
    public ErrorDto unexpected(Exception ex, Message<?> message) {
        log.error("Unhandled error while processing STOMP message", ex);
        return new ErrorDto("INTERNAL", "Something went wrong", requestId(message));   // no internals to clients
    }

    private static final java.util.regex.Pattern REQUEST_ID =
            java.util.regex.Pattern.compile("\"clientRequestId\"\\s*:\\s*\"([^\"]{1,100})\"");

    /**
     * Best effort: echo the command's idempotency key so the client can roll back its optimistic update.
     * The message here still carries the raw (unconverted) payload bytes.
     */
    private static String requestId(Message<?> message) {
        Object payload = message.getPayload();
        if (payload instanceof TodoCommand cmd) {
            return cmd.clientRequestId();
        }
        if (payload instanceof byte[] bytes) {
            var m = REQUEST_ID.matcher(new String(bytes, java.nio.charset.StandardCharsets.UTF_8));
            return m.find() ? m.group(1) : null;
        }
        return null;
    }
}
