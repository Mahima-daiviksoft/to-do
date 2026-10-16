# Chapter 31 — Testing Vue and Svelte with Jest

> 🧸 **Explain it like I'm 5**
>
> Vue and Svelte components are written in their own special file types (`.vue`, `.svelte`).
> Jest can't read those directly, so you give it a **translator** for each one. After that,
> testing feels just like React: render the component, click things, check the screen.

Everything here was run on real installs (October 2026). Runnable copies live in
[`examples/frameworks/vue`](../examples/frameworks/vue) and
[`examples/frameworks/svelte`](../examples/frameworks/svelte).

| Stack | Versions verified | Result |
| --- | --- | --- |
| Vue 3.5 + `@vue/vue3-jest` 29.2 + Jest **30.5.2** + Babel **7** | 2 tests | ✅ pass |
| Vue + `@vue/vue3-jest` + **Babel 8** | | ❌ fails (see 31.3) |
| Svelte **5.57** + `svelte-jester` 5 + Jest **30.3.0** (native ESM) | 1 test | ✅ pass |
| Svelte 5 + `svelte-jester` + Jest **30.4.1 / 30.5.0 / 30.5.2** | | ❌ fails (see 31.6) |

---

## Part A — Vue 3

### 31.1 Tools

| Package | Role |
| --- | --- |
| `@vue/vue3-jest` | Jest transformer for `.vue` single-file components (SFCs) |
| `@vue/test-utils` (VTU) | Vue's official testing utilities: `mount`, `shallowMount`, `wrapper.find`, `trigger`, `emitted` |
| `@testing-library/vue` | Testing Library API (`render`, `screen`, roles) on top of VTU |
| `babel-jest` + `@babel/preset-env` | for the `<script>` blocks and test files |
| `jest-environment-jsdom` | DOM |

### 31.2 Configuration (verified)

```js
// jest.config.js
module.exports = {
  testEnvironment: 'jsdom',
  // Vue's package "exports" pick a browser ESM build under jsdom; use the Node builds instead:
  testEnvironmentOptions: { customExportConditions: ['node', 'node-addons'] },
  moduleFileExtensions: ['js', 'json', 'vue'],
  transform: {
    '^.+\\.vue$': '@vue/vue3-jest',
    '^.+\\.js$': 'babel-jest',
  },
};
```

```js
// babel.config.js
module.exports = { presets: [['@babel/preset-env', { targets: { node: 'current' } }]] };
```

`customExportConditions` matters: without it, jsdom's default `['browser']` condition makes
`@vue/test-utils`/`vue` resolve to browser ESM bundles → "Must use import to load ES Module" /
"Unexpected token 'export'".

### 31.3 ⚠️ Version traps found while verifying

1. **`@vue/vue3-jest` declares peer support for Jest 29 only** (`"jest": "29.x"`). It nevertheless
   **works with Jest 30.5.2** (verified), but npm refuses to install without
   `--legacy-peer-deps` (the example folder ships an `.npmrc` with `legacy-peer-deps=true`).
