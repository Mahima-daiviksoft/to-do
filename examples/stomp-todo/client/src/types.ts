// Wire types: these mirror the server's TodoModels records exactly.

export interface TodoItem {
  id: string;
  listId: string;
  title: string;
  done: boolean;
  version: number;
}

export interface TodoEvent {
  eventId: string;
  type: 'todo.item.created' | 'todo.item.updated' | 'todo.item.deleted' | string; // unknown types are ignored
  listId: string;
  seq: number;
  item: TodoItem;
  actor: string;
  clientRequestId: string | null;
  occurredAt: string;
}

export interface ListSnapshot {
  listId: string;
  seq: number;
  items: TodoItem[];
}

export interface CommandAck {
  clientRequestId: string;
  listId: string;
  seq: number;
  duplicate: boolean;
}

export interface ErrorDto {
  code: 'VALIDATION_FAILED' | 'CONFLICT' | 'FORBIDDEN' | 'BAD_REQUEST' | 'INTERNAL' | string;
  message: string;
  clientRequestId: string | null;
}

export interface TodoCommand {
  listId: string;
  itemId?: string;
  title?: string;
  done?: boolean;
  expectedVersion?: number;
  clientRequestId: string;
}

export type ConnectionStatus = 'connecting' | 'live' | 'reconnecting' | 'offline' | 'unauthorized';

export interface ListState {
  listId: string;
  seq: number;
  items: TodoItem[];
  /** true while the initial snapshot or a resync is loading */
  syncing: boolean;
}
