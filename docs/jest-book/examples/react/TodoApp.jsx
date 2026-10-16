import { useEffect, useState, createContext, useContext } from 'react';
import { fetchTodos, addTodo } from './api';
export const ThemeContext = createContext('light');
export function useCounter(initial = 0) {
  const [count, setCount] = useState(initial);
  return { count, increment: () => setCount((c) => c + 1) };
}
export function TodoApp() {
  const theme = useContext(ThemeContext);
  const [todos, setTodos] = useState(null);
  const [error, setError] = useState(null);
  const [title, setTitle] = useState('');
  useEffect(() => { fetchTodos().then(setTodos).catch((e) => setError(e.message)); }, []);
  async function onSubmit(e) {
    e.preventDefault();
    if (!title.trim()) { setError('Title is required'); return; }
    const todo = await addTodo(title.trim());
    setTodos((t) => [...t, todo]); setTitle(''); setError(null);
  }
  if (error && !todos) return <p role="alert">{error}</p>;
  if (!todos) return <p>Loading...</p>;
  return (
    <main className={theme}>
      <h1>Todos</h1>
      <form onSubmit={onSubmit}>
        <label htmlFor="title">New todo</label>
        <input id="title" value={title} onChange={(e) => setTitle(e.target.value)} />
        <button type="submit">Add</button>
      </form>
      {error && <p role="alert">{error}</p>}
      <ul aria-label="todo list">{todos.map((t) => <li key={t.id}>{t.title}</li>)}</ul>
    </main>
  );
}
