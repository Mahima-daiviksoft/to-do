# Chapter 4: The STOMP Protocol (1.0 / 1.1 / 1.2), Deep Dive

> **Goal:** know STOMP so well you could write frames by hand, implement a tiny client, and answer any
> "what does header X do?" question. Everything here follows the official **STOMP 1.2 specification**
> (stomp.github.io), with notes on 1.0/1.1 differences.

---

## 4.1 ELI5

STOMP is a **very small language** for talking to a post office (broker):

* **"Hello, I'm Anna, here's my password."** → `CONNECT`
* **"Hi Anna, you're in."** → `CONNECTED`
* **"Please tell me about everything that goes to the 'kitchen' mailbox."** → `SUBSCRIBE`
* **"Put this letter in the 'kitchen' mailbox."** → `SEND`
* **"Here's a letter from the 'kitchen' mailbox."** → `MESSAGE`
* **"Got it, thanks!"** → `ACK` (or "I can't handle this one" → `NACK`)
* **"Tell me when you've got my letter."** → the `receipt` header → `RECEIPT`
* **"Something went wrong!"** → `ERROR`
* **"Bye!"** → `DISCONNECT`

Every sentence (frame) looks the same: **a command word, some "name:value" stickers (headers), an empty
line, the letter contents (body), and a special invisible full stop (the NULL byte).**

---

## 4.2 What STOMP is (and isn't)

* **STOMP** = **Simple** (or **Streaming**) **Text Oriented Messaging Protocol**. Earlier it was called TTMP.
* A frame-based, text-based, **interoperable** messaging protocol modelled on HTTP's look.
* Designed to be so simple that you can write a client in an afternoon, in any language, even with `telnet`.
* Transport-agnostic: runs over **raw TCP** (brokers typically listen on port **61613**) or over **WebSocket** (sub-protocol `v12.stomp`), or anything else that is a reliable, ordered, bi-directional stream.
* It does **not** define destination semantics (queue vs topic). Those are broker-specific.
* It does **not** define message bodies (JSON/XML/binary are all fine; you declare `content-type`).

