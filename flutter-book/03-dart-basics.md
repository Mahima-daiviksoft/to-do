# Chapter 3 — Dart Language, Part 1: The Basics

> **Goal:** Learn Dart from zero: variables, types, null safety, operators, control flow, functions and collections. Every Flutter interview has Dart questions — `final` vs `const`, null safety, `late`, `dynamic` vs `var` vs `Object` — so read carefully.

You can try every example at **dartpad.dev** without installing anything.

---

## 3.1 Hello Dart

```dart
void main() {
  print('Hello, Dart!');
}
```
* `main()` is the entry point.
* `void` means it returns nothing.
* Statements end with `;`.
* `print()` writes to the console. (In Flutter apps prefer `debugPrint()` or a logger — `print` is flagged by the `avoid_print` lint.)

Comments:
```dart
// single line
/* multi
   line */
/// Documentation comment — shows up in IDE hover & dart doc.
/// Use [ClassName] to link.
```

---

## 3.2 Variables — boxes with labels 📦

A **variable** is a labelled box that holds a value.

```dart
var name = 'Asha';        // type inferred as String
String city = 'Pune';     // explicit type
int age = 25;
double height = 5.6;
bool isStudent = true;
```

### 3.2.1 `var`, `final`, `const`, `late`, `dynamic`, `Object`

| Keyword | Can reassign? | When value is known | Example |
|---|---|---|---|
| `var` | ✅ yes | runtime | `var x = 1; x = 2;` |
| `final` | ❌ no (set once) | **runtime** | `final now = DateTime.now();` |
| `const` | ❌ no | **compile time** | `const pi = 3.14159;` |
| `late` | depends (`late final` = once) | initialised **later**, lazily | `late final String token;` |
| `dynamic` | ✅ and type can change; **no static checks** | runtime | `dynamic d = 1; d = 'hi'; d.foo(); // compiles, crashes at runtime` |
| `Object` / `Object?` | ✅ yes, any type, but **type-checked** | runtime | `Object o = 1; o.foo(); // compile error` |

#### `final` vs `const` — the most asked Dart question
**5-year-old version:**
* `const` is a toy that is **glued shut at the factory**. Before the shop even opens (compile time), everyone knows exactly what is inside, and **every identical const toy is literally the same toy** (shared in memory).
* `final` is a box you can **fill once when the shop is open** (runtime), then tape shut forever.

```dart
final time = DateTime.now();   // ✅ known at runtime
// const time = DateTime.now(); // ❌ error: not a compile-time constant

const list = [1, 2, 3];        // the list itself is deeply immutable
// list.add(4);                // ❌ runtime error: Unsupported operation: Cannot add to an unmodifiable list

final list2 = [1, 2, 3];       // the VARIABLE can't be reassigned...
list2.add(4);                  // ✅ ...but the list contents CAN change!
// list2 = [];                 // ❌ compile error
```

Key differences:
1. **Time:** `const` = compile-time constant; `final` = assigned once at runtime.
2. **Depth:** `const` makes the object **deeply/transitively immutable**; `final` only freezes the **reference**.
3. **Canonicalisation:** identical `const` expressions share **one instance** in memory:
   ```dart
   print(identical(const [1, 2], const [1, 2])); // true
   print(identical([1, 2], [1, 2]));             // false
   ```
4. **Instance fields:** instance fields can be `final`, not `const` (only `static const` fields allowed in classes).
5. **Flutter impact:** `const` widgets are created once and **reused**; when Flutter sees the *same instance* during rebuild it can skip rebuilding that subtree. That's why the linter suggests `prefer_const_constructors`.

#### `late`
Use `late` when:
1. A non-nullable variable will be initialised **after** declaration but **before** use (e.g., in `initState`).
2. You want **lazy initialisation** — the initialiser runs only when first read.

