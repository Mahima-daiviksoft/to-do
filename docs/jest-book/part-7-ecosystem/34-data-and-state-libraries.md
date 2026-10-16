# Chapter 34 — Data & State Libraries: Redux Toolkit, RTK Query, TanStack Query, Apollo, Zustand

> 🧸 **Explain it like I'm 5**
>
> State libraries are the app's **memory box**; data libraries are the app's **delivery service**.
> To test them you either use a **fresh, real memory box** for every test, or you **pretend to be
> the delivery truck** (mock the network) so the app gets exactly the packages you choose.

All examples verified (October 2026, Jest 30.5.2, React 19.3, jsdom): Redux Toolkit 2.13,
TanStack Query 5.104, Apollo Client 4.3, Zustand 5.0 (8 tests) and RTK Query (2 tests).

The universal rules:
1. **Fresh instance per test** (store, QueryClient, ApolloClient/MockedProvider, Zustand state).
2. **Prefer real libraries** with mocked network/data over mocking the library's hooks.
3. **Disable retries** and caching surprises in tests.

---

## 34.1 Redux Toolkit

```js
import { configureStore, createSlice } from '@reduxjs/toolkit';
import { Provider, useSelector, useDispatch } from 'react-redux';

const cartSlice = createSlice({
  name: 'cart',
  initialState: { items: [] },
  reducers: {
    addItem: (s, a) => { s.items.push(a.payload); },
    clear: (s) => { s.items = []; },
  },
});
const selectCount = (state) => state.cart.items.length;

function makeStore(preloadedState) {
  return configureStore({ reducer: { cart: cartSlice.reducer }, preloadedState });
}

function CartButton() {
  const count = useSelector(selectCount);
  const dispatch = useDispatch();
  return <button onClick={() => dispatch(cartSlice.actions.addItem({ id: count + 1 }))}>Cart ({count})</button>;
}
```

Two kinds of tests:

```js
// 1. Reducers/selectors are pure functions — fastest, no React
test('reducer', () => {
  const s1 = cartSlice.reducer(undefined, cartSlice.actions.addItem({ id: 1 }));
  expect(s1.items).toEqual([{ id: 1 }]);
  expect(cartSlice.reducer(s1, cartSlice.actions.clear())).toEqual({ items: [] });
});

// 2. Components with a REAL store (integration) — the Redux team's recommended approach
test('component', async () => {
  const user = userEvent.setup();
  const store = makeStore({ cart: { items: [{ id: 1 }] } });
  render(<Provider store={store}><CartButton /></Provider>);
  await user.click(screen.getByRole('button', { name: 'Cart (1)' }));
  expect(screen.getByRole('button', { name: 'Cart (2)' })).toBeInTheDocument();
  expect(selectCount(store.getState())).toBe(2);
});
```

❌ Avoid mocking `useSelector`/`useDispatch` — you'd test your mocks, not your app. Thunks
(`createAsyncThunk`): dispatch on a real store with the network mocked, then assert state.

## 34.2 RTK Query (verified in the node environment)

```js
/** @jest-environment node */
import { configureStore } from '@reduxjs/toolkit';
import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query';

const api = createApi({
  baseQuery: fetchBaseQuery({ baseUrl: 'https://api.example.com' }),
  endpoints: (b) => ({ getUser: b.query({ query: (id) => `/users/${id}` }) }),
});

const makeStore = () =>
  configureStore({
    reducer: { [api.reducerPath]: api.reducer },
    middleware: (gDM) => gDM().concat(api.middleware),
  });

afterEach(() => jest.restoreAllMocks());

test('endpoint with mocked fetch', async () => {
  const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue(
    new Response(JSON.stringify({ id: 1, name: 'Ann' }), { status: 200, headers: { 'content-type': 'application/json' } }),
  );
  const store = makeStore();
  const result = await store.dispatch(api.endpoints.getUser.initiate(1));
  expect(result.data).toEqual({ id: 1, name: 'Ann' });
  expect(fetchSpy.mock.calls[0][0].url).toBe('https://api.example.com/users/1'); // a Request object
  store.dispatch(api.util.resetApiState());
});

test('error shape', async () => {
  jest.spyOn(global, 'fetch').mockResolvedValue(
    new Response('{"message":"nope"}', { status: 404, headers: { 'content-type': 'application/json' } }),
  );
  const result = await makeStore().dispatch(api.endpoints.getUser.initiate(9));
  expect(result.error).toEqual({ status: 404, data: { message: 'nope' } });
});
```

Notes:
- `fetchBaseQuery` calls the global `fetch` at request time, so spying on `global.fetch` works. It
  passes a **`Request` object** (assert on `.url`, `.method`), not a URL string.
- In **component tests (jsdom)** there's no `fetch`/`Response` (Chapter 9 §9.10): use MSW with a
  fetch-capable environment, or pass `fetchFn` to `fetchBaseQuery` in tests.
- Reset API state between tests (`api.util.resetApiState()`) or create a new store per test (cache!).

## 34.3 TanStack Query (React Query)

