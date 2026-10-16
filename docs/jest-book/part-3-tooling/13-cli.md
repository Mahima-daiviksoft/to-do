# Chapter 13 — The Jest CLI

> 🧸 **Explain it like I'm 5**
>
> The CLI is the **remote control** for the robot. You can press buttons like "only check the
> kitchen", "stop at the first broken toy", "check one room at a time", "tell me what you checked",
> or "do it again whenever I move something".

---

## 13.1 Running Jest

```bash
npx jest [regexForTestFiles] [options]
npm test -- [options]          # through package.json "test": "jest"
yarn test [options]            # yarn passes args directly
```

Arguments without a flag are **regexes matched against test file paths**:

```bash
npx jest cart                  # any test path containing "cart"
npx jest "src/(cart|checkout)" # regex
npx jest src/cart/cart.test.ts # exact file
```

## 13.2 Short aliases (verified with `jest --help`, Jest 30)

| Short | Long | Meaning |
| --- | --- | --- |
| `-b` | `--bail[=n]` | stop after n failed test suites |
| `-c` | `--config <path>` | config file |
| `-e` | `--expand` | full diffs |
| `-f` | `--onlyFailures` | re-run only tests that failed last run |
| `-h` | `--help` | help |
| `-i` | `--runInBand` | run serially in the current process (no workers) |
| `-o` | `--onlyChanged` | tests related to changed (uncommitted) files |
| `-t` | `--testNamePattern <regex>` | run tests whose **full name** matches |
| `-u` | `--updateSnapshot` | rewrite failing/obsolete snapshots |
| `-w` | `--maxWorkers <num\|%>` | number of workers |

## 13.3 Selecting tests

| Flag | Selects |
| --- | --- |
| `<regex>` (positional) | test files by path |
| `--testPathPatterns <regex...>` | 📌 Jest 30 name (was `--testPathPattern` in Jest ≤29); accepts several |
| `--testPathIgnorePatterns <regex...>` | exclude paths |
| `--testMatch <glob...>` | override `testMatch` |
| `-t, --testNamePattern <regex>` | by test name (`describe` + `test` names joined with spaces) |
| `-o, --onlyChanged` | related to uncommitted changes (git/hg) |
| `--changedSince <branch>` | related to changes since a branch, e.g. `--changedSince=origin/main` |
| `--lastCommit` | related to files changed in the last commit |
| `--changedFilesWithAncestor` | changes + last commit |
| `--findRelatedTests <files...>` | tests that import (directly/indirectly) these source files — great for `lint-staged` pre-commit hooks |
| `-f, --onlyFailures` | failed last time |
| `--runTestsByPath` | treat positional args as exact paths, not regexes (faster, precise) |
| `--selectProjects <names...>` / `--ignoreProjects <names...>` | multi-project configs |
| `--shard <i>/<n>` | run shard i of n (CI parallelism across machines) |
| `--passWithNoTests` | exit 0 when no tests found (useful with `--findRelatedTests` / `-o`) |
| `--listTests` | print the test files that would run, then exit |
| `--collectTests` | 📌 30.4+: print the tree of suites/test names without running them |

Pre-commit example (`lint-staged`):

```json
{
  "lint-staged": {
    "*.{js,ts,tsx}": ["eslint --fix", "jest --bail --findRelatedTests --passWithNoTests"]
  }
}
```

## 13.4 Running behaviour

| Flag | Effect |
| --- | --- |
| `--watch` | watch mode, re-runs tests related to changed files (needs git/hg) |
| `--watchAll` | watch mode, re-runs all tests |
| `-i, --runInBand` | serial in one process — for debugging, small suites, or memory-constrained CI |
| `-w, --maxWorkers=50%` | limit workers |
| `--ci` | CI mode: no new snapshots written; auto-detected from the `CI` env var |
| `--bail` | stop early |
| `--testTimeout=<ms>` | default timeout |
| `--randomize`, `--seed=<n>`, `--showSeed` | shuffle order inside files reproducibly |
| `--detectOpenHandles` | track what keeps Node alive after tests (slow; implies `--runInBand` behaviour) |
| `--forceExit` | kill the process after tests even if handles are open (⚠️ hides leaks) |
| `--logHeapUsage` | print heap usage after each file (find memory leaks) |
| `--clearMocks`, `--resetMocks`, `--restoreMocks` | same as config options |
| `--env=<environment>` | e.g. `--env=jsdom` |
| `--injectGlobals=false` | don't inject globals |
| `--workerThreads` | use threads instead of processes |
| `--no-cache` / `--cache=false` | ignore the transform cache for this run |
| `--clearCache` | delete the cache directory and exit |
| `--waitForUnhandledRejections` | Chapter 5 |

