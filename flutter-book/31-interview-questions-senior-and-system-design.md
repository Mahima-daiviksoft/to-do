# Chapter 31 — Interview Question Bank, Part 3: Senior, Lead & Architect (5+ years) + Mobile System Design

> Senior interviews test **depth** (internals), **judgment** (trade-offs), **scale** (architecture, teams, releases) and **leadership**. Each answer below is a model answer you can adapt with your own experiences.

---

## A. Deep internals

**1. Walk me through a frame from vsync to pixels.**
Vsync → `handleBeginFrame` runs transient callbacks (Tickers advance animations) → microtasks → `handleDrawFrame` runs persistent callbacks: `buildScope` rebuilds dirty elements (depth-ordered), `flushLayout` lays out dirty relayout boundaries, `flushCompositingBits`, `flushPaint` records display lists into layers for dirty repaint boundaries, `compositeFrame` builds a Scene from the layer tree and submits it, `flushSemantics`, `finalizeTree` unmounts inactive elements → post-frame callbacks. The raster thread then rasterizes the layer tree with Impeller (Metal/Vulkan/GLES) and presents. Two separate budgets (UI & raster) must be met.

**2. How does Flutter achieve O(N) layout?**
Single-pass constraint propagation with caching: each render object is laid out once per frame given constraints; relayout boundaries stop propagation; layout is skipped if constraints are unchanged and not dirty. Intrinsic sizing breaks this (speculative passes), hence its cost.

**3. What is a relayout boundary exactly?**
A RenderObject whose size can't affect its parent due to: parent not using its size (`parentUsesSize: false`), tight constraints, `sizedByParent`, or it's the root. markNeedsLayout stops there.

**4. How are InheritedWidget lookups O(1)?**
Each Element holds a persistent hash map of inherited elements by type copied from parent at mount; lookup is a map access; dependents are tracked in the InheritedElement.

**5. Explain how keys influence `updateChildren` for multi-child widgets.**
Algorithm walks from the top and bottom matching by `canUpdate`; for the middle section, old keyed children are put in a map and new children with keys are matched there; unkeyed are matched positionally; unmatched old ones are deactivated. This is why keys preserve state across reorders.

**6. What's the difference between Skia and Impeller, and what trade-offs remain with Impeller?**
Skia compiled shaders at runtime → first-use jank; Impeller precompiles a fixed shader set, uses Metal/Vulkan, offers predictable performance. Trade-offs: some effects had fidelity/perf differences during migration, device/driver fallbacks on Android (GLES), larger engine size slightly; team evaluates per-release issues.

**7. What happens during hot reload at the VM level, and why can't it update `initState` changes?**
Kernel deltas for changed libraries are loaded into the running VM, replacing function bodies/class definitions while preserving heap objects; framework calls reassemble and rebuilds. Already-executed code (initState, main, static initializers) isn't re-run, so their effects remain.

**8. How do platform channels and FFI differ in threading/performance?**
Channels serialize messages via codecs and hop to the platform thread asynchronously; FFI calls native functions synchronously on the calling thread with near-zero overhead. Since UI/platform thread merging (3.29+ on mobile), synchronous native interop (FFI-based jnigen/ffigen bindings) becomes practical.

**9. How does Dart's GC interact with Flutter's frame scheduling?**
Generational GC: fast scavenges for young objects; Flutter engine notifies the VM of idle time between frames (`notifyIdle`) so GC work can be scheduled without janking. Excessive allocation of long-lived objects increases old-gen GC pressure.

**10. How would you diagnose a raster-thread bottleneck?**
DevTools frame chart shows raster time high; check for saveLayer (opacity, shader mask, color filters), BackdropFilter, clips, large images, many platform views; use "highlight oversized images", Impeller-specific tracing, simplify effects, add RepaintBoundaries to cache static layers.

**11. Explain element reparenting with GlobalKey.**
When a widget with a GlobalKey moves to a new parent in the same frame, its element is found in the inactive list (or detached) and re-inserted, preserving State and render objects instead of recreating.

**12. How do Tickers know to stop when a route is not visible?**
`TickerMode` widget (set false by routes when fully obscured / in some cases) mutes tickers created from TickerProviderStateMixin; muted tickers don't schedule frames.

