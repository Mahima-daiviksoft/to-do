# Chapter 35 — Storybook Stories as Tests, Accessibility (a11y), Internationalisation (i18n)

> 🧸 **Explain it like I'm 5**
>
> - **Storybook** is a picture book of your components. Why draw them twice? Reuse those pictures
>   as tests.
> - **Accessibility** means everyone can use your app, including people who can't see the screen
>   or use a mouse. A robot can check many of those rules for you.
> - **i18n** means your app speaks many languages. Tests make sure each language shows the right
>   words, plurals, dates and money.

Verified (October 2026, Jest 30.5.2): Storybook 10.6 portable stories (2 tests), jest-axe 11
(2 tests), i18next 26 + react-i18next 17 + `Intl` (4 tests).

---

## Part A — Storybook stories in Jest ("portable stories")

### 35.1 Reusing stories

```jsx
// Button.stories.jsx (CSF3)
import { Button } from './Button';
export default { title: 'Example/Button', component: Button, args: { label: 'Button' } };
export const Primary = { args: { primary: true, label: 'Buy now' } };
export const Secondary = { args: { label: 'Cancel' } };
```

```jsx
// Button.test.jsx
import { render, screen } from '@testing-library/react';
import { composeStories } from '@storybook/react';
import * as stories from './Button.stories';

const { Primary, Secondary } = composeStories(stories);   // stories → plain components (args, decorators applied)

test('Primary story', () => {
  render(<Primary />);
  expect(screen.getByRole('button', { name: 'Buy now' })).toHaveClass('btn--primary');
});

test('override args', () => {
  render(<Secondary label="Close" />);
  expect(screen.getByRole('button', { name: 'Close' })).not.toHaveClass('btn--primary');
});
```

- `composeStory(story, meta)` for a single story.
- Global decorators/parameters from `.storybook/preview`: call
  `setProjectAnnotations(previewAnnotations)` once in a `setupFilesAfterEnv` file.
- Stories with `play` functions: `await Story.run()` (or render + call `play`) to execute their
  interactions in the test.

### 35.2 ⚠️ Storybook 10 is ESM-only (verified)

`@storybook/react` 10 is published with `"type": "module"`. In Jest's CommonJS mode you get
"Must use import to load ES Module". Verified fix:

```js
// jest.config.js
module.exports = {
  transform: { '\\.[mc]?[jt]sx?$': 'babel-jest' },
  transformIgnorePatterns: ['/node_modules/(?!(@storybook|storybook)/)'],
};
```

Cost: Babel transforms Storybook's code (the 2-test file took ~5 s cold; cached afterwards). The
Storybook team's own direction is the Vitest-based test addon; Jest + `composeStories` remains
fine for existing Jest codebases.

### 35.3 When to test stories

✅ Reuse stories as fixtures so components are tested in the same states designers review.
❌ Don't snapshot every story by default (Storyshots-style) — that's the large-snapshot anti-pattern
(Chapter 11). Assert behaviour; use visual regression tools (Chromatic, Playwright screenshots) for
pixels.

---

## Part B — Accessibility testing

### 35.4 jest-axe

```js
import { axe, toHaveNoViolations } from 'jest-axe';
expect.extend(toHaveNoViolations);

test('reports violations', async () => {
  const { container } = render(<div><img src="a.png" /><button></button></div>);
  const results = await axe(container);
  expect(results.violations.map((v) => v.id).sort()).toEqual(['button-name', 'image-alt']); // verified
});

test('accessible markup passes', async () => {
  const { container } = render(<main><img src="a.png" alt="Logo" /><button>Save</button></main>);
  expect(await axe(container)).toHaveNoViolations();
});
```

- `axe` (axe-core) checks **static rules**: missing alt text, labels, names, invalid ARIA,
  duplicate IDs, list structure, landmark issues…
- Configure: `configureAxe({ rules: { region: { enabled: false } } })` to disable rules that don't
  make sense for isolated components (like "content should be in landmarks").
- ⚠️ **Colour contrast is not checked in jsdom** (no real layout/rendering). Use browser-based
  tools (Playwright + `@axe-core/playwright`, Storybook a11y addon, Lighthouse) for that.

### 35.5 Accessibility through queries (free a11y tests)

Testing Library's role queries fail if your UI isn't accessible:

```js
screen.getByRole('button', { name: /save/i });    // fails for a <div onClick> or an unlabeled icon button
screen.getByLabelText(/email/i);                  // fails if the input has no associated label
screen.getByRole('dialog', { name: /confirm/i }); // needs role="dialog" + aria-labelledby
```

Keyboard behaviour:

```js
const user = userEvent.setup();
await user.tab();
expect(screen.getByRole('button', { name: 'Save' })).toHaveFocus();
await user.keyboard('{Enter}');
await user.keyboard('{Escape}');                  // e.g. closes a modal
```

### 35.6 Accessibility checklist for component tests

- [ ] All interactive elements reachable by role + accessible name.
- [ ] Focus moves correctly (modals trap focus, return focus on close).
- [ ] Keyboard alternatives (Enter/Space/Escape/arrow keys) work.
- [ ] Errors announced (`role="alert"` / `aria-live`), inputs have `aria-invalid` / `aria-describedby`.
- [ ] `jest-axe` passes for key states (empty, error, loaded).
- [ ] Contrast and real screen reader behaviour checked outside Jest.

---

## Part C — Internationalisation (i18n)

### 35.7 Testing translated components with a real i18next instance (verified)

```jsx
import i18n from 'i18next';
import { initReactI18next, useTranslation, I18nextProvider } from 'react-i18next';

function Welcome({ name, count }) {
  const { t } = useTranslation();
  return <p>{t('welcome', { name })} {t('items', { count })}</p>;
}

function createI18n(lng) {
  const inst = i18n.createInstance();                 // fresh instance per test
  inst.use(initReactI18next).init({
    lng,
    fallbackLng: 'en',
    initAsync: false,                                 // synchronous init → no waiting in tests
    resources: {
      en: { translation: { welcome: 'Welcome, {{name}}!', items_one: '{{count}} item', items_other: '{{count}} items' } },
      fr: { translation: { welcome: 'Bienvenue, {{name}} !', items_one: '{{count}} article', items_other: '{{count}} articles' } },
    },
  });
  return inst;
}

test.each([
  ['en', 'Welcome, Ann! 2 items'],
  ['fr', 'Bienvenue, Ann ! 2 articles'],
])('renders %s', (lng, text) => {
  render(<I18nextProvider i18n={createI18n(lng)}><Welcome name="Ann" count={2} /></I18nextProvider>);
  expect(screen.getByText(text)).toBeInTheDocument();
});

test('plural "one"', () => {
  render(<I18nextProvider i18n={createI18n('en')}><Welcome name="Bo" count={1} /></I18nextProvider>);
  expect(screen.getByText('Welcome, Bo! 1 item')).toBeInTheDocument();
});
```

(`initAsync: false` is the i18next v24+ name; older versions used `initImmediate: false`.)

Strategies:

| Strategy | Pros | Cons |
| --- | --- | --- |
| Real i18n with real translation files | catches missing keys, plural bugs | tests break when copy changes |
| Real i18n with a small test resource set (above) | stable, tests plurals/interpolation | doesn't verify real files |
| Mock `useTranslation` to return keys (`t: (k) => k`) | simplest, tests assert keys | misses interpolation/plural logic |

💼 Many teams: unit/component tests with key-returning mocks or test resources, **plus** a
separate test that every locale file has the same keys as the default locale (a simple JSON
comparison) and no unused/missing keys.

### 35.8 `Intl`, dates, numbers (verified)

```js
const d = new Date('2024-01-01T23:30:00Z');
new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', dateStyle: 'medium' }).format(d);        // 'Jan 1, 2024'
new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Tokyo', dateStyle: 'medium' }).format(d); // 'Jan 2, 2024'
new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(1234.5);      // '1.234,50 €' (non-breaking space!)
```

Lessons:
- The same instant is a **different date** in another time zone → pass `timeZone` explicitly or run
  tests with `TZ=UTC` (Chapter 9 §9.7).
- `Intl` output may contain **non-breaking spaces** (` `) or narrow NBSP (` `, e.g. before
  AM/PM in recent ICU) — a classic "looks identical but toBe fails" bug. Compare with the exact
  string from a test run, or normalise whitespace.
- Node ships full ICU by default (since Node 13); minimal-ICU Docker images can produce different
  output → pin the Node image.
- Right-to-left languages: assert `dir="rtl"` on the root and mirrored layout via E2E.

## 35.9 Summary

- Storybook: `composeStories` turns stories into test fixtures; Storybook 10 needs
  `transformIgnorePatterns` for `@storybook|storybook` in Jest.
- a11y: role queries + keyboard tests + `jest-axe`; contrast needs a real browser.
- i18n: fresh i18n instance with `initAsync: false`; test plurals/interpolation; check locale files
  for missing keys; watch time zones and non-breaking spaces in `Intl` output.

**Next:** [Chapter 36 — Browser APIs in jsdom](36-browser-apis-in-jsdom.md)
