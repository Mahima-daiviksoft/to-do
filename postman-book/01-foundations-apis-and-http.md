# Chapter 1 — Foundations: APIs, HTTP, and the Web (Before You Touch Postman)

> **Why this chapter exists:** Postman is a tool for talking to APIs. If you don't deeply understand *what* an API is and *how* HTTP works, Postman will feel like a box of random buttons. Every interviewer — from fresher level to architect level — starts with these basics. Master this chapter and half of every Postman interview is already won.

---

## 1.1 What is an API? (The 5-year-old version)

Imagine you are in a **restaurant**.

- **You** (the customer) want food.
- **The kitchen** makes the food.
- You are **not allowed** to walk into the kitchen.
- So there is a **waiter**. You tell the waiter what you want, the waiter tells the kitchen, the kitchen makes it, and the waiter brings it back.

In software:

| Restaurant | Software |
|---|---|
| You (customer) | The **client** (a mobile app, a website, Postman) |
| Kitchen | The **server** (where data and logic live) |
| Waiter | The **API** |
| The menu | The **API documentation** (what you are allowed to ask for) |
| Your order ("1 pizza, no onions") | The **request** |
| The food that comes back | The **response** |

**API = Application Programming Interface.** It is a set of rules that lets one program ask another program for something, without knowing how that other program works inside.

### The grown-up definition
An API is a **contract** between a provider and a consumer. It defines:
1. **What** you can ask for (endpoints / operations),
2. **How** to ask (method, URL, headers, body format),
3. **What** you will get back (response structure, status codes),
4. **Who** is allowed to ask (authentication / authorization),
5. **How much** you can ask (rate limits, quotas).

### Real examples
- When a weather app on your phone shows "28°C in Bengaluru", it called a weather API.
- When you click "Login with Google", the website calls Google's OAuth APIs.
- When you pay with UPI, multiple banking APIs talk to each other.

---

## 1.2 Types of APIs

### By who can use them
| Type | Meaning | Example |
|---|---|---|
| **Public / Open API** | Anyone can use (sometimes with a free key) | GitHub API, OpenWeatherMap |
| **Partner API** | Shared only with business partners | A payment gateway API given to merchants |
| **Internal / Private API** | Used only inside a company | Order-service calling inventory-service |
| **Composite API** | One call that combines many calls | "Get user + orders + cart" in one go |

### By architectural style / protocol
| Style | Data format | Transport | Key idea |
|---|---|---|---|
| **REST** | Usually JSON (also XML, etc.) | HTTP | Resources (nouns) + HTTP methods (verbs) |
| **SOAP** | XML only (an "envelope") | Usually HTTP, can be SMTP etc. | Strict contract (WSDL), WS-Security |
| **GraphQL** | JSON | HTTP (usually one POST endpoint) | Client asks for exactly the fields it needs |
| **gRPC** | Protocol Buffers (binary) | HTTP/2 | Fast, strongly typed, service methods defined in `.proto` files |
| **WebSocket** | Any (text/binary frames) | Starts as HTTP, upgrades to WS | Two-way, long-lived connection (chat, live prices) |
| **Server-Sent Events (SSE)** | Text events | HTTP | Server pushes a stream to client, one-way |
| **MQTT** | Binary, lightweight | TCP | Publish/subscribe, used in IoT |
| **Webhooks** | Usually JSON | HTTP | "Don't call us, we'll call you" — server calls *your* URL when something happens |

**Postman supports all of these** (HTTP/REST, SOAP, GraphQL, gRPC, WebSocket, Socket.IO, MQTT, SSE via HTTP, and newer AI/MCP request types). We cover each in Chapter 13.

---

## 1.3 Client–Server Model

```
 ┌──────────┐      Request  ───────────►      ┌──────────┐
 │  CLIENT  │                                  │  SERVER  │
 │ (Postman)│      ◄───────────  Response      │  (API)   │
 └──────────┘                                  └──────────┘
```

