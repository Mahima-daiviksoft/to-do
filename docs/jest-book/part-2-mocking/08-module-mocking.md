# Chapter 8 — Module Mocking (`jest.mock`, `__mocks__`, Hoisting, ESM)

> 🧸 **Explain it like I'm 5**
>
> Your code says "give me the **weather machine**" (`import { getWeather } from './weather'`).
> In a test, you don't want the real weather machine (it's slow and the weather keeps changing!).
> `jest.mock('./weather')` is like telling the toy shop: **"whenever anyone in this test asks for
> the weather machine, give them a pretend one instead."** Everyone who asks — your code, its
> helpers — gets the pretend one, and you decide what it says ("sunny, 25°C").

---

## 8.1 How Jest loads modules (🔍 needed to understand mocking)

Jest does **not** use Node's own `require`. It has its own module system (`jest-runtime`):

- Each test file gets its own **module registry** (a cache: path → exports).
- When code calls `require('./weather')` (or an `import` that Babel turned into `require`), Jest's
  `requireModuleOrMock` first checks: **"Is there a mock registered for this path?"**
  - yes → return the mock (from a factory, a `__mocks__` file, or an automock),
  - no → load the real file, transform it, run it, cache it.
- Mocks are registered by **resolved path**, so `jest.mock('./weather')` in the test affects
  `require('../utils/weather')` inside `src/app.js` as long as both resolve to the same file.

That's why `jest.mock` must be registered **before** the module is first required, and why Babel
**hoists** `jest.mock` calls to the top of the file.

## 8.2 The three ways to mock a module

```js
// 1. Automock: Jest generates a mock with the same shape
jest.mock('./weather');

// 2. Factory: you write the mock
jest.mock('./weather', () => ({
  getWeather: jest.fn(() => ({ sky: 'sunny', temp: 25 })),
}));

// 3. Manual mock: a file in a __mocks__ folder next to the module
//    src/__mocks__/weather.js  + jest.mock('./weather') in the test
```

### 8.2.1 Automock — what Jest generates (verified)

Given:

```js
// thing.js
export const NUM = 42;
export const LIST = [1, 2];
export const CONF = { nested: { fn() { return 1; }, val: 'x' } };
export function hello() { return 'hello'; }
export class Svc { constructor() { this.x = 1; } go() { return 'go'; } static make() {} }
export default function main() { return 'main'; }
```

`jest.mock('./thing')` produces:

| Original | Automocked |
| --- | --- |
| function `hello` | `jest.fn()` → returns `undefined` |
| default export function | `jest.fn()` → `undefined` |
| class `Svc` | mock constructor; **constructor body does not run** (`new Svc().x` is `undefined`); prototype methods are `jest.fn()` returning `undefined`; static methods mocked too |
| number/string/boolean `NUM` | **kept as is** (`42`) |
| array `LIST` | **empty array** `[]` |
| object `CONF` | new object, same keys, recursively automocked (functions → mocks, primitives kept) |

Jest does this by **actually loading the real module** to read its shape (`moduleMocker.getMetadata`)
and then generating a mock from that metadata. So the real module's top-level code **does run**
during automocking. (If that top-level code has side effects — connecting to a DB at import time
— prefer a factory.)

You program automocked functions afterwards:

```js
import { getWeather } from './weather';
jest.mock('./weather');

test('shows sunny', () => {
  jest.mocked(getWeather).mockReturnValue({ sky: 'sunny', temp: 25 });
  expect(renderForecast()).toContain('☀️');
});
```

### 8.2.2 Factory mocks

```js
jest.mock('./weather', () => ({
  getWeather: jest.fn(),
  UNITS: 'metric',
}));
```

- The factory **replaces the whole module**. Anything you don't return doesn't exist
  (→ `undefined` / "is not a function" errors).
- The factory runs **lazily**, when the module is first required.
- `jest.fn()` created inside the factory are shared by every importer in that test file.

#### ⚠️ Default exports need `__esModule: true` (verified)

When your code uses `import main from './thing'` (transpiled by Babel), a factory that returns
`{ default: fn }` **without** `__esModule: true` makes `main` equal to the whole object
`{ default: [Function] }`, so calling `main()` throws `main is not a function`.

```js
jest.mock('./thing', () => ({
  __esModule: true,              // ✅ tells Babel's interop "this is an ES module"
  default: jest.fn(() => 'mocked default'),
  namedExport: jest.fn(),
}));
```

🔍 Why: Babel compiles `import main from 'x'` into `_interopRequireDefault(require('x')).default`.
That helper uses `obj.default` only if `obj.__esModule` is true; otherwise it wraps the whole object
as the default.

