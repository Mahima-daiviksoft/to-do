# Chapter 28 — Interview Questions: Advanced / Senior / Lead

Senior interviews test **judgement**: trade-offs, failure modes, scale, design for testability,
leading a team's testing practice. Candidate reports say interviewers explicitly probe "what would
you *not* test?" and penalise answers that are "library-deep and design-shallow". So pair every API
answer with *why* and *when not*.

---

## A. Internals & architecture

**1. Walk me through what happens when you run `jest`.**
Config is resolved (CLI + file + preset + defaults; split into global and per-project configs) →
`jest-haste-map` crawls files (Watchman or a Node crawler), extracts dependencies and caches them →
`SearchSource` selects test files (patterns, `-o`/`--changedSince` via the dependency graph,
`--shard`) → the sequencer orders them (failed first, then slowest, then size) → Jest decides in-band
vs workers (in band if `-i`/`--detectOpenHandles`, one worker, one file, or ≤ 20 files that were all
fast last time; never in watch mode or with `workerIdleMemoryLimit`) → per file, in a worker: create
the environment (vm context), create a `jest-runtime` (module registry + mocks), install jest-circus,
run `setupFiles` then `setupFilesAfterEnv`, require the test file through the runtime (transform with
cache, wrap with `vm.compileFunction`), collect then execute tests → results stream to reporters →
coverage merge/threshold → exit code. (Ch 21)

**2. Why are test files isolated, and what does that cost?**
Each file gets a fresh vm context and module registry, so state can't leak between files and files
can run in parallel. The cost: modules shared by many files are re-evaluated for every file. Large
import graphs (barrels, heavy libraries) dominate runtime. Workers are reused, so leaks that escape
the sandbox accumulate memory. (Ch 21 §21.3)

**3. How does Jest's module mocking actually work?**
Jest replaces Node's `require` with `jest-runtime`. `requireModuleOrMock` checks for explicit mocks
(factory/doMock/setMock), then automock/manual mocks (`__mocks__`, root mocks for node_modules), then
loads the real module. Automocks are generated from metadata obtained by loading the real module
(`getMetadata` → `generateFromMetadata`). Hoisting ensures registration before imports evaluate.
(Ch 21 §21.4)

**4. Why is native ESM mocking harder, and how does Jest handle it?**
ESM imports are linked statically before any code runs, and namespaces are immutable, so you can't
register a mock "before" a static import or patch exports. Jest provides `jest.unstable_mockModule`
(registered before a **dynamic** `await import()`), and `unstable_unmockModule` in Jest 30. It needs
`--experimental-vm-modules`, and `jest.mock` doesn't apply to ESM targets. (Ch 8 §8.10, Ch 15 §15.5)

**5. Explain the transform cache and when it bites you.**
`ScriptTransformer` caches output keyed on file content, path, config, transformer `getCacheKey`,
instrumentation and ESM/CJS flags. A transformer with an incomplete `getCacheKey` (e.g. ignoring a
Babel plugin option) serves stale output after config changes → `--clearCache`. In CI, cache the
directory keyed on lockfile + configs. (Ch 21 §21.5)

**6. How does jest-circus differ from jest-jasmine2?**
Circus is Jest's own flux-style runner (default since 27): an event-driven state machine
(`add_test`, `test_start`, `test_done`…) that environments can observe (`handleTestEvent`). It
enables `test.failing`, `retryTimes`, stricter errors (multiple `done`, async describe, nested
tests), and better hook semantics. jasmine2 is legacy, no longer bundled since 28. (Ch 21 §21.6)

**7. How do fake timers work internally? Why don't they fake promises?**
`@sinonjs/fake-timers` replaces timer APIs and `Date` on the environment's global with a clock that
keeps a priority queue of timers; advancing pops due timers synchronously. Native promises resolve
via V8's microtask queue, which can't be intercepted from JS. So promise callbacks run only when the
test yields, hence the `*Async` timer APIs that `await` between timers. (Ch 21 §21.8, Ch 10 §10.5)

**8. What is the haste map, and what are "haste module naming collisions"?**
A cached index of every file under `roots`, with dependencies and (legacy) haste module names. A
collision happens when two `package.json` files declare the same `name` under roots (e.g. a `dist/`
copy). Fix it with `modulePathIgnorePatterns`. (Ch 21)

## B. Strategy & design

**9. How would you design the testing strategy for a new product team?**
Static analysis (TypeScript strict, ESLint incl. `eslint-plugin-jest`/`testing-library`) as the base.
Unit tests for complex pure logic (pricing, validation, reducers). **Integration tests as the main
confidence layer**: components with RTL + MSW; API routes with Supertest + a real DB in containers.
Contract tests between services (Pact). A thin E2E layer for critical journeys (Playwright/Detox).
Conventions documented, CI gates (tests, type check, coverage ratchet, diff coverage), flaky policy,
and test-speed budgets. (Ch 1, 24)

