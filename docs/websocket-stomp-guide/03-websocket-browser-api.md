# Chapter 3: The Browser & JavaScript WebSocket API

> **Goal:** master the raw `WebSocket` object. Even if you always use STOMP libraries, they sit on top
> of this API, and most "mysterious" bugs come from its rules.

---

## 3.1 ELI5

The browser gives you a toy telephone called `WebSocket`. You:
1. **Dial** (`new WebSocket(url)`).
2. Wait until it says **"connected"** (`onopen`).
3. **Talk** (`send(...)`) and **listen** (`onmessage`).
4. Notice if the line **breaks** (`onerror`, `onclose`).
5. **Hang up** (`close()`).

The toy telephone can't redial by itself, can't add stickers (custom headers) on the envelope, and can't
press the "are you there?" button (ping). You must build those yourself, or use a library.

---

## 3.2 The API surface (complete)

```ts
const ws = new WebSocket(url: string | URL, protocols?: string | string[]);
```

| Member | Type | Description |
|--------|------|-------------|
| `url` | string | Resolved absolute URL |
| `protocol` | string | Sub-protocol the server selected (`""` if none) |
| `extensions` | string | Extensions the server selected (e.g., `"permessage-deflate"`) |
| `readyState` | number | `0` CONNECTING, `1` OPEN, `2` CLOSING, `3` CLOSED (also as constants `WebSocket.OPEN`, etc.) |
| `bufferedAmount` | number | Bytes queued by `send()` but **not yet transmitted** to the network |
| `binaryType` | `"blob"` \| `"arraybuffer"` | How binary messages are delivered to `onmessage`. Default `"blob"` |
| `send(data)` | method | `string`, `ArrayBuffer`, `ArrayBufferView` (typed array/DataView), or `Blob` |
| `close(code?, reason?)` | method | Starts the closing handshake. `code` = 1000 or 3000–4999; `reason` ≤ 123 UTF-8 bytes |
| `onopen` / `addEventListener('open')` | event | Handshake succeeded |
| `onmessage` | event (`MessageEvent`) | `event.data` is a `string` (text) or `Blob`/`ArrayBuffer` (binary) |
| `onerror` | event | Something failed. **Contains no useful details by design** (security) |
| `onclose` | event (`CloseEvent`) | `code`, `reason`, `wasClean` |

Behaviour rules that matter:

