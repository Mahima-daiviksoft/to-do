package com.example.stomptodo.todo;

import java.time.Instant;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.Deque;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

import com.example.stomptodo.todo.TodoModels.CommandAck;
import com.example.stomptodo.todo.TodoModels.ListSnapshot;
import com.example.stomptodo.todo.TodoModels.TodoChanged;
import com.example.stomptodo.todo.TodoModels.TodoCommand;
import com.example.stomptodo.todo.TodoModels.TodoEvent;
import com.example.stomptodo.todo.TodoModels.TodoItem;

import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;

/**
 * In-memory "database" for the demo. Each list has:
 * <ul>
 *   <li>items with versions (optimistic concurrency),</li>
 *   <li>a monotonically increasing sequence number per list (ordering + gap detection),</li>
 *   <li>a bounded event log (so clients can resync after a reconnect),</li>
 *   <li>processed client request ids (idempotency: retries don't apply twice).</li>
 * </ul>
 * Events are published only after the change is applied, the in-memory equivalent of
 * "publish after commit". With a real database use {@code @TransactionalEventListener(AFTER_COMMIT)} or an outbox.
 */
@Service
public class TodoService {

    static final int EVENT_LOG_LIMIT = 1000;

    private final ApplicationEventPublisher events;
    private final Map<String, ListState> lists = new ConcurrentHashMap<>();

    public TodoService(ApplicationEventPublisher events) {
        this.events = events;
    }

    private static final class ListState {
        final Map<String, TodoItem> items = new LinkedHashMap<>();
        final Deque<TodoEvent> log = new ArrayDeque<>();
        final Map<String, CommandAck> processed = new LinkedHashMap<>(16, 0.75f, false) {
            @Override
            protected boolean removeEldestEntry(Map.Entry<String, CommandAck> eldest) {
                return size() > 10_000;                              // bounded idempotency window
            }
        };
        long seq;
    }

    private ListState state(String listId) {
        return lists.computeIfAbsent(listId, id -> new ListState());
    }

    public ListSnapshot snapshot(String listId) {
        ListState s = state(listId);
        synchronized (s) {
            List<TodoItem> items = new ArrayList<>(s.items.values());
            items.sort(Comparator.comparing(TodoItem::id));
            return new ListSnapshot(listId, s.seq, items);
        }
    }

    /** Events with seq &gt; after, or empty if the log no longer reaches back that far (client must reload a snapshot). */
    public Optional<List<TodoEvent>> eventsAfter(String listId, long after) {
        ListState s = state(listId);
        synchronized (s) {
            if (after > s.seq) {
                return Optional.empty();       // client is "ahead": server state was reset (e.g. restart) → reload snapshot
            }
            if (after == s.seq) {
                return Optional.of(List.of());
            }
            TodoEvent oldest = s.log.peekFirst();
            if (oldest == null || oldest.seq() > after + 1) {
                return Optional.empty();                             // gap too old: full snapshot needed
            }
            return Optional.of(s.log.stream().filter(e -> e.seq() > after).toList());
        }
    }

    public CommandAck upsert(TodoCommand cmd, String actor) {
        return apply(cmd, actor, false);
    }

    public CommandAck delete(TodoCommand cmd, String actor) {
        if (cmd.itemId() == null) {
            throw new IllegalArgumentException("itemId is required for delete");
        }
        return apply(cmd, actor, true);
    }

    private CommandAck apply(TodoCommand cmd, String actor, boolean delete) {
        ListState s = state(cmd.listId());
        TodoEvent event;
        CommandAck ack;  // assigned inside the lock
        synchronized (s) {
            CommandAck previous = s.processed.get(cmd.clientRequestId());
            if (previous != null) {
                return new CommandAck(previous.clientRequestId(), previous.listId(), previous.seq(), true);
            }

            TodoItem current = cmd.itemId() == null ? null : s.items.get(cmd.itemId());
            if (cmd.expectedVersion() != null && current != null && current.version() != cmd.expectedVersion()) {
                throw new ConflictException(
                        "Item " + cmd.itemId() + " is at version " + current.version() + ", expected " + cmd.expectedVersion());
            }

            String type;
            TodoItem next;
            if (delete) {
                if (current == null) {
                    throw new IllegalArgumentException("Unknown item " + cmd.itemId());
                }
                s.items.remove(current.id());
                next = new TodoItem(current.id(), current.listId(), current.title(), current.done(), current.version() + 1);
                type = "todo.item.deleted";
            }
            else if (current == null) {
                if (cmd.title() == null || cmd.title().isBlank()) {
                    throw new IllegalArgumentException("title is required to create an item");
                }
                String id = cmd.itemId() != null ? cmd.itemId() : UUID.randomUUID().toString();
                next = new TodoItem(id, cmd.listId(), cmd.title().strip(), Boolean.TRUE.equals(cmd.done()), 1);
                s.items.put(id, next);
                type = "todo.item.created";
            }
            else {
                next = new TodoItem(current.id(), current.listId(),
                        cmd.title() != null ? cmd.title().strip() : current.title(),
                        cmd.done() != null ? cmd.done() : current.done(),
                        current.version() + 1);
                s.items.put(next.id(), next);
                type = "todo.item.updated";
            }

            s.seq++;
            event = new TodoEvent(UUID.randomUUID().toString(), type, cmd.listId(), s.seq, next, actor,
                    cmd.clientRequestId(), Instant.now());
            s.log.addLast(event);
            while (s.log.size() > EVENT_LOG_LIMIT) {
                s.log.removeFirst();
            }
            ack = new CommandAck(cmd.clientRequestId(), cmd.listId(), s.seq, false);
            s.processed.put(cmd.clientRequestId(), ack);
            // Published while holding the per-list lock so events leave in seq order. The listener only hands the
            // message to the broker channel (fast). With a real database you'd publish after commit / via an outbox.
            events.publishEvent(new TodoChanged(event));
        }
        return ack;
    }
}
