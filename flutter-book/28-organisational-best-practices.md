# Chapter 28 — Working on a Big Flutter Project in a Company: Standards, Code Review, Git, Upgrades, Collaboration & Playbooks

> **Goal:** Behave like an experienced engineer on day one: follow conventions, write reviewable code, handle upgrades and dependencies safely, collaborate with design/backend/QA/product, and know what to do in common team situations.

---

## 28.1 Your first weeks on an existing Flutter codebase 🗺️
1. **Run it**: follow README; note every undocumented step and fix the README (great first PR).
2. **Identify the stack**: Flutter version (`.fvmrc`/CI), state management, router, DI, networking, storage, architecture style, codegen tools, flavors, CI.
3. **Read the core**: `main*.dart`/bootstrap, router, DI setup, network client & interceptors, error handling, theme/design system, one complete feature end to end (UI → state → repository → API).
4. **Read the conventions**: `analysis_options.yaml`, CONTRIBUTING, PR template, ADRs, folder structure.
5. **Run the tests**; look at CI config.
6. **Ask** about release process, environments, test accounts, feature flags, monitoring dashboards.
7. **Ship something small** (bug fix) to learn the full workflow.

**Golden rule:** *Consistency beats personal preference.* Follow the existing patterns even if you'd choose differently; propose changes through discussion/ADR, not by mixing styles.

---

## 28.2 Coding standards checklist ✅
* `dart format` (CI enforced); lints (flutter_lints / very_good_analysis) with zero warnings.
* Naming: files `snake_case.dart`; classes `UpperCamelCase`; private widgets `_Foo` in same file when small.
* One public widget per file (generally); files < ~300–400 lines; extract widgets.
* `const` constructors; `final` fields; immutable models (freezed/equatable/records).
* No hard-coded strings (l10n), colours (theme), magic numbers (spacing tokens), URLs (config).
* No `print` (logger); no `dynamic` unless JSON/interop; no `!` unless proven safe; no empty `catch`.
* Dispose everything you create; cancel subscriptions; check `mounted`/`context.mounted` after awaits.
* Business logic out of widgets; widgets small & declarative.
* Imports: package imports (or relative — be consistent); no importing other features' internals.
* Public APIs documented with `///`.
* Tests for logic and critical UI; regression test for each bug fix.
* Accessibility: semantic labels, tap targets, text scaling.
* Feature flags for risky changes.

---

## 28.3 Git workflow & pull requests
* Branch naming: `feature/ABC-123-cart-coupons`, `fix/ABC-456-crash-on-logout`.
* Commits: small, meaningful; Conventional Commits (`feat:`, `fix:`, `refactor:`, `test:`, `chore:`) if the team uses them (enables automated changelogs).
* **PR size**: small (< ~400 lines changed of real code); split refactors from features.
* PR description: what & why, screenshots/videos for UI (light/dark, small/large screens), test steps, risks, linked ticket, migration notes.
* Generated files: follow team policy (commit `*.g.dart` or generate in CI) — consistency matters.
* Rebase/merge per team policy; keep main green; protected branches; required checks & reviews; CODEOWNERS for modules.

### Code review checklist (as reviewer and author) 👀
**Correctness**: Does it meet requirements? Edge cases (empty, error, loading, offline, long text, RTL, large fonts, slow network)? Null safety? Async races (double taps, out-of-order responses, setState after dispose)?
**Architecture**: Logic in right layer? Follows existing patterns? No new state management style sneaking in? Dependencies injected?
**Performance**: Unnecessary rebuilds? Heavy work in build? Lists lazy? Images sized? Leaks (dispose/cancel)?
**UI/UX**: Matches design (spacing tokens, typography, colours), responsive, accessible, dark mode, localization.
**Security/Privacy**: No secrets, no PII in logs, secure storage, input validation.
**Tests**: Present & meaningful; not brittle.
**Readability**: Names, small functions/widgets, comments for "why".
**Release**: Feature flagged? Analytics events? Backward compatible with APIs/older app versions? Migration for stored data?
Tone: be kind, specific, explain why, distinguish blocking issues vs nits ("nit:"), praise good work.

---

## 28.4 Dependency management policy
* Approval process for new dependencies (Chapter 2 checklist), documented in an ADR for big ones.
* Wrap third-party SDKs behind your own interfaces (analytics, crash reporting, payments, maps) → swap/mocking easy.
* Regular update cadence (e.g., monthly `flutter pub outdated` review; Renovate/Dependabot PRs); read changelogs for breaking changes; update one major at a time with tests.
* Avoid `dependency_overrides` in main branch without ticket & comment.
* Monitor abandoned packages; plan replacements early.
* License compliance (`flutter pub deps`, license checker; `LicenseRegistry`/`showLicensePage` for in-app attributions).

---

## 28.5 Flutter SDK upgrade playbook ⬆️
Flutter stable ships roughly quarterly; staying ≤ 1–2 versions behind keeps upgrades small.
1. Read the release notes & **breaking changes** page for every version you skip.
2. Create an upgrade branch; bump `.fvmrc`/CI version.
3. `flutter pub upgrade` (and needed major bumps); `dart fix --apply`.
4. Update Android toolchain if warned (Gradle, AGP, Kotlin, compileSdk/targetSdk, Java version); iOS (min deployment target, CocoaPods/SwiftPM, Xcode version).
5. Fix analyzer deprecations (e.g., `withOpacity` → `withValues`, `WillPopScope` → `PopScope`, `MaterialState` → `WidgetState`, `textScaleFactor` → `textScaler`, Material/Cupertino package migration).
6. Run full tests, goldens (expect diffs from framework visual changes — review carefully), integration tests on real devices.
7. Smoke test critical flows on Android/iOS (and web/desktop if shipped); release via internal track first.
8. Document notable changes for the team.

