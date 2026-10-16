# Chapter 5 — Variables and Environments (The Heart of Real-World Postman)

> 🧒 A **variable** is a **labelled jar**. You write a name on the jar (`baseUrl`) and put something inside (`https://dev.shop.com`). Whenever you say "use the baseUrl jar", Postman opens the jar and uses what's inside. Change what's inside the jar once → every request using it changes. An **environment** is a **shelf of jars** — one shelf for Dev, one for QA, one for Prod. Switch the shelf, and all your requests now point to a different world.

---

## 5.1 Why variables matter

Without variables:
```
GET https://dev-api.shop.com/v1/orders/98231
Authorization: Bearer eyJhbGciOiJIUzI1NiIs...(copied manually)
```
→ To test on QA you edit 200 requests by hand. Tokens expire → paste again. Disaster.

With variables:
```
GET {{baseUrl}}/v1/orders/{{orderId}}
Authorization: Bearer {{accessToken}}
```
→ Switch environment Dev → QA. Token is fetched by a script. `orderId` is saved automatically from the "Create order" response. **This is how professional collections work.**

---

## 5.2 Syntax

| Where | Syntax |
|---|---|
| URL, params, headers, body, auth fields | `{{variableName}}` |
| Path variables | `:name` (separate concept, value can be `{{var}}`) |
| Vault secrets | `{{vault:secret-name}}` |
| Dynamic (random) variables | `{{$randomEmail}}`, `{{$guid}}`, `{{$timestamp}}` |
| Scripts | `pm.environment.get("name")`, `pm.variables.get("name")`, etc. (**no curly braces** in scripts!) |
| Resolve a string with variables inside a script | `pm.variables.replaceIn("Hello {{firstName}}")` |

- Names are **case-sensitive**: `{{BaseUrl}}` ≠ `{{baseUrl}}`.
- Unresolved variables show **red** in the UI and are sent **literally** as `{{baseUrl}}` → errors like `getaddrinfo ENOTFOUND {{baseurl}}` or "Invalid URI".
- Variables can contain variables: `baseUrl = https://{{host}}:{{port}}` — Postman resolves nested references (avoid deep nesting; it hurts readability).

---

## 5.3 Variable scopes (the 5 + Vault)

| Scope | Lives in | Visible to | Typical use |
|---|---|---|---|
| **Global** | Workspace globals | All requests in the workspace, regardless of collection/environment | Quick experiments; rarely in clean projects |
| **Collection** | The collection | Requests of that collection, all environments | Constants of that API: `apiVersion`, default paths, test data that doesn't vary by env |
| **Environment** | An environment (Dev/QA/Prod) | Requests in any collection while that environment is **selected** | `baseUrl`, credentials (local values), env-specific IDs |
| **Data** | A CSV/JSON data file during Runner/Newman/CLI | Only during that iteration of a run | Data-driven tests: `email`, `expectedStatus` |
| **Local** | Memory of the current request/run | Current request (or run) only | Temporary values; overriding for one run |
| **Vault** (secrets) | Encrypted **local** storage on your machine (or external vaults) | Your requests where vault access is enabled | Real API keys, passwords, client secrets |

### Precedence (narrowest wins)
When the **same name** exists in multiple scopes, Postman uses the **narrowest** one:

```mermaid
flowchart TB
  Q["Request uses {{baseUrl}}"] --> L{Local variable set?<br/>pm.variables.set}
  L -- yes --> UL[Use LOCAL]
  L -- no --> D{Data file column?}
  D -- yes --> UD[Use DATA]
  D -- no --> E{Active environment has it?}
  E -- yes --> UE[Use ENVIRONMENT]
  E -- no --> C{Collection variable?}
  C -- yes --> UC[Use COLLECTION]
  C -- no --> G{Global?}
  G -- yes --> UG[Use GLOBAL]
  G -- no --> X["Unresolved: sent literally as {{baseUrl}}<br/>e.g. ENOTFOUND {{baseurl}}"]
```


```
Local  >  Data  >  Environment  >  Collection  >  Global
(highest priority)                          (lowest priority)
```

> 🧒 Think of it like **calling your name in a house**: if someone is in **your room** (local) they answer first; then someone in the **corridor** (data); then the **floor** (environment); then the **building** (collection); then the **whole city** (global).

**Example:**
- Global `baseUrl = https://global.example.com`
- Collection `baseUrl = https://collection.example.com`
- Environment (QA selected) `baseUrl = https://qa.example.com`
- No data or local value.
→ `{{baseUrl}}` = `https://qa.example.com` (environment beats collection and global).

