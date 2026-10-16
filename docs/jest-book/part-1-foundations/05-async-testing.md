# Chapter 5 — Testing Asynchronous Code

> 🧸 **Explain it like I'm 5**
>
> Some code is like ordering pizza: you call, and the pizza comes **later**.
> If the robot checking your work leaves the room right after you call, it never sees whether the
> pizza arrived (or whether it was the wrong pizza!). So for "later" code you must tell Jest:
> **"wait for the pizza before you leave."** You do that with `await`, by `return`ing the promise,
> or by calling `done()` when the pizza arrives.

---

## 5.1 The core problem

Jest considers a test **finished** when its function returns — unless you give it something to wait
for. If the async work finishes **after** the test is done, its assertions run too late:

```js
const slow = () => new Promise((r) => setTimeout(() => r(1), 50));

test('forgot to wait', () => {
  slow().then((v) => expect(v).toBe(2));   // ❌ wrong, but...
});
```

Verified result on Jest 30.5 when this is the last test in the file:

```
Tests:       1 passed, 1 total          ← FALSE POSITIVE ✅ (it's wrong!)
...
JestAssertionError: expect(received).toBe(expected)
Expected: 2
Received: 1                             ← printed AFTER the run, too late
```

If other tests are still running when the late assertion fires, Jest 30 usually catches it and fails
the original test. But you **cannot rely on that**. Always make Jest wait.

🎯 **Interview point:** "Why did my async test pass even though the value was wrong?" — the
promise wasn't returned/awaited, so the test completed before the assertion ran.

## 5.2 Way 1 — `async` / `await` (✅ recommended)

```js
test('fetches the user', async () => {
  const user = await fetchUser(1);
  expect(user.name).toBe('Ann');
});
```

Errors:

```js
test('throws for unknown user', async () => {
  await expect(fetchUser(-1)).rejects.toThrow('not found');
});
```

## 5.3 Way 2 — return the promise

```js
test('fetches the user', () => {
  return fetchUser(1).then((user) => {
    expect(user.name).toBe('Ann');
  });
});
```

If the returned promise rejects, the test fails. If you forget `return`, see 5.1.

## 5.4 Way 3 — `.resolves` / `.rejects`

```js
test('resolves to Ann', async () => {
  await expect(fetchUser(1)).resolves.toMatchObject({ name: 'Ann' });
});

test('rejects', () => {
  return expect(fetchUser(-1)).rejects.toThrow(NotFoundError);
});
```

- `.resolves` unwraps the resolved value; fails if the promise rejects.
- `.rejects` unwraps the rejection reason; fails if the promise resolves.
- ⚠️ **Must be awaited or returned.** `expect(p).resolves.toBe(x)` returns a promise.
  `eslint-plugin-jest` rule `valid-expect` catches a missing `await`.

`.rejects.toThrow()` works when the rejection reason is an `Error`. If code rejects with a plain
value (`Promise.reject('nope')`), use `.rejects.toBe('nope')` / `.rejects.toEqual(...)`.

You can also pass an **async function** (Jest calls it):

```js
await expect(async () => { await doThing(); }).rejects.toThrow('bad');
```

## 5.5 Way 4 — the `done` callback (for callback-style APIs)

```js
function fetchData(callback) {
  setTimeout(() => callback(null, 'peanut butter'), 10);
}

test('the data is peanut butter', (done) => {
  fetchData((error, data) => {
    if (error) {
      done(error);          // fails the test with this error
      return;
    }
    try {
      expect(data).toBe('peanut butter');
      done();               // ✅ success
    } catch (err) {
      done(err);            // ✅ pass the assertion failure to Jest
    }
  });
});
```

How it works: if the test function **declares a parameter**, Jest waits until that function is
called (or the timeout hits).

Why the `try/catch`? A failing `expect` inside the callback **throws**. Without catching it and
passing it to `done(err)`, Jest sees an uncaught error **and** then waits for `done()` until the
timeout. Verified Jest 30 output without try/catch: you get **two** failures for the same test:
the real assertion error, then
`Exceeded timeout of 5000 ms for a test while waiting for 'done()' to be called.`

Rules (all verified error messages):

