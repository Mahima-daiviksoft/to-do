# Chapter 36 — Browser APIs in jsdom: IndexedDB, Canvas, Files, Drag & Drop, Clipboard, Workers, WebSockets and More

> 🧸 **Explain it like I'm 5**
>
> jsdom is a **pretend browser** made of paper. It has doors and windows (the DOM), but no real
> engine: it can't really draw, measure, play sounds, or run helpers in the background. When your
> code needs those, you either bring a **toy version** (a fake/polyfill) or test that part in a
> **real browser**.

Every behaviour below was checked on **jest-environment-jsdom 30.5.2 (jsdom 26)**.

---

## 36.1 What jsdom has and doesn't have (verified)

| API | In jsdom 26? | Notes / what to do |
| --- | --- | --- |
| DOM, events, forms, `localStorage`, `document.cookie`, `history.pushState` | ✅ | |
| `customElements`, Shadow DOM | ✅ | web components mostly work |
| `WebSocket` | ✅ (real client!) | it would try to connect → inject/mock (36.9) |
| `AbortController`, `crypto.getRandomValues` | ✅ | |
| `navigator.clipboard` | ❌ by default, but **user-event** installs a stub on `setup()` | 36.6 |
| `fetch`, `Request`, `Response`, `Headers` | ❌ | Ch 9 §9.9 |
| `TextEncoder`/`TextDecoder`, `structuredClone`, `setImmediate`, `BroadcastChannel` | ❌ | polyfill in `setupFiles` |
| `matchMedia`, `IntersectionObserver`, `ResizeObserver` | ❌ | Ch 9 §9.10 |
| `crypto.subtle` | ❌ | polyfill from `node:crypto` `webcrypto` (36.10) |
| `URL.createObjectURL` | ❌ | `URL.createObjectURL = jest.fn(() => 'blob:mock')` |
| `EventSource` (SSE), `Notification` | ❌ | mock |
| `PointerEvent`, `DataTransfer` | ❌ | user-event handles pointer; build `dataTransfer` objects manually (36.5) |
| `HTMLDialogElement.showModal()` | ❌ (`undefined`) | polyfill or mock; test modal logic, E2E for real behaviour |
| `HTMLMediaElement.play()` | ⚠️ logs `Not implemented: HTMLMediaElement.prototype.play`, returns `undefined` | `jest.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue()` |
| Layout (`getBoundingClientRect`, `offsetWidth`) | ⚠️ always **0** (styles are stored, nothing is laid out) | mock values or E2E |
| `IndexedDB` | ❌ | `fake-indexeddb` (36.2) |
| `<canvas>` `getContext` | ❌ (returns null + "Not implemented") | `jest-canvas-mock` or `canvas` package (36.3) |
| Web Workers (`Worker`) | ❌ | 36.8 |
| `Blob.prototype.text()`/`File.text()` | ❌ (`file.text is not a function`) | `FileReader` works (36.4) |

Polyfill/mocks belong in a `setupFiles` file so every test gets them.

## 36.2 IndexedDB with `fake-indexeddb` (verified — with a twist)

```js
// setupFiles (jsdom)
globalThis.structuredClone ??= (v) => JSON.parse(JSON.stringify(v)); // or a proper polyfill (core-js)
require('fake-indexeddb/auto');      // installs indexedDB, IDBKeyRange, etc. on the global
```

Verified twist: in **jsdom**, `fake-indexeddb` **hangs until the test times out** unless
`structuredClone` exists (jsdom lacks it). With the polyfill (or in the `node` environment, which has
`structuredClone`) it works:

```js
function idbPut(dbName, value) {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open(dbName, 1);
    open.onupgradeneeded = () => open.result.createObjectStore('notes', { keyPath: 'id' });
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const tx = open.result.transaction('notes', 'readwrite');
      tx.objectStore('notes').put(value);
      tx.oncomplete = () => {
        const get = open.result.transaction('notes').objectStore('notes').get(value.id);
        get.onsuccess = () => { open.result.close(); resolve(get.result); };
      };
    };
  });
}

test('IndexedDB', async () => {
  await expect(idbPut('app', { id: 1, text: 'hi' })).resolves.toEqual({ id: 1, text: 'hi' });
});
```

Isolation: use a unique DB name per test, or `indexedDB = new IDBFactory()` (from
`fake-indexeddb`) in `beforeEach` to start empty. Libraries like Dexie and `idb` work on top of it.
(The simplistic JSON `structuredClone` polyfill can't clone Dates/Maps/Blobs; use `core-js`'s
`structured-clone` for fidelity.)

## 36.3 Canvas

