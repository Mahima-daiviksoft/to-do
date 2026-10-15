# Chapter 30 — Interview Question Bank, Part 2: Intermediate (2–5 years)

> These are the questions that decide most mid-level interviews. Answers include the "why" and the trade-offs interviewers want to hear.

---

## A. Widgets, rendering & lifecycle

**1. Explain the widget, element and render object trees.**
Widgets are immutable configs rebuilt often; elements are long-lived instances that hold position, lifecycle and State and link widgets to render objects; render objects do layout, paint and hit testing. Flutter diffs new widgets against existing elements (`canUpdate`: same runtimeType & key) to reuse expensive objects.

**2. What happens when you call setState?**
The callback runs synchronously; the element is marked dirty and a frame scheduled; on the next frame, dirty elements rebuild in depth order, then layout/paint/composite only what changed.

**3. Full StatefulWidget lifecycle?**
createState → initState → didChangeDependencies → build → (didUpdateWidget/setState/didChangeDependencies → build)* → deactivate → (activate) → dispose; reassemble on hot reload.

**4. When is `didChangeDependencies` called?**
Immediately after initState and whenever an InheritedWidget the State depends on changes (e.g., Theme, MediaQuery, Locale, Provider).

**5. Why can't we call `Theme.of(context)` in initState?**
Dependencies on inherited widgets must be registered when the element is fully mounted; Flutter asserts in debug. Use didChangeDependencies.

**6. When do you need keys? Give an example.**
When stateful widgets of the same type are reordered/removed in a collection — e.g., a reorderable todo list with checkboxes holding local state: without keys, state stays at positions; with `ValueKey(todo.id)` it follows the item.

**7. ValueKey vs ObjectKey vs UniqueKey vs GlobalKey?**
ValueKey compares value equality; ObjectKey compares identity of an object; UniqueKey is unique each instance (forces new element); GlobalKey is unique app-wide and provides access to State/context and reparenting.

**8. What is InheritedWidget and how does Provider use it?**
A widget that exposes data to descendants with O(1) lookup and notifies dependents when `updateShouldNotify` returns true. Provider wraps InheritedWidget (InheritedProvider) to simplify exposing/listening and to handle disposal.

**9. Difference between `dependOnInheritedWidgetOfExactType` and `getInheritedWidgetOfExactType`?**
The first registers a dependency (rebuild on change); the second just reads.

**10. Why are widgets immutable?**
Simplifies diffing and reasoning; allows const canonicalization; changes are expressed by creating new widgets; mutable state lives in State/elsewhere.

**11. What does the `const` constructor do at runtime for widgets?**
Instances are canonicalized at compile time; identical instance on rebuild lets the element skip updating that subtree.

**12. Explain the "constraints go down, sizes go up" rule with an example of an overflow fix.**
Row gives unbounded width to non-flex children; a long Text tries to be its full width and overflows. Wrapping it in Expanded gives it a bounded width (remaining space), and `overflow: ellipsis` handles truncation.

**13. What causes "Vertical viewport was given unbounded height"?**
A ListView (wants infinite height) inside a Column/other scrollable (unbounded height). Fix with Expanded/SizedBox or slivers.

**14. What is the difference between `MediaQuery.of(context).size` and `MediaQuery.sizeOf(context)`?**
sizeOf subscribes only to size changes (InheritedModel aspect); `of` rebuilds on any MediaQuery change (e.g., keyboard insets).

**15. What is LayoutBuilder vs MediaQuery for responsiveness?**
LayoutBuilder gives parent constraints (component-level), MediaQuery gives window info (app-level).

**16. What is a `RepaintBoundary`?**
Isolates painting into its own layer so repaints don't propagate; useful for frequently changing subtrees.

**17. What are slivers and when do you use CustomScrollView?**
Lazy scrollable building blocks with sliver protocol; CustomScrollView combines multiple slivers (app bars, lists, grids) into one scroll with effects.

**18. How do you preserve state in tabs/PageView?**
AutomaticKeepAliveClientMixin with `wantKeepAlive`, PageStorageKey, IndexedStack, or state outside widgets.

