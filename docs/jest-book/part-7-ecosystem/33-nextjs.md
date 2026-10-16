# Chapter 33 — Testing Next.js (App Router, Server Components, Server Actions, Route Handlers)

> 🧸 **Explain it like I'm 5**
>
> A Next.js app has two kinds of rooms: rooms that run **in the browser** (client components) and
> rooms that run **on the server** (server components, server actions, API routes). Jest can test
> the browser rooms with a pretend browser, and many server rooms as plain functions. A few things
> (whole streamed pages with nested async parts) are better checked with a real browser (E2E).

Verified (October 2026) with **Next.js 16.4.2**, React 19.3, **Jest 30.5.2**: 6 tests pass.
Runnable copy: [`examples/frameworks/nextjs`](../examples/frameworks/nextjs).

---

## 33.1 Setup with `next/jest`

```bash
npm i -D jest jest-environment-jsdom @testing-library/react @testing-library/dom @testing-library/jest-dom @testing-library/user-event
```

```js
// jest.config.js
const nextJest = require('next/jest');
const createJestConfig = nextJest({ dir: './' });   // loads next.config + .env files

module.exports = createJestConfig({
  testEnvironment: 'jsdom',
  clearMocks: true,
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  moduleNameMapper: { '^@/(.*)$': '<rootDir>/$1' },  // match your tsconfig "paths"
});
```

```js
// jest.setup.js
import '@testing-library/jest-dom';
```

What `next/jest` does for you: SWC transform (TS/JSX, no Babel config needed), auto-mocks CSS /
CSS modules / images / fonts (`next/font`), loads `.env*` files, ignores `node_modules` and `.next`
from transforms/tests, and applies Next's config. ⚠️ `createJestConfig` returns an **async**
function; that's fine for Jest.

## 33.2 Client components (verified)

```jsx
// app/SearchBox.jsx
'use client';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';

export default function SearchBox() {
  const router = useRouter();
  const params = useSearchParams();
  const [q, setQ] = useState(params.get('q') ?? '');
  return (
    <form onSubmit={(e) => { e.preventDefault(); router.push(`/search?q=${encodeURIComponent(q)}`); }}>
      <label htmlFor="q">Search</label>
      <input id="q" value={q} onChange={(e) => setQ(e.target.value)} />
      <button type="submit">Go</button>
    </form>
  );
}
```

`next/navigation` hooks need the App Router context, which doesn't exist in a unit test → mock them:

```jsx
// __tests__/SearchBox.test.jsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SearchBox from '@/app/SearchBox';

const push = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace: jest.fn(), back: jest.fn(), prefetch: jest.fn() }),
  useSearchParams: () => new URLSearchParams('q=shoes'),
  usePathname: () => '/search',
}));

test('prefills from the URL and navigates on submit', async () => {
  const user = userEvent.setup();
  render(<SearchBox />);
  const input = screen.getByLabelText('Search');
  expect(input).toHaveValue('shoes');
  await user.clear(input);
  await user.type(input, 'red hats');
  await user.click(screen.getByRole('button', { name: 'Go' }));
  expect(push).toHaveBeenCalledWith('/search?q=red%20hats');
});
```

🔍 Notice `push` doesn't start with `mock` and is initialised with `jest.fn()`, which
`babel-plugin-jest-hoist` would reject (Chapter 8 §8.3). It works here (verified) because
`next/jest` transforms with **SWC**, whose Jest transform hoists `jest.mock` without Babel's
out-of-scope-variable check. It's safe because `push` is read **lazily** (only when `useRouter()`
is called inside a test). For portability across Babel/SWC, name such variables `mockPush`.

## 33.3 Async Server Components (verified, including the trap)

```jsx
// app/products/page.jsx — a Server Component
import { getProducts } from '@/lib/db';

export default async function ProductsPage() {
  const products = await getProducts();
  return (
    <main>
      <h1>Products</h1>
      <ul>{products.map((p) => <li key={p.id}>{p.name}</li>)}</ul>
    </main>
  );
}
```

✅ Works: **call and await the component function**, then render the returned JSX:

```jsx
import { render, screen } from '@testing-library/react';
import ProductsPage from '@/app/products/page';
import { getProducts } from '@/lib/db';
jest.mock('@/lib/db');

test('async server component', async () => {
  jest.mocked(getProducts).mockResolvedValue([{ id: 1, name: 'Lamp' }]);
  render(await ProductsPage());
  expect(screen.getByRole('heading', { name: 'Products' })).toBeInTheDocument();
  expect(screen.getByText('Lamp')).toBeInTheDocument();
});
```

❌ Trap: `render(<ProductsPage />)` does **not** throw — it silently renders nothing and React logs
(verified):

