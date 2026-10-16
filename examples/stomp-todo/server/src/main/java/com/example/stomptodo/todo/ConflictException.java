package com.example.stomptodo.todo;

/** Optimistic-concurrency conflict: the item changed since the client last saw it. */
public class ConflictException extends RuntimeException {

    public ConflictException(String message) {
        super(message);
    }
}
