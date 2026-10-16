# Chapter 18A — Interview Questions & Answers: Fundamentals (APIs, HTTP, Postman Basics)

> These questions have been asked again and again in API testing, QA, SDET, backend developer and support-engineer interviews at service companies (TCS, Infosys, Wipro, Cognizant, Accenture, Capgemini, HCL, Tech Mahindra, LTIMindtree), product companies and startups, and in global firms. Answers are written so you can **say them out loud** — short first line, then depth.
>
> Levels: 🟢 Entry, 🟡 Intermediate, 🔴 Experienced

---

## Part 1 — API & HTTP concepts

**Q1. 🟢 What is an API?**
An API (Application Programming Interface) is a contract that lets one software system request data or actions from another without knowing its internals. Example: a weather app calls `GET /weather?city=Pune` and gets JSON back. It defines endpoints, methods, request/response formats, auth, and errors.

**Q2. 🟢 What is API testing and why is it important?**
Testing the application's business layer directly by sending requests and validating responses (status, body, headers, performance, security), without a UI. It's important because it's **faster and more stable than UI tests**, catches defects earlier (shift-left), covers integrations between services, and can be automated in CI.

**Q3. 🟢 What is the difference between API testing and UI testing?**
UI testing checks what users see and click (slower, brittle, needs the UI ready). API testing checks the logic and data layer (faster, more stable, can start before UI exists, tests edge cases the UI blocks). Test pyramid: many unit tests, a good number of API/integration tests, fewer UI tests.

**Q4. 🟢 What is REST?**
An architectural style (Roy Fielding, 2000) using HTTP where resources are identified by URIs and manipulated with standard methods. Constraints: client–server, stateless, cacheable, uniform interface (incl. HATEOAS), layered system, optional code-on-demand.

**Q5. 🟢 What is a RESTful API vs a REST API?**
Used interchangeably; "RESTful" usually means it follows REST constraints properly (nouns for resources, correct methods/status codes, stateless).

**Q6. 🟡 REST vs SOAP?**
REST: style, any format (mostly JSON), lightweight, uses HTTP semantics, cacheable. SOAP: protocol, XML envelope only, strict WSDL contract, built-in standards (WS-Security, WS-ReliableMessaging), errors via SOAP Fault, usually POST only. SOAP is common in banking/legacy enterprise; REST for web/mobile.

**Q7. 🟡 REST vs GraphQL?**
REST has many endpoints with fixed responses (over/under-fetching). GraphQL has one endpoint where the client specifies exactly the fields; strongly typed schema; errors usually returned with HTTP 200 in an `errors` array; caching is harder. In Postman, use the GraphQL request type or GraphQL body mode.

**Q8. 🟡 What is gRPC and when would you use it?**
A high-performance RPC framework using Protocol Buffers over HTTP/2, supporting unary and streaming calls. Used for internal microservice communication needing low latency and strong contracts. Postman supports it with server reflection or `.proto` import.

**Q9. 🟢 Explain the HTTP request structure.**
Request line (method, path, HTTP version), headers (metadata like `Content-Type`, `Authorization`), an empty line, and optional body. Example: `POST /v1/orders HTTP/1.1`, `Host: api.shop.com`, `Content-Type: application/json`, body `{...}`.

**Q10. 🟢 Explain the HTTP response structure.**
Status line (version, status code, reason), headers (`Content-Type`, `Set-Cookie`, `Cache-Control`…), empty line, body.

**Q11. 🟢 List HTTP methods and their uses.**
GET read, POST create/process, PUT replace, PATCH partial update, DELETE remove, HEAD headers only, OPTIONS capabilities/CORS preflight, TRACE echo (debug), CONNECT tunnel.

**Q12. 🟢 Difference between GET and POST?**
GET retrieves data, parameters in the URL, safe & idempotent, cacheable, bookmarkable, length-limited by URL limits. POST sends data in the body to create/process, not idempotent, not cached by default, suitable for large/sensitive data (though HTTPS is what actually protects it).

