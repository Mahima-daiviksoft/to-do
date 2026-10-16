# Chapter 18 — Testing Node.js Back Ends (APIs, Databases, Queues)

> 🧸 **Explain it like I'm 5**
>
> A back end is like a **restaurant kitchen**. Customers (apps) send orders (HTTP requests), the
> kitchen cooks (business logic), uses the fridge (database), and sometimes calls other shops
> (external APIs). To test it, you send pretend orders and check the plates that come out. You
> use a **pretend fridge** that you fill fresh for every test, and **pretend shops** that always
> answer the way you tell them.

---

## 18.1 What to test at which level

| Level | What | Tools |
| --- | --- | --- |
| Unit | services, validators, mappers, pure functions | Jest + `jest.fn` (inject repos/clients) |
| HTTP integration | routes + middleware + validation + error handler, with fake or real DB | Jest + **Supertest** |
| DB integration | repositories/queries against a real DB engine | Jest + Docker/Testcontainers / in-memory engines |
| External HTTP | your client code against simulated third parties | **MSW** (`msw/node`) or `nock` |
| Contract | your API matches what consumers expect | Pact |
| E2E | the deployed system | outside Jest (Playwright API tests, k6, etc.) |

✅ Rule of thumb for services: **most value comes from HTTP-level integration tests** with a real
(test) database plus unit tests for complex logic.

## 18.2 Make the app testable: export the app, don't listen

```js
// app.js — builds the app, does NOT call listen()
function createApp(deps) { /* ... */ return app; }
module.exports = { createApp };

// server.js — the only place that listens
const { createApp } = require('./app');
createApp(realDeps).listen(process.env.PORT || 3000);
```

Supertest accepts the app and binds an ephemeral port per request — no port conflicts between
parallel workers, nothing to close.

## 18.3 A complete, verified example (Express 5 + Supertest 7 + MSW 2.15 + Jest 30.5)

```js
// app.js
const express = require('express');

function createApp({ userRepo, weatherUrl = 'https://weather.example.com' }) {
  const app = express();
  app.use(express.json());

  app.get('/health', (req, res) => res.json({ ok: true }));

  app.post('/users', async (req, res, next) => {
    try {
      const { email } = req.body || {};
      if (!email || !email.includes('@')) return res.status(400).json({ error: 'Invalid email' });
      if (await userRepo.findByEmail(email)) return res.status(409).json({ error: 'Email taken' });
      const user = await userRepo.create({ email });
      res.status(201).json(user);
    } catch (err) { next(err); }
  });

  app.get('/weather/:city', async (req, res, next) => {
    try {
      const r = await fetch(`${weatherUrl}/v1/${encodeURIComponent(req.params.city)}`);
      if (!r.ok) return res.status(502).json({ error: 'Upstream failed' });
      const data = await r.json();
      res.json({ city: req.params.city, tempC: data.temp });
    } catch (err) { next(err); }
  });

  app.use((err, req, res, next) => res.status(500).json({ error: 'Internal error' }));
  return app;
}

module.exports = { createApp };
```