With TypeScript compiled by `ts-jest` with `esModuleInterop`, the same rule applies.

### 8.2.3 Partial mocks — keep most of the real module

```js
jest.mock('./utils', () => {
  const actual = jest.requireActual('./utils');
  return {
    __esModule: true,
    ...actual,
    fetchRates: jest.fn().mockResolvedValue({ USD: 1, EUR: 0.9 }), // only this one is fake
  };
});
```

`jest.requireActual(path)` returns the real module, bypassing mocks.

⚠️ Partial mocks **don't affect internal calls inside the module**: if `utils.convert()` calls
`fetchRates()` directly (same file), it calls the **real** one, because it references its local
binding, not the module's exports object. Fixes: move `fetchRates` to its own module, or inject it.
(See also Chapter 9 §9.3.)

## 8.3 Hoisting — the magic and its rules (🎯 very common interview topic)

`babel-plugin-jest-hoist` (included in `babel-jest` via `babel-preset-jest`) moves these calls
**above the imports**:

`jest.mock`, `jest.unmock`, `jest.enableAutomock`, `jest.disableAutomock`, `jest.deepUnmock`.

So this:

```js
import { getWeather } from './weather';
jest.mock('./weather');
```

becomes roughly:

```js
jest.mock('./weather');                       // hoisted
const { getWeather } = require('./weather');  // now receives the mock
```

### Rule: the factory can't use outside variables… mostly

Because the factory is hoisted above your variable declarations, using normal variables from the
file would hit "not initialized yet". The Babel plugin therefore **checks** the factory and throws at
compile time (verified Jest 30.5 message):

```js
import { add } from './math';
const fake = jest.fn(() => 1);
jest.mock('./math', () => ({ add: fake }));   // ❌
```

```
ReferenceError: The module factory of `jest.mock()` is not allowed to reference any out-of-scope variables.
Invalid variable access: fake
Allowed objects: AbortController, ..., jest, expect, require, ...
Note: This is a precaution to guard against uninitialized mock variables. If it is ensured that the
mock is required lazily, variable names prefixed with `mock` (case insensitive) are permitted.
```

What **is** allowed inside a factory (verified against the plugin source):

1. Globals: `Array`, `Object`, `Promise`, `Date`, `JSON`, `Math`, `console`, `process`,
   `jest`, `expect`, `require`, `module`, etc. (everything on `globalThis`).
2. Variables whose name starts with **`mock`** (case-insensitive): `mockFetch`, `MockClient`.
   These are **not** hoisted, so they're only safe if used **lazily** (inside a function that runs
   later).
3. **`const`/never-reassigned variables initialised with a pure literal value** — e.g.
   `const ANSWER = 42;` or `const label = 'x';`. Newer versions of the plugin hoist these
   declarations together with the `jest.mock` call. (A call like `jest.fn()` is **not** pure, so
   it isn't allowed — that's the `fake` example above.)
4. `jest` imported from `@jest/globals`.

### The `mock` prefix + TDZ trap (verified)

```js
import { add } from './math';
const mockValue = 'v';
jest.mock('./math', () => {
  const r = mockValue;                        // ❌ used EAGERLY when the factory runs
  return { add: jest.fn(() => r) };
});
// ReferenceError: Cannot access 'mockValue' before initialization
```

The factory runs when `./math` is first imported — which is at the (hoisted) import, **before**
`const mockValue` runs. Use it lazily instead:

```js
const mockAdd = jest.fn();
jest.mock('./math', () => ({
  add: (...args) => mockAdd(...args),         // ✅ mockAdd read only when add() is called
}));
```

✅ The cleanest pattern avoids all of this: define `jest.fn()` **inside** the factory and grab it
from the import:

```js
import { add } from './math';
jest.mock('./math', () => ({ add: jest.fn() }));

beforeEach(() => {
  jest.mocked(add).mockReturnValue(3);
});
```

### Hoisting and TypeScript/ts-jest

`ts-jest` performs the same hoisting itself (it has a hoisting transformer). SWC (`@swc/jest`) also
hoists `jest.mock`. With **native ESM** there is no hoisting (see 8.10).

## 8.4 Manual mocks: the `__mocks__` folder

### For your own modules

```
src/
  services/
    weather.js
    __mocks__/
      weather.js      ← manual mock
```

```js
// src/services/__mocks__/weather.js
export const getWeather = jest.fn(() => Promise.resolve({ sky: 'sunny', temp: 25 }));
```

```js
// some.test.js
import { getWeather } from '../services/weather';
jest.mock('../services/weather');   // ← REQUIRED for user modules: picks up __mocks__/weather.js
```

