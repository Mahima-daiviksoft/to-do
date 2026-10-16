# Chapter 14 — Code Coverage

> 🧸 **Explain it like I'm 5**
>
> Imagine your code is a big house and your tests are a kid with **muddy shoes** walking through it.
> Afterwards you look at which rooms have mud prints. Rooms with no mud = **nobody tested them**.
> Coverage is that mud map. But careful: the kid walking through a room doesn't mean the kid
> **checked** anything in it! Mud shows where tests *went*, not whether they *looked properly*.

---

## 14.1 Turning it on

```bash
npx jest --coverage
```

or in config `collectCoverage: true` (usually only in CI scripts, because instrumentation slows
tests down).

Output (real run of the example below):

```
----------|---------|----------|---------|---------|-------------------
File      | % Stmts | % Branch | % Funcs | % Lines | Uncovered Line #s
----------|---------|----------|---------|---------|-------------------
All files |   71.42 |       75 |      50 |      80 |
 grade.js |   71.42 |       75 |      50 |      80 | 6
----------|---------|----------|---------|---------|-------------------
```

Reports are also written to `coverage/` (`lcov-report/index.html` is a clickable HTML report —
red = not executed, yellow = branch not taken; `E`/`I` markers = else/if path not taken).

## 14.2 The four metrics (🎯 must know)

Code:

```js
function grade(score) {            // line 1
  if (score >= 90) return 'A';     // line 2
  if (score >= 75) return 'B';     // line 3
  return 'C';                      // line 4
}                                  // line 5
function unused() { return 1; }    // line 6
module.exports = { grade, unused };// line 7
```

Tests: `grade(95)` and `grade(10)`.

| Metric | Question | Here (babel provider) |
| --- | --- | --- |
| **Statements** | How many statements ran? | 5 of 7 = **71.42%** (`return 'B'` and `return 1` never ran) |
| **Branches** | How many paths of each `if`/`?:`/`&&`/`||`/`??`/default param/`switch` case ran? | 3 of 4 = **75%** (line 3's "true" path never taken) |
| **Functions** | How many functions were called? | 1 of 2 = **50%** (`unused`) |
| **Lines** | How many lines had at least one statement run? | 4 of 5 = **80%** (line 3 counts as covered because its `if` ran!) |

This example shows why **branch coverage is the most informative** metric: line coverage said line 3
was fine even though the `'B'` result was never tested.

## 14.3 Covering files that no test imports: `collectCoverageFrom`

By default coverage only includes files **loaded by tests**. A file nobody imports is invisible,
and your percentage looks better than reality. Fix:

```js
// jest.config.js
module.exports = {
  collectCoverageFrom: [
    'src/**/*.{js,jsx,ts,tsx}',
    '!src/**/*.d.ts',
    '!src/**/*.stories.{js,tsx}',
    '!src/**/index.{js,ts}',      // barrels
    '!src/**/__generated__/**',
    '!**/node_modules/**',
  ],
};
```

Other options:

| Option | Default | Purpose |
| --- | --- | --- |
| `coverageDirectory` | `coverage` (when undefined) | output folder |
| `coveragePathIgnorePatterns` | `["/node_modules/"]` | regexes to exclude |
| `coverageReporters` | `["clover", "json", "lcov", "text"]` | formats |
| `coverageProvider` | `"babel"` | or `"v8"` |
| `forceCoverageMatch` | `['']` | include test-like files (e.g. `**/*.t.js`) in coverage |

Reporters you'll use: `text` (table), `text-summary` (4 lines), `html`, `lcov` (HTML + `lcov.info`
for SonarQube/Codecov/Coveralls), `json`, `json-summary` (for badges/PR comments), `cobertura`
(Azure DevOps/Jenkins/GitLab), `clover`. Options via tuples: `['text', { skipFull: true }]`.

## 14.4 Thresholds — failing the build on low coverage

```js
module.exports = {
  coverageThreshold: {
    global: { branches: 80, functions: 80, lines: 85, statements: 85 },
    './src/payments/': { branches: 95, statements: 95 },   // stricter for critical code
    './src/legacy/**/*.js': { statements: -50 },           // negative = max 50 UNCOVERED statements
  },
};
```

Verified failure output:

```
Jest: Coverage for branches (75%) does not meet "global" threshold (90%)
```

…and Jest exits with code 1 even though all tests passed.

