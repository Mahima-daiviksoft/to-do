# Chapter 6: Clients (JavaScript, React, React Native, Angular, Java, Python, SockJS)

> **Goal:** connect any client to a STOMP server correctly, robustly and securely, and know the
> platform-specific traps (especially React Native).

---

## 6.1 ELI5

The server is the post office. The **client** is your mailbox at home plus the person who checks it.
A good client:
1. Connects and shows its ID card (CONNECT with token).
2. Says which mailboxes it wants (SUBSCRIBE).
3. Re-connects by itself if the line breaks, and **asks for its mailboxes again**.
4. Says "beep" regularly so the post office knows it's alive (heart-beats).
5. Cleans up when the screen that needed messages is closed (UNSUBSCRIBE).

---

## 6.2 Choosing a JavaScript library

| Library | Status | Notes |
|---------|--------|-------|
| **`@stomp/stompjs`** (v7) | **Actively maintained, the standard** | TypeScript, auto-reconnect, heart-beats, works in browsers, Node, React Native |
| `@stomp/rx-stomp` | Maintained | RxJS wrapper over stompjs; great for Angular |
| `@stomp/ng2-stompjs` | **Deprecated** | Use `rx-stomp` with an Angular service instead |
| `stompjs` (jmesnil, `Stomp.over(ws)`) | **Abandoned** (2014) | Old tutorials use it. Migrate |
| `webstomp-client` | Unmaintained | Avoid in new code |
| `sockjs-client` | Low activity | Only if you need SockJS fallbacks |

```bash
npm install @stomp/stompjs
# optional
npm install @stomp/rx-stomp rxjs
npm install sockjs-client
```

---

## 6.3 `@stomp/stompjs` v7: complete guide

### 6.3.1 Basic usage

```ts
import { Client, IMessage, StompSubscription } from '@stomp/stompjs';

const client = new Client({
  brokerURL: 'wss://api.example.com/ws',          // native WebSocket URL (not http://)
  connectHeaders: { Authorization: `Bearer ${getAccessToken()}` },
  heartbeatIncoming: 10000,                        // want server heart-beats every 10s (0 = disable)
  heartbeatOutgoing: 10000,                        // will send heart-beats every 10s
  reconnectDelay: 5000,                            // ms between reconnect attempts (0 = no auto-reconnect)
  connectionTimeout: 10000,                        // give up a connection attempt if CONNECTED not received in time
  debug: (msg) => { if (import.meta.env.DEV) console.debug(msg); },
});

client.onConnect = (frame) => {
  // Called on EVERY successful (re)connect. Put all subscriptions here!
  client.subscribe('/topic/chat.public', (message: IMessage) => {
    const payload = JSON.parse(message.body);
    renderMessage(payload);
  });
  client.subscribe('/user/queue/errors', (m) => showError(JSON.parse(m.body)));
};

client.onStompError = (frame) => {
  // STOMP ERROR frame (server will close the connection)
  console.error('Broker error:', frame.headers['message'], frame.body);
};

client.onWebSocketClose = (evt) => console.warn('WS closed', evt.code, evt.reason);
client.onWebSocketError = (evt) => console.error('WS error', evt);

client.activate();      // start connecting (and keep reconnecting)

// Send (only when connected!)
function sendChat(text: string) {
  if (!client.connected) return queueForLater(text);
  client.publish({
    destination: '/app/chat.send',
    body: JSON.stringify({ text }),
    headers: { 'content-type': 'application/json' },
  });
}

// Shut down (e.g., logout)
await client.deactivate();   // sends DISCONNECT, stops reconnecting
```

### 6.3.2 Configuration reference (most important options)

