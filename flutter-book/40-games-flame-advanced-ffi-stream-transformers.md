# Chapter 40 — Games with Flame, Advanced FFI (structs, callbacks, ffigen) & Custom Stream Transformers

> **Goal:** Build a small 2D game with Flame (game loop, components, sprites, input, collisions, overlays, audio). Go deeper into native interop (structs, memory, async callbacks from native threads, generated bindings). Master stream transformation by writing your own transformers.

---

# Part A — 2D games with Flame 🎮

## 40.1 5-year-old picture
A normal app redraws only when something changes. A **game** is a **cartoon that never stops**: about 60 times every second it **moves** everything a little (`update`) and **draws** everything again (`render`). That never-ending heartbeat is the **game loop**.

## 40.2 Flame's building blocks
| Concept | What it is |
|---|---|
| `FlameGame` | The root game: owns the loop, the `world` and the `camera` |
| `GameWidget` | The Flutter widget that shows a game (place it anywhere in your widget tree) |
| `Component` | Everything in the game is a component tree (like widgets, but mutable and updated every frame) |
| `PositionComponent` | Has position, size, angle, scale, anchor |
| `SpriteComponent` / `SpriteAnimationComponent` | Shows images / animations |
| `World` + `CameraComponent` | The world holds game objects; the camera decides what part of the world you see (viewport, follow player) |
| `update(double dt)` | Called every frame; `dt` = seconds since the last frame → multiply speeds by `dt` |
| `render(Canvas canvas)` | Custom drawing (sprites render themselves) |
| Mixins | `TapCallbacks`, `DragCallbacks`, `KeyboardHandler`, `CollisionCallbacks`, `HasGameReference<T>` |
| Hitboxes | `RectangleHitbox`, `CircleHitbox`, `PolygonHitbox` + `HasCollisionDetection` on the game |
| Effects | `MoveEffect`, `ScaleEffect`, `RotateEffect`, `OpacityEffect`, `SequenceEffect` with `EffectController` |
| Overlays | Flutter widgets (menus, HUD) on top of the game |
| Bridge packages | `flame_audio`, `flame_forge2d` (physics), `flame_tiled` (maps), `flame_bloc`/`flame_riverpod` |