**19. What is `addPostFrameCallback` and when do you use it?**
Runs a callback after the current frame is rendered; used to show dialogs after build, measure sizes, or trigger navigation from initState safely.

**20. What is the difference between `Navigator 1.0` and `2.0`?**
Imperative push/pop vs declarative page lists synced with app state & URLs (Router API).

---

## B. State management

**21. How do you decide between setState and a state management library?**
setState for local ephemeral UI state; libraries for shared app state, business logic separation, testability, async/caching needs.

**22. Explain Provider's `watch`, `read`, `select`.**
watch: listen & rebuild; read: one-time access in callbacks; select: rebuild only when a derived value changes.

**23. What is `ChangeNotifierProvider.value` vs `create`?**
create instantiates and disposes the notifier; value provides an existing instance without disposing it.

**24. Riverpod vs Provider?**
Riverpod is compile-safe, context-independent, supports multiple same-type providers, autoDispose/family, built-in async (AsyncValue), easy overrides for tests.

**25. Explain ref.watch vs ref.read vs ref.listen.**
watch rebuilds/recomputes on change (in build); read is a one-time read (callbacks); listen triggers side effects.

**26. What is AsyncValue and how do you render it?**
Union of loading/data/error; render via `when` or pattern matching on AsyncData/AsyncError/AsyncLoading.

**27. Explain the Bloc pattern and its components.**
Events in, states out via streams; `on<Event>` handlers call repositories and emit immutable states; UI uses BlocBuilder/BlocListener; BlocProvider for DI.

**28. Bloc vs Cubit?**
Cubit: functions emitting states; Bloc: events processed by handlers with transformers (debounce, droppable, restartable) and full traceability.

**29. Why might BlocBuilder not rebuild after emit?**
New state equals old state (mutated list or Equatable props missing) — Bloc skips equal states.

**30. How do you handle one-time events like navigation or snackbars?**
BlocListener / ref.listen / listening to a stream of effects; not inside build logic. Avoid storing "show snackbar" as permanent state without consuming it.

**31. What is `Equatable` / why do we need value equality?**
Provides `==`/hashCode based on props → states compare by value → proper deduplication and testing.

**32. How do you combine multiple states (e.g., filters + data)?**
Riverpod: provider that watches both. Bloc: combine streams in a repository or listen to one bloc and add events to another in UI; or a single bloc owning both.

**33. What is the difference between ephemeral and app state?**
Local vs shared/persistent; examples: current tab vs logged-in user.

**34. Describe how you'd structure state for a paginated list with pull-to-refresh and errors.**
State: items, page/cursor, status (initial/loading/success/failure), hasMore, isLoadingMore, error; events/methods: fetchFirst, fetchMore (guarded, droppable), refresh (reset); UI: footer loader, retry, empty view.

**35. What is GetX and its criticisms?**
All-in-one state/DI/routing; criticized for magic/global state, testability, coupling and maintenance concerns.

---

## C. Async & Dart depth

**36. Explain the event loop and microtasks.**
After synchronous code, Dart drains the microtask queue fully, then processes one event, then microtasks again. Futures from timers/IO go to event queue; completion callbacks and scheduleMicrotask go to microtask queue.

**37. Predict the output:**
```dart
void main() {
  print('A');
  Future(() => print('B'));
  Future.microtask(() => print('C'));
  print('D');
}
```
`A D C B`.

**38. How do you run network calls in parallel?**
Start futures then `await Future.wait([...])` or records `(f1, f2).wait`.

**39. What is an isolate and when do you use it?**
Separate memory/thread for CPU-heavy work (JSON parsing, image processing) to keep UI smooth; `Isolate.run`/`compute`.

**40. Why does `items.forEach((i) async => await upload(i))` not wait?**
forEach ignores returned futures; use `for` loop with await or `Future.wait`.

**41. Single-subscription vs broadcast stream?**
One listener with buffering vs many listeners without buffering.

**42. How do you debounce user input?**
Timer cancel/restart, rxdart `debounceTime`, Bloc transformers, Riverpod delay + dispose check.

**43. What are sealed classes and pattern matching used for in Flutter apps?**
Modelling finite states/results with exhaustive switches (e.g., UI states, API results), with destructuring.

