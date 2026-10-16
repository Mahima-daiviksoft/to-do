# Chapter 41 — Jest Visually: Diagrams of the Key Mechanisms

> 🧸 **Explain it like I'm 5**
>
> Sometimes a picture explains faster than a page of words. These diagrams show how Jest moves
> through a run, in what order hooks fire, how a `require` turns into a mock, and how to pick the
> right mocking tool.

The diagrams use **Mermaid**, which GitHub (and many editors) render automatically. Each diagram
matches behaviour verified earlier in the book (chapter references given).

---

## 41.1 What happens when you run `jest` (Chapter 21)

```mermaid
flowchart TD
    A[jest CLI] --> B[Read config<br/>CLI + file + preset + defaults]
    B --> C[Haste map<br/>crawl files, deps, __mocks__<br/>cached]
    C --> D[SearchSource<br/>testMatch, patterns, -o, --shard]
    D --> E[Sequencer<br/>failed first, then slowest]
    E --> F{In band?}
    F -- "-i, 1 file, ≤20 fast files" --> G[Run in main process]
    F -- otherwise --> H[Worker pool<br/>maxWorkers]
    G --> I
    H --> I[Per test file]
    I --> I1[New environment<br/>node or jsdom vm context]
    I1 --> I2[New jest-runtime<br/>empty module registry]
    I2 --> I3[setupFiles → framework → setupFilesAfterEnv]
    I3 --> I4[Load test file<br/>transform + cache]
    I4 --> I5[jest-circus<br/>collect, then execute]
    I5 --> J[Results → reporters]
    J --> K[Coverage merge + thresholds]
    K --> L[Exit code 0 or 1]
```

## 41.2 Hook order (Chapter 6, verified output)

```mermaid
sequenceDiagram
    participant O as Outer scope
    participant I as Inner describe
    Note over O: beforeAll (outer)
    Note over O: beforeEach (outer) → test "outer" → afterEach (outer)
    Note over I: beforeAll (inner) — runs before the first inner test
    O->>I: beforeEach (outer) runs FIRST
    Note over I: beforeEach (inner)
    Note over I: test "inner"
    Note over I: afterEach (inner) runs FIRST
    I->>O: afterEach (outer)
    Note over I: afterAll (inner)
    Note over O: afterAll (outer)
```

Rule: `before*` outer → inner; `after*` inner → outer.

## 41.3 Collection vs execution phase (Chapter 3 §3.4)

```mermaid
flowchart LR
    subgraph Collection["1. Collection (file runs top to bottom)"]
      C1[describe bodies execute immediately]
      C2[test and hook calls only REGISTER functions]
    end
    subgraph Execution["2. Execution"]
      E1[hooks run]
      E2[tests run]
    end
    Collection --> Execution
```

## 41.4 How `require` becomes a mock (Chapter 8, Chapter 21 §21.4)

```mermaid
flowchart TD
    R["require('./x') / import"] --> A{Explicit mock?<br/>jest.mock factory,<br/>doMock, setMock}
    A -- yes --> F[Return factory result<br/>run once, cached]
    A -- no --> B{"jest.mock('./x') without factory<br/>or automock on?"}
    B -- yes --> M{__mocks__/x.js<br/>next to module?}
    M -- yes --> MM[Use manual mock]
    M -- no --> AM[Load real module,<br/>read its shape,<br/>generate automock]
    B -- no --> N{node_modules package<br/>with root __mocks__?}
    N -- yes --> MM
    N -- no --> REAL[Load real module:<br/>resolve → transform → execute → cache]
```

Babel hoists `jest.mock` above imports so the first box is configured before the import runs.

## 41.5 Choosing a mocking technique (Chapter 8 §8.11)

```mermaid
flowchart TD
    Q[Need to replace a dependency] --> D1{Can you pass it in?<br/>dependency injection}
    D1 -- yes --> DI[jest.fn / fake object<br/>✅ simplest]
    D1 -- no --> D2{One method on an object,<br/>keep the rest real?}
    D2 -- yes --> SP[jest.spyOn]
    D2 -- no --> D3{HTTP call?}
    D3 -- yes --> MSW[MSW at network level<br/>or mock the API client module]
    D3 -- no --> D4{Native ESM?}
    D4 -- yes --> UM[jest.unstable_mockModule<br/>+ await import]
    D4 -- no --> D5{Reused by many test files?}
    D5 -- yes --> MAN[__mocks__ manual mock]
    D5 -- no --> JM[jest.mock with factory<br/>or automock + jest.mocked]
```

