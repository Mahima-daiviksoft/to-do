# Chapter 11 — Snapshot Testing

> 🧸 **Explain it like I'm 5**
>
> You build a beautiful sandcastle and take a **photo** of it. Tomorrow, you check the sandcastle
> again and compare it with the photo. If something changed — a tower fell — you notice right away.
> If you *meant* to change it (you added a new tower), you take a **new photo**.
>
> A snapshot test takes a "photo" (a text printout) of your code's output the first time, saves it,
> and on every later run compares the new output with the saved photo.

---

## 11.1 The basic idea

```js
test('user card renders', () => {
  const output = renderUserCard({ name: 'Ann', role: 'admin' });
  expect(output).toMatchSnapshot();
});
```

- **First run:** there is no snapshot → Jest **writes** one to
  `__snapshots__/<testfile>.snap` and the test passes.
- **Later runs:** Jest serialises the new value and compares it with the stored one. Different →
  test fails with a diff.

A `.snap` file (verified format, Jest 30):

```js
// Jest Snapshot v1, https://jestjs.io/docs/snapshot-testing

exports[`one 1`] = `
{
  "a": 1,
}
`;

exports[`two: named hint 1`] = `
{
  "b": 2,
}
`;
```

- The key is **full test name + counter** (`one 1`, `one 2` for a second snapshot in the same test),
  or `test name: hint counter` when you pass a hint: `toMatchSnapshot('named hint')`.
- Values are printed by **pretty-format**. Since Jest 29 the default `snapshotFormat` is
  `{ escapeString: false, printBasicPrototype: false }` (no `Object {` / `Array [` prefixes).
- 📌 Jest 30 changed the header link (old `goo.gl` link removed) — upgrading rewrites every `.snap`
  header once; commit that change separately.

## 11.2 Updating snapshots

When the output changes **on purpose**:

```bash
npx jest -u                          # --updateSnapshot: rewrite all FAILING snapshots (and remove obsolete)
npx jest -u -t "user card"           # only tests matching the name
npx jest path/to/file.test.js -u     # only one file
```

In watch mode: press `u` (update all failing) or `i` (interactive: review one by one, `u` to accept,
`s` to skip).

⚠️ **Never run `-u` blindly.** If a snapshot fails because of a bug, `-u` records the bug as the new
"truth". Read the diff first.

## 11.3 Snapshots in CI (verified behaviour)

With `--ci` (auto-enabled when the `CI` environment variable is set — `is-ci` detection),
**new snapshots are not written** and the test **fails**:

```
New snapshot was not written. The update flag must be explicitly passed to write a new snapshot.
This is likely because this test is run in a continuous integration (CI) environment in which
snapshots are not written by default.
```

This forces developers to commit snapshots. ✅ Always run CI with `--ci`.

**Obsolete snapshots** (snapshot entries whose test no longer exists or was renamed) are reported as
`1 snapshot obsolete` and make Jest **exit with code 1 even when all tests pass** (verified on 30.5,
with and without `--ci`). Remove them with `jest -u` (or `--ci=false -u`), and check
`git diff` afterwards.

## 11.4 Inline snapshots

The snapshot is written **into the test file** as an argument:

```js
test('formats address', () => {
  expect(formatAddress({ city: 'Paris', zip: '75001' })).toMatchInlineSnapshot();
});
```

After the first run Jest rewrites the source (verified output):

```js
expect({ id: 1, at: new Date(0), nested: { list: [1, 'a'] } }).toMatchInlineSnapshot(`
  {
    "at": 1970-01-01T00:00:00.000Z,
    "id": 1,
    "nested": {
      "list": [
        1,
        "a",
      ],
    },
  }
`);
```

- Great for small values: the expected output sits next to the test → easier review.
- Jest writes inline snapshots itself (using Babel); if Prettier is installed, Jest uses it to format
  them (`prettierPath` option). 📌 Jest 29 did **not** support Prettier 3 for this (workaround:
  `prettierPath: null`, or install Prettier 2 under an alias); Jest 30 supports Prettier 3.
- Inline snapshots require the test file to be writable source (not generated code).

## 11.5 Property matchers — handling values that change every run

IDs, dates, random values break snapshots. Use asymmetric matchers as the first argument:

```js
test('creates a user', () => {
  const user = createUser('Ann');
  expect(user).toMatchSnapshot({
    id: expect.any(String),
    createdAt: expect.any(Date),
  });
});
```

Stored snapshot (verified format):

```
{
  "createdAt": Any<Date>,
  "id": Any<String>,
  "name": "Ann",
}
```

Works for inline too: `toMatchInlineSnapshot({ id: expect.any(String) }, \`...\`)`.

Alternatives: freeze time (fake timers), mock `uuid`/`Math.random`, or strip the fields before
snapshotting.

## 11.6 Error snapshots

```js
expect(() => parse('{{')).toThrowErrorMatchingSnapshot();
expect(() => parse('{{')).toThrowErrorMatchingInlineSnapshot(`"Unexpected token at 1:2"`);
await expect(loadUser(-1)).rejects.toThrowErrorMatchingSnapshot();
```

📌 Jest 30 includes an error's `cause` in snapshot output.

## 11.7 What to snapshot (and what NOT to)

