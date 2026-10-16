# Chapter 20 — Extending Jest: Matchers, Environments, Reporters, Transformers, Runners

> 🧸 **Explain it like I'm 5**
>
> Jest is like a LEGO set. Out of the box you get the standard pieces. But almost every part can be
> swapped or added: **new checking words** (matchers), **new worlds** for tests to live in
> (environments), **new ways to announce results** (reporters), **new translators** (transformers),
> **new orders** to run tests in (sequencers), and even **completely different robots**
> (runners).

Everything in this chapter was run on Jest 30.5.2 (custom environment + matchers + equality
tester + reporter + sequencer in one project: `Tests: 7 passed`).

---

## 20.1 Custom matchers — `expect.extend`

```js
// test/matchers.js  (listed in setupFilesAfterEnv)
expect.extend({
  toBeWithinRange(received, floor, ceiling) {
    if (typeof received !== 'number') {
      throw new TypeError('received must be a number');
    }
    const pass = received >= floor && received <= ceiling;
    return {
      pass,
      message: () =>
        `${this.utils.matcherHint('toBeWithinRange', undefined, undefined, { isNot: this.isNot })}\n\n` +
        `Expected: ${this.isNot ? 'not ' : ''}a number between ${this.utils.printExpected(floor)} and ${this.utils.printExpected(ceiling)}\n` +
        `Received: ${this.utils.printReceived(received)}`,
    };
  },
});
```

Usage — as a matcher, negated, and as an **asymmetric matcher** (automatically available):

```js
expect(5).toBeWithinRange(1, 10);
expect(50).not.toBeWithinRange(1, 10);
expect({ n: 5 }).toEqual({ n: expect.toBeWithinRange(1, 10) });
```

Failure output (verified):

```
expect(received).toBeWithinRange(expected)

Expected: a number between 1 and 10
Received: 50
```

### The matcher contract

- Receives `(received, ...expectedArgs)`.
- Returns `{ pass: boolean, message: () => string }`. The `message` must describe the failure **for
  both** the normal and the `.not` case (Jest calls it when the final result is a failure).
- Jest handles `.not` by inverting `pass`; you don't do it yourself.
- Can be `async` (return a promise) — then users must `await expect(...).toMyMatcher()`.

`this` context gives you:

| Member | Use |
| --- | --- |
| `this.isNot` | whether `.not` was used (for wording) |
| `this.promise` | `'resolves'`, `'rejects'` or `''` |
| `this.equals(a, b, customTesters?)` | Jest's deep equality (supports asymmetric matchers) |
| `this.utils` | `matcherHint`, `printExpected`, `printReceived`, `printDiffOrStringify`, `diff`, `stringify`, `RECEIVED_COLOR`, `EXPECTED_COLOR` |
| `this.expand` | `--expand` flag |
| `this.currentTestName`, `this.testPath` | context |
| `this.customTesters` | testers registered with `addEqualityTesters` |

Async example (verified):

```js
expect.extend({
  async toResolveWithin(promise, ms) {
    let timer;
    const timeout = new Promise((_, rej) => { timer = setTimeout(() => rej(new Error('timeout')), ms); });
    try {
      await Promise.race([promise, timeout]);
      return { pass: true, message: () => `expected promise not to resolve within ${ms}ms` };
    } catch {
      return { pass: false, message: () => `expected promise to resolve within ${ms}ms` };
    } finally {
      clearTimeout(timer);
    }
  },
});

await expect(fetchFast()).toResolveWithin(50);
```

### TypeScript declarations for custom matchers

With `@jest/globals` / the `expect` package:

```ts
// test/matchers.d.ts
import 'expect';

declare module 'expect' {
  interface AsymmetricMatchers {
    toBeWithinRange(floor: number, ceiling: number): void;
  }
  interface Matchers<R> {
    toBeWithinRange(floor: number, ceiling: number): R;
  }
}
```

With global `@types/jest`:

```ts
declare global {
  namespace jest {
    interface Matchers<R> {
      toBeWithinRange(floor: number, ceiling: number): R;
    }
    interface Expect {
      toBeWithinRange(floor: number, ceiling: number): any;
    }
  }
}
export {};
```

💼 Good domain matchers make tests read like specs: `expect(invoice).toBeOverdue()`,
`expect(response).toHaveStatus(404)`, `expect(event).toBeValidCloudEvent()`.

## 20.2 Custom equality — `expect.addEqualityTesters`

