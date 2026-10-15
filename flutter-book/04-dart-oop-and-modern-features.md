# Chapter 4 — Dart Language, Part 2: OOP, Generics & Modern Dart 3 Features

> **Goal:** Master classes, constructors (all kinds!), inheritance, abstract classes, interfaces, mixins, extensions, enums, generics, class modifiers, sealed classes, records, patterns, extension types, dot shorthands and primary constructors. These power every Flutter codebase and are standard interview material.

---

## 4.1 Classes and objects — cookie cutters 🍪

A **class** is a **cookie cutter**; an **object (instance)** is a **cookie** made with it. Each cookie can have different sprinkles (field values), but the same shape (structure & behaviour).

```dart
class Dog {
  // Fields (instance variables)
  final String name;
  int age;

  // Constructor
  Dog(this.name, this.age);

  // Method
  void bark() => print('$name says Woof!');

  // Getter
  bool get isPuppy => age < 1;

  @override
  String toString() => 'Dog($name, $age)';
}

void main() {
  final rex = Dog('Rex', 3);   // `new` keyword is optional (and discouraged)
  rex.bark();
  rex.age++;
  print(rex);                  // Dog(Rex, 4)
}
```

---

## 4.2 Constructors — every kind (interview gold)

### 4.2.1 Generative constructor with initializing formals
```dart
class Point {
  final double x, y;
  Point(this.x, this.y);           // "this.x" = initializing formal
}
```

### 4.2.2 Named constructors
Dart has **no constructor overloading**; use named constructors:
```dart
class Point {
  final double x, y;
  Point(this.x, this.y);
  Point.origin() : x = 0, y = 0;
  Point.fromJson(Map<String, dynamic> json)
      : x = (json['x'] as num).toDouble(),
        y = (json['y'] as num).toDouble();
}
final p = Point.fromJson({'x': 1, 'y': 2});
```

### 4.2.3 Initializer list (runs before the body; can set final fields; can assert)
```dart
class Temperature {
  final double celsius;
  final double fahrenheit;
  Temperature(this.celsius)
      : assert(celsius >= -273.15),
        fahrenheit = celsius * 9 / 5 + 32;
}
```

### 4.2.4 Redirecting constructor
```dart
class Point {
  final double x, y;
  Point(this.x, this.y);
  Point.onXAxis(double x) : this(x, 0);
}
```

### 4.2.5 Const constructor
All fields must be `final`, no body:
```dart
class Color {
  final int r, g, b;
  const Color(this.r, this.g, this.b);
}
const red = Color(255, 0, 0);
print(identical(const Color(255, 0, 0), red)); // true — canonicalised
```
Every Flutter widget you write should have a `const` constructor when possible.

### 4.2.6 Factory constructor
A `factory` constructor **doesn't have to create a new instance**. It can return a cached instance, a subtype, or do logic before creating:
```dart
class Logger {
  static final Map<String, Logger> _cache = {};
  final String name;
  Logger._internal(this.name);                 // private named constructor

  factory Logger(String name) =>
      _cache.putIfAbsent(name, () => Logger._internal(name));
}

abstract class Shape {
  factory Shape(String type) => switch (type) {
        'circle' => Circle(),
        'square' => Square(),
        _ => throw ArgumentError(type),
      };
  double area();
}
```
Factory vs generative:
| | Generative | Factory |
|---|---|---|
| Must create new instance | ✅ | ❌ (can return existing/subtype) |
| Has access to `this` | ✅ (in body) | ❌ |
| Initializer list | ✅ | ❌ |
| Can be `const` | ✅ | ✅ only as redirecting factory |
| Common use | normal | singletons, caching, `fromJson`, returning subclasses |

### 4.2.7 Singleton pattern in Dart
```dart
class ApiClient {
  ApiClient._();                             // private constructor
  static final ApiClient instance = ApiClient._();
  // or: factory ApiClient() => instance;
}
```
(In big apps prefer dependency injection over global singletons — easier to test. See Chapter 21.)

