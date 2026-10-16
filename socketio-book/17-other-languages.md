# Chapter 17 — Socket.IO Servers and Clients in Other Languages (Python, Go, Rust, Java)

> **Goal:** run Socket.IO servers outside Node.js — Python (FastAPI/ASGI, aiohttp,
> Flask-SocketIO), Go, Rust and Java — and know exactly what is the same, what differs,
> and what breaks when you mix languages.
>
> **How this chapter was checked:** every server below was **built and run**, and a real
> **Node.js `socket.io-client` 4.8.4** connected to it and exercised authentication
> rejection, events, acknowledgements (both directions where supported) and room
> broadcasts excluding the sender. Versions used: `python-socketio` 5.17.0 /
> `python-engineio` 4.14.0 / `Flask-SocketIO` 5.7.0, Go
> `github.com/zishang520/socket.io/servers/socket/v3` v3.0.6, Rust `socketioxide`
> 0.18.7 with `axum` 0.8, Java `netty-socketio` 2.0.13.

---

## 17.1 ELI5

Socket.IO is a *language* (a protocol). The Node.js library is the most famous speaker,
but people have written speakers in Python, Go, Rust, Java and more. As long as both sides
speak the **same version** of the language (Engine.IO v4 + Socket.IO v5 for modern
clients), a browser using `socket.io-client` can't tell which language the server is
written in.

What does **not** travel between languages: the **multi-server plumbing**. A Python
server's Redis "message queue" and the Node Redis adapter speak different internal
formats — you can't put Python and Node servers in the same cluster and expect
broadcasts to cross.

---

## 17.2 Choosing a server implementation

| Language | Library | Protocol (modern clients) | Scaling across servers | Notes |
|---|---|---|---|---|
| Node.js | `socket.io` | ✅ reference implementation | Adapters (Redis, Streams, Mongo, Postgres, …) | Everything in this book |
| Python | `python-socketio` (+ `python-engineio`) | ✅ | "Client managers": Redis, Kafka, RabbitMQ/AioPika, Kombu, ZeroMQ | asyncio (ASGI/aiohttp) and WSGI (Flask, threading/eventlet/gevent) |
| Python/Flask | `Flask-SocketIO` | ✅ (built on python-socketio) | Same managers via `message_queue=` | Flask-style decorators, request context |
| Go | `github.com/zishang520/socket.io` (v3 module path `…/servers/socket/v3`) | ✅ (Socket.IO v4+ protocol) | Adapters (see its docs) | Close port of the Node API: `On`, `Emit`, `To`, `Use`, `Of` |
| Go | `googollee/go-socket.io` | ⚠️ historically v2-era protocol | — | Check protocol support before choosing |
| Rust | `socketioxide` | ✅ v5 (v4 behind a feature flag) | `socketioxide-redis`, `-mongodb`, `-postgres` | Tower layer; axum/hyper integration; extractors |
| Java | `netty-socketio` | ✅ claims client 1.x–4.x (verified events/acks/rooms with a 4.8.4 client) | Redisson / Hazelcast store | Netty-based; see caveats in 17.6 |
| Deno | official Deno port | ✅ | — | See Chapter 20 |

Choose based on your team's language, and check: protocol version, acknowledgement
support, binary support, namespaces, scaling story, maintenance activity.

---

## 17.3 Python — `python-socketio`

### Install

```bash
pip install python-socketio uvicorn fastapi        # asyncio + ASGI
pip install python-socketio aiohttp                # asyncio + aiohttp
pip install flask flask-socketio simple-websocket  # Flask (threading mode with WebSocket support)
pip install redis                                  # for the Redis manager
```

### Concepts mapped from Node.js

