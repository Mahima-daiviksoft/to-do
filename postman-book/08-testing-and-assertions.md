# Chapter 8 — Testing and Assertions in Depth

> 🧒 A **test** is a **question with a yes/no answer** about the reply: "Did the server say OK?" "Is the name Asha?" "Was it fast?" Postman shows a ✅ or ❌ for each question.

---

## 8.1 Anatomy of a Postman test

```javascript
pm.test("Test name shown in results", function () {
    // assertions; if anything throws → FAIL, else → PASS
    pm.response.to.have.status(200);
});
```
- `pm.test(name, fn)` registers a test.
- Inside, use **`pm.expect(...)`** (Chai BDD) or **`pm.response.to...`** (Postman's response assertions).
- Results appear in **Test Results** tab, the Runner, Newman/CLI reports.
- Tests can be in **any** post-response script (collection/folder/request) — and even pre-request scripts (rare, e.g. validate preconditions).

### Assertion messages (custom failure text)
```javascript
pm.expect(json.total, "total should equal sum of items").to.eql(expectedTotal);
```

---

## 8.2 Postman's response assertions (`pm.response.to.*`)

| Assertion | Meaning |
|---|---|
| `pm.response.to.have.status(200)` | Status code equals 200 |
| `pm.response.to.have.status("Created")` | Reason phrase equals "Created" |
| `pm.response.to.be.ok` | Status is exactly **200** |
| `pm.response.to.be.success` | Status is **2xx** |
| `pm.response.to.be.accepted` | 202 |
| `pm.response.to.be.redirection` | 3xx |
| `pm.response.to.be.clientError` | 4xx |
| `pm.response.to.be.serverError` | 5xx |
| `pm.response.to.be.error` | 4xx or 5xx |
| `pm.response.to.be.badRequest` / `.unauthorized` / `.forbidden` / `.notFound` / `.rateLimited` | 400 / 401 / 403 / 404 / 429 |
| `pm.response.to.not.be.error` | negation works with `.not` |
| `pm.response.to.have.header("Content-Type")` | Header exists |
| `pm.response.to.have.header("Content-Type", "application/json; charset=utf-8")` | Header exact value |
| `pm.response.to.have.body("exact text")` | Body exact match |
| `pm.response.to.have.jsonBody()` | Body is JSON |
| `pm.response.to.have.jsonBody("data.user.name")` | JSON has path |
| `pm.response.to.have.jsonBody("data.user.name", "Asha")` | JSON path equals value |
| `pm.response.to.have.jsonSchema(schema)` | Validates against JSON Schema (uses Ajv) |
| `pm.response.to.be.json` | Content is JSON |
| `pm.response.to.be.withBody` | Has a body |

> 🎯 **Interview trap:** `pm.response.to.be.ok` checks **200 only**, not "any 2xx". For "any success" use `.to.be.success` or `pm.expect(pm.response.code).to.be.within(200, 299)`.

---

## 8.3 Chai `pm.expect` — the complete toolkit

### Equality
```javascript
pm.expect(5).to.equal(5);                         // strict ===
pm.expect({a:1}).to.eql({a:1});                   // deep equality
pm.expect({a:1}).to.deep.equal({a:1});            // same as eql
pm.expect("1").to.not.equal(1);                   // strict: string vs number
```
> ❗ `equal` on objects/arrays compares **references** → fails for two separate but identical objects. Use **`eql`**/`deep.equal`.

### Types
```javascript
pm.expect(json.id).to.be.a("number");
pm.expect(json.name).to.be.a("string");
pm.expect(json.tags).to.be.an("array");
pm.expect(json.address).to.be.an("object");
pm.expect(json.active).to.be.a("boolean");
pm.expect(json.manager).to.be.null;
pm.expect(json.deletedAt).to.be.undefined;
pm.expect(json.id).to.exist;                      // not null/undefined
```

### Truthiness
```javascript
pm.expect(json.active).to.be.true;
pm.expect(json.blocked).to.be.false;
pm.expect(json.list).to.be.empty;                 // [], "", {}
pm.expect(json.list).to.not.be.empty;
pm.expect(json.name).to.be.ok;                    // Chai .ok = truthy (different from pm.response.to.be.ok!)
```

### Numbers
```javascript
pm.expect(json.price).to.be.above(0);             // >
pm.expect(json.price).to.be.below(10000);         // <
pm.expect(json.qty).to.be.at.least(1);            // >=
pm.expect(json.qty).to.be.at.most(99);            // <=
pm.expect(json.rating).to.be.within(1, 5);        // inclusive
pm.expect(0.1 + 0.2).to.be.closeTo(0.3, 0.0001);  // floating point!
```

### Strings
```javascript
pm.expect(json.email).to.include("@");
pm.expect(json.email).to.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/);
pm.expect(json.code).to.have.lengthOf(6);
pm.expect(json.status).to.be.oneOf(["PENDING", "PAID", "SHIPPED"]);
pm.expect(json.name).to.not.include("<script>");
```

### Objects
```javascript
pm.expect(json).to.have.property("id");
pm.expect(json).to.have.property("status", "PAID");             // property + value
pm.expect(json).to.have.nested.property("address.city", "Pune");
pm.expect(json).to.have.all.keys("id", "name", "email");        // exactly these keys
pm.expect(json).to.include.all.keys("id", "name");              // at least these keys
pm.expect(json).to.have.any.keys("phone", "email");
pm.expect(json).to.deep.include({ status: "PAID", currency: "INR" }); // subset match
pm.expect(json).to.not.have.property("password");               // security!
```

### Arrays
```javascript
pm.expect(json.items).to.have.lengthOf(3);
pm.expect(json.items).to.have.lengthOf.at.least(1);
pm.expect(json.tags).to.include("sale");
pm.expect(json.tags).to.have.members(["sale", "new"]);          // same members, any order
pm.expect(json.tags).to.include.members(["sale"]);              // subset
pm.expect(json.items).to.deep.include({ sku: "A1", qty: 2 });   // contains this object
pm.expect([1, 2, 3]).to.satisfy(arr => arr.every(n => n > 0));
```

### Custom logic
```javascript
pm.expect(json.total).to.satisfy(t => t === json.items.reduce((s, i) => s + i.price * i.qty, 0));
```

### Negation & chaining
All can be negated with `.not`. Language chains (`to, be, been, is, that, which, and, has, have, with, at, of, same`) are just for readability.

---

## 8.4 The essential test suite for any endpoint

```javascript
const json = pm.response.json();

// 1. Status
pm.test("Status code is 200", () => pm.response.to.have.status(200));

// 2. Headers
pm.test("Content-Type is JSON", () => {
    pm.expect(pm.response.headers.get("Content-Type")).to.include("application/json");
});

// 3. Performance (SLA)
pm.test("Response time < 800ms", () => pm.expect(pm.response.responseTime).to.be.below(800));

// 4. Structure / schema
pm.test("Body has required fields", () => {
    pm.expect(json).to.include.all.keys("id", "name", "email", "createdAt");
});

// 5. Data types
pm.test("Field types are correct", () => {
    pm.expect(json.id).to.be.a("number");
    pm.expect(json.email).to.be.a("string");
    pm.expect(new Date(json.createdAt).toString()).to.not.eql("Invalid Date");
});

// 6. Business values
pm.test("Returns the requested user", () => {
    pm.expect(json.id).to.eql(Number(pm.collectionVariables.get("userId")));
});

// 7. Security
pm.test("No sensitive fields leaked", () => {
    pm.expect(json).to.not.have.any.keys("password", "passwordHash", "ssn");
});
```

---

## 8.5 JSON Schema validation (contract testing)

> 🧒 A **schema** is a **cookie cutter**. Every cookie (response) must fit the cutter's shape. If a cookie is missing a corner (a field) or has the wrong filling (type), it doesn't fit.

### Schema example
```javascript
const schema = {
    type: "object",
    required: ["id", "name", "email", "address"],
    additionalProperties: false,          // strict contract: no unexpected fields
    properties: {
        id:    { type: "integer", minimum: 1 },
        name:  { type: "string", minLength: 1 },
        email: { type: "string", pattern: "^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$" },
        phone: { type: ["string", "null"] },
        role:  { type: "string", enum: ["admin", "user", "viewer"] },
        address: {
            type: "object",
            required: ["city"],
            properties: { city: { type: "string" }, zip: { type: "string" } }
        },
        tags: { type: "array", items: { type: "string" }, uniqueItems: true }
    }
};
```

### Option 1 — built-in assertion (simplest)
```javascript
pm.test("Matches schema", () => pm.response.to.have.jsonSchema(schema));
```

### Option 2 — Ajv directly (full control & readable errors)
```javascript
const Ajv = require("ajv");
const ajv = new Ajv({ allErrors: true });
const validate = ajv.compile(schema);
const valid = validate(pm.response.json());

pm.test("Response matches schema", () => {
    pm.expect(valid, JSON.stringify(validate.errors, null, 2)).to.be.true;
});
```

### Tips
- Keep schemas in a **collection variable** (as JSON string) or the **Package Library**, not copy-pasted per request:
```javascript
const schema = JSON.parse(pm.collectionVariables.get("userSchema"));
```
- Use `$ref`/`definitions` for reused sub-schemas; register them with `ajv.addSchema()`.
- The sandbox's Ajv version determines support for `format` (e.g. `email`, `date-time`) and newer drafts. If formats aren't enforced, use `pattern` regexes, or verify the version in your sandbox docs.
- `tv4` is deprecated (draft-04 only) — migrate to Ajv.
- **Arrays of objects**: `{ type: "array", items: userSchema, minItems: 1 }`.
- Contract source of truth = the **OpenAPI spec**. Generate schemas from it rather than writing by hand. Postman's **Spec Hub** can generate collections from OpenAPI and can validate requests/responses against the spec (contract tests) — Chapter 12.

---

## 8.6 Testing arrays, lists, sorting, pagination

```javascript
const data = pm.response.json().data;

pm.test("All items are active", () => {
    data.forEach((u, i) => pm.expect(u.status, `item ${i}`).to.eql("active"));
});

pm.test("IDs are unique", () => {
    const ids = data.map(d => d.id);
    pm.expect(new Set(ids).size).to.eql(ids.length);
});

pm.test("Sorted by price ascending", () => {
    const prices = data.map(d => d.price);
    const sorted = [...prices].sort((a, b) => a - b);
    pm.expect(prices).to.eql(sorted);
});

pm.test("Sorted by createdAt descending", () => {
    const t = data.map(d => Date.parse(d.createdAt));
    t.slice(1).forEach((v, i) => pm.expect(v).to.be.at.most(t[i]));
});

pm.test("Page size honoured", () => {
    pm.expect(data.length).to.be.at.most(Number(pm.request.url.query.get("limit")));
});

pm.test("Filter works (category=shoes)", () => {
    pm.expect(data.every(p => p.category === "shoes")).to.be.true;
});
```
> Note: `.sort()` without comparator sorts **as strings** (`[10, 9, 1] → [1, 10, 9]`). Always pass `(a,b) => a-b` for numbers and `localeCompare` for strings.

---

## 8.7 Testing headers, cookies, and security headers
```javascript
pm.test("Has correlation id echoed", () => {
    pm.expect(pm.response.headers.get("X-Correlation-ID")).to.eql(pm.request.headers.get("X-Correlation-ID"));
});
pm.test("Security headers present", () => {
    const h = pm.response.headers;
    pm.expect(h.get("Strict-Transport-Security")).to.exist;
    pm.expect(h.get("X-Content-Type-Options")).to.eql("nosniff");
    pm.expect(h.has("X-Powered-By")).to.be.false;
});
pm.test("Session cookie is HttpOnly & Secure", () => {
    // Parse the raw Set-Cookie headers: works in the app AND Newman
    // (pm.response.cookies was empty in Newman 6.2.3 during verification)
    const setCookies = pm.response.headers.all()
        .filter(h => h.key.toLowerCase() === "set-cookie")
        .map(h => h.value);
    const session = setCookies.find(v => v.startsWith("sessionId="));
    pm.expect(session, "sessionId cookie").to.exist;
    pm.expect(session).to.match(/;\s*HttpOnly/i);
    pm.expect(session).to.match(/;\s*Secure/i);
});
pm.test("Cookie stored in jar", () => pm.expect(pm.cookies.has("sessionId")).to.be.true);
pm.test("Cache disabled for user data", () => {
    pm.expect(pm.response.headers.get("Cache-Control")).to.match(/no-store|private/);
});
```

---

## 8.8 Negative testing patterns

Same endpoint, broken inputs — expect correct **error codes and messages**, never 500.

| Case | Body | Expected |
|---|---|---|
| Missing required field | `{}` | 400 + message naming field |
| Wrong type | `{"qty":"two"}` | 400/422 |
| Boundary min-1 | `{"qty":0}` | 400/422 |
| Boundary max+1 | `{"qty":1000}` (max 999) | 400/422 |
| Too long string | 256 chars when max 255 | 400/422 |
| Invalid enum | `{"status":"FLYING"}` | 400/422 |
| Malformed JSON | `{"qty":1,` | 400 |
| Wrong Content-Type | text/plain | 415 |
| Duplicate | same email twice | 409 |
| No auth | — | 401 |
| Wrong role | user token on admin endpoint | 403 |
| Non-existent ID | `/orders/999999999` | 404 |
| Wrong method | `DELETE /health` | 405 |
| SQL/NoSQL injection strings | `"' OR 1=1 --"`, `{"$gt":""}` | 400 and no data leak |
| Huge payload | 20 MB | 413 |

Reusable negative test:
```javascript
const expected = Number(pm.iterationData.get("expectedStatus") || pm.variables.get("expectedStatus"));
pm.test(`Status is ${expected}`, () => pm.response.to.have.status(expected));
if (expected >= 400) {
    pm.test("Error body has standard shape", () => {
        const err = pm.response.json();
        pm.expect(err).to.include.keys("code", "message");
        pm.expect(err.message).to.be.a("string").and.not.empty;
    });
    pm.test("No stack traces leaked", () => {
        pm.expect(pm.response.text()).to.not.match(/at\s+\w+\s+\(.*:\d+:\d+\)|Exception|Traceback/);
    });
}
```
Data-drive this with a CSV (Chapter 10).

---

## 8.9 Response time & performance assertions
```javascript
const sla = Number(pm.environment.get("slaMs") || 1000);
pm.test(`Response under ${sla} ms`, () => pm.expect(pm.response.responseTime).to.be.below(sla));
```
- Single-request timing in Postman includes your network; set environment-specific SLAs (QA servers are slower).
- For real load testing use Postman's **Performance tab** in the Runner or dedicated tools (Chapter 10).

---

## 8.10 Testing across requests (stateful assertions)

```javascript
// In "Create order" post-response:
pm.collectionVariables.set("createdOrder", JSON.stringify(pm.response.json()));

// In "Get order" post-response:
const created = JSON.parse(pm.collectionVariables.get("createdOrder"));
const fetched = pm.response.json();
pm.test("GET returns what POST created", () => {
    pm.expect(fetched).to.deep.include({ id: created.id, total: created.total, status: created.status });
});
```

---

## 8.11 Comparing responses / snapshot testing

```javascript
// Compare this response to a saved "golden" snapshot, ignoring volatile fields
// use the global `_` (lodash); re-declaring `const _` would throw a SyntaxError
const omitVolatile = obj => _.omit(obj, ["createdAt", "updatedAt", "requestId"]);
const current = omitVolatile(pm.response.json());

const snapshot = pm.collectionVariables.get("snapshot_getProduct");
if (!snapshot) {
    pm.collectionVariables.set("snapshot_getProduct", JSON.stringify(current));
    console.warn("Snapshot created");
} else {
    pm.test("Matches snapshot", () => pm.expect(current).to.eql(JSON.parse(snapshot)));
}
```

---

## 8.12 Tests in collection/folder scripts (DRY)

Collection-level post-response, runs after **every** request:
```javascript
// Generic checks for all requests
pm.test(`[${pm.info.requestName}] no 5xx`, () => pm.expect(pm.response.code).to.be.below(500));
pm.test(`[${pm.info.requestName}] responds < 3s`, () => pm.expect(pm.response.responseTime).to.be.below(3000));

if (pm.response.headers.get("Content-Type")?.includes("json") && pm.response.text()) {
    pm.test(`[${pm.info.requestName}] valid JSON`, () => pm.response.json());
}
```

Folder-level "expected status" via request description or variable convention:
```javascript
// Requests named like "Create order - missing items (400)"
const m = pm.info.requestName.match(/\((\d{3})\)$/);
if (m) pm.test(`Expected status ${m[1]}`, () => pm.response.to.have.status(Number(m[1])));
```

---

## 8.13 Asynchronous tests
Tests inside callbacks work because Postman waits for pending callbacks/timers:
```javascript
pm.sendRequest(pm.variables.replaceIn("{{baseUrl}}/orders/{{orderId}}"), (err, res) => {
    pm.test("Order persisted", () => pm.expect(res.code).to.eql(200));
});
```
With `async/await`: top-level `await` works only in recent Postman app versions, **not in Newman 6** (verified). For portability wrap `pm.sendRequest` in a Promise inside an async IIFE (Chapter 7.8) and always `.catch()` — an unhandled rejection can silently skip a test.

---

## 8.14 Skipping and conditional tests
```javascript
pm.test.skip("Pending until BUG-123 fixed", () => { /* ... */ });

const feature = pm.environment.get("featureNewPricing") === "true";
(feature ? pm.test : pm.test.skip)("New pricing applied", () => {
    pm.expect(pm.response.json().pricingVersion).to.eql(2);
});
```

---

## 8.15 Postbot & AI-assisted tests
- **Postbot** (and newer **Agent Mode**) can: generate tests from a response, add schema checks, fix failing tests, write documentation, visualize responses, explain errors.
- Always **review** AI-generated tests: they tend to assert *whatever the current response is* (which might be a bug!). Tests must reflect the **specification**, not the current behaviour.

---

## 8.16 Test design principles (what seniors know)
1. **Test the contract, not the implementation.** Assert what the API promises (spec), not incidental details (field order, exact error wording unless contractual).
2. **Independent tests**: each request should create the data it needs or rely on a well-defined setup folder. Avoid "works only if run after request #7 from yesterday".
3. **Deterministic data**: unique emails/IDs per run (`runId`), cleanup after.
4. **One concern per `pm.test`** → clearer failures. But don't create 50 trivial tests per request either.
5. **Meaningful names**: `"POST /orders - 400 when items empty"`.
6. **Avoid brittle assertions**: timestamps, random IDs, ordering when unordered → use `include`, `members`, regex, ranges.
7. **Positive + negative + boundary + security** for every important endpoint.
8. **Fail fast on setup**: if login fails, stop the run (`pm.execution.setNextRequest(null)`) instead of 300 cascading failures.
9. **Keep SLAs per environment**.
10. **Review tests like code** (PRs/forks).

---

## 8.17 Common testing bugs and fixes

| Symptom | Cause | Fix |
|---|---|---|
| `JSONError: Unexpected token '<'` | Response is HTML (login page, 502 page), not JSON | Check status first; inspect body in Console; fix auth/URL |
| `AssertionError: expected { Object } to equal { Object }` | Used `equal` instead of `eql` | Use `eql` / `deep.equal` |
| `expected '5' to equal 5` | String vs number (variables used in `{{ }}` become strings; CSV data types vary) | `Number(...)` or `parseInt` |
| Test passes but should fail | Assertion outside `pm.test`, or `pm.expect` without assertion method (`pm.expect(x).to.be` with nothing) | Ensure a terminal assertion; place inside `pm.test` |
| Test never runs | Code path skipped, script error earlier in the script | Check Console for script errors |
| `Cannot read properties of undefined (reading 'x')` | Path wrong / field missing | Use optional chaining `json.data?.x`; log body |
| Test passes locally, fails in CI | Different env/data, timing, secrets missing | Log env name & key vars (not secrets), add waits/polling |
| Sorting test flaky | Equal values in non-stable order / locale | Compare with tie-breaker; use `localeCompare` |
| Floating point mismatch | `0.1+0.2` | `closeTo` or round to cents |
| Timezone failures | Server in UTC, local IST (+5:30) | Compare ISO strings in UTC; use `moment.utc()` |

---

## 8.18 Chapter 8 Quick Revision
- `pm.test` + `pm.expect` (Chai) + `pm.response.to.*`.
- `pm.response.to.be.ok` = 200 only; `.success` = 2xx.
- `equal` (strict/reference) vs `eql` (deep).
- Schema validation: `pm.response.to.have.jsonSchema(schema)` or Ajv; tv4 deprecated.
- Write positive, negative, boundary, security, performance, contract tests.
- Put generic checks at collection level.

➡️ Next: **Chapter 9 — Request Chaining & Workflows**.
