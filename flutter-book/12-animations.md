# Chapter 12 — Animations: Implicit, Explicit, Hero, Physics, Staggered, Lottie/Rive

> **Goal:** Make UIs feel alive — and know *which* animation approach to choose, how `AnimationController`, `Tween`, `Curve` and `Ticker` work under the hood, and how to keep animations at 60/120 fps.

---

## 12.1 5-year-old picture: a flip book 📖

An animation is a **flip book**: many slightly different pictures shown quickly. Flutter draws a new picture every frame (60–120 per second). You just say *"go from small to big in 1 second, starting slow and ending fast"* and Flutter draws all the in-between pictures (**tweening** = "in-betweening").

---

## 12.2 Decision tree: which animation tool?

```
Is it a simple property change (size, colour, opacity, padding, alignment) when state changes?
 ├─ YES → IMPLICIT animation (AnimatedContainer, AnimatedOpacity, TweenAnimationBuilder…)
 └─ NO → Does it repeat, need play/pause/reverse, sync with gestures, or chain/stagger?
          ├─ YES → EXPLICIT animation (AnimationController + Transition widgets / AnimatedBuilder)
          └─ Is it a complex designer-made animation (vector, character, illustrations)?
               ├─ YES → Lottie or Rive
               └─ Shared element between screens? → Hero
                  Custom drawing every frame? → CustomPainter + controller
                  Physics feel (spring, fling)? → physics simulations
```

---

## 12.3 Implicit animations — "just change the value"

They animate automatically from the old value to the new when you rebuild with a different value.

```dart
class _BoxState extends State<Box> {
  bool _big = false;
  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: () => setState(() => _big = !_big),
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 400),
        curve: Curves.easeInOut,
        width: _big ? 200 : 100,
        height: _big ? 200 : 100,
        decoration: BoxDecoration(
          color: _big ? Colors.blue : Colors.red,
          borderRadius: BorderRadius.circular(_big ? 32 : 8),
        ),
        onEnd: () => debugPrint('done'),
      ),
    );
  }
}
```
Built-in implicit widgets (`ImplicitlyAnimatedWidget` subclasses): `AnimatedContainer`, `AnimatedOpacity`, `AnimatedPadding`, `AnimatedAlign`, `AnimatedPositioned` (in Stack), `AnimatedPositionedDirectional`, `AnimatedDefaultTextStyle`, `AnimatedPhysicalModel`, `AnimatedRotation`, `AnimatedScale`, `AnimatedSlide`, `AnimatedFractionallySizedBox`, `AnimatedTheme`.

Other "auto" animators:
* **`AnimatedSwitcher`** — cross-fades (or custom transition) when its **child changes** (different type or key!):
```dart
AnimatedSwitcher(
  duration: const Duration(milliseconds: 300),
  transitionBuilder: (child, anim) => ScaleTransition(scale: anim, child: child),
  child: Text('$_count', key: ValueKey(_count)),  // ❗ key needed: same type Text → otherwise no animation
);
```
* **`AnimatedCrossFade`** — between exactly two children.
* **`AnimatedSize`** — animates its size when child size changes.
* **`AnimatedList`** — insert/remove (Chapter 9).
* **`TweenAnimationBuilder`** — custom implicit animation of *any* value:
```dart
TweenAnimationBuilder<double>(
  tween: Tween(begin: 0, end: progress),   // animates whenever `end` changes
  duration: const Duration(milliseconds: 600),
  builder: (context, value, child) => CircularProgressIndicator(value: value),
);
```

---

## 12.4 Core animation classes (explicit)

| Class | What it is (5-year-old) | Tech |
|---|---|---|
| `Ticker` | A **metronome** ticking every frame | Calls a callback once per frame (vsync) |
| `TickerProvider` (`vsync`) | Gives you a metronome that **stops when the screen isn't visible** | `SingleTickerProviderStateMixin` (one controller) / `TickerProviderStateMixin` (many) |
| `AnimationController` | The **remote control**: play, reverse, stop, repeat; value 0.0→1.0 over duration | `Animation<double>` you drive |
| `Tween<T>` | Translator: "0..1 means 50px..200px" | maps begin→end |
| `Curve` / `CurvedAnimation` | Speed style: slow-start, bounce, elastic | non-linear timing |
| `Animation<T>` | A value that changes over time + listeners + status | `value`, `status`, `addListener`, `addStatusListener` |
| `AnimatedBuilder` / `*Transition` widgets | Redraw when animation changes | rebuild only the animated part |