```dart
class _MyState extends State<MyWidget> {
  late final AnimationController controller; // set in initState

  @override
  void initState() {
    super.initState();
    controller = AnimationController(vsync: this, duration: const Duration(seconds: 1));
  }
}

late final config = loadHeavyConfig(); // runs only when first accessed
```
⚠️ If you read a `late` variable before it's set: `LateInitializationError: Field 'controller' has not been initialized.` If you assign a `late final` twice: `LateInitializationError: Field 'x' has already been initialized.`

#### `dynamic` vs `Object?` vs `var`
* `var` is **not a type**; it just means "infer the type". `var x = 1;` → `x` is `int` forever. `var x;` (no initializer) → `dynamic`.
* `dynamic` **turns off** the type checker. Any method call compiles; errors happen at runtime (`NoSuchMethodError`).
* `Object?` accepts any value but you must **check/cast** before calling type-specific methods. Safer.

**Rule:** avoid `dynamic` except when dealing with JSON (`Map<String, dynamic>`) or interop.

---

## 3.3 Built-in types

### 3.3.1 Numbers
```dart
int a = 7;             // 64-bit integer on native; on web it's a JS number (53-bit precise)
double b = 3.5;        // 64-bit floating point (IEEE 754)
num c = 5;             // supertype of int and double
c = 5.5;               // allowed

print(7 / 2);   // 3.5   (/ always returns double)
print(7 ~/ 2);  // 3     (integer division)
print(7 % 2);   // 1     (remainder)
print(-7 % 2);  // 1     (Dart % is always non-negative for positive divisor)
print((-7).remainder(2)); // -1 (sign follows the dividend)

print(int.parse('42'));          // 42
print(int.tryParse('abc'));      // null (safe)
print(double.parse('3.14'));
print(3.14159.toStringAsFixed(2)); // "3.14"
print(10.clamp(0, 5));           // 5
print(0.1 + 0.2);                // 0.30000000000000004 (floating point!)
```
💰 **Money tip:** never use `double` for money in real apps → use integer cents (`int`) or a decimal package (`decimal`).

### 3.3.2 Strings
```dart
var s1 = 'single';
var s2 = "double";
var multi = '''
Line 1
Line 2''';
var raw = r'C:\path\no\escape';     // raw string
var name = 'Ravi';
print('Hi $name, length ${name.length}'); // interpolation
print('a' + 'b');                // concatenation (prefer interpolation)
print('abc' * 2);                // abcabc

// Useful methods
'Hello'.toUpperCase();  'Hello'.toLowerCase();
'  hi  '.trim();        'a,b,c'.split(',');      // [a, b, c]
'hello'.contains('ell'); 'hello'.startsWith('he');
'hello'.replaceAll('l', 'L');  'hello'.substring(1, 3); // "el"
'hello'.indexOf('l');   // 2
'5'.padLeft(3, '0');    // "005"
```
Strings are **immutable** and **UTF-16** encoded. For user-perceived characters (emoji, accents) use the `characters` package (`'👨‍👩‍👧'.characters.length == 1`).

`StringBuffer` for building big strings efficiently:
```dart
final sb = StringBuffer();
for (var i = 0; i < 3; i++) { sb.write(i); }
print(sb.toString()); // 012
```

### 3.3.3 Booleans
Only `true` and `false`. Dart does **not** have "truthy" values: `if (1)` or `if (list)` is a **compile error**. Use `if (list.isNotEmpty)`.

### 3.3.4 Other core types
* `List`, `Set`, `Map` (section 3.8), `Iterable`.
* `Runes` (Unicode code points), `Symbol` (`#foo`), `Null`, `Never` (a function that never returns: always throws/loops), `void`, `Record` (Chapter 4), `Function`, `Future`/`Stream` (Chapter 5), `DateTime`, `Duration`, `Uri`, `RegExp`, `BigInt`.

```dart
final now = DateTime.now();
final tomorrow = now.add(const Duration(days: 1));
print(tomorrow.difference(now).inHours); // 24
final utc = DateTime.utc(2025, 1, 31);
final parsed = DateTime.parse('2025-01-31T10:00:00Z');
print(parsed.isUtc);              // true
print(parsed.toLocal());
```

