/** @jest-environment node */
import { createProduct } from '@/app/products/actions';
import { saveProduct } from '@/lib/db';
import { revalidatePath } from 'next/cache';
jest.mock('@/lib/db');
jest.mock('next/cache', () => ({ revalidatePath: jest.fn() }));
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