**44. What is a factory constructor? Where used?**
Constructor that can return existing/subtype instances: fromJson, singletons, caches.

**45. What are extension methods? Example in Flutter?**
Add methods to existing types: `context.theme`, `String.capitalized`.

**46. What is `late final` useful for in State?**
Non-nullable fields initialized in initState (controllers) or lazily.

**47. What's the difference between `Iterable` and `List`?**
Iterable is lazy & sequential access; List is indexed and materialized.

**48. Mixins: what does `on` do?**
Restricts which classes can use the mixin (must extend/implement the `on` type), allowing the mixin to call its members.

**49. Explain records and give a use case.**
Anonymous immutable tuples with structural equality; return multiple values like `(User, List<Order>)`.

**50. What are class modifiers (`base`, `interface`, `final`, `sealed`)?**
Control extension/implementation outside the library; sealed enables exhaustiveness.

---

## D. Networking, storage & data

**51. How do you structure networking in an app?**
API client (Dio) with interceptors → remote data sources/services → repositories mapping DTOs to domain models & errors → state layer.

**52. How do you implement token refresh?**
Interceptor catching 401, single refresh (QueuedInterceptor/lock), retry original request, logout on failure, separate client for refresh.

**53. How do you serialize JSON at scale?**
json_serializable/freezed codegen; parse large payloads in isolates; handle nulls/unknown enum values.

**54. Where do you store tokens and why not SharedPreferences?**
Secure storage (Keychain/Keystore) because prefs are unencrypted.

**55. sqflite vs Drift vs Hive?**
Raw SQL vs typed reactive SQL with migrations vs simple key-value boxes (maintenance status: community fork).

**56. How do you design offline support?**
Local DB as source of truth, sync queue, conflict resolution, connectivity awareness, optimistic UI.

**57. How do you cancel an in-flight request when the user leaves a screen?**
Dio CancelToken cancelled in dispose / provider onDispose / bloc close.

**58. How do you handle pagination?**
Offset or cursor, guarded loadMore, hasMore flag, merging results, dedup, refresh reset.

**59. How do you cache API responses?**
HTTP cache interceptor, in-memory with TTL in repository, persistent DB cache with stale-while-revalidate.

**60. How do you handle different environments' base URLs?**
Flavors + dart-define(-from-file) → AppConfig injected into Dio.

---

## E. Navigation, platform & UI features

**61. How do you implement authentication-aware routing?**
go_router redirect + refreshListenable bound to auth state; preserve original location.

**62. go vs push in go_router?**
go: navigate to URL with stack built from route hierarchy; push: add on top of current stack.

**63. How do you handle Android back button / predictive back?**
PopScope (`canPop`, `onPopInvokedWithResult`); avoid deprecated WillPopScope.

**64. How do deep links work?**
App Links/Universal Links configuration + domain verification files; router maps URL to screens.

