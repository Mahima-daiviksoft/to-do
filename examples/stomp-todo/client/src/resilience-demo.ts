/**
 * Resilience demo: shows reconnect with backoff, re-subscription and resync after a server restart.
 *
 *   1. start the server:            cd ../server && mvn spring-boot:run
 *   2. run this script:             npm run resilience
 *   3. when it prints "RESTART THE SERVER NOW", stop the server (Ctrl+C) and start it again within ~20 s.
 *
 * Expected: bob goes "reconnecting" → "live", re-subscribes, notices the server's sequence went backwards
 * (in-memory state was lost), reloads the snapshot, and then receives anna's new item live.
 * Set DEBUG=1 to see stompjs frames (note: debug output includes the CONNECT token, so never enable it in production).
 */
import { TodoRealtimeClient } from './TodoRealtimeClient';

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:8080';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function devToken(user: string): Promise<string> {
  const res = await fetch(`${BASE_URL}/api/dev-token`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ user }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return ((await res.json()) as { token: string }).token;
}

const clientFor = (user: string) => new TodoRealtimeClient({
  baseUrl: BASE_URL,
  getToken: () => devToken(user),                 // throws while the server is down; the client copes with that
  debug: process.env.DEBUG ? (m) => console.log(`[${user}] ${m}`) : undefined,
});

const bob = clientFor('bob');
const anna = clientFor('anna');
bob.onStatus((s) => console.log(`bob: ${s}`));
bob.watchList('L1', (s) => {
  if (!s.syncing) console.log(`bob sees L1 @seq ${s.seq}: ${JSON.stringify(s.items.map((i) => i.title))}`);
});
bob.start();
anna.start();
await sleep(1500);

await anna.addItem('L1', 'before restart');
console.log('\n>>> RESTART THE SERVER NOW (you have ~20 seconds) <<<\n');
await sleep(25_000);

// anna's command is queued while she is offline and sent after her client reconnects.
await anna.addItem('L1', 'after restart');
await sleep(1500);
await anna.stop();
await bob.stop();