---

## 3.4 Null safety — the seat belt 🚗

Since Dart 2.12 (and **mandatory** since Dart 3.0), Dart has **sound null safety**.

**5-year-old version:** Before null safety, any box could secretly be **empty**, and when you reached in to grab the toy — 💥 crash ("null pointer exception"). Now each box has a label: **"always has a toy"** (`String`) or **"might be empty"** (`String?`). The compiler won't let you grab from a "might be empty" box without checking first.

```dart
String name = 'Ana';     // can NEVER be null
String? nickname;        // may be null (defaults to null)

// print(nickname.length);    // ❌ compile error
print(nickname?.length);      // ✅ null-aware access → prints null
print(nickname ?? 'none');    // ✅ if-null operator → 'none'
nickname ??= 'Annie';         // assign only if null
print(nickname!.length);      // ✅ "bang" — I PROMISE it's not null (throws if it is!)
```

### 3.4.1 Null-aware operators (memorise)
| Operator | Name | Meaning |
|---|---|---|
| `?` in type | nullable type | `int?` may be null |
| `?.` | null-aware access | call only if not null, else null |
| `??` | if-null | left if not null, else right |
| `??=` | null-aware assignment | assign if currently null |
| `!` | null assertion ("bang") | cast away nullability; throws `TypeError` if null |
| `?..` | null-aware cascade | `obj?..a()..b()` |
| `...?` | null-aware spread | `[...?maybeList]` |
| `?[` | null-aware index | `list?[0]` |
| `?` element (Dart 3.8+) | null-aware collection element | `[?maybeItem]` adds only if non-null; `{?key: value}` |

```dart
String? maybe = getValue();
final items = [1, 2, ?maybeInt];           // Dart 3.8+: adds maybeInt only if non-null
final map = {'a': 1, if (maybe != null) 'b': maybe}; // older equivalent using collection-if
```

### 3.4.2 Type promotion (flow analysis)
Dart is smart: after a null check, the variable is **promoted** to non-null.
```dart
void greet(String? name) {
  if (name == null) return;
  print(name.length);   // ✅ name is promoted to String
}
```
⚠️ **Promotion does NOT work on (non-private or non-final) fields** because another piece of code (or a getter override) could change them between the check and the use:
```dart
class User {
  String? email;
  void send() {
    if (email != null) {
      // print(email.length); // ❌ error: 'email' is a public field, can't promote
      final e = email;        // ✅ copy to local variable
      if (e != null) print(e.length);
    }
  }
}
```
Since Dart 3.2, **private final fields** *can* be promoted (`final String? _email;`).

### 3.4.3 Why avoid `!`
`!` is a promise to the compiler. Break the promise → runtime crash (`Null check operator used on a null value` — one of the most common Flutter crash messages in Crashlytics!). Prefer:
* `if (x != null)` / local variable promotion
* `??` defaults
* pattern matching: `if (x case final value?) { ... }`

### 3.4.4 `required` named parameters
```dart
void createUser({required String name, int? age, String country = 'IN'}) {}
```

---

## 3.5 Operators

```dart
// Arithmetic
+  -  *  /  ~/  %  -expr   ++  --
// Equality & relational
==  !=  >  <  >=  <=
// Type test
is  is!  as
// Logical
&&  ||  !
// Bitwise
&  |  ^  ~  <<  >>  >>>
// Assignment
=  +=  -=  *=  /=  ~/=  %=  ??=  &=  |=  ^=  <<=  >>=
// Conditional
cond ? a : b      a ?? b
// Cascade
..   ?..
// Spread
...  ...?
```

### Cascade `..` — "and also do this to the same object"
```dart
final paint = Paint()
  ..color = Colors.red
  ..strokeWidth = 4
  ..style = PaintingStyle.stroke;
// Equivalent to creating paint, then setting 3 properties, then returning paint.

final list = <int>[]..add(1)..add(2); // [1, 2]
```