**65. What are platform channels? Give a real example.**
MethodChannel to call native APIs not covered by plugins (e.g., reading a vendor SDK's device ID); EventChannel for native streams (sensor updates).

**66. What is Pigeon and why use it?**
Generates type-safe channel code, removing stringly-typed errors.

**67. How do you request runtime permissions?**
permission_handler with manifest/Info.plist declarations; contextual requests; handle permanently denied.

**68. How do push notifications work in different app states?**
onMessage (foreground → show local notification), onMessageOpenedApp (background tap), getInitialMessage (terminated tap), onBackgroundMessage handler (top-level, vm:entry-point).

**69. How do you implement localization?**
flutter_localizations + gen-l10n ARB files, ICU plurals; RTL support with directional widgets.

**70. How do you support tablets/large screens?**
Breakpoints with LayoutBuilder, adaptive navigation (bar/rail/drawer), master-detail, constrained content widths.

**71. How do you implement custom themes/design tokens?**
ColorScheme.fromSeed + component themes + ThemeExtension for custom tokens; design system package.

**72. Implicit vs explicit animations?**
Implicit animate property changes automatically; explicit use AnimationController for full control.

**73. How do you create a shimmer/skeleton loader?**
Shimmer package or custom ShaderMask with LinearGradient animated by a controller; skeleton widgets with fixed sizes to avoid layout shift.

**74. How do you build a custom chart or shape?**
CustomPainter with Canvas; shouldRepaint; repaint listenable for animation.

**75. How do you make a widget accessible?**
Semantics labels, tooltips, contrast, tap targets, text scaling, focus order.

---

## F. Testing, performance & release

**76. Unit vs widget vs integration tests?**
Pure logic vs UI component in test environment vs full app on device.

**77. pump vs pumpAndSettle?**
Single frame vs pump until no scheduled frames (fails on infinite animations).

**78. How do you mock an API in tests?**
Inject repository interfaces; mocktail mocks or fakes; MockClient for http; http_mock_adapter for Dio.

**79. What are golden tests and their pitfalls?**
Visual snapshots; fonts and platform rendering differences, update with --update-goldens.

**80. How do you find out why a screen is janky?**
Profile mode DevTools: UI vs raster thread; track rebuilds; CPU profiler; fix heavy builds/effects/images; re-measure.

**81. How do you reduce rebuilds?**
const, smaller widgets, select/BlocSelector, builder child, MediaQuery aspects.

**82. How do you reduce app size?**
AAB, split-per-abi, obfuscate+split-debug-info, asset compression, remove heavy deps, R8.

**83. How do you detect memory leaks?**
DevTools memory snapshot diff, leak_tracker; check disposal of controllers/subscriptions.

**84. What are flavors?**
Environment-specific builds with distinct IDs/configs.

**85. How do you sign and publish an Android app?**
Upload keystore + key.properties + signingConfig; AAB; Play App Signing; tracks & staged rollout.

**86. What is obfuscation and how do you read crash stack traces afterwards?**
Symbol renaming; keep split-debug-info symbols and symbolize (`flutter symbolize`, Crashlytics/Sentry upload).

**87. What CI steps do you set up?**
Format, analyze, test, build, distribute; pinned Flutter version; secrets management.

**88. What is the difference between `flutter build apk` and `appbundle`?**
APK is installable directly; AAB is for Play distribution which generates optimized APKs.

**89. How do you handle a production crash spike?**
Halt rollout, feature flag off, hotfix, monitor, postmortem.

**90. What's your approach to code review?**
Correctness, architecture consistency, performance, accessibility, tests, readability; kind & specific feedback.

---

## G. Scenario-based (mid-level favourites)

**91. A user taps "Pay" twice and is charged twice. How do you prevent this?**
Disable button during request/droppable transformer, command running-state guard, backend idempotency key per order, server verifies payment status; show progress & handle retries safely.

**92. Search results flicker/out of order when typing fast. Fix?**
Debounce input, cancel previous requests (CancelToken/restartable/switchMap), ignore stale responses by query token, show loading state.

**93. App shows stale profile data after editing on another screen. Fix?**
Single source of truth (repository stream/provider), invalidate/refresh after mutation, avoid copying data into local widget state.

**94. App freezes for 2 seconds when opening a big report. Fix?**
Parse/compute in isolate, paginate/virtualize rendering, show progress, cache results.

**95. The list loses scroll position when switching tabs. Fix?**
PageStorageKey or keep-alive/IndexedStack/StatefulShellRoute.

**96. Push notification tap does nothing when app is closed. Fix?**
Handle getInitialMessage after router initialization; ensure payload route mapping.

**97. Login works on debug build, fails on Play Store build (Google Sign-In). Fix?**
Add Play App Signing SHA-1/SHA-256 to Firebase/Google Cloud OAuth client.

**98. Images make the app crash on low-end devices. Fix?**
Decode at display size (cacheWidth), smaller CDN images, limit image cache, dispose, pagination.

**99. A form screen is slow while typing. Fix?**
Avoid setState on the whole page per keystroke; isolate field widgets; ValueListenableBuilder on controllers; debounce validations.

**100. Designers want the same app to feel native on iOS and Android. Approach?**
Adaptive widgets (`.adaptive` constructors, Cupertino where needed), platform-aware navigation transitions/back gestures, platform icons, consistent brand theme; test on both.
