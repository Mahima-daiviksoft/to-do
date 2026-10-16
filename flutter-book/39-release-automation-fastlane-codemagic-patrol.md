# Chapter 39 — Release Automation: fastlane (Android & iOS), Codemagic, GitHub Actions for iOS, and Patrol E2E Tests

> **Goal:** Give you complete, copy-adaptable configuration files for automated builds and store uploads, plus end-to-end tests that can handle native UI (permission dialogs, notifications). Chapter 26 explained the concepts. This chapter has the actual files.

> Tool options and flags change over time. Treat these files as solid templates, and check the official docs of fastlane, Codemagic and Patrol for the versions you install.

---

## 39.1 5-year-old picture 🏭
Releasing an app by hand is like baking 100 cakes yourself, step by step, every week, and sometimes forgetting the sugar. **Automation** is a **cake factory**: you write the recipe once (config files), press a button (push a git tag), and it bakes, checks, boxes and delivers the cakes the same way every time.

---

## 39.2 fastlane setup
```bash
# macOS: Ruby/Bundler recommended so everyone uses the same fastlane version
cd ios && bundle init && echo 'gem "fastlane"' >> Gemfile && bundle install && bundle exec fastlane init
cd ../android && bundle init && echo 'gem "fastlane"' >> Gemfile && bundle install && bundle exec fastlane init
```
This creates `ios/fastlane/` and `android/fastlane/`, each with an `Appfile` and a `Fastfile`. Commit the `Gemfile` + `Gemfile.lock`.

### Credentials (never commit them)
* **iOS:** an **App Store Connect API key** (.p8): key ID, issuer ID and key content (base64) stored in CI secrets. Signing certificates & profiles go through **match** (an encrypted git repo or S3/GCS bucket, with `MATCH_PASSWORD`).
* **Android:** a **Google Play service account JSON** (Play Console → API access), stored as a CI secret, plus the upload keystore + passwords (Chapter 26).

---

## 39.3 `ios/fastlane/Fastfile`
```ruby
default_platform(:ios)

ROOT = File.expand_path("../..", __dir__)   # __dir__ = ios/fastlane → ROOT = Flutter project root

platform :ios do
  before_all do
    setup_ci if ENV["CI"]                  # creates a temporary keychain on CI machines
  end

  def asc_key
    app_store_connect_api_key(
      key_id: ENV["ASC_KEY_ID"],
      issuer_id: ENV["ASC_ISSUER_ID"],
      key_content: ENV["ASC_KEY_CONTENT_BASE64"],
      is_key_content_base64: true
    )
  end

  desc "Sync signing certificates & profiles (read-only on CI)"
  lane :certs do
    asc_key
    match(type: "appstore", app_identifier: "com.mycompany.shop", readonly: is_ci)
  end

  desc "Build and upload to TestFlight"
  lane :beta do
    asc_key
    match(type: "appstore", app_identifier: "com.mycompany.shop", readonly: true)

    build_number = latest_testflight_build_number(app_identifier: "com.mycompany.shop") + 1

    Dir.chdir(ROOT) do
      sh("flutter", "pub", "get")
      sh("flutter", "build", "ipa", "--release",
         "--flavor", "prod", "-t", "lib/main_prod.dart",
         "--build-number=#{build_number}",
         "--obfuscate", "--split-debug-info=build/symbols",
         "--export-options-plist=ios/ExportOptions.plist")
    end

    ipa = Dir["#{ROOT}/build/ios/ipa/*.ipa"].first
    UI.user_error!("IPA not found") unless ipa

    upload_to_testflight(
      ipa: ipa,
      skip_waiting_for_build_processing: true,
      changelog: ENV["RELEASE_NOTES"] || "Bug fixes and improvements"
    )
  end

  desc "Submit the latest TestFlight build for App Store review"
  lane :release do
    asc_key
    deliver(
      submit_for_review: true,
      automatic_release: false,
      phased_release: true,              # 7-day gradual rollout
      skip_binary_upload: true,          # uses the build already on TestFlight
      skip_screenshots: true,
      force: true,                       # skip the HTML preview
      precheck_include_in_app_purchases: false
    )
  end
end
```
`ios/ExportOptions.plist` (App Store distribution with manual signing from match):
```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>method</key><string>app-store-connect</string>   <!-- older Xcode versions: app-store -->
  <key>teamID</key><string>ABCDE12345</string>
  <key>signingStyle</key><string>manual</string>
  <key>provisioningProfiles</key>
  <dict>
    <key>com.mycompany.shop</key><string>match AppStore com.mycompany.shop</string>
  </dict>
  <key>uploadSymbols</key><true/>
</dict>
</plist>
```
For manual signing, the Xcode project's Release configuration must also be set to use the match profile. Running `update_code_signing_settings` in the lane can do this. Extensions (notification service, widgets) need their own profiles in the dictionary.

