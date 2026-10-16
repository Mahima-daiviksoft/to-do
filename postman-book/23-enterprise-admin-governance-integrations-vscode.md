# Chapter 23 — Enterprise Administration, API Governance, Integrations & the VS Code Extension

> 🧒 In a small house, the parents decide everything by talking at dinner. In a **city**, you need **rules on paper**, **ID cards**, **security cameras** and **building inspectors**. Postman Enterprise features are the city's rules.

> ⚠️ Admin features and role names depend on plan (Team vs Enterprise) and version. Check your team's **Team Settings** and the Learning Center "Administration" section.

---

## PART A — Identity & access

### 23.1 Single Sign-On (SSO)
- Enterprise teams can use **SAML 2.0 SSO** with most identity providers: Okta, OneLogin, Duo, Microsoft Entra ID (Azure AD), Google Workspace, Ping and others.
- Setup outline: Team Settings → **Authentication** → add SSO → exchange metadata (ACS URL, Entity ID, IdP certificate) with your IdP → test → (optionally) **enforce SSO** so password logins are disabled.
- Keep at least one **break-glass admin** who can sign in if the IdP is misconfigured.

### 23.2 SCIM provisioning
- **SCIM** lets your IdP **automatically create, update and deactivate** Postman users (and groups) when people join, change teams or leave.
- Benefit: no forgotten accounts after someone leaves (a common audit finding).
- Map IdP groups to Postman **groups**, then grant workspace access to groups instead of individuals.

### 23.3 Domain capture
- Claim your company email domains, so every Postman account created with `@yourcompany.com` is brought into your organisation's team, instead of employees using personal free accounts for company work (a data-leak risk).
- Works well with SCIM and auto-flex billing (seats added automatically as people join).

### 23.4 Roles (typical)
| Level | Roles (names vary by plan/version) | What they control |
|---|---|---|
| **Team** | Admin, Billing, Developer (member), **Community Manager** (manages everything the team made public), Partner Manager (partner workspaces) | Team settings, security, billing, public presence |
| **Workspace** | Admin, Editor, Viewer | Members and content of a workspace |
| **Element** | Editor, Viewer (collections, environments, etc.) | Fine-grained control, e.g. view-only PROD environment |

**Least-privilege recipe:**
- Most engineers: **Editor** on their team's workspaces, **Viewer** elsewhere.
- PROD environments: **Viewer** for most, **Editor** for a few owners. Secrets live in Vault/CI, not in the environment.
- Public workspaces: only Community Managers can publish.

### 23.5 Audit logs
- Track account changes: user management, team management, billing, security settings.
- Available in the UI and through the **Postman API**, so you can feed them into a **SIEM** (Splunk, Sentinel, Datadog…) for alerts such as "workspace made public" or "SSO disabled".

### 23.6 Other security settings (Team Settings)
- Restrict creation of **public workspaces** / public elements.
- **Secret scanner** alerts for exposed tokens.
- **Session/sign-in** policies, allowed authentication methods, custom domains for published docs, publisher profile.
- **Data residency** (EU region) where required by policy.

---

## PART B — API governance (style guides as code)

### 23.7 How Postman governance works
- **Rules** check API definitions (OpenAPI/AsyncAPI) for style and security issues: missing descriptions, wrong naming, no auth scheme, inconsistent error formats.
- Violations show **inline in Spec Hub**, and in CI via `postman api lint` / `postman spec lint`.
- **Custom rules** are written in **Spectral** (Postman supports Spectral v6 rule syntax). A rule targets locations with a **JSON Path Plus** expression (`given`) and tests them with a **function** (`then`).
- Rulesets are applied to workspaces through **governance groups**. In v12 they're managed in a **Ruleset Library** (v11 calls this "Custom Rules").
- Gotchas from the docs: Postman accepts **only the Spectral properties it lists**, you can't create a rule that duplicates an existing one, and you must **turn rules on** after you create or import them.