Teach `toEqual` (and `toHaveBeenCalledWith`, etc.) how to compare your types:

```js
class Money {
  constructor(amount, currency) {
    this.amount = amount;
    this.currency = currency;
    this.cache = Math.random();      // irrelevant internal field
  }
}

function moneyEquals(a, b) {
  const isA = a instanceof Money;
  const isB = b instanceof Money;
  if (isA && isB) return a.amount === b.amount && a.currency === b.currency;
  if (isA === isB) return undefined;   // neither is Money → "I don't know", let Jest decide
  return false;
}

expect.addEqualityTesters([moneyEquals]);

expect(new Money(5, 'EUR')).toEqual(new Money(5, 'EUR'));   // ✅ despite different cache
```

Return `true`/`false` when you know, `undefined` to defer. A tester receives
`(a, b, customTesters)` and can call `this.equals(x, y, customTesters)` for nested values.

## 20.3 Custom snapshot serializers

See Chapter 11 §11.8 (`test` + `serialize`, or the older `print`).

## 20.4 Custom test environments

An environment creates the global object tests run in. Built-ins: `jest-environment-node`,
`jest-environment-jsdom`. 📌 Jest 30 also ships `@jest/environment-jsdom-abstract` for building a
jsdom-based environment with your own jsdom version/patches.

```js
// test/env/timed-environment.js
const { TestEnvironment } = require('jest-environment-node');

class TimedEnvironment extends TestEnvironment {
  constructor(config, context) {
    super(config, context);
    this.testPath = context.testPath;
    this.docblockPragmas = context.docblockPragmas;   // e.g. custom @my-pragma values
  }

  async setup() {
    await super.setup();
    this.global.__ENV_NAME__ = 'timed';               // visible to tests as a global
  }

  async teardown() {
    await super.teardown();
  }

  getVmContext() {
    return super.getVmContext();
  }

  // Optional: listen to jest-circus events (test_start, test_done, run_describe_start, ...)
  async handleTestEvent(event, state) {
    if (event.name === 'test_done' && event.test.duration > 50) {
      this.global.__SLOW__ = (this.global.__SLOW__ || 0) + 1;
    }
  }
}

module.exports = TimedEnvironment;
```

Use: `testEnvironment: '<rootDir>/test/env/timed-environment.js'` or a docblock
`@jest-environment ./test/env/timed-environment.js`.

Real uses:
- spin up a per-file database schema and expose a client as a global,
- Puppeteer/Playwright browser per file (`jest-environment-puppeteer`),
- a jsdom env with fetch/TextEncoder polyfills (e.g. `jest-fixed-jsdom` for MSW),
- capture screenshots or logs on `test_done` with errors.

⚠️ `handleTestEvent` handlers that are `async` delay the test run; keep them fast.

## 20.5 Custom reporters

```js
// test/reporters/slow-test-reporter.js
class SlowTestReporter {
  constructor(globalConfig, reporterOptions, reporterContext) {
    this.threshold = reporterOptions.thresholdMs ?? 100;
    this.slow = [];
  }

  onTestResult(test, testResult) {
    for (const r of testResult.testResults) {
      if ((r.duration ?? 0) > this.threshold) this.slow.push(`${r.fullName} (${r.duration}ms)`);
    }
  }

  onRunComplete(testContexts, aggregatedResults) {
    console.log(`\nSlow tests (> ${this.threshold}ms):\n` + (this.slow.join('\n') || '  none'));
  }
}

module.exports = SlowTestReporter;
```

```js
reporters: ['default', ['<rootDir>/test/reporters/slow-test-reporter.js', { thresholdMs: 100 }]],
```

Verified output:

```
Slow tests (> 100ms):
slow (121ms)
```

Hooks available: `onRunStart(results, options)`, `onTestFileStart(test)`, `onTestCaseStart(test, testCaseStartInfo)`,
`onTestCaseResult(test, testCaseResult)`, `onTestFileResult(test, testResult, results)` /
`onTestResult(...)`, `onRunComplete(testContexts, results)`, `getLastError()` (return an `Error` to
make Jest exit non-zero).

Popular reporters: `jest-junit` (JUnit XML for CI), `jest-html-reporters`, `jest-stare`,
`jest-sonar-reporter`, the built-in `github-actions` and `summary`.

## 20.6 Custom transformers

