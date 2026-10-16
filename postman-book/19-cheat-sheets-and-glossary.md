# Chapter 19 — Cheat Sheets, Snippet Library & Glossary

---

## 19.1 `pm` API cheat sheet

```javascript
// ── INFO ──────────────────────────────────────────────
pm.info.eventName | iteration | iterationCount | requestName | requestId

// ── VARIABLES ─────────────────────────────────────────
pm.variables.get(k) | set(k,v) /*local*/ | has(k) | replaceIn(str) | toObject()
pm.environment.get | set | has | unset | clear | toObject | replaceIn | name
pm.collectionVariables.get | set | has | unset | clear | toObject | replaceIn
pm.globals.get | set | has | unset | clear | toObject | replaceIn
pm.iterationData.get | has | toObject
await pm.vault.get(k) | set(k,v) | unset(k)

// ── REQUEST ───────────────────────────────────────────
pm.request.method | url | headers | body | auth
pm.request.url.toString() | getHost() | getPath() | getPathWithQuery() | query.add/upsert/remove/get/toObject
pm.request.headers.add({key,value}) | upsert(...) | remove(k) | get(k) | toObject()
pm.request.body.raw | mode | urlencoded | formdata | update({...})

// ── RESPONSE ──────────────────────────────────────────
pm.response.code | status | responseTime | responseSize | headers | cookies
pm.response.json() | text()
pm.response.to.have.status(n|reason) | header(k[,v]) | body(str) | jsonBody([path[,v]]) | jsonSchema(s)
pm.response.to.be.ok(200) | success(2xx) | redirection | clientError | serverError | error
                 | badRequest | unauthorized | forbidden | notFound | rateLimited | json | withBody

// ── TESTS ─────────────────────────────────────────────
pm.test(name, fn) | pm.test.skip(name, fn)
pm.expect(x).to.equal | eql | deep.equal | include | have.property | nested.property
           .be.a(type) | an | null | undefined | true | false | empty | exist | ok(truthy)
           .above | below | at.least | at.most | within | closeTo
           .match(re) | oneOf([]) | lengthOf(n) | members([]) | all.keys | any.keys | satisfy(fn)

// ── CONTROL ───────────────────────────────────────────
pm.execution.setNextRequest(nameOrId | null) | skipRequest() | location
pm.sendRequest(urlOrReq, (err, res) => {}) | await pm.sendRequest(req) /* app only; not Newman 6 */

// ── COOKIES ───────────────────────────────────────────
pm.cookies.get(n) | has(n) | toObject() ; pm.cookies.jar().get/getAll/set/unset/clear(url, ..., cb)

// ── VISUALIZER & PACKAGES ─────────────────────────────
pm.visualizer.set(template, data) ; (in template) pm.getData(cb)
pm.require("@team/package")
```

---

## 19.2 Snippet library (copy-paste ready)

```javascript
// 1. Standard checks
pm.test("Status 200", () => pm.response.to.have.status(200));
pm.test("JSON", () => pm.response.to.be.json);
pm.test("Fast", () => pm.expect(pm.response.responseTime).to.be.below(1000));

// 2. Save id from response
pm.collectionVariables.set("id", pm.response.json().id);

// 3. Save id from Location header
pm.collectionVariables.set("id", pm.response.headers.get("Location").split("/").pop());

// 4. Correlation id on every request (collection pre-request)
pm.request.headers.upsert({ key: "X-Correlation-ID", value: pm.variables.replaceIn("{{$guid}}") });

// 5. Unique email generated once
if (!pm.collectionVariables.get("email")) pm.collectionVariables.set("email", pm.variables.replaceIn("{{$randomExampleEmail}}"));

// 6. Guard against prod writes (collection pre-request)
if (/prod/i.test(pm.environment.name || "") && pm.request.method !== "GET") { console.warn("Skipped write in PROD"); pm.execution.skipRequest(); }

// 7. Decode JWT
const claims = JSON.parse(atob(pm.environment.get("token").split(".")[1].replace(/-/g,"+").replace(/_/g,"/")));

// 8. Safe JSON parse in tests
let body; try { body = pm.response.json(); } catch (e) { body = null; }
pm.test("Valid JSON", () => pm.expect(body).to.not.be.null);

// 9. Schema validation with Ajv
const Ajv = require("ajv"); const v = new Ajv({ allErrors: true }).compile(JSON.parse(pm.collectionVariables.get("schema")));
pm.test("Schema", () => pm.expect(v(pm.response.json()), JSON.stringify(v.errors)).to.be.true);

// 10. Stop run on failure of critical step
if (pm.response.code >= 400) pm.execution.setNextRequest(null);

// 11. Clean up runtime variables (teardown)
["orderId", "customerId", "email"].forEach(k => pm.collectionVariables.unset(k));

// 12. Date helpers
const today = new Date().toISOString().slice(0, 10);
const plusDays = n => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);

// 13. Wait (polling helper)
setTimeout(() => {}, 2000);

// 14. Convert XML to JSON
const xml = xml2Json(pm.response.text());

// 15. Log request as sent (debug)
console.log(pm.request.method, pm.variables.replaceIn(pm.request.url.toString()));
```

