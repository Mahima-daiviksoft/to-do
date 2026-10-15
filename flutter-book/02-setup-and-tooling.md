# Chapter 2 — Setup, Tooling, Project Structure & the Flutter CLI

> **Goal:** Install Flutter correctly, understand every file in a new project, master the CLI, pub (package manager), versioning, and IDE tools. Most "it doesn't build!" problems in companies come from this chapter's topics.

---

## 2.1 Installing Flutter (all platforms)

### 2.1.1 What you need
| You want to build for | You need |
|---|---|
| Android | Android Studio (or command-line tools), Android SDK, a JDK (Android Studio bundles one), an emulator or device |
| iOS / macOS | A **Mac** with **Xcode**, plus CocoaPods (still used by many plugins) — Swift Package Manager is increasingly the default |
| Web | Chrome (for debugging) |
| Windows | Visual Studio (not VS Code) with "Desktop development with C++" workload |
| Linux | clang, cmake, ninja-build, pkg-config, libgtk-3-dev |

> You **cannot** build an iOS app on Windows/Linux locally. Companies use Macs or cloud CI Macs (Codemagic, GitHub Actions macOS runners, Bitrise).

### 2.1.2 Steps (conceptually the same on every OS)
1. Download the Flutter SDK (zip from docs.flutter.dev, or `git clone https://github.com/flutter/flutter.git -b stable`). The VS Code Flutter extension can also download the SDK for you.
2. Add `flutter/bin` to your **PATH**.
3. Run `flutter doctor` — it checks everything and tells you what is missing.
4. Accept Android licenses: `flutter doctor --android-licenses`.
5. Install IDE plugins: **Flutter** and **Dart** plugins for VS Code or Android Studio / IntelliJ.

### 2.1.3 `flutter doctor` explained like you're 5
`flutter doctor` is a **doctor that checks your computer's health for Flutter**. Each line is a check:
```
[✓] Flutter (Channel stable, 3.x.x, ...)
[✓] Android toolchain - develop for Android devices
[✗] Xcode - develop for iOS and macOS        ← missing!
[✓] Chrome - develop for the web
[!] Android Studio (version ...)              ← warning
[✓] Connected device (2 available)
[✓] Network resources
```
* `✓` healthy · `!` warning (may work) · `✗` broken. Use `flutter doctor -v` for details.

---

## 2.2 Channels & versions

Flutter has **release channels**:
| Channel | What | Who should use |
|---|---|---|
| **stable** | Tested releases, roughly quarterly + hotfixes | Production apps — ALWAYS |
| **beta** | Monthly-ish preview of next stable | Trying new features |
| **main** | Latest commits, may break | Contributors |

(The old `dev` channel was retired in 2022.)

```bash
flutter channel            # show channels
flutter channel stable     # switch
flutter upgrade            # upgrade current channel
flutter downgrade          # go back to previous version on that channel
flutter --version          # show Flutter, engine, Dart versions
```

### 2.2.1 Version pinning in teams — **FVM**
In a company, **everyone must use the same Flutter version**; otherwise "works on my machine" bugs appear (different lint rules, generated code, Gradle versions).

**FVM (Flutter Version Management)** solves this:
```bash
dart pub global activate fvm
fvm install 3.x.x
fvm use 3.x.x          # writes .fvmrc in the project
fvm flutter run        # use the pinned version
```
Commit `.fvmrc` to git; add `.fvm/` (the symlink folder) to `.gitignore`. CI uses the same version (e.g., `subosito/flutter-action` in GitHub Actions reading the version from the file).

Alternatives: asdf/mise version managers, or specifying `flutter:` constraint in `pubspec.yaml` `environment:` (which only *checks* — it does not install).

---

## 2.3 Creating a project

```bash
flutter create my_app                              # default counter app
flutter create --org com.mycompany my_app          # sets bundle id / package name prefix
flutter create --platforms=android,ios my_app      # only some platforms
flutter create -t package my_package               # pure Dart/Flutter package
flutter create -t plugin --platforms=android,ios my_plugin   # plugin with native code
flutter create -t plugin_ffi my_ffi_plugin         # FFI plugin
flutter create -e my_app                           # "empty" minimal app (no counter comments)
flutter create -t module my_module                 # add-to-app module
```