| Node.js | python-socketio |
|---|---|
| `new Server(opts)` | `socketio.AsyncServer(async_mode="asgi", ...)` (asyncio) or `socketio.Server(...)` (WSGI/threads) |
| `io.on("connection", socket => …)` | `@sio.event async def connect(sid, environ, auth)` |
| `socket` object | **a `sid` string** — every API takes the sid |
| `socket.data` | `await sio.save_session(sid, {...})` / `await sio.get_session(sid)` / `async with sio.session(sid) as s:` |
| `next(new Error("x"))` in middleware | `raise socketio.exceptions.ConnectionRefusedError("x")` (or `return False`) in `connect` |
| `socket.on("e", (data, ack) => ack(x))` | `@sio.on("e") async def h(sid, data): return x` — **the return value is the ack** |
| `socket.emit("e", data)` | `await sio.emit("e", data, to=sid)` |
| `io.to(room).emit` | `await sio.emit("e", data, room=room)` (or `to=room`) |
| `socket.to(room).emit` (exclude sender) | `await sio.emit("e", data, room=room, skip_sid=sid)` |
| `socket.join(room)` / `leave` | `await sio.enter_room(sid, room)` / `await sio.leave_room(sid, room)` |
| `socket.timeout(ms).emitWithAck(...)` | `await sio.call("e", data, to=sid, timeout=5)` (seconds) |
| emit with ack callback | `await sio.emit("e", data, to=sid, callback=fn)` |
| `socket.disconnect()` | `await sio.disconnect(sid)` |
| namespaces | `namespace="/admin"` argument everywhere, or class-based `socketio.AsyncNamespace` |
| `pingInterval: 25000` (ms) | `ping_interval=25` (**seconds**) |
| `maxHttpBufferSize` | `max_http_buffer_size=1000000` |
| `cors: { origin }` | `cors_allowed_origins=[...]` (`"*"` for all; `[]` to disable checks) |
| adapter (Redis) | `client_manager=socketio.AsyncRedisManager(url)` |
| emitter (Redis) | `socketio.AsyncRedisManager(url, write_only=True)` |

Defaults (from the `python-engineio` 4.14 constructor): `ping_interval=25`,
`ping_timeout=20`, `max_http_buffer_size=1000000`, `allow_upgrades=True`,
`http_compression=True`, `compression_threshold=1024`, `cors_credentials=True`,
`async_handlers=True` — the same values as Node's defaults, but in seconds.

> **Ordering difference:** with `async_handlers=True` (the default), python-socketio runs
> each incoming event in its **own task**, so two events from the same client can be
> *processed* concurrently and finish out of order — even though they *arrived* in order.
> If order matters, set `async_handlers=False` (events of a client are then processed one
> after another) or serialize per key yourself.

### FastAPI + Socket.IO on one port (ASGI) — verified

```python
# server.py
import socketio
from fastapi import FastAPI

sio = socketio.AsyncServer(async_mode="asgi", cors_allowed_origins=["http://localhost:5173"])
api = FastAPI()

@api.get("/health")
async def health():
    return {"ok": True}

# Socket.IO handles /socket.io/, everything else goes to FastAPI
app = socketio.ASGIApp(sio, other_asgi_app=api)

@sio.event
async def connect(sid, environ, auth):
    if not auth or auth.get("token") != "good":
        raise socketio.exceptions.ConnectionRefusedError("unauthorized")   # → client connect_error
    await sio.save_session(sid, {"user_id": "u1"})                         # ≈ socket.data
    await sio.enter_room(sid, "user:u1")                                   # per-user room
    await sio.emit("welcome", {"sid": sid}, to=sid)

@sio.on("sum")
async def sum_(sid, data):
    return data["a"] + data["b"]          # return value = acknowledgement

@sio.on("join")
async def join(sid, room):
    await sio.enter_room(sid, room)
    await sio.emit("joined", {"room": room}, room=room, skip_sid=sid)     # room, excluding sender
    return {"ok": True}

@sio.on("ask-client")
async def ask_client(sid):
    answer = await sio.call("question", "2+2?", to=sid, timeout=5)     # server -> client with ack
    return {"client_said": answer}

@sio.event
async def disconnect(sid, reason):
    print("disconnect", sid, reason)
```

Run: `uvicorn server:app --port 8765`.

What the Node.js client observed (real output):

```
bad token -> unauthorized active: false        ← middleware-style rejection, no auto-retry
welcome string
sum ack: 5
join ack: { ok: true }
call: { client_said: 4 }                       ← server-initiated ack round trip
transport: websocket                           ← upgraded from polling
(server) disconnect GE5M_tNyD_-xOgj_AAAD client disconnect
```

> Note the `disconnect(sid, reason)` signature: recent python-socketio versions pass the
> reason (e.g. `"client disconnect"`, `"server disconnect"`, `"ping timeout"`,
> `"transport close"`); older versions call `disconnect(sid)` only.

### Class-based namespaces

```python
class ChatNamespace(socketio.AsyncNamespace):
    async def on_connect(self, sid, environ, auth):
        await self.enter_room(sid, "lobby")

    async def on_message(self, sid, data):          # handles the "message" event
        await self.emit("message", data, room="lobby", skip_sid=sid)
        return {"ok": True}

    async def on_disconnect(self, sid, reason):
        pass

sio.register_namespace(ChatNamespace("/chat"))
```

