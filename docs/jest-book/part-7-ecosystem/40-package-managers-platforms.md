# Chapter 40 — Package Managers, Operating Systems and Environments (pnpm, Yarn PnP, Windows, Docker, Proxies)

> 🧸 **Explain it like I'm 5**
>
> Jest is the same robot everywhere, but the **house** changes: different ways of storing toys
> (npm, pnpm, Yarn), different floors (Windows, Mac, Linux), and different buildings (Docker, CI,
> corporate networks). Each house has a few quirks. This chapter is the map of those quirks.

Verified (October 2026): pnpm 10.28 + Jest 30.5, Yarn 4.18 Plug'n'Play + Jest 30.5, Babel 7 vs 8,
proxy behaviour with Pact.

---

## 40.1 npm / package-lock

The default. Notes:
- `npm ci` in CI (clean, lockfile-exact).
- Peer-dependency conflicts (e.g. `@vue/vue3-jest` declaring `jest: 29.x` while you use Jest 30) →
  npm 7+ refuses; use `--legacy-peer-deps` / `.npmrc legacy-peer-deps=true` **knowingly**
  (Chapter 31).
- Keep all Jest packages on the same major (`jest`, `babel-jest`, `jest-environment-jsdom`,
  `@jest/globals`, `ts-jest`).
- ⚠️ `jest-environment-jsdom` doesn't always publish every patch that `jest` does (e.g. there is
  `jest@30.4.2` but no `jest-environment-jsdom@30.4.2` — verified `notarget` error). Pin to an
  existing version (`npm view jest-environment-jsdom versions`).

## 40.2 pnpm — `transformIgnorePatterns` needs a different regex (verified)

pnpm stores packages under `node_modules/.pnpm/<name>@<version>/node_modules/<name>/…`, so a path
looks like:

```
/project/node_modules/.pnpm/nanoid@5.1.16/node_modules/nanoid/index.js
```

Verified results importing ESM-only `nanoid@5`:

| `transformIgnorePatterns` | Result under pnpm |
| --- | --- |
| default | ❌ "Must use import to load ES Module" |
| `/node_modules/(?!(nanoid)/)` (the npm-style pattern) | ❌ still fails — the first `/node_modules/` is followed by `.pnpm/`, so the path is ignored |
| **`/node_modules/(?!(\.pnpm/)?(nanoid))`** | ✅ passes — only nanoid is transformed |
| `node_modules/(?!(\.pnpm\|nanoid))` | ✅ passes, but transforms **every** pnpm package (slow) — avoid |

```js
// jest.config.js (pnpm)
const esmPackages = ['nanoid', 'uuid', 'lodash-es'];
module.exports = {
  transformIgnorePatterns: [`/node_modules/(?!(\\.pnpm/)?(${esmPackages.join('|')}))`],
};
```

Other pnpm notes:
- Strict dependency isolation: tests can't import packages you didn't declare (phantom deps) —
  good, but surfaces "Cannot find module" for undeclared deps in tests. Add them to
  `devDependencies`.
- Duplicate React copies are rarer but possible across workspace packages → dedupe with
  `moduleNameMapper` (Chapter 22 §22.5).

## 40.3 Yarn Berry Plug'n'Play (verified)

With Yarn 4 and `nodeLinker: pnp` (no `node_modules` folder, `.pnp.cjs` instead), `yarn jest`
**just works** with Jest 30.5 — verified with a fresh project (1 test passed). Jest 30 resolves PnP
through its `unrs-resolver` (📌 30.5 removed the separate `jest-pnp-resolver`).

Tips:
- Always run through Yarn: `yarn jest` (so the PnP runtime is loaded).
- Editor SDKs: `yarn dlx @yarnpkg/sdks vscode` for TypeScript/ESLint in VS Code.
- Packages that do dynamic `require` of undeclared deps break under PnP → use `packageExtensions`
  in `.yarnrc.yml`.
- `transformIgnorePatterns` under PnP: package files live in `.yarn/cache/*.zip` / unplugged
  folders; the default `\.pnp\.[^\/]+$` entry ignores the PnP runtime itself. Test your pattern with
  `--showConfig` and a failing import before relying on it.
- If anything misbehaves, `nodeLinker: node-modules` is a valid fallback.

(Environment note: corepack couldn't download Yarn here because `repo.yarnpkg.com` was blocked by
the network; installing `@yarnpkg/cli-dist` from the npm registry worked. Corporate networks often
have the same issue.)

## 40.4 Babel 7 vs Babel 8 (verified)

Babel 8 became `@babel/core`'s `latest` tag in 2026 (8.0.0 released June 2026).
- `babel-jest` **30** supports both (`peerDependencies: "@babel/core": "^7.11.0 || ^8.0.0-0"`);
  the book's main lab ran on Babel 8.0.7 without problems.
