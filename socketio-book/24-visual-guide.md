# Chapter 24 — Visual Guide (Diagrams)

> **Goal:** the most important mechanisms of the book as pictures. The diagrams are
> written in **Mermaid**, which GitHub, GitLab, many IDEs and documentation tools render
> as real diagrams. Every diagram here was rendered successfully with the Mermaid CLI.
> The flows match behaviour verified in earlier chapters (packet captures in Chapter 7,
> recovery lab in Chapter 23).

---

## 24.1 The layers

```mermaid
flowchart TB
    App["Your code<br/>socket.emit('chat', msg)"]
    SIO["Socket.IO layer<br/>events · acks · rooms · namespaces · broadcast · reconnection · middleware"]
    EIO["Engine.IO layer<br/>handshake · heartbeat · upgrade · packet framing"]
    T1["HTTP long-polling"]
    T2["WebSocket"]
    T3["WebTransport"]
    TCP["TCP"]
    QUIC["QUIC / UDP"]
    App --> SIO --> EIO
    EIO --> T1 & T2 & T3
    T1 --> TCP
    T2 --> TCP
    T3 --> QUIC
```

*Rendered image: [diagrams/01-layers.svg](diagrams/01-layers.svg)*

## 24.2 Connection: handshake, CONNECT and upgrade

```mermaid
sequenceDiagram
    autonumber
    participant C as Client
    participant S as Server
    C->>S: GET /socket.io/?EIO=4&transport=polling
    S-->>C: 0{"sid":"…","upgrades":["websocket"],"pingInterval":25000,"pingTimeout":20000,"maxPayload":1000000}
    C->>S: POST 40 (CONNECT "/" + auth)
    Note over S: io.use() middlewares run
    alt accepted
        S-->>C: 40{"sid":"<socket id>"} (via pending GET)
        Note over S: io.on("connection") fires
    else rejected
        S-->>C: 44{"message":"…","data":{…}}
        Note over C: connect_error, socket.active = false
    end
    C->>S: WebSocket upgrade request (same sid)
    C->>S: 2probe
    S-->>C: 3probe
    Note over C: pause polling, flush pending requests
    C->>S: 5 (upgrade)
    Note over C,S: all traffic now over WebSocket
    S-->>C: 2 (ping) every pingInterval
    C->>S: 3 (pong)
```

*Rendered image: [diagrams/02-handshake-upgrade.svg](diagrams/02-handshake-upgrade.svg)*

## 24.3 Event with acknowledgement

```mermaid
sequenceDiagram
    participant C as Client
    participant S as Server
    C->>S: 421["hello","world"]  (EVENT, ack id 1)
    Note over S: handler(data, ack)
    S-->>C: 431[{"ok":true}]  (ACK id 1)
    Note over C: callback / emitWithAck resolves
    Note over C: with .timeout(ms): no ACK in time → callback(err) / Promise rejects
```

*Rendered image: [diagrams/03-event-ack.svg](diagrams/03-event-ack.svg)*

## 24.4 Client connection state machine

```mermaid
stateDiagram-v2
    [*] --> Connecting: io(url) / socket.connect()
    Connecting --> Connected: CONNECT accepted
    Connecting --> Rejected: middleware next(err)
    Connecting --> Reconnecting: transport failure / timeout
    Connected --> Reconnecting: ping timeout / transport close / transport error
    Connected --> Disconnected: socket.disconnect()  [io client disconnect]
    Connected --> Disconnected: server socket.disconnect()  [io server disconnect]
    Reconnecting --> Connecting: after back-off (1s, 2s, 4s… ≤5s, ±50%)
    Reconnecting --> Failed: reconnectionAttempts reached
    Rejected --> Connecting: fix auth, socket.connect()
    Disconnected --> Connecting: socket.connect()
    Failed --> Connecting: socket.connect()
```

*Rendered image: [diagrams/04-client-state-machine.svg](diagrams/04-client-state-machine.svg)*

