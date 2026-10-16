/** @jest-environment node */
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
  await expect(ok.json()).resolves.toEqual({ created: 'Bo' });
});