```
<ProductsPage> is an async Client Component. Only Server Components can be async at the moment.
This error is often caused by accidentally adding 'use client' to a module that was originally
written for the server.
```

React DOM in jsdom is a *client* renderer; it can't run async components.

Limits of the "await the function" trick: it only resolves the **top-level** component. If the page
renders **nested async server components**, those children are again async components inside the
tree → same problem. Options: test nested async components individually (await each), extract data
fetching into plain functions and test them, and cover the full streamed page (Suspense,
`loading.js`, nested async) with **E2E** tests (Playwright). The Next.js docs themselves recommend
E2E for async Server Components.

## 33.4 Server Actions (verified)

A server action is just an async function → test it directly in the **node** environment:

```js
// app/products/actions.js
'use server';
import { saveProduct } from '@/lib/db';
import { revalidatePath } from 'next/cache';

export async function createProduct(formData) {
  const name = String(formData.get('name') ?? '').trim();
  if (!name) return { error: 'Name is required' };
  const product = await saveProduct({ name });
  revalidatePath('/products');
  return { product };
}
```

```js
/** @jest-environment node */
import { createProduct } from '@/app/products/actions';
import { saveProduct } from '@/lib/db';
import { revalidatePath } from 'next/cache';

jest.mock('@/lib/db');
jest.mock('next/cache', () => ({ revalidatePath: jest.fn() }));   // needs Next's server runtime otherwise

function form(data) { const f = new FormData(); for (const [k, v] of Object.entries(data)) f.append(k, v); return f; }

test('validates input', async () => {
  await expect(createProduct(form({ name: '  ' }))).resolves.toEqual({ error: 'Name is required' });
  expect(saveProduct).not.toHaveBeenCalled();
});

test('saves and revalidates', async () => {
  jest.mocked(saveProduct).mockResolvedValue({ id: 7, name: 'Desk' });
  await expect(createProduct(form({ name: 'Desk' }))).resolves.toEqual({ product: { id: 7, name: 'Desk' } });
  expect(revalidatePath).toHaveBeenCalledWith('/products');
});
```

Also mock `next/headers` (`cookies()`, `headers()`) and `redirect`/`notFound` from
`next/navigation` when actions use them — e.g. `redirect` throws a special error in Next; in tests
mock it as `jest.fn()` and assert the call.

## 33.5 Route Handlers (verified)

```js
// app/api/hello/route.js
import { NextResponse } from 'next/server';

export async function GET(request) {
  const name = new URL(request.url).searchParams.get('name') ?? 'world';
  return NextResponse.json({ message: `Hello, ${name}` });
}

export async function POST(request) {
  const body = await request.json().catch(() => null);
  if (!body?.name) return NextResponse.json({ error: 'name required' }, { status: 400 });
  return NextResponse.json({ created: body.name }, { status: 201 });
}
```

```js
/** @jest-environment node */      // real Request/Response from Node — not available in jsdom
import { GET, POST } from '@/app/api/hello/route';

test('GET greets', async () => {
  const res = await GET(new Request('http://localhost/api/hello?name=Ann'));
  expect(res.status).toBe(200);
  await expect(res.json()).resolves.toEqual({ message: 'Hello, Ann' });
});

test('POST validates', async () => {
  const bad = await POST(new Request('http://localhost/api/hello', { method: 'POST', body: '{}' }));
  expect(bad.status).toBe(400);
  const ok = await POST(new Request('http://localhost/api/hello', { method: 'POST', body: JSON.stringify({ name: 'Bo' }) }));
  expect(ok.status).toBe(201);
});
```

The `@jest-environment node` docblock is essential: jsdom lacks `Request`/`Response`
(Chapter 9 §9.10).

## 33.6 Other Next.js pieces

| Piece | How to test |
| --- | --- |
| `middleware.ts` | call the exported function with `new NextRequest(url)` in node env; assert `NextResponse` (redirect/rewrite headers) |
| `generateMetadata` | async function → await and assert the object |
| `next/image`, `next/link` | render normally in jsdom (Link renders an `<a>`); assert `href` |
| `next/font` | handled by `next/jest` mocks |
| Environment variables | `.env.test` loaded by `next/jest` |
| Pages Router (`pages/`) | `getServerSideProps`/`getStaticProps` are async functions → test directly; `next/router` → mock `useRouter` (or `next-router-mock`) |
| Full pages, streaming, Suspense, caching | E2E (Playwright) against `next build && next start` |

## 33.7 Summary

- `next/jest` gives SWC transforms, asset mocks and env loading.
- Client components: RTL + mocked `next/navigation`.
- Async Server Components: `render(await Page())` for the top level; never `render(<Page/>)`; E2E
  for nested async/streaming.
- Server actions and route handlers are functions: test them in the **node** environment.

**Next:** [Chapter 34 — Data & state libraries](34-data-and-state-libraries.md)