```dart
class Pulse extends StatefulWidget {
  const Pulse({super.key, required this.child});
  final Widget child;
  @override
  State<Pulse> createState() => _PulseState();
}

class _PulseState extends State<Pulse> with SingleTickerProviderStateMixin {
  late final AnimationController _controller = AnimationController(
    vsync: this,                                  // ❗ prevents off-screen animations from wasting battery
    duration: const Duration(milliseconds: 800),
  )..repeat(reverse: true);

  late final Animation<double> _scale = Tween<double>(begin: 1.0, end: 1.15)
      .chain(CurveTween(curve: Curves.easeInOut))
      .animate(_controller);

  @override
  void dispose() {
    _controller.dispose();                         // ❗ always dispose
    super.dispose();
  }

  @override
  Widget build(BuildContext context) =>
      ScaleTransition(scale: _scale, child: widget.child);
}
```

### AnimationController API
```dart
_controller.forward();                // 0 → 1   (returns TickerFuture, awaitable)
_controller.forward(from: 0);
_controller.reverse();                // 1 → 0
_controller.repeat();                 // loop
_controller.repeat(reverse: true);    // ping-pong
_controller.stop();
_controller.reset();                  // value = lowerBound
_controller.animateTo(0.5, duration: ..., curve: ...);
_controller.fling(velocity: 2.0);     // physics-based
_controller.value = 0.3;              // jump (e.g., dragging)
_controller.isAnimating; _controller.status;  // dismissed, forward, reverse, completed
AnimationController(vsync: this, lowerBound: 0, upperBound: 360);    // custom range
AnimationController.unbounded(vsync: this);                           // for physics
```
Status listener:
```dart
_controller.addStatusListener((status) {
  if (status == AnimationStatus.completed) _controller.reverse();
  if (status == AnimationStatus.dismissed) _controller.forward();
});
```

### Tweens
`Tween<double>`, `ColorTween`, `SizeTween`, `RectTween`, `IntTween`, `AlignmentTween`, `BorderRadiusTween`, `DecorationTween`, `EdgeInsetsTween`, `TextStyleTween`, `ConstantTween`, `TweenSequence` (multi-segment):
```dart
final shake = TweenSequence<double>([
  TweenSequenceItem(tween: Tween(begin: 0, end: -10), weight: 1),
  TweenSequenceItem(tween: Tween(begin: -10, end: 10), weight: 2),
  TweenSequenceItem(tween: Tween(begin: 10, end: 0), weight: 1),
]).animate(_controller);
```
Two ways to apply: `tween.animate(controller)` → `Animation<T>`; or `tween.evaluate(animation)` / `tween.transform(t)` manually.

### Curves
`Curves.linear`, `ease`, `easeIn`, `easeOut`, `easeInOut`, `fastOutSlowIn` (Material standard), `easeOutCubic`, `bounceOut`, `elasticOut`, `decelerate`, `Interval(0.2, 0.6, curve: Curves.easeOut)` (sub-range — staggering), `Threshold`, `Cubic(a,b,c,d)` custom. M3 recommends `Easing.emphasizedDecelerate`, etc. (`Easing` class), and durations `Durations.medium2`.

### Transition widgets (efficient, no setState)
`FadeTransition`, `ScaleTransition`, `RotationTransition` (turns), `SlideTransition` (Offset, fraction of child size), `SizeTransition`, `PositionedTransition`, `RelativePositionedTransition`, `DecoratedBoxTransition`, `AlignTransition`, `DefaultTextStyleTransition`, `MatrixTransition` (3.13+).

### AnimatedBuilder for anything custom
```dart
AnimatedBuilder(
  animation: _controller,
  child: const FlutterLogo(size: 100),               // not rebuilt
  builder: (context, child) => Transform(
    alignment: Alignment.center,
    transform: Matrix4.identity()
      ..setEntry(3, 2, 0.001)                         // perspective
      ..rotateY(_controller.value * pi),
    child: child,
  ),
);
```
Or subclass `AnimatedWidget` for reusable animated components.

### ❌ Anti-pattern: setState on every tick
```dart
_controller.addListener(() => setState(() {}));   // rebuilds whole widget every frame — avoid in big widgets
```
Use `AnimatedBuilder`/transitions to rebuild **only** the animated subtree.

---

