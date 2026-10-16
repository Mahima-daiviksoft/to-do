/**
 * @format
 */

import React from 'react';
import {
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import App, { STORAGE_KEY } from '../App';

beforeEach(async () => {
  await AsyncStorage.clear();
});

async function addTask(title: string) {
  fireEvent.changeText(screen.getByPlaceholderText('Enter a task'), title);
  fireEvent.press(screen.getByText('Add Task'));
  await screen.findByText(title);
}

test('adds, completes and deletes a task', async () => {
  render(<App />);
  await addTask('Buy milk');
  expect(screen.getByText('1 task left')).toBeTruthy();

  fireEvent.press(screen.getByLabelText('Toggle Buy milk'));
  expect(screen.getByText('0 tasks left')).toBeTruthy();

  fireEvent.press(screen.getByLabelText('Delete Buy milk'));
  expect(screen.queryByText('Buy milk')).toBeNull();
});

test('edits a task with a long press', async () => {
  render(<App />);
  await addTask('Buy milk');

  fireEvent(screen.getByText('Buy milk'), 'longPress');
  const input = screen.getByLabelText('Edit task');
  fireEvent.changeText(input, 'Buy oat milk');
  fireEvent(input, 'submitEditing');

  expect(screen.getByText('Buy oat milk')).toBeTruthy();
});

test('filters and clears completed tasks', async () => {
  render(<App />);
  await addTask('One');
  await addTask('Two');
  fireEvent.press(screen.getByLabelText('Toggle One'));

  fireEvent.press(screen.getByText('active'));
  expect(screen.queryByText('One')).toBeNull();
  expect(screen.getByText('Two')).toBeTruthy();

  fireEvent.press(screen.getByText('all'));
  fireEvent.press(screen.getByText('Clear completed'));
  expect(screen.queryByText('One')).toBeNull();
});

test('saves tasks and restores them on next launch', async () => {
  const first = render(<App />);
  await addTask('Persist me');
  await waitFor(async () =>
    expect(await AsyncStorage.getItem(STORAGE_KEY)).toContain('Persist me'),
  );
  first.unmount();

  render(<App />);
  expect(await screen.findByText('Persist me')).toBeTruthy();
});