Now in the pre-request script: `pm.variables.set("baseUrl", "http://localhost:8080");`
→ `{{baseUrl}}` = `http://localhost:8080` for this request (local beats all).

> 🎯 **Interview trap:** "If I set an environment variable in a script but the value doesn't change in my request, why?" → Because a **data** or **local** variable with the same name has higher precedence, or the request already resolved before the set (e.g. you set it in a post-response script of the same request), or a **different environment** is selected.

---

## 5.4 Values: Shared vs Local (formerly Initial vs Current)

This changed in recent Postman versions, so learn both models.

### Older model (v10 and earlier v11; still in the VS Code extension and many companies)

| Column | Synced to Postman cloud & shared with team? | Used when sending? |
|---|---|---|
| **Initial value** | ✅ Yes | Only if current value is empty (it gets copied into current) |
| **Current value** | ❌ No — stays on your machine | ✅ Yes, this is what requests use |

- Scripts (`pm.environment.set`) change the **current** value.
- "**Persist**" / "Persist all" copied current → initial (shares it).
- "**Reset**" / "Reset all" copied initial → current.
- Exports include initial values (and optionally current values for environments).

### Newer model (later v11 and v12 docs)
- A variable has a single **value** that is **local by default** (the replacement for the old *current* value).
- You may choose to **share** the value with teammates — that becomes the **shared value** (previously *initial* value), based on your local value at the time of sharing.
- Postman no longer supports maintaining multiple independent values for collection, environment and global variables in the UI the way the old two-column model did.
- Persisting/sharing needs **Editor** access.

### The golden rule (both models)
> 🔐 **Never put real secrets in the shared/initial value.** Shared values sync to Postman's cloud and are visible to everyone with access (and appear in exports). Put secrets in **local/current values** or, better, in **Postman Vault**, or inject them at run time in CI (`--env-var`).

---

## 5.5 Variable types: default vs secret

| Type | Behaviour |
|---|---|
| **default** (earlier called "any") | Shown in plain text |
| **secret** | Value masked (`••••`) in the UI; still a normal variable, still sent; still visible to anyone who unmasks or reads via script; **not** encryption |

`secret` type protects against **shoulder-surfing and screenshots** — not against teammates with access. For real secrecy use **Vault**.

---

## 5.6 Environments in depth

### Create
Sidebar → Environments → `+` → name: `Orders - DEV`.

| Variable | Type | Shared value | Local value |
|---|---|---|---|
| baseUrl | default | `https://dev-api.shop.com` | `https://dev-api.shop.com` |
| clientId | default | `orders-web` | `orders-web` |
| clientSecret | secret | *(empty!)* | `s3cr3t...` (or `{{vault:orders-client-secret}}`) |
| accessToken | secret | *(empty)* | *(set by script)* |

Create `Orders - QA`, `Orders - STAGING`, `Orders - PROD` with **the same variable names, different values**.

### Select
Top-right dropdown. **Only one environment active at a time** (plus globals). Forgetting to select is the #1 beginner bug.

### Quick look
Eye icon / variables pane: see active environment, globals, and edit inline.

### Environment templates
Commit `orders.dev.template.postman_environment.json` with **empty secrets** to Git. In CI, inject secrets with `--env-var "clientSecret=$CLIENT_SECRET"`.

### Protecting production
- Use a **separate PROD environment** with restricted access (only certain people can view/edit; on Enterprise use roles).
- Color/name it clearly: `🔴 PROD – Orders`.
- Add a **collection pre-request guard** that blocks destructive requests in prod:

```javascript
// Collection-level pre-request script
const env = pm.environment.name || "";
const method = pm.request.method;
if (/prod/i.test(env) && ["POST", "PUT", "PATCH", "DELETE"].includes(method)
    && pm.environment.get("allowProdWrites") !== "true") {
    throw new Error(`Blocked ${method} on ${env}. Set allowProdWrites=true locally if you REALLY mean it.`);
}
```
(In the Postman app, an error thrown in a pre-request script shows "There was an error in evaluating the Pre-request Script" and the request is not sent. **Newman is different (verified with Newman 6.2.3): it reports the error *and still sends the request*.** So a `throw`-based guard does not protect you in CI. For a clean, explicit skip that works in every runner, use `pm.execution.skipRequest()` in the guard instead of `throw`, and log a warning with `console.warn`.)

---

## 5.7 Collection variables vs environment variables (common interview question)

| | Collection variable | Environment variable |
|---|---|---|
| Tied to | One collection | Not tied to a collection; tied to selected environment |
| Changes per environment? | No | Yes — that's the point |
| Travels with collection export? | ✅ Yes (inside the collection JSON) | ❌ Separate file |
| Best for | Constants: `apiVersion`, resource paths, default page size, schema objects | `baseUrl`, credentials, tokens, env-specific data |

