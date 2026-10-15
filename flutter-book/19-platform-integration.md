# Chapter 19 — Talking to Native: Platform Channels, Pigeon, FFI, Plugins, Platform Views, Add-to-App & Web Interop

> **Goal:** Call Kotlin/Swift/C/JS from Dart and back, write your own plugin, embed native views, and add Flutter into existing native apps. Senior interviews almost always include "how would you access a native SDK that has no Flutter plugin?"

---

## 19.1 5-year-old picture: walkie-talkies 📻

Dart lives in one house; Android (Kotlin) and iOS (Swift) live in neighbouring houses. They speak different languages. A **platform channel** is a **walkie-talkie** on a named frequency (`'com.myapp/battery'`). Dart says "getBatteryLevel, over!" and Kotlin answers "87, over!". Messages are translated into a common "radio language" by a **codec**.

---

## 19.2 Channel types

| Channel | Direction | Use |
|---|---|---|
| `MethodChannel` | Dart ↔ Native, request/response (async) | Call a function and get a result |
| `EventChannel` | Native → Dart stream | Sensors, location updates, connectivity changes |
| `BasicMessageChannel` | Bidirectional messages with custom codec | Custom protocols, strings/JSON |

All channel calls are **asynchronous** and messages are serialized with a codec: `StandardMessageCodec` supports `null`, `bool`, `int`, `double`, `String`, `Uint8List`/`Int32List`/`Int64List`/`Float64List`, `List`, `Map` (nested). Custom objects must be converted (Map) or use Pigeon.

| Dart | Kotlin | Swift |
|---|---|---|
| null | null | nil (NSNull when nested) |
| bool | Boolean | NSNumber(value: Bool) |
| int (≤32 bit) | Int | NSNumber(value: Int32) |
| int (>32 bit) | Long | NSNumber(value: Int) |
| double | Double | NSNumber(value: Double) |
| String | String | String |
| Uint8List | ByteArray | FlutterStandardTypedData(bytes:) |
| List | List | Array |
| Map | HashMap | Dictionary |

---

## 19.3 MethodChannel example: battery level

**Dart**
```dart
class BatteryService {
  static const _channel = MethodChannel('com.mycompany.app/battery');

  Future<int?> getBatteryLevel() async {
    try {
      return await _channel.invokeMethod<int>('getBatteryLevel');
    } on PlatformException catch (e) {     // native returned an error
      debugPrint('Failed: ${e.code} ${e.message}');
      return null;
    } on MissingPluginException {          // no handler registered on this platform (e.g., web, or forgot registration)
      return null;
    }
  }
}
```

**Android (Kotlin) — `MainActivity.kt`**
```kotlin
class MainActivity : FlutterActivity() {
    private val CHANNEL = "com.mycompany.app/battery"

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, CHANNEL).setMethodCallHandler { call, result ->
            when (call.method) {
                "getBatteryLevel" -> {
                    val level = getBatteryLevel()
                    if (level != -1) result.success(level)
                    else result.error("UNAVAILABLE", "Battery level not available.", null)
                }
                else -> result.notImplemented()
            }
        }
    }

    private fun getBatteryLevel(): Int {
        val bm = getSystemService(BATTERY_SERVICE) as BatteryManager
        return bm.getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY)
    }
}
```

**iOS (Swift) — `AppDelegate.swift`**
```swift
@main
@objc class AppDelegate: FlutterAppDelegate {
  override func application(_ application: UIApplication,
                            didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
    let controller = window?.rootViewController as! FlutterViewController
    let channel = FlutterMethodChannel(name: "com.mycompany.app/battery",
                                       binaryMessenger: controller.binaryMessenger)
    channel.setMethodCallHandler { call, result in
      guard call.method == "getBatteryLevel" else { result(FlutterMethodNotImplemented); return }
      UIDevice.current.isBatteryMonitoringEnabled = true
      let level = UIDevice.current.batteryLevel
      if level < 0 {
        result(FlutterError(code: "UNAVAILABLE", message: "Battery level not available.", details: nil))
      } else {
        result(Int(level * 100))
      }
    }
    GeneratedPluginRegistrant.register(with: self)
    return super.application(application, didFinishLaunchingWithOptions: launchOptions)
  }
}
```
> Note: newer Flutter iOS templates adopt the **UIScene** lifecycle and implicit engine registration (`FlutterImplicitEngineDelegate` / registering in `didInitializeImplicitFlutterEngine`) — follow the migration guide for your Flutter version when the template differs. The channel concepts are identical.

