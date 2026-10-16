# Chapter 20 — Other Runtimes: Electron, Web/Shared/Service Workers, Edge, Bun and Deno

> **Goal:** use Socket.IO outside the classic "browser page + Node.js server" setup.
>
> **How this chapter was checked:**
> - **Fetch transport** (for service workers): verified — a client configured with
>   `transports: [Fetch, WebSocket]` connected over fetch-based polling and exchanged acks.
> - **Bun 1.4.2** running the npm `socket.io` server: verified with a Node client (connect,
>   acks, WebSocket upgrade).
> - **Deno 2.9.6** running `npm:socket.io@4.8.4`: verified (connect, acks, upgraded to
>   WebSocket).
> - The official Deno port on `deno.land/x` could not be downloaded from this sandbox (host
>   blocked), and **Electron** could not be run here (no display) — those sections are
>   written from the libraries' and Electron's documented behaviour and are marked as such.

---

## 20.1 ELI5

The Socket.IO client is like a phone that normally lives in a web page. But you can also
put that phone in other places: in a desktop app (Electron), in a helper that runs behind
the web page (workers), or in other JavaScript engines (Bun, Deno). Each place has its own
rules — some places don't allow certain phone features, some go to sleep, some can't keep
a line open at all.

---

## 20.2 Web Workers and SharedWorkers

`socket.io-client` works inside **dedicated workers** and **shared workers** — they have
`WebSocket` and `XMLHttpRequest`.

### One connection for all tabs with a SharedWorker

Ten open tabs normally mean ten connections (ten times the server load, ten copies of
every notification). A **SharedWorker** can own a single connection and relay to tabs:

```js
// shared-socket-worker.js  (bundle socket.io-client into it, or importScripts the UMD build)
import { io } from "socket.io-client";

const socket = io("https://api.example.com", {
  transports: ["websocket"],
  auth: (cb) => cb({ token: currentToken }),
});
let currentToken = null;
const ports = new Set();

socket.onAny((event, ...args) => {
  for (const port of ports) port.postMessage({ type: "event", event, args });
});
socket.on("connect", () => broadcastStatus(true));
socket.on("disconnect", () => broadcastStatus(false));

function broadcastStatus(connected) {
  for (const port of ports) port.postMessage({ type: "status", connected });
}

onconnect = (e) => {
  const port = e.ports[0];
  ports.add(port);
  port.onmessage = async ({ data }) => {
    if (data.type === "token") { currentToken = data.token; if (!socket.connected) socket.connect(); }
    if (data.type === "emit") {
      try {
        const res = await socket.timeout(8000).emitWithAck(data.event, data.payload);
        port.postMessage({ type: "ack", requestId: data.requestId, res });
      } catch (err) {
        port.postMessage({ type: "ack", requestId: data.requestId, error: "TIMEOUT" });
      }
    }
    if (data.type === "close") ports.delete(port);   // tabs should send this on "pagehide"
  };
  port.postMessage({ type: "status", connected: socket.connected });
};
```

```js
// in each tab
const worker = new SharedWorker(new URL("./shared-socket-worker.js", import.meta.url), { type: "module" });
worker.port.start();
worker.port.postMessage({ type: "token", token: accessToken });
worker.port.onmessage = ({ data }) => { if (data.type === "event") dispatch(data.event, data.args); };
addEventListener("pagehide", () => worker.port.postMessage({ type: "close" }));
```

Caveats:
- **Browser support:** SharedWorker isn't available everywhere (notably some mobile
  browsers). Feature-detect and fall back to one socket per tab.
- Rooms on the server now represent the *browser*, not the tab; per-tab subscriptions
  must be multiplexed by the worker (reference-count subscriptions).
- An alternative without SharedWorker: **leader election** between tabs via
  `BroadcastChannel` / Web Locks API — one tab holds the socket and rebroadcasts.

---

## 20.3 Service workers and the fetch transport

Service workers have **no `XMLHttpRequest`**, so the classic polling transport can't run
there. Since `socket.io-client` 4.8, you can choose transport **implementations**,
including a polling transport based on **`fetch()`**:

```js
import { io, Fetch, WebSocket } from "socket.io-client";

const socket = io("https://api.example.com", {
  transports: [Fetch, WebSocket],   // constructors instead of names
});
```

Verified in Node 22 (which has `fetch`): with `transports: [Fetch, WebSocket]` and
`upgrade: false`, the client connected and the server reported transport `polling`;
acks worked (`transport: polling | ack: hello polling`).

`socket.io-client` 4.8 exports these implementations: `Fetch`, `XHR`, `NodeXHR`,
`WebSocket`, `NodeWebSocket`, `WebTransport`.