**13. How does `const` canonicalization interact with `Widget.==`?**
Widget's `==` is identity by default (not overridden); const instances are identical, so `Element.updateChild` short-circuits when `child.widget == newWidget` (identity).

**14. What is `BuildOwner` and `PipelineOwner`?**
BuildOwner manages element rebuilds (dirty list, global keys, inactive elements); PipelineOwner manages render objects needing layout/paint/compositing/semantics updates.

**15. How does the semantics tree get built and what's its cost?**
Render objects describe semantics via `describeSemanticsConfiguration`; PipelineOwner flushes semantics into SemanticsNodes sent to the platform when accessibility is enabled — adds cost proportional to the tree; merge/exclude reduces nodes.

---

## B. Architecture & scale

**16. Design the architecture for a 30-developer Flutter app.**
Monorepo with pub workspaces/melos; packages per feature with clear public APIs, shared core (network, storage, analytics abstractions), design system package with widgetbook & goldens; layered architecture (presentation/domain-optional/data) with one state management standard (Riverpod or Bloc) and DI; go_router with typed routes and deep links; feature flags; CODEOWNERS; CI with affected-package testing; ADRs; strict lints; contract-first APIs with generated clients; observability (Crashlytics/Sentry, analytics taxonomy, performance monitoring); release train with staged rollouts.

**17. Riverpod or Bloc for a large enterprise app — defend your choice.**
(Example) Bloc when the org values explicit event-driven flows, traceability (BlocObserver audit trails), strict separation and many juniors following a rigid pattern; Riverpod when you want less boilerplate, compile-time-safe DI, built-in async caching/invalidation and composable providers. Either works; consistency, testing culture and team familiarity outweigh library choice. Mention migration costs and that both can coexist during transitions.

**18. How do you design offline-first sync with conflict resolution?**
Local DB (Drift) as source of truth; mutations recorded in an outbox with operation type, payload, idempotency key, timestamps/version; background sync (WorkManager/BGTask + on connectivity regain) pushes outbox then pulls deltas (updatedAt cursor); conflicts resolved by strategy per entity: server-authoritative, last-write-wins with vector/version numbers, or field-level merge; UI shows sync status; retries with backoff; handle deletes with tombstones; tests for sync edge cases.

**19. How do you handle API versioning and old app versions?**
Backend keeps backward-compatible endpoints or versioned routes (v1/v2); app sends version header; minimum supported version enforced via remote config/force update; feature flags gate new APIs; monitor version adoption.

**20. How would you modularize a monolithic Flutter app incrementally?**
Identify boundaries (features, core), extract shared core first (network/storage/design system) into packages, then features one at a time behind public interfaces; enforce dependencies with package structure & lints (e.g., import rules); maintain build green; measure build/test times.

**21. How do you design a design system in Flutter?**
Tokens (color, typography, spacing, radius, elevation, motion) → ThemeData + ThemeExtensions; component library wrapping Material widgets with brand APIs (AppButton variants), documentation in widgetbook, golden tests per component/state/theme, accessibility built in, versioned package, Figma token sync.

**22. How do you structure error handling across layers?**
Data layer maps exceptions to typed failures (sealed), repositories return Result or throw domain failures consistently, state layer exposes error states, UI maps to localized messages; global handlers capture unexpected errors to crash reporting; error boundaries via ErrorWidget.builder.

**23. How do you implement feature flags properly?**
Remote config/LaunchDarkly with local defaults, typed flag accessors, flag evaluation cached per session, kill switches, cleanup policy for stale flags, debug overrides in dev builds, analytics for experiment variants.

**24. How do you approach dependency injection & scoping (e.g., per-user session)?**
Composition root at bootstrap; app-scoped singletons (HTTP client), session-scoped dependencies created on login and disposed on logout (get_it scopes, Riverpod providers watching auth state, or nested ProviderScopes/BlocProviders), feature-scoped dependencies via route-level providers.

**25. What metrics define app health and how do you monitor them?**
Crash-free users/sessions, ANR rate, startup time (cold/warm), slow/frozen frames, network error rates/latency, memory, app size, store rating, funnel conversion; tools: Crashlytics/Sentry, Firebase Performance, Play vitals, Xcode Organizer, analytics dashboards, alerts.

---

## C. Performance & reliability at senior level

