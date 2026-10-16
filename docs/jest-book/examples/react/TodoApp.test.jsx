import { render, screen, within, renderHook, act, waitForElementToBeRemoved } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TodoApp, ThemeContext, useCounter } from './TodoApp';
import { fetchTodos, addTodo } from './api';
jest.mock('./api');

function renderWithTheme(ui, { theme = 'light' } = {}) {
  return render(<ThemeContext.Provider value={theme}>{ui}</ThemeContext.Provider>);
}
beforeEach(() => {
  jest.mocked(fetchTodos).mockResolvedValue([{ id: 1, title: 'Buy milk' }]);
  jest.mocked(addTodo).mockImplementation(async (title) => ({ id: 2, title }));
});
test('shows loading then todos', async () => {
  renderWithTheme(<TodoApp />);
  expect(screen.getByText(/loading/i)).toBeInTheDocument();
  const list = await screen.findByRole('list', { name: /todo list/i });
  expect(within(list).getAllByRole('listitem')).toHaveLength(1);
  expect(screen.queryByText(/loading/i)).not.toBeInTheDocument();
});
test('adds a todo', async () => {
  const user = userEvent.setup();
  renderWithTheme(<TodoApp />, { theme: 'dark' });
  await screen.findByText('Buy milk');
  await user.type(screen.getByLabelText(/new todo/i), '  Walk dog ');
  await user.click(screen.getByRole('button', { name: /add/i }));
  expect(await screen.findByText('Walk dog')).toBeInTheDocument();
  expect(addTodo).toHaveBeenCalledWith('Walk dog');
  expect(screen.getByLabelText(/new todo/i)).toHaveValue('');
  expect(screen.getByRole('main')).toHaveClass('dark');
});
test('validation error', async () => {
  const user = userEvent.setup();
  renderWithTheme(<TodoApp />);
  await screen.findByText('Buy milk');
  await user.click(screen.getByRole('button', { name: /add/i }));
  expect(screen.getByRole('alert')).toHaveTextContent('Title is required');
  expect(addTodo).not.toHaveBeenCalled();
});
test('load error', async () => {
  jest.mocked(fetchTodos).mockRejectedValueOnce(new Error('Server down'));
  renderWithTheme(<TodoApp />);
  expect(await screen.findByRole('alert')).toHaveTextContent('Server down');
});
test('waitForElementToBeRemoved', async () => {
  renderWithTheme(<TodoApp />);
  await waitForElementToBeRemoved(() => screen.queryByText(/loading/i));
});
test('renderHook', () => {
  const { result } = renderHook(() => useCounter(5));
  act(() => result.current.increment());
  expect(result.current.count).toBe(6);
});
