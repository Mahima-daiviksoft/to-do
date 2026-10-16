# Chapter 3 — Anatomy of a Test

> 🧸 **Explain it like I'm 5**
>
> A test file is like a **school report card**.
> - `describe` is a **subject** ("Maths").
> - `test` (or `it`) is **one question** in that subject ("Can you add 2 + 2?").
> - `expect(...).toBe(...)` is **the teacher checking the answer** ("You said 4 — correct!").

---

## 3.1 The three building blocks

```js
describe('Calculator', () => {              // a group (subject)
  test('adds two numbers', () => {          // one test case (question)
    expect(add(2, 2)).toBe(4);              // an assertion (answer check)
  });
});
```

These are **globals** that Jest puts into every test file: `describe`, `test`, `it`, `expect`,
`beforeAll`, `beforeEach`, `afterEach`, `afterAll`, `jest`. You don't import them (unless you set
`injectGlobals: false`, then you import them from `@jest/globals`).

## 3.2 `test(name, fn, timeout?)` and `it`

- `name` — a string describing the behaviour.
- `fn` — the function containing the assertions. Can be sync, `async`, return a promise, or take a
  `done` callback (Chapter 5).
- `timeout` (optional) — ms before the test is failed for taking too long. Default: **5000 ms**
  (`testTimeout` config).

**`it` is an exact alias of `test`.** They exist so tests read nicely:

```js
describe('Stack', () => {
  it('starts empty', () => { /* ... */ });          // "Stack: it starts empty"
  test('push adds an item to the top', () => {});    // fine too
});
```

💼 Teams usually pick one style. `it` reads well inside `describe` ("it should ..."), `test` reads
well at top level.

### What a test function may return

A test passes if its function **finishes without throwing** (and, if it returns a promise, the
promise resolves). It fails if anything throws or the promise rejects.

⚠️ A test function must return **`undefined` or a Promise**. An arrow function with an expression
body returns its value:

```js
const log = [];
test('oops', () => log.push('x'));   // push returns 1 → test FAILS
```

Jest 30 output:

```
● oops
  test functions can only return Promise or undefined.
  Returned value: 1
```

Fix: use braces — `() => { log.push('x'); }`.

### Tests with no assertions pass!

```js
test('does nothing', () => {});   // ✅ passes
```

A test with zero `expect` calls passes as long as it doesn't throw. That's why `expect.assertions(n)`
and `expect.hasAssertions()` exist (Chapter 5), and why "see it fail once" matters.

## 3.3 `describe(name, fn)` — grouping

Purposes:

1. **Organise** output (nested names).
2. **Scope hooks** (`beforeEach` inside a `describe` only applies to its tests).
3. Apply **modifiers** to a whole group (`describe.skip`, `describe.only`, `describe.each`).

```js
describe('ShoppingCart', () => {
  describe('when empty', () => {
    it('has total 0', () => {});
  });

  describe('with one item', () => {
    it('has total equal to the item price', () => {});
  });
});
```

Reported as:

```
ShoppingCart
  when empty
    ✓ has total 0
  with one item
    ✓ has total equal to the item price
```

The **full name** of a test is all names joined by spaces: `"ShoppingCart when empty has total 0"`.
This full name is what `-t / --testNamePattern` matches against, and what snapshot keys use.

### Rules for `describe`

- The callback must be **synchronous** and must **not return a value**.
  - `describe('x', async () => {...})` → `Returning a Promise from "describe" is not supported. Tests must be defined synchronously.`
  - `describe('x', () => 5)` → `A "describe" callback must not return a value.`
- Tests cannot be nested inside tests:
  `Tests cannot be nested. Test "inner" cannot run because it is nested within "outer".`
- Hooks cannot be declared inside tests:
  `Hooks cannot be defined inside tests. Hook of type "beforeEach" is nested within "...".`

## 3.4 🔍 The two phases: collection then execution (very important!)

Jest runs a test file in **two phases**:

1. **Collection (registration) phase** — Jest executes the file top to bottom. Every `describe`
   callback runs **immediately**, and every `test(...)` / hook call just **registers** a function to
   run later.
2. **Execution phase** — Jest runs the registered hooks and tests in order.

```js
console.log('1 file top');

describe('A', () => {
  console.log('2 inside describe A');
  beforeEach(() => console.log('5 beforeEach'));
  test('t1', () => console.log('6 test t1'));
  console.log('3 end of describe A');
});

console.log('4 file bottom');
```

Output order: `1, 2, 3, 4, 5, 6`.

⚠️ **Classic bug:** doing setup work directly in a `describe` body:

