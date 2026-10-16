# Chapter 7 — Mock Functions (`jest.fn`) In Depth

> 🧸 **Explain it like I'm 5**
>
> A **mock function** is a toy telephone. When someone calls it, nobody real answers — but the
> toy phone **remembers every call**: who called, what they said, and what it answered.
> You can also **program** what the toy phone answers ("say 'hello' the first time, then 'bye'").
> Later you look at the toy phone's memory and check: "Was I called? How many times? With what?"

---

## 7.1 Why mock at all?

Your code talks to things you don't want in a unit test:

- the network (slow, flaky, costs money, needs credentials),
- databases, files, the clock, random numbers,
- other modules whose behaviour you don't want to test right now,
- callbacks provided by the caller (did my code call the callback correctly?).

A mock lets you:

1. **Control** what the dependency returns (including errors), to drive your code down each path.
2. **Observe** how your code used the dependency (calls, arguments, order).

## 7.2 Creating a mock function

```js
const fn = jest.fn();               // returns undefined, records calls
const add = jest.fn((a, b) => a + b); // with an implementation

fn('hello', 42);
add(1, 2);                          // → 3
```

A mock function is a real function, so it can be passed anywhere a function is expected (callbacks,
dependency injection, object methods).

```js
function forEach(items, callback) {
  for (const item of items) callback(item);
}

test('calls the callback for each item', () => {
  const callback = jest.fn();
  forEach(['a', 'b'], callback);

  expect(callback).toHaveBeenCalledTimes(2);
  expect(callback).toHaveBeenNthCalledWith(1, 'a');
  expect(callback).toHaveBeenNthCalledWith(2, 'b');
});
```

`jest.isMockFunction(x)` tells you whether `x` is a mock.

## 7.3 The `.mock` property — the toy phone's memory

Every mock has `fn.mock` with:

| Property | Contains |
| --- | --- |
| `mock.calls` | array of argument arrays: `[['hello', 42], ...]` |
| `mock.lastCall` | arguments of the last call (or `undefined`) |
| `mock.results` | array of `{ type, value }` per call. `type`: `'return'`, `'throw'`, or `'incomplete'` (call still running, e.g. during recursion) |
| `mock.instances` | the `this` value of each call — for `new fn()` calls, the created instance (plain calls in strict code record `undefined`) |
| `mock.contexts` | the `this` value of each call (e.g. the object the method was called on, or the value passed to `.call`) |

```js
const fn = jest.fn((x) => {
  if (x < 0) throw new Error('negative');
  return x * 2;
});

fn(2);
try { fn(-1); } catch {}

fn.mock.calls;    // [[2], [-1]]
fn.mock.results;  // [{type:'return', value:4}, {type:'throw', value: Error('negative')}]
fn.mock.lastCall; // [-1]
```

⚠️ **Arguments are stored by reference.** If your code mutates an object after passing it, the
recorded call shows the **mutated** object (verified):

```js
const m = jest.fn();
const obj = { n: 1 };
m(obj);
obj.n = 2;
m.mock.calls[0][0].n; // 2  ← not 1!
```

This causes confusing failures like "expected to be called with `{status:'pending'}` but received
`{status:'done'}`" when the code mutates the same object later. Fix: make the code immutable, or
snapshot the args in an implementation: `jest.fn((o) => recorded.push(structuredClone(o)))`.

⚠️ `mockClear()` **replaces** the `mock` object; don't keep `const calls = fn.mock.calls` around
across clears.

## 7.4 Programming return values

| Method | Effect |
| --- | --- |
| `mockReturnValue(v)` | always return `v` |
| `mockReturnValueOnce(v)` | return `v` for the next call only (queue) |
| `mockImplementation(fn)` | use `fn` as the body |
| `mockImplementationOnce(fn)` | use `fn` for the next call only (queue) |
| `mockResolvedValue(v)` | return `Promise.resolve(v)` |
| `mockResolvedValueOnce(v)` | … once |
| `mockRejectedValue(err)` | return `Promise.reject(err)` |
| `mockRejectedValueOnce(err)` | … once |
| `mockReturnThis()` | return `this` (for chainable APIs) |
| `mockName(name)` | name shown in failure messages |
| `withImplementation(fn, callback)` | temporarily use `fn` while `callback` runs |
| `whenCalledWith(...args)` | 📌 Jest 30.5+: behaviour per argument list (see 7.6) |

All of these return the mock, so they chain.

### Precedence (verified)

1. **`*Once` queue first**, in the order added (`mockReturnValueOnce` and `mockImplementationOnce`
   share one queue).
2. When the queue is empty: the **default implementation** — the last of `mockImplementation`,
   `mockReturnValue`, `mockResolvedValue`, … or the function passed to `jest.fn(impl)`.
   `mockReturnValue(v)` *is* `mockImplementation(() => v)`, so it **replaces** the
   `jest.fn(impl)` body.
