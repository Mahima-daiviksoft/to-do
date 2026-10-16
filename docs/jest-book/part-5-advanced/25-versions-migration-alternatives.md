# Chapter 25 — Versions, Migrations and Alternatives

> 🧸 **Explain it like I'm 5**
>
> Toys get new versions: sometimes a button moves, sometimes an old button is removed. When you
> upgrade, you read the "what changed" sheet so nothing surprises you. And sometimes another toy
> (Vitest, Node's built-in runner) does the same job — you should know how they compare.

---

## 25.1 Jest timeline — what changed when (verified against the official changelogs)

| Version | Year | Highlights you should know |
| --- | --- | --- |
| first public release | 2014 | Created at Facebook; built on Jasmine; automocking on by default |
| 14 | 2016 | **Snapshot testing** introduced |
| 15 | 2016 | **Automock off by default** |
| 20 | 2017 | `.resolves`/`.rejects`; snapshots no longer written automatically on CI |
| 23 | 2018 | `test.each`/`describe.each` (jest-each moved into core); `toMatchInlineSnapshot` (23.3); `jest.retryTimes` (23.2) |
| 24 | 2019 | Babel 7 / TypeScript via Babel; `setupFilesAfterEnv` replaces `setupTestFrameworkScriptFile`; `jest.isolateModules` |
| 26 | 2020 | `jest.createMockFromModule` (renamed from `genMockFromModule`); "modern" fake timers available; Node 8 dropped |
| **27** | 2021 | **Defaults changed:** `testEnvironment: node` (was jsdom), **jest-circus** runner (was jasmine2), **modern fake timers**; multiple `done()` calls fail; `describe` returning a value fails; `jest.mocked` (27.4) |
| **28** | 2022 | **`jest-environment-jsdom` no longer bundled** (install separately); `jest-jasmine2` not bundled; `testURL` → `testEnvironmentOptions.url`; `extraGlobals` → `sandboxInjectedGlobals`; `timers` → `fakeTimers` config; `--shard`; multiple configs = error; `test.failing` (28.1) |
| — | 2022 | Meta transfers Jest to the **OpenJS Foundation** |
| **29** | 2022 | Snapshot format default `{escapeString: false, printBasicPrototype: false}`; jsdom 20; `jest.mocked` deep by default; `workerIdleMemoryLimit`; Node 12/17 dropped. 29.x adds `jest.replaceProperty` & `isolateModulesAsync` & custom equality testers (29.4), async timer APIs (29.5) |
| **30** | June 2025 | See 25.2 |

## 25.2 Jest 30 — everything that changed (🎯 hot interview topic in 2025–26)

**Breaking:**
- Node 14, 16, 19, 21 dropped (changelog also lists 23); minimum **TypeScript 5.4**.
- `jest-environment-jsdom` upgraded jsdom 21 → **26** (stricter; e.g. `window.location` can't be
  redefined).
- **Alias matchers removed:** `toBeCalled`, `toBeCalledTimes`, `toBeCalledWith`, `lastCalledWith`,
  `nthCalledWith`, `toReturn`, `toReturnTimes`, `toReturnWith`, `lastReturnedWith`,
  `nthReturnedWith`, `toThrowError` → use `toHaveBeenCalled…`, `toHaveReturned…`, `toThrow`.
- Non-enumerable properties excluded from object equality by default.
- Stricter TS types for `toHaveBeenCalledWith` (parameter inference).
- `--testPathPattern` → **`--testPathPatterns`** (config `testPathPattern` → CLI-only `testPathPatterns`).
- **`jest --init` removed** → `npm init jest@latest`.
- CLI flags requiring values are validated.
- `--filter` must return `{ filtered: [...] }`.
- `.mts`/`.cts` in default `moduleFileExtensions`; `testMatch` includes `mjs/cjs/mts/cts`.
- `jest.genMockFromModule` removed → `jest.createMockFromModule`.
- Types `SpyInstance`, `MockFunctionMetadata(Type)` removed → `jest.Spied`.
- `jest.mock` paths are **case-sensitive**.
- Snapshots: goo.gl link replaced in headers, `Error.cause` printed, empty-string React children not
  printed, `ArrayBuffer`/`DataView` printed readably → update snapshots once.
- Packages bundled into single files; deep imports into Jest internals break.
- Glob library upgraded (v10, later v13) — unusual patterns may behave differently.
- Promise rejections handled asynchronously no longer cause false failures (with
  `waitForUnhandledRejections`, Chapter 5).
- Custom test sequencers get `globalConfig` & `contexts`.

**New features:**
- `using` with spies (auto-restore), `expect.arrayOf`, `test.each` `%$` placeholder,
  `jest.advanceTimersToNextFrame()`, `jest.retryTimes` options (`waitBeforeRetry`,
  `retryImmediately`), `jest.unstable_unmockModule`, `jest.onGenerateMock`, `SERIALIZABLE_PROPERTIES`,
  async `setupFilesAfterEnv`, TS config files & `.mts/.cts` support, `import.meta` improvements,
  `globalsCleanup` (soft by default), `@jest/environment-jsdom-abstract`, faster resolver
  (`unrs-resolver`), less memory.
- Later 30.x: `defineConfig`/`mergeConfig` (30.3), `--collectTests`, `jest.config.mts`,
  `workerGracefulExitTimeout`, per-project `verbose`/`silent`, `Temporal` support in timers (30.4),
  `mockFn.whenCalledWith`, `retryTimes({ entireDescribe })`, `require(esm)` on Node ≥ 24.9 (30.5),
  Node type stripping without a transformer (30.5.2).

## 25.3 Upgrade playbook (e.g. this repo: Jest 29.7 → 30)

1. **Branch** and make sure the suite is green on the current version.
2. Check **Node ≥ 18** and **TypeScript ≥ 5.4**.
3. Upgrade **all Jest packages together** (same major): `jest`, `babel-jest`,
   `jest-environment-jsdom`, `@jest/globals`, `ts-jest` (its major tracks Jest), `@types/jest`
   (or switch to `@jest/globals`).
4. Autofix removed aliases: `npx eslint --fix --rule 'jest/no-alias-methods: error' .`
   (with `eslint-plugin-jest`), and search for `toThrowError`, `genMockFromModule`.
5. Replace `--testPathPattern` in scripts/CI; replace `jest --init` in docs.
6. Run `npx jest --ci`. Fix:
   - jsdom 26 differences (`window.location` hacks → Chapter 9 §9.10),
   - TS errors from stricter `toHaveBeenCalledWith` types,
   - `jest.mock` path casing.
7. Update snapshots **in a separate commit** (`npx jest --ci=false -u`), and review the diff (expect
   header-link changes, maybe `cause` and React empty strings).
8. Compare runtime and memory; consider `globalsCleanup: 'on'` if no `JEST-01` warnings appear.
9. Merge; watch CI flake rate for a week.

For this repository specifically, Chapter 17 §17.6 verified that `npm i -D jest@30 babel-jest@30`
already passes all tests.

## 25.4 Migrating to Jest from other tools

### From Mocha + Chai + Sinon

| Mocha/Chai/Sinon | Jest |
| --- | --- |
| `describe`/`it`/`before`/`after` | `describe`/`it`/`beforeAll`/`afterAll` |
| `beforeEach`/`afterEach` | same |
| `expect(x).to.equal(y)` | `expect(x).toBe(y)` |
| `expect(x).to.deep.equal(y)` | `expect(x).toEqual(y)` |
| `expect(x).to.be.true` | `expect(x).toBe(true)` |
| `expect(fn).to.throw(Err)` | `expect(fn).toThrow(Err)` |
| `expect(arr).to.include(x)` | `expect(arr).toContain(x)` |
| `expect(obj).to.have.property('a', 1)` | `expect(obj).toHaveProperty('a', 1)` |
| `sinon.stub().returns(1)` | `jest.fn().mockReturnValue(1)` |
| `sinon.stub().resolves(1)` | `jest.fn().mockResolvedValue(1)` |
| `sinon.spy(obj, 'm')` | `jest.spyOn(obj, 'm')` |
| `sinon.assert.calledWith(s, 1)` / `expect(s).to.have.been.calledWith(1)` | `expect(s).toHaveBeenCalledWith(1)` |
| `sinon.useFakeTimers()` / `clock.tick(100)` | `jest.useFakeTimers()` / `jest.advanceTimersByTime(100)` |
| `sandbox.restore()` | `jest.restoreAllMocks()` / `restoreMocks: true` |
| `proxyquire` / `rewire` | `jest.mock` |
| `nyc` | `jest --coverage` |
| `this.timeout(5000)` | third arg to `test` / `jest.setTimeout` |

`npx jest-codemods` automates much of this (Mocha, Chai, Jasmine, AVA, Tape, Sinon → Jest).

### From Jasmine / Karma (e.g. old Angular)
- `jasmine.createSpy()` → `jest.fn()`; `spyOn(obj, 'm').and.returnValue(1)` →
  `jest.spyOn(obj, 'm').mockReturnValue(1)`; `.and.callFake(fn)` → `.mockImplementation(fn)`;
  `.calls.count()` → `.mock.calls.length`; `jasmine.any(Number)` → `expect.any(Number)`;
  `jasmine.objectContaining` → `expect.objectContaining`.
- Karma ran in real browsers; Jest uses jsdom — layout-dependent tests need rethinking.
- Angular: `jest-preset-angular`.

### From Enzyme to RTL
See Chapter 16 §16.12.

## 25.5 Alternatives — when and why

### Vitest
- Jest-compatible API (`describe`, `it`, `expect`, `vi.fn`, `vi.mock`, `vi.spyOn`,
  `vi.useFakeTimers`, snapshots, coverage via v8/istanbul).
- Built on **Vite**: native ESM, reuses your Vite config/plugins/aliases, very fast watch mode with
  HMR-style re-runs.
- Differences to remember:
  - Globals are **off by default** (import from `vitest`, or set `globals: true`).
  - `vi.mock` is hoisted too; to use variables in a factory use `vi.hoisted(() => ...)`.
  - Default environment is `node`; jsdom or `happy-dom` available; also a real **browser mode**.
  - Test context: `test('x', ({ expect }) => ...)` — local `expect` for concurrent tests (Jest has
    no such parameter — Chapter 3 §3.7).
  - Some mock-reset semantics differ between versions — read the Vitest docs when migrating.
- Choose Vitest for Vite-based front ends and ESM-first codebases; Jest remains the standard for
  React Native, many large existing codebases, and Meta-style tooling.

Migration Jest → Vitest is mostly mechanical: `jest.` → `vi.`, imports from `vitest`, config into
`vite.config.ts` `test` section, replace `jest.requireActual` with `await vi.importActual`.

### Node's built-in test runner (`node:test`)
- Zero dependencies: `node --test`; `describe/it/test`, hooks, `mock.fn()`, `mock.method()`,
  `mock.timers`, snapshots (newer Node), coverage (`--experimental-test-coverage`), module mocking
  (`mock.module`, experimental).
- Assertions via `node:assert`. Good for libraries and small Node services; less ecosystem for UI.

### Bun test
- `bun test` with a largely Jest-compatible API, very fast; tied to the Bun runtime.

### Others
- **Mocha** (flexible, bring your own assertions/mocks), **AVA** (concurrent by default),
  **uvu** (tiny), **Playwright Test** (E2E & component testing in real browsers),
  **Cypress** (E2E/component), **Detox** (React Native E2E, can use Jest as runner).

### Comparison table

| | Jest | Vitest | node:test |
| --- | --- | --- | --- |
| Setup | zero-config for CJS; transforms needed for TS/ESM | zero-config with Vite; native ESM/TS | built into Node |
| Speed | good (workers, caching) | usually faster for ESM/Vite apps | fast startup |
| Mocking | richest (`jest.mock` hoisting, automock, manual mocks) | very similar (`vi.mock`, `vi.hoisted`) | basic, improving |
| ESM | experimental native; CJS transform is the stable path | native | native |
| DOM | jsdom | jsdom, happy-dom, browser mode | none built in |
| React Native | ✅ standard (preset) | limited | ❌ |
| Ecosystem | largest | large & growing | small |

🎯 Interview answer for "Jest or Vitest?": *"For a Vite/ESM front end I'd pick Vitest for speed and
config reuse; for React Native or a large existing Jest codebase, Jest. Both share the same API, so
the testing skills transfer. The deciding factors are module system (ESM vs CJS), build tool, and
platform support."*

## 25.6 Summary

- Know the big default changes: 27 (node env, circus, modern timers), 28 (jsdom separate), 29
  (snapshot format), 30 (aliases removed, jsdom 26, `testPathPatterns`, new APIs).
- Upgrade all Jest packages together, fix removals with codemods/lint, update snapshots separately.
- Migrations from Mocha/Jasmine/Sinon are mechanical (`jest-codemods`).
- Vitest is the main alternative (ESM/Vite), `node:test` for dependency-free Node testing.

**Next:** [Part 6 — Chapter 26: Interview questions (Beginner)](../part-6-interview/26-interview-beginner.md)