Rules:
- Positive numbers = minimum %; negative = maximum number of uncovered items.
- Path/glob keys are checked **separately**, and files matched by them are **removed from the
  `global` calculation**.
- If a path key matches no files, Jest errors (`Coverage data for ./src/x/ was not found.`).

💼 **Org advice on thresholds**
- Set thresholds slightly **below** the current level to prevent regressions ("ratchet"), then raise
  them over time.
- Prefer stricter thresholds on critical modules (payments, auth) over a blanket 100%.
- 100% coverage ≠ bug-free. A test with no assertions gives coverage. Combine with code review and
  occasionally **mutation testing** (Stryker) to measure test *strength*.
- Diff coverage ("new code must be ≥ 80% covered") in SonarQube/Codecov is often more useful than a
  global number on legacy repos.

## 14.5 `babel` vs `v8` provider

| | `babel` (default) | `v8` |
| --- | --- | --- |
| How | `babel-plugin-istanbul` **instruments** code (inserts counters) during transform | uses V8's built-in coverage, converted with `v8-to-istanbul` |
| Speed | slower (extra transform; cache is separate for coverage runs) | usually faster, no instrumentation |
| Accuracy | very precise at statement/branch level, based on the original source via Babel's AST | maps byte ranges via source maps; numbers can differ slightly (e.g. the same example gives 85.71% statements, 85.71% lines with v8) |
| Works with non-Babel transforms (ts-jest, SWC) | yes (ts-jest/SWC have their own istanbul support) | yes |
| Ignore comments | `/* istanbul ignore next */`, `/* istanbul ignore if */`, `/* istanbul ignore else */`, `/* istanbul ignore file */` | `/* c8 ignore next */`, `/* c8 ignore next 3 */`, `/* c8 ignore start */ … /* c8 ignore stop */` (and `v8 ignore` equivalents) |

⚠️ Switching provider changes the numbers — adjust thresholds when you switch.

### Ignoring code from coverage

```js
/* istanbul ignore next */
function debugOnlyHelper() { /* ... */ }

if (process.env.NODE_ENV === 'development') /* istanbul ignore next */ {
  enableDevTools();
}
```

Use sparingly and with a reason (`/* istanbul ignore next -- platform-specific */`). Ignoring code
to reach a number defeats the purpose.

## 14.6 Coverage in CI, shards and monorepos

- With `--shard=i/n`, each machine produces partial coverage. Merge the JSON reports afterwards
  (e.g. `nyc merge` / `istanbul-merge`, then `nyc report`), or let your coverage service merge
  uploads (Codecov does this).
- In a `projects` setup, one root `jest --coverage` produces a combined report; `coverageThreshold`
  and `coverageReporters` must be in the **root** config (global-only options).
- Upload `lcov.info` (or `cobertura-coverage.xml`) to SonarQube/Codecov/Coveralls for PR comments.

```yaml
# GitHub Actions snippet
- run: npx jest --ci --coverage --maxWorkers=50%
- uses: codecov/codecov-action@v4
  with:
    files: ./coverage/lcov.info
```

## 14.7 Common coverage problems

| Problem | Cause / fix |
| --- | --- |
| Coverage shows 0% for a file that is tested | file path excluded by `coveragePathIgnorePatterns`/`collectCoverageFrom`, or the file isn't transformed (in `transformIgnorePatterns`) |
| "Unknown" or wrong line numbers | source maps missing — check the transformer emits them (`ts-jest`: `sourceMap` in tsconfig), clear cache |
| Coverage much lower in CI | `collectCoverageFrom` now includes untested files (good!) |
| Tests much slower with `--coverage` | instrumentation cost — try `coverageProvider: 'v8'`; don't collect coverage in watch mode |
| Coverage includes test utils / mocks | exclude `test/**`, `**/__mocks__/**`, `**/*.stories.*` |
| Coverage of `node_modules` package you own | it's excluded by default; adjust ignore patterns |
| Threshold fails on a path with no files | remove/update the path key |

## 14.8 Summary

- `--coverage` + `collectCoverageFrom` (to include untested files).
- Four metrics; branch coverage tells you most.
- Thresholds enforce minimums; use ratchets and stricter rules for critical code.
- `babel` vs `v8` providers produce different numbers and use different ignore comments.
- Coverage measures execution, not verification.

**Next:** [Chapter 15 — TypeScript, Babel, ESM and transforms](15-typescript-esm-babel.md)
