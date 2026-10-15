# Chapter 2: The WebSocket Protocol (RFC 6455), Deep Dive

> **Goal:** know WebSocket at the wire level, well enough to read a Wireshark capture, explain every
> byte of a frame, and answer any protocol question in an interview.

---

## 2.1 ELI5

1. You **knock** on the server's door using a normal HTTP letter that says *"Can we switch to telephone mode?"* (the **opening handshake**).
2. The server answers *"101: Yes, switching to telephone mode"* and does a small math trick to prove it really understands telephones (the **`Sec-WebSocket-Accept`** value).
3. From now on, you talk in small **packets called frames**. Each frame has a tiny label ("this is text", "this is the last piece", "this is a goodbye").
4. Every so often one side says **"ping?"** and the other says **"pong!"** to check the line is alive.
5. To hang up politely, one side sends a **close frame** with a reason code, the other answers with a close frame, and the line is closed.

---

## 2.2 History and standards

| Date | Event |
|------|-------|
| 2008 | "TCPConnection" idea in HTML5 drafts; renamed WebSocket |
| 2009–2010 | Browsers ship draft versions (hixie-75, hixie-76, hybi-xx), some with security problems |
| **Dec 2011** | **RFC 6455 published.** Version `13`. This is "WebSocket" today. |
| Dec 2015 | RFC 7692: `permessage-deflate` compression extension |
| Sep 2018 | RFC 8441: WebSocket over HTTP/2 (extended CONNECT) |
| Jun 2022 | RFC 9220: WebSocket over HTTP/3 |
| Ongoing | The browser API is the WHATWG "WebSockets Standard" |

The protocol has two parts: the **opening handshake** and the **data transfer** (framing).

URI schemes (RFC 6455 §3):

```
ws://host[:port]/path[?query]     default port 80
wss://host[:port]/path[?query]    default port 443 (TLS)
```

Fragment identifiers (`#...`) are **not allowed** in WebSocket URIs.

---

## 2.3 The opening handshake

### 2.3.1 Client request

```http
GET /ws HTTP/1.1
Host: chat.example.com
Upgrade: websocket
Connection: Upgrade
Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==
Sec-WebSocket-Version: 13
Origin: https://app.example.com
Sec-WebSocket-Protocol: v12.stomp, v11.stomp, v10.stomp
Sec-WebSocket-Extensions: permessage-deflate; client_max_window_bits
Cookie: SESSION=abc123
```

Rules the RFC requires of the client request:

| Header | Required? | Meaning |
|--------|-----------|---------|
| Method `GET`, HTTP/1.1 or higher | Yes | Must be a GET |
| `Host` | Yes | Normal HTTP host |
| `Upgrade: websocket` | Yes | Case-insensitive value "websocket" |
| `Connection: Upgrade` | Yes | Must include the token "Upgrade" (could be `keep-alive, Upgrade`) |
| `Sec-WebSocket-Key` | Yes | Base64 of **16 random bytes**, new for every connection |
| `Sec-WebSocket-Version: 13` | Yes | Only `13` is valid for RFC 6455 |
| `Origin` | Sent by browsers | The page's origin; **servers must check it** (CSWSH, Chapter 8) |
| `Sec-WebSocket-Protocol` | Optional | Sub-protocols the client can speak, in preference order |
| `Sec-WebSocket-Extensions` | Optional | Extensions the client wants (e.g., compression) |
| Cookies / Authorization | Optional | Normal HTTP headers; **browsers send cookies but you cannot add custom headers from JS** |

### 2.3.2 Server response

```http
HTTP/1.1 101 Switching Protocols
Upgrade: websocket
Connection: Upgrade
Sec-WebSocket-Accept: s3pPLMBiTxaQ9kYGzzhZRbK+xOo=
Sec-WebSocket-Protocol: v12.stomp
Sec-WebSocket-Extensions: permessage-deflate
```

* Status **must be `101`**. Any other status (200, 302, 401, 403, 404…) means **the handshake failed**. Browsers do *not* follow redirects for WebSocket.
* `Sec-WebSocket-Protocol` in the response must be **one** of the values the client offered (or absent). If the server picks one the client didn't offer, the client must fail the connection.

