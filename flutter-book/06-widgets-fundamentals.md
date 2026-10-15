# Chapter 6 — Widgets Deep Dive: Stateless, Stateful, Lifecycle, BuildContext, Keys & the Three Trees

> **Goal:** Understand *exactly* how widgets work. This chapter is the heart of Flutter and of Flutter interviews: "What is BuildContext?", "Explain the StatefulWidget lifecycle", "What are keys and when do you need them?", "Widget vs Element vs RenderObject".

---

## 6.1 What is a widget really?

**5-year-old:** A widget is a **LEGO instruction card** 📇. The card says "put a red 2×4 brick here". The card is not the brick. Cards are cheap — you can print new ones all day. The actual bricks (what you see) are built by Flutter based on the cards.

**Grown-up:** A `Widget` is an **immutable configuration object** describing part of the UI. Its fields are `final`. When something changes, Flutter **creates new widget objects** (cheap) and compares them with the old ones to decide what work to do on the long-lived objects underneath (Elements and RenderObjects).

```dart
@immutable
abstract class Widget extends DiagnosticableTree {
  const Widget({this.key});
  final Key? key;
  @protected
  Element createElement();
  static bool canUpdate(Widget oldWidget, Widget newWidget) {
    return oldWidget.runtimeType == newWidget.runtimeType
        && oldWidget.key == newWidget.key;
  }
}
```
That `canUpdate` method is **the most important rule in Flutter** — memorise it: *an element can be updated with a new widget if the runtime type and key are the same.*

---

## 6.2 The three trees 🌳🌳🌳

| Tree | Object | Lifetime | Job | Analogy |
|---|---|---|---|---|
| **Widget tree** | `Widget` | Very short (rebuilt often) | Configuration / blueprint | Instruction cards |
| **Element tree** | `Element` | Long-lived | Manages lifecycle, holds position in tree, connects widget ↔ render object, holds `State` | The **site manager** who reads the cards and keeps track of what's built where |
| **Render tree** | `RenderObject` | Long-lived | Layout, painting, hit testing | The actual **bricks** |

```
Widget tree             Element tree                 RenderObject tree
Container ──────►  StatelessElement
 └ Padding ──────►  SingleChildRenderObjectElement ──► RenderPadding
    └ Text ──────►  StatelessElement
       └ RichText ► MultiChildRenderObjectElement ──► RenderParagraph
```
Not every widget has a RenderObject. **StatelessWidget/StatefulWidget** only *compose* other widgets (they create `ComponentElement`s). **RenderObjectWidget**s (`Padding`, `Opacity`, `RichText`, `Row`, `SizedBox`...) create RenderObjects.

### Why three trees? (interview question)
* Widgets are **cheap and immutable** → easy declarative programming; rebuild freely.
* Elements & RenderObjects are **expensive and mutable** → kept and **updated in place** when possible.
* Diffing new widgets against existing elements lets Flutter **reuse** expensive objects and do the minimum layout/paint work.

### Reconciliation (how Flutter "diffs")
When a parent rebuilds and returns a new child widget, the element calls `updateChild(oldChildElement, newWidget)`:
1. `newWidget == null` → remove (unmount) old child element.
2. Old element is null → **inflate** new widget (create new element + maybe render object).
3. `Widget.canUpdate(old.widget, newWidget)` is true → **update** existing element with new widget (`element.update(newWidget)`), keeping State and RenderObject.
4. Otherwise → **deactivate old element**, inflate a **new** one (State is lost!).

Also, if the new widget is **`identical`** to the old one (same instance — e.g., a `const` widget), Flutter **skips rebuilding** that subtree completely. That's why `const` matters.

For children **lists** (`Row`, `Column`, `ListView`...), `updateChildren` matches old and new children from the top and bottom by type+key, and uses **keys** to match moved children in the middle. Without keys, matching is **positional**.

---

## 6.3 StatelessWidget

Use when the widget depends only on its **constructor arguments** and **inherited data** (Theme, MediaQuery…), and has no internal mutable state.

