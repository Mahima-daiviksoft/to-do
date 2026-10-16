/**
 * Runnable demo (Node 22+, which has a global WebSocket and fetch). Start the server first:
 *   cd ../server && mvn spring-boot:run
 * then:
 *   npm install && npm run demo
 *
 * anna and bob share list L1. bob watches it live while anna adds, completes and renames items,
 * retries a command (idempotency), and makes a stale edit (conflict). carol isn't a member of L1.
 */
import { CommandError, TodoRealtimeClient } from './TodoRealtimeClient';
import type { TodoItem } from './types';

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:8080';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function devToken(user: string): Promise<string> {
  const res = await fetch(`${BASE_URL}/api/dev-token`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ user }),
  });
  if (!res.ok) throw new Error(`token for ${user}: HTTP ${res.status}. Is the server running at ${BASE_URL}?`);
  return ((await res.json()) as { token: string }).token;
}

function clientFor(user: string): TodoRealtimeClient {
  let token: Promise<string> | null = null;
  return new TodoRealtimeClient({
    baseUrl: BASE_URL,
    getToken: () => (token ??= devToken(user)),          // a real app would refresh near expiry
    debug: process.env.DEBUG ? (m) => console.log(`[${user}] ${m}`) : undefined,
  });
}

const show = (items: TodoItem[]) =>
  items.map((i) => `${i.done ? '[x]' : '[ ]'} ${i.title} (v${i.version})`).join(' | ') || '(empty)';

async function main() {
  const anna = clientFor('anna');
  const bob = clientFor('bob');

  bob.onStatus((s) => console.log(`bob status: ${s}`));
  bob.watchList('L1', (state) => {
    if (!state.syncing) console.log(`bob sees L1 @seq ${state.seq}: ${show(state.items)}`);
  });

  bob.start();
  anna.start();
  await sleep(1500);

  let annaItems: TodoItem[] = [];
  const stopWatching = anna.watchList('L1', (s) => { annaItems = s.items; });

  console.log('\n--- anna adds two items');
  await anna.addItem('L1', 'Buy milk');
  await anna.addItem('L1', 'Walk the dog');
  await sleep(500);

  console.log('\n--- anna completes "Buy milk"');
  const milk = annaItems.find((i) => i.title === 'Buy milk')!;
  await anna.updateItem('L1', milk, { done: true });
  await sleep(500);

  console.log('\n--- anna retries the same command twice (same clientRequestId)');
  const retry = { listId: 'L1', title: 'Only once please', clientRequestId: 'demo-retry-1' };
  const first = await anna.send('/app/todo.upsert', retry);
  const second = await anna.send('/app/todo.upsert', retry);
  console.log(`first ack duplicate=${first.duplicate}, second ack duplicate=${second.duplicate}`);
  await sleep(500);

  console.log('\n--- anna edits with a stale version → CONFLICT (connection stays open)');
  try {
    await anna.updateItem('L1', { ...milk, version: 0 }, { title: 'Buy oat milk' });
  }
  catch (e) {
    console.log(`anna got: ${e instanceof CommandError ? e.error.code : String(e)}`);
  }
  await sleep(500);

  console.log('\n--- carol (not a member) tries to read L1 over REST');
  const carolRes = await fetch(`${BASE_URL}/api/lists/L1`, {
    headers: { Authorization: `Bearer ${await devToken('carol')}` },
  });
  console.log(`carol GET /api/lists/L1 → HTTP ${carolRes.status}`);

  stopWatching();
  await anna.stop();
  await bob.stop();
  console.log('\ndone');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
