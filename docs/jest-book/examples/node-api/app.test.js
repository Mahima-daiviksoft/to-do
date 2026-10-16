const request = require('supertest');
const { setupServer } = require('msw/node');
const { http, HttpResponse } = require('msw');
const { createApp } = require('./app');

const server = setupServer(
  http.get('https://weather.example.com/v1/:city', ({ params }) => HttpResponse.json({ temp: params.city === 'Oslo' ? -3 : 20 })),
);
beforeAll(() =>
  server.listen({
    onUnhandledRequest(request, print) {
      const { hostname } = new URL(request.url);
      if (hostname === '127.0.0.1' || hostname === 'localhost') return; // supertest -> our app
      print.error();
    },
  }),
);
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function makeRepo() {
  const users = [];
  return {
    findByEmail: jest.fn(async (email) => users.find((u) => u.email === email) ?? null),
    create: jest.fn(async ({ email }) => { const u = { id: users.length + 1, email }; users.push(u); return u; }),
  };
}

describe('POST /users', () => {
  test('201 creates a user', async () => {
    const app = createApp({ userRepo: makeRepo() });
    const res = await request(app).post('/users').send({ email: 'ann@example.com' }).expect(201);
    expect(res.body).toEqual({ id: 1, email: 'ann@example.com' });
  });
  test('400 on invalid email', async () => {
    const res = await request(createApp({ userRepo: makeRepo() })).post('/users').send({ email: 'nope' });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'Invalid email' });
  });
  test('409 when taken', async () => {
    const app = createApp({ userRepo: makeRepo() });
    await request(app).post('/users').send({ email: 'a@b.c' }).expect(201);
    await request(app).post('/users').send({ email: 'a@b.c' }).expect(409);
  });
  test('500 when repo throws', async () => {
    const repo = makeRepo();
    repo.findByEmail.mockRejectedValueOnce(new Error('db down'));
    const res = await request(createApp({ userRepo: repo })).post('/users').send({ email: 'a@b.c' });
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Internal error');
  });
});
describe('GET /weather/:city', () => {
  test('proxies upstream', async () => {
    const res = await request(createApp({ userRepo: makeRepo() })).get('/weather/Oslo').expect('Content-Type', /json/).expect(200);
    expect(res.body).toEqual({ city: 'Oslo', tempC: -3 });
  });
  test('502 when upstream fails', async () => {
    server.use(http.get('https://weather.example.com/v1/:city', () => new HttpResponse(null, { status: 503 })));
    await request(createApp({ userRepo: makeRepo() })).get('/weather/Oslo').expect(502);
  });
});
