# Chapter 1 — What Is Testing? (And Why Companies Care)

> 🧸 **Explain it like I'm 5**
>
> Imagine you built a toy car out of LEGO. Before giving it to your friend, you push it to check
> the wheels turn, you press the button to check the horn honks, and you shake it a little to check
> nothing falls off. **That checking is testing.**
>
> Now imagine you have to check **1,000** toy cars, every day, every time someone changes one brick.
> You would get tired and you would miss things. So you build a **robot** that checks the cars for
> you, the same way, every time, in a few seconds. **Jest is that robot for JavaScript code.**

---

## 1.1 What is a "test" in software?

A **test** is a small piece of code that:

1. **Runs** some of your real code (a function, a component, an API endpoint),
2. **Checks** that what happened is what you expected,
3. **Reports** pass ✅ or fail ❌.

```js
// The real code (the "toy car")
function add(a, b) {
  return a + b;
}

// The test (the "robot that checks the car")
test('add puts two numbers together', () => {
  expect(add(2, 3)).toBe(5);
});
```

Read the test out loud: *"Test that add puts two numbers together: expect add of 2 and 3 to be 5."*
Jest tests are designed to read almost like English sentences.

## 1.2 Why do we write tests? (The real reasons)

| Reason | 🧸 Simple picture | What it means in a company |
| --- | --- | --- |
| **Catch bugs early** | Find the loose wheel before your friend crashes | A bug found by a test costs minutes; found by a customer it can cost days, money, reputation |
| **Safe changes (refactoring)** | You can rebuild the car's inside and the robot tells you if it still drives | Teams change code daily; tests are the safety net that lets them move fast |
| **Living documentation** | The robot's checklist explains what the car is supposed to do | New joiners read tests to learn how a module behaves |
| **Better design** | Cars that are easy to check are usually built neatly | Code that is hard to test is usually too coupled; tests push you to cleaner code |
| **Confidence to release** | You can give the car away without worrying | CI runs tests on every pull request; green = safe to merge/deploy |
| **Prevent regressions** | Once a wheel fell off, the robot checks that wheel forever | Every fixed bug gets a test so it never returns ("regression test") |

🎯 **Interview point:** "Why write tests if QA exists?" — Automated tests are fast, repeatable and run
on every change; manual QA is slow and can't re-check everything every time. They complement each
other: automated tests cover logic and regressions; humans explore UX and unexpected behaviour.

## 1.3 Kinds of tests

### Unit tests
Test **one small unit** (a function, a class, a hook) **in isolation**. Dependencies (database,
network, other modules) are usually replaced with fakes (**mocks**).

🧸 Checking just the wheel, on its own, on the table.

- Fast (milliseconds), many of them, very precise when they fail.
- Jest's sweet spot.

### Integration tests
Test **several units working together**: e.g. an API route + its service + a real (test)
database; or a React form + its validation + its child components.

🧸 Checking the wheel attached to the axle attached to the car body.

- Slower, fewer, but catch "the pieces don't fit" bugs that unit tests miss.
- Jest is very commonly used for these too (with Supertest, Testing Library, test databases).

### End-to-end (E2E) tests
Test the **whole application like a real user**: open a real browser/device, click, type, see
results, with a real back end.

🧸 Letting a child actually play with the finished car on the floor.

- Slowest, most brittle, but highest confidence.
- Usually **not** Jest — tools like Playwright, Cypress, Detox (mobile), Appium. (Playwright has its
  own test runner; Detox can use Jest as its runner.)

### Other kinds you should know by name
| Type | What it checks | Typical tool |
| --- | --- | --- |
| **Component test** | A UI component rendered in a fake DOM | Jest + Testing Library |
| **Snapshot test** | Output hasn't changed unexpectedly | Jest snapshots (Ch 11) |
| **Contract test** | Service A and service B agree on the API shape | Pact (often run by Jest) |
| **Smoke test** | "Does it even start?" | Any |
| **Regression test** | A specific old bug stays fixed | Any (usually a unit test) |
| **Property-based test** | A rule holds for *many random inputs* | `fast-check` + Jest |
| **Mutation test** | Are my tests strong enough to notice a code change? | Stryker (supports Jest) |
| **Visual regression** | Pixels didn't change | Chromatic, Percy, Playwright screenshots |
| **Performance / load** | Speed under load | k6, Artillery (not Jest) |
| **Accessibility (a11y)** | Usable with screen readers etc. | `jest-axe`, Testing Library roles |

## 1.4 The testing pyramid (and the trophy)

```
          /\
         /E2E\          few, slow, expensive, high confidence
        /------\
       /Integration\    some
      /--------------\
     /     Unit        \  many, fast, cheap
    /--------------------\
```

**Testing pyramid** (Mike Cohn): lots of unit tests at the bottom, fewer integration tests, very
few E2E tests at the top.