```js
import 'jest-canvas-mock';   // or list it in setupFiles

test('draws a rectangle', () => {
  const ctx = document.createElement('canvas').getContext('2d');
  ctx.fillStyle = '#f00';
  ctx.fillRect(0, 0, 10, 10);
  expect(ctx.fillRect).toHaveBeenCalledWith(0, 0, 10, 10);              // verified
  expect(ctx.__getEvents().map((e) => e.type)).toContain('fillRect');    // jest-canvas-mock helpers
});
```

- `jest-canvas-mock`: every context method is a `jest.fn()`; also `__getDrawCalls()`, `__getEvents()`
  (snapshot-able).
- The `canvas` npm package (native Cairo) gives jsdom **real** pixel rendering — heavier, needs
  native build; useful when you must compare pixels.
- Chart libraries (Chart.js, ECharts): often better to mock the chart component (Chapter 16 §16.9)
  and test your data transformation separately.

## 36.4 Files and uploads (verified)

```js
test('upload with user-event', async () => {
  const user = userEvent.setup();
  const onFiles = jest.fn();
  render(
    <label>Upload
      <input type="file" multiple accept="image/*"
        onChange={(e) => onFiles([...e.target.files].map((f) => f.name))} />
    </label>,
  );
  await user.upload(screen.getByLabelText('Upload'), [
    new File(['a'], 'a.png', { type: 'image/png' }),
    new File(['b'], 'b.png', { type: 'image/png' }),
  ]);
  expect(onFiles).toHaveBeenCalledWith(['a.png', 'b.png']);
});
```

- `user.upload` respects `accept`: files that don't match are filtered out by default (verified:
  uploading `notes.txt` to an `accept="image/*"` input didn't fire `onChange` at all). To test what
  your validation does with wrong types, use `userEvent.setup({ applyAccept: false })`.
- Reading content: jsdom's `File`/`Blob` lack `.text()`/`.arrayBuffer()` (verified
  `TypeError: file.text is not a function`) → use `FileReader` (works), or polyfill, or run that
  logic in the node environment where `Blob.text()` exists:

```js
const text = await new Promise((res) => {
  const r = new FileReader();
  r.onload = () => res(r.result);
  r.readAsText(new File(['hello'], 'h.txt'));
});
```

- `URL.createObjectURL` for previews: mock it (`jest.fn(() => 'blob:preview')`) and
  `URL.revokeObjectURL`.

## 36.5 Drag and drop (verified)

`DataTransfer` doesn't exist in jsdom, but React reads `event.dataTransfer` from the event init:

```jsx
function DropZone({ onDrop }) {
  return (
    <div data-testid="zone"
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => { e.preventDefault(); onDrop([...e.dataTransfer.files].map((f) => f.name)); }}>
      Drop
    </div>
  );
}

test('drop files', () => {
  const onDrop = jest.fn();
  render(<DropZone onDrop={onDrop} />);
  const file = new File(['x'], 'x.csv', { type: 'text/csv' });
  fireEvent.drop(screen.getByTestId('zone'), { dataTransfer: { files: [file], types: ['Files'] } });
  expect(onDrop).toHaveBeenCalledWith(['x.csv']);
});
```

Sortable lists (dnd-kit, react-beautiful-dnd) rely on pointer/keyboard sensors and layout
(rectangles are 0 in jsdom). Test them via their **keyboard** interactions (Space, arrows, Space) or
in a real browser.

## 36.6 Clipboard (verified)

```jsx
test('copy button', async () => {
  const user = userEvent.setup();              // installs a clipboard stub on navigator
  render(<button onClick={() => navigator.clipboard.writeText('secret-code')}>Copy</button>);
  await user.click(screen.getByRole('button', { name: 'Copy' }));
  await expect(navigator.clipboard.readText()).resolves.toBe('secret-code');
});
```

Without user-event, define `navigator.clipboard` yourself with `Object.defineProperty`
(`configurable: true`) and `writeText: jest.fn()`.

## 36.7 Geolocation, permissions, online status, media

```js
test('geolocation', async () => {
  const getCurrentPosition = jest.fn((ok) => ok({ coords: { latitude: 1, longitude: 2 } }));
  Object.defineProperty(navigator, 'geolocation', { value: { getCurrentPosition }, configurable: true });
  const pos = await new Promise((res, rej) => navigator.geolocation.getCurrentPosition(res, rej));
  expect(pos.coords).toEqual({ latitude: 1, longitude: 2 });       // verified
});
```

- Online/offline: `jest.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)` then
  `window.dispatchEvent(new Event('offline'))`.
- Media: `jest.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue()`; `pause` similarly.
- `Notification`: `global.Notification = jest.fn(); Notification.permission = 'granted'; Notification.requestPermission = jest.fn().mockResolvedValue('granted')`.
- Permissions API: `navigator.permissions = { query: jest.fn().mockResolvedValue({ state: 'granted' }) }`.

