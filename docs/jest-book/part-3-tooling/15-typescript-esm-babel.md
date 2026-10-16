# Chapter 15 — TypeScript, Babel, ESM and Transforms

> 🧸 **Explain it like I'm 5**
>
> Jest only speaks one language well: **plain old JavaScript in "CommonJS" style**
> (`require`/`module.exports`). Your code might speak TypeScript, JSX, or modern `import/export`.
> So before running each file, Jest asks a **translator** (Babel, ts-jest, SWC…) to translate it.
> Most Jest setup headaches are really "the translator didn't translate this file" problems.

---

## 15.1 The transform pipeline (🔍)

For every file Jest needs (test files, your source, and anything they import):

1. **Resolve** the path (`moduleNameMapper`, `moduleDirectories`, `exports` conditions…).
2. Check `transformIgnorePatterns` — if the path matches (by default anything in `node_modules`),
   **skip transforming** and load as-is.
3. Otherwise find the first `transform` regex that matches the path and call that transformer's
   `process(source, path, options)` (or `processAsync`).
4. **Cache** the result on disk (`cacheDirectory`) keyed by file content + config + transformer
   `getCacheKey`. Next run is fast.
5. Execute the result in the test's vm context with Jest's module system.

Default: `transform: { '\\.[jt]sx?$': 'babel-jest' }` and
`transformIgnorePatterns: ['/node_modules/', '\\.pnp\\.[^\\/]+$']`.

Jest sets `process.env.NODE_ENV = 'test'` if it isn't already set, so Babel configs can branch on
`api.env('test')`.

## 15.2 babel-jest

- Loads your Babel config (`babel.config.js` / `.babelrc` / `package.json#babel`).
- Automatically adds **`babel-preset-jest`** which includes `babel-plugin-jest-hoist` (hoists
  `jest.mock`) — you don't add it yourself.
- If no Babel config exists, babel-jest still runs with only the Jest preset (no ESM→CJS
  conversion!) — that's why `import` fails without a config in a CommonJS project.

Typical config:

```js
// babel.config.js
module.exports = {
  presets: [
    ['@babel/preset-env', { targets: { node: 'current' } }],
    ['@babel/preset-react', { runtime: 'automatic' }],
    '@babel/preset-typescript',
  ],
};
```

Different config for tests only:

```js
module.exports = (api) => {
  const isTest = api.env('test');
  return {
    presets: [
      ['@babel/preset-env', isTest ? { targets: { node: 'current' } } : { modules: false }],
    ],
  };
};
```

⚠️ `.babelrc` vs `babel.config.js`: `.babelrc` applies only to files in its own package and
**never** to `node_modules`. If you need Babel to transform an ESM package in `node_modules`, you
need a **project-wide** `babel.config.js` (verified: with `babel.config.js` and an adjusted
`transformIgnorePatterns`, ESM packages in node_modules are transformed and work).