---

## 19.3 Newman / Postman CLI cheat sheet
```bash
npm i -g newman newman-reporter-htmlextra
newman run c.json -e env.json -d data.csv -n 2 --folder "Smoke" \
  --env-var "token=$TOKEN" --delay-request 100 --timeout-request 10000 --bail \
  -r cli,junit,htmlextra --reporter-junit-export out/junit.xml --reporter-htmlextra-export out/report.html
newman run "https://api.getpostman.com/collections/<uid>?apikey=$KEY"
docker run --rm -v "$PWD":/etc/newman postman/newman:alpine run c.json

postman login --with-api-key "$POSTMAN_API_KEY"
postman collection run <collectionId|path> -e <envId|path> -r cli,junit --reporter-junit-export out/junit.xml
postman api lint <apiId>
postman spec lint <spec>
postman workspace push        # v12 Native Git
```

---

## 19.4 Status codes cheat sheet

| 2xx | 3xx | 4xx | 5xx |
|---|---|---|---|
| 200 OK | 301 Moved Permanently | 400 Bad Request | 500 Internal Server Error |
| 201 Created | 302 Found | 401 Unauthorized | 501 Not Implemented |
| 202 Accepted | 303 See Other | 403 Forbidden | 502 Bad Gateway |
| 204 No Content | 304 Not Modified | 404 Not Found | 503 Service Unavailable |
| 206 Partial Content | 307 Temporary Redirect | 405 Method Not Allowed | 504 Gateway Timeout |
| | 308 Permanent Redirect | 409 Conflict, 413, 415, 422, 429 | |

---

## 19.5 Variable precedence & values
```
LOCAL  >  DATA  >  ENVIRONMENT  >  COLLECTION  >  GLOBAL
Shared value (old: initial)  → synced to cloud, visible to team, exported
Local value  (old: current)  → only on your machine, used when sending
Secrets → Vault {{vault:name}} (local, encrypted) / CI --env-var
```

---

## 19.6 Script execution order
```
Collection pre → Folder pre → Request pre → [ SEND ] → Collection post → Folder post → Request post
```

---

## 19.7 Glossary (A–Z)