**Q13. 🟡 Difference between PUT and PATCH?**
PUT replaces the entire resource (missing fields may be reset) and is idempotent. PATCH applies partial changes and isn't guaranteed idempotent. Example: PUT `/users/5` with only `name` may wipe `email`; PATCH changes only `name`.

**Q14. 🟡 Difference between PUT and POST?**
POST to a collection URL creates a new resource where the server chooses the ID (not idempotent). PUT to a specific URL creates or replaces the resource at that URL (idempotent).

**Q15. 🟡 What is idempotency? Which methods are idempotent?**
Same request repeated N times leaves the server in the same state as once. GET, HEAD, OPTIONS, TRACE, PUT, DELETE are idempotent; POST is not; PATCH is not guaranteed. Note: response codes may differ (DELETE → 204 then 404) — idempotency is about state.

**Q16. 🟡 What are safe methods?**
Methods that don't modify server state: GET, HEAD, OPTIONS, TRACE. All safe methods are idempotent, not vice versa.

**Q17. 🟡 How do you make POST idempotent?**
Use an `Idempotency-Key` header (unique per logical operation, e.g. UUID); the server stores the result and returns the same response on retries. Common in payments (Stripe-style). In Postman: `Idempotency-Key: {{$guid}}` generated once and reused for retries.

**Q18. 🟢 What are HTTP status code classes?**
1xx informational, 2xx success, 3xx redirection, 4xx client error, 5xx server error.

**Q19. 🟢 Explain 200, 201, 204.**
200 OK (success with body), 201 Created (resource created, usually with `Location` header), 204 No Content (success, no body — common for DELETE/PUT).

**Q20. 🟢 Difference between 401 and 403?**
401 Unauthorized = not authenticated (missing/invalid/expired credentials). 403 Forbidden = authenticated but not permitted (insufficient role/scope).

**Q21. 🟡 Difference between 400 and 422?**
400 = malformed/invalid request syntax (bad JSON, wrong types). 422 = well-formed but semantically invalid (business validation). Many APIs use 400 for both; follow the contract.

**Q22. 🟡 What is 409?**
Conflict with current state — duplicate resource (email already registered) or version conflicts (optimistic locking).

**Q23. 🟡 What is 429 and how to handle it in testing?**
Too Many Requests — rate limit exceeded. Respect `Retry-After`; add delays in Runner/Newman (`--delay-request`); retry with backoff; use separate test accounts; also *test* that rate limiting exists.

**Q24. 🟡 Difference between 500, 502, 503, 504?**
500 generic server error (bug). 502 gateway got invalid response from upstream. 503 service unavailable (overload/maintenance). 504 gateway timeout waiting for upstream.

**Q25. 🟡 What's the difference between 301, 302, 307, 308?**
301/308 permanent; 302/307 temporary. 307/308 must preserve method and body; 301/302 historically allow clients to change POST to GET.

**Q26. 🟢 What is 304?**
Not Modified — conditional request (`If-None-Match` with ETag or `If-Modified-Since`) found the cached copy still valid; no body sent.

**Q27. 🟢 What are headers? Give examples.**
Key-value metadata. Request: `Content-Type`, `Accept`, `Authorization`, `User-Agent`, `Cookie`, `Cache-Control`. Response: `Content-Type`, `Set-Cookie`, `Location`, `ETag`, `Retry-After`, `WWW-Authenticate`.

**Q28. 🟢 Difference between `Content-Type` and `Accept`?**
`Content-Type` describes the format of the body being sent; `Accept` tells the server which formats the client wants back.

**Q29. 🟢 Path parameter vs query parameter?**
Path identifies a specific resource (`/users/42`); query filters/sorts/paginates (`/users?role=admin&page=2`). Path params are typically required; query params optional.

**Q30. 🟡 What is URL encoding?**
Percent-encoding special characters (`space → %20`, `& → %26`) so they're transmitted safely in URLs. In Postman, right-click → EncodeURIComponent, or `encodeURIComponent()` in scripts.

