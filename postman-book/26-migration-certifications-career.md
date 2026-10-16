# Chapter 26 — Migration Guides, Certifications & Career Growth

---

## PART A — Migrating to (and from) Postman

### 26.1 General migration method (any tool)
1. **Inventory**: list suites, number of requests and tests, data sources, CI jobs, owners.
2. **Export** in the most portable format available: **OpenAPI**, **cURL**, **HAR**, or the tool's native export if Postman imports it.
3. **Import** into a *migration* workspace and fix base URLs, **variables**, **auth** and **environments** first.
4. **Rewrite assertions** in `pm.*`/Chai. Scripts never convert automatically between tools' languages.
5. **Run old and new side by side** for a few cycles and compare pass/fail and coverage.
6. **Switch CI** (Newman/Postman CLI), then **archive** the old suite (read-only) for a retention period.

### 26.2 SoapUI / ReadyAPI → Postman

| SoapUI concept | Postman equivalent |
|---|---|
| Project | Workspace / collection |
| TestSuite / TestCase | Folder / sub-folder (one test case = ordered requests) |
| TestStep (SOAP/REST request) | Request |
| WSDL import | **Import → WSDL** (generates request per operation) |
| Assertions (XPath Match, Contains, Script/Groovy) | `pm.test` with `xml2Json`/`cheerio` (XML) or `pm.response.json()` |
| Property Transfer | Post-response script → `pm.collectionVariables.set` |
| Properties (project/suite/case) | Collection / environment / local variables |
| DataSource / DataSource Loop | Runner/Newman data file (CSV/JSON) |
| Groovy setup/teardown scripts | Collection/folder pre-request & post-response scripts, Setup/Teardown folders |
| Load tests | Postman performance runs (basic) or k6/JMeter |
| testrunner.sh in CI | `newman run` / `postman collection run` |

XPath assertion example → Postman:
```javascript
// SoapUI XPath:  //AddResult = 12
const $ = cheerio.load(pm.response.text(), { xmlMode: true });
pm.test("AddResult is 12", () => pm.expect($("AddResult").text()).to.eql("12"));
```

### 26.3 Insomnia → Postman
- Export from Insomnia (collection/workspace export) and use Postman **Import**. Recent Postman versions accept Insomnia exports; if yours doesn't, export **OpenAPI** or **HAR** instead.
- Insomnia environments (JSON, nested) → Postman environments (flat key/value). Flatten nested values.
- Insomnia template tags/plugins → Postman dynamic variables or pre-request scripts.

### 26.4 Thunder Client / Hoppscotch / Bruno → Postman
- Most can **export Postman-format collections** or OpenAPI. Import, then fix variables and auth.
- Bruno stores requests as `.bru` text files. Exporting to Postman collection format (from Bruno) or OpenAPI is the usual route.

### 26.5 JMeter → Postman (functional parts only)
- There's no direct import. Recreate the HTTP samplers as requests (cURL/HAR help).
- Map assertions (Response Assertion, JSON Assertion) → `pm.test`; CSV Data Set Config → data files; extractors (JSON/Regex) → post-response scripts.
- **Keep load testing in JMeter/k6.** Postman's performance runner is for lighter checks.

### 26.6 Postman → code frameworks (REST Assured, Playwright, pytest)
Teams move when they need complex logic, shared code with the app, or very large suites.

| Postman | REST Assured (Java) | Playwright API (TS) | pytest + requests (Python) |
|---|---|---|---|
| `pm.response.to.have.status(200)` | `.then().statusCode(200)` | `expect(res.status()).toBe(200)` | `assert r.status_code == 200` |
| `pm.response.json().id` | `.extract().path("id")` | `(await res.json()).id` | `r.json()["id"]` |
| JSON schema test | `matchesJsonSchemaInClasspath("s.json")` | ajv in test | `jsonschema.validate(...)` |
| Environment | properties/profiles | `.env` + config | fixtures/env vars |
| Data file | TestNG DataProvider | `test.describe` loops | `@pytest.mark.parametrize` |

Tip: keep the **Postman collection as living documentation and for exploratory work** even after moving automation to code.

### 26.7 Postman → Postman v12 Native Git
See Chapter 21.8 (playbook).

---

## PART B — Certifications & learning paths

### 26.8 Official Postman credentials
- **Postman API Fundamentals Student Expert**: Postman's best-known badge, earned through the Postman Student program / Postman Academy by completing a hands-on training collection with practical tasks that's submitted for review. You get a digital badge/certificate to show on LinkedIn and your CV. (Despite the "Student" name, many working professionals complete it as an introduction.)
- **Postman Academy** also offers free courses and learning paths with completion badges (e.g. on API testing, Flows, Native Git and newer features). The catalogue changes, so check **academy.postman.com** for current courses and badges.

> ⚠️ Many "Postman certification" courses online are **third-party** (Udemy, training institutes). They can be useful for learning, but they aren't official Postman credentials. Be precise about this on your CV.

### 26.9 Complementary certifications employers value (API/QA roles)
- **ISTQB** Foundation, plus **Test Automation Engineer** / Advanced levels (testing fundamentals).
- **Cloud** basics (AWS/Azure/GCP associate level) for understanding gateways, IAM and serverless APIs.
- **Security**: OWASP knowledge; API security courses (e.g. APIsec University's free courses).
- **Programming**: JavaScript fundamentals (Postman scripting), plus Java/Python if moving to code frameworks.

---

## PART C — Career growth with Postman skills

### 26.10 Skills matrix

| Level | You can… |
|---|---|
| **Beginner** | Send requests, use params/headers/body, read status codes, save collections, basic tests |
| **Intermediate** | Environments and variables strategy, auth (OAuth 2.0), chaining, data-driven runs, schema tests, Newman in CI |
| **Advanced** | Framework design, Package Library, token caching, workflows (`setNextRequest`), mocks/monitors, security suites, troubleshooting anything |
| **Expert/Lead** | Governance, Native Git adoption, contract-testing strategy (Spec + Pact), CI quality gates, coverage metrics, team standards, mentoring |

### 26.11 Build a portfolio (gets interviews)
- A **public Postman workspace** (no secrets!) with a well-documented collection against public APIs (the Chapter 20 capstone): environments, tests, data-driven folder, visualizer, mock.
- A **GitHub repo** with the exported collection (or Native Git YAML), a GitHub Actions workflow running Newman/Postman CLI, HTML report artifacts, and a README.
- A short **write-up** (blog/LinkedIn): "How I built an API regression suite with Postman and CI."

### 26.12 Strong CV bullet examples
- "Built Postman regression suites (420 tests across 6 microservices) run by Newman in Jenkins; cut regression time from 2 days of manual testing to 18 minutes."
- "Introduced OAuth 2.0 token caching and Package Library helpers, reducing duplicated script code by ~70%."
- "Designed BOLA/IDOR security test matrix in Postman; found 3 high-severity authorization defects before release."
- "Migrated 900 SoapUI test steps to Postman/Newman with side-by-side parity runs over 2 sprints."
- "Led adoption of Spec Hub governance rules and contract tests; breaking API changes caught in PRs instead of production."

(Use **your real numbers**. Interviewers ask follow-up questions on every bullet.)

### 26.13 Roles that use these skills
QA Engineer, SDET / Automation Engineer, API Test Lead, Backend Developer, Integration Engineer, Solutions/Support Engineer (debugging customer API issues), Developer Advocate, API Product Manager, DevOps/SRE (monitors, health checks), Security Tester (API).

➡️ Back to the **[README](README.md)** for the full table of contents.
