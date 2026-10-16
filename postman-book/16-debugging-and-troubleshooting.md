# Chapter 16 — Debugging & Troubleshooting: Every Common Error and How to Fix It

> 🧒 When your toy doesn't work, a good fixer doesn't randomly hit it. They check **one thing at a time**: Is it switched on? Are the batteries in? Is the wire connected? This chapter is your **checklist for broken API requests**.

---

## 16.1 The debugging method (use for EVERY problem)

1. **Read the exact error** (status code, error text, Console output). Don't guess.
2. **Open the Postman Console** (`Ctrl/Cmd + Alt/Option + C`) → expand the request → see the **actual** URL, headers, body sent and received (after variable resolution!).
3. **Isolate**: same request on httpbin/echo? from cURL? from another machine/network? in a fresh tab without scripts? with a different environment?
4. **Compare working vs non-working** side by side (the app vs Postman, colleague vs you, local vs CI) — find the difference in URL, headers, body, auth, cookies, network.
5. **Change one thing at a time**.
6. **Check the server side**: logs with correlation ID (`X-Correlation-ID: {{$guid}}` → ask backend to search logs).
7. **Write down the fix** in the collection docs/wiki so the team never loses time on it again.

### Classifying the problem
| Where it fails | Typical signs |
|---|---|
| **Before sending** (Postman/scripts/variables) | Script errors, red variables, "Invalid URL" |
| **Network** (DNS/TCP/TLS/proxy) | No status code; `ENOTFOUND`, `ECONNREFUSED`, `ETIMEDOUT`, SSL errors |
| **Server rejects request** | 4xx |
| **Server crashes** | 5xx |
| **Response OK but tests fail** | Assertion errors, JSON errors |
| **Works in app, fails in CI** | Environment/secrets/files/versions differences |

---

## 16.2 "Could not send request" / network errors

| Error | Meaning | Fixes |
|---|---|---|
| `getaddrinfo ENOTFOUND api.shop.com` | DNS can't resolve host | Typo in host; **unresolved variable** (`ENOTFOUND {{baseurl}}`); VPN not connected (internal DNS); `/etc/hosts`; corporate DNS; try `nslookup host` |
| `connect ECONNREFUSED 127.0.0.1:8080` | Host reachable but nothing listening on that port | Server not running; wrong port; server listening on different interface; firewall actively rejecting |
| `connect ECONNREFUSED ::1:8080` | Postman resolved `localhost` to IPv6 `::1`, but your server listens only on IPv4 `127.0.0.1` | Use `127.0.0.1` instead of `localhost`, or make the server listen on `::`/both |
| `connect ETIMEDOUT` / `ESOCKETTIMEDOUT` | No response in time (packets dropped) | Firewall/security group, VPN, wrong IP, server overloaded; increase timeout to check |
| `Error: socket hang up` / `ECONNRESET` | Server/proxy closed connection abruptly | Server crash, TLS mismatch, mTLS cert missing, proxy issues, request too large, keep-alive issues; check server logs |
| `EHOSTUNREACH` / `ENETUNREACH` | No route to host | Network/VPN/routing |
| `Error: Invalid protocol: ...` / "Invalid URL" | Malformed URL, missing scheme, spaces | Add `https://`; encode spaces; check variables |
| `EPROTO ... wrong version number` | Speaking **HTTPS to an HTTP port** (or vice versa) | Use `http://` for plain ports (e.g. `http://localhost:8080`) |
| `Request timed out` (Postman message) | Hit Postman's request timeout setting | Increase timeout (Settings → General) or investigate server slowness |
| `Maximum response size reached` | Response larger than limit | Settings → Max response size; Send and Download |
| `EACCES` / `EPERM` | OS/antivirus/permission blocks | Firewall/antivirus allow Postman; corporate endpoint security |
| Request hangs forever with "Sending request..." | Timeout = 0 (infinite) and server never responds; proxy waiting for auth | Set timeout; check proxy settings |

### `localhost` gotchas
| Situation | Problem | Fix |
|---|---|---|
| Postman **web** app → `localhost` | Cloud agent can't reach your machine | Use **Desktop Agent** or desktop app |
| Server in **Docker**, Postman on host | Port not published | `docker run -p 8080:8080`; call `localhost:8080` |
| Newman in **Docker** container → service on host | `localhost` = the container itself | `host.docker.internal` (Docker Desktop) or `--network host` (Linux) |
| Server in **WSL2**, Postman on Windows | Usually forwarded; sometimes not | Use WSL IP (`hostname -I`) or enable localhost forwarding |
| Server on another laptop | It listens only on 127.0.0.1 | Bind server to `0.0.0.0`; firewall allow; use its LAN IP |
| Android emulator calling host | `localhost` = emulator | `10.0.2.2` (not a Postman issue, but common confusion when comparing) |