### `is`, `as`
```dart
Object x = 'hello';
if (x is String) print(x.toUpperCase()); // promoted
final s = x as String;  // cast; throws TypeError if wrong
```

### `==` vs `identical()`
* `==` → **equality**, can be overridden (value equality).
* `identical(a, b)` → **same object in memory** (reference equality).

---

## 3.6 Control flow

```dart
// if / else
if (score >= 90) {
  grade = 'A';
} else if (score >= 75) {
  grade = 'B';
} else {
  grade = 'C';
}

// for
for (var i = 0; i < 5; i++) { print(i); }
// for-in
for (final fruit in ['apple', 'mango']) { print(fruit); }
// forEach (don't use with async callbacks!)
[1, 2, 3].forEach(print);
// while / do-while
while (n > 0) { n--; }
do { n++; } while (n < 3);
// break / continue / labels
outer:
for (var i = 0; i < 3; i++) {
  for (var j = 0; j < 3; j++) {
    if (j == 1) continue outer;
    if (i == 2) break outer;
  }
}
```

### Switch (Dart 3 — powerful!)
Old style statement (no fall-through needed for non-empty cases since Dart 3 — `break` is optional):
```dart
switch (command) {
  case 'open':
    open();
  case 'close' || 'exit':   // logical-or pattern
    close();
  default:
    unknown();
}
```
**Switch expression** (returns a value):
```dart
final label = switch (statusCode) {
  200 => 'OK',
  404 => 'Not found',
  >= 500 && < 600 => 'Server error',   // relational patterns
  _ => 'Other',                          // wildcard = default
};
```
Patterns are covered fully in Chapter 4.

### Collection if / for (super useful in Flutter widget lists!)
```dart
final isAdmin = true;
final menu = [
  'Home',
  'Profile',
  if (isAdmin) 'Admin Panel',
  for (final n in [1, 2]) 'Item $n',
];
// ['Home', 'Profile', 'Admin Panel', 'Item 1', 'Item 2']

Column(children: [
  const Text('Title'),
  if (loading) const CircularProgressIndicator() else const Text('Done'),
  ...items.map((e) => Text(e)),
]);
```

### Assert
```dart
assert(age >= 0, 'Age must be non-negative');
```
Runs **only in debug mode** (stripped from release). Flutter framework uses many asserts to give helpful debug errors.

---

## 3.7 Functions

### 3.7.1 Basics
```dart
int add(int a, int b) {
  return a + b;
}
int multiply(int a, int b) => a * b;   // arrow syntax for a single expression
```
Every function returns something; if no return statement, it returns `null` (with return type `void`/`dynamic`).

### 3.7.2 Parameters
```dart
// Positional required
void a(int x, int y) {}

// Optional positional — in []
void b(int x, [int y = 0, int? z]) {}
b(1); b(1, 2); b(1, 2, 3);

// Named — in {} ; optional by default; use `required` or defaults
void c({required String name, int age = 0, String? email}) {}
c(name: 'A', email: 'x@y.com');

// Mixed: positional first, then named
void d(int id, {bool verbose = false}) {}
```
You can't mix `[]` and `{}` in the same function.

Since Dart 2.17, **named arguments can appear anywhere** in the call:
```dart
d(verbose: true, 42);  // allowed
```

### 3.7.3 Functions are first-class objects
```dart
int square(int x) => x * x;
final f = square;              // store in a variable
print([1, 2, 3].map(square));  // pass as argument

void runTwice(void Function() action) { action(); action(); }
runTwice(() => print('hi'));   // anonymous function (lambda/closure)

typedef Compare = int Function(int a, int b);   // type alias
Compare desc = (a, b) => b - a;
```