3. No implementation at all → returns `undefined`.

```js
const h = jest.fn()
  .mockReturnValue('default')
  .mockReturnValueOnce('first')
  .mockImplementationOnce(() => 'second');

h(); // 'first'
h(); // 'second'
h(); // 'default'
h(); // 'default'
```

### Async mocks

```js
const getUser = jest.fn();
getUser
  .mockResolvedValueOnce({ id: 1, name: 'Ann' })    // 1st call succeeds
  .mockRejectedValueOnce(new Error('timeout'))      // 2nd call fails
  .mockResolvedValue({ id: 0, name: 'default' });   // later calls
```

⚠️ `mockResolvedValue` always returns a promise, so `await` it in the code under test. If the real
function is synchronous, use `mockReturnValue` — mismatches here produce `[object Promise]` bugs.

⚠️ `mockRejectedValue(err)`: the rejected promise is created **when the mock is called**, so it
won't cause unhandled-rejection noise if unused.

### `mockReturnThis` — fluent/chainable APIs

```js
const query = {
  select: jest.fn().mockReturnThis(),
  where: jest.fn().mockReturnThis(),
  limit: jest.fn().mockResolvedValue([{ id: 1 }]),
};

await query.select('*').where({ active: true }).limit(10);
expect(query.where).toHaveBeenCalledWith({ active: true });
```

### `mockName` — readable failures

```js
const fetchUser = jest.fn().mockName('fetchUser');
expect(fetchUser).toHaveBeenCalled();
// expect(fetchUser).toHaveBeenCalled()   ← instead of expect(jest.fn()).toHaveBeenCalled()
```

### `withImplementation` — temporary behaviour

```js
const random = jest.fn(() => 0.5);

random.withImplementation(() => 0.99, () => {
  expect(random()).toBe(0.99);   // inside: temporary impl
});
expect(random()).toBe(0.5);      // after: original impl back
```

If the callback returns a promise, `withImplementation` returns a promise — `await` it.

## 7.5 Implementations that depend on arguments

Before Jest 30.5 the usual way:

```js
const getPrice = jest.fn((sku) => {
  switch (sku) {
    case 'APPLE': return 1.2;
    case 'PEAR': return 0.8;
    default: throw new Error(`unknown sku ${sku}`);
  }
});
```

✅ Throwing on unexpected input is a great trick: if your code calls the dependency with something
wrong, the test fails loudly instead of silently returning `undefined`.

## 7.6 `whenCalledWith` (📌 new in Jest 30.5)

```js
const fn = jest.fn();
fn.whenCalledWith('apple').mockReturnValue('red');
fn.whenCalledWith('banana').mockReturnValue('yellow');
fn.whenCalledWith(expect.any(Number)).mockReturnValue('numeric');

fn('apple');  // 'red'
fn('banana'); // 'yellow'
fn(42);       // 'numeric'
fn('grape');  // undefined (falls through to the base mock)
```

- Each slot accepts a literal (deep equality) or an asymmetric matcher.
- Arity matters: `whenCalledWith('a')` matches `fn('a')` but not `fn('a', 'b')`.
- Works with `mockReturnValueOnce`, `mockResolvedValue`, `mockRejectedValue`,
  `mockImplementation` etc. on the returned sub-mock.
- Precedence: base `*Once` queue → earliest matching branch with a queued once → last-registered
  matching persistent branch → base implementation.
- Works on spies too: unmatched calls go to the original method.
- `mockReset()` on the parent removes all registrations.

(Only available in Jest ≥ 30.5. On older versions use the `switch` approach.)

## 7.7 Mock matchers — asserting on calls

```js
expect(fn).toHaveBeenCalled();
expect(fn).not.toHaveBeenCalled();
expect(fn).toHaveBeenCalledTimes(2);
expect(fn).toHaveBeenCalledWith('a', expect.any(Number));  // ANY call matches
expect(fn).toHaveBeenLastCalledWith('b', 2);
expect(fn).toHaveBeenNthCalledWith(1, 'a', 1);             // 1-based!
expect(fn).toHaveReturned();
expect(fn).toHaveReturnedTimes(2);
expect(fn).toHaveReturnedWith(4);
expect(fn).toHaveLastReturnedWith(4);
expect(fn).toHaveNthReturnedWith(1, 2);
```

Notes:

- `toHaveBeenCalledWith` uses the same recursive equality as `toEqual` and passes if **any** call
  matches. To check the only call: combine with `toHaveBeenCalledTimes(1)`.