**Testing trophy** (Kent C. Dodds, popular in the React world):

```
      ___
     (E2E)          a few
   (Integration)    ← the BIGGEST part: "write tests, not too many, mostly integration"
     (Unit)         some
   [Static: TS, ESLint]  the base: types & linters catch typos for free
```

The idea: integration tests give the best **confidence per cost** for UI apps, because users don't
care whether `formatPrice()` works alone — they care that the checkout page shows the right total.

🎯 **Interview point:** There is no single "correct" shape. A good answer: *"Use static analysis
for typos, unit tests for complex pure logic, integration tests as the main confidence layer for
features, and a thin E2E layer for critical user journeys (login, checkout). Jest covers the
first three test layers."*

## 1.5 What makes a GOOD test? (FIRST + more)

**FIRST** principles:

- **F**ast — milliseconds. Slow tests don't get run.
- **I**ndependent / Isolated — no test depends on another test running first or on order.
- **R**epeatable — same result every time, on every machine (no real time, randomness, network).
- **S**elf-validating — pass/fail automatically; no human reading logs.
- **T**imely — written with (or before) the code, not "later" (later never comes).

Plus:

- **Tests behaviour, not implementation.** Check *what* the code does (output, visible UI,
  calls to the outside world), not *how* (private variables, internal function calls). Then you
  can refactor freely.
- **One reason to fail.** A test named "adds tax" should only fail when tax adding is broken.
- **Readable.** A failing test should tell you what broke without reading the code.
- **Deterministic.** A test that sometimes passes and sometimes fails is called **flaky** —
  flaky tests destroy trust (Chapter 24 has a full playbook).

## 1.6 The Arrange–Act–Assert pattern (AAA)

Almost every good test has three parts:

```js
test('applies 10% discount for members', () => {
  // Arrange — set up the world
  const cart = { total: 100, isMember: true };

  // Act — do the one thing being tested
  const result = applyDiscount(cart);

  // Assert — check the outcome
  expect(result.total).toBe(90);
});
```

Also called **Given–When–Then** (from BDD):
*Given* a member's cart of 100, *When* we apply discount, *Then* total is 90.

## 1.7 Words you will hear constantly

| Word | Meaning |
| --- | --- |
| **Test runner** | Program that finds test files, runs them, reports results (Jest is one) |
| **Assertion** | A check, e.g. `expect(x).toBe(5)` |
| **Assertion library** | The set of check functions (Jest has one built in: `expect`) |
| **Matcher** | The specific check method: `toBe`, `toEqual`, `toContain`… |
| **Test suite** | Usually one test file (Jest counts "Test Suites" = files) or a `describe` block |
| **Test case** | One `test()` / `it()` |
| **Fixture** | Prepared test data or setup |
| **Mock / stub / spy / fake / dummy** | Kinds of "test doubles" — stand-ins for real dependencies (Ch 7, 19) |
| **Coverage** | % of code lines/branches executed by tests (Ch 14) |
| **SUT** | "System Under Test" — the thing you are testing |
| **Flaky test** | Non-deterministic test |
| **Regression** | Something that used to work and broke |
| **CI** | Continuous Integration — server that runs tests on every push/PR |
| **TDD** | Test-Driven Development — write the failing test first (Ch 19) |
| **BDD** | Behaviour-Driven Development — tests describe behaviour in business language |

## 1.8 Where does Jest fit among JavaScript tools?

A JavaScript test setup historically needed several separate tools:

| Job | Older combo | Jest |
| --- | --- | --- |
| Run tests | Mocha, Jasmine, Karma | ✅ built in |
| Assertions | Chai | ✅ built in (`expect`) |
| Mocks/spies | Sinon | ✅ built in (`jest.fn`, `jest.mock`, `jest.spyOn`) |
| Fake timers | Sinon | ✅ built in (uses `@sinonjs/fake-timers` inside) |
| Fake browser DOM | Karma + real browser, or jsdom manually | ✅ `jest-environment-jsdom` |
| Coverage | nyc / istanbul | ✅ built in (`--coverage`) |
| Snapshots | — | ✅ built in |
| Watch mode | — | ✅ built in (`--watch`) |

That "everything in one box, works with zero config" idea is why Jest became the most used
JavaScript test framework. It was created at **Facebook (Meta)** — originally open sourced in 2014,
it is now maintained by the community under the OpenJS Foundation (the GitHub org is `jestjs`).

## 1.9 Summary

- A test is code that runs your code and checks the result automatically.
- Unit → integration → E2E: smaller/faster → bigger/slower/more realistic.
- Good tests are fast, isolated, repeatable, readable, test behaviour, and are not flaky.
- Use Arrange–Act–Assert.
- Jest is an all-in-one runner + assertions + mocks + coverage + snapshots.

**Next:** [Chapter 2 — Meet Jest: install, set up, run your first test](02-meet-jest-and-setup.md)