```dart
class Greeting extends StatelessWidget {
  const Greeting({super.key, required this.name});
  final String name;

  @override
  Widget build(BuildContext context) {
    return Text('Hello, $name!', style: Theme.of(context).textTheme.titleLarge);
  }
}
```
**When is a StatelessWidget's `build` called?**
1. First time it's inserted in the tree.
2. When its parent rebuilds and provides a new widget instance (not identical).
3. When an `InheritedWidget` it depends on changes (e.g., `Theme.of(context)`, `MediaQuery.of(context)`).

"Stateless" doesn't mean it never rebuilds — it means *it has no State object of its own*.

---

## 6.4 StatefulWidget

A StatefulWidget has two classes: the **widget** (immutable config) and the **State** (mutable, long-lived, attached to the element).

```dart
class Counter extends StatefulWidget {
  const Counter({super.key, this.initial = 0});
  final int initial;

  @override
  State<Counter> createState() => _CounterState();
}

class _CounterState extends State<Counter> {
  late int _count;

  @override
  void initState() {
    super.initState();
    _count = widget.initial;   // access the widget's config via `widget`
  }

  @override
  Widget build(BuildContext context) {
    return TextButton(
      onPressed: () => setState(() => _count++),
      child: Text('$_count'),
    );
  }
}
```
**Why split into two classes?** Because widgets are recreated on every parent rebuild, but the State must **survive** those rebuilds. The State lives with the Element, and gets a *new* `widget` reference each time the parent rebuilds.

---

## 6.5 The StatefulWidget lifecycle — complete & precise ♻️

```
createState()
   │
   ▼
[mounted = true]
initState()                      ← once
   │
   ▼
didChangeDependencies()          ← right after initState, and whenever an InheritedWidget it depends on changes
   │
   ▼
build()  ◄──────────────────────────────┐
   │                                     │
   ├── setState() ───────────────────────┤ (marks dirty → build on next frame)
   ├── didUpdateWidget(oldWidget) ───────┤ (parent rebuilt with new config of same type & key; build always follows)
   ├── didChangeDependencies() ──────────┤
   │                                     │
   ▼
deactivate()      ← removed from tree (may be re-inserted in same frame via GlobalKey)
   │
   ├── activate()  ← re-inserted (GlobalKey reparenting) → build()
   ▼
dispose()         ← permanently removed; release resources
[mounted = false]
```

| Method | When | What to do | What NOT to do |
|---|---|---|---|
| `createState()` | Framework creates element | Return new State | Logic |
| `initState()` | Once, after State inserted | Init controllers, subscriptions, start one-time loads; call `super.initState()` **first** | `Theme.of(context)`/`MediaQuery.of(context)`/`dependOnInheritedWidgetOfExactType` (use didChangeDependencies); calling async and expecting result synchronously |
| `didChangeDependencies()` | After initState and when inherited deps change | Work depending on InheritedWidgets (e.g., read locale, start something based on `Provider.of`) | Heavy work without checking whether it's needed (it can be called many times) |
| `build()` | Often | Return widgets; be **pure & fast** | Side effects, network calls, `setState`, creating controllers |
| `didUpdateWidget(old)` | Parent provided new widget config | Compare `old.x` vs `widget.x`; update controllers/subscriptions | Forgetting to call `super.didUpdateWidget(old)` |
| `setState(fn)` | You call it | Synchronously mutate state inside fn, then marks dirty | Calling during build, after dispose, or with async fn |
| `deactivate()` | Removed from tree | Rarely used | — |
| `activate()` | Reinserted after deactivate | Rarely used | — |
| `dispose()` | Permanently removed | Dispose controllers, cancel subscriptions/timers, remove listeners; call `super.dispose()` **last** | `setState`, using context to look up ancestors |
| `reassemble()` | On **hot reload** (debug only) | Re-init things during development | Production logic |

### `mounted`
`mounted` is `true` between `initState` and `dispose`. Check it after `await`s before calling `setState`.