### Rules
* **Always** reply exactly once: `result.success`, `result.error`, or `result.notImplemented` — never twice (crash: "Reply already submitted"), never zero (Dart future hangs forever).
* Native handlers run on the **platform main thread** by default — don't block it; dispatch heavy work to a background thread and reply on the main thread (iOS: `DispatchQueue.main.async { result(...) }`; Android: post to main looper). (Android/iOS also support background **task queues** for channels: `binaryMessenger.makeBackgroundTaskQueue()`.)
* Dart → native calls must originate from the root isolate unless using `BackgroundIsolateBinaryMessenger`.
* Native → Dart calls: `channel.invokeMethod("onEvent", args)` on native; Dart side `channel.setMethodCallHandler((call) async { ... })`.

---

## 19.4 EventChannel example (native → Dart stream)

**Dart**
```dart
const _events = EventChannel('com.mycompany.app/charging');
Stream<String> get chargingStatus => _events.receiveBroadcastStream().map((e) => e as String);
```
**Kotlin**
```kotlin
EventChannel(flutterEngine.dartExecutor.binaryMessenger, "com.mycompany.app/charging")
  .setStreamHandler(object : EventChannel.StreamHandler {
      private var receiver: BroadcastReceiver? = null
      override fun onListen(arguments: Any?, events: EventChannel.EventSink) {
          receiver = object : BroadcastReceiver() {
              override fun onReceive(context: Context, intent: Intent) {
                  val status = intent.getIntExtra(BatteryManager.EXTRA_STATUS, -1)
                  events.success(if (status == BatteryManager.BATTERY_STATUS_CHARGING) "charging" else "discharging")
              }
          }
          registerReceiver(receiver, IntentFilter(Intent.ACTION_BATTERY_CHANGED))
      }
      override fun onCancel(arguments: Any?) {   // Dart cancelled subscription → clean up!
          unregisterReceiver(receiver); receiver = null
      }
  })
```

---

## 19.5 Pigeon — type-safe channels (recommended) 🕊️

Hand-written channels use stringly-typed method names and maps → runtime errors. **Pigeon** (official) generates type-safe Dart, Kotlin/Java, Swift/ObjC, C++ (Windows), GObject (Linux) code from a Dart interface definition.

`pigeons/messages.dart`:
```dart
import 'package:pigeon/pigeon.dart';

@ConfigurePigeon(PigeonOptions(
  dartOut: 'lib/src/messages.g.dart',
  kotlinOut: 'android/app/src/main/kotlin/com/mycompany/app/Messages.g.kt',
  kotlinOptions: KotlinOptions(package: 'com.mycompany.app'),
  swiftOut: 'ios/Runner/Messages.g.swift',
))

class DeviceInfo {
  DeviceInfo({required this.model, required this.osVersion, this.batteryLevel});
  String model;
  String osVersion;
  int? batteryLevel;
}

@HostApi()                          // Dart calls native
abstract class DeviceApi {
  DeviceInfo getDeviceInfo();
  @async
  bool requestPermission(String name);
}

@FlutterApi()                       // native calls Dart
abstract class DeviceEventsApi {
  void onLowBattery(int level);
}
```
Run: `dart run pigeon --input pigeons/messages.dart`. Then implement the generated `DeviceApi` interface in Kotlin/Swift and register with `DeviceApi.setUp(binaryMessenger, impl)`. In Dart: `final info = await DeviceApi().getDeviceInfo();` — fully typed. Pigeon also supports event channels (`@EventChannelApi`) in newer versions.

