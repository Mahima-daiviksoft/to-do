# Chapter 18B — Interview Questions & Answers: Scripting, Testing, Automation, CI/CD & Advanced Features

Levels: 🟢 Entry, 🟡 Intermediate, 🔴 Experienced

---

## Part 3 — Scripts & the `pm` object

**Q96. 🟢 What are pre-request scripts?**
JavaScript that runs before a request is sent — to set variables, generate data/timestamps/signatures, fetch tokens, modify headers/body, or skip the request.

**Q97. 🟢 What are tests / post-response scripts?**
JavaScript that runs after the response arrives — to write assertions (`pm.test`), extract values for chaining, control workflow, visualize data. In older UI it's the "Tests" tab; in newer UI "Scripts → Post-response".

**Q98. 🟡 What is the execution order of scripts?**
Collection pre-request → folder pre-request(s) → request pre-request → request sent → collection post-response → folder post-response(s) → request post-response. Repeats per request and iteration.

**Q99. 🟡 Can you write scripts at collection/folder level? Why?**
Yes. For common logic: auth token refresh, common headers (correlation IDs), generic tests (no 5xx, response time, JSON validity), logging. Reduces duplication.

**Q100. 🟢 What language are Postman scripts written in?**
JavaScript (modern ES6+), executed in the Postman Sandbox (Node-based, restricted: no filesystem/DOM).

**Q101. 🟡 What is the Postman Sandbox?**
The JS runtime where scripts execute, providing the `pm` API, built-in libraries (lodash, moment, crypto-js, ajv, cheerio, chai, uuid, xml2js, csv-parse, tv4 deprecated), `require`, `pm.require` for Package Library, timers, and console — but no file system, network sockets (except `pm.sendRequest`), or DOM.

**Q102. 🟢 What is the `pm` object?**
Postman's scripting API: `pm.request`, `pm.response`, `pm.info`, `pm.variables`, `pm.environment`, `pm.collectionVariables`, `pm.globals`, `pm.iterationData`, `pm.cookies`, `pm.vault`, `pm.sendRequest`, `pm.execution`, `pm.test`, `pm.expect`, `pm.visualizer`, `pm.require`.

**Q103. 🟢 How do you set and get an environment variable in a script?**
`pm.environment.set("token", value);` and `pm.environment.get("token");`. Collection: `pm.collectionVariables.set/get`. Global: `pm.globals.set/get`.

**Q104. 🟡 Difference between `pm.variables.get` and `pm.environment.get`?**
`pm.variables.get` resolves across all scopes using precedence (local > data > environment > collection > global); `pm.environment.get` reads only the active environment.

**Q105. 🟡 What does `pm.variables.set` do?**
Sets a **local** variable — temporary, highest precedence, lasts for the request (or the whole collection run), not saved to any environment/collection.

**Q106. 🟡 How do you remove variables?**
`pm.environment.unset("k")`, `pm.collectionVariables.unset("k")`, `pm.globals.unset("k")`; `clear()` removes all in that scope (dangerous in shared envs).

**Q107. 🟢 How do you read the response body?**
`pm.response.json()` for JSON, `pm.response.text()` for raw text; XML via `xml2Json(pm.response.text())` or `xml2js`; HTML via `cheerio.load()`.

**Q108. 🟢 How do you get the status code, response time, headers?**
`pm.response.code`, `pm.response.status`, `pm.response.responseTime`, `pm.response.responseSize`, `pm.response.headers.get("Content-Type")`.

**Q109. 🟡 How do you modify a request in a pre-request script?**
`pm.request.headers.upsert({key, value})`, `pm.request.url.query.add({key, value})`, `pm.request.body.raw = JSON.stringify(obj)` or `pm.request.body.update({...})`, `pm.request.method = "PUT"`, `pm.request.url = "..."`.

**Q110. 🔴 How do you parse a request body that contains `{{variables}}`?**
`JSON.parse(pm.variables.replaceIn(pm.request.body.raw))` — because `pm.request.body.raw` holds unresolved placeholders, which may be invalid JSON (e.g. unquoted `{{age}}`).