| Mistake | Jest says |
| --- | --- |
| `async (done) => {}` (both) | `Test functions cannot both take a 'done' callback and return something. Either use a 'done' callback, or return a promise.` |
| `done()` called twice | `Expected done to be called once, but it was called multiple times.` |
| `done()` never called | `Exceeded timeout of 5000 ms for a test while waiting for 'done()' to be called.` |
| `done(new Error('boom'))` | test fails with `boom` |

✅ Modern advice: **wrap callback APIs in a promise** and use `async/await` instead of `done`:

```js
const fetchDataAsync = () =>
  new Promise((resolve, reject) =>
    fetchData((err, data) => (err ? reject(err) : resolve(data))),
  );

test('the data is peanut butter', async () => {
  await expect(fetchDataAsync()).resolves.toBe('peanut butter');
});
```

(Node has `util.promisify` for standard `(err, value)` callbacks.)

## 5.6 Testing that something FAILS — the `catch` trap

```js
// ❌ BAD: if fetchUser resolves, no assertion runs and the test PASSES
test('fails for bad id', async () => {
  try {
    await fetchUser(-1);
  } catch (e) {
    expect(e.message).toMatch('not found');
  }
});
```

Fixes:

```js
// ✅ Fix 1: rejects
await expect(fetchUser(-1)).rejects.toThrow('not found');

// ✅ Fix 2: assertion counting
test('fails for bad id', async () => {
  expect.assertions(1);
  try {
    await fetchUser(-1);
  } catch (e) {
    expect(e.message).toMatch('not found');
  }
});
```

`expect.assertions(n)` fails the test if exactly `n` assertions did not run.
`expect.hasAssertions()` requires at least one.

💼 Some teams put `expect.hasAssertions()` in a global `beforeEach` (in `setupFilesAfterEnv`) to
catch assertion-less tests everywhere. The cost: every test, even trivial "doesn't throw" ones,
needs an `expect`.

## 5.7 Timeouts

Default per test / hook: **5 seconds**.

```js
test('slow integration', async () => { /* ... */ }, 20_000);   // per test (3rd arg)
beforeAll(async () => { /* ... */ }, 30_000);                   // per hook (2nd arg)
jest.setTimeout(10_000);       // for the rest of this file (call at top level)
```

```js
// jest.config.js — default for everything
module.exports = { testTimeout: 10_000 };
```

CLI: `--testTimeout=10000`.

⚠️ Increasing the timeout is not a fix for a hanging test. A test that hits the timeout usually:
- forgot to call `done`,
- awaits a promise that never resolves (e.g. a mock that never resolves, fake timers that never
  advance — Chapter 10),
- talks to a real network/DB that isn't there.

## 5.8 Multiple async operations

```js
test('loads dashboard data in parallel', async () => {
  const [user, orders] = await Promise.all([getUser(1), getOrders(1)]);
  expect(user.id).toBe(1);
  expect(orders).toHaveLength(3);
});

test('one failure does not hide the other results', async () => {
  const results = await Promise.allSettled([ok(), fail()]);
  expect(results).toEqual([
    { status: 'fulfilled', value: 'ok' },
    { status: 'rejected', reason: expect.any(Error) },
  ]);
});
```

## 5.9 Event emitters, streams and "eventually" conditions

### EventEmitter: wait for an event

```js
const { once } = require('node:events');

test('server emits ready', async () => {
  const server = createServer();
  server.start();
  const [info] = await once(server, 'ready');    // resolves with the event args
  expect(info.port).toBeGreaterThan(0);
});
```

### Streams: collect the output

```js
const { Readable } = require('node:stream');

test('uppercases a stream', async () => {
  const chunks = [];
  for await (const chunk of Readable.from(['a', 'b']).pipe(upperCaseTransform())) {
    chunks.push(chunk.toString());
  }
  expect(chunks.join('')).toBe('AB');
});
```

### Async iterators / generators

```js
test('paginates', async () => {
  const pages = [];
  for await (const page of fetchAllPages()) pages.push(page);
  expect(pages).toHaveLength(3);
});
```

### "Eventually true" — polling

When something becomes true at some unknown later point (a background job, a debounced UI), poll
instead of sleeping a fixed time:

```js
async function waitFor(check, { timeout = 2000, interval = 20 } = {}) {
  const start = Date.now();
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      return check();                     // returns if the assertion passes
    } catch (err) {
      if (Date.now() - start > timeout) throw err;
      await new Promise((r) => setTimeout(r, interval));
    }
  }
}

test('job completes', async () => {
  startJob();
  await waitFor(() => expect(getJobStatus()).toBe('done'));
});
```

