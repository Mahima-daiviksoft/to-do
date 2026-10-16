# Chapter 21 — Offline-First Clients and End-to-End Encryption

> **Goal:** two advanced client-side topics that come up in serious products and senior
> interviews: (1) never losing a user's action, even across offline periods and page
> reloads (**outbox pattern**), and (2) making messages unreadable to the server
> (**end-to-end encryption, E2EE**) while still using Socket.IO as the transport.
>
> **How this chapter was checked:** both implementations were run in Node 22 against a
> Socket.IO 4.8.4 server. The outbox test used `fake-indexeddb` to provide the browser's
> IndexedDB API: two messages written while the server was down survived a simulated page
> reload and were delivered exactly once when the server came back. The E2EE test used
> the standard Web Crypto API (identical in browsers): the server only saw a 12-byte IV and
> a 32-byte ciphertext; the recipient decrypted the original text.

---

## 21.1 ELI5

**Outbox:** when you write a letter but the post office is closed, you put it in a box
by your door (saved on disk). Every time the post office opens, you hand over the letters
from the box one by one, and you only throw a letter away when the post office gives you
a receipt. If you move house (reload the page), the box comes with you.

**E2EE:** you and your friend each have a special padlock and key. You lock your letter
with a padlock only your friend can open. The postman (the server) carries the locked box
but can't read what's inside.

---

## 21.2 Why Socket.IO's built-in buffering isn't enough

Recap (Chapter 5): the JS client keeps emits made while disconnected in
`socket.sendBuffer` and sends them on reconnection. But:

| Situation | Built-in buffer | Outbox |
|---|---|---|
| Short network blip | ✅ delivered | ✅ delivered |
| Page reload / tab closed / app killed while offline | ❌ lost (memory only) | ✅ persisted in IndexedDB |
| Server received it but the ack was lost | ⚠️ not retried → you don't know | ✅ retried with the **same id** → server dedupes |
| Server rejected it (validation) | you see the ack, nothing stored | ✅ removed with an error state for the UI |
| Swift client (no offline buffering at all, Chapter 16) | ❌ | ✅ |

Use the outbox for **user-generated commands that matter**: chat messages, form
submissions, likes, edits in collaborative apps, field data entry.

---

## 21.3 The outbox pattern — design

1. **Persist first, send second.** The UI writes the command to durable local storage
   (IndexedDB) with a **client-generated unique id** before sending.
2. **Optimistic UI.** Show the item immediately as "pending".
3. **Send in order, one at a time**, with an **ack + timeout**.
4. **Remove on success** (or on a *permanent* rejection, surfaced to the user).
5. **Retry on reconnect** (`connect` event), and on app start.
6. **Server is idempotent:** a unique constraint on the client id makes retries harmless.
7. **Stop at the first transient failure** to preserve order.

## 21.4 Implementation (verified)

```js
// outbox.mjs — offline-first outbox: messages survive offline periods AND page reloads.
import { get, set } from "idb-keyval";       // tiny IndexedDB wrapper (works in browsers)

const KEY = "outbox:v1";

export class Outbox {
  constructor(socket, { event = "message:send", ackTimeout = 8000 } = {}) {
    this.socket = socket;
    this.event = event;
    this.ackTimeout = ackTimeout;
    this.flushing = false;
    socket.on("connect", () => this.flush());           // retry everything pending on every (re)connect
  }

  async #load() { return (await get(KEY)) ?? []; }
  async #save(items) { await set(KEY, items); }

  // 1) persist FIRST, 2) then try to send
  async enqueue(payload) {
    const item = { id: crypto.randomUUID(), payload, createdAt: Date.now() };
    await this.#save([...(await this.#load()), item]);
    this.flush();
    return item.id;                                     // use it as the key of the "pending" UI item
  }

  async pending() { return this.#load(); }

  async flush() {
    if (this.flushing || !this.socket.connected) return;
    this.flushing = true;
    try {
      for (const item of await this.#load()) {           // in order, one at a time
        if (!this.socket.connected) break;
        try {
          const res = await this.socket.timeout(this.ackTimeout)
            .emitWithAck(this.event, { ...item.payload, clientMsgId: item.id }); // SAME id on every retry
          if (res?.ok || res?.error?.code === "VALIDATION") {
            // delivered (or permanently rejected → show it to the user) → remove from the outbox
            await this.#save((await this.#load()).filter((i) => i.id !== item.id));
          } else {
            break;                                       // transient error: keep order, retry later
          }
        } catch {
          break;                                         // ack timeout: retry on next connect / flush
        }
      }
    } finally {
      this.flushing = false;
    }
  }
}
```

Server side — idempotent handler:

```js
socket.on("message:send", async (m, ack) => {
  // UNIQUE index on client_msg_id → the second insert of a retried message does nothing
  const { inserted, message } = await db.insertMessageIfAbsent(m.clientMsgId, socket.data.user.id, m);
  if (inserted) io.to(`conversation:${m.conversationId}`).emit("message:new", message);
  ack({ ok: true, data: { id: message.id }, duplicate: !inserted });
});
```