---

## 28.6 Collaborating with other roles 🤝
**Designers**
* Use Figma tokens → theme/ThemeExtension; agree on spacing scale, typography, components; request states (loading/empty/error/disabled/focus), dark mode, RTL, large text, tablet layouts.
* Clarify platform adaptation (Material vs Cupertino behaviours).
* Widgetbook/golden tests as shared component catalog.

**Backend**
* API contracts first (OpenAPI/GraphQL schema), generated clients, mock servers for parallel development.
* Agree on error format (codes + messages), pagination style (cursor), date formats (ISO 8601 UTC), versioning, idempotency keys, rate limits, auth flows (token lifetimes, refresh).
* Backward compatibility: old app versions in the wild for months — never break existing endpoints without versioning; feature flags server-side.

**QA**
* Testable builds per PR (Firebase App Distribution), test accounts, feature flag toggles in debug menus, environment switcher (dev builds only), stable keys/semantics for automation, reproducible bug reports (steps, device, logs, video).

**Product/PM**
* Estimate with buffers for platform specifics (permissions, store review, native SDKs), clarify acceptance criteria incl. edge cases & analytics; release timelines vs store review times; communicate risk early.

---

## 28.7 Debug menu (hidden developer tools) — common in companies
Include in non-prod builds: environment switcher, feature flag overrides, network logs viewer (e.g., `chucker_flutter`, `alice`), crash test button, clear data/reset onboarding, view device info/FCM token, mock locations, slow animations toggle, accessibility debugging.

---

## 28.8 Documentation
* README (setup, run, flavors, test, release), CONTRIBUTING (conventions), ARCHITECTURE.md (layers, folders, diagrams), ADRs (`docs/adr/0001-use-riverpod.md`: context, decision, consequences), API docs (`dart doc`), runbooks (release, incident response), onboarding guide.

---

## 28.9 Technical debt management
* Track debt explicitly (tickets with impact), allocate % of each sprint, boy-scout rule (leave code better), refactor behind tests, strangler pattern for legacy modules (e.g., migrate GetX features to Bloc one by one), deprecate internal APIs with `@Deprecated('Use X')`.

---

## 28.10 Situational playbook (what to do when…) 📘

| Situation | Action |
|---|---|
| You disagree with the architecture | Raise with data in an RFC/ADR; propose incremental path; respect team decision; don't fork patterns silently |
| Deadline is impossible | Communicate early with options (scope cut, phased release, feature flag), not silent overtime with hacks |
| A teammate's PR introduces a bug in prod | Blameless: fix forward, add tests/process improvements, postmortem focusing on systems |
| You must use an unfamiliar native SDK | Spike/prototype in a separate branch; Pigeon-based plugin wrapper; document; estimate with buffer |
| Store rejection | Read the guideline cited; reply in Resolution Center with clarifications or fix; keep demo accounts ready; appeal if wrong |
| Huge widget file (2,000 lines) | Refactor incrementally: extract widgets, move logic into state layer, add tests first |
| Flaky CI tests | Quarantine with ticket, fix root cause (timing, shared state), never just retry forever |
| Release day crash spike | Halt rollout, flag off, hotfix, communicate (Chapter 24 §24.8) |
| Inconsistent state management across modules | Pick standard via ADR, document migration path, migrate opportunistically |
| Junior asks for help | Pair program, explain why, point to docs/chapters, review kindly |
| Need to estimate a feature | Break down: UI screens, states, API integration, edge cases, tests, platform specifics, analytics, l10n, accessibility, review/QA/store time |
| Security issue found | Follow responsible disclosure internally, hotfix, rotate secrets, notify per policy |

---

## 28.11 Agile & delivery basics (interview behavioural readiness)
* Scrum (sprints, standups, planning, review, retro) / Kanban; story points; Definition of Done (code + tests + review + docs + analytics + accessibility + l10n + QA).
* Communicate blockers early; demo progress; write clear tickets (context, acceptance criteria, designs, API).

---

## 28.12 Interview Questions — Professional practice

**Q1. How do you ensure code quality in a team?** Lints & formatting in CI, code reviews with checklist, tests, architecture conventions & ADRs, pair programming, static analysis, definition of done.

**Q2. How do you handle Flutter upgrades in a large project?** Scheduled upgrades, read breaking changes, branch, dart fix, toolchain updates, full test suites & device testing, staged rollout.

**Q3. How do you decide whether to add a package?** Maintenance, popularity, publisher, platform support, license, size, native permissions, alternatives, ability to wrap/replace.

**Q4. How do you work with backend teams?** Contract-first APIs, generated clients, mock servers, agreed error/pagination/versioning formats, backward compatibility.

**Q5. Tell me about a challenging bug you fixed.** Use STAR (Situation, Task, Action, Result): describe symptoms, investigation tools (DevTools, logs), root cause, fix, prevention (tests/monitoring).

**Q6. How do you manage technical debt?** Make it visible, prioritize by impact, allocate capacity, refactor behind tests incrementally, avoid big-bang rewrites.

**Q7. How do you mentor juniors?** Pairing, constructive reviews, documentation, gradual ownership, psychological safety.