### 3.7.4 Closures — functions that remember 🧠
A closure "captures" variables from the scope where it was created:
```dart
Function makeCounter() {
  var count = 0;
  return () => ++count;   // remembers `count`
}
final counter = makeCounter();
print(counter()); // 1
print(counter()); // 2
```
Flutter callbacks like `onPressed: () => setState(() => _count++)` are closures capturing `this` and fields.

⚠️ Closure capture in loops:
```dart
final callbacks = <void Function()>[];
for (var i = 0; i < 3; i++) {
  callbacks.add(() => print(i));
}
for (final c in callbacks) c();  // prints 0, 1, 2 (Dart creates a fresh `i` per iteration — unlike old JS `var`)
```

### 3.7.5 Lexical scope
Variables are visible inside the `{}` block where they are declared and nested blocks.

### 3.7.6 Getters & setters, tear-offs
```dart
class Rect {
  double width, height;
  Rect(this.width, this.height);
  double get area => width * height;     // getter
  set side(double v) { width = v; height = v; } // setter
}
// Tear-off: referencing a method/constructor without calling it
final parse = int.parse;               // method tear-off
final makeList = List<int>.empty;      // constructor tear-off (Dart 2.15+)
['1','2'].map(int.parse).toList();
```

### 3.7.7 Wildcard variables (Dart 3.7+)
`_` is now a non-binding wildcard; multiple `_` parameters are allowed:
```dart
list.forEach((_) => count++);
builder: (_, _, child) => child!,   // multiple wildcards allowed in Dart 3.7+
```

---

## 3.8 Collections — List, Set, Map, Iterable

### 3.8.1 List (ordered, allows duplicates, indexed)
```dart
final nums = <int>[3, 1, 2];
nums.add(4);                 // [3,1,2,4]
nums.addAll([5, 6]);
nums.insert(0, 0);
nums.remove(1);              // removes first occurrence of value 1
nums.removeAt(0);
nums.removeWhere((n) => n.isEven);
nums.sort();                 // in place
nums.sort((a, b) => b.compareTo(a)); // descending
print(nums.first); print(nums.last); print(nums.length);
print(nums.isEmpty); print(nums.isNotEmpty);
print(nums.contains(3)); print(nums.indexOf(3));
print(nums.reversed.toList());
print(nums.sublist(0, 2));

// Fixed-length & filled
final zeros = List.filled(3, 0);          // [0,0,0] — fixed length!
final gen = List.generate(5, (i) => i * i); // [0,1,4,9,16]
final copy = List.of(nums);               // shallow copy
final unmod = List.unmodifiable(nums);
```
⚠️ **`List.filled` with objects shares the same instance**:
```dart
final grid = List.filled(3, <int>[]);   // all 3 rows are THE SAME list!
grid[0].add(1);
print(grid); // [[1], [1], [1]]  😱
final ok = List.generate(3, (_) => <int>[]); // ✅ separate lists
```

### 3.8.2 Set (unique items, unordered conceptually — default LinkedHashSet keeps insertion order)
```dart
final ids = <int>{1, 2, 3};
ids.add(2);                 // no duplicate
print(ids.contains(2));     // fast O(1)
final a = {1, 2, 3}, b = {2, 3, 4};
print(a.union(b));          // {1,2,3,4}
print(a.intersection(b));   // {2,3}
print(a.difference(b));     // {1}
final unique = [1, 1, 2].toSet().toList(); // dedupe
```
⚠️ `{}` alone is a **Map**, not a Set. Empty set: `<int>{}`.

### 3.8.3 Map (key → value)
```dart
final ages = <String, int>{'ann': 30, 'bob': 25};
ages['cat'] = 22;
print(ages['ann']);              // 30
print(ages['zzz']);              // null (lookup returns V?)
ages.putIfAbsent('dan', () => 40);
ages.update('ann', (v) => v + 1, ifAbsent: () => 0);
ages.remove('bob');
print(ages.containsKey('ann'));
print(ages.keys); print(ages.values);
for (final MapEntry(:key, :value) in ages.entries) {  // pattern destructuring (Dart 3)
  print('$key = $value');
}
ages.forEach((k, v) => print('$k:$v'));
final upper = ages.map((k, v) => MapEntry(k.toUpperCase(), v));
```
Variants: `HashMap` (no order), `LinkedHashMap` (insertion order — default `{}`), `SplayTreeMap` (sorted by key).