**Q31. 🟢 What is JSON? Data types?**
Lightweight text data format; types: string, number, boolean, null, object, array. Keys must be double-quoted strings; no trailing commas or comments.

**Q32. 🟡 JSON vs XML?**
JSON: lighter, maps to JS objects, no attributes, faster to parse, dominant in REST. XML: verbose, supports attributes, namespaces, schemas (XSD), used in SOAP/legacy.

**Q33. 🟡 What is a stateless API?**
Server doesn't store client session state between requests; every request carries all info needed (e.g., token). Enables scaling horizontally.

**Q34. 🟡 What is CORS? Does it affect Postman?**
Browser security mechanism restricting cross-origin requests unless the server allows them via `Access-Control-Allow-*` headers (with preflight `OPTIONS` for non-simple requests). It's enforced by browsers, so the Postman desktop app isn't blocked by CORS — which is why "works in Postman but not in the browser" usually means missing CORS headers.

**Q35. 🟡 What are cookies and sessions?**
Cookie: small data stored by client via `Set-Cookie`, sent back in `Cookie` header. Session: server-side state referenced by a session ID cookie. Attributes: `HttpOnly`, `Secure`, `SameSite`, `Domain`, `Path`, `Expires/Max-Age`.

**Q36. 🟡 Authentication vs authorization?**
Authentication = verifying identity (who). Authorization = verifying permissions (what). Failures: 401 vs 403.

**Q37. 🟡 What is an API key? Is it secure?**
A secret identifier for an application, sent in a header or query. Reasonably secure over HTTPS for app identification but doesn't identify a user, is often long-lived, and leaks easily (logs, URLs). Prefer headers, rotation, scoping.

**Q38. 🟡 What is a JWT?**
JSON Web Token: `header.payload.signature`, Base64URL-encoded, signed (HS256/RS256…). Contains claims (`sub`, `exp`, `iat`, `iss`, `aud`, roles). Encoded, not encrypted — don't put secrets in it. Server verifies signature and claims.

**Q39. 🔴 What is OAuth 2.0? Explain grant types.**
An authorization framework letting clients obtain limited access tokens from an authorization server on behalf of a user or itself. Grants: Authorization Code (+PKCE, recommended for user flows), Client Credentials (machine-to-machine), Refresh Token, Device Code; deprecated: Implicit and Resource Owner Password. Tokens: access (short-lived), refresh (long-lived), ID token (OIDC identity).

**Q40. 🔴 OAuth 2.0 vs OpenID Connect?**
OAuth 2.0 is for authorization (access to APIs). OIDC is an identity layer on top of OAuth 2.0 adding the ID token (JWT about the user), `userinfo` endpoint, and standard scopes (`openid profile email`).

**Q41. 🔴 What is PKCE?**
Proof Key for Code Exchange: client generates a random `code_verifier`, sends its hash (`code_challenge`, S256) in the authorize request, and the verifier in the token request — prevents stolen authorization codes from being exchanged. Postman supports "Authorization Code (With PKCE)".

**Q42. 🟡 What is Basic Auth? Is Base64 encryption?**
`Authorization: Basic base64(username:password)`. Base64 is encoding, not encryption; anyone can decode it — only use over HTTPS.

**Q43. 🟡 What is rate limiting and throttling?**
Limiting requests per client over time to protect services (e.g., 100 req/min). Exceeding returns 429; headers like `X-RateLimit-Remaining` and `Retry-After` guide clients.

**Q44. 🟡 What is API versioning? Methods?**
Managing changes without breaking clients: URI (`/v1/`), query (`?version=1`), header (`Accept: application/vnd.x.v1+json`, custom header). URI is most common.

**Q45. 🟡 What is pagination? Types?**
Splitting large result sets: offset/limit, page/size, cursor-based, keyset, Link headers. Test: page boundaries, last page, empty page, invalid page, max limit enforcement, duplicates/missing items between pages.

