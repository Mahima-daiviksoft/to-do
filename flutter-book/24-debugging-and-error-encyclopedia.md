# Chapter 24 — Debugging Mastery & the Flutter Error Encyclopedia

> **Goal:** A systematic debugging method plus a lookup table of the errors you will meet in real projects — what they mean, why they happen, and exactly how to fix them. Keep this chapter open while working.

---

## 24.1 The debugging method (works for every bug) 🕵️

1. **Read the FIRST error** in the console, completely. Flutter error messages are detailed and often contain the fix. Later errors are often consequences.
2. **Reproduce** reliably. Note platform, device, OS version, build mode, Flutter version, app version, user state (logged in?), network state.
3. **Isolate**: minimal reproduction (new screen/DartPad/`flutter create` sample). Binary search with git (`git bisect`) to find the commit that introduced it.
4. **Inspect**: breakpoints, `debugPrint`, DevTools inspector, logs (`flutter logs`, `adb logcat`, Xcode console / Console.app).
5. **Hypothesize → test → confirm**. Change one thing at a time.
6. **Fix the root cause**, not the symptom (e.g., don't wrap everything in try/catch or add `!`).
7. **Add a regression test**.
8. **Document** (PR description, postmortem for incidents).

### Debugging tools & tricks
* Breakpoints & conditional breakpoints in VS Code/Android Studio; "Break on exceptions" (uncaught/all).
* `debugger();` from `dart:developer` — programmatic breakpoint.
* `debugPrint`, `log('msg', name: 'Cart', error: e, stackTrace: st)` (DevTools Logging view).
* `debugDumpApp()`, `debugDumpRenderTree()`, `debugDumpLayerTree()`, `debugDumpSemanticsTree()`, `debugDumpFocusTree()`.
* `debugPaintSizeEnabled`, `debugPaintBaselinesEnabled`, `debugPaintPointersEnabled`, `debugRepaintRainbowEnabled`, `debugPrintRebuildDirtyWidgets`, `debugPrintBeginFrameBanner`, `timeDilation = 5.0` (slow animations).
* `toString()`/`toStringShort()`/`debugFillProperties` for readable diagnostics in your classes.
* `FlutterError.demangleStackTrace`, `StackTrace.current`, `Chain.capture` (package `stack_trace`) for async stack chains.
* Network: DevTools Network tab, Charles/Proxyman/mitmproxy (needs trusting user CAs on Android: network security config for debug builds), `LogInterceptor`.
* Native: Android Studio (attach debugger to Android process, Logcat filters), Xcode (Debug → Attach to process; exception breakpoints; Instruments).
* Release-only bugs: `flutter run --release` locally; check R8/ProGuard, obfuscation, missing manifest permissions, `kDebugMode`-only code, asserts that hid issues, tree-shaken entry points (`@pragma('vm:entry-point')`).
* Crash reports: Crashlytics/Sentry with breadcrumbs; symbolize obfuscated traces with `flutter symbolize`.

---

## 24.2 Error encyclopedia — Layout & rendering

| # | Error | Meaning / Cause | Fix |
|---|---|---|---|
| 1 | **A RenderFlex overflowed by N pixels on the right/bottom** | Row/Column children exceed available space | `Expanded`/`Flexible`, text `overflow`, `Wrap`, scroll view, smaller content |
| 2 | **Vertical viewport was given unbounded height** | Scrollable inside an unbounded-height parent (Column, another scrollable) | `Expanded`, fixed `SizedBox` height, slivers; last resort `shrinkWrap` |
| 3 | **Horizontal viewport was given unbounded width** | Horizontal list inside Row | `Expanded` / fixed width |
| 4 | **RenderBox was not laid out: RenderXxx** | Consequence of earlier constraint error | Fix the first error |
| 5 | **BoxConstraints forces an infinite width/height** | Widget wants infinite size (e.g., `SizedBox.expand`, `double.infinity` width) inside unbounded parent | Provide bounds |
| 6 | **An InputDecorator, which is typically created by a TextField, cannot have an unbounded width** | TextField in Row | `Expanded(child: TextField())` |
| 7 | **RenderFlex children have non-zero flex but incoming height constraints are unbounded** | `Expanded`/`Spacer` inside Column inside scroll view | Remove Expanded or use `SliverFillRemaining(hasScrollBody: false)` / IntrinsicHeight pattern |
| 8 | **Incorrect use of ParentDataWidget** | Expanded/Flexible not direct child of Flex; Positioned not direct child of Stack | Restructure |
| 9 | **Cannot hit test a render box with no size** / **'hasSize': is not true** | Querying size before layout / invisible widget | Use post-frame callback; ensure layout |
| 10 | **A RenderViewport expected a child of type RenderSliver but received RenderBox** | Box widget in `slivers:` | `SliverToBoxAdapter`, `SliverPadding` |
| 11 | **'Cannot provide both a color and a decoration'** | Container with both | Move color into BoxDecoration |
| 12 | **Text has yellow double underline** | Text without a `Material`/`DefaultTextStyle` ancestor (e.g., in Hero flight, Overlay, or no Scaffold) | Wrap in `Material` or `Scaffold`, set style |
| 13 | **Black/blank screen on launch** | Exception before first frame; missing `runApp`; awaiting a never-completing future in main; iOS: missing LaunchScreen | Check logs; wrap init in try/catch; ensure `runApp` |
| 14 | **Red screen "Exception caught by widgets library"** (debug) / **grey box** (release) | Exception thrown in `build` | Fix the exception; customize `ErrorWidget.builder` |
| 15 | **LayoutBuilder does not support returning intrinsic dimensions** | LayoutBuilder inside IntrinsicHeight/Width or something asking intrinsics | Avoid intrinsics around LayoutBuilder |
| 16 | Image appears blurry | Low-res asset / wrong devicePixelRatio variant / `cacheWidth` too small | Provide 2x/3x assets; correct cache size |
| 17 | **Unable to load asset: assets/...** | Not declared in pubspec, wrong path/case (case-sensitive on Linux/Android!), subfolder not listed, needs full restart | Fix pubspec & path; `flutter clean` |
| 18 | Status bar icons invisible | Light icons on light background | `AnnotatedRegion<SystemUiOverlayStyle>` / AppBar `systemOverlayStyle` |
| 19 | Content behind navigation bar / notch (Android 15 edge-to-edge) | Not handling insets | `SafeArea`, `MediaQuery.paddingOf` |

---

## 24.3 Error encyclopedia — State & lifecycle

| # | Error | Cause | Fix |
|---|---|---|---|
| 20 | **setState() called after dispose()** | Async result/timer/stream after widget removed | `if (!mounted) return;`, cancel subscriptions/timers in dispose |
| 21 | **setState() or markNeedsBuild() called during build** | Triggering rebuilds (setState/notifyListeners/provider update) while building | Move to callbacks; `WidgetsBinding.instance.addPostFrameCallback` |
| 22 | **dependOnInheritedWidgetOfExactType<X>() ... was called before initState() completed** | `Theme.of`/`MediaQuery.of`/`Provider.of(listen:true)` in initState | Use `didChangeDependencies` or `context.read` (no listen) |
| 23 | **Looking up a deactivated widget's ancestor is unsafe** | Using context of a disposed widget (after await, in dispose, in dialog after page popped) | Capture `Navigator.of(context)`/`ScaffoldMessenger.of(context)` before await; check `context.mounted` |
| 24 | **This widget has been unmounted, so the State no longer has a context** | Same as above | Same |
| 25 | **Multiple widgets used the same GlobalKey** | GlobalKey reused (static key, key created once but widget shown twice, two routes) | One key per widget instance |
| 26 | **Duplicate keys found** | Same ValueKey among siblings | Unique ids |
| 27 | **A dismissed Dismissible widget is still part of the tree** | Didn't remove item from list in onDismissed | Remove from data + setState |
| 28 | **LateInitializationError: Field 'x' has not been initialized** | late read before assignment | Initialize earlier / nullable |
| 29 | **Null check operator used on a null value** | `!` on null (common: `_formKey.currentState!` when Form not built, `snapshot.data!` when not loaded, `widget.x!`) | Check nulls; correct lifecycle |
| 30 | **A XYZ was used after being disposed** (ChangeNotifier/AnimationController/TextEditingController) | Using after dispose, double dispose, Provider `create` disposing shared instance | Single owner; `.value` providers for existing objects |
| 31 | **Bad state: Stream has already been listened to** | Second listener on single-subscription stream (e.g., StreamBuilder rebuilt with same stream after `.listen`, or two StreamBuilders) | `asBroadcastStream()`/broadcast controller; don't listen twice |
| 32 | **Bad state: Cannot add new events after calling close** | Adding to closed StreamController (often in dispose race) | Check `isClosed`; order of disposal |
| 33 | **StateError: Cannot emit new states after calling close** (Bloc) | Emitting after bloc closed (await gaps) | Check `isClosed`; cancel work on close |
| 34 | **emit was called after an event handler completed normally** (Bloc) | emit inside stream.listen callback / unawaited future | `await emit.forEach`/`onEach`; await all futures |
| 35 | **Could not find the correct Provider<X> above this Widget** | Provider not ancestor (same build, new route, wrong type/import) | Builder/Consumer, move provider up, `.value` in new routes, consistent imports |
| 36 | **Tried to listen to a value exposed with provider, from outside of the widget tree** | `watch`/`Provider.of` in callbacks | `read` |
| 37 | **Bad state: No ProviderScope found** (Riverpod) | Missing root `ProviderScope` | Wrap app |
| 38 | **Tried to modify a provider while the widget tree was building** (Riverpod) | State change during build/initState/didChangeDependencies | Delay with `Future(() => ...)`/post-frame or move to event |
| 39 | State not updating when parent changes value | Copied widget property into state only in initState | `didUpdateWidget` or read `widget.x` directly |
| 40 | UI doesn't update after modifying list | Mutated same list instance (ValueNotifier/Bloc/Riverpod equality) | Create new list (`[...old, item]`) |
| 41 | Infinite rebuild loop / repeated API calls | Future/stream created in build; setState in build; provider watching something it changes | Create in initState/state layer |
| 42 | TextField loses text/focus | Controller or key recreated on rebuild | Create controller once; avoid UniqueKey |

---

## 24.4 Error encyclopedia — Navigation & context

| # | Error | Fix |
|---|---|---|
| 43 | **Navigator operation requested with a context that does not include a Navigator** | Use context under MaterialApp (Builder) or a navigatorKey |
| 44 | **Scaffold.of() called with a context that does not contain a Scaffold** | Builder / separate widget / GlobalKey<ScaffoldState> |
| 45 | **No MaterialLocalizations found** | Widget (e.g., showDatePicker, TextField context menu) needs MaterialApp & localizations delegates; in tests wrap with MaterialApp |
| 46 | **No Material widget found** (e.g., InkWell/TextField/ListTile outside Material) | Wrap with `Material`/`Scaffold` |
| 47 | **No MediaQuery widget ancestor found** | Use under MaterialApp/WidgetsApp or `MediaQuery` in tests |
| 48 | **No Overlay widget found** (tooltip/dropdown above Navigator) | Use under MaterialApp |
| 49 | **There are multiple heroes that share the same tag within a subtree** | Unique hero tags per route |
| 50 | **'!_debugLocked': is not true** | Navigator push/pop during another navigation or during build | Defer with post-frame callback |
| 51 | **GoException: no routes for location** | Wrong path / missing route / leading slash | Fix routes, add errorBuilder |
| 52 | Black screen after `pop` | Popped last route | `canPop`/`maybePop` |

---

## 24.5 Error encyclopedia — Async, types & Dart

| # | Error | Fix |
|---|---|---|
| 53 | **type 'Null' is not a subtype of type 'String' in type cast** | JSON key missing/null → nullable fields & defaults; validate data |
| 54 | **type 'List<dynamic>' is not a subtype of type 'List<String>'** | `.cast<String>()` / `List<String>.from(...)` |
| 55 | **type '_Map<String, dynamic>' is not a subtype of type 'Map<String, String>'** | `Map<String, String>.from(...)` |
| 56 | **type 'int' is not a subtype of type 'double'** | `(x as num).toDouble()` |
| 57 | **_TypeError ... '_InternalLinkedHashMap<Object?, Object?>'** (platform channel results) | `Map<String, dynamic>.from(result as Map)` (recursively) |
| 58 | **Unhandled Exception: ...** (async) | Await futures inside try/catch; handle stream errors; global handlers |
| 59 | **FormatException: Unexpected character (at character 1) <!DOCTYPE html>** | Server returned HTML (error page/login redirect/wrong URL) instead of JSON → check status codes & URL before decoding |
| 60 | **RangeError (index): Invalid value: Not in inclusive range 0..N** | Index bounds; list changed during async gap |
| 61 | **Concurrent modification during iteration** | Iterate over a copy |
| 62 | **Stack Overflow** | Infinite recursion (getter calling itself, `==` calling itself, build recursion) |
| 63 | **NoSuchMethodError: The method 'x' was called on null / Class 'X' has no instance method 'y'** | dynamic misuse → add types |
| 64 | **TimeoutException after 0:00:10** | Slow network/server; tune timeouts; retry |
| 65 | **Isolate: Illegal argument in isolate message: (object is a ReceivePort / closure capturing unsendable)** | Send only sendable data; don't capture `this` with sockets/streams |
| 66 | **Binding has not yet been initialized** | `WidgetsFlutterBinding.ensureInitialized()` before using plugins; in tests `TestWidgetsFlutterBinding.ensureInitialized()` |
| 67 | **Zone mismatch** | ensureInitialized and runApp in different zones → same zone |

---

## 24.6 Error encyclopedia — Build, Gradle, CocoaPods, Xcode

| # | Error | Fix |
|---|---|---|
| 68 | **Gradle task assembleDebug failed with exit code 1** | Scroll up for the real error; `cd android && ./gradlew assembleDebug --stacktrace --info` |
| 69 | **Unsupported class file major version 61/65/67** | JDK too new for Gradle → upgrade Gradle wrapper/AGP, or `flutter config --jdk-dir` to JDK 17 |
| 70 | **Minimum supported Gradle version is X. Current version is Y** | Update `gradle-wrapper.properties` `distributionUrl` |
| 71 | **Your project's Android Gradle Plugin version is lower than Flutter's minimum supported version** | Update AGP in `settings.gradle(.kts)` |
| 72 | **Manifest merger failed: minSdkVersion X cannot be smaller than version Y declared in library** | Raise `minSdk` |
| 73 | **Namespace not specified** (AGP 8) | Add `namespace` in module build.gradle; update old plugins |
| 74 | **Duplicate class kotlin.collections.jdk8...** | Kotlin stdlib version conflict → align Kotlin version / Kotlin BOM |
| 75 | **Execution failed for task ':app:mergeDexRelease'** / 64K method limit | minSdk ≥ 21 (multidex native) |
| 76 | **Execution failed for task ':app:minifyReleaseWithR8' / Missing classes detected** | Add ProGuard `-keep`/`-dontwarn` rules from plugin docs (`missing_rules.txt` generated) |
| 77 | **Inconsistent JVM-target compatibility detected for tasks 'compileDebugJavaWithJavac' (1.8) and 'compileDebugKotlin' (17)** | Align `compileOptions` & `kotlinOptions.jvmTarget` (or `kotlin { jvmToolchain(17) }`) |
| 78 | **SDK location not found** | `local.properties` `sdk.dir` / `ANDROID_HOME` |
| 79 | **Build failed due to use of deleted Android v1 embedding** | Migrate app/plugin to v2 embedding (FlutterActivity from `io.flutter.embedding.android`) |
| 80 | **Keystore file not found for signing config 'release'** / **Failed to read key from store: Keystore was tampered with, or password was incorrect** | Check `key.properties` paths/passwords |
| 81 | **CocoaPods could not find compatible versions for pod "X"** | `pod repo update`, raise iOS deployment target in Podfile, delete Podfile.lock & Pods |
| 82 | **The iOS deployment target 'IPHONEOS_DEPLOYMENT_TARGET' is set to 9.0, but the range of supported deployment target versions is 12.0 to 18.x** | Post-install hook in Podfile to set min target for pods / update pods |
| 83 | **No such module 'Flutter'** / **'Flutter/Flutter.h' file not found** | Open `.xcworkspace`; `flutter clean && flutter pub get && cd ios && pod install`; build from Flutter first |
| 84 | **Signing for "Runner" requires a development team** | Set Team in Xcode Signing & Capabilities |
| 85 | **Provisioning profile doesn't include the X capability / entitlement** | Regenerate profile with capability (Push, Associated Domains) |
| 86 | **Module compiled with Swift X cannot be imported by Swift Y** | Clean derived data; update pods/Xcode |
| 87 | **Sandbox: rsync.samba deny file-write-create** (Xcode 15+) | Set `ENABLE_USER_SCRIPT_SANDBOXING = NO` for Runner build settings (common with some pod scripts) |
| 88 | **Command PhaseScriptExecution failed with a nonzero exit code** | Generic; read the script log; often FLUTTER_ROOT, CocoaPods, or flutter build errors |
| 89 | **Error (Xcode): ... Flutter.framework ... does not contain bitcode** | Disable bitcode (deprecated) |
| 90 | **Invalid Bundle / ITMS-90xxx on upload** | Read Apple's message: missing icons, privacy manifest (PrivacyInfo.xcprivacy required for certain APIs since 2024), invalid architectures, missing usage descriptions |
| 91 | **ITMS-91053: Missing API declaration** | Add privacy manifest declaring required-reason APIs (update plugins that include their own manifests) |
| 92 | **Target of URI doesn't exist: 'package:x/x.dart'** | `flutter pub get`; check package name & path; IDE restart (analysis server) |
| 93 | **The getter 'x' isn't defined for the type ...** after codegen change | Run build_runner again; delete conflicting outputs |
| 94 | **Conflicting outputs were detected and the build is unable to prompt** | `--delete-conflicting-outputs` |
| 95 | **Because X depends on Y ... version solving failed** | Chapter 2 §2.5.2 |

---

## 24.7 Error encyclopedia — Platform & plugins

| # | Error | Fix |
|---|---|---|
| 96 | **MissingPluginException(No implementation found for method ...)** | Full rebuild (not hot reload) after adding plugin; platform supported? channel name? background isolate? add-to-app registration? tests mocked? |
| 97 | **PlatformException(sign_in_failed, ApiException: 10)** (Google Sign-In Android) | SHA-1/SHA-256 of signing keys (debug, upload, Play signing) not registered in Firebase/Google Cloud |
| 98 | **PlatformException(already_active, Image picker is already active)** | Prevent double taps |
| 99 | **Permission denied crash on iOS when requesting camera** | Info.plist usage description missing |
| 100 | **CERTIFICATE_VERIFY_FAILED** | Invalid cert / missing intermediate / device date wrong / outdated root store |
| 101 | **SocketException: Failed host lookup** | No internet/DNS/emulator network; Android INTERNET permission in release |
| 102 | **XMLHttpRequest error** (web) | CORS, mixed content, server down |
| 103 | **Unsupported operation: Platform._operatingSystem** (web) | `dart:io` Platform on web → `kIsWeb`/`defaultTargetPlatform` |
| 104 | WebView blank on Android | Missing internet permission / cleartext / JS disabled (`setJavaScriptMode(JavaScriptMode.unrestricted)`) |
| 105 | Google Maps blank/grey | API key missing/restricted wrongly, Maps SDK not enabled, billing not enabled |
| 106 | Push not received | Chapter 18 table |
| 107 | Deep link opens browser | Verification failure — Chapter 11 |
| 108 | Release crash only, ClassNotFoundException | R8 removed class → keep rules |
| 109 | `flutter_secure_storage` crash after restore | Backup excluded / reset on error |
| 110 | Background handler not running in release | `@pragma('vm:entry-point')` |

---

## 24.8 "What would you do if…" — situational playbook 📘

**…the app crashes for 2% of users after a release?**
1. Check Crashlytics/Sentry: group by issue, versions, devices, OS.
2. If severe: **halt staged rollout** (Play Console) / pause phased release (App Store), toggle a **feature flag/kill switch** if the feature is flagged.
3. Reproduce with the same OS/device (Firebase Test Lab).
4. Hotfix → test → expedited release; consider code push (Shorebird) for Dart-only fixes if your org uses it (respect store policies).
5. Postmortem: root cause, why tests didn't catch it, add regression test & monitoring.

**…the list screen is janky on low-end Android?** Profile mode → DevTools → identify UI vs raster → apply Chapter 23 fixes (builders, images, const, isolates, effects) → verify on the same device.

**…a screen is slow to load data?** Check network waterfall (sequential calls?), payload size, server latency, parsing on main thread, caching (show cached first), pagination, prefetch.

**…users report being logged out randomly?** Token refresh race (parallel 401s), refresh token rotation conflicts, secure storage read failures (Keychain accessibility when locked/background), clock skew with JWT expiry, server revoking sessions → add logging around auth, use queued refresh.

**…the app works in debug but not in release?** Missing INTERNET permission, R8 stripping, obfuscation breaking reflection/`runtimeType.toString()` logic, `kDebugMode`-guarded init, tree-shaken entry points, env/config differences, asserts masking bugs.

**…build fails after upgrading Flutter?** Read the breaking changes page for that version; `dart fix --apply`; update Gradle/AGP/Kotlin per Flutter's warnings; update plugins (`flutter pub upgrade --major-versions` carefully); `flutter clean`; pod repo update. Upgrade on a branch with CI; never on release day.

**…two features conflict in state (e.g., cart badge stale)?** Ensure single source of truth (cart repository stream), derived values computed not duplicated, invalidate/refresh on mutations.

**…memory grows until crash on image-heavy screens?** `cacheWidth`, limit ImageCache, dispose controllers, check leaks via snapshots.

**…a plugin is abandoned and broken on new Android/iOS?** Check forks/community alternatives; fork & patch (git dependency pinned to commit) and upstream PR; or write your own minimal plugin with Pigeon.

**…a production bug you can't reproduce?** Add breadcrumbs/logging (non-PII) around the flow, remote config–controlled verbose logging, collect device/OS/version patterns, try same conditions (slow network via network link conditioner, low memory, different locale/timezone/text scale, RTL, dark mode, accessibility settings, process death via "Don't keep activities").

---

## 24.9 Interview Questions — Debugging

**Q1. How do you debug a layout overflow?** Read error (which RenderFlex, by how much), use Inspector layout explorer / debugPaintSizeEnabled, apply Expanded/Flexible/scroll/overflow handling.

**Q2. How do you debug a release-only crash?** Reproduce with `--release`, check logs (logcat/Xcode), symbolicate obfuscated traces, check R8 rules/permissions/entry points/config differences.

**Q3. What does "setState called after dispose" mean and how to prevent it?** Async callback updating a disposed State; check `mounted`, cancel subscriptions/timers/requests in dispose.

**Q4. How do you handle "Null check operator used on a null value"?** Find the `!` in the stack trace, understand why null occurs (lifecycle/data), replace with proper null handling/state modelling.

**Q5. What tools do you use for debugging Flutter apps?** IDE debugger, DevTools (inspector, performance, CPU, memory, network, logging), logs, crash reporting, proxies, native debuggers.

**Q6. How do you debug network issues?** DevTools Network tab, interceptor logs (debug only), proxy tools, verifying status codes/headers/body, testing with curl/Postman, checking platform configs (permissions, ATS, CORS).