---

## 19.6 Dart FFI — calling C directly ⚡

**FFI (Foreign Function Interface)** calls C-ABI functions **synchronously**, with no message serialization — much faster than channels for compute-heavy native libraries (image processing, crypto, SQLite, ML runtimes, audio DSP, Rust libs).

```c
// native/add.c
#include <stdint.h>
int32_t add(int32_t a, int32_t b) { return a + b; }
```
```dart
import 'dart:ffi';
import 'dart:io';

typedef AddNative = Int32 Function(Int32 a, Int32 b);
typedef AddDart = int Function(int a, int b);

final DynamicLibrary lib = Platform.isAndroid
    ? DynamicLibrary.open('libadd.so')
    : DynamicLibrary.process();          // iOS: statically linked

final add = lib.lookupFunction<AddNative, AddDart>('add');
print(add(2, 3)); // 5
```
* Memory: `package:ffi` → `calloc`/`malloc`, `toNativeUtf8()`, **free manually** (`calloc.free(ptr)`) or use `Arena`/`using`. Native finalizers (`NativeFinalizer`) for cleanup.
* `@Native` annotations (Dart 3.x) for static binding resolution with **native assets / build hooks** (`hook/build.dart`, stable in Dart 3.10 / Flutter 3.38) — packages can compile and bundle native code automatically (C via `native_toolchain_c`, Rust via community tooling).
* **ffigen** generates bindings from C headers; **jnigen** generates Dart bindings for Java/Kotlin (Android) via JNI; **Objective-C/Swift** interop via ffigen (Objective-C bindings; Swift via `@objc` / swiftgen tooling). This "direct native interop" is the Flutter team's long-term direction to reduce channel boilerplate; combined with the merged UI/platform thread it enables synchronous calls to platform APIs.
* `flutter create --template=plugin_ffi` / `package_ffi` templates.
* Long-running native calls block the calling isolate → call from a helper isolate.
* Rust: `flutter_rust_bridge` generates high-level bindings (async, structs, streams) — popular for crypto/heavy logic.

### Channels vs FFI
| | Platform channels / Pigeon | FFI |
|---|---|---|
| Target | Platform APIs in Kotlin/Java/Swift/ObjC | C ABI (C, C++ via extern "C", Rust, Go via cgo) — and via jnigen/ffigen, Java/ObjC |
| Sync? | Async only | Sync (and async callbacks via NativeCallable) |
| Overhead | Serialization + thread hop | Very low |
| Use | Camera SDKs, payment SDKs, OS services | Compute libraries, DBs, codecs |

---

## 19.7 Writing a plugin 🔌

```bash
flutter create --template=plugin --platforms=android,ios,web --org com.mycompany my_scanner
```
Structure:
```
my_scanner/
├── lib/my_scanner.dart                       # public Dart API
├── lib/my_scanner_platform_interface.dart    # abstract PlatformInterface (federated style)
├── lib/my_scanner_method_channel.dart        # default MethodChannel implementation
├── android/src/main/kotlin/.../MyScannerPlugin.kt  # implements FlutterPlugin, MethodCallHandler, (ActivityAware)
├── ios/Classes/MyScannerPlugin.swift         # (or ios/my_scanner/Sources/... for SwiftPM)
├── example/                                  # example app (also used for integration tests)
└── pubspec.yaml  →  flutter: plugin: platforms: android: package/pluginClass, ios: pluginClass ...
```
Android plugin essentials:
* `FlutterPlugin.onAttachedToEngine` / `onDetachedFromEngine` (register/unregister channels).
* Need an `Activity` (permissions, startActivityForResult, UI)? Implement `ActivityAware` (`onAttachedToActivity`, `onDetachedFromActivityForConfigChanges`, ...) and `PluginRegistry.ActivityResultListener` / `RequestPermissionsResultListener`.
* Android V1 embedding (`Registrar`) is **removed** — old plugins using it don't compile with current Flutter ("No registrar"/"v1 embedding" errors). Update or fork.

