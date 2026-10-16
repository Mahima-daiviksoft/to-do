# Chapter 18D — Researched Interview Patterns, Company-Tagged Questions & Verified Gotchas

> **How this chapter was built (honest note):** In October 2026, I searched interview-prep sites, QA blogs and question banks for Postman/API testing questions, including searches for specific employers (TCS, Infosys, Wipro, Cognizant, Accenture, Capgemini, HCL, Tech Mahindra, Amazon, Microsoft, Flipkart). Findings:
> - **Candidate-reported, company-specific data is scarce** in what search engines index. Glassdoor/AmbitionBox/Reddit pages didn't come up in usable form.
> - A few prep sites tag questions to companies (Accenture, Cognizant, Wipro, Microsoft). They **don't prove** these were asked, so they're labelled *"tagged by prep site, unverified"* below.
> - The strongest signal is **which topics recur across many independent question banks**. That frequency table is in 18D.1.
>
> Section 18D.4 adds **"gotcha" questions that came from actually running the book's code in Newman**. These separate people who have *used* Postman deeply from people who memorised lists.

---

## 18D.1 What interviewers ask most (recurring themes across sources)

| Rank | Theme (seen in most question banks) | Where answered in this book |
|---|---|---|
| 1 | Variable scopes & precedence; environment vs collection vs global | Ch 5, Q62–Q66 |
| 2 | Pre-request vs test (post-response) scripts; `pm.test`/`pm.expect` | Ch 7–8, Q96–Q99, Q126 |
| 3 | Collections, folders, Collection Runner | Ch 4, 10 |
| 4 | Data-driven testing with CSV/JSON | Ch 10, Q150–Q153 |
| 5 | Newman & CI/CD (Jenkins, GitHub Actions) | Ch 11, Q159–Q172 |
| 6 | Authentication: Bearer, OAuth 2.0, API keys, JWT | Ch 6, Q37–Q42 |
| 7 | Request chaining (token → next request) | Ch 9, Q146–Q148 |
| 8 | Status codes (401 vs 403, 400 vs 422, 5xx) | Ch 1, Q18–Q26 |
| 9 | Schema validation | Ch 8.5, Q136 |
| 10 | Mock servers & monitors | Ch 12, Q173–Q178 |
| 11 | Scenario: **API returns 200 but the body contains an error** | S21 + 18D.3 |
| 12 | Scenario: **token expires in the middle of a collection run** | Ch 6.13, Q148, 18D.3 |
| 13 | Scenario: **intermittent/flaky failures** (debug with the Console first) | S9, Ch 16 |
| 14 | Scenario: **Newman passes locally but fails in CI** | Ch 11.9, S3 |
| 15 | Mocks for deterministic CI / API not ready | Ch 12, S8 |
| 16 | Postman vs REST Assured / when to use code frameworks | A2, Ch 17.3 |
| 17 | Real defects you've found: wrong status code for negative case, authorization errors for valid users, wrong error messages | Q53, 18D.3 |

> 💡 **Precedence wording trap:** some question banks write the order as "Global → Collection → Environment → Data → Local". That lists **broadest to narrowest**. It means the same as this book's "Local > Data > Environment > Collection > Global" (**narrowest wins**). In an interview, say both directions explicitly: *"Local has the highest priority and global the lowest."*

---

## 18D.2 Company-tagged questions (tagged by prep sites, unverified)

These are the questions prep sites associate with specific employers. Use them as practice, not as a guarantee.

### Accenture (tagged)
**Q. API testing vs UI testing — why would you test at API level?**
API tests are faster and more stable, run before the UI exists, reach edge cases the UI blocks, and pinpoint which service failed. UI tests verify the user journey and rendering. A strong suite uses many API tests and few UI tests (the test pyramid).

**Q. How would you test API performance under high traffic?**
Define SLAs (p95 latency, error rate, throughput). Start with Postman's performance runner (virtual users, ramp-up/spike profiles) for a baseline. For real scale use k6/JMeter/Gatling from distributed load generators against a production-like environment. Watch server metrics and look for the saturation point (latency rises while throughput flattens), plus 429/503 behaviour.

**Q. How do you reduce API test execution time?**
- Run collections and folders in parallel CI jobs.
- Split smoke from full regression.
- Cache tokens instead of logging in per request.
- Replace fixed delays with polling.
- Mock slow third parties.
- Move heavy data-driven suites to nightly.
- Find slow requests from run timings.

**Q. How do you do data-driven API automation?**
Use CSV/JSON data files with Runner/Newman `-d`. Use `{{column}}` in requests and `pm.iterationData` in assertions, with expected values per row (e.g. `expectedStatus`). Normalise types: Newman converts number-like CSV values (18D.4).

### Cognizant (tagged)
**Q. How do you generate automated test reports?**
Newman reporters: `-r cli,junit,htmlextra` with `--reporter-junit-export` for CI test tabs and htmlextra for readable HTML. Or the Postman CLI's `-r junit,html`, plus run results in Postman/API Catalog. Publish artifacts in CI and notify via Slack/Teams (a custom reporter, Ch 25).

