# Chapter 38 — Code Generation Deep Dive (build_runner, build.yaml, writing a generator) & Publishing Packages to pub.dev

> **Goal:** Configure code generation for big projects (and keep it fast), write your own generator, and publish quality packages and plugins to pub.dev with high pub points and automated releases.

---

# Part A — Code generation

## 38.1 5-year-old picture 🤖
Some code is boring and repetitive (fromJson, toJson, copyWith, ==). Instead of writing it by hand, you hire a **robot helper** (a generator) that reads little **sticky notes** (annotations like `@JsonSerializable()`) on your classes and **writes the boring code for you** into separate files (`*.g.dart`). **build_runner** is the robot's boss: it decides which robots run on which files.

## 38.2 Why codegen in Dart?
Flutter disables `dart:mirrors` (runtime reflection), because it would break tree shaking and AOT size optimizations. Dart macros were **cancelled** (January 2025). So **build-time code generation** is the standard way to remove boilerplate:
* `json_serializable`, `freezed`, `riverpod_generator`, `go_router_builder`, `retrofit_generator`, `drift_dev`, `injectable_generator`, `mockito`, `hive_ce_generator`, `flutter_gen_runner`, `auto_route_generator`, `envied_generator`, `isar_community_generator`, `dart_mappable_builder`, `slang_build_runner`…

## 38.3 How it fits together
```
your_file.dart              part 'your_file.g.dart';   ← you declare the part
   @JsonSerializable()      (annotation from a *_annotation package in dependencies)
          │
build_runner (dev_dependency) runs the builders from generator packages (dev_dependencies)
          │
          ▼
your_file.g.dart            part of 'your_file.dart';  ← generated, contains _$UserFromJson…
```
* Annotation packages (`json_annotation`, `freezed_annotation`, `riverpod_annotation`) go in **dependencies**. Generators (`json_serializable`, `freezed`, `riverpod_generator`) and `build_runner` go in **dev_dependencies**.
* Generated files use `part`/`part of`, so they can access private members of the library.
* Many `source_gen`-based generators write into **one combined `.g.dart`** per file through the `source_gen:combining_builder`. That's why json_serializable and riverpod_generator output can share `user.g.dart`. Freezed writes a separate `.freezed.dart`.

## 38.4 Commands
```bash
dart run build_runner build --delete-conflicting-outputs   # one-time build
dart run build_runner watch -d                             # rebuild on save (-d = delete conflicting)
dart run build_runner clean                                # clear the build cache (.dart_tool/build)
dart run build_runner build --build-filter="lib/features/auth/**"   # only some outputs (advanced; check docs)
```
* "Conflicting outputs" happens when `.g.dart` files already exist that build_runner didn't create (e.g., committed or from another branch). `-d` deletes and regenerates them.
* `build_runner` versions from 2025 onward made big **speed improvements** (e.g., compiling builders ahead of time and faster incremental builds). Keep it up to date in large repos.

## 38.5 `build.yaml`: configure generators project-wide
Put a `build.yaml` next to `pubspec.yaml`:
```yaml
targets:
  $default:
    builders:
      # Configure json_serializable for the whole package (no need to repeat options in every annotation)
      json_serializable:
        options:
          explicit_to_json: true
          field_rename: snake
          include_if_null: false
          any_map: false
          checked: false            # true → better error messages when JSON has the wrong type (slower)
          create_to_json: true
        generate_for:               # ⚡ only run on model files → much faster builds
          include:
            - lib/**/models/**.dart
            - lib/**/dto/**.dart

      freezed:
        generate_for:
          include:
            - lib/**/models/**.dart
            - lib/**/state/**.dart
        # freezed-specific options (e.g., turning off generated features) are listed in the freezed README

      riverpod_generator:
        generate_for:
          include:
            - lib/**/providers/**.dart
            - lib/**/*_provider.dart

      # Turn a generator off completely
      # some_package:some_builder:
      #   enabled: false

      source_gen:combining_builder:
        options:
          ignore_for_file:          # add ignores at the top of generated .g.dart files
            - type=lint
            - implicit_dynamic_parameter
```
* **`generate_for` is the #1 performance fix** in big projects. Without it, every builder analyzes every Dart file.
* Annotation-level options override build.yaml: `@JsonSerializable(fieldRename: FieldRename.none)`.
* In monorepos, each package has its own `build.yaml` and runs build_runner separately. Use melos scripts to run codegen only in packages that depend on `build_runner`.
* Also exclude generated files from the analyzer and coverage (Chapter 2 and 22).