**Q46. 🟡 What is HATEOAS?**
Hypermedia As The Engine Of Application State: responses include links to related actions/resources (`"_links": {"self":..., "cancel":...}`), so clients navigate dynamically.

**Q47. 🟡 What is an endpoint vs resource vs URI?**
Resource = the thing (orders). URI = identifier (`/orders/42`). Endpoint = URI + method combination exposed by the API (`GET /orders/42`).

**Q48. 🟡 What is a webhook?**
A server-to-server callback: the provider sends an HTTP POST to your URL when an event happens (payment succeeded). Test with mock receivers (webhook.site, Postman mock/Flows) and verify signatures (HMAC headers).

**Q49. 🟢 What is the difference between HTTP and HTTPS?**
HTTPS is HTTP over TLS: encrypted, integrity-protected, server authenticated by certificate; default port 443 vs 80.

**Q50. 🔴 What happens when you hit an API URL? (End-to-end)**
URL parse → DNS → TCP handshake → TLS handshake (cert validation, key exchange) → HTTP request → load balancer/gateway → service → DB → response → client parses. Postman's response-time breakdown shows DNS, TCP, SSL, TTFB, download.

**Q51. 🟡 Types of API testing?**
Functional, smoke, sanity, regression, integration, E2E, negative, boundary, data-driven, contract/schema, performance/load/stress/spike/soak, security, reliability, usability (DX), documentation testing, monitoring.

**Q52. 🟡 What do you validate in an API response?**
Status code, response time, headers (content-type, caching, security), body structure/schema, data types, values/business rules, error messages/format, pagination/sorting/filtering, side effects (DB/other APIs), no sensitive data exposure.

**Q53. 🟡 What are common API bugs you've found?**
Wrong status codes (200 for errors, 500 for validation), missing validation (negative quantities), BOLA/IDOR, sensitive data exposure, inconsistent field names/types, pagination duplicates, timezone issues, missing CORS, poor error messages, performance degradation with large inputs, broken idempotency (duplicate orders on retry), race conditions.

**Q54. 🔴 What is contract testing?**
Verifying that provider and consumer agree on the API contract (schema, fields, types, status codes). Provider-side: validate responses against OpenAPI/JSON Schema (Postman schema tests, Spec Hub). Consumer-driven: Pact (consumers publish expectations, provider verifies).

**Q55. 🟡 What is OpenAPI/Swagger?**
A standard, language-agnostic spec (YAML/JSON) describing REST APIs: paths, operations, parameters, request bodies, responses, schemas, security. Swagger 2.0 was renamed OpenAPI 3.x (3.0, 3.1). Postman imports it to generate collections and supports design in Spec Hub.

---

## Part 2 — Postman basics

**Q56. 🟢 What is Postman?**
An API platform for designing, building, testing, documenting, mocking and monitoring APIs, with collaboration features. Used to send requests (HTTP, GraphQL, gRPC, WebSocket, etc.), write JavaScript tests, run collections (Runner, Newman, Postman CLI), and share via workspaces.

**Q57. 🟢 Why Postman over other tools?**
Easy UI, supports many protocols and auth types, scripting with JS + Chai, variables/environments, collection runner and CLI for CI, mocks, monitors, docs, collaboration, large community/API Network, AI assistance.

**Q58. 🟢 What is a collection?**
A group of saved requests organised in folders, with shared auth, scripts, variables, documentation and examples. It's the unit for running, sharing, mocking, monitoring and documenting.

**Q59. 🟢 What is a workspace? Types?**
A collaborative container for collections, environments, specs, mocks, monitors, flows. Types: Personal, Private, Team, Partner, Public.

**Q60. 🟢 What is an environment in Postman?**
A named set of variables (e.g., DEV/QA/PROD `baseUrl`, credentials) that you switch to run the same requests against different servers. Only one environment is active at a time.