> **Tip:** Always set `--org` up front. Changing the Android `applicationId` and iOS bundle identifier later is tedious (but possible — see Chapter 26).

---

## 2.4 Project structure — every file explained

```
my_app/
├── android/                  ← Native Android project (Gradle)
│   ├── app/
│   │   ├── build.gradle(.kts)  ← app module config: applicationId, minSdk, signing, flavors
│   │   └── src/main/
│   │       ├── AndroidManifest.xml  ← permissions, activities, deep links, app name
│   │       ├── kotlin/.../MainActivity.kt  ← extends FlutterActivity
│   │       └── res/          ← icons (mipmap), launch background, styles
│   ├── build.gradle(.kts)    ← project-level Gradle
│   ├── settings.gradle(.kts) ← plugin management, Flutter Gradle plugin, AGP & Kotlin versions
│   └── gradle/wrapper/gradle-wrapper.properties ← Gradle version
├── ios/                      ← Native iOS project (Xcode)
│   ├── Runner/
│   │   ├── AppDelegate.swift ← FlutterAppDelegate
│   │   ├── Info.plist        ← permissions descriptions, URL schemes, display name
│   │   └── Assets.xcassets   ← app icons, launch images
│   ├── Runner.xcworkspace    ← OPEN THIS in Xcode (not .xcodeproj) when CocoaPods is used
│   └── Podfile               ← CocoaPods deps (platform :ios, 'xx.0')
├── lib/                      ← YOUR DART CODE lives here
│   └── main.dart             ← entry point
├── test/                     ← unit & widget tests (files must end with _test.dart)
├── integration_test/         ← integration tests (you create it)
├── web/                      ← index.html, manifest.json, icons for web
├── windows/ macos/ linux/    ← desktop runners
├── assets/                   ← (you create) images, fonts, json
├── pubspec.yaml              ← project manifest: name, version, deps, assets, fonts
├── pubspec.lock              ← exact resolved versions (COMMIT for apps)
├── analysis_options.yaml     ← lint rules
├── .metadata                 ← used by flutter tool for migrations; commit it
├── .dart_tool/               ← generated tool cache (DON'T commit)
├── build/                    ← build outputs (DON'T commit)
└── README.md
```

### 2.4.1 `pubspec.yaml` deeply explained
```yaml
name: my_app                       # package name: lowercase_with_underscores
description: "A new Flutter project."
publish_to: 'none'                 # prevents accidental `pub publish` of an app

version: 1.2.3+45                  # versionName 1.2.3 + build number 45
                                   # Android: versionName=1.2.3, versionCode=45
                                   # iOS: CFBundleShortVersionString=1.2.3, CFBundleVersion=45

environment:
  sdk: ^3.5.0                      # Dart SDK constraint (also enables language features by version!)
  flutter: ">=3.24.0"              # optional minimum Flutter

dependencies:                      # needed at runtime
  flutter:
    sdk: flutter
  cupertino_icons: ^1.0.8
  http: ^1.2.0                     # caret syntax: >=1.2.0 <2.0.0
  my_local_pkg:
    path: ../packages/my_local_pkg # local path dependency
  some_fork:
    git:
      url: https://github.com/me/some_fork.git
      ref: v1.0.1                  # branch, tag or commit — pin it!
      path: packages/some_fork     # subdirectory, optional

dev_dependencies:                  # only for development: tests, code generation, lints
  flutter_test:
    sdk: flutter
  flutter_lints: ^5.0.0
  build_runner: ^2.4.0

dependency_overrides:              # FORCE a version (use sparingly, document why!)
  intl: 0.19.0

flutter:
  uses-material-design: true       # includes Material Icons font
  generate: true                   # needed for gen-l10n (localization) in many setups
  assets:
    - assets/images/               # folder (NOT recursive into subfolders!)
    - assets/config/app.json       # single file
  fonts:
    - family: Inter
      fonts:
        - asset: assets/fonts/Inter-Regular.ttf
        - asset: assets/fonts/Inter-Bold.ttf
          weight: 700
```

