# Chapter 16 — Testing React (React Testing Library + Jest)

> 🧸 **Explain it like I'm 5**
>
> To test a toy, you **play with it the way a kid would**: press its buttons, read what's on its
> screen. You don't unscrew it to look at the gears. React Testing Library makes you test your
> components **like a user**: find things by what users see ("the button that says Add"), click
> and type, then check what appears on the screen.

---

## 16.1 The tools

| Package | Role |
| --- | --- |
| `jest` + `jest-environment-jsdom` | runner + fake browser DOM |
| `@testing-library/react` (RTL) | `render`, `screen`, queries, `renderHook`, `act`, `waitFor` |
| `@testing-library/dom` | the core queries (peer dependency of RTL v16) |
| `@testing-library/user-event` | realistic user interactions (typing, clicking, keyboard, clipboard) |
| `@testing-library/jest-dom` | DOM matchers (`toBeInTheDocument`, `toHaveTextContent`, …) |
| MSW (optional) | mock HTTP at the network layer |

```bash
npm i -D jest jest-environment-jsdom @testing-library/react @testing-library/dom \
  @testing-library/user-event @testing-library/jest-dom
```

```js
// jest.config.js
module.exports = {
  testEnvironment: 'jsdom',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  clearMocks: true,
  restoreMocks: true,
  moduleNameMapper: { '\\.(css|scss)$': 'identity-obj-proxy' },
};
```

```js
// jest.setup.js
import '@testing-library/jest-dom';
```

Versions verified for this chapter: React 19.3, RTL 16.3, user-event 14.6, jest-dom 7.0,
Jest 30.5, jsdom 26.

## 16.2 The guiding principle

> "The more your tests resemble the way your software is used, the more confidence they can give
> you." — Testing Library

So:
- ✅ Find elements by **role, label, text** (what users and screen readers perceive).
- ✅ Interact with **user-event**.
- ✅ Assert on **visible output** and **effects on the outside world** (API calls).
- ❌ Don't test internal state, private methods, component instances, or CSS class names (unless
  they are the behaviour, e.g. a theme class).
- ❌ Don't shallow render. Render real children; mock only the edges (network, heavy third-party
  widgets).

## 16.3 A complete, verified example

The component (simplified todo app with loading, error, validation, context):

```jsx
// TodoApp.jsx
import { useEffect, useState, createContext, useContext } from 'react';
import { fetchTodos, addTodo } from './api';

export const ThemeContext = createContext('light');

export function useCounter(initial = 0) {
  const [count, setCount] = useState(initial);
  return { count, increment: () => setCount((c) => c + 1) };
}

export function TodoApp() {
  const theme = useContext(ThemeContext);
  const [todos, setTodos] = useState(null);
  const [error, setError] = useState(null);
  const [title, setTitle] = useState('');

  useEffect(() => {
    fetchTodos().then(setTodos).catch((e) => setError(e.message));
  }, []);

  async function onSubmit(e) {
    e.preventDefault();
    if (!title.trim()) { setError('Title is required'); return; }
    const todo = await addTodo(title.trim());
    setTodos((t) => [...t, todo]);
    setTitle('');
    setError(null);
  }

  if (error && !todos) return <p role="alert">{error}</p>;
  if (!todos) return <p>Loading...</p>;

  return (
    <main className={theme}>
      <h1>Todos</h1>
      <form onSubmit={onSubmit}>
        <label htmlFor="title">New todo</label>
        <input id="title" value={title} onChange={(e) => setTitle(e.target.value)} />
        <button type="submit">Add</button>
      </form>
      {error && <p role="alert">{error}</p>}
      <ul aria-label="todo list">
        {todos.map((t) => <li key={t.id}>{t.title}</li>)}
      </ul>
    </main>
  );
}
```

The tests (all 7 pass on the versions above with `clearMocks: true`):