📌 Jest 30 validates flags that need a value: `--maxWorkers` without a value now errors.

## 13.5 Output

| Flag | Effect |
| --- | --- |
| `--verbose` | list every test |
| `--silent` | hide `console.*` output from tests |
| `-e, --expand` | full diffs |
| `--noStackTrace` | hide stack traces |
| `--colors` / `--no-colors` | force colors on/off |
| `--json` | machine-readable results to stdout |
| `--outputFile=<file>` | write the JSON results to a file (with `--json`) |
| `--testLocationInResults` | include test line/column in JSON |
| `--useStderr` | print to stderr |
| `--reporters <name...>` | e.g. `--reporters=default --reporters=jest-junit` |
| `--coverage` | collect coverage (+ `--coverageProvider=v8`, `--collectCoverageFrom=<glob>`, `--coverageDirectory`) |
| `--showConfig` | print resolved config and exit |
| `--debug` | print debugging info about your config |
| `--version` | Jest version |
| `--notify` | desktop notification |

## 13.6 Running a single test quickly — cheat recipes

```bash
npx jest src/cart/cart.test.ts -t "applies coupon"     # one file, one test name
npx jest -t "^ShoppingCart when empty has total 0$"      # exact full name
npx jest --runTestsByPath src/a.test.ts src/b.test.ts    # exact paths
npx jest -o                                              # what I changed
npx jest --changedSince=origin/main                      # what this branch changed
npx jest -f                                              # what failed last time
```

## 13.7 Debugging from the CLI

```bash
node --inspect-brk node_modules/.bin/jest --runInBand path/to/test
# Windows: node --inspect-brk ./node_modules/jest/bin/jest.js --runInBand
```

Then open `chrome://inspect` in Chrome → "Open dedicated DevTools for Node", or attach VS Code.
`--runInBand` is important: with workers, your breakpoints are in another process. Add a
`debugger;` statement in the test.

VS Code `launch.json`:

```json
{
  "type": "node",
  "request": "launch",
  "name": "Jest current file",
  "program": "${workspaceFolder}/node_modules/.bin/jest",
  "args": ["${relativeFile}", "--runInBand", "--no-coverage"],
  "console": "integratedTerminal",
  "internalConsoleOptions": "neverOpen"
}
```

## 13.8 Exit codes

| Code | Meaning |
| --- | --- |
| `0` | success |
| `1` | test failures, obsolete snapshots, coverage threshold not met, no tests found (without `--passWithNoTests`), or config errors |
| custom | `testFailureExitCode` config |

CI uses the exit code to mark the build red/green.

## 13.9 Programmatic API (advanced)

```js
const { runCLI } = require('jest');

const { results } = await runCLI(
  { _: [], $0: 'jest', ci: true, silent: true, testPathPatterns: ['src/'] },
  [process.cwd()],
);
console.log(results.numFailedTests, results.success);
```

The `jest` package also exports `run`, `createTestScheduler`, `SearchSource`, `getVersion`,
`buildArgv`, `defineConfig`, `mergeConfig` (verified export list, Jest 30.5).

## 13.10 Summary

- Positional args = path regexes; `-t` = name regex.
- `-o`, `--changedSince`, `--findRelatedTests` run only relevant tests.
- `-i` for debugging, `-w` for tuning, `--shard` for splitting CI.
- `--ci`, `--json`, `--coverage`, `--reporters` for pipelines.
- `--detectOpenHandles`, `--logHeapUsage`, `--showConfig`, `--clearCache` for troubleshooting.

**Next:** [Chapter 14 — Code coverage](14-code-coverage.md)