## 12.5 Staggered animations
One controller, many tweens with `Interval`s:
```dart
late final _fade = CurvedAnimation(parent: _c, curve: const Interval(0.0, 0.3, curve: Curves.easeIn));
late final _slide = Tween(begin: const Offset(0, 0.2), end: Offset.zero)
    .animate(CurvedAnimation(parent: _c, curve: const Interval(0.2, 0.6, curve: Curves.easeOut)));
late final _scale = Tween(begin: 0.8, end: 1.0)
    .animate(CurvedAnimation(parent: _c, curve: const Interval(0.5, 1.0, curve: Curves.elasticOut)));

FadeTransition(opacity: _fade, child: SlideTransition(position: _slide, child: ScaleTransition(scale: _scale, child: card)));
```
Staggered list entrance: delay each item by index (e.g., `Interval(i * 0.1, i * 0.1 + 0.5)` clamped) or use `flutter_animate` package:
```dart
Text('Hello').animate().fadeIn(duration: 300.ms).slideY(begin: 0.2).then(delay: 200.ms).shake();
```

---

## 12.6 Hero animations (shared element) 🦸

```dart
// List page
Hero(tag: 'product-${p.id}', child: Image.network(p.thumb));
// Details page
Hero(tag: 'product-${p.id}', child: Image.network(p.image));
```
* Same **unique tag** on both routes; Flutter flies the widget between positions during route transition.
* Tags must be unique per route (error: *"There are multiple heroes that share the same tag within a subtree"* — common when the same item appears twice, e.g., in two lists on one page).
* `flightShuttleBuilder` to customise the flying widget; `placeholderBuilder`; wrap text heroes in `Material(type: MaterialType.transparency)` to avoid yellow underline / text style glitches.
* `HeroMode(enabled: false)` to disable.
* Works with `Navigator` routes (and go_router pages); for nested navigators the HeroController must be present in that Navigator.

---

## 12.7 Page transitions
```dart
Navigator.push(context, PageRouteBuilder(
  transitionDuration: const Duration(milliseconds: 400),
  pageBuilder: (_, __, ___) => const DetailsPage(),
  transitionsBuilder: (_, animation, secondaryAnimation, child) {
    final offset = Tween(begin: const Offset(1, 0), end: Offset.zero)
        .chain(CurveTween(curve: Curves.easeOutCubic))
        .animate(animation);
    return SlideTransition(position: offset, child: child);
  },
));
```
Global: `PageTransitionsTheme` in ThemeData. The `animations` package (official) provides Material motion patterns: **Container transform** (`OpenContainer`), **Shared axis**, **Fade through**, **Fade**.

---

## 12.8 Physics-based animation
```dart
final simulation = SpringSimulation(
  const SpringDescription(mass: 1, stiffness: 300, damping: 15),
  _controller.value,   // start
  1.0,                 // end
  velocity,            // from drag end: details.velocity.pixelsPerSecond.dy / height
);
_controller.animateWith(simulation);
```
Also: `FrictionSimulation`, `GravitySimulation`, `ClampedSimulation`, `BouncingScrollSimulation`. Use for drag-to-dismiss sheets, card swipe, snapping. `DraggableScrollableSheet` and scroll physics use these internally.

---

## 12.9 Lottie & Rive (designer animations)
* **Lottie** (`lottie` package): plays After Effects animations exported as JSON (via Bodymovin). Great for loaders, success checkmarks, onboarding. Control with your own `AnimationController`:
```dart
Lottie.asset('assets/success.json', controller: _c, onLoaded: (comp) { _c..duration = comp.duration..forward(); });
```
* **Rive** (`rive` package): interactive vector animations with **state machines** (inputs/triggers), small file sizes, runtime interactivity (e.g., animated login bear following your typing). Rive's newer runtime renders with its own renderer.
* Performance: complex Lottie files can be heavy (many layers, masks); test on low-end devices; prefer Rive for interactive ones.

---

## 12.10 CustomPainter animations
```dart
class WavePainter extends CustomPainter {
  WavePainter(this.animation) : super(repaint: animation);  // ⭐ repaint on tick WITHOUT rebuilding widgets
  final Animation<double> animation;

  @override
  void paint(Canvas canvas, Size size) {
    final path = Path()..moveTo(0, size.height / 2);
    for (double x = 0; x <= size.width; x++) {
      final y = size.height / 2 + sin((x / size.width * 2 * pi) + animation.value * 2 * pi) * 20;
      path.lineTo(x, y);
    }
    canvas.drawPath(path, Paint()..color = Colors.blue..style = PaintingStyle.stroke..strokeWidth = 3);
  }

  @override
  bool shouldRepaint(WavePainter old) => false; // repaint driven by `repaint:` listenable
}
CustomPaint(painter: WavePainter(_controller), size: const Size(double.infinity, 100));
```
Passing the animation as `repaint:` makes only the **paint** phase run each frame — cheapest possible animation.