### 2.3.3 How `Sec-WebSocket-Accept` is computed

```
accept = base64( SHA-1( Sec-WebSocket-Key + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11" ) )
```

The magic string `258EAFA5-E914-47DA-95CA-C5AB0DC85B11` is a fixed GUID from the RFC.

Worked example (from RFC 6455, verified):

```
key      = dGhlIHNhbXBsZSBub25jZQ==            (base64 of "the sample nonce")
concat   = dGhlIHNhbXBsZSBub25jZQ==258EAFA5-E914-47DA-95CA-C5AB0DC85B11
SHA-1    = b3 7a 4f 2c c0 62 4f 16 90 f6 46 06 cf 38 59 45 b2 be c4 ea
accept   = s3pPLMBiTxaQ9kYGzzhZRbK+xOo=
```

You can check it yourself:

```bash
printf '%s' 'dGhlIHNhbXBsZSBub25jZQ==258EAFA5-E914-47DA-95CA-C5AB0DC85B11' \
  | openssl sha1 -binary | base64
# s3pPLMBiTxaQ9kYGzzhZRbK+xOo=
```

```java
String accept = Base64.getEncoder().encodeToString(
    MessageDigest.getInstance("SHA-1").digest(
        (key + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11").getBytes(StandardCharsets.US_ASCII)));
```

> **Interview trap: "Is `Sec-WebSocket-Key` a security feature?"**
> **No.** It provides no authentication or encryption. Its purpose is to prove that the server
> actually understands the WebSocket protocol (so a non-WebSocket server, or a cache, cannot accidentally
> accept the request) and to stop caching proxies from replaying a previous handshake response.
> Real security = TLS (`wss://`) + Origin checking + authentication + authorisation.

Why the `Sec-` prefix? Browsers forbid JavaScript from setting headers starting with `Sec-`, so a script
using `fetch`/`XMLHttpRequest` cannot forge a WebSocket handshake.

### 2.3.4 After the 101

The same TCP connection is now a WebSocket connection. No more HTTP on it. If the server ever wants
to "redirect" or reject, it must do so **before** the 101 (with a normal HTTP status code).

### 2.3.5 Handshake failure scenarios

| What you see | Likely cause |
|--------------|--------------|
| `Error during WebSocket handshake: Unexpected response code: 200` | You hit a normal HTTP endpoint (SPA fallback serving `index.html`, wrong path, proxy not forwarding `Upgrade`) |
| `... code: 400` | Missing/invalid `Upgrade`/`Connection` headers (proxy stripped them), or Spring rejected (e.g., unsupported origin can also be 403) |
| `... code: 403` | Origin not allowed (`setAllowedOrigins`) or security filter rejected |
| `... code: 404` | Wrong path (`/ws` vs `/ws/websocket` for SockJS) or context path missing |
| `... code: 401` | Auth filter on the handshake path |
| `... code: 502/504` | Reverse proxy/gateway can't reach the backend or timed out |
| Browser `close` event with code `1006` and no handshake response | TCP/TLS failure, certificate error, CORS-like origin rejection at proxy, server down |

---

## 2.4 Base framing protocol (the heart of WebSocket)

After the handshake, data travels in **frames**:

```
  0                   1                   2                   3
  0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1
 +-+-+-+-+-------+-+-------------+-------------------------------+
 |F|R|R|R| opcode|M| Payload len |    Extended payload length    |
 |I|S|S|S|  (4)  |A|     (7)     |             (16/64)           |
 |N|V|V|V|       |S|             |   (if payload len==126/127)   |
 | |1|2|3|       |K|             |                               |
 +-+-+-+-+-------+-+-------------+ - - - - - - - - - - - - - - - +
 |     Extended payload length continued, if payload len == 127  |
 + - - - - - - - - - - - - - - - +-------------------------------+
 |                               |Masking-key, if MASK set to 1  |
 +-------------------------------+-------------------------------+
 | Masking-key (continued)       |          Payload Data         |
 +-------------------------------- - - - - - - - - - - - - - - - +
 :                     Payload Data continued ...                :
 +---------------------------------------------------------------+
```

### 2.4.1 Field by field