## 40.3 A complete mini game: "Catch the stars" ⭐
```yaml
dependencies:
  flame: ^x.y.z       # check pub.dev for the latest 1.x
flutter:
  assets:
    - assets/images/  # Flame's default image prefix is assets/images/
```
```dart
import 'dart:math';
import 'package:flame/collisions.dart';
import 'package:flame/components.dart';
import 'package:flame/events.dart';
import 'package:flame/game.dart';
import 'package:flutter/material.dart';

void main() {
  runApp(MaterialApp(
    home: Scaffold(
      body: GameWidget<StarGame>.controlled(
        gameFactory: StarGame.new,
        overlayBuilderMap: {
          'hud': (context, game) => Hud(game: game),
          'gameOver': (context, game) => GameOverMenu(game: game),
        },
        initialActiveOverlays: const ['hud'],
      ),
    ),
  ));
}

class StarGame extends FlameGame with HasCollisionDetection, DragCallbacks {
  late Basket basket;
  final score = ValueNotifier<int>(0);       // Flutter overlays listen to this
  final lives = ValueNotifier<int>(3);
  final _random = Random();
  double _spawnTimer = 0;

  @override
  Color backgroundColor() => const Color(0xFF0B1026);

  @override
  Future<void> onLoad() async {
    // The camera looks at the world; with the default viewfinder, world (0,0) is the screen centre.
    camera.viewfinder.anchor = Anchor.topLeft;  // make (0,0) the top-left corner, like normal screen coordinates
    basket = Basket()..position = Vector2(size.x / 2, size.y - 80);
    await world.add(basket);
  }

  @override
  void update(double dt) {
    super.update(dt);
    if (lives.value <= 0) return;
    _spawnTimer += dt;
    final interval = max(0.35, 1.2 - score.value * 0.02);   // gets harder over time
    if (_spawnTimer >= interval) {
      _spawnTimer = 0;
      world.add(Star(speed: 150 + _random.nextDouble() * 150 + score.value * 3)
        ..position = Vector2(_random.nextDouble() * (size.x - 40) + 20, -20));
    }
  }

  @override
  void onDragUpdate(DragUpdateEvent event) {
    basket.position.x = (basket.position.x + event.localDelta.x).clamp(40, size.x - 40);
  }

  void caught() => score.value++;

  void missed() {
    lives.value--;
    if (lives.value <= 0) {
      pauseEngine();
      overlays.add('gameOver');
    }
  }

  void restart() {
    world.children.whereType<Star>().forEach((s) => s.removeFromParent());
    score.value = 0;
    lives.value = 3;
    overlays.remove('gameOver');
    resumeEngine();
  }

  @override
  void onRemove() {
    score.dispose();
    lives.dispose();
    super.onRemove();
  }
}

class Basket extends RectangleComponent with HasGameReference<StarGame> {
  Basket() : super(size: Vector2(80, 24), anchor: Anchor.center, paint: Paint()..color = Colors.amber);

  @override
  Future<void> onLoad() async => add(RectangleHitbox());
}

class Star extends CircleComponent with HasGameReference<StarGame>, CollisionCallbacks {
  Star({required this.speed}) : super(radius: 12, anchor: Anchor.center, paint: Paint()..color = Colors.white);
  final double speed;

  @override
  Future<void> onLoad() async => add(CircleHitbox());

  @override
  void update(double dt) {
    super.update(dt);
    position.y += speed * dt;                      // ❗ frame-rate independent movement
    if (position.y > game.size.y + 20) {
      removeFromParent();
      game.missed();
    }
  }

  @override
  void onCollisionStart(Set<Vector2> intersectionPoints, PositionComponent other) {
    super.onCollisionStart(intersectionPoints, other);
    if (other is Basket) {
      removeFromParent();
      game.caught();
    }
  }
}

class Hud extends StatelessWidget {
  const Hud({super.key, required this.game});
  final StarGame game;
  @override
  Widget build(BuildContext context) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Row(children: [
            ValueListenableBuilder<int>(
              valueListenable: game.score,
              builder: (_, s, __) => Text('Score: $s', style: const TextStyle(color: Colors.white, fontSize: 20)),
            ),
            const Spacer(),
            ValueListenableBuilder<int>(
              valueListenable: game.lives,
              builder: (_, l, __) => Text('❤️' * l, style: const TextStyle(fontSize: 20)),
            ),
          ]),
        ),
      );
}

class GameOverMenu extends StatelessWidget {
  const GameOverMenu({super.key, required this.game});
  final StarGame game;
  @override
  Widget build(BuildContext context) => Center(
        child: Card(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Column(mainAxisSize: MainAxisSize.min, children: [
              Text('Game over! Score: ${game.score.value}', style: Theme.of(context).textTheme.titleLarge),
              const SizedBox(height: 16),
              FilledButton(onPressed: game.restart, child: const Text('Play again')),
            ]),
          ),
        ),
      );
}
```
Shapes are used so the example runs without image files. To use images, switch to `SpriteComponent` and load sprites in `onLoad`:
```dart
class StarSprite extends SpriteComponent with HasGameReference<StarGame> {
  @override
  Future<void> onLoad() async {
    sprite = await game.loadSprite('star.png');    // assets/images/star.png
    size = Vector2.all(32);
  }
}
// Animations from a sprite sheet:
final animation = await game.loadSpriteAnimation(
  'player_run.png',
  SpriteAnimationData.sequenced(amount: 8, stepTime: 0.08, textureSize: Vector2(32, 32)),
);
```
Audio: `flame_audio` → `FlameAudio.play('catch.wav')`, `FlameAudio.bgm.play('music.mp3')`. Preload sounds in `onLoad`.

## 40.4 Game performance & architecture tips
* Movement in `update` must use `dt`. Never assume 60 fps (120 Hz screens and slow devices exist).
* Avoid allocations in `update` (reuse `Vector2`s), because GC pauses cause stutters.
* Use sprite batching (`SpriteBatch`) for many identical sprites. Use object pools for bullets and particles.
* Use the `world` + `camera` structure. Put HUD components in `camera.viewport` or use Flutter overlays.
* Game state such as score and level can live in Bloc/Riverpod via `flame_bloc`/`flame_riverpod`, or `ValueNotifier`s as above.
* Physics: `flame_forge2d` (Box2D). Tile maps: `flame_tiled`. Particles: `ParticleSystemComponent`.
* Test components with `flame_test` (`testWithFlameGame`).
* For 3D or console-quality games, use Unity, Godot or Unreal.