**Q111. 🟡 What is `pm.sendRequest`? Use cases?**
Sends an HTTP request from within a script (callback or, in recent versions, promise/await). Uses: fetch auth tokens, create/cleanup test data, verify side effects, polling, call other services. It doesn't inherit collection auth/headers and doesn't auto-resolve `{{vars}}` in strings (use `replaceIn`).

**Q112. 🟡 Write a `pm.sendRequest` POST example.**
```javascript
pm.sendRequest({
  url: pm.variables.replaceIn("{{baseUrl}}/auth/token"),
  method: "POST",
  header: { "Content-Type": "application/json" },
  body: { mode: "raw", raw: JSON.stringify({ user: pm.environment.get("user"), pass: pm.environment.get("pass") }) }
}, (err, res) => {
  if (!err && res.code === 200) pm.environment.set("token", res.json().token);
});
```

**Q113. 🟡 What is `pm.info`?**
Runtime info: `eventName` ("prerequest"/"test"), `iteration`, `iterationCount`, `requestName`, `requestId`.

**Q114. 🟡 What is `pm.iterationData`?**
Read-only access to the current data file row during runs: `pm.iterationData.get("email")`, `.has()`, `.toObject()`.

**Q115. 🔴 What is `pm.execution`?**
Run-control API: `setNextRequest(nameOrId|null)` to change/stop run flow, `skipRequest()` (pre-request only) to skip the current request, `location` to know where the script is executing.

**Q116. 🟡 `postman.setNextRequest` vs `pm.execution.setNextRequest`?**
Same purpose; `postman.setNextRequest` is the legacy API; `pm.execution.setNextRequest` is the modern one. Both work only in collection runs; last call wins; `null` stops the run.

**Q117. 🟡 How do you skip a request conditionally?**
In pre-request: `if (condition) pm.execution.skipRequest();` — its post-response scripts won't run either.

**Q118. 🟡 What libraries can you `require` in Postman?**
lodash, moment, crypto-js, ajv, tv4 (deprecated), chai, cheerio, uuid, xml2js, csv-parse/lib/sync, postman-collection, atob/btoa, and Node built-ins like url, util, path, buffer, querystring, events, stream, timers, assert, punycode, string_decoder.

**Q119. 🔴 How do you reuse code across collections?**
Modern: **Package Library** — create a team package with `module.exports` and load via `pm.require("@team/package")` (recent versions can also import from external registries like npm). Older approaches: collection-level scripts (one collection only) or storing functions as strings in variables and `eval` (discouraged).

**Q120. 🟡 What is `pm.visualizer`?**
Renders custom HTML (Handlebars template + data) in the response's Visualize tab: `pm.visualizer.set(template, data)`; inside the template, `pm.getData(cb)` gets the data for JS charts (e.g., Chart.js).

**Q121. 🟡 How do you log in scripts?**
`console.log/info/warn/error` → Postman Console (stdout in Newman).

**Q122. 🔴 How do you handle asynchronous code in Postman scripts?**
Postman waits for pending callbacks, timers and promises (`pm.sendRequest` callbacks, `setTimeout`) before finishing the script. Tests inside callbacks register correctly. With async/await (recent versions), await promises to avoid unhandled rejections.

**Q123. 🔴 How do you add a delay inside a script?**
`setTimeout(() => {}, 2000);` — the sandbox waits for the timer. For runs, also Runner Delay / `--delay-request`.

**Q124. 🟡 What is `pm.cookies` vs `pm.cookies.jar()`?**
`pm.cookies` is the cookie list for the current request's domain (`get`, `has`, `toObject`). `pm.cookies.jar()` gives programmatic access to get/set/unset/clear cookies for any allowlisted domain (async callbacks).

