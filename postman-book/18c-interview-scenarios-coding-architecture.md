# Chapter 18C — Scenario-Based, Live-Coding, Architecture & Behavioural Interview Questions

> Experienced-level interviews focus on **"what would you do if…"**, **"write a script for…"**, and **"design a framework for…"**. Use the **STAR** pattern for experience questions (Situation, Task, Action, Result) and **think aloud** for scenarios.

---

## Part 8 — Scenario-based questions

**S1. Your request returns 401 although you set the token. How do you debug?**
1) Console: is the `Authorization` header actually sent and correctly formatted (`Bearer <token>`, no extra spaces/newlines)? 2) Variable resolved and from the right scope/environment? 3) Request auth "Inherit" but parent "No Auth", or a manual header conflicting with Auth tab? 4) Token expired → decode JWT (`exp`), check `aud`/`iss`/scopes for this API/environment. 5) Clock skew for signed schemes. 6) Try the token via cURL. 7) Fix with an auto-refresh pre-request script.

**S2. API works in Postman but the frontend gets an error. Why?**
Most likely CORS — browsers enforce it, Postman desktop doesn't. Check browser console, preflight `OPTIONS` response headers. Also compare headers/body via DevTools "Copy as cURL", cookies with `SameSite`, mixed content (https page → http API).

**S3. Tests pass locally but fail in Jenkins. What do you check?**
Environment file & `--env-var` secrets passed; Vault/local values not available in CI; interactive OAuth; file upload paths/`--working-dir`; Newman version vs features; corporate CA/proxy on agents (`--ssl-extra-ca-certs`, `HTTP_PROXY`); network access from CI to the env; timing/timeouts; parallel jobs sharing data; run with `--verbose`.

**S4. How would you test a login API completely?**
Positive (valid creds → 200, token structure/expiry, refresh token), negative (wrong password, unknown user — same generic error, empty fields, wrong types, SQLi strings, very long input), security (lockout/429 after N attempts, HTTPS only, no password in response/logs, token invalid after logout, token tampering), headers (no-cache), performance (SLA), data-driven via CSV.