Fragment shaders (`FragmentProgram`, GLSL `.frag` files declared under `shaders:` in pubspec) enable GPU effects (ripples, shimmer, noise).

---

## 12.11 Animation performance & best practices ⚡
1. Prefer **Transition widgets / AnimatedBuilder with `child`** over `setState` per frame.
2. Animate **transform and opacity** (cheap: paint/composite) rather than layout properties (width/height/padding cause relayout each frame) when possible: `ScaleTransition` vs `AnimatedContainer(width)`.
3. `Opacity` widget animating → use `FadeTransition`/`AnimatedOpacity` (they use an opacity layer efficiently without rebuilding).
4. Wrap frequently repainting animations in `RepaintBoundary` so the rest of the screen isn't repainted.
5. Avoid animating `BackdropFilter`/blur and `ClipPath` on big areas.
6. Always `dispose()` controllers; use `vsync`.
7. Respect **reduce motion** (`MediaQuery.disableAnimationsOf(context)`).
8. Keep durations short for UI feedback (100–300 ms), longer for large transitions (300–500 ms).
9. Test in **profile mode**; check the raster & UI thread graphs.
10. Shader compilation jank on first run was a Skia problem; Impeller removes it on iOS/Android (Chapter 20/23).

---

## 12.12 Common animation bugs
| Bug | Cause | Fix |
|---|---|---|
| `AnimationController.dispose() called more than once` / `...used after being disposed` | double dispose / using after dispose | single owner, check lifecycle |
| `_MyState is a SingleTickerProviderStateMixin but multiple tickers were created` | two controllers with Single mixin | use `TickerProviderStateMixin` |
| Ticker leak error in tests: "A Ticker was active when the widget tree was disposed" | controller not disposed / repeat running | dispose; in tests `pumpAndSettle` won't settle with repeating animations — use `pump(duration)` |
| AnimatedSwitcher doesn't animate | same widget type without key | add `ValueKey` |
| Hero tag conflict | duplicate tags in same route | unique tags |
| Animation stutters on first run (older Skia builds) | shader compilation | Impeller; or SkSL warm-up (legacy) |
| Animation restarts on every rebuild | controller created in build / `forward()` in build | create in initState; trigger from events or didUpdateWidget |

---

## 12.13 Interview Questions — Animations

**Q1. Implicit vs explicit animations?** Implicit (AnimatedFoo, TweenAnimationBuilder) animate automatically when target values change, managing their own controller. Explicit use your AnimationController for full control (repeat, reverse, sync to gestures, staggering).

**Q2. What is an AnimationController?** An `Animation<double>` that produces values (default 0–1) over a duration each frame using a Ticker; provides forward, reverse, repeat, stop, fling, animateTo.

**Q3. What is `vsync` / TickerProvider?** Supplies Tickers synchronized with the screen refresh and muted when the widget isn't visible (TickerMode), saving resources.

**Q4. What is a Tween?** Maps the controller's 0–1 range to a value range of type T (double, Color, Offset...).

**Q5. What is a Curve?** A function mapping linear time to eased progress (easeIn, bounce, elastic, Interval).

**Q6. What is AnimatedBuilder and why use `child`?** A widget that rebuilds its builder on each animation tick; passing an expensive static subtree as `child` avoids rebuilding it every frame.

**Q7. How does Hero animation work?** On route transition, Flutter finds Hero widgets with matching tags on both routes, computes their positions, and animates a "flight" in the Overlay between them.

**Q8. SingleTickerProviderStateMixin vs TickerProviderStateMixin?** Single supports exactly one Ticker (more efficient); the other supports many.

**Q9. How to make a staggered animation?** One controller with multiple tweens using `Interval` curves for different time slices.

**Q10. How do you avoid jank in animations?** Animate cheap properties (transform/opacity), avoid rebuilding large trees per frame, RepaintBoundary, avoid expensive effects, test in profile mode.

**Q11. What is AnimatedSwitcher?** Animates the transition between an old and new child when the child's type or key changes.

**Q12. Lottie vs Rive?** Lottie plays AE-exported JSON timeline animations; Rive supports interactive state machines with runtime inputs and typically smaller files.