```jsx
// TodoApp.test.jsx
import { render, screen, within, renderHook, act, waitForElementToBeRemoved } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TodoApp, ThemeContext, useCounter } from './TodoApp';
import { fetchTodos, addTodo } from './api';

jest.mock('./api');

function renderWithTheme(ui, { theme = 'light' } = {}) {
  return render(<ThemeContext.Provider value={theme}>{ui}</ThemeContext.Provider>);
}

beforeEach(() => {
  jest.mocked(fetchTodos).mockResolvedValue([{ id: 1, title: 'Buy milk' }]);
  jest.mocked(addTodo).mockImplementation(async (title) => ({ id: 2, title }));
});

test('shows loading then todos', async () => {
  renderWithTheme(<TodoApp />);
  expect(screen.getByText(/loading/i)).toBeInTheDocument();

  const list = await screen.findByRole('list', { name: /todo list/i });
  expect(within(list).getAllByRole('listitem')).toHaveLength(1);
  expect(screen.queryByText(/loading/i)).not.toBeInTheDocument();
});

test('adds a todo', async () => {
  const user = userEvent.setup();
  renderWithTheme(<TodoApp />, { theme: 'dark' });
  await screen.findByText('Buy milk');

  await user.type(screen.getByLabelText(/new todo/i), '  Walk dog ');
  await user.click(screen.getByRole('button', { name: /add/i }));

  expect(await screen.findByText('Walk dog')).toBeInTheDocument();
  expect(addTodo).toHaveBeenCalledWith('Walk dog');
  expect(screen.getByLabelText(/new todo/i)).toHaveValue('');
  expect(screen.getByRole('main')).toHaveClass('dark');
});

test('validation error', async () => {
  const user = userEvent.setup();
  renderWithTheme(<TodoApp />);
  await screen.findByText('Buy milk');

  await user.click(screen.getByRole('button', { name: /add/i }));

  expect(screen.getByRole('alert')).toHaveTextContent('Title is required');
  expect(addTodo).not.toHaveBeenCalled();
});

test('load error', async () => {
  jest.mocked(fetchTodos).mockRejectedValueOnce(new Error('Server down'));
  renderWithTheme(<TodoApp />);
  expect(await screen.findByRole('alert')).toHaveTextContent('Server down');
});

test('waits for loading to disappear', async () => {
  renderWithTheme(<TodoApp />);
  await waitForElementToBeRemoved(() => screen.queryByText(/loading/i));
});

test('custom hook', () => {
  const { result } = renderHook(() => useCounter(5));
  act(() => result.current.increment());
  expect(result.current.count).toBe(6);
});
```

### 💡 A real bug this example caught

Running the same file **without** `clearMocks: true` fails the "validation error" test (verified):

```
expect(jest.fn()).not.toHaveBeenCalled()
Expected number of calls: 0
Received number of calls: 1
1: "Walk dog"
```

The call came from the **previous** test ("adds a todo"). Mock call history leaks between tests in
the same file unless it's cleared. That's why `clearMocks: true` is in the recommended config.

## 16.4 Queries — the complete picture (🎯)

### Query types

| Type | 0 matches | 1 match | >1 matches | Async? | Use for |
| --- | --- | --- | --- | --- | --- |
| `getBy*` | **throws** | returns element | throws | no | element that must be there now |
| `queryBy*` | returns `null` | returns element | throws | no | asserting something is **absent** |
| `findBy*` | rejects (after timeout, default 1000ms) | resolves element | rejects | **yes** (returns promise) | element that will **appear** |
| `getAllBy*` | throws | array | array | no | |
| `queryAllBy*` | `[]` | array | array | no | |
| `findAllBy*` | rejects | array | array | yes | |

### Query priority (official recommendation)

1. **Accessible to everyone:**
   `getByRole` (with `{ name }`) → `getByLabelText` → `getByPlaceholderText` → `getByText` →
   `getByDisplayValue`
2. **Semantic:** `getByAltText`, `getByTitle`
3. **Last resort:** `getByTestId` (`data-testid="..."`)

`getByRole` is king: it checks accessibility for free (a button without an accessible name won't be
found by `getByRole('button', { name: /save/i })`).

Common roles: `button`, `link`, `heading` (with `{ level: 2 }`), `textbox`, `checkbox`, `radio`,
`combobox` (select), `listbox`, `option`, `list`, `listitem`, `dialog`, `alert`, `status`,
`navigation`, `main`, `table`, `row`, `cell`, `tab`, `tabpanel`, `img`, `progressbar`.

Options: `name`, `level`, `checked`, `selected`, `expanded`, `pressed`, `hidden: true` (include
hidden elements), `description`.

Text matching: string (exact, whole text, trimmed & whitespace-collapsed by default), regex (`/save/i`),
or a function `(content, element) => boolean`. `{ exact: false }` for substring, case-insensitive.

### `screen` vs destructuring `render()`

```js
render(<App />);
screen.getByRole('button');                   // ✅ recommended
const { getByRole } = render(<App />);        // works, older style
```

### `within` — scope queries

```js
const dialog = screen.getByRole('dialog');
within(dialog).getByRole('button', { name: /confirm/i });
```

### Debugging queries

```js
screen.debug();                     // pretty-print the DOM (truncated at 7000 chars by default)
screen.debug(screen.getByRole('form'));
screen.logTestingPlaygroundURL();   // link to testing-playground.com with your DOM
import { logRoles } from '@testing-library/dom';
logRoles(container);                // list roles and names found
```

When `getBy*` fails, the error prints the current DOM — read it! (Verified message:
`Unable to find an element with the text: nope. This could be because the text is broken up by
multiple elements...`)