**Q125. 🟡 What is legacy script syntax and what replaced it?**
`tests["name"] = bool`, `responseBody`, `responseCode.code`, `responseTime`, `postman.setEnvironmentVariable`, `postman.getResponseHeader`, `tv4.validate` → replaced by `pm.test`, `pm.response.text()/json()`, `pm.response.code`, `pm.response.responseTime`, `pm.environment.set`, `pm.response.headers.get`, `pm.response.to.have.jsonSchema`/ajv.

---

## Part 4 — Testing & assertions

**Q126. 🟢 How do you write a test in Postman?**
```javascript
pm.test("Status code is 200", () => pm.response.to.have.status(200));
```

**Q127. 🟢 What assertion library does Postman use?**
Chai.js BDD (`pm.expect(x).to.eql(y)`), plus Postman response assertions (`pm.response.to.have.status`, `.to.have.header`, `.to.have.jsonBody`, `.to.have.jsonSchema`, `.to.be.ok/success/error/notFound/...`).

**Q128. 🟡 Difference between `pm.expect(x).to.equal(y)` and `.to.eql(y)`?**
`equal` is strict `===` (references for objects); `eql` is deep equality — use it for objects/arrays.

**Q129. 🔴 Difference between `pm.response.to.be.ok` and `pm.response.to.be.success`?**
`.ok` asserts status exactly 200; `.success` asserts any 2xx. (Also: Chai's `pm.expect(x).to.be.ok` means "truthy" — a different thing.)

**Q130. 🟢 How to check a header exists/has value?**
`pm.response.to.have.header("Content-Type")`; value: `pm.expect(pm.response.headers.get("Content-Type")).to.include("application/json")`.

**Q131. 🟢 How to check response time?**
`pm.expect(pm.response.responseTime).to.be.below(500);`

**Q132. 🟢 How to check a value in JSON?**
`const j = pm.response.json(); pm.expect(j.user.name).to.eql("Asha");` or `pm.response.to.have.jsonBody("user.name", "Asha")`.

**Q133. 🟡 How to check a JSON key exists / doesn't exist?**
`pm.expect(j).to.have.property("id")`, nested: `to.have.nested.property("a.b")`; absence: `to.not.have.property("password")`.

**Q134. 🟡 How to assert array length, contains item, all items match?**
`pm.expect(arr).to.have.lengthOf(3)`, `pm.expect(arr).to.deep.include({id: 1})`, `arr.forEach(x => pm.expect(x.active).to.be.true)` or `pm.expect(arr.every(x => x.active)).to.be.true`.

**Q135. 🟡 How to validate data types?**
`pm.expect(j.id).to.be.a("number")`, `"string"`, `"boolean"`, `"array"`, `"object"`, `to.be.null`.

**Q136. 🔴 How do you perform JSON schema validation?**
Define a JSON Schema and use `pm.response.to.have.jsonSchema(schema)` or Ajv:
```javascript
const Ajv = require("ajv"); const ajv = new Ajv({ allErrors: true });
const validate = ajv.compile(schema);
pm.test("Schema valid", () => pm.expect(validate(pm.response.json()), JSON.stringify(validate.errors)).to.be.true);
```
tv4 is deprecated. Store schemas centrally (collection variable/Package Library), derive from OpenAPI.

**Q137. 🟡 How to test that a list is sorted?**
Map field values, compare with a sorted copy using a proper comparator: `pm.expect(vals).to.eql([...vals].sort((a,b)=>a-b))`.

**Q138. 🟡 How to write a test that checks one of several status codes?**
`pm.expect(pm.response.code).to.be.oneOf([200, 201]);`

**Q139. 🟡 How to skip a test?**
`pm.test.skip("name", fn)`; conditional: `(cond ? pm.test : pm.test.skip)("name", fn)`.

**Q140. 🔴 Does one failing test stop other tests or the run?**
No — each `pm.test` is independent; the run continues. An uncaught script error stops the rest of *that script*. Newman `--bail` or `setNextRequest(null)` stops runs.

**Q141. 🔴 How do you test negative scenarios?**
Send invalid inputs (missing/wrong-type/boundary values, invalid auth, wrong methods, non-existent IDs, duplicates) and assert proper 4xx codes, error schema, helpful messages, no 5xx, no stack traces or data leaks. Data-drive cases with CSV/JSON including `expectedStatus`.

**Q142. 🔴 How do you test that data was persisted after a POST?**
Save the ID from POST, then GET the resource (next request or `pm.sendRequest`) and deep-compare fields; optionally verify via list/search endpoints or DB checks (through an internal API).

**Q143. 🔴 How do you test idempotency?**
Send the same PUT/DELETE (or POST with Idempotency-Key) twice; assert the state is unchanged after the second call (GET), no duplicates created, and appropriate status codes.

**Q144. 🔴 How do you test API performance in Postman?**
Response time assertions per request; collection runs over iterations; Runner Performance tab with virtual users and load profiles (fixed, ramp up, spike, peak) reporting avg/p90/p95/p99, throughput, error rate. For heavy load use k6/JMeter/Gatling.

**Q145. 🔴 How do you avoid flaky tests?**
Unique data per run, independent tests, explicit setup/teardown, polling with timeouts instead of fixed sleeps, retry only transient failures, avoid asserting volatile values/order, stable environments, version-pinned runners.

---

## Part 5 — Chaining, Runner, data-driven

**Q146. 🟢 What is request chaining?**
Passing data from one response into later requests via variables (e.g., save `token` or `orderId` in a post-response script, use `{{orderId}}` next).

**Q147. 🟢 How do you extract a token from login and use it everywhere?**
Login post-response: `pm.environment.set("accessToken", pm.response.json().token)`. Collection Authorization: Bearer `{{accessToken}}`; requests inherit.

**Q148. 🔴 How do you auto-refresh an expired token?**
Collection pre-request script checks `accessTokenExpiresAt`; if missing/expired, call token endpoint via `pm.sendRequest`, store the new token and expiry; Postman waits before sending the main request. Or use OAuth 2.0 auth with Auto-refresh in the UI (not for Newman).

**Q149. 🟢 What is the Collection Runner?**
Tool to run all/selected requests of a collection or folder in sequence with iterations, delays, data files, chosen environment; shows test results; also offers scheduled runs and performance tests.

**Q150. 🟡 What is data-driven testing in Postman?**
Running the same requests with multiple data sets from CSV/JSON files; each row = one iteration; access via `{{column}}` or `pm.iterationData.get()`.

**Q151. 🟡 CSV vs JSON data files?**
CSV: simple, flat, strings only, header row required. JSON: array of objects, preserves types and nesting.

**Q152. 🔴 What if iterations exceed rows in the data file?**
The extra iterations reuse the last row's values. Fewer iterations → only first N rows.

**Q153. 🔴 A CSV column has the same name as an environment variable. Which wins?**
The data variable (data > environment), unless a local variable with that name is set.

**Q154. 🟡 How do you change request execution order?**
Reorder in the collection/Runner, or dynamically with `pm.execution.setNextRequest("name or id")` in collection runs.

**Q155. 🔴 How do you loop a request until a condition is met?**
In post-response: if condition not met and attempts < max → `pm.execution.setNextRequest(pm.info.requestId)`; increment counter; optionally `setTimeout` delay; reset counter when done.

**Q156. 🔴 How do you implement pagination in a run?**
Store page/cursor in a variable, concatenate results, and `setNextRequest` the same request until `hasMore` is false or `next_cursor` null.

**Q157. 🟡 Why isn't `setNextRequest` working?**
It only works in collection runs (not Send), name typo/duplicates (use IDs), target not part of the run, overwritten later (last call wins), request deselected in Runner.

**Q158. 🟡 How do you stop a collection run conditionally?**
`pm.execution.setNextRequest(null)` (stops after current request); Newman `--bail`.

---

## Part 6 — Newman, Postman CLI & CI/CD

**Q159. 🟢 What is Newman?**
Postman's open-source command-line collection runner (Node.js/npm). Runs exported collections/environments (files or URLs) with reporters; used in CI/CD.

**Q160. 🟢 How do you install and run Newman?**
`npm install -g newman`; `newman run collection.json -e env.json`.

**Q161. 🟡 Common Newman options?**
`-e` env, `-g` globals, `-d` data, `-n` iterations, `--folder`, `--env-var`, `--global-var`, `--delay-request`, `--timeout-request`, `-k` insecure, `--bail`, `-x` suppress exit code, `-r` reporters, `--reporter-junit-export`, `--export-environment`, `--working-dir`, `--ssl-client-cert`.

**Q162. 🟡 What reporters does Newman support?**
Built-in: cli, json, junit, progress, emojitrain. External: htmlextra (popular), html (older), allure, teamcity, etc. (`npm install -g newman-reporter-htmlextra` then `-r htmlextra`).

**Q163. 🟡 How do you generate an HTML report?**
`newman run c.json -r htmlextra --reporter-htmlextra-export report.html`.

**Q164. 🟡 What exit codes does Newman return?**
0 success, 1 when tests fail or errors occur — CI uses this to fail the job. `-x` forces 0.

**Q165. 🔴 How do you integrate Postman tests in Jenkins/GitHub Actions/Azure/GitLab?**
Check out repo with exported collections (or fetch via Postman API / use Postman CLI with IDs), install Newman (or use `postman/newman` Docker image / Postman CLI), inject secrets from CI store via `--env-var`, run with JUnit reporter, publish JUnit results and HTML artifacts, fail build on non-zero exit. (See Chapter 11 YAML examples.)

**Q166. 🔴 What is the Postman CLI and how does it differ from Newman?**
Official Postman binary: logs in with API key, runs collections by cloud ID or file, sends results to Postman (run history, API Catalog reports), supports governance linting (`postman api lint`, `postman spec lint`), v12 Native Git (`workspace push`, YAML collections). Newman: open-source npm, file/URL based, Node API, custom reporters, no results to Postman.

**Q167. 🔴 How do you pass secrets to Newman securely?**
Store in CI secret store, pass via `--env-var "key=$SECRET"`; never commit them in environment files; mask in logs; use htmlextra `skipSensitiveData`.

**Q168. 🟡 How do you run only one folder in Newman?**
`--folder "Folder Name"` (repeatable).

**Q169. 🔴 How do you run Newman programmatically?**
`const newman = require('newman'); newman.run({ collection, environment, reporters: ['cli'] }, (err, summary) => {...}).on('request', ...)`. Useful for parallel runs and custom notifications.

**Q170. 🔴 How do you run Newman in Docker?**
`docker run -v "$PWD":/etc/newman -t postman/newman:alpine run collection.json -e env.json`.

**Q171. 🔴 Why would a collection pass in the app but fail in Newman?**
Missing environment/secrets (local values not exported, Vault unsupported), interactive OAuth, file paths, older Newman lacking new sandbox APIs, package library access, CA/proxy differences, fresh cookie jar, timing/network.

**Q172. 🟡 How do you keep the collection in CI up to date?**
Fetch via Postman API (`/collections/{uid}`) at runtime, use Postman CLI with collection IDs, Git integration, or v12 Native Git (collections live in repo).

---

## Part 7 — Mocks, monitors, docs, design, API, AI

**Q173. 🟢 What is a mock server?**
A fake API that returns saved examples; lets frontend/QA work before backend is ready, simulate errors and edge cases.

**Q174. 🟡 How does a Postman mock server choose the response?**
Matches incoming request against saved examples by method, path (variables as wildcards), query params, optionally headers/body (when `x-mock-match-request-headers` / `x-mock-match-request-body` are sent), picks the best score; can be forced with `x-mock-response-name`, `x-mock-response-id`, or `x-mock-response-code`. Private mocks need `x-api-key`.

**Q175. 🟡 Limitations of Postman mocks?**
Stateless (no real create/update), usage limits per plan, matching surprises, no full request validation by default. Use WireMock/Prism/json-server for stateful/local needs.

**Q176. 🟢 What is a monitor?**
Scheduled cloud runs of a collection (frequency, regions, environment) with alerts (email, Slack, Teams, PagerDuty…) for uptime/SLA/functional checks.

**Q177. 🟡 Monitor vs scheduled collection run vs Newman cron?**
Monitors: cloud, multi-region, alerting integrations, response-time graphs. Scheduled runs: cloud collection runs on a schedule with notifications. Newman cron/CI: runs inside your network (reaches internal APIs), full control.

**Q178. 🔴 How do you monitor an internal API not reachable from the internet?**
Use static IPs + allowlisting (Enterprise) or run Newman/Postman CLI on a schedule inside the network (CI, Kubernetes CronJob) and push results/alerts.

**Q179. 🟡 How do you generate API documentation in Postman?**
Fill descriptions (Markdown) for collection/folders/requests/params, save examples; View documentation; Publish publicly or keep private; include environment (without secrets).

**Q180. 🟡 What is Spec Hub / API Builder?**
Postman's API design area: create/edit OpenAPI (2.0/3.0/3.1) and AsyncAPI specs, lint with governance rules, generate/sync collections, mocks, docs, Git integration, versions.

**Q181. 🔴 Design-first vs code-first?**
Design-first: spec first, review, mock, then build (consistent APIs, parallel work). Code-first: build then generate spec (fast, risk of drift). Postman supports both via Spec Hub and imports.

**Q182. 🟡 What are Postman Flows?**
Low-code visual workflow builder: connect blocks (requests, conditions, loops, evaluate/FQL, AI requests) to orchestrate APIs; deployable to cloud with HTTP/schedule/MCP triggers.

**Q183. 🟡 What is the Postman API?**
REST API at `https://api.getpostman.com` (auth `X-API-Key`) to manage collections, environments, workspaces, mocks, monitors, specs, webhooks programmatically — for CI sync, backups, automation.

**Q184. 🔴 How can you trigger a collection run from an external event?**
Create a collection webhook (Postman API `/webhooks`); POSTing to its URL runs the collection in the cloud, with payload available as `pm.globals.get("previousRequest")`. Or trigger CI pipelines that run Newman/Postman CLI.

**Q185. 🟡 What is Postman Vault?**
Encrypted local secret storage, not synced to cloud; referenced as `{{vault:name}}` and in scripts via async `pm.vault.get/set/unset` (once enabled); integrations with external secret managers (Azure Key Vault, HashiCorp, AWS Secrets Manager) on Enterprise; not supported in Newman/CLI/monitors.

**Q186. 🟡 What is the secret variable type?**
Masks the value in the UI to prevent shoulder-surfing; it's not encryption and values are still accessible via scripts/exports.

**Q187. 🔴 What is Postman Insights?**
An agent deployed in your infrastructure that passively observes live API traffic to discover endpoints, errors and latency, helping keep collections/specs aligned with actual usage.

**Q188. 🟡 What are Postman's AI features?**
Postbot (test generation, docs, visualization, debugging) and Agent Mode (multi-step agentic tasks across workspace with Skills). Review AI-generated tests against the spec.

**Q189. 🔴 What's new in Postman v12?**
Native Git: collections as YAML (Collection v3) files in your repo, local-first & offline development, CLI-based sync (`postman workspace push`), running collections by path; Agent Mode expansion; API Catalog; Spec Hub improvements.

**Q190. 🔴 How does Postman support GraphQL/gRPC/WebSocket/MQTT/SOAP?**
Dedicated request types: GraphQL (introspection, query builder, variables), gRPC (reflection/proto, metadata, streaming), WebSocket and Socket.IO (connect, messages, events), MQTT (broker, topics, QoS); SOAP via HTTP POST with XML envelope and SOAPAction/WSDL import.

➡️ Continue: **18C — Scenario-Based, Coding, Architecture & Behavioural Questions**.
