# Chapter 29 — Scenario, Debugging & Live-Coding Questions

Interviews often include: "write tests for this function", "this test is broken — why?",
"how would you test X?", or a take-home. Every solution below was **run on Jest 30.5.2** and
passes (16 tests in total for sections A–B).

How to approach a live-coding test question:
1. **Clarify behaviour** and edge cases out loud (empty input? errors? async?).
2. **List test cases** before coding (happy path, edges, errors).
3. Write tests with **clear names** and AAA structure.
4. Mention what you'd mock and why — and what you wouldn't.
5. Run, see them fail once if possible, then pass.

---

## A. "Write tests for this function"

### A1. `memoize`

```js
function memoize(fn) {
  const cache = new Map();
  return (arg) => {
    if (!cache.has(arg)) cache.set(arg, fn(arg));
    return cache.get(arg);
  };
}
```

```js
describe('memoize', () => {
  test('calls the original once per argument', () => {
    const slowSquare = jest.fn((n) => n * n);
    const fast = memoize(slowSquare);

    expect(fast(3)).toBe(9);
    expect(fast(3)).toBe(9);
    expect(fast(4)).toBe(16);

    expect(slowSquare).toHaveBeenCalledTimes(2);
    expect(slowSquare.mock.calls).toEqual([[3], [4]]);
  });

  test('caches undefined results too', () => {
    const fn = jest.fn(() => undefined);
    const m = memoize(fn);
    m('a');
    m('a');
    expect(fn).toHaveBeenCalledTimes(1);   // uses has(), not a truthy check
  });
});
```

Talking points: a spy proves caching (an observable effect: fewer calls); the edge case "falsy
results" catches a common `if (cache.get(arg))` bug; object arguments are compared by reference in a
`Map` (a design question to raise).

### A2. `throttle` with fake timers

```js
function throttle(fn, ms) {
  let last = -Infinity;
  return (...args) => {
    const now = Date.now();
    if (now - last >= ms) {
      last = now;
      fn(...args);
    }
  };
}
```

```js
describe('throttle', () => {
  beforeEach(() => jest.useFakeTimers({ now: 0 }));
  afterEach(() => jest.useRealTimers());

  test('runs at most once per window', () => {
    const fn = jest.fn();
    const t = throttle(fn, 1000);

    t(1);
    t(2);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenLastCalledWith(1);

    jest.advanceTimersByTime(999);
    t(3);
    expect(fn).toHaveBeenCalledTimes(1);

    jest.advanceTimersByTime(1);
    t(4);
    expect(fn).toHaveBeenCalledTimes(2);
    expect(fn).toHaveBeenLastCalledWith(4);
  });
});
```

Talking point: advancing fake timers also moves `Date.now()`, and boundary testing at 999/1000 ms.

### A3. `fetchJson` — designed for testability (injected fetch)

```js
async function fetchJson(url, { fetchImpl = fetch } = {}) {
  const res = await fetchImpl(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}
```

```js
describe('fetchJson', () => {
  test('returns parsed JSON', async () => {
    const fetchImpl = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ id: 1 }) });
    await expect(fetchJson('/u/1', { fetchImpl })).resolves.toEqual({ id: 1 });
    expect(fetchImpl).toHaveBeenCalledWith('/u/1');
  });

  test('throws on non-2xx', async () => {
    const fetchImpl = jest.fn().mockResolvedValue({ ok: false, status: 404 });
    await expect(fetchJson('/u/9', { fetchImpl })).rejects.toThrow('HTTP 404');
  });

  test('propagates network errors', async () => {
    const fetchImpl = jest.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(fetchJson('/u/1', { fetchImpl })).rejects.toThrow(TypeError);
  });
});
```

### A4. Events

```js
const { EventEmitter, once } = require('node:events');

test('emits ready with port', async () => {
  const em = new EventEmitter();
  setTimeout(() => em.emit('ready', { port: 8080 }), 10);
  const [info] = await once(em, 'ready');
  expect(info).toEqual({ port: 8080 });
});
```

### A5. `retry` with delays (fake timers + async)

```js
async function retry(fn, { retries = 2, delayMs = 100 } = {}) {
  let lastErr;
  for (let i = 0; i <= retries; i++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      if (i < retries) await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  throw lastErr;
}
```

