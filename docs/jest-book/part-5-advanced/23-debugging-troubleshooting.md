# Chapter 23 — Debugging & Troubleshooting: The Error Catalogue

> 🧸 **Explain it like I'm 5**
>
> When the robot says "something's wrong", it usually tells you **exactly** what and where — you
> just need to know how to read its language. This chapter is a **dictionary** of the robot's
> complaints, with what each one really means and how to fix it.

Messages marked ✔️ were reproduced on **Jest 30.5.2** and are quoted exactly.

---

## 23.1 A systematic debugging method

1. **Read the whole error**, including the code frame and the first stack frame in *your* code.
2. **Isolate:** run only that file and that test: `npx jest path/to/file.test.ts -t "test name"`.
3. **Does it fail alone?** If it passes alone but fails in the suite → shared state / order
   dependence (§23.6). If it fails alone → the test or code.
4. **Check the config Jest actually uses:** `npx jest --showConfig`.
5. **Clear caches** if behaviour seems stale: `npx jest --clearCache`.
6. **Add visibility:** `console.log`, `screen.debug()`, `--verbose`, `--expand` (full diff),
   `--runInBand` (keep everything in one process).
7. **Use a debugger:** `node --inspect-brk node_modules/.bin/jest --runInBand file` + `debugger;`
   (Chapter 13 §13.7), or the VS Code Jest extension's "Debug" lens.
8. **Bisect:** comment out half the test/setup; or `git bisect run npx jest path/to/test` to find the
   commit that broke it.

## 23.2 Syntax / transform errors ("Test suite failed to run")

### "Must use import to load ES Module" / "Jest encountered an unexpected token" / "Unexpected token 'export'" / "Cannot use import statement outside a module"

✔️ Jest 30.5 wording:

```
Must use import to load ES Module: /path/node_modules/esm-only/index.js

The file contains ESM syntax (import/export) that could not be executed as CommonJS. Either:
  - Configure a transform (e.g. babel-jest) that compiles this file to CommonJS
  - If the file is in "node_modules", allow it to be transformed by adjusting "transformIgnorePatterns"
  - Use Node v24.9+ where Jest supports require(esm) natively
```

**Causes & fixes:**

| Where's the file? | Fix |
| --- | --- |
| **Your own** test/source file | You have no Babel/TS transform for it. Add `babel.config.js` with `@babel/preset-env` (`targets: {node: 'current'}`) or ts-jest/SWC. Verified: with no Babel config, a test using `import` fails with exactly this error. |
| A **node_modules** package (ESM-only) | Allow it in `transformIgnorePatterns`: `['/node_modules/(?!(pkg-a|pkg-b)/)']` + root `babel.config.js`; if it ships `.mjs`, also make `transform` match `.mjs`: `'\\.[mc]?[jt]sx?$': 'babel-jest'`. Or map to a CJS build, mock it, or use Node ≥ 24.9 (Chapter 15 §15.4). |
| A file with `.mjs`/`.cjs`/`.mts` extension | The default `transform` regex `\.[jt]sx?$` doesn't match it → widen the regex. |
| Package picked its **browser ESM** build under jsdom | `testEnvironmentOptions.customExportConditions: ['node', 'node-addons']`, or `moduleNameMapper` to `require.resolve('pkg')`. |

### "SyntaxError: Unexpected token '<'"
JSX not transformed: missing `@babel/preset-react` (or `jsx` in tsconfig for ts-jest), or the file
extension isn't covered by `transform`.

### "SyntaxError: Unexpected token ':'" / "Unexpected token 'interface'"
TypeScript not transformed: add `@babel/preset-typescript`, ts-jest, or SWC.

### "Cannot find module './x' from 'y.test.js'"
✔️ `Cannot find module './does-not-exist' from 'missing.test.js'`

