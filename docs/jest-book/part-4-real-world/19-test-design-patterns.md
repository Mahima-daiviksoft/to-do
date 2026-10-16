# Chapter 19 — Test Design: Patterns, TDD, Test Doubles, Testable Code

> 🧸 **Explain it like I'm 5**
>
> Knowing how to use a hammer (Jest) is not the same as knowing how to build a good house
> (good tests). This chapter is about **building good houses**: which pretend-things to use, how to
> write the check before the code, how to pick the inputs that catch the most bugs, and how to
> shape your code so it's easy to check.

---

## 19.1 Test doubles — the precise vocabulary (🎯 interview classic)

From Gerard Meszaros' *xUnit Test Patterns* (popularised by Martin Fowler):

| Double | What it is | Example in Jest |
| --- | --- | --- |
| **Dummy** | passed around, never used | `new Service(null, dummyLogger)` where `dummyLogger = {}` |
| **Stub** | returns canned answers, no verification | `jest.fn().mockReturnValue(42)` used only to drive code |
| **Spy** | records how it was called (may call through) | `jest.spyOn(obj, 'm')` then `toHaveBeenCalledWith` |
| **Mock** | pre-programmed with **expectations**; the test verifies the interactions | `jest.fn()` + `expect(fn).toHaveBeenCalledWith(...)` |
| **Fake** | a working, simplified implementation | in-memory repository, `memfs`, MSW handlers, SQLite |

In Jest, `jest.fn()` can play stub, spy or mock depending on how you use it. In interviews, show you
know the difference between **state verification** (check the result/state — stubs & fakes) and
**behaviour verification** (check the calls — mocks & spies).

✅ Prefer **state verification** and **fakes** where possible; tests that verify many internal calls
are tightly coupled to the implementation and break on refactor.

## 19.2 Two schools of unit testing

| | Classical (Detroit / "Chicago") | Mockist (London) |
| --- | --- | --- |
| Unit = | a unit of **behaviour** (may span several classes) | a single class/function |
| Collaborators | real ones; double only awkward ones (DB, network, time) | double all collaborators |
| Verification | mostly state | mostly interactions |
| Pros | refactor-friendly, realistic | pinpoints failures, drives interface design (outside-in TDD) |
| Cons | failures can be less localised | brittle, over-mocked tests that pass while the system is broken |

💼 Most modern teams lean classical, mocking only at **architectural boundaries** (I/O, time,
randomness, third-party services).

## 19.3 What to mock — and what not to

Mock / fake:
- network (HTTP, gRPC), databases (in unit tests), file system, email/SMS/payment providers,
- time (`Date`, timers), randomness (UUIDs, `Math.random`),
- slow or nondeterministic things, things with side effects you can't undo,
- heavy UI widgets that jsdom can't render (maps, canvas charts).

Don't mock:
- the unit under test (!),
- simple value objects, pure helpers, your own small modules that are fast and deterministic,
- language/runtime features you don't own in ways that break their contract,
- **"Don't mock what you don't own"**: rather than mocking a third-party SDK's deep API in many
  tests, wrap it in your own small adapter (`paymentGateway.charge()`), mock **your** adapter in
  unit tests, and test the adapter itself against the real SDK/sandbox or MSW.

⚠️ Over-mocking smell: the test's mock setup is longer than the code under test, or the test just
re-states the implementation line by line.

## 19.4 TDD — Test-Driven Development

The cycle:

1. 🔴 **Red** — write a small failing test for the next bit of behaviour.
2. 🟢 **Green** — write the simplest code that passes.
3. 🔵 **Refactor** — clean up code and tests while staying green.

### Worked example: a `FizzBuzz`-like price formatter

Step 1 — red:

```js
const { formatPrice } = require('./formatPrice');

test('formats whole dollars', () => {
  expect(formatPrice(500)).toBe('$5.00');          // cents in, string out
});
```

Fails: `Cannot find module './formatPrice'`. Create it:

```js
function formatPrice(cents) {
  return '$5.00';                                   // simplest thing (yes, really)
}
module.exports = { formatPrice };
```

Step 2 — next test forces real logic:

```js
test('formats cents', () => {
  expect(formatPrice(1999)).toBe('$19.99');
});
```

```js
function formatPrice(cents) {
  return `$${(cents / 100).toFixed(2)}`;
}
```