Method name = `on_` + event name. This is the Python equivalent of feature-based handler
modules.

### aiohttp

```python
from aiohttp import web
import socketio

sio = socketio.AsyncServer(async_mode="aiohttp")
app = web.Application()
sio.attach(app)          # serves /socket.io/ on the aiohttp app

if __name__ == "__main__":
    web.run_app(app, port=8000)
```

### Flask-SocketIO — verified

```python
from flask import Flask, request
from flask_socketio import SocketIO, emit, join_room, ConnectionRefusedError

app = Flask(__name__)
socketio = SocketIO(app, cors_allowed_origins=["http://localhost:5173"])

@socketio.on("connect")
def on_connect(auth):
    if not auth or auth.get("token") != "good":
        raise ConnectionRefusedError("unauthorized")
    join_room("lobby")                              # uses request.sid implicitly
    emit("welcome", {"sid": request.sid})           # to this client

@socketio.on("chat")
def on_chat(data):
    emit("chat", data, to="lobby", include_self=False)   # room broadcast excluding sender
    return {"ok": True}                                   # ack

if __name__ == "__main__":
    socketio.run(app, port=8780, allow_unsafe_werkzeug=True)  # dev server only
```

Observed with two Node clients: `welcome received`, the second client got
`{ text: 'hi' }`, and the sender received the ack `{ ok: true }`.