### What exactly does `setState` do?
```dart
@protected
void setState(VoidCallback fn) {
  // (asserts in debug: not disposed, fn not async, etc.)
  final Object? result = fn() as dynamic;
  assert(result is! Future, 'setState() callback argument returned a Future.');
  _element!.markNeedsBuild();
}
```
1. Runs your callback **synchronously**.
2. Calls `markNeedsBuild()` on the element → added to the **dirty elements list** and a frame is scheduled.
3. On the next frame, `BuildOwner.buildScope` rebuilds dirty elements (in depth order) → `build()` is called.

So `setState` does **not** rebuild immediately and multiple `setState` calls in the same frame are **batched into one build**.

The callback is only for clarity — technically you can mutate state before calling `setState(() {})` and it works, but convention is to mutate inside the callback.

**`setState` rebuilds the whole `build` method of that State** (and child widgets whose instances changed). Keep stateful widgets **small and low in the tree** to minimise rebuild cost.

---

## 6.6 BuildContext — "where am I in the tree?" 📍

**5-year-old:** BuildContext is your **home address** in the big family tree. With your address you can ask "who is my grandparent that has the Theme?" or "where is the nearest Navigator?"

**Grown-up:** `BuildContext` is an **interface implemented by `Element`**. Each widget's `build` receives *its own element* as context. It gives:
* Lookup of ancestors: `Theme.of(context)`, `Navigator.of(context)`, `context.findAncestorStateOfType<T>()`, `context.findAncestorWidgetOfExactType<T>()`, `context.dependOnInheritedWidgetOfExactType<T>()`, `context.getInheritedWidgetOfExactType<T>()` (no dependency).
* Size of render object after layout: `context.size` (only after layout, careful).
* `context.mounted` (Flutter 3.7+).
* `findRenderObject()`.

### The #1 BuildContext bug: using the wrong context
```dart
class MyPage extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: ElevatedButton(
        onPressed: () {
          // This `context` belongs to MyPage — ABOVE the Scaffold.
          Scaffold.of(context).openDrawer();  // ❌ "Scaffold.of() called with a context that does not contain a Scaffold."
        },
        child: const Text('Open'),
      ),
    );
  }
}
```
Fixes:
```dart
// 1. Builder gives a context BELOW the Scaffold
body: Builder(
  builder: (innerContext) => ElevatedButton(
    onPressed: () => Scaffold.of(innerContext).openDrawer(),
    child: const Text('Open'),
  ),
),
// 2. Extract the button into its own widget (its context is below Scaffold).
// 3. Use a GlobalKey<ScaffoldState>.
```
Same bug class: `Provider.of<X>(context)` where the provider is created in the same build method; `Navigator.of(context)` above `MaterialApp`; `MediaQuery.of(context)` above `MaterialApp` ("No MediaQuery widget ancestor found").

### `of` vs `maybeOf`
`Theme.of(context)` always returns something (falls back to default). `Navigator.of` throws if none; `Navigator.maybeOf` returns null. Many classes provide both.

---

## 6.7 InheritedWidget — sharing data down the tree efficiently

**5-year-old:** It's like a **radio tower** 📻 at the top of the tree. Any widget below can tune in (`dependOn...`). When the tower broadcasts a new message, **only the widgets that tuned in** rebuild.

```dart
class UserScope extends InheritedWidget {
  const UserScope({super.key, required this.user, required super.child});
  final User user;

  static User of(BuildContext context) {
    final scope = context.dependOnInheritedWidgetOfExactType<UserScope>();
    assert(scope != null, 'No UserScope found in context');
    return scope!.user;
  }

  @override
  bool updateShouldNotify(UserScope oldWidget) => user != oldWidget.user;
}
```
* `dependOnInheritedWidgetOfExactType` — O(1) lookup (elements keep a map of inherited widgets) **and registers a dependency**: when `updateShouldNotify` returns true, dependents get `didChangeDependencies` + rebuild.
* `getInheritedWidgetOfExactType` — O(1) lookup **without** dependency (no rebuilds).
* `Theme`, `MediaQuery`, `Directionality`, `DefaultTextStyle`, `Localizations`, `Navigator`-ish scopes, `Provider` — all built on InheritedWidget (or InheritedNotifier/InheritedModel).

