# Chapter 26 — Interview Questions: Beginner (Entry Level)

> 🧸 **How to use Part 6**
>
> Read a question, **answer it out loud first**, then read the model answer. Interviewers care
> less about memorised words and more about whether you can explain *why* and give a small
> example. Each answer links to the chapter that explains it in depth.

### Where these questions come from

They are compiled from the topics that come up again and again in Jest/front-end testing
interview-prep collections and candidate reports. Examples:
[finalroundai Jest questions](https://www.finalroundai.com/blog/jest-interview-questions),
[interviewprep.org](https://interviewprep.org/jest-js-interview-questions/),
[javainuse Jest](https://www.javainuse.com/interview/jest),
[GreatFrontEnd testing questions](https://www.greatfrontend.com/zh-CN/blog/frontend-testing-interview-questions-for-freshers),
and candidate experiences such as
[“got asked what not to test”](https://www.finalroundai.com/community/t/prepped-jest-interview-questions-got-asked-what-not-to-test/392).

Product companies, service companies and start-ups alike ask the same core topics: matchers,
async, mocking, hooks, snapshots, React Testing Library, and (for senior roles) strategy and
trade-offs. Every answer here was written against Jest 30 behaviour and checked for accuracy.
Many points were verified by running code (see the chapters).

---

## A. Basics

**1. What is Jest?**
Jest is a JavaScript testing framework, originally built at Facebook (Meta) and now maintained under
the OpenJS Foundation. It bundles a test runner, an assertion library (`expect`), mocking (`jest.fn`,
`jest.mock`, `jest.spyOn`), fake timers, snapshot testing, code coverage and watch mode, so it works
with little or no configuration. It runs tests in parallel worker processes, with each test file
isolated in its own sandbox. (Ch 1, 2)

**2. Why use Jest instead of Mocha?**
Mocha is only a runner: you add Chai (assertions), Sinon (mocks), nyc (coverage), etc. Jest has all
of it built in, with consistent APIs, plus snapshots, module mocking with hoisting, a parallel runner
with per-file isolation, and watch mode. Mocha is more flexible/minimal; Jest is batteries-included.
(Ch 1 §1.8)

**3. How do you install and run Jest?**
`npm i -D jest`, add `"test": "jest"` to `package.json` scripts, write `*.test.js` files, run
`npm test`. For modern syntax/TS, add Babel presets or ts-jest. (Ch 2)

**4. How does Jest find test files?**
Default `testMatch`: files inside `__tests__` folders, and files ending in `.test.*` or `.spec.*`
(js, jsx, ts, tsx, and in Jest 30 also mjs, cjs, mts, cts). `node_modules` is ignored. Configurable
with `testMatch`, `testRegex`, `testPathIgnorePatterns`. (Ch 2 §2.4)

**5. What's the difference between `test` and `it`?**
None: `it` is an alias of `test`. `it` reads naturally inside `describe` ("it renders…"). (Ch 3)

**6. What is `describe` for?**
Grouping related tests, scoping `beforeEach`/`afterEach`/`beforeAll`/`afterAll` hooks, and applying
modifiers (`describe.skip`, `.only`, `.each`) to a group. Its callback must be synchronous and must
not return a value. (Ch 3 §3.3)

**7. What is a matcher?**
A method on the object returned by `expect(value)` that performs a check, e.g. `toBe`, `toEqual`,
`toContain`, `toThrow`, `toHaveBeenCalledWith`. When the check fails it throws, which fails the
test. (Ch 4)

**8. Difference between `toBe` and `toEqual`?**
`toBe` uses `Object.is` (same value for primitives, same **reference** for objects). `toEqual`
recursively compares the content of objects/arrays. `expect({a:1}).toBe({a:1})` fails;
`toEqual` passes. (Ch 4 §4.2)

**9. Difference between `toEqual` and `toStrictEqual`?**
`toEqual` ignores properties with `undefined` values, `undefined` array items, array sparseness, and
whether an object is a class instance or a plain object. `toStrictEqual` checks all of those.
Example: `expect({a: undefined, b: 2}).toEqual({b: 2})` passes, `toStrictEqual` fails. (Ch 4)

**10. How do you test floating point numbers?**
`toBeCloseTo(expected, numDigits = 2)`: passes if `|expected − received| < 10^-numDigits / 2`.
`expect(0.1 + 0.2).toBeCloseTo(0.3)`. Inside objects: `expect.closeTo`. (Ch 4 §4.4)

**11. How do you check an array contains an item? An object in an array?**
`toContain(item)` for primitives / same reference (`===`); `toContainEqual(obj)` for deep equality.
(Ch 4 §4.6)

**12. How do you check that a function throws?**
Wrap it in a function: `expect(() => fn(-1)).toThrow()`. Optionally pass a class (`TypeError`), a
substring, a regex, or an error object (compared by message). Calling it directly,
`expect(fn(-1)).toThrow()`, throws before `expect` runs. (Ch 4 §4.8)

**13. What do `toBeTruthy` / `toBeFalsy` check?**
Whether the value is truthy/falsy in an `if`. Falsy values: `false, 0, -0, 0n, '', null, undefined,
NaN`. `[]` and `{}` are truthy. Prefer exact matchers like `toBe(true)` when you can. (Ch 4 §4.3)

**14. `toBeNull`, `toBeUndefined`, `toBeDefined`?**
Exactly `null`; exactly `undefined`; anything except `undefined` (so `null` is "defined"). (Ch 4)

**15. What does `.not` do?**
Inverts any matcher: `expect(x).not.toBe(3)`. (Ch 4 §4.12)

**16. How do you check object properties?**
`toHaveProperty('a.b[0]', value)` for a path (value optional); `toMatchObject({...})` for a recursive
subset; `expect.objectContaining({...})` inside other matchers. (Ch 4 §4.7)

**17. How do you check string content?**
`toMatch(/regex/)` or `toMatch('substring')`, `toContain('sub')`, `toHaveLength(n)`;
`expect.stringContaining`/`stringMatching` inside objects. (Ch 4 §4.5)

**18. What does a test with no `expect` do?**
It passes as long as nothing throws. To guard against that, use `expect.assertions(n)` or
`expect.hasAssertions()`. (Ch 3 §3.2)

**19. What is the AAA pattern?**
Arrange (set up data and mocks), Act (call the code), Assert (check results). It keeps tests readable.
Also called Given-When-Then. (Ch 1 §1.6)

**20. What's a test suite in Jest's output?**
"Test Suites" counts test **files**; "Tests" counts individual `test`/`it` calls. (Ch 2 §2.3)

## B. Running tests

**21. How do you run a single test file?** `npx jest path/to/file.test.js` (positional args are path
regexes). (Ch 13)

**22. How do you run a single test by name?** `npx jest -t "name regex"` (`--testNamePattern`), or
`test.only` temporarily. (Ch 13)

**23. What is watch mode?** `jest --watch` re-runs tests related to changed files (needs git/hg);
`--watchAll` re-runs everything. Keys: `a` all, `f` failed, `p` filename filter, `t` test-name filter,
`u` update snapshots, `q` quit. (Ch 2 §2.9)

**24. What do `test.only` and `test.skip` do?**
`.only`: run only the focused tests in **that file**. `.skip`: skip the test (reported as skipped).
`describe.only/skip` apply to groups. `fit`/`xit`/`xdescribe` are aliases. Never commit `.only`
(lint rule `jest/no-focused-tests`). (Ch 3 §3.5)

**25. What is `test.todo`?** A placeholder for a planned test. It has no body and shows as "todo" in
the summary. (Ch 3)

**26. How do you pass arguments to Jest through npm?** `npm test -- --watch` (everything after `--`
goes to Jest). (Ch 2 §2.8)

**27. What does `--coverage` do?** Collects code coverage and prints a table (statements, branches,
functions, lines) plus reports in `coverage/`. (Ch 14)

**28. What does `--verbose` do?** Prints every test's name and result (default when running a single
file). (Ch 13)

## C. Async basics

**29. How do you test async code?**
Make the test `async` and `await` the promise; or `return` the promise; or use
`await expect(p).resolves/rejects...`; or for callback APIs, use the `done` parameter. (Ch 5)

**30. What happens if you forget to `await` or return a promise?**
The test may finish before the promise settles, so assertions run too late and the test can
**pass falsely**. Verified: a wrong assertion in an un-awaited `.then` passed, with the error printed
after the run. (Ch 5 §5.1)

**31. How do `.resolves` and `.rejects` work?**
They unwrap a promise's resolved value or rejection reason and apply the matcher to it. They return a
promise, so they **must be awaited/returned**: `await expect(fetchUser(1)).resolves.toEqual(user)`.
(Ch 5 §5.4)

**32. What is the `done` callback?**
If a test function declares a parameter, Jest waits until it's called. Call `done()` on success,
`done(error)` to fail. Wrap assertions in `try/catch` and pass errors to `done`. Don't combine with
`async` (Jest errors: "Test functions cannot both take a 'done' callback and return something").
(Ch 5 §5.5)

**33. What's the default timeout and how do you change it?**
5000 ms. Per test: third argument `test(name, fn, 10000)`; per file: `jest.setTimeout(10000)`;
globally: `testTimeout` config or `--testTimeout`. (Ch 5 §5.7)

## D. Setup & teardown

**34. What are `beforeEach`, `afterEach`, `beforeAll`, `afterAll`?**
Hooks that run before/after every test in their scope, or once before/after all tests in their
scope. Used for setup/cleanup (fresh data, DB connections, mocks reset). (Ch 6)

**35. When do you use `beforeAll` vs `beforeEach`?**
`beforeAll` for expensive, read-only setup (connect to DB, start server); `beforeEach` for state that
tests may modify, so each test starts fresh. (Ch 6 §6.5)

**36. In what order do nested hooks run?**
`before*` hooks run from outer to inner scope; `after*` hooks run from inner to outer. A nested
`beforeAll` runs before the first test of its `describe`. (Ch 6 §6.3, verified output)

**37. Do tests in different files share state?**
No. Each test file has its own environment (globals) and module registry, and files may run in
different worker processes. Tests in the **same** file do share module state, globals and the DOM.
(Ch 6 §6.8)

## E. Mocking basics

**38. What is mocking? Why mock?**
Replacing a real dependency with a controllable fake to isolate the unit, make tests fast and
deterministic, simulate errors, and verify interactions. Typical targets: network, DB, time,
randomness. (Ch 7 §7.1)

**39. What is `jest.fn()`?**
Creates a mock function that records calls (`.mock.calls`, `.mock.results`, …) and can be programmed
(`mockReturnValue`, `mockResolvedValue`, `mockImplementation`). Without programming it returns
`undefined`. (Ch 7)

**40. How do you check a mock was called with certain arguments?**
`expect(fn).toHaveBeenCalledWith(arg1, arg2)`, `toHaveBeenCalledTimes(n)`,
`toHaveBeenLastCalledWith`, `toHaveBeenNthCalledWith(n, ...)`. (Ch 7 §7.7)

**41. How do you make a mock return a value? A promise?**
`mockReturnValue(v)` / `mockReturnValueOnce(v)`; `mockResolvedValue(v)` / `mockRejectedValue(err)`
(and `Once` versions). (Ch 7 §7.4)

**42. What is `jest.mock()`?**
Replaces a whole module for the test file: automatically (`jest.mock('./api')` makes every exported
function a mock), with a factory (`jest.mock('./api', () => ({...}))`), or with a manual mock in
`__mocks__`. (Ch 8)

**43. What is `jest.spyOn()`?**
Wraps an existing method on an object with a mock that, by default, still calls the original. It lets
you observe calls or override behaviour. `mockRestore()` puts the original back. (Ch 9 §9.1)

**44. Difference between `jest.fn()` and `jest.spyOn()`?**
`jest.fn()` creates a new standalone mock (returns `undefined` by default). `jest.spyOn(obj, 'm')`
replaces an existing method in place, calls through by default, and can be restored. (Ch 9 §9.1)

## F. Snapshots basics

**45. What is snapshot testing?**
`expect(value).toMatchSnapshot()` serialises the value and saves it in `__snapshots__/*.snap` on the
first run. Later runs compare against it and fail on differences. You update intentionally changed
snapshots with `jest -u`. (Ch 11)

**46. Should snapshot files be committed?** Yes. They are part of the test. In CI (`--ci`), missing
snapshots are not written and the test fails. (Ch 11 §11.3)

**47. What is an inline snapshot?** `toMatchInlineSnapshot()`: Jest writes the snapshot into the test
file itself. Good for small values. (Ch 11 §11.4)

## G. Coverage basics

**48. What are the coverage metrics?**
Statements, branches, functions, lines. Branch coverage counts each path of `if`/ternary/`&&`/`||`/
`??`/`switch`; it is the most telling metric. (Ch 14 §14.2)

**49. Does 100% coverage mean no bugs?** No. Coverage shows what code **ran**, not whether it was
**checked** (a test without assertions still produces coverage). (Ch 14)

**50. How do you enforce minimum coverage?** `coverageThreshold` in config. Jest exits with code 1 if
it isn't met. (Ch 14 §14.4)

## H. Environment & config basics

**51. What's the default test environment?** `node` (since Jest 27). For DOM tests, use `jsdom`
(install `jest-environment-jsdom` since Jest 28) via config or a
`/** @jest-environment jsdom */` docblock. (Ch 12)

**52. Where can Jest config live?** `jest.config.js|ts|mjs|cjs|mts|cts|json`, or the `"jest"` key in
`package.json` (not both: "Multiple configurations found" error), or `--config`. (Ch 12 §12.1)

**53. What is `setupFilesAfterEnv`?** Files run before each test file, after the test framework is
installed: the place for `import '@testing-library/jest-dom'`, custom matchers, global hooks.
(Ch 6 §6.7)

**54. What is `moduleNameMapper` used for?** Mapping import paths: aliases (`@/x` → `src/x`) and stubs
for CSS/images. (Ch 8 §8.8)

**55. How do you use ES modules / TypeScript with Jest?** Through a transformer: `babel-jest` with
`@babel/preset-env` (+ `preset-typescript`), `ts-jest`, or `@swc/jest`. Native ESM is experimental.
(Ch 15)

## I. React basics

**56. How do you test a React component with Jest?**
Use React Testing Library in the jsdom environment: `render(<C/>)`, find elements with `screen`
queries (`getByRole`, `getByLabelText`, `getByText`), interact with `user-event`, assert with
jest-dom matchers (`toBeInTheDocument`, `toHaveTextContent`). (Ch 16)

**57. Difference between `getBy`, `queryBy`, `findBy`?**
`getBy` throws if not found (element must exist now); `queryBy` returns `null` (use to assert
absence); `findBy` returns a promise that resolves when the element appears (async UI). (Ch 16 §16.4)

**58. Why prefer `getByRole`?**
It queries the way users and assistive technology perceive the page, and it checks accessibility
(an element must have the right role and accessible name). (Ch 16 §16.4)

**59. What is `user-event` and why prefer it over `fireEvent`?**
`user-event` simulates complete user interactions (focus, keydown, input, click…) and respects
disabled elements etc. `fireEvent` dispatches a single event. Its APIs are async: `await user.click()`.
(Ch 16 §16.5)

**60. What is jest-dom?** A library of DOM matchers like `toBeInTheDocument`, `toBeVisible`,
`toBeDisabled`, `toHaveValue`, `toHaveClass`, `toHaveAttribute`. (Ch 4 §4.16)

## J. Concepts

**61. Unit vs integration vs E2E tests?**
Unit: one unit in isolation (fast, many). Integration: several units together (e.g. API route + DB, or
a form with its children). E2E: the whole app like a user, in a real browser/device (Playwright,
Cypress, Detox). Jest covers unit and integration. (Ch 1 §1.3)

**62. What is the testing pyramid? The testing trophy?**
Pyramid: many unit tests, fewer integration, very few E2E. Trophy: static analysis base, some unit,
**mostly integration**, a few E2E: often better for UI apps. (Ch 1 §1.4)

**63. What is TDD?** Test-Driven Development: write a failing test (red), make it pass with minimal code
(green), refactor. (Ch 19 §19.4)

**64. What is a flaky test?** One that sometimes passes and sometimes fails on the same code (causes:
timing, shared state, real network, dates). (Ch 24 §24.6)

**65. What makes a good test?** Fast, independent, repeatable, self-validating, timely (FIRST); tests
behaviour not implementation; clear name; one reason to fail. (Ch 1 §1.5)

**66. What is a regression test?** A test that reproduces a fixed bug so it can't come back. (Ch 1)

**67. What is `test.each`?** Data-driven testing: run one test body with many input rows, using
`%s`/`%i`/`%p` or `$name` placeholders in titles. (Ch 3 §3.8)

**68. How do you test a function that uses `setTimeout`?**
Fake timers: `jest.useFakeTimers()` then `jest.advanceTimersByTime(ms)` (or `runOnlyPendingTimers`),
and assert. (Ch 10)

**69. How do you mock `Date`?** `jest.useFakeTimers({ now: new Date('2024-01-01') })` or
`jest.setSystemTime(date)`; or inject a clock function. (Ch 9 §9.7)

**70. How do you silence `console.error` in a test?**
`jest.spyOn(console, 'error').mockImplementation(() => {})` and restore it afterwards (or
`restoreMocks: true`). Better still, assert on it if it's expected. (Ch 9 §9.6)

## K. Quick-fire (one-liners)

71. Alias of `test`? → `it`.
72. Run tests related to changed files? → `jest -o` / `--onlyChanged`.
73. Update snapshots? → `jest -u`.
74. Run serially? → `--runInBand` / `-i`.
75. Stop after first failing suite? → `--bail`.
76. Show the resolved config? → `--showConfig`.
77. Clear Jest's cache? → `--clearCache`.
78. Check a mock was never called? → `expect(fn).not.toHaveBeenCalled()`.
79. Get a mock's call arguments? → `fn.mock.calls`.
80. Match any number in an object? → `expect.any(Number)`.
81. Match anything but null/undefined? → `expect.anything()`.
82. Partial object in `toHaveBeenCalledWith`? → `expect.objectContaining({...})`.
83. Exact count of assertions? → `expect.assertions(n)`.
84. Test expected to fail (known bug)? → `test.failing`.
85. Run tests concurrently in a file? → `test.concurrent` (experimental).
86. Where do manual mocks go? → a `__mocks__` folder next to the module (or next to `node_modules`
    for packages).
87. Get the real module inside a mock? → `jest.requireActual`.
88. Clear all mocks' calls before each test? → `clearMocks: true`.
89. Restore all spies? → `jest.restoreAllMocks()` / `restoreMocks: true`.
90. Default `testTimeout`? → 5000 ms.
91. Default coverage provider? → `babel` (alternative `v8`).
92. What file does `toMatchSnapshot` write? → `__snapshots__/<test-file>.snap`.
93. Jest's default runner? → `jest-circus`.
94. Does Jest run files in parallel? → Yes, across worker processes (`maxWorkers`).
95. Are tests within a file parallel? → No (sequential), unless `test.concurrent`.
96. Jest 30 replacement for `toBeCalledWith`? → `toHaveBeenCalledWith`.
97. Jest 30 replacement for `--testPathPattern`? → `--testPathPatterns`.
98. How to type a mocked import in TS? → `jest.mocked(fn)`.
99. Which package provides the jsdom environment? → `jest-environment-jsdom`.
100. Exit code when tests fail? → `1`.

**Next:** [Chapter 27 — Intermediate questions](27-interview-intermediate.md)