iOS plugin: `FlutterPlugin` protocol, `register(with registrar:)`, `addApplicationDelegate` for app lifecycle events, Swift Package Manager support (`Package.swift`) + CocoaPods `.podspec`.

### Federated plugins
Split one plugin into packages: `my_scanner` (app-facing), `my_scanner_platform_interface` (abstract interface using `plugin_platform_interface` with token verification), `my_scanner_android`, `my_scanner_ios`, `my_scanner_web`, ... Benefits: different teams/maintainers per platform, add platforms without touching the core, endorsed implementations (`default_package` in pubspec). Used by official plugins (url_launcher, shared_preferences, camera…).

### Testing plugins
* Dart side: mock the channel:
```dart
TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
    .setMockMethodCallHandler(const MethodChannel('com.mycompany.app/battery'), (call) async {
  if (call.method == 'getBatteryLevel') return 42;
  return null;
});
```
* Or set `MyScannerPlatform.instance = FakePlatform();` (platform interface pattern).
* Native unit tests (JUnit / XCTest) in the example app; integration tests in `example/integration_test`.

---

## 19.8 Platform views — embedding native UI 🪟

When you need a **native view** inside Flutter (Google Maps, WebView, native ad views, a native video player/AR SDK):
* Android: `AndroidView` / `PlatformViewLink` with modes:
  * **Hybrid Composition (HC)** — native view added to the Android view hierarchy; best fidelity (accessibility, text input), but historically reduced Flutter performance / thread synchronization costs.
  * **Texture Layer Hybrid Composition (TLHC)** — renders native view into a texture; better Flutter performance; some views (SurfaceView-based) have issues.
  * **Virtual Display** (legacy fallback).
  * Newer Flutter versions (3.44) introduced an improved **"Hybrid Composition++"** mode for Android (requires Vulkan-capable devices) — check docs for status.
* iOS: `UiKitView` (native views composited with Flutter; costs extra layers — avoid many overlapping).
* macOS: `AppKitView`; Web: `HtmlElementView` (with `ui_web.platformViewRegistry.registerViewFactory`).

Costs: more memory, possible jank when scrolling many platform views, gesture conflicts (`gestureRecognizers: {Factory(() => EagerGestureRecognizer())}` to give the native view gestures inside scrollables), keyboard issues. Keep their number small; avoid platform views in long lists.

---

## 19.9 Add-to-App (Flutter inside an existing native app)

Large companies (e.g., banks, e-commerce) often adopt Flutter **incrementally**:
```bash
flutter create -t module my_flutter_module
```
* Android: include the module as a source dependency in `settings.gradle` or as AAR (`flutter build aar`); start with `FlutterActivity.withCachedEngine("engine_id")`, `FlutterFragment`, or `FlutterView`.
* iOS: embed via CocoaPods (`install_all_flutter_pods`) or frameworks (`flutter build ios-framework`); present `FlutterViewController(engine:)`.
* **Pre-warm & cache** `FlutterEngine` to avoid startup delay (engine startup takes time and memory). Use `FlutterEngineGroup` to create multiple lightweight engines sharing resources (multiple Flutter screens).
* Entry points: run a specific Dart function (`@pragma('vm:entry-point') void featureMain()`) and initial route.
* Communication with host via platform channels/Pigeon.
* Limitations/gotchas: multiple Flutter instances memory, plugin registration per engine, hot reload via `flutter attach`, consistent theming, back navigation between native/Flutter stacks.

---

## 19.10 Web interop (JS)

