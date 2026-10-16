# Chapter 42 — Interview Questions: Frameworks, Ecosystem & Special Topics

Questions on everything in Part 7. Answers reference what was **verified** in Chapters 31–41.

---

## A. Vue, Svelte, Angular

**1. How do you test Vue SFCs with Jest?**
Use `@vue/vue3-jest` as the transformer for `.vue`, `babel-jest` for JS, the jsdom environment with
`customExportConditions: ['node', 'node-addons']` (otherwise browser ESM builds load), and test with
`@vue/test-utils` (`mount`, `trigger`, `emitted`) or `@testing-library/vue`. `await` DOM updates
(`await trigger()`/`nextTick`). (Ch 31)

**2. Any compatibility pitfalls with Vue + Jest 30 today?**
`@vue/vue3-jest` declares peer `jest: 29.x` (needs `--legacy-peer-deps` with Jest 30, though it
works), and it breaks on **Babel 8** because it calls the synchronous `babel.transform` → pin
`@babel/core@7`. (Ch 31 §31.3, verified)

**3. Can you test Svelte 5 with Jest?**
Only in native ESM mode (`--experimental-vm-modules`), since Svelte 4+ outputs ESM and
`svelte-jester` refuses CJS mode. Verified: it works on Jest ≤ 30.3.0 but fails on 30.4.x/30.5.x
(Jest calls the sync transform). The ecosystem standard is Vitest + `@testing-library/svelte`.
(Ch 31 §31.6)

**4. How do you set up Jest for Angular?**
`jest-preset-angular` (v17: Jest 30, Angular 20–22, TS ≥ 5.8): spread `createCjsPreset()`, add a setup
file calling `setupZonelessTestEnv()` (or `setupZoneTestEnv()`), a `tsconfig.spec.json`
(`isolatedModules: true` for speed). The preset transforms `.mjs` in node_modules because Angular
ships ESM. (Ch 32)

**5. How do you mock an Angular service?**
DI override: `TestBed.configureTestingModule({ providers: [{ provide: Service, useValue: fake }] })`,
or `jest.spyOn(TestBed.inject(Service), 'method')`. HTTP via `provideHttpClientTesting()` +
`HttpTestingController.expectOne(url).flush(data)` + `verify()`. (Ch 32 §32.4)

**6. Zoneless vs zone-based change detection in tests?**
Zoneless: `await fixture.whenStable()`; signal inputs via `fixture.componentRef.setInput`. Zone-based:
`fixture.detectChanges()`, `fakeAsync`/`tick`. (Ch 32)

## B. Next.js

**7. How do you configure Jest for Next.js?**
`next/jest`'s `createJestConfig` (SWC transform, asset/CSS/font mocks, `.env` loading, Next config),
plus jsdom, jest-dom setup, and path aliases in `moduleNameMapper`. (Ch 33 §33.1)

**8. How do you test an async Server Component?**
Call and await the component function, then render the result: `render(await Page())`.
`render(<Page />)` silently renders nothing and React logs "is an async Client Component"
(verified). Nested async server components and streaming → E2E. (Ch 33 §33.3)

**9. How do you test Server Actions and Route Handlers?**
They're async functions: test them in the **node** environment (real `FormData`, `Request`,
`Response`), mock data access and `next/cache`/`next/headers`. Route handlers: call `GET(new Request(url))`
and assert `res.status` / `await res.json()`. (Ch 33 §33.4–33.5)

**10. How do you test a client component using `useRouter`?**
Mock `next/navigation` (`useRouter`, `useSearchParams`, `usePathname`) and assert `push` calls.
Note: under `next/jest` (SWC) the factory may reference a non-`mock`-prefixed variable lazily; under
Babel you'd need `mockPush`. (Ch 33 §33.2)

## C. State & data libraries

**11. Best practice for testing Redux?**
Reducers/selectors as pure functions; components with a **real store** (`configureStore` with
`preloadedState`) per test; don't mock `useSelector`. (Ch 34 §34.1)

**12. How do you test TanStack Query hooks?**
`renderHook` with a wrapper creating a **new `QueryClient` per test** with `retry: false`; `waitFor`
`isSuccess`/`isError`. Retries would make error tests slow; a shared client leaks cache. (Ch 34 §34.3)

