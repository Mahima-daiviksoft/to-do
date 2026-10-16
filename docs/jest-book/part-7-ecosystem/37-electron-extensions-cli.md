# Chapter 37 — Electron Apps, Browser Extensions and Command-Line Tools

> 🧸 **Explain it like I'm 5**
>
> Some apps don't live in a normal web page: desktop apps (Electron), browser add-ons (extensions),
> and programs you type into a terminal (CLIs). They each talk to a special "host" — the desktop,
> the browser, the terminal. In tests, you **pretend to be the host**, and keep your own logic in
> plain functions that are easy to check.

All examples verified on Jest 30.5.2 (4 tests).

---

## Part A — Electron

### 37.1 Architecture decides testability

An Electron app has a **main process** (Node: windows, menus, IPC, file system), **preload
scripts** (bridge via `contextBridge`), and **renderer processes** (web UI). Test each separately:

| Part | How |
| --- | --- |
| Pure logic (in any process) | plain Jest unit tests |
| Main process wiring (windows, IPC handlers) | Jest (node env) with `electron` mocked |
| Preload bridge | Jest with `contextBridge`/`ipcRenderer` mocked; assert the exposed API |
| Renderer UI | Jest + jsdom + RTL, with `window.api` (the preload bridge) faked |
| Whole app | Playwright's Electron support (`_electron.launch`) or WebdriverIO |

### 37.2 Main process with a mocked `electron` (verified)

```js
// `electron` isn't even installed in this example → { virtual: true }
jest.mock('electron', () => {
  const win = { loadFile: jest.fn(), on: jest.fn(), webContents: { send: jest.fn() } };
  return {
    app: { whenReady: jest.fn(() => Promise.resolve()), on: jest.fn(), quit: jest.fn() },
    BrowserWindow: jest.fn(() => win),
    ipcMain: { handle: jest.fn() },
    __win: win,                       // test-only handle to the fake window
  };
}, { virtual: true });

const electron = require('electron');

async function createMainWindow() {
  await electron.app.whenReady();
  const win = new electron.BrowserWindow({ width: 800, height: 600, webPreferences: { contextIsolation: true } });
  win.loadFile('index.html');
  electron.ipcMain.handle('get-version', () => '1.0.0');
  return win;
}

test('creates a secure window and registers IPC', async () => {
  await createMainWindow();
  expect(electron.BrowserWindow).toHaveBeenCalledWith(
    expect.objectContaining({ webPreferences: expect.objectContaining({ contextIsolation: true }) }),
  );
  expect(electron.__win.loadFile).toHaveBeenCalledWith('index.html');

  const [[channel, handler]] = electron.ipcMain.handle.mock.calls;  // grab the registered handler
  expect(channel).toBe('get-version');
  expect(handler()).toBe('1.0.0');                                  // and test it directly
});
```

Patterns:
- **Capture IPC handlers** from `ipcMain.handle.mock.calls` and call them with fake events.
- Security assertions are valuable: `contextIsolation: true`, `nodeIntegration: false`,
  `sandbox: true`.
- In real projects `electron` is installed (as the Electron binary package), and requiring it in
  plain Node returns a **path string**, not the API → always mock it in Jest.
- Renderer tests: `window.api = { getVersion: jest.fn().mockResolvedValue('1.0.0') }` in a setup
  file, matching what your preload exposes.

## Part B — Browser extensions (Chrome/Firefox, Manifest V3)

### 37.3 Fake the `chrome` (or `browser`) global (verified)

```js
function installChromeFake() {
  const storage = {};
  global.chrome = {
    storage: {
      local: {
        get: jest.fn(async (keys) =>
          Object.fromEntries([].concat(keys).filter((k) => k in storage).map((k) => [k, storage[k]]))),
        set: jest.fn(async (obj) => { Object.assign(storage, obj); }),
      },
    },
    runtime: { onMessage: { addListener: jest.fn() } },
  };
}

async function incrementBadge() {
  const { count = 0 } = await chrome.storage.local.get('count');
  await chrome.storage.local.set({ count: count + 1 });
  return count + 1;
}

beforeEach(installChromeFake);
afterEach(() => { delete global.chrome; });

test('increments a stored counter', async () => {
  await expect(incrementBadge()).resolves.toBe(1);
  await expect(incrementBadge()).resolves.toBe(2);
  expect(chrome.storage.local.set).toHaveBeenLastCalledWith({ count: 2 });
});
```