### 3.8.4 Iterable & functional methods
`List` and `Set` are `Iterable`s. Most functional methods return **lazy** Iterables (computed only when iterated!).
```dart
final nums = [1, 2, 3, 4, 5];
nums.map((n) => n * 2);               // (2,4,6,8,10) — lazy Iterable!
nums.where((n) => n.isOdd);           // filter
nums.firstWhere((n) => n > 3);        // 4 (throws StateError if none)
nums.firstWhere((n) => n > 9, orElse: () => -1);
nums.any((n) => n > 4);               // true
nums.every((n) => n > 0);             // true
nums.reduce((a, b) => a + b);         // 15 (throws on empty list)
nums.fold<int>(0, (sum, n) => sum + n); // 15 (safe for empty)
nums.take(2); nums.skip(2);
nums.takeWhile((n) => n < 3);
nums.expand((n) => [n, n]);           // flatMap
nums.join(', ');                      // "1, 2, 3, 4, 5"
nums.whereType<int>();
nums.indexed;                          // Dart 3: (0,1),(1,2)... records
```
From `package:collection` (official, very common):
```dart
import 'package:collection/collection.dart';
nums.firstWhereOrNull((n) => n > 9);   // null instead of throwing
nums.groupListsBy((n) => n.isEven);    // {false: [1,3,5], true: [2,4]}
nums.sum;  nums.average;  nums.max;
nums.sortedBy((n) => -n);
const ListEquality().equals([1,2], [1,2]); // true (deep equality)
```
Since Dart 3.0 the core libraries also provide `nums.firstOrNull`, `lastOrNull`, `singleOrNull`, `elementAtOrNull`, `indexed` and `nonNulls` as extension members on `Iterable` (no import needed).

#### ⚠️ Lazy iterable bug
```dart
var counter = 0;
final doubled = [1, 2, 3].map((n) { counter++; return n * 2; });
print(counter);         // 0 — nothing ran yet!
doubled.toList();
doubled.toList();
print(counter);         // 6 — ran twice!
```
**Fix:** call `.toList()` once and store it if you'll iterate multiple times. In Flutter, `children: items.map(...).toList()` (or spread `...items.map(...)`) is required because `children` expects a `List<Widget>`.

### 3.8.5 Spread operator
```dart
final a = [1, 2];
final b = [0, ...a, 3];        // [0,1,2,3]
List<int>? maybe;
final c = [...?maybe];         // [] if null
final merged = {...mapA, ...mapB}; // later keys win
```

### 3.8.6 Immutability helpers
```dart
final frozen = List.unmodifiable([1, 2]);
final view = UnmodifiableListView(myList); // dart:collection — read-only VIEW (changes in myList show through)
```

---

## 3.9 Exceptions & error handling

```dart
try {
  final n = int.parse('abc');
} on FormatException catch (e) {
  print('Bad number: ${e.message}');
} on Exception catch (e, stackTrace) {
  print('Some exception: $e\n$stackTrace');
} catch (e) {
  print('Anything else (including Errors): $e');
  rethrow;                    // re-throw preserving stack trace
} finally {
  print('always runs');
}

throw FormatException('Invalid');
throw ArgumentError.value(x, 'x', 'must be positive');
throw StateError('Not initialised');
throw UnimplementedError();
```

### `Exception` vs `Error` (interview favourite)
* **`Exception`** — expected, recoverable problems the program should handle (network down → `SocketException`, bad input → `FormatException`, `TimeoutException`).
* **`Error`** — **programmer bugs** that should not be caught normally; fix the code instead (`TypeError`, `RangeError`, `NoSuchMethodError`, `StateError`, `AssertionError`, `LateInitializationError`, `StackOverflowError`, `OutOfMemoryError`).

