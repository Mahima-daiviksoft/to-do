# Chapter 16 — Native Mobile Clients: Android (Java/Kotlin), iOS (Swift) and Flutter (Dart)

> **Goal:** connect native mobile apps to a Socket.IO server correctly — installation,
> version compatibility, authentication, events, acknowledgements with timeouts,
> reconnection, threading, app lifecycle, background behaviour, and the bugs that only
> happen on phones.
>
> **How this chapter was checked:** the **Java** client code was compiled with Maven and
> run against a real Socket.IO 4.8.4 server (connect with `auth`, emit with an ack +
> timeout, server→client ack). The **Swift** and **Dart** APIs were checked line by line
> against the libraries' current source code and READMEs (`socket.io-client-swift`
> master, `socket_io_client` 3.1.6 on pub.dev); they could not be executed in this
> environment (no Xcode / Dart SDK).

---

## 16.1 ELI5

Your phone app wants the same walkie-talkie the website has. There are official
walkie-talkies built for each kind of phone: one for Android (Java/Kotlin), one for
iPhone (Swift), and a community one for Flutter (Dart). They all speak the same Socket.IO
language — **but only if their version matches the server's version**, just like two
walkie-talkies must be on the same channel.

Phones are special because:
- they **sleep** — when the app goes to the background, the operating system pauses it and
  the connection dies;
- their network **changes** all the time (Wi-Fi → 4G → elevator → no signal);
- UI code must run on the **main thread**, but Socket.IO callbacks arrive on a
  background thread.

---

## 16.2 Version compatibility (check this FIRST)

| Client | Version | Works with Socket.IO server |
|---|---|---|
| Java / Android (`io.socket:socket.io-client`) | 1.x | 2.x |
|  | **2.x** (latest **2.1.2**) | **3.x and 4.x** |
| Swift (`socket.io-client-swift`) | 15.x | 2.x |
|  | **16.x** | 2.x (with `.version(.two)`), **3.x and 4.x** (default) |
| Dart / Flutter (`socket_io_client`) | 0.9.x – 1.x | 2.x |
|  | 2.x | 3.x – 4.6.x |
|  | **3.x** (latest **3.1.6**) | **4.7.x – 4.x** |

The Dart table is copied from the package's README. "Works in the browser but not on
Android/iOS" is very often a client/server **protocol mismatch** — check this table
before anything else.

---

## 16.3 Android — Java

### Installation (Gradle)

```kotlin
// app/build.gradle.kts
dependencies {
    implementation("io.socket:socket.io-client:2.1.2") {
        // Android already ships org.json — exclude the duplicate to avoid conflicts
        exclude(group = "org.json", module = "json")
    }
}
```

```xml
<!-- AndroidManifest.xml -->
<uses-permission android:name="android.permission.INTERNET" />
```

Android 9+ blocks **cleartext HTTP** by default. Use `https://` in production; for local
development either use HTTPS or allow cleartext only for your dev host with a
`network_security_config`. On the **Android emulator**, your computer's `localhost` is
`10.0.2.2`; on a real device use your computer's LAN IP.

### A complete, verified example

This exact code (minus the Android-specific UI parts) was compiled and run against a
Node.js Socket.IO 4.8.4 server:

```java
import io.socket.client.Ack;
import io.socket.client.AckWithTimeout;
import io.socket.client.IO;
import io.socket.client.Socket;
import org.json.JSONObject;

import java.net.URI;
import java.util.Collections;

IO.Options options = IO.Options.builder()
    .setAuth(Collections.singletonMap("token", accessToken)) // → socket.handshake.auth on the server
    .setTransports(new String[] { "websocket" })             // recommended on mobile (see 16.6)
    .setReconnectionDelay(1000)
    .setReconnectionDelayMax(5000)
    .build();

Socket socket = IO.socket(URI.create("https://api.example.com"), options);

socket.on(Socket.EVENT_CONNECT, args -> {
    System.out.println("connected, id=" + socket.id());
});

socket.on(Socket.EVENT_CONNECT_ERROR, args -> {
    // args[0] is an Exception; for middleware rejections its message is the server's err.message
    System.out.println("connect_error: " + args[0]);
});

socket.on(Socket.EVENT_DISCONNECT, args -> {
    System.out.println("disconnect: " + args[0]);   // e.g. "io server disconnect", "transport close"
});

// receive an event
socket.on("chat:message", args -> {
    JSONObject msg = (JSONObject) args[0];          // JSON objects arrive as org.json.JSONObject
    String text = msg.optString("text");
});

// server -> client with acknowledgement: the Ack is the LAST argument
socket.on("question", args -> {
    Ack ack = (Ack) args[args.length - 1];
    ack.call("from java");
});

socket.connect();

// emit with acknowledgement AND timeout (AckWithTimeout, client 2.1+)
JSONObject payload = new JSONObject().put("a", 2).put("b", 40);
socket.emit("sum", new Object[] { payload }, new AckWithTimeout(5000) {
    @Override public void onSuccess(Object... res) { System.out.println("sum ack: " + res[0]); } // 42
    @Override public void onTimeout() { System.out.println("no answer in 5 s"); }
});

// simple emit and emit with a plain Ack (no timeout)
socket.emit("typing", new JSONObject().put("conversationId", "c1"));
socket.emit("ping-me", "hello", (Ack) res -> System.out.println(res[0]));
```

Real output of that run:

```
connected, id=Uu7oWvS3c96eMpVEAAAA
sum ack: 42
(server log) server got answer from java client: from java
```

### Data type mapping (Java ↔ JSON)

| JavaScript (server) | Java (client) |
|---|---|
| object | `org.json.JSONObject` |
| array | `org.json.JSONArray` |
| string / number / boolean | `String` / `Integer`/`Long`/`Double` / `Boolean` |
| `null` | `JSONObject.NULL` |
| `Buffer` / `ArrayBuffer` | `byte[]` |

To send an object, build a `JSONObject` (or `JSONArray`). Binary: pass a `byte[]`.

### Threading — the #1 Android bug