### 4.2.8 Super parameters (Dart 2.17+)
```dart
class Animal {
  final String name;
  Animal(this.name);
}
class Cat extends Animal {
  final bool indoor;
  Cat(super.name, {this.indoor = true});   // instead of Cat(String name) : super(name)
}
// In Flutter: const MyWidget({super.key});
```

### 4.2.9 Primary constructors (Dart 3.13+)
Dart 3.13 (released August 2026) added **primary constructors**: declare the constructor and its fields directly in the class header. They add no new semantics — just less boilerplate. Requires `environment: sdk: ^3.13.0`.
```dart
// Before
class Point {
  final int x;
  final int y;
  const Point(this.x, this.y);
}

// With a primary constructor: `var`/`final` parameters become fields
class Point(var int x, var int y);
```
Dart 3.13 also allows `new` in place of the class name to declare a (non-factory) constructor in the body, and `factory` alone for a factory constructor. A class with a primary constructor cannot have other *non-redirecting generative* constructors.
> Because this is very new, most existing codebases (and interview code) still use classic constructors. Check the official Dart docs for the exact syntax variants (named/optional parameters, `const`, initializer bodies) before adopting team-wide.

---

## 4.3 Inheritance — `extends`

```dart
class Animal {
  void speak() => print('...');
}
class Dog extends Animal {
  @override
  void speak() {
    super.speak();          // call parent
    print('Woof');
  }
}
```
* Dart has **single inheritance** (one superclass).
* Every class implicitly extends `Object`.
* `@override` annotation documents and lets the analyzer check that you're overriding.
* Constructors are **not** inherited.

### Polymorphism
```dart
final List<Animal> zoo = [Dog(), Cat()];
for (final a in zoo) a.speak();   // each calls its own version
```

---

## 4.4 Abstract classes & interfaces

### Abstract class
Can't be instantiated; may contain abstract methods (no body) and concrete methods.
```dart
abstract class Repository {
  Future<List<String>> fetchAll();        // abstract
  void log(String m) => print('[repo] $m'); // concrete
}
```

### Implicit interfaces — every class is an interface!
In Dart there is (traditionally) **no `interface` keyword**. Every class defines an interface. With `implements`, you must implement **all** members (no code inherited):
```dart
class FakeRepository implements Repository {
  @override
  Future<List<String>> fetchAll() async => ['a', 'b'];
  @override
  void log(String m) {}     // must implement this too
}
```
Since Dart 3, you can write `interface class` / `abstract interface class` to control this explicitly (see 4.9).

### `extends` vs `implements` vs `with` (very common question)
| | `extends` | `implements` | `with` |
|---|---|---|---|
| How many | one | many | many |
| Inherits code | ✅ | ❌ (must implement everything) | ✅ (mixin code copied in) |
| Calls `super` | ✅ | ❌ | ✅ (to the class before it in chain) |
| Relationship | "is-a" | "can act like / contract" | "has capability" |

---

## 4.5 Mixins — sticker packs 🏷️

**5-year-old version:** A mixin is a **sticker pack of abilities**. You can stick "CanSwim" and "CanFly" on a Duck. The Duck gets those abilities without being *born from* a Swimmer.

```dart
mixin CanSwim {
  void swim() => print('Swimming');
}
mixin CanFly {
  int altitude = 0;           // mixins can have state
  void fly() => print('Flying at $altitude');
}
class Duck extends Animal with CanSwim, CanFly {}
Duck()..swim()..fly();
```

### Restricting a mixin with `on`
```dart
mixin Logging on State {           // only classes that extend State can use it
  void log(String msg) => debugPrint('${widget.runtimeType}: $msg');
}
```

