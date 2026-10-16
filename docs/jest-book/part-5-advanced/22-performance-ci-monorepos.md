# Chapter 22 — Performance, CI/CD, Monorepos and Scaling

> 🧸 **Explain it like I'm 5**
>
> When you have 10 toy cars, checking them is quick. With **10,000** cars, you need a plan: more
> helpers working at the same time, checking only the cars that changed, not re-building the whole
> garage for every car, and splitting the cars across several rooms. This chapter is that plan.

---

## 22.1 Measure first

```bash
npx jest --verbose                # per-test durations
npx jest --logHeapUsage -i        # heap after each file (memory leaks)
npx jest --json --outputFile=results.json   # per-file timings to analyse
```

- Jest flags files slower than `slowTestThreshold` (default 5s) in the output.
- The custom reporter from Chapter 20 lists slow tests.
- Compare `Time:` with and without `--coverage`, with `--no-cache` (cold) and warm.
- CPU profile a single file: `node --cpu-prof node_modules/.bin/jest -i path/to/slow.test.ts`
  (produces a `.cpuprofile` to open in Chrome DevTools).

## 22.2 The usual suspects (ordered by how often they matter)

| # | Cause | Fix |
| --- | --- | --- |
| 1 | **Huge import graphs per test file** (barrel `index.ts` files importing the whole app, icon libraries, lodash full, UI kits). Every file re-evaluates them (isolation, Chapter 21) | import from specific paths; avoid barrels in app code; tools like `babel-jest-boost` / `babel-plugin-transform-barrels` (the Jest 30 release notes mention speedups up to 100x); mock heavy modules |
| 2 | **Type-checking transformer** (`ts-jest` with full type-check) | `isolatedModules: true` in tsconfig, or SWC/Babel + separate `tsc --noEmit` |
| 3 | **jsdom where not needed** | default `testEnvironment: 'node'`; jsdom only for DOM tests (docblock or a separate project) |
| 4 | **Coverage always on** | collect only in CI; try `coverageProvider: 'v8'` |
| 5 | **Real waiting** (`sleep`, real timers, polling, retry backoff) | fake timers; mocked I/O |
| 6 | **Expensive `beforeEach`** (re-creating DB schema, rendering big trees) | `beforeAll` for read-only setup; truncate instead of re-migrate |
| 7 | **Wrong worker count** in CI (containers report host cores) | `--maxWorkers=50%` or an explicit number; benchmark |
| 8 | **Cold caches in CI** | cache Jest's `cacheDirectory` (keyed on lockfile + config) |
| 9 | **Memory leaks → swapping/GC thrash** | fix leaks; `workerIdleMemoryLimit: '512MB'` |
| 10 | **`resetModules` everywhere** | re-evaluation per test; use only where needed |
| 11 | **Running everything on every PR** | `--changedSince=origin/main`, `--onlyChanged`, affected-project tooling (Nx/Turborepo) — but run the full suite on main |
| 12 | **Watchman missing** on huge repos | install Watchman (faster crawling/watching) |

## 22.3 Workers and memory

- Default `maxWorkers`: number of cores − 1 (single run), half the cores (watch).
- In Docker/Kubernetes CI, Node may see the **host's** CPU count, not your container's quota →
  too many workers, all fighting for 2 CPUs → slower + OOM. Always set `--maxWorkers` explicitly in
  CI (try `2`, `4`, `50%` and measure).
- `--runInBand` (`-i`) can be **faster** for small suites (no worker startup, shared caches) and is
  required for debugging.
- `workerIdleMemoryLimit` (e.g. `'1GB'` or `0.2` for 20% of RAM) restarts a worker after a file if
  its heap exceeds the limit. It was added as a workaround for memory growth in Node ≥ 16.11 with
  Jest (issue #11956) and is the standard fix for "JavaScript heap out of memory" in big suites.
  ⚠️ Percentage limits don't work correctly on some CI providers (e.g. CircleCI Linux reports wrong
  total memory) → use absolute values.
- Raise Node's heap if needed: `NODE_OPTIONS=--max-old-space-size=4096 jest` (treats the symptom).
- `workerThreads: true` (experimental) can reduce memory/startup overhead; test it.

### Finding a memory leak

1. `npx jest -i --logHeapUsage` → does heap grow file after file?
2. `npx jest --detectLeaks` (experimental) → fails files whose environment isn't garbage collected.
3. Common causes: unclosed servers/DB pools, `setInterval` not cleared, global caches/singletons,
   event listeners on `process`, mocked modules holding big data, a library patching globals,
   spies never restored.
4. Heap snapshot: `node --inspect-brk --expose-gc node_modules/.bin/jest -i --logHeapUsage` →
   Chrome DevTools Memory tab → compare snapshots.

## 22.4 CI/CD setup

### Essential flags

```bash
jest --ci --coverage --maxWorkers=2 --reporters=default --reporters=jest-junit
```

- `--ci`: don't write new snapshots (fail instead).
- `--coverage` + thresholds.
- JUnit XML (`jest-junit`) so the CI UI shows test results; or the built-in `github-actions`
  reporter for annotations.
- `--silent` if logs are noisy (but keep logs available when debugging failures).

### GitHub Actions with sharding