| Version | Released | Big additions |
|---------|----------|---------------|
| 1.0 | 2006-ish | Basic frames: CONNECT, SEND, SUBSCRIBE, UNSUBSCRIBE, ACK, BEGIN, COMMIT, ABORT, DISCONNECT, MESSAGE, RECEIPT, ERROR |
| **1.1** | 2011 | **Heart-beating**, **NACK**, **version negotiation** (`accept-version`), **virtual hosting** (`host`), **header escaping**, UTF-8 headers, **`id` on SUBSCRIBE required**, `client-individual` ack mode, `STOMP` command as alias for CONNECT |
| **1.2** | Oct 2012 | **CRLF line endings allowed**, **simplified ACK/NACK** (single `id` header matching MESSAGE's `ack` header), `\r` escape, clarified repeated headers (first wins), connection lingering, clarified scope/uniqueness of subscription & transaction ids |

Spring, stompjs, RabbitMQ and ActiveMQ all support 1.2 (and negotiate down to 1.1/1.0 if needed).

---

## 4.3 Frame anatomy

```
COMMAND␊
header1:value1␊
header2:value2␊
␊
Body^@
```

* `␊` = end-of-line: **LF** (`\n`, 0x0A), optionally preceded by **CR** (`\r\n`) in STOMP 1.2.
* The **blank line** separates headers from body (even if there are no headers and no body).
* `^@` = the **NULL octet** (`\0`, 0x00) ends the frame.
* After the NULL, zero or more EOLs **may** follow (that's where heart-beats live).

### 4.3.1 The formal grammar (STOMP 1.2, augmented BNF)

```
NULL                = <US-ASCII null (octet 0)>
LF                  = <US-ASCII line feed (aka newline) (octet 10)>
CR                  = <US-ASCII carriage return (octet 13)>
EOL                 = [CR] LF
OCTET               = <any 8-bit sequence of data>

frame-stream        = 1*frame

frame               = command EOL
                      *( header EOL )
                      EOL
                      *OCTET
                      NULL
                      *( EOL )

command             = client-command | server-command

client-command      = "SEND"
                      | "SUBSCRIBE"
                      | "UNSUBSCRIBE"
                      | "BEGIN"
                      | "COMMIT"
                      | "ABORT"
                      | "ACK"
                      | "NACK"
                      | "DISCONNECT"
                      | "CONNECT"
                      | "STOMP"

server-command      = "CONNECTED"
                      | "MESSAGE"
                      | "RECEIPT"
                      | "ERROR"

header              = header-name ":" header-value
header-name         = 1*<any OCTET except CR or LF or ":">
header-value        = *<any OCTET except CR or LF or ":">
```

### 4.3.2 Encoding rules
* Commands and headers are **UTF-8**.
* Header names and values are **case-sensitive** and **not trimmed** (spaces are part of the value: `destination: /topic/a` has destination `" /topic/a"`, a classic bug).
* Only **SEND, MESSAGE and ERROR** frames may have a body. All other frames **must not** have a body.

### 4.3.3 Header value escaping (STOMP 1.1+)
Because `:` and newlines delimit headers, they must be escaped inside names/values:

| Escape | Means |
|--------|-------|
| `\r` | carriage return (0x0D), new in 1.2 |
| `\n` | line feed (0x0A) |
| `\c` | colon `:` |
| `\\` | backslash `\` |

* Any other escape (e.g., `\t`) is a **fatal protocol error**.
* **Exception:** `CONNECT` and `CONNECTED` frames do **not** use escaping (backward compatibility with 1.0). So a password containing `:` in `passcode` is sent raw.
* Example: header `foo` with value `a:b` → `foo:a\cb`.

### 4.3.4 Repeated headers
If a header name appears more than once, **only the first value is used**. (Brokers may add history entries below it.)

### 4.3.5 Body length: `content-length`
* `content-length` = number of **octets** (bytes, not characters!) in the body.
* If present, the receiver reads exactly that many bytes, **even if they contain NULL bytes**, then expects the terminating NULL.
* If absent, the body ends at the first NULL byte. So **a body without `content-length` cannot contain NULL**.
* Frames SHOULD include `content-length` when they have a body.

> **Pitfall: characters vs bytes.** `"héllo"` is 5 characters but **6 bytes** in UTF-8. Computing
> `content-length` with `string.length` in JS produces corrupted frames for non-ASCII text (emoji!).
> Libraries handle this via `TextEncoder`. That is one reason stompjs needs a `TextEncoder` polyfill on old React Native.

### 4.3.6 `content-type`
* MIME type of the body, e.g. `application/json` or `text/plain;charset=utf-8`.
* If absent, the receiver should treat the body as a **binary blob**.
* For `text/*` types with no charset, the default charset is **UTF-8**.
* Spring uses `content-type` to pick a `MessageConverter` (e.g., JSON → Jackson).

### 4.3.7 Size limits
Servers may limit: number of headers, header line length, body size. Exceeding → `ERROR` + connection close.
(Spring: `setMessageSizeLimit`, default 64 KB.)

---

## 4.4 Connecting

### 4.4.1 CONNECT (or STOMP)

```
CONNECT
accept-version:1.2,1.1,1.0
host:chat.example.com
login:anna
passcode:secret
heart-beat:10000,10000

^@
```

| Header | 1.2 status | Meaning |
|--------|-----------|---------|
| `accept-version` | **REQUIRED** | Comma-separated versions the client supports. If missing, server assumes 1.0 |
| `host` | **REQUIRED** | Virtual host name (like HTTP Host). RabbitMQ maps it to a vhost |
| `login` | optional | User identifier |
| `passcode` | optional | Password |
| `heart-beat` | optional | `cx,cy` (see §4.5). Default `0,0` |

Clients may add **any custom headers** (e.g., `Authorization: Bearer ...`). This is how token auth over
STOMP is usually done (Spring reads them as "native headers").

**`STOMP` command:** identical to `CONNECT`. Introduced so that servers can distinguish STOMP from HTTP
traffic on the same port (an HTTP request never starts with `STOMP`). Clients using `STOMP` instead of
`CONNECT` can only connect to 1.1+/1.2 servers, so most clients still send `CONNECT`.

### 4.4.2 CONNECTED

```
CONNECTED
version:1.2
heart-beat:10000,10000
session:sess-4f2a
server:RabbitMQ/3.13.7

^@
```

| Header | Status | Meaning |
|--------|--------|---------|
| `version` | **REQUIRED** (1.1+) | The negotiated version (highest common) |
| `heart-beat` | optional | Server's `sx,sy` |
| `session` | optional | Session identifier |
| `server` | optional | `name/version` of server |

### 4.4.3 Version negotiation
* Server picks the **highest version** present in both `accept-version` and its own supported list.
* If there's no common version, server replies with `ERROR` containing a `version` header listing its supported versions, plus an explanation in the body, then **closes** the connection:

```
ERROR
version:1.2,2.1
content-type:text/plain

Supported protocol versions are 1.2 2.1^@
```

### 4.4.4 Over WebSocket
* The WebSocket sub-protocol header (`v12.stomp`) and STOMP's `accept-version` are **separate** negotiations. Libraries usually set both consistently.
* The STOMP `CONNECT` frame is the **first WebSocket message** after `open`.

---

## 4.5 Heart-beating (connection liveness)

> **ELI5:** Two friends on a walkie-talkie agree: "If I don't hear anything from you for 10 seconds,
> I'll assume your battery died." So when there's nothing to say, each one just clicks the button
> ("beep") every few seconds.

### 4.5.1 Negotiation
* Client sends `heart-beat:cx,cy`
  * `cx` = the smallest interval (ms) **the client can guarantee between its outgoing heart-beats** (0 = "I can't send heart-beats").
  * `cy` = the interval (ms) **the client would like to receive heart-beats at** (0 = "I don't want any").
* Server replies `heart-beat:sx,sy` with the same meaning from its side.

Resulting intervals:

```
client → server  :  if cx == 0 or sy == 0 → none,  else every max(cx, sy) ms
server → client  :  if sx == 0 or cy == 0 → none,  else every max(sx, cy) ms
```

**Worked example:**
```
Client: heart-beat:4000,20000     (can send every 4s, wants to receive every 20s)
Server: heart-beat:10000,10000    (can send every 10s, wants to receive every 10s)

client → server: max(4000, 10000)  = 10000 ms  (client sends at least every 10s)
server → client: max(10000, 20000) = 20000 ms  (server sends at least every 20s)
```

Another:
```
Client: heart-beat:0,10000   → client won't send heart-beats.
Server: heart-beat:10000,10000
client → server: cx == 0 → none
server → client: max(10000, 10000) = 10000 ms
```

### 4.5.2 What a heart-beat is
* A heart-beat is **a single EOL** (`\n` or `\r\n`) sent between frames.
* **Any data** (a real frame) also counts as proof of life. Heart-beats are only needed when idle.
* The receiver checks: "Have I received *anything* within the interval?" The spec lets implementations add a **tolerance** for network delays. For example, `@stomp/stompjs` declares the server dead after **2×** the negotiated incoming interval with no data (configurable since v7 via `heartbeatToleranceMultiplier`, default `2`), and Spring's simple broker and broker relay use a multiplier of **3×** on the read side (`HEARTBEAT_MULTIPLIER = 3` in their source code). The principle is "a few missed beats = dead". Spring's simple broker implements exactly the negotiation formula above: its read interval is `max(clientHeartbeat[0], serverHeartbeat[1]) × 3` and its write interval is `max(clientHeartbeat[1], serverHeartbeat[0])`.
* When the receiver decides the peer is dead, it **closes the connection** (and the client reconnects).

### 4.5.3 Why STOMP heart-beats matter so much over WebSocket
* Browsers can't send WebSocket pings (Chapter 3), so STOMP heart-beats are your **only** client-side liveness detection.
* They keep **proxies/load balancers** from closing "idle" connections (Chapter 2).
* They detect **half-open TCP** (phone lost signal).

> **Pitfall: Spring simple broker heart-beats are OFF until you give it a TaskScheduler.** With the simple
> broker, the server answers CONNECT with `heart-beat:0,0` (no heart-beats) unless you configure
> `.setTaskScheduler(...)` (and optionally `.setHeartbeatValue(...)`). Chapter 5 shows how.

---

## 4.6 Sending: SEND

```
SEND
destination:/app/chat.send
content-type:application/json
content-length:28
receipt:send-42

{"room":"r1","text":"hello"}^@
```

| Header | Status | Meaning |
|--------|--------|---------|
| `destination` | **REQUIRED** | Where to send. Opaque string, broker-defined |
| `transaction` | optional | Make this send part of a transaction |
| `content-type`, `content-length` | recommended | Body description |
| `receipt` | optional | Ask for a RECEIPT |
| any other | optional | **User-defined headers are passed through** to subscribers' MESSAGE frames by most brokers |

If the server can't process the SEND (bad destination, unauthorised), it sends `ERROR` and closes.

---

## 4.7 Subscribing: SUBSCRIBE / UNSUBSCRIBE

```
SUBSCRIBE
id:sub-0
destination:/topic/room.r1
ack:client-individual

^@
```

| Header | Status | Meaning |
|--------|--------|---------|
| `destination` | **REQUIRED** | What to listen to |
| `id` | **REQUIRED** (1.1+) | Client-chosen id, **unique within the connection**. Lets one connection subscribe to the same destination multiple times, and it's echoed in every MESSAGE's `subscription` header |
| `ack` | optional | `auto` (default), `client`, or `client-individual` |

Brokers often support **extra subscription headers**, e.g., RabbitMQ `prefetch-count`, `x-queue-name`, `durable`, `auto-delete`, `exclusive`; ActiveMQ `selector` (JMS-style SQL filter), `activemq.prefetchSize`.

```
UNSUBSCRIBE
id:sub-0

^@
```

`id` is REQUIRED and must match a previous SUBSCRIBE's id.

---

## 4.8 Receiving: MESSAGE

```
MESSAGE
subscription:sub-0
message-id:007
destination:/topic/room.r1
ack:a1b2
content-type:application/json
content-length:41

{"from":"bob","text":"hi","ts":1700000000}^@
```

| Header | Status | Meaning |
|--------|--------|---------|
| `destination` | **REQUIRED** | Destination the message was sent to |
| `message-id` | **REQUIRED** | Unique id for this message (assigned by server) |
| `subscription` | **REQUIRED** | The `id` of the matching SUBSCRIBE |
| `ack` | present if the subscription needs explicit ack (1.2) | Arbitrary value to put in the ACK/NACK `id` header |
| `content-type`, `content-length` | should | Body description |
| user headers | – | Copied from SEND by most brokers |

A MESSAGE is always a response to a SUBSCRIBE (servers never send MESSAGE frames without one).

---

## 4.9 Acknowledgement modes: auto, client, client-individual

> **ELI5:**
> * **auto** — The postman drops the letter in your box and forgets about it. If you lose it, too bad.
> * **client** — The postman waits for you to sign. Signing for letter #5 means "I got #1–#5" (**cumulative**).
> * **client-individual** — You sign for each letter separately. Signing #5 says nothing about #3.

| Mode | Client sends ACK? | Cumulative? | If connection drops before ACK | Typical use |
|------|-------------------|-------------|-------------------------------|-------------|
| `auto` (default) | No | – | Message considered delivered when sent; may be **lost** | UI updates, best-effort |
| `client` | Yes | **Yes**: ACK of message M acks M and **all previous** messages on that subscription | Unacked messages may be redelivered (possibly to another client) | Ordered streams where you process sequentially |
| `client-individual` | Yes | **No**: acks only that message | Unacked messages may be redelivered | Parallel processing; work queues |

### 4.9.1 ACK and NACK (STOMP 1.2)

```
ACK
id:a1b2
transaction:tx1

^@
```

```
NACK
id:a1b2

^@
```

* 1.2: `id` is **REQUIRED** and equals the MESSAGE's **`ack`** header.
* 1.1: ACK/NACK required `subscription` and `message-id` headers instead (this changed in 1.2. Old code sending `message-id` breaks against 1.2 servers).
* `NACK` (1.1+) = "I did **not** consume this message." The server may redeliver it, send it to a dead-letter queue, or discard it (broker policy). NACK follows the same cumulative rules as ACK for the subscription's mode.
* Both may be part of a **transaction**.

> **Note:** Spring's **simple broker** does **not** implement ACK/NACK (it's effectively always `auto`).
> If you need real acknowledgements and redelivery, use a full broker (RabbitMQ/ActiveMQ) via the relay
> (Chapter 7). RabbitMQ also supports `prefetch-count` to limit unacked messages per subscription.

---

## 4.10 Receipts: RECEIPT

Any **client frame except CONNECT** can carry `receipt:<id>`. The server replies:

```
RECEIPT
receipt-id:send-42

^@
```

* Means: "I've **processed** the frame with that receipt id."
* Because STOMP is stream-based, a receipt is also a **cumulative** acknowledgement that all **previous** frames were **received** (though not necessarily fully processed).
* Use cases: confirm a SEND reached the broker; confirm a SUBSCRIBE is active **before** triggering an action whose result you must not miss; graceful DISCONNECT.
* A receipt says nothing about subscribers having received the message.

> **Pitfall:** Spring's simple broker has limited receipt support (Spring docs: the simple broker "does not
> support acks, receipts, and some other features"). Spring does send a RECEIPT for **DISCONNECT** frames
> that carry a `receipt` header, but don't build business logic on SEND receipts with the simple broker.
> With the broker relay, receipts come from the real broker.

---

## 4.11 Errors: ERROR

```
ERROR
receipt-id:send-42
content-type:text/plain
content-length:56
message:malformed frame received

Destination header missing on SEND frame (receipt send-42)^@
```

* `message` header: a short description. Body: details.
* If the error relates to a frame with a `receipt` header, the ERROR should include `receipt-id`.
* **The server MUST close the connection right after sending ERROR.** (STOMP 1.2 suggests the server **linger** briefly so the client actually receives the ERROR before the socket closes.)
* So in STOMP, **an ERROR is fatal to the connection**. Not ideal for "validation failed" style app errors. In Spring, handle application errors with `@MessageExceptionHandler` and send an error **MESSAGE** to a user queue (e.g., `/user/queue/errors`) instead of letting it become a STOMP ERROR (Chapter 5).

---

## 4.12 Transactions: BEGIN / COMMIT / ABORT

```
BEGIN
transaction:tx1

^@
SEND
destination:/queue/orders
transaction:tx1

{"id":1}^@
ACK
id:a1b2
transaction:tx1

^@
COMMIT
transaction:tx1

^@
```

* `transaction` header **REQUIRED** on BEGIN, COMMIT, ABORT. The id must be unique per connection.
* SENDs and ACK/NACKs carrying the transaction id are held until **COMMIT** (then applied atomically) or discarded on **ABORT**.
* Any un-committed transaction is **implicitly aborted** if the client sends DISCONNECT or the connection fails.
* Support depends on the broker (Spring simple broker: no; RabbitMQ/ActiveMQ: yes).
* Rarely used in browser apps; more common for back-end STOMP clients.

---

## 4.13 Disconnecting gracefully: DISCONNECT

```
DISCONNECT
receipt:77

^@
```
Server:
```
RECEIPT
receipt-id:77

^@
```

1. Client sends DISCONNECT with a receipt.
2. Waits for RECEIPT. That guarantees all previous frames were received.
3. Closes the socket.

The client must not send more frames after DISCONNECT. Just closing the socket without DISCONNECT is legal
but might lose frames in flight.

---

## 4.14 Frames & headers quick reference table

| Frame | Direction | Required headers | Optional headers | Body |
|-------|-----------|------------------|------------------|------|
| CONNECT / STOMP | C→S | `accept-version`, `host` | `login`, `passcode`, `heart-beat` | No |
| CONNECTED | S→C | `version` | `session`, `server`, `heart-beat` | No |
| SEND | C→S | `destination` | `transaction`, + any | **Yes** |
| SUBSCRIBE | C→S | `destination`, `id` | `ack` | No |
| UNSUBSCRIBE | C→S | `id` | | No |
| ACK | C→S | `id` | `transaction` | No |
| NACK | C→S | `id` | `transaction` | No |
| BEGIN | C→S | `transaction` | | No |
| COMMIT | C→S | `transaction` | | No |
| ABORT | C→S | `transaction` | | No |
| DISCONNECT | C→S | | `receipt` | No |
| MESSAGE | S→C | `destination`, `message-id`, `subscription` | `ack`, + any | **Yes** |
| RECEIPT | S→C | `receipt-id` | | No |
| ERROR | S→C | | `message` | **Yes** |

Plus: `content-length`, `content-type` on frames with bodies; `receipt` on any client frame except CONNECT.

---

## 4.15 A complete annotated session

```
>>> = client to server,  <<< = server to client,  ^@ = NULL

>>> CONNECT
>>> accept-version:1.2,1.1,1.0
>>> host:localhost
>>> heart-beat:10000,10000
>>> Authorization:Bearer eyJhbGciOi...
>>>
>>> ^@
<<< CONNECTED
<<< version:1.2
<<< heart-beat:10000,10000
<<< user-name:anna                ← Spring adds this when a user is authenticated
<<<
<<< ^@
>>> SUBSCRIBE
>>> id:sub-0
>>> destination:/topic/room.general
>>>
>>> ^@
>>> SUBSCRIBE
>>> id:sub-1
>>> destination:/user/queue/errors
>>>
>>> ^@
>>> SEND
>>> destination:/app/chat.send
>>> content-type:application/json
>>> content-length:35
>>>
>>> {"room":"general","text":"hello!"}^@
<<< MESSAGE
<<< destination:/topic/room.general
<<< content-type:application/json
<<< subscription:sub-0
<<< message-id:5ry2dxkc-0
<<< content-length:58
<<<
<<< {"from":"anna","room":"general","text":"hello!","ts":...}^@
<<< (newline)                        ← server heart-beat when idle
>>> (newline)                        ← client heart-beat when idle
>>> DISCONNECT
>>> receipt:close-1
>>>
>>> ^@
<<< RECEIPT
<<< receipt-id:close-1
<<<
<<< ^@
```

---

## 4.16 Write a tiny STOMP client by hand (to truly understand it)

```js
// Educational STOMP 1.2 client over a browser WebSocket. No reconnect, no acks.
class TinyStomp {
  constructor(url) {
    this.ws = new WebSocket(url, ['v12.stomp']);
    this.handlers = new Map();
    this.nextId = 0;
    this.buffer = '';
    this.ws.onmessage = (e) => this.onData(e.data);
  }

  frame(command, headers = {}, body = '') {
    const lines = [command];
    for (const [k, v] of Object.entries(headers)) lines.push(`${k}:${v}`);
    // content-length in BYTES, not characters
    if (body) lines.push(`content-length:${new TextEncoder().encode(body).length}`);
    return lines.join('\n') + '\n\n' + body + '\0';
  }

  connect(headers, onConnected) {
    this.ws.onopen = () =>
      this.ws.send(this.frame('CONNECT', { 'accept-version': '1.2', host: location.hostname, 'heart-beat': '0,0', ...headers }));
    this.onConnected = onConnected;
  }

  subscribe(destination, cb) {
    const id = `sub-${this.nextId++}`;
    this.handlers.set(id, cb);
    this.ws.send(this.frame('SUBSCRIBE', { id, destination }));
    return () => { this.ws.send(this.frame('UNSUBSCRIBE', { id })); this.handlers.delete(id); };
  }

  send(destination, obj) {
    this.ws.send(this.frame('SEND', { destination, 'content-type': 'application/json' }, JSON.stringify(obj)));
  }

  onData(data) {
    this.buffer += data;
    let idx;
    while ((idx = this.buffer.indexOf('\0')) >= 0) {           // naive: assumes no NULL inside bodies
      const raw = this.buffer.slice(0, idx).replace(/^(\r?\n)+/, ''); // strip heart-beats
      this.buffer = this.buffer.slice(idx + 1);
      if (!raw) continue;
      const [head, ...rest] = raw.split(/\r?\n\r?\n/);
      const body = rest.join('\n\n');
      const [command, ...headerLines] = head.split(/\r?\n/);
      const headers = {};
      for (const line of headerLines) {
        const i = line.indexOf(':');
        const k = line.slice(0, i);
        if (!(k in headers)) headers[k] = line.slice(i + 1);    // first header wins (unescape omitted)
      }
      if (command === 'CONNECTED') this.onConnected?.(headers);
      else if (command === 'MESSAGE') this.handlers.get(headers.subscription)?.(JSON.parse(body), headers);
      else if (command === 'ERROR') console.error('STOMP ERROR', headers.message, body);
    }
  }
}
```

This deliberately skips header unescaping, `content-length`-based reading, heart-beats and reconnects:
exactly the things real libraries do for you. Use `@stomp/stompjs` in real code.

---

## 4.17 STOMP vs other messaging protocols

| | STOMP | MQTT | AMQP 0-9-1 | AMQP 1.0 | Custom JSON over WS |
|---|---|---|---|---|---|
| Format | Text frames (HTTP-like) | Compact binary | Binary | Binary | Whatever you invent |
| Complexity | Very low | Low | High | High | Varies |
| Routing model | Opaque destinations (broker-defined) | Topic hierarchy with `+`/`#` wildcards | Exchanges/bindings/queues | Links/addresses | Yours |
| QoS / acks | auto/client/client-individual, receipts | QoS 0/1/2 | Acks, confirms | Rich settlement | Yours |
| Browser use | Excellent (over WS) | Good (MQTT over WS) | No (not in browsers directly) | Rare | Common |
| Typical brokers | RabbitMQ, ActiveMQ, Spring simple broker | Mosquitto, EMQX, HiveMQ, RabbitMQ | RabbitMQ | ActiveMQ Artemis, Azure Service Bus, Qpid | – |
| Best for | Web apps with Spring/RabbitMQ, simple interop | IoT, constrained devices, mobile | Back-end messaging | Enterprise interop | Small apps, full control |

---

## 4.18 Strengths and weaknesses of STOMP

**Strengths:** human-readable, trivially debuggable in DevTools, simple, many clients, Spring's first-class support,
pub/sub + headers + acks + receipts + heart-beats standardised, works with real brokers.

**Weaknesses:** text-based (bigger than binary protocols for high-frequency data), `ERROR` always kills the
connection, no built-in request/response correlation (you add `correlation-id`/`reply-to` headers by convention),
destination semantics vary per broker, no native message ordering/replay/persistence guarantees beyond what the
broker offers, spec has been static since 2012.

---

## 4.19 Chapter summary

* Frame = `COMMAND\n headers \n\n body \0`. Headers are UTF-8, case-sensitive, untrimmed, escaped (`\n \r \c \\`) except in CONNECT/CONNECTED. First repeated header wins.
* `content-length` is in bytes, allows NULLs in body.
* Client commands: CONNECT/STOMP, SEND, SUBSCRIBE, UNSUBSCRIBE, ACK, NACK, BEGIN, COMMIT, ABORT, DISCONNECT. Server: CONNECTED, MESSAGE, RECEIPT, ERROR.
* Heart-beat negotiation: `max(cx, sy)` client→server, `max(sx, cy)` server→client, 0 disables.
* Ack modes: auto, client (cumulative), client-individual. 1.2 ACK uses `id` = MESSAGE `ack` header.
* ERROR closes the connection. Receipts confirm processing of a frame (and receipt of all before it).
* Destinations are broker-specific strings.

Next: [Chapter 5: Spring WebSocket + STOMP Server](05-spring-stomp-server.md)
