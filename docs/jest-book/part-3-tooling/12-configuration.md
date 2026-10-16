# Chapter 12 — Configuration: Every Important Option

> 🧸 **Explain it like I'm 5**
>
> The config file is the **instruction card** you give the robot before it starts checking:
> "Look for checks in these rooms, ignore that room, pretend to be a web browser, clean the toys
> after every game, and tell me how much of the house you checked."

---

## 12.1 Where config comes from (and precedence)

1. `--config <path>` on the CLI, else
2. `jest.config.{js,ts,mjs,cjs,mts,cts,json}` in the root, else
3. the `"jest"` key in `package.json`.

(Having **both** a config file and a `"jest"` key makes Jest error out with "Multiple configurations
found" — pick one.)

**CLI flags override config values** (e.g. `--coverage`, `--maxWorkers`, `--testTimeout`).

Config can be an object, or a (async) function returning an object:

```js
// jest.config.js
module.exports = async () => {
  return {
    verbose: true,
  };
};
```

The final config must be **JSON-serializable** (it is sent to worker processes). That's why options
reference **module paths** (strings) rather than functions.

### Special tokens

- `<rootDir>` — replaced with the root directory (folder of the config file / package.json, or
  `rootDir` if set). Use it in paths: `'<rootDir>/test/setup.js'`.
- `"//"` key — allowed for comments in JSON configs.

### Inspect the final config

```bash
npx jest --showConfig
```

Prints the fully resolved config (with defaults). The first thing to run when "my config isn't
applied".

### Typed config

```ts
import type { Config } from 'jest';
const config: Config = { /* autocompletion here */ };
export default config;
```

Or `const { defineConfig } = require('jest')` (Jest 30.3+), plus `mergeConfig(base, override)` to
extend a shared base config.

## 12.2 Options by category (with defaults)

### A. Finding tests

| Option | Default | Notes |
| --- | --- | --- |
| `rootDir` | dir of config/package.json | base for `<rootDir>` |
| `roots` | `["<rootDir>"]` | dirs Jest scans for tests **and** `__mocks__`. Narrowing to `["<rootDir>/src"]` speeds crawling |
| `testMatch` | `["**/__tests__/**/*.?([mc])[jt]s?(x)", "**/?(*.)+(spec|test).?([mc])[jt]s?(x)"]` | globs (micromatch); can't combine with `testRegex` |
| `testRegex` | `(/__tests__/.*\|(\\.\|/)(test\|spec))\\.[mc]?[jt]sx?$` (used only if set) | regex alternative |
| `testPathIgnorePatterns` | `["/node_modules/"]` | regexes against full path |
| `modulePathIgnorePatterns` | `[]` | hide paths from the module loader (e.g. `<rootDir>/dist/` to stop "duplicate manual mock" / haste collisions with build output) |
| `watchPathIgnorePatterns` | `[]` | don't re-run when these change |
| `moduleFileExtensions` | `["js","mjs","cjs","jsx","ts","mts","cts","tsx","json","node"]` | order = resolution priority for extensionless imports; put most used first |

⚠️ Negation order in `testMatch`: `["!**/__fixtures__/**", "**/__tests__/**/*.js"]` does **not**
exclude fixtures because the later pattern overrides. Put negations **after**.

### B. Environment

| Option | Default | Notes |
| --- | --- | --- |
| `testEnvironment` | `"node"` | `"jsdom"` needs `jest-environment-jsdom` installed separately (since Jest 28) |
| `testEnvironmentOptions` | `{}` | jsdom: `url` (default `http://localhost`), `userAgent`, `html`, any jsdom option; node: `globalsCleanup` (`'soft'` default, `'on'`, `'off'`), vm options; both: `customExportConditions` (jsdom default `['browser']`, node default `['node','node-addons']`) |
| `injectGlobals` | `true` | `false` → import `describe/test/expect/jest` from `@jest/globals` |
| `globals` | `{}` | JSON-serializable globals (e.g. `__DEV__`) |
| `sandboxInjectedGlobals` | — | expose host globals like `Math` directly in the vm for speed |
| `fakeTimers` | `{}` | `{ enableGlobally: true, doNotFake: [...], timerLimit, now, advanceTimers, legacyFakeTimers }` |

📌 `customExportConditions` matters for packages with `"exports"` maps: in jsdom, Jest picks the
`"browser"` build. Some packages' browser build is ESM → `SyntaxError: Unexpected token 'export'`.
Fix: `customExportConditions: ['node', 'node-addons']` (or `['']`) for jsdom, or transform the package.

### C. Setup & teardown

| Option | Runs |
| --- | --- |
| `globalSetup` | once before all tests, main process, no test framework |
| `globalTeardown` | once after all tests |
| `setupFiles` | per test file, before the framework (polyfills, env) |
| `setupFilesAfterEnv` | per test file, after the framework (matchers, global hooks) |

(Full explanation: Chapter 6 §6.7.)

### D. Transforming code

| Option | Default | Notes |
| --- | --- | --- |
| `transform` | `{"\\.[jt]sx?$": "babel-jest"}` | regex → transformer path, or `[path, options]` |
| `transformIgnorePatterns` | `["/node_modules/", "\\.pnp\\.[^\\/]+$"]` | files NOT transformed. ⚠️ ESM-only packages in node_modules must be allowed through (Chapter 15) |
| `extensionsToTreatAsEsm` | `[]` | e.g. `['.ts', '.tsx']` for native ESM TS (`.mjs` is always ESM; don't list `.js`/`.mjs`) |
| `preset` | — | base config package (`ts-jest`, `react-native`, `jest-expo`, `@shelf/jest-mongodb`, `jest-puppeteer`) |
| `prettierPath` | `'prettier'` | used for inline snapshots |

⚠️ When you set `transform` yourself, the default `babel-jest` entry is **replaced**. If you still
want Babel for JS, include it: `'\\.[jt]sx?$': 'babel-jest'`.

Example — TS with SWC and JS with Babel:

```js
transform: {
  '^.+\\.(t|j)sx?$': ['@swc/jest'],
},
```

### E. Module resolution

| Option | Default | Notes |
| --- | --- | --- |
| `moduleNameMapper` | `null` | regex → path(s): aliases, CSS/images stubs (Chapter 8 §8.8) |
| `moduleDirectories` | `["node_modules"]` | add `"src"` to allow `import 'utils/x'` style absolute imports |
| `modulePaths` | `[]` | extra absolute locations (like `NODE_PATH`) e.g. `["<rootDir>/src"]` |
| `resolver` | — | custom resolver module (`(path, options) => resolvedPath`), e.g. to honor odd `exports` |
| `haste` | — | haste map options (`enableSymlinks`, `forceNodeFilesystemAPI`, `throwOnModuleCollision`, `defaultPlatform`, `platforms` — used by React Native for `.ios.js`/`.android.js`) |
| `dependencyExtractor` | — | custom dependency detection (for `--findRelatedTests`, `-o`) |

### F. Mocks

| Option | Default | Effect |
| --- | --- | --- |
| `clearMocks` | `false` | `jest.clearAllMocks()` before each test |
| `resetMocks` | `false` | `jest.resetAllMocks()` before each test |
| `restoreMocks` | `false` | `jest.restoreAllMocks()` before each test |
| `resetModules` | `false` | fresh module registry before each test |
| `automock` | `false` | automock every import |
| `unmockedModulePathPatterns` | `[]` | with automock: never mock these |

### G. Running

| Option | Default | Notes |
| --- | --- | --- |
| `testTimeout` | `5000` | ms per test/hook |
| `bail` | `0` | stop after `n` failing **test suites** (`true` = 1) |
| `maxWorkers` | cores − 1 (single run), half the cores (watch) | number or `'50%'` |
| `maxConcurrency` | `5` | for `test.concurrent` |
| `workerIdleMemoryLimit` | — | recycle a worker after a test file if its memory exceeds e.g. `'512MB'` or `0.2` (20% of RAM) — the standard fix for memory leaks / OOM in big suites |
| `workerThreads` | `false` | use worker threads instead of child processes (experimental) |
| `workerGracefulExitTimeout` | `500` | ms before force-killing a worker at shutdown (30.4+) |
| `randomize` | `false` | shuffle test order within files (`--seed`, `showSeed`) |
| `showSeed` | `false` | print the seed |
| `slowTestThreshold` | `5` | seconds after which a test file is reported as slow |
| `openHandlesTimeout` | `1000` | warn about probable open handles if Jest can't exit after this many ms; `0` disables |
| `waitForUnhandledRejections` | `false` | Chapter 5 §5.12 |
| `errorOnDeprecated` | `false` | throw on deprecated APIs — useful before upgrades |
| `testFailureExitCode` | `1` | exit code on failure |
| `testRunner` | `jest-circus/runner` | (jasmine2 was removed as default in 27; available as `jest-jasmine2` package) |
| `testSequencer` | `@jest/test-sequencer` | custom ordering / sharding (Chapter 20) |
| `runner` | `jest-runner` | e.g. `jest-runner-eslint`, `jest-runner-tsc`, or tuple `[path, options]` |
| `runtime` | `jest-runtime` | advanced |
| `watchman` | `true` | use Watchman for crawling if installed |
| `watchPlugins` | `[]` | e.g. `jest-watch-typeahead/filename` |
| `notify`, `notifyMode` | `false`, `failure-change` | desktop notifications (needs `node-notifier`) |
| `verbose` | `false` (`true` when one file) | print every test name |

### H. Output & reporting

| Option | Notes |
| --- | --- |
| `reporters` | e.g. `['default', ['jest-junit', { outputDirectory: 'reports' }]]`; built-ins: `default`, `summary`, `github-actions` |
| `testResultsProcessor` | module that receives the full results object |
| `displayName` | label tests in multi-project runs: `'api'` or `{ name: 'api', color: 'blue' }` |
| `snapshotFormat` | default `{escapeString: false, printBasicPrototype: false}` |
| `snapshotSerializers` | module paths |
| `snapshotResolver` | custom snapshot location |

⚠️ Setting `reporters` **replaces** the default reporter — include `'default'` to keep normal output.

GitHub Actions annotations:

```js
reporters: [['github-actions', { silent: false }], 'summary'],
```

### I. Coverage (details: Chapter 14)

`collectCoverage`, `collectCoverageFrom`, `coverageDirectory`, `coveragePathIgnorePatterns`
(default `["/node_modules/"]`), `coverageProvider` (`"babel"` default | `"v8"`),
`coverageReporters` (default `["clover","json","lcov","text"]`), `coverageThreshold`,
`forceCoverageMatch`.

### J. Projects (monorepos — Chapter 22)

```js
module.exports = {
  projects: [
    '<rootDir>/packages/*',          // each package with its own jest.config.js
    {
      displayName: 'web',
      testEnvironment: 'jsdom',
      testMatch: ['<rootDir>/apps/web/**/*.test.tsx'],
    },
    {
      displayName: 'api',
      testEnvironment: 'node',
      testMatch: ['<rootDir>/apps/api/**/*.test.ts'],
    },
  ],
};
```

- Some options are **global-only** (`reporters`, `coverageReporters`, `coverageThreshold`,
  `maxWorkers`, `bail`, `watchPlugins` …) and must be in the root config, not inside a project.
  📌 Jest 30.5.1 started **warning** about global-only options placed in project configs (they used
  to be silently ignored).
- `--selectProjects web api` / `--ignoreProjects api` choose projects by `displayName`.

## 12.3 Realistic configs

### Node / TypeScript service (ts-jest)

```js
// jest.config.js
/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  setupFilesAfterEnv: ['<rootDir>/test/setup.ts'],
  moduleNameMapper: { '^@/(.*)$': '<rootDir>/src/$1' },
  clearMocks: true,
  restoreMocks: true,
  collectCoverageFrom: ['src/**/*.ts', '!src/**/*.d.ts', '!src/**/index.ts'],
  coverageThreshold: { global: { branches: 80, functions: 80, lines: 85, statements: 85 } },
  testTimeout: 10_000,
};
```

### React web app (Babel + jsdom)

```js
module.exports = {
  testEnvironment: 'jsdom',
  setupFiles: ['<rootDir>/test/polyfills.js'],
  setupFilesAfterEnv: ['<rootDir>/test/setupTests.js'],     // jest-dom, MSW
  moduleNameMapper: {
    '\\.(css|less|scss)$': 'identity-obj-proxy',
    '\\.(png|jpe?g|gif|svg|webp)$': '<rootDir>/test/fileMock.js',
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  transformIgnorePatterns: ['/node_modules/(?!(some-esm-lib|another-esm-lib)/)'],
  clearMocks: true,
  restoreMocks: true,
};
```

### React Native (this repository)

```js
module.exports = {
  preset: 'react-native',
  // typical additions:
  // setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  // transformIgnorePatterns: [
  //   'node_modules/(?!((jest-)?react-native|@react-native(-community)?|@react-navigation)/)',
  // ],
};
```

(Chapter 17 explains the preset in detail.)

### Next.js

Next.js provides `next/jest`, which builds a config with SWC transforms, CSS/image mocks and env
loading:

```js
// jest.config.js
const nextJest = require('next/jest');
const createJestConfig = nextJest({ dir: './' });

module.exports = createJestConfig({
  testEnvironment: 'jsdom',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
});
```

### Angular

Commonly `jest-preset-angular` (preset + setup file) replaces Karma/Jasmine. Angular CLI also has
experimental Jest support.

## 12.4 Docblock overrides per file

```js
/**
 * @jest-environment jsdom
 * @jest-environment-options {"url": "https://shop.example.com/"}
 */
```

## 12.5 Config troubleshooting checklist

1. `npx jest --showConfig` → is the option there with the value you expect?
2. Multiple configs? (`Multiple configurations found` error, or a nested `package.json` with a
   `jest` key picked as root when running from a subfolder).
3. Paths: use `<rootDir>`; remember `roots` limits where `__mocks__` are found.
4. Regex escaping: in JS strings, `\\.` means a literal dot.
5. Did setting `transform` remove `babel-jest` for JS files?
6. Did setting `reporters` remove the default output?
7. Global-only option inside a `projects` entry?
8. Clear the cache after changing Babel/TS config if output looks stale: `npx jest --clearCache`.

## 12.6 Summary

- Config lives in `jest.config.*` or `package.json#jest`; CLI flags override; `--showConfig` reveals
  the final result.
- Know the defaults: `testEnvironment: node`, `testTimeout: 5000`, `babel-jest` transform,
  `node_modules` not transformed, coverage provider `babel`.
- `clearMocks` + `restoreMocks` are sensible org defaults; `workerIdleMemoryLimit` fixes memory
  creep; `projects` handles monorepos.

**Next:** [Chapter 13 — The Jest CLI](13-cli.md)