```js
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';

function useTodos(fetcher) {
  return useQuery({ queryKey: ['todos'], queryFn: fetcher });
}

function createWrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } }); // fresh + no retries
  return ({ children }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

test('success', async () => {
  const fetcher = jest.fn().mockResolvedValue([{ id: 1 }]);
  const { result } = renderHook(() => useTodos(fetcher), { wrapper: createWrapper() });
  await waitFor(() => expect(result.current.isSuccess).toBe(true));
  expect(result.current.data).toEqual([{ id: 1 }]);
});

test('error without retries', async () => {
  const fetcher = jest.fn().mockRejectedValue(new Error('500'));
  const { result } = renderHook(() => useTodos(fetcher), { wrapper: createWrapper() });
  await waitFor(() => expect(result.current.isError).toBe(true));
  expect(result.current.error.message).toBe('500');
  expect(fetcher).toHaveBeenCalledTimes(1);           // retries disabled
});
```

Why `retry: false`: the default retries 3 times with exponential backoff → error tests take seconds
or time out. Why a new client per test: the cache would leak data between tests.
Other tips: `gcTime: Infinity` avoids "Jest did not exit" from garbage-collection timers in some
setups; use `queryClient.setQueryData` to seed cache; for mutations assert `onSuccess` effects via
the UI.

## 34.4 Apollo Client 4 — `MockedProvider` (verified)

📌 Apollo Client 4 moved React APIs: `useQuery` from **`@apollo/client/react`**, and
`MockedProvider` from **`@apollo/client/testing/react`**.

```jsx
import { gql } from '@apollo/client';
import { useQuery } from '@apollo/client/react';
import { MockedProvider } from '@apollo/client/testing/react';

const GET_DOG = gql`query GetDog($name: String!) { dog(name: $name) { id name breed } }`;

function Dog({ name }) {
  const { loading, error, data } = useQuery(GET_DOG, { variables: { name } });
  if (loading) return <p>Loading...</p>;
  if (error) return <p role="alert">{error.message}</p>;
  return <p>{data.dog.name} is a {data.dog.breed}</p>;
}

test('renders data', async () => {
  const mocks = [{
    request: { query: GET_DOG, variables: { name: 'Buck' } },
    result: { data: { dog: { __typename: 'Dog', id: '1', name: 'Buck', breed: 'bulldog' } } },
  }];
  render(<MockedProvider mocks={mocks}><Dog name="Buck" /></MockedProvider>);
  expect(screen.getByText('Loading...')).toBeInTheDocument();
  expect(await screen.findByText('Buck is a bulldog')).toBeInTheDocument();
});

test('renders errors', async () => {
  const mocks = [{ request: { query: GET_DOG, variables: { name: 'Buck' } }, error: new Error('Network down') }];
  render(<MockedProvider mocks={mocks}><Dog name="Buck" /></MockedProvider>);
  expect(await screen.findByRole('alert')).toHaveTextContent('Network down');
});
```

Gotchas:
- The mock's `query` **and** `variables` must match exactly, or you get "No more mocked responses
  for the query" errors.
- Include `__typename` in mock data (the cache adds/expects it).
- Each mock is consumed once; repeat it (or set `maxUsageCount`) for refetches.
- GraphQL errors: `result: { errors: [{ message: '...' }] }`.
- Alternative: MSW's `graphql.query('GetDog', ...)` handlers → real ApolloClient, real cache.

## 34.5 Zustand

```js
import { create } from 'zustand';

const useBear = create((set) => ({ bears: 0, add: () => set((s) => ({ bears: s.bears + 1 })) }));

const initial = useBear.getState();
beforeEach(() => useBear.setState(initial, true));    // replace = true → full reset

test('actions', () => {
  act(() => useBear.getState().add());
  expect(useBear.getState().bears).toBe(1);
});

test('state is reset between tests', () => {
  expect(useBear.getState().bears).toBe(0);
});
```

Zustand stores are **module singletons** → state leaks between tests unless reset (the Zustand docs
also show a `__mocks__/zustand` manual mock that resets every store automatically after each test).

## 34.6 Other libraries — same principles

| Library | Approach |
| --- | --- |
| Pinia (Vue) | `@pinia/testing` `createTestingPinia({ createSpy: jest.fn })` (Chapter 31) |
| MobX | create a fresh store instance per test; components wrapped in `observer` re-render automatically |
| Jotai | wrap in a fresh `<Provider>` per test; `useHydrateAtoms` to seed |
| Recoil (archived) | `RecoilRoot` with `initializeState` |
| SWR | `<SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>` for a fresh cache |
| XState | test the machine with `createActor(machine).start()`, send events, assert snapshots of state |
| Axios clients | MSW or mock the client module (Chapter 8 §8.9) |

## 34.7 Summary

- Fresh store/client per test; disable retries; reset singleton stores.
- Redux: test reducers as functions and components with a real store.
- RTK Query: mock `fetch` (it receives a `Request`) or use MSW.
- TanStack Query: `QueryClient` with `retry: false` in a wrapper; `renderHook` + `waitFor`.
- Apollo 4: `MockedProvider` from `@apollo/client/testing/react`; exact query+variables matches.

**Next:** [Chapter 35 — Storybook, accessibility, internationalisation](35-storybook-a11y-i18n.md)
