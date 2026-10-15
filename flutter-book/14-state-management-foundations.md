# Chapter 14 — State Management, Part 1: Concepts, setState, InheritedWidget, ValueNotifier, ChangeNotifier & Provider

> **Goal:** Understand *what* state is, the different kinds, *where* it should live, and master Flutter's built-in tools and Provider. This is the foundation for Riverpod and Bloc (Chapter 15).

---

## 14.1 What is "state"? 🧠

**5-year-old:** State is **anything that can change and that the screen needs to remember**: the number on a counter, whether you're logged in, items in your cart, which tab is selected, the text you typed.

**Grown-up (Flutter docs):** *"Whatever data you need in order to rebuild your UI at any moment in time."* Since **UI = f(state)**, managing state = deciding where data lives, who can change it, and how the UI learns about changes.

### Two kinds of state
| | Ephemeral (local/UI) state | App (shared) state |
|---|---|---|
| Examples | current page in PageView, animation progress, is the password visible, selected tab, text field focus | logged-in user, cart, preferences, notifications, cached server data |
| Used by | one widget | many widgets/screens |
| Survives navigation? | No need | Yes |
| Tool | `setState`, `ValueNotifier` | Provider, Riverpod, Bloc, … |

There's no hard rule; start local and **lift state up** when others need it.

### Other useful classifications (senior-level)
* **Server state** (remote data cache: loading/error/data, refetching, staleness) vs **client state** (UI selections, form inputs). Mixing them is a common source of bugs; Riverpod's `FutureProvider`/`AsyncNotifier` or dedicated caching layers handle server state well.
* **Derived state** — computed from other state (cart total from cart items). Don't store it separately — compute or memoize, or it gets out of sync.
* **Persistent state** — must survive restarts (tokens, settings) → storage (Chapter 17).
* **Navigation state** — current route stack (router).

---

## 14.2 Principles of good state management (interview-ready)
1. **Single source of truth** — each piece of data lives in exactly one place.
2. **Unidirectional data flow** — events go up (user action → logic), state flows down (logic → UI).
3. **Immutability** — create new state objects instead of mutating (easy change detection, no hidden mutations, time-travel debugging).
4. **Separation of concerns** — UI renders; business logic lives in testable classes without `BuildContext`.
5. **Minimal rebuilds** — only widgets depending on changed data rebuild.
6. **Testability** — logic testable without widgets; dependencies injectable.
7. **Predictability** — state changes happen in known places.

---

## 14.3 `setState` — local state

Covered in Chapter 6. Use for ephemeral state inside one widget.

### Lifting state up
When two siblings need the same state, move it to the **nearest common ancestor** and pass down **data + callbacks**:
```dart
class CartPage extends StatefulWidget { ... }
class _CartPageState extends State<CartPage> {
  final List<Item> _items = [];
  void _add(Item i) => setState(() => _items.add(i));
  @override
  Widget build(BuildContext context) => Column(children: [
    CartBadge(count: _items.length),       // data down
    ProductList(onAdd: _add),              // callbacks up
  ]);
}
```
Problem at scale: **prop drilling** — passing data through many layers that don't use it. Solutions: InheritedWidget-based tools (Provider, Riverpod, Bloc).

---

## 14.4 `ValueNotifier` & `ValueListenableBuilder` — the simplest reactive box 📦🔔

```dart
final counter = ValueNotifier<int>(0);   // a box that rings a bell when its value changes

ValueListenableBuilder<int>(
  valueListenable: counter,
  builder: (context, value, child) => Text('$value'),  // only this rebuilds
);
counter.value++;          // rings the bell (only if value != old value, using ==)
counter.dispose();        // when done
```
⚠️ Mutating a list inside a ValueNotifier does **not** notify:
```dart
final items = ValueNotifier<List<String>>([]);
items.value.add('x');                     // ❌ no notification (same list instance)
items.value = [...items.value, 'x'];      // ✅ new list → notifies
```
`ValueNotifier` + `InheritedNotifier`/`get_it` is enough for many small apps.

---

## 14.5 `ChangeNotifier` — observable class 📣

```dart
class CartModel extends ChangeNotifier {
  final List<Item> _items = [];
  UnmodifiableListView<Item> get items => UnmodifiableListView(_items);  // expose read-only
  int get totalPrice => _items.fold(0, (sum, i) => sum + i.price);       // derived

  void add(Item item) {
    _items.add(item);
    notifyListeners();      // 🔔 tell listeners to rebuild
  }

  void removeAll() {
    _items.clear();
    notifyListeners();
  }
}
```
* `addListener`/`removeListener`, `dispose()`, `hasListeners`.
* `notifyListeners()` after disposal → error *"A CartModel was used after being disposed."*
* `ListenableBuilder(listenable: cart, builder: ...)` rebuilds on notifications (Flutter 3.10+; `AnimatedBuilder` works too).
* Calling `notifyListeners` **during build** → "setState() or markNeedsBuild() called during build" error.
* `ChangeNotifier` is O(1) to add/remove listeners and O(N) to dispatch — fine for UI models.