| Option | Default | Meaning |
|--------|---------|---------|
| `brokerURL` | – | `ws://` or `wss://` URL. Ignored if `webSocketFactory` is set |
| `webSocketFactory` | – | Function returning a WebSocket-like object (e.g., `new SockJS(url)`) |
| `connectHeaders` | `{}` | Headers for CONNECT (`login`, `passcode`, `Authorization`, custom) |
| `disconnectHeaders` | `{}` | Headers for DISCONNECT |
| `heartbeatIncoming` / `heartbeatOutgoing` | `10000` / `10000` | Heart-beat intervals in ms (see Chapter 4 negotiation) |
| `reconnectDelay` | `5000` | Delay before reconnect; `0` disables auto-reconnect |
| `reconnectTimeMode`, `maxReconnectDelay` | linear | (Newer v7 releases) exponential backoff support. Check your installed version's docs |
| `connectionTimeout` | `0` (off) | Fail and retry if not CONNECTED within this time |
| `beforeConnect` | – | **async** hook called before each (re)connect, the place to **refresh tokens** |
| `onConnect`, `onDisconnect` | – | STOMP-level connected/disconnected |
| `onStompError` | – | ERROR frame received |
| `onWebSocketClose`, `onWebSocketError` | – | Transport-level events |
| `onUnhandledMessage` | – | MESSAGE that matched no subscription (e.g., arrived after unsubscribe) |
| `onUnhandledReceipt`, `onUnhandledFrame` | – | Other unmatched frames |
| `stompVersions` | 1.2, 1.1, 1.0 | Versions offered |
| `splitLargeFrames`, `maxWebSocketChunkSize` | `false`, 8 KB | Non-standard: split large outgoing frames into chunks (Spring supports reassembly) |
| `forceBinaryWSFrames` | `false` | Send frames as binary WebSocket messages (React Native workaround) |
| `appendMissingNULLonIncoming` | `false` | Append the NULL terminator that some platforms strip (React Native workaround) |
| `discardWebsocketOnCommFailure` | `false` | On heart-beat failure, immediately discard the socket instead of waiting for close |
| `logRawCommunication` | `false` | Log raw frames in `debug` |

### 6.3.3 Subscriptions

```ts
const sub: StompSubscription = client.subscribe(
  '/topic/lists.L1',
  (msg) => { /* ... */ },
  { id: 'list-L1' /* optional custom id */, ack: 'auto' }
);
sub.unsubscribe();   // sends UNSUBSCRIBE
```

* `subscribe()` throws if not connected. That's why you call it **inside `onConnect`**.
* On reconnect, **old subscriptions are gone** (server side). stompjs doesn't automatically re-subscribe; your `onConnect` runs again and re-creates them. `rx-stomp` *does* re-subscribe its `watch()`ed streams automatically.

### 6.3.4 Acknowledgements (with a full broker)

```ts
client.subscribe('/queue/jobs', (msg) => {
  try { process(JSON.parse(msg.body)); msg.ack(); }
  catch { msg.nack(); }
}, { ack: 'client-individual', 'prefetch-count': '10' /* RabbitMQ */ });
```

### 6.3.5 Receipts

```ts
const receiptId = crypto.randomUUID();
client.watchForReceipt(receiptId, () => console.log('server processed it'));
client.publish({ destination: '/queue/orders', body: '{}', headers: { receipt: receiptId } });
```

### 6.3.6 Binary messages

```ts
client.publish({ destination: '/app/upload.chunk', binaryBody: uint8Array,
                 headers: { 'content-type': 'application/octet-stream' } });
client.subscribe('/topic/bin', (m) => { const bytes = m.binaryBody; });
```

### 6.3.7 Token refresh before every connect

```ts
client.beforeConnect = async () => {
  const token = await authService.getFreshAccessToken();     // refresh if near expiry
  client.connectHeaders = { Authorization: `Bearer ${token}` };
};
```

> **Pitfall: token expired while connected.** STOMP authenticates once at CONNECT. If the token expires an
> hour later, the connection stays authenticated unless the server enforces expiry (Chapter 8). When the server
> closes the session because of expiry, `beforeConnect` must fetch a fresh token or you'll loop forever with a stale one.

### 6.3.8 Publishing safely while disconnected

`client.publish` throws `TypeError: There is no underlying STOMP connection` when not connected. Pattern:

```ts
const outbox: Array<() => void> = [];
function safePublish(p: Parameters<Client['publish']>[0]) {
  if (client.connected) client.publish(p);
  else outbox.push(() => client.publish(p));
}
client.onConnect = () => {
  resubscribeAll();
  while (outbox.length) outbox.shift()!();   // flush; server must dedupe (idempotency key!)
};
```

---

## 6.4 Legacy API (recognise it in old code)

```js
// OLD jmesnil stomp.js (2014), don't use in new code
var socket = new SockJS('/ws');
var stompClient = Stomp.over(socket);
stompClient.connect({}, function (frame) {
  stompClient.subscribe('/topic/greetings', function (msg) { ... });
});
stompClient.send('/app/hello', {}, JSON.stringify({ name: 'x' }));
```