### InheritedModel — rebuild only for the aspect you care about
`MediaQuery` became an `InheritedModel` (Flutter 3.10). `MediaQuery.of(context)` rebuilds you on **any** change (keyboard opening changes viewInsets → rebuild!). Use aspect methods:
```dart
final size = MediaQuery.sizeOf(context);          // rebuild only when size changes
final padding = MediaQuery.paddingOf(context);
final insets = MediaQuery.viewInsetsOf(context);  // keyboard
final textScaler = MediaQuery.textScalerOf(context);
final brightness = MediaQuery.platformBrightnessOf(context);
```
👉 Performance tip asked in senior interviews: prefer `MediaQuery.sizeOf(context)` over `MediaQuery.of(context).size`.

### InheritedNotifier
Combines InheritedWidget with a `Listenable` (e.g., `ChangeNotifier`, `ValueNotifier`): dependents rebuild when the notifier notifies. Basis of simple DI/state patterns (Chapter 14).

---

## 6.8 Keys — name tags for widgets 🏷️

**5-year-old:** Imagine kids sitting in chairs. If no one has a **name tag**, and the first kid leaves, the teacher just looks at chair positions: "chair 1 is still here, chair 2 is still here…" and gets confused about who's who. With **name tags**, the teacher knows exactly which kid moved where.

### When do you NEED keys?
When you have **a collection of stateful widgets of the same type** that can be **reordered, inserted, or removed**, and you want each one's state to follow it.

#### The classic demo
```dart
class ColorTile extends StatefulWidget {
  const ColorTile({super.key});
  @override
  State<ColorTile> createState() => _ColorTileState();
}
class _ColorTileState extends State<ColorTile> {
  final color = Color(Random().nextInt(0xFFFFFFFF));   // state lives HERE
  @override
  Widget build(BuildContext context) => Container(width: 100, height: 100, color: color);
}

// Parent swaps tiles:
tiles = [tiles[1], tiles[0]];
```
Without keys: `Row` compares by position → same type at index 0 → `canUpdate` true → **element (and its State with the color) stays at index 0** → colours **don't swap**! 😱
With `ColorTile(key: UniqueKey())` or `ValueKey(id)`: elements are matched by key → states move → colours swap ✅.

(If the colour were passed in from the parent as a constructor parameter — i.e., a StatelessWidget — swapping works without keys because the *widget* carries the data.)

### Types of keys
| Key | Equality based on | Use case |
|---|---|---|
| `ValueKey<T>(value)` | `value ==` | Items with unique id: `ValueKey(todo.id)` |
| `ObjectKey(object)` | `identical(object)` | When the object identity is unique but no simple id |
| `UniqueKey()` | only equal to itself | Force a brand-new element every build (⚠️ creating UniqueKey in build = state reset each rebuild!) |
| `PageStorageKey` | value | Preserve scroll position in PageStorage across tabs/routes |
| `GlobalKey<T>` | unique across the **entire app** | Access State/context from outside, move widget between parents keeping state, forms |
| `GlobalObjectKey` | object identity, global | rare |

**Local keys** (ValueKey, ObjectKey, UniqueKey) only need to be unique **among siblings**.

### GlobalKey
```dart
final _formKey = GlobalKey<FormState>();
Form(key: _formKey, child: ...);
if (_formKey.currentState!.validate()) { _formKey.currentState!.save(); }

final scaffoldKey = GlobalKey<ScaffoldState>();
scaffoldKey.currentState?.openDrawer();
```
GlobalKey gives: `currentState`, `currentContext`, `currentWidget`. Moving a widget with a GlobalKey to another parent **in the same frame** reparents the element and **keeps its State** (deactivate → activate).

⚠️ GlobalKey downsides: expensive-ish (global registry), must be unique (error: *"Multiple widgets used the same GlobalKey"* — usually from creating a key in `build()` of a widget used twice, or two routes showing the same widget), encourage imperative coupling. Use sparingly.