## 16.5 user-event vs fireEvent

```js
const user = userEvent.setup();                 // create once per test, before render
await user.click(button);
await user.type(input, 'hello{enter}');
await user.clear(input);
await user.selectOptions(select, 'blue');
await user.keyboard('{Shift>}A{/Shift}');
await user.tab();
await user.hover(el); await user.unhover(el);
await user.upload(fileInput, new File(['x'], 'a.png', { type: 'image/png' }));
await user.paste('text');
```

- **user-event** simulates the full sequence a real user causes (pointer down/up, focus, keydown,
  input, change, click…) and respects disabled elements, `pointer-events: none`, etc.
- **`fireEvent`** dispatches a single DOM event (`fireEvent.click(el)`). Use it only when user-event
  can't express something (e.g. a custom event, `scroll`).
- user-event v14 APIs are **async** — always `await`.

## 16.6 Async UI — `findBy`, `waitFor`, `waitForElementToBeRemoved`

```js
expect(await screen.findByText('Saved')).toBeInTheDocument();

await waitFor(() => {
  expect(mockSave).toHaveBeenCalledTimes(1);
});

await waitForElementToBeRemoved(() => screen.queryByRole('progressbar'));
```

`waitFor(callback, { timeout = 1000, interval = 50 })` re-runs the callback until it stops throwing.
Rules:
- ✅ Put **one assertion** in `waitFor`; do side effects (clicks) **outside**.
- ❌ Don't use `waitFor` with `getBy` just to wait for an element — use `findBy`.
- ❌ Don't wrap everything in `waitFor` "to be safe".
- ❌ `await waitFor(() => {})` with an empty callback is a code smell.

## 16.7 `act()` and the famous warning

React batches state updates. `act()` makes sure all updates/effects triggered inside it are applied
before you assert. RTL's `render`, `fireEvent`, user-event, `waitFor` and `findBy*` already wrap in
`act` for you.

You'll see:

```
Warning: An update to TodoApp inside a test was not wrapped in act(...).
```

when a state update happens **outside** RTL's helpers, typically:
1. An async operation finished **after the test's last assertion** (e.g. a fetch resolved after the
   test ended). Fix: `await` the UI result (`await screen.findBy...`) so the update happens inside
   the test.
2. You advanced fake timers manually → wrap in `act(() => jest.advanceTimersByTime(1000))`.
3. You called a hook's function from `renderHook` → wrap in `act`.

❌ Don't silence the warning; it usually means a test isn't waiting for something.

## 16.8 Custom render with providers (💼 every real app needs this)

```jsx
// test/test-utils.jsx
import { render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { Provider } from 'react-redux';
import { setupStore } from '../src/store';

export function renderWithProviders(
  ui,
  { route = '/', preloadedState, store = setupStore(preloadedState), ...options } = {},
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },   // ⚠️ retries make error tests slow/flaky
  });

  function Wrapper({ children }) {
    return (
      <Provider store={store}>
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={[route]}>{children}</MemoryRouter>
        </QueryClientProvider>
      </Provider>
    );
  }

  return { store, ...render(ui, { wrapper: Wrapper, ...options }) };
}

export * from '@testing-library/react';
```

Rules:
- Create a **new store / QueryClient per test** — sharing them leaks state between tests.
- Disable query retries in tests.
- Prefer real Redux store with preloaded state over mocking `useSelector`.

## 16.9 Testing common scenarios

### Forms with validation

```js
test('shows email error', async () => {
  const user = userEvent.setup();
  render(<SignupForm onSubmit={jest.fn()} />);
  await user.type(screen.getByLabelText(/email/i), 'not-an-email');
  await user.click(screen.getByRole('button', { name: /sign up/i }));
  expect(await screen.findByText(/valid email/i)).toBeInTheDocument();
});

test('submits valid data', async () => {
  const user = userEvent.setup();
  const onSubmit = jest.fn();
  render(<SignupForm onSubmit={onSubmit} />);
  await user.type(screen.getByLabelText(/email/i), 'ann@example.com');
  await user.type(screen.getByLabelText(/password/i), 'S3cret!!');
  await user.click(screen.getByRole('button', { name: /sign up/i }));
  await waitFor(() =>
    expect(onSubmit).toHaveBeenCalledWith({ email: 'ann@example.com', password: 'S3cret!!' }),
  );
});
```

### Routing (React Router)

```js
test('navigates to details', async () => {
  const user = userEvent.setup();
  render(
    <MemoryRouter initialEntries={['/products']}>
      <Routes>
        <Route path="/products" element={<ProductList />} />
        <Route path="/products/:id" element={<ProductDetails />} />
      </Routes>
    </MemoryRouter>,
  );
  await user.click(await screen.findByRole('link', { name: /red shoes/i }));
  expect(await screen.findByRole('heading', { name: /red shoes/i })).toBeInTheDocument();
});
```

