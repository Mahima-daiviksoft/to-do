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