```js
describe('users', () => {
  const db = connect();          // ❌ runs at COLLECTION time, for every describe, even skipped ones
  seedDatabase(db);              // ❌ and before ANY beforeAll hook of outer scopes
  test('...', () => {});
});
```

✅ Put setup inside hooks (`beforeAll`, `beforeEach`) so it runs at the right time.

🎯 **Interview point:** "Why does my `describe` code run before my `beforeAll`?" — because describe
bodies run during collection; hooks and tests run during execution.

## 3.5 Focusing and skipping: `.only`, `.skip`, `x`, `f`

| Code | Effect |
| --- | --- |
| `test.only(...)` / `it.only` / `fit` | In **this file**, run only tests marked `.only` |
| `describe.only(...)` / `fdescribe` | Only run this group (in this file) |
| `test.skip(...)` / `it.skip` / `xit` / `xtest` | Skip this test (reported as "skipped") |
| `describe.skip(...)` / `xdescribe` | Skip the whole group |
| `test.todo('name')` | Placeholder for a test you plan to write (no function allowed) |

```js
test.todo('handles network timeout');
```

Output summary shows `Tests: 1 todo, ...`.

⚠️ `.only` only affects the **file** it's in. Other files still run. To run one file, also pass its
path: `npx jest cart.test.js`.

⚠️ **Never commit `.only`!** It silently disables the rest of the file in CI. Use
`eslint-plugin-jest`'s `no-focused-tests` rule and/or run CI with `--ci` (Jest doesn't block `.only`
by itself — the lint rule does).

💼 Skipped tests rot. Organisational rule of thumb: every `.skip` needs a linked ticket and an owner.

## 3.6 `test.failing` — "I expect this to fail"

```js
test.failing('known bug #123: rounding is wrong', () => {
  expect(roundPrice(1.005)).toBe(1.01); // currently fails
});
```

- Passes if the test **throws/fails**; fails if it **passes**. When someone fixes the bug, the test
  turns red, telling them to convert it to a normal `test`.
- Variants: `test.failing.each`, `test.only.failing`, `test.skip.failing`.
- Only works with the default `jest-circus` runner.

## 3.7 `test.concurrent` — run tests in the same file in parallel

```js
test.concurrent('fetches user 1', async () => {
  expect(await getUser(1)).toBeDefined();
});
test.concurrent('fetches user 2', async () => {
  expect(await getUser(2)).toBeDefined();
});
```

- Tests start together (up to `maxConcurrency`, default **5**).
- Must be **async** (return a promise).
- The official docs label `test.concurrent` **experimental**. Real caveats (verified on Jest 30.5):
  - Concurrent test bodies are **started before `beforeEach` hooks run** for them. In a file with
    `beforeEach(() => log.push('be'))` and two concurrent tests pushing `'a'` and `'b'`, the log
    ends up `a,b,be`. Don't rely on `beforeEach`/`afterEach` to prepare concurrent tests.
  - Shared mutable state between concurrent tests causes races.
  - `expect.assertions()` / `expect.hasAssertions()` are global per file, so they are unreliable
    when tests interleave.
  - ⚠️ Don't declare a parameter on the test function (`async (ctx) => {}`). Jest treats a
    declared parameter as a `done` callback and the test times out waiting for it. (Vitest passes a
    test context with its own `expect`; Jest does **not**.)

✅ Normal advice: avoid `test.concurrent` unless tests are I/O bound and fully independent. Jest
already parallelises **across files** with workers, which is safer.

## 3.8 Data-driven tests: `test.each` / `describe.each`

Write one test body, run it for many inputs.

### Form 1 — array of arrays

```js
test.each([
  [1, 1, 2],
  [1, 2, 3],
  [2, 1, 3],
])('add(%i, %i) -> %i', (a, b, expected) => {
  expect(add(a, b)).toBe(expected);
});
```

Generated names: `add(1, 1) -> 2`, `add(1, 2) -> 3`, ...

### Form 2 — array of objects (named values)

```js
test.each([
  { a: 1, b: 1, expected: 2 },
  { a: 1, b: 2, expected: 3 },
])('add($a, $b) -> $expected', ({ a, b, expected }) => {
  expect(add(a, b)).toBe(expected);
});
```

### Form 3 — tagged template table

```js
test.each`
  a    | b    | expected
  ${1} | ${1} | ${2}
  ${1} | ${2} | ${3}
`('returns $expected when $a is added to $b', ({ a, b, expected }) => {
  expect(add(a, b)).toBe(expected);
});
```