```js
// app.test.js
const request = require('supertest');
const { setupServer } = require('msw/node');
const { http, HttpResponse } = require('msw');
const { createApp } = require('./app');

// Fake third-party weather API
const server = setupServer(
  http.get('https://weather.example.com/v1/:city', ({ params }) =>
    HttpResponse.json({ temp: params.city === 'Oslo' ? -3 : 20 }),
  ),
);

beforeAll(() =>
  server.listen({
    onUnhandledRequest(request, print) {
      const { hostname } = new URL(request.url);
      if (hostname === '127.0.0.1' || hostname === 'localhost') return; // supertest -> our app
      print.error();                                                    // anything else: fail
    },
  }),
);
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

// In-memory fake repository (a "fake", not a mock: it has real behaviour)
function makeRepo() {
  const users = [];
  return {
    findByEmail: jest.fn(async (email) => users.find((u) => u.email === email) ?? null),
    create: jest.fn(async ({ email }) => {
      const u = { id: users.length + 1, email };
      users.push(u);
      return u;
    }),
  };
}

describe('POST /users', () => {
  test('201 creates a user', async () => {
    const app = createApp({ userRepo: makeRepo() });
    const res = await request(app).post('/users').send({ email: 'ann@example.com' }).expect(201);
    expect(res.body).toEqual({ id: 1, email: 'ann@example.com' });
  });

  test('400 on invalid email', async () => {
    const res = await request(createApp({ userRepo: makeRepo() }))
      .post('/users')
      .send({ email: 'nope' });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'Invalid email' });
  });

  test('409 when taken', async () => {
    const app = createApp({ userRepo: makeRepo() });
    await request(app).post('/users').send({ email: 'a@b.c' }).expect(201);
    await request(app).post('/users').send({ email: 'a@b.c' }).expect(409);
  });

  test('500 when the repository throws', async () => {
    const repo = makeRepo();
    repo.findByEmail.mockRejectedValueOnce(new Error('db down'));
    const res = await request(createApp({ userRepo: repo })).post('/users').send({ email: 'a@b.c' });
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Internal error');   // no stack trace leaked to clients
  });
});

describe('GET /weather/:city', () => {
  test('proxies the upstream API', async () => {
    const res = await request(createApp({ userRepo: makeRepo() }))
      .get('/weather/Oslo')
      .expect('Content-Type', /json/)
      .expect(200);
    expect(res.body).toEqual({ city: 'Oslo', tempC: -3 });
  });

  test('502 when upstream fails', async () => {
    server.use(
      http.get('https://weather.example.com/v1/:city', () => new HttpResponse(null, { status: 503 })),
    );
    await request(createApp({ userRepo: makeRepo() })).get('/weather/Oslo').expect(502);
  });
});
```

Result: `Tests: 6 passed, 6 total`.

### Two real problems hit while building this example (and their fixes)

**Problem 1: MSW + Jest = "Must use import to load ES Module".**
MSW 3 is published **ESM-only** (`"type": "module"`), and recent MSW 2 releases depend on small
ESM-only packages (`rettime`, `until-async`, `@open-draft/deferred-promise`, some shipped as
`.mjs`). Plain Node ≥ 22.12 can `require()` ESM, but **Jest's own module system only can on Node ≥
24.9** (Jest 30.5). On older Node, Jest fails with:

```
Must use import to load ES Module: .../node_modules/rettime/build/index.mjs
```

Fix that worked (MSW 2.15, Node 22, Jest 30.5):

```js
// jest.config.js
module.exports = {
  transform: { '\\.[mc]?[jt]sx?$': 'babel-jest' },   // ⚠️ also transform .mjs/.cjs files
  transformIgnorePatterns: [
    '/node_modules/(?!(rettime|until-async|@open-draft/deferred-promise)/)',
  ],
};
```

Two lessons: (1) the default `transform` regex `\.[jt]sx?$` **does not match `.mjs`**, so allowing a
package in `transformIgnorePatterns` isn't enough if it ships `.mjs`; (2) when allow-listing, run
the tests repeatedly; each run names the next ESM-only package. The other options are Node ≥ 24.9,
running Jest in native ESM mode, or pinning versions that ship CommonJS. (MSW 3 also needs Node ≥
22.12.)

**Problem 2: `[MSW] Cannot bypass a request when using the "error" strategy for the
"onUnhandledRequest" option`.**
MSW intercepts **all** outgoing HTTP in the process, including Supertest's requests to your own
app on `127.0.0.1`. With `onUnhandledRequest: 'error'` every test fails. The custom callback above
lets local requests through and still errors on any unexpected external call. ✅ Keep the
"error on unexpected requests" behaviour: it catches tests that silently hit real services.

## 18.4 Supertest essentials

