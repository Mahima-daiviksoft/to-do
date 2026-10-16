# Chapter 21 — How Jest Works Inside (Internals)

> 🧸 **Explain it like I'm 5**
>
> Jest is a **factory** with many workers. A **map-maker** draws a map of every file in your
> project. A **planner** decides which checks to run first. **Helpers** (worker processes) each
> take a test file, build a **bubble** (a fresh pretend world) for it, translate the code, run the
> checks inside the bubble, and send the results back to the **announcer**, who prints them.

Knowing this explains most "weird" Jest behaviour: why files are isolated, why `jest.mock` must be
hoisted, why the first run is slower, why `--runInBand` helps debugging, why memory grows.

---

## 21.1 Jest is a monorepo of packages

| Package | Job |
| --- | --- |
| `jest` / `jest-cli` | the command, argument parsing (`yargs`) |
| `@jest/core` | orchestrates a run: config → haste map → search → schedule → report |
| `jest-config` | reads, validates (`jest-validate`), normalises config; defaults |
| `jest-haste-map` | crawls the file system, builds the file/module map, watches files |
| `jest-resolve` | module resolution (Node algorithm + `moduleNameMapper`, `exports`, platforms); 📌 Jest 30 uses the Rust-based `unrs-resolver` |
| `@jest/test-sequencer` | orders test files |
| `jest-runner` | runs test files, in band or via workers |
| `jest-worker` | process (or thread) pool |
| `jest-runtime` | the module system inside each test file: registry, `require`, mocks, `jest` object |
| `@jest/transform` (`ScriptTransformer`) | calls transformers, caches output |
| `babel-jest`, `babel-plugin-jest-hoist`, `babel-preset-jest` | Babel integration & `jest.mock` hoisting |
| `jest-environment-node` / `-jsdom` | create the global object (vm context) |
| `jest-circus` | the test framework: `describe`/`test`/hooks, event state machine (default runner since Jest 27; `jest-jasmine2` was the old one) |
| `expect`, `@jest/expect`, `@jest/expect-utils`, `jest-matcher-utils` | assertions & equality |
| `jest-snapshot` | snapshot matchers, inline snapshot writing |
| `jest-mock` | `ModuleMocker`: `fn`, `spyOn`, automock metadata |
| `@jest/fake-timers` | modern (`@sinonjs/fake-timers`) and legacy timers |
| `pretty-format`, `jest-diff` | printing values & diffs |
| `jest-message-util` | formatting errors, stack traces, code frames |
| `@jest/reporters` | default/summary/verbose/coverage/GitHub reporters |
| `jest-changed-files` | git/hg/sapling integration for `-o`, `--changedSince` |
| `jest-watcher` | watch mode UI & plugins |
| `jest-each` | `.each` tables |
| `jest-docblock` | parses `@jest-environment` pragmas |
| `jest-leak-detector` | `--detectLeaks` |

📌 Jest 30 bundles each package into a single file, so deep imports like
`require('jest-runner/build/testWorker')` no longer work.

## 21.2 The life of `npx jest` — step by step

### 1. Read config
`jest-config` merges CLI args + config file + defaults + preset, validates unknown options (warns
"Unknown option ..."), resolves `<rootDir>`, and splits it into a **global config** (one per run)
and **project configs** (one per project).

### 2. Build the haste map (file system snapshot)
`jest-haste-map`:
- lists all files under `roots` with `moduleFileExtensions` (using **Watchman** if installed and
  `watchman: true`, otherwise a Node crawler (`fdir`) or `find`),
- for changed files, workers parse them to extract dependencies (`require`/`import` strings) and
  `@providesModule`-style "haste" names (used by React Native/Meta-style codebases),
