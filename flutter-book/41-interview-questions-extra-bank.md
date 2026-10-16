# Chapter 41 — Interview Question Bank, Part 4: 120 Extra Questions (All Levels)

> These questions are **new**. They don't repeat Chapters 29–31, and they cover the topics added in Part VII as well as trickier corners of Dart and Flutter. Level tags: 🟢 junior, 🟡 mid, 🔴 senior.

---

## A. Dart corners (1–25)

**1. 🟢 What's the difference between `List<int>.empty()`, `[]` and `const []`?**
`List.empty()` is fixed-length by default (can't add; use `growable: true` to allow it). `[]` is a growable empty list. `const []` is an immutable canonical list.

**2. 🟢 What does `Iterable.followedBy` do?**
It lazily concatenates two iterables: `[1, 2].followedBy([3])` → (1, 2, 3).

**3. 🟡 What is `Object.hash` / `Object.hashAll`?**
Helpers that combine field hash codes correctly when you override `hashCode`.

**4. 🟡 What is the difference between `as` and pattern casting `case final x as int`?**
Both throw if the type is wrong. Inside patterns, `as` casts *and* binds. Use `case int x` when you want a non-throwing type test.

**5. 🟡 Why does `print(1 == 1.0)` print true?**
Dart's numeric equality compares values across int/double. `identical(1, 1.0)` is false on native platforms but true on the web, where both are JS numbers.

**6. 🟡 What happens when an int overflows on native vs web?**
Native: 64-bit two's-complement wraparound. Web: JS numbers lose precision beyond 2^53. Use `BigInt` when you need arbitrary precision.

**7. 🟡 Explain `covariant` keyword.**
It allows an overriding method's parameter to have a narrower type than the parent's (e.g., `didUpdateWidget(covariant MyWidget old)`), with a runtime check.

**8. 🟡 What's `noSuchMethod` used for?**
It is called for unknown member accesses (usually with `dynamic`). It's used by mock frameworks (mockito's generated mocks rely on it).

**9. 🔴 How do generics and `is` checks interact at runtime?**
Generics are reified, so `list is List<int>` checks the actual type argument. A `List<dynamic>` containing only ints is still not a `List<int>`.

**10. 🟡 `Future.value` vs `Future.sync` vs `Future.microtask` vs `Future()`?**
* `Future.value(x)`: a future already completed with x (callbacks run as microtasks).
* `Future.sync(fn)`: runs fn immediately.
* `Future.microtask(fn)`: runs fn in a microtask.
* `Future(fn)`: runs fn in a later event (Timer.run).

**11. 🟡 What does `await` on a non-Future value do?**
It wraps the value and suspends until the next microtask, so the code still yields to the event loop.

**12. 🔴 What is a `Zone`-local value and a real use case?**
A value stored with `runZoned(zoneValues: {...})` and read with `Zone.current[key]`. It's used for request-scoped context such as correlation IDs in logs, and by test frameworks.

**13. 🟢 What is `typedef` for function types used for in Flutter?**
Callback types like `VoidCallback`, `ValueChanged<T>`, `ValueGetter<T>`, `ValueSetter<T>`, `WidgetBuilder`.

**14. 🟡 How do `sync*` generators help performance?**
They produce values lazily on demand, avoiding building whole lists.

**15. 🟡 What's the difference between `Stream.listen` `cancelOnError: true/false`?**
With true, the subscription cancels on the first error. With false (the default), it keeps receiving events after errors.

**16. 🟡 `StreamController(sync: true)` — when?**
When you want events delivered immediately during `add`, for example in transformers forwarding events. Be careful about re-entrancy.

**17. 🔴 How can two isolates share large binary data efficiently?**
`TransferableTypedData` (transfer instead of copy), `Isolate.exit` to send results without copying, or native memory through FFI.

**18. 🟡 What are wildcard variables (Dart 3.7)?**
`_` no longer creates a binding, so you can have several `_` parameters, e.g. `(_, _) => ...`.

**19. 🟡 What do null-aware elements (Dart 3.8) look like?**
`[?a, ?b]` adds an element only if it's non-null. In maps: `{'k': ?v}`.