| Field | Bits | Meaning |
|-------|------|---------|
| **FIN** | 1 | 1 = this is the **final** fragment of a message |
| **RSV1, RSV2, RSV3** | 1 each | Must be 0 unless an extension defines them. `permessage-deflate` uses **RSV1** to mark a compressed message. Unknown non-zero RSV → fail connection. |
| **Opcode** | 4 | Frame type (table below) |
| **MASK** | 1 | 1 = payload is masked. **Client→server frames MUST be masked; server→client frames MUST NOT be masked.** |
| **Payload length** | 7, 7+16, or 7+64 | 0–125: that's the length. 126: next 2 bytes (unsigned 16-bit) are the length. 127: next 8 bytes (unsigned 64-bit, most significant bit must be 0) are the length. Must use the **minimal** encoding. |
| **Masking key** | 32 | Present only if MASK=1. Random 4 bytes, new per frame. |
| **Payload** | rest | Extension data + application data |

### 2.4.2 Opcodes

| Opcode | Name | Type |
|--------|------|------|
| `0x0` | Continuation | Data (fragment of a message) |
| `0x1` | **Text** | Data, payload must be valid **UTF-8** |
| `0x2` | **Binary** | Data, arbitrary bytes |
| `0x3`–`0x7` | Reserved | Future data frames |
| `0x8` | **Close** | Control |
| `0x9` | **Ping** | Control |
| `0xA` | **Pong** | Control |
| `0xB`–`0xF` | Reserved | Future control frames |

Control frames (close/ping/pong):
* Payload **≤ 125 bytes**.
* **Must not be fragmented** (FIN=1 always).
* **May be injected in the middle of a fragmented message** (so a ping isn't stuck behind a huge message).

### 2.4.3 Header size

| Payload length | Server→client header | Client→server header (+4 mask) |
|----------------|---------------------|--------------------------------|
| 0–125 bytes | **2 bytes** | 6 bytes |
| 126–65,535 bytes | 4 bytes | 8 bytes |
| ≥ 65,536 bytes | 10 bytes | **14 bytes** |

Hence "2 to 14 bytes of overhead per frame". Compare with hundreds of bytes for an HTTP request.

### 2.4.4 Decoding real frames

**Unmasked text frame "Hello" (server→client):**

```
81 05 48 65 6c 6c 6f
│  │  └──────────── "Hello" in ASCII
│  └─ 0x05: MASK=0, length=5
└─ 0x81: FIN=1, RSV=000, opcode=0x1 (text)
```

**Masked text frame "Hello" (client→server), mask key 37 fa 21 3d:**

```
81 85 37 fa 21 3d 7f 9f 4d 51 58
   │  └─ mask key  └─ masked payload
   └─ 0x85: MASK=1, length=5
```

Masking algorithm: `masked[i] = original[i] XOR maskKey[i % 4]`. Unmasking is the same operation.

```
'H'=0x48 ^ 0x37 = 0x7f
'e'=0x65 ^ 0xfa = 0x9f
'l'=0x6c ^ 0x21 = 0x4d
'l'=0x6c ^ 0x3d = 0x51
'o'=0x6f ^ 0x37 = 0x58
```

**Ping with no payload:** `89 00`. **Pong:** `8a 00`.
**256-byte binary message (server):** `82 7e 01 00 <256 bytes>` (`7e` = 126 → 16-bit length `0x0100`).
**64 KiB binary message (server):** `82 7f 00 00 00 00 00 01 00 00 <65536 bytes>`.

### 2.4.5 Why masking exists (classic interview question)

> **ELI5:** Masking scrambles what the browser sends so that a confused "middle-man" (an old proxy or
> cache) can't be tricked into thinking it's seeing a normal web request.

Researchers (Huang, Chen, Barth, Rescorla, Jackson, *"Talking to Yourself for Fun and Profit"*, 2011)
showed that, with the pre-standard WebSocket drafts, an attacker's page could send bytes that **looked like an HTTP
request** to transparent proxies that didn't understand WebSocket, leading to **cache poisoning** (the
proxy caches the attacker's fake response for a real URL like a popular JavaScript file, affecting
other users).

Because the browser picks a **random, unpredictable mask** per frame, the attacker's JavaScript cannot
control the exact bytes on the wire. So it cannot craft a fake HTTP request.

