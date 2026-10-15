# Chapter 7 — Layout: Constraints, Flex, Stack, Responsive Design & Overflow Errors

> **Goal:** Never be confused by a layout again. The single rule **"Constraints go down. Sizes go up. Parent sets position."** explains 90% of layout behaviour and 90% of layout bugs (yellow-black overflow stripes, "unbounded height", "RenderBox was not laid out").

---

## 7.1 The golden rule 🥇

> **Constraints go down. Sizes go up. Parent sets position.**

**5-year-old version:** A parent box tells its child: *"You can be **between** this small and this big."* (constraints go down). The child thinks and says: *"OK, I'll be **this** big."* (size goes up). Then the parent decides **where** to put the child (position). The child **never** decides its own position, and can't be bigger than allowed.

Step by step (from the official docs):
1. A widget gets its **constraints** from its parent: min width, max width, min height, max height.
2. It goes through its children, telling each its constraints (can differ per child), and asks each child its size.
3. It positions children (x, y) one by one.
4. It tells its parent its own size (within original constraints).

### Consequences (memorise these)
* A widget **can't know its position** on screen during layout; the parent decides.
* A widget **can't have any size it wants**; it must obey constraints. `Container(width: 100)` inside a parent that forces full width will be full width!
* Final size depends on the parent too — you can't define size "in isolation".
* **Alignment** decisions are made by the parent (`Center`, `Align`, `Row`'s alignment).

---

## 7.2 BoxConstraints

```dart
BoxConstraints(minWidth: 0, maxWidth: 300, minHeight: 0, maxHeight: 600)
```
Terminology:
* **Tight** constraints: min == max (exact size forced). e.g., `BoxConstraints.tight(Size(100, 100))`. The **screen** gives the root widget tight constraints = screen size.
* **Loose** constraints: min = 0, max = something. Child can be anywhere from 0 to max. e.g., `Center` loosens constraints for its child.
* **Bounded**: max is finite.
* **Unbounded**: max is `double.infinity`. Given by scrollables in their scroll direction and by `Row` (width) / `Column` (height) to non-flex children.

### Experiments (official "Understanding constraints" examples, summarised)
```dart
// 1. Screen forces tight constraints → Container fills screen even with width 100
Container(width: 100, height: 100, color: Colors.red)   // as root → FULL SCREEN red

// 2. Center loosens constraints → now 100×100
Center(child: Container(width: 100, height: 100, color: Colors.red))

// 3. Container with no child and no size → as big as possible (fills Center's max)
Center(child: Container(color: Colors.red))   // full screen

// 4. Container with child and no size → wraps child size
Center(child: Container(color: Colors.red, child: const Text('Hi')))

// 5. ConstrainedBox can't override tighter parent constraints
Center(
  child: ConstrainedBox(
    constraints: const BoxConstraints(minWidth: 70, minHeight: 70, maxWidth: 150, maxHeight: 150),
    child: Container(color: Colors.red, width: 10, height: 10),   // becomes 70×70
  ),
)

// 6. UnconstrainedBox lets child be any size (may overflow → stripes)
UnconstrainedBox(child: Container(width: 4000, height: 50, color: Colors.red))

// 7. OverflowBox lets child be bigger without warning
// 8. LimitedBox: limits size only when incoming constraints are unbounded
// 9. FittedBox scales child to fit
FittedBox(child: Text('Some very long text that would overflow'))
// 10. FractionallySizedBox: size as fraction of parent
FractionallySizedBox(widthFactor: 0.5, child: ...)
```

### Container's sizing algorithm (when there is no `width`/`height`)
1. No child, no constraints, no alignment → tries to be **as big as possible** (unless incoming constraints are unbounded, then as small as possible).
2. Has `alignment` → as big as possible, child aligned inside.
3. Has child, no alignment → **size of child** (plus padding).
(This is why "Container behaves strangely" is a common confusion.)

---

## 7.3 Row & Column (Flex) — the most used layout widgets

```dart
Row(
  mainAxisAlignment: MainAxisAlignment.spaceBetween, // along the row (horizontal)
  crossAxisAlignment: CrossAxisAlignment.center,     // perpendicular (vertical)
  mainAxisSize: MainAxisSize.max,                    // take all width (default) or .min
  textDirection: TextDirection.ltr,                  // affects start/end
  verticalDirection: VerticalDirection.down,
  spacing: 8,                                        // (Flutter 3.27+) gap between children
  children: const [Icon(Icons.star), Text('4.5'), Text('(120)')],
)
```
* **Main axis**: Row → horizontal, Column → vertical.
* **Cross axis**: the other one.

`MainAxisAlignment`: `start`, `end`, `center`, `spaceBetween` (no space at edges), `spaceAround` (half space at edges), `spaceEvenly` (equal everywhere).
`CrossAxisAlignment`: `start`, `end`, `center`, `stretch` (fill cross axis), `baseline` (needs `textBaseline: TextBaseline.alphabetic`).

### How Flex lays out (important for debugging!)
1. Lay out **non-flexible** children first with **unbounded** main-axis constraints (Row gives each child `maxWidth: infinity`!) and cross-axis constraints from parent (loose, or tight if `stretch`).
2. Remaining main-axis space is divided among **flexible** children (`Expanded`/`Flexible`) according to their `flex` factor.
3. Position children per `mainAxisAlignment`.

That's why:
* A long `Text` in a `Row` **overflows** (it was told "you can be infinitely wide"). Fix: wrap with `Expanded`/`Flexible`.
* A `ListView` (horizontal) inside a `Row` crashes: unbounded width inside unbounded width.

### Expanded vs Flexible vs Spacer
```dart
Row(children: [
  Expanded(flex: 2, child: Container(color: Colors.red)),   // takes 2/3 of free space, MUST fill it
  Flexible(flex: 1, child: Container(color: Colors.blue, width: 20)), // up to 1/3, can be smaller (loose)
  const Spacer(),                                               // empty Expanded
])
```
* `Expanded` = `Flexible(fit: FlexFit.tight)` — **must** fill the allotted space.
* `Flexible` (default `fit: FlexFit.loose`) — **can** be smaller than the allotted space.
* `Spacer(flex: 1)` — invisible expanded gap.

### Gaps between children
* `SizedBox(width: 8)` / `SizedBox(height: 8)` between children (classic).
* `spacing:` parameter on Row/Column (Flutter 3.27+).
* `Gap(8)` from the `gap` package (works in Row/Column/scrollables).
* `Wrap(spacing:, runSpacing:)`.

---

## 7.4 Stack & Positioned — layers on top of each other 🥞

```dart
Stack(
  alignment: Alignment.center,       // for non-positioned children
  clipBehavior: Clip.none,           // allow children outside bounds to be visible (default hardEdge)
  fit: StackFit.loose,               // non-positioned children constraints
  children: [
    Image.asset('assets/bg.png'),                          // base layer, sizes the stack
    const Positioned(top: 8, right: 8, child: Icon(Icons.favorite)),
    Positioned.fill(child: Container(color: Colors.black26)), // fills entire stack
    const Align(alignment: Alignment.bottomCenter, child: Text('Caption')),
  ],
)
```
* Stack's size = size of the largest **non-positioned** child (within constraints). If all children are positioned → Stack tries to be as big as possible.
* `Positioned` must be a **direct child** of Stack.
* Hit testing: children outside the Stack bounds (with `Clip.none`) are **visible but not tappable** — a classic bug ("my badge button outside the card doesn't respond"). Fix: make the Stack bigger (padding) so the child lies within bounds.
* `IndexedStack` shows only one child by index but keeps all alive (state preserved) — used for bottom navigation tabs.

---

## 7.5 Other layout widgets you must know

| Widget | Purpose |
|---|---|
| `Padding` | Space inside around child: `EdgeInsets.all(16)`, `.symmetric(horizontal: 8)`, `.only(left: 4)`, `.fromLTRB`, `EdgeInsetsDirectional.only(start: 8)` (RTL aware) |
| `Center` / `Align` | Position child; `Alignment(-1..1, -1..1)`, `Alignment.topRight`, `AlignmentDirectional.centerStart`; `widthFactor`/`heightFactor` |
| `SizedBox` | Fixed size / gap; `SizedBox.expand()`, `SizedBox.shrink()`, `SizedBox.square(dimension:)` |
| `ConstrainedBox` | Add min/max constraints |
| `UnconstrainedBox`, `OverflowBox`, `LimitedBox` | Advanced constraint control |
| `AspectRatio` | Size child to a ratio (e.g., 16/9 video) |
| `FittedBox` | Scale/fit child (`BoxFit.contain/cover/fill/scaleDown`) |
| `FractionallySizedBox` | Size as fraction of available space |
| `Expanded`, `Flexible`, `Spacer` | Flex children |
| `Wrap` | Like Row/Column but wraps to next line (chips, tags) |
| `Flow` | Efficient custom positioning with transforms (advanced) |
| `Table` | Grid of rows with column widths (`FlexColumnWidth`, `FixedColumnWidth`, `IntrinsicColumnWidth`) |
| `GridView` | Scrolling grid (Chapter 9) |
| `IntrinsicHeight` / `IntrinsicWidth` | Size children to their intrinsic size (e.g., make Row children same height for a divider). ⚠️ **Expensive** (O(N²) potential) — avoid in lists |
| `Baseline` | Align by text baseline |
| `CustomSingleChildLayout`, `CustomMultiChildLayout` | Custom layout delegates |
| `LayoutBuilder` | Build based on parent constraints |
| `OrientationBuilder` | Portrait/landscape |
| `SafeArea` | Avoid notches, status bar, home indicator |
| `Offstage` | Lay out but don't paint (state kept) |
| `Visibility` | Show/hide with options to maintain state/size/animation |
| `Opacity` | Transparency (costly when animating — use `FadeTransition`/`AnimatedOpacity`) |
| `Transform` | Rotate/scale/translate at paint time (doesn't affect layout) |
| `RotatedBox` | Rotate by quarter turns **affecting layout** |
| `ClipRRect`, `ClipOval`, `ClipPath` | Clip children (costly; use `borderRadius` on decoration when possible) |
| `DecoratedBox` / `BoxDecoration` | Background, border, radius, shadow, gradient, image |
| `Card`, `ListTile` | Material composites |

### Visibility vs Offstage vs Opacity vs conditional
| Technique | Takes space? | Keeps state? | Paints? | Hit-testable? | Cost |
|---|---|---|---|---|---|
| `if (show) Widget()` | No | ❌ (removed) | No | No | Cheapest when hidden |
| `Visibility(visible: false)` | No (default) | ❌ by default (`maintainState: true` to keep) | No | No | Cheap |
| `Offstage(offstage: true)` | No | ✅ | No | No | Layout still runs |
| `Opacity(opacity: 0)` | Yes | ✅ | No (0 is optimised) | **Yes** (still tappable!) | Opacity between 0–1 costs a layer |
| `IgnorePointer` / `AbsorbPointer` | — | — | — | blocks taps | — |

---

## 7.6 LayoutBuilder & responsive design

### LayoutBuilder
```dart
LayoutBuilder(
  builder: (context, constraints) {
    if (constraints.maxWidth >= 1200) return const DesktopLayout();
    if (constraints.maxWidth >= 600) return const TabletLayout();
    return const MobileLayout();
  },
)
```
LayoutBuilder uses the **parent's constraints** (available space for this widget), not the full screen — great for reusable components.

### MediaQuery
```dart
final size = MediaQuery.sizeOf(context);            // logical pixels of the window
final padding = MediaQuery.paddingOf(context);       // safe area insets (notch)
final viewInsets = MediaQuery.viewInsetsOf(context); // keyboard height in bottom
final dpr = MediaQuery.devicePixelRatioOf(context);
final textScaler = MediaQuery.textScalerOf(context);
final orientation = MediaQuery.orientationOf(context);
```
**Logical pixels (dp):** Flutter uses logical pixels; ~38 per cm. Physical pixels = logical × devicePixelRatio.

### Responsive vs Adaptive
* **Responsive** — the layout adapts to **available space** (one column on phone, two on tablet).
* **Adaptive** — the app adapts to the **platform/input type** (Cupertino vs Material controls, mouse hover, keyboard shortcuts, desktop menus, touch target sizes).

### Material 3 window size classes (breakpoints)
| Class | Width (dp) | Typical layout |
|---|---|---|
| Compact | < 600 | Bottom navigation bar, single pane |
| Medium | 600–839 | Navigation rail, maybe two panes |
| Expanded | 840–1199 | Navigation rail/drawer, two panes |
| Large | 1200–1599 | Permanent drawer, list-detail |
| Extra-large | ≥ 1600 | Multiple panes |

Responsive best practices:
* Base decisions on **window width** (not device type/orientation) — split-screen and foldables exist.
* Use `LayoutBuilder` for component-level decisions.
* Don't lock orientation unless required (large screens; Android 16+ ignores orientation/resizability restrictions on large screens for apps targeting recent SDKs).
* Constrain content width on big screens: `ConstrainedBox(constraints: BoxConstraints(maxWidth: 600), child: ...)` centered.
* Use `Wrap`, `GridView` with `SliverGridDelegateWithMaxCrossAxisExtent`.
* Packages: `flutter_adaptive_scaffold` (now discontinued/community), `responsive_framework`, `flutter_screenutil` (scales sizes by design dimensions — popular in companies, but beware of scaling text unnaturally and breaking accessibility).

### SafeArea
```dart
Scaffold(body: SafeArea(child: content));  // pads for notch/status bar/home indicator
SafeArea(bottom: false, child: ...);       // selectively
```
On Android 15+, apps targeting SDK 35 are **edge-to-edge by default** — content draws behind system bars, so correct `SafeArea`/padding handling is critical.

---

## 7.7 The famous layout errors (and EXACT fixes) 🚨

### 7.7.1 "A RenderFlex overflowed by 42 pixels on the right."
Yellow/black stripes. A Row/Column's children are bigger than the available space.
```dart
// ❌
Row(children: [Icon(Icons.person), Text('A very very very long user name that keeps going')]);
// ✅ Fix 1: Expanded/Flexible + overflow handling
Row(children: [
  const Icon(Icons.person),
  Expanded(child: Text(name, overflow: TextOverflow.ellipsis, maxLines: 1)),
]);
// ✅ Fix 2: Wrap instead of Row
// ✅ Fix 3: make it scrollable: SingleChildScrollView(scrollDirection: Axis.horizontal, child: Row(...))
```
**Column overflow when keyboard opens** (bottom overflowed by N pixels): The Scaffold resizes the body when the keyboard opens (`resizeToAvoidBottomInset: true` default), so a fixed-height Column of fields overflows. Fix: wrap in `SingleChildScrollView` (or use `ListView`). Don't "fix" by setting `resizeToAvoidBottomInset: false` unless you handle insets yourself — the keyboard would then cover fields.

### 7.7.2 "Vertical viewport was given unbounded height."
```dart
// ❌ ListView inside Column — Column gives unbounded height to children; ListView wants to fill infinite height.
Column(children: [Text('Header'), ListView(children: items)]);
// ✅ Fix 1: Expanded
Column(children: [const Text('Header'), Expanded(child: ListView(children: items))]);
// ✅ Fix 2: fixed height
SizedBox(height: 200, child: ListView(...));
// ✅ Fix 3: shrinkWrap (⚠️ lays out ALL children → bad for long lists)
ListView(shrinkWrap: true, physics: const NeverScrollableScrollPhysics(), children: items);
// ✅ Best for complex scrolling pages: CustomScrollView with slivers (Chapter 9)
```
Same error horizontally: "Horizontal viewport was given unbounded width" (horizontal ListView inside Row) → wrap in `Expanded` or give a fixed width; a horizontal ListView inside a Column needs a **fixed height** (`SizedBox(height: 120, child: ListView(scrollDirection: Axis.horizontal, ...))`).

### 7.7.3 "RenderBox was not laid out" / "BoxConstraints forces an infinite width"
Usually a follow-up error caused by the unbounded constraint problems above. **Scroll to the FIRST error in the console** — later errors are consequences.
```dart
// ❌ TextField inside Row → "An InputDecorator...cannot have an unbounded width"
Row(children: [TextField()]);
// ✅
Row(children: [Expanded(child: TextField())]);
```
```dart
// ❌ Expanded inside a SingleChildScrollView > Column → unbounded height can't be divided
SingleChildScrollView(child: Column(children: [Expanded(child: ...)])); // error: "RenderFlex children have non-zero flex but incoming height constraints are unbounded."
```
Fix: remove `Expanded`, or use `CustomScrollView` + `SliverFillRemaining(hasScrollBody: false)`, or `LayoutBuilder` + `ConstrainedBox(minHeight: constraints.maxHeight)` + `IntrinsicHeight` pattern:
```dart
LayoutBuilder(builder: (context, constraints) => SingleChildScrollView(
  child: ConstrainedBox(
    constraints: BoxConstraints(minHeight: constraints.maxHeight),
    child: IntrinsicHeight(
      child: Column(children: [
        const Text('Top'),
        const Spacer(),            // pushes button to bottom when content is short
        ElevatedButton(onPressed: () {}, child: const Text('Submit')),
      ]),
    ),
  ),
));
```

### 7.7.4 "Incorrect use of ParentDataWidget."
`Expanded` not directly under Row/Column/Flex, or `Positioned` not directly under Stack. Fix structure.

### 7.7.5 Container width ignored
Parent gives tight constraints (e.g., the item of a `ListView` is forced to full width cross-axis; `CrossAxisAlignment.stretch`). Fix: wrap with `Align`/`Center` to loosen constraints.

### 7.7.6 Text overflow without error but cut off
Use `maxLines`, `overflow: TextOverflow.ellipsis`, `softWrap`, `FittedBox`, or `AutoSizeText` package.

### 7.7.7 Debugging layout tools
* **Flutter Inspector** → "Layout Explorer" shows flex properties and constraints visually.
* `debugPaintSizeEnabled = true;` (or press `p`) shows boxes, padding, alignment.
* Hover/select a widget in DevTools to see its constraints & size.
* Wrap with `ColoredBox(color: Colors.red.withValues(alpha: 0.3))` temporarily.

---

## 7.8 Building a real responsive screen (worked example)

```dart
class ProductPage extends StatelessWidget {
  const ProductPage({super.key, required this.product});
  final Product product;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(product.name)),
      body: SafeArea(
        child: LayoutBuilder(
          builder: (context, constraints) {
            final wide = constraints.maxWidth >= 840;
            final image = AspectRatio(
              aspectRatio: 1,
              child: ClipRRect(
                borderRadius: BorderRadius.circular(16),
                child: Image.network(product.imageUrl, fit: BoxFit.cover),
              ),
            );
            final details = _Details(product: product);

            if (wide) {
              return Center(
                child: ConstrainedBox(
                  constraints: const BoxConstraints(maxWidth: 1200),
                  child: Padding(
                    padding: const EdgeInsets.all(24),
                    child: Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Expanded(child: image),
                        const SizedBox(width: 32),
                        Expanded(child: SingleChildScrollView(child: details)),
                      ],
                    ),
                  ),
                ),
              );
            }
            return ListView(
              padding: const EdgeInsets.all(16),
              children: [image, const SizedBox(height: 16), details],
            );
          },
        ),
      ),
    );
  }
}

class _Details extends StatelessWidget {
  const _Details({required this.product});
  final Product product;
  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context).textTheme;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(product.name, style: t.headlineSmall),
        const SizedBox(height: 8),
        Row(children: [
          Text('₹${product.price}', style: t.titleLarge),
          const Spacer(),
          const Icon(Icons.star, size: 18),
          Text(product.rating.toStringAsFixed(1)),
        ]),
        const SizedBox(height: 16),
        Text(product.description),
        const SizedBox(height: 24),
        SizedBox(
          width: double.infinity,
          child: FilledButton(onPressed: () {}, child: const Text('Add to cart')),
        ),
      ],
    );
  }
}
```

---

## 7.9 Interview Questions — Layout

**Q1. Explain Flutter's layout algorithm.** Constraints go down, sizes go up, parent sets position — single pass (mostly linear) layout where parents pass BoxConstraints to children, children choose sizes within them, and parents position children.

**Q2. Tight vs loose constraints?** Tight: min == max (exact size). Loose: min 0, child may choose anything up to max.

**Q3. Why does my Container ignore its width?** Its parent passes tight constraints; Container must obey. Wrap in `Center`/`Align` to loosen.

**Q4. Expanded vs Flexible?** Expanded forces child to fill allocated flex space (FlexFit.tight); Flexible allows child to be smaller (FlexFit.loose).

**Q5. How to fix "Vertical viewport was given unbounded height"?** Give the scrollable bounded height — Expanded, SizedBox, or shrinkWrap (costly), or use slivers.

**Q6. How do you make a layout responsive?** LayoutBuilder/MediaQuery breakpoints (window size classes), flexible widgets (Expanded, Wrap, Flexible, FractionallySizedBox, AspectRatio), constraining max widths, adaptive navigation (bar/rail/drawer), testing on multiple sizes.

**Q7. MediaQuery vs LayoutBuilder?** MediaQuery provides app window info (size, padding, insets, text scale); LayoutBuilder provides constraints from the parent, better for reusable components.

**Q8. Why use `MediaQuery.sizeOf` instead of `MediaQuery.of(context).size`?** `sizeOf` subscribes only to size changes (InheritedModel aspects), avoiding rebuilds when unrelated properties (like keyboard insets) change.

**Q9. What is IntrinsicHeight and why is it expensive?** It sizes its child to the child's intrinsic height by running a speculative layout pass — can be O(N²) in nested cases; avoid in lists.

**Q10. Stack sizing rules?** Sized by non-positioned children; positioned children placed relative to Stack edges; overflow clipped by default; out-of-bounds children don't receive hits.

**Q11. Difference between `Transform` and `RotatedBox`?** Transform applies at paint time (layout unaffected, hit testing transformed); RotatedBox rotates in quarter turns during layout so surrounding layout adapts.

**Q12. What is SafeArea?** Widget inserting padding to avoid OS intrusions (notches, status bar, home indicator).

**Q13. Logical vs physical pixels?** Logical = device-independent units; physical = logical × devicePixelRatio.

**Q14. How do you push a button to the bottom of a scrollable form when content is short?** LayoutBuilder + SingleChildScrollView + ConstrainedBox(minHeight) + IntrinsicHeight + Spacer, or CustomScrollView with SliverFillRemaining(hasScrollBody: false).

**Q15. What's the difference between `Opacity(0)`, `Visibility` and `Offstage`?** See table §7.5 — Opacity keeps space and hit testing; Visibility removes from layout (optionally maintaining state); Offstage lays out but doesn't paint or hit-test.
