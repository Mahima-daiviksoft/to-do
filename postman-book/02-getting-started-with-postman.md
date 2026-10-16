# Chapter 2 — Getting Started with Postman

> 🧒 **5-year-old version:** Postman is like a **remote control for APIs**. Instead of building a whole app just to see if the "kitchen" (server) works, you press buttons in Postman, it sends your order, and it shows you exactly what came back.

---

## 2.1 What is Postman?

Postman is an **API platform** used to **design, build, test, document, mock, monitor, and collaborate on APIs**. It started (2012) as a simple Chrome extension built by Abhinav Asthana to make API testing easier, became a desktop app, and grew into a full platform used by tens of millions of developers and the majority of Fortune 500 companies.

### What Postman can do (the big map)

| Capability | Feature in Postman |
|---|---|
| Send any API request | HTTP, GraphQL, gRPC, WebSocket, Socket.IO, MQTT, SOAP, AI/MCP requests |
| Organise requests | **Collections**, folders, workspaces |
| Reuse values | **Variables**: global, collection, environment, data, local; **Vault** secrets |
| Authenticate | Auth tab: API Key, Bearer, Basic, Digest, OAuth 1.0/2.0, JWT, AWS Sig v4, NTLM, Hawk, Akamai EdgeGrid, ASAP |
| Automate & test | **Pre-request scripts**, **post-response scripts** (tests), `pm.*` API, Chai assertions |
| Run many requests | **Collection Runner**, data files (CSV/JSON), performance tests |
| Command line / CI | **Newman** (open-source npm package), **Postman CLI** (official binary) |
| Fake APIs | **Mock servers** |
| Scheduled checks | **Monitors** |
| Design APIs | **Spec Hub / API Builder** with OpenAPI, AsyncAPI, GraphQL schemas |
| Document | Auto-generated **documentation**, publishing |
| Visual workflows | **Postman Flows** (low-code) |
| Capture traffic | **Proxy**, **Interceptor** |
| AI | **Postbot** and **Agent Mode** |
| Collaborate | Team workspaces, roles, comments, forks, pull requests, version control (Git integration, Native Git in v12) |
| Discover APIs | **Postman API Network** (public APIs), **API Catalog** (organisation-level) |
| Programmatic control | **Postman API** (`api.getpostman.com`) |

---

## 2.2 Postman versions — a short history (good for interviews and for reading old tutorials)

| Era | What changed |
|---|---|
| Chrome App (2012–2018) | Postman ran inside Chrome. Deprecated. |
| Native desktop app (Electron) | Windows/macOS/Linux. Same app is still used today. |
| v7–v8 (2019–2020) | Workspaces, APIs tab, mock servers & monitors matured; v8 introduced the new UI and the **Postman Agent** for the web app. |
| v9 (2021) | API Builder, Flows (beta), gRPC early access, Collection format improvements. |
| v10 (2022) | Git integration for APIs, **Scratch Pad deprecated** (offline mode replaced later by lightweight client), new workspace experience. |
| v11 (2024) | **Postbot** AI everywhere, **Postman Vault**, **Package Library** (`pm.require`), **Scripts tab** split into *Pre-request* and *Post-response* (the old "Tests" tab was renamed), **Spec Hub**, Insights. Later in v11: variable values model changed to a single local value with an optional **shared value** (previously "current value" / "initial value"). |
| v12 (2026) | **Native Git / Git-native workspaces**: collections stored as **YAML files (Collection format v3)** in your repo, local-first development, `postman workspace push` CLI sync; **Agent Mode** expanded; **API Catalog**. |

> ⚠️ **Version awareness rule (very important in a company):** Postman changes UI labels often. Old tutorials say "Tests tab", new UI says "Scripts → Post-response". Old docs say "Initial value / Current value", newer docs say "Shared value / Local value" (or a single "Value" column). **The concepts are the same.** In this book we give both names wherever a rename happened, so you can work with any version your company uses.

---

## 2.3 Postman plans (as of 2026)

In **March 2026**, Postman restructured its plans:

| Old plans (before March 2026) | New plans (from March 2026) |
|---|---|
| Free, Basic, Professional, Enterprise | **Free, Solo, Team, Enterprise** |

- **Free** — now limited to **a single user** (team collaboration removed from free tier).
- **Solo** — paid, individual, more AI credits & automation.
- **Team** — paid per user; replaces Basic; unlocks collaboration and role-based access control.
- **Enterprise** — advanced governance, SSO/SCIM, audit logs, Partner workspaces, private API network, etc.