**S5. How would you test a "Create Order" API?**
Contract (schema, status 201, Location header), business rules (total = Σ price×qty, tax, discounts, stock decrement, status PENDING), validation (empty items, qty 0/negative/max+1, invalid SKU, wrong currency), auth (no token 401, other user's cart 403/404), idempotency (Idempotency-Key retry → no duplicate), concurrency (two orders for the last item), side effects (inventory, payment intent, events), performance, cleanup.

**S6. How do you test an API that processes asynchronously (returns 202)?**
Assert 202 + job/status URL; poll the status endpoint with max attempts and delay until COMPLETED/FAILED; assert final result; test timeout behaviour and failure path; avoid fixed waits.

**S7. You have to run the same request for 500 users. How?**
Data-driven run with a CSV/JSON file of users (Runner or Newman `-d`), `{{username}}` placeholders, `pm.iterationData` assertions with expected values per row; for concurrency, the Performance tab or k6.

**S8. Backend isn't ready — how do you start testing?**
Get/define the OpenAPI contract; create examples and a mock server; write tests against mock (structure, flows); switch `baseUrl` to real API once deployed; contract tests ensure parity.

**S9. A test is flaky. How do you handle it?**
Reproduce and log; identify cause (timing/async, shared data, environment instability, order dependency, volatile assertions); fix root cause (polling, unique data, isolation, robust assertions); quarantine only temporarily with a ticket; never just "retry until green" for real failures.

**S10. You need to run collections against DEV, QA, STAGE with different credentials. How do you design it?**
Same collection, one environment per stage with identical variable names; secrets via Vault locally and CI secret store with `--env-var`; pipeline stage per environment with environment file; prod read-only tests only.

**S11. How do you handle dynamic data like IDs created in one request and needed later?**
Extract in post-response (`pm.collectionVariables.set("orderId", json.id)`), use `{{orderId}}`; clean up in teardown; generate unique input data with dynamic variables.

**S12. How do you verify that a DELETE actually deleted?**
Assert DELETE status (200/204), then GET the same ID → 404 (or 410); list endpoint doesn't contain it; repeat DELETE → 404 (idempotent state); related resources handled (cascade/soft delete as per spec).

**S13. The response JSON is huge (5 MB). How do you validate it efficiently?**
Validate schema once (Ajv), sample/aggregate checks (counts, sums, unique IDs via Set), avoid logging the whole body, turn off response saving in runs, use Newman for big runs, raise max response size if needed.

**S14. How do you test file upload?**
form-data with File; valid file → 201; size limit → 413; wrong type → 415/400; empty file; malicious filename; content verification (download and compare checksum via CryptoJS); keep fixtures in repo for CI.

**S15. Your API rate-limits at 100 req/min and your regression has 400 requests. What do you do?**
Add delay (`--delay-request 650`), split runs across test accounts/API keys, retry on 429 with `Retry-After`, reduce unnecessary calls (token caching), request higher limits for test environment.

**S16. How do you test pagination?**
First/middle/last pages; page size default & max; beyond last page (empty); invalid values (0, -1, "abc"); total counts consistent; no duplicates/missing items across pages (collect IDs across pages in a loop); sorting stable across pages; cursor tampering.

**S17. How do you handle SSL errors in a company network?**
Add the corporate root CA (from TLS inspection proxy) to Postman Settings → Certificates (and `--ssl-extra-ca-certs`/`NODE_EXTRA_CA_CERTS` in CI) instead of disabling verification.

**S18. How do you test an endpoint that requires a signature (HMAC)?**
Pre-request script computing signature with CryptoJS over method/path/timestamp/body (exactly as spec defines), set headers; tests for tampered body/old timestamp/replayed nonce rejected.

**S19. A teammate overwrote your collection changes. How do you prevent it?**
Restore from version history; adopt fork + pull request workflow, protect the main collection (limit editors), or move to Native Git with PR reviews.

**S20. How would you test BOLA/IDOR?**
Create resources as user B; access/modify/delete them with user A's token for every ID-based endpoint (path, query, body); expect 403/404; data-drive across endpoints; include tenant boundaries.

**S21. API returns 200 with an error message in body. What's your view & test?**
Report as a design defect (should use proper 4xx/5xx) unless contract says so (e.g., GraphQL). Test both status and body (`errors`, `success: false`).

**S22. You get `JSONError: Unexpected token '<'`. Why?**
The response is HTML (error page, login redirect, proxy page), not JSON. Check status/Content-Type, Preview tab; fix auth/URL; guard parsing in tests.

**S23. `getaddrinfo ENOTFOUND {{baseUrl}}` — what happened?**
Variable not resolved: no environment selected, wrong name/case, disabled, or not defined in any scope.

**S24. How do you share a collection with an external partner securely?**
Partner workspace (Enterprise) or a sanitised fork/public collection with a partner-specific environment template without secrets; separate credentials; least privilege; revoke on contract end.

**S25. Management wants daily API health reports. Approach?**
Monitors for prod read-only smoke checks with alerts and response-time graphs; CI nightly Newman/CLI regression on staging with HTML/JUnit reports; dashboards via Postman run history/API Catalog; Slack summaries.

**S26. You must migrate 300 legacy scripts using `tests[]` and `postman.*`.**
Plan by folder; map old → new APIs; use Find & Replace for simple patterns; refactor into shared Package Library helpers; run before/after comparison; PR review; document.

**S27. How do you test webhooks you receive (provider calls you)?**
Simulate provider POSTs from Postman to your endpoint with correctly signed payloads (HMAC header), test invalid signature/replay/old timestamp rejection, retries/idempotency on duplicate events, event ordering. To inspect what a provider sends, point it at a request bin/mock or Flows.

**S28. Login uses SSO (browser redirect, MFA). How do you automate?**
For manual testing: OAuth 2.0 Authorization Code (PKCE) with "Authorize using browser". For CI: request a non-interactive grant for test service accounts (client credentials) or test-only token endpoint/long-lived test tokens issued securely; never automate MFA bypass in prod.

**S29. How do you ensure API tests don't pollute shared QA data?**
Unique prefixed data per run (`qa-auto-<runId>`), teardown folder, cleanup jobs for leftovers, dedicated test tenants/accounts, read-only tests where possible.

**S30. How would you test API backward compatibility for v2 release?**
Run v1 regression suite against new build; contract diff between specs (no removed fields/required additions/type changes); old clients' examples still accepted; deprecation headers (`Deprecation`, `Sunset`); v2 suite separately.

---

## Part 9 — Live-coding questions (write the script)

**C1. Assert status 200, JSON content type, response time < 1s.**
```javascript
pm.test("200 OK", () => pm.response.to.have.status(200));
pm.test("JSON", () => pm.expect(pm.response.headers.get("Content-Type")).to.include("application/json"));
pm.test("< 1s", () => pm.expect(pm.response.responseTime).to.be.below(1000));
```

**C2. Extract `token` from login response and set as environment variable.**
```javascript
const { token } = pm.response.json();
pm.test("Token present", () => pm.expect(token).to.be.a("string").and.not.empty);
pm.environment.set("token", token);
```

**C3. Verify every user in an array has a valid email and unique id.**
```javascript
const users = pm.response.json();
pm.test("Emails valid", () => users.forEach(u => pm.expect(u.email).to.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)));
pm.test("IDs unique", () => pm.expect(new Set(users.map(u => u.id)).size).to.eql(users.length));
```

**C4. Find the user named "Clementine Bauch" (JSONPlaceholder /users) and save her id.**
```javascript
const u = pm.response.json().find(x => x.name === "Clementine Bauch");
pm.test("Found", () => pm.expect(u).to.exist);
pm.collectionVariables.set("userId", u.id);   // 3
```

**C5. Count posts per userId (JSONPlaceholder /posts) and assert each user has 10.**
```javascript
const counts = pm.response.json().reduce((m, p) => (m[p.userId] = (m[p.userId] || 0) + 1, m), {});
pm.test("Each user has 10 posts", () => Object.values(counts).forEach(c => pm.expect(c).to.eql(10)));
```

**C6. Generate a random email and future date in pre-request.**
```javascript
pm.variables.set("email", `user_${Date.now()}@example.com`);
const d = new Date(); d.setDate(d.getDate() + 30);
pm.variables.set("futureDate", d.toISOString().split("T")[0]);
```

**C7. Add a header with HMAC-SHA256 of the body.**
```javascript
const body = pm.variables.replaceIn(pm.request.body.raw || "");
const sig = CryptoJS.HmacSHA256(body, pm.environment.get("secret")).toString(CryptoJS.enc.Base64);
pm.request.headers.upsert({ key: "X-Signature", value: sig });
```

**C8. Basic auth header manually.**
```javascript
const creds = btoa(`${pm.environment.get("user")}:${pm.environment.get("pass")}`);
pm.request.headers.upsert({ key: "Authorization", value: `Basic ${creds}` });
```

**C9. Fetch token only if expired (pre-request).**
```javascript
if (Date.now() >= Number(pm.environment.get("tokenExp") || 0)) {
  pm.sendRequest({
    url: pm.environment.get("tokenUrl"), method: "POST",
    header: { "Content-Type": "application/x-www-form-urlencoded" },
    body: { mode: "urlencoded", urlencoded: [
      { key: "grant_type", value: "client_credentials" },
      { key: "client_id", value: pm.environment.get("clientId") },
      { key: "client_secret", value: pm.environment.get("clientSecret") } ] }
  }, (err, res) => {
    const b = res.json();
    pm.environment.set("token", b.access_token);
    pm.environment.set("tokenExp", Date.now() + (b.expires_in - 60) * 1000);
  });
}
```

**C10. Validate response against a JSON schema.**
```javascript
const schema = { type: "object", required: ["id","title","completed"],
  properties: { id: {type:"integer"}, title: {type:"string"}, completed: {type:"boolean"} } };
pm.test("Schema", () => pm.response.to.have.jsonSchema(schema));
```

**C11. Loop over IDs [1..5] calling the same request.**
```javascript
// pre-request
let ids = pm.collectionVariables.get("ids");
ids = ids ? JSON.parse(ids) : [1,2,3,4,5];
pm.collectionVariables.set("id", ids.shift());
pm.collectionVariables.set("ids", JSON.stringify(ids));
// post-response
const left = JSON.parse(pm.collectionVariables.get("ids"));
if (left.length) pm.execution.setNextRequest(pm.info.requestId);
else pm.collectionVariables.unset("ids");
```

**C12. Check prices sorted descending.**
```javascript
const p = pm.response.json().map(i => i.price);
pm.test("Desc", () => pm.expect(p).to.eql([...p].sort((a,b) => b - a)));
```

**C13. Assert response doesn't contain sensitive fields anywhere (deep).**
```javascript
const forbidden = ["password", "ssn", "secret"];
function scan(o, path = "") {
  if (o && typeof o === "object") for (const [k, v] of Object.entries(o)) {
    pm.expect(forbidden, `found ${path}${k}`).to.not.include(k.toLowerCase());
    scan(v, `${path}${k}.`);
  }
}
pm.test("No sensitive keys", () => scan(pm.response.json()));
```

**C14. Parse XML and assert a value.**
```javascript
const j = xml2Json(pm.response.text());
pm.test("Status OK", () => pm.expect(j.response.status).to.eql("OK"));
```

**C15. Compare two responses (current vs previous request).**
```javascript
// Request A post-response
pm.collectionVariables.set("respA", pm.response.text());
// Request B post-response
pm.test("Same data in A and B", () => pm.expect(pm.response.json()).to.eql(JSON.parse(pm.collectionVariables.get("respA"))));
```

**C16. Visualize users as a table.**
```javascript
pm.visualizer.set(`<table>{{#each r}}<tr><td>{{id}}</td><td>{{name}}</td></tr>{{/each}}</table>`, { r: pm.response.json() });
```

**C17. Data-driven expected status.**
```javascript
const exp = Number(pm.iterationData.get("expectedStatus"));
pm.test(`[${pm.iterationData.get("case")}] → ${exp}`, () => pm.response.to.have.status(exp));
```

**C18. Retry on 503 up to 3 times.**
```javascript
const n = Number(pm.variables.get("_n") || 0);
if (pm.response.code === 503 && n < 3) { pm.variables.set("_n", n + 1); setTimeout(() => {}, 1000 * 2 ** n); pm.execution.setNextRequest(pm.info.requestId); }
else { pm.variables.set("_n", 0); pm.test("Not 5xx", () => pm.expect(pm.response.code).to.be.below(500)); }
```

**C19. Extract value from a Set-Cookie / header.**
```javascript
pm.environment.set("session", pm.cookies.get("SESSIONID"));
pm.environment.set("location", pm.response.headers.get("Location"));
```

**C20. Assert date field is in ISO 8601 UTC and in the past.**
```javascript
const t = pm.response.json().createdAt;
pm.test("ISO UTC", () => pm.expect(t).to.match(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/));
pm.test("In past", () => pm.expect(Date.parse(t)).to.be.below(Date.now()));
```

---

## Part 10 — Architecture / senior questions

**A1. How would you design an API automation framework with Postman for a 40-microservice company?**
- Per service: reference collection (from OpenAPI, synced via Spec Hub) + test collections (smoke, regression, negative, security), owned by that team, in a domain workspace.
- Cross-service E2E collections in a QA workspace.
- Environments per stage with identical keys; secrets in Vault / CI secret store.
- Shared helpers in Package Library (`@acme/test-utils`: auth, schema validation, common assertions).
- Version control: Native Git (v12) or Git integration; PR reviews; governance linting in CI.
- CI: PR smoke (fast), post-deploy regression per env, nightly full + data-driven + security; Postman CLI with `--report-events` (results to API Catalog) or Newman with JUnit/htmlextra; quality gates.
- Monitors for prod read-only checks; alerts to on-call channels.
- Metrics: endpoint coverage vs spec, pass rate, flaky tests, execution time.
- Standards doc, onboarding, PR checklist.

**A2. Postman vs REST Assured/Karate/Playwright — when would you choose which?**
Postman: fast to build, readable by whole team, collaboration/docs/mocks/monitors built-in, CI via Newman/CLI. Code frameworks: complex logic, reusing domain code/DB checks, large-scale SDET-owned suites, IDE refactoring, strong typing, test parallelisation. Many orgs use Postman for exploration, contract & smoke suites and code frameworks for deep regression.

**A3. How do you manage test data at scale?**
Generate data via APIs in setup (not DB inserts when avoidable), unique identifiers per run, data factories in Package Library, data files for DDT in Git, teardown + periodic cleanup jobs, dedicated test tenants, synthetic PII-free data, environment-specific fixtures.

**A4. How do you measure API test coverage?**
Endpoint×method×status-code matrix from OpenAPI vs requests/tests in collections (via Postman API parsing), plus business-scenario coverage; Insights for actually-used endpoints; track over time.

**A5. How do you secure your Postman setup in an enterprise?**
SSO/SCIM, domain capture, roles least-privilege, restrict public workspaces, secret scanner, Vault with external secret managers, no secrets in shared values, audit logs, review imported collections, scrub reports/logs, API keys rotation via service accounts, data residency.

**A6. How do you handle contract changes between teams?**
Design-first with spec reviews; governance lint rules; breaking-change detection in CI (spec diff); versioning and deprecation policy; consumer notification; contract tests in both provider CI and consumer CI.

**A7. Describe a complex bug you found with Postman. (STAR)**
Example answer: *Situation*: checkout intermittently double-charged. *Task*: find root cause. *Action*: built a Postman flow sending the same payment request concurrently via `pm.sendRequest` with/without Idempotency-Key, captured correlation IDs, discovered the key was ignored when the gateway retried after 504. *Result*: fix in gateway retry logic, added idempotency regression tests to CI; zero double charges since.

**A8. How do you reduce regression suite execution time?**
Parallelise per service/folder in CI, tag smoke vs full, avoid redundant setup (token caching), replace fixed delays with polling, mock slow third parties, run heavy DDT nightly, profile slow requests.

**A9. How would you introduce Postman to a team that tests only via UI?**
Show quick wins (find bugs faster), templates, training sessions, pair on first collections, CI integration with visible reports, measure defects caught earlier.

**A10. What's your approach to reviewing someone's Postman collection?**
Structure & naming, variables/secrets hygiene, auth inheritance, assertion quality (beyond status), negative coverage, independence, script readability & reuse, docs/examples, CI readiness (no local paths/interactive auth), and a green run.

---

## Part 11 — Behavioural & HR-style (API/QA roles)

- **Tell me about your experience with Postman.** → Scope (APIs, team size), what you built (collections, scripts, CI), measurable outcomes (bugs found, time saved, coverage).
- **How do you prioritise what to test?** → Risk-based: business-critical flows, recent changes, complex logic, security-sensitive endpoints, high-traffic APIs.
- **A developer says "it works on my machine/Postman". What do you do?** → Share exact request (cURL/collection link), environment, Console logs, correlation ID; reproduce together; focus on facts.
- **How do you keep up with Postman changes?** → Release notes, Postman blog/community, learning center, POST/CON talks, Postman Academy; test new features in a sandbox workspace before adopting.
- **Have you mentored others?** → Guidelines doc, workshops, PR reviews, templates.

---

## Part 12 — Rapid-fire (one-liners)

| Question | Answer |
|---|---|
| Default Postman proxy port? | 5555 |
| Postman User-Agent? | `PostmanRuntime/<version>` |
| Console shortcut? | Ctrl+Alt+C / Cmd+Option+C |
| Send shortcut? | Ctrl/Cmd + Enter |
| Narrowest variable scope? | Local |
| Broadest? | Global |
| Data file formats? | CSV, JSON |
| Newman install? | `npm install -g newman` |
| Newman exit code on failure? | 1 |
| Stop run? | `pm.execution.setNextRequest(null)` |
| Skip request? | `pm.execution.skipRequest()` (pre-request) |
| Deep equality? | `eql` |
| 200 only? | `pm.response.to.be.ok` |
| Any 2xx? | `pm.response.to.be.success` |
| Schema validator now? | Ajv (`tv4` deprecated) |
| Mock force status? | `x-mock-response-code` |
| Private mock header? | `x-api-key` |
| Postman API base? | `https://api.getpostman.com` |
| Postman API auth header? | `X-API-Key` |
| OAuth browser callback? | `https://oauth.pstmn.io/v1/callback` |
| JSON script event name for tests in export? | `"listen": "test"` |
| Pre-request event name? | `"prerequest"` |
| Collection format to export? | v2.1 (v3 YAML in v12 Native Git) |
| Vault reference syntax? | `{{vault:name}}` |
| Generate once from dynamic var? | `pm.variables.replaceIn("{{$randomEmail}}")` |
| Import from browser? | Copy as cURL / HAR |
| Popular HTML reporter? | newman-reporter-htmlextra |
| Official Docker image? | `postman/newman` |
| GraphQL errors status? | Often 200 with `errors` |
| gRPC OK code? | 0 |
| gRPC unauthenticated? | 16 |
| OWASP API #1 (2023)? | BOLA |
| March 2026 plans? | Free (1 user), Solo, Team, Enterprise |

➡️ Next: **Chapter 19 — Cheat Sheets, Glossary & Reference**.