#### Semantic versioning (SemVer) & caret syntax
`MAJOR.MINOR.PATCH` → `2.4.1`
* **MAJOR** — breaking changes.
* **MINOR** — new features, backwards compatible.
* **PATCH** — bug fixes.

`^1.2.3` means `>=1.2.3 <2.0.0`. **Special case for 0.x:** `^0.2.3` means `>=0.2.3 <0.3.0` (because in 0.x, minor bumps may break).

Other constraints: `any` (avoid!), `">=1.0.0 <3.0.0"`, `1.2.3` (exact).

#### `environment: sdk:` lower bound is important
The **lower bound** of your Dart SDK constraint decides the **language version** your package uses. Example: features like records/patterns need `sdk: ^3.0.0`; dot shorthands need `^3.10.0`; primary constructors need `^3.13.0`. If your lower bound is too low, the analyzer says *"This requires the 'xyz' language feature to be enabled."*

### 2.4.2 `pubspec.lock` — commit or not?
* **Apps: COMMIT IT.** Everyone and CI gets the *exact same* versions → reproducible builds.
* **Packages (libraries): historically not committed**, because consumers resolve their own versions. (Modern guidance: committing it in packages is OK for your own CI reproducibility; it is ignored by consumers anyway.)

### 2.4.3 Assets gotcha
```yaml
assets:
  - assets/images/
```
This includes files **directly** inside `assets/images/` but **not** `assets/images/icons/`. You must list subfolders separately. This is a top-3 beginner bug: *"Unable to load asset"*.

Also: resolution-aware images:
```
assets/images/logo.png        ← 1.0x
assets/images/2.0x/logo.png   ← used on 2x screens
assets/images/3.0x/logo.png   ← used on 3x screens
```
You still reference `assets/images/logo.png`; Flutter picks the best variant.

---

## 2.5 Pub — the package manager

```bash
flutter pub get                    # download deps per pubspec (creates/updates lock)
flutter pub add dio                # add latest compatible dep
flutter pub add --dev mocktail     # add dev dependency
flutter pub add 'dio:^5.4.0'       # with constraint
flutter pub remove dio
flutter pub upgrade                # upgrade within constraints (updates lock)
flutter pub upgrade --major-versions  # bump constraints to latest majors (review!)
flutter pub outdated               # show what's outdated (Current/Upgradable/Resolvable/Latest)
flutter pub deps                   # dependency tree
flutter pub cache repair           # fix corrupted cache
flutter pub cache clean            # wipe global cache
dart pub global activate <pkg>     # install CLI tools
```

### 2.5.1 Choosing a package on pub.dev (organisational checklist)
Before adding any dependency to a company app, check:
1. **Publisher** — verified publisher (e.g., `dart.dev`, `flutter.dev`, `firebase.google.com`, well-known companies).
2. **Likes / Pub points / Downloads (popularity)**.
3. **Last published date** — abandoned packages are a risk.
4. **Platform support** badges (Android, iOS, Web…).
5. **Null safety / Dart 3 compatibility** (all current packages are null-safe; Dart 3 requires null safety).
6. **Open issues & how maintainers respond**.
7. **License** (MIT/BSD/Apache OK for most companies; GPL may be a problem — ask legal).
8. **Transitive dependencies** — does it pull in 30 others?
9. **Native code quality** for plugins: permissions it adds to your manifest, minimum SDK, size impact.
10. Could you write it yourself in 50 lines? Then maybe don't add a dependency.

### 2.5.2 Version conflict ("version solving failed")
```
Because app depends on a ^2.0.0 which depends on intl ^0.18.0,
and app depends on b ^3.0.0 which depends on intl ^0.19.0, version solving failed.
```
Fixes, in order of preference:
1. `flutter pub upgrade` / bump `a` or `b` to versions compatible with each other.
2. Check package changelogs for a version supporting the newer dependency.
3. Temporarily `dependency_overrides:` with a **comment** explaining why and a ticket to remove it.
4. Fork & fix, depend via `git:` with a pinned `ref`.

