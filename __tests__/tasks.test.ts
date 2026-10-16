import {
  Task,
  filterTasks,
  parseStoredTasks,
  tasksReducer,
} from '../src/tasks';

const a: Task = { id: '1', title: 'Buy milk', done: false };
const b: Task = { id: '2', title: 'Walk dog', done: true };

describe('tasksReducer', () => {
  test('adds a trimmed task', () => {
    expect(
      tasksReducer([], { type: 'add', id: '9', title: '  Read  ' }),
    ).toEqual([{ id: '9', title: 'Read', done: false }]);
  });

  test('ignores blank titles on add and edit', () => {
    expect(tasksReducer([a], { type: 'add', id: '9', title: '   ' })).toEqual([
      a,
    ]);
    expect(tasksReducer([a], { type: 'edit', id: '1', title: ' ' })).toEqual([
      a,
    ]);
  });

  test('toggles, edits and removes by id', () => {
    expect(tasksReducer([a, b], { type: 'toggle', id: '1' })[0].done).toBe(
      true,
    );
    expect(
      tasksReducer([a], { type: 'edit', id: '1', title: 'Oat milk' })[0].title,
    ).toBe('Oat milk');
    expect(tasksReducer([a, b], { type: 'remove', id: '1' })).toEqual([b]);
  });

  test('clears completed tasks', () => {
    expect(tasksReducer([a, b], { type: 'clearDone' })).toEqual([a]);
  });
});

test('filterTasks', () => {
  expect(filterTasks([a, b], 'all')).toEqual([a, b]);
  expect(filterTasks([a, b], 'active')).toEqual([a]);
  expect(filterTasks([a, b], 'done')).toEqual([b]);
});

describe('parseStoredTasks', () => {
  test('returns [] for missing or corrupt data', () => {
    expect(parseStoredTasks(null)).toEqual([]);
    expect(parseStoredTasks('not json')).toEqual([]);
    expect(parseStoredTasks('{"a":1}')).toEqual([]);
  });

  test('drops invalid entries and defaults done to false', () => {
    expect(
      parseStoredTasks('[{"id":"1","title":"Old format"},{"id":2},null]'),
    ).toEqual([{ id: '1', title: 'Old format', done: false }]);
  });
});

test('load keeps tasks added before storage finished loading', () => {
  expect(tasksReducer([a], { type: 'load', tasks: [b] })).toEqual([b, a]);
});
