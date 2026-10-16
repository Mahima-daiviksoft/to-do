# Chapter 17 — Organisational Best Practices & Situational Playbook

---

## 17.1 The 40 golden rules (print this)

### Structure
1. One **reference collection** per service (from OpenAPI) + separate **test collections** (smoke, regression, negative, security, E2E).
2. Folders numbered for run order; **Setup** first, **Teardown** last.
3. Requests named clearly; descriptions filled in; examples for main status codes.
4. Auth at **collection level**; requests **inherit**.
5. Shared logic at collection/folder level or **Package Library**; no copy-paste.

### Variables & secrets
6. **`{{baseUrl}}` always**; never hard-code hosts.
7. **Identical variable names** across environments.
8. Config in **environment**, constants in **collection**, runtime IDs in collection/local, **avoid globals**.
9. **No secrets in shared/initial values**, scripts, examples, docs, or exports.
10. Secrets: **Vault** locally, **CI secret store + `--env-var`** in pipelines.
11. Use `secret` type to mask sensitive values on screen.
12. Clean up runtime variables in teardown.

### Tests
13. Every request: status + schema/structure + key business assertions.
14. Negative + boundary + auth tests for every important endpoint.
15. Tests follow the **spec**, not current behaviour.
16. Unique, synthetic test data per run (`runId`, dynamic variables).
17. Tests independent and **idempotent**; can run in any environment (except destructive ones guarded from prod).
18. Generic checks (no 5xx, JSON valid, time SLA) at collection level.
19. Avoid brittle assertions (timestamps, ordering, exact messages unless contractual).
20. Poll instead of fixed waits for async processes.

### Automation
21. Collections run in **CI** on every PR (smoke) and nightly (full).
22. JUnit + HTML reports archived; failures notify the owning team.
23. Pin Newman/CLI versions; keep runner images reproducible.
24. Quality gate: failing API tests block merge/deploy.
25. Prod: **read-only smoke tests + monitors** only.

### Collaboration
26. Team workspaces per domain, clear owners.
27. Fork + PR for shared collections; review with checklist.
28. Comments for discussions; link Jira tickets in descriptions.
29. Version control via Native Git/Git integration or disciplined exports.
30. Onboarding guide in collection overview.

### Security
31. Review third-party collections' scripts before running them with real credentials.
32. Keep SSL verification on; add CA certs instead.
33. Don't log tokens/PII; scrub reports.
34. Least-privilege test & service accounts; rotate keys.
35. Public workspaces reviewed by security before publishing.

### Maintenance
36. Remove dead requests/collections (archive).
37. Migrate legacy `tests[]`/`postman.*` syntax.
38. Keep collections in sync with the spec (Spec Hub sync, contract tests).
39. Track flaky tests and fix root causes.
40. Document conventions in a team "Postman Guidelines" page.

---

## 17.2 Situational playbook — "What do I do if…?"

### 🔥 Situation 1: You join a company with 50 messy collections and no standards
1. **Inventory**: list collections, owners, last updated, usage (who runs them, CI references).
2. **Classify**: keep / merge / archive.
3. **Propose guidelines** (Chapter 14 + 17.1), get buy-in from leads.
4. Start with **one critical service**: build clean reference + smoke collection, wire into CI, show value (caught bugs, saved time).
5. Roll out service by service; pair with teams.
6. Archive the rest after a deprecation period.

