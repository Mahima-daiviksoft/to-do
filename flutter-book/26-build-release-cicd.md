# Chapter 26 — Flavors, Signing, Building, Store Release, CI/CD & Code Push

> **Goal:** Ship confidently: multiple environments, correct signing, automated pipelines, store submissions, staged rollouts and hotfix strategies. Every company job includes this; many juniors have never done it — knowing it makes you stand out.

---

## 26.1 Flavors (build variants) 🍦

**5-year-old:** Same ice cream machine, different flavours: **dev** (testing server, orange icon), **staging** (pre-production), **prod** (real users). Each can be installed side-by-side on the same phone.

### Android (productFlavors) — `android/app/build.gradle.kts`
```kotlin
android {
    flavorDimensions += "env"
    productFlavors {
        create("dev") {
            dimension = "env"
            applicationIdSuffix = ".dev"
            versionNameSuffix = "-dev"
            resValue("string", "app_name", "MyApp Dev")
        }
        create("staging") {
            dimension = "env"
            applicationIdSuffix = ".stg"
            resValue("string", "app_name", "MyApp Staging")
        }
        create("prod") {
            dimension = "env"
            resValue("string", "app_name", "MyApp")
        }
    }
}
```
AndroidManifest: `android:label="@string/app_name"`. Per-flavor resources/configs: `android/app/src/dev/res/...`, `android/app/src/dev/google-services.json`.

### iOS (schemes + build configurations)
* Duplicate build configurations: `Debug-dev`, `Release-dev`, `Debug-prod`, `Release-prod`, (+ `Profile-*`).
* Create schemes named exactly like the flavor (`dev`, `prod`) using those configurations.
* Per-config settings: `PRODUCT_BUNDLE_IDENTIFIER`, display name (`FLUTTER_APP_NAME` user-defined setting referenced in Info.plist `CFBundleDisplayName`), app icon set, `GoogleService-Info.plist` copied by a Run Script phase based on `${CONFIGURATION}`.
* Recent Flutter versions can also read flavor-specific settings and support `flavors` declared in pubspec for assets (`flavors:` under an asset entry → asset only bundled in that flavor).

### Dart side
```bash
flutter run --flavor dev -t lib/main_dev.dart --dart-define-from-file=env/dev.json
flutter build appbundle --flavor prod -t lib/main_prod.dart --dart-define-from-file=env/prod.json
```
```dart
// lib/main_dev.dart
void main() => bootstrap(AppConfig.dev());
// Or read flavor at runtime: appFlavor (from package:flutter/services.dart, Flutter 3.13+)
import 'package:flutter/services.dart';
final flavor = appFlavor; // 'dev' | 'staging' | 'prod' | null
```
Tools: **`flutter_flavorizr`** generates all this native setup; `very_good_cli` templates include flavors.

---

## 26.2 Versioning
`pubspec.yaml`: `version: 2.4.1+241` → versionName/CFBundleShortVersionString `2.4.1`, versionCode/CFBundleVersion `241`.
* Build number must **increase** for every store upload (Play rejects duplicates; App Store requires higher build per version).
* Override in CI: `flutter build appbundle --build-name=2.4.1 --build-number=$GITHUB_RUN_NUMBER`.
* Semantic versioning for user-facing versions; tag releases in git (`v2.4.1`); CHANGELOG.
* Force-update policy: minimum supported version via remote config (Chapter 18).

---

## 26.3 Android signing & release

1. Create an **upload keystore** (once; back it up securely — losing it is painful, though Play App Signing allows upload key reset):
```bash
keytool -genkey -v -keystore ~/upload-keystore.jks -keyalg RSA -keysize 2048 -validity 10000 -alias upload
```
2. `android/key.properties` (**never commit**; add to .gitignore):
```
storePassword=...
keyPassword=...
keyAlias=upload
storeFile=/Users/me/upload-keystore.jks
```
3. `build.gradle.kts`:
```kotlin
import java.util.Properties
import java.io.FileInputStream

val keystoreProperties = Properties().apply {
    val f = rootProject.file("key.properties")
    if (f.exists()) load(FileInputStream(f))
}
android {
    signingConfigs {
        create("release") {
            keyAlias = keystoreProperties["keyAlias"] as String?
            keyPassword = keystoreProperties["keyPassword"] as String?
            storeFile = (keystoreProperties["storeFile"] as String?)?.let { file(it) }
            storePassword = keystoreProperties["storePassword"] as String?
        }
    }
    buildTypes {
        getByName("release") { signingConfig = signingConfigs.getByName("release") }
    }
}
```
4. Build: `flutter build appbundle --release --obfuscate --split-debug-info=build/symbols`.
5. **Play App Signing** (mandatory for new apps with AAB): Google holds the **app signing key**; you sign uploads with your **upload key**. ⚠️ SHA fingerprints for Firebase/Google Sign-In/App Links must include the **app signing key** fingerprint from Play Console (common bug: works from local build, fails from Play Store).
6. Play Console: internal testing → closed → open → production; **staged rollout** (e.g., 5% → 20% → 50% → 100%), halt rollout if crash spikes. New personal developer accounts must run a closed test with testers for a period before production access (Play policy introduced in 2023 — check current requirements).
7. Requirements: target API level policy (recent), Data safety form, content rating, privacy policy URL, app access instructions for reviewers (test account), 64-bit (Flutter provides arm64-v8a), 16 KB memory page size support for apps targeting Android 15+ (Flutter engine supports it in recent versions; check native libs of plugins).

