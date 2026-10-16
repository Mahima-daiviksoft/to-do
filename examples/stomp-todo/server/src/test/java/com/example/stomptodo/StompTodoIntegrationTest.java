package com.example.stomptodo;

import java.lang.reflect.Type;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.TimeUnit;

import com.example.stomptodo.todo.TodoModels.CommandAck;
import com.example.stomptodo.todo.TodoModels.ErrorDto;
import com.example.stomptodo.todo.TodoModels.ListSnapshot;
import com.example.stomptodo.todo.TodoModels.TodoCommand;
import com.example.stomptodo.todo.TodoModels.TodoEvent;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.json.JsonMapper;

import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.messaging.converter.JacksonJsonMessageConverter;
import org.springframework.messaging.simp.stomp.StompFrameHandler;
import org.springframework.messaging.simp.stomp.StompHeaders;
import org.springframework.messaging.simp.stomp.StompSession;
import org.springframework.messaging.simp.stomp.StompSessionHandlerAdapter;
import org.springframework.scheduling.concurrent.ThreadPoolTaskScheduler;
import org.springframework.web.socket.WebSocketHttpHeaders;
import org.springframework.web.socket.client.standard.StandardWebSocketClient;
import org.springframework.web.socket.messaging.WebSocketStompClient;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * End-to-end tests with a real STOMP client over a real WebSocket against the running server.
 * Each test uses its own list items and request ids, so tests don't interfere.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
        properties = "app.ws.inbound-threads=1")   // one inbound thread → frames handled in arrival order
class StompTodoIntegrationTest {

    @LocalServerPort
    int port;

    private final JsonMapper json = JsonMapper.builder().findAndAddModules().build();
    private final HttpClient http = HttpClient.newHttpClient();
    private WebSocketStompClient stompClient;
    private ThreadPoolTaskScheduler scheduler;

    @BeforeEach
    void setUp() {
        stompClient = new WebSocketStompClient(new StandardWebSocketClient());
        stompClient.setMessageConverter(new JacksonJsonMessageConverter());   // Spring 7 / Jackson 3
        scheduler = new ThreadPoolTaskScheduler();
        scheduler.initialize();
        stompClient.setTaskScheduler(scheduler);                              // heart-beats + receipt timeouts
    }

    @AfterEach
    void tearDown() {
        stompClient.stop();
        scheduler.shutdown();
    }

    // ---------------------------------------------------------------- helpers