---

## 2.6 Essential Flutter CLI commands (cheat sheet)

```bash
flutter devices                    # list connected devices/emulators
flutter emulators                  # list emulators
flutter emulators --launch <id>
flutter run                        # run on device (debug)
flutter run -d chrome              # web
flutter run -d <deviceId>
flutter run --release / --profile
flutter run --flavor dev -t lib/main_dev.dart        # flavors (Chapter 26)
flutter run --dart-define=API_URL=https://dev.api    # compile-time env vars
flutter run --dart-define-from-file=config/dev.json  # many vars from a JSON file

flutter build apk --release                  # Android APK (universal)
flutter build apk --split-per-abi            # smaller per-ABI APKs
flutter build appbundle                      # AAB for Play Store
flutter build ipa                            # iOS archive for App Store
flutter build web --release                  # web (add --wasm for WebAssembly)
flutter build windows | macos | linux

flutter test                                  # run tests
flutter test --coverage                       # generate coverage/lcov.info
flutter test test/foo_test.dart --name "adds"
flutter analyze                               # static analysis (lints)
dart format .                                 # format code
dart fix --dry-run / dart fix --apply         # automated migrations & lint fixes
flutter clean                                 # delete build/ and .dart_tool/ (fixes many weird issues)
flutter gen-l10n                              # generate localization classes
flutter pub run build_runner build --delete-conflicting-outputs   # older form
dart run build_runner build --delete-conflicting-outputs           # modern form
dart run build_runner watch                                        # continuous codegen
flutter logs                                  # device logs
flutter attach                                # attach to running app (add-to-app)
flutter screenshot
flutter config --enable-web / --no-analytics  # global config
flutter precache                              # download engine artifacts
flutter symbolize -i <stacktrace> -d <symbols-dir>  # de-obfuscate stack traces
```

### 2.6.1 Keys while `flutter run` is running
| Key | Action |
|---|---|
| `r` | Hot reload |
| `R` | Hot restart |
| `p` | Toggle debug paint (layout boundaries) |
| `P` | Performance overlay |
| `o` | Toggle platform (Android ↔ iOS look) |
| `w` | Dump widget tree |
| `t` | Dump render tree |
| `L` | Dump layer tree |
| `S` | Dump semantics tree |
| `i` | Toggle widget inspector |
| `v` | Open DevTools |
| `M` | Write SkSL shaders (legacy Skia only) |
| `q` | Quit |
| `h` | Help |

---

## 2.7 `--dart-define` and environment configuration

```dart
// Reading compile-time constants:
const apiUrl = String.fromEnvironment('API_URL', defaultValue: 'https://prod.api');
const isStaging = bool.fromEnvironment('STAGING');
const retries = int.fromEnvironment('RETRIES', defaultValue: 3);
```
* These are **compile-time constants** — `const` required; changing them needs rebuild (not hot reload).
* ⚠️ They are **embedded in the binary**. **Never put secrets** (private keys) here — anyone can extract strings from an APK/IPA. API keys meant to be public (e.g., Firebase client keys, Maps keys restricted by app signature) are acceptable.
* `--dart-define-from-file=env/dev.json` (JSON or `.env` file) is the clean approach for many variables.