Modern way: **`dart:js_interop`** + **`package:web`** (replacing old `dart:html`, `dart:js`, `package:js`, which are deprecated and **don't work with Wasm**).
```dart
import 'dart:js_interop';
import 'package:web/web.dart' as web;

@JS('alert')
external void jsAlert(JSString message);

@JS('JSON.stringify')
external JSString stringify(JSAny? obj);

extension type Analytics._(JSObject _) implements JSObject {
  external void track(JSString event);
}
@JS('window.analytics')
external Analytics get analytics;

void demo() {
  jsAlert('Hello from Dart'.toJS);
  analytics.track('signup'.toJS);
  web.window.localStorage.setItem('k', 'v');
}
```
Conditional imports keep mobile code free of web libraries (Chapter 3).

---

## 19.11 Platform detection
```dart
import 'package:flutter/foundation.dart';
if (kIsWeb) { ... }
switch (defaultTargetPlatform) {          // works on web too (reports underlying OS)
  case TargetPlatform.android: ...
  case TargetPlatform.iOS: ...
  default: ...
}
// dart:io Platform.isAndroid — ❌ crashes on web; guard with kIsWeb first
Theme.of(context).platform                // overridable in tests/theme
```

---

## 19.12 Common native integration bugs
| Error | Cause / Fix |
|---|---|
| `MissingPluginException(No implementation found for method X on channel Y)` | Hot reload after adding plugin (do a full rebuild); channel name mismatch; plugin doesn't support platform; native registration missing (custom engine/add-to-app without `GeneratedPluginRegistrant`); background isolate |
| `PlatformException(...)` | Native returned error — read code/message; handle in Dart |
| Future never completes | Native handler never called `result` |
| `Reply already submitted` crash | result called twice |
| App crashes calling UI API from background thread | Reply/UI on main thread |
| `Unhandled Exception: type '_Map<Object?, Object?>' is not a subtype of type 'Map<String, dynamic>'` | Channel maps are `Map<Object?, Object?>` → `Map<String, dynamic>.from(result)` or `.cast<String, dynamic>()` (nested maps too!) |
| Release build: native class not found | R8/ProGuard stripped it → add `-keep` rules |
| iOS: plugin not found | `pod install` not run / SwiftPM issue / min iOS version |
| Plugin uses v1 embedding | Upgrade plugin/fork |
| FFI `Failed to lookup symbol` | Wrong lib name, symbol mangled (C++ needs `extern "C"`), library not bundled for ABI, iOS symbol stripped (`-Wl,-u` / mark as used) |

---

## 19.13 Interview Questions — Platform integration

**Q1. What are platform channels?** Named asynchronous message channels between Dart and host platform code using codecs; MethodChannel (RPC), EventChannel (streams), BasicMessageChannel (messages).

**Q2. How would you use a native SDK without a Flutter plugin?** Write a plugin or in-app channel code (preferably Pigeon) wrapping the SDK in Kotlin/Swift, expose a Dart API, handle lifecycle/threading/errors, test on both platforms; or FFI if it's a C library; or jnigen/ffigen for direct bindings.

**Q3. What is Pigeon?** A code generator producing type-safe channel code for Dart and native languages from a Dart interface definition.

**Q4. What is Dart FFI and when would you use it?** Direct synchronous calls into C-ABI libraries with minimal overhead — compute-heavy or existing native libraries.

**Q5. MethodChannel vs EventChannel?** Request/response vs continuous native→Dart event stream.

**Q6. What is a federated plugin?** A plugin split into app-facing, platform-interface and per-platform implementation packages.

**Q7. What are platform views and their costs?** Embedding native views in the Flutter tree (AndroidView/UiKitView/HtmlElementView); costs in performance, memory, composition and gestures.

**Q8. What is add-to-app?** Integrating Flutter modules into existing native apps; uses cached/pre-warmed FlutterEngines and channels for communication.

**Q9. Which thread do platform channel handlers run on?** The platform main thread by default (background task queues are available); responses should be sent on the main thread.

**Q10. How do you call JS from Flutter web?** `dart:js_interop` with `@JS` external declarations and extension types; `package:web` for DOM APIs.

**Q11. Why does `MissingPluginException` happen?** No registered native implementation for that channel on the current engine/platform — commonly after hot reload of a newly added plugin, in tests, unsupported platform, or wrong channel name.
