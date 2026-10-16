# Runnable examples for the Jest book

Every example here is a real, passing test (verified on **Jest 30.5.2**, Node 22).
Run them, then **break them on purpose** to see Jest's failure messages.

```bash
cd docs/jest-book/examples
npm install
npm test                 # everything
npm run test:core        # matchers, async, mocks, timers, snapshots, extending
npm run test:react       # React Testing Library
npm run test:node        # Express + Supertest + MSW
```

| Folder | Book chapters |
| --- | --- |
| `core/` | 3–11, 19, 20 |
| `react/` | 16 |
| `node-api/` | 18 |
| `frameworks/vue`, `frameworks/angular`, `frameworks/nextjs`, `frameworks/svelte` | 31–33 (each has its own `package.json`; `cd` into it and run `npm install && npm test`) |

The repository's root Jest config (React Native app) ignores `docs/` so these examples never
run as part of the app's test suite.