* Calling `send()` while **CONNECTING** throws `InvalidStateError`. Wait for `open`.
* Calling `send()` after the socket is **CLOSING/CLOSED** does **not** throw. The data is silently discarded (and `bufferedAmount` increases). Your app must check `readyState`.
* `onerror` is always followed by `onclose`. Put reconnect logic in `onclose`, not `onerror`.
* Invalid URL schemes (anything other than `ws`, `wss`, and in modern browsers `http`/`https`, which are converted) throw `SyntaxError` at construction.
* Duplicated or invalid protocol names → `SyntaxError`.
* `onerror` intentionally hides the reason (e.g., you can't tell "connection refused" from "403") to prevent network scanning from web pages. Debug with DevTools.

---

## 3.3 A correct minimal client

```js
const ws = new WebSocket('wss://api.example.com/ws', ['v12.stomp']);
ws.binaryType = 'arraybuffer';

ws.addEventListener('open', () => {
  console.log('open, protocol =', ws.protocol);
  ws.send('hello');
});

ws.addEventListener('message', (e) => {
  if (typeof e.data === 'string') console.log('text', e.data);
  else console.log('binary bytes', new Uint8Array(e.data).length);
});

ws.addEventListener('error', () => console.warn('ws error (details in DevTools)'));

ws.addEventListener('close', (e) => {
  console.log(`closed code=${e.code} reason="${e.reason}" clean=${e.wasClean}`);
});
```

---

## 3.4 The five big limitations (and their work-arounds)

### 3.4.1 No custom headers
`new WebSocket()` can't set `Authorization` or any custom header. Options:

| Approach | How | Pros | Cons |
|----------|-----|------|------|
| **Cookies** | Same-site session/JWT cookie sent automatically on handshake | Transparent, HttpOnly protects from XSS theft | Needs **Origin check** + CSRF thinking (CSWSH); cross-domain cookie rules (`SameSite`) |
| **Query parameter** | `wss://host/ws?access_token=...` | Simple, works everywhere | Token appears in **server/proxy access logs**, browser history; use short-lived, single-use "ticket" tokens |
| **Ticket pattern** | Get a short-lived one-time ticket via authenticated REST, then put the ticket in the URL | Safer variant of query param | Extra round trip, ticket store |
| **First message auth** | Connect, then send credentials as the first message (e.g., **STOMP `CONNECT` headers**) | Clean; the token isn't in URL logs | Handshake itself is unauthenticated; server must enforce timeouts for unauthenticated sockets |
| **`Sec-WebSocket-Protocol` hack** | Put token as a "protocol" | Works in browsers | Abuse of the header; logged; must echo |

STOMP users nearly always use **STOMP CONNECT headers** (Chapter 8).

### 3.4.2 No ping API
Browsers respond to server pings automatically, but JS can't send pings or observe pongs. So:
* The **server** should send pings or app-level heart-beats to detect dead clients.
* The **client** needs app-level heart-beats (STOMP heart-beats do exactly this) to detect a dead server/network. Otherwise a half-open connection may look "OPEN" for minutes.

### 3.4.3 No automatic reconnect
Unlike `EventSource`, `WebSocket` never reconnects. You implement it (or the library does, as `@stomp/stompjs` does via `reconnectDelay`).

### 3.4.4 No backpressure (in the classic API)
`send()` never blocks. If you send faster than the network can take, data piles up in browser memory.
Check `bufferedAmount`:

```js
function safeSend(ws, data, maxBuffered = 1_000_000) {
  if (ws.readyState !== WebSocket.OPEN) return false;
  if (ws.bufferedAmount > maxBuffered) return false; // caller should retry later / drop / coalesce
  ws.send(data);
  return true;
}
```

On the **receive** side there is no way to say "slow down" either. Messages are delivered as fast as they arrive. The experimental **`WebSocketStream`** API (Chromium-based browsers) adds promise/stream-based backpressure. Don't rely on it for cross-browser production code yet.

### 3.4.5 Same-Origin Policy does NOT protect you
**CORS does not apply to WebSocket.** Any web page on any origin can open a WebSocket to your server,
and the browser will attach your cookies (subject to `SameSite` rules). The only protection is the server
**checking the `Origin` header** (and not relying on cookies alone). This is **Cross-Site WebSocket
Hijacking (CSWSH)** (Chapter 8).

---

## 3.5 Reconnect done right

Bad reconnect logic can **take down your own servers** (all clients reconnecting at the same instant after a
deploy, the "thundering herd"). Use **exponential backoff with jitter** and a cap.

```ts
class ReconnectingSocket {
  private ws?: WebSocket;
  private attempt = 0;
  private closedByUser = false;

  constructor(private url: string, private onMessage: (d: any) => void) {}

  connect() {
    this.closedByUser = false;
    this.ws = new WebSocket(this.url);
    this.ws.onopen = () => { this.attempt = 0; };
    this.ws.onmessage = (e) => this.onMessage(e.data);
    this.ws.onclose = (e) => {
      if (this.closedByUser) return;
      if (e.code === 4001 /* our "auth failed" code */) return this.refreshTokenThenConnect();
      const base = Math.min(30_000, 500 * 2 ** this.attempt++);   // 0.5s,1s,2s,4s... max 30s
      const delay = Math.random() * base;                          // "full jitter"
      setTimeout(() => this.connect(), delay);
    };
  }

  close() { this.closedByUser = true; this.ws?.close(1000, 'bye'); }
  private async refreshTokenThenConnect() { /* get new token, then connect() */ }
}
```

Checklist for reconnect:
1. **Backoff + jitter + max delay.**
2. **Don't reconnect** on intentional close or permanent errors (bad credentials).
3. **Re-subscribe** to everything after reconnect (subscriptions die with the connection; STOMP libraries re-run your `onConnect`).
4. **Resync state**: messages sent while you were disconnected are **lost** unless your design stores them (fetch missed data via REST using "last seen id/timestamp").
5. **Online/offline events**: listen to `window.addEventListener('online', ...)` to reconnect immediately when the network returns.
6. **Page visibility**: optionally disconnect hidden tabs after some time and reconnect on `visibilitychange` to save server resources.
7. **Token refresh**: if the access token expired, refresh before reconnecting.

---

## 3.6 Many tabs, one connection

Each browser tab opens its own WebSocket by default. 10 tabs = 10 connections per user.
Options:
* Accept it (simplest, usually fine).
* **SharedWorker** holds one WebSocket, and tabs talk to it via `MessagePort`. (SharedWorker is well supported on desktop browsers, and mobile support has historically lagged, so check your target browsers before relying on it.)
* **Leader election** with `BroadcastChannel` / Web Locks API: one tab owns the socket and rebroadcasts to others.

---

## 3.7 Back/forward cache, sleep and mobile

* Pages with an open WebSocket historically could not enter the **bfcache**. Modern browsers may evict or close the connection when the page goes into the cache. Handle `pagehide`/`pageshow` and reconnect on `pageshow` with `event.persisted === true`.
* Laptops sleeping, phones switching Wi-Fi ↔ 4G, and mobile OSs suspending background apps all **silently kill** TCP connections. Heart-beats + reconnect are not optional.
* On iOS/Android **native apps**, when the app goes to background the OS will soon suspend it. Use **push notifications** for background delivery and reconnect WebSocket on foreground.

---

## 3.8 Mixed content and secure contexts

* A page served over `https://` **cannot** open `ws://` (mixed content is blocked). Use `wss://`.
* Relative URLs: modern browsers accept `new WebSocket('/ws')` style relative URLs resolved against the page (and `http(s)` → `ws(s)` conversion). Older browsers required absolute `ws(s)://` URLs. Build the URL explicitly for compatibility:

```js
const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
const url = `${proto}//${location.host}/ws`;
```

---

## 3.9 Server-side JavaScript (Node.js) quick reference

The most used Node library is **`ws`**:

```js
import { WebSocketServer } from 'ws';
const wss = new WebSocketServer({ port: 8080, maxPayload: 64 * 1024 });

wss.on('connection', (ws, req) => {
  // Check origin & auth here (req.headers.origin, req.headers.cookie, req.url)
  ws.isAlive = true;
  ws.on('pong', () => (ws.isAlive = true));
  ws.on('message', (data, isBinary) => ws.send(data, { binary: isBinary }));
});

// Detect dead connections with protocol-level pings
setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.isAlive) { ws.terminate(); continue; }
    ws.isAlive = false;
    ws.ping();
  }
}, 30_000);
```

Node 22+ also ships a **built-in `WebSocket` client** (global, browser-compatible API).

---

## 3.10 Chapter summary

* API: `new WebSocket(url, protocols)`, `readyState`, `send`, `close`, `bufferedAmount`, `binaryType`, events `open`/`message`/`error`/`close`.
* Can't set headers, can't ping, doesn't reconnect, no backpressure, not protected by CORS.
* Reconnect with exponential backoff + jitter; re-subscribe and resync after reconnect.
* Always `wss://` from HTTPS pages; handle sleep/background/network change.

Next: [Chapter 4: The STOMP Protocol](04-stomp-protocol.md)
