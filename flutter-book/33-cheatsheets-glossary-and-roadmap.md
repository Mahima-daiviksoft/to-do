# Chapter 33 — Cheat Sheets, Deprecated-API Migration Table, Glossary & Learning Roadmap

---

## 33.1 One-page Flutter cheat sheet 📄

### Widget basics
```dart
class X extends StatelessWidget { const X({super.key}); @override Widget build(BuildContext c) => ...; }
class Y extends StatefulWidget { const Y({super.key}); @override State<Y> createState() => _YState(); }
class _YState extends State<Y> { @override void initState(){super.initState();} @override void dispose(){super.dispose();} @override Widget build(BuildContext c) => ...; }
```

### Layout quick picks
| Need | Use |
|---|---|
| Horizontal / vertical | Row / Column (+ Expanded, Flexible, Spacer, `spacing:`) |
| Overlap | Stack + Positioned |
| Gap | SizedBox(height/width) |
| Padding | Padding(EdgeInsets...) |
| Center/align | Center / Align |
| Wrap lines | Wrap |
| Scroll a page | SingleChildScrollView / ListView |
| Long list | ListView.builder / SliverList |
| Grid | GridView.builder |
| Mixed scrolling | CustomScrollView + slivers |
| Responsive | LayoutBuilder / MediaQuery.sizeOf |
| Ratio | AspectRatio |
| Scale to fit | FittedBox |
| Safe area | SafeArea |

### State quick picks
| Scope | Tool |
|---|---|
| One widget | setState / ValueNotifier |
| Small app | ChangeNotifier + Provider / ListenableBuilder |
| Medium–large | Riverpod / Bloc |

### Navigation
```dart
Navigator.push(context, MaterialPageRoute(builder: (_) => Page()));
final r = await Navigator.push<T>(...); Navigator.pop(context, value);
context.go('/path'); context.push('/path'); context.pop();
PopScope(canPop: false, onPopInvokedWithResult: (didPop, result) {...}, child: ...)
```

### Async
```dart
final (a, b) = await (fa(), fb()).wait;
await Future.wait([f1, f2]);
Isolate.run(() => heavy());
if (!mounted) return;  if (!context.mounted) return;
```

### Must-dispose list
AnimationController · TextEditingController · ScrollController · PageController · TabController · FocusNode · StreamSubscription (cancel) · Timer (cancel) · StreamController (close) · ChangeNotifier you own · VideoPlayerController · CameraController · WebSocket channels · Tickers · Observers (removeObserver) · GestureRecognizers you create (e.g., TapGestureRecognizer in TextSpan)

### CLI
```bash
flutter create --org com.x app · flutter run [-d id] [--release|--profile] [--flavor f -t lib/main_f.dart]
flutter pub get|add|upgrade|outdated · dart run build_runner build -d · flutter gen-l10n
flutter analyze · dart format . · dart fix --apply · flutter test [--coverage] [--update-goldens]
flutter build apk|appbundle|ipa|web [--wasm]|windows|macos|linux [--obfuscate --split-debug-info=dir]
flutter clean · flutter doctor -v · flutter upgrade · flutter symbolize
```

---

## 33.2 Deprecated / removed APIs → modern replacements (interview gold) 🔄

