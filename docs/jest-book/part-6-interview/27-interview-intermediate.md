# Chapter 27 — Interview Questions: Intermediate (2–5 years)

These questions test whether you have **used** Jest on real projects. Good answers include the
"why", a short code example, and a pitfall you've hit.

---

## A. Mocking in depth

**1. Explain how `jest.mock` hoisting works and why it exists.**
`babel-plugin-jest-hoist` (part of `babel-jest`; ts-jest and SWC do the same) moves `jest.mock`,
`jest.unmock`, `enableAutomock`, `disableAutomock` and `deepUnmock` calls above the `import`s. Imports
are evaluated first, so without hoisting the real module would already be loaded and cached in the
registry before the mock is registered. (Ch 8 §8.3)

**2. Why do you get "The module factory of `jest.mock()` is not allowed to reference any out-of-scope variables"?**
Because the factory is hoisted above your variable declarations, so it could read uninitialised
variables. The Babel plugin rejects references to outer variables, except globals, variables whose
names start with `mock` (only safe if used lazily), constants initialised with pure literals (which
the plugin hoists too), and `jest` imported from `@jest/globals`. Fix: create the `jest.fn()` inside
the factory and access it through the import (`jest.mocked(fn)`). (Ch 8 §8.3, verified)

**3. When does a `mock`-prefixed variable still fail?**
When the factory reads it **eagerly**. Verified: `const mockValue = 'v'; jest.mock('./m', () => { const r = mockValue; ... })`
throws `ReferenceError: Cannot access 'mockValue' before initialization`, because the factory runs at
the hoisted import, before the `const` line. Read it inside a function that runs later instead:
`add: (...a) => mockAdd(...a)`. (Ch 8)

**4. How do you mock a default export?**
Return `{ __esModule: true, default: ... }` from the factory. Without `__esModule: true`, Babel's
interop treats the whole object as the default export. Verified: `main` became
`{ default: [Function] }` and `main()` threw "not a function". (Ch 8 §8.2.2)

**5. How do you mock only one function of a module?**
Partial mock with `jest.requireActual`:
```js
jest.mock('./utils', () => ({ ...jest.requireActual('./utils'), fetchRates: jest.fn() }));
```
Caveat: other functions **inside** `utils` that call `fetchRates` still call the real one (local
binding). (Ch 8 §8.2.3)

**6. Why didn't my spy intercept a call?**
A spy replaces a property on an object, so it only intercepts calls made through that property. It
misses: internal calls within the same module (local binding); code that destructured the function
before the spy existed (plain CJS); re-exports through barrels (non-configurable getters → verified
"Cannot redefine property"); and native ESM namespaces (frozen). Fix by mocking the source module,
splitting modules, or injecting dependencies. (Ch 9 §9.3)

**7. Difference between `mockClear`, `mockReset`, `mockRestore`?**
`mockClear` wipes recorded calls/results/instances/contexts. `mockReset` also removes programmed
behaviour (returns `undefined`). `mockRestore` also restores the original implementation, but only
for `spyOn`/`replaceProperty`. Verified on Jest 30: `mockReset()` on a spy makes it return
`undefined`, not call through. `jest.restoreAllMocks()` does **not** clear or reset plain `jest.fn()`
mocks. Config equivalents: `clearMocks`, `resetMocks`, `restoreMocks`. (Ch 7 §7.9)

**8. Which of those config flags would you enable by default and why?**
`clearMocks: true` (no leaked call counts; a verified example in Ch 16 failed without it) and
`restoreMocks: true` (spies/replaced properties put back). `resetMocks` is stricter: it wipes
implementations set in `jest.mock` factories before every test, which surprises people. (Ch 7)

**9. What's the difference between automock, a factory mock and a manual mock?**
Automock (`jest.mock(path)`): Jest loads the real module to read its shape and generates mocks
(functions → `jest.fn()` returning undefined, classes → mocked constructor and methods, arrays → `[]`,
primitives kept). Factory: you return the module's replacement. Manual: a file in `__mocks__` next to
the module (used when you call `jest.mock(path)`) or next to `node_modules` (applied automatically for
packages). (Ch 8)