## 41.6 Clear vs reset vs restore (Chapter 7 §7.9, verified on Jest 30)

```mermaid
flowchart LR
    C[mockClear] -->|+ remove programmed behaviour| R[mockReset]
    R -->|+ put original back<br/>spyOn / replaceProperty only| S[mockRestore]
    C -.- C1[wipes calls, results,<br/>instances, contexts]
    R -.- R1[mock now returns undefined<br/>— even for spies]
    S -.- S1[restoreAllMocks does NOT<br/>touch plain jest.fn]
```

## 41.7 Fake timers and promises (Chapter 10 §10.5)

```mermaid
sequenceDiagram
    participant T as Test
    participant C as Fake clock
    participant Q as Microtask queue (real promises)
    T->>C: advanceTimersByTime(500)
    C-->>T: runs timer callbacks synchronously
    Note over Q: .then callbacks queued, NOT run yet
    T->>Q: await (yield)
    Q-->>T: promise callbacks run now
    Note over T,C: advanceTimersByTimeAsync = advance + await between timers
```

## 41.8 Transform pipeline and the ESM problem (Chapter 15)

```mermaid
flowchart TD
    F[File needed] --> R[Resolve path<br/>moduleNameMapper, exports conditions]
    R --> I{"Matches transformIgnorePatterns?<br/>default: node_modules"}
    I -- yes --> RAW[Load as-is]
    RAW --> E{ESM syntax?}
    E -- no --> OK[Execute]
    E -- yes --> ERR["❌ Must use import to load ES Module<br/>(older: Unexpected token 'export')"]
    I -- no --> T{"Matches a transform regex?<br/>default \.[jt]sx?$ — not .mjs!"}
    T -- yes --> TR[babel-jest / ts-jest / swc<br/>→ CommonJS, cached] --> OK
    T -- no --> RAW
```

Fix for ERR: allow-list the package (`/node_modules/(?!(pkg)/)`, pnpm: `(?!(\.pnpm/)?(pkg))`),
widen `transform` to `\.[mc]?[jt]sx?$`, map to a CJS build, mock it, or use Node ≥ 24.9.

## 41.9 Test types and where Jest fits (Chapters 1, 39)

```mermaid
flowchart BT
    S[Static analysis<br/>TypeScript, ESLint] --> U[Unit tests<br/>Jest]
    U --> I[Integration tests<br/>Jest + RTL / Supertest / MSW / DB containers]
    I --> CT[Contract tests<br/>Pact, run by Jest]
    CT --> E[E2E<br/>Playwright / Cypress / Detox]
```

## 41.10 React Testing Library query choice (Chapter 16 §16.4)

```mermaid
flowchart TD
    Q[Looking for an element] --> N{Should it be there right now?}
    N -- yes --> G[getBy*]
    N -- "no, assert absence" --> QB[queryBy* + not.toBeInTheDocument]
    N -- "it will appear later" --> FB[await findBy*]
    G --> P[Prefer: Role → LabelText → PlaceholderText<br/>→ Text → DisplayValue → AltText → Title → TestId]
```

## 41.11 Debugging decision tree (Chapter 23)

```mermaid
flowchart TD
    X[Test problem] --> A{Suite failed to run?}
    A -- yes --> A1{Syntax / import error?}
    A1 -- yes --> TF[Transform issue → Ch 15 / 41.8]
    A1 -- no --> CF[Config/env issue → --showConfig, environment, mocks hoisting]
    A -- no --> B{Timeout?}
    B -- yes --> B1[Unresolved promise, done not called,<br/>fake timers not advanced, real network]
    B -- no --> C{Passes alone, fails together?}
    C -- yes --> C1[Test pollution: spies, env, timers,<br/>singletons, DOM, DB → bisect with -i]
    C -- no --> D{Only in CI?}
    D -- yes --> D1[TZ, case sensitivity, workers, cache,<br/>missing snapshots, network]
    D -- no --> E{Jest won't exit?}
    E -- yes --> E1[--detectOpenHandles → close servers,<br/>DB, intervals]
    E -- no --> F[Read the diff carefully:<br/>toBe vs toEqual, undefined args,<br/>mutated mock args]
```

**Next:** [Chapter 42 — Interview questions for Part 7 topics](42-interview-ecosystem.md)
