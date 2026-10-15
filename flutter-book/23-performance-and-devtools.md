# Chapter 23 — Performance Optimization & DevTools: Jank, Rebuilds, Memory Leaks, Startup Time & App Size

> **Goal:** Diagnose and fix every common performance problem with evidence (DevTools), not guesses. Senior interviews: "Your app is janky on scroll — how do you investigate?", "How do you reduce app size?", "How do you find memory leaks?"

---

## 23.1 Performance mindset 🧭
1. **Measure first** — in **profile mode**, on a **real, low/mid-range device** (not the emulator, not a flagship only).
2. Find the **bottleneck** (UI thread? raster thread? network? startup?).
3. Fix the **biggest** problem; re-measure.
4. Prevent regressions (performance tests, benchmarks in CI, code review checklists).

Frame budgets: 60 Hz → **16.67 ms**; 90 Hz → 11.1 ms; 120 Hz → **8.33 ms**. Both the UI thread and the raster thread must finish within the budget.

---

## 23.2 DevTools tour 🧰
Open via `flutter run --profile` then press `v`, or from the IDE.

| Tool | Use |
|---|---|
| **Flutter Inspector** | Widget tree, layout explorer (constraints, flex), select widget on device, "Highlight repaints", "Highlight oversized images", "Show guidelines", slow animations |
| **Performance** | Frame chart (UI & raster bars per frame; jank frames in red), **timeline events** (Build, Layout, Paint, Raster), "Track widget builds" / "Track layouts" / "Track paints" (shows which widgets rebuilt), rebuild stats, shader compilation flags (Skia) |
| **CPU Profiler** | Sample Dart CPU usage: bottom-up/top-down/call tree, flame chart — find expensive functions |
| **Memory** | Heap usage chart, GC events, **heap snapshots** & **diff** (find leaking classes), allocation tracing, "Profile memory" by class |
| **Network** | HTTP requests (dart:io HttpClient-based — includes `http`/Dio on native), timing, headers, bodies |
| **Logging** | `dart:developer` `log()` output, framework events |
| **App Size** | Analyze `--analyze-size` JSON: treemap of code/assets by package; diff two builds |
| **Deep Links** | Validate Android/iOS deep link setup |
| **DevTools extensions** | Provider, Riverpod, Bloc, Drift, Patrol… package-provided tabs |
| **Debugger** | Breakpoints, stepping, evaluate expressions |

Also: **Performance overlay** (`showPerformanceOverlay: true` in MaterialApp, or `P` key) — two graphs (top = raster, bottom = UI); red bars = slow frames.

Custom timeline events for your own code:
```dart
import 'dart:developer';
Timeline.startSync('parseCatalog');
parseCatalog();
Timeline.finishSync();
// or: Timeline.timeSync('parseCatalog', parseCatalog);
```

---

## 23.3 Diagnosing jank: the decision tree 🌳

```
Jank frame in DevTools →
 ├─ UI bar high (Dart/main thread)?
 │    ├─ Many widgets rebuilding?       → reduce rebuild scope (const, split widgets, select/BlocSelector, ValueListenableBuilder)
 │    ├─ Expensive build() logic?        → move computation out (memoize, precompute in state layer, isolates)
 │    ├─ Layout expensive?               → avoid IntrinsicHeight/Width, nested shrinkWrap lists, deep trees; use itemExtent
 │    ├─ Synchronous heavy work (JSON, sorting, crypto, image processing)? → Isolate.run / compute
 │    └─ GC pauses from huge allocations? → reduce allocations in hot paths
 └─ Raster bar high (GPU)?
      ├─ saveLayer-heavy effects: Opacity on complex subtree, ShaderMask, ColorFilter, BackdropFilter, ClipPath with antiAlias → simplify/avoid, use FadeTransition, pre-blurred images
      ├─ Huge images decoded at full res → cacheWidth/ResizeImage, proper image sizes
      ├─ Too many layers / platform views → reduce
      ├─ Complex paths/shadows (many BoxShadows, large blur radius) → cheaper shadows, cache
      └─ (Skia only) First-run shader compilation → Impeller
```