**Q61. 🟢 What are variables in Postman? Why use them?**
Reusable placeholders `{{name}}` for values like base URLs, tokens, IDs — avoid duplication, enable environment switching, chaining, data-driven testing and secret separation.

**Q62. 🟡 What are the variable scopes and their precedence?**
Global, Collection, Environment, Data, Local. Narrowest wins: Local > Data > Environment > Collection > Global. (Vault secrets referenced separately with `{{vault:name}}`.)

**Q63. 🟡 Initial value vs current value? (Shared vs local value)**
Initial (now "shared") value syncs to the Postman cloud and is visible to teammates/exports; current (now "local") value stays on your machine and is what requests use. Put secrets only in local values (or Vault). Newer Postman uses a single local value with an option to share it.

**Q64. 🟢 How do you create and use environment variables?**
Environments → `+` → add key/value → select the environment → use `{{key}}` in requests, or `pm.environment.get("key")` in scripts.

**Q65. 🟢 What are global variables? When to use?**
Workspace-wide variables visible to every collection/environment. Use sparingly (quick experiments); prefer collection/environment variables to avoid collisions.

**Q66. 🟡 Collection variables vs environment variables?**
Collection variables belong to one collection and travel with its export; same in all environments — good for constants. Environment variables vary per environment and are separate files — good for base URLs and credentials.

**Q67. 🟢 What are dynamic variables?**
Built-in random/generated values like `{{$guid}}`, `{{$timestamp}}`, `{{$isoTimestamp}}`, `{{$randomInt}}`, `{{$randomEmail}}`, `{{$randomFirstName}}` (faker-based), new value per use. Use `pm.variables.replaceIn("{{$randomEmail}}")` to generate once in a script and store it.

**Q68. 🟢 How do you send a POST request with JSON in Postman?**
Choose POST, enter URL, Body → raw → JSON, enter JSON, Send. Postman sets `Content-Type: application/json`.

**Q69. 🟢 What body types does Postman support?**
none, form-data (multipart, files), x-www-form-urlencoded, raw (Text, JSON, XML, HTML, JavaScript), binary, GraphQL.

**Q70. 🟡 form-data vs x-www-form-urlencoded?**
form-data (`multipart/form-data`) supports files and parts with their own content types, using boundaries; urlencoded sends `key=value&key2=value2` text only (classic forms, OAuth token endpoints).

**Q71. 🟡 How do you upload a file in Postman?**
Body → form-data → key with type File → select file (or binary body for raw file APIs). Don't set Content-Type manually (boundary). For Newman, keep files in the repo and use `--working-dir`.

**Q72. 🟢 What is the Postman Console?**
A debugging window (Ctrl/Cmd+Alt/Option+C) showing every request/response with actual headers and bodies (after variable resolution), network info, `console.log` output and script errors.

