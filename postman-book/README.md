# 📘 The Complete Postman Book — From Zero to Expert (with Interview Preparation)

A full, book-length guide to Postman, written for **total beginners** ("explain like I'm 5" analogies) that goes all the way to **senior or lead level** (CI/CD, governance, security, large-team practices). Interview preparation is built in, and the code has been executed and checked (see Chapter 27).

> **Version note (October 2026):** Covers Postman v10 → v11 → **v12**: Native Git with YAML Collection v3, Agent Mode, API Catalog. It also covers the March 2026 plan change to Free (single user), Solo, Team and Enterprise. Where Postman renamed something, the book gives both names. For example, "Tests" became "Post-response", and "Initial/Current value" became "Shared/Local value". That way you can work with any version your company uses.

---

## 📚 Table of Contents

| # | Chapter | Level |
|---|---|---|
| 1 | [Foundations: APIs, HTTP & the Web](01-foundations-apis-and-http.md) | 🟢 |
| 2 | [Getting Started with Postman](02-getting-started-with-postman.md) | 🟢 |
| 3 | [Building and Sending Requests](03-building-and-sending-requests.md) | 🟢 |
| 4 | [Collections and Folders](04-collections-and-folders.md) | 🟢🟡 |
| 5 | [Variables and Environments](05-variables-and-environments.md) | 🟡 |
| 6 | [Authorization & Authentication (all types)](06-authorization-and-authentication.md) | 🟡🔴 |
| 7 | [Scripting: The Complete `pm` API](07-scripting-complete-pm-api.md) | 🟡🔴 |
| 8 | [Testing and Assertions](08-testing-and-assertions.md) | 🟡🔴 |
| 9 | [Request Chaining & Workflows](09-request-chaining-and-workflows.md) | 🔴 |
| 10 | [Collection Runner, Data-Driven & Performance Testing](10-collection-runner-data-driven-performance.md) | 🟡🔴 |
| 11 | [Newman, Postman CLI & CI/CD](11-newman-postman-cli-and-ci-cd.md) | 🔴 |
| 12 | [Mocks, Monitors, Spec Hub, Docs, Flows, Postman API, Insights & AI](12-mocks-monitors-design-docs-flows-api-ai.md) | 🟡🔴 |
| 13 | [GraphQL, gRPC, WebSocket, Socket.IO, MQTT, SOAP, SSE, MCP](13-graphql-grpc-websocket-soap-mqtt-mcp.md) | 🟡🔴 |
| 14 | [Collaboration, Version Control & Large Projects](14-collaboration-version-control-large-projects.md) | 🔴 |
| 15 | [API Security Testing (OWASP API Top 10 2023)](15-api-security-testing.md) | 🔴 |
| 16 | [Debugging & Troubleshooting — every common error](16-debugging-and-troubleshooting.md) | 🟡🔴 |
| 17 | [Best Practices & Situational Playbook](17-best-practices-and-situational-playbook.md) | 🔴 |
| 18A | [Interview Q&A — Fundamentals (Q1–Q95)](18a-interview-questions-fundamentals.md) | 🟢🟡 |
| 18B | [Interview Q&A — Scripting, Testing, Automation, Advanced (Q96–Q190)](18b-interview-questions-scripting-automation-advanced.md) | 🟡🔴 |
| 18C | [Interview — Scenarios, Live Coding, Architecture, Rapid-fire](18c-interview-scenarios-coding-architecture.md) | 🔴 |
| 18D | [Interview — Researched Patterns, Company-Tagged Questions & Verified Gotchas](18d-interview-research-and-gotchas.md) | 🟡🔴 |
| 19 | [Cheat Sheets, Snippet Library & Glossary](19-cheat-sheets-and-glossary.md) | All |
| 20 | [Hands-On Labs & Capstone Project](20-hands-on-labs-and-capstone.md) | All |
| 21 | [Native Git & the v12 Workflow (deep dive)](21-native-git-and-v12-workflow.md) | 🔴 |
| 22 | [Postman Flows & FQL (deep dive)](22-postman-flows-and-fql.md) | 🟡🔴 |
| 23 | [Enterprise Admin, Governance (Spectral), Integrations & VS Code](23-enterprise-admin-governance-integrations-vscode.md) | 🔴 |
| 24 | [Contract Testing with Pact](24-contract-testing-with-pact.md) | 🔴 |
| 25 | [Extending Newman: Custom Reporters](25-extending-newman-custom-reporters.md) | 🔴 |
| 26 | [Migration Guides, Certifications & Career](26-migration-certifications-career.md) | All |
| 27 | [Verification Report — what was tested & corrected](27-verification-report.md) | All |
| — | [`verification/` — runnable test setup for the book's code](verification/) | — |

Legend: 🟢 Entry · 🟡 Intermediate · 🔴 Experienced

---

## 🧭 How to use this book

### If you are a beginner (0–1 year)
1. Read Chapters **1 → 5** in order and do **Labs 1–6** (Chapter 20).
2. Then Chapters **6–8** with **Labs 7–8**.
3. Revise with **18A** and the **Chapter 19** cheat sheet.

### If you have experience (2+ years) and want interview-ready depth
1. Skim Chapters 1–5 (the version notes in Ch. 2 and 5 matter: v11/v12 changes).
2. Deep-read **7, 8, 9, 11, 14, 16, 17**.
3. Practise **18B + 18C** out loud, and solve all live-coding questions without looking.
4. Build the **Capstone** and talk about it in interviews.

### If you are working on a large company project right now
- Setting standards → **Chapter 14 + 17**
- Secrets & environments → **Chapter 5 (5.11) + 15.4**
- CI/CD → **Chapter 11**
- Something is broken → **Chapter 16**
- Need a code snippet fast → **Chapter 19.2**

---

## 🗓️ Suggested 3-week study plan (add week 4 for Ch 21–26 if you work on large/enterprise projects)
| Week | Days 1–2 | Days 3–4 | Days 5–6 | Day 7 |
|---|---|---|---|---|
| 1 | Ch 1–2 | Ch 3–4 | Ch 5 + Labs 1–5 | 18A revision |
| 2 | Ch 6 | Ch 7 | Ch 8–9 + Labs 6–10 | 18B revision |
| 3 | Ch 10–11 + Lab 12 | Ch 12–13 | Ch 14–17 | 18C + Capstone + mock interview |

---

## ✅ Accuracy policy
- **The code was executed, not just written.** The book's scripts were run in Newman 6.2.3 against a local stand-in API: 180/180 assertions pass. The Pact, custom-reporter, Spectral and FQL examples were also run, and all 12 diagrams were rendered. Running them led to 11 corrections, listed in [Chapter 27](27-verification-report.md). You can re-run everything from [`verification/`](verification/).
- Facts come from Postman's official documentation and widely used, established behaviour. Recent changes (v11/v12, the 2026 plans, Vault limits, Native Git) were checked against current Postman docs and coverage.
- Postman releases updates often. Plan limits, prices, UI labels and new features can change. Where something is version- or plan-dependent, the text says so. Check the Postman Learning Center or release notes for your exact version before committing to numbers in a company proposal.
