# Chapter 10 — Fake Timers

> 🧸 **Explain it like I'm 5**
>
> Your code says "wait 10 minutes, then ring the bell". A test can't sit there for 10 minutes!
> Fake timers give you a **magic remote control for time**. You press "fast-forward 10 minutes"
> and — whoosh — the bell rings instantly. You can also stop time, jump to a date
> ("pretend it's New Year's Eve"), or skip straight to the next alarm.

---

## 10.1 Turning fake timers on and off

```js
jest.useFakeTimers();   // from here on, timers & Date are fake (in this file)
jest.useRealTimers();   // back to real ones
```

Or for every test file:

```js
// jest.config.js
module.exports = {
  fakeTimers: { enableGlobally: true },
};
```

`jest.useFakeTimers()` is a **global operation** for the file: it stays on for later tests until
`useRealTimers()`. Calling it again **re-installs** the fake clock (resets pending timers and the
fake time). A common, safe pattern:

```js
beforeEach(() => jest.useFakeTimers());
afterEach(() => {
  jest.runOnlyPendingTimers();   // optional: flush leftovers so they don't leak
  jest.useRealTimers();
});
```

## 10.2 What gets faked

The modern implementation (default since Jest 27) uses **`@sinonjs/fake-timers`** (v13 in Jest 30)
and replaces:

- `Date` (including `new Date()` and `Date.now()`),
- `performance.now()`,
- `queueMicrotask()`,
- `setTimeout`/`clearTimeout`, `setInterval`/`clearInterval`, `setImmediate`/`clearImmediate`,
- in the **node** environment: `process.hrtime`, `process.nextTick`,
- in **jsdom**: `requestAnimationFrame`/`cancelAnimationFrame`,
  `requestIdleCallback`/`cancelIdleCallback`,
- `Temporal` where available.

**Not faked:** native **Promises** (`.then`, `await`). They still run as real microtasks. This single
fact explains most fake-timer confusion (see 10.5).

Options:

```js
jest.useFakeTimers({
  now: new Date('2024-01-01T00:00:00Z'),  // starting time (number | Date | Temporal)
  doNotFake: ['nextTick', 'queueMicrotask', 'performance'], // keep these real
  advanceTimers: true,       // time flows automatically (20ms per 20ms real), or a number delta
  timerLimit: 100_000,       // max timers runAllTimers will run (default 100000)
  legacyFakeTimers: false,   // old Jest implementation (avoid)
});
```

## 10.3 The control buttons

| API | What it does |
| --- | --- |
| `jest.advanceTimersByTime(ms)` | move time forward `ms`; run every timer that comes due, in order |
| `jest.runOnlyPendingTimers()` | run the timers that are pending **right now** (not ones they create) |
| `jest.runAllTimers()` | keep running timers until none left (⚠️ infinite for recursive/interval timers) |
| `jest.advanceTimersToNextTimer(steps = 1)` | jump to the next timer and run it (`steps` times) |
| `jest.advanceTimersToNextFrame()` | 📌 Jest 30: jump to the next animation frame (runs `requestAnimationFrame` callbacks) |
| `jest.runAllTicks()` | run all `process.nextTick` callbacks |
| `jest.clearAllTimers()` | cancel all pending timers |
| `jest.getTimerCount()` | number of pending timers |
| `jest.now()` | current fake time in ms |
| `jest.setSystemTime(t)` | change "now" (does **not** fire timers) |
| `jest.getRealSystemTime()` | real current time while faking |
| `jest.setTimerTickMode({mode})` | `'manual'` (default), `'nextAsync'`, `'interval'` (auto advance) |
| `jest.runAllImmediates()` | legacy timers only |
| **Async variants:** `advanceTimersByTimeAsync`, `runAllTimersAsync`, `runOnlyPendingTimersAsync`, `advanceTimersToNextTimerAsync` | same, but **await promise callbacks between timers** (see 10.5) |

## 10.4 Classic examples

### A timeout

```js
function remindLater(cb) {
  setTimeout(() => cb('Drink water!'), 60_000);
}

test('reminds after a minute', () => {
  jest.useFakeTimers();
  const cb = jest.fn();

  remindLater(cb);
  expect(cb).not.toHaveBeenCalled();

  jest.advanceTimersByTime(59_999);
  expect(cb).not.toHaveBeenCalled();

  jest.advanceTimersByTime(1);
  expect(cb).toHaveBeenCalledWith('Drink water!');
});
```

### Debounce

