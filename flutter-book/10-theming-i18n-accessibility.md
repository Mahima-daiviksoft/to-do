# Chapter 10 — Theming, Material 3, Design Systems, Assets, Fonts, Localization & Accessibility

> **Goal:** Build apps that look consistent (design systems), support dark mode, multiple languages and RTL, and are accessible to everyone. These topics separate hobby apps from enterprise apps.

---

## 10.1 Theme basics — the app's outfit 👗

**5-year-old:** Instead of telling every button "be blue" one by one, you tell the whole app at the top: "**our team colour is blue**." Everybody below automatically wears blue. That's a **Theme**.

```dart
MaterialApp(
  theme: ThemeData(
    colorScheme: ColorScheme.fromSeed(seedColor: const Color(0xFF0061A4)),
    useMaterial3: true,                 // default true since Flutter 3.16
    textTheme: GoogleFonts.interTextTheme(),
    visualDensity: VisualDensity.adaptivePlatformDensity,
  ),
  darkTheme: ThemeData(
    colorScheme: ColorScheme.fromSeed(
      seedColor: const Color(0xFF0061A4),
      brightness: Brightness.dark,
    ),
  ),
  themeMode: ThemeMode.system,
);
```
Reading theme values:
```dart
final theme = Theme.of(context);
final cs = theme.colorScheme;
Container(color: cs.primaryContainer, child: Text('Hi', style: theme.textTheme.titleMedium?.copyWith(color: cs.onPrimaryContainer)));
```
**Rule:** never hard-code colours/text styles in widgets in a company app; always use theme tokens. This makes dark mode, rebranding, and white-labelling trivial.

---

## 10.2 Material 3 (Material You)

* M3 became **default in Flutter 3.16** (`useMaterial3: true`). Set `false` to keep M2 temporarily (M2 is being phased out).
* **ColorScheme roles** (memorise the pattern): `primary` / `onPrimary` / `primaryContainer` / `onPrimaryContainer`; same for `secondary`, `tertiary`, `error`; `surface` / `onSurface` / `onSurfaceVariant`; `surfaceContainerLowest`…`surfaceContainerHighest` (tonal surfaces, replaced deprecated `background`/`surfaceVariant` in Flutter 3.22); `outline`, `outlineVariant`, `inverseSurface`, `shadow`, `scrim`.
  * "on" colours are for content (text/icons) placed **on** the matching colour — guarantees contrast.
* `ColorScheme.fromSeed` generates a harmonious tonal palette from one seed colour (dynamic color algorithm). `dynamic_color` package uses Android 12+ wallpaper colours.
* **Elevation** in M3 is shown by **surface tint** colour more than shadows; `scrolledUnderElevation` on AppBar.
* New components: `FilledButton`, `NavigationBar`, `NavigationRail`, `NavigationDrawer`, `SegmentedButton`, `SearchBar`/`SearchAnchor`, `Badge`, `MenuAnchor`, `DropdownMenu`, `CarouselView`, M3 `SliverAppBar.medium/.large`.
* Typography: `displayLarge/Medium/Small`, `headlineLarge/…`, `titleLarge/…`, `bodyLarge/…`, `labelLarge/…` (old names `headline1`, `bodyText1` etc. were removed).

### Material & Cupertino moving to packages (Flutter 3.44–3.47+)
The Flutter team **froze** `material.dart`/`cupertino.dart` in the framework in **3.44** and published them as standalone packages **`material_ui`** and **`cupertino_ui`** (1.0 published starting with Flutter 3.47). Reason: Material/Cupertino updates can ship on their own schedule instead of waiting for quarterly SDK releases. Migration is designed to be drop-in (mostly import changes, with a `dart fix` migration available). The in-framework libraries are planned to be deprecated and later removed — follow the official breaking-change guide ("Migrate to standalone material_ui and cupertino_ui packages") when your team upgrades. All widget APIs in this book are the same whichever import you use.

---

## 10.3 Component themes — design system in code

```dart
ThemeData buildTheme(Brightness b) {
  final cs = ColorScheme.fromSeed(seedColor: AppColors.brand, brightness: b);
  return ThemeData(
    colorScheme: cs,
    scaffoldBackgroundColor: cs.surface,
    appBarTheme: AppBarTheme(centerTitle: true, backgroundColor: cs.surface, elevation: 0),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        minimumSize: const Size(64, 48),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      ),
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
    ),
    cardTheme: const CardThemeData(margin: EdgeInsets.zero, elevation: 0), // CardThemeData in recent versions
    snackBarTheme: const SnackBarThemeData(behavior: SnackBarBehavior.floating),
    pageTransitionsTheme: const PageTransitionsTheme(builders: {
      TargetPlatform.android: PredictiveBackPageTransitionsBuilder(), // Android predictive back
      TargetPlatform.iOS: CupertinoPageTransitionsBuilder(),
    }),
    extensions: [AppSpacing.regular, AppBrandColors.light],
  );
}
```
> Note: in Flutter 3.27+, `ThemeData.cardTheme`, `dialogTheme`, `tabBarTheme` etc. are being normalized to `*ThemeData` classes (`CardThemeData`, `DialogThemeData`, `TabBarThemeData`). Analyzer/`dart fix` will guide you.