---

## 26.4 iOS signing & release
* Apple Developer Program membership.
* **Certificates** (Apple Development / Apple Distribution), **App IDs** (bundle identifier + capabilities), **Provisioning profiles** (Development, Ad Hoc, App Store), devices (for dev/ad hoc).
* Xcode "Automatically manage signing" for small teams; **fastlane match** (certs/profiles in encrypted git/S3) for teams & CI.
* Build: `flutter build ipa --release --obfuscate --split-debug-info=build/symbols --export-options-plist=ios/ExportOptions.plist` → `.ipa` in `build/ios/ipa`.
* Upload: Xcode Organizer, **Transporter** app, `xcrun altool`/`notarytool` (altool upload deprecated → use Transporter / App Store Connect API via fastlane `pilot`/`deliver`).
* **TestFlight** for internal (no review) and external testers (beta review).
* App Store review guidelines pitfalls: crashes, incomplete features/placeholder content, missing account deletion, login required without demo account, Sign in with Apple requirement (4.8), IAP rules (3.1.1), misleading metadata, missing privacy usage strings, private API use, privacy manifest/required reason API declarations, minimum functionality (4.2) — "app is just a website".
* **Phased release** (7-day automatic rollout, pausable), expedited review for critical fixes.
* Export compliance (encryption): `ITSAppUsesNonExemptEncryption` = NO in Info.plist if you only use standard HTTPS.

---

