import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Login } from './Login';
function setup(onLogin = jest.fn().mockResolvedValue(undefined)) {
  const user = userEvent.setup();
  render(<Login onLogin={onLogin} />);
  return { user, onLogin };
}
test('requires both fields', async () => {
  const { user, onLogin } = setup();
  await user.click(screen.getByRole('button', { name: /sign in/i }));
  expect(screen.getByRole('alert')).toHaveTextContent('Email and password are required');
  expect(onLogin).not.toHaveBeenCalled();
});
test('submits credentials and shows busy state', async () => {
  let resolveLogin;
  const onLogin = jest.fn(() => new Promise((r) => { resolveLogin = r; }));
  const { user } = setup(onLogin);
  await user.type(screen.getByLabelText(/email/i), 'ann@example.com');
  await user.type(screen.getByLabelText(/password/i), 'secret');
  await user.click(screen.getByRole('button', { name: /sign in/i }));
  expect(onLogin).toHaveBeenCalledWith({ email: 'ann@example.com', password: 'secret' });
  expect(screen.getByRole('button', { name: /signing in/i })).toBeDisabled();
  resolveLogin();
  expect(await screen.findByRole('button', { name: /sign in/i })).toBeEnabled();
});
test('shows server error', async () => {
  const { user } = setup(jest.fn().mockRejectedValue(new Error('Invalid credentials')));
  await user.type(screen.getByLabelText(/email/i), 'ann@example.com');
  await user.type(screen.getByLabelText(/password/i), 'wrong');
  await user.click(screen.getByRole('button', { name: /sign in/i }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Invalid credentials');
});
