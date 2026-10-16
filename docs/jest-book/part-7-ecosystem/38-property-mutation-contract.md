# Chapter 38 — Property-Based, Mutation and Contract Testing (Deep Dive)

> 🧸 **Explain it like I'm 5**
>
> - **Property-based testing:** instead of checking 3 examples, you tell the robot a **rule**
>   ("sorting never changes how many items there are") and it tries **hundreds of random toys** to
>   break the rule.
> - **Mutation testing:** a mischievous robot **breaks your code on purpose** in tiny ways. If your
>   tests don't notice, your tests are too weak.
> - **Contract testing:** two teams write down a **promise** ("when you ask for user 1, I'll send
>   `{id, name}`"), and each side checks it keeps the promise — without running both apps together.

Verified (October 2026, Jest 30.5.2): fast-check 4.10 (3 tests), Stryker 10 (with real mutation
reports), Pact JS 17.1 (consumer test + provider verification).

---

## Part A — Property-based testing with fast-check

### 38.1 The idea

```js
const fc = require('fast-check');

const slugify = (s) => s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

test('output only has safe characters', () => {
  fc.assert(fc.property(fc.string(), (s) => /^[a-z0-9-]*$/.test(slugify(s))));
});

test('idempotent: slugify(slugify(x)) === slugify(x)', () => {
  fc.assert(fc.property(fc.string(), (s) => slugify(slugify(s)) === slugify(s)));
});
```

`fc.assert` runs the property 100 times (default `numRuns`) with generated inputs. A property
returns `true`/`false` or throws (so `expect` works inside).

### 38.2 Shrinking — the killer feature (verified)

```js
const buggyMax = (arr) => arr.reduce((m, x) => (x > m ? x : m), 0);   // bug: initial value 0

fc.assert(
  fc.property(fc.array(fc.integer(), { minLength: 1 }), (arr) => buggyMax(arr) === Math.max(...arr)),
  { seed: 42 },
);
// Actual output (fast-check 4.10):
// Property failed after 1 tests
// { seed: 42, path: "0:1:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0", endOnFailure: true }
// Counterexample: [[-1]]          ← the SMALLEST failing input
// Shrunk 27 time(s)               ← from a larger random array down to [-1]
```

fast-check prints the **seed** and **path** so you can replay the exact failure:
`fc.assert(prop, { seed, path })`. Put the seed in the bug ticket.

### 38.3 Common property patterns

| Pattern | Example |
| --- | --- |
| **Round trip** | `decode(encode(x)) === x`, `parse(stringify(x))` |
| **Invariant** | sort keeps length and elements; balance never negative |
| **Idempotence** | `f(f(x)) === f(x)` (normalize, slugify, dedupe) |
| **Oracle / reference** | compare fast implementation with a simple, slow, obviously-correct one |
| **Metamorphic** | `search(q + ' extra')` returns a subset of `search(q)` |
| **Commutativity** | `merge(a, b)` equals `merge(b, a)` for sets |
| **No crash** | parser never throws on arbitrary input (fuzzing) |

### 38.4 Arbitraries you'll use

`fc.integer({min,max})`, `fc.nat()`, `fc.float({noNaN: true})`, `fc.string()`,
`fc.stringMatching(/re/)`, `fc.emailAddress()`, `fc.uuid()`, `fc.date()`, `fc.array(a, {minLength})`,
`fc.uniqueArray`, `fc.record({ id: fc.uuid(), age: fc.nat(120) })`, `fc.oneof(a, b)`,
`fc.constantFrom('a','b')`, `fc.option(a)`, `fc.tuple(...)`, `fc.dictionary`, `fc.json()`,
`.map(fn)`, `.filter(fn)` (use sparingly), `.chain(fn)`, and `fc.letrec` for recursive structures.
Async properties: `await fc.assert(fc.asyncProperty(arb, async (x) => { ... }))`.

`@fast-check/jest` adds `test.prop([fc.string()])('name', (s) => ...)` syntax and integrates seeds
with Jest output.

### 38.5 When it pays off

Parsers, serializers, money/date math, validation, data structures, state machines (model-based
testing with `fc.commands`), anything with many edge cases. Keep a few **example-based** tests too —
they document intent; properties find what you didn't think of.

---

## Part B — Mutation testing with Stryker

### 38.6 A real run (verified)

Code and tests:

```js
// discount.js
function discount(total, isMember) {
  if (total >= 100 && isMember) return total * 0.9;
  return total;
}
module.exports = { discount };
```

```js
// discount.test.js — 100% LINE coverage
test('members over 100 get 10% off', () => { expect(discount(200, true)).toBe(180); });
test('non-members pay full price', () => { expect(discount(200, false)).toBe(200); });
```

```json
// stryker.config.json
{
  "testRunner": "jest",
  "mutate": ["mut/discount.js"],
  "jest": { "configFile": "jest.mut.config.js" },
  "reporters": ["clear-text"],
  "coverageAnalysis": "perTest",
  "concurrency": 2
}
```

```bash
npm i -D @stryker-mutator/core @stryker-mutator/jest-runner
npx stryker run
```

Actual output:

```
[Survived] ConditionalExpression
mut/discount.js:2:7
-     if (total >= 100 && isMember) return total * 0.9;
+     if (true && isMember) return total * 0.9;

[Survived] EqualityOperator
mut/discount.js:2:7
-     if (total >= 100 && isMember) return total * 0.9;
+     if (total > 100 && isMember) return total * 0.9;

File         | % Mutation score | # killed | # survived
All files    |            77.78 |        7 |          2
```

**100% coverage, 77.78% mutation score.** The survivors tell you exactly which tests are missing: a
member **under 100**, and the **boundary of exactly 100**. After adding:

```js
test('exactly 100 qualifies (boundary)', () => { expect(discount(100, true)).toBe(90); });
test('members under 100 pay full price', () => { expect(discount(99, true)).toBe(99); });
```

the score is **100%** (verified: 9 killed, 0 survived).

### 38.7 Stryker in practice

- Mutators: arithmetic, equality (`>`→`>=`), logical (`&&`→`||`), conditional (`if (x)`→`if (true)`),
  string literals, array declarations, block removal, optional chaining, etc.
- `coverageAnalysis: "perTest"` runs only tests that cover each mutant → much faster.
- **Incremental mode** (`--incremental`) reuses previous results; run on changed files in PRs, full
  runs nightly.
- `thresholds: { high: 80, low: 60, break: 50 }` fails CI below `break`.
- Equivalent mutants (changes that don't alter behaviour) exist; ignore them with
  `// Stryker disable next-line <mutator>: reason`.
- Cost: runs your tests many times → start with critical modules (`mutate` globs).

---

## Part C — Contract testing with Pact

### 38.8 Consumer side (verified, Pact JS 17 / PactV4)

```js
// userClient.js — the consumer's HTTP client
async function getUser(baseUrl, id) {
  const res = await fetch(`${baseUrl}/users/${id}`, { headers: { Accept: 'application/json' } });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}
module.exports = { getUser };
```

```js
// userClient.pact.test.js
const path = require('node:path');
const { PactV4, MatchersV3 } = require('@pact-foundation/pact');
const { getUser } = require('./userClient');
const { like, integer } = MatchersV3;

const provider = new PactV4({
  consumer: 'web-app',
  provider: 'user-service',
  dir: path.resolve(__dirname, '../pacts'),
});

describe('user-service contract', () => {
  test('returns an existing user', () =>
    provider
      .addInteraction()
      .given('user 1 exists')
      .uponReceiving('a request for user 1')
      .withRequest('GET', '/users/1', (b) => b.headers({ Accept: 'application/json' }))
      .willRespondWith(200, (b) => b.jsonBody({ id: integer(1), name: like('Ann') }))
      .executeTest(async (mockServer) => {
        await expect(getUser(mockServer.url, 1)).resolves.toEqual({ id: 1, name: 'Ann' });
      }));

  test('returns null for a missing user', () =>
    provider
      .addInteraction()
      .given('user 9 does not exist')
      .uponReceiving('a request for user 9')
      .withRequest('GET', '/users/9', (b) => b.headers({ Accept: 'application/json' }))
      .willRespondWith(404)
      .executeTest(async (mockServer) => {
        await expect(getUser(mockServer.url, 9)).resolves.toBeNull();
      }));
});
```

Pact starts a mock provider, your real client calls it, and the interactions are written to
`pacts/web-app-user-service.json` — the **contract**. `like()`/`integer()` mean "any value of this
type", so the provider isn't forced to return exactly `"Ann"`.

### 38.9 Provider side (verified)

```js
const http = require('node:http');
const path = require('node:path');
const { Verifier } = require('@pact-foundation/pact');

let server;
let users;

beforeAll(async () => {
  server = http.createServer((req, res) => {
    const m = req.url.match(/^\/users\/(\d+)$/);
    const user = m && users[m[1]];
    if (!user) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(user));
  });
  await new Promise((r) => server.listen(0, r));
});
afterAll(() => new Promise((r) => server.close(r)));

test('user-service honours the web-app contract', () =>
  new Verifier({
    provider: 'user-service',
    providerBaseUrl: `http://127.0.0.1:${server.address().port}`,
    pactUrls: [path.resolve(__dirname, '../pacts/web-app-user-service.json')],
    stateHandlers: {                                   // set up data for each "given"
      'user 1 exists': async () => { users = { 1: { id: 1, name: 'Ann' } }; },
      'user 9 does not exist': async () => { users = {}; },
    },
    logLevel: 'error',
  }).verifyProvider(), 30_000);