**Drawbacks**: mutable, one big notifier rebuilds all listeners (use `select`/`Selector`), notify-forgetting bugs, async state (loading/error) must be modelled manually.

The **official Flutter architecture guide** (docs.flutter.dev/app-architecture) recommends **MVVM**: ViewModels extend `ChangeNotifier`, Views listen with `ListenableBuilder`, repositories handle data, and a "Command" pattern for actions (Chapter 21).

---

## 14.6 InheritedWidget / InheritedNotifier as DIY DI

```dart
class CartScope extends InheritedNotifier<CartModel> {
  const CartScope({super.key, required CartModel cart, required super.child}) : super(notifier: cart);
  static CartModel of(BuildContext context) =>
      context.dependOnInheritedWidgetOfExactType<CartScope>()!.notifier!;
}
// Above the app:
CartScope(cart: CartModel(), child: const MyApp());
// Anywhere below:
final cart = CartScope.of(context);   // rebuilds when cart notifies
```
That's essentially what **Provider** does with nicer APIs and lifecycle handling.

---

## 14.7 Provider 📦➡️

`provider` (by Remi Rousselet) — "a wrapper around InheritedWidget to make them easier to use and more reusable". It was the Flutter team's recommended approach for years and is still extremely common in company codebases.

### Setup
```dart
void main() {
  runApp(
    MultiProvider(
      providers: [
        Provider<ApiClient>(create: (_) => ApiClient()),                          // plain object (DI)
        ChangeNotifierProvider(create: (_) => AuthModel()),                       // owns & disposes it
        ChangeNotifierProxyProvider<AuthModel, CartModel>(                        // depends on another
          create: (_) => CartModel(),
          update: (_, auth, cart) => cart!..userId = auth.userId,
        ),
        FutureProvider<Config?>(create: (_) => loadConfig(), initialData: null),
        StreamProvider<ConnectivityStatus>(create: (_) => connectivity.stream, initialData: ConnectivityStatus.unknown),
      ],
      child: const MyApp(),
    ),
  );
}
```

### Reading
```dart
// 1. watch: listen & rebuild when it changes (use in build)
final cart = context.watch<CartModel>();

// 2. read: get without listening (use in callbacks, NOT in build to get values for display)
onPressed: () => context.read<CartModel>().add(item),

// 3. select: rebuild only when a specific part changes
final count = context.select<CartModel, int>((c) => c.items.length);

// Older equivalents:
Provider.of<CartModel>(context);               // listen: true (watch)
Provider.of<CartModel>(context, listen: false); // read

// Widgets:
Consumer<CartModel>(
  builder: (context, cart, child) => Text('Total: ${cart.totalPrice}'),
  child: const ExpensiveStaticPart(),   // not rebuilt
);
Selector<CartModel, int>(
  selector: (_, cart) => cart.items.length,
  builder: (_, count, __) => Badge(label: Text('$count')),
);
```

### `create` vs `.value` — VERY common bug & interview question
```dart
// ✅ Creating a NEW object → use create (Provider owns lifecycle & disposes ChangeNotifier)
ChangeNotifierProvider(create: (_) => CartModel(), child: ...);

// ✅ Providing an EXISTING object (e.g., in a list item or passing to a new route) → use .value
ChangeNotifierProvider.value(value: existingCart, child: ...);

// ❌ BAD: .value with a new instance inside build → recreated every rebuild, state lost, leaks
ChangeNotifierProvider.value(value: CartModel(), child: ...);
// ❌ BAD: create with an existing instance → Provider will DISPOSE it when removed, though you still use it elsewhere
```

### Common Provider errors
* **`ProviderNotFoundException` / "Could not find the correct Provider<X> above this Widget"**: 
  1. Provider is below the widget reading it (e.g., read in the same `build` that creates it → use `Builder` or `Consumer`).
  2. Reading in a **new route** — routes are children of `Navigator` (under MaterialApp), not of the page that pushed them; providers declared in a page aren't visible in pushed routes → move provider above MaterialApp or pass `.value` into the new route.
  3. Wrong generic type (`ChangeNotifierProvider<CartModel>` vs reading `context.watch<Cart>()`), or imported from two different paths (relative vs package import making two "different" types!).
  4. Hot reload after adding a provider → do a hot restart.
* **"Tried to listen to a value exposed with provider, from outside of the widget tree"** → used `watch`/`Provider.of` with listen:true in a callback; use `read`.
* **"setState() or markNeedsBuild() called during build"** → calling a method that `notifyListeners()` from build/initState synchronously → use `addPostFrameCallback` or `Future.microtask`.

