# Chapter 6 — Setup, Teardown and the Test Lifecycle

> 🧸 **Explain it like I'm 5**
>
> Before each game of "pretend restaurant", you set the table (setup). After each game, you clear
> the table (teardown), so the next game starts clean. Jest gives you four helpers:
>
> - `beforeAll` — set up **once** before all the games (e.g. open the toy box).
> - `beforeEach` — set up **before every** game (put clean plates on the table).
> - `afterEach` — clean up **after every** game (wash the plates).
> - `afterAll` — clean up **once** at the very end (close the toy box).

---

## 6.1 The four hooks

```js
beforeAll(fn, timeout?)   // once, before the first test in this scope
beforeEach(fn, timeout?)  // before every test in this scope (and nested scopes)
afterEach(fn, timeout?)   // after every test in this scope
afterAll(fn, timeout?)    // once, after the last test in this scope
```

- `fn` can be sync, `async`, return a promise, or take `done`.
- `timeout` default = `testTimeout` (5000 ms).

```js
let db;

beforeAll(async () => {
  db = await connectToTestDatabase();      // expensive: do once
});

beforeEach(async () => {
  await db.clear();                        // cheap: fresh state per test
  await db.seed({ users: [{ id: 1, name: 'Ann' }] });
});

afterAll(async () => {
  await db.close();                        // so Jest can exit
});

test('finds Ann', async () => {
  expect(await db.users.find(1)).toMatchObject({ name: 'Ann' });
});
```

## 6.2 Scoping — hooks belong to the block they're in

- A hook at the **top level** of a file applies to **every test in that file**.
- A hook inside `describe` applies only to tests in that `describe` (including nested ones).
- A hook in a **setup file** (`setupFilesAfterEnv`) applies to **every test in every file**.

## 6.3 The exact order (verified on Jest 30.5)

```js
beforeAll(() => console.log('1 - beforeAll'));
afterAll(() => console.log('1 - afterAll'));
beforeEach(() => console.log('1 - beforeEach'));
afterEach(() => console.log('1 - afterEach'));

test('outer', () => console.log('1 - test'));

describe('Scoped', () => {
  beforeAll(() => console.log('2 - beforeAll'));
  afterAll(() => console.log('2 - afterAll'));
  beforeEach(() => console.log('2 - beforeEach'));
  afterEach(() => console.log('2 - afterEach'));

  test('inner', () => console.log('2 - test'));
});
```

Output:

```
1 - beforeAll
1 - beforeEach
1 - test
1 - afterEach
2 - beforeAll
1 - beforeEach      ← outer beforeEach runs FIRST
2 - beforeEach
2 - test
2 - afterEach       ← inner afterEach runs FIRST
1 - afterEach
2 - afterAll
1 - afterAll
```

Rules to memorise (🎯 asked a lot):

1. `before*` hooks run **outside → inside** (parent first).
2. `after*` hooks run **inside → outside** (child first). Like putting on and taking off clothes:
   coat on last, coat off first.
3. A nested `beforeAll` runs right before the **first test of its describe**, not at file start.
4. Hooks of the same type in the same scope run **in the order they're declared**.
5. All `describe` bodies run before any hook (collection phase — Chapter 3).

## 6.4 What happens when things fail (verified)

| Situation | What Jest does |
| --- | --- |
| A **test** fails | Its `afterEach` hooks still run; other tests continue |
| A **`beforeEach`** throws | That test's body is **skipped**, the test is reported failed with the hook's error, **`afterEach` still runs** |
| A **`beforeAll`** throws | **Every test in that describe** is reported failed with the hook's error; their `beforeEach` hooks and bodies don't run; `afterEach` and `afterAll` hooks **still run** |
| An **`afterEach`/`afterAll`** throws | The test/file is reported failed with that error |

💼 Consequence: write **defensive teardown**. If `beforeAll` failed half-way, `afterAll` still runs,
so guard against undefined resources:

```js
afterAll(async () => {
  await server?.close();
  await db?.close();
});
```

## 6.5 `beforeAll` vs `beforeEach` — which one?

| Use `beforeEach` when… | Use `beforeAll` when… |
| --- | --- |
| the state is **mutable** and tests may change it | the setup is **expensive** and **read-only** (start a server, connect to DB, compile a schema) |
| you want total test isolation | tests only read from it |

⚠️ The classic shared-state bug:

```js
const cart = new Cart();               // ❌ created once, shared by all tests

test('adds item', () => {
  cart.add('apple');
  expect(cart.count()).toBe(1);
});

test('starts empty', () => {
  expect(cart.count()).toBe(0);        // ❌ fails (count is 1) — depends on order!
});
```

```js
let cart;
beforeEach(() => {
  cart = new Cart();                    // ✅ fresh per test
});
```

✅ Tests should pass in **any order** and **alone** (`test.only`). Try `--randomize` (shuffles test
order inside files; reproduce with `--seed=<n>`, print it with `--showSeed`) to find hidden order
dependence.

## 6.6 Alternatives to hooks: factory functions

Many experienced teams prefer **explicit setup functions** over `beforeEach` with `let` variables:

```js
function setup(overrides = {}) {
  const repo = { save: jest.fn(), findByEmail: jest.fn().mockResolvedValue(null) };
  const mailer = { send: jest.fn() };
  const service = new SignupService({ repo, mailer, ...overrides });
  return { service, repo, mailer };
}

test('sends a welcome email', async () => {
  const { service, mailer } = setup();
  await service.signup('ann@example.com');
  expect(mailer.send).toHaveBeenCalledWith(expect.objectContaining({ to: 'ann@example.com' }));
});

test('rejects duplicates', async () => {
  const { service, repo } = setup();
  repo.findByEmail.mockResolvedValue({ id: 1 });
  await expect(service.signup('ann@example.com')).rejects.toThrow('already registered');
});
```

