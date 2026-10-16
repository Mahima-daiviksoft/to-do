# Chapter 4 — Collections and Folders

> 🧒 A **collection** is a **school bag**. **Folders** are the pockets inside. **Requests** are your books. You can give the whole bag to a friend (share/export), and anything you put on the bag itself (like your name tag = auth, or a lunch box = variables) is available to everything inside.

---

## 4.1 What is a collection?

A **collection** is a group of saved requests (plus folders, scripts, variables, auth, documentation and examples) that can be **run together, shared, versioned, documented, mocked and monitored**.

Collections are the **unit of everything** in Postman:
- **Runner / Newman / Postman CLI** run collections (or folders).
- **Mock servers** are created from collections (their examples).
- **Monitors** run collections on schedule.
- **Documentation** is generated per collection.
- **Forks/pull requests** happen on collections.

---

## 4.2 Creating and organising

- **New → Collection**, or `+` in sidebar, or "Save" a request into a new collection.
- Inside: **Add request**, **Add folder** (folders can be nested to any depth).
- **Drag & drop** to reorder — **order matters** for the Runner (default sequential top-to-bottom execution).
- **Duplicate** a request/folder/collection; **rename**; **delete** (Trash).
- **Star/favourite** collections; **watch** to get notifications on changes.

### Recommended structure for a big company project
```
📦 Orders Service API  (collection)
 ├── 📁 00 - Setup                       (auth, create test data)
 │    ├── POST Get access token
 │    └── POST Create test customer
 ├── 📁 01 - Orders
 │    ├── 📁 Positive
 │    │    ├── POST Create order
 │    │    ├── GET  Get order by id
 │    │    ├── GET  List orders (pagination)
 │    │    ├── PATCH Update order status
 │    │    └── DELETE Cancel order
 │    └── 📁 Negative
 │         ├── POST Create order - missing items (400)
 │         ├── POST Create order - no token (401)
 │         ├── GET  Order of another user (403 / BOLA)
 │         └── GET  Non-existent order (404)
 ├── 📁 02 - Payments
 ├── 📁 03 - E2E Flows
 │    └── 📁 Checkout happy path
 └── 📁 99 - Teardown                    (delete test data)
```

Alternative organisation patterns:
| Pattern | When |
|---|---|
| **By resource** (Users, Orders, Products) | API reference / dev collections |
| **By test type** (Smoke, Regression, Negative, E2E) | QA automation collections |
| **By user journey** (Signup flow, Checkout flow) | E2E / business flows |
| **By microservice** — one collection per service | Microservice orgs; matches team ownership |
| **Hybrid**: one *reference* collection (generated from OpenAPI) + separate *test* collections | Large orgs (very common & recommended) |

---

## 4.3 Collection-level settings (inherited by everything inside)

Click the collection → tabs:

| Tab | What it does |
|---|---|
| **Overview** | Description (Markdown), stats, owner, links |
| **Authorization** | Default auth for all requests that use "Inherit auth from parent" |
| **Scripts** | Collection-level **Pre-request** and **Post-response** scripts — run for **every request** in the collection |
| **Variables** | Collection variables |
| **Runs** | Past runs |
| **Settings** | Collection-level settings (in some versions) |

### Inheritance — the most important concept here
```
Collection  (auth: Bearer {{token}}, pre-request: log, vars: baseUrl)
   └── Folder (auth: inherit,   pre-request: set header)
         └── Request (auth: inherit,   pre-request: build body)
```
- **Auth**: a request set to "Inherit auth from parent" walks **up**: request → folder → parent folder → collection. The **first non-inherit** auth found wins. (If the collection is "No Auth", the request gets no auth.)
- **Scripts**: they **don't override** — they **all run**, in order (see Chapter 7):
  - Pre-request: **Collection → Folder(s) → Request**
  - Post-response: **Collection → Folder(s) → Request**
- **Variables**: collection variables are visible to every request in the collection.

---

## 4.4 Documentation in collections

- Every collection, folder and request has a **description** field (Markdown supported: headings, tables, code blocks, links, images).
- **Examples** attached to requests show up in docs.
- Click **View documentation** → auto-generated docs with code snippets in chosen language.
- **Publish** docs (public) with custom domain/branding (plan-dependent), or keep private for your team.

> 🏢 **Company practice:** Description template for each request:
> ```markdown
> **Purpose:** Creates an order for the authenticated customer.
> **Auth:** Bearer token (scope `orders:write`)
> **Preconditions:** customerId exists (see Setup folder)
> **Sets variables:** orderId
> **Owner:** @payments-team | **Jira:** PAY-123
> ```

---

## 4.5 Examples (Saved responses) in depth

- An example = **request snapshot + response** (status, headers, body).
- Create: Send → **Save Response → Save as example**, or "Add example" from the request's `...` menu and type it manually (useful before the backend exists — design-first).
- Multiple examples per request: `200 OK`, `404 Not Found`, `400 Validation error`.
- Examples power **mock servers** (Chapter 12): the mock picks the best-matching example.
- Examples can contain variables.

---

## 4.6 Sharing collections

| Method | How | Notes |
|---|---|---|
| **Move/create in a team workspace** | Everyone in workspace sees it | Recommended |
| **Share link** | "Share" → copy link / invite by email | Respects roles |
| **Fork** | Copy linked to parent; can pull changes and open pull requests | Safe experimentation |
| **Run in Postman button** | Embed on website/README | Public APIs |
| **Export JSON** | `...` → Export → v2.1 | Git, backup, Newman |
| **Postman API** | `GET https://api.getpostman.com/collections/{uid}` with `X-API-Key` | Always-latest in CI |
| **Native Git (v12)** | Collections live as YAML files in your repo | Code review via Git PRs |