Alternative: `flutter_dotenv` (reads a bundled asset `.env` at runtime — same security caveat: it's in the bundle), `envied` (code generation with optional obfuscation — obfuscation is *not* real security).

---

## 2.8 analysis_options.yaml & lints

```yaml
include: package:flutter_lints/flutter.yaml   # or package:very_good_analysis/analysis_options.yaml

analyzer:
  exclude:
    - "**/*.g.dart"
    - "**/*.freezed.dart"
  language:
    strict-casts: true          # no implicit dynamic casts
    strict-inference: true
    strict-raw-types: true
  errors:
    missing_required_param: error
    missing_return: error
    todo: ignore

linter:
  rules:
    - prefer_const_constructors
    - prefer_final_locals
    - avoid_print
    - always_use_package_imports    # or prefer_relative_imports — pick ONE in your team
    - require_trailing_commas
    - unawaited_futures
    - cancel_subscriptions
    - close_sinks
    - use_build_context_synchronously
```
Lint packages:
* `lints` — Dart core/recommended sets.
* `flutter_lints` — Flutter's recommended set (default in new projects).
* `very_good_analysis` — strict set used by Very Good Ventures, popular in companies.
* **DCM (Dart Code Metrics)** — commercial tool with metrics (cyclomatic complexity, etc.) and extra rules.
* Custom lint rules: `custom_lint` package, or the newer official **analyzer plugin** system (Dart 3.10+).

Suppress for one line: `// ignore: avoid_print`; for a file: `// ignore_for_file: avoid_print`.

---

## 2.9 IDEs & productivity

### VS Code
* Extensions: **Flutter**, **Dart**. Optional: Error Lens, Pubspec Assist, Awesome Flutter Snippets, bloc / riverpod snippets.
* Shortcuts: `Ctrl/Cmd + .` → **Quick actions**: *Wrap with widget, Wrap with Padding/Center/Column, Remove widget, Extract widget, Extract method, Convert to StatefulWidget*.
* `stless` / `stful` snippets create widgets.
* Run & Debug panel, breakpoints, `launch.json` for flavors and dart-defines:
```json
{
  "configurations": [
    {
      "name": "dev",
      "request": "launch",
      "type": "dart",
      "program": "lib/main_dev.dart",
      "args": ["--flavor", "dev", "--dart-define-from-file=env/dev.json"]
    }
  ]
}
```

### Android Studio / IntelliJ
* Flutter + Dart plugins. Flutter Inspector, Flutter Outline, Performance tabs.
* `Alt+Enter` (Win/Linux) / `Option+Enter` (Mac) → quick actions (wrap, extract).
* Good for native Android debugging (Logcat, Gradle).

### Xcode
Needed for iOS signing, capabilities (Push, Sign in with Apple, App Groups), archive, and debugging native crashes.

### Widget Previews
Newer Flutter versions (3.35 experimental, IDE integration in 3.38+) support **widget previews** via a `@Preview` annotation so you can see widgets in the IDE without running the app (similar to Compose/SwiftUI previews). Check your version's docs as the API is evolving.

### DevTools
Browser-based suite: Inspector, Performance, CPU Profiler, Memory, Network, Logging, App Size, Deep Links validator, Provider/Riverpod/Bloc extensions. Opened with `v` in `flutter run`, from IDE, or `dart devtools`. Chapter 23 covers it deeply.

---

## 2.10 Android-specific setup knowledge (comes up in every company!)

### 2.10.1 Gradle files (modern Kotlin DSL — default for new projects since Flutter 3.29)
`android/settings.gradle.kts` (simplified):
```kotlin
pluginManagement {
    val flutterSdkPath = run { /* reads local.properties flutter.sdk */ }
    includeBuild("$flutterSdkPath/packages/flutter_tools/gradle")
    repositories { google(); mavenCentral(); gradlePluginPortal() }
}
plugins {
    id("dev.flutter.flutter-plugin-loader") version "1.0.0"
    id("com.android.application") version "8.x.x" apply false   // AGP version
    id("org.jetbrains.kotlin.android") version "2.x.x" apply false
}
include(":app")
```
`android/app/build.gradle.kts`:
```kotlin
plugins {
    id("com.android.application")
    id("kotlin-android")
    id("dev.flutter.flutter-gradle-plugin") // must come after Android & Kotlin plugins
}
android {
    namespace = "com.mycompany.myapp"
    compileSdk = flutter.compileSdkVersion
    defaultConfig {
        applicationId = "com.mycompany.myapp"
        minSdk = 23                     // or flutter.minSdkVersion
        targetSdk = flutter.targetSdkVersion
        versionCode = flutter.versionCode
        versionName = flutter.versionName
    }
    buildTypes {
        release {
            signingConfig = signingConfigs.getByName("release")
            isMinifyEnabled = true      // R8 shrinking of Java/Kotlin code
            isShrinkResources = true
        }
    }
}
```
Older projects use Groovy `build.gradle` with `apply plugin:` "imperative apply" — Flutter 3.16+ migrated to the **declarative `plugins {}` block**; old style now shows deprecation warnings / errors. Migration guide: "Deprecated imperative apply of Flutter's Gradle plugins".

### 2.10.2 Version compatibility triangle
**Gradle ↔ Android Gradle Plugin (AGP) ↔ Java (JDK) ↔ Kotlin** must be compatible.
* AGP 8.x needs Java 17.
* Each AGP version needs a minimum Gradle version.
* Flutter tool warns if versions are too old.
Typical error: *"Unsupported class file major version 65"* → your JDK is too new for your Gradle (65 = Java 21). Fix: upgrade Gradle wrapper (`gradle-wrapper.properties`) or point Flutter to a different JDK: `flutter config --jdk-dir=/path/to/jdk17`.

### 2.10.3 minSdk / targetSdk / compileSdk
* **minSdk** — oldest Android version supported. Many plugins require ≥ 21 or higher (Firebase etc.). Flutter itself has raised its minimum over time (currently API 21+, with recent releases moving the default higher — check your version).
* **targetSdk** — the Android behaviour version you've tested against; Google Play requires a recent targetSdk (typically within one year of the latest Android release).
* **compileSdk** — SDK used to compile; must be ≥ what plugins need.

### 2.10.4 MultiDex
Only needed for minSdk < 21. Flutter tool can enable it automatically (`flutter run --multidex` historically). With minSdk 21+ it's native.

---

## 2.11 iOS-specific setup knowledge

* Open `ios/Runner.xcworkspace` in Xcode.
* **Signing & Capabilities** tab: Team, Bundle Identifier, capabilities (Push Notifications, Background Modes, Associated Domains for universal links).
* `Podfile`: `platform :ios, '13.0'` — many plugins require a minimum iOS version; mismatches cause `pod install` errors: *"The plugin X requires a higher minimum iOS deployment version"*.
* Common fixes:
  ```bash
  cd ios
  pod deintegrate         # if very broken
  rm -rf Pods Podfile.lock
  pod repo update         # update specs
  pod install
  cd ..
  flutter clean && flutter pub get
  ```
* Apple Silicon (M1+) historical issue: `ffi` gem / running `arch -x86_64 pod install` — no longer needed on modern CocoaPods.
* **Swift Package Manager (SwiftPM)**: Flutter added support (opt-in 3.24, increasingly default; default for iOS/macOS in Flutter 3.44). Plugins that ship `Package.swift` integrate via SPM; CocoaPods is still used as a fallback for plugins that don't support SPM yet. Enable/disable with `flutter config --enable-swift-package-manager` / `--no-enable-swift-package-manager`, or per project in `pubspec.yaml` under `flutter: config:` (check your version's docs).
* `Info.plist` must contain **usage descriptions** for every permission (`NSCameraUsageDescription`, `NSLocationWhenInUseUsageDescription`, `NSPhotoLibraryUsageDescription`, …) — missing ones cause **instant crash** when requesting the permission and **App Store rejection**.

