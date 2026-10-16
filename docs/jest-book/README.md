# The Jest Book — From Zero to Expert (and Interview-Ready)

> A complete, beginner-friendly but deep guide to **Jest**, the JavaScript testing framework.
> It goes from "what is a test?" all the way to Jest internals, big-company test architecture,
> debugging any Jest problem, and hundreds of interview questions with full answers.

**Version this book targets:** Jest **30.x** (latest at the time of writing: 30.5.2).
Wherever Jest 29 (still very common in companies, including this repository) behaves differently,
the book says so with a **📌 Version note**.

Every API name, default value and behaviour in this book was checked against the official Jest
source/docs for 30.5.x. The surprising ones (hook order, mock hoisting rules, `mockReset` on spies,
fake timers + promises, `restoreAllMocks`, equality edge cases, jsdom `window.location`) were also
**run** on a real Jest 30.5.2 install, so the outputs shown are what Jest actually prints.

---

## How to read this book

- **Brand new to testing?** Read Part 1 in order. Every chapter starts with a
  "🧸 Explain it like I'm 5" box, then goes deeper.
- **Already write Jest tests?** Skim Part 1, then read Parts 2–5 carefully. Most bugs people hit
  in real jobs come from mocking (Part 2), async code (Ch 5) and configuration (Ch 12, 15).
- **Preparing for interviews?** Read Part 6 (≈400 questions with answers), then use the cheat sheet
  (Ch 30) the night before. The questions link back to the chapters that explain them.
- **Fixing a problem right now?** Go straight to **Chapter 23 — Debugging & Troubleshooting**.
  It is a catalogue of error messages → cause → fix.

Symbols used:

| Symbol | Meaning |
| --- | --- |
| 🧸 | Explain like I'm 5 — the simple picture |
| 🔍 | Deep dive — how it really works |
| ⚠️ | Common mistake / trap |
| ✅ | Best practice |
| 📌 | Version note (Jest 29 vs 30, etc.) |
| 💼 | Real-world / organisational tip |
| 🎯 | Interview point — likely to be asked |

---

## Table of contents

### Part 1 — Foundations
1. [What is testing? (and why companies care)](part-1-foundations/01-what-is-testing.md)
2. [Meet Jest: install, set up, run your first test](part-1-foundations/02-meet-jest-and-setup.md)
3. [Anatomy of a test: `test`, `describe`, `expect`, modifiers, `.each`](part-1-foundations/03-anatomy-of-a-test.md)
4. [Matchers — the complete reference](part-1-foundations/04-matchers.md)
5. [Testing asynchronous code](part-1-foundations/05-async-testing.md)
6. [Setup, teardown and the test lifecycle](part-1-foundations/06-setup-teardown-lifecycle.md)

### Part 2 — Mocking (the most important part for real jobs)
7. [Mock functions (`jest.fn`) in depth](part-2-mocking/07-mock-functions.md)
8. [Module mocking (`jest.mock`, `__mocks__`, hoisting, ESM)](part-2-mocking/08-module-mocking.md)
9. [Spies, classes, globals, `Date`, `fetch`, env vars](part-2-mocking/09-spies-classes-globals.md)
10. [Fake timers](part-2-mocking/10-fake-timers.md)

### Part 3 — Tooling
11. [Snapshot testing](part-3-tooling/11-snapshot-testing.md)
12. [Configuration — every important option](part-3-tooling/12-configuration.md)
13. [The Jest CLI](part-3-tooling/13-cli.md)
14. [Code coverage](part-3-tooling/14-code-coverage.md)
15. [TypeScript, Babel, ESM and transforms](part-3-tooling/15-typescript-esm-babel.md)

### Part 4 — Testing real applications
16. [Testing React (React Testing Library)](part-4-real-world/16-testing-react.md)
17. [Testing React Native](part-4-real-world/17-testing-react-native.md)
18. [Testing Node.js back ends (APIs, databases, queues)](part-4-real-world/18-testing-node-backend.md)
19. [Test design: patterns, TDD, test doubles, writing testable code](part-4-real-world/19-test-design-patterns.md)

### Part 5 — Advanced & professional
20. [Extending Jest: custom matchers, environments, reporters, transformers, runners](part-5-advanced/20-extending-jest.md)
21. [How Jest works inside (internals)](part-5-advanced/21-jest-internals.md)
22. [Performance, CI/CD, monorepos and scaling](part-5-advanced/22-performance-ci-monorepos.md)
23. [Debugging & troubleshooting — the error catalogue](part-5-advanced/23-debugging-troubleshooting.md)
24. [Organisational best practices & playbooks](part-5-advanced/24-organisational-best-practices.md)
25. [Versions, migrations and alternatives (Vitest, Mocha, node:test)](part-5-advanced/25-versions-migration-alternatives.md)

### Part 6 — Interview preparation
26. [Interview questions — Beginner](part-6-interview/26-interview-beginner.md)
27. [Interview questions — Intermediate](part-6-interview/27-interview-intermediate.md)
28. [Interview questions — Advanced / Senior](part-6-interview/28-interview-advanced.md)
29. [Scenario, debugging & live-coding questions](part-6-interview/29-interview-scenarios-coding.md)
30. [Cheat sheet & glossary](part-6-interview/30-cheat-sheet-glossary.md)

---

## A note about this repository

This repository is a **React Native** app (`TodoApp`) that already uses Jest:

```js
// jest.config.js
module.exports = {
  preset: 'react-native',
};
```

```tsx
// __tests__/App.test.tsx
import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import App from '../App';

test('renders correctly', async () => {
  await ReactTestRenderer.act(() => {
    ReactTestRenderer.create(<App />);
  });
});
```

Chapter 17 explains every line of this setup, why `react-test-renderer` is now deprecated
(React 19), and how to move to `@testing-library/react-native`. Chapter 25 covers moving this
repo from Jest 29 (`"jest": "^29.6.3"`) to Jest 30.
