# Chapter 3 — Building and Sending Requests in Depth

> 🧒 A request is a **letter**. The **method** says what you want ("please give / please take / please change"). The **URL** is the address. **Headers** are what you write on the envelope. The **body** is the letter inside.

---

## 3.1 The URL bar

- Choose the **method** from the dropdown (GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS, plus COPY, LINK, UNLINK, PURGE, LOCK, UNLOCK, PROPFIND, VIEW). You can also **type a custom method** name — useful for APIs with non-standard verbs.
- Type or paste the URL. Variables are written `{{variableName}}` and turn **green** (resolved) or **red** (unresolved) — hover to see value and scope.
- If you omit the scheme (`api.example.com/users`), Postman defaults to `http://`. **Always type `https://`** explicitly to avoid surprises (redirects, 301s, or insecure calls).
- `localhost` / `127.0.0.1` work from the desktop app.

---

## 3.2 Query Parameters

Two ways to add:
1. Type in URL: `{{baseUrl}}/products?category=shoes&sort=price&order=asc`
2. Fill the **Params** table (Key / Value / Description). Both stay in sync.

Details:
- **Disable** a param with its checkbox — great for testing "what if this filter is missing?".
- **Bulk Edit** — switch the table to text mode `key:value` per line (fast copy-paste).
- **Repeated keys** (arrays): `?id=1&id=2&id=3` — add the same key multiple times. Some APIs expect `id[]=1&id[]=2` or `id=1,2,3`; check the API's convention.
- **Empty value** `?debug=` vs **no value** `?debug` — different on some servers; Postman supports both.
- **Encoding**: Postman encodes certain characters automatically (Settings → "Encode URL automatically" per request). If the API needs a *literal* character (e.g. a pre-encoded signature), turn auto-encoding off for that request.
- **Descriptions** appear in generated documentation — fill them in for team collections.

---

## 3.3 Path Variables

Write a colon prefix in the path: `{{baseUrl}}/users/:userId/orders/:orderId`
→ Params tab shows **Path Variables** table: `userId`, `orderId`.

| Path variable `:id` | Collection/env variable `{{id}}` |
|---|---|
| Defined per request, in the Params table | Defined in a variable scope |
| Good for documenting the endpoint shape | Good for reusing dynamic values |
| Value can itself be a variable: `:userId` = `{{userId}}` | |

**Best practice:** Use `:userId` in the path with value `{{userId}}`. Docs show the clean template, and chaining still works.

---

## 3.4 Headers

- Add Key/Value pairs; autocomplete suggests standard headers.
- Values can use variables: `Authorization: Bearer {{accessToken}}`, `X-Correlation-ID: {{$guid}}`.
- **Hidden (auto-generated) headers**: Postman automatically adds `Postman-Token`, `Host`, `User-Agent`, `Accept: */*`, `Accept-Encoding: gzip, deflate, br`, `Connection: keep-alive`, and for bodies `Content-Type` and `Content-Length`. Click **hidden** to view them; most can be unticked or overridden by adding your own header with the same name.
- **Header presets**: save a reusable group of headers (e.g. "JSON API headers": `Accept`, `Content-Type`) and insert in one click (Headers tab → Presets).
- **Bulk edit** like params.
- **Order of precedence**: The **Authorization tab** generates the `Authorization` header. If you *also* add a manual `Authorization` header, you can get confusing behaviour — **use one or the other**.

---

## 3.5 Request Body — All Types In Depth

### 3.5.1 none
No body (GET, DELETE usually).

### 3.5.2 form-data (`multipart/form-data`)
Used for **file uploads** and forms with files.
- Each row: Key, Value, type **Text** or **File** (hover the key cell to switch).
- For a file, pick one or multiple files. Postman builds the multipart body with a random **boundary** and sets `Content-Type: multipart/form-data; boundary=--------------------------123...` **automatically**.
- You can set a per-field **Content-Type** (show "Content-Type" column) — e.g. send a JSON part: key `metadata`, value `{"name":"x"}`, content type `application/json`.

> ❌ **Classic bug:** Manually setting `Content-Type: multipart/form-data` in Headers **without the boundary** → server can't parse → 400/500. **Fix: delete your manual Content-Type header and let Postman generate it.**

> ❌ **Newman/CI bug:** File paths are stored relative to Postman's working directory. In CI the file isn't there → `ENOENT`/empty upload. **Fix:** set a working directory, keep test files in the repo, run Newman with `--working-dir`, and enable "allow files outside working dir" only if needed.

