# Chapter 17 — Testing React Native

> 🧸 **Explain it like I'm 5**
>
> A phone app normally runs on a phone. Jest runs on a computer, which has no phone screen, camera
> or buttons. So the React Native **preset** gives Jest a **pretend phone**: pretend buttons,
> pretend text boxes, pretend native modules. Your components think they're on a phone, and you
> can poke them and read what they show.

This chapter uses **this repository** (`TodoApp`, React Native 0.82.1, React 19.1) as the example.
Everything here was run against a copy of this repo: the existing test, new Testing Library tests,
and an upgrade to Jest 30.5.2.

---

## 17.1 What the `react-native` preset does

`jest.config.js` in this repo:

```js
module.exports = {
  preset: 'react-native',
};
```

`preset: 'react-native'` loads `node_modules/react-native/jest-preset.js`. For RN 0.82.1 it is
(copied from the package):

```js
module.exports = {
  haste: {
    defaultPlatform: 'ios',
    platforms: ['android', 'ios', 'native'],
  },
  resolver: require.resolve('./jest/resolver.js'),
  transform: {
    '^.+\\.(js|ts|tsx)$': 'babel-jest',
    '^.+\\.(bmp|gif|jpg|jpeg|mp4|png|psd|svg|webp)$': require.resolve('./jest/assetFileTransformer.js'),
  },
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?)/)',
  ],
  setupFiles: [require.resolve('./jest/setup.js')],
  testEnvironment: require.resolve('./jest/react-native-env.js'),
};
```

Line by line:

| Setting | Why |
| --- | --- |
| `haste.defaultPlatform: 'ios'`, `platforms` | resolves `Button.ios.js` / `Button.android.js` / `.native.js` like Metro does. Tests run as **iOS by default** — `Platform.OS === 'ios'` |
| `resolver` | RN-specific module resolution |
| `transform` with `babel-jest` | uses this repo's `babel.config.js` → `module:@react-native/babel-preset` (Flow, TS, JSX, ESM→CJS) |
| asset transformer | `require('./logo.png')` returns a stub object instead of crashing |
| `transformIgnorePatterns` | RN and `@react-native/*` packages ship untranspiled source (Flow/ESM) → they **must** be transformed; everything else in node_modules is not |
| `setupFiles: jest/setup.js` | defines globals like `__DEV__`, `requestAnimationFrame`, and mocks native-backed modules. In RN 0.82 that list is `AppState`, `NativeModules`, `Clipboard`, `ScrollView`, `TextInput`, `View`, `Image`, `Linking`, `Modal`, `UIManager`, `Text`, `useColorScheme`, `Vibration`, `NativeExceptionsManager`, `InitializeCore`, `RendererProxy` |
| `testEnvironment: react-native-env.js` | a Node-based environment with RN-specific export conditions (not jsdom — there is no DOM in RN) |

## 17.2 The existing test — line by line

```tsx
/**
 * @format
 */

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import App from '../App';

test('renders correctly', async () => {
  await ReactTestRenderer.act(() => {
    ReactTestRenderer.create(<App />);
  });
});
```

- `@format` — a Prettier pragma, not a Jest thing.
- `ReactTestRenderer.create(<App />)` renders the component tree into an in-memory tree (no screen).
- `act()` flushes effects and state updates.
- There are **no assertions**: this is a **smoke test** — it passes as long as rendering doesn't
  throw. Useful, but it can't catch "the Add button does nothing".

📌 **`react-test-renderer` is deprecated as of React 19.** It still works here, but React will not
improve it, and the React Native docs and Jest's RN tutorial now point to
**React Native Testing Library (RNTL)**.

## 17.3 React Native Testing Library (RNTL)

Current major: **v14** (verified 14.1.0). It:
- requires React ≥ 19 and React Native ≥ 0.78,
- uses the new **`test-renderer`** package as a peer dependency (replacement for
  `react-test-renderer`),