---

## 39.4 `android/fastlane/Fastfile`
```ruby
default_platform(:android)

ROOT = File.expand_path("../..", __dir__)   # android/fastlane → project root

platform :android do
  def play_json
    ENV["PLAY_SERVICE_ACCOUNT_JSON"]          # the JSON content stored as a CI secret
  end

  desc "Build AAB and upload to the internal testing track"
  lane :internal do
    codes = google_play_track_version_codes(track: "internal", json_key_data: play_json)
    version_code = (codes.max || 0) + 1

    Dir.chdir(ROOT) do
      sh("flutter", "pub", "get")
      sh("flutter", "build", "appbundle", "--release",
         "--flavor", "prod", "-t", "lib/main_prod.dart",
         "--build-number=#{version_code}",
         "--obfuscate", "--split-debug-info=build/symbols")
    end

    upload_to_play_store(
      track: "internal",
      aab: "#{ROOT}/build/app/outputs/bundle/prodRelease/app-prod-release.aab",
      json_key_data: play_json,
      release_status: "completed",          # "draft" for apps that were never published
      skip_upload_metadata: true,
      skip_upload_images: true,
      skip_upload_screenshots: true
    )
  end

  desc "Promote internal → production with a staged rollout"
  lane :promote do |options|
    upload_to_play_store(
      track: "internal",
      track_promote_to: "production",
      rollout: options[:rollout] || "0.1",  # 10%
      json_key_data: play_json,
      skip_upload_changelogs: false
    )
  end

  desc "Increase the production rollout percentage"
  lane :rollout do |options|
    upload_to_play_store(track: "production", rollout: options[:percent], json_key_data: play_json,
                         skip_upload_aab: true, skip_upload_apk: true, skip_upload_metadata: true)
  end
end
```
Run it: `cd android && bundle exec fastlane internal`, or `bundle exec fastlane promote rollout:0.2`.

Release notes per version: `android/fastlane/metadata/android/<locale>/changelogs/<versionCode>.txt`. iOS metadata and screenshots: `ios/fastlane/metadata/` and `ios/fastlane/screenshots/` (managed by `deliver`).

---

## 39.5 GitHub Actions workflow using these lanes (iOS + Android)
```yaml
name: Release
on:
  push:
    tags: ['v*']

jobs:
  android:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-java@v4
        with: { distribution: temurin, java-version: '17' }
      - uses: subosito/flutter-action@v2
        with: { channel: stable, cache: true }
      - uses: ruby/setup-ruby@v1
        with: { ruby-version: '3.3', bundler-cache: true, working-directory: android }
      - name: Signing files
        run: |
          echo "${{ secrets.ANDROID_KEYSTORE_BASE64 }}" | base64 -d > android/app/upload-keystore.jks
          printf "storePassword=%s\nkeyPassword=%s\nkeyAlias=upload\nstoreFile=upload-keystore.jks\n" \
            "${{ secrets.KEYSTORE_PASSWORD }}" "${{ secrets.KEY_PASSWORD }}" > android/key.properties
      - name: Upload to Play internal
        working-directory: android
        env:
          PLAY_SERVICE_ACCOUNT_JSON: ${{ secrets.PLAY_SERVICE_ACCOUNT_JSON }}
        run: bundle exec fastlane internal

  ios:
    runs-on: macos-latest
    steps:
      - uses: actions/checkout@v4
      - uses: subosito/flutter-action@v2
        with: { channel: stable, cache: true }
      - uses: ruby/setup-ruby@v1
        with: { ruby-version: '3.3', bundler-cache: true, working-directory: ios }
      - name: TestFlight
        working-directory: ios
        env:
          ASC_KEY_ID: ${{ secrets.ASC_KEY_ID }}
          ASC_ISSUER_ID: ${{ secrets.ASC_ISSUER_ID }}
          ASC_KEY_CONTENT_BASE64: ${{ secrets.ASC_KEY_CONTENT_BASE64 }}
          MATCH_PASSWORD: ${{ secrets.MATCH_PASSWORD }}
          MATCH_GIT_BASIC_AUTHORIZATION: ${{ secrets.MATCH_GIT_BASIC_AUTHORIZATION }}   # base64 "user:token" for the certs repo
          RELEASE_NOTES: ${{ github.ref_name }}
        run: bundle exec fastlane beta
      - name: Upload Crashlytics symbols (optional)
        run: echo "firebase crashlytics:symbols:upload --app=$FIREBASE_IOS_APP_ID build/symbols"
```
Tips:
* Pin the Xcode version on macOS runners (`sudo xcode-select -s /Applications/Xcode_XX.app`) so builds don't break when the runner image updates.
* Cache CocoaPods (`ios/Pods`) keyed on `Podfile.lock`, and Gradle (`actions/setup-java` with `cache: gradle`).
* Use `concurrency:` groups to avoid two releases running at the same time.

