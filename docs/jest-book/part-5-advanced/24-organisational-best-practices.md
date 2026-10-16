# Chapter 24 — Organisational Best Practices & Playbooks

> 🧸 **Explain it like I'm 5**
>
> When one kid checks toys, they can do it any way they like. When **200 kids** in a big school
> check toys together, they need **shared rules**: where toys go, how to label them, what to do
> when a toy is broken, who fixes it. This chapter is the rulebook for testing in a big team.

---

## 24.1 A testing strategy document (every team should have one)

Keep it short (1–3 pages) and in the repo (`docs/testing.md`). It should answer:

1. **What do we test at each level?** (unit / integration / E2E split, with examples from our code)
2. **What tools?** Jest + RTL/RNTL + MSW + Playwright/Detox…
3. **Where do tests live and how are they named?**
4. **What must be mocked, what must not?** (e.g. "never hit real third-party APIs; DB tests use
   Testcontainers")
5. **CI gates** — what blocks a merge (tests, coverage thresholds, lint, type check).
6. **Flaky test policy** (§24.6).
7. **Ownership** — who fixes broken tests (the team that owns the code, via CODEOWNERS).

## 24.2 Conventions to standardise

| Topic | Recommended default |
| --- | --- |
| Location | co-located `*.test.ts(x)` next to source; integration tests in `test/integration/` |
| Naming | `describe('<Unit>')` → `it('<does X> when <condition>')` |
| Structure | Arrange-Act-Assert; `setup()` factory functions over shared `let` + `beforeEach` |
| Mocks | `clearMocks: true`, `restoreMocks: true` in config; mock at boundaries; shared manual mocks in `__mocks__` reviewed like code |
| Data | builders/factories in `test/factories`; seeded faker; no shared mutable fixtures |
| Network | MSW with `onUnhandledRequest: 'error'` |
| Time | fake timers or injected clock; `TZ=UTC` |
| Snapshots | small/inline only; `jest/no-large-snapshots` |
| Async | `async/await` everywhere; `eslint-plugin-jest` rules on |
| Types | test files type-checked in CI (`tsc --noEmit` includes tests) |
| Test utils | one internal `test-utils` module/package (custom render, factories, MSW handlers) |

### Lint rules worth enforcing (`eslint-plugin-jest`)

`no-focused-tests` (error), `no-disabled-tests` (warn), `no-identical-title`, `valid-expect`,
`valid-title`, `no-conditional-expect`, `no-conditional-in-test`, `no-standalone-expect`,
`no-done-callback`, `no-alias-methods`, `no-deprecated-functions`, `prefer-to-have-length`,
`prefer-to-be`, `no-large-snapshots`, `expect-expect`, `require-top-level-describe` (optional),
`prefer-hooks-on-top`, `no-test-return-statement`.
Plus `eslint-plugin-testing-library` and `eslint-plugin-jest-dom` for UI code.

## 24.3 Definition of Done (testing part)

A change is done when:
- [ ] New behaviour has tests at the right level; bug fixes include a **regression test that failed
      before the fix**.
- [ ] Tests are deterministic (no real time/network/random), isolated, and pass with `--randomize`.
- [ ] Error paths and edge cases are covered, not just the happy path.
- [ ] No `.only`, no new unexplained `.skip`, no `console.error` noise.
- [ ] Coverage didn't drop (diff coverage meets the bar).
- [ ] Snapshots updated **intentionally** and reviewed.

## 24.4 Code review checklist for tests

Reviewers ask:
1. **Would this test fail if the feature broke?** (Mentally delete a line of the implementation.)
2. Does the test name describe behaviour? Would a failure message tell me what broke?
3. Is it testing behaviour or implementation details (private state, internal calls)?
4. Are mocks limited to boundaries? Is the mock setup longer than the logic?
5. Any missing `await`? Any assertions inside callbacks that may not run?
6. Any shared mutable state between tests? Restored spies/env/timers?
7. Any real waits (`setTimeout`, `sleep`)? Real network?
8. Snapshot diff reviewed and small?
9. Edge cases: empty, null, boundaries, errors, permissions?
10. Is the test readable without jumping across five helper files?

## 24.5 Ownership and culture

- **"You break it, you fix it"**, enforced by CI: red main branch is everyone's top priority.
- CODEOWNERS covers test utils and shared mocks.
- Track test health metrics: duration (p50/p95 of CI), flake rate, number of skipped tests, coverage
  trend. Review monthly.
- Make the fast path easy: watch mode, VS Code extension, `npm test -- -o`, good docs.
- Celebrate deleting bad tests: a test that never fails or breaks on every refactor has negative
  value.

## 24.6 Flaky tests — policy and playbook (💼 very common real-world situation)

A **flaky test** passes and fails on the same code. It erodes trust: people start re-running CI
and ignoring red builds.

### Policy
1. A flaky test is a **bug** with an owner and a ticket.
2. Detect: CI test analytics or a nightly job that runs the suite N times (`--randomize`, various
   seeds).
3. If it blocks others: **quarantine** it (move to a quarantined project/tag that runs but doesn't
   block), with a ticket and an SLA (e.g. 1 week) — never silently `.skip` forever.
   `jest.retryTimes` is a temporary band-aid, not a fix.
4. Fix the root cause, then restore.

### Root-cause playbook

| Cause | Symptom | Fix |
| --- | --- | --- |
| Missing `await` / un-awaited promises | random failures, "Cannot log after tests are done" | await everything; lint rules |
| Real timers / `sleep` | fails on slow CI | fake timers / `waitFor` / events |
| Race between async UI updates | "element not found" occasionally | `findBy*` instead of `getBy*`; wait for the final state |
| Shared state / order dependence | fails only with other files | isolate; `restoreMocks`; reset singletons; `--randomize` to reproduce |
| Date/time zone | fails at midnight, month end, DST, in another TZ | fake timers + `setSystemTime`; `TZ=UTC` |
| Randomness | fails with certain random values | seed or mock randomness; property tests print the seed |
| Real network/DB | fails when service slow/down | mock (MSW) or containers with health checks |
| Resource limits | timeouts with high parallelism | fewer workers, bigger timeouts for integration tests, faster tests |
| Port conflicts | `EADDRINUSE` | use ephemeral ports (`listen(0)`), Supertest on the app object |
| Unordered data | array order differs | sort before asserting or `expect.arrayContaining` |
| Floating point | `0.30000000000000004` | `toBeCloseTo` |
| Leaking timers between tests | callbacks fire in the next test | clear timers in `afterEach` |

Reproduce locally:

```bash
for i in $(seq 1 50); do npx jest path/to/flaky.test.ts --randomize || break; done
npx jest path/to/flaky.test.ts --randomize --seed=123456   # replay the failing seed (--showSeed prints it)
```

## 24.7 "What do I do when…?" — scenario playbooks

### …I join a project with almost no tests?
1. Add Jest config + CI job with `--passWithNoTests` so the pipeline exists.
2. Add tests for **new code** and **bug fixes** first (regression tests) — that's where risk is.
3. Add characterization tests around the module you must change next.
4. Set a coverage **ratchet** (threshold = current %, raise gradually), plus diff coverage.
5. Add a few E2E smoke tests for the money paths (login, checkout).

### …a production bug is reported?
1. Write a test that reproduces it (red).
2. Fix the code (green).
3. Ask "why didn't our tests catch it?" — missing edge case? over-mocking? Add the missing level.

### …the test suite is too slow?
Chapter 22 recipe card: measure; node env by default; SWC; kill barrels; fake timers; shard; affected
tests on PRs; `workerIdleMemoryLimit`.

### …a test fails only in CI?
Chapter 23 §23.11 checklist (TZ, case sensitivity, order, resources, env, cache).

### …snapshots keep changing in every PR?
Snapshots are too big or nondeterministic. Replace with targeted assertions; use property matchers;
mock time/IDs; split.

### …deadline pressure: "skip the tests"?
Agree on the **minimum**: tests for the riskiest logic + one integration test of the happy path +
regression tests for known bugs. Record the debt as tickets. Never merge failing or `.only` tests.

### …we need to upgrade Jest (e.g. 29 → 30)?
Chapter 25 §25.3 playbook: branch, upgrade all Jest packages together, `--ci` run, fix removals with
codemods/lint autofix, update snapshots in a separate commit, compare runtime and flake rate.

### …a third-party library breaks Jest (ESM, native code, browser APIs)?
1. Read its "testing" docs — many ship Jest mocks.
2. ESM → `transformIgnorePatterns` / mapping / mock (Chapter 15).
3. Native/browser API → mock the library at your adapter boundary.

### …we're moving from JavaScript to TypeScript?
Babel/SWC TS transform so `.ts` and `.js` tests coexist; `allowJs`; migrate test utilities first;
type mocks with `jest.mocked`; add `tsc --noEmit` in CI.

### …two teams' services keep breaking each other?
Add **contract tests** (Pact): consumer tests (Jest) generate contracts; provider verifies them in
its CI. Fewer slow end-to-end environments needed.

### …tests pass but the feature is broken in production?
Classic over-mocking or testing the wrong level. Add integration tests that use real collaborators
(DB container, real HTTP layer with MSW), and an E2E smoke test for that journey.

### …someone wants 100% coverage?
Explain the cost/benefit: coverage shows untested code, not tested quality. Propose: critical modules
≥ 90% branches, global ratchet, diff coverage on PRs, periodic mutation testing.

## 24.8 Security & compliance in tests

- Never put real secrets/tokens/PII in fixtures, snapshots, or test logs. Use obviously fake values.
- Block real outbound network in unit tests (MSW `onUnhandledRequest: 'error'`, `nock.disableNetConnect()`).
- Test authorization rules explicitly (role matrix with `test.each`).
- Test input validation and error messages that must not leak internals (e.g. `500` returns a
  generic message — Chapter 18).
- Keep test dependencies updated (`npm audit`), and pin major versions of Jest packages together.

## 24.9 A sample "golden" setup for a large TypeScript monorepo

```
tools/jest/
  jest.preset.js        # shared defaults: clearMocks, restoreMocks, TZ, transforms
  setup-node.ts         # MSW server, custom matchers, fail on console.error
  setup-dom.ts          # jest-dom, polyfills, RTL configure
  factories/            # data builders
  msw/handlers.ts       # default happy-path handlers
packages/*/jest.config.js  # displayName + preset + environment
jest.config.js          # projects + coverage reporters/thresholds
.github/workflows/test.yml # sharded CI, junit, coverage upload, cache
docs/testing.md         # strategy & conventions
```

```js
// tools/jest/jest.preset.js
module.exports = {
  clearMocks: true,
  restoreMocks: true,
  testEnvironment: 'node',
  transform: { '^.+\\.(t|j)sx?$': '@swc/jest' },
  setupFilesAfterEnv: ['<rootDir>/../../tools/jest/setup-node.ts'],
  testTimeout: 10_000,
  workerIdleMemoryLimit: '1GB',
};
```

## 24.10 Summary

- Write down the strategy and conventions; enforce them with config, lint and CI.
- Review tests like production code with a checklist.
- Treat flaky tests as bugs with owners; quarantine with SLAs, never silent skips.
- Have playbooks for common situations; measure test health over time.

**Next:** [Chapter 25 — Versions, migrations and alternatives](25-versions-migration-alternatives.md)