## 38.6 Should generated files be committed?
| Commit `*.g.dart` | Don't commit (generate in CI) |
|---|---|
| ✅ Fresh clones build immediately; reviewers see generated diffs; CI is faster | ✅ Smaller diffs; no merge conflicts in generated code |
| ❌ Merge conflicts; must remember to regenerate | ❌ Everyone and CI must run build_runner; slower start |
Either way, add a **CI check**: run build_runner and fail if `git diff --exit-code` shows changes (when committing), or make sure the CI build always generates first.

## 38.7 Writing your own generator (`source_gen`)
Example: annotate an enum with `@EnumLabels()` and generate a `label` extension.

**Package layout** (a monorepo with 3 packages):
```
packages/
  enum_labels_annotation/lib/enum_labels_annotation.dart
  enum_labels_generator/
    lib/builder.dart
    lib/src/enum_labels_generator.dart
    build.yaml
  app/  (uses both)
```
**Annotation package**
```dart
// enum_labels_annotation.dart
class EnumLabels {
  const EnumLabels();
}
const enumLabels = EnumLabels();
```
**Generator**
```dart
// lib/src/enum_labels_generator.dart
import 'package:analyzer/dart/element/element.dart';
import 'package:build/build.dart';
import 'package:enum_labels_annotation/enum_labels_annotation.dart';
import 'package:source_gen/source_gen.dart';

class EnumLabelsGenerator extends GeneratorForAnnotation<EnumLabels> {
  @override
  String generateForAnnotatedElement(Element element, ConstantReader annotation, BuildStep buildStep) {
    if (element is! EnumElement) {
      throw InvalidGenerationSourceError('@EnumLabels can only be used on enums.', element: element);
    }
    final name = element.name;
    final cases = element.fields.where((f) => f.isEnumConstant).map((f) {
      final label = f.name.replaceAllMapped(RegExp('([a-z])([A-Z])'), (m) => '${m[1]} ${m[2]}');
      final pretty = label[0].toUpperCase() + label.substring(1);
      return "      $name.${f.name} => '$pretty',";
    }).join('\n');

    return '''
extension ${name}Labels on $name {
  String get label => switch (this) {
$cases
  };
}
''';
  }
}
```
> The `analyzer` package's element API has changed across major versions (a new "element2" model was introduced in 2025). Pin compatible `analyzer`/`source_gen` versions and follow their migration guides.

**Builder factory**
```dart
// lib/builder.dart
import 'package:build/build.dart';
import 'package:source_gen/source_gen.dart';
import 'src/enum_labels_generator.dart';

Builder enumLabelsBuilder(BuilderOptions options) =>
    SharedPartBuilder([EnumLabelsGenerator()], 'enum_labels');   // writes into the shared .g.dart
```
**Generator's build.yaml**
```yaml
builders:
  enum_labels:
    import: "package:enum_labels_generator/builder.dart"
    builder_factories: ["enumLabelsBuilder"]
    build_extensions: {".dart": [".enum_labels.g.part"]}
    auto_apply: dependents           # applies automatically to packages that depend on this generator
    build_to: cache                  # the .g.part goes to cache; combining_builder writes the final .g.dart
    applies_builders: ["source_gen:combining_builder"]
```
**Usage in the app**
```dart
import 'package:enum_labels_annotation/enum_labels_annotation.dart';
part 'status.g.dart';

@enumLabels
enum OrderStatus { pending, outForDelivery, delivered }

// OrderStatus.outForDelivery.label == 'Out For Delivery'
```
**Testing generators:** `package:build_test`'s `testBuilder(...)` with input assets and expected outputs. Also add a golden-file test of the generated code.

Other generator types: `LibraryBuilder` (a standalone `.dart` output), and plain `Builder` implementations for non-Dart outputs such as assets and JSON. Keep generators **deterministic and fast**: no network, and no timestamps in the output.