```js
function debounce(fn, ms) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

test('only the last call within the window fires', () => {
  jest.useFakeTimers();
  const save = jest.fn();
  const debouncedSave = debounce(save, 300);

  debouncedSave('a');
  jest.advanceTimersByTime(200);
  debouncedSave('b');           // resets the timer
  jest.advanceTimersByTime(299);
  expect(save).not.toHaveBeenCalled();
  jest.advanceTimersByTime(1);
  expect(save).toHaveBeenCalledTimes(1);
  expect(save).toHaveBeenCalledWith('b');
});
```

### Intervals / polling

```js
test('polls every 5s', () => {
  jest.useFakeTimers();
  const check = jest.fn();
  const id = setInterval(check, 5000);

  jest.advanceTimersByTime(15_000);
  expect(check).toHaveBeenCalledTimes(3);

  clearInterval(id);
});
```

### Recursive timers — why `runAllTimers` can explode (verified)

```js
function loop() { setTimeout(loop, 10); }

test('runAllTimers on an endless loop', () => {
  jest.useFakeTimers();
  loop();
  expect(() => jest.runAllTimers()).toThrow(/Aborting after running 100000 timers/);
});
```

Use `jest.runOnlyPendingTimers()` (runs the current generation only) or `advanceTimersByTime`.

### Dates

```js
test('greets with the current year', () => {
  jest.useFakeTimers({ now: new Date('2030-06-01T10:00:00Z') });
  expect(footerText()).toBe('© 2030 ACME');
});

test('token expires after an hour', () => {
  jest.useFakeTimers();
  jest.setSystemTime(new Date('2024-01-01T00:00:00Z'));
  const token = issueToken();
  jest.setSystemTime(new Date('2024-01-01T01:00:01Z'));
  expect(isExpired(token)).toBe(true);
});
```

`advanceTimersByTime` also moves `Date.now()` forward.

## 10.5 🔍 Fake timers + promises: the #1 source of confusion

Promise callbacks are **real microtasks**. `advanceTimersByTime` is **synchronous**: it fires timer
callbacks, but promise `.then` callbacks queued by them run only after the current synchronous code
yields.

Verified example:

```js
test('promise + timer', async () => {
  jest.useFakeTimers();
  const fn = jest.fn();
  const p = new Promise((r) => setTimeout(r, 1000)).then(fn);

  jest.advanceTimersByTime(1000);     // the timer fires and resolves the promise...
  expect(fn).not.toHaveBeenCalled();  // ...but .then(fn) hasn't run yet (microtask)

  await p;                            // yield → microtasks run
  expect(fn).toHaveBeenCalled();
});
```

The harder case: code that **awaits first, then sets a timer**:

```js
async function retryLater(fn) {
  await somethingAsync();             // microtask boundary
  setTimeout(fn, 500);                // registered only after the await resolves
}
```

```js
test('sync advance misses the timer', async () => {
  jest.useFakeTimers();
  const fn = jest.fn();
  retryLater(fn);
  jest.advanceTimersByTime(500);      // ❌ the setTimeout isn't registered yet!
  expect(fn).not.toHaveBeenCalled();
});

test('async advance works', async () => {
  jest.useFakeTimers();
  const fn = jest.fn();
  retryLater(fn);
  await jest.advanceTimersByTimeAsync(500);   // ✅ flushes promises while advancing (verified)
  expect(fn).toHaveBeenCalled();
});
```

✅ **Rule:** when code mixes `await` and timers (retries with backoff, polling with fetch, sagas),
use the **`Async` variants**: `await jest.advanceTimersByTimeAsync(ms)`,
`await jest.runAllTimersAsync()`, `await jest.runOnlyPendingTimersAsync()`.

### Example — retry with exponential backoff

```js
async function fetchWithRetry(fetchFn, retries = 3) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fetchFn();
    } catch (err) {
      if (attempt >= retries) throw err;
      await new Promise((r) => setTimeout(r, 2 ** attempt * 1000)); // 1s, 2s, 4s
    }
  }
}

test('retries with backoff then succeeds', async () => {
  jest.useFakeTimers();
  const fetchFn = jest.fn()
    .mockRejectedValueOnce(new Error('503'))
    .mockRejectedValueOnce(new Error('503'))
    .mockResolvedValue('ok');

  const promise = fetchWithRetry(fetchFn);
  await jest.advanceTimersByTimeAsync(1000);   // 1st backoff
  await jest.advanceTimersByTimeAsync(2000);   // 2nd backoff
  await expect(promise).resolves.toBe('ok');
  expect(fetchFn).toHaveBeenCalledTimes(3);
});

test('gives up after retries', async () => {
  jest.useFakeTimers();
  const fetchFn = jest.fn().mockRejectedValue(new Error('down'));

  const promise = fetchWithRetry(fetchFn, 2);
  const assertion = expect(promise).rejects.toThrow('down'); // attach handler early!
  await jest.runAllTimersAsync();
  await assertion;
});
```

