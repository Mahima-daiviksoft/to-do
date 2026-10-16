# Chapter 9 — Spies, Classes, Globals, `Date`, `fetch`, Env Vars

> 🧸 **Explain it like I'm 5**
>
> A **spy** is a tiny detective you hide inside a real thing. The real thing still works normally,
> but the detective writes down every time it's used. If you want, you can also tell the detective
> to **take over** and answer instead of the real thing. When the game is over, you take the
> detective out and everything is exactly like before (**restore**).

---

## 9.1 `jest.spyOn(object, methodName)`

```js
const calculator = {
  add: (a, b) => a + b,
};

test('spy records calls and still runs the real method', () => {
  const spy = jest.spyOn(calculator, 'add');

  expect(calculator.add(1, 2)).toBe(3);        // real implementation runs ("call-through")
  expect(spy).toHaveBeenCalledWith(1, 2);

  spy.mockRestore();                            // put the original back
});
```

Differences from `jest.fn()`:

| | `jest.fn()` | `jest.spyOn(obj, 'm')` |
| --- | --- | --- |
| Default behaviour | returns `undefined` | **calls the original** method |
| Replaces something? | no — you pass it around yourself | yes — replaces `obj.m` in place |
| `mockRestore()` | no effect on anything else | puts the original `obj.m` back |
| `restoreMocks` / `restoreAllMocks` | not affected (Jest 30) | restored |

Change the behaviour like any mock:

```js
jest.spyOn(Math, 'random').mockReturnValue(0.42);
jest.spyOn(api, 'getUser').mockResolvedValue({ id: 1 });
jest.spyOn(console, 'error').mockImplementation(() => {});   // silence
```

### Error messages you'll see (verified, Jest 30.5)

| Code | Error |
| --- | --- |
| `jest.spyOn({}, 'nope')` | `Property 'nope' does not exist in the provided object` |
| `jest.spyOn({ a: 1 }, 'a')` | `Cannot spy on the 'a' property because it is not a function; number given instead. If you are trying to mock a property, use 'jest.replaceProperty(object, 'a', value)' instead.` |
| spying on a re-exported ESM binding | `Cannot redefine property: fetchRates` (see 9.3) |
| `jest.spyOn(window, 'location', 'get')` in jsdom | `Property 'location' is not declared configurable` |

## 9.2 Getters and setters

```js
const settings = {
  get theme() { return 'light'; },
  set theme(v) { /* ... */ },
};

jest.spyOn(settings, 'theme', 'get').mockReturnValue('dark');
expect(settings.theme).toBe('dark');

const setSpy = jest.spyOn(settings, 'theme', 'set');
settings.theme = 'blue';
expect(setSpy).toHaveBeenCalledWith('blue');
```

The third argument (`'get'` or `'set'`) selects the accessor.

## 9.3 🔍 Why my spy isn't being called (the most common spy bug)

A spy replaces **a property on an object**. It only intercepts calls that go **through that
object property**. Calls that use a different reference are not intercepted.

### Case 1 — internal calls in the same module (verified)

```js
// lib.js
export function fetchRates() { return 'real rates'; }
export function convert() { return fetchRates(); }   // calls the LOCAL binding
```

```js
import * as lib from './lib';

const spy = jest.spyOn(lib, 'fetchRates').mockReturnValue('fake');
lib.fetchRates(); // 'fake'        ✅ goes through the exports object
lib.convert();    // 'real rates'  ❌ convert calls its local fetchRates directly
```

Fixes (best first):
1. Move `fetchRates` to its own module and mock that module.
2. Inject it (`convert(fetchRatesFn = fetchRates)`).
3. Call through the exports object inside the module (`exports.fetchRates()` /
   `import * as self from './lib'`): it works but is ugly.

### Case 2 — the consumer destructured the function before you spied

```js
// app.js
const { getUser } = require('./api');      // copies the reference at import time
module.exports = () => getUser(1);
```

`jest.spyOn(api, 'getUser')` after `app.js` loaded doesn't affect `app.js`'s copy. With Babel-compiled
ESM it usually *does* work, because Babel compiles `import { getUser } from './api'` to
`_api.getUser(...)` (a live property lookup on every call). With plain CommonJS destructuring it
doesn't. Use `jest.mock('./api')` instead.

### Case 3 — barrel files / re-exports (verified)

```js
// index.js
export * from './lib';     // or: export { fetchRates } from './lib';
```

```js
import * as barrel from './index';
jest.spyOn(barrel, 'fetchRates');   // ❌ TypeError: Cannot redefine property: fetchRates
```

Re-exports are compiled to **non-configurable getters**, so they can't be replaced. Spy on the
source module (`./lib`), or use `jest.mock` for it. The same error appears with TypeScript output
that uses getters for exports.

### Case 4 — native ESM