## 26.5 Web & desktop distribution
* Web: `flutter build web --release` (add `--wasm` for WebAssembly) → deploy `build/web` to Firebase Hosting, Netlify, Vercel, S3+CloudFront, GitHub Pages; set `--base-href` for subpaths; configure SPA rewrites; caching headers (service worker behaviour: Flutter's default service worker was deprecated — use standard HTTP caching / your own PWA strategy); PWA manifest.
* Windows: `flutter build windows` → MSIX (`msix` package) for Microsoft Store or installer (Inno Setup).
* macOS: `flutter build macos` → sign + **notarize** (Developer ID) for outside-App-Store distribution, or Mac App Store with sandbox entitlements.
* Linux: Snap (`snapcraft`), Flatpak, AppImage, .deb.

---

## 26.6 CI/CD 🤖

### Pipeline stages (typical)
1. **Setup**: checkout, Flutter version (from `.fvmrc`/pinned), cache pub & Gradle & CocoaPods.
2. **Static checks**: `dart format --output=none --set-exit-if-changed .`, `flutter analyze`, custom lints, codegen check (`build_runner` → `git diff --exit-code` to ensure generated files committed if your team commits them).
3. **Tests**: `flutter test --coverage` (+ goldens), upload coverage.
4. **Build**: debug/profile APKs for QA on PRs; release builds on main/tags.
5. **Integration tests**: emulators in CI or Firebase Test Lab/BrowserStack.
6. **Distribution**: Firebase App Distribution / TestFlight / Play internal track.
7. **Release**: tag-triggered production builds, upload to stores (fastlane), changelog, symbols upload (Crashlytics/Sentry), notify Slack.

### GitHub Actions example
```yaml
name: CI
on:
  pull_request:
  push:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: subosito/flutter-action@v2
        with:
          channel: stable
          flutter-version-file: pubspec.yaml   # or a fixed version / .fvmrc
          cache: true
      - run: flutter pub get
      - run: dart format --output=none --set-exit-if-changed .
      - run: flutter analyze
      - run: flutter test --coverage
      - uses: codecov/codecov-action@v4
        with: { files: coverage/lcov.info }

  build-android:
    needs: test
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-java@v4
        with: { distribution: temurin, java-version: '17' }
      - uses: subosito/flutter-action@v2
        with: { channel: stable, cache: true }
      - name: Decode keystore
        run: echo "${{ secrets.ANDROID_KEYSTORE_BASE64 }}" | base64 -d > android/app/upload-keystore.jks
      - name: key.properties
        run: |
          cat > android/key.properties <<EOF
          storePassword=${{ secrets.KEYSTORE_PASSWORD }}
          keyPassword=${{ secrets.KEY_PASSWORD }}
          keyAlias=upload
          storeFile=upload-keystore.jks
          EOF
      - run: flutter build appbundle --flavor prod -t lib/main_prod.dart --build-number=${{ github.run_number }} --obfuscate --split-debug-info=build/symbols
      - uses: actions/upload-artifact@v4
        with: { name: aab, path: build/app/outputs/bundle/prodRelease/app-prod-release.aab }
```
(`storeFile` in key.properties is resolved relative to the `android/app` module when using `file(...)` in the app's build script.)

iOS builds need **macOS runners** (`runs-on: macos-latest`), certificates/profiles via fastlane match or App Store Connect API keys, `flutter build ipa`.

### Other CI/CD platforms
* **Codemagic** (Flutter-focused, by Nevercode) — easy iOS signing, workflows in `codemagic.yaml`, M-series Macs.
* **Bitrise**, **GitLab CI**, **Azure DevOps**, **CircleCI**, **Jenkins**, **Xcode Cloud** (iOS), **Appcircle**.
* **fastlane** — automation lanes: `match` (signing), `gym` (build), `pilot` (TestFlight), `deliver` (App Store metadata/screenshots), `supply` (Play upload), `increment_build_number`.

---

## 26.7 Code push / over-the-air (OTA) updates
* **Shorebird** — code push for Flutter (by former Flutter team lead Eric Seidel's company): `shorebird release android`, then `shorebird patch android` ships **Dart-only** changes directly to users without store review. Native code/assets changes still need a store release. Patches are applied on next app launch. Store policy: Apple allows interpreted code updates that don't change the app's primary purpose (guideline 3.3.2/2.5.2 nuance) — Shorebird positions itself as compliant; follow their guidance.
* Server-driven UI (SDUI) is an alternative for dynamic screens (JSON-defined layouts: `rfw` package from Flutter team — Remote Flutter Widgets, `json_dynamic_widget`, `mirai`/`stac`).

---

## 26.8 Release management best practices (organisational)
* **Release train**: regular cadence (e.g., every 2 weeks) with code freeze, release branch, QA regression, staged rollout.
* **Git flow / trunk-based** with short-lived feature branches + feature flags (preferred for fast teams).
* Release checklist: version bump, changelog, translations complete, analytics events verified, crash-free rate of beta, performance checks, store metadata/screenshots, privacy forms updated for new SDKs, backend compatibility (old app versions must keep working with new APIs — **API versioning**!).
* Monitor after release: crash-free users (target ≥ 99.5–99.9%), ANRs, key funnels, reviews.
* Rollback strategy: mobile can't roll back binaries → halt rollout, kill switches, hotfix, code push.
* Keep old versions working: backward-compatible APIs, minimum version enforcement as last resort.

---

## 26.9 Common release problems
| Problem | Fix |
|---|---|
| Release build crashes on startup | Check logs; R8 rules; missing permissions; obfuscation-sensitive code |
| Google Sign-In fails only from Play Store | Add Play App Signing SHA-1/SHA-256 to Firebase/Google Cloud |
| App Links don't verify after Play release | assetlinks.json needs Play signing key fingerprint |
| "You uploaded an APK or Android App Bundle that was signed in debug mode" | Configure release signing |
| "Version code X has already been used" | Increase build number |
| iOS upload: "Missing required icon / Invalid bundle" | Provide all icon sizes (1024×1024 marketing icon without alpha), correct Info.plist |
| ITMS-90683 Missing purpose string | Add usage description for each permission API referenced (even by SDKs) |
| Crash reports unreadable | Upload obfuscation symbols & dSYMs |
| Large AAB/IPA | Chapter 23 app size |
| Users stuck on old version with broken API | Force update mechanism, API versioning |

---

## 26.10 Interview Questions — Release & CI/CD

**Q1. What are flavors and how do you set them up?** Build variants for environments: Android productFlavors, iOS schemes/configurations, Dart entrypoints/dart-defines; separate app IDs, names, icons, Firebase configs.

**Q2. How do you sign an Android app?** Generate an upload keystore, configure key.properties and signingConfigs (kept secret), build an AAB; Play App Signing re-signs with the app signing key.

**Q3. APK vs AAB?** AAB is a publishing format; Play generates optimized APKs per device (ABI, density, language) → smaller downloads; required for new Play apps.

**Q4. How do you release to the App Store?** Configure signing (certificates/profiles), build ipa, upload via Transporter/fastlane, TestFlight, submit for review with metadata, phased release.

**Q5. What does your CI pipeline look like?** Format, analyze, test (+coverage/goldens), build, integration tests, distribute to testers, release on tags with symbol upload; secrets stored securely; pinned Flutter version.

**Q6. What is staged rollout and why use it?** Releasing to a percentage of users first to catch issues; halt if crash metrics spike.

**Q7. How do you handle a critical production bug quickly?** Halt rollout, kill switch/feature flag, hotfix with expedited review, code push for Dart-only fixes where allowed, communicate, postmortem.

**Q8. What is obfuscation's impact on crash reporting?** Stack traces are obfuscated; upload split debug info symbols to symbolize.

**Q9. What is Shorebird?** A code push solution for Flutter allowing Dart code patches to be delivered without store releases.

**Q10. How do you manage different API endpoints per environment?** Flavors + dart-define-from-file/AppConfig injected at bootstrap; never hard-code per build manually.