⚠️ Notice `const assertion = expect(promise).rejects...` **before** advancing timers. If the promise
rejects while nobody is listening yet, Jest may report an **unhandled rejection**. Attach the
assertion (or a `.catch`) first, then advance, then `await` the assertion.

## 10.6 Things that break with fake timers (and fixes)

| Symptom | Cause | Fix |
| --- | --- | --- |
| Test times out (5s) with fake timers | code waits for a timer that you never advanced, e.g. `await sleep(100)` inside code | advance timers (async variant), or `advanceTimers: true` |
| `waitFor`/polling helpers hang | your helper uses `setTimeout`, which is faked | advance timers in the loop; Testing Library's `waitFor` already handles Jest fake timers |
| A library hangs (DB driver, HTTP client) | it uses `process.nextTick`/`setImmediate`/`queueMicrotask` internally, now faked | `doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask']` or use real timers for that test |
| `flushPromises` via `setImmediate` hangs | `setImmediate` faked | `await jest.runAllTimersAsync()` or `doNotFake: ['setImmediate']` |
| Timer from a previous test fires in this one | leftover timers | `jest.clearAllTimers()` / `runOnlyPendingTimers()` in `afterEach`, re-install fake timers per test |
| `Date` still real in some code | code captured `Date` before fake timers were installed (e.g. a library cached `Date.now`) | install fake timers earlier (config `enableGlobally`), or mock that library |
| user-event clicks hang | `userEvent` uses real delays between actions | `userEvent.setup({ advanceTimers: jest.advanceTimersByTime })` |
| `jest.advanceTimersByTime is not a function`-style warnings: "A function to advance timers was called but the timers APIs are not replaced with fake timers" | calling timer controls without `useFakeTimers()` | call `jest.useFakeTimers()` first |

## 10.7 Fake timers in React tests

```js
import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

test('toast disappears after 3s', async () => {
  jest.useFakeTimers();
  const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });

  render(<App />);
  await user.click(screen.getByRole('button', { name: /save/i }));
  expect(screen.getByText('Saved!')).toBeInTheDocument();

  act(() => {
    jest.advanceTimersByTime(3000);   // state updates from timers → wrap in act
  });
  expect(screen.queryByText('Saved!')).not.toBeInTheDocument();

  jest.useRealTimers();
});
```

- Wrap manual timer advancement in `act()` when it triggers React state updates (otherwise you get
  the "not wrapped in act(...)" warning).
- Testing Library's `waitFor`/`findBy*` detect Jest fake timers and advance them for you.

## 10.8 `requestAnimationFrame` (📌 Jest 30)

```js
test('animates one frame', () => {
  jest.useFakeTimers();
  const step = jest.fn();
  requestAnimationFrame(step);
  jest.advanceTimersToNextFrame();   // jumps to the next 16ms frame boundary
  expect(step).toHaveBeenCalled();
});
```

(rAF is only faked in the jsdom environment.)

## 10.9 Legacy fake timers

Before Jest 27 the default was Jest's own "legacy" implementation, where timer functions were Jest
mock functions (`expect(setTimeout).toHaveBeenCalledTimes(1)` worked). With modern timers,
`setTimeout` is **not** a mock function, so to assert on it use `jest.spyOn(global, 'setTimeout')`.
Enable legacy only for old code: `jest.useFakeTimers({ legacyFakeTimers: true })`. Legacy timers
don't fake `Date` and don't support the newer APIs.

## 10.10 Summary

- `jest.useFakeTimers()` fakes timers, `Date`, `performance.now`, `queueMicrotask`, `nextTick`, rAF…
  but **not Promises**.
- Drive time with `advanceTimersByTime`, `runOnlyPendingTimers`, `advanceTimersToNextTimer`.
  Avoid `runAllTimers` with recursive timers.
- When `await` and timers mix, use the **Async** variants.
- Set dates with `now`/`setSystemTime`.
- Use `doNotFake` for libraries that rely on `nextTick`/`setImmediate`.
- With user-event: `advanceTimers: jest.advanceTimersByTime`; wrap manual advances in `act`.

**Next:** [Part 3 — Chapter 11: Snapshot testing](../part-3-tooling/11-snapshot-testing.md)
