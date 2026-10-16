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