- records `__mocks__` files (that's where "duplicate manual mock found" comes from),
- **caches** everything in `cacheDirectory`, so the next run only re-reads changed files.

### 3. Find tests
`SearchSource` filters files by `testMatch`/`testRegex`, `testPathIgnorePatterns`, CLI patterns,
`-o`/`--changedSince` (via `jest-changed-files` + the dependency graph: "which tests depend on these
changed files?"), `--findRelatedTests`, `--shard`.

### 4. Order & schedule
`@jest/test-sequencer` sorts: previously **failed** files first, then **slowest** first (timings
from the cache), then larger files — so long files start early and the run finishes sooner.

Then `@jest/core` decides **in band vs workers** (verified from the 30.5 source):

```
runInBand if:
  --runInBand or --detectOpenHandles was passed            → yes
  watch / watchAll                                          → no (keep TTY responsive)
  workerIdleMemoryLimit is set                              → no
  maxWorkers <= 1, or only 1 test file                      → yes
  ≤ 20 test files AND all of them took < 1s last time       → yes (spawning workers costs more)
  otherwise                                                 → workers
```

### 5. Run each test file (`jest-runner` → `runTest`)
For each file, in a worker (or the main process):

1. Read the docblock → choose environment (`@jest-environment`).
2. Create the **environment** → a fresh global object in a `vm` context
   (`jest-environment-node` copies Node globals like `process`, `Buffer`, timers; jsdom creates
   `window`/`document`).
3. Create a **`jest-runtime`** for the file: empty module registry, mock registry, the `jest` object.
4. Install the test framework (`jest-circus`), then run `setupFiles`, then `setupFilesAfterEnv`.
5. `require` the test file through the runtime:
   - resolve path → is it mocked? → transform (cached) → wrap in a function
     (`vm.compileFunction` in Jest 30) with `module, exports, require, __dirname, __filename, jest`
     → execute in the context.
6. jest-circus runs the **collection phase** (building a tree of describe blocks, tests, hooks),
   then the **execution phase**, emitting events (`run_start`, `test_start`, `hook_start`,
   `test_fn_failure`, `test_done`, …).
7. Collect results (+ coverage, snapshots), tear down the environment, send results to the parent.

### 6. Report
Results stream to reporters as files finish (`onTestResult`), then the summary, coverage merge &
threshold check, snapshot summary (written/updated/obsolete), and the exit code.

## 21.3 Why test files are isolated

Each file gets its **own vm context** (globals) and its **own module registry**. So:
- a module imported by 50 test files is **evaluated 50 times** (once per file),
- globals/mocks/module state don't leak between files,
- but this has a **cost**: big import graphs (e.g. barrel files pulling the whole app, heavy UI
  libraries) are re-evaluated for every file → the #1 cause of slow Jest suites (Chapter 22).

Workers are **reused** across files, so things that escape the sandbox (native modules, real timers
on the host, `process.on` handlers, references held by globals) can accumulate → memory growth.
📌 Jest 30's `globalsCleanup` (default `'soft'`, warns with `JEST-01`) helps find globals that keep
memory alive between files; `workerIdleMemoryLimit` recycles bloated workers.

## 21.4 The module registry & mocking internals

`jest-runtime.requireModuleOrMock(from, moduleName)`:

1. Is there an explicit mock (`jest.mock` with factory, `jest.doMock`, `setMock`)? → return it
   (factory run once and cached).
2. Is automock on, or `jest.mock(name)` without factory? → manual mock in `__mocks__`? use it;
   otherwise **generate an automock**: load the real module in isolation, read its shape with
   `moduleMocker.getMetadata()`, build mocks with `generateFromMetadata()`.
3. Is it a `node_modules` package with a root `__mocks__` file (and not explicitly unmocked)? → use
   it.
4. Otherwise → the real module (`requireActual` path): resolve, transform, execute, cache in the
   registry.

`jest.resetModules()` simply empties the registry (and mock registry instances); next `require`
re-evaluates. `isolateModules` swaps in a temporary registry.

Hoisting (`babel-plugin-jest-hoist`) exists because step 1 must be configured **before** the
imports execute — and imports are evaluated at the top of the file.

## 21.5 The transform cache

`@jest/transform`'s `ScriptTransformer` computes a **cache key** from: file content, file path,
config string, transformer's `getCacheKey`, instrumentation flag (coverage), and supports flags
(ESM vs CJS). Output is stored under `cacheDirectory` (see `--showConfig`, typically
`/tmp/jest_<hash>`).

- Coverage runs use **separate cache entries** (instrumented code).
- A transformer with a bad `getCacheKey` → stale output after config changes → `--clearCache`.
- CI: caching `cacheDirectory` between runs can speed things up (key it on lockfile + config).

## 21.6 jest-circus: the event state machine

Every `describe`/`test`/hook registration and execution dispatches an event. The state contains the
tree of `DescribeBlock`s with `children` (tests and blocks) and `hooks`. Key events:

```
setup → add_hook / add_test / start_describe_definition / finish_describe_definition  (collection)
run_start → run_describe_start → test_start → hook_start/hook_success → test_fn_start
→ test_fn_success | test_fn_failure → test_done → run_describe_finish → run_finish   (execution)
```

Custom environments can observe these via `handleTestEvent` (Chapter 20). `test.concurrent` tests
are started early (during collection → `add_test`), which is why `beforeEach` hooks don't wrap them
the normal way (Chapter 3 §3.7).

## 21.7 How `expect` reports failures

A matcher returns `{ pass, message }`. `expect` throws a `JestAssertionError` with
`matcherResult` attached when the result is a failure. jest-circus catches it as a test error;
`jest-message-util` formats the message, filters internal stack frames, and adds a **code frame**
from the source map (that's why accurate source maps matter).

`expect.assertions(n)` works by counting `assertionCalls` in `expect.getState()`; circus checks it
after the test.

## 21.8 Fake timers internals

`jest.useFakeTimers()` installs `@sinonjs/fake-timers` on the **environment's global** (not the host
Node), replacing timer functions and `Date`. Timers are stored in a priority queue by due time;
`advanceTimersByTime` pops due timers in order, running their callbacks synchronously. Native
promises stay real → the async variants interleave `await` between timers.

## 21.9 Watch mode internals

`jest-haste-map` keeps a watcher (Watchman, or 📌 since 30.5 `@parcel/watcher` for the non-Watchman
path). On change, `jest-watcher` computes affected tests through the dependency graph and re-runs
them. Watch mode always uses workers (not in band).

## 21.10 Where things can go wrong (mapped to internals)

| Symptom | Internal cause |
| --- | --- |
| first run slow, next fast | haste map + transform cache cold vs warm |
| stale behaviour after config change | transform cache key didn't change → `--clearCache` |
| `duplicate manual mock found` | haste map saw two `__mocks__/x.js` |
| `Haste module naming collision` | two `package.json` with the same `name` under roots (e.g. `dist/` copies) → `modulePathIgnorePatterns` |
| memory grows across files | workers reused; leaked globals/handles → `workerIdleMemoryLimit`, fix leaks |
| breakpoints not hit | test ran in a worker → `--runInBand` |
| mock not applied | module loaded before mock registration (not hoisted / ESM) |
| `instanceof` fails | value created in another realm (host vs vm context) |

## 21.11 Summary

- Config → haste map → search → sequence → (in band | workers) → per-file environment + runtime →
  circus → reporters.
- Every test file: new vm context + new module registry → isolation (and re-evaluation cost).
- Mocks live in the runtime's registry; hoisting makes registration happen before imports.
- Caches (haste map + transforms) make warm runs fast; clear them when in doubt.

**Next:** [Chapter 22 — Performance, CI/CD, monorepos](22-performance-ci-monorepos.md)