Custom exception:
```dart
class ApiException implements Exception {
  final int statusCode;
  final String message;
  const ApiException(this.statusCode, this.message);
  @override
  String toString() => 'ApiException($statusCode): $message';
}
```
You *can* throw any object (`throw 'oops';`) but **don't** — throw `Exception`/`Error` subtypes (lint: `only_throw_errors`).

---

## 3.10 Libraries, imports & visibility

```dart
import 'dart:math';                          // core library
import 'package:http/http.dart' as http;     // prefix to avoid name clashes
import 'package:my_app/utils.dart' show formatDate;   // only this name
import 'package:my_app/legacy.dart' hide OldThing;    // all except
import 'big_feature.dart' deferred as big;   // lazy load (web: code splitting)
await big.loadLibrary(); big.run();

export 'src/widgets.dart';                   // re-export (barrel files)
part 'user.g.dart';                          // code-gen part file
part of 'user.dart';                         // in the generated file
```
**Privacy:** Dart has **no `public/private/protected` keywords**. An identifier starting with `_` is **private to its library (file)** — not to its class! Two classes in the same file can see each other's `_fields`.

Common libraries: `dart:core` (auto-imported), `dart:async`, `dart:math`, `dart:convert` (JSON, UTF-8, base64), `dart:io` (files, sockets, HTTP — **not on web**), `dart:isolate`, `dart:typed_data`, `dart:collection`, `dart:ui` (Flutter engine), `dart:ffi`, `dart:js_interop` (web).

**Conditional imports** (to support web and mobile with different implementations):
```dart
import 'storage_stub.dart'
  if (dart.library.io) 'storage_io.dart'
  if (dart.library.js_interop) 'storage_web.dart';
```

---

## 3.11 Dart coding conventions (Effective Dart)
* `UpperCamelCase` for classes, enums, typedefs, extensions, type parameters.
* `lowerCamelCase` for variables, functions, parameters, named constants (`const defaultTimeout`, NOT `DEFAULT_TIMEOUT`).
* `lowercase_with_underscores` for file names, packages, directories, import prefixes.
* Prefer `final` for locals that don't change.
* Use `///` doc comments for public APIs.
* Format with `dart format` (since Dart 3.7 the formatter uses a new "tall" style and decides trailing commas itself, depending on your language version).
* Avoid `print`; prefer `debugPrint`/`log` from `dart:developer`/`package:logging`.

---

## 3.12 Common Dart bugs & fixes

| Bug | Cause | Fix |
|---|---|---|
| `Null check operator used on a null value` | `!` on null | Avoid `!`; check null; trace where value should be set |
| `type 'Null' is not a subtype of type 'String'` | JSON field missing/null cast to non-null | Use `String?` + defaults; validate JSON |
| `type 'List<dynamic>' is not a subtype of type 'List<String>'` | JSON decode gives `List<dynamic>` | `(json['tags'] as List).cast<String>()` or `List<String>.from(...)` or `.map((e) => e as String).toList()` |
| `_Map<String, dynamic>` not subtype of `Map<String, String>` | same | `Map<String, String>.from(json)` |
| `LateInitializationError` | read before set | initialise in `initState`, or make nullable |
| `RangeError (index)` | index out of bounds | check `length`, use `elementAtOrNull` |
| `Bad state: No element` | `first`/`firstWhere`/`single`/`reduce` on empty | use `firstOrNull`, `firstWhereOrNull`, `fold` |
| `Concurrent modification during iteration` | modifying list while looping | iterate a copy (`List.of(list)`) or use `removeWhere` |
| `Unsupported operation: Cannot add to an unmodifiable list` | mutating const / unmodifiable list | copy: `[...list, item]` or `List.of(list)` |
| `0.1 + 0.2 != 0.3` | floating point | compare with tolerance, use ints for money |
| `List.filled` shared objects | same instance | `List.generate` |