- The **client always starts** the conversation in HTTP (request–response). The server never "calls" the client in plain HTTP (that's why webhooks, WebSockets, and SSE exist).
- HTTP is **stateless**: each request is independent. The server does **not** remember the previous request by itself. That's why we send tokens/cookies **every time** — to remind the server who we are.

> 🧒 **5-year-old version of stateless:** The server is like a goldfish. Every time you talk to it, it forgets you. So every time, you must show your ID card (token).

---

## 1.4 What happens when you hit "Send" (end to end)

This is a **favourite interview question**: *"What happens when you type a URL and press Enter / Send?"*

1. **URL parsing** — the client splits `https://api.shop.com:443/v1/orders?status=paid` into scheme, host, port, path, query.
2. **DNS lookup** — `api.shop.com` is converted to an IP address (e.g. `203.0.113.10`). Checks: local cache → OS cache → router → ISP resolver → root → TLD (`.com`) → authoritative name server.
3. **TCP connection** — 3-way handshake: `SYN` → `SYN-ACK` → `ACK`.
4. **TLS handshake** (only for HTTPS) — the client and server agree on encryption, the server shows its **certificate**, the client verifies it against trusted Certificate Authorities (CAs), and session keys are created.
5. **HTTP request sent** — method, path, headers, body.
6. **Server processing** — load balancer → API gateway → application → database → back.
7. **HTTP response** — status line, headers, body.
8. **Connection reuse or close** — `Connection: keep-alive` lets the same TCP connection be reused.

**Postman shows you these phases!** Hover over the response **time** in Postman's response pane and you see a breakdown: *Prepare, Socket Initialization, DNS Lookup, TCP Handshake, SSL Handshake, Waiting (TTFB), Download, Process*. This is hugely useful when debugging "why is my API slow?" (Chapter 16).

---

## 1.5 Anatomy of a URL

```
https://user:pass@api.shop.com:8443/v1/users/42/orders?status=paid&page=2#summary
└─┬─┘   └───┬───┘ └────┬─────┘ └┬─┘└────────┬────────┘└─────────┬─────────┘└──┬──┘
scheme  userinfo     host     port        path               query        fragment
```

| Part | Meaning | Notes |
|---|---|---|
| **Scheme** | `http` or `https` | Default ports: 80 for http, 443 for https |
| **Userinfo** | `user:pass@` | Deprecated/insecure; avoid. |
| **Host** | Domain or IP | `localhost`, `127.0.0.1`, `api.shop.com` |
| **Port** | Network door number | Omit if default |
| **Path** | Which resource | `/v1/users/42/orders` |
| **Path parameter** | A variable piece of the path | `42` is the user ID. In Postman written as `/users/:userId` |
| **Query parameters** | Key-value filters after `?`, joined by `&` | `status=paid&page=2` |
| **Fragment** | After `#` | **Never sent to the server.** Only used by browsers. |

### URL encoding (percent-encoding)
URLs can only safely contain certain characters. Others must be encoded:

| Character | Encoded |
|---|---|
| space | `%20` (or `+` in form/query encoding) |
| `&` | `%26` |
| `=` | `%3D` |
| `?` | `%3F` |
| `/` | `%2F` |
| `#` | `%23` |
| `@` | `%40` |

**Example bug:** You search for `name=Tom & Jerry`. Without encoding, the server sees `name=Tom ` and a weird second param ` Jerry`. Encoded: `name=Tom%20%26%20Jerry`. In Postman, select text in the URL, right-click → **EncodeURIComponent**; in scripts use `encodeURIComponent()`.

---

## 1.6 HTTP Methods (Verbs) — In Depth

> 🧒 **Toy box analogy:** Your toy box is the server. **GET** = look at a toy. **POST** = put a new toy in. **PUT** = replace a toy with a new one. **PATCH** = fix one part of a toy (change its colour only). **DELETE** = throw a toy away.

| Method | Purpose | Has body? | Safe? | Idempotent? | Cacheable? |
|---|---|---|---|---|---|
| **GET** | Read a resource | Should not (semantics undefined) | ✅ | ✅ | ✅ |
| **POST** | Create / trigger processing | ✅ | ❌ | ❌ | Only with explicit freshness info (rare) |
| **PUT** | Replace a resource completely (or create at a known URL) | ✅ | ❌ | ✅ | ❌ |
| **PATCH** | Partial update | ✅ | ❌ | ❌ (not guaranteed) | ❌ |
| **DELETE** | Remove a resource | Optional | ❌ | ✅ | ❌ |
| **HEAD** | Same as GET but **no body** in response (only headers) | ❌ | ✅ | ✅ | ✅ |
| **OPTIONS** | Ask what methods/features are allowed (used in CORS preflight) | Optional | ✅ | ✅ | ❌ |
| **TRACE** | Echo back the request (debugging; usually disabled for security) | ❌ | ✅ | ✅ | ❌ |
| **CONNECT** | Create a tunnel (used by proxies for HTTPS) | — | ❌ | ❌ | ❌ |

### Key definitions (interviewers LOVE these)

- **Safe** = the method does not change anything on the server (read-only by intent). GET, HEAD, OPTIONS, TRACE.
- **Idempotent** = doing it **once or 10 times** leaves the server in the **same state**.
  - `DELETE /users/5` → first call deletes, next calls find nothing; the **state** is the same (user 5 gone). The **status code can differ** (200/204 first, then 404) — idempotency is about server state, *not* identical responses.
  - `PUT /users/5 {name:"Asha"}` 10 times → still name = Asha.
  - `POST /users {name:"Asha"}` 10 times → 10 users created. **Not idempotent.**
  - `PATCH /counter {op:"increment"}` → not idempotent. `PATCH /users/5 {name:"Asha"}` happens to be idempotent, but PATCH *in general* is not guaranteed.
- **Cacheable** = the response may be stored and reused.

### PUT vs PATCH vs POST (classic interview question)

Existing user:
```json
{ "id": 5, "name": "Asha", "email": "asha@x.com", "city": "Pune" }
```

**PUT /users/5** with body `{ "name": "Asha K" }`
→ Strict REST meaning: **replace the whole resource**. `email` and `city` may become null/removed. (Many real APIs don't follow this strictly — always check docs.)

**PATCH /users/5** with body `{ "name": "Asha K" }`
→ Only `name` changes. Email and city remain.

**POST /users** with body `{ "name": "Ravi" }`
→ Creates a **new** user. Server decides the ID. Typically returns **201 Created** with a `Location: /users/6` header.

### Can GET have a body?
Technically HTTP doesn't forbid it, but RFC 9110 says a body in GET has **no defined semantics**, and many servers, proxies and caches drop or reject it. Postman **allows** you to send a GET with a body (some APIs like Elasticsearch use it), but it's not good practice for your own APIs.

---

## 1.7 HTTP Status Codes — Complete Guide

> 🧒 Status codes are like **traffic signals and faces**: 2xx = 😀 "All good", 3xx = 👉 "Go over there", 4xx = 🙅 "**You** made a mistake", 5xx = 🤒 "**I** (the server) am sick".

### 1xx — Informational
| Code | Name | Meaning |
|---|---|---|
| 100 | Continue | Server got the headers; client may send the body (used with `Expect: 100-continue`) |
| 101 | Switching Protocols | e.g. upgrading HTTP → WebSocket |
| 102 | Processing | (WebDAV) Still working on it |
| 103 | Early Hints | Preload hints before the final response |

### 2xx — Success
| Code | Name | When to use |
|---|---|---|
| **200** | OK | Generic success, body included |
| **201** | Created | New resource created (POST/PUT). Should include `Location` header |
| **202** | Accepted | Request accepted for **async** processing; not done yet |
| 203 | Non-Authoritative Information | Modified by a proxy |
| **204** | No Content | Success, **no body** (common for DELETE / PUT) |
| 205 | Reset Content | Tell client to reset the form |
| **206** | Partial Content | Range requests (video streaming, resumable downloads) |

### 3xx — Redirection
| Code | Name | Notes |
|---|---|---|
| 300 | Multiple Choices | |
| **301** | Moved Permanently | Browsers/clients may change POST to GET when following |
| **302** | Found | Temporary; historically clients change POST→GET |
| 303 | See Other | Explicitly "go GET this other URL" (after a POST) |
| **304** | Not Modified | Cached version is still valid (used with `If-None-Match`/`ETag`, `If-Modified-Since`) |
| **307** | Temporary Redirect | Like 302 but **method and body must be preserved** |
| **308** | Permanent Redirect | Like 301 but **method and body must be preserved** |

> **Postman setting:** "Automatically follow redirects" (Settings → General, and per-request in the request's **Settings** tab). Turn it **off** to see the real 3xx response and its `Location` header — very useful for testing login flows.

### 4xx — Client Errors (the most-tested group)
| Code | Name | Typical cause | How to fix (from Postman) |
|---|---|---|---|
| **400** | Bad Request | Malformed JSON, missing required field, validation failed | Check body syntax, `Content-Type`, required fields |
| **401** | Unauthorized | **Not authenticated**: missing/expired/invalid token | Add/refresh token, check Authorization tab |
| 402 | Payment Required | Reserved; some APIs use for billing | — |
| **403** | Forbidden | **Authenticated but not allowed** (no permission/role, IP blocked) | Check user role/scopes, API key permissions |
| **404** | Not Found | Wrong URL/path, resource doesn't exist, (sometimes used to hide 403) | Check base URL, path variables, environment selected |
| **405** | Method Not Allowed | Using POST on a GET-only endpoint | Check method dropdown; response should include `Allow` header |
| 406 | Not Acceptable | Server can't produce format in `Accept` header | Fix `Accept` header |
| 407 | Proxy Authentication Required | Corporate proxy needs credentials | Postman Settings → Proxy |
| **408** | Request Timeout | Client took too long to send request | Network, big uploads |
| **409** | Conflict | Duplicate (e.g. email already exists), version conflict | Use unique data (dynamic variables!) |
| 410 | Gone | Permanently removed | |
| 411 | Length Required | Missing `Content-Length` | |
| 412 | Precondition Failed | `If-Match` ETag didn't match (optimistic locking) | |
| **413** | Content Too Large (Payload Too Large) | Body/file too big | Reduce size, check server limits |
| 414 | URI Too Long | Too many query params | Move data to body (POST) |
| **415** | Unsupported Media Type | Wrong/missing `Content-Type` (e.g. sent text, server expects JSON) | In Postman raw body, choose **JSON** from dropdown |
| 416 | Range Not Satisfiable | Bad `Range` header | |
| 418 | I'm a teapot | Joke code (RFC 2324), sometimes used playfully | |
| **422** | Unprocessable Content (Entity) | Syntax OK but semantic validation failed | Fix field values |
| 423/424 | Locked / Failed Dependency | WebDAV | |
| 425 | Too Early | | |
| 426 | Upgrade Required | | |
| 428 | Precondition Required | Server requires `If-Match` | |
| **429** | Too Many Requests | Rate limit hit. Check `Retry-After` header | Add delay in Runner, back-off logic |
| 431 | Request Header Fields Too Large | Huge cookies/headers | Clear cookies in Postman's cookie manager |
| 451 | Unavailable For Legal Reasons | | |

### 5xx — Server Errors
| Code | Name | Meaning |
|---|---|---|
| **500** | Internal Server Error | Unhandled exception in server code (a bug!) |
| **501** | Not Implemented | Server doesn't support the functionality |
| **502** | Bad Gateway | Proxy/gateway got an invalid response from upstream |
| **503** | Service Unavailable | Server overloaded/maintenance; may include `Retry-After` |
| **504** | Gateway Timeout | Proxy/gateway didn't get a response from upstream in time |
| 505 | HTTP Version Not Supported | |
| 507 | Insufficient Storage | |
| 511 | Network Authentication Required | Captive portals (hotel Wi-Fi) |

### 401 vs 403 — the #1 asked difference
- **401** = "**Who are you?**" → you didn't prove identity (no token, wrong token, expired token). Response typically includes `WWW-Authenticate` header.
- **403** = "**I know who you are, but you can't do this.**" → you're logged in as a normal user trying to access admin endpoint.

### 400 vs 422
- **400** = request is broken (invalid JSON, wrong types, can't parse).
- **422** = request is well-formed, but business rules fail (e.g. `"age": -5`).
(Many APIs just use 400 for both. Always follow your API's contract.)

### 502 vs 503 vs 504
- **502** — gateway reached upstream but got garbage/crash.
- **503** — service is intentionally unavailable / overloaded.
- **504** — gateway waited and upstream never answered in time.

---

## 1.8 HTTP Headers — In Depth

Headers are **metadata**: "information about the information". Like the label on a parcel (sender, weight, fragile) versus the item inside (body).

### Request headers you must know
| Header | Example | Purpose |
|---|---|---|
| `Host` | `api.shop.com` | Which website on the server (mandatory in HTTP/1.1). Postman adds automatically |
| `Content-Type` | `application/json` | Format of **the body you are sending** |
| `Accept` | `application/json` | Format you **want back** |
| `Authorization` | `Bearer eyJhbGci...` | Credentials |
| `User-Agent` | `PostmanRuntime/7.x.x` | Who is calling. Postman sends `PostmanRuntime/...` by default |
| `Accept-Encoding` | `gzip, deflate, br` | Compression the client supports |
| `Content-Length` | `348` | Body size in bytes (Postman calculates automatically) |
| `Cookie` | `session=abc123` | Cookies sent to server |
| `Cache-Control` | `no-cache` | Caching directives |
| `If-None-Match` | `"etag-value"` | Conditional GET (304 if unchanged) |
| `If-Match` | `"etag-value"` | Optimistic locking on updates |
| `Origin` | `https://myapp.com` | Used in CORS |
| `Referer` | `https://myapp.com/page` | Page that made the request (yes, misspelled in the spec!) |
| `X-Request-ID` / `X-Correlation-ID` | `uuid` | Trace a request across microservices — great practice to set with `{{$guid}}` |
| `Idempotency-Key` | `uuid` | Makes POST safe to retry (Stripe-style payments) |
| `X-API-Key` | `abcd1234` | Custom API key header (common convention) |
| `Connection` | `keep-alive` | Reuse TCP connection |

### Response headers you must know
| Header | Purpose |
|---|---|
| `Content-Type` | Format of the response body (`application/json; charset=utf-8`) |
| `Content-Length` | Size of response body |
| `Set-Cookie` | Server asks client to store a cookie |
| `Location` | URL of created resource (201) or redirect target (3xx) |
| `Cache-Control`, `ETag`, `Expires`, `Last-Modified` | Caching |
| `WWW-Authenticate` | How to authenticate (with 401) |
| `Retry-After` | When to retry (429/503) |
| `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset` | Common (non-standard) rate limit info. Newer standard drafts use `RateLimit` / `RateLimit-Policy` |
| `Access-Control-Allow-Origin` etc. | CORS |
| `Strict-Transport-Security` | Force HTTPS (HSTS) |
| `Content-Security-Policy`, `X-Content-Type-Options: nosniff`, `X-Frame-Options` | Security headers |
| `Server`, `X-Powered-By` | Server info (security best practice: hide these) |

### Header facts interviewers check
- Header **names are case-insensitive** (`content-type` = `Content-Type`). In HTTP/2 they are sent lowercase. Postman's `pm.response.headers.get()` is case-insensitive.
- Header **values** may be case-sensitive (e.g. tokens).
- Custom headers historically started with `X-`; RFC 6648 (2012) deprecated that convention, but it's still widely used.
- Postman auto-adds some headers (**hidden headers**): `Postman-Token`, `Host`, `User-Agent`, `Accept`, `Accept-Encoding`, `Connection`, `Content-Length`, `Content-Type` (based on body). Click "hidden" in the Headers tab to see/disable them.

---

## 1.9 Content Types (MIME Types)

| Content-Type | Used for | Postman body option |
|---|---|---|
| `application/json` | JSON APIs (most common) | raw → JSON |
| `application/xml` / `text/xml` | XML, SOAP 1.1 uses `text/xml` | raw → XML |
| `application/soap+xml` | SOAP 1.2 | raw → XML + header |
| `application/x-www-form-urlencoded` | HTML form submits: `a=1&b=2` | x-www-form-urlencoded |
| `multipart/form-data; boundary=...` | File uploads + fields | form-data |
| `text/plain` | Plain text | raw → Text |
| `text/html` | Web pages | raw → HTML |
| `application/octet-stream` | Raw binary | binary |
| `application/graphql` / `application/json` | GraphQL (usually JSON envelope) | GraphQL |
| `application/javascript` | JS | raw → JavaScript |
| `image/png`, `application/pdf`, etc. | Files | binary |

> **Very common bug:** You send JSON but forgot to choose "JSON" in Postman's raw dropdown, so Postman sends `Content-Type: text/plain`. Server says **415 Unsupported Media Type** or treats body as empty → **400**. Fix: select **raw → JSON**.

---

## 1.10 JSON — In Depth

JSON (JavaScript Object Notation) is the language most APIs speak.

### Data types in JSON (exactly 6 kinds of values)
| Type | Example |
|---|---|
| String | `"hello"` (always **double** quotes) |
| Number | `42`, `3.14`, `-7`, `1e5` (no `NaN`, no `Infinity`, no leading zeros like `07`) |
| Boolean | `true`, `false` (lowercase) |
| Null | `null` |
| Object | `{ "key": "value" }` |
| Array | `[1, 2, 3]` |

### Example
```json
{
  "id": 101,
  "name": "Asha",
  "isActive": true,
  "manager": null,
  "skills": ["Postman", "SQL"],
  "address": {
    "city": "Pune",
    "pin": "411001"
  },
  "projects": [
    { "id": 1, "title": "Payments" },
    { "id": 2, "title": "Search" }
  ]
}
```

### JSON rules that cause real bugs
1. **No trailing commas**: `{"a":1,}` ❌
2. **Keys must be double-quoted strings**: `{name:"x"}` ❌, `{'name':'x'}` ❌
3. **No comments in standard JSON** (`//` or `/* */`). (Postman's editor may tolerate/strip them in some versions, but servers usually don't — don't rely on it.)
4. Numbers too big for JavaScript (`> 2^53 - 1 = 9007199254740991`) lose precision in Postman scripts when parsed with `pm.response.json()`. Example: `{"id": 12345678901234567890}` parses to `12345678901234567000`. Fix: ask API to send IDs as strings, or parse the raw text carefully (regex / a BigInt-aware approach).

### Navigating JSON in Postman scripts (preview of Chapter 7)
```javascript
const body = pm.response.json();
body.name;                 // "Asha"
body.skills[0];            // "Postman"
body.address.city;         // "Pune"
body.projects[1].title;    // "Search"
body.projects.length;      // 2
body["address"]["pin"];    // "411001" (bracket notation — needed for keys with spaces/dashes)
```

---

## 1.11 XML Basics (for SOAP and legacy APIs)

```xml
<?xml version="1.0" encoding="UTF-8"?>
<user id="101">
  <name>Asha</name>
  <skills>
    <skill>Postman</skill>
    <skill>SQL</skill>
  </skills>
</user>
```
- Elements (`<name>`), attributes (`id="101"`), must be properly closed and nested, case-sensitive.
- In Postman scripts, use `xml2Json(responseBody)` (legacy global, still available) or the `xml2js` module to convert XML to a JS object (Chapter 7).

---

## 1.12 REST — Principles In Depth

REST = **RE**presentational **S**tate **T**ransfer, defined by Roy Fielding (2000 dissertation). It is an **architectural style**, not a protocol or standard.

### The 6 constraints
1. **Client–Server** — separation of concerns.
2. **Stateless** — each request contains all info needed; no session stored on server between requests (tokens carry state).
3. **Cacheable** — responses must say whether they can be cached.
4. **Uniform Interface** — resources identified by URIs, manipulated via representations, self-descriptive messages, and **HATEOAS** (Hypermedia As The Engine Of Application State: responses include links to next actions).
5. **Layered System** — client can't tell if it's talking to the actual server or a proxy/load balancer/gateway.
6. **Code on Demand** (optional) — server can send executable code (e.g. JavaScript).

### REST resource naming best practices
| ✅ Good | ❌ Bad | Why |
|---|---|---|
| `GET /users` | `GET /getAllUsers` | Use nouns; method is the verb |
| `GET /users/42` | `GET /user?id=42` (acceptable but less RESTful) | Identity in path |
| `GET /users/42/orders` | `GET /ordersOfUser/42` | Hierarchy for relationships |
| `POST /users` | `POST /users/create` | Method implies create |
| `GET /users?status=active&sort=-createdAt&page=2&limit=20` | — | Filtering, sorting, pagination via query |
| `/v1/users` | — | Versioning |
| plural nouns, lowercase, hyphens: `/order-items` | `/Order_Items` | Consistency |

### API versioning strategies
- **URI path**: `/v1/users` (most common, easy to test in Postman with `{{baseUrl}}/v1`)
- **Query param**: `/users?version=1`
- **Header**: `Accept: application/vnd.shop.v1+json` or `X-API-Version: 1`

### Pagination styles (you'll test these a lot)
| Style | Example | Notes |
|---|---|---|
| Offset/limit | `?offset=40&limit=20` | Simple; slow on huge tables; duplicates when data shifts |
| Page/size | `?page=3&size=20` | Same as offset |
| Cursor | `?cursor=eyJpZCI6MTAwfQ&limit=20` | Stable; response gives `next_cursor` |
| Keyset | `?after_id=100&limit=20` | Fast |
| Link header | `Link: <...?page=3>; rel="next"` | GitHub style |

---

## 1.13 REST vs SOAP vs GraphQL vs gRPC (comparison table — interview favourite)

| Feature | REST | SOAP | GraphQL | gRPC |
|---|---|---|---|---|
| Type | Architectural style | Protocol | Query language + runtime | RPC framework |
| Format | JSON/XML/any | XML only | JSON | Protobuf (binary) |
| Transport | HTTP | HTTP, SMTP, etc. | HTTP | HTTP/2 |
| Contract | OpenAPI (optional) | WSDL (mandatory) | Schema (SDL) | `.proto` |
| Endpoints | Many (one per resource) | One per service, operation in body | Usually one (`/graphql`) | Service methods |
| Over/under-fetching | Common | Common | Solved (ask exact fields) | N/A (defined messages) |
| Caching | Easy (HTTP caching) | Hard | Harder (all POST) | Hard |
| Error handling | HTTP status codes | SOAP Fault | Usually 200 with `errors` array | gRPC status codes (0 OK, 5 NOT_FOUND, 16 UNAUTHENTICATED…) |
| Streaming | No (except SSE/chunked) | No | Subscriptions (via WS) | Yes: unary, server, client, bidirectional |
| Best for | Public web APIs | Banking/enterprise legacy, strict contracts | Flexible frontends, mobile | Internal microservices, low latency |

---

## 1.14 Authentication vs Authorization

> 🧒 **Authentication** = Showing your face at the school gate so the guard knows it's **you**. **Authorization** = The guard checking if you're allowed into the **staff room**.

- **Authentication (AuthN)**: *Who are you?* — passwords, tokens, certificates, OTP.
- **Authorization (AuthZ)**: *What are you allowed to do?* — roles, scopes, permissions.
- Failed AuthN → **401**. Failed AuthZ → **403**.

Common mechanisms (all covered in Chapter 6): API Key, Basic Auth, Bearer Token, JWT, OAuth 1.0, OAuth 2.0 (+ OpenID Connect), Digest, Hawk, AWS Signature v4, NTLM, Mutual TLS (client certificates), Akamai EdgeGrid, ASAP.

---

## 1.15 Cookies and Sessions

- A **cookie** is a small key-value text the server asks the client to store using `Set-Cookie`, and the client sends it back with `Cookie` header on future requests to that domain.
- **Session-based auth**: Login → server creates a session in memory/DB → sends `Set-Cookie: sessionId=abc` → client sends cookie on every request.
- **Token-based auth**: Login → server returns a token (often JWT) → client sends `Authorization: Bearer <token>`.

Cookie attributes:
| Attribute | Meaning |
|---|---|
| `Domain` | Which domains get the cookie |
| `Path` | Which paths get it |
| `Expires` / `Max-Age` | Lifetime; none = session cookie |
| `Secure` | Only over HTTPS |
| `HttpOnly` | JS in the browser cannot read it (protects from XSS) |
| `SameSite=Strict/Lax/None` | Controls cross-site sending (CSRF protection). `None` requires `Secure` |

**Postman automatically stores cookies** in its **cookie jar** (click **Cookies** under the Send button) and sends them on later requests to matching domains — just like a browser. This is why "logging in once" makes later requests work, and also why a stale cookie can cause confusing bugs (Chapter 16).

---

## 1.16 CORS (Cross-Origin Resource Sharing)

- **Origin** = scheme + host + port. `https://app.com` and `https://api.app.com` are **different origins**.
- Browsers block JavaScript on one origin from reading responses from another origin **unless** the server allows it with headers like `Access-Control-Allow-Origin`.
- For "non-simple" requests (e.g. `PUT`, custom headers, `Content-Type: application/json`), the browser first sends a **preflight** `OPTIONS` request.

**Crucial interview point:** *CORS is enforced by browsers, not servers and not Postman.* The **Postman desktop app is not a browser page**, so CORS doesn't block it. This is why "**It works in Postman but not in my frontend!**" is a classic situation — the API is missing CORS headers. (Postman **web** app sends requests via the **Postman Desktop Agent** or **Cloud Agent** to avoid browser CORS limits.) To test CORS from Postman, manually add an `Origin` header and send an `OPTIONS` request, then check the `Access-Control-Allow-*` response headers.

---

## 1.17 Caching basics

- `Cache-Control: no-store` — never store.
- `Cache-Control: no-cache` — store but **revalidate** before using.
- `Cache-Control: max-age=3600` — fresh for 1 hour.
- `ETag: "v5"` + client `If-None-Match: "v5"` → server replies **304 Not Modified** with empty body if unchanged.

Postman setting: **"Send no-cache header"** (Settings → General) adds `Cache-Control: no-cache` to requests to avoid getting cached responses during testing.

---

## 1.18 HTTP versions

| Version | Key features |
|---|---|
| HTTP/1.0 | One request per connection |
| HTTP/1.1 | Keep-alive, `Host` header mandatory, chunked transfer, pipelining (rarely used) |
| HTTP/2 | Binary framing, multiplexing many streams over one connection, header compression (HPACK), server push (now deprecated in browsers) |
| HTTP/3 | Runs over **QUIC** (UDP), faster connection setup, no TCP head-of-line blocking |

Postman's HTTP requests can use HTTP/1.x and HTTP/2 (there is a per-request **Settings → HTTP version** option in recent versions, with "Auto" defaulting based on server support). gRPC in Postman uses HTTP/2.

---

## 1.19 HTTPS, TLS and Certificates (so SSL errors never scare you)

- **HTTPS = HTTP + TLS encryption.**
- The server has a **certificate** signed by a **Certificate Authority (CA)**. The client trusts a list of root CAs.
- **Self-signed certificates** (common in dev/QA environments) are not signed by a trusted CA → Postman shows errors like `self signed certificate`, `unable to get local issuer certificate`, `UNABLE_TO_VERIFY_LEAF_SIGNATURE`.
- Fixes in Postman (Chapter 16): add your company **CA certificate** (Settings → Certificates → CA certificates), or for local dev only, turn off **SSL certificate verification**.
- **Mutual TLS (mTLS)**: the **client also shows a certificate**. In Postman: Settings → Certificates → **Add client certificate** (host, port, CRT/KEY or PFX file, passphrase).

---

## 1.20 Where Postman fits in the Software Development Life Cycle

| Role | How they use Postman |
|---|---|
| **Backend developer** | Build & debug endpoints, quick manual tests, share collections with frontend |
| **Frontend / mobile developer** | Understand API responses, use mock servers before backend is ready |
| **QA / SDET** | Functional, regression, negative, data-driven, contract and integration testing; automation with Newman/Postman CLI in CI/CD |
| **DevOps / SRE** | Monitors for uptime/health checks, CI pipelines |
| **Architect / API product manager** | Design-first with OpenAPI in Spec Hub, governance rules, documentation |
| **Security tester** | Manual auth/authorization testing, fuzzing with data files, OWASP API checks |
| **Technical writer** | Publish API documentation |
| **Partners / customers** | Fork public collections ("Run in Postman") to onboard quickly |

### Types of API testing you'll do with Postman
- **Functional testing** — does each endpoint do what it should?
- **Smoke testing** — are the most critical endpoints alive?
- **Sanity testing** — after a small change, is the related area OK?
- **Regression testing** — did new code break old features? (Collection runs in CI)
- **Integration testing** — do services work together? (request chaining)
- **End-to-end (E2E) workflow testing** — signup → login → add to cart → pay → order status
- **Negative testing** — invalid inputs, missing fields, wrong auth
- **Boundary value testing** — min/max lengths, limits
- **Data-driven testing** — same request with many data rows (CSV/JSON)
- **Contract testing** — response matches the agreed schema (JSON Schema / OpenAPI)
- **Performance/load testing** — Postman's built-in performance runner (basic; for heavy load use JMeter/k6/Gatling)
- **Security testing** — auth, IDOR/BOLA, injection, headers
- **Monitoring** — scheduled production health checks

---

## 1.21 Chapter 1 Quick Revision

- API = contract/waiter between client and server.
- HTTP is stateless request–response; methods have safe/idempotent properties.
- 2xx success, 3xx redirect, 4xx client mistake, 5xx server mistake. 401 = not authenticated, 403 = not authorized.
- `Content-Type` = what I send; `Accept` = what I want.
- CORS is a browser thing; Postman desktop ignores it.
- JSON: double quotes, no trailing commas, big numbers lose precision in JS.
- Postman shows timing breakdown: DNS, TCP, SSL, TTFB, download.

➡️ Next: **Chapter 2 — Getting Started with Postman**.
