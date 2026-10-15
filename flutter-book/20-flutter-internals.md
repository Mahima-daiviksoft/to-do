# Chapter 20 — Flutter Internals: Bindings, the Frame Pipeline, Build/Layout/Paint/Composite, Layers, Impeller, the Dart VM & Hot Reload

> **Goal:** Know how Flutter works *under the hood*. This is what distinguishes a senior/lead candidate, and it's what lets you debug "impossible" bugs and performance problems.

---

## 20.1 The bindings — glue between framework and engine

`WidgetsFlutterBinding` is a singleton mixing in several bindings:

| Binding | Responsibility |
|---|---|
| `BindingBase` | Base, service extensions |
| `GestureBinding` | Receives pointer events from the engine, hit tests, dispatches, runs gesture arena |
| `SchedulerBinding` | Frame scheduling: transient callbacks (animations/Tickers), persistent callbacks (rendering pipeline), post-frame callbacks; task priorities |
| `ServicesBinding` | Platform messages (channels), lifecycle, keyboard, system chrome |
| `PaintingBinding` | Image cache, shader warm-up (legacy), font loading |
| `SemanticsBinding` | Accessibility |
| `RendererBinding` | Owns the `PipelineOwner` & render views (root of RenderObject tree), drives layout/paint/composite |
| `WidgetsBinding` | Owns the `BuildOwner` (element tree builds), lifecycle observers, routes from platform |

`runApp(widget)` → `WidgetsFlutterBinding.ensureInitialized()` → attaches root widget (`View` → `RawView`… with the `RenderView` root) → `scheduleWarmUpFrame()`.

Multi-view: since Flutter 3.x the binding supports **multiple views** (`PlatformDispatcher.views`, `View` widget, `runWidget`) — used for multi-window desktop (in progress) and web embedding into multiple DOM elements.

---

## 20.2 The life of a frame 🎞️

```
VSync signal from OS (e.g., every 16.67ms @60Hz / 8.33ms @120Hz)
        │
        ▼
Engine calls PlatformDispatcher.onBeginFrame ──► SchedulerBinding.handleBeginFrame
        │   ① Transient callbacks: Tickers → AnimationControllers update values
        │      (listeners mark widgets dirty / render objects needsPaint)
        ▼
Microtasks run (between beginFrame and drawFrame)
        ▼
Engine calls onDrawFrame ──► SchedulerBinding.handleDrawFrame
        │   ② Persistent callbacks → WidgetsBinding.drawFrame():
        │        a. BUILD   — buildOwner.buildScope(): rebuild dirty elements
        │        b. LAYOUT  — pipelineOwner.flushLayout()
        │        c. COMPOSITING BITS — pipelineOwner.flushCompositingBits()
        │        d. PAINT   — pipelineOwner.flushPaint()  (records into layers/pictures)
        │        e. COMPOSITE — renderView.compositeFrame(): build Scene from layer tree → engine
        │        f. SEMANTICS — pipelineOwner.flushSemantics()
        │        g. FINALIZE TREE — buildOwner.finalizeTree(): unmount inactive elements (dispose)
        │   ③ Post-frame callbacks (addPostFrameCallback)
        ▼
UI thread done (must be < frame budget)
        ▼
RASTER THREAD: Scene/LayerTree → Impeller (or Skia) → GPU commands → present
(must ALSO be < frame budget; runs in parallel with the next frame's UI work)
```
Key insights:
* **Two budgets**: UI thread work (build/layout/paint recording) and raster thread work (GPU rasterization) each must fit in ~16ms (60 fps) or ~8ms (120 fps). DevTools shows both bars. Red UI bar → expensive Dart code; red raster bar → expensive drawing (saveLayer, blur, clipping, huge images, too many layers).
* Flutter doesn't draw continuously — **frames are only scheduled when something changes** (`scheduleFrame` from setState, animations, etc.). Idle apps use no CPU.
* `addPostFrameCallback` runs after the frame is laid out & painted — safe to measure sizes or show dialogs after first build.
* `SchedulerBinding.instance.schedulerPhase` tells you where you are; calling `setState` during the build phase (except for descendants being built later) triggers the "setState during build" assertion.

---

## 20.3 Build phase in detail

* `BuildOwner` maintains a **dirty list** of elements (from `markNeedsBuild`).
* `buildScope` sorts dirty elements by **depth** (parents first) and calls `rebuild()` on each → `performRebuild()` → `build()` → `updateChild` for its children (reconciliation, Chapter 6).
* An element rebuilt by its parent in this pass is removed from the dirty list (no double build).
* Inactive elements (removed this frame) are kept in `_InactiveElements` and either **reactivated** (GlobalKey reparenting) or **unmounted** at `finalizeTree` (→ `State.dispose`).
* **GlobalKey lookups** use a registry in BuildOwner.
* `InheritedElement` keeps a set of dependents; when updated and `updateShouldNotify` is true → `didChangeDependencies` + mark dependents dirty.
* Each element has `_inheritedElements` (a persistent hash map) → `dependOnInheritedWidgetOfExactType` is O(1).

