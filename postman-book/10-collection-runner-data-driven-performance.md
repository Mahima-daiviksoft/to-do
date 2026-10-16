# Chapter 10 — Collection Runner, Data-Driven Testing & Performance Testing

> 🧒 The **Collection Runner** is a **robot** that presses "Send" on every request in your bag, one after another, as many times as you want, and writes a report card at the end. Give it a **list of names** (data file), and it repeats the whole thing once for each name.

---

## 10.1 Opening the Runner
- Footer → **Runner**, or collection `...` → **Run collection**, or folder → **Run folder**.
- Drag a collection/folder into the Runner.

## 10.2 Run modes
| Mode | What |
|---|---|
| **Run manually** | Run now in the app (your machine, your network) |
| **Schedule runs** | Run in the **Postman cloud** on a schedule (like monitors; can't reach `localhost`/private networks unless allowed) |
| **Automate runs via CLI** | Shows the **Postman CLI** command to copy into CI |
| **Performance** | Load test with virtual users (10.8) |

## 10.3 Runner configuration (functional mode)
| Option | Meaning |
|---|---|
| **Request selection/order** | Tick/untick requests; drag to reorder for this run |
| **Iterations** | How many times to run the whole selection |
| **Delay** | ms between requests (avoid rate limits, give async processing time) |
| **Data** | Select CSV/JSON file → iteration data |
| **Persist responses for a session** / **Save responses** | Keep response bodies so you can inspect them after the run (uses memory; off for big runs) |
| **Advanced: Stop run if an error occurs** | Stop on script/network errors |
| **Advanced: Keep variable values** | Persist variable changes from the run into environment/collection after run (label varies by version) |
| **Advanced: Run collection without using stored cookies** | Start with clean cookie jar |
| **Advanced: Save cookies after collection run** | Keep cookies created during run |
| **Turn off logs during run** | Faster, less memory |
| **Environment** | Choose environment for the run |

## 10.4 Run results
- Summary: passed/failed/skipped tests, total duration, avg response time.
- Filter: All / Passed / Failed / Skipped / Errors.
- Click a request → request/response details (if saved), test results, console logs.
- **Export results** (JSON) and **Run history** under the collection's **Runs** tab (shared in team).
- **Run again** with same config.

---

## 10.5 Data-driven testing (DDT)

### CSV format
```csv
testCase,email,password,expectedStatus,expectedMessage
valid login,qa1@example.com,Valid@123,200,
wrong password,qa1@example.com,wrong,401,Invalid credentials
empty email,,Valid@123,400,email is required
sql injection,' OR 1=1 --,x,400,
```
- **First row = header** (variable names).
- One iteration per row. Iterations auto-set to row count.
- **Types are not reliable.** In Newman 6 (verified while writing this book), number-looking values are auto-converted to numbers and lose leading zeros (`007` → `7`, `1e3` → `1000`); `true`/`false` remain the *strings* `"true"`/`"false"`. Always normalise: `Number(pm.iterationData.get("expectedStatus"))`, `pm.iterationData.get("active") === "true"`, `String(pm.iterationData.get("zip")).padStart(6, "0")`. If exact types matter, use a **JSON** data file.
- Commas in values → wrap in double quotes: `"Smith, John"`. Quotes inside quotes → double them: `"He said ""hi"""`.
- Save as **UTF-8** (Excel may add a **BOM** — the first header becomes `﻿testCase`, so `{{testCase}}` doesn't resolve! Save as "CSV UTF-8" carefully or strip BOM).
- Avoid trailing empty lines (some versions create an empty iteration).

### JSON format
```json
[
  { "testCase": "valid", "user": { "email": "qa1@example.com", "password": "Valid@123" }, "expectedStatus": 200, "roles": ["user"] },
  { "testCase": "locked", "user": { "email": "locked@example.com", "password": "Valid@123" }, "expectedStatus": 423, "roles": [] }
]
```
- Must be an **array of objects**.
- Types preserved (numbers, booleans, arrays, nested objects).
- `pm.iterationData.get("user")` returns the nested object (in `{{ }}` you can't do `{{user.email}}` reliably — flatten or set a local variable in pre-request).

### Using data in the request
- `{{email}}`, `{{password}}` directly in body/URL.
- In scripts: `pm.iterationData.get("expectedStatus")`.

```javascript
// Pre-request: map nested JSON data into simple variables
const user = pm.iterationData.get("user");
if (user) { pm.variables.set("email", user.email); pm.variables.set("password", user.password); }
```
```javascript
// Post-response: generic data-driven assertions
const tc = pm.iterationData.get("testCase");
const expected = Number(pm.iterationData.get("expectedStatus"));
pm.test(`[${tc}] status ${expected}`, () => pm.response.to.have.status(expected));

const msg = pm.iterationData.get("expectedMessage");
if (msg) pm.test(`[${tc}] message`, () => pm.expect(pm.response.json().message).to.include(msg));
```

### Iterations vs rows
- Iterations = rows by default. If you set **more** iterations than rows, the extra iterations reuse the **last row**'s values; fewer → only first N rows.
- Data variables have **higher precedence** than environment/collection/global (only local beats them). A CSV column named `baseUrl` would **override** your environment's `baseUrl` — a sneaky bug!

### Running only some rows
No built-in row filter; options: separate files, or `if (pm.iterationData.get("run") === "N") pm.execution.skipRequest();`.

### DDT best practices
- Include a `testCase` column → readable reports.
- Keep data files **in Git** next to exported collections.
- Separate files per purpose: `login-negative.csv`, `create-order-boundaries.json`.
- Don't put real customer data / PII in data files.
- For large combinatorial data, generate files with a script (Python/Node) rather than by hand.

---

## 10.6 Running a folder with different data than the rest
The Runner applies one data file to the whole run. Options:
- Run that folder separately with its own file (in CI: `newman run ... --folder "Login negative" -d login-negative.csv`).
- Or embed data inline in a variable (JSON string) and loop (Chapter 9, Pattern 8).

---

## 10.7 Common Runner problems
| Problem | Cause | Fix |
|---|---|---|
| Variables not updated after run | "Keep variable values" off; or values only set locally | Enable option; check scope |
| Runner slow / app freezes | Saving responses for thousands of requests; huge console logs | Disable "Save responses", turn off logs, or use Newman/CLI |
| Request not running | Unticked in run order; `skipRequest`; `setNextRequest` jumped over it | Check selection & scripts |
| Runs forever | Infinite `setNextRequest` loop | Add counters; stop run |
| Data variable not resolving | CSV BOM, header typo, wrong delimiter (`;` in some locales) | Open in text editor; save UTF-8 comma-separated |
| 429 errors in runs | No delay | Set Delay; add retry logic |
| Different results than single sends | State left from previous iterations; cookies | Use "without stored cookies"; reset variables in setup |

---

## 10.8 Performance testing in Postman

> 🧒 Instead of 1 kid knocking on the shop door, imagine **100 kids knocking at once**. Does the shopkeeper still answer quickly? That's load testing.

Runner → **Performance** tab (exact capabilities/limits depend on your plan and version):
| Setting | Meaning |
|---|---|
| **Virtual users (VUs)** | Number of concurrent simulated users, each running the selected requests in a loop |
| **Test duration** | Minutes to run |
| **Load profile** | **Fixed** (constant VUs), **Ramp up** (gradual increase), **Spike** (sudden burst then down), **Peak** (ramp to a peak, hold, ramp down) |
| **Data file** | Give each VU different data (e.g. different user accounts) — assign rows sequentially or randomly depending on options |
| **Pass/fail criteria** | Thresholds e.g. avg response time < 500ms, error rate < 1% (newer versions) |
| **Environment** | Variables used |

Metrics shown:
- **Average response time** and percentiles (**p90/p95/p99**) per request,
- **Throughput** (requests/second),
- **Error rate** (% failed requests, by error type),
- Graphs over time vs VUs.

### Understanding the numbers (interview!)
- **Average** hides outliers; **p95 = 95% of requests were faster than this**. SLAs are usually on p95/p99.
- If response time **rises with VUs while throughput flattens** → system saturation (CPU/DB/thread pool limits).
- Errors appearing at high load: 429 (rate limit), 503 (overload), 504 (timeouts), connection resets.

### Limitations & when to use other tools
- Postman's load is generated **from your machine** (local runs) → limited by your CPU/network; good for **baseline/smoke performance** and finding obvious regressions early.
- For large-scale load (thousands of VUs, distributed, complex scenarios, soak tests) use **k6, JMeter, Gatling, Locust, Artillery**, or cloud load services. Postman collections can be converted (e.g. `postman-to-k6` community tool) as a starting point.

### Performance test checklist
1. Never load test **production** without approval/coordination.
2. Use realistic data and think time (Delay).
3. Warm up first.
4. Coordinate with backend/SRE to watch server metrics (CPU, memory, DB).
5. Test one change at a time; record baseline.
6. Use dedicated test accounts to avoid rate limits by user.

---

## 10.9 Scheduled collection runs (cloud)
- Runner → **Schedule runs**: frequency (hourly/daily/weekly/custom), environment, notifications (email) on failure.
- Runs in Postman cloud → **public internet only** (unless network allowlisting / private API access features on Enterprise).
- Results appear in collection **Runs** tab.
- Similar to **Monitors** (Chapter 12), which add regions, alerting integrations, and uptime graphs.

---

## 10.10 Chapter 10 Quick Revision
- Runner: iterations, delay, data file, environment, save responses, keep variable values, cookies options.
- CSV: header row, unreliable types (number-like values become numbers, leading zeros lost; booleans stay strings), beware BOM/quotes/delimiters; JSON: array of objects, types preserved.
- Data variables override environment ones (precedence!).
- Extra iterations reuse last row.
- Performance tab: VUs, duration, load profiles (fixed, ramp up, spike, peak), p90/p95/p99, throughput, error rate.
- Heavy load → k6/JMeter/Gatling.

➡️ Next: **Chapter 11 — Newman, Postman CLI and CI/CD**.