### Form 4 — array of single values

```js
test.each(['admin', 'editor'])('%s can publish', (role) => {
  expect(canPublish(role)).toBe(true);
});
```

### Title placeholders (printf style)

| Placeholder | Prints |
| --- | --- |
| `%p` | pretty-format (any value, nicely printed) |
| `%s` | string |
| `%d` | number (integer part for ints) |
| `%i` | integer |
| `%f` | floating point |
| `%j` | JSON |
| `%o` | object |
| `%#` | index of the test case (0-based) |
| `%$` | number of the test case (1-based) — **new in Jest 30** |
| `%%` | a literal percent sign |

With objects / template tables use **`$variable`**, and you can reach into nested own
properties with a keypath: `$user.name`. The docs say `$variable` can't be mixed with printf
placeholders except `%%`. In tagged-template tables, `$#` gives the row index.

### `describe.each`

```js
describe.each([
  ['USD', '$'],
  ['EUR', '€'],
])('formatMoney in %s', (currency, symbol) => {
  test(`uses ${symbol}`, () => {
    expect(formatMoney(5, currency)).toContain(symbol);
  });
  test('has 2 decimals', () => {
    expect(formatMoney(5, currency)).toMatch(/\.00/);
  });
});
```

Modifiers combine: `test.only.each`, `test.skip.each`, `describe.only.each`, `describe.skip.each`,
`test.concurrent.each`, `test.concurrent.only.each`, `test.concurrent.skip.each`, `test.failing.each`.

⚠️ The table is evaluated during **collection**. Don't build it from async data.

💼 `test.each` is great for edge-case tables (validation rules, parsers, price calculations). Keep
each row readable; if rows need comments or setup, write separate tests instead.

## 3.9 Per-file settings with docblocks

At the **very top** of a test file you can put a docblock comment:

```js
/**
 * @jest-environment jsdom
 */
```

Supported pragmas include:

- `@jest-environment <name>` — which environment (`node`, `jsdom`, or a custom path).
- `@jest-environment-options {"url": "https://example.com/"}` — options as JSON.

This lets a mostly-Node project use jsdom for a few files (or vice versa).

## 3.10 Naming tests well

Good names describe **behaviour + condition + expected result**:

| ❌ Weak | ✅ Strong |
| --- | --- |
| `test('works')` | `test('returns 0 for an empty cart')` |
| `test('login test 2')` | `test('shows an error when the password is wrong')` |
| `test('calls api')` | `test('retries the request once when the server returns 503')` |

Patterns teams use:
- `it('should <do X> when <condition>')`
- `describe('<unit>') > describe('when <condition>') > it('<does X>')`

A failure message then reads like a bug report:
`ShoppingCart › when a coupon is expired › does not apply the discount`.

## 3.11 A complete, realistic example file

```js
// src/password.js
function validatePassword(pw) {
  const errors = [];
  if (typeof pw !== 'string') return ['must be a string'];
  if (pw.length < 8) errors.push('too short');
  if (!/[A-Z]/.test(pw)) errors.push('needs an uppercase letter');
  if (!/\d/.test(pw)) errors.push('needs a digit');
  return errors;
}
module.exports = { validatePassword };
```

```js
// src/password.test.js
const { validatePassword } = require('./password');

describe('validatePassword', () => {
  it('returns no errors for a strong password', () => {
    expect(validatePassword('Abcdefg1')).toEqual([]);
  });

  it('rejects non-strings', () => {
    expect(validatePassword(undefined)).toEqual(['must be a string']);
  });

  test.each([
    ['Ab1', 'too short'],
    ['abcdefg1', 'needs an uppercase letter'],
    ['Abcdefgh', 'needs a digit'],
  ])('"%s" fails with "%s"', (pw, expectedError) => {
    expect(validatePassword(pw)).toContain(expectedError);
  });

  it('reports every problem at once', () => {
    expect(validatePassword('a')).toEqual([
      'too short',
      'needs an uppercase letter',
      'needs a digit',
    ]);
  });

  test.todo('rejects passwords found in breach lists');
});
```

## 3.12 Summary

- `test`/`it` = one case, `describe` = group & hook scope, `expect` = assertion.
- Collection phase runs `describe` bodies; execution phase runs hooks/tests. Put setup in hooks.
- Test functions return `undefined` or a promise; no assertions = pass.
- `.only`, `.skip`, `.todo`, `.failing`, `.concurrent`, `.each` — know them all.
- Name tests as behaviour specs.

**Next:** [Chapter 4 — Matchers: the complete reference](04-matchers.md)
