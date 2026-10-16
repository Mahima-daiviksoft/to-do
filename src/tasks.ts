export type Task = {
  id: string;
  title: string;
  done: boolean;
};

export type Filter = 'all' | 'active' | 'done';

export type Action =
  | { type: 'load'; tasks: Task[] }
  | { type: 'add'; id: string; title: string }
  | { type: 'toggle'; id: string }
  | { type: 'edit'; id: string; title: string }
  | { type: 'remove'; id: string }
  | { type: 'clearDone' };

export function tasksReducer(tasks: Task[], action: Action): Task[] {
  switch (action.type) {
    case 'load':
      // Keep any tasks added before the saved list finished loading.
      return [...action.tasks, ...tasks];
    case 'add': {
      const title = action.title.trim();
      if (title === '') return tasks;
      return [...tasks, { id: action.id, title, done: false }];
    }
    case 'toggle':
      return tasks.map(t => (t.id === action.id ? { ...t, done: !t.done } : t));
    case 'edit': {
      const title = action.title.trim();
      if (title === '') return tasks;
      return tasks.map(t => (t.id === action.id ? { ...t, title } : t));
    }
    case 'remove':
      return tasks.filter(t => t.id !== action.id);
    case 'clearDone':
      return tasks.filter(t => !t.done);
  }
}

export function filterTasks(tasks: Task[], filter: Filter): Task[] {
  if (filter === 'active') return tasks.filter(t => !t.done);
  if (filter === 'done') return tasks.filter(t => t.done);
  return tasks;
}

// Validates data read from storage so a corrupt or old-format value can't crash the app.
export function parseStoredTasks(raw: string | null): Task[] {
  if (!raw) return [];
  try {
    const data: unknown = JSON.parse(raw);
    if (!Array.isArray(data)) return [];
    return data
      .filter(
        (t): t is { id: string; title: string; done?: unknown } =>
          typeof t === 'object' &&
          t !== null &&
          typeof t.id === 'string' &&
          typeof t.title === 'string',
      )
      .map(t => ({ id: t.id, title: t.title, done: t.done === true }));
  } catch {
    return [];
  }
}