Notice the fake has **behaviour** (an in-memory store), not just `jest.fn()` stubs — a "fake" in
Chapter 19's terms. Ready-made fakes: `jest-chrome`, `sinon-chrome`, `webextension-polyfill` +
mocks; check they support Manifest V3 promise-based APIs.

Patterns:
- Message listeners: capture via `chrome.runtime.onMessage.addListener.mock.calls[0][0]` and call
  it with `(message, sender, sendResponse)`.
- Service worker (MV3 background): keep logic in modules; the worker file just wires events.
- Content scripts: jsdom + build the host page DOM in the test (`document.body.innerHTML = ...`).
- Full extension: Playwright with a persistent Chromium context loading the unpacked extension.

## Part C — Command-line tools

### 37.4 Two layers: unit (injected I/O) and end-to-end (spawn) (verified)

```js
// cli/greet.js
#!/usr/bin/env node
function run(argv, { stdout = process.stdout, stderr = process.stderr } = {}) {
  const name = argv[0];
  if (!name) { stderr.write('Usage: greet <name>\n'); return 1; }
  stdout.write(`Hello, ${name}!\n`);
  return 0;
}
if (require.main === module) process.exitCode = run(process.argv.slice(2));
module.exports = { run };
```

Design choices that make it testable: logic in `run()` that **returns an exit code** (never calls
`process.exit` itself), I/O streams **injected**, and the `require.main === module` guard so
importing it in tests doesn't execute it.

```js
/** @jest-environment node */
const { run } = require('./cli/greet');
const { execFileSync, spawnSync } = require('node:child_process');
const path = require('node:path');
const bin = path.join(__dirname, 'cli', 'greet.js');

test('unit: run() writes to injected streams', () => {
  const out = [];
  const err = [];
  expect(run(['Ann'], { stdout: { write: (s) => out.push(s) }, stderr: { write: (s) => err.push(s) } })).toBe(0);
  expect(out.join('')).toBe('Hello, Ann!\n');
});

test('e2e: spawn the real process', () => {
  expect(execFileSync(process.execPath, [bin, 'Bo'], { encoding: 'utf8' })).toBe('Hello, Bo!\n');
  const r = spawnSync(process.execPath, [bin], { encoding: 'utf8' });
  expect(r.status).toBe(1);
  expect(r.stderr).toMatchInlineSnapshot(`
"Usage: greet <name>
"
`);
});
```

More CLI tips:
- Use `process.execPath` (the current Node binary) instead of `'node'` — works with nvm/Windows.
- File-system effects: run in a temp dir (`fs.mkdtempSync(path.join(os.tmpdir(), 'cli-'))`), clean up
  in `afterEach`; or `memfs` for unit level.
- Colors: set `FORCE_COLOR=0`/`NO_COLOR=1` in the spawned env for stable snapshots.
- Interactive prompts (inquirer, prompts): inject the prompt function, or use the library's
  test helpers (e.g. `prompts.inject([...])`).
- `process.exit` in legacy code: `jest.spyOn(process, 'exit').mockImplementation(() => { throw ... })`
  (Chapter 9 §9.12).
- Spawned processes are outside Jest's module system: no `jest.mock`, no coverage (unless you
  collect it with `c8`/`NODE_V8_COVERAGE`).

## 37.5 Summary

- Electron: mock `electron` (virtual if not installed), capture IPC handlers, assert security
  options; E2E with Playwright's Electron mode.
- Extensions: a behavioural fake for `chrome.*`; capture listeners; Playwright for full flows.
- CLIs: pure `run(argv, io)` returning exit codes + a few spawn-based end-to-end tests.

**Next:** [Chapter 38 — Property-based, mutation and contract testing](38-property-mutation-contract.md)