---

## 39.6 Codemagic (`codemagic.yaml` at the repo root)
```yaml
workflows:
  release:
    name: Android & iOS release
    instance_type: mac_mini_m2
    max_build_duration: 90
    integrations:
      app_store_connect: ASC API Key          # name of the API key added in Codemagic team settings
    environment:
      flutter: stable
      xcode: latest
      cocoapods: default
      android_signing:
        - upload_keystore                     # keystore reference uploaded in Codemagic UI
      ios_signing:
        distribution_type: app_store
        bundle_identifier: com.mycompany.shop
      groups:
        - google_play                         # contains GCLOUD_SERVICE_ACCOUNT_CREDENTIALS
        - firebase                            # optional
      vars:
        FLAVOR: prod
    triggering:
      events: [tag]
      tag_patterns:
        - pattern: 'v*'
          include: true
    scripts:
      - name: Get packages
        script: flutter pub get
      - name: Static analysis & tests
        script: |
          flutter analyze
          flutter test
      - name: Set up iOS signing in the Xcode project
        script: xcode-project use-profiles
      - name: Build Android App Bundle
        script: |
          flutter build appbundle --release --flavor $FLAVOR -t lib/main_prod.dart \
            --build-number=$BUILD_NUMBER --obfuscate --split-debug-info=build/symbols
      - name: Build iOS IPA
        script: |
          flutter build ipa --release --flavor $FLAVOR -t lib/main_prod.dart \
            --build-number=$BUILD_NUMBER \
            --export-options-plist=/Users/builder/export_options.plist
    artifacts:
      - build/**/outputs/bundle/**/*.aab
      - build/ios/ipa/*.ipa
      - build/symbols/**
      - flutter_drive.log
    publishing:
      google_play:
        credentials: $GCLOUD_SERVICE_ACCOUNT_CREDENTIALS
        track: internal
        submit_as_draft: false
      app_store_connect:
        auth: integration
        submit_to_testflight: true
        beta_groups:
          - Internal QA
      email:
        recipients: [mobile-team@mycompany.com]
        notify: { success: true, failure: true }
```
* `$BUILD_NUMBER` is Codemagic's incrementing build counter. You can also fetch the latest store build number with Codemagic CLI tools (`google-play get-latest-build-number`, `app-store-connect get-latest-testflight-build-number`) and add 1.
* `xcode-project use-profiles` applies the fetched signing profiles and writes `/Users/builder/export_options.plist`.
* Codemagic also has a **workflow editor UI**, but YAML is easier to review and version, which is better for teams.

---

## 39.7 Other pipeline essentials
* **Firebase App Distribution** for QA builds on every merge:
  * fastlane plugin: `firebase_app_distribution(app: ENV["FIREBASE_APP_ID"], groups: "qa", android_artifact_type: "AAB")`
  * or the CLI: `firebase appdistribution:distribute build/app/outputs/flutter-apk/app-release.apk --app $APP_ID --groups qa`
