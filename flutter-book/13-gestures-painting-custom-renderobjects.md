# Chapter 13 — Gestures, Focus & Keyboard, CustomPainter and Custom RenderObjects

> **Goal:** Handle every kind of user input (touch, mouse, keyboard, stylus), understand the gesture arena and hit testing, draw anything with `CustomPainter`, and write your own `RenderObject` when widgets aren't enough.

---

## 13.1 Pointer events → gestures (two layers)

1. **Pointer events** (raw): `PointerDownEvent`, `PointerMoveEvent`, `PointerUpEvent`, `PointerCancelEvent`, `PointerHoverEvent`, `PointerScrollEvent`. Widget: `Listener`.
2. **Gestures** (semantic): tap, double tap, long press, drag, pan, scale. Widget: `GestureDetector` (uses gesture recognizers).

### Hit testing — "who did I touch?" 🎯
When a finger goes down, Flutter performs a **hit test** from the root RenderObject down: each render box checks if the point is inside its bounds and asks its children (top-most painted first). The result is a **list of hit targets** (deepest first, then ancestors). Pointer events are delivered to all of them.

`HitTestBehavior` on `GestureDetector`/`Listener`:
* `deferToChild` (default) — only hit if a child is hit. ⚠️ A `GestureDetector` around a `Container` **without colour** or around empty space won't receive taps in the transparent areas!
* `opaque` — hit anywhere in bounds; blocks targets visually behind.
* `translucent` — hit anywhere in bounds and also lets targets behind receive events.

```dart
GestureDetector(
  behavior: HitTestBehavior.opaque,   // ✅ fixes "tap on empty space of Row does nothing"
  onTap: () {},
  child: Row(children: const [Icon(Icons.info), SizedBox(width: 50), Text('Info')]),
);
```

---

## 13.2 GestureDetector — all callbacks

```dart
GestureDetector(
  onTap: () {}, onTapDown: (d) {}, onTapUp: (d) {}, onTapCancel: () {},
  onDoubleTap: () {},
  onLongPress: () {}, onLongPressStart: (d) {}, onLongPressMoveUpdate: (d) {}, onLongPressEnd: (d) {},
  onSecondaryTap: () {},                   // right click
  onVerticalDragUpdate: (d) {},  onHorizontalDragUpdate: (d) {},
  onPanStart: (d) {}, onPanUpdate: (d) => _offset += d.delta, onPanEnd: (d) => d.velocity,
  onScaleStart: (d) {}, onScaleUpdate: (d) => _scale = d.scale /* also d.rotation, d.focalPoint */, onScaleEnd: (d) {},
  onForcePressStart: (d) {},               // 3D touch devices
  child: ...,
);
```
⚠️ You can't use `onPan*` and `onScale*` together (scale is a superset of pan) → error "Having both a pan gesture recognizer and a scale gesture recognizer is redundant; scale is a superset of pan." Use scale only.

⚠️ Adding `onDoubleTap` **delays** `onTap` (Flutter waits ~300ms to see if a second tap comes).

### The gesture arena ⚔️ (interview favourite)
When multiple recognizers could claim the same pointer (e.g., a horizontal drag inside a vertical scroll view, tap vs double-tap vs long press), they enter the **gesture arena**:
* Each recognizer watches pointer movement and can **accept** or **reject**.
* The first to accept **wins**; others are rejected. If all but one reject, the last one wins.
* Example: vertical `ListView` + horizontal `PageView` child: a mostly-horizontal move makes the horizontal drag recognizer win (it declares victory after moving past "touch slop", ~18 logical px); a mostly-vertical move lets the scroll win.
* Parent and child GestureDetectors with `onTap`: the **child (deepest)** wins by default because when the pointer goes up, the arena is "swept" and the first recognizer (deepest hit) wins.

Custom arena behaviour: `RawGestureDetector` with custom `GestureRecognizer` subclasses; `EagerGestureRecognizer`; for platform views, `gestureRecognizers` set.

### Listener vs GestureDetector
`Listener` gets raw pointer events **without** arena (always receives events) — use for drawing apps, analytics of touches, or custom behaviour. `GestureDetector` recognizes gestures and competes in the arena.

