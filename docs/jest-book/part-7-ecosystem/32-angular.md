# Chapter 32 — Testing Angular with Jest

> 🧸 **Explain it like I'm 5**
>
> Angular is a big toy factory with its own rules: components, services, and a "TestBed" that
> builds a mini-factory for each test. `jest-preset-angular` teaches Jest Angular's rules, so you
> can test Angular parts with Jest instead of the older Karma + Jasmine setup.

Verified (October 2026) with **Angular 21.2**, **jest-preset-angular 17.0.3**, **Jest 30.5.2**,
TypeScript 5.9, zoneless change detection, standalone components and signals: 4 tests pass.
Runnable copy: [`examples/frameworks/angular`](../examples/frameworks/angular).

---

## 32.1 Why Jest for Angular?

Angular historically shipped Karma + Jasmine (real browser). Karma is deprecated; many teams moved
to Jest via `jest-preset-angular` (fast, jsdom, snapshot support, Jest mocking). The Angular CLI
also offers its own newer test builders; choose based on your CLI version, but the TestBed code
below is the same.

Compatibility (from `jest-preset-angular` 17's peer dependencies): **Jest ^30**, **jsdom ≥ 26**,
**TypeScript ≥ 5.8**, **Angular ≥ 20 and < 23**. Older Angular versions need older preset majors.

## 32.2 Setup (verified)

```bash
npm i -D jest jest-environment-jsdom jest-preset-angular @types/jest typescript
```

```js
// jest.config.js
const { createCjsPreset } = require('jest-preset-angular/presets');

module.exports = {
  ...createCjsPreset(),            // transform with ts-jest-based Angular transformer, jsdom, serializers
  setupFilesAfterEnv: ['<rootDir>/setup-jest.ts'],
};
```

What the preset contains (printed from `createCjsPreset()`):

```json
{
  "testEnvironment": "jsdom",
  "moduleFileExtensions": ["ts", "html", "js", "json", "mjs"],
  "snapshotSerializers": [
    "jest-preset-angular/build/serializers/html-comment",
    "jest-preset-angular/build/serializers/ng-snapshot",
    "jest-preset-angular/build/serializers/no-ng-attributes"
  ],
  "transformIgnorePatterns": ["node_modules/(?!(.*\\.mjs$|@angular/common/locales/.*\\.js$))"],
  "transform": {
    "^.+\\.(ts|js|mjs|html|svg)$": ["jest-preset-angular", {
      "tsconfig": "<rootDir>/tsconfig.spec.json",
      "stringifyContentPathRegex": "\\.(html|svg)$"
    }]
  }
}
```

Note how it already transforms **`.mjs`** files in node_modules — Angular packages ship as ESM
(`.mjs`), the exact problem from Chapter 15.

```ts
// setup-jest.ts — choose ONE
import { setupZonelessTestEnv } from 'jest-preset-angular/setup-env/zoneless';
setupZonelessTestEnv();

// For zone.js-based apps instead:
// import { setupZoneTestEnv } from 'jest-preset-angular/setup-env/zone';
// setupZoneTestEnv();
```

```json
// tsconfig.spec.json
{
  "extends": "./tsconfig.json",
  "compilerOptions": { "module": "CommonJS", "isolatedModules": true },
  "include": ["src/**/*.ts"]
}
```

`isolatedModules: true` makes the ts-jest-based transform much faster (no full type-check per
file — run `ng build`/`tsc` for types).

## 32.3 Component, service and tests (verified)

```ts
// greeting.service.ts
import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class GreetingService {
  greet(name: string): string { return `Hello, ${name}!`; }
}
```

```ts
// greeter.component.ts — standalone, signals, input()/output()
import { Component, inject, input, output, signal } from '@angular/core';
import { GreetingService } from './greeting.service';

@Component({
  selector: 'app-greeter',
  standalone: true,
  template: `
    <h1>{{ message() }}</h1>
    <button (click)="like()">Like ({{ likes() }})</button>
  `,
})
export class GreeterComponent {
  private service = inject(GreetingService);
  name = input('world');
  liked = output<number>();
  likes = signal(0);
  message() { return this.service.greet(this.name()); }
  like() { this.likes.update((n) => n + 1); this.liked.emit(this.likes()); }
}
```

```ts
// greeter.component.spec.ts
import { TestBed } from '@angular/core/testing';
import { render, screen } from '@testing-library/angular';
import { GreeterComponent } from './greeter.component';
import { GreetingService } from './greeting.service';

describe('GreeterComponent (TestBed)', () => {
  it('renders the greeting from the service', async () => {
    await TestBed.configureTestingModule({ imports: [GreeterComponent] }).compileComponents();
    const fixture = TestBed.createComponent(GreeterComponent);
    fixture.componentRef.setInput('name', 'Ann');      // signal inputs: setInput
    await fixture.whenStable();                         // zoneless: wait for change detection
    expect(fixture.nativeElement.querySelector('h1').textContent).toBe('Hello, Ann!');
  });

  it('uses a mocked service', async () => {
    const fake = { greet: jest.fn(() => 'Hi from mock') };
    await TestBed.configureTestingModule({
      imports: [GreeterComponent],
      providers: [{ provide: GreetingService, useValue: fake }],   // DI override
    }).compileComponents();
    const fixture = TestBed.createComponent(GreeterComponent);
    await fixture.whenStable();
    expect(fixture.nativeElement.textContent).toContain('Hi from mock');
    expect(fake.greet).toHaveBeenCalledWith('world');
  });
});

describe('GreeterComponent (Testing Library)', () => {
  it('emits likes', async () => {
    const liked = jest.fn();
    await render(GreeterComponent, { inputs: { name: 'Bo' }, on: { liked } });
    screen.getByRole('button', { name: /like/i }).click();
    expect(await screen.findByRole('button', { name: 'Like (1)' })).toBeTruthy();
    expect(liked).toHaveBeenCalledWith(1);
    expect(screen.getByRole('heading').textContent).toBe('Hello, Bo!');
  });
});

describe('GreetingService', () => {
  it('greets', () => {
    expect(TestBed.inject(GreetingService).greet('Cy')).toBe('Hello, Cy!');
  });
});
```

## 32.4 Angular testing essentials

| Topic | How |
| --- | --- |
| Mock a dependency | `providers: [{ provide: Service, useValue: fake }]` (or `useClass`, `useFactory`) |
| Spy on a real service | `jest.spyOn(TestBed.inject(Service), 'method')` |
| Inputs | `fixture.componentRef.setInput('name', v)` (works for signal and decorator inputs) |
| Outputs | subscribe: `component.liked.subscribe(spy)`, or Testing Library `on: { liked: spy }` |
| Change detection | zoneless: `await fixture.whenStable()`; zone-based: `fixture.detectChanges()` |
| HTTP | `provideHttpClient(), provideHttpClientTesting()` + `HttpTestingController` (`expectOne(url).flush(data)`, then `verify()`) |
| Router | `provideRouter(routes)` + `RouterTestingHarness` |
| Timers | zone-based: `fakeAsync` + `tick()`; zoneless: Jest fake timers (`jest.useFakeTimers()` + `advanceTimersByTimeAsync`) |
| Forms | interact via DOM (`user.type`) and assert form state/validation messages |
| Pipes / directives | pipes are classes → `new MyPipe().transform(x)`; directives via a host test component |
| Snapshot | the preset's serializers strip Angular noise (`ng-reflect-*`, comments) |

HTTP example:

```ts
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';

beforeEach(() => TestBed.configureTestingModule({
  providers: [UsersApi, provideHttpClient(), provideHttpClientTesting()],
}));

it('loads users', () => {
  const api = TestBed.inject(UsersApi);
  const http = TestBed.inject(HttpTestingController);
  let result;
  api.list().subscribe((u) => (result = u));
  http.expectOne('/api/users').flush([{ id: 1 }]);
  expect(result).toEqual([{ id: 1 }]);
  http.verify();                    // no unexpected requests
});
```

## 32.5 Migrating Karma/Jasmine → Jest (Angular)

1. Install the packages above; remove `karma*`, `jasmine*` (and the `test` target that uses Karma).
2. Add `jest.config.js`, `setup-jest.ts`, `tsconfig.spec.json` (`"types": ["jest"]`).
3. Replace Jasmine APIs (Chapter 25 §25.4): `jasmine.createSpyObj('S', ['a','b'])` →
   `{ a: jest.fn(), b: jest.fn() }`; `spyOn(x,'m').and.returnValue(v)` →
   `jest.spyOn(x,'m').mockReturnValue(v)`; `.calls.mostRecent().args` → `.mock.lastCall`;
   `toHaveBeenCalledOnceWith` → `toHaveBeenCalledTimes(1)` + `toHaveBeenCalledWith`.
4. `jest-preset-angular` ships migration notes and examples; `npx jest-codemods` helps with Jasmine.

## 32.6 Common Angular + Jest errors

| Error | Fix |
| --- | --- |
| `Need to call TestBed.initTestEnvironment() first` | setup file missing from `setupFilesAfterEnv` |
| `SyntaxError: Cannot use import statement outside a module` in `@angular/*.mjs` | custom `transformIgnorePatterns` dropped the preset's `.mjs` rule — keep it |
| `NG0303: Can't bind to 'x' since it isn't a known property` | missing import in the standalone component/test `imports` |
| `NullInjectorError: No provider for X` | add the provider (or `provideHttpClient()` etc.) to `configureTestingModule` |
| Peer dependency conflicts on install | match preset major to Angular & Jest versions (§32.1) |
| Slow tests | `isolatedModules: true` in `tsconfig.spec.json` |

## 32.7 Summary

- `jest-preset-angular` 17: Jest 30, Angular 20–22, `createCjsPreset()`, setup with
  `setupZonelessTestEnv` or `setupZoneTestEnv`.
- TestBed + DI overrides for mocks; `setInput` + `whenStable` for signal components.
- Testing Library for user-centric tests; `HttpTestingController` for HTTP.

**Next:** [Chapter 33 — Next.js](33-nextjs.md)