* **Version from tag:** parse `v2.4.1` → `--build-name=2.4.1`.
* **Changelog** from conventional commits (`git-cliff`, `release-please`).
* **Notifications:** Slack webhook on success or failure.
* **Secrets rotation:** keystore passwords and API keys in a secret manager. Restrict who can trigger release workflows (protected tags/environments with required reviewers).

---

## 39.8 Patrol — E2E tests that can tap native UI 🤖
`integration_test` can't tap system permission dialogs, notifications or settings. **Patrol** (LeanCode) can, and it also adds shorter finders.

### Setup (summary — follow the Patrol docs for your version)
```yaml
dev_dependencies:
  patrol: ^x.y.z     # check pub.dev
patrol:
  app_name: My Shop
  android:
    package_name: com.mycompany.shop
  ios:
    bundle_id: com.mycompany.shop
```
```bash
dart pub global activate patrol_cli
patrol doctor
```
Native setup: an Android instrumentation test runner class (`MainActivityTest.java`) and Gradle `testInstrumentationRunner` config; an iOS `RunnerUITests` target. These steps are documented step by step in Patrol's setup guide.

### A test
```dart
// patrol_test/checkout_test.dart   (older Patrol versions use integration_test/)
import 'package:flutter/material.dart';
import 'package:patrol/patrol.dart';
import 'package:my_shop/main_test.dart' as app;   // app entry with fake backend / test config

void main() {
  patrolTest(
    'user scans a product with the camera and adds it to the cart',
    ($) async {
      await app.main();
      await $.pumpAndSettle();

      await $('Log in').tap();
      await $(#emailField).enterText('qa@example.com');        // #emailField → Key('emailField')
      await $(#passwordField).enterText('Passw0rd!');
      await $(#loginButton).tap();
      await $('Home').waitUntilVisible();

      await $(#scanButton).tap();

      // Native permission dialog: Flutter-only tests can't do this
      // (Patrol 4 moved native APIs to $.platform.mobile; older versions use $.native)
      if (await $.platform.mobile.isPermissionDialogVisible()) {
        await $.platform.mobile.grantPermissionWhenInUse();
      }

      await $(#fakeScanResult).tap();                             // test hook in the scanner screen
      await $('Add to cart').tap();
      expect($(#cartBadge).$('1'), findsOneWidget);

      // Notifications
      await $.platform.mobile.pressHome();
      await $.platform.mobile.openNotifications();
      await $.platform.mobile.tapOnNotificationBySelector(
        Selector(textContains: 'Order confirmed'),   // selector class names also differ between Patrol versions
      );
    },
  );
}
```
Run it: `patrol test -t patrol_test/checkout_test.dart` (add `--device <id>`). Patrol runs each test in isolation, works with Firebase Test Lab / BrowserStack / emulator.wtf, and supports **hot restart** while developing tests (`patrol develop`).

### E2E best practices
* A dedicated **test entry point** (`main_test.dart`) with a fake or staging backend, seeded data and disabled analytics/animations.
* Stable selectors: `Key`s or semantics identifiers, not localized text.
* Keep E2E tests few and focused on **critical journeys**: login, purchase, onboarding, deep link. Cover the rest with widget tests.
* Run them nightly or on release branches if they're slow. Use sharding across devices.
* Record videos and screenshots on failure as CI artifacts.

---

## 39.9 Interview questions — release automation

**Q1. How do you automate iOS signing in CI?**
fastlane match (encrypted certificates/profiles repo) or Codemagic/Xcode Cloud managed signing, an App Store Connect API key for authentication, and `setup_ci` for a temporary keychain.

**Q2. How do you avoid version code conflicts?**
Compute the build number from the store's latest build + 1, or from the CI run number. Never set it by hand.

**Q3. What does a release pipeline look like for you?**
Tag → CI: analyze/test → build signed AAB/IPA with obfuscation → upload symbols → upload to internal track/TestFlight → QA → promote with staged rollout → monitor crash-free rate → increase the rollout.

**Q4. Why Patrol over integration_test?**
It can interact with native UI (permission dialogs, notifications, system settings) and has better finders and test isolation, which makes real-world E2E flows testable.

**Q5. Where do you store signing keys?**
In CI secret storage or a secret manager (base64-encoded files), never in the repo. Restrict access with protected environments, and back up keys securely.