## 36.8 Web Workers (verified)

`Worker` is `undefined` in jsdom. Strategy:

1. **Keep worker logic in a pure module**; the worker file is a thin `onmessage` wrapper. Test the
   pure module directly (fast, no worker at all).
2. **Inject the worker factory** into the code that creates workers; in tests pass a fake with
   `postMessage` / `onmessage` / `terminate`.
3. **Integration in the node environment** with `worker_threads` (verified):

```js
/** @jest-environment node */
const { Worker } = require('node:worker_threads');

test('real worker_threads worker', async () => {
  const w = new Worker(
    `const { parentPort } = require('node:worker_threads');
     parentPort.on('message', (m) => parentPort.postMessage(m.numbers.reduce((a, b) => a + b, 0)));`,
    { eval: true },
  );
  const result = await new Promise((resolve, reject) => {
    w.once('message', resolve);
    w.once('error', reject);
    w.postMessage({ numbers: [4, 5] });
  });
  expect(result).toBe(9);
  await w.terminate();               // or Jest won't exit
});
```

⚠️ Code inside a real worker runs **outside Jest's module system**: `jest.mock` doesn't apply there
and it isn't covered by coverage. That's why option 1 matters. Bundler-specific syntax like
`new Worker(new URL('./w.js', import.meta.url))` needs mocking (`moduleNameMapper` or injection).

## 36.9 WebSockets and Server-Sent Events

jsdom's `WebSocket` is real and would try to connect. Options:
- **Inject** a socket factory (`createSocket = (url) => new WebSocket(url)`) and pass a fake built on
  `EventTarget`/`EventEmitter` in tests; simulate `open`, `message`, `close`, `error`.
- Libraries: `mock-socket` (fake WebSocket server in-process), `jest-websocket-mock`.
- Reconnect/backoff logic: fake timers + `advanceTimersByTimeAsync` (Chapter 10).
- SSE (`EventSource` missing): inject or mock a minimal class with `onmessage`/`close()`.
- MSW also supports WebSocket interception (`ws` API) and SSE (`sse`) in recent versions.

## 36.10 Crypto, encoding, URLs

```js
// setupFiles
const { webcrypto } = require('node:crypto');
const { TextEncoder, TextDecoder } = require('node:util');
Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true }); // adds crypto.subtle
Object.assign(globalThis, { TextEncoder, TextDecoder });
```

(Check your app doesn't depend on jsdom-specific crypto behaviour before replacing it.)

## 36.11 Layout, scrolling, visibility

- `getBoundingClientRect`, `offsetWidth/Height`, `scrollHeight` are **0** (verified) — logic that
  depends on sizes (virtualised lists, tooltips positioning, "is truncated?" checks) must be fed
  values:

```js
jest.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
  x: 0, y: 0, top: 0, left: 0, bottom: 40, right: 120, width: 120, height: 40, toJSON() {},
});
Object.defineProperty(HTMLElement.prototype, 'offsetHeight', { configurable: true, value: 500 });
```

- Virtualised lists (react-window, TanStack Virtual) render 0 rows in jsdom unless sizes are
  mocked — many provide test modes or you mock the container size.
- `toBeVisible()` (jest-dom) checks CSS `display`/`visibility`/`hidden`, not real geometry.
- Real layout/visual behaviour → E2E (Chapter 39), where `boundingBox()` returns real values
  (verified: width 120 for a 120px button in Chromium).

## 36.12 Alternatives to jsdom

| Option | When |
| --- | --- |
| `happy-dom` (via `@happy-dom/jest-environment`) | faster DOM implementation, different gaps; mostly used with Vitest |
| Custom env from `@jest/environment-jsdom-abstract` | your own jsdom version/patches (📌 Jest 30) |
| `jest-fixed-jsdom` | jsdom + Node's Fetch API/streams globals (MSW-friendly) |
| Real browser (Playwright/Vitest browser mode) | layout, canvas pixels, media, workers, contrast |

## 36.13 Summary

- Know the gaps (table in 36.1) and put polyfills/mocks in `setupFiles`.
- IndexedDB: `fake-indexeddb` **plus** `structuredClone` in jsdom.
- Canvas: `jest-canvas-mock`. Files: `user.upload` + `FileReader`. Drag & drop: `fireEvent.drop`
  with a `dataTransfer` object. Clipboard: user-event's stub.
- Workers: pure logic + injection; `worker_threads` for integration (no Jest mocks inside).
- Layout is always 0 → mock or use a real browser.

**Next:** [Chapter 37 — Electron, browser extensions and CLIs](37-electron-extensions-cli.md)