📌 **Babel 8** (released June 2026, now `@babel/core`'s `latest` tag): `babel-jest` 30 supports
it (verified), `babel-jest` 29 expects Babel 7, and some older transformers that call
`babel.transform()` synchronously break on Babel 8 (verified with `@vue/vue3-jest`). React Native
projects should stay on Babel 7. See Chapter 40 §40.4.

## 15.3 TypeScript options compared

| | Babel (`@babel/preset-typescript`) | `ts-jest` | `@swc/jest` | Node type stripping (Jest 30.5+) |
| --- | --- | --- | --- | --- |
| Type-checks in tests | ❌ | ✅ (unless `isolatedModules`) | ❌ | ❌ |
| Speed | fast | slowest (full TS program) | fastest | fast |
| `const enum`, `namespace` | limited (some unsupported) | ✅ | partial | ❌ (erasable syntax only: no enums/namespaces/parameter properties) |
| Decorators metadata (`emitDecoratorMetadata`, NestJS/TypeORM) | needs `babel-plugin-transform-typescript-metadata` | ✅ | ✅ (config) | ❌ |
| Hoists `jest.mock` | ✅ | ✅ | ✅ | ❌ |
| Uses `tsconfig.json` | no (Babel config) | ✅ | partly (`.swcrc`) | no |

💼 Common org setup: **SWC or Babel in Jest for speed + `tsc --noEmit` as a separate CI step** for
types. Use `ts-jest` when you need full TS semantics (decorator metadata, `const enum` across files)
or want type errors to fail tests.

### ts-jest setup (v29.x)

```bash
npm i -D ts-jest typescript @types/jest
```

```js
// jest.config.js
const { createDefaultPreset } = require('ts-jest');

module.exports = {
  testEnvironment: 'node',
  ...createDefaultPreset(),            // or: preset: 'ts-jest'
};
```

Options go in the `transform` tuple:

```js
module.exports = {
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      tsconfig: '<rootDir>/tsconfig.test.json',
      diagnostics: { ignoreCodes: ['TS151001'] },  // or false to hide type errors
    }],
  },
};
```

- Speed: set `"isolatedModules": true` in the **tsconfig** ts-jest uses → it transpiles each file
  separately with `transpileModule` (no type checking, much faster). The old ts-jest option
  `isolatedModules: true` in the transform options is **deprecated** in favour of the tsconfig flag.
- Presets available: `default`, `js-with-ts`, `js-with-babel` and their `-esm`/`-legacy` variants
  (`createDefaultPreset`, `createJsWithTsPreset`, `createDefaultEsmPreset`, …).
- Path aliases: generate `moduleNameMapper` from `tsconfig` paths:

```js
const { pathsToModuleNameMapper } = require('ts-jest');
const { compilerOptions } = require('./tsconfig.json');   // must be plain JSON (no comments)

module.exports = {
  preset: 'ts-jest',
  moduleNameMapper: pathsToModuleNameMapper(compilerOptions.paths, { prefix: '<rootDir>/' }),
};
```

### SWC

```bash
npm i -D @swc/core @swc/jest
```

```js
module.exports = {
  transform: { '^.+\\.(t|j)sx?$': '@swc/jest' },
};
```

### Node type stripping (📌 Jest 30.5+)

On a Node version with type stripping enabled, Jest can load `.ts`/`.mts`/`.cts` without any
transformer when no transformer claims the file:

```json
{ "jest": { "transform": {} } }
```

Limitations: only "erasable" TS syntax, no `jest.mock` hoisting (so write tests that don't rely on
hoisting, or use `jest.unstable_mockModule`/`doMock`), no JSX.

### Types for test globals

```ts
// Option 1: @types/jest (global types; matches Jest 29 API — check the version)
// tsconfig: "types": ["jest", "node"]

// Option 2 (official, always in sync): explicit imports
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
```

⚠️ This repository has `jest@^29` with `@types/jest@^29` — keep the `@types/jest` major version in
sync with Jest. With Jest 30, prefer `@jest/globals` (or a matching `@types/jest` if available).

### Typing mocks — recap

```ts
import { jest } from '@jest/globals';
import * as api from './api';

jest.mock('./api');
const mockedApi = jest.mocked(api);                 // deep-typed mock module
mockedApi.getUser.mockResolvedValue({ id: 1, name: 'Ann' });

const spy: jest.Spied<typeof api.getUser> = jest.spyOn(api, 'getUser');
const fn = jest.fn<typeof api.getUser>();
```

## 15.4 The "ESM package in node_modules" problem (🎯 #1 setup issue)

Many packages now ship **only ES modules** (`export ...`), e.g. recent versions of `uuid`, `nanoid`,
`chalk`, `node-fetch@3`, `d3`, `lodash-es`, `react-markdown`, `@react-native/*` sources. Jest in
CommonJS mode doesn't transform `node_modules` by default, so it tries to `require` ESM.

Jest 30.5 error (verified):

```
Must use import to load ES Module: .../node_modules/esm-only/index.js

The file contains ESM syntax (import/export) that could not be executed as CommonJS. Either:
  - Configure a transform (e.g. babel-jest) that compiles this file to CommonJS
  - If the file is in "node_modules", allow it to be transformed by adjusting "transformIgnorePatterns"
  - Use Node v24.9+ where Jest supports require(esm) natively
```

Older versions show the classic:

```
Jest encountered an unexpected token
...
SyntaxError: Unexpected token 'export'      (or: Cannot use import statement outside a module)
```

### Fix 1 — transform those packages (most common)

```js
// jest.config.js
module.exports = {
  transformIgnorePatterns: [
    '/node_modules/(?!(uuid|nanoid|chalk|lodash-es)/)',
  ],
};
```

Read the regex: "ignore paths containing `/node_modules/` **unless** followed by one of these package
names". Requirements:
- A **project-wide** `babel.config.js` (not `.babelrc`) so Babel applies to node_modules.
- For **pnpm**, packages live under `node_modules/.pnpm/<name>@<version>/node_modules/<name>`, so
  the npm-style pattern above **does not work** (verified). Use
  `'/node_modules/(?!(\\.pnpm/)?(uuid|nanoid))'` (verified with pnpm 10 + `nanoid@5`). Avoid
  `'node_modules/(?!(\\.pnpm|…))'`: it passes but transforms every pnpm package (slow). Details:
  Chapter 40 §40.2.
- Scoped packages: `(?!(@scope/pkg|other)/)` works; for all of a scope: `@scope/`.

Verified in our lab: `--transformIgnorePatterns '/node_modules/(?!(esm-only|esm-notype)/)'` made
both ESM packages load.

### Fix 2 — map to a CJS build

Some packages ship a CJS build under another path:

```js
moduleNameMapper: {
  '^lodash-es$': 'lodash',          // CJS twin package
  '^uuid$': require.resolve('uuid'),// forces the "require" export condition (common uuid fix in jsdom)
},
```

The `uuid` + jsdom case: jsdom uses `customExportConditions: ['browser']`, picking uuid's ESM browser
build. Mapping to `require.resolve('uuid')` or setting
`testEnvironmentOptions: { customExportConditions: ['node', 'node-addons'] }` fixes it.

### Fix 3 — mock it

If you don't need the real package in unit tests: `jest.mock('pkg', () => ({ ... }))` with a
factory, which never loads the real ESM file.

### Fix 4 — Node ≥ 24.9

Jest 30.5 supports `require()` of ESM natively on Node 24.9+ (no top-level `await` in the graph).

### Fix 5 — run Jest in native ESM mode (below).

## 15.5 Native ESM mode

Jest's native ESM support is still **experimental** (it depends on Node's experimental
`vm.Module` APIs).