**10. Do manual mocks for node_modules need `jest.mock()`?**
No. A file in a root-level `__mocks__` (within `roots`) for a package is applied automatically
(verified). Exception: Node core modules like `fs` need an explicit `jest.mock('fs')`. User-module
manual mocks also need `jest.mock()` (verified). (Ch 8 §8.4)

**11. How do you change a module mock's behaviour per test?**
Usually: mock the module once at the top, then set behaviour in each test with
`jest.mocked(fn).mockReturnValue(...)`. If the module shape must differ per test, use
`jest.resetModules()` + `jest.doMock()` + `require` inside the test, or `jest.isolateModules`.
(Ch 8 §8.5)

**12. What does `jest.resetModules()` do and when is it dangerous?**
It empties the module registry so the next `require` re-evaluates modules (fresh singletons, re-read
env). It is dangerous because imports at the top of the test file still reference old instances, and
with React you can end up with two React copies ("Invalid hook call"). It's also slow if overused.
(Ch 8 §8.6)

**13. How do you mock an ES6 class?**
Options: automock (`jest.mock('./Cls')`, then assert via `Cls.mock.instances[0].method`); factory
returning `jest.fn().mockImplementation(() => ({ method: mockMethod }))` (must be a regular function,
not an arrow, because of `new`); a manual mock; or `jest.spyOn(Cls.prototype, 'method')`. Arrow-function
class fields live on instances, not the prototype. (Ch 9 §9.5)

**14. How do you mock `fetch`?**
In the node environment, `jest.spyOn(global, 'fetch').mockResolvedValue({ ok: true, json: async () => data })`.
In jsdom, `fetch` doesn't exist (verified), so assign `global.fetch = jest.fn()` and restore it later.
Better for apps: MSW at the network layer. (Ch 9 §9.9)

**15. How do you mock environment variables?**
Copy `process.env` in `beforeEach` and restore it afterwards, or `jest.replaceProperty(process.env, 'X', 'v')`
for existing variables (it throws for missing ones, verified). If the module reads env at import time,
re-import it with `isolateModules`. (Ch 9 §9.11)

**16. How do you mock a module that doesn't exist (generated/aliased)?**
`jest.mock('virtual-path', () => ({...}), { virtual: true })`. (Ch 8 §8.7)

**17. How do you assert call order across two mocks?**
Compare `mock.invocationCallOrder` values, push into a shared array from both implementations, or use
jest-extended's `toHaveBeenCalledBefore`. (Ch 7 §7.7)

**18. Why might `toHaveBeenCalledWith` fail although the arguments look right?**
(a) Arguments are stored by **reference**: if the code mutates the object after the call, the recorded
call shows the mutated value (verified). (b) Argument count differs: `fn('a', undefined)` doesn't
match `toHaveBeenCalledWith('a')` (verified). (c) Class instance vs plain object is usually fine with
recursive equality, but not with `toStrictEqual`-style expectations. (Ch 7)

**19. What is `jest.mocked()`?**
A TypeScript helper that returns the same value typed as mocked (`jest.MockedFunction`, deep by
default since Jest 29), so `.mockResolvedValue` etc. type-check. At runtime it does nothing. (Ch 7 §7.10)

**20. What's `mockImplementationOnce` precedence vs `mockImplementation`?**
`*Once` values are queued and consumed first, in order; then the default implementation; then
`undefined`. `mockReturnValue` is sugar for `mockImplementation(() => value)`, so it replaces a
`jest.fn(impl)` body (verified). (Ch 7 §7.4)

**21. What's `mockReturnThis` for?** Chainable/fluent APIs (query builders):
`select: jest.fn().mockReturnThis()`. (Ch 7)

**22. What's `jest.replaceProperty`?** Replaces a non-function property (config flags, `process.env` keys,
`Platform.OS`) and is restored by `restoreAllMocks`. The property must already exist. (Ch 9 §9.4)

**23. What's new in Jest 30 for mocks?**
`using` keyword with spies (auto-restore), `jest.onGenerateMock`, `jest.unstable_unmockModule`,
removal of `genMockFromModule` and `SpyInstance` type, case-sensitive `jest.mock` paths, and (30.5)
`mockFn.whenCalledWith(...)` for argument-specific behaviour. (Ch 7, 25)