`@stomp/stompjs` still offers a compatibility `Stomp.over()` / `CompatClient` (deprecated). The modern
mapping: `connect` → `activate` + `onConnect`; `send(dest, headers, body)` → `publish({destination, headers, body})`;
`disconnect` → `deactivate`. A key difference: the old `Stomp.over(socket)` can't auto-reconnect when given a
socket *instance*. It needs a *factory*.

---

## 6.5 SockJS fallback

**What:** SockJS is a protocol + client library that emulates WebSocket using HTTP streaming/polling when
real WebSocket is blocked (old proxies, restrictive corporate networks).

**Transport order (tries in order):**
1. `websocket`
2. Streaming: `xhr-streaming`, `xdr-streaming` (old IE), `eventsource`, `iframe-eventsource`, `htmlfile`, `iframe-htmlfile`
3. Polling: `xhr-polling`, `xdr-polling`, `iframe-xhr-polling`, `jsonp-polling`

**How it works:**
1. `GET /ws/info` → `{ "websocket": true, "cookie_needed": true, "origins": ["*:*"], "entropy": 1234 }`
2. Picks a transport and uses URLs like `/ws/{server-id}/{session-id}/{transport}` (e.g., `/ws/123/abcxyz/websocket`, `/ws/123/abcxyz/xhr_streaming`).
3. SockJS frames: `o` = open, `h` = heart-beat, `a["msg1","msg2"]` = array of messages, `c[3000,"Go away!"]` = close.

**Server:** `registry.addEndpoint("/ws").withSockJS();`
Notable server options: `setHeartbeatTime` (default **25 s**), `setDisconnectDelay` (default **5 s**),
`setStreamBytesLimit` (default 128 KB), `setHttpMessageCacheSize` (default 100), `setSessionCookieNeeded`
(default true, sends JSESSIONID for **sticky sessions**), `setClientLibraryUrl` (for iframe transports).

**Client:**
```ts
import SockJS from 'sockjs-client';
const client = new Client({
  webSocketFactory: () => new SockJS('https://api.example.com/ws'),   // http(s)://, NOT ws(s)://
});
```

**Gotchas:**
* With SockJS, the native WebSocket URL is `/ws/websocket` (Spring also accepts raw WebSocket there); plain `/ws` expects the SockJS protocol. Using `new WebSocket('wss://host/ws')` against a `.withSockJS()` endpoint fails (wrong path). Either use SockJS on the client, or register **two endpoints**: one with and one without SockJS.
* HTTP fallbacks need **sticky sessions** in clusters (all requests of a SockJS session must hit the same server).
* SockJS can't use custom headers either. And for HTTP transports, cookies are sent normally.
* In 2025+ most teams **skip SockJS** (WebSocket works nearly everywhere over `wss://` on 443). Keep it only if you have real users behind blocking proxies (check your metrics: Spring stats show `HttpStream`/`HttpPoll` session counts).

---

## 6.6 React (web)

### 6.6.1 A robust hook with a singleton client

```tsx
// stomp.ts: ONE client for the whole app
import { Client, IMessage } from '@stomp/stompjs';

type Listener = (msg: IMessage) => void;
const listeners = new Map<string, Set<Listener>>();   // destination → callbacks
const subs = new Map<string, { unsubscribe(): void }>();

export const stomp = new Client({
  brokerURL: `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`,
  reconnectDelay: 3000,
  heartbeatIncoming: 10000,
  heartbeatOutgoing: 10000,
  beforeConnect: async () => {
    stomp.connectHeaders = { Authorization: `Bearer ${await getToken()}` };
  },
  onConnect: () => {
    subs.clear();
    for (const dest of listeners.keys()) subscribeDest(dest);   // re-subscribe after reconnect
  },
});

function subscribeDest(dest: string) {
  subs.set(dest, stomp.subscribe(dest, (m) => listeners.get(dest)?.forEach((l) => l(m))));
}

export function addListener(dest: string, l: Listener): () => void {
  if (!listeners.has(dest)) {
    listeners.set(dest, new Set());
    if (stomp.connected) subscribeDest(dest);
  }
  listeners.get(dest)!.add(l);
  return () => {                                   // cleanup
    const set = listeners.get(dest)!;
    set.delete(l);
    if (set.size === 0) {
      listeners.delete(dest);
      if (stomp.connected) subs.get(dest)?.unsubscribe();
      subs.delete(dest);
    }
  };
}
```

