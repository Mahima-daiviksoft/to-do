# Chapter 25 — Extending Newman: Custom Reporters & Programmatic Runs

> 🧒 Newman is a robot that runs your tests. A **reporter** is the robot's **mouth**. The default mouth talks in the terminal; others write JUnit or HTML. You can build your own mouth that speaks **exactly** the way your team wants: a Slack summary, a Markdown file, a dashboard update.

> ✅ The reporter in this chapter was **built and run successfully with Newman 6.2.3** while writing this book.

---

## 25.1 When you need a custom reporter
- A **one-line summary** for Slack/Teams with pass rate and top failures.
- **Markdown** output for PR comments.
- Sending results to an internal **dashboard/DB** (InfluxDB, Elasticsearch, Datadog).
- Company-specific formats (test-management tools like TestRail, Xray, Zephyr: many already have community reporters, so search npm for `newman-reporter-*` first).

---

## 25.2 How Newman finds a reporter
- `-r <name>` makes Newman look for an installed package named **`newman-reporter-<name>`** (globally if Newman is global, locally if Newman is local).
- Options on the command line, `--reporter-<name>-<option> value`, arrive in your reporter as `reporterOptions.<option>`.
- The package exports **one function**: `function (emitter, reporterOptions, collectionRunOptions)`.

---

## 25.3 A complete reporter (verified)

`newman-reporter-slacksummary/package.json`
```json
{ "name": "newman-reporter-slacksummary", "version": "1.0.0", "main": "index.js" }
```

`newman-reporter-slacksummary/index.js`
```javascript
const fs = require("fs");

function SlackSummaryReporter(emitter, reporterOptions, collectionRunOptions) {
  const failures = [];
  const slow = [];
  const threshold = Number(reporterOptions.slowMs || 1000);

  emitter.on("request", (err, args) => {
    if (err || !args.response) return;
    if (args.response.responseTime > threshold) {
      slow.push(`${args.item.name} (${args.response.responseTime} ms)`);
    }
  });

  emitter.on("assertion", (err, args) => {
    if (err) failures.push(`${args.item.name} → ${args.assertion}: ${err.message}`);
  });

  emitter.on("done", (err, summary) => {
    const s = summary.run.stats;
    const line = `${collectionRunOptions.collection.name}: ` +
      `${s.assertions.total - s.assertions.failed}/${s.assertions.total} assertions passed, ` +
      `${s.requests.total} requests, ${failures.length} failures`;
    console.log("[slacksummary] " + line);

    const md = [`# ${line}`, "", "## Failures", ...failures.map(f => `- ${f}`),
                "", `## Slower than ${threshold} ms`, ...slow.map(x => `- ${x}`)].join("\n");
    if (reporterOptions.export) fs.writeFileSync(reporterOptions.export, md);
    // To post to Slack: send `line` to process.env.SLACK_WEBHOOK_URL with https.request (not shown)
  });
}

module.exports = SlackSummaryReporter;
```

Install and run:
```bash
npm install ./newman-reporter-slacksummary          # or publish it to your private npm registry
npx newman run collection.json -e env.json \
  -r cli,slacksummary \
  --reporter-slacksummary-export out/summary.md \
  --reporter-slacksummary-slowMs 500
```
Real output from the verification run:
```
[slacksummary] p3: 5/5 assertions passed, 3 requests, 0 failures
```

---

## 25.4 Useful emitter events & data
| Event | `args` highlights |
|---|---|
| `start` | run starting |
| `beforeIteration` / `iteration` | `args.cursor.iteration` |
| `beforeItem` / `item` | `args.item.name` |
| `request` | `args.request`, `args.response` (`code`, `status`, `responseTime`, `stream`), `args.item` |
| `assertion` | `args.assertion` (test name), `err` set if the test failed, `args.skipped` |
| `console` | `args.level`, `args.messages` (script `console.log` output) |
| `exception` | script errors |
| `done` | `summary.run.stats` (iterations/requests/scripts/assertions: `total`, `failed`), `summary.run.failures`, `summary.run.timings`, `summary.run.executions` |

Response body inside a reporter: `args.response.stream.toString()` (it's a Buffer).

---

## 25.5 Programmatic Newman patterns (recap and extensions)
```javascript
const newman = require("newman");

function runCollection(collectionPath, envPath) {
  return new Promise((resolve, reject) => {
    newman.run({
      collection: collectionPath,
      environment: envPath,
      reporters: ["cli", "junit"],
      reporter: { junit: { export: `out/${collectionPath.split("/").pop()}.xml` } },
      envVar: [{ key: "clientSecret", value: process.env.CLIENT_SECRET }],
    }, (err, summary) => err ? reject(err) : resolve(summary));
  });
}

(async () => {
  const results = await Promise.all([
    runCollection("collections/users.json", "env/qa.json"),
    runCollection("collections/orders.json", "env/qa.json"),
  ]);
  const failed = results.reduce((n, s) => n + s.run.failures.length, 0);
  console.log(`Total failures: ${failed}`);
  process.exit(failed ? 1 : 0);
})();
```
Ideas:
- **Retry only failed collections** once (to separate flakes from real failures, and report both).
- **Shard** big collections by folder across CI workers (`folder: "Orders"`).
- **Gate on business metrics**, e.g. fail if p95 response time over all requests is above an SLA, computed from `request` events.

---

## 25.6 Interview questions

**Q. How do you create a custom Newman reporter?** Publish a package named `newman-reporter-<name>` exporting `function(emitter, reporterOptions, collectionRunOptions)`. Subscribe to events like `request`, `assertion` and `done`, and use it with `-r <name>`. Options come from `--reporter-<name>-<option>`.

**Q. How do you get response bodies in a reporter?** `args.response.stream` (a Buffer) in the `request` event.

**Q. How would you run 10 collections in parallel and fail the build if any fail?** Use the Newman Node API with `Promise.all` over `newman.run` wrappers, sum `summary.run.failures`, and exit 1 if the sum is non-zero. Make sure test data doesn't collide.

➡️ Next: **Chapter 26 — Migration Guide, Certifications & Career Growth**.