```js
describe('retry', () => {
  afterEach(() => jest.useRealTimers());

  test('succeeds on the third attempt', async () => {
    jest.useFakeTimers();
    const fn = jest.fn()
      .mockRejectedValueOnce(new Error('a'))
      .mockRejectedValueOnce(new Error('b'))
      .mockResolvedValue('ok');

    const p = retry(fn);
    await jest.runAllTimersAsync();          // flushes awaits between timers
    await expect(p).resolves.toBe('ok');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  test('throws the last error', async () => {
    jest.useFakeTimers();
    const fn = jest.fn()
      .mockRejectedValueOnce(new Error('first'))
      .mockRejectedValue(new Error('last'));

    const assertion = expect(retry(fn, { retries: 1 })).rejects.toThrow('last'); // attach first!
    await jest.runAllTimersAsync();
    await assertion;
    expect(fn).toHaveBeenCalledTimes(2);
  });
});
```

### A6. Module mocking — notify overdue invoices

```js
// notifier.js
const { sendEmail } = require('./emailClient');

async function notifyOverdue(invoices, today) {
  const overdue = invoices.filter((i) => !i.paid && new Date(i.due) < today);
  for (const inv of overdue) await sendEmail(inv.customerEmail, `Invoice ${inv.id} is overdue`);
  return overdue.map((i) => i.id);
}
module.exports = { notifyOverdue };
```

```js
// notifier.test.js   (config: clearMocks: true)
const { notifyOverdue } = require('./notifier');
const { sendEmail } = require('./emailClient');
jest.mock('./emailClient');

const today = new Date('2024-03-10T00:00:00Z');

test('emails only unpaid overdue invoices', async () => {
  const invoices = [
    { id: 1, paid: false, due: '2024-03-01', customerEmail: 'a@x.com' },
    { id: 2, paid: true, due: '2024-03-01', customerEmail: 'b@x.com' },
    { id: 3, paid: false, due: '2024-03-20', customerEmail: 'c@x.com' },
  ];
  await expect(notifyOverdue(invoices, today)).resolves.toEqual([1]);
  expect(sendEmail).toHaveBeenCalledTimes(1);
  expect(sendEmail).toHaveBeenCalledWith('a@x.com', 'Invoice 1 is overdue');
});

test('rejects when the email provider fails', async () => {
  jest.mocked(sendEmail).mockRejectedValueOnce(new Error('SMTP down'));
  await expect(
    notifyOverdue([{ id: 1, paid: false, due: '2024-01-01', customerEmail: 'a@x.com' }], today),
  ).rejects.toThrow('SMTP down');
});
```

Talking points: `today` is injected (deterministic); the real email client throws if ever called
("real email!"), so a missing mock fails loudly; questions to raise: should one failed email stop the
others? (design feedback from a test).

## B. React live-coding: a login form

```jsx
// Login.jsx
import { useState } from 'react';

export function Login({ onLogin }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    if (!email || !password) { setError('Email and password are required'); return; }
    setBusy(true);
    setError('');
    try { await onLogin({ email, password }); }
    catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }

  return (
    <form onSubmit={submit} aria-label="login">
      <label>Email <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></label>
      <label>Password <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} /></label>
      {error && <p role="alert">{error}</p>}
      <button type="submit" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
    </form>
  );
}
```

```jsx
// Login.test.jsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Login } from './Login';

function setup(onLogin = jest.fn().mockResolvedValue(undefined)) {
  const user = userEvent.setup();
  render(<Login onLogin={onLogin} />);
  return { user, onLogin };
}

test('requires both fields', async () => {
  const { user, onLogin } = setup();
  await user.click(screen.getByRole('button', { name: /sign in/i }));
  expect(screen.getByRole('alert')).toHaveTextContent('Email and password are required');
  expect(onLogin).not.toHaveBeenCalled();
});

test('submits credentials and shows busy state', async () => {
  let resolveLogin;
  const onLogin = jest.fn(() => new Promise((r) => { resolveLogin = r; }));  // controllable promise
  const { user } = setup(onLogin);

  await user.type(screen.getByLabelText(/email/i), 'ann@example.com');
  await user.type(screen.getByLabelText(/password/i), 'secret');
  await user.click(screen.getByRole('button', { name: /sign in/i }));

  expect(onLogin).toHaveBeenCalledWith({ email: 'ann@example.com', password: 'secret' });
  expect(screen.getByRole('button', { name: /signing in/i })).toBeDisabled();

  resolveLogin();
  expect(await screen.findByRole('button', { name: /sign in/i })).toBeEnabled();
});

test('shows server error', async () => {
  const { user } = setup(jest.fn().mockRejectedValue(new Error('Invalid credentials')));
  await user.type(screen.getByLabelText(/email/i), 'ann@example.com');
  await user.type(screen.getByLabelText(/password/i), 'wrong');
  await user.click(screen.getByRole('button', { name: /sign in/i }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Invalid credentials');
});
```