ES module namespace objects are frozen: `jest.spyOn` can't patch exports. Use
`jest.unstable_mockModule` (Chapter 8).

## 9.4 `jest.replaceProperty(object, key, value)` — non-function properties

```js
const config = { featureX: false, retries: 3 };

test('feature on', () => {
  jest.replaceProperty(config, 'featureX', true);
  expect(isFeatureEnabled()).toBe(true);
});
// restored by jest.restoreAllMocks() / restoreMocks: true, or replaced.restore()
```

- Returns a `Replaced` object with `.replaceValue(v)` and `.restore()`.
- The property **must already exist** (verified: `Property 'nope' does not exist in the provided object`).
- Must not be a function (use `spyOn` for functions).

## 9.5 Mocking ES6 classes — four ways

Example code under test:

```js
// soundPlayer.js
export default class SoundPlayer {
  constructor() { this.foo = 'bar'; }
  playSoundFile(fileName) { console.log('Playing sound file ' + fileName); }
}
```

```js
// soundPlayerConsumer.js
import SoundPlayer from './soundPlayer';
export default class SoundPlayerConsumer {
  constructor() { this.soundPlayer = new SoundPlayer(); }
  playSomethingCool() { this.soundPlayer.playSoundFile('song.mp3'); }
}
```

### Way 1 — automock

```js
import SoundPlayer from './soundPlayer';
import SoundPlayerConsumer from './soundPlayerConsumer';
jest.mock('./soundPlayer');   // class → mock constructor, methods → jest.fn()

test('consumer calls playSoundFile', () => {
  const consumer = new SoundPlayerConsumer();
  consumer.playSomethingCool();

  expect(SoundPlayer).toHaveBeenCalledTimes(1);                 // constructor called
  const instance = SoundPlayer.mock.instances[0];
  expect(instance.playSoundFile).toHaveBeenCalledWith('song.mp3');
});
```

All instances share the same prototype mock methods, so you can also assert
`SoundPlayer.prototype.playSoundFile`.

### Way 2 — factory returning a mock constructor

```js
const mockPlaySoundFile = jest.fn();
jest.mock('./soundPlayer', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    playSoundFile: mockPlaySoundFile,          // lazy use of mock-prefixed var: OK
  })),
}));
```

⚠️ The class mock must be a **function** (or a real `class`) because the code calls it with `new`.
`jest.fn().mockImplementation(() => obj)` works because a constructor that returns an object makes
`new` return that object. An **arrow function** cannot be used with `new`:

```js
default: () => ({ playSoundFile })    // ❌ TypeError: ... is not a constructor
```

### Way 3 — manual mock in `__mocks__/soundPlayer.js`

```js
// __mocks__/soundPlayer.js
export const mockPlaySoundFile = jest.fn();
const mock = jest.fn().mockImplementation(() => ({ playSoundFile: mockPlaySoundFile }));
export default mock;
```

```js
import SoundPlayer, { mockPlaySoundFile } from './soundPlayer';
jest.mock('./soundPlayer');
```

### Way 4 — spy on the prototype (keep the real class)

```js
import SoundPlayer from './soundPlayer';

test('spies on one method', () => {
  const spy = jest.spyOn(SoundPlayer.prototype, 'playSoundFile').mockImplementation(() => {});
  new SoundPlayerConsumer().playSomethingCool();
  expect(spy).toHaveBeenCalledWith('song.mp3');
});
```

⚠️ Class fields that are **arrow functions** (`handleClick = () => {}`) live on the **instance**, not
the prototype, so you can't spy on them via `prototype`. Spy on the instance after creating it, or
convert to a method.

### Static methods

```js
jest.spyOn(UserModel, 'findById').mockResolvedValue({ id: 1 });
```

## 9.6 Console: silence and assert

```js
let errorSpy;
beforeEach(() => {
  errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  errorSpy.mockRestore();
});

test('logs a helpful error for invalid input', () => {
  parse('###');
  expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('invalid input'));
});
```

💼 **Organisational pattern — fail on unexpected console errors.** React warnings ("act(...)", key
warnings, prop-type errors) often hide real bugs. Many teams add to `setupFilesAfterEnv`:

```js
// jest.setup.js
const originalError = console.error;
beforeEach(() => {
  jest.spyOn(console, 'error').mockImplementation((...args) => {
    originalError(...args);
    throw new Error('console.error was called — fix the warning or mock console.error in this test');
  });
});
```

(Or use the `jest-fail-on-console` package.) Tests that *expect* an error mock `console.error`
themselves.

## 9.7 Time: `Date`, `Date.now`, `performance.now`

Options:

1. ✅ **Fake timers with a system time** (Chapter 10):
   ```js
   jest.useFakeTimers();
   jest.setSystemTime(new Date('2024-02-29T12:00:00Z'));
   expect(new Date().toISOString()).toBe('2024-02-29T12:00:00.000Z');   // verified
   ```
   This mocks `Date`, `Date.now()`, `new Date()`, and (by default) `performance.now()` and timers.
   If you only want the date frozen but real timers, use
   `jest.useFakeTimers({ doNotFake: ['setTimeout', 'setInterval', 'setImmediate', 'nextTick', 'queueMicrotask'] })`
   or `{ advanceTimers: true }` so time still flows.
2. Spy on `Date.now` only:
   ```js
   jest.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000);
   ```
   ⚠️ `new Date()` is **not** affected by this — only `Date.now()`.
3. ✅ Inject a clock (`clock = () => new Date()` parameter) — no global mocking needed.

⚠️ Time zones: `new Date('2024-01-01').getDate()` depends on the machine's TZ. Fix the zone for the
whole run: `TZ=UTC jest` (put it in the npm script, e.g. `"test": "TZ=UTC jest"`, or use
`cross-env` on Windows), or set `process.env.TZ = 'UTC'` in **`globalSetup`** (it must be set
before Node first uses the time zone).

## 9.8 Randomness

```js
jest.spyOn(Math, 'random').mockReturnValue(0.5);
jest.spyOn(crypto, 'randomUUID').mockReturnValue('11111111-1111-4111-8111-111111111111');
```

Or mock the library (`uuid`, `nanoid`) with a factory, or inject a random source. For seeded
pseudo-randomness, `jest.getSeed()` gives the run's seed (`--seed=<n>` to fix it).

## 9.9 `fetch` and HTTP

Node 18+ has a global `fetch`, so in the **`node` test environment** `fetch` exists. In the
**`jsdom` environment** it does **not** (verified on jest-environment-jsdom 30: `fetch`, `Response`,
`Request`, `Headers` are all `undefined`).

### Option A — mock global fetch directly

```js
beforeEach(() => {
  global.fetch = jest.fn();       // or jest.spyOn(global, 'fetch') when it exists
});

test('loads users', async () => {
  fetch.mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => [{ id: 1, name: 'Ann' }],
  });

  await expect(loadUsers()).resolves.toEqual([{ id: 1, name: 'Ann' }]);
  expect(fetch).toHaveBeenCalledWith('/api/users', expect.objectContaining({ method: 'GET' }));
});

test('handles HTTP 500', async () => {
  fetch.mockResolvedValue({ ok: false, status: 500, json: async () => ({}) });
  await expect(loadUsers()).rejects.toThrow('HTTP 500');
});

test('handles network failure', async () => {
  fetch.mockRejectedValue(new TypeError('Failed to fetch'));
  await expect(loadUsers()).rejects.toThrow('Failed to fetch');
});
```

If you assign `global.fetch = jest.fn()`, also restore it (save the original in `beforeAll` and
put it back in `afterAll`), or use `jest.spyOn(global, 'fetch')` so `restoreMocks` handles it.

### Option B — Mock Service Worker (MSW) ✅ recommended for apps

MSW intercepts requests at the network layer; your code's real `fetch`/axios runs:

```js
// test/server.js
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';

export const server = setupServer(
  http.get('/api/users', () => HttpResponse.json([{ id: 1, name: 'Ann' }])),
);
```

```js
// jest.setup.js (setupFilesAfterEnv)
import { server } from './test/server';
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
```

```js
// per-test override
import { http, HttpResponse } from 'msw';
import { server } from '../test/server';

test('shows error on 500', async () => {
  server.use(http.get('/api/users', () => new HttpResponse(null, { status: 500 })));
  // ...
});
```