    private String token(String user) throws Exception {
        HttpRequest req = HttpRequest.newBuilder(URI.create("http://localhost:" + port + "/api/dev-token"))
                .header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString("{\"user\":\"" + user + "\"}"))
                .build();
        HttpResponse<String> res = http.send(req, HttpResponse.BodyHandlers.ofString());
        assertThat(res.statusCode()).isEqualTo(200);
        return json.readTree(res.body()).get("token").asString();
    }

    private StompSession connect(String bearer) throws Exception {
        StompHeaders connectHeaders = new StompHeaders();
        if (bearer != null) {
            connectHeaders.add("Authorization", "Bearer " + bearer);
        }
        CompletableFuture<StompSession> future = stompClient.connectAsync(
                "ws://localhost:" + port + "/ws", new WebSocketHttpHeaders(), connectHeaders,
                new StompSessionHandlerAdapter() {});
        return future.get(5, TimeUnit.SECONDS);
    }

    private <T> BlockingQueue<T> subscribe(StompSession session, String destination, Class<T> type) throws Exception {
        BlockingQueue<T> queue = new LinkedBlockingQueue<>();
        session.subscribe(destination, new StompFrameHandler() {
            @Override
            public Type getPayloadType(StompHeaders headers) { return type; }

            @Override
            @SuppressWarnings("unchecked")
            public void handleFrame(StompHeaders headers, Object payload) { queue.add((T) payload); }
        });
        // Avoid the classic SUBSCRIBE/SEND race: with a single inbound thread frames are handled in arrival order,
        // so a round trip through the same session proves the SUBSCRIBE has been registered with the broker.
        roundTrip(session);
        return queue;
    }

    private void roundTrip(StompSession session) throws Exception {
        BlockingQueue<ListSnapshot> q = new LinkedBlockingQueue<>();
        StompSession.Subscription sub = session.subscribe("/app/todo.list.L1", new StompFrameHandler() {
            @Override
            public Type getPayloadType(StompHeaders headers) { return ListSnapshot.class; }

            @Override
            public void handleFrame(StompHeaders headers, Object payload) { q.add((ListSnapshot) payload); }
        });
        assertThat(q.poll(5, TimeUnit.SECONDS)).as("round trip").isNotNull();
        sub.unsubscribe();
    }

    private static TodoCommand create(String title) {
        return new TodoCommand("L1", null, title, false, null, UUID.randomUUID().toString());
    }

    // ---------------------------------------------------------------- tests

    @Test
    void connectWithoutTokenIsRejected() {
        assertThatThrownBy(() -> connect(null)).isInstanceOf(ExecutionException.class);
    }

    @Test
    void connectWithForgedTokenIsRejected() {
        assertThatThrownBy(() -> connect("eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJldmUifQ.bad-signature"))
                .isInstanceOf(ExecutionException.class);
    }

    @Test
    void snapshotIsSentOnlyToTheSubscriber() throws Exception {
        StompSession anna = connect(token("anna"));
        BlockingQueue<ListSnapshot> snapshots = new LinkedBlockingQueue<>();
        anna.subscribe("/app/todo.list.L1", new StompFrameHandler() {
            @Override
            public Type getPayloadType(StompHeaders headers) { return ListSnapshot.class; }

            @Override
            public void handleFrame(StompHeaders headers, Object payload) { snapshots.add((ListSnapshot) payload); }
        });
        ListSnapshot snapshot = snapshots.poll(5, TimeUnit.SECONDS);
        assertThat(snapshot).isNotNull();
        assertThat(snapshot.listId()).isEqualTo("L1");
    }

    @Test
    void changeIsBroadcastToOtherMembersWithIncreasingSeqAndActorFromPrincipal() throws Exception {
        StompSession bob = connect(token("bob"));
        BlockingQueue<TodoEvent> bobEvents = subscribe(bob, "/topic/todo.list.L1", TodoEvent.class);

        StompSession anna = connect(token("anna"));
        BlockingQueue<CommandAck> annaAcks = subscribe(anna, "/user/queue/acks", CommandAck.class);

        anna.send("/app/todo.upsert", create("Buy milk"));
        anna.send("/app/todo.upsert", create("Walk the dog"));

        TodoEvent first = bobEvents.poll(5, TimeUnit.SECONDS);
        TodoEvent second = bobEvents.poll(5, TimeUnit.SECONDS);
        assertThat(first).isNotNull();
        assertThat(second).isNotNull();
        assertThat(first.actor()).isEqualTo("anna");                   // server-side identity
        assertThat(second.seq()).isEqualTo(first.seq() + 1);           // ordered, gap-free per list
        assertThat(List.of(first.item().title(), second.item().title())).containsExactly("Buy milk", "Walk the dog");

        assertThat(annaAcks.poll(5, TimeUnit.SECONDS)).isNotNull();
        assertThat(annaAcks.poll(5, TimeUnit.SECONDS)).isNotNull();
    }

    @Test
    void retriedCommandIsAppliedOnlyOnce() throws Exception {
        StompSession anna = connect(token("anna"));
        BlockingQueue<CommandAck> acks = subscribe(anna, "/user/queue/acks", CommandAck.class);
        TodoCommand cmd = create("Idempotent item");

        anna.send("/app/todo.upsert", cmd);
        anna.send("/app/todo.upsert", cmd);                              // same clientRequestId (client retry)

        CommandAck firstAck = acks.poll(5, TimeUnit.SECONDS);
        CommandAck secondAck = acks.poll(5, TimeUnit.SECONDS);
        assertThat(firstAck).isNotNull();
        assertThat(secondAck).isNotNull();
        assertThat(firstAck.duplicate()).isFalse();
        assertThat(secondAck.duplicate()).isTrue();
        assertThat(secondAck.seq()).isEqualTo(firstAck.seq());
    }

    @Test
    void staleUpdateProducesConflictErrorAndConnectionSurvives() throws Exception {
        StompSession anna = connect(token("anna"));
        BlockingQueue<CommandAck> acks = subscribe(anna, "/user/queue/acks", CommandAck.class);
        BlockingQueue<ErrorDto> errors = subscribe(anna, "/user/queue/errors", ErrorDto.class);
        BlockingQueue<TodoEvent> events = subscribe(anna, "/topic/todo.list.L1", TodoEvent.class);

        anna.send("/app/todo.upsert", create("Versioned"));
        TodoEvent created = events.poll(5, TimeUnit.SECONDS);
        assertThat(created).isNotNull();
        acks.poll(5, TimeUnit.SECONDS);

        String staleRequest = UUID.randomUUID().toString();
        anna.send("/app/todo.upsert", new TodoCommand("L1", created.item().id(), "Edited", null, 99L, staleRequest));

        ErrorDto error = errors.poll(5, TimeUnit.SECONDS);
        assertThat(error).isNotNull();
        assertThat(error.code()).isEqualTo("CONFLICT");
        assertThat(error.clientRequestId()).isEqualTo(staleRequest);
        assertThat(anna.isConnected()).isTrue();                         // business error ≠ STOMP ERROR
    }

    @Test
    void invalidCommandProducesValidationError() throws Exception {
        StompSession anna = connect(token("anna"));
        BlockingQueue<ErrorDto> errors = subscribe(anna, "/user/queue/errors", ErrorDto.class);

        anna.send("/app/todo.upsert", new TodoCommand("L1", null, "x", false, null, ""));   // blank clientRequestId

        ErrorDto error = errors.poll(5, TimeUnit.SECONDS);
        assertThat(error).isNotNull();
        assertThat(error.code()).isEqualTo("VALIDATION_FAILED");
    }

    @Test
    void nonMemberCannotSubscribeToForeignList() throws Exception {
        StompSession carol = connect(token("carol"));                     // carol is not a member of L1
        carol.subscribe("/topic/todo.list.L1", new StompSessionHandlerAdapter() {});
        // Authorisation failure → STOMP ERROR → server closes the connection.
        for (int i = 0; i < 50 && carol.isConnected(); i++) {
            Thread.sleep(100);
        }
        assertThat(carol.isConnected()).isFalse();
    }

    @Test
    void clientCannotPublishDirectlyToBrokerTopic() throws Exception {
        StompSession bob = connect(token("bob"));
        BlockingQueue<TodoEvent> bobEvents = subscribe(bob, "/topic/todo.list.L1", TodoEvent.class);

        StompSession anna = connect(token("anna"));
        anna.send("/topic/todo.list.L1", Map.of("type", "spoofed"));   // must be denied (only /app/** allowed)

        assertThat(bobEvents.poll(1, TimeUnit.SECONDS)).isNull();
        for (int i = 0; i < 50 && anna.isConnected(); i++) {
            Thread.sleep(100);
        }
        assertThat(anna.isConnected()).isFalse();
    }

    @Test
    void restResyncReturnsEventsAfterGivenSeq() throws Exception {
        String annaToken = token("anna");
        StompSession anna = connect(annaToken);
        BlockingQueue<TodoEvent> events = subscribe(anna, "/topic/todo.list.L1", TodoEvent.class);
        anna.send("/app/todo.upsert", create("Resync me"));
        TodoEvent event = events.poll(5, TimeUnit.SECONDS);
        assertThat(event).isNotNull();

        HttpRequest req = HttpRequest.newBuilder(
                        URI.create("http://localhost:" + port + "/api/lists/L1/events?after=" + (event.seq() - 1)))
                .header("Authorization", "Bearer " + annaToken)
                .build();
        HttpResponse<String> res = http.send(req, HttpResponse.BodyHandlers.ofString());
        assertThat(res.statusCode()).isEqualTo(200);
        assertThat(res.body()).contains("Resync me");
    }

    @Test
    void restRejectsNonMembers() throws Exception {
        HttpRequest req = HttpRequest.newBuilder(URI.create("http://localhost:" + port + "/api/lists/L1"))
                .header("Authorization", "Bearer " + token("carol"))
                .build();
        assertThat(http.send(req, HttpResponse.BodyHandlers.ofString()).statusCode()).isEqualTo(403);
    }
}