### Where to put the key
Put the key **on the outermost widget of the list item**, i.e., the direct child of the list:
```dart
ListView(children: [
  for (final todo in todos)
    TodoTile(key: ValueKey(todo.id), todo: todo),   // ✅ top-level of item
]);
// ❌ Wrong: Padding(child: TodoTile(key: ValueKey(todo.id)))  — the Padding is the sibling being matched!
```

### Keys and `ListView.builder`
Lazy lists reuse elements by index. If items can be removed/reordered and are stateful (e.g., checkboxes with local state, text fields, animations), give them `ValueKey(id)`. Use `findChildIndexCallback` in `ListView.builder`/`SliverChildBuilderDelegate` to help Flutter find moved keyed items efficiently.

### Using keys to *reset* state on purpose
```dart
// When userId changes, give the form a new key → fresh state
ProfileForm(key: ValueKey(userId), userId: userId);
```

---

## 6.9 Widget categories you must know

1. **ComponentWidgets** (no render object): `StatelessWidget`, `StatefulWidget`, `ProxyWidget` (`InheritedWidget`, `ParentDataWidget`).
2. **RenderObjectWidgets**:
   * `LeafRenderObjectWidget` (no children): `RawImage`, `ErrorWidget`.
   * `SingleChildRenderObjectWidget`: `Padding`, `Opacity`, `SizedBox`, `Align`, `ClipRRect`, `Transform`.
   * `MultiChildRenderObjectWidget`: `Row`, `Column`, `Stack`, `Flex`, `Wrap`, `Flow`, `RichText`, `CustomMultiChildLayout`.
3. **ParentDataWidget**: configures how a child is laid out by its parent: `Expanded`/`Flexible` (must be direct child of Flex: Row/Column), `Positioned` (must be child of Stack), `TableCell`, `LayoutId`. Misuse error: **"Incorrect use of ParentDataWidget"** — e.g., `Expanded` wrapped in a `Padding` inside a `Row` is fine only if the `Expanded` is the outer one: `Expanded` must be the *direct* child of a `Row`/`Column`/`Flex`, and `Positioned` must be a direct child of a `Stack` (wrap the inner widget instead: `Expanded(child: Padding(...))`).

### Container is a convenience widget
`Container` is a StatelessWidget composing `Padding`, `ConstrainedBox`, `DecoratedBox`, `Align`, `Transform`, `ColoredBox`, `ClipPath`, `LimitedBox` depending on which properties you set. Interview Q: *"Container vs SizedBox?"* → `SizedBox` is a lightweight single render object for fixed size/spacing and can be `const`; Container is heavier and can't be const with many params. Use `SizedBox` for gaps and fixed sizes, `ColoredBox` for just colour, `DecoratedBox` for decoration, `Padding` for padding.

⚠️ `Container(color: X, decoration: BoxDecoration(...))` → **assertion error**: "Cannot provide both a color and a decoration". Put color inside the decoration.

---

## 6.10 Extract widgets, not helper methods (important best practice)

```dart
// ❌ Helper method
Widget _buildHeader() => Text('Header $count');

// ✅ Separate widget class
class Header extends StatelessWidget {
  const Header({super.key, required this.count});
  final int count;
  @override
  Widget build(BuildContext context) => Text('Header $count');
}
```
Why classes are better:
1. **Own BuildContext** → correct `of(context)` lookups (fixes the Scaffold.of bug).
2. **Rebuild optimisation**: a `const` widget or unchanged instance can be skipped; helper methods always re-execute with the parent.
3. Separate element → only it rebuilds when its InheritedWidget dependency changes (not the whole parent).
4. DevTools shows it in the widget tree; easier testing; reusable.
Helper methods are fine for tiny, non-reused snippets but in interviews say "prefer widget classes".

---

## 6.11 Builder widgets & callbacks

