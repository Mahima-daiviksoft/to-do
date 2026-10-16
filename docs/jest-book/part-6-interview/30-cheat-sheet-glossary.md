# Chapter 30 — Cheat Sheet & Glossary

Print this. Read it the night before an interview.

---

## 30.1 Test structure

```js
describe('Unit', () => {
  beforeAll(fn); beforeEach(fn); afterEach(fn); afterAll(fn);   // before: outer→inner, after: inner→outer
  test('does X when Y', async () => { /* Arrange, Act, Assert */ }, 10_000);
  it.each([[1, 2], [3, 4]])('f(%i) = %i', (a, b) => {});
  test.each`a | b
    ${1} | ${2}`('$a → $b', ({ a, b }) => {});
  test.only / test.skip / test.todo('later') / test.failing / test.concurrent
  // aliases: it = test, fit/fdescribe = only, xit/xtest/xdescribe = skip
});
```

Placeholders: `%p %s %d %i %f %j %o %# %$ %%`, `$var`, `$var.path`.

## 30.2 Matchers

| Need | Matcher |
| --- | --- |
| primitive / same ref | `toBe` (Object.is: `NaN` equals `NaN`, `+0` ≠ `-0`) |
| deep (loose) | `toEqual` (ignores undefined props, sparseness, class type; Errors by message) |
| deep (strict) | `toStrictEqual` |
| subset | `toMatchObject` (recursive), `expect.objectContaining` (one level) |
| truthiness | `toBeTruthy/Falsy/Null/Undefined/Defined/NaN` |
| numbers | `toBeGreaterThan(OrEqual)`, `toBeLessThan(OrEqual)`, `toBeCloseTo(n, 2)` |
| strings | `toMatch(re/str)`, `toContain`, `toHaveLength` |
| arrays | `toContain` (===), `toContainEqual` (deep), `toHaveLength` |
| objects | `toHaveProperty('a.b[0]', v)` |
| errors | `expect(() => fn()).toThrow(Class \| 'sub' \| /re/ \| errObj)` |
| class | `toBeInstanceOf` |
| mocks | `toHaveBeenCalled`, `…Times(n)`, `…With(...)`, `…LastCalledWith`, `…NthCalledWith(n, ...)`, `toHaveReturned(Times/With)`, `toHaveLastReturnedWith`, `toHaveNthReturnedWith` |
| snapshots | `toMatchSnapshot(props?, hint?)`, `toMatchInlineSnapshot()`, `toThrowErrorMatching(Inline)Snapshot()` |
| modifiers | `.not`, `.resolves`, `.rejects` (await them!) |
| asymmetric | `expect.anything()` (not null/undefined), `expect.any(Ctor)`, `objectContaining`, `arrayContaining`, `arrayOf` (30), `stringContaining`, `stringMatching`, `closeTo`, `expect.not.*` |
| counts | `expect.assertions(n)`, `expect.hasAssertions()` |
| extend | `expect.extend`, `expect.addEqualityTesters`, `expect.addSnapshotSerializer` |

📌 Removed in Jest 30: `toBeCalled*`, `lastCalledWith`, `nthCalledWith`, `toReturn*`,
`lastReturnedWith`, `nthReturnedWith`, `toThrowError`.

## 30.3 Async

```js
test('a', async () => { expect(await f()).toBe(1); });
test('b', () => f().then((v) => expect(v).toBe(1)));        // return!
test('c', async () => { await expect(f()).resolves.toBe(1); await expect(g()).rejects.toThrow('x'); });
test('d', (done) => { cb((err, v) => { try { expect(v).toBe(1); done(); } catch (e) { done(e); } }); });
```

Never `async (done) => {}`. Default timeout 5 s.

## 30.4 Mock functions

```js
const fn = jest.fn(impl?)
  .mockReturnValue(v).mockReturnValueOnce(v)
  .mockResolvedValue(v).mockResolvedValueOnce(v)
  .mockRejectedValue(e).mockRejectedValueOnce(e)
  .mockImplementation(f).mockImplementationOnce(f)
  .mockReturnThis().mockName('name');
fn.whenCalledWith('a').mockReturnValue(1);          // 30.5+
fn.withImplementation(tmp, () => { /* ... */ });
fn.mock.calls / results / instances / contexts / lastCall / invocationCallOrder
fn.mockClear()   // history
fn.mockReset()   // + behaviour → returns undefined (also for spies)
fn.mockRestore() // + original (spyOn / replaceProperty only)
jest.clearAllMocks() / resetAllMocks() / restoreAllMocks()  // config: clearMocks/resetMocks/restoreMocks
jest.isMockFunction(x)
```

