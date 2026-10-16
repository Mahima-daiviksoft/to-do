// A minimal custom Newman reporter: prints a one-line summary + writes a markdown report.
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
    const line = `${collectionRunOptions.collection.name}: ${s.assertions.total - s.assertions.failed}/${s.assertions.total} assertions passed, ${s.requests.total} requests, ${failures.length} failures`;
    console.log("[slacksummary] " + line);
    const md = [`# ${line}`, "", "## Failures", ...failures.map(f => `- ${f}`), "", `## Slower than ${threshold} ms`, ...slow.map(x => `- ${x}`)].join("\n");
    if (reporterOptions.export) fs.writeFileSync(reporterOptions.export, md);
  });
}

module.exports = SlackSummaryReporter;
