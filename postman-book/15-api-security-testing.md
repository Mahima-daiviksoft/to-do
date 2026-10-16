# Chapter 15 — API Security Testing with Postman

> ⚖️ **Only test systems you own or are explicitly authorised to test** (your company's QA/staging, bug bounty programs within scope, CTF labs). Unauthorised security testing is illegal in most countries.

> 🧒 Security testing is **checking every door and window of your own house** to make sure a thief can't get in — trying the handle, checking if the spare key is under the mat, seeing if the window latch is broken.

Postman is not a full security scanner (like Burp Suite, OWASP ZAP), but it's excellent for **manual and automated logic-level security tests** (auth, authorization, input validation, data exposure), especially as **regression tests** in CI.

---

## 15.1 OWASP API Security Top 10 (2023) — with Postman tests

### API1:2023 — Broken Object Level Authorization (BOLA / IDOR)
User A can access User B's object by changing an ID.
```
GET {{baseUrl}}/orders/{{orderIdOfUserB}}
Authorization: Bearer {{tokenUserA}}
```
```javascript
pm.test("BOLA: cannot read other user's order", () => pm.expect(pm.response.code).to.be.oneOf([403, 404]));
```
Automate: setup creates resources as User B, tests access them as User A for **every endpoint with an ID** (GET/PUT/PATCH/DELETE). Data-drive IDs. Also try sequential/guessable IDs, UUIDs from other responses, IDs in body/query/headers, not only path.

### API2:2023 — Broken Authentication
- No token / malformed / expired / tampered / `alg:none` JWT → 401.
- Brute force: 20 wrong passwords → lockout or 429.
- Password reset token reuse/expiry; OTP brute force; weak token entropy.
- Credential stuffing protections, no credentials in URLs.
```javascript
// Data-driven: tokens.csv with columns token,expected
pm.test(`token case → ${pm.iterationData.get("expected")}`, () =>
    pm.response.to.have.status(Number(pm.iterationData.get("expected"))));
```

### API3:2023 — Broken Object Property Level Authorization
Combines old "Excessive Data Exposure" and "Mass Assignment".
- **Excessive exposure**: response includes fields user shouldn't see (`passwordHash`, `internalNotes`, other users' emails).
```javascript
pm.test("No sensitive props", () => {
    const text = pm.response.text();
    ["passwordHash", "ssn", "cardNumber", "secret", "internal"].forEach(k => pm.expect(text).to.not.include(`"${k}"`));
});
```
- **Mass assignment**: send extra fields that shouldn't be writable.
```json
PATCH /users/me
{ "name": "Asha", "role": "admin", "isVerified": true, "balance": 999999 }
```
```javascript
pm.sendRequest({ url: pm.variables.replaceIn("{{baseUrl}}/users/me"), header: { Authorization: "Bearer " + pm.environment.get("accessToken") } },
  (e, r) => pm.test("role not escalated", () => pm.expect(r.json().role).to.not.eql("admin")));
```