| Term | Meaning |
|---|---|
| **Agent (Desktop/Cloud/Browser)** | Component that sends requests for the Postman web app |
| **Agent Mode** | Postman's agentic AI for multi-step tasks |
| **Ajv** | JSON Schema validator available in sandbox |
| **API** | Interface/contract for programs to communicate |
| **API Catalog** | Org-wide inventory of APIs (v12) |
| **API Network** | Public directory of APIs/workspaces |
| **Assertion** | A check that throws if false |
| **AsyncAPI** | Spec format for event-driven/async APIs |
| **Auth inheritance** | Requests using parent folder/collection auth |
| **Bearer token** | Token sent as `Authorization: Bearer` |
| **BOLA/IDOR** | Accessing another user's object by ID |
| **Boundary** | Separator in multipart bodies |
| **Chai** | Assertion library behind `pm.expect` |
| **Collection** | Group of requests with shared config |
| **Collection Runner** | Runs collections with iterations/data |
| **Collection v2.1 / v3** | JSON export format / YAML format (v12 Native Git) |
| **Console** | Postman's debugging log |
| **Contract testing** | Verifying responses match the agreed spec |
| **CORS** | Browser cross-origin rules |
| **Data file** | CSV/JSON for iterations |
| **Dynamic variables** | `{{$guid}}`, `{{$random...}}` generated values |
| **Environment** | Named set of variables per stage |
| **Example** | Saved request/response pair (mocks, docs) |
| **Flows** | Visual low-code workflow builder |
| **FQL** | Flows Query Language |
| **Fork** | Linked copy for independent changes |
| **gRPC** | Protobuf RPC over HTTP/2 |
| **HAR** | HTTP Archive file from browsers |
| **Idempotent** | Repeating doesn't change final state |
| **Insights** | Traffic-observing agent for API discovery |
| **Interceptor** | Chrome extension capturing requests/cookies |
| **Iteration** | One pass through the run (one data row) |
| **JWT** | Signed JSON token `header.payload.signature` |
| **Lightweight API Client** | Signed-out mode (replaced Scratch Pad) |
| **Local variable** | Temporary, highest precedence |
| **Mock server** | Fake API returning examples |
| **Monitor** | Scheduled cloud collection runs with alerts |
| **mTLS** | Client presents a certificate too |
| **Native Git** | v12 Git-native workspaces with YAML files |
| **Newman** | Open-source CLI runner |
| **OAuth 2.0 / OIDC** | Authorization framework / identity layer |
| **OpenAPI** | REST API description standard |
| **Package Library** | Team-shared script modules (`pm.require`) |
| **PKCE** | Code verifier/challenge protection for auth code flow |
| **Postbot** | Postman AI assistant |
| **Postman API** | REST API to manage Postman resources |
| **Postman CLI** | Official CLI (login, run, lint, push) |
| **Pre-request script** | Runs before sending |
| **Post-response script** | Runs after response (formerly "Tests") |
| **Pull request** | Proposal to merge fork changes |
| **Sandbox** | Restricted JS runtime for scripts |
| **Secret type** | Masked variable value in UI |
| **Spec Hub** | Postman's API specification editor/hub |
| **SSE** | Server-Sent Events streaming |
| **TTFB** | Time to first byte (server think time) |
| **Vault** | Encrypted local secrets store |
| **Visualizer** | Custom HTML rendering of responses |
| **Webhook** | Server calls your URL on events; also Postman collection-trigger URLs |
| **Workspace** | Container for team collaboration |

---

## 19.8 Exam-night revision list (top 30 facts)
1. Precedence: Local > Data > Env > Collection > Global.
2. Script order: Collection → Folder → Request (both phases).
3. `pm.response.to.be.ok` = 200; `.success` = 2xx.
4. `eql` for deep equality.
5. `setNextRequest` only in runs; `null` stops; last call wins; prefer IDs.
6. `skipRequest` only in pre-request.
7. CSV types unreliable (number-like → number, `007` → 7, booleans stay strings) — normalise; extra iterations reuse last row.
8. Newman exit 1 on failures; `--env-var` for secrets; `--export-environment` to persist.
9. Postman CLI: login with API key, IDs or files, `api lint`, results to Postman.
10. Mocks: examples, `x-mock-response-code/name/id`, `x-api-key` private.
11. Monitors: cloud, regions, alerts; can't reach private nets without allowlisting.
12. Vault: `{{vault:x}}`, `await pm.vault.get`, not in Newman/CLI/monitors.
13. Shared vs local values (old initial vs current).
14. Dynamic vars change per use → `replaceIn` once and store.
15. `pm.request.body.raw` is unresolved → `replaceIn` before `JSON.parse`.
16. Form-data: don't set Content-Type manually.
17. OAuth token endpoint uses x-www-form-urlencoded.
18. OAuth browser callback `https://oauth.pstmn.io/v1/callback`.
19. Interactive OAuth doesn't run in CI → script token fetch.
20. CORS doesn't apply to Postman desktop.
21. `ENOTFOUND {{var}}` = unresolved variable.
22. `ECONNREFUSED ::1` = IPv6 localhost vs IPv4 server.
23. `Unexpected token '<'` = HTML instead of JSON.
24. Corporate SSL errors → add CA cert, not disable verification.
25. GraphQL errors often 200 with `errors`.
26. gRPC codes: 0 OK, 3 INVALID_ARGUMENT, 5 NOT_FOUND, 7 PERMISSION_DENIED, 14 UNAVAILABLE, 16 UNAUTHENTICATED.
27. OWASP API 2023 #1 BOLA, #2 Broken Auth, #3 BOPLA, #5 BFLA, #7 SSRF.
28. Exported JSON: `listen: "prerequest"` / `listen: "test"`.
29. v11: Scripts tab (Pre-request/Post-response), Vault, Package Library, Spec Hub; v12: Native Git YAML, Agent Mode, API Catalog.
30. March 2026 plans: Free (1 user), Solo, Team, Enterprise.

➡️ Next: **Chapter 20 — Hands-On Labs & Capstone Project**.