```tsx
// useStompTopic.ts
import { useEffect, useRef } from 'react';
import { addListener } from './stomp';

export function useStompTopic<T>(destination: string | null, onMessage: (data: T) => void) {
  const cb = useRef(onMessage);
  cb.current = onMessage;                               // always call latest callback, no re-subscribe
  useEffect(() => {
    if (!destination) return;
    return addListener(destination, (m) => cb.current(JSON.parse(m.body)));
  }, [destination]);
}

// Usage
function ChatRoom({ roomId }: { roomId: string }) {
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  useStompTopic<ChatMsg>(`/topic/rooms.${roomId}`, (msg) => setMessages((prev) => [...prev, msg]));
  ...
}
```

**Why this design:**
* **One connection per app**, not per component (a common bug: each component creates its own `Client` → dozens of sockets).
* **Reference counting** per destination → no duplicate SUBSCRIBEs, no duplicate messages.
* **Cleanup** on unmount → no leaks, no "setState on unmounted component".
* **`useRef` for callback** → avoids re-subscribing on every render.
* **React 18 StrictMode** mounts/unmounts effects twice in dev. The ref-counted design tolerates it. A naive `useEffect(() => { client.activate(); return () => client.deactivate(); }, [])` will connect/disconnect/connect in dev, so don't panic when you see it.
* Use `setMessages(prev => ...)` (functional update) to avoid **stale closure** bugs.

Activate on login, deactivate on logout:
```ts
onLogin(() => stomp.activate());
onLogout(() => stomp.deactivate());
```

---

## 6.7 React Native (this project's platform!)

React Native's `WebSocket` is a native implementation (OkHttp on Android, SocketRocket/`NSURLSession`-based on iOS), not a browser one. Known STOMP issues:

### 6.7.1 The NULL byte problem
React Native has historically **truncated text WebSocket messages at the NULL (`\0`) character**, because
strings cross the native bridge as C strings in some code paths. Since every STOMP frame ends with NULL, frames
get corrupted: incoming frames lose their terminator, and outgoing frames may be cut.

**Fix (documented by stompjs):**
```ts
const client = new Client({
  brokerURL: 'wss://api.example.com/ws',
  forceBinaryWSFrames: true,          // send STOMP frames as binary WebSocket messages
  appendMissingNULLonIncoming: true,  // re-add the NULL terminator that RN chopped off incoming frames
  // ...
});
```

### 6.7.2 `TextEncoder`/`TextDecoder`
stompjs needs `TextEncoder`/`TextDecoder`. Older RN/JS engines lacked them. Recent React Native versions
using **Hermes** provide `TextEncoder`. If you get `ReferenceError: Can't find variable: TextEncoder`, add a polyfill
at the top of `index.js`:
```js
import 'text-encoding';            // or 'fast-text-encoding'
```

### 6.7.3 Android cleartext and emulator hosts
* `ws://` (cleartext) is **blocked by default** on Android 9+ (and iOS ATS blocks non-TLS). Use `wss://`, or allow cleartext for dev hosts only (`network_security_config.xml` / `NSAppTransportSecurity` exceptions).
* From the Android emulator, your laptop's `localhost` is **`10.0.2.2`**. From a physical device, use your machine's LAN IP. `ws://localhost:8080/ws` from the emulator connects to the emulator itself.

### 6.7.4 App lifecycle
```ts
import { AppState, AppStateStatus } from 'react-native';
import NetInfo from '@react-native-community/netinfo';

AppState.addEventListener('change', (state: AppStateStatus) => {
  if (state === 'active') { if (!client.active) client.activate(); }
  else if (state === 'background') { /* optionally deactivate after a grace period to save battery */ }
});

NetInfo.addEventListener((s) => {
  if (s.isConnected && !client.connected && client.active) {
    // stompjs will retry after reconnectDelay; you can force a faster retry by deactivate()+activate()
  }
});
```
* iOS suspends apps in background within seconds. The socket dies. Use **push notifications (APNs/FCM)** for background alerts and **resync over REST** on foreground.
* Heart-beats + `connectionTimeout` are essential on mobile (network switches Wi-Fi ↔ cellular).