### ThemeExtension — your own custom tokens
```dart
@immutable
class AppBrandColors extends ThemeExtension<AppBrandColors> {
  const AppBrandColors({required this.success, required this.warning});
  final Color success;
  final Color warning;

  static const light = AppBrandColors(success: Color(0xFF2E7D32), warning: Color(0xFFF9A825));
  static const dark  = AppBrandColors(success: Color(0xFF81C784), warning: Color(0xFFFFD54F));

  @override
  AppBrandColors copyWith({Color? success, Color? warning}) =>
      AppBrandColors(success: success ?? this.success, warning: warning ?? this.warning);

  @override
  AppBrandColors lerp(ThemeExtension<AppBrandColors>? other, double t) {
    if (other is! AppBrandColors) return this;
    return AppBrandColors(
      success: Color.lerp(success, other.success, t)!,
      warning: Color.lerp(warning, other.warning, t)!,
    );
  }
}
// Use:
final brand = Theme.of(context).extension<AppBrandColors>()!;
Icon(Icons.check, color: brand.success);
```
`lerp` enables smooth animated theme transitions (MaterialApp animates between themes using `AnimatedTheme`).

### Local theme overrides
```dart
Theme(
  data: Theme.of(context).copyWith(colorScheme: Theme.of(context).colorScheme.copyWith(primary: Colors.red)),
  child: const DangerZone(),
);
```

### Color API changes to know (Flutter 3.27+)
* `Color.withOpacity()` is **deprecated** → use `color.withValues(alpha: 0.5)` (wide-gamut colour support; components are now doubles `r`, `g`, `b`, `a` in 0–1).
* `Color.value`, `.red`, `.green`, `.blue`, `.opacity` deprecated → `toARGB32()`, `.r`, `.g`, `.b`, `.a`.

### Dark mode toggle (persisted)
Store `ThemeMode` in your state management + SharedPreferences; MaterialApp listens and rebuilds:
```dart
ValueListenableBuilder<ThemeMode>(
  valueListenable: themeController,   // ValueNotifier<ThemeMode>
  builder: (_, mode, __) => MaterialApp(themeMode: mode, theme: light, darkTheme: dark, home: ...),
);
```

### Design system organisation (enterprise)
```
lib/core/design_system/
├── tokens/ (colors.dart, typography.dart, spacing.dart, radii.dart, durations.dart)
├── theme/ (app_theme.dart, extensions.dart)
└── components/ (app_button.dart, app_text_field.dart, app_card.dart, ...)
```
Many companies put this in a separate **package** in a monorepo (`packages/design_system`) with its own **widgetbook** (Storybook-like catalog: `widgetbook` package) and **golden tests** (Chapter 22). Figma tokens can be exported and generated into Dart.

---

## 10.4 Assets, fonts, icons, splash

### Loading assets
```dart
Image.asset('assets/images/logo.png');
final jsonStr = await rootBundle.loadString('assets/config/app.json');
final bytes = await rootBundle.load('assets/models/model.tflite');
DefaultAssetBundle.of(context).loadString(...);   // testable alternative
```
Type-safe asset references: **`flutter_gen`** generates `Assets.images.logo.image()` — avoids typos ("Unable to load asset").

Asset **transformers** (Flutter 3.22+): transform assets at build time (e.g., `vector_graphics_compiler` for SVGs) via `transformers:` in pubspec.

### Fonts
Declare in pubspec (Chapter 2), then `fontFamily: 'Inter'` or in `ThemeData(fontFamily: 'Inter')`. Variable fonts supported with `FontVariation`. Packaged fonts: `fontFamily: 'Roboto', package: 'my_design_system'`.

### App icons & splash screens
* **`flutter_launcher_icons`** — generates Android adaptive icons and iOS icon sets.
* **`flutter_native_splash`** — generates native splash (Android 12+ uses the `SplashScreen` API: icon on background colour only; iOS LaunchScreen storyboard). The native splash shows while the engine loads; then your first Flutter frame. Keep it until init finishes: `FlutterNativeSplash.preserve(widgetsBinding: binding)` → `FlutterNativeSplash.remove()`.
* Don't build a fake "splash page" with a timer just to show a logo — it delays users. Do real initialization instead.

