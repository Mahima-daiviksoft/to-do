# Chapter 27 — Flutter Web, Desktop, Embedded, TV, Wearables, Games & AI Features

> **Goal:** Know what's different when targeting platforms beyond phones, so you can make good decisions and answer "Should we use Flutter for our web app/desktop app?".

---

## 27.1 Flutter Web 🌐

### What it's good for
✅ Web **apps**: dashboards, admin panels, internal tools, PWAs, interactive editors, companion web versions of mobile apps, embedding Flutter widgets in existing sites.
❌ Content-heavy/SEO-critical sites (blogs, marketing pages, e-commerce landing pages) — Flutter renders to canvas; use HTML-first frameworks (or a hybrid: marketing site in HTML + app in Flutter).

### Renderers & builds (recap)
* `flutter build web` → JS (dart2js) + **CanvasKit** (Skia in Wasm).
* `flutter build web --wasm` → **dart2wasm** (WasmGC) + **skwasm**, with automatic fallback to JS/CanvasKit in browsers without WasmGC support. Packages must use `dart:js_interop`/`package:web` (not `dart:html`) to be Wasm-compatible.
* The HTML renderer has been removed.

### Key web topics
* **URL strategy** (`usePathUrlStrategy()`), server rewrites to index.html.
* **Initial load size** (main.dart.js / wasm + CanvasKit): use deferred imports (`deferred as`) for code splitting, compress assets, CDN, caching headers; show an HTML loading indicator in `index.html` while Flutter boots (customize via `flutter_bootstrap.js` and `_flutter.loader.load({ onEntrypointLoaded })`).
* **SEO**: limited; set `<title>`/meta in index.html; semantics tree can expose text; consider prerendered static pages for marketing.
* **Text selection & copy**: `SelectionArea`.
* **Browser features**: right-click context menus (`BrowserContextMenu.disableContextMenu()` if you implement your own), keyboard shortcuts, mouse hover (`MouseRegion`), scrollbars, tab focus traversal.
* **CORS** (Chapter 16), cookies/auth (httpOnly cookies with backend sessions are often safer than tokens in localStorage).
* **Platform channels** don't exist on web in the same way; plugins provide web implementations in Dart/JS.
* `dart:io` unavailable → conditional imports.
* **Embedding**: Flutter can render into a specific `<div>` (multi-view embedding: `hostElement`) inside an existing React/Angular app.
* **Hot reload on web**: supported in recent versions (stable/default around 3.35+).
* Accessibility: semantics must be enabled (button or `SemanticsBinding.instance.ensureSemantics()`).
* Testing: `flutter test --platform chrome`, integration tests with `flutter drive -d chrome`.

---

## 27.2 Desktop (Windows, macOS, Linux) 🖥️

### Desktop UX differences (adaptive design!)
* Mouse + keyboard: hover states, cursors, right-click menus (`ContextMenuController`/`MenuAnchor`), keyboard shortcuts (`Shortcuts`/`Actions`), Tab focus traversal, scroll wheel/trackpad.
* Window management: resizing (responsive layouts!), min sizes, title bars, multiple windows (multi-window support is in development — previewed around Flutter 3.44 with Canonical leading; community `desktop_multi_window`), `window_manager` package (size, position, always on top, hide on close), system tray (`tray_manager`/`system_tray`), native menus (`PlatformMenuBar` on macOS).
* Native file dialogs: `file_selector` (official), `file_picker`.
* Denser layouts (`VisualDensity.compact`), larger screens → master-detail.
* Desktop distribution & signing (Chapter 26), auto-update (Sparkle on macOS via `auto_updater`, MSIX updates).
* macOS sandbox entitlements: network client/server, file access (`com.apple.security.files.user-selected.read-write`).
* Exit handling: `AppLifecycleListener.onExitRequested` to confirm unsaved work.
* Rendering: Impeller becoming default on desktop in recent releases (3.47 per release notes).

---