Verified: **without** the `jest.mock()` call, the real user module is used, even though a manual mock
exists.

### For `node_modules` packages

Put the mock in a `__mocks__` folder **adjacent to `node_modules`** (in a folder listed in `roots`,
by default the project root):

```
project/
  __mocks__/
    axios.js
    @aws-sdk/
      client-s3.js     ← scoped package: __mocks__/@scope/name.js
  node_modules/
  src/
```

Verified: node_modules manual mocks are applied **automatically** — no `jest.mock('axios')` needed.
(To use the real one in a specific test: `jest.unmock('axios')` or `jest.requireActual`.)

⚠️ If you set `roots: ['<rootDir>/src']`, a root-level `__mocks__` folder is **not** found. Put it
inside a root or add the folder to `roots`.

### For Node core modules (`fs`, `path`, `child_process`)

A `__mocks__/fs.js` next to `node_modules` is **not** applied automatically. You must call
`jest.mock('fs')` explicitly (core modules are never auto-mocked).

```js
// __mocks__/fs.js — a tiny in-memory fs
const fs = jest.createMockFromModule('fs');
let files = {};
fs.__setFiles = (f) => { files = f; };
fs.readFileSync = jest.fn((p) => {
  if (!(p in files)) throw Object.assign(new Error(`ENOENT: ${p}`), { code: 'ENOENT' });
  return files[p];
});
module.exports = fs;
```

```js
jest.mock('fs');
const fs = require('fs');

beforeEach(() => fs.__setFiles({ '/config.json': '{"debug":true}' }));
test('reads config', () => {
  expect(loadConfig('/config.json')).toEqual({ debug: true });
});
```

(For real projects, `memfs` is a popular in-memory `fs` implementation.)

### `jest.createMockFromModule(name)`

Returns an automocked version of a module **without registering it** — handy inside manual mocks
to start from the automock and override a few things. 📌 The old name
`jest.genMockFromModule` was **removed in Jest 30**.

### Manual mock rules & pitfalls

- The manual mock file must have the **same name** as the module.
- Duplicate manual mock names in different folders produce a warning:
  `duplicate manual mock found: weather` — the haste map can't tell which one to use. Rename one or
  narrow `roots`/`modulePathIgnorePatterns`.
- When a manual mock exists **and** you pass a factory to `jest.mock`, the factory wins.
- Manual mocks are shared by all tests that use them — keep them simple and resettable.

## 8.5 Changing a mock per test

### Option A — module-level mock, per-test behaviour (✅ most common)

```js
import { getWeather } from './weather';
jest.mock('./weather');

test('sunny', async () => {
  jest.mocked(getWeather).mockResolvedValue({ sky: 'sunny' });
  expect(await forecastText()).toBe('Go outside!');
});

test('rainy', async () => {
  jest.mocked(getWeather).mockResolvedValue({ sky: 'rain' });
  expect(await forecastText()).toBe('Take an umbrella');
});
```

### Option B — `jest.doMock` + `jest.resetModules` (different module shape per test)

`jest.doMock` is **not hoisted**, so it can use variables, but it only affects modules required
**after** it. Combine with `resetModules` and `require` inside the test:

```js
beforeEach(() => {
  jest.resetModules();               // empty the module registry
});

test('feature flag ON', () => {
  jest.doMock('./flags', () => ({ newCheckout: true }));
  const { checkoutVersion } = require('./checkout');   // loaded fresh, sees the mock
  expect(checkoutVersion()).toBe(2);
});

test('feature flag OFF', () => {
  jest.doMock('./flags', () => ({ newCheckout: false }));
  const { checkoutVersion } = require('./checkout');
  expect(checkoutVersion()).toBe(1);
});
```

`jest.dontMock(name)` is the non-hoisted counterpart of `jest.unmock`.

### Option C — `jest.isolateModules(fn)` / `jest.isolateModulesAsync(fn)`

Creates a **temporary, separate registry** for the code inside the callback:

```js
test('module reads env at import time', () => {
  process.env.MODE = 'test-a';
  let config;
  jest.isolateModules(() => {
    config = require('./config');   // fresh copy, unaffected by earlier requires
  });
  expect(config.mode).toBe('test-a');
});

test('async variant', async () => {
  await jest.isolateModulesAsync(async () => {
    const { init } = await import('./config');
    // ...
  });
});
```

## 8.6 Module state & singletons

Because a module is evaluated **once per test file**, module-level state survives between tests:

```js
// counter.js
let count = 0;
export const increment = () => ++count;
```

```js
import { increment } from './counter';
test('a', () => expect(increment()).toBe(1));
test('b', () => expect(increment()).toBe(1));   // ❌ gets 2
```

