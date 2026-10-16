import { useCallback, useEffect, useState } from 'react';
import type { TodoRealtimeClient } from './TodoRealtimeClient';
import type { ConnectionStatus, ListState, TodoItem } from './types';

/**
 * React / React Native hook. Create ONE TodoRealtimeClient for the whole app (e.g. in a context provider),
 * call client.start() after login and client.stop() on logout, then use this hook in screens.
 *
 *   const { state, status, add, toggle, remove } = useTodoList(client, 'L1');
 */
export function useTodoList(client: TodoRealtimeClient, listId: string) {
  const [state, setState] = useState<ListState>({ listId, seq: 0, items: [], syncing: true });
  const [status, setStatus] = useState<ConnectionStatus>(client.status);
  const [lastError, setLastError] = useState<string | null>(null);

  useEffect(() => client.watchList(listId, setState), [client, listId]);   // returns the unsubscribe cleanup
  useEffect(() => client.onStatus(setStatus), [client]);
  useEffect(() => client.onError((e) => setLastError(`${e.code}: ${e.message}`)), [client]);

  const add = useCallback((title: string) => client.addItem(listId, title), [client, listId]);
  const toggle = useCallback((item: TodoItem) => client.updateItem(listId, item, { done: !item.done }), [client, listId]);
  const rename = useCallback((item: TodoItem, title: string) => client.updateItem(listId, item, { title }), [client, listId]);
  const remove = useCallback((item: TodoItem) => client.deleteItem(listId, item.id), [client, listId]);

  return { state, status, lastError, add, toggle, rename, remove };
}