## 24.5 Heartbeat and dead-connection detection

```mermaid
sequenceDiagram
    participant S as Server
    participant C as Client
    loop every pingInterval (25 s)
        S->>C: PING (2)
        C-->>S: PONG (3) within pingTimeout (20 s)
    end
    Note over C: phone enters a tunnel — nothing arrives any more
    S->>C: PING (2) — lost
    Note over S: no PONG within 20 s → disconnect "ping timeout"
    Note over C: no PING within 25 + 20 s → close "ping timeout" → reconnect with back-off
```

*Rendered image: [diagrams/05-heartbeat.svg](diagrams/05-heartbeat.svg)*

## 24.6 Namespaces, rooms and sockets

```mermaid
flowchart LR
    subgraph Conn["One underlying connection (Manager)"]
        direction TB
        SA["Socket in /"]
        SB["Socket in /admin"]
    end
    subgraph NS1["Namespace /"]
        R1["room user:42"]
        R2["room conversation:9"]
        R3["room = own socket id"]
    end
    subgraph NS2["Namespace /admin (own middleware)"]
        R4["room ops"]
    end
    SA --> R1 & R2 & R3
    SB --> R4
```

*Rendered image: [diagrams/06-namespaces-rooms.svg](diagrams/06-namespaces-rooms.svg)*

## 24.7 Broadcast targets

```mermaid
flowchart TB
    E["emit from the server"] --> A["socket.emit → only this client"]
    E --> B["io.emit → everyone in the namespace"]
    E --> C["socket.broadcast.emit → everyone except the sender"]
    E --> D["io.to(room).emit → everyone in the room (incl. sender if member)"]
    E --> F["socket.to(room).emit → room except the sender"]
    E --> G["io.to(a).to(b) → union a ∪ b, each socket once"]
    E --> H["io.except(room) → everyone except the room"]
    E --> I["io.local → only sockets on this node"]
```

*Rendered image: [diagrams/07-broadcast-targets.svg](diagrams/07-broadcast-targets.svg)*

## 24.8 Scaling: load balancer, sticky sessions and adapter

```mermaid
flowchart TB
    U1["Client A"] & U2["Client B"] --> LB["Load balancer<br/>sticky sessions (cookie / IP hash)<br/>HTTP/1.1 + Upgrade headers"]
    LB --> N1["Socket.IO node 1"]
    LB --> N2["Socket.IO node 2"]
    LB --> N3["Socket.IO node 3"]
    N1 <--> R[("Redis pub/sub or Streams<br/>(adapter)")]
    N2 <--> R
    N3 <--> R
    W["Worker / microservice"] -- "emitter" --> R
```

*Rendered image: [diagrams/08-scaling.svg](diagrams/08-scaling.svg)*

## 24.9 What happens without sticky sessions (verified in Lab B)

```mermaid
sequenceDiagram
    participant C as Client (polling)
    participant LB as Round-robin LB
    participant N1 as Node 1
    participant N2 as Node 2
    C->>LB: GET handshake
    LB->>N1: forward
    N1-->>C: 0{"sid":"abc"} (session lives in node 1 memory)
    C->>LB: POST 40 sid=abc
    LB->>N2: forward (round-robin)
    N2-->>C: 400 {"code":1,"message":"Session ID unknown"}
    Note over C: connect_error "xhr post error" → retry → same problem
```

*Rendered image: [diagrams/09-no-sticky-sessions.svg](diagrams/09-no-sticky-sessions.svg)*

## 24.10 Cross-node broadcast through the adapter

```mermaid
sequenceDiagram
    participant A as Client on node 1
    participant N1 as Node 1
    participant R as Redis
    participant N2 as Node 2
    participant B as Client on node 2 (in room)
    A->>N1: shout
    N1->>N1: io.to("all").emit → local sockets
    N1->>R: PUBLISH socket.io#/#all# [uid, packet, opts]
    R->>N2: message (pattern subscription)
    N2->>B: deliver to its local sockets in "all"
```