### Element types
* `ComponentElement` (`StatelessElement`, `StatefulElement`, `ProxyElement` → `InheritedElement`, `ParentDataElement`).
* `RenderObjectElement` (`LeafRenderObjectElement`, `SingleChildRenderObjectElement`, `MultiChildRenderObjectElement`, `RootRenderObjectElement`), slivers too.
* `RenderObjectElement.mount` → `widget.createRenderObject(this)` and attaches to the nearest ancestor RenderObjectElement's render object (`insertRenderObjectChild`).
* On update → `widget.updateRenderObject(this, renderObject)` (setters call markNeedsLayout/Paint only if values changed).

---

## 20.4 Layout phase in detail

* `PipelineOwner._nodesNeedingLayout`: render objects marked by `markNeedsLayout()`.
* `markNeedsLayout` walks **up** to the nearest **relayout boundary** and marks it; only boundaries are queued.
* A render object is a **relayout boundary** if: `!parentUsesSize` OR `sizedByParent` OR constraints are **tight** OR parent isn't a RenderObject. Then its size can't change due to child changes from the parent's point of view.
* `flushLayout` sorts by depth and calls `_layoutWithoutResize` → `performLayout()`.
* `layout(constraints, parentUsesSize:)` skips work if constraints unchanged and not dirty (**caching**).
* **Single-pass layout**: each render object is laid out at most once per frame in normal cases → O(N). Exceptions: **intrinsic** queries (`getMinIntrinsicWidth`, used by `IntrinsicHeight/Width`, `Table`) do speculative extra passes → potentially O(N²); `LayoutBuilder` delays building children to layout time; **dry layout** (`computeDryLayout`) computes size without side effects.
* Box protocol: `BoxConstraints` → `Size`. Sliver protocol: `SliverConstraints` (scrollOffset, remainingPaintExtent, overlap, axis direction, cacheOrigin…) → `SliverGeometry` (scrollExtent, paintExtent, layoutExtent, maxPaintExtent, hitTestExtent, hasVisualOverflow…).
* Debug flags: `debugPrintMarkNeedsLayoutStacks`, `debugProfileLayoutsEnabled` (shows layout events in timeline).

---

## 20.5 Paint & compositing

* `markNeedsPaint()` walks up to the nearest **repaint boundary** (`isRepaintBoundary == true`) and schedules it.
* Each repaint boundary has its own **`OffsetLayer`**; painting records drawing commands into a `PictureRecorder` → `Picture` stored in a `PictureLayer`.
* Painting doesn't rasterize! It **records** commands (display list). Rasterization happens on the raster thread.
* **Layer tree**: `ContainerLayer`, `OffsetLayer`, `PictureLayer`, `OpacityLayer`, `ClipRectLayer`/`ClipRRectLayer`/`ClipPathLayer`, `TransformLayer`, `ColorFilterLayer`, `ImageFilterLayer`, `BackdropFilterLayer`, `ShaderMaskLayer`, `TextureLayer` (video/camera), `PlatformViewLayer`, `LeaderLayer`/`FollowerLayer`, `AnnotatedRegionLayer`.
* `needsCompositing` bits: some effects (opacity on a repaint boundary subtree, platform views, textures) need separate layers; `flushCompositingBits` computes them.
* `compositeFrame` → `SceneBuilder` builds a `Scene` from the layer tree → `FlutterView.render(scene)` hands it to the engine.
* Retained layers: a repaint boundary that didn't change **reuses its previous layer** (no re-recording) — this is why `RepaintBoundary` helps for frequently-changing subtrees (e.g., an animated spinner over a static page) and for static complex subtrees next to changing ones.
* The engine may also **cache rasterized layers** (raster cache in Skia; Impeller has different caching strategies).
* **`saveLayer`** forces an offscreen buffer — expensive (Opacity on complex children historically, `ShaderMask`, `ColorFilter`, some clips with antiAliasWithSaveLayer, `BackdropFilter`). DevTools "Highlight oversized images" / "checkerboard offscreen layers" (`checkerboardOffscreenLayers: true`) help find them.

### RepaintBoundary trade-off
Each boundary = extra layer (memory, compositing). Use when a subtree repaints often and independently. Flutter already adds them for list items (`addRepaintBoundaries`), routes, scroll views etc. DevTools "Highlight repaints" (rainbow borders) shows what repaints.

---

## 20.6 The rendering backends: Skia & Impeller 🖌️