**26. Startup takes 4s on low-end Android. Plan?**
Measure (`--trace-startup`, Android vitals, systrace/Perfetto); split pre-runApp work; defer SDK inits (analytics, remote config, ads) after first frame or lazily; parallelize independent inits; avoid sync disk IO & large asset decoding on startup; lighter first screen; check native Application.onCreate work from plugins; consider baseline profiles for Android native code; deferred components; verify Impeller/GL backend behaviour on device.

**27. Memory grows steadily during a long session. Approach?**
Reproduce with automated navigation loop; DevTools snapshots & diff; find growing classes and retaining paths; check listeners/subscriptions/static caches/image cache; use leak_tracker in tests; fix and add regression tests.

**28. How do you guarantee 120fps scrolling of a complex feed?**
Lazy slivers with known extents where possible, cheap item builds (precomputed view models), const subtrees, image sizing/caching & prefetch, avoid saveLayer effects, RepaintBoundaries for animated items, isolate parsing, pagination, profile on target devices, performance tests in CI.

**29. How would you build a performance regression gate in CI?**
integration_test with traceAction on scripted scenarios in profile mode on fixed device(s)/Firebase Test Lab; extract frame build/raster percentiles; compare with baseline thresholds; fail PR or alert on regression; track trends.

**30. How do you handle large lists of heterogeneous items with dynamic heights efficiently?**
SliverList with builder delegates, `findChildIndexCallback` for keyed reorders, avoid intrinsic measurements, cache measurements in models if needed, `super_sliver_list` for better extent estimation and jumping, chunked rendering.

---

## D. Platform & native expertise

**31. You must integrate a native payment SDK (Android AAR + iOS XCFramework) with callbacks and an activity result. Design it.**
Write a plugin with Pigeon: HostApi for `startPayment(PaymentRequest)` (async), FlutterApi/EventChannel for status updates; Android implements ActivityAware and ActivityResultListener, handles process death; iOS presents SDK UI from the root view controller; map errors to typed results; threading to main; ProGuard rules; integrate via federated structure if reused; example app + integration tests; server verifies payment.

**32. How would you add Flutter to an existing large native app?**
Add-to-app module, pre-warmed cached engines (FlutterEngineGroup for multiple instances), routes/entrypoints per feature, Pigeon bridge for shared services (auth token, analytics), consistent navigation/back behaviour, theming parity, CI integration (AAR/frameworks), memory considerations, gradual rollout with feature flags.

**33. When would you use platform views and what problems do you anticipate?**
For native-only components (maps, webviews, ads, AR). Problems: performance (composition), gesture conflicts, keyboard/focus issues, accessibility, z-order with overlays, testing; mitigate by limiting count/size, choosing composition modes, handling gestures explicitly.

**34. How would you build background location tracking reliably on both platforms?**
Android foreground service with location type & notification, permissions (fine + background), battery optimizations; iOS background mode location, significant-change/region monitoring, "Always" permission flow; persist locally and batch upload; handle OS kills; consider commercial SDK (flutter_background_geolocation); comply with store policies.

**35. Explain how you'd implement secure biometric login.**
Generate/store a key in Keystore/Secure Enclave requiring biometric auth; on login, biometric prompt unlocks key to sign a server challenge or decrypt a refresh token; fallback to password; handle enrollment changes (key invalidation); never just "biometric success → logged in" client-side.

---

## E. Security & compliance (senior)

**36. How do you secure an app handling financial transactions?**
TLS + pinning with rotation plan, secure storage & encrypted DB, short-lived tokens with refresh rotation, device attestation (Play Integrity/App Attest), RASP/root detection with server-side risk scoring, FLAG_SECURE/snapshot hiding, no secrets in app, obfuscation, server-side authorization & idempotency, audit logs, MASVS-L2 compliance, pentests, compliance (PCI DSS scope reduction with tokenization).

**37. A leaked API key was found in your app binary. What now?**
Rotate/revoke immediately, restrict new key, move secret server-side, assess abuse via logs/billing, release update, add secret scanning to CI, postmortem.

---

## F. Leadership & process

**38. How do you lead a migration (e.g., Provider → Riverpod) across a big codebase?**
RFC with goals/costs, pilot on one feature, guidelines & codemods/snippets, train team, incremental migration with coexistence, tracking dashboard, definition of done, avoid freezing feature work, measure outcomes.