### Other gesture widgets
`InkWell`/`InkResponse` (Material ripple), `Draggable` + `DragTarget` (+ `LongPressDraggable`) for drag & drop, `Dismissible`, `InteractiveViewer` (pan/zoom images/maps), `MouseRegion` (hover, cursor: `SystemMouseCursors.click`), `AbsorbPointer` (block children, *absorbs* hit), `IgnorePointer` (children invisible to hit testing; events go to widgets behind), `TapRegion` (detect taps outside a region — used by TextField `onTapOutside`).

```dart
Draggable<String>(
  data: 'apple',
  feedback: const Material(child: Text('🍎', style: TextStyle(fontSize: 40))),
  childWhenDragging: const Opacity(opacity: 0.3, child: Text('🍎')),
  child: const Text('🍎'),
);
DragTarget<String>(
  onWillAcceptWithDetails: (details) => details.data == 'apple',
  onAcceptWithDetails: (details) => setState(() => basket.add(details.data)),
  builder: (context, candidates, rejected) => Container(color: candidates.isEmpty ? Colors.grey : Colors.green, ...),
);
```

---

## 13.3 Focus & keyboard (desktop, web, TV, accessibility, hardware keyboards)

### Focus tree
Parallel to widgets: `FocusNode`s organised in `FocusScopeNode`s. `Focus` widget creates a node; `FocusScope` groups (e.g., each route has a scope). `FocusManager.instance.primaryFocus` is the current focus.

```dart
Focus(
  autofocus: true,
  onFocusChange: (hasFocus) => setState(() => _focused = hasFocus),
  onKeyEvent: (node, event) {
    if (event is KeyDownEvent && event.logicalKey == LogicalKeyboardKey.enter) {
      _submit();
      return KeyEventResult.handled;
    }
    return KeyEventResult.ignored;
  },
  child: ...,
);
```
`RawKeyboardListener`/`RawKeyEvent` were **deprecated** (3.18) → use `KeyboardListener`/`Focus.onKeyEvent` with `KeyEvent` (`KeyDownEvent`, `KeyUpEvent`, `KeyRepeatEvent`), `HardwareKeyboard.instance`.

### Shortcuts & Actions (the right way for keyboard shortcuts)
```dart
class SaveIntent extends Intent { const SaveIntent(); }

Shortcuts(
  shortcuts: const <ShortcutActivator, Intent>{
    SingleActivator(LogicalKeyboardKey.keyS, control: true): SaveIntent(),
    SingleActivator(LogicalKeyboardKey.keyS, meta: true): SaveIntent(),   // Cmd+S on macOS
  },
  child: Actions(
    actions: <Type, Action<Intent>>{
      SaveIntent: CallbackAction<SaveIntent>(onInvoke: (_) => _save()),
    },
    child: const Focus(autofocus: true, child: Editor()),
  ),
);
```
`CallbackShortcuts` is a simpler version. `FocusTraversalGroup` + `OrderedTraversalPolicy` control Tab order. `Actions.invoke(context, const SaveIntent())` from buttons — the same action for menu, shortcut and button.

### Text input specifics
`TextInputAction`, `TextInputType`, IME composing, `SystemChannels.textInput`. Hardware keyboard Enter submits only if `onSubmitted`/`textInputAction` set. For Android TV / D-pad navigation, focus highlights matter (`FocusableActionDetector`).

---

## 13.4 CustomPainter — your own drawing canvas 🎨

**5-year-old:** Flutter gives you a **blank paper (Canvas)** and **crayons (Paint)**. You tell it "draw a circle here, a line there".

```dart
class PieChartPainter extends CustomPainter {
  PieChartPainter({required this.values, required this.colors});
  final List<double> values;
  final List<Color> colors;

  @override
  void paint(Canvas canvas, Size size) {
    final total = values.fold<double>(0, (a, b) => a + b);
    final rect = Offset.zero & size;                    // Rect from (0,0) with size
    var start = -pi / 2;                                 // start at 12 o'clock
    for (var i = 0; i < values.length; i++) {
      final sweep = values[i] / total * 2 * pi;
      canvas.drawArc(rect, start, sweep, true, Paint()..color = colors[i]);
      start += sweep;
    }
    // centre hole → donut
    canvas.drawCircle(size.center(Offset.zero), size.shortestSide * 0.25,
        Paint()..color = Colors.white);
  }

  @override
  bool shouldRepaint(PieChartPainter old) =>
      !listEquals(old.values, values) || !listEquals(old.colors, colors);
}

CustomPaint(
  size: const Size(200, 200),          // used if no child
  painter: PieChartPainter(values: [30, 50, 20], colors: [Colors.red, Colors.green, Colors.blue]),
  foregroundPainter: null,              // painted on top of child
  child: null,
);
```

