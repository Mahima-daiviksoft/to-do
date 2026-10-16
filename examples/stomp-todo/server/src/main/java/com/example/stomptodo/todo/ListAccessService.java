package com.example.stomptodo.todo;

import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Service;

/**
 * Who may see which list. Seeded with demo data: list "L1" is shared by anna and bob,
 * list "L2" belongs to carol only. A real app would read memberships from a database.
 */
@Service
public class ListAccessService {

    private final Map<String, Set<String>> members = new ConcurrentHashMap<>(Map.of(
            "L1", ConcurrentHashMap.newKeySet(),
            "L2", ConcurrentHashMap.newKeySet()));

    public ListAccessService() {
        members.get("L1").addAll(Set.of("anna", "bob"));
        members.get("L2").add("carol");
    }

    public boolean isMember(String username, String listId) {
        Set<String> m = members.get(listId);
        return m != null && m.contains(username);
    }

    public void requireMember(String username, String listId) {
        if (!isMember(username, listId)) {
            throw new AccessDeniedException("Not a member of list " + listId);
        }
    }
}