```js
await request(app)
  .post('/login')
  .set('Authorization', `Bearer ${token}`)
  .set('Accept', 'application/json')
  .query({ redirect: '/home' })
  .send({ user: 'ann', password: 'x' })      // JSON body
  .attach('avatar', 'test/fixtures/a.png')   // multipart upload
  .field('name', 'Ann')
  .expect(200)
  .expect('Content-Type', /json/)
  .expect((res) => { if (!res.body.token) throw new Error('no token'); });

const agent = request.agent(app);             // keeps cookies between requests (sessions)
await agent.post('/login').send(creds);
await agent.get('/me').expect(200);
```

✅ Prefer Jest assertions on `res` (`expect(res.body).toEqual(...)`) for readable diffs; `.expect(...)`
chaining is fine for status/headers.

## 18.5 Databases — strategies

| Strategy | How | Pros | Cons |
| --- | --- | --- | --- |
| **Mock the repository** | inject `jest.fn()` repo | fastest, simple | doesn't test SQL/ORM at all |
| **In-memory fake** | `Map`-based repo (like above) | fast, behaves realistically | must keep in sync with real repo behaviour |
| **SQLite in memory** instead of Postgres | ORM switches dialect | fast | dialect differences → false confidence |
| **Real DB engine in Docker** (Testcontainers / docker-compose) | same engine as prod | highest confidence | slower, needs Docker in CI |
| **In-memory MongoDB** (`mongodb-memory-server`) | real `mongod` binary in memory | realistic for Mongo | downloads binaries |
| **pg-mem** | Postgres emulated in JS | no Docker | not 100% compatible |

### Real DB with Jest — the pattern

```js
// test/global-setup.js — once per run
const { PostgreSqlContainer } = require('@testcontainers/postgresql');

module.exports = async () => {
  const container = await new PostgreSqlContainer('postgres:16').start();
  process.env.DATABASE_URL = container.getConnectionUri();   // inherited by workers
  globalThis.__PG__ = container;
  await runMigrations(process.env.DATABASE_URL);
};
```

```js
// test/global-teardown.js
module.exports = async () => { await globalThis.__PG__?.stop(); };
```

Isolation between tests (pick one):

1. **Transaction per test, rolled back** in `afterEach` — fastest; requires your code to use the
   transaction's connection (dependency injection of the DB handle).
2. **Truncate tables** in `beforeEach` (`TRUNCATE ... RESTART IDENTITY CASCADE`) — simple and robust.
3. **Database per worker** — use `process.env.JEST_WORKER_ID` (1..N) to create/choose
   `app_test_${JEST_WORKER_ID}` so parallel workers never collide:

```js
const dbName = `app_test_${process.env.JEST_WORKER_ID}`;
```

4. Or run DB tests serially: `--runInBand` / separate Jest project with `maxWorkers: 1`.

⚠️ **Never** point tests at a shared dev/staging DB. Tests must create their own data.

### Close connections or Jest won't exit

```js
afterAll(async () => {
  await prisma.$disconnect();      // Prisma
  await sequelize.close();         // Sequelize
  await mongoose.disconnect();     // Mongoose
  await pool.end();                // pg
  await redis.quit();              // ioredis
});
```

Otherwise: `Jest did not exit one second after the test run has completed` or
`A worker process has failed to exit gracefully` (Chapter 23).

### Test data: factories / builders

```js
let seq = 0;
function buildUser(overrides = {}) {
  seq += 1;
  return { id: seq, email: `user${seq}@example.com`, role: 'member', active: true, ...overrides };
}

const admin = buildUser({ role: 'admin' });
```

Libraries: `@faker-js/faker` (seed it: `faker.seed(123)` for determinism), `fishery`, `rosie`.
Keep factories close to the domain, give sensible valid defaults, override only what the test cares
about.

## 18.6 Mocking outgoing HTTP: MSW vs nock vs module mocks