### Canvas API essentials
```dart
canvas.drawLine(p1, p2, paint);
canvas.drawRect(rect, paint);
canvas.drawRRect(RRect.fromRectAndRadius(rect, const Radius.circular(12)), paint);
canvas.drawCircle(center, radius, paint);
canvas.drawOval(rect, paint);
canvas.drawArc(rect, startAngle, sweepAngle, useCenter, paint);
canvas.drawPath(path, paint);
canvas.drawImage(image, offset, paint);           // ui.Image
canvas.drawImageRect(image, src, dst, paint);
canvas.drawPoints(PointMode.points, points, paint);
canvas.drawShadow(path, Colors.black, 4, false);
canvas.drawParagraph(paragraph, offset);
// Text with TextPainter:
final tp = TextPainter(text: const TextSpan(text: 'Hi', style: TextStyle(color: Colors.black)), textDirection: TextDirection.ltr)..layout(maxWidth: size.width);
tp.paint(canvas, Offset(10, 10));
// Transforms & state
canvas.save(); canvas.translate(dx, dy); canvas.rotate(angle); canvas.scale(2); canvas.restore();
canvas.clipRect(rect); canvas.clipPath(path);
canvas.saveLayer(bounds, paint);   // ⚠️ expensive offscreen buffer
```
Paint:
```dart
final paint = Paint()
  ..color = Colors.blue
  ..style = PaintingStyle.stroke     // or fill
  ..strokeWidth = 4
  ..strokeCap = StrokeCap.round
  ..strokeJoin = StrokeJoin.round
  ..isAntiAlias = true
  ..shader = const LinearGradient(colors: [Colors.blue, Colors.purple]).createShader(rect)
  ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 4)
  ..blendMode = BlendMode.srcOver;
```
Path:
```dart
final path = Path()
  ..moveTo(0, 0)
  ..lineTo(100, 0)
  ..quadraticBezierTo(150, 50, 100, 100)
  ..cubicTo(80, 120, 20, 120, 0, 100)
  ..arcToPoint(const Offset(0, 0), radius: const Radius.circular(50))
  ..addOval(Rect.fromCircle(center: Offset(50, 50), radius: 10))
  ..close();
path.contains(point);                  // hit testing
path.computeMetrics();                 // animate drawing along path (extractPath)
```
Clipping widgets with a custom shape: `ClipPath(clipper: MyClipper())` with `CustomClipper<Path>`; `ShapeBorder` subclasses for custom card shapes.

### Making CustomPaint interactive
Override `hitTest(Offset position)` in the painter to restrict taps to drawn areas, and wrap in `GestureDetector`. Semantics: override `semanticsBuilder` to describe drawn content for screen readers.

### Performance
* `shouldRepaint` must return false when nothing changed.
* Use `repaint:` listenable for animations (Chapter 12).
* Wrap in `RepaintBoundary` if it repaints often or rarely while surroundings change.
* Cache expensive `Path`s/`Picture`s (`PictureRecorder`) between paints.

---

## 13.5 Custom RenderObjects — when widgets aren't enough 🛠️

You rarely need this, but senior interviews ask, and libraries use it. Reasons:
* A layout no combination of existing widgets can express efficiently (e.g., a "flow" text layout with inline badges, a custom chat bubble that wraps time stamps intelligently, a custom grid).
* Maximum performance (avoid many widgets).

### Leaf example: a render object that paints a coloured box and sizes itself
```dart
class ColoredSquare extends LeafRenderObjectWidget {
  const ColoredSquare({super.key, required this.color, this.side = 50});
  final Color color;
  final double side;

  @override
  RenderColoredSquare createRenderObject(BuildContext context) =>
      RenderColoredSquare(color: color, side: side);

  @override
  void updateRenderObject(BuildContext context, RenderColoredSquare renderObject) {
    renderObject
      ..color = color
      ..side = side;
  }
}

class RenderColoredSquare extends RenderBox {
  RenderColoredSquare({required Color color, required double side})
      : _color = color, _side = side;

  Color _color;
  set color(Color value) {
    if (value == _color) return;
    _color = value;
    markNeedsPaint();          // only repaint needed
  }

  double _side;
  set side(double value) {
    if (value == _side) return;
    _side = value;
    markNeedsLayout();         // size changes → relayout
  }

  @override
  void performLayout() {
    size = constraints.constrain(Size.square(_side));   // obey constraints!
  }

  @override
  void paint(PaintingContext context, Offset offset) {
    context.canvas.drawRect(offset & size, Paint()..color = _color);
  }

  @override
  bool hitTestSelf(Offset position) => true;

  @override
  double computeMinIntrinsicWidth(double height) => _side;
  @override
  double computeMaxIntrinsicWidth(double height) => _side;
  @override
  double computeMinIntrinsicHeight(double width) => _side;
  @override
  double computeMaxIntrinsicHeight(double width) => _side;
}
```