---

## 4.7 Collection file formats

### Collection v2.1 (JSON) — the classic export
```json
{
  "info": {
    "_postman_id": "1b2c...",
    "name": "Orders Service API",
    "schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"
  },
  "item": [
    {
      "name": "Orders",
      "item": [
        {
          "name": "Get order by id",
          "event": [
            {
              "listen": "test",
              "script": {
                "type": "text/javascript",
                "exec": [
                  "pm.test('Status is 200', () => pm.response.to.have.status(200));"
                ]
              }
            }
          ],
          "request": {
            "method": "GET",
            "header": [{ "key": "Accept", "value": "application/json" }],
            "url": {
              "raw": "{{baseUrl}}/orders/:orderId",
              "host": ["{{baseUrl}}"],
              "path": ["orders", ":orderId"],
              "variable": [{ "key": "orderId", "value": "{{orderId}}" }]
            }
          },
          "response": []
        }
      ]
    }
  ],
  "auth": {
    "type": "bearer",
    "bearer": [{ "key": "token", "value": "{{accessToken}}", "type": "string" }]
  },
  "event": [
    { "listen": "prerequest", "script": { "type": "text/javascript", "exec": [""] } }
  ],
  "variable": [{ "key": "baseUrl", "value": "https://api.example.com" }]
}
```

Key facts for interviews:
- In JSON, the post-response script is still stored as `"listen": "test"` and pre-request as `"listen": "prerequest"` (historical names).
- `item` is recursive: an item with `item` inside is a **folder**; an item with `request` is a **request**.
- **v2.0 vs v2.1**: the main difference is how `auth` (and some URL fields) are represented — v2.0 uses objects keyed by parameter name; v2.1 uses **arrays of key/value objects**. **Export v2.1** unless a tool needs v2.0.
- `response` array = **examples**.
- `variable` at root = collection variables.

### Collection v3 (YAML) — v12 Native Git
- In Postman v12, Git-native workspaces store collections as **YAML files** (Collection format v3), split into **multiple files** (e.g. one per request) inside a `postman/` folder in your repository, which makes **Git diffs, code reviews and merge conflicts far easier** than one giant JSON file.
- The Postman CLI can **run collections by path** (`postman collection run ./postman/collections/<name>`), and `postman workspace push` syncs local changes to the cloud workspace.
- Caveat from docs: when working Git-native, **local files are the source of truth**; edits made directly in the cloud view can be overwritten by the next `postman workspace push`.
- Some reporters/options may be limited for v3 YAML in early v12 releases (e.g. only `cli` reporter for some request types) — check the CLI docs of your version.

---

## 4.8 Importing / exporting best practices

1. **Export v2.1** for Newman.
2. Remove secrets before exporting (they're only in shared values if someone put them there — check!).
3. Environments export separately (`*.postman_environment.json`) — commit only **templates** without secrets.
4. Keep exported files **pretty-printed** and **sorted** for readable diffs (some teams use a script to normalise and strip `_postman_id`/`id` churn).
5. Prefer **Postman API** or **Native Git** over manual exports to avoid "who has the latest JSON?" problems.

---

## 4.9 Forks, Pull Requests, Merges (collection version control inside Postman)

> 🧒 **Fork** = photocopy the homework so you can scribble safely. **Pull request** = asking the teacher, "Can my changes go into the real homework?" **Merge** = teacher accepts.

1. `...` → **Create a fork** → choose name & workspace (e.g. your personal workspace).
2. Edit the fork freely.
3. **Pull changes** from parent to stay updated.
4. **Create pull request** → reviewers see a **diff** (requests, scripts, examples).
5. Reviewers comment, approve; **Merge** (optionally delete fork after).
6. Parent collection can be **protected**: only certain roles can merge/edit directly (settings depend on plan).

Merge conflicts: if parent changed the same item, Postman shows conflict resolution to pick source vs destination.

---

## 4.10 Collection runs order and control (preview)

- Default order: top to bottom, depth-first through folders.
- Run a **single folder** in Runner or `newman run ... --folder "Orders"`.
- Change order dynamically with `pm.execution.setNextRequest()` (Chapter 9).
- Skip a request with `pm.execution.skipRequest()`.

---

## 4.11 Common collection problems & fixes

| Problem | Cause | Fix |
|---|---|---|
| Request has no auth unexpectedly | Request auth = "No Auth" (not inherit) | Set to "Inherit auth from parent" |
| Collection script running twice-like behaviour / unexpected logs | Same code in collection **and** folder scripts | Keep shared logic at one level |
| Teammate doesn't see my changes | You edited a fork, or local value only, or not saved | Save; merge fork; persist/share values |
| Huge JSON diffs in Git | Exports include ids/order changes | Use Native Git YAML, or normalise exports |
| "Collection not found" in Newman with URL | Using an old/expired share link or wrong API key | Use `https://api.getpostman.com/collections/<uid>?apikey=...` or a file |
| Runner runs requests in weird order | `setNextRequest` left in a script | Search collection for `setNextRequest` |

---

## 4.12 Chapter 4 Quick Revision
- Collections = unit of running, sharing, mocking, monitoring, documenting.
- Inheritance: auth walks up; scripts all run Collection → Folder → Request.
- Export v2.1; JSON uses `listen: "prerequest"` and `listen: "test"`.
- v12 Native Git: YAML (Collection v3) files in repo.
- Fork → PR → merge for safe collaboration.

➡️ Next: **Chapter 5 — Variables and Environments**.