---

## 2.12 Common setup problems & fixes (company survival kit)

| Symptom | Cause | Fix |
|---|---|---|
| `flutter: command not found` | PATH not set | Add `<flutter>/bin` to PATH, restart terminal |
| `Android license status unknown` | licenses not accepted | `flutter doctor --android-licenses` |
| `cmdline-tools component is missing` | SDK Manager missing tools | Android Studio → SDK Manager → SDK Tools → Android SDK Command-line Tools |
| `Gradle task assembleDebug failed with exit code 1` | Generic; read the error above it | Run `cd android && ./gradlew assembleDebug --stacktrace` for details |
| `Unsupported class file major version XX` | JDK vs Gradle mismatch | Upgrade Gradle wrapper or `flutter config --jdk-dir` |
| `Execution failed for task ':app:checkDebugAarMetadata'` | Plugin needs higher compileSdk | Raise `compileSdk` |
| `Manifest merger failed: uses-sdk:minSdkVersion X cannot be smaller than version Y declared in library` | Plugin needs higher minSdk | Raise `minSdk` |
| `CocoaPods not installed` / `pod: command not found` | | `sudo gem install cocoapods` or `brew install cocoapods` |
| `CocoaPods could not find compatible versions for pod "Firebase/..."` | Specs repo outdated / version conflict | `pod repo update`, delete Podfile.lock, `pod install` |
| `Module 'xyz' not found` (Xcode) | Opened .xcodeproj or pods not installed | Open .xcworkspace, `pod install` |
| `Unable to load asset` | Asset not declared or wrong path / subfolder | Check pubspec indentation & paths, full restart |
| `Waiting for another flutter command to release the startup lock` | Stale lock | Kill flutter processes; delete `<flutter>/bin/cache/lockfile` |
| Strange errors after upgrading | stale build caches | `flutter clean && flutter pub get` (+ `pod install`) |
| `version solving failed` | dep conflicts | see §2.5.2 |
| `The current Dart SDK version is X. Because app requires SDK version >=Y` | Your Flutter is older than a package needs | Upgrade Flutter or downgrade package |
| Emulator very slow | No hardware acceleration | Enable HAXM/Hypervisor/KVM, use x86_64/arm64 system image matching host |
| `No connected devices` | USB debugging off / drivers | Enable Developer options → USB debugging; `adb devices`; accept RSA prompt |