### 3.5.3 x-www-form-urlencoded
- Body like `username=asha&password=secret%21` with `Content-Type: application/x-www-form-urlencoded`.
- Used by classic HTML forms and **OAuth 2.0 token endpoints** (the token request is form-encoded per the RFC).
- No files.

### 3.5.4 raw
Free text with a language selector: **Text, JavaScript, JSON, HTML, XML**. Selecting JSON sets `Content-Type: application/json`; XML sets `application/xml`; Text sets `text/plain`, etc.

JSON with variables:
```json
{
  "email": "{{userEmail}}",
  "age": {{userAge}},
  "isAdmin": false,
  "requestId": "{{$guid}}",
  "createdAt": "{{$isoTimestamp}}"
}
```
- `{{userAge}}` without quotes → number in the final JSON. The editor may underline it red (it's not valid JSON before substitution) — **that's fine**; substitution happens before sending.
- Use the **Beautify** button to format JSON/XML.

### 3.5.5 binary
Send a single file as the whole body (`application/octet-stream` or set your own `Content-Type: image/png`). Used for S3 pre-signed URL uploads, image processing APIs.

### 3.5.6 GraphQL
Two editors: **Query** and **GraphQL Variables** (JSON). Postman sends:
```json
{ "query": "query ($id: ID!) { user(id: $id) { name email } }", "variables": { "id": "1" } }
```
Postman can fetch the **schema via introspection** for autocomplete. (Full GraphQL chapter: 13.)

---

## 3.6 Request Settings tab (per request)

| Setting | Meaning / when to change |
|---|---|
| **HTTP version** | Auto / HTTP/1.x / HTTP/2 |
| **Enable SSL certificate verification** | Override global for this request |
| **Automatically follow redirects** | Off to inspect 3xx |
| **Follow original HTTP method** | By default, on 301/302 Postman (like browsers) may redirect POST as GET; turning this on keeps the method |
| **Follow Authorization header** | Keep auth header on cross-origin redirect (security risk—off by default) |
| **Remove referer header on redirect** | |
| **Enable strict HTTP parser** | Reject malformed responses |
| **Encode URL automatically** | Turn off for pre-encoded/signed URLs |
| **Disable cookie jar** | Don't send/store cookies for this request (test unauthenticated behaviour) |
| **Use server cipher suite during handshake** | TLS tuning |
| **Maximum number of redirects** | Default 10 |
| **TLS/SSL protocols disabled during handshake** | Test TLS 1.0/1.1 rejection |
| **Cipher suite selection** | Advanced TLS testing |

---

## 3.7 Understanding the Response

### Status, Time, Size
- **Status**: code + reason phrase. Hover shows the meaning.
- **Time**: total ms; hover for phases (Prepare → Socket init → DNS → TCP → SSL → Waiting/TTFB → Download → Process). High **TTFB** = slow server; high **DNS** = DNS issue; high **SSL** = TLS issue; high **Download** = big payload/slow network.
- **Size**: response headers + body bytes (compressed vs uncompressed info on hover).
- **Network info** (globe icon): local & remote IP, TLS protocol, cipher, certificate details.

### Body formats
Pretty / Raw / Preview / Visualize, language auto-detected from `Content-Type`. If an API returns JSON with `Content-Type: text/html`, Pretty may show text — switch the dropdown to JSON manually (and report the wrong header to the developers!).

### Saving responses as Examples
Click **Save Response → Save as example**. An **example** stores a request + response pair. Examples are used by:
- **Mock servers** (they return examples),
- **Documentation** (shows sample responses),
- **Team understanding** (what a 404 looks like, what a 422 validation error looks like).

> 🏢 Save examples for **every important status code** (200, 201, 400, 401, 403, 404, 409, 422, 500) — this turns your collection into living documentation.

---

## 3.8 Cookies in Postman

- After a response with `Set-Cookie`, Postman stores the cookie in its **cookie jar** (per domain).
- Next request to the same domain → Postman sends the `Cookie` header automatically.
- **Manage Cookies** (link under Send button, or footer → Cookies): view, add, edit, delete cookies by domain. Add a domain **whitelist/allowlist** for scripts to access cookies programmatically.
- Disable per request with Settings → **Disable cookie jar**.

Common cookie-related bugs:
| Symptom | Cause | Fix |
|---|---|---|
| Logged-out API still returns data | Old session cookie still in jar | Delete cookies for domain |
| 431 Request Header Fields Too Large | Too many/big cookies accumulated | Clear cookie jar |
| Works in Postman, fails in CI (Newman) | Newman starts with an empty jar each run; you relied on a manually created cookie | Add a login request that sets cookies, or set Cookie header via variable |
| CSRF token mismatch (Django/Laravel/Spring) | Need to read CSRF cookie and send it in header | Script: read cookie, set header (Chapter 6) |

---

## 3.9 Code Snippets

`</>` panel converts the request into code in many languages/libraries: cURL, wget, HTTPie, PowerShell `Invoke-RestMethod`, Python (`requests`, `http.client`), JavaScript (`fetch`, jQuery, XHR, Axios), Node.js (`http`, `request`, Axios, Unirest), Java (OkHttp, Unirest, `java.net.http`), C# (`HttpClient`, RestSharp), Go, PHP (cURL, Guzzle, `HTTP_Request2`), Ruby, Swift, Kotlin, Dart, C (libcurl), R, Rust, OCaml, Objective-C, Shell, etc.
- Snippet settings: indentation, follow redirects, trim body, request timeout.
- Variables get **resolved** into the snippet using current values — be careful not to paste **secrets** into chats/tickets!

---

## 3.10 Sending and Downloading
Send dropdown → **Send and Download** saves the response body to a file (PDF reports, CSV exports, images).

---

## 3.11 Capturing requests: Proxy and Interceptor

### Why
You want to see what a **mobile app** or **website** really sends, then recreate/test it in Postman.

### Postman built-in proxy
1. Footer → **Capture requests** → **Proxy** (or "via Postman proxy").
2. Postman listens on a port (default **5555**).
3. Configure your device/browser to use your computer's IP:5555 as HTTP proxy.
4. For HTTPS capture, install and trust the **Postman CA certificate** on the device.
5. Requests appear in History or a chosen collection; filter by URL/method.

### Postman Interceptor
- A **Chrome browser extension** that captures browser requests and **syncs cookies** from the browser into Postman (so you can call APIs with the browser's logged-in session).
- Requires the Interceptor bridge (installed automatically by the app on first use in recent versions).
- Choose domains to capture to avoid noise.

### Alternative
Browser DevTools → Network → right-click a request → **Copy as cURL** → paste into Postman. Or export **HAR** → Import.

---

## 3.12 Working with files, encodings and special cases

- **Unicode**: JSON bodies are UTF-8. Emojis and Indian-language text work; ensure server declares `charset=utf-8`.
- **Large responses**: if response > max size setting → error "Maximum response size reached". Increase limit or use Send and Download.
- **Gzip/Brotli**: Postman decompresses automatically; raw view shows decoded text.
- **Chunked / streaming responses**: Postman shows final body; for **SSE** (`text/event-stream`) newer versions display the event stream live.
- **Binary responses** (images, PDF): Preview shows image/PDF; otherwise Send and Download.

---

## 3.13 A complete CRUD walkthrough (Restful-Booker)

Base URL: `https://restful-booker.herokuapp.com`

| # | Request | Details | Expected |
|---|---|---|---|
| 1 | `POST /auth` | raw JSON `{"username":"admin","password":"password123"}` | `200`, `{"token":"abc123..."}` |
| 2 | `POST /booking` | raw JSON booking body (below), `Accept: application/json` | `200` with `bookingid` |
| 3 | `GET /booking/:id` | path var id | `200`, booking details |
| 4 | `PUT /booking/:id` | full body + header `Cookie: token={{token}}` | `200` updated |
| 5 | `PATCH /booking/:id` | `{"firstname":"Asha"}` + Cookie | `200` |
| 6 | `DELETE /booking/:id` | Cookie header | `201` (yes, this API returns 201 "Created" for delete — a great example that **real APIs don't always follow conventions**; your tests must follow the **API contract**, not assumptions) |
| 7 | `GET /booking/:id` again | | `404` |

Booking body:
```json
{
  "firstname": "Jim",
  "lastname": "Brown",
  "totalprice": 111,
  "depositpaid": true,
  "bookingdates": { "checkin": "2026-01-01", "checkout": "2026-01-05" },
  "additionalneeds": "Breakfast"
}
```
We'll automate this exact flow with variables and scripts in Chapters 5, 7, 8, and 9.

---

## 3.14 Chapter 3 Quick Revision
- Params tab syncs with URL; path variables use `:name`.
- Let Postman set `Content-Type` for form-data (boundary!).
- OAuth token endpoints usually need x-www-form-urlencoded.
- Unquoted `{{number}}` in JSON is fine.
- Save examples for every status code → mocks + docs.
- Cookie jar persists cookies; clear it when debugging auth weirdness.
- Proxy (port 5555) and Interceptor capture real traffic; "Copy as cURL" is the fastest import.

➡️ Next: **Chapter 4 — Collections and Folders**.