- makes `render`, `fireEvent`, etc. **async** (v14 migration: "Drops React 18, async APIs by
  default"),
- ships Jest matchers that are available automatically once you import anything from the package.

(Older projects: RNTL v12.4–v13 use `react-test-renderer`, have a sync `render`, and needed
`@testing-library/react-native/extend-expect` for matchers in some versions. Check which version a
project uses before copying examples.)

Install (in this repo):

```bash
npm i -D @testing-library/react-native test-renderer
```

### Tests for this repo's `App.tsx` (all pass — verified with Jest 29.7 and Jest 30.5.2)

```tsx
// __tests__/App.rntl.test.tsx
import React from 'react';
import { render, screen, userEvent, fireEvent } from '@testing-library/react-native';
import App from '../App';

describe('App (todo list)', () => {
  test('shows the title and an empty input', async () => {
    await render(<App />);
    expect(screen.getByText('My To-Do App ✅')).toBeOnTheScreen();
    expect(screen.getByPlaceholderText('Enter a task')).toHaveDisplayValue('');
  });

  test('adds a task and clears the input', async () => {
    const user = userEvent.setup();
    await render(<App />);
    const input = screen.getByPlaceholderText('Enter a task');

    await user.type(input, 'Buy milk');
    await user.press(screen.getByRole('button', { name: 'Add Task' }));

    expect(screen.getByText('Buy milk')).toBeOnTheScreen();
    expect(input).toHaveDisplayValue('');
  });

  test('ignores blank tasks', async () => {
    const user = userEvent.setup();
    await render(<App />);
    await user.type(screen.getByPlaceholderText('Enter a task'), '   ');
    await user.press(screen.getByRole('button', { name: 'Add Task' }));
    expect(screen.queryByText('   ')).not.toBeOnTheScreen();
  });

  test('adds several tasks in order (fireEvent)', async () => {
    const dateSpy = jest.spyOn(Date, 'now');
    dateSpy.mockReturnValueOnce(1).mockReturnValueOnce(2);   // App uses Date.now() as the id
    await render(<App />);
    const input = screen.getByPlaceholderText('Enter a task');

    await fireEvent.changeText(input, 'First');
    await fireEvent.press(screen.getByText('Add Task'));
    await fireEvent.changeText(input, 'Second');
    await fireEvent.press(screen.getByText('Add Task'));

    const titles = screen.getAllByText(/First|Second/).map((n) => n.props.children);
    expect(titles).toEqual(['First', 'Second']);
    dateSpy.mockRestore();
  });
});
```

Output:

```
PASS __tests__/App.rntl.test.tsx
  App (todo list)
    ✓ shows the title and an empty input
    ✓ adds a task and clears the input
    ✓ ignores blank tasks
    ✓ adds several tasks in order (fireEvent)
```

### 🐞 A real bug found while writing these tests

`App.tsx` uses `id: Date.now().toString()`. Two tasks added within the same millisecond get the
**same id**, which becomes a duplicate `FlatList` key. Reproduced in a test by mocking `Date.now` to
a constant: React logs `Encountered two children with the same key`. That's why the last test above
mocks distinct values. The real fix is a unique id (counter, `crypto.randomUUID()`, etc.). This is a
good example of tests exposing hidden assumptions (here, "time always moves forward between
clicks").

### RNTL API cheat-sheet

| Need | API |
| --- | --- |
| render | `await render(<C />, { wrapper })` |
| queries | `getByRole`, `getByText`, `getByLabelText` (accessibilityLabel / `aria-label`), `getByPlaceholderText`, `getByDisplayValue`, `getByTestId`, `getByHintText` + `query*`, `find*`, `*All*` |
| interactions (realistic) | `userEvent.setup()` → `await user.press()`, `user.longPress()`, `user.type()`, `user.clear()`, `user.paste()`, `user.scrollTo()` |
| raw events | `await fireEvent.press(el)`, `fireEvent.changeText(el, 'x')`, `fireEvent.scroll(el, eventData)`, `fireEvent(el, 'onCustom', data)` |
| async | `await screen.findByText(...)`, `waitFor`, `waitForElementToBeRemoved` |
| hooks | `renderHook` |
| matchers | `toBeOnTheScreen`, `toHaveTextContent`, `toHaveDisplayValue`, `toBeVisible`, `toBeDisabled`/`toBeEnabled`, `toBeSelected`, `toBeChecked`, `toBeExpanded`, `toHaveAccessibilityValue`, `toHaveAccessibleName`, `toHaveProp`, `toHaveStyle`, `toBeEmptyElement`, `toContainElement` |
| debugging | `screen.debug()` |

Roles in RN come from `accessibilityRole` / `role` props; the built-in `Button` exposes role
`button` with its title as the accessible name (that's why
`getByRole('button', { name: 'Add Task' })` works above).

## 17.4 Mocking native modules & libraries (💼 the daily RN testing work)

Native code doesn't exist in Jest, so any library with native parts needs a mock. Many ship one:

| Library | Mock |
| --- | --- |
| `@react-native-async-storage/async-storage` | `jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'))` |
| `react-native-safe-area-context` (used by this repo) | ships `react-native-safe-area-context/jest/mock` → `jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default)` (check the library's README for the current path) |
| `react-native-reanimated` | follow the library's testing docs (`setUpTests()` / its Jest mock) |
| `react-native-gesture-handler` | `import 'react-native-gesture-handler/jestSetup';` in setup |
| `@react-navigation/*` | render inside a real `NavigationContainer`; mock only native pieces |
| Your own native module | `jest.mock('react-native', ...)` is fragile → instead wrap `NativeModules.MyModule` in a JS module and mock that |

Put shared mocks in a setup file:

```js
// jest.config.js
module.exports = {
  preset: 'react-native',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?|@react-navigation|react-native-safe-area-context)/)',
  ],
};
```

⚠️ When you **override** `transformIgnorePatterns`, you replace the preset's pattern — include
`react-native` and `@react-native` again, plus every untranspiled RN library you add.

### Platform-specific behaviour

```js
import { Platform } from 'react-native';

test('android-specific text', () => {
  jest.replaceProperty(Platform, 'OS', 'android');   // restored by restoreMocks
  // ...
});
```

Or configure `haste.defaultPlatform: 'android'` in a second Jest project to run the whole suite for
Android.

### Animations & timers

RN animations use timers/rAF. Use fake timers and advance them; with RNTL's userEvent pass
`advanceTimers`:

```js
jest.useFakeTimers();
const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
```

## 17.5 Common RN + Jest errors

| Error | Fix |
| --- | --- |
| `SyntaxError: Cannot use import statement outside a module` / `Unexpected token 'export'` in a `node_modules/react-native-xyz` file | add `react-native-xyz` to the `transformIgnorePatterns` allow-list |
| `Invariant Violation: TurboModuleRegistry.getEnforcing(...): 'X' could not be found` / `NativeModule: AsyncStorage is null` | the library's native module isn't mocked → add its Jest mock |
| `Unable to resolve module ... from ...` with platform files | check `haste.platforms`; file naming `.ios.tsx`/`.android.tsx` |
| Images break | the preset's asset transformer handles common types; add others to `moduleNameMapper` |
| Tests pass on Jest 29 but break after upgrading | run `npx jest --clearCache`; check removed matcher aliases (`toBeCalled` …) and `@types/jest` version |
| `act(...)` warnings | `await` RNTL APIs (v14 is async), wait with `findBy*` |

## 17.6 Upgrading this repo to Jest 30 (verified)

In a copy of this repository:

```bash
npm i -D jest@30 babel-jest@30
npx jest
```

Result with Jest **30.5.2**: both the existing `react-test-renderer` smoke test and the new RNTL
tests pass (5 tests, 2 suites). Remaining steps for the real upgrade:
1. Replace `@types/jest@^29` with types matching Jest 30, or import from `@jest/globals`.
2. Search for removed alias matchers (`toBeCalled`, `toBeCalledWith`, `toThrowError`, …) — none in
   this repo today.
3. Run with `--ci` and update snapshots if any (header link changes).

(Full upgrade guide: Chapter 25.)

## 17.7 What else to test in an RN app

| Layer | Tool |
| --- | --- |
| Pure logic (reducers, formatters, validators) | plain Jest |
| Hooks | RNTL `renderHook` |
| Screens & components | RNTL |
| Navigation flows | RNTL with real `NavigationContainer` |
| API layer | Jest + mocked `fetch` or MSW (`msw/native` exists for RN runtime; in Jest use `msw/node`) |
| Real device E2E | **Detox** (can use Jest as its runner) or **Maestro**/Appium |

## 17.8 Summary

- `preset: 'react-native'` = platform-aware resolution, RN source transformation, native mocks, a
  Node-based environment.
- Replace assertion-less `react-test-renderer` smoke tests with RNTL behaviour tests.
- RNTL v14: `await render`, `userEvent.setup()`, `test-renderer` peer, built-in matchers.
- Mock native modules; extend (don't replace) `transformIgnorePatterns`.
- This repo works on Jest 30.5.2 as-is.

**Next:** [Chapter 18 — Testing Node.js back ends](18-testing-node-backend.md)