```yaml
name: test
on: [pull_request, push]
jobs:
  jest:
    runs-on: ubuntu-latest
    strategy:
      fail-fast: false
      matrix:
        shard: [1, 2, 3, 4]
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - uses: actions/cache@v4
        with:
          path: /tmp/jest_cache
          key: jest-${{ runner.os }}-${{ hashFiles('package-lock.json', 'jest.config.*', 'babel.config.*') }}
      - run: npx jest --ci --shard=${{ matrix.shard }}/4 --cacheDirectory=/tmp/jest_cache --coverage --maxWorkers=2
      - uses: actions/upload-artifact@v4
        with:
          name: coverage-${{ matrix.shard }}
          path: coverage/coverage-final.json
```

Then a follow-up job merges coverage (`npx nyc merge coverage-dir merged.json && npx nyc report -t . --reporter=lcov`)
or upload each shard to Codecov (it merges).

`--shard` splits **test files** (by path hash by default, or your custom sequencer's `shard()`).
Balance improves with many small files.

### Pull request strategies

| Strategy | Command | Trade-off |
| --- | --- | --- |
| Full suite every PR | `jest --ci` | safest, slowest |
| Affected only | `jest --ci --changedSince=origin/main` | fast; relies on the dependency graph (misses config/env changes, dynamic requires) → always run full suite on `main`/nightly |
| Monorepo affected projects | `nx affected -t test` / `turbo run test --filter=...[origin/main]` | fast; per-package configs |
| Pre-commit | `jest --bail --findRelatedTests --passWithNoTests` via lint-staged | catches obvious breaks before push; keep it fast |

### Flaky tests in CI

- `jest.retryTimes(n, { logErrorsBeforeRetry: true })` (jest-circus only) can unblock pipelines
  **temporarily** — but it hides real problems. Track retried tests and fix them (Chapter 24).
- Jest 30 options: `waitBeforeRetry`, `retryImmediately`, and (30.5) `entireDescribe`.
- Record flakiness: JUnit XML + CI analytics (e.g. Buildkite Test Analytics, Datadog CI Visibility,
  Trunk, CircleCI insights).

## 22.5 Monorepos

### Option A — one root `jest.config.js` with `projects`

```js
// jest.config.js (root)
module.exports = {
  projects: ['<rootDir>/packages/*/jest.config.js', '<rootDir>/apps/*/jest.config.js'],
  coverageReporters: ['text-summary', 'lcov'],      // global-only options live here
  coverageThreshold: { global: { lines: 80 } },
};
```

```js
// packages/ui/jest.config.js
module.exports = {
  displayName: 'ui',
  testEnvironment: 'jsdom',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  transform: { '^.+\\.(t|j)sx?$': '@swc/jest' },
};
```

- `npx jest` runs everything in **one Jest process tree** (workers shared, one coverage report).
- `npx jest --selectProjects ui` runs one project.
- Shared config: a `jest.preset.js` / base config in a `tools/` package, extended with `mergeConfig`
  or object spread.

### Option B — each package runs its own Jest (via workspace scripts / Nx / Turborepo)

- Better caching per package ("affected" + remote cache: only re-run tests for changed packages).
- Each package can pin its own Jest/TS setup.
- Coverage merged in CI afterwards.

### Monorepo pitfalls

| Problem | Fix |
| --- | --- |
| `Haste module naming collision` (two `package.json` with the same name, e.g. `dist/`) | `modulePathIgnorePatterns: ['<rootDir>/dist/']` |
| Babel not applied to sibling packages | `babel.config.js` at the **root** (+ `rootMode: 'upward'` for babel-jest if config lives above) |
| Importing a sibling package resolves its **built** `dist` (stale) | `moduleNameMapper` to `src`, or package `exports` with a `development`/`source` condition + `customExportConditions` |
| Two copies of React → "Invalid hook call" | `moduleNameMapper` `'^react$': '<rootDir>/node_modules/react'` (dedupe), or fix hoisting |
| Different TS path aliases per package | per-project `moduleNameMapper` generated from each tsconfig |

## 22.6 Speed recipe card (copy into your team wiki)

1. `testEnvironment: 'node'` by default; jsdom per-file/project.
2. SWC or Babel transform; `tsc --noEmit` in a separate CI job.
3. No barrels in app code; import specific modules.
4. Fake timers and mocked I/O in unit tests; no sleeps.
5. `clearMocks`/`restoreMocks` instead of `resetModules`.
6. CI: explicit `--maxWorkers`, cache `cacheDirectory`, shard big suites, coverage only in CI.
7. `workerIdleMemoryLimit` if memory climbs.
8. PRs: affected tests; main: full suite.
9. Watch the slowest 20 tests every sprint; treat test speed as a product feature.

## 22.7 Summary

- Measure (verbose timings, heap usage, CPU profiles) before optimising.
- Big import graphs, type-checking transforms, jsdom, coverage and real waiting are the main costs.
- Tune workers explicitly in CI; recycle leaky workers with `workerIdleMemoryLimit`.
- Shard, cache, and run affected tests; use `projects` or per-package runs in monorepos.

**Next:** [Chapter 23 — Debugging & troubleshooting](23-debugging-troubleshooting.md)