## B. Async & timers

**24. How do you test that an async function rejects with a specific error?**
`await expect(fn()).rejects.toThrow('message')` / `.rejects.toThrow(ErrorClass)`, or `.rejects.toEqual(...)`
for non-Error rejections. Avoid try/catch without `expect.assertions`. (Ch 5 §5.6)

**25. Why can a try/catch-based async test pass incorrectly?**
If the promise resolves, the `catch` never runs and the test has zero assertions, so it passes.
Use `rejects` or `expect.assertions(1)`. (Ch 5 §5.6)

**26. How do fake timers interact with promises?**
Fake timers don't fake Promises. `advanceTimersByTime` runs due timer callbacks synchronously, but
`.then` callbacks run only when you yield (`await`). If code awaits something before scheduling a
timer, a synchronous advance misses it. Use `await jest.advanceTimersByTimeAsync(ms)` /
`runAllTimersAsync` (verified). (Ch 10 §10.5)

**27. `runAllTimers` vs `runOnlyPendingTimers` vs `advanceTimersByTime`?**
`runAllTimers` runs until no timers remain (it throws after `timerLimit`, 100,000 by default, for
recursive timers; verified "Aborting after running 100000 timers"). `runOnlyPendingTimers` runs only the
currently queued ones. `advanceTimersByTime(ms)` moves the clock forward and runs what comes due.
(Ch 10)

**28. What do modern fake timers fake?**
`Date`, `performance.now`, `queueMicrotask`, `setTimeout/Interval/Immediate` (+ clear), and in node
also `process.hrtime`/`nextTick`; in jsdom also `requestAnimationFrame`/`requestIdleCallback`. Use
`doNotFake` to keep some real. Not Promises. (Ch 10 §10.2)

**29. A library hangs when you enable fake timers. Why?**
It likely relies on `process.nextTick`, `setImmediate` or `queueMicrotask`, which are faked.
Use `jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'] })` or real
timers for that test. (Ch 10 §10.6)

**30. How do you test a debounce/throttle?**
Fake timers: call the function several times, advance time in steps, and assert the call count and
arguments at the boundaries (299 ms → not called, 300 ms → called once). (Ch 10 §10.4)

**31. How do you test retry with exponential backoff?**
Mock the operation with `mockRejectedValueOnce` x N then `mockResolvedValue`. Start the call, then
`await jest.advanceTimersByTimeAsync(...)` for each delay. Attach a `rejects` expectation **before**
advancing for the failure case to avoid unhandled-rejection noise (verified example). (Ch 10 §10.5)

**32. What's the event loop difference between microtasks and macrotasks and why does it matter in tests?**
Microtasks (promise callbacks, `queueMicrotask`, after `await`) run after the current synchronous
code and before macrotasks (`setTimeout`, I/O). In tests, assertions right after triggering a promise
won't see its result until you `await`. `flushPromises` helpers rely on this ordering. (Ch 5 §5.13)

## C. Lifecycle & isolation

**33. What happens if `beforeAll` throws?**
Every test in that `describe` is reported failed with the hook's error. Their `beforeEach` hooks and
bodies don't run, but `afterEach` and `afterAll` still run (verified). So write defensive teardown
(`await server?.close()`). (Ch 6 §6.4)

**34. Why does code inside `describe` run before `beforeAll`?**
Jest first runs a collection phase that executes `describe` bodies to register tests and hooks, then
an execution phase. Setup belongs in hooks, not in `describe` bodies. (Ch 3 §3.4)

**35. `setupFiles` vs `setupFilesAfterEnv` vs `globalSetup`?**
`globalSetup`: once per run in the main process, with no test framework and no shared globals with
tests (use `process.env` or files to pass data). `setupFiles`: per test file, before the framework
(polyfills, env). `setupFilesAfterEnv`: per test file, after the framework (matchers, global hooks,
MSW). (Ch 6 §6.7)

**36. How do you make tests independent of order?**
Fresh state per test (`beforeEach`/factories), restore spies/env/timers, avoid module-level
singletons or reset them, clean the DOM/DB. Verify with `--randomize` (reproduce with `--seed`).
(Ch 6 §6.5)