```

⚠️ **Real gotcha found while verifying:** in an environment with `HTTP_PROXY`/`HTTPS_PROXY` set
(common in corporate networks and CI), the Pact verifier (Rust core) sent the requests to
`127.0.0.1` **through the proxy**, which rejected them (`403`, "request blocked"), producing
confusing "expected 200 but was 403" mismatches. Setting `NO_PROXY=127.0.0.1,localhost` was not
enough in that environment; running the verification step **with the proxy variables unset** fixed
it (`Tests: 1 passed`).

### 38.10 Pact in an organisation

- Publish contracts to a **Pact Broker** / PactFlow from consumer CI; providers fetch and verify
  them (`pactBrokerUrl`, `consumerVersionSelectors`, `publishVerificationResult`).
- `can-i-deploy` checks before releasing either side.
- Contracts should capture what the consumer **actually uses** (not the whole API) and use matchers,
  not exact values.
- Provider states (`given`) are your data fixtures; keep them small and fast.
- Pact replaces many slow end-to-end tests between services, not unit tests.

## 38.11 Summary

| Technique | Answers | Tool |
| --- | --- | --- |
| Property-based | "Does my rule hold for all inputs?" | fast-check (+ `@fast-check/jest`) |
| Mutation | "Would my tests notice a bug?" | Stryker (`@stryker-mutator/jest-runner`) |
| Contract | "Do these two services agree?" | Pact (`PactV4`, `Verifier`, Broker) |

**Next:** [Chapter 39 — E2E and real browsers](39-e2e-and-real-browsers.md)