Step 3 — edge cases drive the rest:

```js
test.each([
  [0, '$0.00'],
  [5, '$0.05'],
  [-250, '-$2.50'],
  [123456789, '$1,234,567.89'],
])('formatPrice(%i) -> %s', (cents, expected) => {
  expect(formatPrice(cents)).toBe(expected);
});

test('rejects non-integers', () => {
  expect(() => formatPrice(1.5)).toThrow(TypeError);
});
```

```js
function formatPrice(cents) {
  if (!Number.isInteger(cents)) throw new TypeError('cents must be an integer');
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  const dollars = Math.floor(abs / 100).toLocaleString('en-US');
  const rest = String(abs % 100).padStart(2, '0');
  return `${sign}$${dollars}.${rest}`;
}
```

Refactor with confidence: the table protects you.

Benefits: forces testable design, every line has a reason, fast feedback, built-in regression suite.
Costs: slower start, harder for exploratory/UI work, needs discipline.

🎯 Interview tip: describe Red-Green-Refactor, "simplest thing that could possibly work",
triangulation (adding examples until the general solution is forced), and that TDD is a **design**
technique as much as a testing one.

### BDD flavour

Same cycle, but tests are phrased as behaviour in domain language:

```js
describe('Given a member with a 10% discount', () => {
  describe('when they check out a $100 cart', () => {
    it('then they pay $90', () => { /* ... */ });
  });
});
```

(Cucumber/Gherkin `.feature` files can run on Jest with `jest-cucumber`.)

## 19.5 Choosing inputs that find bugs

### Equivalence partitioning

Split inputs into groups that should behave the same; test one from each.
For "age must be 18–65": `< 18`, `18–65`, `> 65`, non-number.

### Boundary value analysis

Bugs live at edges. Test `17, 18, 19` and `64, 65, 66`.

```js
test.each([
  [17, false], [18, true], [19, true],
  [64, true], [65, true], [66, false],
])('isEligible(%i) === %s', (age, ok) => {
  expect(isEligible(age)).toBe(ok);
});
```

### The "ZOMBIES" checklist (James Grenning)

**Z**ero, **O**ne, **M**any, **B**oundaries, **I**nterfaces, **E**xceptions, **S**imple scenarios.

### Classic edge cases list

- empty string / array / object, `null`, `undefined`, `NaN`, `0`, `-0`, negative numbers,
- very large numbers, floating point (`0.1 + 0.2`), bigint,
- unicode, emoji (`'👍'.length === 2`), RTL text, whitespace-only strings,
- duplicates, unsorted input, already-sorted input,
- time zones, DST changes, leap years (Feb 29), end of month, year boundary,
- concurrency: double submit, out-of-order responses, retries,
- permissions: anonymous, wrong role, owner vs non-owner.

### Property-based testing (fast-check)

Instead of examples, state a **rule** and let the library try hundreds of random inputs
(and shrink failures to the smallest counter-example):

```js
const fc = require('fast-check');

test('sorting is idempotent and keeps length', () => {
  fc.assert(
    fc.property(fc.array(fc.integer()), (arr) => {
      const once = mySort(arr);
      expect(mySort(once)).toEqual(once);
      expect(once).toHaveLength(arr.length);
    }),
  );
});

test('decode(encode(x)) === x', () => {
  fc.assert(fc.property(fc.string(), (s) => decode(encode(s)) === s));
});
```

Great for parsers, serializers, math, data structures. (`@fast-check/jest` adds `test.prop`
helpers.)

## 19.6 Writing testable code

| Principle | Instead of | Do |
| --- | --- | --- |
| **Dependency injection** | `import db from './db'` used deep inside | pass `db` in (constructor/function param/factory) |
| **Pure functions** | functions reading globals/time/env | compute from inputs only; pass `now`, `config` |
| **Functional core, imperative shell** | logic mixed with I/O | pure decision-making core + thin I/O layer |
| **Small modules** | a 2,000-line `utils.js` | focused modules (also mockable separately) |
| **Seams** | `new Date()`/`fetch` sprinkled everywhere | wrap in `clock.now()`, `httpClient.get()` |
| **No import-time side effects** | connecting to DB at module top level | connect in an `init()` |
| **Return values over mutation** | functions that mutate arguments | return new values (also avoids the mock-args-by-reference trap) |