**Q. How do you simulate network failures during API testing?**
- Mock servers returning 500/503/504 (`x-mock-response-code`).
- Mock network delay to trigger client timeouts.
- Very low `--timeout-request` values.
- Point to unreachable hosts or closed ports (ECONNREFUSED/ENOTFOUND).
- Use proxy/fault-injection tools (Toxiproxy, service-mesh fault injection) for resets and latency.

Then verify retries, backoff, idempotency and error messages.

### Wipro (tagged)
**Q. How do you decide between UI automation and API automation?**
Automate business rules, validation, integrations and data permutations at the API level (fast, stable). Automate only critical user journeys and UI-specific behaviour at the UI level. Consider ROI, stability, and how early you can start.

*(Prep sites also note Wipro rounds can mix API testing with Selenium, SQL, TestNG, Agile and CI/CD questions. Prepare to connect Postman/Newman into a TestNG/Jenkins world.)*

### Microsoft (tagged)
**Q. Write a sample test for an API in Postman (or REST Assured).**
```javascript
pm.test("GET /users/1 returns the right user", () => {
  pm.response.to.have.status(200);
  const u = pm.response.json();
  pm.expect(u).to.include.keys("id", "name", "email");
  pm.expect(u.id).to.eql(1);
  pm.expect(u.email).to.match(/@/);
});
pm.test("responds under 500 ms", () => pm.expect(pm.response.responseTime).to.be.below(500));
```
REST Assured equivalent: `given().get("/users/1").then().statusCode(200).body("id", equalTo(1)).time(lessThan(500L));`

### Fintech/product companies (tagged generically, e.g. payments firms)
Expect idempotency (`Idempotency-Key`), webhook signature verification (HMAC), retries without double charges, and rate limits. See Ch 7.5, S5, S27.

---

## 18D.3 Scenario questions that recur across sources (full model answers)

**Q. The API returns 200 but the body says `{"success": false, "error": "Insufficient balance"}`. How do you test and what do you report?**
Never trust the status code alone. Assert the business result: `pm.expect(json.success).to.be.true`, and `pm.expect(json).to.not.have.property("error")`. For negative cases, assert the error code/message. Report it as an API design defect, because errors should use 4xx/5xx (unless the contract or protocol says otherwise, as in GraphQL), since clients, monitors and caches rely on status codes.

**Q. Your token expires halfway through a 400-request run. Fix it.**
Add a collection-level pre-request script that stores `accessTokenExpiresAt` and refreshes the token via `pm.sendRequest` when it's missing or about to expire (with a safety margin). Postman waits for the callback before sending. This exact pattern was verified in Newman 6 for this book (Ch 6.13). Optionally add a one-time retry on 401.

**Q. Tests fail randomly about one run in five. How do you investigate?**
1. Open the Console/CI logs for the failing request and compare actual vs expected.
2. Classify: timing (async not finished), data collisions (shared records, parallel jobs), environment instability (5xx), order dependencies, volatile assertions (timestamps, ordering), rate limits (429).
3. Fix the root cause: polling, unique data, isolation, tolerant assertions, retry only transient codes.
4. Track flakiness over time.

**Q. You found an authorization error for valid users. How do you narrow it down?**
- Decode the JWT: are the roles/scopes present, is `aud` right for this API/environment, is it expired?
- Compare a working and a failing user's tokens.
- Check the gateway/WAF logs via correlation ID.
- Check caching of permissions.
- Check tenant/organisation headers.
- Reproduce with cURL to rule out client-side issues.

**Q. Negative test returns the wrong error message/status. How do you report it?**
Show the request (cURL, secrets redacted), the expected result per spec (e.g. 400 with `email is required`), and the actual result (500 / generic message). Include the correlation ID, environment and timestamp, and save the response as an example (Ch 16.14 template).

---

## 18D.4 Verified gotchas (from running this book's code in Newman 6.2.3)

These come from real runs while checking the book, not from memory. They're great "experienced-level" answers.