> Prices and limits (monitor runs, mock calls, AI credits, Flows, etc.) change frequently. **Always check postman.com/pricing** before quoting numbers in a company proposal. In interviews it's enough to know: *free tier = individual, collaboration needs paid; Enterprise adds SSO, governance, audit logs, advanced roles.*

---

## 2.4 Installing Postman

### Desktop app (recommended for work)
- **Windows**: download the installer from `postman.com/downloads`. Installs per-user into `%LOCALAPPDATA%\Postman`.
- **macOS**: download `.zip`/`.dmg` (Apple Silicon or Intel build), move to Applications. Or `brew install --cask postman`.
- **Linux**: download the `tar.gz`, extract (e.g. to `/opt/Postman`) and create a desktop entry; or use Snap: `sudo snap install postman`. Flatpak packages exist too (community-maintained).

### Web app
- Go to `go.postman.co` / `web.postman.co` and sign in.
- Because browsers enforce CORS and can't reach `localhost` freely, the web app needs an **agent** to send requests:

| Agent | What it does | When to use |
|---|---|---|
| **Cloud Agent** | Requests go via Postman's cloud servers | Public APIs only; can't reach `localhost` or private networks |
| **Desktop Agent** | A small local app that sends requests from your machine | Calling `localhost`, VPN/intranet APIs from the web app |
| **Browser Agent** | Sends from the browser itself | Limited; subject to CORS |
| **Auto-select** | Postman picks the best | Default |

Agent selection is at the bottom-right of the web app.

### Lightweight API Client (no sign-in)
If you open the desktop app without signing in, you get a **lightweight API client**: you can send requests (HTTP, GraphQL, gRPC, WebSocket…), but you can't save collections to the cloud, use environments the same way, run collections, mocks, monitors etc. (It replaced the old **Scratch Pad** offline mode.) In v12, local/Git-native workflows make offline work much more capable.

### VS Code extension
Postman has an official **VS Code extension** (send requests, collections, environments inside the editor). Useful for developers who don't want to leave the IDE.

### Postman CLI & Newman
Command-line tools to run collections in CI. Covered in Chapter 11.

---

## 2.5 Signing in, accounts and teams