* `Builder` — new context.
* `LayoutBuilder` — gives parent **constraints** (Chapter 7).
* `StatefulBuilder` — local setState inside dialogs/bottom sheets:
```dart
showDialog(context: context, builder: (_) => StatefulBuilder(
  builder: (context, setLocalState) => Checkbox(
    value: checked,
    onChanged: (v) => setLocalState(() => checked = v!),
  ),
));
```
* `ValueListenableBuilder` — rebuild only when a `ValueNotifier` changes.
* `ListenableBuilder` / `AnimatedBuilder` — rebuild when any `Listenable` changes (AnimatedBuilder is the same thing, named for animations).
* `FutureBuilder`, `StreamBuilder` (Chapter 5).
* `OrientationBuilder`, `TweenAnimationBuilder`.

`child` parameter optimisation:
```dart
AnimatedBuilder(
  animation: controller,
  child: const ExpensiveWidget(),             // built ONCE
  builder: (context, child) => Transform.rotate(
    angle: controller.value * 2 * pi,
    child: child,                             // reused every frame
  ),
);
```

---

## 6.12 App lifecycle (whole app, not widget)

```dart
class _AppState extends State<App> with WidgetsBindingObserver {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
  }
  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }
  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    switch (state) {
      case AppLifecycleState.resumed:  // visible & interactive
      case AppLifecycleState.inactive: // visible but not receiving input (iOS app switcher, phone call overlay)
      case AppLifecycleState.hidden:   // (3.13+) not visible; all platforms report it before paused
      case AppLifecycleState.paused:   // in background (mobile)
      case AppLifecycleState.detached: // engine running without a view (being destroyed / not yet attached)
    }
  }
}
```
Flutter 3.13 added `AppLifecycleListener` — easier API with `onResume`, `onPause`, `onHide`, `onShow`, `onInactive`, `onDetach`, `onRestart`, `onExitRequested` (desktop exit handling):
```dart
late final AppLifecycleListener _listener = AppLifecycleListener(
  onResume: _refresh,
  onPause: _saveDraft,
);
@override
void dispose() { _listener.dispose(); super.dispose(); }
```
Other `WidgetsBindingObserver` callbacks: `didChangeMetrics` (rotation/resize/keyboard), `didChangePlatformBrightness`, `didChangeLocales`, `didHaveMemoryPressure`, `didChangeTextScaleFactor`/`didChangeAccessibilityFeatures`, `didPopRoute`/`didPushRouteInformation` (back button/deep links at root).

---

## 6.13 Common widget-level bugs & fixes

| Error message | Cause | Fix |
|---|---|---|
| `setState() called after dispose()` | async completes after widget removed / un-cancelled stream/timer | check `mounted`; cancel subscriptions in dispose |
| `setState() or markNeedsBuild() called during build` | calling setState (or a notifier that triggers rebuild) inside build / initState synchronously that triggers ancestor rebuild | move to event handler; use `WidgetsBinding.instance.addPostFrameCallback((_) {...})` |
| `dependOnInheritedWidgetOfExactType<...>() was called before initState() completed` | `Theme.of(context)` in initState | move to `didChangeDependencies` or `build` |
| `Looking up a deactivated widget's ancestor is unsafe` | using `context` after widget disposed (e.g., in async callback, in dispose) | capture needed objects earlier (`final nav = Navigator.of(context)`), check `mounted` |
| `Multiple widgets used the same GlobalKey` | same GlobalKey in two places/routes | create keys once per instance in State, not static/global; ensure single use |
| `Duplicate keys found` | two siblings with same ValueKey | ensure IDs are unique |
| `A RenderFlex overflowed by X pixels` | Chapter 7 | Chapter 7 |
| `Incorrect use of ParentDataWidget` | Expanded/Flexible/Positioned not a direct child of Flex/Stack | restructure |
| State not updating when parent passes new value | You copied `widget.value` into State in `initState` only | handle in `didUpdateWidget`, or read `widget.value` directly in build |
| State "sticks" to wrong list item after delete | no keys on stateful list items | `ValueKey(item.id)` |
| Text field loses focus/text on rebuild | `TextEditingController` created in `build`, or UniqueKey in build | create controller in initState; avoid UniqueKey in build |

