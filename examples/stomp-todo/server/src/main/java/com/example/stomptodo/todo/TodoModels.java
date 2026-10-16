package com.example.stomptodo.todo;

import java.time.Instant;
import java.util.List;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

/** All DTOs in one place to keep the sample compact. */
public final class TodoModels {

    private TodoModels() {}

    public static final String ID_REGEX = "[A-Za-z0-9-]{1,64}";

    /** A to-do item. {@code version} increases on every change (optimistic concurrency). */
    public record TodoItem(String id, String listId, String title, boolean done, long version) {}

    /**
     * Event envelope pushed to /topic/todo.list.{listId}.
     * {@code seq} is a per-list sequence number: clients use it to drop duplicates and detect gaps.
     */
    public record TodoEvent(String eventId, String type, String listId, long seq, TodoItem item,
                            String actor, String clientRequestId, Instant occurredAt) {}

    /** Command sent by clients to /app/todo.upsert or /app/todo.delete. */
    public record TodoCommand(
            @NotBlank @Pattern(regexp = ID_REGEX) String listId,
            @Pattern(regexp = ID_REGEX) String itemId,               // null → create
            @Size(max = 500) String title,
            Boolean done,
            Long expectedVersion,                                     // optional optimistic-lock check
            @NotBlank @Size(max = 100) String clientRequestId) {}    // idempotency key

    /** Snapshot for initial load and resync. */
    public record ListSnapshot(String listId, long seq, List<TodoItem> items) {}

    /** Sent to /user/queue/acks when a command was applied (or recognised as a duplicate). */
    public record CommandAck(String clientRequestId, String listId, long seq, boolean duplicate) {}

    /** Sent to /user/queue/errors. */
    public record ErrorDto(String code, String message, String clientRequestId) {}

    /** Spring application event raised after a change is applied. */
    public record TodoChanged(TodoEvent event) {}
}
