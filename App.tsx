import React, { useEffect, useReducer, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Button,
  FlatList,
  Pressable,
  StyleSheet,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  Filter,
  Task,
  filterTasks,
  parseStoredTasks,
  tasksReducer,
} from './src/tasks';

export const STORAGE_KEY = '@todo/tasks';

const FILTERS: Filter[] = ['all', 'active', 'done'];

export default function App() {
  const [task, setTask] = useState<string>('');
  const [tasks, dispatch] = useReducer(tasksReducer, []);
  const [filter, setFilter] = useState<Filter>('all');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState<string>('');
  const loaded = useRef(false);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then(raw => dispatch({ type: 'load', tasks: parseStoredTasks(raw) }))
      .catch(() => {})
      .finally(() => {
        loaded.current = true;
      });
  }, []);

  useEffect(() => {
    // Don't overwrite saved tasks with the empty initial state before they load.
    if (!loaded.current) return;
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(tasks)).catch(() => {});
  }, [tasks]);

  const addTask = () => {
    dispatch({ type: 'add', id: Date.now().toString(), title: task });
    setTask('');
  };

  const startEdit = (item: Task) => {
    setEditingId(item.id);
    setEditText(item.title);
  };

  const saveEdit = () => {
    if (editingId) dispatch({ type: 'edit', id: editingId, title: editText });
    setEditingId(null);
  };

  const remaining = tasks.filter(t => !t.done).length;
  const visible = filterTasks(tasks, filter);

  const renderItem = ({ item }: { item: Task }) => (
    <View style={styles.row}>
      <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{ checked: item.done }}
        accessibilityLabel={`Toggle ${item.title}`}
        onPress={() => dispatch({ type: 'toggle', id: item.id })}
        style={styles.checkbox}
      >
        <Text>{item.done ? '☑' : '☐'}</Text>
      </Pressable>

      {editingId === item.id ? (
        <TextInput
          style={[styles.input, styles.flex]}
          value={editText}
          onChangeText={setEditText}
          onSubmitEditing={saveEdit}
          onBlur={saveEdit}
          autoFocus
          accessibilityLabel="Edit task"
        />
      ) : (
        <Pressable style={styles.flex} onLongPress={() => startEdit(item)}>
          <Text style={[styles.task, item.done && styles.taskDone]}>
            {item.title}
          </Text>
        </Pressable>
      )}

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Delete ${item.title}`}
        onPress={() => dispatch({ type: 'remove', id: item.id })}
        style={styles.delete}
      >
        <Text>✕</Text>
      </Pressable>
    </View>
  );

  return (
    <View style={styles.container}>
      <Text style={styles.title}>My To-Do App ✅</Text>

      <TextInput
        style={styles.input}
        placeholder="Enter a task"
        value={task}
        onChangeText={setTask}
        onSubmitEditing={addTask}
      />

      <Button title="Add Task" onPress={addTask} />

      <View style={styles.filters}>
        {FILTERS.map(f => (
          <Pressable
            key={f}
            accessibilityRole="button"
            accessibilityState={{ selected: filter === f }}
            onPress={() => setFilter(f)}
          >
            <Text style={[styles.filter, filter === f && styles.filterActive]}>
              {f}
            </Text>
          </Pressable>
        ))}
      </View>

      <FlatList
        data={visible}
        keyExtractor={item => item.id}
        renderItem={renderItem}
        ListEmptyComponent={<Text style={styles.empty}>No tasks here.</Text>}
      />

      <View style={styles.footer}>
        <Text>
          {remaining} {remaining === 1 ? 'task' : 'tasks'} left
        </Text>
        {tasks.some(t => t.done) && (
          <Button
            title="Clear completed"
            onPress={() => dispatch({ type: 'clearDone' })}
          />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    marginTop: 40,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 20,
  },
  input: {
    borderWidth: 1,
    padding: 10,
    marginBottom: 10,
  },
  flex: {
    flex: 1,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
  },
  checkbox: {
    padding: 10,
  },
  task: {
    fontSize: 18,
    padding: 10,
  },
  taskDone: {
    textDecorationLine: 'line-through',
    color: '#888',
  },
  delete: {
    padding: 10,
  },
  filters: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginVertical: 10,
  },
  filter: {
    fontSize: 16,
    textTransform: 'capitalize',
    color: '#555',
  },
  filterActive: {
    fontWeight: 'bold',
    color: '#000',
    textDecorationLine: 'underline',
  },
  empty: {
    textAlign: 'center',
    color: '#888',
    marginTop: 20,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 10,
  },
});