**37. Can you pass a value from `globalSetup` to tests?**
Not via `globalThis` (tests run in separate contexts/processes). Use `process.env` (strings), which
workers inherit, or write a file. (Ch 6 §6.7)

## D. Snapshots

**38. Pros and cons of snapshot testing?**
Pros: fast to write; catch unexpected changes; useful for serialised output and legacy code.
Cons: easily updated blindly; big snapshots don't get reviewed; brittle; don't express intent.
Keep them small, deterministic and reviewed; prefer inline. (Ch 11 §11.7)

**39. How do you handle dynamic values in snapshots?**
Property matchers: `toMatchSnapshot({ id: expect.any(String), createdAt: expect.any(Date) })`; or
freeze time / mock ID generators. (Ch 11 §11.5)

**40. What happens to snapshots in CI?**
With `--ci` (auto-detected via the `CI` env var), new snapshots aren't written and the test fails
("New snapshot was not written…"). Obsolete snapshots also make Jest exit with code 1 (verified).
(Ch 11 §11.3)

**41. How do you resolve snapshot merge conflicts?**
Don't hand-merge. Re-run the affected tests with `-u` on the merged code, review the diff, commit.
(Ch 11)

## E. Config & tooling

**42. What is `transformIgnorePatterns` and when do you change it?**
Paths that are **not** transformed (default: `node_modules`). Change it when an ESM-only or
untranspiled package (common in React Native) needs Babel:
`['/node_modules/(?!(pkg-a|pkg-b)/)']`, with a root `babel.config.js`. (Ch 15 §15.4)

**43. "SyntaxError: Unexpected token 'export'" from node_modules: how do you fix it?**
Allow-list the package in `transformIgnorePatterns` (and make sure `transform` matches `.mjs` if it
ships `.mjs`), map it to a CJS build via `moduleNameMapper`, mock it, use Node ≥ 24.9 with Jest 30.5
(`require(esm)`), or run native ESM mode. In Jest 30.5 the message reads "Must use import to load ES
Module". (Ch 15, 23)

**44. Babel vs ts-jest for TypeScript?**
Babel/SWC strip types: fast, no type-checking (run `tsc --noEmit` separately), with limits on some TS
features. ts-jest uses the TS compiler: type errors fail tests and full TS semantics are supported
(decorator metadata), but it's slower. ts-jest is faster with `isolatedModules: true` in tsconfig.
(Ch 15 §15.3)

**45. How do you configure path aliases?**
`moduleNameMapper: { '^@/(.*)$': '<rootDir>/src/$1' }`, kept in sync with tsconfig `paths`
(`pathsToModuleNameMapper` from ts-jest). (Ch 8 §8.8)

**46. How do you stub CSS and images?**
`moduleNameMapper` to `identity-obj-proxy` for CSS modules and a file stub for images. (Ch 8 §8.8)

**47. What is a preset?** A shareable base config, e.g. `ts-jest`, `react-native`, `jest-expo`,
`jest-preset-angular`. Your config merges on top. (Ch 12)

**48. What does `--runInBand` do and when would you use it?**
Runs all tests serially in the current process. Use it for debugging (breakpoints), with
`--detectOpenHandles`, for small suites (no worker overhead), or in very memory-constrained CI.
(Ch 13)

**49. How do you debug a Jest test?**
`node --inspect-brk node_modules/.bin/jest --runInBand path` plus `debugger;`, then Chrome
`chrome://inspect` or a VS Code launch config / the Jest extension. Also `screen.debug()` for DOM.
(Ch 13 §13.7)

**50. How do you run only tests affected by your changes?**
`jest -o` (uncommitted), `--changedSince=origin/main`, `--lastCommit`, `--findRelatedTests <files>`
(used in lint-staged). (Ch 13 §13.3)

**51. How does Jest decide which tests are related to a changed file?**
Through the dependency graph from the haste map (static `require`/`import` analysis). Dynamic requires
or config changes can be missed, so run the full suite on main. (Ch 21)

**52. Why should `jest`, `babel-jest`, `jest-environment-jsdom`, `ts-jest` share the same major version?**
They share internal interfaces (transformer/environment APIs). Mismatches cause errors like
environment-not-found or transform failures. (Ch 25 §25.3)

