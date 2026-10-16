package com.example.stomptodo.ws;

import com.example.stomptodo.todo.TodoModels.TodoChanged;

import org.springframework.context.event.EventListener;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Component;

/**
 * Fans domain events out to every subscriber of the list's topic.
 * With a real database, use {@code @TransactionalEventListener(phase = AFTER_COMMIT)} so clients
 * never see changes that were rolled back.
 */
@Component
public class TodoBroadcaster {

    public static final String LIST_TOPIC_PREFIX = "/topic/todo.list.";

    private final SimpMessagingTemplate messaging;

    public TodoBroadcaster(SimpMessagingTemplate messaging) {
        this.messaging = messaging;
    }

    @EventListener
    public void on(TodoChanged changed) {
        messaging.convertAndSend(LIST_TOPIC_PREFIX + changed.event().listId(), changed.event());
    }
}