---

## 23.4 Reducing rebuilds (UI thread) — techniques with examples

### 1. `const` everywhere possible
```dart
const SizedBox(height: 16);
const Text('Static label');
const MyStaticHeader();      // requires const constructor
```
Identical instances → Flutter skips rebuilding them.

### 2. Push state down / split widgets
```dart
// ❌ Entire page rebuilds every second because the clock is stored in the page state
class _PageState extends State<Page> { DateTime now = DateTime.now(); ... Timer → setState }

// ✅ Only ClockText rebuilds
class ClockText extends StatefulWidget { ... }  // owns its own timer & setState
```

### 3. Rebuild only what listens
* Provider: `Selector`, `context.select`, `Consumer` low in the tree.
* Riverpod: `ref.watch(provider.select((s) => s.count))`.
* Bloc: `BlocSelector`, `buildWhen`.
* `ValueListenableBuilder`/`ListenableBuilder` for tiny reactive parts.

### 4. Use the `child` parameter in builders
```dart
AnimatedBuilder(animation: c, child: const HeavyStatic(), builder: (_, child) => Transform.rotate(angle: c.value, child: child));
```

### 5. Avoid rebuilding because of MediaQuery
`MediaQuery.sizeOf(context)` instead of `MediaQuery.of(context)` (keyboard animation would otherwise rebuild everything every frame!).

### 6. Don't do work in build
❌ Sorting/filtering a 5,000-item list in `build`, `DateFormat(...)` creation per item, regex compilation per build, `jsonDecode` in build.
✅ Precompute in state layer; cache formatters (`static final _fmt = DateFormat.yMMMd();`).

### 7. Keys & list item stability
Stable `ValueKey`s keep elements/state when lists change; avoid `UniqueKey()` in build (forces rebuild & state loss each frame).

### 8. Avoid `setState` on huge widgets for tiny changes (e.g., text field typing rebuilding a whole form/page).

---

## 23.5 Rendering (raster) optimizations
* **Opacity**: animating `Opacity` widget → use `FadeTransition`/`AnimatedOpacity`. For a static semi-transparent image use `color.withValues(alpha:)` on the color or `Image(color:, colorBlendMode:)`/`opacity:` param instead of an Opacity widget (`Image` has an `opacity` parameter taking an `Animation<double>`).
* **Clipping**: `ClipRRect` per list item is costly; prefer `BoxDecoration(borderRadius:)` with `clipBehavior: Clip.antiAlias` only where needed. Avoid `Clip.antiAliasWithSaveLayer`.
* **Shadows/blur**: big `BoxShadow` blur radii and `BackdropFilter` (frosted glass) are expensive, especially over scrolling content; limit area (wrap with `ClipRect`), use `BackdropGroup`/`BackdropFilter.grouped` (newer Flutter APIs to share backdrop work) where available.
* **RepaintBoundary** around frequently repainting parts (animations, video, tickers, charts) to avoid repainting static content; verify with "Highlight repaints".
* **Images**: right size from CDN; `cacheWidth`; avoid `Image.network` with 4000×3000 photos in thumbnails; precache hero images.
* **Text**: avoid huge `Text` reflows each frame; cache `TextPainter`s in custom painters.
* **Platform views**: few, not in lists.

---

## 23.6 Lists & scrolling performance
(See Chapter 9 checklist) — builder constructors, itemExtent/prototypeItem, avoid shrinkWrap, keep item builds cheap, paginate, cached images, avoid nested scroll views.

---

## 23.7 Heavy computation → isolates
```dart
final result = await Isolate.run(() => expensiveSearchIndex(data));
```
Typical candidates: JSON > ~100KB, image filters/compression, PDF generation, encryption, diffing big lists, Markdown parsing of large docs. Note the message copying cost (send minimal data; use `TransferableTypedData` for bytes).

---

## 23.8 Memory: leaks & bloat 🧠