Benefits: each test shows its setup, no mutable `let`, no hidden hooks far above, easy to tweak per
test. Use hooks for **cross-cutting** things (DB cleanup, timers, mocks reset).

## 6.7 Global, file-level and project-level setup (the big picture)

Setup can happen at several levels. In run order:

| # | Where | Runs | Has access to test framework (`expect`, `jest`, hooks)? | Typical use |
| --- | --- | --- | --- | --- |
| 1 | `globalSetup` (config) | **once** before all test files, in the **main process** (or once per project) | ❌ no | start Docker DB, create test database, start a shared server; set `process.env` values |
| 2 | `testEnvironment` setup | per test file | — | create the sandbox (`node`/`jsdom`) |
| 3 | `setupFiles` (config) | per test file, **before** the test framework is installed | ❌ no `expect`/hooks (the `jest` object is available) | polyfills, env vars, global mocks of browser APIs |
| 4 | `setupFilesAfterEnv` (config) | per test file, **after** the framework is installed | ✅ yes | `import '@testing-library/jest-dom'`, `expect.extend`, global `beforeEach/afterEach`, MSW server start/stop |
| 5 | the test file itself | hooks + tests | ✅ | |
| 6 | `globalTeardown` (config) | **once** after all test files | ❌ | stop Docker, drop DB |

```js
// jest.config.js
module.exports = {
  globalSetup: '<rootDir>/test/global-setup.js',
  globalTeardown: '<rootDir>/test/global-teardown.js',
  setupFiles: ['<rootDir>/test/polyfills.js'],
  setupFilesAfterEnv: ['<rootDir>/test/jest.setup.js'],
};
```

```js
// test/global-setup.js
module.exports = async function (globalConfig, projectConfig) {
  globalThis.__PG__ = await startPostgresContainer();   // visible in globalTeardown only
  process.env.DATABASE_URL = globalThis.__PG__.url;      // ✅ env vars ARE inherited by workers
};
```

```js
// test/global-teardown.js
module.exports = async function () {
  await globalThis.__PG__.stop();
};
```

⚠️ Variables set on `globalThis` in `globalSetup` are only visible in `globalTeardown` — **not in
test files** (tests run in separate sandboxes/worker processes). To pass data to tests use
`process.env` (strings only) or write a file (e.g. JSON in a temp dir) and read it in tests.

⚠️ Code in `globalSetup` is transformed by your `transform` config only if it matches; and because
it runs outside the sandbox, `jest.mock` does nothing there.

```js
// test/jest.setup.js  (setupFilesAfterEnv)
import '@testing-library/jest-dom';

beforeEach(() => {
  jest.useRealTimers();
});

afterEach(() => {
  jest.clearAllMocks();
});
```

📌 Jest 30: `setupFilesAfterEnv` files may use top-level `await` or export an async function, like
`setupFiles` already could.

## 6.8 Isolation: what is shared and what isn't (🔍 crucial)

| Between… | Shared? |
| --- | --- |
| Two **test files** | ❌ Nothing. Each file has a fresh global object, a fresh module registry, fresh mocks. (They may run in different worker processes too.) |
| Two **tests in the same file** | ✅ The module registry (a module is loaded once per file), module-level variables, globals, `jest.fn()` call history (unless cleared), fake timers state, DOM (jsdom `document` persists!) |
| Projects in a multi-project config | ❌ separate configs/environments |

Consequences:

- A singleton/cache in your code (`const cache = new Map()` at module level) persists between tests
  in a file. Reset it, or use `jest.resetModules()` / `jest.isolateModules()` (Chapter 8).
- DOM elements appended to `document.body` persist between tests in jsdom unless removed.
  React Testing Library auto-unmounts after each test (when `afterEach` is available globally).
- Mock call counts accumulate unless you clear them (`clearMocks: true` in config — ✅ recommended).

## 6.9 Recommended baseline config for cleanliness

```js
// jest.config.js
module.exports = {
  clearMocks: true,     // jest.clearAllMocks() before every test: wipes calls/results
  restoreMocks: true,   // jest.restoreAllMocks() before every test: undo jest.spyOn / replaceProperty
  // resetMocks: true,  // also wipes implementations of ALL mocks — stricter, can surprise people
};
```

Details of clear vs reset vs restore: Chapter 7 §7.9.

## 6.10 Hooks and async — common errors

```js
beforeAll(() => {
  connect();               // ❌ returns a promise you didn't return → tests may start before connected
});

beforeAll(async () => {
  await connect();         // ✅
});

beforeAll(() => connect()); // ✅ arrow returns the promise
```

⚠️ But a non-promise return value from a hook (e.g. `beforeEach(() => arr.push(1))`) is fine for
hooks — the "must return undefined or a promise" rule is enforced on test functions. Still, using
braces is a good habit.

## 6.11 Summary

- `beforeAll/afterAll` once per scope; `beforeEach/afterEach` around every test in scope.
- before-hooks run outer→inner; after-hooks inner→outer.
- A failing `beforeAll` fails all tests in its block; teardown hooks still run.
- Prefer fresh state per test; consider factory `setup()` functions.
- Know the global pipeline: `globalSetup` → `setupFiles` → `setupFilesAfterEnv` → tests →
  `globalTeardown`.
- Files are isolated; tests within a file share module state and DOM.

**Next:** [Part 2 — Chapter 7: Mock functions in depth](../part-2-mocking/07-mock-functions.md)