---

# Part B — Advanced Dart FFI ⚙️

## 40.5 Structs, arrays & memory ownership
```c
// native/geo.h
typedef struct { double lat; double lng; } Point;
double distance_km(Point a, Point b);
int32_t sum_array(const int32_t* values, int32_t length);
char* greet(const char* name);       // returns malloc'ed string → caller must free with free_string
void free_string(char* s);
```
```dart
import 'dart:ffi';
import 'package:ffi/ffi.dart';

final class Point extends Struct {
  @Double()
  external double lat;
  @Double()
  external double lng;
}

final DynamicLibrary _lib = DynamicLibrary.open('libgeo.so');   // per-platform loading (see Chapter 19)

final _distance = _lib.lookupFunction<Double Function(Point, Point), double Function(Point, Point)>('distance_km');
final _sumArray = _lib.lookupFunction<Int32 Function(Pointer<Int32>, Int32), int Function(Pointer<Int32>, int)>('sum_array');
final _greet = _lib.lookupFunction<Pointer<Utf8> Function(Pointer<Utf8>), Pointer<Utf8> Function(Pointer<Utf8>)>('greet');
final _freeString = _lib.lookupFunction<Void Function(Pointer<Utf8>), void Function(Pointer<Utf8>)>('free_string');

double distanceKm(double lat1, double lng1, double lat2, double lng2) {
  return using((arena) {                               // everything allocated with arena is freed at the end
    final a = arena<Point>()..ref.lat = lat1..ref.lng = lng1;
    final b = arena<Point>()..ref.lat = lat2..ref.lng = lng2;
    return _distance(a.ref, b.ref);                    // structs are passed by value
  });
}

int sum(List<int> values) {
  final ptr = calloc<Int32>(values.length);
  try {
    ptr.asTypedList(values.length).setAll(0, values);  // fast copy into native memory
    return _sumArray(ptr, values.length);
  } finally {
    calloc.free(ptr);                                  // ❗ Dart's GC does NOT manage native memory
  }
}

String greet(String name) {
  final namePtr = name.toNativeUtf8();
  try {
    final resultPtr = _greet(namePtr);
    try {
      return resultPtr.toDartString();
    } finally {
      _freeString(resultPtr);                          // free with the SAME allocator that allocated it (native side)
    }
  } finally {
    malloc.free(namePtr);                              // toNativeUtf8 uses malloc by default
  }
}
```
Rules of memory ownership:
1. Whoever allocates must free, with the **matching allocator**.
2. Document ownership for every function that returns a pointer.
3. Use `Arena`/`using` for temporary allocations.
4. For native objects tied to Dart objects' lifetimes, attach a **`NativeFinalizer`** (calls a native free function when the Dart object is garbage collected) and implement `Finalizable`.

## 40.6 Callbacks from native to Dart
| API | Use |
|---|---|
| `Pointer.fromFunction` | Older API: synchronous callbacks on the **same thread** only, static functions only |
| `NativeCallable.isolateLocal` | Sync callbacks invoked on the isolate's own thread; can capture closures; must call `close()` |
| `NativeCallable.listener` | Callbacks invoked from **any native thread**. The call is posted asynchronously to the Dart isolate. Return type must be `void`. Must `close()` when done |

```c
// native/worker.h
typedef void (*ProgressCallback)(int32_t percent);
void start_long_task(ProgressCallback cb);   // runs on a background native thread and calls cb repeatedly
```
```dart
typedef ProgressNative = Void Function(Int32);

final _startLongTask = _lib.lookupFunction<
    Void Function(Pointer<NativeFunction<ProgressNative>>),
    void Function(Pointer<NativeFunction<ProgressNative>>)>('start_long_task');

Stream<int> runLongTask() {
  late final NativeCallable<ProgressNative> callable;
  var closed = false;
  void closeCallable() {                // close exactly once
    if (closed) return;
    closed = true;
    callable.close();                   // ❗ otherwise the isolate stays alive and leaks
  }

  final controller = StreamController<int>(onCancel: closeCallable);
  callable = NativeCallable<ProgressNative>.listener((int percent) {
    if (controller.isClosed) return;
    controller.add(percent);
    if (percent >= 100) {
      closeCallable();
      controller.close();
    }
  });
  _startLongTask(callable.nativeFunction);
  return controller.stream;
}
```
After `close()`, the native side must not call the function pointer again. Design your C API so it stops calling (or unregisters) the callback before you close it.