### Test scenario and real output

```js
// phase 1: server is DOWN; the user sends 2 messages, then the page "reloads" (client destroyed)
let c1 = io(URL, { reconnectionDelay: 200, reconnectionDelayMax: 300 });
let ob1 = new Outbox(c1);
await ob1.enqueue({ text: "written offline #1" });
await ob1.enqueue({ text: "written offline #2" });
console.log("pending before reload:", (await ob1.pending()).length);
c1.close();                                   // the in-memory sendBuffer would be lost here

// phase 2: new page load, server comes back
startServer();
const c2 = io(URL);
const ob2 = new Outbox(c2);                    // reads the persisted items and flushes on connect
await sleep(800);
console.log("pending after reconnect:", (await ob2.pending()).length);
console.log("server stored:", [...stored.values()]);
```

```
pending before reload: 2
pending after reconnect: 0
server stored: [ 'written offline #1', 'written offline #2' ]
```

### Production refinements

- **Multiple tabs:** two tabs flushing the same IndexedDB outbox can double-send (harmless
  thanks to idempotency, but wasteful). Use the Web Locks API
  (`navigator.locks.request("outbox", …)`) so only one tab flushes at a time.
- **Per-conversation ordering** instead of one global queue, so one stuck item doesn't
  block unrelated conversations.
- **Expiry & poison messages:** after N attempts or a max age, mark as failed and let the
  user retry or discard.
- **Large items** (attachments): store blobs separately; upload via HTTP; the outbox item
  references the upload.
- **Service worker Background Sync** can trigger a flush after connectivity returns even if
  the page is closed (where supported) — it would use HTTP, not the socket.
- **Encryption at rest:** IndexedDB isn't encrypted; don't store secrets there.
- **Mobile equivalents:** SQLite/Room (Android), Core Data/SQLite (iOS), Hive/Isar/sqflite
  (Flutter) with the same algorithm.

### Server → client: the inbox side

The outbox covers client→server. For server→client completeness, combine with the sync
pattern (Chapter 5.9): persist on the server, client syncs "after last id" on every
connect, dedupes by id. Together they give at-least-once delivery both ways with
effectively-once processing.

---

## 21.5 End-to-end encryption (E2EE)

### What E2EE means here

TLS (`wss://`) already encrypts traffic **between client and server**, but the server
sees plaintext. With E2EE, clients encrypt **before** emitting; the server stores and
relays **ciphertext** only. Socket.IO is just the transport: binary payloads
(`Uint8Array`) travel as attachments.

Things the server still sees: who talks to whom, when, message sizes, room membership —
**metadata**. E2EE protects content, not metadata.

### The building blocks (Web Crypto API — available in browsers and Node 20+)

- **ECDH (P-256)** key agreement: each user has a key pair; combining my private key with
  your public key yields the same shared secret on both sides.
- **HKDF** to derive a proper AES key from that secret (with a salt/context, e.g. the
  conversation id).
- **AES-GCM (256)** for authenticated encryption, with a **random 12-byte IV per message**
  and **associated data** (AAD) binding the ciphertext to its context.

```js
// e2ee.mjs — identical code runs in browsers and Node 20+
const subtle = globalThis.crypto.subtle;
const enc = new TextEncoder(), dec = new TextDecoder();

export async function createIdentity() {
  // private key not extractable: it can't be exported by scripts
  const keyPair = await subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, false, ["deriveBits"]);
  const publicJwk = await subtle.exportKey("jwk", keyPair.publicKey);
  return { keyPair, publicJwk };
}

export async function deriveConversationKey(myKeyPair, theirPublicJwk, conversationId) {
  const theirKey = await subtle.importKey("jwk", theirPublicJwk, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const sharedBits = await subtle.deriveBits({ name: "ECDH", public: theirKey }, myKeyPair.privateKey, 256);
  const hkdfKey = await subtle.importKey("raw", sharedBits, "HKDF", false, ["deriveKey"]);
  return subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt: enc.encode(conversationId), info: enc.encode("chat-v1") },
    hkdfKey, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"],
  );
}

export async function encrypt(key, plaintext, aad) {
  const iv = crypto.getRandomValues(new Uint8Array(12));           // NEVER reuse an IV with the same key
  const ct = await subtle.encrypt({ name: "AES-GCM", iv, additionalData: enc.encode(aad) }, key, enc.encode(plaintext));
  return { iv, ct: new Uint8Array(ct) };                            // binary → sent as Socket.IO attachments
}

export async function decrypt(key, { iv, ct }, aad) {
  const pt = await subtle.decrypt({ name: "AES-GCM", iv, additionalData: enc.encode(aad) }, key, ct);
  return dec.decode(pt);                                            // throws if tampered with
}
```