Example of the `didUpdateWidget` bug:
```dart
class _PriceState extends State<Price> {
  late double _displayed;
  @override
  void initState() { super.initState(); _displayed = widget.price; }

  @override
  void didUpdateWidget(covariant Price oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.price != widget.price) {
      _displayed = widget.price;   // ✅ sync state with new config
    }
  }
  ...
}
```

---

## 6.14 Interview Questions — Widgets

**Q1. What is a widget?** An immutable description of part of the UI; a configuration for an Element.

**Q2. StatelessWidget vs StatefulWidget?** Stateless has no mutable state of its own and rebuilds only from parent/inherited changes; Stateful has a separate long-lived `State` object that can call `setState` to rebuild.

**Q3. Explain the StatefulWidget lifecycle.** createState → initState → didChangeDependencies → build → (setState / didUpdateWidget / didChangeDependencies → build)* → deactivate → (activate → build) → dispose. Plus reassemble on hot reload.

**Q4. What does setState do internally?** Runs the callback synchronously, then marks the element dirty (`markNeedsBuild`), scheduling a frame; dirty elements rebuild in the next frame's build phase. Multiple calls are batched.

**Q5. What is BuildContext?** A handle to the widget's location in the tree — actually the Element. Used to look up ancestors and inherited widgets.

**Q6. Why can't you use `Theme.of(context)` in initState?** Inherited dependencies aren't safe to establish there; use `didChangeDependencies` (or build). Reading with `listen: false`-style APIs that don't register dependencies may work, but the rule is to use didChangeDependencies.

**Q7. Widget vs Element vs RenderObject?** Widget = immutable config; Element = instantiation in the tree, manages lifecycle, holds State, links widget to render object; RenderObject = does layout, painting, hit testing.

**Q8. What are keys? When are they needed?** Identifiers to preserve/match element state when widgets of the same type move, are added or removed among siblings; needed for stateful items in reorderable/modified lists, to force state reset, to preserve scroll positions, and GlobalKeys for cross-tree access.

**Q9. ValueKey vs ObjectKey vs UniqueKey vs GlobalKey?** See table §6.8.

**Q10. What is InheritedWidget?** A widget that efficiently propagates data down the tree; descendants depending on it are rebuilt when `updateShouldNotify` returns true.

**Q11. What is `didUpdateWidget` used for?** Reacting to new configuration from the parent (e.g., re-subscribe if a stream parameter changed, update animation targets).

**Q12. What's the difference between `deactivate` and `dispose`?** Deactivate: element removed from tree, possibly re-inserted in the same frame (GlobalKey reparenting). Dispose: permanently removed; release resources.

**Q13. Why is `build` called so many times, and is it expensive?** Build runs on any state/config/dependency change; it should be pure and cheap — creating widgets is cheap, while elements/render objects are reused. Costly work belongs elsewhere.

**Q14. Why prefer widget classes over helper methods?** Own context, rebuild isolation, const-ability, better DevTools/testing.

**Q15. What does `const` do for widgets?** Canonical instance; identical instance on rebuild lets Flutter skip updating that subtree.

**Q16. What does `mounted` mean?** Whether the State is currently in the tree (between initState and dispose).

**Q17. How do you run code after the first frame/build?** `WidgetsBinding.instance.addPostFrameCallback((_) { ... })` in initState (e.g., to show a dialog or measure sizes).

**Q18. Can a StatelessWidget have mutable fields?** It shouldn't — widgets are `@immutable`; the analyzer warns. Mutable state belongs in a State or external state holder.

**Q19. What is `Widget.canUpdate`?** Returns true if runtimeType and key match — decides whether an element is updated or replaced.

**Q20. How does Flutter know which widgets to rebuild?** Only elements marked dirty (via setState, inherited dependency change, or listenable builders) and descendants receiving new widget instances get rebuilt; subtrees with identical widget instances are skipped.