### Common leak sources
1. Not disposing: `AnimationController`, `TextEditingController`, `ScrollController`, `PageController`, `TabController`, `FocusNode`, `ChangeNotifier`s you create, `StreamController`s.
2. Not cancelling: `StreamSubscription`, `Timer`, listeners added to global objects (`WidgetsBinding.addObserver` without remove), `ValueNotifier.addListener` on long-lived objects.
3. Global/static collections growing forever (caches without limits).
4. Closures capturing `BuildContext`/State stored in long-lived objects (singletons, streams).
5. Images: big decoded images in `ImageCache`; videos/camera controllers not disposed.
6. Riverpod providers that should be autoDispose; blocs not closed; get_it singletons holding user data after logout.

### Finding leaks
* DevTools Memory → take snapshot → perform action N times (open/close screen) → snapshot → **diff**: classes whose instance counts keep growing (e.g., `_DetailsPageState` 10 instances after closing 10 times) = leak. Inspect **retaining path** (what holds it).
* `leak_tracker` in tests detects not-disposed and not-GCed objects.
* Android Studio Profiler / Xcode Instruments for native memory (images, platform views).

### Reducing memory
* `ImageCache` limits: `PaintingBinding.instance.imageCache.maximumSizeBytes = 100 << 20;` clear on memory pressure (`didHaveMemoryPressure`).
* Decode at display size (`cacheWidth`).
* Paginate data; don't keep entire datasets in memory.
* Dispose heavy resources when screens close.

---

## 23.9 Startup time 🚀
Measure: `flutter run --profile --trace-startup` → `build/start_up_info.json` (engineEnterTimestampMicros, timeToFirstFrameMicros...). Also Android vitals / Xcode Organizer launch metrics.

Improve:
* Do the **minimum before `runApp`** — show UI fast (native splash → first frame), initialize non-critical SDKs later (analytics, remote config fetch, ads) in parallel (`Future.wait`) or after first frame.
* Avoid synchronous heavy work in `main()`/global initializers.
* Lazy-load features; deferred imports (web code splitting; Android deferred components with Play Feature Delivery).
* Reduce initial asset decoding (big images/fonts/Lottie on the first screen).
* Pre-warm engine in add-to-app scenarios.
* Keep the first screen's widget tree lean.

---

## 23.10 App size 📦
Measure: `flutter build apk --analyze-size --target-platform android-arm64` (or `appbundle`/`ios`) → open the generated JSON in DevTools App Size tool. Real download size: Play Console's App size report / App Store Connect's App Thinning size report.

A Flutter "hello world" release is a few MB (engine + framework). Reduce:
1. **App Bundles (AAB)** — Play delivers per-ABI/density splits automatically. For APK distribution: `--split-per-abi`.
2. **Obfuscation + split debug info**: `--obfuscate --split-debug-info=build/symbols` (removes symbol names, smaller snapshot).
3. **Tree-shake icons** (default in release); avoid dynamic `IconData` construction.
4. **Assets**: compress images (WebP/AVIF), remove unused assets, use vector graphics (SVG→`vector_graphics`), download large assets on demand (CDN), subset fonts, avoid shipping many font weights.
5. **Dependencies**: audit heavy packages (some pull big native SDKs: ML Kit models, maps, video, ffmpeg_kit). Use `--analyze-size` to see per-package size.
6. **Android**: `isMinifyEnabled`/`isShrinkResources` (R8) for Java/Kotlin code; `resConfigs`/`localeFilters` to keep only needed languages from libraries.
7. **iOS**: bitcode is deprecated (Xcode 14+); App Thinning delivers device-specific slices; check embedded frameworks.
8. **Deferred components** (Android) / deferred libraries (web).

---

## 23.11 Network performance
Batch/paginate requests, compress (gzip — automatic with Dio/http on native when server supports), cache (ETag/Cache-Control, local DB), avoid waterfall requests (parallelize with `Future.wait`), prefetch next pages, cancel unneeded requests, use HTTP/2/3 native clients (`cupertino_http`, `cronet_http`), CDN for images.