**20. 🔴 What are primary constructors (Dart 3.13)?**
A class header that declares the constructor parameters and fields together, e.g. `class Point(var int x, var int y);`. It needs an SDK lower bound of 3.13.

**21. 🟡 What are dot shorthands and when can't you use them?**
`.value` instead of `Type.value` when the type is known from context. You can't use them where no context type exists (e.g., `var x = .center;`).

**22. 🟡 What's the difference between `final class` and `sealed class`?**
Final: can be instantiated, but can't be extended or implemented outside its library. Sealed: abstract, with a known set of subtypes in the same library, so switches over it are exhaustive.

**23. 🔴 Why can't you `await` inside `initState` directly, and what's the right pattern?**
`initState` must be synchronous (the framework doesn't await it). Start an async method (`_load()`) and handle the result with `mounted` checks, or use FutureBuilder/state management.

**24. 🟡 How do you write an extension on a generic type?**
`extension ListX<T> on List<T> { T? get secondOrNull => length > 1 ? this[1] : null; }`

**25. 🔴 Explain `Finalizer` vs `NativeFinalizer`.**
Finalizer runs a Dart callback some time after an object becomes unreachable (no guarantees, not for critical cleanup). NativeFinalizer calls a native function and is more reliable for freeing native resources. Explicit `close`/`dispose` APIs are still preferred.

---

## B. Widgets, UI & layout (26–50)

**26. 🟢 What is `FittedBox` used for?**
Scaling a child down (or up) to fit its parent, e.g. preventing long labels from overflowing.

**27. 🟢 How do you give rounded corners to an image?**
`ClipRRect(borderRadius: ..., child: Image(...))`, or use a `DecoratedBox`/`Container` with a `DecorationImage` and `borderRadius`.

**28. 🟡 `Flexible(fit: FlexFit.tight)` vs `Expanded`?**
They are identical. Expanded is a shortcut.

**29. 🟡 Why does `Column(mainAxisAlignment: center)` not center inside a `SingleChildScrollView`?**
The scroll view gives unbounded height, so the Column shrinks to its content. Use `ConstrainedBox(minHeight: constraints.maxHeight)` with a LayoutBuilder, or `SliverFillRemaining(hasScrollBody: false)` with `Center`.

**30. 🟡 How do you make two widgets in a Row the same height?**
`IntrinsicHeight` with `CrossAxisAlignment.stretch` (expensive), or fixed heights, or a Table.

**31. 🟡 What is `ColoredBox` and why prefer it over `Container(color:)`?**
It's a single lightweight render object that only paints a color, and it can be const.

**32. 🟡 `Material` widget — why does InkWell need it?**
Ink splashes are painted on the nearest `Material`'s ink layer. Without it (or under an opaque child), the splashes are hidden.

**33. 🟡 What's the difference between `showModalBottomSheet` and `Scaffold.showBottomSheet`?**
Modal: a route with a barrier, returns a Future result, dismissed on outside tap. Persistent: part of the Scaffold, no barrier, controlled with a PersistentBottomSheetController.

**34. 🟡 How do you lock text scaling for one widget (and should you)?**
`MediaQuery.withClampedTextScaling(maxScaleFactor: 1.3, child: ...)` or override `textScaler`. Only clamp where layout truly breaks, because users rely on large text.

**35. 🟡 What is `SliverFillRemaining(hasScrollBody: false)` for?**
It fills the remaining viewport with non-scrolling content, e.g. pushing a footer or button to the bottom when content is short.

**36. 🔴 Why can `LayoutBuilder` cause extra rebuilds?**
It builds during layout, so its builder runs again whenever the incoming constraints change (for example on resize, or keyboard insets in some layouts). Keep its builder light.

**37. 🟡 What does `RepaintBoundary.toImage` enable?**
Capturing a widget as an image (`(key.currentContext!.findRenderObject() as RenderRepaintBoundary).toImage(pixelRatio: 3)`), e.g. for sharing a receipt.

**38. 🟡 How do you render a widget offscreen to an image without showing it?**
Use the `screenshot` package's `captureFromWidget`, or build it in an Overlay/Offstage with a RepaintBoundary, or use a `PictureRecorder` with your own painting.

**39. 🟢 What is `Badge` widget?**
A Material 3 widget that shows a small label or count on top of an icon.

**40. 🟡 How do you implement a custom page transition for all routes?**
`ThemeData.pageTransitionsTheme` with builders per platform, or `PageRouteBuilder`/go_router `CustomTransitionPage` per route.

**41. 🟡 How do you handle very long text with "Read more"?**
Measure with `TextPainter` (`didExceedMaxLines`) inside a LayoutBuilder, toggle `maxLines`, and animate with AnimatedSize.

**42. 🔴 How does `Flow` differ from `Stack` for animated menus?**
Flow's delegate repositions children with transforms at **paint time**, without relayout, so it's efficient for animating many children.

**43. 🟡 What's `ListWheelScrollView`?**
A 3D wheel-like list (picker style). `CupertinoPicker` uses it.

**44. 🟡 How do you show a widget only on wide screens without rebuilding the whole page on resize?**
Put a small `LayoutBuilder`/`MediaQuery.sizeOf` check around just that part, or use separate layout widgets selected high up while keeping their children const.

**45. 🔴 Why might `const` not work on your widget?**
One of its constructor arguments isn't a compile-time constant (runtime values, callbacks referencing instance members, non-const objects), or the class lacks a const constructor or has non-final fields.

**46. 🟡 What is `KeyedSubtree`?**
A widget that attaches a key to a subtree without adding layout. It's used to preserve identity when wrapping children dynamically.

**47. 🟡 How do you detect when a widget becomes visible on screen?**
The `visibility_detector` package (for impressions and video autoplay), or scroll listeners combined with item positions.

**48. 🔴 How do you implement a sticky "Add to cart" bar that hides when scrolling down and shows when scrolling up?**
Listen to `UserScrollNotification`/ScrollController direction and animate the bar with AnimatedSlide/SizeTransition. Alternatively, use `SliverFloatingHeader`-style slivers for headers.

**49. 🟡 What is `SafeArea(minimum: ...)`?**
It guarantees minimum padding even on devices without system intrusions.

**50. 🟡 Explain `MediaQuery.removePadding`.**
It removes inherited padding (e.g., the status bar top padding) for a subtree, such as a ListView inside a Drawer that would otherwise add top padding.

---

## C. State, architecture & data (51–75)

**51. 🟡 How do you share state between two unrelated screens in Provider?**
Provide it above MaterialApp (app scope), or above the navigator branch that contains both screens.

**52. 🟡 In Riverpod, how do you reset all user-specific providers on logout?**
Make them depend on (`ref.watch`) an auth/user-ID provider so they rebuild when the user changes. Or invalidate them explicitly, or scope them in a nested ProviderScope that is recreated (with a new key) on login.

**53. 🔴 How do you avoid "provider dependency cycles"?**
Restructure: extract shared logic into a third provider, pass data as parameters, or break cycles with events. Riverpod throws CircularDependencyError when it detects a cycle.

**54. 🟡 In Bloc, how do you initialize data when a screen opens?**
Add an event in the BlocProvider's `create`: `create: (_) => ProductsBloc(repo)..add(ProductsRequested())`.

**55. 🟡 When should a Cubit be global vs per-screen?**
Global for app-wide state (auth, cart, settings). Per-screen for feature state that should reset when the user leaves. Scope it with route-level providers.

**56. 🔴 How do you keep a long form's state across navigation and process death?**
Form state in a state holder scoped to the flow (not the widget), drafts persisted to storage with a debounce, and restoration IDs for the current step.

**57. 🟡 What is the Unit of Work / transaction concern on mobile?**
Group local DB writes in transactions so related data stays consistent, e.g. order + order items.

**58. 🟡 How do you model "loading more" while showing existing items?**
State with `items`, `isLoadingMore`, `hasMore` and `loadMoreError`, separate from the initial `status`.

**59. 🔴 How do you implement optimistic updates with rollback?**
Update the UI state immediately, call the API, and restore the previous state on failure with a message. Server responses reconcile the final values.

**60. 🟡 How do you store dates correctly?**
Store UTC timestamps (ISO-8601 or epoch milliseconds) and convert to local time only for display (`toLocal()`, intl formatting). Take care with time zones in scheduling (the `timezone` package).

**61. 🟡 How do you handle API pagination when items can be added while scrolling?**
Cursor-based pagination and deduplication by ID.

**62. 🔴 How would you design a caching policy for product details?**
Memory cache with a TTL, a persistent cache for offline use, stale-while-revalidate, invalidation on updates (events/push), ETags for validation, and cache keys that include locale/currency.

**63. 🟡 Why separate DTOs from domain models?**
To isolate the app from API changes, add computed fields, use proper types (DateTime, enums) and validate data at the boundary.

**64. 🔴 How do you handle schema migrations for an offline-first app shipped to millions?**
Versioned migrations tested from every older schema version (Drift migration tests). Never edit past migrations. Back up or recover on failure. Make migrations idempotent. Watch crash rates after release.

**65. 🟡 What's the difference between `ref.invalidate` and `ref.refresh`?**
invalidate marks the provider for recomputation the next time it is read. refresh invalidates and reads it immediately, returning the new value.

**66. 🟡 How do you test a widget that depends on a Riverpod provider with async data?**
`ProviderScope(overrides: [provider.overrideWith(...)])` with fake data. Pump, then pump again (or pumpAndSettle) to get past loading. Assert on data, loading and error states.

**67. 🔴 What is "server-driven UI" and its trade-offs?**
The backend sends a UI description (JSON) and the app renders it with predefined components (`rfw`, custom renderers). Benefits: changes without app releases, A/B tests. Costs: complexity, limited flexibility, versioning, performance and debugging difficulty.

**68. 🟡 How do you implement multi-language content coming from the API?**
Send `Accept-Language` headers, cache data per locale, and refresh data when the locale changes.

**69. 🟡 Explain the outbox pattern on mobile.**
User actions are stored locally as pending operations and synced in order with retries. The UI reflects their local state immediately.

**70. 🔴 How do you guarantee exactly-once processing of user actions with retries?**
Client-generated idempotency keys (UUIDs) stored with each operation. The server deduplicates by key.

**71. 🟡 How do you securely refresh tokens on app resume?**
On `resumed`, check the token's expiry, then refresh proactively (single-flight). Handle refresh failure by logging out.

**72. 🟡 What's dependency inversion in a Flutter repository layer?**
Blocs/view models depend on an abstract repository interface. Implementations are injected (real, or fake in tests).

**73. 🔴 How would you split a 2,000-line Bloc?**
Split by sub-feature into smaller blocs/cubits. Move business rules into domain services or use cases. Compose them through the presentation layer or shared repositories.

**74. 🟡 How do you prevent memory leaks with get_it singletons holding user data?**
Use session scopes (`pushNewScope`/`popScope`) or reset and recreate them on logout. Avoid caching user data in app-wide singletons.

**75. 🟡 What does `AsyncValue.guard` replace?**
A manual try/catch that converts exceptions into an AsyncError.

---

## D. Platform, media, maps & payments (76–95)

**76. 🟡 How do you keep the screen awake during video playback or navigation?**
`wakelock_plus` (`WakelockPlus.enable()`/`disable()`), released when the screen is no longer used.

**77. 🟡 How do you share an image to WhatsApp or other apps?**
`share_plus` with an `XFile` (save the bytes to a temp file first).

**78. 🟡 How do you open the app settings page?**
`openAppSettings()` (permission_handler) or `Geolocator.openAppSettings()`.

**79. 🟡 What's the difference between `ResolutionPreset.high` and `max` in the camera plugin?**
High is about 720p–1080p depending on the platform (check the docs). Max is the highest the device supports. Higher presets use more memory and bandwidth.

**80. 🔴 How do you process camera frames with ML in real time without jank?**
Image stream with throttling (one frame in flight), a lower resolution, processing in native ML libraries or isolates, and reusing buffers.

**81. 🟡 How do you autoplay only the visible video in a feed?**
visibility_detector or scroll position math. Keep one active controller and pause the others.

**82. 🟡 What are restrictions for background location on Google Play?**
Declaration form, prominent disclosure, core-feature justification and a video demo. Without approval the app can be rejected.

**83. 🟡 Why might a Google map show but markers be missing?**
Markers set before the map is created, an empty marker set, wrong coordinates (lat/lng swapped), or invalid custom icon loading.

**84. 🔴 How would you animate a moving driver marker smoothly?**
Interpolate between GPS updates with an AnimationController/Tween over LatLng and bearing, update the marker at a throttled rate, and use dead reckoning for gaps.

**85. 🟡 Why must `completePurchase` be called?**
Android auto-refunds purchases not acknowledged within 3 days. On iOS, unfinished transactions are delivered again repeatedly.

**86. 🟡 What is a subscription grace period?**
After a renewal payment fails, the user keeps access for a configured time while the store retries the payment.

**87. 🔴 How do you prevent users from sharing premium access across accounts?**
Server-side binding of purchase tokens or original transaction IDs to one account. Reject or transfer them per policy, and handle restores carefully.

**88. 🟡 Why does Stripe's payment sheet require FlutterFragmentActivity?**
The Stripe Android SDK uses fragment-based UI (AndroidX Activity Result APIs), which needs a FragmentActivity host.

**89. 🟡 How do you open WhatsApp/phone/email from Flutter?**
`url_launcher` with `https://wa.me/<number>`, `tel:`, `mailto:` URIs. Add the `<queries>` entries (Android 11+) and `LSApplicationQueriesSchemes` (iOS) when you check with `canLaunchUrl`.

**90. 🟡 How do you create home-screen widgets for a Flutter app?**
Native widget UI (Glance/RemoteViews on Android, WidgetKit/SwiftUI on iOS). Share data through `home_widget` (App Groups / SharedPreferences) and trigger updates from Flutter.

**91. 🔴 How would you integrate a native SDK that requires `Application.onCreate` initialization?**
A custom Android `Application` class (registered in the manifest) that initializes the SDK, or the plugin's `onAttachedToEngine`. For iOS, AppDelegate `didFinishLaunching`. Expose functionality through Pigeon.

**92. 🟡 What is `FlutterFragmentActivity` vs `FlutterActivity`?**
FlutterFragmentActivity extends FragmentActivity, which some plugins need (Stripe, local_auth biometric prompts on Android). FlutterActivity is lighter.

**93. 🟡 How do you implement biometric login with `local_auth`?**
`canCheckBiometrics`/`isDeviceSupported` → `authenticate(localizedReason: ...)` → on success, unlock a credential from secure storage. On Android, MainActivity must be a FlutterFragmentActivity.

**94. 🔴 How do you test payments end to end?**
Sandbox environments (Stripe test cards, Razorpay test mode, Play license testers, Apple sandbox/StoreKit configs), backend webhooks against a staging environment, and Patrol tests for native sheets where possible.

**95. 🟡 How do you handle the Android "Don't keep activities" scenario during payments?**
Recover pending orders at startup by checking the backend order status. Use restoration for UI state, and rely on webhooks for the truth.

---

## E. Tooling, testing, release & teams (96–120)

**96. 🟡 What is `build.yaml` used for?**
Configuring code generators: options, which files to generate for (`generate_for`), enabling/disabling builders, and defining your own builders.

**97. 🟡 How do you write a custom lint rule?**
With the analyzer plugin system (Dart 3.10+ supports first-party analyzer plugins) or `custom_lint` (older approach). Define rules that visit the AST and report diagnostics, optionally with quick fixes.

**98. 🟡 How do you test a widget's appearance across themes and text scales?**
Golden tests over a matrix of light/dark themes, text scales 1.0/2.0, RTL and screen sizes (e.g., alchemist scenarios).

**99. 🟡 What is `flutter test --tags` for?**
Running subsets of tests marked with `@Tags(['golden'])` or `tags:` (e.g., skip slow tests locally).

**100. 🔴 How do you reduce flakiness in integration tests?**
Avoid fixed delays (wait for conditions), use deterministic test data and backends, disable animations, use stable keys, isolate tests, and add retries only as diagnostics while fixing root causes.

**101. 🟡 How do you run tests on multiple Flutter versions in CI?**
A matrix strategy over Flutter versions/channels (stable + beta) with subosito/flutter-action.

**102. 🟡 What is `dart fix`?**
It applies automated fixes for deprecated APIs and lints. Run `dart fix --dry-run` to preview and `--apply` to apply.

**103. 🔴 How would you measure and enforce app size budgets?**
`--analyze-size` in CI producing JSON, comparing against a baseline and failing when a threshold is exceeded. Track download sizes from store consoles.

**104. 🟡 What's the difference between internal testing, closed testing and open testing on Play?**
Internal: up to 100 testers, quick availability. Closed: invite lists/groups. Open: public opt-in beta. All come before production.

**105. 🟡 What is phased release on the App Store?**
An automatic 7-day gradual rollout of an update to users with automatic updates, which can be paused.

**106. 🔴 How do you handle a breaking backend change while old app versions exist?**
API versioning, keeping old endpoints during a deprecation window, a minimum version gate (force update), and monitoring version adoption.

**107. 🟡 How do you add a debug-only menu without shipping it in release?**
Guard it with `kReleaseMode`/flavors (const conditions get tree-shaken), or put it in a separate entry point used only for dev flavors.

**108. 🟡 What is a CODEOWNERS file?**
A GitHub/GitLab file mapping paths to owners, who automatically become required reviewers for changes in their areas.

**109. 🔴 How do you onboard 10 new developers quickly to a Flutter monorepo?**
One-command setup scripts (FVM + melos bootstrap), architecture docs/ADRs, a sample feature walkthrough, good first issues, pairing, consistent lints/templates (mason bricks).

**110. 🟡 What is `mason`?**
A template generator (bricks) to scaffold features, files and tests consistently, e.g. a new feature folder with bloc + repository + tests.

**111. 🟡 How do you write a good bug report as a mobile developer?**
Steps to reproduce, expected vs actual behavior, device/OS/app version/build number, logs/stack traces, screenshots/video, frequency, and regression info.

**112. 🔴 How do you prioritize performance work vs features?**
Measure the user impact (crash/ANR/jank metrics, conversion correlation), set performance budgets/SLOs, fix the worst offenders first, and reserve capacity every sprint.

**113. 🟡 How do you keep design and implementation consistent?**
A design token pipeline, a component library, widgetbook, golden tests, and design reviews on PRs with screenshots.

**114. 🟡 What do you check before upgrading a major package version?**
Changelog breaking changes, migration guides, transitive dependency impact, platform requirement changes (minSdk/iOS version), and tests on a branch.

**115. 🔴 How would you migrate an app from GetX to a different architecture without stopping feature work?**
Strangler pattern: new features use the new architecture, adapters bridge shared services, migrate screen by screen with tests, remove GetX routing last, and track progress.

**116. 🟡 What metrics matter after a release?**
Crash-free users/sessions, ANR rate, startup time, key funnel conversions, rating/review trends, error rates, adoption of the new version.

**117. 🟡 How do you communicate a delay to stakeholders?**
Early and with facts: what's done, what's blocked, impact, options (scope cuts, phased release), and new estimates with confidence levels.

**118. 🔴 Design question: offline-capable attendance app with geofencing and anti-fraud. Key points?**
Geofence + GPS checks, mock location detection, device attestation, selfie with liveness check (ML Kit/native SDK), local queue with signed timestamps (server time sync), background sync, encryption at rest, admin rules from remote config.

**119. 🔴 Design question: real-time collaborative notes app. Key points?**
CRDTs or operational transforms for conflict-free merging, local-first DB, WebSocket sync, presence indicators, offline edits merged later, version history, end-to-end tests of merge cases.

**120. 🟡 What would you improve first in a legacy Flutter app you just joined?**
Get it building reliably (version pinning, CI). Add crash reporting/analytics if missing. Fix critical lints/deprecations. Add tests around the riskiest flows. Then improve architecture incrementally, without a rewrite.