Technique to highlight: the **controllable promise** (`resolveLogin`) lets you assert the
intermediate "busy" state deterministically, with no timers or sleeps.

## C. "What's wrong with this test?" (spot the bugs)

### C1.
```js
test('loads user', () => {
  fetchUser(1).then((u) => {
    expect(u.name).toBe('Ann');
  });
});
```
**Bug:** the promise isn't returned/awaited, so the test can pass even if the name is wrong (Ch 5
§5.1, verified false positive). **Fix:** `await expect(fetchUser(1)).resolves.toMatchObject({ name: 'Ann' })`.

### C2.
```js
test('throws for negative', () => {
  expect(withdraw(-5)).toThrow();
});
```
**Bug:** `withdraw(-5)` runs before `expect`; the error escapes and fails the test, or, if it doesn't
throw, Jest complains "received value must be a function". **Fix:** `expect(() => withdraw(-5)).toThrow(RangeError)`.

### C3.
```js
const cart = new Cart();
test('adds', () => { cart.add('x'); expect(cart.size).toBe(1); });
test('empty', () => { expect(cart.size).toBe(0); });
```
**Bug:** shared mutable state; order-dependent. **Fix:** create `cart` in `beforeEach` or a `setup()`
factory.

### C4.
```js
import { getUser } from './api';
const fakeUser = { id: 1 };
jest.mock('./api', () => ({ getUser: jest.fn(() => fakeUser) }));
```
**Trick question: this one works** (verified on Jest 30.5). `fakeUser` is a never-reassigned `const`
with a **pure** initialiser (an object literal of literals), so `babel-plugin-jest-hoist` allows it and
hoists the declaration together with `jest.mock`. Change it to `const fakeUser = buildUser()` or
`const fakeGetUser = jest.fn()` and the plugin throws "The module factory of `jest.mock()` is not
allowed to reference any out-of-scope variables". Robust habits: inline values in the factory, or name
them `mockX` and use them lazily. Interview gold: explain hoisting, the TDZ, and why the rule exists.

### C5.
```js
test('calls analytics', async () => {
  render(<Checkout />);
  userEvent.click(screen.getByRole('button', { name: /pay/i }));
  expect(track).toHaveBeenCalledWith('pay_clicked');
});
```
**Bugs:** `userEvent.click` without `await` (v14 is async); not using `userEvent.setup()`; the
assertion may run before the handler. **Fix:** `const user = userEvent.setup(); await user.click(...)`,
then assert (or `await waitFor(...)` if the call happens after async work).

### C6.
```js
test('debounce', () => {
  const fn = jest.fn();
  const d = debounce(fn, 300);
  d();
  setTimeout(() => expect(fn).toHaveBeenCalled(), 400);
});
```
**Bug:** the assertion in a real `setTimeout` runs after the test ends (and may log "Cannot log after
tests are done" or pass vacuously). **Fix:** fake timers + `jest.advanceTimersByTime(300)` + assert.

### C7.
```js
afterEach(() => jest.restoreAllMocks());
const api = { get: jest.fn() };
test('a', () => { api.get('/x'); expect(api.get).toHaveBeenCalledTimes(1); });
test('b', () => { api.get('/y'); expect(api.get).toHaveBeenCalledTimes(1); });
```
**Bug:** `restoreAllMocks` doesn't clear plain `jest.fn()` mocks in Jest 30, so test b sees 2 calls.
**Fix:** `clearMocks: true` or `jest.clearAllMocks()`.

### C8.
```js
test('snapshot of user', () => {
  expect(createUser('Ann')).toMatchSnapshot();   // contains id: uuid(), createdAt: new Date()
});
```
**Bug:** non-deterministic fields → fails every run. **Fix:** property matchers
`toMatchSnapshot({ id: expect.any(String), createdAt: expect.any(Date) })` or mock uuid/time.

### C9.
```js
test('form error', async () => {
  render(<Form />);
  await waitFor(() => {
    fireEvent.click(screen.getByText('Submit'));
    expect(screen.getByText('Required')).toBeInTheDocument();
  });
});
```
**Bug:** side effect inside `waitFor` (the click may run many times). **Fix:** click once outside, then
`expect(await screen.findByText('Required')).toBeInTheDocument()`.

### C10.
```js
jest.mock('./config', () => ({ __esModule: true, apiUrl: 'http://test' }));
import config from './config';
test('url', () => expect(config.apiUrl).toBe('http://test'));
```
**Bug:** with `__esModule: true`, Babel's interop takes the module's `default` export, and the
factory has none, so `config` is `undefined` (verified) → "Cannot read properties of undefined".
Interestingly, **without** `__esModule: true` the same test passes (verified), because interop wraps
the whole object as the default. **Fix:** `({ __esModule: true, default: { apiUrl: 'http://test' } })`.
Lesson: know how `__esModule` interacts with default imports (Ch 8 §8.2.2).

(And `test('url', () => expect(...))` is fine: `expect(...).toBe()` returns `undefined`, so the arrow
returns `undefined`.)

## D. "How would you test…?" (design scenarios)

**D1. A function that sends a password-reset email with a token that expires in 1 hour.**
Unit: inject clock + token generator + mailer; assert the mailer receives the right link; test
expiry with `setSystemTime` at 59:59 / 60:01; invalid/used tokens; rate limiting. Integration:
Supertest the endpoint with a test DB; MSW/fake for the email provider; ensure no account
enumeration (same response for unknown emails).

**D2. A React infinite-scroll list.**
Mock `IntersectionObserver` (jsdom lacks it) with a controllable fake that lets the test trigger
"visible"; MSW for pages; assert that page 2 loads after triggering, the loading indicator, the end of
the list, and the error retry. Don't test scroll pixels (that's E2E).

