# Chapter 5 — Asynchronous Dart: Event Loop, Futures, Streams, Isolates & Zones

> **Goal:** Truly understand how Dart does many things "at once" with one thread. This is one of the most heavily tested interview areas (event loop, microtasks, Future vs Stream, isolates, `compute`) and the source of many production bugs.

---

## 5.1 The 5-year-old story: one chef, many orders 👩‍🍳

Dart (per isolate) has **one chef** (one thread). The chef can only do one thing at a time. But when the chef puts a cake in the oven (a slow network request), they **don't stand and stare at the oven** — they write a sticky note "when oven beeps, take cake out" and go do other orders. When the oven beeps, the note goes into a **queue**, and the chef handles it when free.

* The sticky-note system = **event loop**.
* "When oven beeps, do X" = a **Future** with a callback / `await`.
* A conveyor belt delivering many cakes over time = a **Stream**.
* Hiring a **second chef in a separate kitchen** (no shared bowls, only passing notes through a window) = an **Isolate**.

Important: if the chef decides to **knead dough for 10 minutes without stopping** (heavy synchronous computation), *nobody* else is served — in Flutter that means **frozen UI / jank**. `async` does NOT make heavy CPU work run in the background! Only isolates do.

---

## 5.2 The event loop in detail

Each isolate has:
1. **Microtask queue** — high priority, small internal tasks (`scheduleMicrotask`, `Future.microtask`, completion callbacks of already-completed futures, `then` callbacks).
2. **Event queue** — I/O events, timers, gestures, frame callbacks, messages from other isolates, `Future(...)`, `Future.delayed`.

Algorithm:
```
run main() synchronously to completion
loop forever:
    while microtask queue not empty:
        run next microtask
    if event queue not empty:
        run next event (then go back and drain microtasks again)
```
**Microtasks always run before the next event.** Too many microtasks → starve events (UI freezes).

### The classic interview puzzle
```dart
import 'dart:async';

void main() {
  print('1 - sync start');

  Future(() => print('2 - event queue (Future)'));
  Future.delayed(Duration.zero, () => print('3 - event queue (delayed 0)'));
  scheduleMicrotask(() => print('4 - microtask'));
  Future.microtask(() => print('5 - microtask (Future.microtask)'));
  Future.value(1).then((_) => print('6 - then on completed future (microtask)'));
  Future.sync(() => print('7 - Future.sync runs immediately'));

  print('8 - sync end');
}
```
Output:
```
1 - sync start
7 - Future.sync runs immediately
8 - sync end
4 - microtask
5 - microtask (Future.microtask)
6 - then on completed future (microtask)
2 - event queue (Future)
3 - event queue (delayed 0)
```
Explanation:
* Synchronous code first: 1, 7 (`Future.sync` runs its callback synchronously), 8.
* Then **all microtasks** in FIFO order: 4, 5, 6.
* Then **events** in order: 2, 3.

### Another puzzle with async/await
```dart
Future<void> task() async {
  print('A');
  await null;          // suspends; rest continues as a microtask
  print('B');
}
void main() {
  print('1');
  task();
  print('2');
}
// 1, A, 2, B
```
**Key rule:** an `async` function runs **synchronously until the first `await`**. Then it returns a `Future` to the caller, and the rest of the function continues later.

---

## 5.3 Future — a promise of one value later 🎟️

A `Future<T>` is like a **restaurant buzzer**: you get it now, and it will buzz later with either your food (**value**) or bad news (**error**).

States: **uncompleted** → **completed with value** OR **completed with error**.

### 5.3.1 Creating futures
```dart
Future<int> a = Future.value(42);
Future<int> b = Future.error(Exception('fail'));
Future<int> c = Future.delayed(const Duration(seconds: 2), () => 42);
Future<int> d = Future(() => compute42());   // schedule on event queue

// Completer — manually complete (useful for wrapping callback APIs)
Future<String> wrapCallbackApi() {
  final completer = Completer<String>();
  legacyApi(onSuccess: completer.complete, onError: completer.completeError);
  return completer.future;
}
```

### 5.3.2 Consuming futures: `then` vs `async/await`
```dart
// then-style
fetchUser().then((user) => print(user.name))
           .catchError((e) => print('Error $e'))
           .whenComplete(() => print('done'));

// async/await style (preferred: reads like sync code)
Future<void> load() async {
  try {
    final user = await fetchUser();
    print(user.name);
  } catch (e, st) {
    print('Error $e $st');
  } finally {
    print('done');
  }
}
```