### Skia (historic default)
* Google's 2D graphics library (also used by Chrome, Android).
* Problem: **runtime shader compilation**. The first time an effect (e.g., a particular blur/gradient/clip combo) is drawn, Skia generates & compiles GPU shaders on the raster thread → long first-frame stutter = **"shader compilation jank"**, notably on iOS/Metal.
* Mitigation was **SkSL warm-up**: run app with `--cache-sksl`, press `M` to save shaders, bundle with `--bundle-sksl-path` — device/driver-specific & brittle. (No longer relevant with Impeller.)

### Impeller (current default on mobile)
* Built by the Flutter team specifically for Flutter.
* **All shaders compiled ahead of time** at engine build time (a fixed, smaller set of shader variants) → **no runtime shader compilation jank**.
* Uses modern APIs: **Metal** (iOS/macOS), **Vulkan** (Android; falls back to **OpenGL ES** on devices without good Vulkan support).
* Predictable performance, tessellation of paths on GPU/CPU, designed for concurrency, easier to profile.
* Timeline:
  * iOS: default since **Flutter 3.10** (May 2023); Skia opt-out **removed in 3.29**.
  * Android: default on API 29+ since **Flutter 3.27**; older devices/drivers fall back (to OpenGL ES Impeller backend or Skia depending on version/device).
  * macOS/desktop: preview, becoming default progressively (Flutter 3.47 makes Impeller the desktop default per release notes).
  * Web: uses CanvasKit (Skia compiled to WebAssembly) or **skwasm** (with Wasm builds); Impeller-on-web work is ongoing.
* Opt-out on Android (while allowed): `flutter run --no-enable-impeller` or manifest meta-data `io.flutter.embedding.android.EnableImpeller` = false. (Some SDKs/plugins historically forced this off — and newer Flutter versions are removing Skia on modern Android entirely, so check your version.)

---

## 20.7 Threads & runners (recap with depth)

* **Platform runner** — main OS thread.
* **UI runner** — root isolate Dart code. Since Flutter 3.29 (Android/iOS) the UI and platform threads are **merged** by default (Dart runs on the platform main thread), enabling synchronous native interop. Conceptually, "UI thread" work is still separate from raster work.
* **Raster runner** — rasterization via Impeller/Skia.
* **IO runner** — image decoding, asset loading, GPU uploads.
* Dart `Isolate`s you spawn get their own OS threads from a thread pool.

---

## 20.8 The Dart VM, compilation & memory

### Compilation pipeline
* **Debug (native)**: Dart source → **kernel** (`.dill`, intermediate representation produced by the CFE — Common Front End) → run in VM with **JIT** compiler; incremental compilation enables hot reload.
* **Profile/Release (native)**: kernel → **AOT compiler** (gen_snapshot) → native machine code snapshot (`libapp.so` on Android, `App.framework` on iOS). The release engine (`libflutter.so`/`Flutter.framework`) contains a precompiled runtime (no JIT — iOS forbids JIT anyway).
* **Web**: `dartdevc` (debug, modular JS), `dart2js` (release, optimized JS), `dart2wasm` (WasmGC). 
* **Tree shaking**: removes unused classes/methods in AOT and dart2js; also icon font subsetting.
* **Obfuscation** (`--obfuscate --split-debug-info=<dir>`): renames symbols, reducing reverse engineering ease; symbol map needed to de-obfuscate stack traces (`flutter symbolize`).

### Memory management & garbage collection
* Dart uses a **generational GC**:
  * **New space (young generation)**: a **semi-space scavenger** (copying collector) — very fast for short-lived objects (most widgets!). Live objects are copied between two halves; dead ones are just abandoned.
  * **Old space**: **concurrent mark-sweep** (with compaction when needed) for long-lived objects (elements, render objects, state, caches).