**Q73. 🟢 How to generate code from a Postman request?**
Click the `</>` Code icon → choose language (cURL, Python requests, JS fetch/axios, Java OkHttp, C#, Go, PHP…) → copy.

**Q74. 🟢 How to import a cURL command?**
Import → Raw text (or paste directly into the URL bar) → Postman converts it into a request.

**Q75. 🟢 What can you import into Postman?**
Postman collections/environments (v1/v2.0/v2.1, v3 YAML in v12), cURL, OpenAPI 2.0/3.0/3.1, RAML, WSDL, GraphQL schema, HAR, Insomnia exports, from repos/gateways via integrations.

**Q76. 🟡 Collection v2.0 vs v2.1?**
Both JSON schemas; v2.1 changes representation of auth (arrays of key-value objects) and some URL details. v2.1 is the recommended export format.

**Q77. 🟢 What is History in Postman?**
A log of sent requests, accessible in the sidebar, to reopen/save past requests.

**Q78. 🟡 What are examples in Postman?**
Saved request/response pairs attached to a request; used by mock servers and documentation; show different scenarios (200, 400, 404).

**Q79. 🟢 How do you save a response?**
Response pane → Save Response → Save as example (or save to file).

**Q80. 🟡 What are hidden/auto-generated headers?**
Headers Postman adds automatically: `Postman-Token`, `Host`, `User-Agent: PostmanRuntime/x`, `Accept`, `Accept-Encoding`, `Connection`, `Content-Type`/`Content-Length` from body. Viewable/disable-able under Headers → hidden.

**Q81. 🟡 What is the Postman-Token header?**
A random UUID added per request (historically to prevent caching/aid debugging). Can be disabled in Settings if a strict server rejects unknown headers.

**Q82. 🟡 How do you handle cookies in Postman?**
Postman stores cookies in a cookie jar automatically and sends them to matching domains. Manage via "Cookies" link (add/edit/delete). Scripts use `pm.cookies` and `pm.cookies.jar()` (domains must be allowlisted). Disable per request in Settings.

**Q83. 🟡 What is the Postman Interceptor?**
A Chrome extension that captures browser requests into Postman and syncs browser cookies to Postman.

**Q84. 🟡 What is the Postman proxy?**
Built-in proxy (default port 5555) to capture requests from devices/apps (mobile) by configuring them to use your machine as HTTP proxy (install Postman CA for HTTPS).

**Q85. 🟡 Postman desktop vs web app?**
Desktop: native app, not subject to browser CORS, can reach localhost/internal networks directly. Web: runs in browser; needs an agent (Desktop Agent for localhost/private, Cloud Agent for public APIs, Browser Agent limited by CORS).

**Q86. 🟡 What is the Lightweight API Client?**
Postman's signed-out mode for sending requests without an account/cloud sync (replaced Scratch Pad); limited features (no collection runs, mocks, monitors, collaboration).

**Q87. 🟢 What are keyboard shortcuts you use?**
Ctrl/Cmd+Enter send, Ctrl/Cmd+S save, Ctrl/Cmd+T new tab, Ctrl/Cmd+W close, Ctrl/Cmd+Alt/Option+C Console, Ctrl/Cmd+K search, Ctrl/Cmd+\ sidebar, Ctrl/Cmd+O import.

**Q88. 🟡 How to disable SSL verification and when?**
Settings → General → SSL certificate verification OFF (globally) or per-request Settings tab. Only for local/dev self-signed certificates; better to add the CA certificate in Settings → Certificates.

**Q89. 🟡 How to add a client certificate?**
Settings → Certificates → Add client certificate: host, port, CRT+KEY or PFX, passphrase.

**Q90. 🟡 How to set a request timeout?**
Settings → General → Request timeout (ms; 0 = infinite). Newman: `--timeout-request`.

**Q91. 🟢 How do you share a collection?**
Move it to a team workspace, Share/invite by email/link with role, fork, export JSON, publish docs/Run in Postman button, Postman API, Native Git.

**Q92. 🟡 What is a fork? Pull request?**
Fork = linked copy of a collection/environment for independent changes; pull request = propose merging fork changes into the parent with diff review, comments, approval and merge.

**Q93. 🟡 What is the Trash in Postman?**
Recently deleted collections can be restored for a plan-dependent retention period.

**Q94. 🟡 What changed in recent Postman versions?**
v11: Postbot AI, Postman Vault, Package Library (`pm.require`), Scripts tab with Pre-request/Post-response (Tests renamed), Spec Hub, Insights; variable values model (initial/current → shared/local). v12 (2026): Native Git with YAML Collection v3 files, local-first workflows, `postman workspace push`, Agent Mode, API Catalog. Plans changed in March 2026 to Free (single user), Solo, Team, Enterprise.

**Q95. 🟢 What is Postbot / Agent Mode?**
Postman's AI assistants: Postbot generates tests, docs, visualizations, fixes scripts; Agent Mode performs multi-step tasks across collections, tests, environments, monitors and specs, with reusable "Skills" invoked via `/`.

➡️ Continue: **18B — Variables, Scripting, Testing, Automation & Advanced Features**.