---

## 10.5 Internationalization (i18n) & Localization (l10n) 🌍

**i18n** = making the app *able* to support many languages/regions. **l10n** = actually translating & formatting for a specific locale.

### Official setup with `gen-l10n`
1. `pubspec.yaml`:
```yaml
dependencies:
  flutter_localizations:
    sdk: flutter
  intl: any          # version pinned by flutter_localizations
flutter:
  generate: true
```
2. `l10n.yaml` at project root:
```yaml
arb-dir: lib/l10n
template-arb-file: app_en.arb
output-localization-file: app_localizations.dart
# Recent Flutter versions generate into the source tree (no synthetic package):
# output-dir: lib/l10n/gen
nullable-getter: false
```
3. `lib/l10n/app_en.arb`:
```json
{
  "@@locale": "en",
  "helloUser": "Hello {name}!",
  "@helloUser": { "placeholders": { "name": { "type": "String" } } },
  "itemsInCart": "{count, plural, =0{Your cart is empty} =1{1 item in cart} other{{count} items in cart}}",
  "@itemsInCart": { "placeholders": { "count": { "type": "int" } } },
  "genderGreeting": "{gender, select, male{Welcome sir} female{Welcome madam} other{Welcome}}",
  "price": "Price: {amount}",
  "@price": { "placeholders": { "amount": { "type": "double", "format": "currency", "optionalParameters": { "symbol": "₹", "decimalDigits": 2 } } } },
  "lastSeen": "Last seen {date}",
  "@lastSeen": { "placeholders": { "date": { "type": "DateTime", "format": "yMMMd" } } }
}
```
`app_hi.arb`, `app_ar.arb` etc. with the same keys.
4. Wire up:
```dart
MaterialApp(
  localizationsDelegates: AppLocalizations.localizationsDelegates, // includes GlobalMaterialLocalizations etc.
  supportedLocales: AppLocalizations.supportedLocales,
  locale: userSelectedLocale,   // null = follow device
);
// Use:
Text(AppLocalizations.of(context).helloUser('Asha'));
// handy extension: extension L10nX on BuildContext { AppLocalizations get l10n => AppLocalizations.of(this); }
```
Run `flutter gen-l10n` (or it runs automatically on `flutter run`/`build` when `generate: true`).

> The old "synthetic package" approach (`import 'package:flutter_gen/gen_l10n/app_localizations.dart'`) was deprecated in Flutter 3.29-ish; newer projects generate into the source tree (`output-dir`), imported like normal source.

### iOS extra step
Add supported languages to `ios/Runner/Info.plist` `CFBundleLocalizations` array, or iOS may not switch.

### Formatting with `intl`
```dart
NumberFormat.currency(locale: 'en_IN', symbol: '₹').format(123456.5); // ₹1,23,456.50
NumberFormat.compact().format(1200000);   // 1.2M
DateFormat.yMMMMd('fr').format(DateTime.now());  // 15 octobre 2026
DateFormat('dd/MM/yyyy HH:mm').format(dt);
```
Call `initializeDateFormatting()` if using DateFormat for non-default locales outside the Flutter localizations delegates.

### RTL (Arabic, Hebrew, Urdu)
* Flutter flips layouts automatically based on `Directionality` (set by locale).
* Use `EdgeInsetsDirectional`, `AlignmentDirectional`, `PositionedDirectional`, `start/end` instead of `left/right`.
* Icons like arrows: use `Icons.arrow_back` (auto-mirrored in RTL for certain icons) or `Directionality.of(context)` checks.
* Test with `locale: Locale('ar')`.

### Alternatives
`easy_localization` (JSON/CSV/YAML, runtime switching, popular), `slang` (type-safe, codegen), translation management tools (Lokalise, Crowdin, Phrase) that sync ARB files.

### Org best practices
* Never concatenate translated strings (`'Hello ' + name`) — word order differs per language; use placeholders.
* Use ICU plurals/selects; plural rules differ (Arabic has 6 forms!).
* Don't put text in images.
* Allow text expansion (German ~30% longer) — avoid fixed-width text containers.
* Pseudo-localization testing.
* Keys named by meaning (`checkoutPayButton`), with descriptions for translators (`"description"` in `@key`).

---

## 10.6 Accessibility (a11y) ♿

**5-year-old:** Some people can't see the screen well, some can't use their hands easily, some need bigger letters. Accessibility means **everyone** can use your app — like ramps next to stairs.

Flutter builds a **Semantics tree** parallel to the render tree, which it sends to the platform accessibility services (TalkBack on Android, VoiceOver on iOS, screen readers on web/desktop).