### Provider pros/cons
✅ Simple, built on Flutter primitives, official-ish, lots of examples, good for small/medium apps.
❌ Depends on `BuildContext` (can't easily access outside widgets), runtime errors (ProviderNotFound) instead of compile-time safety, combining/depending providers is clunky (ProxyProvider), same-type conflicts (two providers of the same type: the nearest wins).

The author created **Riverpod** to solve these issues (Chapter 15).

---

## 14.8 Modelling async state correctly

Every screen loading remote data has (at least) these states: **initial/idle, loading, data (success), empty, error** — and sometimes "refreshing with old data", "loading more".

❌ Fragile: separate booleans that allow impossible combinations:
```dart
bool isLoading; String? error; List<Item>? data;   // isLoading && error both true??
```
✅ Use a sealed class (Dart 3):
```dart
sealed class LoadState<T> { const LoadState(); }
final class Idle<T> extends LoadState<T> { const Idle(); }
final class Loading<T> extends LoadState<T> { const Loading({this.previous}); final T? previous; }
final class Loaded<T> extends LoadState<T> { const Loaded(this.data); final T data; }
final class Failed<T> extends LoadState<T> { const Failed(this.error, {this.previous}); final Object error; final T? previous; }

Widget build(BuildContext context) => switch (state) {
  Idle() => const SizedBox.shrink(),
  Loading(previous: final p?) => ItemsList(p, refreshing: true),
  Loading() => const Center(child: CircularProgressIndicator()),
  Loaded(:final data) when data.isEmpty => const EmptyView(),
  Loaded(:final data) => ItemsList(data),
  Failed(:final error) => ErrorView(error: error, onRetry: reload),
};
```
Riverpod's `AsyncValue` and Bloc's state classes implement this idea.

---

## 14.9 Comparison table (overview — details in Chapter 15)

| Approach | Boilerplate | Learning curve | Testability | Scales to big apps | Context needed | Notes |
|---|---|---|---|---|---|---|
| setState | none | trivial | low (logic in UI) | ❌ | yes | local state only |
| ValueNotifier/ChangeNotifier + InheritedNotifier/ListenableBuilder | low | low | good | medium | yes | official MVVM guide uses ChangeNotifier |
| Provider | low | low | good | medium–large | yes | very common legacy/current |
| Riverpod | low–medium | medium | excellent | ✅ | no (uses ref) | compile-safe, async-first, codegen optional |
| Bloc/Cubit | medium–high | medium | excellent | ✅ | yes (BlocProvider) | events/states, traceable, enterprise favourite |
| GetX | very low | low | weak | ❌ (debated) | no | all-in-one, magic, frowned upon in many teams |
| MobX | medium (codegen) | medium | good | ✅ | no | observables/reactions |
| Redux | high | high | excellent | ✅ | yes | single store, rarely chosen for new apps |
| signals | low | low | good | medium | no | fine-grained reactivity (signals package) |

**What to answer when asked "Which state management is best?"**: *"There's no single best; it depends on team size, app complexity, and conventions. For small apps setState/ValueNotifier/Provider is enough. For large apps I prefer Riverpod or Bloc because they enforce separation, are testable, and handle async well. Consistency across the codebase matters more than the choice itself."* Then give concrete reasons for your preference.

---

## 14.10 Interview Questions — State management foundations

**Q1. What is state in Flutter?** Data needed to rebuild the UI at any moment.

**Q2. Ephemeral vs app state?** Ephemeral is local to one widget (setState); app state is shared/persistent across parts of the app (state management solutions).

**Q3. What is "lifting state up"?** Moving state to the closest common ancestor of widgets that need it, passing data down and callbacks up.

**Q4. What is prop drilling and how to avoid it?** Passing data through many intermediate widgets; avoid with InheritedWidget-based solutions (Provider, Riverpod, Bloc) or DI.

**Q5. What is ChangeNotifier?** A class providing listener registration and `notifyListeners()` to signal changes; used with ListenableBuilder/Provider.

**Q6. ValueNotifier vs ChangeNotifier?** ValueNotifier holds a single value and notifies when the value is replaced with a non-equal one; ChangeNotifier is a general base where you call notifyListeners manually.

**Q7. context.watch vs context.read vs context.select?** watch listens and rebuilds; read gets once without listening (callbacks); select listens to a derived value and rebuilds only when it changes.

**Q8. Provider `create` vs `.value`?** create for new instances (provider owns/disposes), .value for existing instances (no disposal) — misuse causes state loss or disposed-object errors.

**Q9. Why does ProviderNotFoundException occur?** The reading context isn't a descendant of the provider (same build method, different route, wrong type/import).

**Q10. Why is immutable state preferred?** Easy change detection (==), predictable updates, no accidental shared mutation, simpler debugging/time travel, safe across isolates.

**Q11. How do you avoid unnecessary rebuilds in Provider?** `select`/`Selector`, `Consumer` placed low, `child` param, splitting models, const widgets.

**Q12. How do you represent loading/error/data states?** Sealed classes/union types (or AsyncValue), avoiding inconsistent boolean flags.
