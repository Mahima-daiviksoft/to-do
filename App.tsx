import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Button,
  FlatList,
  StyleSheet,
} from 'react-native';

type Task = {
  id: string;
  title: string;
};

export default function App() {
  const [task, setTask] = useState<string>('');
  const [tasks, setTasks] = useState<Task[]>([]);

  const addTask = () => {
    if (task.trim() === '') return;

    const newTask: Task = {
      id: Date.now().toString(),
      title: task,
    };

    setTasks([...tasks, newTask]);
    setTask('');
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>My To-Do App ✅</Text>

      <TextInput
        style={styles.input}
        placeholder="Enter a task"
        value={task}
        onChangeText={setTask}
      />

      <Button title="Add Task" onPress={addTask} />

      <FlatList
        data={tasks}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <Text style={styles.task}>{item.title}</Text>
        )}
      />
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
  task: {
    fontSize: 18,
    padding: 10,
    borderBottomWidth: 1,
  },
});