**Rule of thumb:** *"Does it change between Dev/QA/Prod?"* → environment. *"Is it the same everywhere for this API?"* → collection.

---

## 5.8 Global variables — when (not) to use
- Visible in **all collections** of the workspace → name collisions, hidden dependencies, "works on my machine".
- Use only for truly cross-collection values (e.g. your personal `myTestEmail`) or quick experiments.
- **In company projects: avoid globals**; prefer collection + environment.

---

## 5.9 Data variables (data-driven testing preview)

Data file `users.csv`:
```csv
email,password,expectedStatus
valid@x.com,Valid@123,200
wrong@x.com,bad,401
,Valid@123,400
```
In request body: `{"email":"{{email}}","password":"{{password}}"}`.
In test: `pm.response.to.have.status(Number(pm.iterationData.get("expectedStatus")));`
Runner/Newman runs one **iteration per row**. Data file values need care with types: in Newman 6 (verified), CSV values that look like numbers are converted to numbers (`200` → `200`, `007` → `7`, `1e3` → `1000`), while `true`/`false` stay strings. Normalise with `Number(...)` / `String(...)`, and quote-protect codes with leading zeros (ZIP codes, phone numbers) or use a JSON data file. Full details in Chapter 10.

---

## 5.10 Local variables
```javascript
pm.variables.set("tempId", 123);   // local — gone after the request/run
pm.variables.get("tempId");        // resolves using precedence (local first)
```
Use when you need to **override** a value for a single request without touching shared state, or to pass data between pre-request script and request.

---

## 5.11 Postman Vault (secrets)

> 🧒 The Vault is a **locked diary**. Only you (on your computer) have the key. Your friends can see that you have a diary, but not what's written inside.

- Vault secrets are **stored encrypted locally** on your machine and are **not synced** to the Postman cloud.
- Reference in requests: `{{vault:secret-name}}` (e.g. Authorization → Bearer → `{{vault:github-token}}`).
- Access in scripts (requires enabling vault access for scripts in Vault settings and granting access to the collection/workspace):
```javascript
// pm.vault methods are asynchronous — use await
const apiKey = await pm.vault.get("payments-api-key");
pm.request.headers.upsert({ key: "X-API-Key", value: apiKey });

await pm.vault.set("last-rotated", new Date().toISOString());
await pm.vault.unset("old-key");
```
- **Integrations** (Enterprise): link vault secrets to external secret managers such as **Azure Key Vault, HashiCorp Vault, AWS Secrets Manager**, and password managers (support list varies by version) — so values come from the company's official secret store.
- Limitations to remember: `pm.vault` methods are **not supported** in scheduled collection runs, monitors, the Postman CLI or Newman — in CI, inject secrets as environment variables instead.
- Vault key: you can store/rotate it; if you lose it you may need to reset the vault (secrets lost).

### Secrets strategy for a company (best practice)

| Where you run | Where secrets come from |
|---|---|
| Your laptop (manual testing) | Postman Vault (linked to company secret manager if available) or local values |
| CI/CD (Newman/Postman CLI) | CI secret store (GitHub Actions secrets, Jenkins credentials, Azure Key Vault) → `--env-var` |
| Monitors | Environment local/shared values used by monitor (limited options; use dedicated low-privilege monitor credentials) |
| Shared collection | **Nothing secret** in shared values, ever |

Also: enable **Postman's secret scanner** (team setting) which detects exposed tokens in public/team workspaces and alerts/auto-masks.

---

## 5.12 Dynamic variables (built-in random data)

Postman provides **dynamic variables** (powered by the faker.js library). They generate a **new value every time** they're used.

> 🧒 Like a **magic dice**: every roll gives a new number.

### Common

| Variable | Example output |
|---|---|
| `{{$guid}}` | `611c2e81-2ccb-42d8-9ddc-2d0bfa65c1b4` |
| `{{$randomUUID}}` | `6929bb52-3ab2-448a-9796-d6480ecad36b` |
| `{{$timestamp}}` | `1767225600` (Unix seconds) |
| `{{$isoTimestamp}}` | `2026-01-01T00:00:00.000Z` |
| `{{$randomInt}}` | integer 0–1000 |
| `{{$randomAlphaNumeric}}` | single char, e.g. `6` |
| `{{$randomBoolean}}` | `true` |
| `{{$randomColor}}`, `{{$randomHexColor}}` | `teal`, `#47594a` |
| `{{$randomAbbreviation}}` | `SQL` |