- Arguments must match **exactly in count**. Verified: after `fn('a', undefined)`,
  `expect(fn).toHaveBeenCalledWith('a')` **fails** with `Expected: "a"` / `Received: "a", undefined`.
  Write `toHaveBeenCalledWith('a', undefined)`. (This is different from `toEqual` on objects,
  which ignores `undefined` properties.)
- `toHaveReturnedWith` for async functions sees the **promise**, not the resolved value. Assert on
  the awaited result of your code instead.
- 📌 Jest 30 TypeScript: `toHaveBeenCalledWith` arguments are type-checked against the mock's
  parameter types.

Asserting **call order across different mocks**:

```js
// jest built-ins can't do it directly. Option 1: compare invocationCallOrder
expect(open.mock.invocationCallOrder[0]).toBeLessThan(write.mock.invocationCallOrder[0]);

// Option 2: one shared log
const calls = [];
const open = jest.fn(() => calls.push('open'));
const write = jest.fn(() => calls.push('write'));
// ...
expect(calls).toEqual(['open', 'write']);

// Option 3: jest-extended's toHaveBeenCalledBefore
```

(`mock.invocationCallOrder` is an array of global sequence numbers, one per call, shared across all
mocks.)

Prefer direct inspection when matchers get awkward:

```js
const [[firstArg]] = fn.mock.calls;           // destructure the first call
expect(firstArg).toMatchObject({ type: 'CREATE' });
```

## 7.8 Dependency injection: the easiest way to use mocks

If your code receives its dependencies (instead of importing them), you can pass mocks directly —
no module mocking needed:

```js
// src/orderService.js
class OrderService {
  constructor({ paymentGateway, emailer, clock = () => new Date() }) {
    this.paymentGateway = paymentGateway;
    this.emailer = emailer;
    this.clock = clock;
  }
  async placeOrder(order) {
    const charge = await this.paymentGateway.charge(order.total, order.card);
    if (!charge.ok) throw new Error('Payment declined');
    await this.emailer.send(order.email, `Thanks! Paid at ${this.clock().toISOString()}`);
    return { id: charge.id, status: 'paid' };
  }
}
module.exports = { OrderService };
```

```js
// src/orderService.test.js
const { OrderService } = require('./orderService');

function setup() {
  const paymentGateway = { charge: jest.fn().mockResolvedValue({ ok: true, id: 'ch_1' }) };
  const emailer = { send: jest.fn().mockResolvedValue(undefined) };
  const clock = () => new Date('2024-01-01T00:00:00Z');
  const service = new OrderService({ paymentGateway, emailer, clock });
  return { service, paymentGateway, emailer };
}

const order = { total: 50, card: 'tok_visa', email: 'ann@example.com' };

test('charges the card and emails a receipt', async () => {
  const { service, paymentGateway, emailer } = setup();

  await expect(service.placeOrder(order)).resolves.toEqual({ id: 'ch_1', status: 'paid' });

  expect(paymentGateway.charge).toHaveBeenCalledWith(50, 'tok_visa');
  expect(emailer.send).toHaveBeenCalledWith(
    'ann@example.com',
    'Thanks! Paid at 2024-01-01T00:00:00.000Z',
  );
});

test('does not email when payment is declined', async () => {
  const { service, paymentGateway, emailer } = setup();
  paymentGateway.charge.mockResolvedValueOnce({ ok: false });

  await expect(service.placeOrder(order)).rejects.toThrow('Payment declined');
  expect(emailer.send).not.toHaveBeenCalled();
});
```

💼 Dependency injection makes tests simpler and more robust than `jest.mock` for your own code.
Use module mocking mainly for things you can't inject (third-party modules, legacy code).

## 7.9 Clear vs Reset vs Restore (🎯 asked in almost every interview)

| Action | Wipes call history (`mock.calls`, `results`, `instances`, `contexts`) | Removes programmed behaviour (impl, return values, once-queue) | Puts back the ORIGINAL function |
| --- | --- | --- | --- |
| `mockFn.mockClear()` | ✅ | ❌ | ❌ |
| `mockFn.mockReset()` | ✅ | ✅ (mock now returns `undefined`) | ❌ |
| `mockFn.mockRestore()` | ✅ | ✅ | ✅ (only for `jest.spyOn` / `replaceProperty`) |

Global versions (affect every mock):

| Function | Config option (runs before each test) | CLI flag |
| --- | --- | --- |
| `jest.clearAllMocks()` | `clearMocks: true` | `--clearMocks` |
| `jest.resetAllMocks()` | `resetMocks: true` | `--resetMocks` |
| `jest.restoreAllMocks()` | `restoreMocks: true` | `--restoreMocks` |

🧸 Picture a toy phone:
- **clear** = erase the call log.
- **reset** = erase the log **and** the programmed answers (it now says nothing).
- **restore** = take the toy phone away and plug the **real** phone back in.