**But should a service worker hold a socket?** Usually no:
- Browsers **terminate idle service workers** after a short time (tens of seconds); an
  open WebSocket doesn't reliably keep one alive. A long-lived connection is not what
  service workers are for.
- For background notifications use the **Push API** (Web Push) — that's the platform's
  mechanism to wake a service worker.
- Valid uses: short-lived exchanges during `sync`/`push` event handling, or runtimes that
  lack XHR but aren't service workers.

---

## 20.4 Edge and serverless runtimes

- **Cloudflare Workers, Vercel Edge Functions, AWS Lambda:** you **cannot host a
  Socket.IO server** there — no long-running Node HTTP server, and request lifetimes are
  limited. (Cloudflare Durable Objects can hold raw WebSockets, but that's not the Socket.IO
  protocol.)
- **Clients** in edge runtimes: the fetch transport (20.3) makes short-lived client usage
  possible, but invocation time limits make it unsuitable for persistent connections.
- **Pattern:** keep Socket.IO servers on long-running infrastructure (containers/VMs), and
  have serverless functions publish through an **emitter** (Redis) or a broker
  (Chapter 8.5) — e.g. a Lambda that processes a payment publishes
  `emitter.to("user:42").emit("payment:done")`.

---

## 20.5 Electron (desktop apps)

*(Not executed in this environment — based on Electron's documented process model and
security guidance.)*

Electron apps have two kinds of processes, and you can run the Socket.IO client in either:

| Where | Pros | Cons |
|---|---|---|
| **Renderer** (a Chromium page) | Same code as your web app; DevTools Network tab shows frames | Reloading the window drops the connection; subject to the page's security settings |
| **Main process** (Node.js) | Survives window reloads/closing; one connection for many windows; can set custom headers (Node client) | You must relay events to windows via IPC |

### Renderer with secure defaults

With `contextIsolation: true`, `sandbox: true` and `nodeIntegration: false` (the
recommended settings), import `socket.io-client` in your **bundled renderer code** like in
any web app. Don't expose Node APIs to the page.

Add your API host to the Content Security Policy:

```html
<meta http-equiv="Content-Security-Policy"
      content="default-src 'self'; connect-src 'self' https://api.example.com wss://api.example.com">
```

### Main process + IPC (recommended for apps that should stay connected)

```js
// main.js
const { app, BrowserWindow, ipcMain, powerMonitor } = require("electron");
const { io } = require("socket.io-client");

let socket;
app.whenReady().then(() => {
  socket = io("https://api.example.com", {
    transports: ["websocket"],
    auth: (cb) => cb({ token: loadTokenFromSecureStorage() }),   // e.g. safeStorage / OS keychain
    extraHeaders: { "x-client": "desktop/5.2.0" },              // allowed in the Node client
  });

  // relay server events to every window
  socket.onAny((event, ...args) => {
    for (const win of BrowserWindow.getAllWindows()) win.webContents.send("rt:event", event, args);
  });

  // windows send commands through IPC; the main process applies a timeout and returns the ack
  ipcMain.handle("rt:emit", (_e, event, payload) => socket.timeout(8000).emitWithAck(event, payload));

  // laptops sleep: reconnect promptly on resume instead of waiting for back-off
  powerMonitor.on("resume", () => { if (!socket.connected) socket.connect(); });
});
```

```js
// preload.js — expose a minimal, safe API (contextBridge), never the raw socket
const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("realtime", {
  emit: (event, payload) => ipcRenderer.invoke("rt:emit", event, payload),
  on: (handler) => {
    const listener = (_e, event, args) => handler(event, args);
    ipcRenderer.on("rt:event", listener);
    return () => ipcRenderer.removeListener("rt:event", listener);   // unsubscribe
  },
});
```

Optionally allow-list event names in the preload/main process so a compromised renderer
can't emit arbitrary events.

### Origins and CORS in Electron

- Pages loaded from `file://` don't have a normal web origin. Requests from them carry an
  unusual `Origin` (an opaque/`file://`-style origin) that your `cors` allow-list won't
  match by default. **Log `req.headers.origin` on the server** to see what your build
  sends, and avoid simply allowing `"null"` (sandboxed iframes on any website also send
  `null`).
- Better options: create the socket in the **main process** (no browser CORS rules; send an
  app identifier header), or serve the UI from a **custom privileged scheme**
  (`protocol.registerSchemesAsPrivileged` with `standard`/`secure` privileges) and allow
  that exact origin.
- Authenticate with tokens, not origin alone — desktop apps can be inspected and modified
  by their users.