---

## 2.13 Interview Questions

**Q1. What is `pubspec.yaml`?** The project manifest: name, version, SDK constraints, dependencies, dev_dependencies, dependency_overrides, assets, fonts and Flutter-specific settings.

**Q2. Difference between `dependencies` and `dev_dependencies`?** Dependencies are needed by the app at runtime and are compiled in; dev_dependencies are tools used during development (tests, code generators, lints) and are not included in the app or passed on to consumers of a package.

**Q3. What is `pubspec.lock` and should it be committed?** It records the exact resolved versions of all (transitive) dependencies. Commit it for applications for reproducible builds.

**Q4. What does `^1.2.3` mean?** `>=1.2.3 <2.0.0`. For `^0.2.3` it's `>=0.2.3 <0.3.0`.

**Q5. What is `dependency_overrides`?** Forces a package version regardless of other constraints — useful for temporary conflicts or testing a local fork, but risky; document and remove ASAP.

**Q6. `flutter pub get` vs `flutter pub upgrade`?** `get` resolves deps respecting the existing lock file (only changing what's needed); `upgrade` tries to move every dependency to the latest version allowed by constraints and rewrites the lock file.

**Q7. What does `flutter clean` do?** Deletes the `build/` folder and `.dart_tool/` (and some ephemeral files), forcing a full rebuild — fixes stale artifact issues.

**Q8. How do you manage different environments (dev/staging/prod)?** Flavors (Android productFlavors, iOS schemes/configurations) + separate entrypoints (`main_dev.dart`) and/or `--dart-define(-from-file)`; never put secrets in the binary.

**Q9. What is FVM and why use it?** Flutter Version Management pins a Flutter SDK version per project so the entire team and CI use the same version.

**Q10. What is the version format in pubspec and how does it map to stores?** `x.y.z+n` → Android versionName/versionCode, iOS CFBundleShortVersionString/CFBundleVersion. Build number must increase on each store upload.

**Q11. What are Flutter channels?** stable, beta, main; use stable in production.

**Q12. How do you add assets/fonts?** Declare under `flutter: assets:` / `fonts:` in pubspec with correct indentation; subdirectories must be listed separately; use `Image.asset`, `rootBundle.loadString`, `fontFamily`.

**Q13. What is `analysis_options.yaml`?** Configures the Dart analyzer: included lint sets, enabled/disabled rules, strict modes, excluded files, error severities.

**Q14. Package vs plugin?** A package is pure Dart (possibly Flutter-dependent) code; a plugin is a package that includes platform-specific native code (Kotlin/Swift/C++/JS) accessed via platform channels or FFI.