### Internet / network
`{{$randomIP}}`, `{{$randomIPV6}}`, `{{$randomMACAddress}}`, `{{$randomPassword}}` (15-char alphanumeric), `{{$randomLocale}}`, `{{$randomUserAgent}}`, `{{$randomProtocol}}`, `{{$randomSemver}}`, `{{$randomUrl}}`, `{{$randomDomainName}}`, `{{$randomDomainSuffix}}`, `{{$randomDomainWord}}`, `{{$randomEmail}}`, `{{$randomExampleEmail}}` (uses example.com etc. — safe for tests), `{{$randomUserName}}`.

### Names & people
`{{$randomFirstName}}`, `{{$randomLastName}}`, `{{$randomFullName}}`, `{{$randomNamePrefix}}`, `{{$randomNameSuffix}}`, `{{$randomJobTitle}}`, `{{$randomJobArea}}`, `{{$randomJobDescriptor}}`, `{{$randomJobType}}`.

### Phone, address, location
`{{$randomPhoneNumber}}`, `{{$randomPhoneNumberExt}}`, `{{$randomCity}}`, `{{$randomStreetName}}`, `{{$randomStreetAddress}}`, `{{$randomCountry}}`, `{{$randomCountryCode}}`, `{{$randomLatitude}}`, `{{$randomLongitude}}`.

### Finance & business
`{{$randomPrice}}`, `{{$randomCurrencyCode}}`, `{{$randomCurrencyName}}`, `{{$randomCurrencySymbol}}`, `{{$randomBitcoin}}`, `{{$randomBankAccount}}`, `{{$randomBankAccountName}}`, `{{$randomCreditCardMask}}`, `{{$randomBankAccountBic}}`, `{{$randomBankAccountIban}}`, `{{$randomTransactionType}}`, `{{$randomCompanyName}}`, `{{$randomCompanySuffix}}`, `{{$randomBs}}`, `{{$randomCatchPhrase}}`.

### Dates
`{{$randomDateFuture}}`, `{{$randomDatePast}}`, `{{$randomDateRecent}}`, `{{$randomWeekday}}`, `{{$randomMonth}}`.

### Commerce, text, files, images
`{{$randomProductName}}`, `{{$randomProduct}}`, `{{$randomProductAdjective}}`, `{{$randomProductMaterial}}`, `{{$randomDepartment}}`, `{{$randomLoremWord}}`, `{{$randomLoremWords}}`, `{{$randomLoremSentence}}`, `{{$randomLoremSentences}}`, `{{$randomLoremParagraph}}`, `{{$randomLoremText}}`, `{{$randomLoremSlug}}`, `{{$randomFileName}}`, `{{$randomFileExt}}`, `{{$randomMimeType}}`, `{{$randomImageUrl}}`, `{{$randomAvatarImage}}`, `{{$randomDatabaseColumn}}`, `{{$randomDatabaseType}}`, `{{$randomDatabaseEngine}}`.

(Type `{{$` in Postman to see the full autocomplete list for your version.)

### Using dynamic variables in scripts
```javascript
// Generate once and REUSE (important! each {{$randomEmail}} use generates a new value)
const email = pm.variables.replaceIn("{{$randomExampleEmail}}");
pm.collectionVariables.set("newUserEmail", email);
```
Then body uses `{{newUserEmail}}` and a later test can assert the response email equals the stored value.

> ❌ **Common bug:** Body uses `{{$randomEmail}}` and the test compares `json.email === pm.variables.replaceIn("{{$randomEmail}}")` → always fails, because each call generates a **new** random value. **Generate once, store, reuse.**

### Custom random data without dynamic variables
```javascript
const uuid = require("uuid");
pm.variables.set("orderRef", "ORD-" + Date.now());
pm.variables.set("idem", uuid.v4());
pm.variables.set("qty", Math.floor(Math.random() * 10) + 1);   // 1..10
pm.variables.set("tomorrow", new Date(Date.now() + 86400000).toISOString().slice(0, 10));
```

---

## 5.13 Scripting API for every scope

```javascript
// ===== Environment =====
pm.environment.set("token", "abc");
pm.environment.get("token");
pm.environment.has("token");            // true/false
pm.environment.unset("token");
pm.environment.clear();                  // removes ALL vars in active env (dangerous!)
pm.environment.toObject();               // { key: value, ... }
pm.environment.name;                     // active environment name
pm.environment.replaceIn("{{baseUrl}}/x");

// ===== Collection =====
pm.collectionVariables.set("orderId", 42);
pm.collectionVariables.get("orderId");
pm.collectionVariables.has / unset / clear / toObject / replaceIn

// ===== Global =====
pm.globals.set("x", 1);  pm.globals.get("x"); pm.globals.unset("x"); pm.globals.clear();

// ===== Data (read only) =====
pm.iterationData.get("email");
pm.iterationData.has("email");
pm.iterationData.toObject();

// ===== Local / resolved =====
pm.variables.set("tmp", 1);              // sets LOCAL scope
pm.variables.get("baseUrl");             // resolves with precedence across ALL scopes
pm.variables.has("baseUrl");
pm.variables.toObject();                 // merged view
pm.variables.replaceIn("{{baseUrl}}/users/{{userId}}");
```