---

## 20.6 Bun

The npm `socket.io` server runs on Bun through its Node.js compatibility layer. Verified
with Bun 1.4.2:

```js
// bun-server.js
const { Server } = require("socket.io");
const io = new Server(4101);
io.on("connection", (s) => s.on("hi", (ack) => ack("hello from bun via " + s.conn.transport.name)));
```

```bash
bun bun-server.js
```

A Node `socket.io-client` connected and got `hello from bun via websocket` (and still
`websocket` after the upgrade window).

Notes:
- Compatibility is good for the core features shown here; test adapters (Redis), native
  add-ons (`bufferutil`) and `uWebSockets.js` separately on your Bun version.
- Bun also has its own fast native WebSocket server (`Bun.serve({ websocket })`) — that's
  plain WebSocket, not the Socket.IO protocol.

---

## 20.7 Deno

### npm `socket.io` on Deno — verified (Deno 2.9.6)

```ts
// npm-server.ts
import { Server } from "npm:socket.io@4.8.4";

const io = new Server(4500, { cors: { origin: "*" } });
io.on("connection", (s) =>
  s.on("hi", (ack: (m: string) => void) => ack("hello from Deno (npm:socket.io) via " + s.conn.transport.name)));
```

```json
// deno.json — needed when the folder also has a package.json
{ "nodeModulesDir": "auto" }
```

```bash
deno install --entrypoint npm-server.ts
deno run -A npm-server.ts     # or narrower: --allow-net --allow-env --allow-read
```

Result with a Node client: `hello from Deno (npm:socket.io) via websocket`.

The first attempt failed with *"Could not find a matching package for
'npm:socket.io@4.8.4' in the node_modules directory"* because the folder contained a
`package.json`; Deno then expects dependencies to be installed. Adding
`"nodeModulesDir": "auto"` (or running `deno install`) fixed it.

### The official Deno port

There is also an official Socket.IO server **port written for Deno** (published on
`deno.land/x/socket_io`), which plugs into Deno's HTTP server via `io.handler()`:

```ts
// not executed here — deno.land was unreachable from the test sandbox
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { Server } from "https://deno.land/x/socket_io@0.2.1/mod.ts";

const io = new Server();
io.on("connection", (socket) => { /* same API style as Node */ });
await serve(io.handler(), { port: 3000 });
```

It implements a subset of the Node server's features; check its README for what's
supported (adapters, etc.) before choosing it over `npm:socket.io`.

---

## 20.8 Node.js-only client features (for completeness)

When the client runs in Node.js (CLI tools, tests, Electron main, services):

- `extraHeaders` apply to **all** transports (browsers can't set WebSocket headers).
- TLS options: `ca`, `cert`, `key`, `pfx`, `passphrase`, `rejectUnauthorized`
  (never `false` in production), `ciphers`.
- `agent` for HTTP proxies (e.g. `https-proxy-agent`).
- `autoUnref: true` → the heartbeat timer doesn't keep the process alive.
- With `withCredentials: true`, the Node client keeps cookies between requests (this is
  what made HAProxy cookie-based stickiness work in the Chapter 23 lab).

---

## 20.9 Interview questions for this chapter

**Q1. [M] How can several browser tabs share one Socket.IO connection?**
A SharedWorker owning the socket and relaying via `MessagePort`s, or leader election
between tabs (BroadcastChannel / Web Locks). Mind browser support and per-tab
subscriptions.

**Q2. [M] Can you use Socket.IO in a service worker?**
The client can run there using the fetch-based polling transport
(`transports: [Fetch, WebSocket]`, 4.8+), but service workers are terminated when idle,
so they're unsuitable for persistent connections; use Web Push for background
notifications.

**Q3. [M] Can you host a Socket.IO server on Lambda / Cloudflare Workers / Vercel functions?**
No — they don't keep long-lived connections. Host servers on long-running infrastructure
and publish from serverless code through an emitter or broker.

**Q4. [S] Where should an Electron app hold its socket?**
Usually the main process (survives reloads, one connection, Node client features) with a
narrow IPC API exposed via `contextBridge`; or the renderer for simple apps. Use secure
renderer settings, CSP `connect-src`, and token auth (file:// pages have unusual origins).

**Q5. [M] Does `npm:socket.io` work on Bun and Deno?**
Yes for core functionality (verified: connect, acks, WebSocket upgrade on Bun 1.4.2 and
Deno 2.9.6). Test adapters and native add-ons on your exact runtime version.

Next: [Chapter 21 — Offline-first clients and end-to-end encryption](21-offline-first-and-e2ee.md)