### API4:2023 — Unrestricted Resource Consumption
- No pagination limits (`?limit=1000000`), huge payloads, big file uploads, expensive GraphQL queries, no rate limiting.
```javascript
pm.test("Server caps page size", () => pm.expect(pm.response.json().data.length).to.be.at.most(100));
```
- Burst requests in Runner (no delay) → expect **429** with `Retry-After`. (Coordinate with team; don't DoS shared environments.)

### API5:2023 — Broken Function Level Authorization (BFLA)
Normal user calling admin functions.
```
DELETE {{baseUrl}}/admin/users/123      Authorization: Bearer {{userToken}}   → expect 403
GET    {{baseUrl}}/internal/metrics                                          → expect 401/403/404
```
Try changing method (`GET` allowed → try `PUT`/`DELETE`), changing path (`/api/v1/users` → `/api/v1/admin/users`), and hidden/old versions (`/v0/`).

### API6:2023 — Unrestricted Access to Sensitive Business Flows
Abuse of legitimate flows at scale: buying all limited stock, mass coupon redemption, fake account creation, spam referrals. Test: same coupon applied twice, negative quantities, race conditions (run two requests in parallel with `pm.sendRequest`), skipping steps (pay → ship without payment).

### API7:2023 — Server-Side Request Forgery (SSRF)
APIs that fetch URLs you provide (webhooks, avatar URL import, PDF generation).
```json
{ "avatarUrl": "http://169.254.169.254/latest/meta-data/" }
{ "webhookUrl": "http://localhost:6379/" }
{ "importUrl": "file:///etc/passwd" }
```
Expect rejection (400) and no internal data in responses/time differences.

### API8:2023 — Security Misconfiguration
```javascript
const h = pm.response.headers;
pm.test("HSTS", () => pm.expect(h.get("Strict-Transport-Security")).to.exist);
pm.test("nosniff", () => pm.expect(h.get("X-Content-Type-Options")).to.eql("nosniff"));
pm.test("No server banner", () => { pm.expect(h.has("X-Powered-By")).to.be.false; });
pm.test("CORS not wildcard with credentials", () => {
    const acao = h.get("Access-Control-Allow-Origin"); const acac = h.get("Access-Control-Allow-Credentials");
    pm.expect(!(acao === "*" && acac === "true")).to.be.true;
});
pm.test("No stack trace", () => pm.expect(pm.response.text()).to.not.match(/Exception|Traceback|at [\w.$]+\(/));
```
Also: `TRACE` disabled, `OPTIONS` reveals only intended methods, HTTP → HTTPS redirect, verbose errors, default credentials, debug endpoints (`/actuator`, `/swagger-ui`, `/debug`) exposed in prod.

CORS test: send `OPTIONS` with `Origin: https://evil.example` and `Access-Control-Request-Method: PUT` → server must not reflect evil origin.

### API9:2023 — Improper Inventory Management
Old/undocumented versions and hosts still live (`/v1` deprecated but reachable without new protections; `beta-api.company.com`). Use Postman **Insights**/API Catalog to discover; test old versions for missing auth.

### API10:2023 — Unsafe Consumption of APIs
Your API trusts third-party API data blindly. Use mocks to return malicious/malformed third-party responses (huge payloads, injection strings, redirects) and verify your API handles them safely.

---

## 15.2 Injection testing with data files
`injection.csv`:
```csv
payload,description
' OR '1'='1,SQLi classic
"'; DROP TABLE users;--",SQLi destructive (test env only!)
"{""$gt"":""""}",NoSQL operator
<script>alert(1)</script>,XSS stored
"{{7*7}}",SSTI
"../../../../etc/passwd",Path traversal
"; ls -la",Command injection
%00,Null byte
```
Body: `{"search": "{{payload}}"}` (careful with quoting in JSON — escape `"` in payloads or use a JSON data file).
Tests: status not 500, response doesn't include DB errors (`SQL syntax`, `ORA-`, `MongoError`), XSS payload is escaped/encoded when reflected, time-based checks (`responseTime` not suspiciously high for `SLEEP(5)` payloads).

> ⚠️ Destructive payloads only in disposable test environments with permission.

---

## 15.3 Security regression suite structure
```
📦 Orders API – Security
 ├── 📁 AuthN (no token, bad token, expired, alg none, revoked)
 ├── 📁 AuthZ – BOLA (userA vs userB for each endpoint)
 ├── 📁 AuthZ – BFLA (user vs admin endpoints & methods)
 ├── 📁 Property-level (mass assignment, data exposure)
 ├── 📁 Input validation & injection (data-driven)
 ├── 📁 Rate limiting & resource limits
 ├── 📁 Headers & CORS & TLS config
 └── 📁 Business logic abuse
```
Run nightly in CI against staging; failures = security bugs → triage with security team.

---

## 15.4 Postman's own security hygiene
| Risk | Mitigation |
|---|---|
| Secrets in shared values / exported files | Vault, local values, CI secrets; secret scanner |
| Accidentally public workspace | Review visibility; Enterprise admins restrict public workspace creation |
| Tokens in screenshots/Console/HTML reports | Secret type, `skipSensitiveData`, scrub logs |
| Over-privileged API keys for Postman API | Service accounts, least privilege, rotation |
| Using production data for tests | Synthetic data (dynamic variables), masked datasets |
| Disabling SSL verification globally | Add CA certs instead; disable per request only for local dev |
| Proxy capture certificate left trusted on devices | Remove Postman CA after capture sessions |
| Running untrusted collections (scripts can `sendRequest` your tokens anywhere) | Review scripts in imported/public collections before running with real credentials |

That last one is important: **a collection's scripts can read your environment (including tokens) and send them to any URL**. Treat third-party collections like third-party code.

---

## 15.5 Postman vs dedicated security tools
| Tool | Strength |
|---|---|
| Postman | Business-logic auth/authorization tests, regression in CI, readable for whole team |
| OWASP ZAP / Burp Suite | Proxy-based scanning, fuzzing, active vulnerability detection |
| Specialized API security platforms | Spec-based fuzzing, runtime protection |
| SAST/DAST in CI | Code & running app scanning |
Common combo: import Postman collection into ZAP/Burp (via proxy run or OpenAPI) to scan endpoints that need complex auth flows.

---

## 15.6 Chapter 15 Quick Revision
- OWASP API Top 10 2023: BOLA, Broken Auth, Broken Object Property Level AuthZ, Unrestricted Resource Consumption, BFLA, Sensitive Business Flows, SSRF, Security Misconfiguration, Improper Inventory Management, Unsafe Consumption of APIs.
- Postman shines at authz matrices (userA vs userB, user vs admin), mass-assignment, exposure, headers/CORS, data-driven injection.
- Never run destructive payloads outside disposable environments with permission.
- Third-party collection scripts can exfiltrate your variables — review before running.

➡️ Next: **Chapter 16 — Debugging & Troubleshooting (Every Common Error)**.