### Key techniques
```dart
// 1. Labels for icons/images
IconButton(icon: const Icon(Icons.delete), tooltip: 'Delete', onPressed: ...); // tooltip provides semantics label
Image.asset('assets/chart.png', semanticLabel: 'Sales up 20% this month');
const Image(image: AssetImage('decor.png'), excludeFromSemantics: true);   // decorative

// 2. Custom semantics
Semantics(
  label: 'Rating: 4 out of 5 stars',
  button: false,
  child: Row(children: stars),
);
MergeSemantics(child: Row(children: [Checkbox(...), const Text('Remember me')])); // read as one
ExcludeSemantics(child: decorativeWidget);
Semantics(liveRegion: true, child: Text(statusMessage));  // announce updates
SemanticsService.announce('Item deleted', TextDirection.ltr);  // ad-hoc announcement

// 3. Large text: respect user text scaling; test at 200%. Avoid fixed heights for text containers.
// 4. Contrast: WCAG AA ≥ 4.5:1 for normal text, 3:1 for large text — use colorScheme "on" colours.
// 5. Tap targets ≥ 48×48 dp (Android) / 44×44 pt (iOS). Material widgets handle this via MaterialTapTargetSize.padded.
// 6. Focus & keyboard navigation (desktop/web/TV): FocusTraversalGroup, Shortcuts, Actions, visible focus indicators.
// 7. Don't convey info by colour alone (add icons/text).
// 8. Reduce motion: MediaQuery.disableAnimationsOf(context) → shorten/skip animations.
// 9. Ordering: OrdinalSortKey / FocusTraversalOrder to fix reading order.
```

### Testing accessibility
* Turn on TalkBack/VoiceOver and navigate your app.
* `showSemanticsDebugger: true` in MaterialApp.
* Widget tests with guidelines:
```dart
testWidgets('meets a11y guidelines', (tester) async {
  final handle = tester.ensureSemantics();
  await tester.pumpWidget(const MyApp());
  await expectLater(tester, meetsGuideline(androidTapTargetGuideline));
  await expectLater(tester, meetsGuideline(iOSTapTargetGuideline));
  await expectLater(tester, meetsGuideline(labeledTapTargetGuideline));
  await expectLater(tester, meetsGuideline(textContrastGuideline));
  handle.dispose();
});
```
* Accessibility Scanner (Android), Accessibility Inspector (Xcode).
* Web: Flutter web builds the semantics tree lazily; users enable it via a hidden "Enable accessibility" button, or you can call `SemanticsBinding.instance.ensureSemantics()` to force it on (helps automation/SEO tooling too).

Legal context: many countries require accessible apps (ADA in US, European Accessibility Act enforced from June 2025, etc.) — enterprise clients ask for WCAG 2.1/2.2 AA compliance.

---

## 10.7 Interview Questions — Theming, i18n, a11y

**Q1. How do you implement dark mode?** Provide `theme` and `darkTheme` (e.g., `ColorScheme.fromSeed` with brightness) and `themeMode` (system/light/dark), read colours from `Theme.of(context).colorScheme`, persist the user choice.

**Q2. What is ColorScheme.fromSeed?** Generates a full M3 tonal colour scheme from a single seed colour.

**Q3. How do you add custom theme properties?** `ThemeExtension<T>` with `copyWith` and `lerp`, registered in `ThemeData.extensions`, accessed with `Theme.of(context).extension<T>()`.

**Q4. How do you localize a Flutter app?** flutter_localizations + intl, ARB files, gen-l10n generating `AppLocalizations`, delegates and supported locales on MaterialApp, `AppLocalizations.of(context)`; ICU plurals/selects; Info.plist locales for iOS.

**Q5. How does Flutter support RTL?** Directionality from locale; directional widgets (`EdgeInsetsDirectional`, `AlignmentDirectional`), Row/ListView automatically mirror.

**Q6. How do you make a Flutter app accessible?** Semantic labels, tooltips, MergeSemantics/ExcludeSemantics, sufficient contrast, 48dp tap targets, support text scaling, focus traversal & keyboard, reduce motion, test with screen readers and `meetsGuideline`.

**Q7. What is the Semantics tree?** A tree of semantic nodes generated from widgets that describes meaning (labels, actions, states) for accessibility services.

**Q8. What changed with Material 3 in Flutter?** M3 default from 3.16; new colour roles & tonal surfaces; new components (FilledButton, NavigationBar, etc.); typography names; surface tint elevation.

**Q9. `withOpacity` vs `withValues`?** `withOpacity` is deprecated (3.27+) in favour of `withValues(alpha:)` due to wide-gamut colour support and float components.

**Q10. What are `material_ui` and `cupertino_ui`?** Standalone pub.dev packages containing Flutter's Material and Cupertino libraries, decoupled from the SDK (published from Flutter 3.47) so they can release independently.