| # | Question | Verified answer |
|---|---|---|
| G1 | Your CSV has `zip` = `007` and `expectedStatus` = `200`. What arrives in the script under Newman? | Number-like values are **converted to numbers**: `7` and `200`. Leading zeros are lost, and `1e3` becomes `1000`. `true`/`false` stay **strings**. Normalise, or use a JSON data file |
| G2 | Does top-level `await pm.sendRequest(...)` work everywhere? | **No.** It works in recent Postman app versions, but Newman 6 throws `SyntaxError: await is only valid in async functions...`, and its `pm.sendRequest` returns no promise. Wrap it in a Promise inside an async IIFE |
| G3 | You `throw new Error()` in a pre-request "prod guard". Is the request blocked? | In the app, yes. In **Newman, the error is reported but the request is still sent.** Use `pm.execution.skipRequest()` for a guard that works everywhere |
| G4 | `const _ = require("lodash")` fails. Why? | `_` is already a **global** in the sandbox, so redeclaring it throws `Identifier '_' has already been declared`. Use the global `_` or another name |
| G5 | `pm.request.body.update(...)` throws `Cannot read properties of undefined`. Why? | The request was saved **without a body** (e.g. a GET), so `pm.request.body` is undefined. Assign a body object instead: `pm.request.body = { mode: "raw", raw: ... }` |
| G6 | You add `X-Correlation-ID` in a request script and the server sees two values. Why? | A collection script already set it, and `headers.add` **appends** (the server receives `"a, b"`). Use `headers.upsert` |
| G7 | `pm.response.cookies` is empty in CI but cookies exist. Why? | In Newman 6 `pm.response.cookies` came back empty. Use `pm.cookies.get/has` (cookie jar) or parse `Set-Cookie` headers from `pm.response.headers.all()` |
| G8 | `pm.execution.skipRequest()` in post-response? | `TypeError: pm.execution.skipRequest is not a function`. It's pre-request only |
| G9 | `pm.sendRequest("{{baseUrl}}/x")` fails with what? | `getaddrinfo ENOTFOUND {{baseurl}}`. Variables aren't resolved in `sendRequest` strings, so use `pm.variables.replaceIn` |
| G10 | A variable set in a request's post-response script: is it used by that request's URL? | No, the request was already sent (the server saw the literal `{{late}}`). The **next** request gets the value |
| G11 | A retry loop retries 503s, but the run still shows failures. Why? | A **collection-level** generic test ("no 5xx") ran on every attempt. Make generic checks retry-aware |
| G12 | Can Newman use `pm.vault` or `pm.require`? | No, both are `undefined` in Newman. Inject secrets with `--env-var` and keep helpers inline (or use the Postman CLI for team packages) |
| G13 | Does `pm.response.to.be.ok` pass for 202? | No. `.ok` is exactly 200; `.success` is any 2xx (both verified) |
| G14 | Pact provider verification returns 403 "request blocked" on localhost in CI. Why? | The corporate/CI HTTP proxy intercepts `127.0.0.1`. Set `NO_PROXY`, or unset proxy variables for that step (Ch 24) |
| G15 | Can Newman run v12 YAML (Collection v3) collections? | No, only the **Postman CLI** can (Ch 21) |

---

## 18D.5 Mock interview script (60 minutes)

| Minutes | Interviewer asks | Practise with |
|---|---|---|
| 0–10 | Intro, your Postman experience, project architecture | 26.12 CV bullets, A1 |
| 10–20 | Fundamentals rapid-fire: methods, codes, idempotency, scopes | 18A, 18C rapid-fire |
| 20–35 | Live coding: write tests, chain token, schema validation, loop | 18C C1–C20 |
| 35–50 | Scenarios: 200-with-error, token expiry, flaky, CI-only failure | 18D.3, S1–S30 |
| 50–60 | Design: framework for many services; your questions to them | A1–A10 |

**Good questions to ask the interviewer:** How are API tests owned (dev vs QA)? Spec-first or code-first? Which Postman version and plan: Native Git? How do you handle test data and secrets in CI? What's the biggest API-quality pain today?

---

## Sources consulted for 18D (prep sites; quality varies)
- [Hirist — Top 40+ API Testing Interview Questions (2026)](https://www.hirist.tech/blog/top-40-api-testing-interview-questions-and-answers/)
- [Hirist — 20+ Postman Interview Questions (2026)](https://www.hirist.tech/blog/top-20-postman-interview-questions-and-answers/)
- [igmGuru — Top 50 Postman Interview Questions 2026](https://www.igmguru.com/blog/postman-interview-questions)
- [Simpliaxis — Postman Interview Questions 2026](https://www.simpliaxis.com/resources/postman-interview-questions-and-answers)
- [SoftwareTestPilot — Postman Interview Questions 2026](https://softwaretestpilot.com/blog/api-testing/postman-interview-questions-2026)
- [Intervue — Postman Interview Questions](https://www.intervue.io/interview-questions/postman-interview-questions/)
- [Skilr — Top 50 Postman Interview Questions](https://www.skilr.com/blog/top-50-postman-interview-questions-and-answers/)
- [Hyring — Postman Interview Questions](https://hyring.com/jobseeker-toolkit/interview-questions/technical/postman)
- [Postman Blog — API Testing Interview Questions](https://blog.postman.com/api-testing-interview-questions/)
- [ACTE — Wipro Software Testing Interview Questions](https://www.acte.in/wipro-software-testing-interview-questions-and-answers)
- [Cloudsoft — Top 20 SDET Interview Questions](https://cloudsoftsol.com/news/top-20-sdet-interview-questions/)
- [Automaters — Top 80 API Testing Interview Questions](https://automationreinvented.blogspot.com/2022/03/top-80-api-testing-interview-questions.html)
- [Rahul Shetty Academy — Top 30 API Testing Interview Questions](https://rahulshettyacademy.com/blog/index.php/2021/07/31/top-30-api-testing-interview-questions-and-answers-part-2/)
- [Indeed — Postman interview questions](https://www.indeed.com/career-advice/interviewing/postman-interview-questions)