## 27.3 Embedded, automotive & TV
* **Custom embedders** using the Flutter Embedder API (C): Toyota (infotainment), BMW (iX app UI), Sony, LG webOS TVs (LG announced Flutter support), Raspberry Pi kiosks (`flutter-pi`), **Sony's/Toyota's `flutter-elinux`/ivi-homescreen** (embedded Linux).
* **Android TV / Google TV**: D-pad focus navigation (`Focus`, `FocusTraversalGroup`, visible focus highlights), leanback launcher intent-filter, 10-foot UI.
* **Apple TV (tvOS)**: not officially supported (community efforts).

---

## 27.4 Wearables
* **Wear OS**: Flutter apps run (round screens: `wear_plus`/`wearable_rotary`, ambient mode); resource constraints.
* **watchOS**: not supported natively — build a native SwiftUI watch app and communicate via `WatchConnectivity` (plugins like `watch_connectivity`).

---

## 27.5 Home screen widgets, App Clips, Live Activities, extensions
* Home screen widgets (Android AppWidgets / iOS WidgetKit) must be **native UI**; share data via `home_widget` (App Groups on iOS, SharedPreferences on Android); can render Flutter widgets to images for display.
* iOS **Live Activities / Dynamic Island**: native (ActivityKit) with data from Flutter via plugins (`live_activities`).
* **App Clips** (iOS) / **Instant Apps** (Android) have size limits; Flutter is possible but challenging (size).
* Share extensions, notification service extensions, keyboard extensions — native targets; sharing code/data with App Groups.

---

## 27.6 Games 🎮
* **Flame** engine: game loop, sprites, animations, collision detection, input, effects, Forge2D (Box2D physics), Tiled maps, audio (`flame_audio`). Example: Google's I/O Pinball, "Super Dash" demo.
* Flutter **Casual Games Toolkit** (ads, IAP, games services, Firebase).
* `flutter_gpu` (experimental low-level GPU API) and fragment shaders for custom rendering.
* For 3D/heavy games, Unity/Unreal/Godot remain better choices.

---

## 27.7 AI features in Flutter apps (2025–2026 landscape) 🤖
* **Firebase AI Logic** (`firebase_ai`, formerly Vertex AI in Firebase) — call Gemini models from the app with App Check protection (don't embed raw API keys).
* `google_generative_ai` Dart SDK was deprecated in favour of Firebase AI Logic.
* **Flutter AI Toolkit** (`flutter_ai_toolkit`) — ready-made chat UI widgets (LlmChatView) with pluggable providers.
* On-device ML: ML Kit (`google_mlkit_*` — text recognition, barcode, face detection, translation), TensorFlow Lite / LiteRT (`tflite_flutter`), MediaPipe; on-device LLMs (Gemini Nano via Android AICore — platform-specific; `flutter_gemma` community package).
* Streaming responses (SSE/streams) → `StreamBuilder`/incremental text rendering; markdown rendering (`flutter_markdown_plus`/`gpt_markdown`).
* Developer tooling: **Dart & Flutter MCP server** (lets AI coding assistants introspect your running app, analyze errors, search pub.dev), Gemini in Android Studio, AI rules files for Flutter.
* Responsible AI: rate limit, moderate content, don't send PII without consent, cost control via backend proxies.

---

## 27.8 Interview Questions — Beyond mobile

**Q1. Is Flutter web good for SEO?** Not by default — canvas rendering; use for apps, not content sites; add metadata/prerendering if needed.

**Q2. CanvasKit vs skwasm?** CanvasKit: Skia compiled to Wasm used with JS builds; skwasm: used with Wasm (dart2wasm) builds — faster and can use multiple threads; falls back to CanvasKit when unsupported.

**Q3. How do you reduce Flutter web load time?** Deferred loading, Wasm build, asset optimization, caching/CDN, loading indicator, tree shaking, avoid huge packages.

**Q4. What changes when targeting desktop?** Mouse/keyboard interactions, window management, menus, file dialogs, responsive dense layouts, platform signing/distribution.

**Q5. Can Flutter build watchOS/home screen widgets?** Not directly; use native code with data sharing (WatchConnectivity, App Groups, home_widget).

**Q6. How would you add AI chat to a Flutter app?** Backend-proxied or Firebase AI Logic (App Check) LLM calls, streaming responses into UI, flutter_ai_toolkit or custom chat UI, safety & cost controls.