**13. What changed for Apollo testing in Apollo Client 4?**
`useQuery` comes from `@apollo/client/react` and `MockedProvider` from
`@apollo/client/testing/react`. Mocks must match query **and** variables, include `__typename`, and
are consumed once. (Ch 34 §34.4, verified)

**14. How do you test RTK Query endpoints?**
Real store with the API middleware; `store.dispatch(api.endpoints.x.initiate(arg))`; mock `fetch`
(it receives a `Request` object → assert `.url`) or MSW; reset API state between tests. (Ch 34 §34.2)

**15. Why do Zustand tests leak state and how do you fix it?**
Stores are module singletons. Save `getState()` initially and `setState(initial, true)` in
`beforeEach`, or use a manual mock that resets all stores. (Ch 34 §34.5)

## D. Storybook, accessibility, i18n

**16. How can you reuse Storybook stories in Jest?**
`composeStories(stories)` from `@storybook/react` → render stories as components, override args;
`setProjectAnnotations` for global decorators. Storybook 10 is ESM-only → allow-list
`@storybook|storybook` in `transformIgnorePatterns` (verified). (Ch 35 §35.1–35.2)

**17. What can jest-axe check and what can't it?**
Static a11y rules (alt text, names, labels, ARIA validity, duplicate IDs…; verified it reports
`image-alt` and `button-name`). It can't check colour contrast in jsdom (no rendering) → use
browser-based axe. (Ch 35 §35.4)

**18. How do you test translations?**
A fresh i18next instance per test with test resources and `initAsync: false`; `test.each` across
locales; test plurals/interpolation; a separate check that locale files share keys. Watch for
non-breaking spaces and time zones in `Intl` output. (Ch 35 §35.7–35.8)

## E. Browser APIs

**19. Name browser APIs missing from jsdom and how you'd handle them.**
`fetch`, `TextEncoder`, `structuredClone`, `matchMedia`, `IntersectionObserver`, `ResizeObserver`,
`crypto.subtle`, `URL.createObjectURL`, `EventSource`, `Notification`, `PointerEvent`,
`DataTransfer`, `dialog.showModal`, `Worker`, IndexedDB, canvas `getContext`, `Blob.text()`; layout
is always 0; `play()` is not implemented. Polyfill/mock in `setupFiles` or test in a real browser.
(Ch 36 §36.1, all verified)

**20. Your `fake-indexeddb` test hangs in jsdom. Why?**
jsdom lacks `structuredClone`, which fake-indexeddb uses; polyfill it (or use the node env).
Verified: with only `setImmediate` polyfilled it still failed; with `structuredClone` it passed.
(Ch 36 §36.2)

**21. How do you test file uploads and drag-and-drop?**
`user.upload(input, files)` (respects `accept` by default — non-matching files are dropped;
`applyAccept: false` to test validation); read contents with `FileReader` in jsdom; drag-and-drop via
`fireEvent.drop(el, { dataTransfer: { files } })`. (Ch 36 §36.4–36.5)

**22. How do you test Web Worker code?**
Keep logic in pure modules and test directly; inject a worker factory to pass fakes; integration with
`worker_threads` in the node env. Code inside a real worker isn't affected by `jest.mock` or
coverage. (Ch 36 §36.8)

**23. How do you test components that depend on element sizes?**
jsdom returns 0 for `getBoundingClientRect`/`offsetWidth` (verified) → mock them on the prototype,
use library test modes (virtualised lists), or test in a real browser where `boundingBox()` is real.
(Ch 36 §36.11, Ch 39)

## F. Electron, extensions, CLIs

**24. How do you unit test an Electron main process?**
Mock `electron` (virtual if not installed; in real installs it resolves to a path string in plain
Node), capture IPC handlers from `ipcMain.handle.mock.calls` and call them directly, assert security
options on `BrowserWindow`. Full app: Playwright's Electron support. (Ch 37 §37.2)

**25. How do you test a browser extension?**
A behavioural fake of `chrome.*` (e.g. in-memory `storage.local`), capture listeners from
`addListener.mock.calls`, keep logic in modules; Playwright for the loaded extension. (Ch 37 §37.3)

**26. How do you make a CLI testable?**
A `run(argv, io)` function returning an exit code, injected stdout/stderr, a
`require.main === module` guard; unit-test `run`, plus a few spawn tests using `process.execPath`,
and `NO_COLOR`/`FORCE_COLOR=0` for stable output. (Ch 37 §37.4)

## G. Property, mutation, contract testing