*Rendered image: [diagrams/10-adapter-broadcast.svg](diagrams/10-adapter-broadcast.svg)*

## 24.11 Connection state recovery (verified in Lab C)

```mermaid
sequenceDiagram
    participant C as Client
    participant S as Server
    S-->>C: CONNECT reply with sid + pid (each event then carries an offset)
    Note over C: remembers pid + last offset
    Note over C,S: network drop (transport close)
    Note over S: persistSession {sid, pid, rooms, data}<br/>keeps broadcast packets
    S->>S: io.to("news").emit(…) while client is offline (stored)
    C->>S: reconnect: CONNECT with {pid, offset}
    S-->>C: same sid, recovered = true, rooms & data restored
    S-->>C: replay packets after offset
    Note over C: missed events may arrive before the "connect" handler runs
```

*Rendered image: [diagrams/11-connection-state-recovery.svg](diagrams/11-connection-state-recovery.svg)*

## 24.12 Chat message flow (optimistic UI, idempotency, sync)

```mermaid
sequenceDiagram
    participant UI as Sender UI
    participant OB as Outbox (IndexedDB)
    participant S as Server
    participant DB as Database
    participant O as Other members
    UI->>OB: save {clientMsgId, text} → render "sending…"
    OB->>S: message:send (ack + timeout)
    S->>DB: INSERT … ON CONFLICT (clientMsgId) DO NOTHING
    S->>O: io.to(conversation).emit("message:new")
    S-->>OB: ack {ok, id}
    OB->>UI: remove from outbox, mark "sent"
    Note over OB,S: on ack timeout → retry with the SAME clientMsgId (duplicates ignored)
    Note over O: on every reconnect: sync(afterId) + dedupe by id
```

*Rendered image: [diagrams/12-chat-message-flow.svg](diagrams/12-chat-message-flow.svg)*

## 24.13 Authentication and authorization

```mermaid
flowchart TB
    H["Handshake / upgrade request"] --> AR{"allowRequest:<br/>Origin allowed?"}
    AR -- no --> X1["HTTP 403 (polling) / 400 (upgrade)<br/>engine error code 4"]
    AR -- yes --> MW{"io.use: token in<br/>handshake.auth valid?"}
    MW -- no --> X2["CONNECT_ERROR → client connect_error<br/>no auto-reconnect"]
    MW -- yes --> CON["connection: socket.data.user set,<br/>join user:&lt;id&gt; room"]
    CON --> EV["incoming event"]
    EV --> SU{"socket.use: rate limit /<br/>role check"}
    SU -- reject --> X3["ack {ok:false} or 'error' event"]
    SU -- ok --> H2{"handler: validate payload<br/>+ authorize resource"}
    H2 -- fail --> X4["ack {ok:false, error}"]
    H2 -- ok --> OK["do work, emit, ack {ok:true}"]
```

*Rendered image: [diagrams/13-auth-flow.svg](diagrams/13-auth-flow.svg)*

## 24.14 Choosing a real-time technology

```mermaid
flowchart TB
    Q1{"Server → client only?"} -- yes --> SSE["SSE (EventSource)"]
    Q1 -- no --> Q2{"Must interoperate with<br/>plain WebSocket clients/devices?"}
    Q2 -- yes --> WS["Raw WebSocket (ws / uWebSockets.js)"]
    Q2 -- no --> Q3{"Want rooms, acks, reconnection,<br/>fallback, scaling built in?"}
    Q3 -- yes --> SIO["Socket.IO"]
    Q3 -- no --> WS
    SIO --> Q4{"Need durable, replayable messaging?"}
    Q4 -- yes --> BR["Add a broker (Kafka/RabbitMQ/NATS)<br/>+ DB as source of truth"]
    Q4 -- no --> DONE["Socket.IO + adapter"]
```

*Rendered image: [diagrams/14-choosing-technology.svg](diagrams/14-choosing-technology.svg)*

Next: back to the [table of contents](README.md).