- A **user account** belongs to a **team** (organisation). Companies usually enforce **SSO** (SAML/OIDC: Okta, Azure AD/Entra ID, Google) on Enterprise.
- Your data (collections, environments' shared values, etc.) **syncs to Postman cloud** in normal cloud workspaces. That's why companies care about what goes into shared values (never real secrets — use Vault or local values).
- **Local values** of variables are stored **only on your machine** and are not synced to teammates.

---

## 2.6 The Postman Interface — A Guided Tour

(Labels are from v11/v12 desktop. Positions can move slightly between versions.)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ HEADER: Home | Workspaces ▾ | API Network | Search (Ctrl+K) | ⚙ | 🔔 | Avatar│
├──────────┬──────────────────────────────────────────────────────────────────┤
│ SIDEBAR  │  TABS:  [GET Get users] [POST Create user] [+]      Env: [Dev ▾] │
│          │ ┌──────────────────────────────────────────────────────────────┐ │
│ Collections│ │ GET ▾ | {{baseUrl}}/users?page=1                  [Send ▾] │ │
│ Environments│ ├──────────────────────────────────────────────────────────────┤ │
│ History  │ │ Params | Authorization | Headers (8) | Body | Scripts | Settings│ │
│ APIs/Specs│ │ ...request editor...                                          │ │
│ Mock servers│ ├──────────────────────────────────────────────────────────────┤ │
│ Monitors │ │ RESPONSE: Body | Cookies | Headers | Test Results              │ │
│ Flows    │ │   Status: 200 OK   Time: 120 ms   Size: 1.2 KB   [Save Response]│ │
│          │ │   Pretty | Raw | Preview | Visualize     JSON ▾                │ │
│          │ └──────────────────────────────────────────────────────────────┘ │
├──────────┴──────────────────────────────────────────────────────────────────┤
│ FOOTER: Online | Find & replace | Console | Postbot/Agent | Runner | Cookies │
│         Vault | Trash | Capture (Proxy/Interceptor) | Bootcamp               │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Header bar
- **Home** — recent workspaces and activity.
- **Workspaces** — switch/create workspaces.
- **API Network** — explore public APIs (Stripe, Twilio, Salesforce, etc. publish official collections).
- **Search** — search across your team's collections, requests, workspaces.
- **Settings (gear)** — app settings (General, Themes, Shortcuts, Data, Add-ons, Certificates, Proxy, Update, About).
- **Notifications**, **Invite**, **Upgrade**, profile.

### Sidebar (left)
Items you can pin/hide via "Configure sidebar":
- **Collections** — your saved requests.
- **Environments** — sets of variables (Dev/QA/Prod).
- **History** — every request you've sent (great for "what did I send yesterday?").
- **APIs / Specs (Spec Hub)** — API definitions.
- **Mock servers**, **Monitors**, **Flows**, **Insights** (depending on version and plan).

### Workbench (centre)
- **Tabs** — multiple open requests. Unsaved changes show a dot. Tabs can be pinned.
- **Environment selector** (top right) — choose which environment's variables are active. **"No environment"** is a frequent cause of `{{baseUrl}}` not resolving.
- **Eye icon / variables quick look** — view and edit current variable values (in newer versions there's a variables pane on the right).

### Request builder tabs

| Tab | Purpose |
|---|---|
| **Params** | Query params and path variables in a table (auto-syncs with URL) |
| **Authorization** | Auth type & credentials (or "Inherit auth from parent") |
| **Headers** | Request headers; toggle to see auto-generated hidden headers |
| **Body** | none / form-data / x-www-form-urlencoded / raw / binary / GraphQL |
| **Scripts** | **Pre-request** and **Post-response** JavaScript (older UI: separate "Pre-request Script" and "Tests" tabs) |
| **Settings** | Per-request settings: SSL verification, follow redirects, follow original HTTP method, follow Authorization header on redirect, remove referer on redirect, strict HTTP parser, encode URL automatically, disable cookie jar, max redirects, HTTP version, TLS protocols/cipher suites, server certificate verification |

Right side panel (newer UI): **Documentation**, **Comments**, **Code snippet** (`</>`), **Request info**, **Related collections**, **Variables**.

### Response pane
- **Status** (e.g. `200 OK`), **Time** (hover = timing breakdown), **Size** (hover = headers vs body size), and network info (IP addresses, TLS details on hover).
- **Body** views:
  - **Pretty** — formatted & syntax-highlighted (choose JSON/XML/HTML/Text/Auto).
  - **Raw** — exact text.
  - **Preview** — renders HTML (e.g. an error page) in a sandboxed iframe.
  - **Visualize** — custom charts/tables built with `pm.visualizer` (Chapter 7).
- **Cookies** — cookies set by this response.
- **Headers** — response headers.
- **Test Results** — pass/fail of `pm.test` assertions.
- **Save Response** → **Save as example** (used by mocks & docs) or **Save to a file**.
- **Search** inside the response (Ctrl+F), **filter** with JSONPath in newer versions, **copy** response.

### Footer
- **Console** — the debugger: every request/response with raw headers, body, scripts `console.log` output, errors. **Your best friend.** Shortcut: `Ctrl+Alt+C` (Windows/Linux) / `Cmd+Option+C` (macOS).
- **Runner** — Collection Runner.
- **Cookies** — cookie manager.
- **Capture requests** — Proxy/Interceptor.
- **Vault** — secrets.
- **Trash** — recently deleted collections (restorable for a plan-dependent period).
- **Postbot / Agent Mode** — AI assistant.

---

## 2.7 Workspaces

> 🧒 A **workspace** is a **room**. Your personal bedroom (Personal workspace), a classroom shared with classmates (Team workspace), a playground open to the whole world (Public workspace), and a meeting room where you invite a partner company (Partner workspace).

| Workspace type | Who can see | Typical use |
|---|---|---|
| **Personal** | Only you | Experiments, learning |
| **Private** | You + people you invite (paid plans) | Restricted team work |
| **Team** | Members of your Postman team (organisation) | Default for company projects |
| **Partner** | Your team + invited external partners (Enterprise) | Sharing APIs with vendors/customers |
| **Public** | Everyone on the internet | Public API onboarding, community |

### Workspace contents
Collections, environments, API specs, mock servers, monitors, flows, and (in v12) a linked Git repository for Native Git workspaces.

### Workspace roles (common)

| Role | Can do |
|---|---|
| **Admin** | Manage workspace settings, members, roles; delete workspace |
| **Editor** | Create/edit/delete elements |
| **Viewer** | View and run; can fork; cannot edit originals |

Element-level roles exist too (e.g. a collection **Editor** vs **Viewer**). Team-level roles (Enterprise/Team) include Super Admin, Admin, Billing, Developer, Community Manager, Partner Manager etc. depending on plan.

> 🏢 **Company practice:** Create **one team workspace per product/domain** (e.g. "Payments – API", "Orders – API"), not one per person. Give developers Editor, external stakeholders Viewer. Never put production secrets as shared values in a team workspace.

---

## 2.8 Settings you should configure on day 1

Settings → **General**:

| Setting | Recommendation | Why |
|---|---|---|
| **SSL certificate verification** | ON (turn OFF only for local self-signed dev servers, or better, add the CA cert) | Security |
| **Request timeout in ms** | `0` = infinite (default). Set e.g. `30000` to fail fast | Hanging requests |
| **Max response size in MB** | Default 50; `0` = no limit | Big downloads |
| **Automatically follow redirects** | ON by default; turn OFF to debug redirects | |
| **Send no-cache header** | ON | Avoid cached responses |
| **Send Postman Token header** | ON (default). Some strict servers reject unknown headers — turn off then | |
| **Trim keys and values in request body** | Optional | Avoid trailing space bugs |
| **Use next generation URL processing** | Default ON in newer versions | |
| **Working directory** | Set a folder; files for form-data/binary are read from here (important for Newman portability) | |
| **Allow reading files outside working directory** | OFF for safety | |
| **Language detection**, **Default headers**, editor font, indentation | Personal preference | |

Settings → **Proxy**: system proxy vs custom proxy (corporate networks), proxy auth, bypass list.

Settings → **Certificates**: CA certificates (PEM) and client certificates (mTLS).

Settings → **Data**: export all your data (backup), import.

Settings → **Themes**: Light/Dark.

Settings → **Shortcuts**: view/disable keyboard shortcuts.

---

## 2.9 Keyboard shortcuts (most useful)

| Action | Windows/Linux | macOS |
|---|---|---|
| Send request | `Ctrl + Enter` | `Cmd + Enter` |
| Send and download | `Ctrl + Alt + Enter` | `Cmd + Option + Enter` |
| Save request | `Ctrl + S` | `Cmd + S` |
| Save as | `Ctrl + Shift + S` | `Cmd + Shift + S` |
| New tab | `Ctrl + T` | `Cmd + T` |
| Close tab | `Ctrl + W` | `Cmd + W` |
| Force close tab | `Ctrl + Alt + W` | `Cmd + Option + W` |
| Next / previous tab | `Ctrl + Tab` / `Ctrl + Shift + Tab` | `Cmd + Shift + ]` / `[` |
| Search | `Ctrl + K` | `Cmd + K` |
| Open Console | `Ctrl + Alt + C` | `Cmd + Option + C` |
| Toggle sidebar | `Ctrl + \` | `Cmd + \` |
| Import | `Ctrl + O` | `Cmd + O` |
| Settings | `Ctrl + ,` | `Cmd + ,` |
| Focus URL bar | `Ctrl + L` | `Cmd + L` |
| Zoom in/out/reset | `Ctrl + +` / `Ctrl + -` / `Ctrl + 0` | `Cmd + +` / `-` / `0` |
| Find (in editor/response) | `Ctrl + F` | `Cmd + F` |
| Shortcuts list | `Ctrl + /` | `Cmd + /` |

(Check **Settings → Shortcuts** for your exact version.)

---

## 2.10 Your First Request — Step by Step

We'll use free practice APIs:
- **JSONPlaceholder** — `https://jsonplaceholder.typicode.com` (fake posts/users/todos; writes are faked and not persisted).
- **httpbin** — `https://httpbin.org` (echoes what you send — perfect for learning headers, auth, status codes).
- **Restful-Booker** — `https://restful-booker.herokuapp.com` (CRUD with token auth; built for testers).
- **Swagger Petstore** — `https://petstore.swagger.io/v2`.
- **Postman Echo** — `https://postman-echo.com` (Postman's own echo service).

> Note: `reqres.in` was very popular in tutorials; since 2025 it requires an `x-api-key` header (a free key is shown on their site). If old tutorials fail with 401, that's why.

### Step 1 — GET
1. Click **New → HTTP** (or `+` tab).
2. Method: **GET**. URL: `https://jsonplaceholder.typicode.com/users/1`
3. Click **Send**.
4. Response: `200 OK`, JSON with the user.

### Step 2 — Query params
URL: `https://jsonplaceholder.typicode.com/posts?userId=1`
Look at the **Params** tab — Postman auto-filled `userId = 1`. Untick the checkbox to temporarily disable a param without deleting it.

### Step 3 — Path variables
URL: `https://jsonplaceholder.typicode.com/posts/:postId`
Params tab shows a **Path Variables** table → set `postId = 5`. Postman sends `/posts/5`.

### Step 4 — POST with JSON
1. Method **POST**, URL `https://jsonplaceholder.typicode.com/posts`
2. Body → **raw** → dropdown **JSON**:
```json
{
  "title": "Learning Postman",
  "body": "This is fun",
  "userId": 1
}
```
3. Send → `201 Created`, response includes `"id": 101`.

### Step 5 — See what you actually sent
`https://httpbin.org/anything` echoes back your method, headers, args, and body. Send any request there to see exactly what Postman transmitted. Or open the **Console**.

### Step 6 — Save it
`Ctrl+S` → name "Create post" → create a **collection** "JSONPlaceholder Practice" → Save.

### Step 7 — Generate code
Click `</>` (Code) → choose cURL, Python `requests`, JavaScript `fetch`, Java OkHttp, C# `HttpClient`/RestSharp, Go, PHP, Ruby, Swift, etc. Developers use this to turn a working Postman request into application code.

### Step 8 — Import from cURL
**Import** (or just paste into the URL bar) a cURL command:
```bash
curl -X POST https://httpbin.org/post -H "Content-Type: application/json" -d '{"a":1}'
```
Postman converts it into a full request. Huge time-saver when a developer sends you a cURL from browser DevTools ("Copy as cURL").

---

## 2.11 What you can import into Postman

| Format | Notes |
|---|---|
| Postman Collection v1, v2.0, v2.1 (JSON); Collection v3 (YAML, v12 Native Git) | v2.1 is the most common export |
| Postman Environment / Globals / data dump | |
| **cURL** | paste or file |
| **OpenAPI** 2.0 (Swagger), 3.0, 3.1 (JSON/YAML) | Generates a collection, optionally linked to a spec |
| **RAML**, **WSDL** (SOAP), **GraphQL schema**, **AsyncAPI** | Support varies by version |
| **HAR** (HTTP Archive from browser DevTools) | Convert a browser session into requests |
| **Insomnia**, **Thunder Client**? | Insomnia export supported; others via OpenAPI/HAR |
| **Code from GitHub/GitLab/Bitbucket/Azure repos, API gateways** (AWS API Gateway, Azure APIM, Apigee) | Integrations (plan-dependent) |
| **A folder / zip** | Bulk import |
| **Link (URL)** | Import from a URL to a raw file |

---

## 2.12 History, Trash, and recovering lost work

- **History** (sidebar) — every sent request, grouped by date; click to reopen; save into collection. Can be cleared. History syncs if enabled.
- **Trash** — deleted collections can be restored for a limited time (longer on paid plans).
- **Collection changelog / version history** — on team plans, view who changed what and **restore** a collection to an older state.
- **Forks** — your fork is a safe copy; experiment there, then **pull request** to merge (Chapter 14).
- **Export** — regularly export important collections to Git (or use Git integration/Native Git) as a backup and source of truth.

---

## 2.13 Chapter 2 Quick Revision
- Postman = full API platform; desktop app preferred for work (no CORS, localhost access).
- Web app needs an agent (Desktop/Cloud/Browser) to send requests.
- UI: sidebar (collections, envs, history), request tabs (Params, Auth, Headers, Body, Scripts, Settings), response (Pretty/Raw/Preview/Visualize, Headers, Cookies, Test Results), footer (Console, Runner, Cookies, Vault).
- Workspaces: Personal, Private, Team, Partner, Public; roles Admin/Editor/Viewer.
- March 2026: Free (1 user), Solo, Team, Enterprise.
- v11 renamed "Tests" → "Post-response"; variable "initial/current" → "shared/local"; v12 adds Native Git with YAML collections.

➡️ Next: **Chapter 3 — Building and Sending Requests in Depth**.