## 38.8 Codegen problems & fixes
| Problem | Fix |
|---|---|
| `_$UserFromJson isn't defined` | `part 'user.g.dart';` missing/misspelled, or build_runner not run |
| `Could not generate fromJson code for X` | Nested type not serializable → annotate it, add `explicitToJson`, or add a `JsonConverter` |
| Builds take minutes | `generate_for`, fewer annotated files, update build_runner, split into packages |
| Generated code changed after upgrading a generator | Expected; regenerate & review; pin versions in the lock file |
| Version solving fails between analyzer/source_gen/generators | Upgrade all generators together; check `flutter pub deps`; rarely, `dependency_overrides` temporarily |
| Freezed: "missing implementations" | Wrong class form for your freezed version (`abstract class X with _$X` in freezed 3) or the `.freezed.dart` part is missing |
| Riverpod generator: `_$Counter` not found | Class name/provider naming, `part`, `riverpod_annotation` import |

---

# Part B — Publishing packages & plugins to pub.dev 📦

## 38.9 Before you publish: checklist
1. **Name**: lowercase_with_underscores, unique on pub.dev, not misleading (don't use `flutter_` names that imply official packages unless you're allowed).
2. **pubspec.yaml**:
```yaml
name: smart_debouncer
description: >-
  A tiny, well-tested debouncer and throttler for Dart and Flutter with
  cancellation, leading/trailing edges and stream transformers.   # 60–180 characters recommended
version: 1.0.0
repository: https://github.com/you/smart_debouncer
issue_tracker: https://github.com/you/smart_debouncer/issues
documentation: https://github.com/you/smart_debouncer#readme   # optional
topics: [debounce, throttle, streams, utilities]               # up to 5 topics, lowercase
screenshots:
  - description: Debounced search demo
    path: doc/screenshots/search.gif
funding:
  - https://github.com/sponsors/you
environment:
  sdk: ^3.5.0
  flutter: ">=3.24.0"        # only if it depends on Flutter
dependencies:
  meta: ^1.15.0              # keep constraints WIDE (caret), so apps can resolve versions
dev_dependencies:
  test: ^1.25.0
  lints: ^5.0.0
```
3. **README.md**: what it does, a quick example at the top, installation, features, platform support table, limitations, a contributing link. pub.dev renders this as your home page.
4. **CHANGELOG.md**: an entry for every version (`## 1.0.0` + bullet points). It's required for full pub points.
5. **LICENSE**: an OSI-approved license (MIT, BSD-3, Apache-2.0). pub.dev detects it.
6. **example/**: `example/lib/main.dart` (or `example/example.dart` for Dart packages). pub.dev shows it in the Example tab.
7. **Public API docs**: `///` on every public member. Check with `dart doc`. pub points include doc coverage (20%+ is the minimum for full points, but aim for 100%).
8. **`lib/` structure**: public API in `lib/smart_debouncer.dart` (exports), implementation in `lib/src/` (private by convention).
9. **Tests & CI** (format, analyze, test on multiple SDK versions).
10. **`.pubignore`** to exclude large files from the archive (works like .gitignore; if present it replaces .gitignore for publishing).

## 38.10 Pub points (max 160) and how to earn them
pub.dev scores packages with **pana**. Run it locally: `dart pub global activate pana && pana .`
| Category | Requirements |
|---|---|
| Follow Dart file conventions | Valid pubspec, README, CHANGELOG, OSI license |
| Provide documentation | Example + ≥20% documented public API |
| Platform support | Works on multiple platforms (no unconditional dart:io for "all platforms"), declared plugin platforms |
| Pass static analysis | No errors/warnings/lints; formatted code |
| Support up-to-date dependencies | Works with the latest versions of dependencies & SDK |
| Null safety / modern SDK | Sound null safety & a recent SDK constraint (Dart 3 compatible) |
Popularity is now shown as **downloads**. **Likes** are separate.

## 38.11 Publish
```bash
dart format .
dart analyze            # or flutter analyze
dart test               # or flutter test
dart pub publish --dry-run   # validates & shows the files that will be uploaded
dart pub publish             # asks for confirmation; first time opens Google login
```
* **Publishing is permanent.** You can't delete a version. You can:
  * **retract** a version within **7 days** of publishing (pub stops picking it for new resolutions)
  * mark the package **discontinued** (optionally pointing to a replacement)
  * mark it unlisted
* **Verified publisher**: create one on pub.dev for your domain (domain verified through Google Search Console) and transfer packages to it. It shows a ✓ badge and adds trust, which companies care about.
* **Prereleases**: `2.0.0-dev.1`, `2.0.0-beta.2`. Users must opt in explicitly.
* **SemVer discipline**:
  * breaking API change → major
  * new feature → minor
  * bug fix → patch
  * For `0.x`, a minor bump means breaking.

## 38.12 Automated publishing from GitHub Actions (OIDC, no secrets)
1. On pub.dev → package **Admin** → **Automated publishing** → enable GitHub Actions, set the repository and a tag pattern such as `v{{version}}`.
2. Add a workflow:
```yaml
# .github/workflows/publish.yml
name: Publish to pub.dev
on:
  push:
    tags: ['v[0-9]+.[0-9]+.[0-9]+*']
jobs:
  publish:
    permissions:
      id-token: write          # required for OIDC authentication with pub.dev
    uses: dart-lang/setup-dart/.github/workflows/publish.yml@v1
    # with:
    #   working-directory: packages/smart_debouncer   # for monorepos
```
For Flutter packages, use a custom job: install Flutter (`subosito/flutter-action`), then run `flutter pub publish --force` with the same `id-token: write` permission (follow the pub.dev automated publishing docs for Flutter).
3. Release: bump the version in pubspec + CHANGELOG → commit → `git tag v1.1.0 && git push --tags`.

Monorepos: tag per package (`smart_debouncer-v1.1.0`) with a matching pattern, or use **melos version/publish** to version and publish many packages, with changelogs generated from conventional commits.

## 38.13 Publishing a plugin: extra rules
* Declare platforms under `flutter: plugin: platforms:` with `pluginClass`/`package` (Android), `pluginClass` (iOS/macOS), `fileName` (web), `dartPluginClass` for Dart-only implementations.
* Federated plugins: publish `x_platform_interface` first, then the implementations, then the app-facing `x` package (with `default_package` endorsements).
* **iOS:** support **Swift Package Manager** (`ios/<name>/Package.swift`) and keep a CocoaPods podspec while the ecosystem transitions. Include a `PrivacyInfo.xcprivacy` privacy manifest if your plugin uses required-reason APIs or collects data.
* **Android:** a `namespace` in Gradle, minimal permissions (apps inherit them!), ProGuard/R8 consumer rules (`consumer-rules.pro`) for reflection-based code, and the 16 KB page-size compatibility of native libraries.
* Example app with integration tests. Document permissions/setup steps for every platform clearly in the README.
* Keep platform interface changes **non-breaking**: add methods with default implementations that throw `UnimplementedError`.

## 38.14 Maintaining packages (and judging others' packages)
* Respond to issues; label them; have a contributing guide and issue templates.
* Run CI against **stable and beta** Flutter so you catch breakages early.
* Keep dependency constraints wide but tested (`dart pub downgrade` tests the lower bounds).
* Deprecate APIs with `@Deprecated('Use x instead. Will be removed in 3.0')` before removing them.
* Security: enable 2FA on your Google account. Automated publishing via OIDC means no long-lived tokens.

---

## 38.15 Interview questions — codegen & packages

**Q1. Why does Flutter rely on code generation instead of reflection?**
dart:mirrors is unavailable in Flutter because reflection defeats tree shaking and AOT optimizations, and macros were cancelled. Build-time generation produces plain Dart code with no runtime cost.

**Q2. How do you speed up build_runner in a large project?**
Restrict builders with `generate_for` in build.yaml, split the code into packages, keep build_runner/generators updated, use watch mode locally, and avoid unnecessary annotated files.

**Q3. What is `SharedPartBuilder` / combining builder?**
It lets several source_gen generators write `.g.part` fragments that the combining builder merges into a single `.g.dart` part file.

**Q4. How do you publish a package and ensure quality?**
Complete pubspec metadata, README/CHANGELOG/LICENSE/example, documented API, analysis-clean code, tests, `pana` checks, `dart pub publish --dry-run`, then publish, preferably through automated OIDC publishing on tags.

**Q5. Can you delete a published version?**
No. You can retract it within 7 days, discontinue or unlist the package, and publish fixed versions.

**Q6. What are pub points?**
A score (max 160) from pana analysis: conventions, documentation, platform support, static analysis, up-to-date dependencies, and modern SDK/null safety support.

**Q7. dependencies vs dev_dependencies for codegen packages?**
Annotation packages go in dependencies (used in source). Generators and build_runner go in dev_dependencies (build tools only).