### 6.7.5 Complete RN example for the to-do app

```ts
// src/realtime/todoSocket.ts
import { Client } from '@stomp/stompjs';
import { getAccessToken } from '../auth';

export function createTodoSocket(onEvent: (e: TodoEvent) => void, listIds: () => string[]) {
  const client = new Client({
    brokerURL: 'wss://api.example.com/ws',
    forceBinaryWSFrames: true,
    appendMissingNULLonIncoming: true,
    heartbeatIncoming: 10000,
    heartbeatOutgoing: 10000,
    reconnectDelay: 3000,
    connectionTimeout: 8000,
    beforeConnect: async () => {
      client.connectHeaders = { Authorization: `Bearer ${await getAccessToken()}` };
    },
    onConnect: () => {
      for (const id of listIds()) {
        client.subscribe(`/topic/lists.${id}`, (m) => onEvent(JSON.parse(m.body)));
      }
      client.subscribe('/user/queue/errors', (m) => console.warn('server error', m.body));
      // After (re)connect: re-fetch lists over REST to fill any gap while offline
    },
    onStompError: (f) => console.warn('STOMP error', f.headers.message),
  });
  return client;
}
```

---

## 6.8 Angular with rx-stomp

```ts
// rx-stomp.service.ts
import { Injectable } from '@angular/core';
import { RxStomp } from '@stomp/rx-stomp';

@Injectable({ providedIn: 'root' })
export class RxStompService extends RxStomp {}

// app.config.ts (standalone) or a factory
export function rxStompServiceFactory(auth: AuthService) {
  const rx = new RxStompService();
  rx.configure({
    brokerURL: 'wss://api.example.com/ws',
    heartbeatIncoming: 10000,
    heartbeatOutgoing: 10000,
    reconnectDelay: 3000,
    beforeConnect: async (client) => { client.connectHeaders = { Authorization: `Bearer ${await auth.token()}` }; },
  });
  rx.activate();
  return rx;
}

// component
this.sub = this.rxStomp.watch('/topic/chat.public')
  .pipe(map((m) => JSON.parse(m.body) as ChatMsg))
  .subscribe((msg) => this.messages.push(msg));
// ngOnDestroy: this.sub.unsubscribe()   → sends UNSUBSCRIBE automatically

this.rxStomp.publish({ destination: '/app/chat.send', body: JSON.stringify({ text }) });
this.rxStomp.connectionState$.subscribe((state) => this.status = RxStompState[state]);
```