## F. Coverage

**53. Why can line coverage be 80% while statements are 71%?**
A line counts as covered if any statement on it ran. `if (x) return 'B';` on one line is "covered"
when the `if` runs even if `return 'B'` never does (verified example). Branch coverage reveals it.
(Ch 14 §14.2)

**54. How do you include untested files in coverage?**
`collectCoverageFrom: ['src/**/*.{js,ts}', '!**/*.d.ts']`. Otherwise only files loaded by tests count.
(Ch 14 §14.3)

**55. `babel` vs `v8` coverage provider?**
`babel` instruments code through `babel-plugin-istanbul` (precise, slower; `istanbul ignore`
comments). `v8` uses V8's native coverage (faster; `c8 ignore`/`v8 ignore` comments). The numbers
differ slightly. (Ch 14 §14.5)

## G. React Testing Library

**56. What causes "not wrapped in act(...)" warnings and how do you fix them?**
A React state update happened outside RTL's act-wrapped helpers, usually because the test didn't
wait for async work to finish (a fetch resolving after the last assertion) or manual timer advances.
Fix: `await screen.findBy...` / `waitFor` for the final UI state; wrap manual `jest.advanceTimersByTime`
in `act`. Don't just silence it. (Ch 16 §16.7)

**57. When do you use `waitFor` vs `findBy`?**
`findBy` waits for an element to appear. `waitFor(() => expect(...))` waits for any assertion to pass
(e.g. a mock call). Keep one assertion inside `waitFor`, with no side effects. (Ch 16 §16.6)

**58. How do you test components that need providers (Redux, Router, React Query)?**
A custom `renderWithProviders` with a `wrapper`, creating a **fresh** store/QueryClient per test, with
query retries disabled. (Ch 16 §16.8)

**59. How do you test a custom hook?**
`renderHook(() => useX(), { wrapper })` from `@testing-library/react`, then `act(() => result.current.fn())`
and `waitFor` for async results. (Ch 16 §16.9)

**60. How do you test a component that fetches data?**
Mock at the network layer (MSW) or mock the API module. Render, then
`await screen.findByText(...)`. Also test loading and error states. (Ch 16 §16.3)

**61. How do you test that something is NOT rendered?**
`expect(screen.queryByText('x')).not.toBeInTheDocument()` (`queryBy` returns null instead of
throwing). For "disappears later": `waitForElementToBeRemoved`. (Ch 16)

**62. Why shouldn't you test implementation details?**
Tests coupled to internals (state, method names, class names) break on refactors that don't change
behaviour, and can pass when user-visible behaviour is broken. Test what users see and do. (Ch 16 §16.2)

## H. TypeScript

**63. How do you type a mocked module?**
`jest.mock('./api'); const api = jest.mocked(apiModule);` or `jest.mocked(fn)` per function. Types
`jest.Mocked<T>`, `jest.MockedFunction<T>`, `jest.Spied<T>`. (Ch 7 §7.10)

**64. `@types/jest` vs `@jest/globals`?**
`@types/jest` is community-maintained global typings. `@jest/globals` is official and imported
explicitly (`import { expect, jest } from '@jest/globals'`), always in sync with your Jest version.
(Ch 15)

**65. How do you add types for a custom matcher?** Augment `expect`'s `Matchers` and
`AsymmetricMatchers` interfaces (or the global `jest.Matchers` namespace with `@types/jest`). (Ch 20 §20.1)

## I. Practical judgement

**66. What would you mock in a unit test of a checkout service?**
The payment gateway client, email sender, clock, ID generator, and the repository (or use an in-memory
fake). Not the pure price calculation helpers or value objects. (Ch 19 §19.3)

**67. What's "don't mock what you don't own"?**
Instead of mocking a third-party SDK's internals in many tests, wrap it in your own small adapter,
mock the adapter in unit tests, and test the adapter against the real thing/sandbox or MSW. Upgrades
then don't break dozens of tests. (Ch 19 §19.3)

**68. What would you deliberately NOT test?**
Third-party library internals, framework behaviour (React re-rendering, Express routing itself),
trivial getters/pass-throughs, generated code, styling details better covered by visual tests, and
private implementation details. Focus on your logic and contracts. (Ch 19)