Enable:

1. No transform to CJS: `transform: {}` (or a transformer configured to output ESM).
2. Run Node with `--experimental-vm-modules`:

```json
{
  "type": "module",
  "scripts": {
    "test": "node --experimental-vm-modules node_modules/jest/bin/jest.js"
  }
}
```

(or `NODE_OPTIONS=--experimental-vm-modules npx jest`; on Windows use `cross-env`.)

3. Jest decides ESM vs CJS like Node (`"type": "module"`, `.mjs`). For `.ts`/`.tsx`/`.jsx` as ESM add
   `extensionsToTreatAsEsm: ['.ts', '.tsx']` (ts-jest: `useESM: true` / `createDefaultEsmPreset()`).

Differences you must know:

- The `jest` object is **not** a free global in ESM: `import { jest } from '@jest/globals'` or use
  `import.meta.jest`.
- `jest.mock` is **not hoisted** and doesn't apply to ESM targets → use
  `jest.unstable_mockModule` + `await import()` (Chapter 8 §8.10).
- To mock a **CJS** module from an ESM test, `jest.mock` still works; load it with `createRequire`
  or `await import()`.
- Top-level `await` works in test files.
- `import.meta.url`, `import.meta.resolve()` and `import.meta.jest` are available (📌 `import.meta`
  and `file://` support improved in Jest 30).
- `__dirname`/`require` don't exist in ESM files (use `import.meta`/`createRequire`).

```js
// sum.test.mjs (native ESM)
import { jest, test, expect } from '@jest/globals';

jest.unstable_mockModule('./db.mjs', () => ({ query: jest.fn(async () => [{ id: 1 }]) }));
const { listUsers } = await import('./users.mjs');

test('lists users', async () => {
  await expect(listUsers()).resolves.toEqual([{ id: 1 }]);
});
```

💼 **Recommendation for most teams today:** keep tests in CJS mode via Babel/SWC/ts-jest
(stable, `jest.mock` hoisting works), and solve ESM packages with `transformIgnorePatterns`/mapping.
If your project is fully ESM and you hate the friction, consider Vitest (Chapter 25).

## 15.6 JSX

- Babel: `@babel/preset-react` (`runtime: 'automatic'` for React 17+ means no `import React`).
- ts-jest: `"jsx": "react-jsx"` in tsconfig.
- Error `SyntaxError: Unexpected token '<'` = JSX file not transformed (missing preset, or the file
  extension isn't matched by `transform`, or it's in `node_modules`).

## 15.7 Writing a custom transformer (preview — Chapter 20)

```js
// test/transforms/raw-text.js — import .txt/.graphql files as strings
module.exports = {
  process(sourceText) {
    return { code: `module.exports = ${JSON.stringify(sourceText)};` };
  },
};
```

```js
transform: {
  '\\.(txt|graphql|gql)$': '<rootDir>/test/transforms/raw-text.js',
  '\\.[jt]sx?$': 'babel-jest',
},
```

## 15.8 Cache problems

Transformed output is cached. After changing Babel/TS config, presets, or transformer versions, if
behaviour looks stale:

```bash
npx jest --clearCache        # deletes the cache dir
npx jest --no-cache          # bypass for one run
npx jest --showConfig | grep cacheDirectory
```

## 15.9 Summary

- Every file goes: resolve → `transformIgnorePatterns` check → transformer → cache → execute.
- babel-jest is default and adds the hoisting plugin; use `babel.config.js` for node_modules.
- TS: Babel/SWC (fast, no types) vs ts-jest (types); run `tsc --noEmit` separately when not using
  ts-jest; Node type stripping in 30.5+ for simple setups.
- ESM-only dependencies: allow-list them in `transformIgnorePatterns`, map to CJS, mock them, or use
  Node 24.9+.
- Native ESM: `--experimental-vm-modules`, `transform: {}`, `@jest/globals`,
  `unstable_mockModule` + dynamic import.

**Next:** [Part 4 — Chapter 16: Testing React](../part-4-real-world/16-testing-react.md)
