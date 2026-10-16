# Chapter 20 — Hands-On Labs & Capstone Project

> 🧒 Reading about swimming doesn't teach you to swim. **Do every lab.** Each lab tells you *what to do*, *what you should see*, and *what you learned*.

Practice APIs (free, public — availability can change; if one is down use another):
- `https://jsonplaceholder.typicode.com` — fake REST data (writes are simulated, not saved)
- `https://httpbin.org` — echoes requests, status codes, auth, delays, cookies
- `https://postman-echo.com` — Postman's echo service
- `https://restful-booker.herokuapp.com` — CRUD + auth for testers (data resets periodically)
- `https://petstore.swagger.io/v2` — Swagger Petstore (with OpenAPI spec at `/v2/swagger.json`)

---

## Lab 1 — First requests (🟢 15 min)
1. `GET https://jsonplaceholder.typicode.com/todos/1` → 200, `{ userId:1, id:1, title:"delectus aut autem", completed:false }`.
2. `GET https://jsonplaceholder.typicode.com/posts?userId=2` → array of 10 posts.
3. `GET https://jsonplaceholder.typicode.com/posts/:id` with path variable `id=3`.
4. `GET https://httpbin.org/headers` → see headers Postman sent (User-Agent PostmanRuntime, Postman-Token).
✅ Learned: methods, params, path variables, auto headers.

## Lab 2 — Bodies (🟢 20 min)
1. `POST https://httpbin.org/post` raw JSON `{"name":"Asha"}` → echoed under `json`.
2. Same with **x-www-form-urlencoded** → echoed under `form`.
3. **form-data** with a file → echoed under `files`.
4. Remove JSON selection (Text) → see `Content-Type: text/plain` echoed; understand 415 bugs.
✅ Learned: body types and Content-Type.

## Lab 3 — Status codes & redirects (🟢 15 min)
1. `GET https://httpbin.org/status/404`, `/status/500`, `/status/429`.
2. `GET https://httpbin.org/redirect/3` → final 200; turn off "Automatically follow redirects" in request Settings → see 302 + `Location`.
3. `GET https://httpbin.org/delay/3` → time ≈ 3s; set request timeout 1000ms in Settings → timeout error.
✅ Learned: status classes, redirect settings, timeouts.

## Lab 4 — Auth types (🟡 30 min)
1. Basic: `GET https://httpbin.org/basic-auth/user/passwd`, Auth → Basic user/passwd → 200; wrong password → 401.
2. Bearer: `GET https://httpbin.org/bearer` without token → 401; with any Bearer token → 200 + token echoed.
3. Digest: `GET https://httpbin.org/digest-auth/auth/user/passwd` with Digest Auth user/passwd → 200.
4. API key: `GET https://postman-echo.com/get` with API Key auth `x-api-key: test` in Header → echoed in headers; switch to Query Params → appears in `args`.
✅ Learned: auth tab types and where credentials go.

## Lab 5 — Environments & variables (🟡 30 min)
1. Create env **Practice – JSONPH** with `baseUrl = https://jsonplaceholder.typicode.com`.
2. Create env **Practice – ECHO** with `baseUrl = https://postman-echo.com` (different API — notice how switching env changes behaviour).
3. Replace hosts with `{{baseUrl}}`. Switch envs and observe.
4. Add collection variable `baseUrl = https://example.invalid` → env value still wins (precedence).
5. In pre-request: `pm.variables.set("baseUrl", "https://httpbin.org/anything")` → local wins over everything.
6. Unselect environment → `{{baseUrl}}` resolves from collection → `ENOTFOUND` → understand the error.
✅ Learned: scopes, precedence, typical errors.

## Lab 6 — Tests (🟡 40 min)
On `GET {{baseUrl}}/users` (JSONPlaceholder):
```javascript
const users = pm.response.json();
pm.test("200", () => pm.response.to.have.status(200));
pm.test("10 users", () => pm.expect(users).to.have.lengthOf(10));
pm.test("Each has email & geo", () => users.forEach(u => {
    pm.expect(u.email).to.include("@");
    pm.expect(u).to.have.nested.property("address.geo.lat");
}));
pm.test("Unique usernames", () => pm.expect(new Set(users.map(u => u.username)).size).to.eql(10));
pm.test("Schema", () => pm.response.to.have.jsonSchema({
    type: "array", items: { type: "object", required: ["id","name","username","email"],
    properties: { id: {type:"integer"}, email: {type:"string"} } } }));
```
Break a test on purpose (`lengthOf(11)`) → read failure message.
✅ Learned: assertions, arrays, schema.

