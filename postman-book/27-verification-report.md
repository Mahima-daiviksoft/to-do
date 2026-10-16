# Chapter 27 — Verification Report: What Was Tested, and What Changed Because of It

> This chapter documents how the book's code was checked, so you know what is **verified by execution** and what is **documented but not executed**.

---

## 27.1 Environment
| Item | Version |
|---|---|
| Node.js | 22.22 |
| Newman | 6.2.3 (+ newman-reporter-htmlextra 1.23.1) |
| Pact JS | @pact-foundation/pact 17.1.4 (pact-core 20.2) |
| Spectral CLI | 6.17.0 |
| JSONata (to check FQL syntax) | 2.x |
| Date | October 2026 |

Public practice APIs (JSONPlaceholder, httpbin, Restful-Booker) were **not reachable** from the build environment. So a **local stand-in API** (`verification/server.js`) reproduces the endpoints the book uses: users/posts, httpbin-style echo, status codes, cookies, HTML/XML, OAuth client-credentials token, pagination, async job polling, a flaky 503 endpoint, and Restful-Booker-style booking CRUD with cookie auth.

---

## 27.2 What was executed
| Area | Result |
|---|---|
| **Newman suite** (`verification/build.js`): 57 requests, 100 test scripts, 71 pre-request scripts | **180 / 180 assertions passed**. 1 intentional request error (G9, unresolved `{{baseUrl}}` in `pm.sendRequest`) |
| Response assertions (`status`, `ok`, `success`, `accepted`, `notFound`, `rateLimited`, `header`, `jsonBody`, `jsonSchema`, `json`, `withBody`) | ✅ |
| Chai toolkit (`eql`, `deep.include`, `nested.property`, `all.keys`, `members`, `oneOf`, `closeTo`, `lengthOf.at.most`, `satisfy`, …) | ✅ |
| Sandbox libraries (lodash, moment, uuid, ajv, cheerio, xml2js, csv-parse, crypto-js, btoa/atob, tv4, buffer, url) | ✅ |
| Variable scopes & precedence, `replaceIn`, ~50 dynamic variables, data-file precedence | ✅ |
| Request modification (headers add/upsert/remove, query ops, body rewrite, method/URL change) | ✅ (after fixes below) |
| HMAC signing, JWT decoding | ✅ |
| OAuth client-credentials token caching in a pre-request script with `pm.sendRequest` | ✅ (fetched once, reused on next request) |
| Workflows: loop via `setNextRequest(requestId)`, pagination, polling, retry with backoff, `skipRequest`, `setNextRequest(null)` | ✅ |
| Cookies (`pm.cookies`, jar, Set-Cookie flags) | ✅ (after fixes below) |
| Legacy syntax (`tests[]`, `responseBody`, `postman.setEnvironmentVariable`) | ✅ works with deprecation warnings |
| htmlextra & JUnit reporters | ✅ |
| **Custom Newman reporter** (Ch 25) and Node API event fields | ✅ |
| **Pact** consumer test + provider verification (Ch 24) | ✅ |
| **Spectral** custom governance rules (Ch 23) | ✅ real lint output included in the chapter |
| **FQL** expressions (Ch 22), evaluated with JSONata | ✅ |
| Newman CLI flags in Ch 11 checked against `newman run --help` and the reporters' READMEs | ✅ (after fixes below) |

## 27.3 Documented but NOT executed (needs your environment)
- Postman **desktop app**-only behaviour: UI labels, Vault UI, Package Library, Agent Mode/Postbot, Performance tab, mocks/monitors (cloud), Spec Hub UI.
- **Postman CLI** commands (requires a Postman account/API key): `login`, `collection run <id>`, `api lint`, `spec lint`, `workspace prepare/push`.
- CI YAML files (GitHub Actions, Jenkins, GitLab, Azure DevOps). They're syntactically standard but weren't run in those systems.
- gRPC, WebSocket, Socket.IO, MQTT and SOAP via Postman's dedicated request types (the XML/SOAP *assertions* were verified).
- Behaviour against the real public practice APIs (endpoints and quirks are described from their documentation, e.g. Restful-Booker returning 201 on DELETE).

---

## 27.4 Corrections made to the book because of verification

| # | Original statement | What testing showed | Fixed in |
|---|---|---|---|
| 1 | "CSV values are strings" | Newman converts number-like values to numbers (`007` → `7`, `1e3` → `1000`); `true`/`false` stay strings | Ch 5, 8, 10, 18B, 19 |
| 2 | `await pm.sendRequest` presented as generally available | Works only in recent Postman app versions. Newman 6 gives a SyntaxError for top-level `await` and `sendRequest` returns no promise. Portable Promise wrapper added (verified) | Ch 6, 7, 8, 18B, 19 |
| 3 | `const _ = require("lodash")` in examples | Throws `Identifier '_' has already been declared` (`_` is a global) | Ch 7, 8 |
| 4 | `pm.response.cookies.one(...)` for cookie-flag tests | Empty in Newman 6. Replaced with `Set-Cookie` header parsing + `pm.cookies` (verified) | Ch 7, 8 |
| 5 | Pre-request `throw` as a guard; runner behaviour "may differ" | Newman **still sends the request** after a pre-request error. Recommend `skipRequest()` | Ch 5 |
| 6 | `pm.request.body.update()` shown without caveat | Throws when the request has no saved body. Assigning a body object works (verified) | Ch 7 |
| 7 | `headers.add` vs `upsert` not distinguished | `add` appends a duplicate header (`"1, 2"`) | Ch 7 |
| 8 | Retry pattern note | Collection-level generic tests still fail on retried attempts. Added a mitigation | Ch 9 |
| 9 | Error text "skipRequest isn't a function" | Exact text: `pm.execution.skipRequest is not a function` | Ch 7 |
| 10 | htmlextra `--reporter-htmlextra-darkTheme` | Not in the reporter's documented options. Removed; real options listed | Ch 11 |
| 11 | API key only via `?apikey=` URL | Newman 6 has `--postman-api-key` (safer). Added | Ch 11 |

---

## 27.5 Re-run it yourself
```bash
cd postman-book/verification
npm install
npm run server &          # local stand-in API on http://127.0.0.1:3555
npm test                  # Newman suite: expect 180/180 assertions, 1 intentional ENOTFOUND request error
npm run fql               # FQL expressions via JSONata
npm run pact              # Pact consumer + provider (set NO_PROXY=127.0.0.1,localhost behind a proxy)
npm run lint-spec         # Spectral governance rules: expect 1 error + 1 warning
```
To verify the **app-only** features, import `verify.postman_collection.json` (created by `npm run build`) into the Postman desktop app, select the generated environment, and run it with the Collection Runner. Compare results with Newman: differences are themselves useful knowledge (see 18D.4).