- Typo / wrong relative path / wrong case (📌 Jest 30 `jest.mock` paths are case-sensitive; Linux
  CI is case-sensitive even if your Mac isn't!).
- Path alias (`@/utils`) not configured → `moduleNameMapper` (+ keep in sync with tsconfig).
- Extension not in `moduleFileExtensions`.
- Module is outside `roots` / excluded by `modulePathIgnorePatterns`.
- Mocking a module that doesn't exist → `jest.mock('x', factory, { virtual: true })`.

### "Could not locate module ./styles.css mapped as: ..."
Your `moduleNameMapper` target path is wrong. Check `<rootDir>` and that the stub file exists.

### "regeneratorRuntime is not defined"
Old Babel setup transpiling `async` for old targets. Use `targets: { node: 'current' }`.

## 23.3 Environment errors

### "document is not defined" / "window is not defined"
✔️
```
The error below may be caused by using the wrong test environment, see https://jestjs.io/docs/configuration#testenvironment-string.
Consider using the "jsdom" test environment.

ReferenceError: document is not defined
```
Fix: `testEnvironment: 'jsdom'` (install `jest-environment-jsdom` — separate package since Jest 28)
or `/** @jest-environment jsdom */` for that file.

### "Test environment ... cannot be found"
✔️ `Test environment jsdomx cannot be found. Make sure the testEnvironment configuration option points to an existing node module.`
Typo, or `jest-environment-jsdom` not installed, or its major version differs from Jest's
(keep `jest`, `jest-environment-jsdom`, `babel-jest`, `ts-jest` majors aligned).

### "TextEncoder is not defined" / "fetch is not defined" / "structuredClone is not defined" / "ResizeObserver is not defined" / "window.matchMedia is not a function"
jsdom lacks them (Chapter 9 §9.10, verified list). Polyfill/mock in `setupFiles`, or use the node
environment for non-DOM tests.

### "Error: Not implemented: navigation (except hash changes)" / "Not implemented: window.scrollTo" / "HTMLCanvasElement.prototype.getContext"
jsdom limitations (✔️ navigation and scrollTo messages reproduced; they're logged via
`console.error`, they don't throw). Mock `window.scrollTo`; wrap navigation (Chapter 9); install
`canvas` or `jest-canvas-mock` for canvas.

### "Cannot redefine property: location" / "Property `location` is not declared configurable"
✔️ (the second one, from `jest.spyOn(window, 'location', 'get')`). jsdom 21+ made `location`
non-configurable. Use `history.pushState`, `testEnvironmentOptions.url`, or a navigation wrapper
module.

## 23.4 Timeouts & async problems

### "Exceeded timeout of 5000 ms for a test"
✔️ (with `done`): `Exceeded timeout of 5000 ms for a test while waiting for 'done()' to be called.`
Otherwise: `Exceeded timeout of 5000 ms for a test. Add a timeout value to this test to increase the timeout, if this is a long-running test.`

Checklist:
1. A promise never resolves (a mock with no `mockResolvedValue`, an event never fired).
2. `done` never called (or the assertion before it threw).
3. Fake timers enabled but not advanced (`await sleep()` inside code under test).
4. Real network/DB call hanging (should be mocked; or the service isn't running).
5. Actually slow: raise per-test timeout (`test(name, fn, 20000)`) or `testTimeout`.
6. Same for hooks: `Exceeded timeout of 5000 ms for a hook.` → `beforeAll(fn, 30000)`.

### Test passes but the assertion was wrong (false positive)
Missing `await`/`return` (Chapter 5 §5.1, verified false pass). Turn on
`eslint-plugin-jest/valid-expect`, `jest/no-conditional-expect`, consider `expect.hasAssertions()`
globally.

### "Received promise resolved instead of rejected"
✔️
```
expect(received).rejects.toThrow()
Received promise resolved instead of rejected
Resolved to value: 1
```
The code didn't fail the way you expected → check inputs/mocks (maybe the mock resolves by default).

### "Test functions cannot both take a 'done' callback and return something"
✔️ Remove `done` from `async` tests.

### "Cannot log after tests are done. Did you forget to wait for something async in your test?"
✔️
```
●  Cannot log after tests are done. Did you forget to wait for something async in your test?
    Attempted to log "late log".
```
Something kept running after the test finished (a timer, an un-awaited promise, a stream). Await
it, or clean it up in `afterEach`/`afterAll`.

### "You are trying to `require` a file after the Jest environment has been torn down"
✔️ `ReferenceError: You are trying to 'require' a file after the Jest environment has been torn down. From teardown.test.js.`
Same root cause: async work still running after the file finished (often a lazy `require` inside a
`setTimeout`, or a library loading modules on a timer). Await/clean up; use fake timers; close
clients in `afterAll`.

### Unhandled rejection fails the wrong test / false failures
Enable `waitForUnhandledRejections` (Jest 30, Chapter 5 §5.12); attach `.catch`/`rejects`
assertions **before** advancing fake timers (Chapter 10 §10.5).

## 23.5 "Jest won't exit" family

### "Jest did not exit one second after the test run has completed."
✔️
```
Jest did not exit one second after the test run has completed.

'This usually means that there are asynchronous operations that weren't stopped in your tests.
Consider running Jest with `--detectOpenHandles` to troubleshoot this issue.
```

### `--detectOpenHandles` output
✔️
```
Jest has detected the following 1 open handle potentially keeping Jest from exiting:

  ●  Timeout

    > 1 | test('leaves an interval', () => { setInterval(() => {}, 1000); });
        |                                    ^
```

### "A worker process has failed to exit gracefully and has been force exited..."
Same problem but in a worker: "This is likely caused by tests leaking due to improper teardown.
Try running with --detectOpenHandles to find leaks. Active timers can also cause this, ensure that
.unref() was called on them."

**Fixes:** close what you open:

```js
afterAll(async () => {
  clearInterval(intervalId);
  await server.close();          // http server
  await db.end();                // pools
  await redis.quit();
  await queue.close();
  mswServer.close();
});
```

- Timers in library code: `timer.unref()` so it doesn't keep Node alive, or fake timers.
- `--forceExit` makes the symptom disappear but hides leaks (and can cut off async logs/coverage
  writes). Use only as a last resort with a ticket to fix the leak.
- Note: `--detectOpenHandles` forces in-band execution (slower) — use it to diagnose, not in CI by
  default.

## 23.6 Mocking errors

| Message | Meaning / fix |
| --- | --- |
| ✔️ `The module factory of 'jest.mock()' is not allowed to reference any out-of-scope variables. Invalid variable access: fake` | Move the value inside the factory, prefix with `mock` (and use lazily), or use a pure literal constant (Chapter 8 §8.3) |
| ✔️ `ReferenceError: Cannot access 'mockValue' before initialization` | `mock*` variable used eagerly inside a hoisted factory → use lazily |
| `TypeError: (0 , _api.getUser) is not a function` / `x is not a function` | factory doesn't return that export; or default export missing `__esModule: true` (✔️ `main` became `{ default: [Function] }`) |
| `TypeError: Cannot read properties of undefined (reading 'mockResolvedValue')` | the thing isn't mocked (module not mocked, wrong path, ESM), or the import name is wrong |
| `TypeError: _x.default is not a constructor` | class mock is an arrow function or missing `default` |
| ✔️ `Matcher error: received value must be a mock or spy function` | you passed a real function to `toHaveBeenCalled` → mock/spy it first |
| ✔️ `TypeError: Cannot redefine property: fetchRates` | spying on a re-export/getter (barrels, TS output) → spy on the source module or `jest.mock` |
| ✔️ `Cannot spy on the 'a' property because it is not a function; number given instead...` | use `jest.replaceProperty` |
| ✔️ `Property 'nope' does not exist in the provided object` | wrong name / spying before the property exists |
| ✔️ `expect(...).toBeCalled is not a function` | Jest 30 removed alias matchers → `toHaveBeenCalled` (eslint `jest/no-alias-methods` autofix) |
| `jest.genMockFromModule is not a function` | removed in Jest 30 → `jest.createMockFromModule` |
| Mock ignored, real code runs | path mismatch (barrel vs direct), ESM mode, module imported before `jest.doMock`, or `jest.mock` inside a function/test (only top-level calls are hoisted) |
| Mock "forgets" its implementation | `resetMocks: true` / `mockReset()` → set implementations in `beforeEach` |
| `toHaveBeenCalledTimes` too high | calls leaked from previous tests → `clearMocks: true` (verified example in Chapter 16) |
| ✔️ `Expected: "a"` / `Received: "a", undefined` | argument count differs (trailing `undefined`) |
| `duplicate manual mock found: x` | two `__mocks__/x.js` in roots → rename or exclude (e.g. `dist/`) |

## 23.7 Assertion confusion

| Message | Meaning |
| --- | --- |
| ✔️ `Received: serializes to the same string` | values print the same but differ (reference with `toBe`, class vs plain object, non-enumerables) |
| ✔️ `Matcher error: received value must be a function` (toThrow) | you called the function instead of passing it: `expect(() => fn()).toThrow()` |
| `Expected constructor: Array` / `Received constructor: Array` | cross-realm object → `Array.isArray` / `toEqual` |
| float mismatch `0.30000000000000004` | `toBeCloseTo` |
| object diff shows only `undefined` keys | `toStrictEqual` vs `toEqual` semantics (Chapter 4) |
| `toHaveBeenCalledWith` fails but args look identical | mutated object after call (args stored by reference — Chapter 7 §7.3), or `undefined` vs missing arg |

## 23.8 Snapshot problems
See Chapter 11 §11.11. Key messages: ✔️ `New snapshot was not written. The update flag must be explicitly passed to write a new snapshot.`
(CI) and `1 snapshot obsolete` (exit code 1, ✔️ verified).

## 23.9 Configuration problems

| Message | Fix |
| --- | --- |
| ✔️ `Multiple configurations found: ... Implicit config resolution does not allow multiple configuration files.` | keep one (config file **or** `package.json#jest`), or pass `--config` |
| ✔️ `Unknown option "clearMock" with value true was found. Did you mean "clearMocks"?` | typo |
| ✔️ `Option "testPathPattern" was replaced by "--testPathPatterns". "--testPathPatterns" is only available as a command-line option.` | Jest 30 rename |
| ✔️ `Your test suite must contain at least one test.` | file matched `testMatch` but has no tests (a helper named `*.test.js`, or all tests inside a non-executed branch) → rename helper / fix `testMatch` |
| ✔️ `No tests found, exiting with code 1` + `Run with '--passWithNoTests' to exit with code 0` | pattern matched nothing; check the printed `testMatch`/`testPathIgnorePatterns` counts, or add `--passWithNoTests` for `-o`/`--findRelatedTests` in hooks |
| `--watch is not supported without git/hg, please use --watchAll` | not a git repo (e.g. Docker without `.git`) |
| `Haste module naming collision` | duplicate `package.json` names (e.g. in `dist/`) → `modulePathIgnorePatterns` |
| `jest: command not found` | use `npx jest` / npm scripts; install locally |
| `Preset ts-jest not found` | install it; check `preset` spelling |
| `Validation Error: Module <rootDir>/x.js in the setupFilesAfterEnv option was not found` | wrong path; `<rootDir>` points somewhere else (check `rootDir`) |

## 23.10 React-specific

| Problem | Fix |
| --- | --- |
| `Warning: An update to X inside a test was not wrapped in act(...)` | something updated after your test stopped waiting → `await findBy*`/`waitFor`; wrap manual timer advances in `act` (Chapter 16 §16.7) |
| `Invalid hook call` | two React copies (monorepo/resetModules) → dedupe via `moduleNameMapper`; avoid `resetModules` with React |
| `TestingLibraryElementError: Unable to find an element with the text: X` | ✔️ text split across elements / not rendered yet → regex/`{exact:false}`, function matcher, or `await findBy` |
| `Found multiple elements with the role "button"` | add `{ name }` or `within(container)` |
| element not found though visible in `screen.debug()` | it's `aria-hidden`/inside a hidden subtree for role queries → `{ hidden: true }` or fix accessibility |
| `user.click` does nothing | missing `await`; element disabled or `pointer-events: none` |
| test passes alone, fails together | DOM or store/QueryClient shared between tests → new providers per test; RTL cleanup requires global `afterEach` (don't disable `injectGlobals` without importing RTL's cleanup) |

## 23.11 "Works locally, fails in CI" checklist

| Cause | Fix |
| --- | --- |
| Time zone / locale (`toLocaleDateString`, `Intl`) | `TZ=UTC` in the test script; explicit locale in code/tests |
| Case-sensitive file system (Linux) | fix import casing |
| Order dependence (CI runs files on different workers / order) | isolate state; `--randomize` locally to reproduce; run CI's exact file set with `--runInBand` |
| Fewer CPUs → timeouts | `--maxWorkers`, faster tests, realistic timeouts |
| Snapshots not committed / obsolete | commit; `jest -u` locally |
| Env vars missing | `.env.test` loaded in `setupFiles`; don't depend on developer machine env |
| Network access blocked/flaky in CI | mock it (MSW `onUnhandledRequest: 'error'` catches stray calls) |
| Different Node version | pin with `.nvmrc`/`engines` and CI `setup-node` |
| Stale cache restored | include config files in the cache key; `--clearCache` |
| `CI=true` changes behaviour | `--ci` snapshot behaviour; libraries detecting CI |

## 23.12 "Passes alone, fails together" (test pollution)

1. Run the failing file alone → passes? Then find the **polluter**: run pairs of files with
   `--runInBand` (`npx jest -i a.test.js b.test.js`), bisect the list.
2. Inside one file: run with `--randomize --seed=<n>` repeatedly; use `test.only` to isolate pairs.
3. Typical polluters: un-restored spies (`restoreMocks: true`), module singletons/caches,
   `process.env` changes, fake timers left on, globals assigned (`global.fetch = ...`), DOM nodes
   appended to `document.body`, `jest.mock` in a shared setup file, DB rows left behind.

## 23.13 Memory: "JavaScript heap out of memory"
See Chapter 22 §22.3: `--logHeapUsage -i` to find the growth, fix leaks, `workerIdleMemoryLimit`,
fewer workers, `NODE_OPTIONS=--max-old-space-size=...` as a stopgap.

## 23.14 When `console.log` output seems missing

- `--silent` hides console output.
- Logs from a test that finished earlier may appear under a different test with async leaks.
- Observed on Jest 30.5.2: when many files run without `--verbose`, console output from **passing**
  files may not be printed, while failing files' logs are. Run the single file, or add `--verbose`, to
  see logs. Better: use the debugger or temporary assertions.
- Use `process.stdout.write` in `globalSetup` (no Jest console there).

## 23.15 Summary

- Read the full error; isolate; `--showConfig`; `--clearCache`; debug in band.
- Transform errors = translator didn't run (ESM packages, extensions, missing presets).
- Environment errors = node vs jsdom, missing browser APIs.
- Timeouts/"didn't exit" = something async left running → await or close it.
- Mock errors = hoisting, paths, default exports, wrong object spied.
- CI-only failures = time zone, case sensitivity, order, resources, caches.

**Next:** [Chapter 24 — Organisational best practices & playbooks](24-organisational-best-practices.md)