* Masking is **not encryption** (the key is sent in the clear right before the data).
* Server→client frames aren't masked because the attacker controls the client side (script in a browser), not the server.
* A server **must close the connection** if it receives an unmasked frame from a client (close code 1002). A client must close if it receives a masked frame from a server.

### 2.4.6 Fragmentation

A **message** can be split into multiple **frames**:

```
Frame 1: FIN=0, opcode=0x1 (text)   "Hel"
Frame 2: FIN=0, opcode=0x0 (cont)   "lo, Wo"
Frame 3: FIN=1, opcode=0x0 (cont)   "rld"
=> one message: "Hello, World"
```

Rules:
* The first frame carries the real opcode; the rest use `0x0`.
* Fragments of **different** data messages must not interleave (no multiplexing in base protocol).
* Control frames **can** be interleaved between fragments.
* Intermediaries may re-fragment messages (unless extensions forbid it).
* Why fragment? To send a message whose size isn't known up front (streaming), or to keep control frames (ping/close) responsive during huge transfers.

> **Pitfall:** "Message" vs "frame". APIs like the browser's `onmessage` give you **whole messages**.
> Low-level servers (e.g., Spring's `WebSocketHandler` with `supportsPartialMessages()`) can give you
> **partial** messages. Also, **STOMP frames are not the same as WebSocket frames**. One STOMP frame is
> usually one WebSocket message, but a STOMP frame could be split across WebSocket messages, or (less commonly) several STOMP
> frames could arrive in one WebSocket message. Spring's `BufferingStompDecoder` and stompjs handle this.

### 2.4.7 Text vs binary messages

* **Text (0x1):** payload must be valid UTF-8 across the whole message. Invalid UTF-8 → close with **1007**.
* **Binary (0x2):** any bytes (images, protobuf, MessagePack, compressed blobs).
* STOMP over WebSocket can use either. Text is easier to debug, binary is required if the body can contain NULL bytes or non-UTF-8 content, and it is also needed for the React Native workaround in Chapter 6.

---

## 2.5 Control frames in detail

### 2.5.1 Ping and Pong

* Either endpoint may send a **Ping** (`0x9`) at any time after the handshake.
* The receiver **must** respond with a **Pong** (`0xA`) "as soon as practical", with the **same application data** as the ping.
* A **Pong may be sent unsolicited** as a unidirectional heart-beat; no response is expected.
* If several pings arrive before a pong can be sent, it's allowed to respond only to the most recent.

> **Important: the browser JavaScript API cannot send pings or see pongs.** Browsers automatically
> answer server pings with pongs, but your JS code has no `ping()` method. That's why
> **application-level heart-beats** exist (STOMP heart-beats, or `{"type":"ping"}` messages). Servers
> (Java, Node `ws`, Go) *can* send protocol pings to detect dead clients.

### 2.5.2 Close frame and the closing handshake

Payload of a close frame (optional):
```
+----------------------+-----------------------------------+
| 2-byte status code   | UTF-8 reason (≤ 123 bytes)        |
| (network byte order) | (125 - 2 = 123 bytes max)         |
+----------------------+-----------------------------------+
```

Closing handshake:

```
Client                             Server
  |---- Close(1000, "bye") -------->|
  |<--- Close(1000, "bye") ---------|   server echoes a close frame
  |                                 |   server closes TCP first (recommended)
  X  TCP FIN/ACK                    X
```

* After sending a close frame, an endpoint **must not send more data frames**.
* After receiving a close frame, the endpoint must send a close frame back (if it hasn't already).
* The **server should close the underlying TCP connection first** (RFC 6455 §7.1.1), so that the server, not the client, holds the TCP `TIME_WAIT` state and the client can immediately re-open a connection. Application code rarely needs to care; the library does it.
* If the TCP connection dies without a close frame, the API reports **1006 (abnormal closure)**.

### 2.5.3 Close status codes (memorise the common ones)

| Code | Name | When |
|------|------|------|
| **1000** | Normal Closure | Purpose fulfilled, normal logout |
| **1001** | Going Away | Server shutting down, or browser tab navigating away |
| **1002** | Protocol Error | Malformed frames, unmasked client frame, etc. |
| **1003** | Unsupported Data | E.g., binary received by a text-only endpoint |
| 1004 | Reserved | Not to be used |
| **1005** | No Status Received | **Reserved; never sent on the wire.** API reports it when a close frame had no code. |
| **1006** | Abnormal Closure | **Reserved; never sent on the wire.** Connection dropped without a close frame (network loss, crash, proxy timeout, TLS failure). **The most common code you'll debug.** |
| **1007** | Invalid Frame Payload Data | E.g., non-UTF-8 in a text message |
| **1008** | Policy Violation | Generic "you broke a rule" (e.g., auth failure after connect) |
| **1009** | Message Too Big | Message exceeds the receiver's limit (e.g., Spring/Tomcat buffer size) |
| **1010** | Mandatory Extension | Client expected the server to negotiate an extension it didn't |
| **1011** | Internal Error | Server hit an unexpected condition |
| 1012 | Service Restart | (IANA registered) server restarting; client should reconnect |
| 1013 | Try Again Later | (IANA registered) temporary overload |
| 1014 | Bad Gateway | (IANA registered) gateway received an invalid response |
| **1015** | TLS Handshake | **Reserved; never sent.** TLS handshake failure |
| 0–999 | Not used | |
| 1000–2999 | Protocol | Defined by RFC/extensions |
| **3000–3999** | Libraries/frameworks/apps | Registered with IANA (first come first served) |
| **4000–4999** | Private use | Your application's own codes (e.g., 4001 "token expired") |

From browser JavaScript, `ws.close(code, reason)` accepts only **1000** or **3000–4999**, otherwise it throws `InvalidAccessError`. The reason must be ≤ **123 bytes** of UTF-8, otherwise it throws `SyntaxError`.

> **Pitfall:** Spring defines a few of its own `CloseStatus` constants, e.g. `CloseStatus.SESSION_NOT_RELIABLE`
> (**4500**), used when a session's send buffer/time limits are exceeded (Chapter 9). If you see 4500 in logs, it's Spring, not the client.

---

## 2.6 Extensions and sub-protocols

### 2.6.1 Extensions (`Sec-WebSocket-Extensions`)
Extensions change the framing itself. The famous one is **`permessage-deflate`** (RFC 7692):

* Compresses each message with DEFLATE; sets **RSV1** on the first frame of a compressed message.
* Parameters: `server_no_context_takeover`, `client_no_context_takeover`, `server_max_window_bits`, `client_max_window_bits`.
* "Context takeover" = keep the compression dictionary between messages (better ratio, more memory per connection, often ~tens to hundreds of KB per connection depending on window/memory settings).
* Trade-off: **CPU and memory vs bandwidth**. For 100k connections, per-connection compression memory can dominate. Many teams disable context takeover or compression entirely for small JSON messages.
* **Security:** compression of secrets mixed with attacker-controlled data can leak information (CRIME/BREACH-style attacks). Don't compress messages mixing secrets and user-controlled input in the same context.

### 2.6.2 Sub-protocols (`Sec-WebSocket-Protocol`)
Sub-protocols define the **application-level language** spoken over the socket. For STOMP the registered names are:

```
v10.stomp   STOMP 1.0
v11.stomp   STOMP 1.1
v12.stomp   STOMP 1.2
```

Others you might meet: `mqtt`, `wamp`, `graphql-transport-ws` (GraphQL subscriptions), `graphql-ws` (legacy).

* The client offers a list, and the server chooses **at most one**.
* Spring's `SubProtocolWebSocketHandler` uses this to pick the STOMP handler. If the client sends no sub-protocol header, Spring falls back to its default protocol handler (STOMP, when it's the only one configured).

> **Hack you'll see in the wild:** Because browsers can't set an `Authorization` header, some apps put a
> token in `Sec-WebSocket-Protocol` (e.g., `new WebSocket(url, ['v12.stomp', token])`). It works but
> is a hack: the server must echo back exactly **one** offered value, the token ends up in logs, and it
> abuses a header meant for protocol names. Prefer the STOMP `CONNECT` header approach (Chapter 8).

---

## 2.7 WebSocket over HTTP/2 and HTTP/3

Classic WebSocket requires HTTP/1.1 `Upgrade`, which **does not exist in HTTP/2**. Solutions:

* **RFC 8441 (HTTP/2):** server advertises `SETTINGS_ENABLE_CONNECT_PROTOCOL = 1`. Client sends an **extended CONNECT** request on a new stream:
  ```
  :method = CONNECT
  :protocol = websocket
  :scheme = https
  :path = /ws
  :authority = chat.example.com
  sec-websocket-version = 13
  sec-websocket-protocol = v12.stomp
  origin = https://app.example.com
  ```
  Response `:status = 200` (not 101). There is **no** `Sec-WebSocket-Key/Accept` exchange. WebSocket frames then flow as the stream's DATA. Many WebSockets can share one TCP connection.
* **RFC 9220 (HTTP/3):** same idea over QUIC.
* In practice most production stacks still use **HTTP/1.1 upgrade** from the edge proxy to the app, even if browser↔CDN uses HTTP/2. Support depends on each hop (browser, CDN, load balancer, server). Don't assume it.

---

## 2.8 Connection lifecycle: the full picture

```
           new WebSocket(url)
                  │
                  ▼
         ┌─────────────────┐   TCP connect, TLS handshake,
         │ CONNECTING (0)  │   HTTP Upgrade request ───► server
         └────────┬────────┘
       101 OK ◄───┘ (otherwise → error + close(1006))
                  ▼
         ┌─────────────────┐   data frames both ways,
         │    OPEN (1)     │   ping/pong
         └────────┬────────┘
     close() or   │  close frame received
                  ▼
         ┌─────────────────┐
         │  CLOSING (2)    │   closing handshake
         └────────┬────────┘
                  ▼
         ┌─────────────────┐
         │   CLOSED (3)    │   onclose(code, reason, wasClean)
         └─────────────────┘
```

---

## 2.9 Limits, intermediaries and the real world

### 2.9.1 Message size limits
The protocol allows messages up to 2^63 bytes. Real servers set limits:

| Component | Typical default (verify for your version) |
|-----------|--------------------------------------------|
| Tomcat (JSR-356) text/binary buffer | 8 KB (`maxTextMessageBufferSize`, `maxBinaryMessageBufferSize`) |
| Spring STOMP inbound message size limit | 64 KB (`WebSocketTransportRegistration.setMessageSizeLimit`) |
| Node `ws` `maxPayload` | 100 MiB (default in recent versions) |
| Nginx | No WS message limit (just proxies bytes) |
| AWS API Gateway WebSocket | 128 KB message, 32 KB frame |

Exceeding usually → **1009 Message Too Big** close. Design rule: **don't send huge payloads over WebSocket**. Send a notification with an ID or URL, then fetch the big data over HTTP.

### 2.9.2 Idle timeouts at intermediaries
Every hop may kill connections that look idle:

| Hop | Typical default idle timeout |
|-----|------------------------------|
| Nginx `proxy_read_timeout` / `proxy_send_timeout` | 60 s |
| AWS Application Load Balancer | 60 s (configurable up to 4000 s) |
| Azure Application Gateway / Front Door / GCP load balancer | Varies; GCP backend service timeout often applies to WS lifetime (default 30 s, must be raised) |
| Cloudflare | ~100 s idle without traffic |
| Corporate proxies, NAT routers, mobile carriers | Anything from 30 s to minutes |

**Solution:** heart-beats/pings at an interval **shorter** than the smallest idle timeout in the path
(e.g., 10–25 s), plus increased proxy timeouts.

### 2.9.3 Proxies
* **Forward proxies** (corporate): the browser uses HTTP `CONNECT` tunnelling for `wss://`, which usually works. Plain `ws://` through a proxy that doesn't understand `Upgrade` often fails → another reason for `wss://`.
* **Reverse proxies** (Nginx, HAProxy, Envoy, cloud LBs): must explicitly forward `Upgrade` and `Connection` headers (Chapter 7 has configs).
* **Antivirus / "TLS inspection" products** sometimes buffer or break WebSocket. SockJS fallbacks were invented largely for such environments.

---

## 2.10 Writing a WebSocket by hand (to prove you understand it)

A minimal Node.js server **without** libraries (educational only, not production: no fragmentation, no large frames, no close handshake):

```js
const http = require('http');
const crypto = require('crypto');
const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

const server = http.createServer((req, res) => res.end('plain http'));

server.on('upgrade', (req, socket) => {
  if (req.headers['upgrade']?.toLowerCase() !== 'websocket') return socket.destroy();
  const accept = crypto.createHash('sha1')
    .update(req.headers['sec-websocket-key'] + GUID).digest('base64');
  socket.write(
    'HTTP/1.1 101 Switching Protocols\r\n' +
    'Upgrade: websocket\r\n' +
    'Connection: Upgrade\r\n' +
    `Sec-WebSocket-Accept: ${accept}\r\n\r\n`);

  socket.on('data', (buf) => {
    const opcode = buf[0] & 0x0f;
    const masked = (buf[1] & 0x80) !== 0;
    let len = buf[1] & 0x7f, offset = 2;
    if (len === 126) { len = buf.readUInt16BE(2); offset = 4; }
    else if (len === 127) { len = Number(buf.readBigUInt64BE(2)); offset = 10; }
    if (!masked) return socket.destroy();          // clients MUST mask
    const mask = buf.subarray(offset, offset + 4); offset += 4;
    const payload = Buffer.alloc(len);
    for (let i = 0; i < len; i++) payload[i] = buf[offset + i] ^ mask[i % 4];

    if (opcode === 0x8) return socket.end(Buffer.from([0x88, 0x00]));  // close
    if (opcode === 0x9) return socket.write(Buffer.concat([Buffer.from([0x8a, len]), payload])); // pong
    if (opcode === 0x1) {
      const reply = Buffer.from('echo: ' + payload.toString('utf8'));
      socket.write(Buffer.concat([Buffer.from([0x81, reply.length]), reply])); // assumes < 126
    }
  });
});
server.listen(8080);
```

> In real projects **always use a mature library** (Spring/Tomcat/Jetty, Node `ws`, Go `gorilla/websocket`
> or `coder/websocket`, Python `websockets`). Hand-written parsers routinely get fragmentation, UTF-8
> validation, partial TCP reads (`data` events don't align with frames!), and close handling wrong.

---

## 2.11 Tools to inspect WebSocket traffic

* **Chrome/Edge DevTools → Network → filter "WS"** → click the connection → **Messages** tab (shows each message; STOMP frames are readable text). Firefox has the same.
* **Wireshark**: filter `websocket`; for `wss://` you need TLS keys (`SSLKEYLOGFILE` env var for browsers).
* **`websocat`**: `websocat wss://echo.websocket.org` (a netcat for WebSockets). `wscat` (`npx wscat -c ws://localhost:8080/ws -s v12.stomp`).
* **`curl`** can test the handshake (`curl -i -N -H "Connection: Upgrade" -H "Upgrade: websocket" -H "Sec-WebSocket-Version: 13" -H "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==" http://localhost:8080/ws`), and recent versions (7.86+) have experimental native `ws://` support.
* **Postman** and **Insomnia** support WebSocket requests (you can type raw STOMP frames, remembering the NULL terminator: Postman lets you send `\u0000`).
* **Burp Suite / OWASP ZAP**: security testing of WebSocket messages.

---

## 2.12 Chapter summary

* Handshake: HTTP/1.1 GET + `Upgrade: websocket` + `Connection: Upgrade` + `Sec-WebSocket-Key` + version 13 → **101** + `Sec-WebSocket-Accept = base64(SHA1(key + GUID))`.
* Frames: FIN, RSV1-3, opcode, MASK, length (7/16/64-bit), mask key, payload. 2–14 bytes overhead.
* Client→server frames must be masked (anti-cache-poisoning), server→client must not be.
* Messages can be fragmented. Control frames ≤125 bytes, never fragmented, may interleave.
* Ping/pong for liveness; the browser API can't send pings → use app-level heart-beats.
* Close codes: 1000 normal, 1001 going away, 1006 abnormal (never sent), 1008 policy, 1009 too big, 1011 internal, 4000–4999 yours.
* Sub-protocol for STOMP: `v12.stomp`. Extension: `permessage-deflate`.
* Real world: proxies, idle timeouts, message size limits, always `wss://`.

Next: [Chapter 3: The Browser & JavaScript WebSocket API](03-websocket-browser-api.md)