All Socket.IO callbacks run on the client's **internal event thread**, *not* the Android
main (UI) thread. Touching views from them throws
`CalledFromWrongThreadException` ("Only the original thread that created a view
hierarchy can touch its views").

```java
socket.on("chat:message", args -> {
    JSONObject msg = (JSONObject) args[0];
    runOnUiThread(() -> adapter.add(msg));     // Activity
    // or: new Handler(Looper.getMainLooper()).post(() -> ...);
    // or: liveData.postValue(msg);  (postValue is thread-safe; setValue is NOT)
});
```

### Other Java client APIs worth knowing

```java
socket.id();                    // null until connected
socket.connected();             // boolean
socket.isActive();              // will it reconnect automatically?
socket.off("chat:message");     // remove all listeners of an event
socket.off("chat:message", listener); // remove one (keep a reference to the Emitter.Listener!)
socket.off();                   // remove ALL listeners
socket.disconnect();            // no auto-reconnect after this
socket.io().on(Manager.EVENT_RECONNECT_ATTEMPT, args -> {});   // Manager-level events
socket.io().reconnection(false);

// other namespace on the same connection (multiplexing)
Socket admin = socket.io().socket("/admin");

// extra headers / query (Manager-level)
IO.Options.builder()
    .setExtraHeaders(Collections.singletonMap("X-App-Version", Collections.singletonList("5.2.0")))
    .setQuery("platform=android")
    .build();
```

Note the difference between `setAuth(...)` (sent in the Socket.IO CONNECT packet —
recommended for tokens) and `setQuery(...)` / `setExtraHeaders(...)` (HTTP-level; with
WebSocket on Android, headers *can* be sent, unlike in browsers).

---

## 16.4 Android — Kotlin (same library, idiomatic usage)

Kotlin uses the same `io.socket:socket.io-client` library. A production-style wrapper
with coroutines/Flow:

```kotlin
import io.socket.client.AckWithTimeout
import io.socket.client.IO
import io.socket.client.Socket
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.suspendCancellableCoroutine
import org.json.JSONObject
import java.net.URI
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException

enum class ConnState { CONNECTING, CONNECTED, DISCONNECTED }

class RealtimeClient(url: String, private val tokenProvider: () -> String) {

    // The client keeps a reference to THIS map and reads it on every connection attempt,
    // so updating it before connect() sends the fresh token (verified with client 2.1.2).
    private val auth = HashMap<String, String>()

    private val socket: Socket = IO.socket(
        URI.create(url),
        IO.Options.builder()
            .setAuth(auth)
            .setTransports(arrayOf("websocket"))
            .setReconnectionDelayMax(10_000)
            .build()
    )

    private val _state = MutableStateFlow(ConnState.DISCONNECTED)
    val state: StateFlow<ConnState> = _state

    init {
        socket.on(Socket.EVENT_CONNECT) { _state.value = ConnState.CONNECTED }
        socket.on(Socket.EVENT_DISCONNECT) { _state.value = ConnState.DISCONNECTED }
        socket.on(Socket.EVENT_CONNECT_ERROR) { args ->
            _state.value = ConnState.DISCONNECTED
            if (!socket.isActive) {
                // rejected by server middleware → refresh the token and try again (or log out)
            }
        }
    }

    fun connect() {
        // refresh auth before EVERY connect so new connections use the latest token
        auth["token"] = tokenProvider()
        _state.value = ConnState.CONNECTING
        socket.connect()
    }

    fun disconnect() = socket.disconnect()

    /** Events as a cold Flow: listener added on collect, removed on cancel (no leaks). */
    fun events(name: String): Flow<JSONObject> = callbackFlow {
        val listener = io.socket.emitter.Emitter.Listener { args -> trySend(args[0] as JSONObject) }
        socket.on(name, listener)
        awaitClose { socket.off(name, listener) }
    }

    /** Request/response with timeout, as a suspend function. */
    suspend fun request(event: String, payload: JSONObject, timeoutMs: Long = 5_000): Any? =
        suspendCancellableCoroutine { cont ->
            socket.emit(event, arrayOf(payload), object : AckWithTimeout(timeoutMs) {
                override fun onSuccess(vararg args: Any?) { cont.resume(args.firstOrNull()) }
                override fun onTimeout() { cont.resumeWithException(RuntimeException("ack timeout: $event")) }
            })
        }
}
```

> **Refreshing the token (verified):** `Socket`'s own `auth` field is private, so you
> can't assign a new map. But the socket stores a reference to the map you passed to
> `setAuth(...)` and serializes it on every CONNECT. Keep that map in a field and update
> it before calling `connect()` — a test run printed `token-1` for the first connection
> and `token-2` for the second after `auth.put("token", "token-2")`. Note that
> *automatic* reconnections reuse whatever the map contains at that moment, so update it
> as soon as you refresh the token.

Usage in a ViewModel:

```kotlin
class ChatViewModel(private val rt: RealtimeClient) : ViewModel() {
    val messages = rt.events("chat:message")
        .map { Message.fromJson(it) }
        .shareIn(viewModelScope, SharingStarted.WhileSubscribed(5_000))

    fun send(text: String) = viewModelScope.launch {
        try {
            rt.request("message:send", JSONObject().put("text", text).put("clientMsgId", UUID.randomUUID().toString()))
        } catch (e: Exception) { /* show retry */ }
    }
}
```

Collecting a Flow on the main dispatcher solves the threading problem automatically
(`trySend` is thread-safe, collection happens where you collect).

### Lifecycle on Android

- **Where to own the socket:** one instance for the whole app (Application-scoped
  singleton / DI `@Singleton`), not per Activity — otherwise rotations create new
  connections and duplicate listeners.
- **Foreground/background:** observe `ProcessLifecycleOwner`:
  ```kotlin
  ProcessLifecycleOwner.get().lifecycle.addObserver(object : DefaultLifecycleObserver {
      override fun onStart(owner: LifecycleOwner) = rt.connect()     // app visible
      override fun onStop(owner: LifecycleOwner) = rt.disconnect()   // app in background
  })
  ```
  Keeping a socket open in the background drains battery and Android (Doze, App Standby)
  will cut network access anyway.
- **Background delivery:** use **Firebase Cloud Messaging (FCM)**. A Socket.IO connection
  is not a substitute for push notifications. If you truly need a long-lived connection
  while in background (e.g. a ride in progress), use a **foreground service** with a
  visible notification — and expect the OS to still be strict.
- **Network changes:** register a `ConnectivityManager.NetworkCallback`; on `onAvailable`
  call `socket.connect()` if not connected (faster than waiting for the back-off).
- **ProGuard/R8:** the library works with R8; if you use reflection-based JSON mapping on
  top, keep your model classes.

---

## 16.5 iOS — Swift (`socket.io-client-swift`)

### Installation

Swift Package Manager (Xcode → File → Add Packages), or `Package.swift`:

```swift
.package(url: "https://github.com/socketio/socket.io-client-swift", .upToNextMinor(from: "16.1.1"))
// target dependency: "SocketIO"
```

CocoaPods: `pod 'Socket.IO-Client-Swift', '~> 16.1.1'`. The library depends on
**Starscream** (WebSocket implementation).

### Core concepts

- **`SocketManager`** = the connection (like the JS `Manager`): one per server URL. **You
  must keep a strong reference** to it (e.g. a property of a long-lived service). If the
  manager is deallocated, the socket silently disconnects — the most common iOS bug.
- **`SocketIOClient`** = one namespace socket: `manager.defaultSocket` (namespace `/`) or
  `manager.socket(forNamespace: "/admin")`.

### A complete example

```swift
import SocketIO

final class RealtimeService {
    static let shared = RealtimeService()

    // keep STRONG references for the lifetime of the app
    private let manager: SocketManager
    private let socket: SocketIOClient

    private init() {
        manager = SocketManager(
            socketURL: URL(string: "https://api.example.com")!,
            config: [
                .log(false),
                .compress,
                .forceWebsockets(true),     // skip long-polling (see 16.6)
                .reconnects(true),
                .reconnectAttempts(-1),     // -1 = never give up
                .reconnectWait(1),          // seconds (min delay)
                .reconnectWaitMax(10),      // seconds (max delay)
                .randomizationFactor(0.5),
                .extraHeaders(["X-App-Version": "5.2.0"]),
                .connectParams(["platform": "ios"]),   // query string parameters
            ]
        )
        socket = manager.defaultSocket
        registerHandlers()
    }

    private func registerHandlers() {
        socket.on(clientEvent: .connect) { data, ack in
            print("connected", self.socket.sid ?? "")
        }
        socket.on(clientEvent: .disconnect) { data, ack in
            print("disconnected", data)
        }
        socket.on(clientEvent: .error) { data, ack in
            // connection errors, including server middleware rejections (connect_error)
            print("error", data)
        }
        socket.on(clientEvent: .reconnectAttempt) { data, ack in
            print("reconnect attempt", data)
        }

        socket.on("chat:message") { data, ack in
            guard let msg = data.first as? [String: Any], let text = msg["text"] as? String else { return }
            print("message:", text)
        }

        // server -> client with acknowledgement
        socket.on("question") { data, ack in
            ack.with("from swift")
        }
    }

    func connect(token: String) {
        // the payload becomes socket.handshake.auth on the server
        socket.connect(withPayload: ["token": token])
    }

    func disconnect() { socket.disconnect() }

    func send(text: String, conversationId: String) {
        socket.emitWithAck("message:send", ["conversationId": conversationId, "text": text])
            .timingOut(after: 5) { data in
                if data.first as? String ?? "passed" == SocketAckStatus.noAck {
                    print("server did not answer within 5 s")   // timeout
                    return
                }
                print("ack:", data)
            }
    }
}
```

Facts to remember (verified in the library source):

| JS concept | Swift API |
|---|---|
| `io(url, opts)` | `SocketManager(socketURL:config:)` + `manager.defaultSocket` |
| `auth` option | `socket.connect(withPayload: [...])` |
| `query` | `.connectParams([...])` |
| `transports: ["websocket"]` | `.forceWebsockets(true)` (`.forcePolling(true)` for polling only) |
| `reconnectionDelay`/`Max` | `.reconnectWait(sec)` / `.reconnectWaitMax(sec)` — **seconds**, not ms |
| `reconnectionAttempts` | `.reconnectAttempts(n)` (`-1` = infinite) |
| `forceNew` | `.forceNew(true)` |
| `path` | `.path("/socket.io/")` |
| v2 server | `.version(.two)` (default is `.three` = Socket.IO 3/4) |
| Self-signed cert (dev) | `.selfSigned(true)`; certificate pinning: `.security(...)` |
| `socket.on("connect")` | `socket.on(clientEvent: .connect)` |
| Client events | `.connect`, `.disconnect`, `.error`, `.ping`, `.pong`, `.reconnect`, `.reconnectAttempt`, `.statusChange`, `.websocketUpgrade` |
| emit with ack | `socket.emitWithAck("e", items).timingOut(after: seconds) { data in }` — timeout detected by comparing with `SocketAckStatus.noAck` |
| reply to an ack | `ack.with(items...)` |
| other namespace | `manager.socket(forNamespace: "/admin")` |
| `socket.id` | `socket.sid` |

### No offline buffering in the Swift client

Unlike the JavaScript and Java clients, the Swift client **does not buffer** emits while
disconnected: `emit` on a socket that isn't connected triggers the `.error` client event
with `"Tried emitting when not connected"` and the event is dropped (from
`SocketIOClient.swift`). Check `socket.status == .connected` before emitting, and keep
important messages in your own outbox (Chapter 21) until they're acknowledged.

Also: a server middleware rejection (`CONNECT_ERROR`) arrives as the `"error"` event on
the Swift socket, with the error payload as data.

### Threading on iOS

By default handlers are called on the **main queue** (`handleQueue` defaults to
`DispatchQueue.main`), so you can update UIKit/SwiftUI directly. For heavy processing,
set `.handleQueue(someBackgroundQueue)` and hop back to main for UI.

### SwiftUI integration

```swift
@MainActor
final class ChatStore: ObservableObject {
    @Published var messages: [String] = []
    @Published var connected = false
    private let manager = SocketManager(socketURL: URL(string: "https://api.example.com")!,
                                        config: [.forceWebsockets(true)])
    private var socket: SocketIOClient { manager.defaultSocket }

    init() {
        socket.on(clientEvent: .connect) { [weak self] _, _ in self?.connected = true }
        socket.on(clientEvent: .disconnect) { [weak self] _, _ in self?.connected = false }
        socket.on("chat:message") { [weak self] data, _ in
            if let m = data.first as? [String: Any], let t = m["text"] as? String { self?.messages.append(t) }
        }
    }
    func start(token: String) { socket.connect(withPayload: ["token": token]) }
}
```

Use `[weak self]` in handlers to avoid retain cycles (the socket holds the closures; the
store holds the socket).

### iOS lifecycle

- iOS suspends apps a few seconds after they go to background; the connection dies.
  Observe `scenePhase` (SwiftUI) or `UIApplication.didEnterBackgroundNotification` and
  disconnect cleanly; reconnect on `.active`.
- Use **APNs push notifications** for background delivery.
- **App Transport Security (ATS)** blocks plain `http://` by default — use HTTPS in
  production; for local dev add an ATS exception only for your dev host.
- Simulator can reach your Mac's `localhost` directly; a real device needs your Mac's LAN IP.

---

## 16.6 Why `websocket`-only is common on mobile

- Mobile apps control their networking stack (no corporate proxies inside the app as with
  enterprise browsers), and WebSocket is reliable on 4G/5G/Wi-Fi.
- It removes the need for **sticky sessions** on your load balancer.
- Fewer HTTP requests → less battery and data.
- On iOS/Android, polling implementations differ subtly from browsers' XHR; WebSocket-only
  avoids a class of issues.

Keep polling enabled only if your users are known to be behind WebSocket-hostile
networks (some enterprise MDM VPNs).

---

## 16.7 Flutter / Dart (`socket_io_client`)

### Installation

```yaml
# pubspec.yaml
dependencies:
  socket_io_client: ^3.1.6   # for Socket.IO server 4.7+; see the compatibility table
```

### A complete example

```dart
import 'package:socket_io_client/socket_io_client.dart' as IO;

class RealtimeService {
  late final IO.Socket socket;

  RealtimeService(String url, String Function() tokenProvider) {
    socket = IO.io(
      url,
      IO.OptionBuilder()
          .setTransports(['websocket'])      // REQUIRED for Flutter / Dart VM (see note)
          .disableAutoConnect()              // connect explicitly
          .setAuth({'token': tokenProvider()})
          .setReconnectionDelay(1000)
          .setReconnectionDelayMax(5000)
          .setExtraHeaders({'x-app-version': '5.2.0'})
          .build(),
    );

    socket.onConnect((_) => print('connected ${socket.id}'));
    socket.onConnectError((err) => print('connect_error $err'));
    socket.onDisconnect((reason) => print('disconnected $reason'));

    socket.on('chat:message', (data) {
      final text = (data as Map)['text'];
      print('message: $text');
    });

    // server -> client with ack. When an event carries MORE than one value (here: the
    // payload + the ack function), the handler receives ONE List; the ack is its last item.
    socket.on('question', (data) {
      final list = data as List;
      final question = list.first;
      final ack = list.last as Function;
      ack('from dart');     // callable once; later calls are ignored
    });
  }

  void connect() => socket.connect();     // don't call connect() if autoConnect is enabled
  void disconnect() => socket.disconnect();

  // emit with ack (callback)
  void send(String text) {
    socket.emitWithAck('message:send', {'text': text}, ack: (res) {
      print('ack: $res');
    });
  }

  // emit with ack (Future) + timeout
  Future<dynamic> request(String event, dynamic data) {
    return socket.timeout(5000).emitWithAckAsync(event, data);
  }

  void dispose() {
    socket.dispose();   // removes listeners and closes — call in your widget/service dispose
  }
}
```

Facts (verified in the package source, v3.1.6):

- `OptionBuilder` methods include `setTransports`, `setAuth` (and `setAuthFn` for a
  function computed per connection), `setQuery`, `setPath`, `setExtraHeaders`,
  `enableAutoConnect`/`disableAutoConnect`, `enableReconnection`/`disableReconnection`,
  `setReconnectionAttempts`, `setReconnectionDelay`, `setReconnectionDelayMax`,
  `setRandomizationFactor`, `setTimeout`, `enableForceNew`, `enableMultiplex`/`disableMultiplex`,
  `enableWithCredentials`, `setRememberUpgrade`, `setUpgrade`, `setParser`,
  `enableAddTrailingSlash`/`disableAddTrailingSlash`.
- `emitWithAck(event, data, {ack})` and `emitWithAckAsync(event, data)` (a `Future`);
  `socket.timeout(ms)` exists; with a timeout, the Future completes with an error when
  the server doesn't answer.
- Client `retries` (at-least-once) are supported as in the JS client.
- `socket.active` mirrors the JS property.
- **`setTransports(['websocket'])` is required on Flutter mobile/desktop** (the README
  states it); the polling transport is meant for Flutter Web.
- **Receiving multiple arguments:** the Dart client calls your handler with a single
  value when the event has one argument, but with a **`List` of all arguments** when it
  has more than one (including the ack function). So a server
  `socket.emit("move", x, y)` arrives as `[x, y]` in Dart. Prefer a single object payload
  on the server — it keeps every platform simple.
- **Data shape:** if you emit a `List`, its items are spread as separate arguments
  (the source does `sendData.addAll(data)` for iterables). To send a list as **one**
  argument, wrap it: `socket.emit('items', [myList])` or send a `Map`.

### Flutter lifecycle

- Own the socket in a long-lived service (Provider/Riverpod/GetIt), not in a widget's
  `build`.
- If a `StatefulWidget` registers handlers, remove them in `dispose()`
  (`socket.off('event', handler)`), or use `socket.dispose()` when the whole service goes
  away.
- Use `WidgetsBindingObserver.didChangeAppLifecycleState` to disconnect in `paused` and
  reconnect in `resumed`.
- Background delivery → FCM/APNs (e.g. `firebase_messaging`).

---

## 16.8 Mobile-specific production checklist

- [ ] Client library version compatible with server version (16.2 table).
- [ ] HTTPS/WSS (ATS on iOS, cleartext policy on Android).
- [ ] One socket instance per app (singleton/DI); strong reference to `SocketManager` on iOS.
- [ ] Handlers update UI on the main thread (Android) / handlers don't create retain cycles (iOS).
- [ ] Listeners removed when screens are destroyed (or use Flows/Observables with teardown).
- [ ] Token passed via `auth` (`setAuth`, `connect(withPayload:)`), refreshed before reconnecting.
- [ ] Disconnect on background, reconnect on foreground; push notifications for background delivery.
- [ ] Re-sync missed data on every connect (last message id) — mobile networks drop often.
- [ ] `websocket`-only transport unless polling is genuinely needed.
- [ ] Send app version in `auth`/headers; server rejects too-old clients with a clear error.
- [ ] Test on real devices: airplane mode on/off, Wi-Fi↔cellular switch, lock screen, low-power mode.

---

## 16.9 Interview questions for this chapter

**Q1. [M] Which Java client version works with a Socket.IO v4 server?**
The 2.x line (latest 2.1.2). 1.x speaks the v2 protocol.

**Q2. [M] My Android app crashes with "Only the original thread that created a view hierarchy can touch its views" when a message arrives. Why?**
Socket.IO Java callbacks run on the client's event thread, not the main thread. Post to
the UI thread (`runOnUiThread`, `Handler(Looper.getMainLooper())`, `LiveData.postValue`,
or collect a Flow on the main dispatcher).

**Q3. [M] My iOS socket disconnects immediately after connecting, with no error. Why?**
Most often the `SocketManager` was a local variable and got deallocated. Keep a strong
reference (property of a long-lived object).

**Q4. [M] How do you send an auth token from Swift / Java / Dart?**
Swift: `socket.connect(withPayload: ["token": t])`. Java: `IO.Options.builder().setAuth(map)`.
Dart: `OptionBuilder().setAuth({...})` or `setAuthFn`. All land in
`socket.handshake.auth` on the server.

**Q5. [M] How do you do an ack with timeout on each platform?**
Java: `AckWithTimeout(ms)` with `onSuccess`/`onTimeout`. Swift:
`emitWithAck(...).timingOut(after: seconds) { data in }` and check `SocketAckStatus.noAck`.
Dart: `socket.timeout(ms).emitWithAckAsync(...)`. JS: `socket.timeout(ms).emitWithAck(...)`.

**Q6. [S] How do mobile apps get messages while in the background?**
They don't, through Socket.IO — the OS suspends the app. Use FCM/APNs push, then sync over
the socket/HTTP when the app returns to the foreground.

**Q7. [M] Why do many teams use WebSocket-only transport on mobile?**
Reliability, no sticky sessions needed, fewer requests (battery), and polling
implementations on mobile platforms are less battle-tested than browsers'.

**Q8. [M] Why is `Swift .reconnectWait(1)` different from JS `reconnectionDelay: 1000`?**
Same meaning, different unit — Swift uses seconds, JS/Java use milliseconds.

**Q9. [M] A Flutter client connects in Flutter Web but not on Android. What's the first thing to check?**
`setTransports(['websocket'])` (required on Flutter mobile per the package docs), then
the package/server version compatibility table and cleartext/HTTPS settings.

Next: [Chapter 17 — Servers and clients in other languages](17-other-languages.md)