### 5.3.3 Running futures in parallel vs sequentially
```dart
// ❌ Sequential — total ≈ 3s
final a = await fetchA(); // 1s
final b = await fetchB(); // 1s
final c = await fetchC(); // 1s

// ✅ Parallel — total ≈ 1s
final results = await Future.wait([fetchA(), fetchB(), fetchC()]);

// ✅ Dart 3 records: typed parallel waits
final (user, posts) = await (fetchUser(), fetchPosts()).wait;
```
By default `Future.wait` waits for **all** futures to finish and then completes with the **first error** that occurred; pass `eagerError: true` to complete with an error as soon as any future fails (the others keep running regardless — futures can't be cancelled). The records `.wait` extension throws a `ParallelWaitError` that contains both the successful values and the errors.

Other helpers:
```dart
await Future.any([f1, f2]);                    // first to complete
await fetch().timeout(const Duration(seconds: 10)); // throws TimeoutException
await Future.forEach(items, (item) async => await upload(item)); // sequential async loop
await Future.doWhile(() async { ... return keepGoing; });
```

### 5.3.4 ⚠️ `forEach` with async — classic bug
```dart
// ❌ Does NOT wait! forEach ignores returned futures.
items.forEach((item) async {
  await upload(item);
});
print('All uploaded?'); // prints immediately, uploads still running

// ✅ Sequential
for (final item in items) {
  await upload(item);
}
// ✅ Parallel
await Future.wait(items.map(upload));
```

### 5.3.5 Unawaited futures & errors
If a Future errors and nobody listens, it becomes an **uncaught async error** (reported to the zone / `PlatformDispatcher.instance.onError`). Lint `unawaited_futures` catches missing awaits. When you intentionally don't await, use `unawaited(future)` from `dart:async` to document it.

### 5.3.6 `FutureOr<T>`
A type meaning "either `T` or `Future<T>`", used in APIs that accept sync or async callbacks.

---

## 5.4 Streams — a conveyor belt of values 🛤️

A `Stream<T>` delivers **many values over time** (plus possibly errors) and then optionally a **done** event. Examples: user typing, location updates, WebSocket messages, Firestore snapshots, Bloc states.

| | Future | Stream |
|---|---|---|
| Number of values | one | zero or many |
| Analogy | buzzer | conveyor belt / YouTube live |
| Consume | `await`, `then` | `await for`, `listen` |
| Flutter widget | `FutureBuilder` | `StreamBuilder` |

### 5.4.1 Single-subscription vs broadcast
* **Single-subscription** (default): **only one listener**, ever. Data is buffered until listened. Example: reading a file, HTTP response body. Listening twice → `Bad state: Stream has already been listened to.`
* **Broadcast**: **many listeners**; events not buffered — late listeners miss earlier events. Example: button clicks, `StreamController.broadcast()`.
```dart
final broadcast = myStream.asBroadcastStream();
```

### 5.4.2 Creating streams
```dart
// 1. async* generator
Stream<int> countDown(int from) async* {
  for (var i = from; i >= 0; i--) {
    await Future.delayed(const Duration(seconds: 1));
    yield i;                  // emit a value
  }
}
// yield* forwards all values from another stream:
Stream<int> twice() async* { yield* countDown(3); yield* countDown(3); }

// 2. StreamController
final controller = StreamController<String>();      // or .broadcast()
controller.sink.add('hello');      // or controller.add
controller.addError(Exception('x'));
await controller.close();          // ALWAYS close to avoid leaks
controller.stream.listen(print);

// 3. Built-ins
Stream.periodic(const Duration(seconds: 1), (i) => i);
Stream.fromIterable([1, 2, 3]);
Stream.fromFuture(fetch());
Stream.value(1); Stream.error(e); Stream.empty();
```
Synchronous generator (`sync*`) produces an `Iterable` lazily:
```dart
Iterable<int> naturals(int n) sync* { for (var i = 0; i < n; i++) yield i; }
```

### 5.4.3 Listening
```dart
final StreamSubscription<int> sub = countDown(5).listen(
  (value) => print(value),
  onError: (e) => print('error $e'),
  onDone: () => print('done'),
  cancelOnError: false,
);
sub.pause(); sub.resume();
await sub.cancel();   // ALWAYS cancel in dispose()!

// await for (inside async function)
await for (final v in countDown(3)) {
  print(v);
}
```

### 5.4.4 Transforming streams
```dart
stream.map((x) => x * 2)
      .where((x) => x > 2)
      .distinct()                 // skip consecutive duplicates
      .take(10).skip(1)
      .asyncMap((x) => fetchDetails(x))  // async map, sequential
      .handleError((e) => log(e))
      .timeout(const Duration(seconds: 5));
final first = await stream.first;
final list = await stream.toList();
```
Debounce/throttle (for search boxes) are not in core — use `package:rxdart` (`debounceTime`, `switchMap`, `BehaviorSubject`, `combineLatest`) or `stream_transform` (`debounce`, `throttle`, `switchMap`), or implement with a `Timer`.

### 5.4.5 RxDart subjects (common in older/enterprise code)
* `PublishSubject` — broadcast, no replay.
* `BehaviorSubject` — remembers the **latest** value; new listeners get it immediately (like a "current state").
* `ReplaySubject` — replays all (or N) previous values.

### 5.4.6 Stream memory leak bug
```dart
class _ChatState extends State<Chat> {
  StreamSubscription? _sub;

  @override
  void initState() {
    super.initState();
    _sub = chatService.messages.listen((m) => setState(() => _messages.add(m)));
  }

  @override
  void dispose() {
    _sub?.cancel();   // ❗ forget this → leak + "setState() called after dispose()"
    super.dispose();
  }
}
```

---

## 5.5 Isolates — a second kitchen 🏠🏠

### 5.5.1 What is an isolate?
An **isolate** is Dart's unit of concurrency: its **own memory heap**, its **own event loop**, and its **own thread** (when running). Isolates **do not share mutable memory** → **no data races, no locks**. They communicate by **passing messages** through **ports** (`SendPort` / `ReceivePort`).

The Flutter app's Dart code runs in the **root isolate** (main isolate).

### 5.5.2 When to use one
Any CPU-heavy work that would take more than a few milliseconds (remember: 16 ms per frame at 60 fps):
* Parsing/encoding big JSON (> ~100 KB… measure!)
* Image processing, compression, encryption, hashing.
* Sorting/filtering huge lists, search indexing.
* Heavy database transformations, PDF generation.

**Not needed for:** network requests or file I/O themselves — those are already asynchronous (the waiting happens outside Dart).

### 5.5.3 `Isolate.run` (Dart 2.19+) — the easiest way
```dart
import 'dart:convert';
import 'dart:isolate';

Future<List<Photo>> parsePhotos(String body) {
  return Isolate.run(() {
    final list = jsonDecode(body) as List<dynamic>;
    return list.map((e) => Photo.fromJson(e as Map<String, dynamic>)).toList();
  });
}
```

### 5.5.4 Flutter's `compute()`
```dart
import 'package:flutter/foundation.dart';

List<Photo> _parse(String body) { /* ... */ }   // top-level or static function
final photos = await compute(_parse, responseBody);
```
`compute` takes a callback and one message argument; on native it uses `Isolate.run` internally; **on the web it runs on the same thread** (web has no Dart isolates — use Web Workers for true parallelism).

### 5.5.5 Long-lived isolates with ports
```dart
Future<void> startWorker() async {
  final receivePort = ReceivePort();
  await Isolate.spawn(_worker, receivePort.sendPort);

  late SendPort workerPort;
  receivePort.listen((message) {
    if (message is SendPort) {
      workerPort = message;            // handshake
      workerPort.send('job 1');
    } else {
      print('Result: $message');
    }
  });
}

void _worker(SendPort mainPort) {
  final port = ReceivePort();
  mainPort.send(port.sendPort);        // send our port back
  port.listen((job) {
    mainPort.send('done: $job');
  });
}
```

### 5.5.6 Rules and gotchas
* Messages are **copied** (deep copy) between isolates — big messages cost time. `Isolate.exit()` (used by `Isolate.run`) can transfer the result **without copying**. `TransferableTypedData` transfers byte buffers efficiently.
* Since Dart 2.15, isolates spawned with `Isolate.spawn` share an **isolate group** (same code), so spawning is fast and closures can be sent (with restrictions — no sockets, ReceivePorts, etc.).
* **Platform channels / plugins in background isolates:** historically not possible; since Flutter 3.7 you can use `BackgroundIsolateBinaryMessenger.ensureInitialized(rootIsolateToken)` to call plugins from background isolates:
  ```dart
  final token = RootIsolateToken.instance!;
  Isolate.run(() async {
    BackgroundIsolateBinaryMessenger.ensureInitialized(token);
    final prefs = await SharedPreferences.getInstance(); // works now
  });
  ```
* You can't touch the widget tree / `BuildContext` / UI from another isolate.
* Each isolate has its own copy of globals/singletons! A singleton initialised in main isolate is *not* initialised in a spawned one.
* Isolates have memory overhead; for many small tasks, use a pool (packages like `isolate_manager`, `squadron`, `worker_manager`).

### 5.5.7 Concurrency vs parallelism
* **Concurrency** — dealing with many things at once (interleaving) → event loop + async.
* **Parallelism** — doing many things *simultaneously* on multiple cores → isolates.

---

## 5.6 Zones — invisible bubbles around your code 🫧

A **Zone** is an execution context that persists across async callbacks. It can:
* Catch **uncaught async errors** in that zone.
* Store zone-local values (like thread-locals).
* Intercept `print`, timers, microtasks (used by test frameworks / `fake_async`).

```dart
runZonedGuarded(() {
  runApp(const MyApp());
}, (error, stack) {
  FirebaseCrashlytics.instance.recordError(error, stack, fatal: true);
});
```
⚠️ **Zone mismatch warning:** if you call `WidgetsFlutterBinding.ensureInitialized()` in one zone and `runApp` in another, Flutter prints "Zone mismatch". Keep them in the same zone.

**Modern recommended global error handling (Flutter 3.3+):**
```dart
void main() {
  WidgetsFlutterBinding.ensureInitialized();

  // 1. Errors thrown by the Flutter framework (build/layout/paint callbacks)
  FlutterError.onError = (details) {
    FlutterError.presentError(details);  // keeps console output in debug
    crashReporter.recordFlutterError(details);
  };

  // 2. Uncaught async errors and errors outside Flutter callbacks
  PlatformDispatcher.instance.onError = (error, stack) {
    crashReporter.recordError(error, stack, fatal: true);
    return true; // handled
  };

  // 3. Errors in background isolates (optional)
  Isolate.current.addErrorListener(RawReceivePort((pair) async {
    final List<dynamic> errorAndStack = pair;
    crashReporter.recordError(errorAndStack.first, StackTrace.fromString(errorAndStack.last.toString()));
  }).sendPort);

  // 4. What to show when a widget's build throws (instead of red screen in release)
  ErrorWidget.builder = (details) => const Center(child: Text('Something went wrong'));

  runApp(const MyApp());
}
```

---

## 5.7 Timers
```dart
final t = Timer(const Duration(seconds: 2), () => print('once'));
final p = Timer.periodic(const Duration(seconds: 1), (timer) {
  if (timer.tick == 5) timer.cancel();
});
t.cancel(); // ALWAYS cancel timers in dispose()
```
Debounce with a timer (search box):
```dart
Timer? _debounce;
void onSearchChanged(String q) {
  _debounce?.cancel();
  _debounce = Timer(const Duration(milliseconds: 400), () => search(q));
}
```

---

## 5.8 Async in Flutter widgets — the dangerous parts

### 5.8.1 `setState() called after dispose()`
```dart
Future<void> _load() async {
  final data = await api.fetch();   // user navigated away during this await!
  if (!mounted) return;             // ✅ guard
  setState(() => _data = data);
}
```

### 5.8.2 Using `BuildContext` across async gaps
```dart
onPressed: () async {
  await save();
  if (!context.mounted) return;     // ✅ Flutter 3.7+: BuildContext.mounted
  Navigator.of(context).pop();
  ScaffoldMessenger.of(context).showSnackBar(...);
}
```
Lint: `use_build_context_synchronously`. Alternative: capture `final navigator = Navigator.of(context);` **before** the await.

### 5.8.3 `FutureBuilder` re-firing the future on every rebuild
```dart
// ❌ BAD: a new future is created on every build → infinite loading / repeated API calls
FutureBuilder(future: api.fetchUser(), builder: ...);

// ✅ GOOD: create once (initState / state management) and reuse
late final Future<User> _userFuture;
@override
void initState() {
  super.initState();
  _userFuture = api.fetchUser();
}
FutureBuilder<User>(
  future: _userFuture,
  builder: (context, snapshot) {
    if (snapshot.connectionState == ConnectionState.waiting) {
      return const CircularProgressIndicator();
    }
    if (snapshot.hasError) return Text('Error: ${snapshot.error}');
    return Text(snapshot.data!.name);
  },
);
```
`ConnectionState` values: `none`, `waiting`, `active` (streams emitting), `done`.

`StreamBuilder` similarly — don't create the stream inside `build`.

---

## 5.9 Error handling in async code — full reference
```dart
// Errors thrown inside async functions become errors of the returned Future.
Future<void> f() async => throw Exception('x');

// Catch with try/await:
try { await f(); } catch (e) { ... }

// ❌ Not caught! The future isn't awaited inside the try.
try { f(); } catch (e) { /* never runs */ }

// Streams: errors go to onError / handleError; await-for rethrows.
```

---

## 5.10 Interview Questions — Async

**Q1. Explain the Dart event loop.** Each isolate runs main synchronously, then loops: drains the microtask queue entirely, then processes one event from the event queue, repeat. Futures/timers/I-O schedule events; `scheduleMicrotask` and future completions schedule microtasks.

**Q2. Future vs Stream?** Future = single async result (value or error). Stream = sequence of async events (zero or more values/errors, then done).

**Q3. Is Dart single-threaded? How does Flutter avoid freezing?** Each isolate is single-threaded with an event loop. I/O is non-blocking so `await` doesn't block; heavy CPU work must be moved to another isolate (`Isolate.run`, `compute`) to avoid janking the UI.

**Q4. Does `async` make code run in a background thread?** No. It only allows suspension at `await` points; the code still runs on the same isolate's thread.

**Q5. What is the difference between microtask and event queues?** Microtasks have higher priority and are all processed before the next event; used for short internal follow-ups. Events include I/O, timers, user input, frames.

**Q6. What's a Completer?** An object to create and manually complete a Future; used to adapt callback APIs to futures.

**Q7. Single-subscription vs broadcast streams?** Single-subscription allows one listener and buffers events until listened; broadcast allows many listeners and doesn't buffer.

**Q8. How do you cancel a stream subscription and why?** Store the `StreamSubscription` and call `cancel()` (e.g., in `dispose`) to free resources and avoid callbacks on disposed widgets.

**Q9. `async*` vs `sync*`?** `async*` returns a Stream and can `await`; `sync*` returns a lazily evaluated Iterable. Both use `yield`/`yield*`.

**Q10. What is an isolate? How do isolates communicate?** Independent worker with own memory and event loop; communicate by message passing through SendPort/ReceivePort; messages are copied (or transferred on exit).

**Q11. `compute` vs `Isolate.run`?** `compute` is Flutter's wrapper (one argument, web fallback runs on main thread); `Isolate.run` is Dart's API for running a closure in a new isolate and returning its result.

**Q12. How do you run futures in parallel?** `Future.wait([...])` or record `.wait` — start them before awaiting.

**Q13. What is a Zone?** An execution context propagated across async callbacks, used for error handling (`runZonedGuarded`), zone-local values, and intercepting async ops in tests.

**Q14. How do you handle uncaught errors globally in Flutter?** `FlutterError.onError` for framework errors, `PlatformDispatcher.instance.onError` for other uncaught errors, optionally `runZonedGuarded`, and `ErrorWidget.builder` for build failures.

**Q15. Why shouldn't you create a future inside `build` for FutureBuilder?** `build` runs often; each rebuild starts a new future, re-triggering the request and resetting the builder to waiting.

**Q16. What does `await` do under the hood?** It registers continuation callbacks on the future; the function is suspended and returns control to the event loop; when the future completes, the continuation is scheduled (as a microtask) to resume the function.

**Q17. How to implement debounce for search?** Cancel/restart a `Timer` on each keystroke, or use rxdart's `debounceTime` on a stream of queries, combined with `switchMap` to discard stale responses.

**Q18. Can you use plugins inside isolates?** Since Flutter 3.7, yes, via `BackgroundIsolateBinaryMessenger.ensureInitialized(RootIsolateToken)` (with plugin support caveats).

**Q19. Can isolates share memory?** Not mutable Dart objects; they share code within an isolate group and can share immutable data efficiently, and can transfer buffers. Shared-memory is possible only via FFI/native memory.

**Q20. What is `FutureOr`?** Union type `T | Future<T>`, allowing APIs to accept sync or async values.