Fixes: export a `reset()` for tests; restructure as a factory/class; or `jest.resetModules()` +
re-`require` in `beforeEach`; or config `resetModules: true` (resets the registry before each
test — ⚠️ then **top-level imports in the test file** still hold the *old* instances; you must
`require` inside tests).

⚠️ `jest.resetModules()` + React: re-requiring `react` gives a **second copy** of React; components
from the old copy + hooks from the new copy → "Invalid hook call". Re-require everything together
inside `isolateModules`, or avoid resetting modules for React code.

## 8.7 Other module-mocking APIs (complete list)

| API | Hoisted? | Purpose |
| --- | --- | --- |
| `jest.mock(name, factory?, options?)` | ✅ | register a mock (automock / factory / manual) |
| `jest.unmock(name)` | ✅ | always use the real module (e.g. undo automock / node_modules manual mock) |
| `jest.deepUnmock(name)` | ✅ | real module **and** its dependencies |
| `jest.doMock(name, factory?, options?)` | ❌ | like `mock`, not hoisted |
| `jest.dontMock(name)` | ❌ | like `unmock`, not hoisted |
| `jest.setMock(name, exports)` | ❌ | set the mock to a given object (prefer `jest.mock` with a factory) |
| `jest.requireActual(name)` | — | load the real module |
| `jest.requireMock(name)` | — | load the mock (even if the module isn't mocked) |
| `jest.createMockFromModule(name)` | — | build an automock object without registering it |
| `jest.resetModules()` | — | clear the registry |
| `jest.isolateModules(fn)` / `isolateModulesAsync(fn)` | — | sandboxed registry for a callback |
| `jest.enableAutomock()` / `disableAutomock()` | ✅ | turn automocking on/off for the file |
| `jest.onGenerateMock(cb)` | — | 📌 Jest 30: tweak every automock as it's generated |
| `jest.unstable_mockModule(name, factory)` | ❌ | ESM mocking (8.10) |
| `jest.unstable_unmockModule(name)` | ❌ | 📌 Jest 30: ESM unmock |
| `jest.mocked(source, options?)` | — | TypeScript helper: types `source` as mocked |

### Virtual mocks — modules that don't exist

```js
jest.mock('../config/generated-at-build-time', () => ({ version: '1.0.0' }), { virtual: true });
```

Useful for modules generated during build, or aliases that only exist in the bundler.

### `automock: true` (config) — mock everything

Every module is automocked except `node_modules` paths listed in `unmockedModulePathPatterns` and
core modules. Rarely used today (it was Facebook's original default, removed as the default in Jest
15). It makes tests over-mocked and brittle; prefer explicit mocks.

## 8.8 Mocking non-JS imports: CSS, images, SVG — `moduleNameMapper`

Your app (via webpack/Vite) can import CSS and images; Node can't. Map them to stubs:

```js
// jest.config.js
module.exports = {
  moduleNameMapper: {
    '\\.(css|less|scss|sass)$': 'identity-obj-proxy',   // className lookups return the key
    '\\.(png|jpg|jpeg|gif|webp|svg)$': '<rootDir>/test/__mocks__/fileMock.js',
    '^@/(.*)$': '<rootDir>/src/$1',                       // path alias "@/utils" → src/utils
  },
};
```

```js
// test/__mocks__/fileMock.js
module.exports = 'test-file-stub';
```

- Keys are **regexes** matched against the import specifier; values are paths (with `$1` capture
  groups and `<rootDir>`). Array values try several paths in order.
- Order matters: first match wins — put specific patterns before generic ones.
- `identity-obj-proxy` makes `styles.button === 'button'`, handy for snapshots and class assertions.
- For SVG-as-React-component imports, map to a small component stub.

💼 Keep `moduleNameMapper` path aliases in sync with `tsconfig.json` `paths` (ts-jest provides
`pathsToModuleNameMapper` to generate them).

## 8.9 Mocking third-party libraries — real examples

### axios

```js
import axios from 'axios';
import { getUser } from './api';
jest.mock('axios');

test('getUser returns data', async () => {
  jest.mocked(axios.get).mockResolvedValue({ data: { id: 1, name: 'Ann' } });
  await expect(getUser(1)).resolves.toEqual({ id: 1, name: 'Ann' });
  expect(axios.get).toHaveBeenCalledWith('/users/1');
});
```

⚠️ If your code uses an **instance** (`const client = axios.create({...}); client.get(...)`), the
automocked `axios.create` returns `undefined`. Mock it to return an object with mock methods:

```js
jest.mock('axios', () => {
  const instance = { get: jest.fn(), post: jest.fn(), interceptors: { request: { use: jest.fn() }, response: { use: jest.fn() } } };
  return { __esModule: true, default: { create: jest.fn(() => instance), ...instance } };
});
```

✅ For HTTP, consider mocking at the **network level** with MSW (Chapter 16/18) instead: your code
uses real axios/fetch; MSW intercepts requests. Fewer mocks to maintain, more realistic.

### uuid / nanoid (non-deterministic values)

```js
jest.mock('uuid', () => ({ v4: jest.fn(() => '00000000-0000-4000-8000-000000000000') }));
```

📌 Many modern packages (uuid ≥ 10, nanoid ≥ 4) ship **ESM only**, which causes
`SyntaxError: Unexpected token 'export'` in Jest — see Chapter 15 / 23 (`transformIgnorePatterns`).
Mocking them with a factory also avoids loading their ESM code at all.

### A logger

```js
jest.mock('./logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));
```

## 8.10 Native ESM mocking (`jest.unstable_mockModule`)

When running tests as **native ES modules** (`node --experimental-vm-modules`, no Babel ESM→CJS;
Chapter 15), `jest.mock` hoisting doesn't apply because static `import`s are resolved and linked
before any code runs. Use `jest.unstable_mockModule` + **dynamic import**:

```js
// weather.test.mjs
import { jest } from '@jest/globals';

jest.unstable_mockModule('./weather.js', () => ({
  getWeather: jest.fn(() => ({ sky: 'sunny' })),
}));

// must import AFTER registering the mock, with dynamic import:
const { getWeather } = await import('./weather.js');
const { forecastText } = await import('./forecast.js');

test('sunny forecast', () => {
  expect(forecastText()).toBe('Go outside!');
  expect(getWeather).toHaveBeenCalled();
});
```

- Factory is required (no automock) and must return the module namespace (named exports + `default`).
- The factory may be async.
- `jest.unstable_unmockModule(path)` (📌 Jest 30) reverses it.
- The `unstable_` prefix means the API may change in a minor release.

## 8.11 Decision guide — which mocking technique?

| Situation | Best technique |
| --- | --- |
| Your own code, you can change the design | **Dependency injection** + `jest.fn()` (Ch 7) |
| A module your code imports, same mock for whole file | `jest.mock(path)` (automock) + `jest.mocked(fn).mock…` per test |
| Need custom shape / avoid loading real module | `jest.mock(path, factory)` |
| Keep most of a module real | factory + `jest.requireActual` |
| Reusable mock used by many test files | manual mock in `__mocks__` |
| One method on an object, keep the rest real | `jest.spyOn` (Ch 9) |
| HTTP calls | MSW (network level) or mock the API client module |
| Different module shape per test | `jest.doMock` + `resetModules` / `isolateModules` |
| CSS/images/aliases | `moduleNameMapper` |
| Native ESM | `jest.unstable_mockModule` + `await import()` |

## 8.12 Pitfalls checklist

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| Mock not applied | `jest.mock` path differs from what the code imports (resolves to a different file, e.g. barrel `index.js` vs direct file) | Mock the exact module your code imports |
| Mock not applied (ESM) | native ESM + `jest.mock` | `unstable_mockModule` + dynamic import |
| `X is not a function` | factory missing that export, or default export without `__esModule: true` | add export / `__esModule: true` |
| `Cannot access 'mockX' before initialization` | `mock`-prefixed variable used eagerly in factory | use lazily or define inside factory |
| `not allowed to reference any out-of-scope variables` | factory uses outer variable | see 8.3 |
| Mock works in one test, not the next | `resetMocks: true` wiped implementation | set impl in `beforeEach` |
| Real module still runs side effects | automock loads the real module to inspect it | use a factory |
| Internal function call not mocked | same-file reference | split module or inject |
| 📌 Works on Jest 29, not Jest 30 | wrong letter case in mocked path | Jest 30 matches the module path **case-sensitively** |

## 8.13 Summary

- Jest's own module registry lets it swap modules for mocks.
- Automock, factory, manual (`__mocks__`) — know what each generates.
- `jest.mock` is hoisted; factories may only use globals, `mock*` variables (lazily), and pure
  constant literals.
- Use `__esModule: true` for default exports in factories.
- node_modules manual mocks are automatic; user-module and core-module mocks need `jest.mock`.
- Use `doMock`/`resetModules`/`isolateModules` for per-test module shapes.
- Native ESM uses `unstable_mockModule` + dynamic `import()`.

**Next:** [Chapter 9 — Spies, classes, globals, Date, fetch, env vars](09-spies-classes-globals.md)