### Values are stored as... ?
- You can `set` numbers, booleans, arrays, objects. **When used in `{{ }}` they are converted to strings.**
- Older Postman stored everything as strings; to be safe and portable (Newman versions differ), **store objects with `JSON.stringify` and read with `JSON.parse`**:
```javascript
pm.environment.set("user", JSON.stringify({ id: 7, roles: ["admin"] }));
const user = JSON.parse(pm.environment.get("user"));
```
- Comparing numbers: `pm.environment.get("count") === 5` may fail if stored as `"5"`. Use `Number(...)`.

---

## 5.14 Variables in the Runner, Newman and CI

- In the Runner, changes made by scripts during the run apply to the environment's **local/current values**; whether they remain after the run depends on the Runner's "persist variable values"/"keep variable values" option (labels vary by version).
- **Newman** works on a **copy** of the environment file — changes are **not** written back unless you use `--export-environment out.json` (and `--export-globals`, `--export-collection`).
- CLI overrides:
  - Newman: `--env-var "baseUrl=https://qa.shop.com"`, `--global-var "x=1"`
  - Postman CLI: `--env-var "key=value"`, `--global-var "key=value"`
- **Precedence in CI**: `--env-var` sets the value in the environment scope (so a data file column or a local `pm.variables.set` with the same name still wins).

---

## 5.15 Debugging variables (systematic checklist)

When `{{something}}` isn't what you expect:
1. **Is it red?** Hover → "Unresolved variable". Check spelling & case.
2. **Is the right environment selected?**
3. **Which scope is winning?** Hover over the variable in URL — Postman shows scope and value. Remember precedence.
4. **Local/current value empty?** In new model check local value; in old model current value might be empty while initial has value (or vice versa).
5. **Is a script overwriting it?** Search collection (Ctrl+Shift+F / "Find and replace") for the name.
6. **Order of execution**: variable set in a request's *post-response* script is available only to **later** requests (or later code in the same script), not the current request's URL.
7. **Console**: `console.log(pm.variables.toObject())`, and Console shows the **final resolved URL & headers** actually sent.
8. **Newman**: did you pass `-e env.json`? Is the variable in the exported file's `values` with `"enabled": true`?
9. **Trailing spaces/newlines** in values (copied tokens!) → 401s. Use `.trim()` when setting from scripts.
10. **Disabled variable** (checkbox unticked) → treated as not existing.

---

## 5.16 Naming conventions (company standard)

| Kind | Convention | Examples |
|---|---|---|
| Base URLs | `<service>BaseUrl` or `baseUrl` | `ordersBaseUrl`, `authBaseUrl` |
| Credentials | descriptive, never generic | `ordersClientId`, `ordersClientSecret` |
| Tokens | `<audience>AccessToken`, plus expiry | `accessToken`, `accessTokenExpiresAt` |
| Runtime IDs (set by scripts) | `<resource>Id` | `orderId`, `customerId` |
| Feature flags for tests | `is<Feature>` / `allow<Action>` | `allowProdWrites` |
| Prefix for script-internal vars | `_` | `_retryCount`, `_pageCursor` |

- camelCase consistently. No spaces. Avoid names that clash with dynamic vars (`$...`).
- Document each variable's purpose in the environment/collection description.

---

## 5.17 Chapter 5 Quick Revision
- Scopes: Global, Collection, Environment, Data, Local (+ Vault). Precedence: **Local > Data > Environment > Collection > Global**.
- Old model: Initial (shared) vs Current (local, used). New model: single local value + optional shared value.
- Secret type = masking only; Vault = encrypted local secrets (`{{vault:name}}`, `await pm.vault.get()`), not supported in Newman/CLI/monitors.
- Dynamic variables (`{{$guid}}`, `{{$randomEmail}}`) change each use → generate once with `replaceIn`, store, reuse.
- `pm.variables.set` = local; `pm.variables.get` = resolved with precedence.
- Newman doesn't write back unless `--export-environment`.

➡️ Next: **Chapter 6 — Authorization and Authentication in Postman**.