| | MSW (`msw/node`) | nock | `jest.mock('axios')` |
| --- | --- | --- | --- |
| Level | network interceptors (`http`, `https`, `fetch`/undici) | Node `http`/`https` (newer versions also intercept `fetch`) | module |
| Works with any client | ✅ | mostly | ❌ only the mocked library |
| Reuse handlers in browser/Storybook | ✅ | ❌ | ❌ |
| Assert "no unexpected calls" | `onUnhandledRequest: 'error'` | `nock.disableNetConnect()` | n/a |

To assert what was sent with MSW, capture inside the handler:

```js
let receivedBody;
server.use(
  http.post('https://api.example.com/orders', async ({ request }) => {
    receivedBody = await request.json();
    return HttpResponse.json({ id: 'o1' }, { status: 201 });
  }),
);
// ... act ...
expect(receivedBody).toEqual({ sku: 'A1', qty: 2 });
```

## 18.7 Auth, time and config

- **JWT:** generate real tokens in tests with a test secret (`jsonwebtoken.sign(payload, 'test-secret')`),
  set via env in `setupFiles`. Test expired tokens with fake timers / `setSystemTime`.
- **Config:** load config through a function so tests can pass overrides; avoid reading
  `process.env` at import time (Chapter 9 §9.11).
- **Time-based logic** (expiry, schedules): fake timers + `setSystemTime`.

## 18.8 Queues, events, cron jobs, workers

Design so the **handler** is a plain function you can call directly:

```js
// consumer.js
async function handleOrderCreated(message, { mailer, repo }) {
  const order = await repo.find(message.orderId);
  if (!order) return { ack: true, skipped: true };   // idempotent: unknown order → ack
  await mailer.sendConfirmation(order);
  return { ack: true };
}
```

```js
test('acks and skips unknown orders', async () => {
  const deps = { repo: { find: jest.fn().mockResolvedValue(null) }, mailer: { sendConfirmation: jest.fn() } };
  await expect(handleOrderCreated({ orderId: 'x' }, deps)).resolves.toEqual({ ack: true, skipped: true });
  expect(deps.mailer.sendConfirmation).not.toHaveBeenCalled();
});
```

Test the wiring (subscribing to the broker) separately with a real broker container or a thin
integration test. Cron: test the job function directly; test the schedule expression separately.

## 18.9 NestJS

```ts
import { Test } from '@nestjs/testing';

describe('UsersService', () => {
  let service: UsersService;
  const repo = { findOne: jest.fn(), save: jest.fn() };

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [UsersService, { provide: getRepositoryToken(User), useValue: repo }],
    }).compile();
    service = moduleRef.get(UsersService);
  });

  it('throws NotFound for unknown id', async () => {
    repo.findOne.mockResolvedValue(null);
    await expect(service.get(1)).rejects.toThrow(NotFoundException);
  });
});
```

E2E-style: `app = moduleRef.createNestApplication(); await app.init(); request(app.getHttpServer())`;
remember `await app.close()` in `afterAll`. NestJS relies on decorator metadata → use `ts-jest` or SWC
with decorator metadata enabled (Chapter 15).

## 18.10 GraphQL

- Unit-test resolvers as functions with a fake context.
- Integration: Apollo Server's `server.executeOperation({ query, variables }, { contextValue })`, or
  Supertest against the HTTP endpoint.
- Snapshot the **errors** array shape, not huge response trees.

## 18.11 Checklist for back-end test suites

- [ ] App factory without `listen()`; Supertest against the app.
- [ ] Deterministic data (factories, seeded faker, fake timers).
- [ ] Isolation strategy for DB (transaction/truncate/db-per-worker).
- [ ] External HTTP blocked by default (MSW `error`, nock `disableNetConnect`).
- [ ] All connections closed in `afterAll`; no `--forceExit` band-aid.
- [ ] Error paths tested (4xx, 5xx, upstream failures, timeouts).
- [ ] Secrets never real; `.env.test` committed with fake values.
- [ ] Slow integration tests in a separate Jest project/CI job if needed.

**Next:** [Chapter 19 — Test design: patterns, TDD, test doubles](19-test-design-patterns.md)
