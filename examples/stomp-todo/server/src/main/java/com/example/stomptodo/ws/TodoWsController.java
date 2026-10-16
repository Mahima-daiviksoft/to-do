package com.example.stomptodo.ws;

import java.security.Principal;

import com.example.stomptodo.todo.ListAccessService;
import com.example.stomptodo.todo.TodoModels.CommandAck;
import com.example.stomptodo.todo.TodoModels.ListSnapshot;
import com.example.stomptodo.todo.TodoModels.TodoCommand;
import com.example.stomptodo.todo.TodoService;
import jakarta.validation.Valid;

import org.springframework.messaging.handler.annotation.DestinationVariable;
import org.springframework.messaging.handler.annotation.MessageMapping;
import org.springframework.messaging.handler.annotation.Payload;
import org.springframework.messaging.simp.annotation.SendToUser;
import org.springframework.messaging.simp.annotation.SubscribeMapping;
import org.springframework.stereotype.Controller;

/**
 * Thin controller: validate, authorise, delegate. Identity always comes from the Principal,
 * never from the payload.
 */
@Controller
public class TodoWsController {

    private final TodoService todos;
    private final ListAccessService access;

    public TodoWsController(TodoService todos, ListAccessService access) {
        this.todos = todos;
        this.access = access;
    }

    /** SUBSCRIBE /app/todo.list.{listId}: the snapshot goes straight back to this client only. */
    @SubscribeMapping("/todo.list.{listId}")
    public ListSnapshot snapshot(@DestinationVariable String listId, Principal user) {
        access.requireMember(user.getName(), listId);       // SubscriptionGuard already checked; defence in depth
        return todos.snapshot(listId);
    }

    /** SEND /app/todo.upsert: the ack goes to the sending session; the change event is broadcast by TodoBroadcaster. */
    @MessageMapping("/todo.upsert")
    @SendToUser(destinations = "/queue/acks", broadcast = false)
    public CommandAck upsert(@Payload @Valid TodoCommand cmd, Principal user) {
        access.requireMember(user.getName(), cmd.listId());
        return todos.upsert(cmd, user.getName());
    }

    /** SEND /app/todo.delete */
    @MessageMapping("/todo.delete")
    @SendToUser(destinations = "/queue/acks", broadcast = false)
    public CommandAck delete(@Payload @Valid TodoCommand cmd, Principal user) {
        access.requireMember(user.getName(), cmd.listId());
        return todos.delete(cmd, user.getName());
    }
}