* GC runs per isolate group; Flutter engine can schedule GCs at idle times between frames (`notifyIdle`) to avoid jank.
* **Memory leaks in Dart** = objects still reachable unintentionally: listeners not removed, stream subscriptions not cancelled, controllers not disposed, static/global caches growing, closures capturing `BuildContext`/State, timers. GC can't collect reachable objects.
* Tools: DevTools Memory view (heap snapshots, diff, allocation tracing), `leak_tracker` package (Flutter's own tests use it; can be enabled in widget tests via `LeakTesting`).
* Images are the biggest memory consumers — decoded bitmaps live in native memory (ImageCache holds `ui.Image` handles).

### Snapshot & startup
App startup = native launch → engine init → Dart VM/isolate start → load AOT snapshot → `main()` → first frame. Measure with `flutter run --trace-startup --profile` (writes `start_up_info.json`: time to first frame). Optimize: defer heavy init, lazy-load features, avoid big synchronous work before `runApp`, use deferred components (Android dynamic feature modules) / deferred imports (web).

---

## 20.9 How hot reload actually works 🔥
1. You save a file; the Flutter tool's **frontend server** incrementally recompiles **changed libraries** into a kernel diff.
2. The diff is sent to the running Dart VM via the **VM Service** protocol.
3. The VM **reloads** the libraries: replaces class/function definitions **in place**, keeping the heap (all existing objects/state stay alive). Field layouts are updated; existing instances keep values.
4. Flutter calls `reassemble()` on the tree and schedules a full rebuild of all widgets (`build` methods rerun with new code).
5. Because `main()`/`initState` aren't re-run and static fields keep values, those changes aren't reflected (Chapter 1 list).

Hot reload is only possible with JIT (debug). On web, hot reload became supported (Flutter 3.32 experimental, stable/default in 3.35–3.38) via DDC's new module system.
Hot restart: recompiles and restarts the root isolate (Dart state lost) without rebuilding native code.

---

## 20.10 Text rendering pipeline (brief)
`Text` → `RichText` → `RenderParagraph` → `TextPainter` → `dart:ui ParagraphBuilder` → engine (SkParagraph/libtxt, HarfBuzz shaping, ICU line breaking, font fallback) → glyph runs drawn via Impeller/Skia text renderer. Text layout can be expensive: avoid re-laying out large text unnecessarily; `TextPainter` should be cached in custom painters.

---

## 20.11 Platform channels internals
`MethodChannel.invokeMethod` → codec encodes to `ByteData` → `BinaryMessenger.send` → `PlatformDispatcher.sendPlatformMessage` → engine → platform runner → embedder's `BinaryMessenger` → handler → reply bytes back through the same path → completes Dart Future. Thread hops are why channels are slower than FFI.

---

## 20.12 Web rendering
* **CanvasKit** renderer: Skia compiled to WebAssembly drawing into `<canvas>` (WebGL) — consistent with mobile, ~1.5MB+ download.
* **skwasm**: used when building with `--wasm` (requires WasmGC support — Chromium-based browsers 119+ and Firefox 120+; Safari/WebKit support has lagged because of engine bugs, so check the current Flutter web docs); faster startup & multi-threaded rendering where cross-origin isolation headers allow; falls back to JS + CanvasKit when Wasm isn't supported.
* The old **HTML renderer** (DOM/CSS based) was **deprecated and removed** (2024–2025). `--web-renderer` flag removed accordingly.
* Semantics/accessibility tree mapped to DOM ARIA nodes; text input uses hidden DOM input elements.
* Implications: canvas apps aren't SEO-friendly; first load size; use Flutter web for **apps** (dashboards, tools, PWAs) rather than content sites.

---

## 20.13 Interview Questions — Internals

**Q1. Describe what happens when setState is called until pixels change.** markNeedsBuild → scheduleFrame → vsync → beginFrame (animations) → drawFrame: build dirty elements (diff widgets, update render objects) → layout dirty render objects (to relayout boundaries) → paint dirty repaint boundaries into layers → composite scene → raster thread rasterizes with Impeller/Skia → GPU presents.

**Q2. What are relayout and repaint boundaries?** Points in the render tree that stop layout/paint invalidation from propagating upward: relayout boundary when parent doesn't use child size/tight constraints/sizedByParent; repaint boundary has its own layer.

**Q3. What is the difference between the UI thread and raster thread?** UI runs Dart build/layout/paint recording; raster converts the layer tree into GPU commands. Either exceeding the frame budget causes jank.

**Q4. What is shader compilation jank and how does Impeller fix it?** Skia compiled shaders at first use causing stutters; Impeller precompiles all shaders at build time.

**Q5. How does Dart's garbage collector work?** Generational: fast copying scavenger for young objects, concurrent mark-sweep(-compact) for old; Flutter schedules GC during idle time.

**Q6. JIT vs AOT in Flutter?** JIT in debug for hot reload & fast iteration; AOT in profile/release for speed, startup and iOS compliance.

**Q7. How does hot reload work?** Incremental kernel compile of changed libraries, VM reloads code while preserving heap state, framework reassembles and rebuilds the widget tree.

**Q8. What is the layer tree?** Output of painting: a tree of layers (picture, transform, opacity, clip, etc.) which the engine composites and rasterizes.

**Q9. What is saveLayer and why is it expensive?** It renders content into an offscreen buffer and then composites it — costs memory bandwidth and GPU time, and on some GPUs forces render pass switches.

**Q10. What is tree shaking?** Removing unreachable code at compile time (AOT/dart2js) to reduce binary size.

**Q11. What renderers exist for Flutter web?** CanvasKit (default for JS builds) and skwasm (for Wasm builds); the HTML renderer was removed.

**Q12. What is a Ticker and how does it relate to vsync?** An object that calls a callback once per frame (driven by SchedulerBinding's transient callbacks on vsync), muted via TickerMode when not visible.
