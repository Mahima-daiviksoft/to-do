# Chapter 11 — Newman, Postman CLI and CI/CD

> 🧒 The Postman app is your **toy car with a remote**. **Newman** and the **Postman CLI** are **the same car driving by itself** on a track (your build server) every time someone changes the code — no human needed to press "Send".

---

## 11.1 Why run collections from the command line?
- **CI/CD**: run API tests automatically on every commit/PR/deploy.
- **Quality gates**: fail the pipeline if tests fail (exit code ≠ 0).
- **Reports**: JUnit XML for Jenkins/GitLab/Azure, HTML for humans.
- **Scheduling & scripting**: cron jobs, Docker, Kubernetes jobs.

Two tools:
| | **Newman** | **Postman CLI** |
|---|---|---|
| Made by | Postman (open source, MIT) | Postman (official, closed source binary) |
| Install | `npm install -g newman` (needs Node.js) | Install script / binary (also available via npm as `postman-cli` in recent releases) |
| Input | Collection/environment **files or URLs** (JSON v2.x) | Collection/environment **IDs** (from Postman cloud, needs login) **or files**; v12 also local YAML (v3) paths |
| Results to Postman cloud | ❌ No | ✅ Yes (run history visible in Postman, API Catalog CI reports) |
| Reporters | cli, json, junit, progress, emojitrain + community (htmlextra, allure, …) | cli, json, junit, html |
| Governance/linting | ❌ | ✅ `postman api lint`, `postman spec lint` |
| Programmatic Node API | ✅ `require('newman')` | ❌ |
| Package Library / Vault | Limited / not supported for Vault | Team packages supported when logged in; Vault methods not supported |
| Best for | Fully offline/open-source pipelines, custom reporters, Node integration | Teams wanting results in Postman, governance, v12 Native Git workflows |

---

## 11.2 Newman — Installation
```bash
node -v            # Newman 6.x requires a modern Node.js LTS (check README for minimum)
npm install -g newman
newman -v
# optional: HTML reporter
npm install -g newman-reporter-htmlextra
```
Project-local (recommended for reproducible CI):
```bash
npm install --save-dev newman newman-reporter-htmlextra
npx newman run ...
```

---

## 11.3 Newman — Running collections
```bash
newman run Orders.postman_collection.json \
  -e QA.postman_environment.json \
  -d data/orders.csv \
  -n 3 \
  --folder "01 - Orders" \
  --delay-request 200 \
  --timeout-request 10000 \
  --env-var "clientSecret=$CLIENT_SECRET" \
  -r cli,junit,htmlextra \
  --reporter-junit-export results/junit.xml \
  --reporter-htmlextra-export results/report.html
```