---

## 16.3 SSL/TLS errors

| Error | Meaning | Fix |
|---|---|---|
| `self signed certificate` / `self-signed certificate in certificate chain` | Cert (or chain) not signed by trusted CA | Add company/dev **CA cert** in Settings → Certificates → CA Certificates (PEM); or disable SSL verification **for that request** (dev only) |
| `unable to get local issuer certificate` / `UNABLE_TO_GET_ISSUER_CERT_LOCALLY` | Intermediate/root CA unknown (corporate TLS inspection proxy like Zscaler re-signs traffic) | Add corporate root CA PEM to Postman; Newman `--ssl-extra-ca-certs` or `NODE_EXTRA_CA_CERTS` |
| `UNABLE_TO_VERIFY_LEAF_SIGNATURE` | Server didn't send full chain (missing intermediate) | Ask server team to fix chain; temporarily add intermediate CA |
| `certificate has expired` / `CERT_HAS_EXPIRED` | Expired cert | Renew cert (server); check your system clock |
| `Hostname/IP does not match certificate's altnames` / `ERR_TLS_CERT_ALTNAME_INVALID` | Calling by IP or wrong hostname | Use the hostname in the cert's SAN; fix cert |
| `alert handshake failure` / `SSL routines` errors | Protocol/cipher mismatch, or server requires client cert (mTLS) | Add client cert (Settings → Certificates); check TLS versions in request Settings |
| Works with SSL verification OFF only | Trust chain problem | Fix trust properly (CA cert) — don't leave verification off |

> 🏢 **Corporate network tip:** If *everything* HTTPS fails with issuer errors on your work laptop but works at home, your company's TLS inspection proxy is re-signing traffic. Export the corporate root CA (from your OS/browser certificate store) as PEM and add it to Postman → problem solved properly.

---

## 16.4 Proxy problems
| Symptom | Fix |
|---|---|
| Works on home Wi-Fi, fails in office | Configure **Settings → Proxy**: use system proxy, or custom proxy host/port, proxy auth (407 errors) |
| Internal hosts fail when proxy enabled | Add them to **proxy bypass** list |
| `407 Proxy Authentication Required` | Enter proxy credentials in proxy settings |
| Newman/CLI behind proxy | Set `HTTP_PROXY`, `HTTPS_PROXY`, `NO_PROXY` environment variables |
| Postman capture proxy (5555) left enabled on device | Device traffic fails when Postman closes → remove proxy config from device |

---

## 16.5 Status-code-driven debugging

### 400 Bad Request
Checklist:
1. Body valid JSON? (Beautify; look for trailing commas, smart quotes `“ ”` copied from Word/Slack!)
2. `Content-Type` correct (raw → **JSON**)?
3. Required fields present, correct names (case-sensitive: `userId` vs `userid`) and types (`"5"` vs `5`)?
4. Variables resolved inside body? (Console → request body)
5. Date formats (`2026-10-16` vs `16/10/2026`), enums.
6. Read the **error message in response** — most APIs tell you exactly which field.

### 401 Unauthorized
1. Auth tab type correct? Request set to **Inherit** but parent has **No Auth**?
2. Token variable resolved, not expired, no extra spaces/newline, correct prefix (`Bearer ` with a space)?
3. Correct environment (QA token on DEV server = invalid)?
4. Both Auth tab **and** manual `Authorization` header present (conflict)?
5. Clock skew for signed auth (OAuth1/Hawk/AWS).
6. Decode JWT → check `aud`, `iss`, `exp`, scopes.

### 403 Forbidden
1. User role/scopes insufficient (decode JWT; check IdP config).
2. API key lacks permission / not subscribed to that API product.
3. IP allowlist / WAF blocking (cloud WAFs sometimes block requests with `PostmanRuntime` User-Agent or suspicious payloads — check WAF logs).
4. CSRF token missing (session-based apps).
5. Resource ownership (BOLA protection working as intended!).

### 404 Not Found
1. Base URL & path (version prefix `/api/v1`?), trailing slash (`/users/` vs `/users`), path variable empty → `/users/`.
2. Wrong environment.
3. Resource really doesn't exist (deleted, different tenant).
4. Method mismatch on some frameworks returns 404 instead of 405.
5. Reverse proxy routing (gateway path rewrite).

### 405 Method Not Allowed
Wrong method; check `Allow` response header.

### 413 / 414 / 431
Payload too big / URL too long / headers too big (clear cookie jar!).

### 415 Unsupported Media Type
`Content-Type` missing/wrong; for form-data don't set it manually.

### 422 Unprocessable
Business validation; read the error details.

### 429 Too Many Requests
Add Runner delay; respect `Retry-After`; use different test accounts; ask for higher limits in test env.