- `babel-jest` **29** (this repository) expects Babel 7.
- Older transformers/plugins that call `babel.transform()` synchronously break on Babel 8
  (verified with `@vue/vue3-jest`: "Starting from Babel 8.0.0, the 'transform' function expects a
  callback"). Fix: pin `@babel/core@^7` until the tool updates.
- React Native's `@react-native/babel-preset` targets Babel 7 — keep RN projects on Babel 7.

## 40.5 Windows

| Issue | Fix |
| --- | --- |
| Paths with `\` in snapshots / error messages | use `path.join`/`path.sep`, serialize paths with `jest-serializer-path`, or normalise with `.replace(/\\/g, '/')` |
| Regex options with `/` in config (`testPathIgnorePatterns: ['/dist/']`) | Jest normalises separators for most path options; for custom regexes over paths, use `[/\\\\]` |
| Env vars in npm scripts (`TZ=UTC jest`) | doesn't work in cmd/PowerShell → `cross-env TZ=UTC jest` |
| `node --inspect-brk node_modules/.bin/jest` | `.bin/jest` is a shell shim → use `node --inspect-brk node_modules/jest/bin/jest.js` |
| CRLF line endings → snapshot diffs | `.gitattributes` `* text=auto eol=lf`; Jest 30 fixed Prettier 3 + CRLF inline snapshot mangling |
| Case-insensitive file system hides wrong-case imports | CI on Linux fails → lint with `import/no-unresolved` (case-sensitive) |
| File locking (`EPERM`) in watch mode | Jest 30.5 hardened the haste map against `EPERM`; antivirus exclusions for the repo help |
| Slow file watching | install Watchman or rely on Jest 30.5's `@parcel/watcher` path |

## 40.6 Docker and CI containers

- **CPU count lies**: Node sees the host's cores, not the container's CPU quota → set
  `--maxWorkers` explicitly (Chapter 22 §22.3).
- **Memory limits**: workers × heap can exceed the container limit → `workerIdleMemoryLimit` with an
  absolute value (`'512MB'`), fewer workers.
- **No `.git`** in the image → `--watch`/`-o`/`--changedSince` don't work; mount `.git` or use
  `--watchAll`/full runs.
- **Minimal-ICU** Node images change `Intl` output → use full-ICU images (Chapter 35 §35.8).
- **Time zone**: images default to UTC — great for tests, but your laptop isn't → set `TZ=UTC` in
  scripts so both match.
- Cache Jest's `cacheDirectory` as a volume/CI cache for faster runs.

## 40.7 Corporate proxies and offline environments (verified)

- npm/yarn/corepack downloads blocked → configure registry mirrors; corepack needs access to its
  download host (or install the package manager from npm).
- `HTTP_PROXY`/`HTTPS_PROXY` set globally can route **localhost** requests through the proxy for some
  native tools. Verified with the Pact verifier: requests to `127.0.0.1` returned the proxy's
  `403 request blocked`; `NO_PROXY` wasn't honoured there, unsetting the proxy variables for that
  step fixed it (Chapter 38 §38.9).
- Node's built-in `fetch` (undici) does **not** use `HTTP_PROXY` automatically unless configured
  (e.g. `NODE_USE_ENV_PROXY=1` on recent Node versions, or a custom dispatcher),
  so behaviour differs between tools — another reason to block real network in unit tests (MSW
  `onUnhandledRequest: 'error'`).
- Tools that download binaries on install (Puppeteer browsers, `mongodb-memory-server`, Cypress,
  Playwright) need mirrors/env vars (`PUPPETEER_SKIP_DOWNLOAD`, `PLAYWRIGHT_BROWSERS_PATH`,
  `MONGOMS_DOWNLOAD_URL`, …) in restricted networks.

## 40.8 Node version managers & engines

- Pin Node with `.nvmrc`/`.node-version`/Volta and `"engines"`; Jest 30 needs Node ≥ 18 (and some
  features — `require(esm)` — need ≥ 24.9).
- Use `process.execPath` (not `'node'`) when tests spawn Node (Chapter 37).
- Different Node majors change error messages, `Intl` data and V8 coverage numbers → CI and local
  should match.

## 40.9 Summary

| Environment | Key quirk |
| --- | --- |
| npm | peer conflicts; align Jest package majors; not every jsdom-env patch exists |
| pnpm | `/node_modules/(?!(\.pnpm/)?(pkg))` for ESM allow-lists |
| Yarn PnP | works out of the box with Jest 30; run via `yarn jest` |
| Babel 8 | fine with babel-jest 30; old transformers need Babel 7 |
| Windows | paths, env vars (`cross-env`), CRLF, case sensitivity |
| Docker/CI | explicit workers & memory, no `.git`, ICU, TZ |
| Proxies | localhost through proxy, blocked downloads |

**Next:** [Chapter 41 — Jest visually: diagrams](41-visual-guide.md)