### 🔥 Situation 2: A token/secret was committed to a public workspace or Git
1. **Revoke/rotate immediately** (assume it's compromised — bots scan public Postman workspaces and GitHub within minutes).
2. Remove from Postman (shared values, history, examples, docs) and Git history (and consider repo exposure).
3. Check logs for misuse of the leaked credential.
4. Inform security team; follow incident process.
5. Prevent: Vault, secret scanner alerts, pre-commit secret scanning (gitleaks/trufflehog), review public workspace settings.

### 🔥 Situation 3: Tests pass locally but fail in CI
Run through Chapter 11.9 table: environment/secrets passed? file paths? OAuth interactive? Vault? Newman version vs app features? CA certs/proxy? timeouts? data collisions? Add `--verbose` and print (non-secret) variable values to debug.

### 🔥 Situation 4: Backend isn't ready, frontend needs to start
1. Agree on the contract (OpenAPI in Spec Hub).
2. Add **examples** (success + errors) → **mock server**.
3. Frontend uses `{{baseUrl}}` = mock URL; error states via `x-mock-response-code`.
4. Backend implements; QA writes tests against mock first (structure), then switches env to real QA server.
5. Contract tests ensure real API matches spec.

### 🔥 Situation 5: An API change broke 200 tests overnight
1. Check: intentional (release notes, spec diff) or regression?
2. If regression → bug with evidence; block release.
3. If intentional → was it **breaking**? Should have been versioned; raise process issue.
4. Update spec → sync collection → bulk-fix tests (Find & Replace, shared helpers make this quick).
5. Add **contract tests + spec linting** in CI to catch breaking changes before merge.

### 🔥 Situation 6: Production incident — "API is slow/erroring"
1. Use **read-only** requests against prod (with approval) to reproduce; capture response times breakdown (DNS/TLS/TTFB).
2. Compare regions/environments (monitor results by region).
3. Provide correlation IDs to SRE.
4. Don't run load tests on prod during an incident!
5. After: add a **monitor** for that endpoint/SLA.

### 🔥 Situation 7: You need to test 10,000 combinations
1. Generate a data file (script) with **pairwise/combinatorial** reduction where possible.
2. Run via **Newman/CLI**, not the app; disable response saving; split into parallel jobs with unique data.
3. Report via JUnit/htmlextra (`showOnlyFails`).

### 🔥 Situation 8: Rate limits block your test runs
Delays between requests, retry with `Retry-After`, separate test accounts/API keys, ask for higher limits in test env, avoid unnecessary calls (cache tokens!).

### 🔥 Situation 9: Async/eventual consistency (Kafka/queues) makes tests flaky
Polling pattern with timeout and max attempts (Chapter 9), assert final state; avoid fixed `setTimeout(5000)`; check idempotency of event consumers by replaying.

### 🔥 Situation 10: Multi-tenant SaaS testing
Environment per tenant or tenant ID variable; cross-tenant access tests (BOLA across tenants!); data cleanup per tenant.

### 🔥 Situation 11: You must test a file upload API
form-data with File type; set per-part content type if needed; keep files in repo (`files/`); Newman `--working-dir`; test size limits (413), wrong types (415/400), malicious names (`../../x.sh`), zero-byte files, corrupted files.

### 🔥 Situation 12: Manager asks "How much of our API is tested?"
Postman doesn't produce code coverage; build **API coverage**: list endpoints from OpenAPI vs requests in test collections (Postman API + script), per method & status code; track in dashboard. Some Postman views and Insights help discover endpoints actually used.

### 🔥 Situation 13: Testing a legacy SOAP service alongside REST
Import WSDL; envelopes with variables; `xml2Json`/cheerio tests; fault tests; keep in same collection under `SOAP` folder or separate collection.

### 🔥 Situation 14: Migrating from another tool (Insomnia, SoapUI, Thunder Client, JMeter)
Export from tool (Insomnia export / OpenAPI / HAR / cURL) → import → fix auth & variables → rewrite assertions in `pm.*` (SoapUI Groovy assertions don't convert) → run side by side until confidence.

### 🔥 Situation 15: Migrating away from Postman (or to Native Git)
Export v2.1 JSON or use Native Git YAML; tests in `pm.*` only run in Postman-compatible runners (Newman/CLI) — plan rewrite if moving to code-based frameworks (REST Assured, Playwright API, pytest+requests, Karate).

---

## 17.3 Postman vs other tools (know when to use what)

| Tool | Type | When better than Postman |
|---|---|---|
| **cURL / HTTPie** | CLI | Quick one-offs, scripts, servers without GUI |
| **Insomnia / Bruno / Hoppscotch / Thunder Client** | API clients | Bruno: Git-native, offline, plain files (Postman v12 now similar); Hoppscotch: web/open-source |
| **SoapUI / ReadyAPI** | API testing | Heavy SOAP/WS-* enterprise testing |
| **REST Assured (Java), pytest+requests (Python), Playwright/Supertest (JS), Karate** | Code frameworks | Complex logic, reuse with app code, strong typing, large-scale automation owned by SDETs |
| **JMeter / k6 / Gatling / Locust** | Load testing | Real performance/load testing |
| **OWASP ZAP / Burp** | Security | Scanning/fuzzing |
| **WireMock / Prism / MockServer** | Mocking | Stateful, local, programmable mocks |
| **Swagger UI / Redoc / Stoplight** | Docs/design | Docs embedded in your product site |

**Interview answer pattern:** "Postman is excellent for exploratory testing, collaboration, documentation, and maintainable API regression suites runnable in CI via Newman/Postman CLI. For very complex automation logic or heavy load, I'd complement it with code frameworks or k6/JMeter."

---

## 17.4 A maturity model for API testing with Postman

| Level | Characteristics |
|---|---|
| 0 — Ad hoc | Random requests in personal workspaces, no tests |
| 1 — Organised | Collections, environments, variables, basic status tests |
| 2 — Automated | Scripts chaining, schema tests, data-driven, Runner |
| 3 — Integrated | Newman/CLI in CI with quality gates, reports, monitors |
| 4 — Governed | Spec-first, contract tests, linting, Package Library, Native Git/PR reviews, security suites |
| 5 — Optimised | Coverage metrics, Insights-driven discovery, flaky-test tracking, AI-assisted maintenance, self-service API Catalog |

Use this in interviews when asked "How would you improve our API testing?"

➡️ Next: **Chapter 18 — Interview Questions & Answers (Entry → Expert)**.