### 500 Internal Server Error
- Server bug → collect evidence: request (cURL from Code snippet, with secrets removed), response, timestamp, correlation ID → raise a bug.
- Try to find the minimal input that triggers it (often null/unexpected types).

### 502 / 503 / 504
Gateway/upstream issues: service down, deployment in progress, timeouts; retry later, check status pages/monitoring, inform DevOps.

### 3xx when you expected 200
- `http://` → `https://` redirect; login redirect (session expired → 302 to `/login`) — turn off "follow redirects" to see it.
- POST becoming GET after 301/302 → enable "Follow original HTTP method" or use the final URL directly.

---

## 16.6 Response is OK, but something's wrong

| Symptom | Cause | Fix |
|---|---|---|
| Got HTML login page instead of JSON | Session expired / SSO redirect / wrong host | Check Preview tab; re-auth; check redirects |
| Response is gibberish | Binary/compressed content shown as text | Check `Content-Type`/`Content-Encoding`; use Send and Download |
| Old data returned | Caching (CDN/proxy) | `Cache-Control: no-cache` setting; cache-busting query `?_={{$timestamp}}` |
| Numbers changed (`12345678901234567890` → `12345678901234567000`) | JS precision in Pretty view / `json()` | Ask API for string IDs; inspect Raw view |
| Dates off by 5:30h | Timezones (UTC vs IST) | Compare in UTC |
| Characters broken (`Ã©`) | Encoding mismatch | Server must send UTF-8 with charset |
| Empty body with 200 | API returns 204-like behaviour, or wrong `Accept` header | Check API contract; add `Accept: application/json` |

---

## 16.7 Script errors

| Error | Cause | Fix |
|---|---|---|
| `ReferenceError: x is not defined` | Typo/undeclared variable; using a JS variable from another script | Declare with `const/let`; pass data via Postman variables |
| `TypeError: Cannot read properties of undefined (reading 'id')` | Path doesn't exist in response (`json.data.id` but `data` missing) | Log `pm.response.json()`; use optional chaining; check status first |
| `JSONError: Unexpected token '<' at 1:1` | `pm.response.json()` on HTML | Check status/content-type before parsing |
| `JSONError: No data, empty input at 1:1` | Empty body (204) | Guard: `if (pm.response.text())` |
| `SyntaxError: Unexpected token ...` | JS syntax error in your script | Check line numbers in Console; missing brackets/commas |
| `SyntaxError` when `JSON.parse(pm.request.body.raw)` | Body contains unresolved `{{var}}` | `JSON.parse(pm.variables.replaceIn(pm.request.body.raw))` |
| `TypeError: pm.execution.skipRequest is not a function` | Used in post-response | Move to pre-request |
| `pm.response is undefined`/not usable | Using `pm.response` in pre-request | Only in post-response |
| `AssertionError: expected 200 to equal '200'` | Type mismatch | Convert types |
| `Error: Cannot find module 'xyz'` | `require` of unsupported library | Use built-in libs or Package Library (`pm.require`) |
| `Error: ... package not found` (`pm.require`) | Package name/version wrong or no access; Newman/CLI context | Check package library; login for CLI |
| Script takes forever / run hangs | Unresolved callback, infinite `setInterval`, long `setTimeout`, infinite loops | `clearInterval`; ensure callbacks complete; `--timeout-script` in CLI |
| `There was an error in evaluating the Pre-request Script` | Any uncaught error in pre-request | Console shows details; wrap in try/catch |
| Test results empty | Script error before any `pm.test`, or tests inside a callback that never fires | Console; ensure `sendRequest` callbacks run |
| Variable set in script "not saved" | Set in post-response but used in same request; wrong scope; Runner "keep values" off; local vs shared value | See Chapter 5 checklist |

---