### Newman options (most important)
| Option | Meaning |
|---|---|
| `run <collection>` | File path **or URL** (e.g. Postman API link) |
| `-e, --environment <path/url>` | Environment file |
| `-g, --globals <path/url>` | Globals file |
| `-d, --iteration-data <path>` | CSV/JSON data file |
| `-n, --iteration-count <n>` | Iterations |
| `--folder <name>` | Run only this folder/request (repeat flag for multiple) |
| `--env-var "k=v"` | Set environment variable (repeatable) |
| `--global-var "k=v"` | Set global variable (repeatable) |
| `--working-dir <path>` | Base dir for relative file paths (form-data files) |
| `--no-insecure-file-read` | Block reading files outside working dir |
| `--export-environment <path>` | Write final environment (with script changes) |
| `--export-globals <path>`, `--export-collection <path>` | Same for globals/collection |
| `--delay-request <ms>` | Delay between requests |
| `--timeout <ms>` | Whole-run timeout |
| `--timeout-request <ms>` | Per-request timeout |
| `--timeout-script <ms>` | Per-script timeout |
| `-k, --insecure` | Disable SSL verification |
| `--ignore-redirects` | Don't follow 3xx |
| `--bail [folder,failure]` | Stop on first error/failure (modifiers: `folder` = stop on invalid folder, `failure` = stop on test failure) |
| `-x, --suppress-exit-code` | Always exit 0 (don't fail pipeline — use carefully) |
| `--color on/off/auto`, `--disable-unicode`, `--verbose` | Output control |
| `-r, --reporters <list>` | `cli,json,junit,progress,emojitrain` + installed ones |
| `--reporter-json-export <path>` | JSON report file |
| `--reporter-junit-export <path>` | JUnit XML |
| `--reporter-cli-no-summary`, `--reporter-cli-no-failures`, `--reporter-cli-no-assertions`, `--reporter-cli-no-success-assertions`, `--reporter-cli-no-console`, `--reporter-cli-silent`, `--reporter-cli-show-timestamps` | CLI reporter tuning |
| `--cookie-jar <path>`, `--export-cookie-jar <path>` | Load/save cookies |
| `--ssl-client-cert`, `--ssl-client-key`, `--ssl-client-passphrase`, `--ssl-client-cert-list`, `--ssl-extra-ca-certs` | Certificates |

### Exit codes
- `0` — all good.
- `1` — test failures, script errors, or run errors.
CI uses this to pass/fail the job.

### Run from Postman API (always latest collection, no exports)
```bash
newman run "https://api.getpostman.com/collections/$COLLECTION_UID?apikey=$POSTMAN_API_KEY" \
  -e "https://api.getpostman.com/environments/$ENV_UID?apikey=$POSTMAN_API_KEY"
```
> ⚠️ The API key appears in the URL → may leak into logs. Mask it in CI, use a service account key with minimal access, rotate regularly. Alternatively download the files with `curl -H "X-API-Key: $KEY"` first, then run locally.

### htmlextra reporter (very popular)
```bash
newman run c.json -r htmlextra \
  --reporter-htmlextra-export ./reports/index.html \
  --reporter-htmlextra-title "Orders API Regression" \
  --reporter-htmlextra-browserTitle "Orders API" \
  --reporter-htmlextra-showOnlyFails \
  --reporter-htmlextra-skipSensitiveData
```
Other options: `--reporter-htmlextra-darkTheme`, `--reporter-htmlextra-hideRequestBody "Login"`, `--reporter-htmlextra-hideResponseBody "Login"`, `--reporter-htmlextra-showEnvironmentData`, `--reporter-htmlextra-skipHeaders "Authorization"`, `--reporter-htmlextra-template custom.hbs`. Also `newman-reporter-allure` for Allure reports.

> 🔐 HTML/JSON reports include requests/responses → can contain **tokens and PII**. Use skip/hide options and restrict report artifact access.

---

## 11.4 Newman as a Node.js library
```javascript
// run-tests.js
const newman = require("newman");

newman.run({
    collection: require("./Orders.postman_collection.json"),
    environment: "./QA.postman_environment.json",
    iterationData: "./data/orders.csv",
    envVar: [{ key: "clientSecret", value: process.env.CLIENT_SECRET }],
    reporters: ["cli", "junit"],
    reporter: { junit: { export: "./results/junit.xml" } },
    timeoutRequest: 10000,
    bail: false
}, (err, summary) => {
    if (err) { console.error(err); process.exit(1); }
    const failures = summary.run.failures.length;
    console.log(`Done. Failures: ${failures}`);
    process.exit(failures ? 1 : 0);
})
.on("request", (err, args) => {
    // args.request, args.response, args.item
    if (args.response && args.response.code >= 500) {
        console.warn(`5xx on ${args.item.name}: ${args.response.code}`);
    }
})
.on("assertion", (err, args) => {
    if (err) console.log(`✗ ${args.assertion} — ${err.message}`);
});
```
Events: `start`, `beforeIteration`, `iteration`, `beforeItem`, `item`, `beforePrerequest`, `prerequest`, `beforeRequest`, `request`, `beforeTest`, `test`, `assertion`, `console`, `exception`, `beforeDone`, `done`.

Use cases: run multiple collections in parallel, custom Slack/Teams notifications, upload results to a dashboard/DB, dynamic config.

### Parallel runs
```javascript
const collections = ["users", "orders", "payments"];
Promise.all(collections.map(name => new Promise((resolve) => {
    newman.run({ collection: `./collections/${name}.json`, environment: "./qa.json", reporters: "cli" },
        (err, summary) => resolve({ name, failures: err ? 1 : summary.run.failures.length }));
}))).then(results => {
    console.table(results);
    process.exit(results.some(r => r.failures) ? 1 : 0);
});
```
⚠️ Parallel runs must not share mutable test data.

---

## 11.5 Newman in Docker
```bash
docker run --rm -v "$PWD":/etc/newman -t postman/newman:alpine \
  run Orders.postman_collection.json -e QA.postman_environment.json \
  -r cli,junit --reporter-junit-export results/junit.xml
```
- Official image: `postman/newman` (tags like `latest`, `alpine`, version tags — **pin a version** in CI).
- For htmlextra, build a small custom image:
```dockerfile
FROM postman/newman:alpine
RUN npm install -g newman-reporter-htmlextra
ENTRYPOINT ["newman"]
```
- To reach services on the host from the container: `--network host` (Linux) or `host.docker.internal`.

---

## 11.6 Postman CLI
### Install
```bash
# Linux
curl -o- "https://dl-cli.pstmn.io/install/linux64.sh" | sh
# macOS (Apple Silicon)
curl -o- "https://dl-cli.pstmn.io/install/osx_arm64.sh" | sh
# macOS (Intel)
curl -o- "https://dl-cli.pstmn.io/install/osx_64.sh" | sh
```
```powershell
# Windows (PowerShell)
powershell.exe -NoProfile -InputFormat None -ExecutionPolicy AllSigned -Command "[System.Net.ServicePointManager]::SecurityProtocol = 3072; iex ((New-Object System.Net.WebClient).DownloadString('https://dl-cli.pstmn.io/install/win64.ps1'))"
```
(Check the "Automate runs via CLI" panel in the Runner for the exact current command.)

### Common commands
```bash
postman login --with-api-key "$POSTMAN_API_KEY"   # EU data region accounts: add --region eu
postman collection run 12345678-abcd-... -e 12345678-efgh-...      # IDs from Postman
postman collection run ./Orders.postman_collection.json -e ./qa.json  # local files
postman collection run <id> -d data.csv -n 2 --bail \
    --env-var "clientSecret=$CLIENT_SECRET" \
    -r cli,junit --reporter-junit-export results/junit.xml
postman api lint <api-id>          # governance/security rules on an API definition
postman spec lint <spec-file-or-id> # lint specs (Spec Hub)
postman logout
```
Useful options (similar to Newman): `-e/--environment`, `-g/--globals`, `-d/--iteration-data`, `-n/--iteration-count`, `-i/--folder` (run specific folder/request), `--env-var`, `--global-var`, `--delay-request`, `--timeout`, `--timeout-request`, `--timeout-script`, `-k/--insecure`, `--bail`, `-x/--suppress-exit-code`, `--working-dir`, `--ssl-client-cert(-list)`, `--silent`, `--color`, `-r/--reporters cli,json,junit,html` with `--reporter-<name>-export`, `--report-events` (send run results to the API Catalog CI report). Run `postman collection run --help` for your version.

### v12 Native Git workflow (Git-native workspaces)
- Collections live as **YAML (Collection v3)** files in your repo (e.g. under `postman/`).
- Run by path: `postman collection run ./postman/collections/Orders` (exact path layout per your workspace).
- `postman workspace push` pushes local changes to the cloud workspace (e.g. after merge to main in CI). Local files are the source of truth — edits in the cloud view may be overwritten by the next push.
- Some reporters may be limited for v3 YAML in early v12 releases (docs note only `cli` for some request types) — verify for your version.

---

## 11.7 CI/CD integration examples

### GitHub Actions — Newman
```yaml
# .github/workflows/api-tests.yml
name: API Tests
on:
  pull_request:
  push:
    branches: [main]
jobs:
  newman:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npm ci        # newman + htmlextra pinned in package.json devDependencies
      - name: Run API tests
        env:
          CLIENT_SECRET: ${{ secrets.QA_CLIENT_SECRET }}
        run: |
          npx newman run postman/Orders.postman_collection.json \
            -e postman/env/qa.postman_environment.json \
            --env-var "clientSecret=$CLIENT_SECRET" \
            -r cli,junit,htmlextra \
            --reporter-junit-export results/junit.xml \
            --reporter-htmlextra-export results/report.html \
            --reporter-htmlextra-skipSensitiveData
      - name: Upload report
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: api-test-report
          path: results/
```

### GitHub Actions — Postman CLI
```yaml
      - name: Install Postman CLI
        run: curl -o- "https://dl-cli.pstmn.io/install/linux64.sh" | sh
      - name: Login
        run: postman login --with-api-key ${{ secrets.POSTMAN_API_KEY }}
      - name: Run collection
        run: |
          postman collection run "${{ vars.COLLECTION_ID }}" \
            -e "${{ vars.QA_ENV_ID }}" \
            --env-var "clientSecret=${{ secrets.QA_CLIENT_SECRET }}"
```

### Jenkins (Declarative pipeline)
```groovy
pipeline {
  agent { docker { image 'postman/newman:alpine'; args '--entrypoint=' } }
  environment { CLIENT_SECRET = credentials('qa-client-secret') }
  stages {
    stage('API tests') {
      steps {
        sh '''
          newman run postman/Orders.postman_collection.json \
            -e postman/env/qa.postman_environment.json \
            --env-var "clientSecret=$CLIENT_SECRET" \
            -r cli,junit --reporter-junit-export results/junit.xml
        '''
      }
    }
  }
  post {
    always { junit 'results/junit.xml' }
  }
}
```
(`--entrypoint=` overrides the image's `newman` entrypoint so Jenkins can run `sh` steps.)

### GitLab CI
```yaml
api_tests:
  image:
    name: postman/newman:alpine
    entrypoint: [""]
  stage: test
  script:
    - newman run postman/Orders.postman_collection.json -e postman/env/qa.postman_environment.json
        --env-var "clientSecret=$QA_CLIENT_SECRET"
        -r cli,junit --reporter-junit-export results/junit.xml
  artifacts:
    when: always
    reports:
      junit: results/junit.xml
```

### Azure DevOps
```yaml
steps:
  - task: NodeTool@0
    inputs: { versionSpec: '20.x' }
  - script: npm install -g newman
  - script: >
      newman run postman/Orders.postman_collection.json
      -e postman/env/qa.postman_environment.json
      --env-var "clientSecret=$(QA_CLIENT_SECRET)"
      -r cli,junit --reporter-junit-export $(Build.ArtifactStagingDirectory)/junit.xml
    displayName: Run API tests
  - task: PublishTestResults@2
    condition: always()
    inputs:
      testResultsFormat: JUnit
      testResultsFiles: '$(Build.ArtifactStagingDirectory)/junit.xml'
```

### Where in the pipeline?
```
commit → build → unit tests → deploy to QA → [SMOKE API tests] → [REGRESSION API tests]
       → deploy to STAGING → [SMOKE + contract tests] → approval → deploy PROD → [read-only SMOKE + monitors]
```
- **PR builds**: fast smoke/contract subset (`--folder Smoke`).
- **Nightly**: full regression + data-driven + negative suites.
- **Post-deploy prod**: read-only health checks (never destructive).

---

## 11.8 Organising Postman assets in a Git repo (export-based approach)
```
api-tests/
├── package.json                 # newman + reporters pinned
├── postman/
│   ├── collections/
│   │   ├── orders.postman_collection.json
│   │   └── payments.postman_collection.json
│   ├── environments/
│   │   ├── dev.postman_environment.json      # no secrets
│   │   ├── qa.postman_environment.json
│   │   └── staging.postman_environment.json
│   └── data/
│       ├── orders-boundaries.json
│       └── login-negative.csv
├── files/                       # upload fixtures (form-data)
├── scripts/run-all.js           # Newman Node runner
└── .github/workflows/api-tests.yml
```
Sync options: export manually (error-prone), Postman API sync script, built-in Git integration for API specs/collections (v10/v11), or **Native Git** (v12) where the repo *is* the source.

---

## 11.9 Newman vs Postman app differences (bugs that only show up in CI)

| Symptom in CI | Why | Fix |
|---|---|---|
| `{{var}}` unresolved | Environment not passed / variable disabled / secret only in local value (not exported) | `-e`, `--env-var` from CI secrets |
| File upload fails `ENOENT` | Path relative to your laptop | `--working-dir`, files in repo |
| OAuth 2 token missing | Interactive "Get New Access Token" doesn't run in CLI | Token fetch in pre-request script |
| Vault secrets empty | Vault not supported in Newman/CLI | Inject via `--env-var` |
| `pm.require` package not found | Newman can't load team packages (or not logged in for CLI) | Inline helpers / `postman login` |
| SSL errors (`UNABLE_TO_GET_ISSUER_CERT_LOCALLY`) | Corporate CA not trusted on runner | `--ssl-extra-ca-certs ca.pem` (Newman) or `NODE_EXTRA_CA_CERTS=ca.pem`; `-k` only as last resort |
| Proxy issues | CI behind corporate proxy | Set `HTTP_PROXY`/`HTTPS_PROXY`/`NO_PROXY` env vars |
| Timeouts | CI network slower; no per-request timeout | `--timeout-request`, retries, delays |
| Tests pass in app, fail in Newman | Older Newman sandbox lacks newer APIs (`pm.execution`, top-level await, `pm.response.to.have.jsonSchema` in very old versions) | Upgrade Newman; avoid bleeding-edge APIs; or use Postman CLI |
| Cookies missing | Fresh cookie jar per run | Login request in setup; `--cookie-jar` |
| Variables changed by scripts lost | Newman uses copies | `--export-environment` if needed |
| Unicode garbled in logs | Terminal encoding | `--disable-unicode` |

---

## 11.10 Chapter 11 Quick Revision
- Newman: open-source npm CLI, file/URL inputs, rich reporters, Node API, Docker image `postman/newman`.
- Postman CLI: official binary, IDs + login, results in Postman, linting (`api lint`, `spec lint`), v12 Native Git (`workspace push`, YAML collections).
- Key flags: `-e -g -d -n --folder --env-var --bail -r --reporter-junit-export --timeout-request -k --working-dir`.
- Exit code 1 = failures → pipeline fails.
- Secrets via CI secret store + `--env-var`; never in exported files.

➡️ Next: **Chapter 12 — Mock Servers, Monitors, API Design (Spec Hub), Documentation, Flows, Postman API, AI**.