2. **Babel 8** became `@babel/core`'s `latest` tag in mid-2026. `@vue/vue3-jest` still calls
   `babel.transform()` synchronously, which Babel 8 removed:

   ```
   Starting from Babel 8.0.0, the 'transform' function expects a callback.
   If you need to call it synchronously, please use 'transformSync'.
   ```

   Fix: pin `"@babel/core": "^7.28.0"` (and `@babel/preset-env@^7`). `babel-jest` 30 itself works
   fine with Babel 8 (verified in the book's main lab) — it's only older plugins/transformers that
   break.

### 31.4 The component and tests (verified)

```vue
<!-- Counter.vue -->
<template>
  <div>
    <p data-testid="count">Count: {{ count }}</p>
    <button @click="increment">Add</button>
    <p v-if="count >= max" role="alert">Max reached</p>
  </div>
</template>

<script setup>
import { ref } from 'vue';
const props = defineProps({ start: { type: Number, default: 0 }, max: { type: Number, default: 3 } });
const emit = defineEmits(['changed']);
const count = ref(props.start);
function increment() {
  if (count.value < props.max) {
    count.value++;
    emit('changed', count.value);
  }
}
</script>
```

```js
// Counter.test.js
import { mount } from '@vue/test-utils';
import { render, screen } from '@testing-library/vue';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import Counter from './Counter.vue';

test('VTU: increments and emits', async () => {
  const wrapper = mount(Counter, { props: { start: 1 } });
  await wrapper.get('button').trigger('click');           // await: Vue updates the DOM asynchronously
  expect(wrapper.get('[data-testid="count"]').text()).toBe('Count: 2');
  expect(wrapper.emitted('changed')).toEqual([[2]]);
});

test('Testing Library: shows alert at max', async () => {
  const user = userEvent.setup();
  render(Counter, { props: { start: 2, max: 3 } });
  await user.click(screen.getByRole('button', { name: 'Add' }));
  expect(screen.getByRole('alert')).toHaveTextContent('Max reached');
});
```

### 31.5 Vue testing essentials

| Topic | How |
| --- | --- |
| DOM updates are async | `await wrapper.trigger(...)`, `await wrapper.setProps(...)`, or `await nextTick()` |
| Emitted events | `wrapper.emitted('name')` → array of argument arrays |
| Props / slots | `mount(C, { props: {...}, slots: { default: 'text', header: '<h1/>' } })` |
| Global plugins (router, Pinia, i18n) | `mount(C, { global: { plugins: [router, pinia], stubs: {...}, mocks: {...}, provide: {...} } })` |
| Stubbing children | `global: { stubs: { HeavyChart: true } }` or `shallowMount` (prefer full mount + selective stubs) |
| Pinia stores | `@pinia/testing`: `createTestingPinia({ createSpy: jest.fn, initialState: {...} })` |
| Vue Router | create a real router with `createMemoryHistory()`, `await router.push('/x'); await router.isReady()` |
| Async setup / Suspense | wrap in `<Suspense>` or use `flushPromises()` from VTU |
| Composables | call inside a tiny test component, or directly if they don't need a component instance |

Composable example:

```js
import { mount } from '@vue/test-utils';
import { defineComponent, h } from 'vue';

function withSetup(composable) {
  let result;
  mount(defineComponent({ setup() { result = composable(); return () => h('div'); } }));
  return result;
}
```

💼 Vite-based Vue projects usually use **Vitest** (shares Vite config, native `.vue` handling). Jest
is common in older Vue CLI / webpack projects and in mixed monorepos. The test code is almost
identical either way.

---

## Part B — Svelte 5

### 31.6 The situation in 2026 (verified)

- Svelte 4+ compiles components to **ES modules only**, so Jest must run in **native ESM mode**
  (`--experimental-vm-modules`). `svelte-jester` explicitly refuses CJS mode:
  `Jest is being called in CJS mode. You must use ESM mode in Svelte 4+`.
- `@testing-library/svelte` v5 lists **Vitest** (and Vite) as peer dependencies; the Svelte team
  recommends Vitest.
- **Regression found:** with Jest **30.4.x and 30.5.x**, Jest calls the transformer's
  **synchronous** `process()` even for ESM imports, so `svelte-jester` throws the CJS-mode error.
  The identical project passes on Jest **30.3.0** and 30.2.0. (Verified on 30.2.0 ✅, 30.3.0 ✅,
  30.4.1 ❌, 30.5.0 ❌, 30.5.2 ❌.) Until fixed, pin Jest 30.3.0 for Svelte, or use Vitest.

### 31.7 Working setup (Jest 30.3.0, verified)

```json
{
  "type": "module",
  "scripts": { "test": "node --experimental-vm-modules node_modules/jest/bin/jest.js" },
  "devDependencies": {
    "jest": "30.3.0",
    "jest-environment-jsdom": "30.3.0",
    "svelte": "^5.0.0",
    "svelte-jester": "^5.0.0"
  }
}
```

```js
// jest.config.js (ESM because "type": "module")
export default {
  testEnvironment: 'jsdom',
  testEnvironmentOptions: { customExportConditions: ['browser'] }, // Svelte's client runtime
  moduleFileExtensions: ['js', 'svelte'],
  extensionsToTreatAsEsm: ['.svelte'],
  transform: { '^.+\\.svelte$': 'svelte-jester' },
};
```

```svelte
<!-- Greeter.svelte (Svelte 5 runes) -->
<script>
  let { name = 'world' } = $props();
  let count = $state(0);
</script>
<h1>Hello {name}!</h1>
<button onclick={() => count++}>Clicked {count}</button>
```

```js
// Greeter.test.js
import { mount, unmount, flushSync } from 'svelte';
import Greeter from './Greeter.svelte';

test('renders and updates', () => {
  const target = document.createElement('div');
  const app = mount(Greeter, { target, props: { name: 'Ann' } });
  expect(target.querySelector('h1').textContent).toBe('Hello Ann!');

  target.querySelector('button').click();
  flushSync();                                   // apply pending reactive updates synchronously
  expect(target.querySelector('button').textContent).toBe('Clicked 1');

  unmount(app);
});
```

With `customExportConditions: ['browser']` Svelte loads its client runtime (its server runtime
does not support `mount`).

### 31.8 Recommendation

| Project | Use |
| --- | --- |
| New SvelteKit/Vite app | **Vitest** + `@testing-library/svelte` |
| Existing Jest monorepo that must include Svelte | Jest 30.3.0 in ESM mode for the Svelte package (separate project), watch the Jest issue tracker for the 30.4+ regression |
| Svelte 3 legacy | `svelte-jester` in CJS mode still works (it supports sync transform for Svelte 3) |

## 31.9 Summary

- Vue: `@vue/vue3-jest` transformer, `customExportConditions: ['node','node-addons']`, Babel 7,
  `--legacy-peer-deps` with Jest 30; test with VTU or Testing Library; always `await` DOM updates.
- Svelte 5: ESM-only → native ESM Jest; `svelte-jester` works up to Jest 30.3.0; Vitest is the
  mainstream choice.

**Next:** [Chapter 32 — Angular](32-angular.md)