**D3. A WebSocket chat client.**
Inject the socket factory; a fake socket (EventEmitter) to simulate `open/message/close`; test
reconnect backoff with fake timers (`advanceTimersByTimeAsync`); test message ordering and
deduplication.

**D4. A cron job that archives old records nightly.**
Test the job function directly with a real DB container or an in-memory fake, using a fixed `now`;
test idempotency (running twice doesn't double-archive); test the schedule config separately;
don't test the cron library.

**D5. A payment flow with a third-party SDK.**
Adapter around the SDK; unit tests mock the adapter (success, decline, network error, timeout, 3-D
Secure); adapter tests against the provider's sandbox or recorded responses via MSW; contract checks;
an E2E smoke test in staging.

**D6. A feature flag system.**
Make flags injectable/providable; `test.each` over flag states; ensure defaults when the flag service
fails; avoid `resetModules` hacks by reading flags at call time.

**D7. A CLI tool.**
Separate argument parsing and logic from I/O; test logic as functions; test the CLI end-to-end by
spawning the process (`execa`/`child_process`) against temp dirs; snapshot `--help` output inline;
spy on `process.exit` / `process.stdout.write` for unit-level tests.

**D8. A data-processing function with many rules (tax calculation).**
`test.each` tables for rule partitions and boundaries; property-based tests for invariants (tax ≥ 0,
monotonic in income); explicit regression cases for past bugs; never floats for money.

## E. Debugging scenarios (what would you do?)

| Scenario | Answer outline |
| --- | --- |
| Test passes alone, fails in the full run | test pollution: bisect files with `-i`, check restored spies, env, timers, singletons, DOM, DB (Ch 23 §23.12) |
| CI says "Jest did not exit one second after the test run has completed" | `--detectOpenHandles`, close servers/DB/intervals in `afterAll`, avoid `--forceExit` (Ch 23 §23.5) |
| Random "not wrapped in act" warnings | find un-awaited async UI updates; `findBy`; wrap timer advances in `act` (Ch 16 §16.7) |
| New dependency → "Must use import to load ES Module" | `transformIgnorePatterns` allow-list (+ `.mjs` transform), mapping, mock, Node ≥ 24.9 (Ch 15) |
| Suite slowly got 3x slower over months | measure per-file; look for barrels/heavy imports; ts-jest type-checking; coverage on locally; worker count (Ch 22) |
| Memory grows until OOM | `-i --logHeapUsage`, leaks, `workerIdleMemoryLimit` (Ch 22 §22.3) |
| Snapshots differ only on a colleague's machine | time zone / locale / OS paths (Ch 11 §11.11) |
| Mock is ignored | path mismatch (barrel vs direct), ESM mode, mocked after import, `doMock` without re-require (Ch 8 §8.12) |
| `toHaveBeenCalledWith` fails with "identical" args | mutation after call / trailing `undefined` (Ch 7) |
| Flaky timeout only in CI | CPU contention: fewer workers; fake timers; check real network (Ch 24 §24.6) |

## F. Take-home tips

- Include a short `TESTING.md`: how to run, what's covered, trade-offs, what you'd add with more time.
- Show the pyramid/trophy thinking: a few unit tests for logic, integration tests for features, one
  E2E or explanation.
- Clean config: `clearMocks`, `restoreMocks`, coverage script, lint for tests.
- No `.only`, no skipped tests, no console noise, deterministic data.
- Name tests as specifications. Reviewers read them first.

**Next:** [Chapter 30 — Cheat sheet & glossary](30-cheat-sheet-glossary.md)