**69. Integration test or unit test for a React form?**
Mostly integration: render the form with real child components and validation, type with user-event,
assert on the visible result and the submit callback/API call. Unit-test complex validation rules
separately with `test.each`. (Ch 16)

**70. How do you keep tests fast?**
Node environment by default, a fast transformer (SWC/Babel), no barrels, fake timers, mocked I/O,
coverage only in CI, tuned workers, sharding, affected-only runs on PRs. (Ch 22)

## J. More rapid-fire (intermediate)

71. Max timers `runAllTimers` runs by default? → 100,000 (`timerLimit`).
72. Default `maxConcurrency` for `test.concurrent`? → 5.
73. `bail` counts tests or suites? → test suites (files).
74. How to run tests in random order? → `--randomize` (`--seed` to reproduce, `--showSeed`).
75. Environment for a single file? → `/** @jest-environment jsdom */` docblock.
76. jsdom base URL? → `testEnvironmentOptions.url` (default `http://localhost`).
77. Which matcher checks every array item? → `expect.arrayOf(matcher)` (Jest 30).
78. Number placeholder for `test.each` case in Jest 30? → `%$`.
79. How to retry flaky tests? → `jest.retryTimes(n)` (jest-circus); fix the root cause anyway.
80. Hooks in `setupFilesAfterEnv` apply to? → every test file.
81. How to fail a test on `console.error`? → spy in setup that throws, or `jest-fail-on-console`.
82. How to test a function that calls `process.exit`? → `jest.spyOn(process, 'exit').mockImplementation(() => { throw ... })`.
83. Which Jest option recycles leaky workers? → `workerIdleMemoryLimit`.
84. How to find what keeps Jest alive? → `--detectOpenHandles`.
85. When is `--forceExit` acceptable? → as a temporary last resort; it hides leaks.
86. What does `expect.hasAssertions()` check? → at least one assertion ran.
87. Spy on a getter? → `jest.spyOn(obj, 'prop', 'get')`.
88. Turn off automatic global injection? → `injectGlobals: false` + import from `@jest/globals`.
89. How to print the DOM in RTL? → `screen.debug()`.
90. List roles in a DOM? → `logRoles(container)`.
91. Mock a hook used by a component? → `jest.mock('./useUser', () => ({ useUser: () => ({...}) }))`, but prefer real hooks with mocked data sources.
92. Why use `userEvent.setup()` before render? → it creates the user session; the recommended API in v14.
93. How do you snapshot an error message? → `toThrowErrorMatchingInlineSnapshot()`.
94. How to make snapshots smaller? → snapshot specific parts; `jest/no-large-snapshots`.
95. How to share mocks between files? → `__mocks__` manual mocks or setup files.
96. Can `describe` be async? → No ("Returning a Promise from "describe" is not supported").
97. Can tests be nested? → No ("Tests cannot be nested").
98. Can hooks be declared in a test? → No ("Hooks cannot be defined inside tests").
99. What's `test.failing` used for? → documenting a known bug; it passes while the test fails.
100. What does `--ci` change? → snapshot writing (doesn't write new ones) and CI-friendly behaviour.
101. What's `displayName` for? → labelling tests per project in multi-project runs.
102. How to run one project in a multi-project setup? → `--selectProjects name`.
103. Where does `<rootDir>` point? → the directory with the config/package.json (or `rootDir`).
104. How to see why no tests were found? → Jest prints `testMatch`/`testPathIgnorePatterns` match counts (verified).
105. How to suppress logs from tests? → `--silent`.
106. Difference between `--watch` and `--watchAll`? → changed-file-related vs all; `--watch` needs git/hg.
107. How to update one snapshot? → `jest -u -t "test name"` or interactive mode (`i`).
108. Purpose of `expect.addSnapshotSerializer`? → custom snapshot printing.
109. How to compare a class with custom equality? → `expect.addEqualityTesters`.
110. Recommended way to avoid leaked mock calls between tests? → `clearMocks: true`.

**Next:** [Chapter 28 — Advanced / Senior questions](28-interview-advanced.md)