Precedence: `*Once` queue → default implementation → `undefined`.

## 30.5 Spies & properties

```js
const spy = jest.spyOn(obj, 'method');                // calls through by default
jest.spyOn(obj, 'prop', 'get').mockReturnValue(1);    // getter / 'set'
jest.replaceProperty(obj, 'key', value);              // non-functions; must exist
using s = jest.spyOn(console, 'warn');                // auto-restore (30)
```

Spy misses: internal same-module calls, destructured refs, barrel re-exports ("Cannot redefine
property"), native ESM.

## 30.6 Module mocks

```js
jest.mock('./m');                                      // automock (hoisted)
jest.mock('./m', () => ({ __esModule: true, default: jest.fn(), named: jest.fn() }));
jest.mock('./m', () => ({ ...jest.requireActual('./m'), one: jest.fn() }));  // partial
jest.mock('virtual', () => ({}), { virtual: true });
jest.doMock / dontMock (not hoisted)  + jest.resetModules() + require()
jest.isolateModules(() => {}) / isolateModulesAsync
jest.requireActual / requireMock / createMockFromModule / unmock / deepUnmock / setMock
jest.unstable_mockModule('./m.js', () => ({...})); const m = await import('./m.js');  // ESM
jest.mocked(fn)                                         // TS typing
```

Factory may use: globals, `mock*` vars (lazily), pure-literal consts, `jest` from `@jest/globals`.
`__mocks__` next to module (needs `jest.mock`), next to `node_modules` (automatic; core modules need
`jest.mock`).

## 30.7 Fake timers

```js
jest.useFakeTimers({ now, doNotFake: [...], advanceTimers, timerLimit });
jest.advanceTimersByTime(ms) / runOnlyPendingTimers() / runAllTimers() / advanceTimersToNextTimer()
await jest.advanceTimersByTimeAsync(ms) / runAllTimersAsync() / runOnlyPendingTimersAsync()
jest.advanceTimersToNextFrame()   // rAF (30)
jest.setSystemTime(date); jest.now(); jest.getTimerCount(); jest.clearAllTimers(); jest.useRealTimers();
```

Promises are NOT faked → use Async variants when code awaits before/between timers.

## 30.8 Config essentials

```js
module.exports = {
  testEnvironment: 'node',               // 'jsdom' needs jest-environment-jsdom
  roots: ['<rootDir>/src'],
  setupFiles: [], setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  globalSetup: '', globalTeardown: '',
  transform: { '^.+\\.[mc]?[jt]sx?$': 'babel-jest' },
  transformIgnorePatterns: ['/node_modules/(?!(esm-pkg)/)'],
  moduleNameMapper: { '^@/(.*)$': '<rootDir>/src/$1', '\\.css$': 'identity-obj-proxy' },
  clearMocks: true, restoreMocks: true,
  collectCoverageFrom: ['src/**/*.{js,ts,tsx}'],
  coverageThreshold: { global: { branches: 80, lines: 85 } },
  testTimeout: 5000, maxWorkers: '50%', workerIdleMemoryLimit: '1GB',
  projects: [...], reporters: ['default', 'jest-junit'],
};
```

## 30.9 CLI essentials

```
jest path-regex   -t "name"   --watch / --watchAll   -o   --changedSince=origin/main
--findRelatedTests f.js   -u   --ci   --coverage   -i (runInBand)   -w 50%   --shard=1/4
--detectOpenHandles   --logHeapUsage   --showConfig   --clearCache   --listTests
--randomize --seed=n   --silent   --verbose   -e (expand)   --json --outputFile=r.json
--testPathPatterns (30; was --testPathPattern)   --passWithNoTests   --bail
```

## 30.10 React Testing Library

```js
const user = userEvent.setup();
render(<C />, { wrapper });
screen.getByRole('button', { name: /save/i })   // get: must exist; query: null; find: await
await user.click(el); await user.type(input, 'hi');
expect(await screen.findByText('Saved')).toBeInTheDocument();
await waitFor(() => expect(mock).toHaveBeenCalled());
within(dialog).getByRole(...); screen.debug();
const { result } = renderHook(() => useX()); act(() => result.current.inc());
```

Query priority: Role > LabelText > PlaceholderText > Text > DisplayValue > AltText > Title > TestId.

## 30.11 Debugging checklist

1. Run the one test (`path -t name`). 2. `--showConfig`. 3. `--clearCache`. 4. `-i` + debugger.
5. Passes alone? → pollution. 6. Timeout? → un-resolved promise / un-advanced fake timers / done.
7. "Did not exit"? → `--detectOpenHandles`, close handles. 8. Transform error? →
`transformIgnorePatterns` / transform regex / presets. 9. `document is not defined` → jsdom.
10. Mock ignored → path / hoisting / ESM / barrels.

---

## 30.12 Glossary

| Term | Meaning |
| --- | --- |
| **Act** (React) | Utility ensuring state updates/effects are applied before assertions |
| **Arrange-Act-Assert** | Test structure: setup, action, verification |
| **Assertion** | A check that throws on failure (`expect(...).toBe(...)`) |
| **Asymmetric matcher** | Placeholder inside expected values (`expect.any(String)`) |
| **Automock** | Mock generated by Jest from a module's shape |
| **Babel** | JS compiler used by `babel-jest` to transform code |
| **Barrel file** | `index.ts` re-exporting many modules; slows Jest and breaks spies |
| **Boundary value** | Input at an edge of a valid range (where bugs live) |
| **Characterization test** | Test recording current behaviour of legacy code |
| **CI** | Continuous Integration server running tests on each change |
| **circus** | `jest-circus`, Jest's default test runner/framework |
| **Code frame** | The source excerpt Jest prints with a failure |
| **Collection phase** | When Jest executes `describe` bodies to register tests |
| **Contract test** | Verifies two services agree on an API (Pact) |
| **Coverage** | Percent of statements/branches/functions/lines executed |
| **Custom matcher** | Matcher added via `expect.extend` |
| **Dependency injection** | Passing dependencies in, so tests can pass fakes |
| **Docblock** | `/** @jest-environment jsdom */` comment at file top |
| **Dummy** | Test double passed but never used |
| **E2E** | End-to-end test of the whole system |
| **Environment** | Global world for tests (`node`, `jsdom`, custom) |
| **ESM / CJS** | ECMAScript modules (`import`) / CommonJS (`require`) |
| **Fake** | Working lightweight implementation (in-memory DB) |
| **Fake timers** | Controllable replacements for timers and `Date` |
| **Fixture** | Prepared test data/setup |
| **Flaky test** | Non-deterministic test |
| **Global setup** | Code run once before all test files (`globalSetup`) |
| **Haste map** | Jest's cached index of project files and dependencies |
| **Hoisting** | Moving `jest.mock` calls above imports |
| **Hook** | `beforeAll/beforeEach/afterEach/afterAll` |
| **Inline snapshot** | Snapshot stored inside the test file |
| **Integration test** | Test of several units together |
| **jsdom** | JS implementation of browser DOM for Node |
| **Manual mock** | Hand-written mock in a `__mocks__` folder |
| **Matcher** | Method performing a check (`toEqual`) |
| **Mock** | Test double with programmed behaviour and verified interactions |
| **Module registry** | Per-file cache of loaded modules in `jest-runtime` |
| **MSW** | Mock Service Worker: network-level HTTP mocking |
| **Mutation testing** | Changing code to see if tests catch it (Stryker) |
| **Obsolete snapshot** | Stored snapshot with no matching test (fails run) |
| **Open handle** | Resource keeping Node alive (timer, socket) |
| **Preset** | Shareable base Jest config |
| **Property-based test** | Test of an invariant over generated inputs (fast-check) |
| **Regression test** | Test preventing a fixed bug from returning |
| **Reporter** | Module receiving and outputting results |
| **Runner** | What runs a test file (`jest-runner`, `jest-runner-eslint`) |
| **Sequencer** | Decides test file order & shards |
| **Shard** | A slice of the test files for parallel CI machines |
| **Snapshot** | Stored serialization compared on later runs |
| **Spy** | Wrapper recording calls to a real function (`jest.spyOn`) |
| **Stub** | Double returning canned answers |
| **SUT** | System under test |
| **TDD** | Red-green-refactor development cycle |
| **Test double** | Any stand-in for a real dependency |
| **Test pollution** | One test's leftover state affecting another |
| **Transformer** | Converts source before execution (babel-jest, ts-jest, @swc/jest) |
| **Watch mode** | Re-run tests on file changes |
| **Worker** | Child process (or thread) running test files in parallel |

---

🎉 **You've reached the end of the book.** Go back to the [table of contents](../README.md), pick the
chapters you're least sure about, and **run the examples yourself**. Typing and breaking tests is
the fastest way to make this knowledge stick.