**10. What would you deliberately not test, and why?**
Third-party/framework behaviour, trivial code with no logic, generated code, exact styling (visual
tools are better), private internals, and "that my mock was called" when the observable outcome can
be asserted instead. Every test has a maintenance cost, so spend it where risk and complexity are.
(Ch 19)

**11. Mockist vs classical testing: which do you prefer?**
Classical by default: real collaborators, mocks only at architectural boundaries (I/O, time,
randomness, third parties). Mockist tests pinpoint failures and help outside-in design but couple
tests to implementation and can all pass while the integration is broken. I'd use interaction
verification where the interaction *is* the behaviour (an email was sent, an event was published).
(Ch 19 §19.2)

**12. How do you make legacy code testable?**
Characterization tests first (snapshots or assertions of current behaviour), then introduce seams:
dependency injection, wrapping globals (time, `fetch`, env), extracting pure functions, removing
import-time side effects. Refactor in small steps under the safety net, then write proper tests and
fix bugs test-first. (Ch 19 §19.9)

**13. How do you evaluate test-suite quality beyond coverage?**
Mutation testing (Stryker) for test strength; flake rate; escaped-defect analysis ("why didn't tests
catch this?"); test runtime trends; review checklists; ratio of tests broken by refactors (a
brittleness signal). (Ch 14, 19, 24)

**14. How do you test code with time zones/dates robustly?**
Inject a clock, or use fake timers with `setSystemTime`. Run with `TZ=UTC` set **before** the process
starts (script/globalSetup). Explicitly test DST transitions, leap days and month ends. Use
property-based tests for date arithmetic. (Ch 9 §9.7)

**15. MSW vs mocking the API module vs mocking fetch?**
MSW intercepts at the network layer, so real client code (axios/fetch/interceptors/serialisation)
runs, and handlers are reusable in the browser/Storybook. It's more realistic and resilient to
refactors. Module mocks are simpler and faster but skip the client layer and couple tests to module
structure. Global fetch mocks are brittle (shape of `Response`). Gotchas: MSW intercepts Supertest's
local requests (filter them in `onUnhandledRequest`), and recent MSW versions need ESM handling in
Jest (verified). (Ch 18 §18.3)

**16. When are snapshot tests appropriate at scale?**
For small, stable, meaningful serialisations (error messages, codegen output, CLI output), inline when
possible, with lint limits on size. Not as a substitute for behavioural assertions on UI. Treat `.snap`
diffs as code in review; never mass-update without reading. (Ch 11)

**17. How do you prevent false confidence from over-mocking?**
Mock only boundaries. Back mocks with contract or integration tests against the real thing (adapter
tests, Pact, Testcontainers). Prefer fakes with real behaviour. Keep a few E2E smoke tests. If a test
mostly asserts mock calls, ask whether an observable outcome exists. (Ch 19)

## C. Scale, performance, CI

**18. A 20-minute Jest suite: how do you bring it down?**
Measure (per-file timings, `--logHeapUsage`, CPU profile). Typical wins: kill barrel imports and
heavy imports per file; switch ts-jest type-checking to SWC/isolatedModules with a separate `tsc`;
`node` env by default; fake timers instead of waits; tune `maxWorkers` explicitly; cache the transform
dir; shard across CI machines; affected-only on PRs with full runs on main; `workerIdleMemoryLimit`
for memory thrash; split slow integration tests into their own project/job. (Ch 22)

**19. Tests OOM in CI ("JavaScript heap out of memory"). Approach?**
Reproduce with `-i --logHeapUsage` to see growth per file. Find leaks (unclosed handles, global caches,
listeners, un-restored spies on long-lived objects, big mocked data). Mitigate with
`workerIdleMemoryLimit` (absolute values on CI), fewer workers, larger heap as a stopgap. Jest 30's
`globalsCleanup` warnings help locate leaked globals. (Ch 22 §22.3)

**20. How do you run Jest across 8 CI machines?**
`--shard=i/8` per machine (optionally a custom sequencer for balanced shards using timings), cache
dirs, JUnit per shard, coverage JSON per shard merged afterwards (`nyc merge`) or uploaded to a service
that merges. (Ch 22 §22.4)

**21. Monorepo with 60 packages: one Jest config or many?**
Either `projects` in a root config (one process tree, unified coverage, shared workers) or per-package
Jest runs orchestrated by Nx/Turborepo (affected detection + remote caching). Large orgs usually prefer
the latter for caching. Keep a shared preset, keep global-only options at the root, and watch for
haste collisions, Babel root config and duplicate React. (Ch 22 §22.5)