## 40.7 Generating bindings
* **`ffigen`** (C/Objective-C): configure in `ffigen.yaml` and run `dart run ffigen`.
```yaml
# ffigen.yaml
name: GeoBindings
description: Bindings for libgeo
output: lib/src/geo_bindings.g.dart
headers:
  entry-points:
    - native/geo.h
```
  Use the generated class: `final bindings = GeoBindings(DynamicLibrary.open(...)); bindings.distance_km(a, b);`. Newer setups can generate `@Native` external functions resolved through **native assets** instead of manual `DynamicLibrary.open`.
* **`jnigen`** (Java/Kotlin on Android): generates Dart classes that call JNI directly. For example, you can call Android SDK APIs synchronously without platform channels. Configure the classes to generate in `jnigen.yaml`.
* **Swift:** expose `@objc` APIs and use ffigen's Objective-C support (Swift-specific tooling, "swiftgen", is evolving).
* **Native assets / build hooks** (`hook/build.dart`, stable since Dart 3.10 / Flutter 3.38): your package compiles C/C++ (with `native_toolchain_c`) or downloads prebuilt binaries at build time, and Flutter bundles them for every target automatically. No more manual CMake/Gradle/Podspec wiring for pure-native packages.
* **Rust:** `flutter_rust_bridge` (high-level codegen: structs, async, streams) or native assets with cargo.

## 40.8 Threading & performance with FFI
* An FFI call blocks the calling isolate until it returns. Run slow native functions in a helper isolate (`Isolate.run(() => nativeHeavy())`). The `DynamicLibrary` lookups must happen inside that isolate (top-level lazy finals are per isolate, which is fine).
* `@Native(isLeaf: true)` / `lookupFunction(isLeaf: true)` marks calls that don't call back into Dart or block for long. Leaf calls are cheaper.
* Pass large data as `Pointer<Uint8>` + length, or typed data views. Avoid per-element conversions.
* Use `Uint8List` views over native memory (`asTypedList`) for zero-copy reads. Be careful with lifetimes: the view is invalid once the memory is freed. You can attach a finalizer to the view with `asTypedList(..., finalizer:)`.

---

# Part C — Custom Stream transformers 🔁

## 40.9 Three ways to transform streams
1. Built-in methods: `map`, `where`, `expand`, `asyncMap`, `asyncExpand`, `distinct`, `take`, `skip`, `timeout`, `handleError`.
2. `StreamTransformer.fromHandlers` for simple element-by-element transforms.
3. `StreamTransformer.fromBind` (or implementing `StreamTransformerBase`) for anything with state or timing (debounce, throttle, buffer, switchMap).

### `fromHandlers`: drop invalid items and convert errors
```dart
final parseInts = StreamTransformer<String, int>.fromHandlers(
  handleData: (value, sink) {
    final n = int.tryParse(value);
    if (n != null) sink.add(n);          // skip non-numbers
  },
  handleError: (error, stack, sink) => sink.addError(FormatException('Upstream: $error'), stack),
  handleDone: (sink) => sink.close(),
);
// Stream.fromIterable(['1', 'x', '3']).transform(parseInts) → 1, 3
```