## Lab 7 — Chaining & dynamic data (🟡 40 min) — Restful-Booker
1. `POST {{rbBase}}/auth` body `{"username":"admin","password":"password123"}` → post-response: `pm.environment.set("rbToken", pm.response.json().token)`.
2. `POST {{rbBase}}/booking` with `Accept: application/json`, body using `{{$randomFirstName}}`, `{{$randomLastName}}`, `{{$randomInt}}` → save `bookingid`:
```javascript
const b = pm.response.json();
pm.test("Created", () => pm.response.to.have.status(200));
pm.collectionVariables.set("bookingId", b.bookingid);
pm.collectionVariables.set("firstname", b.booking.firstname);
```
3. `GET {{rbBase}}/booking/{{bookingId}}` → test firstname equals stored value.
4. `PATCH {{rbBase}}/booking/{{bookingId}}` header `Cookie: token={{rbToken}}`, body `{"firstname":"Asha"}` → 200.
5. `DELETE ...` with Cookie → **201** (API's documented behaviour).
6. `GET` again → 404.
✅ Learned: chaining, dynamic variables, "follow the contract".

## Lab 8 — Runner & data-driven (🟡 30 min)
`login.csv`:
```csv
case,username,password,expectReason
valid,admin,password123,
bad password,admin,nope,Bad credentials
empty,,,Bad credentials
```
Request `POST {{rbBase}}/auth` body `{"username":"{{username}}","password":"{{password}}"}`. Test:
```javascript
const reason = pm.iterationData.get("expectReason");
const body = pm.response.json();
pm.test(`[${pm.iterationData.get("case")}]`, () => {
    if (reason) pm.expect(body.reason).to.eql(reason);
    else pm.expect(body.token).to.be.a("string");
});
```
(Restful-Booker returns 200 with `{"reason":"Bad credentials"}` on failure — another real-world quirk worth reporting as a design issue.)
Run in Runner with the file → 3 iterations.
✅ Learned: CSV DDT, iteration data, API quirks.

## Lab 9 — Workflows (🔴 40 min)
1. `GET {{baseUrl}}/posts?userId=1` (JSONPlaceholder) → save the 10 post IDs.
2. `GET {{baseUrl}}/posts/{{postId}}/comments` → loop through all IDs with `setNextRequest` (Chapter 9 Pattern 2), assert each post has 5 comments.
3. Add a guard counter (max 20).
4. Run in Runner → see 10 executions of request 2.
✅ Learned: loops, setNextRequest by ID, guard counters.

## Lab 10 — Pre-request magic (🔴 30 min)
1. Collection pre-request adds `X-Correlation-ID: {{$guid}}`.
2. On `POST https://postman-echo.com/post`, pre-request computes `X-Signature = HMAC-SHA256(body, "secret")`.
3. Post-response verifies echoed header equals your computed signature (`pm.response.json().headers["x-signature"]`).
✅ Learned: modifying requests, CryptoJS, verifying via echo.

## Lab 11 — Mock server (🟡 30 min)
1. In "Orders (Design)" collection create `GET {{baseUrl}}/orders/:id` with examples: `200 OK` (body with `{{$randomPrice}}`), `404 Not found`.
2. Create mock → save mock URL as environment `baseUrl`.
3. Send → 200 example. Add header `x-mock-response-code: 404` → 404 example.
✅ Learned: examples drive mocks; control headers.

## Lab 12 — Newman & CI (🔴 45 min)
1. Export your Restful-Booker collection (v2.1) and environment into a Git repo folder `postman/`.
2. `npx newman run postman/rb.postman_collection.json -e postman/rb.postman_environment.json -r cli,htmlextra --reporter-htmlextra-export out/report.html` (install `newman` and `newman-reporter-htmlextra` as dev dependencies).
3. Make a test fail → check exit code: `echo $?` → 1.
4. Add the GitHub Actions workflow from Chapter 11 → push → see run & artifact.
✅ Learned: CLI, reports, exit codes, CI.

## Lab 13 — OpenAPI import (🟡 20 min)
Import `https://petstore.swagger.io/v2/swagger.json` → generated collection → run `GET /pet/findByStatus?status=available` → add schema test from the spec's `Pet` definition.
✅ Learned: spec → collection workflow.

## Lab 14 — Other protocols (🟡 30 min)
- GraphQL: public demo endpoints exist (e.g., the Countries API `https://countries.trevorblades.com/`) — query `{ country(code:"IN") { name capital currency } }`.
- WebSocket: connect to a public echo server (e.g. `wss://echo.websocket.org`), send JSON, observe echo.
- SOAP: Calculator `Add` request from Chapter 13.
✅ Learned: request types beyond REST. (Public demo endpoints change; search for a current one if needed.)

## Lab 15 — Debugging drills (🔴 30 min)
Create each failure deliberately and fix it using Chapter 16:
1. Typo variable `{{baseurl}}` → ENOTFOUND.
2. `http://localhost:9999` (nothing running) → ECONNREFUSED.
3. `https://expired.badssl.com/` → certificate expired error; `https://self-signed.badssl.com/` → self-signed error; observe toggling SSL verification.
4. `https://wrong.host.badssl.com/` → hostname mismatch.
5. Call `pm.response.json()` on `https://httpbin.org/html` → JSONError `<`.
6. `pm.execution.skipRequest()` in post-response → TypeError.
✅ Learned: real error messages and fixes.

---

## 🎓 Capstone Project — "Restful-Booker Regression Suite" (production-grade)

### Goal
Build a collection that a company could actually run in CI.

### Structure
```
📦 Restful-Booker – Regression
 Collection auth: No Auth (API uses cookie token for writes)
 Collection pre-request: correlation id, prod-write guard
 Collection post-response: no 5xx, responds < 3s, JSON valid
 ├── 📁 00 Setup
 │    ├── GET  Health check (/ping → 201)
 │    └── POST Create token (/auth) → rbToken
 ├── 📁 01 Booking – Positive
 │    ├── POST Create booking → bookingId, snapshot
 │    ├── GET  Get booking by id → deep equals snapshot
 │    ├── GET  List bookings filtered by firstname → contains bookingId
 │    ├── PUT  Update booking (Cookie token) → all fields updated
 │    └── PATCH Partial update → only firstname changed
 ├── 📁 02 Booking – Negative
 │    ├── PUT  Update without token → 403
 │    ├── GET  Non-existent id → 404
 │    ├── POST Create with missing fields → 500 (document as defect: should be 400!)
 │    └── POST Auth bad credentials (data-driven) → reason "Bad credentials"
 ├── 📁 03 Booking – Security
 │    ├── DELETE with tampered token → 403
 │    └── Check response headers (X-Powered-By present → report)
 └── 📁 99 Teardown
      ├── DELETE booking → 201
      └── GET deleted booking → 404 ; unset variables
```

### Requirements checklist
- [ ] `{{rbBase}}` from environment; DEV/QA style envs (both pointing to same public URL for practice).
- [ ] No hard-coded tokens; token set by script.
- [ ] Every request: status + at least one business assertion; positives have schema checks.
- [ ] Data-driven negative auth folder with CSV.
- [ ] Unique test data (`{{$randomFirstName}}` generated once and stored).
- [ ] Descriptions and examples for each request.
- [ ] Teardown runs even when tests fail (no `setNextRequest(null)` mid-run; jump to teardown instead).
- [ ] Newman run with JUnit + htmlextra; GitHub Actions workflow; artifacts uploaded.
- [ ] README in repo explaining how to run.
- [ ] Defects found documented as bug reports (Chapter 16.14 format).

### Stretch goals
- Package Library helper `@me/rb-utils` for common checks.
- Performance tab run: 10 VUs, 2 min ramp-up; record p95.
- Monitor on `/ping` every hour with email alert.
- Visualizer: table of bookings.
- Convert to Native Git (v12) YAML layout and run with `postman collection run <path>`.

### What to say in interviews about this project
"I built a regression suite with setup/teardown, chained auth, data-driven negatives, schema validation and security checks, runnable via Newman in GitHub Actions with JUnit/HTML reports. I found and documented API design defects such as 500 instead of 400 on validation errors and 200 with error body on failed auth."

---

🎉 **You've finished the book.** Go back to Chapter 18 regularly, do the labs twice, and build your own capstone on a real company API (with permission). That's how you become the Postman expert on your team.