### 23.8 Example custom rules (tested with Spectral CLI)
```yaml
rules:
  operation-must-have-summary:
    description: Every operation must have a summary.
    message: "{{path}} is missing a summary"
    severity: warn
    given: "$.paths[*][get,post,put,patch,delete]"
    then:
      field: summary
      function: truthy

  paths-kebab-case:
    description: Path segments must be kebab-case.
    severity: error
    given: "$.paths[*]~"
    then:
      function: pattern
      functionOptions:
        match: "^(/[a-z0-9-]+|/\\{[a-zA-Z0-9]+\\})+$"
```
Linting this spec:
```yaml
openapi: 3.0.3
info: { title: Orders API, version: 1.0.0 }
paths:
  /orders/{orderId}:
    get:
      summary: Get an order
      responses: { '200': { description: OK } }
  /orderItems:
    post:
      responses: { '201': { description: Created } }
```
gives (actual output while writing this book, using `npx spectral lint openapi.yaml --ruleset ruleset.yaml`):
```
 8:15    error  paths-kebab-case             Path segments must be kebab-case.               paths./orderItems
 9:10  warning  operation-must-have-summary  #/paths/~1orderItems/post is missing a summary  paths./orderItems.post
✖ 2 problems (1 error, 1 warning, 0 infos, 0 hints)
```
Useful built-in Spectral functions: `truthy`, `falsy`, `defined`, `undefined`, `pattern` (match/notMatch), `casing` (kebab, camel, pascal, snake…), `enumeration`, `length`, `schema`, `alphabetical`, `xor`.

### 23.9 Governance rollout playbook
1. Start with **warnings only** for a sprint (measure, don't block).
2. Agree on a style guide with API owners: naming, versioning, error format, pagination, auth.
3. Encode it as rules; publish the ruleset; apply it via governance groups.
4. Turn critical rules (security schemes, no secrets in examples) into **errors** that fail CI.
5. Track violation counts per API in the API Catalog over time.

---

## PART C — Integrations

| Integration type | Examples | Use |
|---|---|---|
| **Source control** | GitHub, GitLab, Bitbucket, Azure Repos | Spec/collection sync (v10/11 Git integration), Native Git (v12) |
| **CI/CD** | GitHub Actions, Jenkins, GitLab CI, Azure Pipelines, CircleCI, Bitbucket Pipelines | Run collections (Newman / Postman CLI) |
| **Notifications** | Slack, Microsoft Teams, email, webhooks | Monitor failures, collection changes |
| **Incident/observability** | PagerDuty, Opsgenie, Datadog, New Relic, Splunk | Monitor results and alerts, audit logs into SIEM |
| **API gateways** | AWS API Gateway, Azure API Management, Apigee | Import/sync API definitions |
| **Secret managers** (Vault integrations) | Azure Key Vault, HashiCorp Vault, AWS Secrets Manager, password managers | Reference company secrets from Postman Vault |
| **Issue tracking** | Jira (link issues in descriptions/comments) | Traceability |

Find them under a workspace or team's **Integrations** area (the location varies by version). Availability depends on plan.

> 🏢 **Best practice:** send monitor alerts to the *owning team's* channel, not a shared #alerts graveyard, and include the environment name and request in the message.

---

## PART D — The Postman VS Code extension

### 23.10 What it does
- Send HTTP (and other protocol) requests from inside the editor.
- Work with **collections, environments and workspaces** (synced with your Postman account); share and manage roles.
- **Import `.env` files** from your project as environment variables and keep them in sync.
- Run collections (Collection Runner) in versions that include it; check your version's feature list.
- Supported editors: Visual Studio Code, VS Code Insiders, VSCodium, and VS Code-based editors such as Cursor, Windsurf, Kiro and Antigravity.
- Note: the extension's variable model may still show **initial/current values**, even where the desktop app moved to shared/local values.

### 23.11 When developers prefer it
- Quick checks while coding, without context switching.
- Combined with **Native Git** (collections in the repo) and AI coding tools (via the Postman MCP server), API work stays next to the code.

---

## 23.12 Interview questions (admin & governance)

**Q. How do you prevent ex-employees from keeping access to Postman data?** SSO enforcement plus SCIM deprovisioning from the IdP, domain capture, audit logs, and rotating any shared credentials they knew.

**Q. How would you enforce API design standards across 50 teams?** Governance rules (Spectral) in a shared ruleset, applied via governance groups. Lint in Spec Hub and in CI (`postman spec lint` / `api lint`) as a blocking check for critical rules, with dashboards for trends.

**Q. Someone made a workspace public by mistake. How do you prevent and detect it?** Restrict public workspace creation to Community Managers, alert on audit-log events in the SIEM, use the secret scanner, and review publishing in onboarding training.

➡️ Next: **Chapter 24 — Contract Testing with Pact (and how it fits with Postman)**.