| Old | New | Since (approx.) |
|---|---|---|
| `RaisedButton`, `FlatButton`, `OutlineButton` | `ElevatedButton`, `TextButton`, `OutlinedButton` (+ `FilledButton`) | Deprecated 2.0, removed 3.x |
| `Scaffold.of(context).showSnackBar` | `ScaffoldMessenger.of(context).showSnackBar` | 2.0 |
| `WillPopScope` | `PopScope` (`canPop`, `onPopInvokedWithResult`) | 3.12 (→ result variant 3.24) |
| `MaterialStateProperty`, `MaterialState` | `WidgetStateProperty`, `WidgetState` | 3.19 |
| `textScaleFactor` | `TextScaler` / `textScaler` | 3.16 |
| `Color.withOpacity()`, `.value`, `.red/.green/.blue/.opacity` | `withValues(alpha:)`, `toARGB32()`, `.r/.g/.b/.a` | 3.27 |
| `ColorScheme.background/onBackground/surfaceVariant` | `surface/onSurface/surfaceContainerHighest` | 3.22 |
| `useMaterial3: false` default | Material 3 default | 3.16 |
| `headline1`, `bodyText1`, … | `displayLarge`, `bodyLarge`, … | 3.x |
| `RawKeyboardListener`, `RawKeyEvent` | `KeyboardListener`, `Focus.onKeyEvent`, `KeyEvent` | 3.18 |
| `Navigator.onPopPage` | `Navigator.onDidRemovePage` | 3.24 |
| `ThemeData.cardTheme: CardTheme` etc. | `CardThemeData`, `DialogThemeData`, `TabBarThemeData` | 3.27+ |
| `dart:html`, `dart:js`, `package:js` | `dart:js_interop`, `package:web` | Dart 3.3+ (required for Wasm) |
| HTML web renderer (`--web-renderer html`) | CanvasKit / skwasm | removed 2025 |
| Android v1 embedding (`Registrar`, `io.flutter.app.FlutterActivity`) | v2 embedding (`FlutterPlugin`, `io.flutter.embedding.android.FlutterActivity`) | removed 3.x |
| Gradle imperative `apply plugin` / `apply from: flutter.gradle` | Declarative `plugins { id("dev.flutter.flutter-gradle-plugin") }` | 3.16+ |
| `flutter_driver` | `integration_test` (+ Patrol) | 2.x |
| `mapEventToState` (Bloc ≤7) | `on<Event>` handlers | Bloc 8 |
| Riverpod `StateNotifierProvider`, `StateProvider`, `ChangeNotifierProvider` | `NotifierProvider`, `AsyncNotifierProvider` (legacy imports) | Riverpod 2 → 3 |
| `AsyncValue.valueOrNull` | `.value` | Riverpod 3 |
| `package:flutter_gen/gen_l10n/...` synthetic package | generated files in source tree (`output-dir`) | ~3.29+ |
| Firebase Dynamic Links | App Links / Universal Links / third-party (Branch etc.) | shut down Aug 2025 |
| `google_generative_ai` Dart SDK | Firebase AI Logic (`firebase_ai`) | 2025 |
| `MediaQuery.of(context).size` (not deprecated, but) | `MediaQuery.sizeOf(context)` (fewer rebuilds) | 3.10 |
| `import 'package:flutter/material.dart'` (framework) | `material_ui` / `cupertino_ui` packages (opt-in; framework copies to be deprecated) | 3.47 |
| Dart macros (`@JsonCodable`) — experimental | cancelled → use build_runner codegen | Jan 2025 |

---

