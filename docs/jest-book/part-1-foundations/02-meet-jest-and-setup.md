# Chapter 2 — Meet Jest: Install, Set Up, Run Your First Test

> 🧸 **Explain it like I'm 5**
>
> Jest is a helper that lives inside your project. You write little "check" files that end in
> `.test.js`. When you type `npm test`, Jest runs around your project like a puppy, finds every
> check file, runs them, and comes back wagging its tail: green ✅ "all good!" or red ❌ "this one
> is broken, here's exactly where".

---

## 2.1 Requirements

| Jest | Node.js supported | TypeScript (for Jest's types) |
| --- | --- | --- |
| **30.x** | 18.x, 20.x, 22.x, 24+ (dropped 14, 16, 19, 21) | ≥ 5.4 |
| 29.x | 14.15+, 16.10+, 18+ | ≥ 4.3 |

📌 **Version note:** If `npm install jest` gives you errors on an old Node, upgrade Node first.

## 2.2 Install

```bash
npm install --save-dev jest
# or
yarn add --dev jest
# or
pnpm add --save-dev jest
```

Jest is a **devDependency** — only developers and CI need it, not production users.

Add a script to `package.json`:

```json
{
  "scripts": {
    "test": "jest"
  }
}
```

Now `npm test` (or `npm t`, `yarn test`, `pnpm test`) runs Jest.

### Generate a config file (optional)

```bash
npm init jest@latest      # runs the "create-jest" package and asks questions
# yarn create jest  /  pnpm create jest
```

📌 **Version note:** In Jest ≤ 29 you could run `jest --init`. In Jest 30 that command is
**removed**; running it prints a deprecation message telling you to use `create-jest`.

## 2.3 Your first test

**`sum.js`**
```js
function sum(a, b) {
  return a + b;
}
module.exports = sum;
```

**`sum.test.js`**
```js
const sum = require('./sum');

test('adds 1 + 2 to equal 3', () => {
  expect(sum(1, 2)).toBe(3);
});
```

Run it:

```bash
npm test
```

Output:

```
 PASS  ./sum.test.js
  ✓ adds 1 + 2 to equal 3 (2 ms)

Test Suites: 1 passed, 1 total
Tests:       1 passed, 1 total
Snapshots:   0 total
Time:        0.4 s
Ran all test suites.
```

What each line means:

- **`PASS ./sum.test.js`** — this test *file* (Jest calls a file a "test suite") passed.
- **`✓ adds 1 + 2 to equal 3`** — one test passed (shown because there is only one file; with many
  files you need `--verbose` to see each test name).
- **Test Suites** — number of files. **Tests** — number of `test()` calls.
- **Snapshots** — snapshot assertions (Chapter 11).

### Make it fail on purpose (always do this once!)

Change `toBe(3)` to `toBe(4)`:

```
 FAIL  ./sum.test.js
  ✕ adds 1 + 2 to equal 3 (3 ms)

  ● adds 1 + 2 to equal 3

    expect(received).toBe(expected) // Object.is equality

    Expected: 4
    Received: 3

      2 |
      3 | test('adds 1 + 2 to equal 3', () => {
    > 4 |   expect(sum(1, 2)).toBe(4);
        |                     ^
      5 | });
```

Jest shows: the matcher used, **Expected** vs **Received**, and a code frame pointing at the exact
line. ✅ **Best practice:** when writing a new test, see it fail at least once. A test you have never
seen fail might not be testing anything (for example, an `async` assertion you forgot to `await`).

## 2.4 How Jest finds test files

By default (Jest 30) the `testMatch` option is:

```js
[
  '**/__tests__/**/*.?([mc])[jt]s?(x)',
  '**/?(*.)+(spec|test).?([mc])[jt]s?(x)',
]
```

In plain words, Jest treats as a test file:

- any `.js .jsx .ts .tsx .mjs .cjs .mts .cts` file **inside a `__tests__` folder**, or
- any file whose name ends in **`.test.<ext>`** or **`.spec.<ext>`**, or is named `test.js`/`spec.js`.

And it ignores `node_modules` (`testPathIgnorePatterns: ["/node_modules/"]`).

📌 **Version note:** Jest 30 added `.mjs .cjs .mts .cts` to the default patterns.

### Where to put tests? Two common layouts

**Co-located** (next to the code) — most popular today:
```
src/
  cart/
    cart.js
    cart.test.js
```

**Separate folder**:
```
src/cart/cart.js
__tests__/cart/cart.test.js
```

💼 Co-location makes it obvious when a file has no tests and keeps imports short. Pick one style per
repo and document it.

## 2.5 Configuration files — where config lives

Jest works with **zero config**, but most real projects have one. Jest looks for (in the root):

- `jest.config.js` / `.cjs` / `.mjs`
- `jest.config.ts` / `.cts` / `.mts`
- `jest.config.json`
- or a `"jest"` key in `package.json`

You can also pass `--config path/to/file`.

Typical `jest.config.js`:

```js
// jest.config.js
/** @type {import('jest').Config} */
const config = {
  testEnvironment: 'node',          // or 'jsdom' for browser-like tests
  clearMocks: true,                 // reset mock call history before each test
  collectCoverageFrom: ['src/**/*.{js,jsx,ts,tsx}'],
};

module.exports = config;
```

Since Jest 30.3 you can also use the `defineConfig` helper for autocompletion:

```js
const { defineConfig } = require('jest');

module.exports = defineConfig({
  testEnvironment: 'node',
});
```

**TypeScript config file** (`jest.config.ts`):

```ts
import type { Config } from 'jest';

const config: Config = {
  testEnvironment: 'node',
};

export default config;
```

To read a `.ts` config file, Jest needs a loader: by default **`ts-node`** must be installed. You can
choose `esbuild-register` instead with a docblock at the top of the file:

```ts
/** @jest-config-loader esbuild-register */
```

If Node itself is running with TypeScript type stripping enabled, Jest 30 doesn't need a loader at all.

Chapter 12 covers every config option.

## 2.6 Using modern JavaScript (`import`/`export`) — Babel

Out of the box, Jest runs files through **`babel-jest`** (the default `transform`). `babel-jest`
uses **your project's Babel config**. If you write `import x from './x'` without a Babel config,
Node in CommonJS mode would choke, so add:

```bash
npm install --save-dev babel-jest @babel/core @babel/preset-env
```

```js
// babel.config.js
module.exports = {
  presets: [['@babel/preset-env', { targets: { node: 'current' } }]],
};
```

`targets: { node: 'current' }` tells Babel "only transform what the Node version running the tests
can't understand" — which mainly means converting `import/export` to `require/module.exports`.

🔍 Why convert to CommonJS? Jest's module system (the thing that makes `jest.mock` possible) is built
around CommonJS `require`. Native ESM support exists but is still **experimental** (Chapter 15).

⚠️ Use `babel.config.js` (project-wide) rather than `.babelrc` if you need Babel to apply to files
in other packages/`node_modules` in a monorepo — `.babelrc` is file-relative and does not apply
across package boundaries.

## 2.7 Using TypeScript — three options

| Option | How | Type-checks during tests? | Speed |
| --- | --- | --- | --- |
| **Babel** (`@babel/preset-typescript`) | strips types | ❌ No | Fast |
| **ts-jest** | uses the TypeScript compiler | ✅ Yes (configurable) | Slower |
| **SWC / esbuild transformers** (`@swc/jest`, `esbuild-jest`) | strips types with a native compiler | ❌ No | Fastest |
| **Node type stripping** (Jest 30.5+) | Node removes types itself | ❌ No | Fast, no transformer |

### Option A — Babel
```bash
npm i -D @babel/preset-typescript
```
```js
// babel.config.js
module.exports = {
  presets: [
    ['@babel/preset-env', { targets: { node: 'current' } }],
    '@babel/preset-typescript',
  ],
};
```
Then run `tsc --noEmit` separately (in CI) for type checking.

### Option B — ts-jest
```bash
npm i -D ts-jest @types/jest
npx ts-jest config:init      # creates jest.config.js with preset: 'ts-jest'
```
```js
// jest.config.js
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
};
```

### Types for globals
For editor autocompletion of `test`, `expect`, `jest`:

- install `@types/jest` (community types for the globals), **or**
- import from `@jest/globals` explicitly (official types, no global pollution):

```ts
import { describe, expect, test, jest } from '@jest/globals';
```

Chapter 15 goes deep on TypeScript, ESM and transforms.

## 2.8 Useful `package.json` scripts

```json
{
  "scripts": {
    "test": "jest",
    "test:watch": "jest --watch",
    "test:coverage": "jest --coverage",
    "test:ci": "jest --ci --coverage --maxWorkers=50%",
    "test:debug": "node --inspect-brk node_modules/.bin/jest --runInBand"
  }
}
```

Passing extra arguments through npm: `npm test -- --watch` (the `--` means "the rest goes to Jest").

## 2.9 Running only some tests

```bash
npx jest sum                    # files whose path matches the regex "sum"
npx jest src/cart               # tests under a folder
npx jest -t "adds 1"            # tests whose NAME matches (alias of --testNamePattern)
npx jest --watch                # re-run tests related to changed files (needs git/hg)
npx jest --watchAll             # re-run everything on any change
npx jest --onlyChanged          # (-o) tests related to uncommitted changes
npx jest --findRelatedTests src/cart.js
```

### Watch mode keys
When `--watch` is running, press:

| Key | Action |
| --- | --- |
| `a` | run all tests |
| `f` | run only failed tests |
| `o` | only tests related to changed files |
| `p` | filter by filename regex |
| `t` | filter by test name regex |
| `u` | update failing snapshots |
| `i` | update failing snapshots interactively |
| `q` | quit |
| `Enter` | re-run |
| `w` | show this menu |

## 2.10 Editor & tooling that teams use

- **VS Code "Jest" extension** (`Orta.vscode-jest`, community maintained) — run/debug single tests
  from the editor, inline pass/fail markers.
- **`eslint-plugin-jest`** — catches mistakes: focused tests left in (`no-focused-tests`),
  disabled tests, missing `await` on `expect().resolves`, alias matchers removed in Jest 30
  (`no-alias-methods`, auto-fixable), `valid-expect`, `no-conditional-expect`, etc.
- **`eslint-plugin-testing-library`** — for Testing Library best practices.
- **`@testing-library/jest-dom`** — extra DOM matchers (`toBeInTheDocument`, `toHaveTextContent`...).

```js
// .eslintrc.js (classic config) example
module.exports = {
  overrides: [
    {
      files: ['**/*.test.{js,ts,tsx}'],
      plugins: ['jest'],
      extends: ['plugin:jest/recommended', 'plugin:jest/style'],
      env: { 'jest/globals': true },
    },
  ],
};
```

## 2.11 What happens when you type `npm test`? (the short version)

1. Jest reads config (file / package.json / CLI flags).
2. It builds a map of all files in your project (the **haste map**) — fast, cached, can use
   Watchman.
3. It finds test files (`testMatch` / `testRegex`) and filters them (CLI patterns, `-o`, etc.).
4. It decides an order (failed-last-time and slow files first) and starts **worker processes**
   (in parallel, `maxWorkers`).
5. Each worker, for each test file: creates a fresh **test environment** (`node` or `jsdom`)
   in its own sandbox (`vm` context), transforms files (Babel/ts-jest) on the fly with caching,
   runs setup files, then runs the tests with the **jest-circus** runner.
6. Results flow back to the main process → **reporters** print them → coverage is merged → exit code
   `0` (all good) or `1` (failures).

Chapter 21 explains each piece in depth. The one thing to remember now:
**every test file runs in its own isolated world.** Global variables, module state and mocks in
one file can't leak into another file. (Within one file, they *can* leak between tests — Chapter 6.)

## 2.12 Summary

- `npm i -D jest`, add `"test": "jest"`, write `*.test.js`, run `npm test`.
- Jest finds tests in `__tests__/` or `*.test.*` / `*.spec.*`.
- Babel (`babel-jest`) is the default transformer; add presets for modern JS/TS/JSX.
- TypeScript: Babel/SWC (fast, no type check) or ts-jest (type-checks).
- Use watch mode, `-t`, and path filters to run only what you need.

**Next:** [Chapter 3 — Anatomy of a test](03-anatomy-of-a-test.md)