**22. How do you handle flaky tests organisationally?**
Treat them as bugs with owners. Detect via analytics/nightly repeated runs. Quarantine (non-blocking
lane) with an SLA, never silent `.skip`. `retryTimes` only as a temporary measure with tracking. Fix the
root causes (async, time, order, shared state, network, resources). (Ch 24 §24.6)

**23. `--changedSince` on PRs: what are the risks?**
The dependency graph misses dynamic requires, config/env/fixture changes, non-JS assets, and
transitive runtime behaviour. Mitigate: always run the full suite on main/nightly, include config files
as "run everything" triggers, and combine with affected-project tools. (Ch 22)

## D. Deep API questions

**24. Explain all the ways to make a module mock vary between tests, with trade-offs.**
(1) One `jest.mock` plus per-test `mockReturnValue`: simplest. (2) `doMock` + `resetModules` +
in-test `require`: different module shapes, but slower and risky with React. (3) `isolateModules`:
scoped registry, cleaner. (4) DI: no module mocking at all, the best long-term. (5) ESM:
`unstable_mockModule` + dynamic import per scenario. (Ch 8 §8.5)

**25. What exactly can a `jest.mock` factory reference?**
Globals in the plugin's allow-list (everything on `globalThis` plus `jest`, `expect`, `require`,
`module`, …), `mock`-prefixed variables (case-insensitive, not hoisted, must be used lazily),
never-reassigned variables initialised with pure literals (hoisted alongside), `jest` imported from
`@jest/globals`, and istanbul coverage variables. (Verified against `babel-plugin-jest-hoist` 30.5
source, Ch 8 §8.3)

**26. Design a custom matcher API for a domain; what must you get right?**
A clear failure message for both `.not` and normal cases (use `this.isNot`, `matcherHint`,
`printReceived`/`printExpected`); input validation (throw a matcher error for wrong types); support as
an asymmetric matcher automatically; async if needed; TypeScript declarations for `Matchers` and
`AsymmetricMatchers`; use `this.equals` for deep equality with custom testers. (Ch 20 §20.1)

**27. How would you build a custom environment for DB integration tests?**
Extend `TestEnvironment` from `jest-environment-node`. In `setup()`, create a per-file schema/database
(using `JEST_WORKER_ID` or a random name), run migrations, expose a client on `this.global`. In
`teardown()`, drop it and close connections. Optionally use `handleTestEvent` to wrap each test in a
transaction or capture logs on failure. Keep it fast, since environments are created per file.
(Ch 20 §20.4)

**28. When would you write a custom runner?**
To run non-test tools through Jest's parallelism/watch/reporting: ESLint, tsc, stylelint, or custom
checks (`create-jest-runner`). It lets one `jest --watch` show lint + type + test status. (Ch 20 §20.9)

**29. How does `--findRelatedTests` work and where is it useful?**
It walks the dependency graph from given source files to test files that (transitively) import them.
Used in pre-commit hooks (lint-staged) with `--bail --passWithNoTests`. (Ch 13 §13.3)

**30. `toEqual` and Error objects: what's compared?**
Only `message` (verified in 30.5: `new TypeError('x')` equals `new Error('x')`, and `code`/`cause`
are ignored). Use `toThrow(Class)` plus a message check, or `toMatchObject` on the caught error for
extra fields. (Ch 4 §4.2)

**31. Why might `instanceof` fail in Jest?**
Objects created in a different realm (host Node context vs the test's vm context; e.g. some native
modules, `structuredClone` across contexts) have different constructors. Use `Array.isArray`,
duck-typing or `toEqual`. (Ch 4 §4.9)

**32. Explain `waitForUnhandledRejections` (Jest 30).**
It gives one extra event-loop turn to see whether a rejection gets handled before Jest reports it. That
avoids false failures for promises rejected first and caught slightly later, and attributes real ones
to the right test. It's `false` by default because it adds overhead (verified via `--showConfig`).
(Ch 5 §5.12)

**33. What's `globalsCleanup` in Jest 30?**
After a test file finishes, Jest can delete properties the file added to globals, to release memory
in reused workers. `'soft'` (default) keeps them but warns (`JEST-01`) on access, `'on'` deletes,
`'off'` disables. Use the warnings to find code holding globals past teardown. (Ch 12, 21)

**34. How do you test code that uses `requestAnimationFrame`?**
jsdom + fake timers (rAF is faked in jsdom), then `jest.advanceTimersToNextFrame()` (Jest 30) or
advance by 16 ms. (Ch 10 §10.8)

**35. How would you test a module that reads config at import time?**
Prefer refactoring to lazy reads. Otherwise set env, then `jest.isolateModules(() => require('./config'))`
per scenario, or `resetModules` + `require`. (Ch 8 §8.5)