**27. What is property-based testing and what's shrinking?**
Stating invariants checked against many generated inputs (fast-check). On failure, the library
shrinks to a minimal counterexample (verified: a buggy `max` shrank to `[[-1]]` after 27 shrinks)
and prints a seed/path to replay. (Ch 38 §38.1–38.2)

**28. Why can 100% coverage still be weak? How do you prove it?**
Coverage measures execution, not verification. Mutation testing (Stryker) showed 100% line coverage
but a **77.78%** mutation score — surviving mutants (`>=`→`>`, condition→`true`) pinpointed missing
boundary tests; adding them reached 100%. (Ch 38 §38.6)

**29. What is consumer-driven contract testing?**
The consumer's tests (with Pact's mock provider) record the interactions it relies on into a
contract; the provider verifies the contract against its real implementation using provider
states; a broker + `can-i-deploy` gate releases. Replaces many cross-service E2E tests. (Ch 38 §38.8–38.10)

**30. A Pact provider verification returns 403s against localhost. What happened?**
Proxy environment variables routed localhost traffic through a corporate proxy; in the verified case
`NO_PROXY` wasn't honoured and unsetting the proxy variables for the verification step fixed it.
(Ch 38 §38.9)

## H. E2E and environments

**31. Is Playwright a replacement for Jest?**
No — different layers. Playwright Test is an E2E/real-browser runner; Jest + jsdom covers unit and
integration. You can drive Playwright/Puppeteer from Jest (node env, long timeouts, close the browser
in `afterAll`), and Detox uses Jest as its runner for React Native E2E. (Ch 39)

**32. Your ESM allow-list works with npm but not with pnpm. Why?**
pnpm paths look like `node_modules/.pnpm/pkg@v/node_modules/pkg`; the npm-style
`/node_modules/(?!(pkg)/)` matches the first `node_modules/` followed by `.pnpm/` → ignored. Use
`/node_modules/(?!(\.pnpm/)?(pkg))` (verified). (Ch 40 §40.2)

**33. Does Jest work with Yarn Plug'n'Play?**
Yes — Jest 30 with Yarn 4 PnP worked out of the box via `yarn jest` (verified). (Ch 40 §40.3)

**34. Should you upgrade to Babel 8 for Jest?**
`babel-jest` 30 supports Babel 7 and 8 (verified); older transformers that call `babel.transform`
synchronously (e.g. `@vue/vue3-jest`) and RN's Babel preset need Babel 7. Upgrade per toolchain
support. (Ch 40 §40.4)

**35. What breaks Jest on Windows or in Docker?**
Windows: path separators in snapshots, env vars in npm scripts (`cross-env`), CRLF, case-insensitive
FS hiding import errors. Docker: wrong CPU count (set `--maxWorkers`), memory limits
(`workerIdleMemoryLimit`), missing `.git` for `-o`, minimal ICU, TZ. (Ch 40 §40.5–40.6)

## I. Rapid-fire

36. Transformer for `.vue`? → `@vue/vue3-jest`.
37. Jest preset for Angular? → `jest-preset-angular` (`createCjsPreset`).
38. Next.js config helper? → `next/jest`.
39. Render an async server component? → `render(await Page())`.
40. Apollo 4 `MockedProvider` import path? → `@apollo/client/testing/react`.
41. React Query test option to avoid slow failures? → `retry: false`.
42. Reuse Storybook stories? → `composeStories`.
43. a11y matcher? → `toHaveNoViolations` (jest-axe).
44. i18next sync init option (v24+)? → `initAsync: false`.
45. IndexedDB fake? → `fake-indexeddb` (+ `structuredClone` in jsdom).
46. Canvas fake? → `jest-canvas-mock`.
47. Clipboard in tests? → `userEvent.setup()` installs a stub.
48. Real worker in Jest? → `worker_threads` in the node env.
49. Mock a non-installed module? → `jest.mock(name, factory, { virtual: true })`.
50. Mutation testing tool? → Stryker (`@stryker-mutator/jest-runner`).
51. Contract testing tool? → Pact (`PactV4`, `Verifier`).
52. Property-based tool? → fast-check.
53. React Native E2E with Jest runner? → Detox.
54. pnpm ESM allow-list regex? → `/node_modules/(?!(\.pnpm/)?(pkg))`.
55. Why `customExportConditions`? → choose which `exports` build (browser vs node) a package resolves to.

**Back to:** [Table of contents](../README.md)