```js
// test/transforms/graphql.js — import .graphql files as strings
const crypto = require('node:crypto');

module.exports = {
  process(sourceText, sourcePath, options) {
    return { code: `module.exports = ${JSON.stringify(sourceText)};` };
  },
  getCacheKey(sourceText, sourcePath, options) {
    return crypto.createHash('md5').update(sourceText).update(options.configString).digest('hex');
  },
};
```

- `process` (sync) and/or `processAsync` (used for native ESM).
- Must return `{ code, map? }`.
- `getCacheKey` should include everything that affects output (source, config, transformer version),
  or results get stale.
- `createTransformer(options)` factory form lets users pass options via `[path, options]`.
- `canInstrument: true` if your transformer adds coverage instrumentation itself.
- Helper: `@jest/create-cache-key-function`.

## 20.7 Custom resolvers

```js
// test/resolver.js — e.g. force "browser" builds off for a specific package
module.exports = (path, options) => {
  return options.defaultResolver(path, {
    ...options,
    conditions: path === 'some-pkg' ? ['require', 'node', 'default'] : options.conditions,
  });
};
```

`resolver: '<rootDir>/test/resolver.js'`. 📌 Jest 30.5 also accepts resolvers written as ES modules.

## 20.8 Custom test sequencers (order & sharding)

```js
// test/sequencer.js
const Sequencer = require('@jest/test-sequencer').default;

class AlphabeticalSequencer extends Sequencer {
  shard(tests, { shardIndex, shardCount }) {
    const shardSize = Math.ceil(tests.length / shardCount);
    const shardStart = shardSize * (shardIndex - 1);
    return [...tests].sort((a, b) => (a.path > b.path ? 1 : -1)).slice(shardStart, shardStart + shardSize);
  }

  sort(tests) {
    return [...tests].sort((a, b) => (a.path > b.path ? 1 : -1));
  }
}

module.exports = AlphabeticalSequencer;
```

`testSequencer: '<rootDir>/test/sequencer.js'`. Verified: with two files `a.test.js` and
`b.test.js`, `--shard=2/2 --listTests` lists only `b.test.js`.

Default sequencer behaviour: failed-last-time first, then slowest files first (using cached timings),
then by file size — to minimise total wall-clock time. 📌 Jest 30 passes `globalConfig` and
`contexts` to custom sequencers.

## 20.9 Custom runners

A runner decides **what "running a test file" means**. Examples:

- `jest-runner-eslint` — every file is "a test"; lint errors are failures. Lint and tests in one
  watch mode.
- `jest-runner-tsc` / `jest-runner-prettier` / `jest-runner-stylelint`.
- `create-jest-runner` helps build your own.

```js
// jest.config.js — run ESLint as a separate project
module.exports = {
  projects: [
    { displayName: 'test' },
    { displayName: 'lint', runner: 'jest-runner-eslint', testMatch: ['<rootDir>/src/**/*.{js,ts,tsx}'] },
  ],
};
```

## 20.10 Watch plugins

```js
// jest.config.js
watchPlugins: [
  'jest-watch-typeahead/filename',   // fuzzy filename filter with autocompletion
  'jest-watch-typeahead/testname',
  'jest-watch-select-projects',
],
```

Writing one: a class with `apply(jestHooks)` (`onFileChange`, `onTestRunComplete`,
`shouldRunTestSuite`), `getUsageInfo()` (key + prompt), and `run(globalConfig, updateConfigAndRun)`.

## 20.11 Global setup per project, `testResultsProcessor`, `dependencyExtractor`

- In a `projects` config, each project can have its own `globalSetup`/`globalTeardown`.
- `testResultsProcessor` receives the aggregated results object (older alternative to reporters).
- `dependencyExtractor` customises how Jest finds a file's dependencies (affects `-o`,
  `--findRelatedTests`, watch mode) — e.g. for a custom import syntax.

## 20.12 Summary

| Need | Extension point |
| --- | --- |
| domain-specific assertions | `expect.extend` (+ TS declarations) |
| custom equality for types | `expect.addEqualityTesters` |
| custom printing | snapshot serializers, `SERIALIZABLE_PROPERTIES` |
| different global world | `testEnvironment` (extend Node/jsdom env) |
| results to CI/dashboards | `reporters` |
| non-JS imports, other compilers | `transform` |
| odd module resolution | `resolver` |
| ordering/sharding | `testSequencer` |
| run non-test tools in Jest | `runner` |
| better watch mode | `watchPlugins` |

**Next:** [Chapter 21 — How Jest works inside](21-jest-internals.md)
