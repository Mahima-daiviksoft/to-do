package com.example.stomptodo.web;

import java.security.Principal;
import java.util.List;
import java.util.Map;

import com.example.stomptodo.AppProperties;
import com.example.stomptodo.security.TokenService;
import com.example.stomptodo.todo.ListAccessService;
import com.example.stomptodo.todo.TodoModels;
import com.example.stomptodo.todo.TodoModels.ListSnapshot;
import com.example.stomptodo.todo.TodoModels.TodoEvent;
import com.example.stomptodo.todo.TodoService;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

/**
 * REST side of the "WebSocket as notification, database as truth" pattern:
 * snapshots for initial load and event replay for resync after a reconnect.
 */
@RestController
public class ApiController {

    private final TodoService todos;
    private final ListAccessService access;
    private final TokenService tokens;
    private final AppProperties props;

    public ApiController(TodoService todos, ListAccessService access, TokenService tokens, AppProperties props) {
        this.todos = todos;
        this.access = access;
        this.tokens = tokens;
        this.props = props;
    }

    /** DEMO ONLY: hands out a token for any of the demo users. Disable with app.dev-tokens=false. */
    @PostMapping("/api/dev-token")
    public Map<String, String> devToken(@RequestBody Map<String, String> body) {
        if (!props.devTokens()) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND);
        }
        String user = body.getOrDefault("user", "");
        if (!List.of("anna", "bob", "carol").contains(user)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Demo users: anna, bob, carol");
        }
        return Map.of("token", tokens.issue(user));
    }

    @GetMapping("/api/lists/{listId}")
    public ListSnapshot snapshot(@PathVariable String listId, Principal user) {
        requireMember(user, listId);
        return todos.snapshot(listId);
    }

    /** 200 with events after {@code after}, or 410 Gone if the log was trimmed (client must reload the snapshot). */
    @GetMapping("/api/lists/{listId}/events")
    public ResponseEntity<List<TodoEvent>> events(@PathVariable String listId, @RequestParam long after, Principal user) {
        requireMember(user, listId);
        return todos.eventsAfter(listId, after)
                .map(ResponseEntity::ok)
                .orElseGet(() -> ResponseEntity.status(HttpStatus.GONE).build());
    }

    private void requireMember(Principal user, String listId) {
        if (!listId.matches(TodoModels.ID_REGEX) || !access.isMember(user.getName(), listId)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN);
        }
    }
}