Example — before:

```js
async function sendReminders() {
  const users = await db.query('SELECT * FROM users');
  for (const u of users) {
    if (new Date() - u.lastLogin > 30 * 24 * 3600 * 1000) {
      await mailer.send(u.email, 'We miss you!');
    }
  }
}
```

After (functional core + shell):

```js
const DAY = 24 * 3600 * 1000;

function usersToRemind(users, now) {                 // pure → trivial to test
  return users.filter((u) => now - u.lastLogin > 30 * DAY);
}

async function sendReminders({ db, mailer, now = Date.now() }) { // shell → 1-2 integration tests
  const users = await db.query('SELECT * FROM users');
  await Promise.all(usersToRemind(users, now).map((u) => mailer.send(u.email, 'We miss you!')));
}
```

## 19.7 Structuring test code

- **DAMP over DRY in tests** ("Descriptive And Meaningful Phrases"): some repetition is fine if it
  makes each test readable on its own. Extract helpers for *noise*, not for *meaning*.
- **Test data builders / object mothers** (`buildUser({ role: 'admin' })`) — defaults + overrides.
- **One logical assertion per test** (multiple `expect`s are fine if they check one behaviour).
- **No logic in tests** — no `if`/loops computing expected values (that re-implements the code).
  `eslint-plugin-jest`'s `no-conditional-in-test` / `no-conditional-expect` help.
- **Arrange-Act-Assert** blocks separated by blank lines.
- **Helpers named for intent**: `await fillShippingForm(user, address)` instead of 10 lines of typing
  repeated.
- **Custom matchers** for repeated domain checks (`expect(order).toBeShippable()`, Chapter 20).

## 19.8 Test smells (and fixes)

| Smell | Symptom | Fix |
| --- | --- | --- |
| **Fragile test** | breaks on refactor without behaviour change | test via public API / user-visible behaviour |
| **Mystery guest** | data comes from a fixture file far away | build data in the test / builder with explicit overrides |
| **Eager test** | one test checks 10 behaviours | split |
| **Assertion roulette** | many asserts, unclear which failed | descriptive test names; custom matcher messages |
| **Sleepy test** | `await sleep(1000)` | fake timers, `waitFor`, events |
| **Flaky test** | random failures | Chapter 24 playbook |
| **Over-mocking** | mocks everywhere, test mirrors implementation | mock only boundaries; use fakes |
| **Conditional test logic** | `if` inside tests | separate tests / `test.each` |
| **Test interdependence** | passes only in order | fresh state per test; `--randomize` |
| **Giant snapshot** | 500-line `.snap` changes | targeted assertions |
| **Testing private internals** | exporting functions "for tests" | test through public API; extract a real module if needed |
| **Slow suite** | minutes for unit tests | Chapter 22 |
| **Commented-out / skipped tests** | `xit`, `.skip` forever | delete or fix with an owner and ticket |

## 19.9 Legacy code: characterization tests

When you must change untested code:

1. Write **characterization tests** that record what the code does *now* (snapshots or explicit
   assertions — even if the behaviour looks wrong).
2. Find **seams** to break dependencies (inject, wrap globals, extract functions).
3. Refactor in small steps, keeping tests green.
4. Then fix the bug with a regular failing test first.

(Michael Feathers, *Working Effectively with Legacy Code*.)

## 19.10 Mutation testing — testing your tests

Tools like **Stryker** (`@stryker-mutator/core` + Jest runner) change your code (flip `>` to `>=`,
remove a call, replace `true` with `false`) and re-run the tests. If tests still pass, that
"mutant survived" → your tests are weak there. Mutation score is a better quality signal than line
coverage, but it's slow; run it nightly or on critical modules.

## 19.11 Summary

- Know dummy/stub/spy/mock/fake and state vs behaviour verification.
- Mock at boundaries; don't mock what you don't own — wrap it.
- TDD: red → green → refactor; triangulate with examples.
- Use partitions, boundaries, edge-case lists, and property-based testing to choose inputs.
- Design for testability: DI, pure core, seams, no import-time side effects.
- Recognise and fix test smells.

**Next:** [Part 5 — Chapter 20: Extending Jest](../part-5-advanced/20-extending-jest.md)