### Server: an untrusted relay

```js
const publicKeys = new Map();   // in production: a DB table of (userId, deviceId, publicKey)

io.on("connection", (s) => {
  const user = s.data.user.id;              // from auth middleware
  s.join(`user:${user}`);
  s.on("keys:publish", (jwk, ack) => { publicKeys.set(user, jwk); ack(true); });
  s.on("keys:get", (u, ack) => ack(publicKeys.get(u) ?? null));
  s.on("e2e:send", (msg) => {
    // the server only sees the routing info and opaque bytes
    io.to(`user:${msg.to}`).emit("e2e:message", { from: user, iv: msg.iv, ct: msg.ct });
  });
});
```

### Clients

```js
const me = await createIdentity();
await socket.emitWithAck("keys:publish", me.publicJwk);

const theirKey = await socket.emitWithAck("keys:get", "bob");
const key = await deriveConversationKey(me.keyPair, theirKey, "dm:alice:bob");

// send
const { iv, ct } = await encrypt(key, "meet at 7pm 🍕", "dm:alice:bob");
socket.emit("e2e:send", { to: "bob", iv, ct });

// receive (Bob)
socket.on("e2e:message", async (m) => {
  const iv = new Uint8Array(m.iv), ct = new Uint8Array(m.ct);   // Buffers in Node, ArrayBuffers in browsers
  console.log(await decrypt(bobKey, { iv, ct }, "dm:alice:bob"));
});
```

Real output of the test run:

```
server sees: { to: 'bob', ivBytes: 12, ciphertextBytes: 32 }
bob decrypted: meet at 7pm 🍕
```

(32 bytes = 16 bytes of UTF-8 text including the emoji + 16-byte GCM authentication tag.)

### What this demo deliberately leaves out (read before shipping E2EE)

This is a **teaching example**, not a complete secure messenger. Real systems add:

1. **Key authenticity.** The server hands out public keys — a malicious server could hand
   out its own (man-in-the-middle). Real apps let users **verify safety numbers / QR
   codes**, or use key transparency logs.
2. **Forward secrecy and post-compromise security.** One static key per pair means a
   stolen private key decrypts all past messages. The **Signal protocol** (X3DH + Double
   Ratchet) rotates keys per message. Use a vetted library (e.g. libsignal) rather than
   inventing a protocol.
3. **Multiple devices** per user (a key per device; messages encrypted per device).
4. **Groups:** sender keys or MLS (Messaging Layer Security, RFC 9420) instead of
   pairwise encryption to every member.
5. **Key storage:** non-extractable `CryptoKey` objects can be stored in IndexedDB
   (structured clone) so they survive reloads without exposing raw key material.
6. **Replay protection & ordering:** include message ids/counters in the AAD.
7. **Server-side features you lose:** search, moderation, link previews and push
   notification content on the server. Plan alternatives (client-side search, generic
   push text, client-side reporting).

### Interplay with Socket.IO features

- Binary payloads use attachments (Chapter 7) — fine; with the msgpack parser they're
  inline.
- `maxHttpBufferSize` still applies to ciphertext size (encryption adds IV + 16-byte tag).
- Connection state recovery and offline outboxes work unchanged — they store opaque bytes.
- Logging: never log decrypted content on the client in production; on the server there's
  nothing to log but metadata.

---

## 21.6 Interview questions for this chapter

**Q1. [S] Socket.IO already buffers emits while offline — why build an outbox?**
The buffer is in memory: lost on reload/app kill; and it doesn't retry when an ack is lost.
An outbox persists commands with client-generated ids, retries with the same id on every
reconnect, and relies on server idempotency → at-least-once delivery, effectively-once
processing.

**Q2. [M] How does the server make retries safe?**
A unique constraint on the client-generated id (`INSERT … ON CONFLICT DO NOTHING`), and it
acks duplicates as success.

**Q3. [M] Why send outbox items one at a time?**
To preserve order and avoid flooding; stop at the first transient failure and resume
later.

**Q4. [S] What is the difference between TLS and E2EE in a Socket.IO app?**
TLS protects the hop client↔server (server sees plaintext). E2EE encrypts on the sender
device and decrypts on the recipient device; the server only relays ciphertext but still
sees metadata.

**Q5. [S] Which primitives would you use for a simple E2EE chat over Socket.IO, and what's missing for production?**
ECDH (P-256/X25519) + HKDF + AES-GCM with random IVs and AAD. Missing: key verification
(MITM by server), forward secrecy (Double Ratchet/Signal), multi-device and group key
management (sender keys/MLS), secure key storage, replay protection.

**Q6. [M] How do encrypted bytes travel through Socket.IO?**
As binary arguments (`Uint8Array`) → sent as binary attachments over WebSocket frames
(or base64 in polling); arrive as `Buffer` in Node and `ArrayBuffer` in browsers.

Next: [Chapter 22 — Complete options reference](22-complete-options-reference.md)