---

## 3.13 Interview Questions — Dart basics

**Q1. Difference between `final` and `const`?**
`final`: single assignment, value determined at runtime, only reference is immutable. `const`: compile-time constant, deeply immutable, canonicalised (identical consts share one instance). Instance fields can be `final` but not `const`. Const widgets help Flutter skip rebuilds.

**Q2. `var` vs `dynamic` vs `Object`?**
`var` infers a static type from the initializer (fixed afterwards). `dynamic` disables static type checking — any member access compiles and may fail at runtime. `Object` is the root type of non-nullable values; members other than Object's must be accessed after type checks/casts.

**Q3. What is null safety? What is "sound" null safety?**
Types are non-nullable by default; nullable types are marked `?`. "Sound" means the compiler *guarantees* a non-nullable variable can never be null at runtime (when all code is null-safe), allowing the compiler to optimise away null checks. Dart 3 requires 100% sound null safety.

**Q4. What does the `late` keyword do?**
Declares a non-nullable variable initialised later (runtime check on access) and/or makes the initialiser lazy. Throws `LateInitializationError` on read-before-write or double-write for `late final`.

**Q5. What is the `!` operator and its risk?**
Null assertion: casts `T?` to `T`, throwing at runtime if null. Overuse causes "Null check operator used on a null value" crashes.

**Q6. What is the difference between `??` and `?.`?**
`a ?? b` returns `a` if non-null else `b`. `a?.b` accesses `b` only if `a` is non-null, otherwise the whole expression is null.

**Q7. What are named vs positional parameters?**
Positional parameters are passed by position (`[]` makes them optional); named parameters `{}` are passed by name and are optional unless `required`. Named improve readability and are standard in Flutter widget constructors.

**Q8. What is a closure?**
A function object that captures variables from its enclosing lexical scope and can use them later even after the scope has ended.

**Q9. What's the difference between `Exception` and `Error`?**
Exceptions represent anticipated runtime failures meant to be caught; Errors represent programming bugs that generally shouldn't be caught.

**Q10. Difference between `==` and `identical`?**
`==` is overridable value equality; `identical` checks reference identity.

**Q11. What is the cascade operator?**
`..` performs a sequence of operations on the same object and returns the object, e.g., building `Paint()..color=..` .

**Q12. What is the spread operator?**
`...` inserts all elements of a collection into another collection literal; `...?` handles null.

**Q13. What are collection if/for?**
Conditionally or iteratively include elements inside list/set/map literals — used heavily to build widget children declaratively.

**Q14. Are `map`/`where` eager or lazy?**
Lazy; they return Iterables that compute on iteration. Iterating multiple times recomputes. Call `toList()` to materialise.

**Q15. How is privacy achieved in Dart?**
With a leading underscore — private to the library (file), not the class. `part` files share the same library privacy.

**Q16. What's the difference between `List.filled` and `List.generate`?**
`filled` puts the *same* value in every slot (dangerous for mutable objects) and is fixed-length by default; `generate` calls a function per index.

**Q17. What is `typedef`?**
A type alias, e.g., `typedef JsonMap = Map<String, dynamic>;` or function types `typedef Callback = void Function(int);`.

**Q18. What does `int ~/ int` do?** Integer (truncating) division.

**Q19. What happens if you `print` in release mode?** It still executes (prints to device log) — that's why `debugPrint`/loggers and `avoid_print` are preferred; `debugPrint` also throttles output to avoid Android log dropping. To fully remove logs in release, guard with `kDebugMode` or use a logger with levels.

**Q20. What is type promotion and why doesn't it work on public fields?**
Flow analysis narrows a variable's type after checks (`is`, `!= null`). Public or non-final fields could be overridden by a getter or modified between check and use, so they cannot be soundly promoted; copy to a local first (private final fields are promotable since Dart 3.2).