### `fromBind`: debounce (with correct pause/cancel handling and flushing on done)
```dart
import 'dart:async';

StreamTransformer<T, T> debounce<T>(Duration duration) =>
    StreamTransformer<T, T>.fromBind((Stream<T> input) {
      late StreamController<T> controller;
      StreamSubscription<T>? subscription;
      Timer? timer;
      T? pending;
      var hasPending = false;

      void flush() {
        if (hasPending) {
          hasPending = false;
          controller.add(pending as T);
        }
      }

      controller = StreamController<T>(
        sync: true,
        onListen: () {
          subscription = input.listen(
            (event) {
              pending = event;
              hasPending = true;
              timer?.cancel();
              timer = Timer(duration, flush);
            },
            onError: controller.addError,
            onDone: () {
              timer?.cancel();
              flush();                       // emit the last value instead of losing it
              controller.close();
            },
          );
        },
        onPause: () => subscription?.pause(),
        onResume: () => subscription?.resume(),
        onCancel: () {
          timer?.cancel();
          return subscription?.cancel();
        },
      );
      return controller.stream;
    });

// Usage:
// searchQueries.transform(debounce(const Duration(milliseconds: 300))).listen(search);
```
(If the input is a broadcast stream and you want the output broadcast too, use `StreamController.broadcast` and handle multiple listeners. Libraries like `stream_transform` do this for you.)

### `switchMap`: only the latest async request matters
```dart
StreamTransformer<S, T> switchMap<S, T>(Stream<T> Function(S value) convert) =>
    StreamTransformer<S, T>.fromBind((input) {
      late StreamController<T> controller;
      StreamSubscription<S>? outer;
      StreamSubscription<T>? inner;
      var outerDone = false;

      controller = StreamController<T>(
        onListen: () {
          outer = input.listen(
            (value) {
              inner?.cancel();                         // ❗ cancel the previous inner stream
              inner = convert(value).listen(
                controller.add,
                onError: controller.addError,
                onDone: () {
                  inner = null;
                  if (outerDone) controller.close();
                },
              );
            },
            onError: controller.addError,
            onDone: () {
              outerDone = true;
              if (inner == null) controller.close();
            },
          );
        },
        onCancel: () async {
          await inner?.cancel();
          await outer?.cancel();
        },
      );
      return controller.stream;
    });

// queries.transform(debounce(300.ms)).transform(switchMap((q) => Stream.fromFuture(api.search(q))))
```
This is exactly the **"search-as-you-type without out-of-order results"** pattern from Chapter 16. In production, prefer the tested implementations in **`stream_transform`** (`debounce`, `throttle`, `switchMap`, `combineLatest`, `buffer`) or **`rxdart`**.

### Testing transformers
```dart
test('debounce emits only the last value', () {
  fakeAsync((async) {
    final controller = StreamController<int>();
    final results = <int>[];
    controller.stream.transform(debounce(const Duration(milliseconds: 300))).listen(results.add);
    controller..add(1)..add(2)..add(3);
    async.elapse(const Duration(milliseconds: 299));
    expect(results, isEmpty);
    async.elapse(const Duration(milliseconds: 1));
    expect(results, [3]);
    controller.close();
  });
});
```

---

## 40.10 Interview questions — this chapter

**Q1. Explain the game loop in Flame.**
On every frame, Flame calls `update(dt)` on the component tree (state changes scaled by elapsed time) and then `render(canvas)` (drawing). The FlameGame is driven by a Ticker inside GameWidget.

**Q2. How do you make movement frame-rate independent?**
Multiply velocities by `dt` (seconds since the last frame).

**Q3. How do Flutter UI and a Flame game communicate?**
Overlays (Flutter widgets above the game, toggled with `game.overlays`), shared notifiers/state management (flame_bloc/flame_riverpod), and the game reference passed to widgets.

**Q4. Who frees memory returned from a C function?**
Whoever allocated it, using the matching allocator. Expose native free functions, use Arena for temporary allocations, and use NativeFinalizer for objects tied to Dart lifetimes.

**Q5. How do you receive callbacks from native background threads?**
`NativeCallable.listener`, which posts calls to the Dart isolate asynchronously. Close it when finished.

**Q6. What are native assets/build hooks?**
A Dart/Flutter mechanism where packages declare build hooks (`hook/build.dart`) that compile or download native code, which the toolchain bundles automatically for each target platform.

**Q7. How would you implement debounce on a stream?**
A StreamTransformer (fromBind) with a Timer reset on each event, emitting the latest value when the timer fires, plus handling pause/resume/cancel and flushing on done. Or use stream_transform/rxdart.

**Q8. What does switchMap solve?**
It cancels the previous inner async operation when a new value arrives, so only the latest request's results are emitted. This prevents out-of-order search results.