### Key RenderBox concepts
* `performLayout()` — compute `size` (and lay out children with `child.layout(constraints, parentUsesSize: true)`).
* `sizedByParent` + `computeDryLayout` — when size depends only on constraints; `computeDryLayout` used by intrinsic queries / `LayoutBuilder`.
* `paint(context, offset)` — draw self, then `context.paintChild(child, offset + childOffset)`.
* `hitTest`, `hitTestChildren`, `hitTestSelf`.
* Intrinsic dimension methods (`computeMinIntrinsicWidth` ...) — used by `IntrinsicWidth`, `Table`, etc.
* `markNeedsLayout()`, `markNeedsPaint()`, `markNeedsSemanticsUpdate()`, `markNeedsCompositingBitsUpdate()`.
* **ParentData**: each child carries data used by the parent (e.g., `BoxParentData.offset`, `FlexParentData.flex`). Multi-child render objects use `ContainerRenderObjectMixin` + `RenderBoxContainerDefaultsMixin`.
* **Relayout boundary**: if a render object's size doesn't depend on its children changes (tight constraints, `sizedByParent`, or `parentUsesSize: false`), layout changes inside don't propagate upward — a key performance optimisation.
* **Repaint boundary** (`isRepaintBoundary = true`): gets its own layer, so repainting it doesn't repaint ancestors/siblings.

Simpler alternatives first: `CustomSingleChildLayout`, `CustomMultiChildLayout` (with `MultiChildLayoutDelegate` + `LayoutId`), `Flow` (with `FlowDelegate`, paint-time transforms — great for animated menus).

---

## 13.6 Interview Questions — Gestures & painting

**Q1. GestureDetector vs Listener?** GestureDetector recognizes high-level gestures and participates in the gesture arena; Listener gives raw pointer events without disambiguation.

**Q2. What is the gesture arena?** The mechanism resolving conflicts when multiple gesture recognizers track the same pointer; recognizers accept/reject, and one wins.

**Q3. Why doesn't my GestureDetector receive taps on empty areas?** Default `HitTestBehavior.deferToChild` only registers hits on painted children; use `HitTestBehavior.opaque` or give a background colour.

**Q4. AbsorbPointer vs IgnorePointer?** AbsorbPointer consumes hits itself (blocking widgets behind it and its children); IgnorePointer makes itself and children invisible to hit testing so events pass to widgets behind.

**Q5. How do you implement drag and drop?** `Draggable`/`LongPressDraggable` with `data` + `feedback`, and `DragTarget` with accept callbacks; or `ReorderableListView` for lists.

**Q6. How do you implement keyboard shortcuts?** Shortcuts + Actions with Intents (or CallbackShortcuts), within a focused subtree.

**Q7. What is CustomPainter and shouldRepaint?** API to draw directly on a Canvas; shouldRepaint tells Flutter whether a new painter instance needs to repaint compared to the old one.

**Q8. When would you write a custom RenderObject?** For layouts/painting not achievable efficiently with existing widgets or delegates, or for performance-critical components.

**Q9. markNeedsLayout vs markNeedsPaint?** Layout marks the render object for relayout (and repaint); paint only schedules repainting, cheaper.

**Q10. What is a repaint boundary?** A render object with its own compositing layer, isolating repaints so they don't spread to ancestors/siblings (`RepaintBoundary` widget).

**Q11. What's a relayout boundary?** A render object whose size doesn't depend on child changes, stopping layout invalidation from propagating to its parent.

**Q12. How does hit testing work?** From the root, render objects check if the position is inside their bounds, recursively testing children in reverse paint order; hits are added to a HitTestResult path that receives pointer events.