Verified details on Jest 30.5 (these surprise even experienced people):

```js
const obj = { greet: () => 'real' };
const spy = jest.spyOn(obj, 'greet').mockReturnValue('fake');

spy.mockReset();
obj.greet();            // undefined  ← reset does NOT go back to the real method
jest.isMockFunction(obj.greet); // true (still a spy)

spy.mockRestore();
obj.greet();            // 'real' — original back, no longer a mock
```

```js
const fn = jest.fn(() => 'impl');
fn();
jest.restoreAllMocks();
fn();                   // 'impl' — restoreAllMocks does NOT touch plain jest.fn()
fn.mock.calls.length;   // 2      — and does not clear its calls either
```

📌 **Version note:** `jest.restoreAllMocks()` only affects mocks created with `jest.spyOn()` and
properties replaced with `jest.replaceProperty()`. In Jest 30 its implementation literally loops over
the registered spies and restores them, nothing else. Some older Jest versions also wiped the state
of every mock as a side effect, and old blog posts rely on that. Don't: if you want call history
cleared, use `clearMocks: true` / `jest.clearAllMocks()` explicitly.

⚠️ **`resetMocks: true` gotcha:** it removes implementations **before every test**, including ones
defined in `jest.mock()` factories and at the top of the file:

```js
jest.mock('./api', () => ({ getUser: jest.fn(() => Promise.resolve({ id: 1 })) }));
// with resetMocks: true, getUser returns undefined inside every test!
```

Set implementations inside `beforeEach` (or in the test) when using `resetMocks`.

✅ **Recommended org default:** `clearMocks: true` + `restoreMocks: true`. Set behaviour inside each
test or a `setup()` helper.

## 7.10 Typing mocks in TypeScript

```ts
import { jest } from '@jest/globals';

// Typed from an implementation
const add = jest.fn((a: number, b: number) => a + b);

// Typed from a function type
const fetchUser = jest.fn<(id: number) => Promise<User>>();
fetchUser.mockResolvedValue({ id: 1, name: 'Ann' }); // type-checked

// Typing an already-mocked module function
import { getUser } from './api';
jest.mock('./api');
const mockedGetUser = jest.mocked(getUser);           // type: jest.MockedFunction<typeof getUser>
mockedGetUser.mockResolvedValue({ id: 1, name: 'Ann' });

// Deep: jest.mocked(obj, { shallow: false }) is the default deep typing
```

Useful types: `jest.Mock<T>`, `jest.Mocked<T>`, `jest.MockedFunction<T>`, `jest.MockedClass<T>`,
`jest.Spied<T>`, `jest.Replaced<T>`. (`jest.SpyInstance` was removed from `@jest/globals` types in
Jest 30 — use `jest.Spied`.)

With `@types/jest` (global types) the same helpers exist under the global `jest` namespace.

## 7.11 Disposable mocks with `using` (📌 Jest 30)

Mocks and spies implement `Symbol.dispose`. With the explicit resource management syntax
(TypeScript 5.2+ or a Babel plugin, and a runtime that supports it), the mock is restored when the
block ends:

```ts
test('logs a warning', () => {
  using spy = jest.spyOn(console, 'warn');
  doSomethingWarnWorthy();
  expect(spy).toHaveBeenCalled();
}); // spy.mockRestore() happens automatically here
```

## 7.12 Common mock-function mistakes

| Mistake | Symptom | Fix |
| --- | --- | --- |
| Asserting before the async code ran | "expected to be called" fails though code calls it | `await` the action first (or use `waitFor`) |
| Calls accumulate across tests | `toHaveBeenCalledTimes(1)` gets 2 | `clearMocks: true` or `jest.clearAllMocks()` in `beforeEach` |
| Implementation lost | mock returns `undefined` unexpectedly | `resetMocks` is on, or `mockReset()` was called — re-set in `beforeEach` |
| `mockResolvedValue` on sync code | code gets a Promise object | use `mockReturnValue` |
| Spying on the wrong object | spy never called | see Chapter 9 §9.3 (internal calls / destructured imports) |
| Args mutated after call | confusing "received" values | avoid mutation or clone in impl |
| Checking `mock.calls[0]` without checking count | passes even if called 5 times | add `toHaveBeenCalledTimes` |

## 7.13 Summary

- `jest.fn()` records calls and can be programmed (`mockReturnValue`, `mockResolvedValue`,
  `mockImplementation`, `*Once`, `whenCalledWith`).
- `.mock.calls/results/instances/contexts/lastCall` are the memory.
- Precedence: once-queue → default implementation → `undefined`.
- clear (history) < reset (+behaviour) < restore (+original, spies only).
- Prefer dependency injection; use `jest.mocked` for typing.

**Next:** [Chapter 8 — Module mocking](08-module-mocking.md)