### Good uses ✅
- Small, stable, meaningful outputs: error messages, CLI output, generated config, serialized
  ASTs, GraphQL queries/SQL produced by a builder, small presentational components.
- Data transforms where the exact shape matters and is tedious to write by hand.
- "Characterization tests" for legacy code before refactoring (capture current behaviour fast).

### Bad uses ❌
- **Huge snapshots** (a whole page's DOM, a 2,000-line JSON). Nobody reviews them; diffs get
  rubber-stamped with `-u`; they fail for unrelated changes (a class name in a child component).
- Using snapshots **instead of specific assertions** for behaviour ("clicking the button shows the
  error" is better tested with `expect(screen.getByRole('alert')).toHaveTextContent(...)`).
- Non-deterministic output (dates, random IDs, ordering from `Object.keys` on unordered data,
  machine-specific paths, time zones).
- Third-party component internals (they change on library upgrades).

🎯 **Interview answer — pros/cons of snapshot testing:**

| Pros | Cons |
| --- | --- |
| Very fast to write | Easy to update blindly → bugs get approved |
| Catches unexpected changes anywhere in the output | Large snapshots are not reviewed properly |
| Good for regression detection & legacy code | Brittle: fail for irrelevant changes |
| Shows output in code review | Don't express *intent* — what is important about the output? |
| Works with any serializable value | Can't be done TDD-style (output must exist first) |

💼 **Team rules that work:**
1. Snapshots must be small enough to read in a PR (many teams use `eslint-plugin-jest`'s
   `no-large-snapshots` rule, e.g. `maxSize: 50` lines).
2. Prefer inline snapshots for small values.
3. Reviewers review `.snap` diffs like code; "updated snapshots" alone is not a valid PR
   description.
4. Commit `.snap` files; never `.gitignore` them.
5. Resolve `.snap` merge conflicts by re-running the tests with `-u` **after** reviewing the
   resulting diff (don't hand-merge generated text).

## 11.8 Custom serializers

Control how values print in snapshots:

```js
// test/serializers/money.js
module.exports = {
  test: (val) => val && val.__type === 'Money',
  serialize: (val, config, indentation, depth, refs, printer) =>
    `Money<${val.amount} ${val.currency}>`,
};
```

```js
// jest.config.js
module.exports = { snapshotSerializers: ['<rootDir>/test/serializers/money.js'] };
// or per file: expect.addSnapshotSerializer(require('./money'));
```

Popular serializers: `@emotion/jest` (CSS-in-JS styles), `jest-serializer-path` (normalise paths),
`enzyme-to-json` (legacy Enzyme).

📌 Jest 30: a class can define `static SERIALIZABLE_PROPERTIES = ['id', 'name']` to limit which
properties are printed in snapshots/diffs.

## 11.9 Where snapshots are stored: `snapshotResolver`

Default: `__snapshots__/<file>.snap` next to the test. Change with a resolver module:

```js
// snapshotResolver.js
module.exports = {
  resolveSnapshotPath: (testPath, snapshotExtension) =>
    testPath.replace('/src/', '/__snapshots__/') + snapshotExtension,
  resolveTestPath: (snapshotFilePath, snapshotExtension) =>
    snapshotFilePath.replace('/__snapshots__/', '/src/').slice(0, -snapshotExtension.length),
  testPathForConsistencyCheck: 'some/src/example.test.js',
};
```

`jest.config.js`: `snapshotResolver: '<rootDir>/snapshotResolver.js'`.

## 11.10 Snapshot of React components

```js
import { render } from '@testing-library/react';

test('Badge renders', () => {
  const { container } = render(<Badge tone="success">Paid</Badge>);
  expect(container.firstChild).toMatchInlineSnapshot(`
    <span
      class="badge badge--success"
    >
      Paid
    </span>
  `);
});
```

Legacy approach: `react-test-renderer` `create(<C/>).toJSON()`. 📌 `react-test-renderer` is
**deprecated** as of React 19 — use Testing Library instead (Chapter 16/17).

## 11.11 Common snapshot problems

| Problem | Fix |
| --- | --- |
| Fails on CI but passes locally | Time zone / locale / OS path differences → `TZ=UTC`, fixed locale, path serializer |
| Fails after dependency upgrade | Third-party markup changed → narrow the snapshot to your output |
| `1 snapshot obsolete` & exit code 1 | Test renamed/removed → `jest -u` to clean |
| `New snapshot was not written` in CI | Snapshot not committed → run locally, commit `.snap` |
| Snapshot keys shifted after renaming tests | Names are keys → rename + `-u`, review diff |
| Inline snapshot not written | Test file is generated / not writable, or wrong `prettierPath` (Jest 29 + Prettier 3) |
| Order of keys differs | pretty-format sorts object keys, but **arrays/Maps keep insertion order** → sort the data first |

## 11.12 Summary

- `toMatchSnapshot` saves output in `.snap`; `toMatchInlineSnapshot` writes it into the test.
- `-u` to update after reviewing; CI (`--ci`) never writes new snapshots.
- Obsolete snapshots make the run fail; clean with `-u`.
- Property matchers for dynamic fields; custom serializers for custom types.
- Keep snapshots small, deterministic and reviewed.

**Next:** [Chapter 12 — Configuration](12-configuration.md)