**39. How do you handle conflicting opinions in architecture discussions?**
Clarify requirements and constraints, compare options with data/prototypes, document trade-offs in ADR, decide (with owner), commit as a team, revisit with new evidence.

**40. How do you mentor and grow a team?**
Pairing, code review culture, learning sessions, ownership areas, clear career expectations, psychological safety, feedback loops.

**41. How do you estimate a large feature?**
Break into tasks (UI, state, data, native, tests, analytics, l10n, a11y, QA, release), identify unknowns (spikes), use ranges, add risk buffers, revisit after spikes, communicate assumptions.

**42. How do you ensure quality while shipping fast?**
Trunk-based development with feature flags, automated tests at the right levels, CI gates, staged rollouts, monitoring & alerting, fast rollback strategies (flags/code push), postmortems.

---

## G. Mobile system design — the framework 🏗️

Use this structure for any "Design X app" question (45–60 min):

1. **Clarify requirements** (5 min)
   * Functional: core user flows.
   * Non-functional: scale (DAU), offline, latency, real-time, security, platforms, accessibility, i18n, battery/data constraints.
   * Out of scope.
2. **High-level architecture** (10 min) — client modules, layers, backend touchpoints (REST/GraphQL/WebSocket/push), CDN.
3. **Data model & API** (10 min) — entities, endpoints/events, pagination, caching headers.
4. **Client deep dive** (15 min) — state management, local storage & sync, networking (retries, auth), navigation/deep links, image handling, background work, notifications.
5. **Non-functional deep dive** (10 min) — performance, offline, security, observability, testing, release strategy.
6. **Trade-offs & extensions** (5 min).

### Example 1: Design a chat app (WhatsApp-like) 💬
* **Requirements**: 1:1 & group chats, text/images, delivery/read receipts, offline sending, push notifications, typing indicators, message history sync, E2E encryption (optional discussion).
* **Client modules**: auth, conversations list, chat thread, media, contacts, notifications, settings; core: socket client, DB, sync engine, media cache.
* **Transport**: WebSocket for real-time (reconnect with backoff, heartbeats); REST for history/pagination & media upload (pre-signed URLs to object storage); FCM/APNs for background delivery/wake-up.
* **Local storage**: Drift tables `conversations`, `messages(id, clientId, conversationId, senderId, body, status, createdAt, serverSeq)`, `outbox`; UI observes DB streams; reverse-ordered ListView (`reverse: true`) with pagination by `serverSeq` cursor.
* **Sending flow**: create message with `clientId` (UUID) status `pending` → insert DB (instant UI) → outbox → socket send → server ack with server id/seq → update status `sent`; delivery/read receipts update status; retries on reconnect; idempotency via clientId to avoid duplicates.
* **Ordering**: server sequence numbers per conversation; client merges by seq; handle gaps by fetching missing range.
* **Media**: compress image (isolate), upload with progress (background_downloader), thumbnail placeholder/blurhash, cache with size limits.
* **Notifications**: data push → update DB / show local notification grouped per conversation; tap → deep link to chat; foreground suppression when chat open.
* **Typing indicators/presence**: ephemeral socket events, throttled.
* **E2E encryption**: Signal protocol (keys per device in secure storage), server sees ciphertext only — complexity trade-off.
* **Performance**: pagination, message bubble widget const-ness, avoid rebuilding whole list on status change (per-message selectors), image sizing.
* **Testing & observability**: sync engine unit tests, socket reconnect tests, metrics for send latency & failures.

### Example 2: Design an e-commerce app 🛒
(see Chapter 21 §21.11 for a full template) — emphasise catalog caching (stale-while-revalidate), search (debounce/cancel), cart sync & optimistic updates, checkout reliability (idempotency, server verification, payment SDK integration), deep links for products/campaigns, analytics funnels, feature flags for promotions, A/B testing, accessibility & localization (currency formatting).

### Example 3: Design a news feed (Instagram/Twitter-like) 📰
* Cursor-based infinite feed, prefetch next page at 70% scroll, image/video prefetch & caching with memory limits, video autoplay only for visible item (`visibility_detector`), pause offscreen, like with optimistic update & rollback, offline cached first page, pull-to-refresh with "new posts" banner instead of jumping, feed item view models precomputed, impression analytics batched, A/B ranking flags.