Flask-SocketIO specifics:
- `request.sid` is the current client's sid; `emit`/`send`/`join_room` without `to=`
  target the current client (context-aware, like Flask's `request`).
- `include_self=False` ≈ Node's `socket.to(room)` / `socket.broadcast`.
- **Production async modes:** `threading` (with `simple-websocket` for WebSocket),
  `eventlet` or `gevent` (with monkey patching). The Werkzeug dev server
  (`allow_unsafe_werkzeug=True`) is for development only — use gunicorn with an
  appropriate worker (e.g. `gunicorn -k eventlet -w 1 app:app` or
  `--threads` for threading mode). **One worker process per gunicorn instance**: multiple
  workers in one gunicorn need sticky sessions, which gunicorn's load balancing can't do
  — run several single-worker instances behind nginx with sticky sessions + a
  `message_queue` instead.
- Scale-out: `SocketIO(app, message_queue="redis://...")`.

### Scaling Python servers with Redis — verified

```python
import socketio

mgr = socketio.AsyncRedisManager("redis://localhost:6379/0")
sio = socketio.AsyncServer(async_mode="asgi", client_manager=mgr)
app = socketio.ASGIApp(sio)

@sio.event
async def connect(sid, environ, auth):
    await sio.enter_room(sid, "news")

@sio.on("shout")
async def shout(sid, msg):
    await sio.emit("news", msg, room="news")    # reaches clients on ALL servers
```

Test: two uvicorn processes on ports 8771 and 8772, client A on 8771 emits `shout`, client
B on 8772 printed `client on server B got: hello from server A`.

Other managers: `AsyncAioPikaManager` (RabbitMQ), `KafkaManager`, `KombuManager`,
`ZmqManager` (and sync versions `RedisManager` etc.). As in Node, **sticky sessions are
required** when polling is enabled.

### Emitting from a worker process (write-only manager) — verified

```python
import asyncio, socketio

async def main():
    external = socketio.AsyncRedisManager("redis://localhost:6379/0", write_only=True)
    await external.emit("news", "hello from a worker process", room="news")

asyncio.run(main())
```

A Node client connected to a Python server received
`client got: hello from a worker process`. This is the Python equivalent of
`@socket.io/redis-emitter`. (Celery tasks commonly use this to push progress updates.)

### The Python client

```python
import asyncio, socketio

async def main():
    sio = socketio.AsyncClient(reconnection=True)

    @sio.event
    async def connect():
        print("connected", sio.sid)

    @sio.on("news")
    async def on_news(msg):
        print("got", msg)

    await sio.connect("https://api.example.com", auth={"token": "..."}, transports=["websocket"])
    result = await sio.call("sum", {"a": 1, "b": 2}, timeout=5)    # emit with ack
    await sio.emit("typing", {"conversationId": "c1"})
    await sio.wait()                                               # keep running

asyncio.run(main())
```

It works against Node servers too (the Python client and server both speak the standard
protocol). There's also `socketio.SimpleClient` / `AsyncSimpleClient` for scripts:
`client.connect(url)`, `client.emit(...)`, `event = client.receive()`.

### Python-specific pitfalls

- **Units:** seconds everywhere (`ping_interval`, `timeout`), Node uses ms.
- **Blocking calls** in async handlers (sync DB drivers, `time.sleep`, `requests`) block
  the event loop → ping timeouts. Use async libraries or `asyncio.to_thread`.
- **Monkey patching** (eventlet/gevent) must happen before other imports.
- `cors_allowed_origins` default (`None`) only allows the same origin as the request's
  host (and the `X-Forwarded-Proto/Host` variant behind a proxy); set it explicitly.
- **Origin checks apply to WebSocket too in Python — unlike Node.** Tested with a raw
  WebSocket client sending a forged `Origin`:

  | Server | Allowed origin | `Origin: https://evil.example` |
  |---|---|---|
  | python-socketio (`cors_allowed_origins=["http://localhost:5173"]`) | accepted | **rejected, HTTP 403** |
  | Node socket.io (`cors: { origin: "http://localhost:5173" }`) | accepted | **accepted** |

  So python-engineio gives you Cross-Site WebSocket Hijacking protection out of the box,
  while in Node you must add an `allowRequest` origin check yourself (Chapter 6.5).
- Concurrent handler execution (`async_handlers=True`) → ordering surprises (see above).
- Testing: `socketio.AsyncClient` against a server started in the test, or
  `flask_socketio.SocketIOTestClient` (`socketio.test_client(app)`) for Flask.

---

## 17.4 Go — `github.com/zishang520/socket.io` — verified

```bash
go get github.com/zishang520/socket.io/servers/socket/v3
```

```go
package main

import (
	"log"
	"net/http"

	"github.com/zishang520/socket.io/servers/socket/v3"
)

func main() {
	server := socket.NewServer(nil, nil)

	// connection middleware: reject unauthenticated clients with a CONNECT_ERROR
	server.Use(func(client *socket.Socket, next func(*socket.ExtendedError)) {
		if token, _ := client.Handshake().Auth["token"].(string); token != "good" {
			next(socket.NewExtendedError("unauthorized", map[string]any{"code": "AUTH"}))
			return
		}
		next(nil)
	})

	server.On("connection", func(clients ...any) {
		client := clients[0].(*socket.Socket)
		client.Join("lobby")
		client.Emit("welcome", map[string]any{"sid": string(client.Id())})

		// the ack callback is the LAST argument
		client.On("sum", func(args ...any) {
			p := args[0].(map[string]any)
			ack := args[len(args)-1].(socket.Ack)
			ack([]any{p["a"].(float64) + p["b"].(float64)}, nil) // JSON numbers decode as float64
		})

		client.On("chat", func(args ...any) {
			client.To("lobby").Emit("chat", args[0]) // room, excluding sender
			if ack, ok := args[len(args)-1].(socket.Ack); ok {
				ack([]any{map[string]any{"ok": true}}, nil)
			}
		})

		client.On("disconnect", func(reason ...any) {
			log.Println("disconnect", client.Id(), reason[0])
		})
	})

	http.Handle("/socket.io/", server.ServeHandler(nil))
	log.Fatal(http.ListenAndServe(":8795", nil))
}
```

Real output with Node clients: `bad -> unauthorized active: false`, `sum: 42`,
`chat ack: { ok: true }`, the other client received `{ text: 'hi go' }`, the sender did
not; server logged `disconnect … client namespace disconnect`.

Go-specific notes:
- Handlers are variadic `func(args ...any)`; you type-assert. **JSON numbers arrive as
  `float64`**; objects as `map[string]any`.
- The ack is `socket.Ack` = `func([]any, error)`; call it with a slice of response values.
- API mirrors Node: `server.Of("/admin", nil)`, `server.To(room).Emit`, `client.Timeout(d)`,
  `client.EmitWithAck`, `socket.DefaultServerOptions()` with `SetPingInterval`,
  `SetMaxHttpBufferSize`, `SetCors(&types.Cors{...})`.
- Integrates with `net/http`, fasthttp and Fiber (via adaptors) through
  `server.ServeHandler(opts)`.
- `DEBUG=socket.io*` enables logs, like Node.

---

## 17.5 Rust — `socketioxide` — verified

```toml
# Cargo.toml
[dependencies]
socketioxide = { version = "0.18", features = ["state"] }
axum = "0.8"
tokio = { version = "1", features = ["full"] }
serde = { version = "1", features = ["derive"] }
serde_json = "1"
anyhow = "1"
```

```rust
use axum::routing::get;
use serde::Deserialize;
use serde_json::{json, Value};
use socketioxide::{
    extract::{AckSender, Data, SocketRef, TryData},
    handler::ConnectHandler,
    SocketIo,
};

#[derive(Debug, Deserialize)]
struct Auth { token: String }

#[derive(Debug, Deserialize)]
struct Sum { a: i64, b: i64 }

// connect middleware: Err(...) rejects the connection with a CONNECT_ERROR (message = Display)
async fn auth_middleware(TryData(auth): TryData<Auth>) -> Result<(), anyhow::Error> {
    match auth {
        Ok(a) if a.token == "good" => Ok(()),
        _ => Err(anyhow::anyhow!("unauthorized")),
    }
}

async fn on_connect(socket: SocketRef) {
    socket.join("lobby");
    socket.emit("welcome", &json!({ "sid": socket.id.to_string() })).ok();

    socket.on("sum", async |Data(p): Data<Sum>, ack: AckSender| {
        ack.send(&(p.a + p.b)).ok();
    });

    socket.on("chat", async |s: SocketRef, Data(msg): Data<Value>, ack: AckSender| {
        s.to("lobby").emit("chat", &msg).await.ok();   // to room, excluding sender
        ack.send(&json!({ "ok": true })).ok();
    });

    socket.on_disconnect(async |s: SocketRef| {
        println!("disconnected {}", s.id);
    });
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let (layer, io) = SocketIo::new_layer();
    io.ns("/", on_connect.with(auth_middleware));      // namespace + connect middleware

    let app = axum::Router::new()
        .route("/health", get(|| async { "ok" }))
        .layer(layer);                                  // Socket.IO is a Tower layer

    let listener = tokio::net::TcpListener::bind("0.0.0.0:8790").await?;
    axum::serve(listener, app).await?;
    Ok(())
}
```

Real output with Node clients: `bad -> unauthorized active: false`, `sum: 42`,
`chat ack: { ok: true }`, the other client got `{ text: 'hi rust' }`, the sender didn't.

Rust-specific notes:
- **Extractors** (axum-style): `SocketRef`, `Data<T>` (deserialized payload),
  `TryData<T>` (deserialization result, lets you handle bad payloads), `AckSender`,
  `State<T>` (shared state, `state` feature), `Extension`, `HttpExtension`.
- Payload types are your own `serde` structs → **type-checked deserialization** of client
  data, a nice security property (malformed payloads fail to deserialize).
- In 0.18, connect middlewares must be **async** functions returning `Result<(), E>`
  where `E: Display` (a synchronous fn fails to compile with "Invalid ConnectMiddleware").
- Room broadcasts are async (`.emit(...).await`) because they may go through an adapter.
- Store per-socket data with `socket.extensions.insert(...)`.
- Scaling adapters: `socketioxide-redis`, `socketioxide-mongodb`, `socketioxide-postgres`;
  emitting from other processes: `socketioxide-emitter`.
- Supports protocol v5 by default and the old v4 protocol (v2 JS clients) behind the `v4`
  feature flag.

---

## 17.6 Java — `netty-socketio` (server) — verified with caveats

```xml
<dependency>
  <groupId>com.corundumstudio.socketio</groupId>
  <artifactId>netty-socketio</artifactId>
  <version>2.0.13</version>
</dependency>
```

```java
import com.corundumstudio.socketio.AuthorizationResult;
import com.corundumstudio.socketio.Configuration;
import com.corundumstudio.socketio.SocketIOServer;
import java.util.Map;

Configuration config = new Configuration();
config.setHostname("0.0.0.0");
config.setPort(8810);
// runs on the HTTP handshake (before any namespace CONNECT): here, a query parameter check
config.setAuthorizationListener(data ->
    "web".equals(data.getSingleUrlParam("platform"))
        ? AuthorizationResult.SUCCESSFUL_AUTHORIZATION
        : AuthorizationResult.FAILED_AUTHORIZATION);

SocketIOServer server = new SocketIOServer(config);

server.addConnectListener(client -> client.joinRoom("lobby"));

server.addEventListener("sum", Map.class, (client, data, ackRequest) -> {
    int a = ((Number) data.get("a")).intValue(), b = ((Number) data.get("b")).intValue();
    if (ackRequest.isAckRequested()) ackRequest.sendAckData(a + b);
});

server.addEventListener("chat", Map.class, (client, data, ackRequest) -> {
    server.getRoomOperations("lobby").sendEvent("chat", client, data);  // `client` is excluded
    ackRequest.sendAckData(Map.of("ok", true));
});

server.addDisconnectListener(client -> { /* ... */ });
server.start();
```

Observed with Node `socket.io-client` 4.8.4: `sum: 42`, `chat ack: { ok: true }`, room
broadcast reached the other client and excluded the sender. **Caveats seen in the test:**

1. The authorization listener runs at the **HTTP handshake**, so a rejection reaches the
   JS client as a transport failure (`connect_error: "xhr poll error"`) — not as a
   middleware-style `connect_error` with your message, and `socket.active` stays `true`
   (the client keeps retrying). Plan your client error handling accordingly.
2. In this test, `client.getHandshakeData().getAuthToken()` returned **`null`** for the
   main namespace even though the client sent an `auth` payload. Pass tokens in the
   query string (over HTTPS) or verify `auth` support for your exact version and
   namespace before relying on it.

Scaling: `netty-socketio` supports Redisson (Redis) and Hazelcast "stores" for
multi-node setups — internal to netty-socketio, not compatible with Node adapters.

> For Spring Boot teams, alternatives include running a Node/Rust/Go Socket.IO gateway
> next to the Java services, or using Spring's native WebSocket/STOMP support when you
> control both clients and server.

---

## 17.7 Mixing languages — rules that matter

1. **Clients ↔ servers interoperate across languages** as long as protocol versions match
   (all verified above with the Node client).
2. **Servers of different languages cannot share a cluster.** Node's Redis adapter,
   python-socketio's Redis manager, socketioxide-redis and netty-socketio's Redisson store
   all use their own message formats/channels. Pick one server implementation per cluster.
3. **Emitters are implementation-specific too**: use `@socket.io/redis-emitter` with Node
   adapter clusters, `AsyncRedisManager(write_only=True)` with Python clusters, etc.
   For a polyglot backend, put a **message broker** (Kafka/RabbitMQ/SQS) in front of the
   realtime gateway and let any service publish domain events there.
4. **Units differ:** Node/Java/JS clients use milliseconds; Python and Swift use seconds.
5. **Data types differ:** JSON numbers become `float64` in Go, `Number`/`Integer` in Java,
   `int`/`float` in Python; dates are strings everywhere (unless you use a custom parser —
   Chapter 19).
6. **Ack styles differ:** return value (Python, NestJS), `AckSender` (Rust), `socket.Ack`
   last arg (Go), `AckRequest` (netty-socketio), callback last arg (Node).

---

## 17.8 Interview questions for this chapter

**Q1. [M] Can a Python Socket.IO server serve a React app using `socket.io-client`?**
Yes — `python-socketio` implements the same protocol; the client can't tell the
difference. Verified: auth rejection, acks, rooms, server→client calls, upgrade to WebSocket.

**Q2. [M] How do you acknowledge an event in python-socketio?**
Return a value from the handler; the client's ack callback receives it. For
server→client acks use `await sio.call(event, data, to=sid, timeout=s)`.

**Q3. [S] Can I run Node.js and Python Socket.IO servers in the same cluster with Redis?**
No. Their Redis adapter/manager formats are different, so cross-server broadcasts won't
be understood. Use one implementation per cluster, and a broker for polyglot event
publishing.

**Q4. [M] What's the python-socketio equivalent of `socket.to(room).emit()`?**
`await sio.emit(event, data, room=room, skip_sid=sid)`; in Flask-SocketIO
`emit(event, data, to=room, include_self=False)`.

**Q5. [S] Why might events from one client be processed out of order in python-socketio?**
`async_handlers=True` (default) runs each event in its own task. Set it to `False` or
serialize per key when order matters.

**Q6. [M] How do you push from a Celery worker to Socket.IO clients of a Python cluster?**
`socketio.RedisManager(url, write_only=True).emit(...)` (or the async variant) — the
Python counterpart of `@socket.io/redis-emitter`.

**Q7. [M] What's specific about Rust's socketioxide?**
Tower layer usable with axum/hyper; axum-like extractors (`Data<T>`, `TryData<T>`,
`AckSender`, `State<T>`); typed payload deserialization via serde; async connect
middlewares; Redis/Mongo/Postgres adapters.

**Q8. [M] In the Go server, how do you get the ack callback?**
It's the last variadic argument, of type `socket.Ack` (`func([]any, error)`).

Next: [Chapter 18 — WebTransport in practice](18-webtransport.md)