### Modals / portals

Portals render into `document.body`; `screen` queries the whole body, so they're found normally:
`screen.getByRole('dialog')`.

### Redux

Test **components with a real store** (integration) and **reducers/selectors** as pure functions:

```js
test('reducer adds item', () => {
  const state = cartReducer(undefined, addItem({ id: 1, price: 5 }));
  expect(state.items).toHaveLength(1);
});
```

### Custom hooks

```js
import { renderHook, act, waitFor } from '@testing-library/react';

test('useFetch loads data', async () => {
  const { result } = renderHook(() => useFetch('/api/user'), { wrapper: Providers });
  await waitFor(() => expect(result.current.status).toBe('success'));
  expect(result.current.data).toEqual({ id: 1 });
});

test('rerender with new props', () => {
  const { result, rerender } = renderHook(({ n }) => useDouble(n), { initialProps: { n: 2 } });
  expect(result.current).toBe(4);
  rerender({ n: 5 });
  expect(result.current).toBe(10);
});
```

(`renderHook` lives in `@testing-library/react` since v13.1; the separate
`@testing-library/react-hooks` package is deprecated for React 18+.)

### Error boundaries

```js
test('shows fallback when child throws', () => {
  jest.spyOn(console, 'error').mockImplementation(() => {}); // React logs caught errors
  const Bomb = () => { throw new Error('boom'); };
  render(<ErrorBoundary fallback={<p>Something went wrong</p>}><Bomb /></ErrorBoundary>);
  expect(screen.getByText(/something went wrong/i)).toBeInTheDocument();
});
```

### Mocking heavy child components

```js
jest.mock('./Chart', () => ({
  __esModule: true,
  default: (props) => <div data-testid="chart" data-points={props.data.length} />,
}));
```

Only for heavy or browser-incompatible components (canvas, maps, rich editors).

### Accessibility checks

```js
import { axe, toHaveNoViolations } from 'jest-axe';
expect.extend(toHaveNoViolations);

test('is accessible', async () => {
  const { container } = render(<LoginForm />);
  expect(await axe(container)).toHaveNoViolations();
});
```

## 16.10 Mocking HTTP with MSW (in React tests)

See Chapter 9 §9.9 for the server setup. In jsdom, MSW (v2 and v3) needs Fetch API globals that
jsdom doesn't provide; use the environment the MSW docs recommend (e.g. `jest-fixed-jsdom`) or
polyfills. MSW 3 requires Node ≥ 22.12.

```js
test('shows server error', async () => {
  server.use(http.get('/api/todos', () => HttpResponse.json({ message: 'down' }, { status: 500 })));
  render(<TodoApp />);
  expect(await screen.findByRole('alert')).toHaveTextContent(/down|error/i);
});
```

## 16.11 Anti-patterns (from Kent C. Dodds' "Common mistakes with RTL", plus experience)

| ❌ Don't | ✅ Do |
| --- | --- |
| `container.querySelector('.btn')` | `screen.getByRole('button', { name })` |
| `expect(queryByX).toBeNull()` style for presence | `toBeInTheDocument()` / `not.toBeInTheDocument()` |
| `getByTestId` everywhere | roles/labels first |
| `fireEvent` for user flows | `userEvent.setup()` + `await` |
| wrapping RTL calls in `act` | RTL already does it |
| `waitFor(() => getByX)` | `findByX` |
| side effects inside `waitFor` | only assertions inside |
| `cleanup()` in afterEach manually | RTL auto-cleans when globals `afterEach` exists |
| snapshotting whole pages | specific assertions; small inline snapshots |
| testing state values / instance methods | test what the user sees |
| one giant test per component | one behaviour per test |

## 16.12 Enzyme (legacy)

Many older codebases use **Enzyme** (`shallow`, `mount`, `wrapper.find`, `wrapper.state()`). Enzyme
never officially supported React 17+ (only unofficial adapters), so it doesn't work with React 18/19.
Migrating means rewriting tests in RTL style. Strategy: new tests in RTL; migrate Enzyme tests
when touching those components; delete tests that only check implementation details.

## 16.13 Summary

- jsdom + RTL + user-event + jest-dom is the standard React stack.
- Query by role/label/text; `get` (present), `query` (absent), `find` (appears later).
- `await` user-event and `findBy`; one assertion per `waitFor`.
- `act` warnings mean something updated after your test stopped waiting.
- Custom render with fresh providers per test; `clearMocks` to avoid leaked mock calls.

**Next:** [Chapter 17 — Testing React Native](17-testing-react-native.md)
