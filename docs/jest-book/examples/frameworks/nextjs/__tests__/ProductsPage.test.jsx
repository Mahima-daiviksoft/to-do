import { render, screen } from '@testing-library/react';
import ProductsPage from '@/app/products/page';
import { getProducts } from '@/lib/db';
jest.mock('@/lib/db');
test('async server component: await it, then render the result', async () => {
  jest.mocked(getProducts).mockResolvedValue([{ id: 1, name: 'Lamp' }]);
  render(await ProductsPage());
  expect(screen.getByRole('heading', { name: 'Products' })).toBeInTheDocument();
  expect(screen.getByText('Lamp')).toBeInTheDocument();
});