`watch()` re-subscribes automatically after reconnects. `publish()` while disconnected queues by default in rx-stomp (check the version's docs for behaviour) whereas stompjs throws.

---

## 6.9 Vue / Svelte / vanilla
Same principles: one client in a module/store (Pinia store, Svelte store), ref-counted subscriptions,
unsubscribe in `onUnmounted`/`onDestroy`.

---

## 6.10 Java client (`WebSocketStompClient`)

Used for **service-to-service**, **integration tests**, **load tests**, and **desktop/Android (JVM) clients**.

```java
WebSocketClient transport = new StandardWebSocketClient();       // JSR-356 client (e.g., Tomcat's)
WebSocketStompClient stompClient = new WebSocketStompClient(transport);
stompClient.setMessageConverter(new MappingJackson2MessageConverter());   // JSON (Jackson 2); see note for Spring 7
ThreadPoolTaskScheduler scheduler = new ThreadPoolTaskScheduler();
scheduler.initialize();
stompClient.setTaskScheduler(scheduler);                          // needed for heart-beats (& receipts timeouts)
stompClient.setDefaultHeartbeat(new long[]{10_000, 10_000});

StompHeaders connectHeaders = new StompHeaders();
connectHeaders.add("Authorization", "Bearer " + token);

StompSession session = stompClient
        .connectAsync("wss://api.example.com/ws", new WebSocketHttpHeaders(), connectHeaders, new MySessionHandler())
        .get(10, TimeUnit.SECONDS);                              // connectAsync since Spring 6.0 (connect() deprecated)

session.subscribe("/topic/chat.public", new StompFrameHandler() {
    @Override public Type getPayloadType(StompHeaders headers) { return ChatMessage.class; }
    @Override public void handleFrame(StompHeaders headers, Object payload) {
        ChatMessage msg = (ChatMessage) payload;
        System.out.println(msg);
    }
});

session.send("/app/chat.send", new ChatMessage("hello from Java"));

// Receipts
session.setAutoReceipt(true);
StompSession.Receiptable r = session.send("/app/chat.send", new ChatMessage("with receipt"));
r.addReceiptTask(() -> System.out.println("received by server"));
r.addReceiptLostTask(() -> System.out.println("no receipt in time"));

session.disconnect();
```

```java
class MySessionHandler extends StompSessionHandlerAdapter {
    @Override public void afterConnected(StompSession session, StompHeaders connectedHeaders) { /* subscribe here */ }
    @Override public void handleException(StompSession s, StompCommand cmd, StompHeaders h, byte[] payload, Throwable ex) { ex.printStackTrace(); }
    @Override public void handleTransportError(StompSession s, Throwable ex) { /* reconnect with backoff */ }
}
```

Notes:
* `WebSocketStompClient` **does not auto-reconnect**. Implement it in `handleTransportError` with backoff.
* SockJS from Java: `new SockJsClient(List.of(new WebSocketTransport(new StandardWebSocketClient()), new RestTemplateXhrTransport()))`.
* For high connection counts in load tests, tune the JSR-356 client's buffers and use a dedicated thread pool.
* Spring Framework 7 / Boot 4 move to Jackson 3. Use the Jackson 3 based converter if your project is on Jackson 3.

---

## 6.11 Other platforms

| Platform | Library | Notes |
|----------|---------|-------|
| Python | `stomp.py` | Mature STOMP client for **TCP** brokers (RabbitMQ/ActiveMQ on 61613). For STOMP-over-WebSocket servers like Spring, check `stomp.py`'s WebSocket support in your version or write frames over the `websockets` library (frame format is trivial, see Chapter 4) |
| Go | `go-stomp/stomp` | TCP; combine with a WebSocket `net.Conn` adapter for WS |
| .NET | `Apache.NMS.STOMP`, community STOMP-over-WS libs | Many .NET shops use SignalR instead |
| Kotlin / Android | **Krossbow** | Coroutine-based, multiplatform STOMP client over WebSocket (OkHttp/Ktor) |
| Swift / iOS | `SwiftStomp`, `StompClientLib` | Check maintenance status; or URLSessionWebSocketTask + small frame codec |
| Ruby | `stomp` gem | TCP |
| CLI | `websocat`, `wscat`, Postman | Manual testing (remember the `\0` terminator!) |

---

## 6.12 Manual testing with raw tools

```bash
# wscat (Node)
npx wscat -c ws://localhost:8080/ws -s v12.stomp
> CONNECT
accept-version:1.2
host:localhost

^@
```
In terminals you often can't type NULL easily. Use tools that allow escape sequences (Postman: `\u0000`; websocat with `--binary` and printf).

```bash
printf 'CONNECT\naccept-version:1.2\nhost:localhost\n\n\0' | websocat -n --binary -1 ws://localhost:8080/ws
```

---

## 6.13 Client-side best practices checklist

- [ ] Exactly **one** STOMP connection per app (per tab) unless you have a strong reason.
- [ ] Subscriptions created in `onConnect` (or via rx-stomp `watch`) so they survive reconnects.
- [ ] **Unsubscribe** when screens/components are destroyed.
- [ ] Heart-beats on (10–25 s), lower than every proxy's idle timeout.
- [ ] Reconnect with backoff (+ jitter if your library supports it, or manage `reconnectDelay` dynamically).
- [ ] Refresh token in `beforeConnect`; handle auth ERROR by re-login, not infinite retries.
- [ ] Never `publish` without checking `connected` (or use an outbox).
- [ ] Send `content-type: application/json` for JSON.
- [ ] Idempotency key (`clientRequestId`) on commands that might be retried.
- [ ] After reconnect, **resync** missed data via REST (`since=lastEventId`).
- [ ] Show connection state in UI ("Reconnecting…") and disable actions that need the socket.
- [ ] React Native: `forceBinaryWSFrames` + `appendMissingNULLonIncoming`, `wss://`, emulator host `10.0.2.2`.
- [ ] Turn off verbose `debug` logging in production (it can log tokens in CONNECT frames!).

Next: [Chapter 7: Brokers, Clustering & Scaling](07-brokers-and-scaling.md)