## 33.3 Dart & Flutter version timeline (high-level) 🗓️
| Version | Highlights |
|---|---|
| Flutter 1.0 (Dec 2018) | First stable |
| Flutter 2.0 (Mar 2021) / Dart 2.12 | Web stable, sound null safety |
| Flutter 2.10 (Feb 2022) | Windows stable |
| Flutter 3.0 (May 2022) / Dart 2.17 | macOS & Linux stable, enhanced enums, super params |
| Flutter 3.7 (Jan 2023) | Background isolate channels, `BuildContext.mounted` |
| Flutter 3.10 (May 2023) / Dart 3.0 | Records, patterns, sealed & class modifiers, 100% null safety, Impeller default on iOS |
| Flutter 3.13 (Aug 2023) | AppLifecycleListener, new slivers groups |
| Flutter 3.16 (Nov 2023) / Dart 3.2 | Material 3 default, private field promotion |
| Flutter 3.19 / 3.22 (2024) / Dart 3.3–3.4 | Extension types; Wasm web stable (3.22) |
| Flutter 3.24 (Aug 2024) / Dart 3.5 | Sliver headers (Pinned/Floating), CarouselView, SwiftPM early support |
| Flutter 3.27 (Dec 2024) / Dart 3.6 | Impeller default Android API 29+, Row/Column spacing, Color wide-gamut APIs, pub workspaces |
| Flutter 3.29 (Feb 2025) / Dart 3.7 | Merged UI/platform threads (mobile), wildcard variables, new formatter style, Skia removed on iOS |
| Flutter 3.32 (May 2025) / Dart 3.8 | Web hot reload (experimental), null-aware collection elements |
| Flutter 3.35 (Aug 2025) / Dart 3.9 | Widget previews (experimental), web hot reload on by default |
| Flutter 3.38 (Nov 2025) / Dart 3.10 | Dot shorthands, widget previews in IDEs, build hooks stable, web dev config |
| Flutter 3.41 (Feb 2026) / Dart 3.11 | Stability/performance release; Dart 3.11 has no new language features |
| Flutter 3.44 (May 2026) / Dart 3.12 | SwiftPM default (iOS/macOS), Android Hybrid Composition++, Material/Cupertino frozen in framework, multi-window preview |
| Flutter 3.47 (Aug 2026) / Dart 3.13 | Standalone `material_ui`/`cupertino_ui` packages, Impeller desktop default, primary constructors |
> Treat minor details as approximate — always confirm with the official release notes for the exact version your project uses.

---

## 33.4 Glossary (A–Z) 📚
* **AAB** — Android App Bundle; publishing format for Play.
* **ADR** — Architecture Decision Record.
* **AOT** — Ahead-of-time compilation to machine code (release/profile).
* **Arena (gesture)** — Mechanism resolving competing gesture recognizers.
* **AsyncValue** — Riverpod's loading/data/error union.
* **Binding** — Singleton glue between framework and engine (WidgetsFlutterBinding).
* **Bloc/Cubit** — Stream-based state management components.
* **BoxConstraints** — min/max width/height passed from parent to child.
* **BuildContext** — Handle to an element's location in the tree.
* **CanvasKit** — Skia compiled to WebAssembly for Flutter web.
* **Codec (channel)** — Serializer for platform channel messages.
* **Composition (widgets)** — Building UIs from small widgets rather than inheritance.
* **Cubit** — Simplified Bloc without events.
* **Dart VM** — Runtime executing Dart (JIT/AOT).
* **Deferred loading** — Lazy loading of libraries.
* **DevTools** — Flutter's debugging/profiling suite.
* **DTO** — Data Transfer Object, mirrors API data.
* **Element** — Instantiation of a widget at a location in the tree.
* **Embedder** — Platform host for the engine.
* **Engine** — C++ core: rendering, Dart runtime, text, platform messaging.
* **Ephemeral state** — Local UI state.
* **Extension type** — Zero-cost static wrapper type (Dart 3.3).
* **FFI** — Foreign Function Interface to C.
* **Flavor** — Build variant (dev/staging/prod).
* **Frame budget** — Time per frame (16.67ms @60Hz).
* **Golden test** — Pixel snapshot test.
* **GlobalKey** — App-unique key for state access/reparenting.
* **Hot reload / restart** — Inject code keeping state / restart Dart state.
* **Hit test** — Finding which render objects are under a pointer.
* **Impeller** — Flutter's modern renderer with precompiled shaders.
* **InheritedWidget** — Efficient data propagation down the tree.
* **Isolate** — Independent Dart worker with own memory/event loop.
* **JIT** — Just-in-time compilation (debug).
* **Jank** — Visible stutter from missed frames.
* **Key** — Identity for widgets across rebuilds.
* **Layer tree** — Composited output of paint phase.
* **Microtask** — High-priority async task run before next event.
* **Mixin** — Reusable class members applied with `with`.
* **Null safety** — Non-nullable by default type system.
* **Pigeon** — Type-safe platform channel code generator.
* **Platform channel** — Async message bridge Dart ↔ native.
* **Platform view** — Native view embedded in Flutter.
* **Provider** — InheritedWidget-based DI/state package.
* **Raster thread** — Thread that converts layer tree to GPU commands.
* **Record** — Anonymous immutable tuple type.
* **Relayout/Repaint boundary** — Points stopping layout/paint invalidation propagation.
* **RenderObject** — Object performing layout/paint/hit testing.
* **Repository** — Data abstraction layer.
* **Riverpod** — Compile-safe reactive state/DI framework.
* **Sealed class** — Closed type hierarchy enabling exhaustive switches.
* **Semantics** — Accessibility information tree.
* **Skia** — 2D graphics library previously default renderer.
* **skwasm** — Wasm-based renderer for Flutter web Wasm builds.
* **Sliver** — Scrollable layout piece using sliver protocol.
* **Stream** — Async sequence of events.
* **Ticker** — Per-frame callback source for animations.
* **Tree shaking** — Removing unused code in compilation.
* **Tween** — Mapping 0..1 to a value range.
* **Viewport** — Visible window of slivers.
* **Vsync** — Display refresh signal driving frames.
* **Wasm (WasmGC)** — WebAssembly with garbage collection used by dart2wasm.
* **Widget** — Immutable UI configuration.
* **Zone** — Async execution context for error handling/locals.