### Example 4: Design a ride-hailing app (Uber-like) 🚗
* Map (google_maps_flutter) with driver markers updated via WebSocket (throttled, interpolated animations), location tracking (foreground service during trip), trip state machine (sealed classes: idle → searching → driverAssigned → arriving → inTrip → completed/cancelled), push for state changes, payment flow, ETA polling fallback, battery optimization (adaptive GPS accuracy), offline resilience (reconnect, state restoration after process death), safety features (share trip deep link).

### Example 5: Design an offline-first field-data collection app 📋
* Forms defined by server schema (dynamic form rendering), local Drift DB, attachments stored as files, outbox sync with retries & conflict resolution, background sync via WorkManager, auth with long offline sessions (refresh tokens + device binding), encryption at rest, data export, multi-tenant configs, admin feature flags.

### Example 6: Design a video streaming app 🎬
* Player (`video_player`/media_kit with HLS/DASH), adaptive bitrate, DRM (Widevine/FairPlay via native SDK/platform views or specialized plugins), download for offline with encryption & expiry, continue watching sync, Chromecast/AirPlay, PiP, background audio, analytics (QoE: startup time, buffering ratio), CDN.

### System design trade-off phrases to use
* "For the **source of truth**, I'd make the local database authoritative for the UI and treat the network as a sync mechanism."
* "I'd prefer **cursor pagination** here because the feed changes frequently."
* "To keep the **UI thread free**, parsing and compression run in isolates."
* "We need **idempotency keys** so retries don't duplicate orders."
* "I'd gate this behind a **feature flag** and roll out gradually with monitoring."
* "Old app versions will exist for months, so the API must remain **backward compatible**."

---

## H. Rapid-fire senior questions (answer in one or two sentences)
1. *What's `TickerMode`?* Disables tickers in a subtree (e.g., offscreen routes).
2. *What's `Overlay`?* A Stack of entries above routes used by Navigator, tooltips, dialogs, drag feedback.
3. *What's `OverlayPortal`?* Declarative way to render a child into the nearest Overlay while keeping its position in the widget tree for inherited data.
4. *What's `CompositedTransformFollower`?* Positions a widget (often in an overlay) relative to a `CompositedTransformTarget` using leader/follower layers.
5. *What is `Restoration` API?* Saves/restores UI state across process death via RestorationMixin/RestorableProperties and restorationScopeId.
6. *What does `debugNeedsPaint`/`debugNeedsLayout` tell you?* Whether a render object is marked dirty — useful in debugging custom render objects.
7. *Why does `Opacity(0)` still receive taps?* RenderOpacity doesn't block hit testing; use IgnorePointer/Visibility.
8. *What is `ParentData`?* Per-child data stored by parent render objects for layout (offsets, flex factors, positions).
9. *What's the difference between `ScrollPosition` and `ScrollController`?* Controller creates/holds positions for attached scrollables; position holds pixels/extents & drives physics.
10. *What is `PrimaryScrollController`?* Inherited default controller used by scroll views with `primary: true` (e.g., iOS status bar tap to top).
11. *What is a `Viewport`?* Render object showing a portion of slivers based on offset.
12. *What is `SchedulerBinding.scheduleTask` priority?* Runs tasks between frames by priority (animation, touch, idle).
13. *What's `compute` limitation on web?* Runs on the main thread (no isolates).
14. *What is `dart:ui`'s `PlatformDispatcher`?* Central interface to engine: views, locales, accessibility features, platform messages, frame callbacks, error handler.
15. *What is `FlutterView`?* A surface the engine renders into; apps can have multiple views (multi-window/multi-embedding).
16. *What is deferred loading?* Loading libraries lazily (`deferred as`) for web code splitting / Android deferred components.
17. *What is tree shaking of icons?* Removes unused glyphs from icon fonts in release; dynamic IconData needs `--no-tree-shake-icons`.
18. *What's AOT snapshot?* Precompiled machine code + data loaded at startup in release/profile.
19. *What is `kReleaseMode` used for?* Compile-time constant to exclude debug code from release.
20. *What is `@pragma('vm:entry-point')`?* Prevents tree shaking/obfuscation of functions/classes invoked from native or by name (background handlers, add-to-app entrypoints).