### Flutter's famous mixins
* `SingleTickerProviderStateMixin` / `TickerProviderStateMixin` — provide `vsync` for `AnimationController`.
* `AutomaticKeepAliveClientMixin` — keep list item state alive when scrolled away.
* `WidgetsBindingObserver` — app lifecycle (it's an abstract mixin class).
* `RestorationMixin` — state restoration.
* `ChangeNotifier` can be used as a mixin (`with ChangeNotifier`).

### Linearization (order matters!)
`class C extends A with M1, M2` builds a chain: `A → A+M1 → A+M1+M2 → C`. If M1 and M2 both define `hello()`, **the last one (M2) wins**, and `super.hello()` in M2 calls M1's.
```dart
mixin A { String hi() => 'A'; }
mixin B { String hi() => 'B'; }
class X with A, B {}
print(X().hi()); // B
```

### Mixin vs abstract class
* Mixins can't have generative constructors.
* Since Dart 3, a class can't be used as a mixin unless declared `mixin` or `mixin class`.

---

## 4.6 Extension methods — adding new tricks to old toys 🧸

Add methods to existing types (even ones you don't own) without subclassing:
```dart
extension StringX on String {
  String get capitalized =>
      isEmpty ? this : '${this[0].toUpperCase()}${substring(1)}';
  bool get isValidEmail => RegExp(r'^[^@\s]+@[^@\s]+\.[^@\s]+$').hasMatch(this);
}

extension ContextX on BuildContext {
  ThemeData get theme => Theme.of(this);
  Size get screenSize => MediaQuery.sizeOf(this);
  void showSnack(String msg) =>
      ScaffoldMessenger.of(this).showSnackBar(SnackBar(content: Text(msg)));
}

print('hello'.capitalized);   // Hello
context.showSnack('Saved!');
```
⚠️ Extensions are resolved **statically** (by the declared type) — they don't work on `dynamic` and can't be overridden polymorphically.

---

## 4.7 Enums

### Simple enum
```dart
enum Status { idle, loading, success, error }
final s = Status.loading;
print(s.name);         // "loading"
print(s.index);        // 1
print(Status.values);  // [Status.idle, ...]
Status.values.byName('error'); // Status.error (throws if not found)
```

### Enhanced enums (Dart 2.17+) — fields, constructors, methods, interfaces
```dart
enum Planet implements Comparable<Planet> {
  mercury(mass: 3.303e+23, radius: 2.4397e6),
  earth(mass: 5.976e+24, radius: 6.37814e6);

  const Planet({required this.mass, required this.radius});
  final double mass;
  final double radius;

  double get surfaceGravity => 6.67300E-11 * mass / (radius * radius);

  @override
  int compareTo(Planet other) => mass.compareTo(other.mass);
}

enum HttpStatus {
  ok(200), notFound(404), serverError(500);
  const HttpStatus(this.code);
  final int code;
  static HttpStatus fromCode(int c) => values.firstWhere((e) => e.code == c);
}
```
Enums work great with `switch` — the compiler checks **exhaustiveness** (forget a case → error).

### Dot shorthands (Dart 3.10+)
When the type is known from context, you can omit it:
```dart
Status s = .loading;              // instead of Status.loading
Column(
  mainAxisAlignment: .center,     // instead of MainAxisAlignment.center
  crossAxisAlignment: .start,
  children: [...],
);
switch (s) {
  case .idle: ...
  case .loading: ...
  // ...
}
EdgeInsets padding = .all(16);    // static members & constructors too
```
Requires `sdk: ^3.10.0`. Older code uses the full names — both are valid.

---

## 4.8 Generics — boxes that say what's inside 🎁

**5-year-old version:** A generic is a box with a **label slot**: `Box<Apple>` only holds apples, `Box<Toy>` only toys. Same box design, safe contents.

```dart
class Box<T> {
  final T value;
  Box(this.value);
  T open() => value;
}
final b = Box<int>(5);
final c = Box('hi');           // T inferred as String

T firstOrDefault<T>(List<T> items, T fallback) =>
    items.isEmpty ? fallback : items.first;

// Bounded generics
class NumberBox<T extends num> {
  final T value;
  NumberBox(this.value);
  T doubleIt() => (value * 2) as T;
}

// Generic result type used in real apps:
sealed class Result<T> {
  const Result();
}
final class Ok<T> extends Result<T> {
  final T data;
  const Ok(this.data);
}
final class Err<T> extends Result<T> {
  final Object error;
  const Err(this.error);
}
```
Dart generics are **reified** — type info is kept at runtime (`list is List<int>` works), unlike Java's erasure.

**Covariance gotcha:** Dart's generic classes are covariant: a `List<int>` *is a* `List<Object>`. This can cause runtime errors:
```dart
List<Object> objs = <int>[1, 2];
objs.add('x');  // compiles, but throws TypeError at runtime!
```

---

## 4.9 Class modifiers (Dart 3) — `abstract`, `base`, `interface`, `final`, `sealed`, `mixin`

Dart 3 added modifiers controlling how a class can be used **outside its library**:

| Declaration | Construct? | Extend outside lib? | Implement outside lib? | Mix in? | Exhaustive switch? |
|---|---|---|---|---|---|
| `class` | ✅ | ✅ | ✅ | ❌ | ❌ |
| `base class` | ✅ | ✅ (subclasses must be base/final/sealed) | ❌ | ❌ | ❌ |
| `interface class` | ✅ | ❌ | ✅ | ❌ | ❌ |
| `final class` | ✅ | ❌ | ❌ | ❌ | ❌ |
| `sealed class` | ❌ (implicitly abstract) | ❌ | ❌ | ❌ | ✅ |
| `abstract class` | ❌ | ✅ | ✅ | ❌ | ❌ |
| `abstract interface class` | ❌ | ❌ | ✅ | ❌ | ❌ | ← like a pure interface |
| `mixin` | ❌ | ❌ | ✅ | ✅ | ❌ |
| `mixin class` | ✅ | ✅ | ✅ | ✅ | ❌ |

Inside the **same library** (file), these restrictions don't apply.

### Sealed classes — the "closed family" 👨‍👩‍👧
A `sealed` class's direct subtypes must all be in the **same library**. So the compiler **knows all possible subtypes** and can check that a `switch` handles every one:
```dart
sealed class AuthState {}
class AuthInitial extends AuthState {}
class AuthLoading extends AuthState {}
class AuthSuccess extends AuthState { final User user; AuthSuccess(this.user); }
class AuthFailure extends AuthState { final String message; AuthFailure(this.message); }

Widget build(BuildContext context) {
  final state = ...;
  return switch (state) {
    AuthInitial() => const LoginForm(),
    AuthLoading() => const CircularProgressIndicator(),
    AuthSuccess(:final user) => HomePage(user: user),
    AuthFailure(:final message) => ErrorView(message),
    // No default needed; add a new subclass → compiler errors here until handled ✅
  };
}
```
This is the modern replacement for many `freezed` union types and is widely used for Bloc states, API results, and navigation events.

---

## 4.10 Records (Dart 3) — anonymous mini-objects

A **record** is a lightweight, immutable, **anonymous** bundle of values — like a tuple.
```dart
(String, int) getUser() => ('Asha', 30);         // positional
({String name, int age}) getUser2() => (name: 'Asha', age: 30); // named

final user = getUser();
print(user.$1);  // Asha  ($1, $2 for positional fields)
print(user.$2);  // 30
final u2 = getUser2();
print(u2.name);

// Destructuring with patterns
final (name, age) = getUser();
final (:name, :age) = getUser2();   // shorthand for (name: name, age: age)

// Records have structural value equality
print((1, 'a') == (1, 'a')); // true

// Swap
var a = 1, b = 2;
(a, b) = (b, a);
```
Use records for **returning multiple values** from functions; use classes when the data has behaviour or is passed widely.

---

## 4.11 Patterns (Dart 3) — shape-matching 🔍

Patterns let you **check the shape of a value and pull out pieces** at the same time.

### Pattern kinds
| Pattern | Example |
|---|---|
| Constant | `case 404:` |
| Variable / wildcard | `case var x:` / `_` |
| Relational | `case >= 200 && < 300:` |
| Logical or / and | `case 'y' \|\| 'yes':` / `case > 0 && < 10:` |
| Null-check | `case final v?:` (match if non-null, bind) |
| Null-assert | `case final v!:` (throw if null) |
| Cast | `case final n as int:` |
| List | `case [first, ...rest]:` / `case [_, _]:` |
| Map | `case {'type': 'user', 'id': int id}:` |
| Record | `case (int x, int y):` |
| Object | `case Point(x: 0, :final y):` |
| Parenthesized | `case (1 \|\| 2) && != 3:` |

### Where patterns appear
```dart
// 1. switch statements & expressions
String describe(Object o) => switch (o) {
      int n when n < 0 => 'negative int',     // `when` guard clause
      int() => 'int',
      String s when s.isEmpty => 'empty string',
      String() => 'string',
      [] => 'empty list',
      [final first, ...] => 'list starting with $first',
      {'name': String name} => 'map with name $name',
      (int a, int b) => 'pair $a,$b',
      _ => 'something else',
    };

// 2. if-case
final json = {'user': {'name': 'Ravi', 'age': 30}};
if (json case {'user': {'name': String name, 'age': int age}}) {
  print('$name is $age');      // safe JSON validation + extraction in one go!
}

// 3. variable declarations / destructuring
final [a, b, c] = [1, 2, 3];
final Point(:x, :y) = point;

// 4. for-in loops
for (final (index, item) in items.indexed) { print('$index: $item'); }
```

### Exhaustiveness
`switch` **expressions** must be exhaustive. With `bool`, enums, sealed types and nullable types, the compiler can verify completeness. Statement switches over these types are also checked.

---

## 4.12 Extension types (Dart 3.3+) — zero-cost wrappers

An **extension type** wraps an existing type with a **new static type** and a different API, with **no runtime cost** (it's erased at runtime).
```dart
extension type UserId(String value) {
  bool get isValid => value.startsWith('usr_');
}
extension type Meters(double value) {
  Meters operator +(Meters other) => Meters(value + other.value);
}

void loadUser(UserId id) {}
loadUser(UserId('usr_1'));   // ✅
// loadUser('usr_1');        // ❌ compile error — prevents mixing up IDs
```
Uses: type-safe IDs, units, and **JS interop** (`dart:js_interop` uses extension types heavily for web). Caveat: since it's erased at runtime, `is UserId` checks the underlying type — it's a static-only safety net.

---

## 4.13 Equality & hashCode — value objects

By default, `==` compares **identity**. For data classes compare **values**:
```dart
class User {
  final String id;
  final String name;
  const User(this.id, this.name);

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is User && other.id == id && other.name == name;

  @override
  int get hashCode => Object.hash(id, name);   // Object.hashAll(list) for lists
}
```
**Rule:** if you override `==`, you **must** override `hashCode` consistently (equal objects ⇒ equal hash codes) — otherwise `Set`/`Map` break.

Writing this by hand is error-prone. Teams use:
* **`equatable`** — extend `Equatable`, list `props`.
* **`freezed`** — code generation of `==`, `hashCode`, `copyWith`, `toString`, JSON, unions.
* **records** — have built-in structural equality.
* Data class macros were planned but **the Dart team cancelled macros in January 2025**; code generation (`build_runner`) remains the standard. (Interviewers sometimes ask — know that it was cancelled.)

### `copyWith` pattern (immutable updates)
```dart
class Todo {
  final String title;
  final bool done;
  const Todo({required this.title, this.done = false});

  Todo copyWith({String? title, bool? done}) =>
      Todo(title: title ?? this.title, done: done ?? this.done);
}
final t2 = t1.copyWith(done: true);
```
⚠️ Gotcha: with `??` you can't set a nullable field *back to null*. Freezed handles that; manually you can use a sentinel or `ValueGetter<T?>? field` parameter.

---

## 4.14 Static members, operators, callable classes, `noSuchMethod`

```dart
class MathUtils {
  static const double pi = 3.14159;
  static int square(int x) => x * x;
}
MathUtils.square(3);

class Vector {
  final double x, y;
  const Vector(this.x, this.y);
  Vector operator +(Vector o) => Vector(x + o.x, y + o.y);
  Vector operator -() => Vector(-x, -y);
  double operator [](int i) => i == 0 ? x : y;
}

class Multiplier {
  final int factor;
  Multiplier(this.factor);
  int call(int x) => x * factor;   // callable object
}
final triple = Multiplier(3);
print(triple(5)); // 15
```

---

## 4.15 Composition over inheritance (Flutter's philosophy)
Flutter widgets are built by **composing** small widgets rather than subclassing big ones. You don't extend `ElevatedButton` to make a "PrimaryButton" — you create a new `StatelessWidget` that *returns* a configured `ElevatedButton`. Interviewers ask "why does Flutter prefer composition?" → flexibility, smaller units, easier reuse, avoids fragile base class problems, deep hierarchies.

---

## 4.16 Interview Questions — Dart OOP & modern features

**Q1. Does Dart support multiple inheritance?** No — single inheritance via `extends`; but a class can `implement` multiple interfaces and use multiple mixins (`with`).

**Q2. What is a mixin? How is it different from inheritance and interfaces?** A mixin is a reusable chunk of class members that can be "mixed into" multiple class hierarchies with `with`. Unlike `extends` you can apply many; unlike `implements` you get the implementation. Restrict with `on`. Order matters (last wins).

**Q3. What is a factory constructor? Give use cases.** A constructor that may return an existing instance or a subtype instead of always creating a new one: singletons, caches, `fromJson`, choosing implementation subclasses.

**Q4. What's the difference between `extends` and `implements`?** `extends` inherits implementation (single); `implements` only adopts the interface and requires implementing all members (multiple allowed).

**Q5. What are extension methods?** Statically-resolved methods added to existing types without modifying/subclassing them.

**Q6. What are sealed classes and why are they useful?** Classes whose direct subtypes are all declared in the same library, allowing the compiler to check exhaustive switches over them; great for modelling states, events, results.

**Q7. What are records?** Immutable, anonymous, fixed-size aggregates with positional and/or named fields and structural equality; useful for multiple return values.

**Q8. What are patterns?** Syntax for matching values against shapes (constants, types, lists, maps, records, objects, relational/logical operators) and destructuring them, usable in switch, if-case, declarations and loops.

**Q9. What is an extension type?** A compile-time-only wrapper giving a new static type and interface to an existing representation type with zero runtime overhead.

**Q10. Difference between `abstract class` and `interface class`?** Abstract can't be instantiated but can be extended and implemented. `interface class` can be instantiated and implemented but not extended outside its library. `abstract interface class` = pure interface.

**Q11. What does `base` / `final` class modifier do?** `base`: can be extended but not implemented outside the library (guarantees inherited implementation). `final`: neither extended nor implemented outside the library.

**Q12. Why must `hashCode` be overridden with `==`?** Hash-based collections use hashCode to find buckets; equal objects with different hash codes break Set/Map lookups.

**Q13. Why use `const` constructors?** Compile-time canonical instances, less memory/GC, and Flutter can skip rebuilding identical const widget subtrees.

**Q14. What are named constructors and why does Dart need them?** Dart lacks overloading; named constructors (`Point.origin()`) provide multiple ways to construct with clear names.

**Q15. What are super parameters?** `super.x` in constructor parameters forwards to the superclass constructor, e.g., `const MyWidget({super.key})`.

**Q16. What's an initializer list?** Code after `:` in a constructor that runs before the body, used for initializing final fields, asserts and calling super/redirecting.

**Q17. What are generics, and are Dart generics reified?** Parameterised types for type-safe reuse; yes, Dart keeps type arguments at runtime.

**Q18. What happened to Dart macros?** They were an experimental metaprogramming feature (e.g., `@JsonCodable`); the Dart team stopped work on them in early 2025, focusing instead on improving code generation (build_runner speed) and smaller language features like augmentations-related improvements, dot shorthands and primary constructors.

**Q19. What are dot shorthands?** Dart 3.10 syntax allowing `.value` instead of `Type.value` where the type is inferable from context — e.g., `mainAxisAlignment: .center`.

**Q20. Explain `mixin class`.** A declaration usable both as a regular class (instantiate/extend) and as a mixin; required in Dart 3 if you want both behaviours.