Testing Library ships a battle-tested `waitFor` and `findBy*` queries (Chapter 16).
⚠️ Never `await sleep(1000)` "to be safe" — it makes tests slow **and** still flaky.

## 5.10 Code with timers (`setTimeout`, debounce, retries)

Don't wait for real time. Use **fake timers** (Chapter 10):

```js
jest.useFakeTimers();

test('debounced save fires after 300ms', () => {
  const save = jest.fn();
  const debounced = debounce(save, 300);
  debounced();
  jest.advanceTimersByTime(299);
  expect(save).not.toHaveBeenCalled();
  jest.advanceTimersByTime(1);
  expect(save).toHaveBeenCalledTimes(1);
});
```

## 5.11 Mocked async functions

```js
const api = { getUser: jest.fn() };

api.getUser.mockResolvedValue({ id: 1 });            // Promise.resolve({id:1})
api.getUser.mockRejectedValueOnce(new Error('503')); // first call rejects
```

Chapter 7 covers these in depth.

## 5.12 Unhandled promise rejections

If code under test creates a rejected promise that **nobody handles**, Jest fails the test that was
running (verified):

```js
test('fire and forget', async () => {
  Promise.reject(new Error('lost'));                 // nobody catches it
  await new Promise((r) => setTimeout(r, 20));
});
// ● fire and forget
//   lost
```

📌 **Jest 30 addition — `waitForUnhandledRejections`** (config option and CLI flag). When enabled,
Jest gives one extra event-loop turn to see whether a rejection gets handled (`rejectionHandled`)
before reporting it. That avoids false failures from promises that are rejected and caught
**slightly later**, and it attributes real unhandled rejections to the right test. It is **`false`
by default** (checked with `--showConfig` on 30.5.2) because it adds overhead. Turn it on if you
see "unhandled rejection" failures for rejections that your code actually does handle, or errors
being reported against the wrong test:

```bash
npx jest --waitForUnhandledRejections
```

## 5.13 Microtasks vs macrotasks — why order matters (🔍 deep dive)

- **Microtasks**: promise callbacks (`.then`, code after `await`), `queueMicrotask`. Run right after
  the current synchronous code, before anything else.
- **Macrotasks**: `setTimeout`, `setInterval`, `setImmediate`, I/O callbacks. Run on later
  event-loop turns.
- `process.nextTick` (Node) runs even before other microtasks.

Practical consequences in tests:

```js
test('flush promises', async () => {
  let done = false;
  Promise.resolve().then(() => { done = true; });
  expect(done).toBe(false);          // the .then hasn't run yet
  await Promise.resolve();           // yield once → microtasks run
  expect(done).toBe(true);
});
```

A common helper to let all already-queued promise callbacks run:

```js
const flushPromises = () => new Promise((r) => setImmediate(r));
// or with real timers: () => new Promise((r) => setTimeout(r, 0))
```

`setImmediate` runs after the current microtask queue is drained, so everything queued so far has
settled. ⚠️ With fake timers, `setImmediate`/`setTimeout` are faked too, so this helper will hang
unless you advance timers. Use `await jest.runAllTimersAsync()` or exclude `setImmediate` via
`doNotFake` (Chapter 10).

## 5.14 Checklist for every async test

1. Is the test `async` and is every promise `await`ed (or returned)?
2. Are `.resolves`/`.rejects` assertions awaited?
3. For "should fail" tests: `rejects` or `expect.assertions`?
4. Are there real timers/network/DB? → mock them or use fake timers.
5. Any `done` callback? → prefer converting to promises; if kept, `try/catch` + `done(err)`.
6. Does the test clean up (close servers, clear intervals) so Jest can exit? (Chapter 23:
   "Jest did not exit one second after the test run has completed".)

## 5.15 Summary

- Jest only waits for what you give it: `await`, `return`, or `done`.
- Prefer `async/await` + `await expect(...).resolves/rejects`.
- Protect "expect a failure" tests with `rejects` or `expect.assertions`.
- `done`: wrap assertions in `try/catch`, never mix with async.
- Use fake timers for time-based code and polling (`waitFor`) for "eventually" conditions.

**Next:** [Chapter 6 — Setup, teardown and the test lifecycle](06-setup-teardown-lifecycle.md)