## E. Leadership & communication

**36. A teammate wants to remove a failing test "because it's flaky". What do you do?**
Ask for evidence (failure rate, logs), reproduce with `--randomize`/loops, identify the root cause.
If urgent, quarantine with a ticket and owner rather than delete. Make sure the behaviour remains
covered somewhere. Delete the test only if it's redundant or tests nothing valuable. (Ch 24)

**37. How do you introduce testing to a team that has none?**
Start with CI running tests on PRs, regression tests for every bug fix, tests for new code, a shared
test-utils setup that makes writing tests easy, pairing/workshops, a coverage ratchet rather than a big
target, and celebrating caught bugs. (Ch 24 §24.7)

**38. How do you review a PR that adds 500 lines of snapshot tests?**
Ask what behaviour each snapshot protects. Request focused assertions for behaviour, inline/small
snapshots for serialisation, property matchers for dynamic fields, and lint limits. Large snapshots
become rubber-stamped noise. (Ch 11 §11.7)

**39. How would you plan a Jest 29 → 30 migration in a 2M-LOC monorepo?**
An inventory (Node/TS versions, custom transformers/environments/sequencers, deep imports into Jest
internals, alias matchers, `--testPathPattern` in scripts, jsdom location hacks). Run codemods/ESLint
autofix for aliases. Upgrade all Jest packages together on a branch, run with `--ci` across projects,
fix by category, update snapshots in an isolated commit per package, compare runtime/memory/flakes,
roll out per project via `projects` if needed. Document the changes. (Ch 25 §25.3)

**40. Jest vs Vitest for a new project: what decides it?**
Module system and build tool (Vite/ESM → Vitest), platform (React Native → Jest), existing
ecosystem/tooling, team familiarity, need for browser mode. The APIs are nearly identical, so the risk
of either choice is low. (Ch 25 §25.5)

## F. Tricky "gotcha" questions (seniors are expected to know)

41. **Does `restoreAllMocks` reset `jest.fn()` mocks?** No, only `spyOn` and `replaceProperty` (verified Jest 30).
42. **Does `mockReset` on a spy restore the original?** No, it returns `undefined` afterwards (verified Jest 30); use `mockRestore`.
43. **Does `toEqual` treat `{a: undefined}` and `{}` as equal?** Yes; `toStrictEqual` doesn't.
44. **Does `toHaveBeenCalledWith('a')` match a call `fn('a', undefined)`?** No (verified).
45. **Does `expect.anything()` match `null`?** No (not `null`/`undefined`).
46. **Does `expect.objectContaining` match nested partial objects?** Only one level. Nested objects are compared with equality unless you nest another `objectContaining` (verified); `toMatchObject` is recursive.
47. **Will a `test.concurrent` test run after `beforeEach`?** Not reliably; concurrent tests start before `beforeEach` runs for them (verified log `a,b,be`).
48. **Can a `jest.mock` inside a `test` block work?** It is not hoisted out of the function scope; the module is usually already imported, so the mock doesn't affect it. Use `doMock` + `require`.
49. **Does `jest.useFakeTimers()` in one test affect the next test?** Yes (file-global) until `useRealTimers()`.
50. **Are obsolete snapshots harmless?** No, the run exits with code 1 (verified).
51. **What does a test function returning a non-promise value do?** It fails: "test functions can only return Promise or undefined" (verified).
52. **Can a `beforeEach` returning a number fail?** No, that rule applies to tests (verified hooks with `push` returned numbers fine).
53. **`jest.spyOn(window, 'location', 'get')` in Jest 30 jsdom?** Throws "Property `location` is not declared configurable" (verified).
54. **Is `fetch` defined in jest-environment-jsdom?** No (verified), but it is in the node env on Node ≥ 18.
55. **Does `jest.mock('fs')` with a root `__mocks__/fs.js` need the explicit call?** Yes, core modules always need it.
56. **Does a root `__mocks__/axios.js` apply automatically?** Yes for node_modules packages (verified with a fake package).
57. **Is `--detectOpenHandles` free?** No: it forces in-band execution and is slower; for diagnosis only.
58. **Can `globalSetup` set globals for tests?** No (separate contexts); use `process.env` or files.
59. **Why is the default `transform` a trap for `.mjs` dependencies?** `\.[jt]sx?$` doesn't match `.mjs`, so allow-listing the package in `transformIgnorePatterns` isn't enough (verified with MSW deps).
60. **What does `--ci` do with obsolete snapshots vs new ones?** New: not written, test fails. Obsolete: reported, exit 1 (with or without `--ci`, verified).

**Next:** [Chapter 29 — Scenario, debugging & live-coding questions](29-interview-scenarios-coding.md)