---

## 33.5 Learning roadmap (beginner → expert) 🧭

### Stage 1 — Foundations (2–3 weeks)
Chapters 1–5. Build: counter, BMI calculator, unit converter, quiz app. Practice Dart problems (Chapter 32 Part A).

### Stage 2 — UI mastery (3–4 weeks)
Chapters 6–13. Build: profile screen clone (responsive), e-commerce product page, animated onboarding, custom chart with CustomPainter, form-heavy signup with validation.

### Stage 3 — App development (4–6 weeks)
Chapters 14–19. Build: users directory (API + Riverpod), todo with Bloc + Drift, chat UI with Firebase, notes app with offline sync, a small plugin with Pigeon.

### Stage 4 — Professional engineering (4–6 weeks)
Chapters 20–28. Refactor one project into clean feature-first architecture with DI, add unit/widget/golden/integration tests, set up CI (GitHub Actions), flavors, crash reporting, analytics, performance profiling, release to internal testing track/TestFlight.

### Stage 5 — Interview sprint (2 weeks)
Chapters 29–32: answer every question aloud; do 3 timed machine-coding rounds; prepare 6 STAR stories (bug, performance win, conflict, failure, leadership, learning); mock system design (chat, e-commerce, feed).

### Daily habit
* 1 Dart puzzle, 1 widget from the Widget of the Week series, read 1 Flutter source file (e.g., `framework.dart` element lifecycle), review 1 open-source Flutter app's architecture.

### Projects that impress interviewers
1. A production-like app with: feature-first architecture, Riverpod/Bloc, go_router + deep links, offline cache, l10n (incl. RTL), dark mode, accessibility, tests (≥60% on logic), CI badge, screenshots, README with architecture diagram.
2. A published package/plugin on pub.dev (even small) with tests & docs.
3. Contributions/issues on Flutter or popular packages.

---

## 33.6 Final interview-day checklist ✅
- [ ] Can explain widget/element/render trees and setState flow
- [ ] Can explain constraints & fix overflow/unbounded errors live
- [ ] Can explain keys with an example
- [ ] Can compare Provider/Riverpod/Bloc with trade-offs
- [ ] Can explain event loop, Future vs Stream, isolates
- [ ] Can design app architecture (layers, DI, repository, error handling)
- [ ] Can discuss performance investigation with DevTools
- [ ] Can describe testing strategy (unit/widget/golden/integration) and pump vs pumpAndSettle
- [ ] Knows platform channels/Pigeon/FFI basics
- [ ] Knows release process: flavors, signing, CI/CD, staged rollout
- [ ] Knows security basics: secure storage, no secrets, pinning trade-offs
- [ ] Knows recent changes (Impeller, Dart 3 features, Material 3, PopScope, dot shorthands, material_ui decoupling, Riverpod 3)
- [ ] Has STAR stories ready and questions for the interviewer