Note: MSW 2 and 3 (same `http`/`HttpResponse`/`setupServer` API; MSW 3 needs Node ≥ 22.12) in the **jsdom** environment need the Fetch API globals (`fetch`, `Request`, `Response`,
`TextEncoder`, streams…) which jsdom lacks. The MSW docs recommend a custom environment
(e.g. `jest-fixed-jsdom`) or polyfills via `setupFiles`. (Relative URLs like `/api/users` also need a
base URL; jsdom's default is `http://localhost/`.)

## 9.10 Browser APIs missing in jsdom (verified list)

In `jest-environment-jsdom` 30 these are **undefined**: `fetch`, `Request`, `Response`,
`TextEncoder`/`TextDecoder`, `structuredClone`, `matchMedia`, `IntersectionObserver`,
`ResizeObserver`, `BroadcastChannel`, `setImmediate`. `window.scrollTo` exists but logs
`Error: Not implemented: window.scrollTo`. Navigation (setting `location.href` to another page) logs
`Error: Not implemented: navigation (except hash changes)`.

Polyfill/mocks in a `setupFiles` file:

```js
// test/jsdom-polyfills.js  (setupFiles)
const { TextEncoder, TextDecoder } = require('node:util');
Object.assign(global, { TextEncoder, TextDecoder });

if (!global.structuredClone) {
  global.structuredClone = (v) => JSON.parse(JSON.stringify(v)); // simplistic; or use core-js
}

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: jest.fn().mockImplementation((query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: jest.fn(),       // deprecated API, still used by some libs
    removeListener: jest.fn(),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn(),
  })),
});

class MockObserver {
  constructor(cb) { this.cb = cb; }
  observe = jest.fn();
  unobserve = jest.fn();
  disconnect = jest.fn();
  takeRecords = jest.fn(() => []);
}
global.IntersectionObserver = MockObserver;
global.ResizeObserver = MockObserver;

window.scrollTo = jest.fn();
```

### `localStorage` / `sessionStorage`

jsdom implements them (verified `typeof localStorage === 'object'`). Clear between tests:

```js
afterEach(() => localStorage.clear());
```

To spy: `jest.spyOn(Storage.prototype, 'setItem')` (spying on `localStorage.setItem` directly may
not work because the methods live on `Storage.prototype`).

### `window.location` (📌 changed with jsdom 21+ / Jest 30)

Old trick (no longer works):

```js
delete window.location;                    // silently does nothing now (verified)
window.location = { href: '', assign: jest.fn() };
```

`location` is non-configurable on the jsdom window, so `delete` doesn't remove it and
`jest.spyOn(window, 'location', 'get')` throws. What to do instead:

- Change the URL in a test: `window.history.pushState({}, '', '/products?id=3')` (verified: updates
  `location.pathname`/`search`).
- Set the starting URL: `testEnvironmentOptions: { url: 'https://app.example.com/' }` or a
  `@jest-environment-options {"url": "..."}` docblock.
- Assert redirects: wrap navigation in your own tiny module (`navigation.redirect(url)`) and mock that
  module. ✅ This is the most robust approach.
- If you must, build a custom environment from `@jest/environment-jsdom-abstract`, or apply the jsdom
  patch linked from the Jest 30 release notes.

## 9.11 Environment variables

Save and restore the whole object:

```js
const ORIGINAL_ENV = process.env;

beforeEach(() => {
  process.env = { ...ORIGINAL_ENV };    // fresh copy per test
});
afterAll(() => {
  process.env = ORIGINAL_ENV;
});

test('uses the API URL from env', () => {
  process.env.API_URL = 'https://staging.example.com';
  expect(getApiUrl()).toBe('https://staging.example.com');
});
```

For existing variables, `jest.replaceProperty(process.env, 'NODE_ENV', 'production')` works and is
auto-restored. ⚠️ It **throws for variables that don't exist yet** (verified), so set those directly.

⚠️ If a module reads `process.env` **at import time** (`const URL = process.env.API_URL` at the top
level), changing the env in a test after the import has no effect. Re-import it with
`jest.isolateModules` / `jest.resetModules` (Chapter 8), or better: read env lazily inside a function.

## 9.12 `process.exit`, `process.on`, child processes

```js
test('exits with code 1 on fatal error', () => {
  const exitSpy = jest.spyOn(process, 'exit').mockImplementation(() => {
    throw new Error('process.exit called');   // stop execution like a real exit would
  });
  expect(() => runCli(['--bad'])).toThrow('process.exit called');
  expect(exitSpy).toHaveBeenCalledWith(1);
});
```

Never let code under test really call `process.exit` — it kills the worker and Jest reports a
confusing crash.

Mock `child_process`:

```js
jest.mock('node:child_process', () => ({
  execSync: jest.fn(() => Buffer.from('v1.2.3\n')),
}));
```

## 9.13 Global variables your code expects

```js
// jest.config.js
module.exports = {
  globals: { __DEV__: true, APP_VERSION: '1.0.0' },  // must be JSON-serializable
};
```

Or set them in a `setupFiles` file: `globalThis.__DEV__ = true;`.

## 9.14 Summary

- `spyOn` wraps a real method in place; calls through by default; `mockRestore` puts it back.
- Spies only see calls through the patched object property: watch for internal calls,
  destructuring, barrels (`Cannot redefine property`), native ESM.
- `replaceProperty` for non-function values (must already exist).
- Classes: automock, factory with `mockImplementation`, manual mock, or prototype spy; never an
  arrow function as a constructor.
- Time via fake timers/`setSystemTime`; randomness via spies; HTTP via `fetch` mock or MSW.
- jsdom lacks many browser APIs; polyfill them in `setupFiles`. `window.location` can't be deleted
  any more; use `history.pushState`, environment options, or a navigation wrapper.
- Env vars: copy/restore `process.env`, beware import-time reads.

**Next:** [Chapter 10 — Fake timers](10-fake-timers.md)