## 16.8 Variable problems (quick recap)
1. Red `{{var}}` → undefined in active scopes.
2. Wrong environment selected / "No environment".
3. Precedence (data/local overriding).
4. Local vs shared values (teammates don't see your local value).
5. Trailing whitespace.
6. Disabled variable.
7. CSV BOM / header mismatch.
8. Case sensitivity.
9. `pm.variables.set` (local) vs `pm.environment.set`.
10. Newman: env file not passed or outdated export.

---

## 16.9 Cookies & session problems
| Symptom | Fix |
|---|---|
| Logged in as wrong user | Clear cookie jar for domain; check `Cookie` header in Console |
| Logout test fails (still authenticated) | Old cookie still sent; or Bearer token still in Auth |
| CSRF mismatch | Read CSRF cookie → header in pre-request script |
| Cookies not stored | Cookie `Domain`/`Path`/`Secure` mismatch (Secure cookie over http), "Disable cookie jar" ticked |
| Script can't read cookie via jar | Add domain to cookie **allowlist** |

---

## 16.10 "It works in Postman but not in my app" (and the reverse)

### Works in Postman, fails in browser frontend
→ Almost always **CORS** (browser enforces; Postman desktop doesn't). Check browser console for `blocked by CORS policy`. Fix on server: `Access-Control-Allow-Origin`, `-Methods`, `-Headers`, handle `OPTIONS` preflight, credentials rules.
Other causes: frontend sends different headers/body (compare with DevTools "Copy as cURL"), cookies `SameSite`, mixed content (https page calling http API).

### Works in Postman, fails in backend code (Java/Python/Node)
- Code doesn't follow redirects / sends different `Content-Type` / doesn't encode body properly / missing `User-Agent` (some APIs/WAFs require one) / proxy settings differ / TLS trust store (Java `cacerts`) lacks corporate CA / HTTP/2 differences.
- Use Postman's **Code snippet** for your language as a reference and compare byte by byte with a request bin (httpbin.org/anything).

### Works in app/curl, fails in Postman
- Postman auto-headers (`Postman-Token`, `User-Agent: PostmanRuntime/...`) rejected by strict servers/WAF → disable/override.
- Postman auto-encoding the URL differently → disable "Encode URL automatically".
- Cookies in Postman's jar interfering → disable cookie jar for the request.
- Proxy/SSL settings in Postman differ from system.
- Body trimming/whitespace settings.

---

## 16.11 Runner, Newman & CI problems
See Chapter 10 (Runner) and Chapter 11.9 (Newman vs app). Extra:
- **Flaky tests** (pass/fail randomly): async processing not complete → poll instead of fixed delays; shared test data across parallel runs → unique data per run; environment instability → retries for transient 5xx only; time-dependent assertions → avoid.
- **Order-dependent failures**: tests rely on previous ones implicitly → make dependencies explicit (setup folder) or independent.
- **Huge runs crash app** → run via Newman/CLI, disable response saving.

---

## 16.12 OAuth problems
See Chapter 6.8 table (`invalid_client`, `invalid_grant`, `redirect_uri_mismatch`, expired tokens, browser auth issues).

---

## 16.13 Postman app problems
| Problem | Fix |
|---|---|
| App slow / high memory | Close unused tabs; clear History; disable response saving in Runner; reduce Console logs; large responses → Raw view; update app |
| Sync issues ("Not synced", conflicts) | Check internet/proxy; sign out & in; check status.postman.com; Settings → Data export as backup before troubleshooting |
| Changes "disappeared" | Different workspace? fork vs parent? unsaved tab? Check Trash and version history |
| UI elements missing (e.g. "Tests" tab) | Renamed in newer version (Scripts → Post-response) |
| Can't install / blank window | Clear app data (backup first), reinstall; GPU issues: start with hardware acceleration disabled |
| Interceptor not connecting | Install/update Interceptor bridge, restart browser & app, check extension permissions |
| Desktop Agent not detected (web app) | Install/run agent, select Desktop Agent in bottom-right, allow it through firewall |
| Need app logs | **View → Developer** menu (Show DevTools, view logs). Log folders: Windows `%APPDATA%\Postman\logs`, macOS `~/Library/Application Support/Postman/logs`, Linux `~/.config/Postman/logs` |
| Status of Postman cloud | status.postman.com |

---

## 16.14 Writing a great bug report from Postman
```
Title: POST /orders returns 500 when items[].qty is null

Environment: QA (orders-qa.shop.com), 2026-10-16 10:42 IST
Correlation ID: 8a3c6f2e-...
Steps:
 1. Get token (client credentials, user qa_buyer_1)
 2. POST /v1/orders with body (below)
Expected: 400 with validation error "qty is required"
Actual: 500 {"error":"Internal Server Error"}
Request (cURL from Postman, token redacted):
 curl -X POST 'https://orders-qa.shop.com/v1/orders' -H 'Authorization: Bearer <redacted>' -H 'Content-Type: application/json' --data '{"items":[{"sku":"A1","qty":null}]}'
Response headers/body: ...
Collection link: <Postman link to request/example>
Frequency: 100% reproducible
```
Tip: **Save the failing response as an example** and link it in the ticket.

---

## 16.15 Chapter 16 Quick Revision
- Console first; compare working vs failing; change one thing at a time; correlation IDs.
- Network errors: ENOTFOUND (DNS/unresolved var), ECONNREFUSED (port/IPv6 ::1), ETIMEDOUT (firewall), socket hang up (server/TLS/mTLS), EPROTO wrong version (https on http port).
- SSL: add CA certs (corporate TLS inspection!), don't leave verification off.
- Status code checklists for 400/401/403/404/415/429/5xx.
- Script errors: JSONError `<` = HTML; unresolved vars in `request.body.raw`; skipRequest in post-response.
- Postman works but browser doesn't = CORS.

➡️ Next: **Chapter 17 — Best Practices & Situational Playbook**.