---

## 23.12 Battery & background
Avoid continuous timers/polling (use push or longer intervals), stop animations offscreen (vsync does it for Tickers), pause location/sensors when not needed, batch work with WorkManager, avoid wake locks.

---

## 23.13 Performance testing & monitoring in organisations
* **Benchmarks** in CI using `integration_test` + `traceAction` (frame build/raster time percentiles, e.g., `average_frame_build_time_millis`, `90th_percentile_frame_rasterizer_time_millis`, `missed_frame_build_budget_count`).
* **Production monitoring**: Firebase Performance (app start, screen rendering: slow/frozen frames, network traces), Sentry performance, Android vitals (ANR rate, slow rendering), Xcode Organizer (hangs, launch time).
* `FrameTiming` API: `SchedulerBinding.instance.addTimingsCallback((timings) { ... })` to report jank metrics from real users.
* Performance budget per screen; PR checklist.

---

## 23.14 Performance checklist (print this) ✅
- [ ] Measured in profile mode on low-end device
- [ ] `const` constructors used; lint `prefer_const_constructors` on
- [ ] Stateful widgets small; state scoped; selective rebuilds
- [ ] No heavy work in `build`; formatters cached
- [ ] Lists use builders/slivers; no `shrinkWrap` on long lists; `itemExtent` when possible
- [ ] Images sized/cached; `cacheWidth` for thumbnails
- [ ] No unnecessary `Opacity`/`ClipPath`/`BackdropFilter`/`saveLayer`
- [ ] Animations use transitions/AnimatedBuilder with `child`; RepaintBoundary where useful
- [ ] Heavy CPU work in isolates
- [ ] All controllers/subscriptions/timers disposed
- [ ] Startup: minimal pre-`runApp` work, deferred SDK init
- [ ] App size analyzed; assets optimized; R8 enabled; obfuscation on
- [ ] Performance monitored in production

---

## 23.15 Interview Questions — Performance

**Q1. How do you investigate jank?** Reproduce in profile mode on a real device; DevTools Performance to see whether UI or raster thread exceeds budget; track widget rebuilds/layouts/paints; CPU profiler for Dart hotspots; fix and re-measure.

**Q2. How do you reduce unnecessary rebuilds?** const widgets, splitting widgets, localized state, selective listening (select/Selector/BlocSelector/buildWhen), builder `child` param, avoiding MediaQuery.of, stable keys.

**Q3. What is RepaintBoundary?** Creates a separate layer so repaints inside don't trigger repaints outside (and vice versa); useful for frequently changing subtrees; costs memory.

**Q4. Why is Opacity expensive and alternatives?** It may require an offscreen saveLayer for children; use FadeTransition/AnimatedOpacity for animation, alpha colours, or Image opacity.

**Q5. How do you handle heavy computation?** Move to background isolates (Isolate.run/compute), chunk work, or move server-side.

**Q6. How do you find memory leaks?** DevTools memory snapshots & diffs, retaining paths, leak_tracker in tests; check disposals and subscriptions.

**Q7. How do you reduce app size?** AAB/split per ABI, obfuscation + split debug info, asset optimization, remove heavy deps, R8 shrinking, deferred components, analyze-size.

**Q8. How do you improve startup time?** Minimize work before first frame, defer/parallelize initialization, lazy loading, lightweight first screen, native splash, trace-startup measurement.

**Q9. Why test performance in profile mode?** Debug mode uses JIT with assertions and debugging overhead; profile is AOT like release but keeps profiling hooks.

**Q10. What are the UI and raster thread bars in the performance overlay?** Bottom graph = UI (Dart) thread frame times; top = raster (GPU) thread; red bars exceed the frame budget.

**Q11. What is the frame budget at 120Hz?** ~8.33 ms per frame for each of UI and raster work.

**Q12. How do images affect performance?** Decoding large images costs CPU/memory and raster time; downscale at decode (cacheWidth), cache appropriately, use correct formats/sizes.
