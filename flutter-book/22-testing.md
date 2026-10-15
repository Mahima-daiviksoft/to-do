# Chapter 22 — Testing: Unit, Widget, Golden, Integration, Mocking, Coverage & TDD

> **Goal:** Write tests that catch real bugs, run fast in CI, and give the team confidence to refactor. Interviewers ask about test types, mocking, `pump` vs `pumpAndSettle`, testing async/streams/blocs/providers, and golden tests.

---

## 22.1 The testing pyramid 🔺

```
          ▲  Integration / E2E (few, slow, real device/emulator)
         ▲▲▲  Widget tests (many, fast, no device)
       ▲▲▲▲▲▲  Unit tests (most, fastest, pure Dart)
```
| Type | Tests | Speed | Confidence | Tooling |
|---|---|---|---|---|
| Unit | A function/class (logic, repos, blocs) | ms | narrow | `test` / `flutter_test` |
| Widget | A widget/screen in a fake environment | ms–s | UI behaviour | `flutter_test` (`testWidgets`) |
| Golden | Pixel output of a widget vs saved image | s | visual regressions | `matchesGoldenFile`, `alchemist` |
| Integration | Full app on device/emulator/browser | s–min | end-to-end flows | `integration_test`, **Patrol**, Maestro, Appium |

**5-year-old:** Unit test = check **one LEGO brick** isn't broken. Widget test = check **a small LEGO car** rolls. Integration test = check the **whole LEGO city** works together.

---

## 22.2 Unit tests

```dart
// lib/cart.dart
class Cart {
  final _items = <String, int>{};
  void add(String id, {int qty = 1}) {
    if (qty <= 0) throw ArgumentError.value(qty, 'qty');
    _items.update(id, (q) => q + qty, ifAbsent: () => qty);
  }
  int get totalItems => _items.values.fold(0, (a, b) => a + b);
}

// test/cart_test.dart
import 'package:flutter_test/flutter_test.dart';   // or package:test/test.dart for pure Dart packages

void main() {
  group('Cart', () {
    late Cart cart;
    setUp(() => cart = Cart());          // runs before each test
    tearDown(() {});                     // after each
    // setUpAll / tearDownAll — once per group/file

    test('starts empty', () {
      expect(cart.totalItems, 0);
    });

    test('adds quantities for same item', () {
      cart..add('a')..add('a', qty: 2);
      expect(cart.totalItems, equals(3));
    });

    test('throws on non-positive qty', () {
      expect(() => cart.add('a', qty: 0), throwsArgumentError);
    });
  });
}
```
Matchers: `equals`, `isTrue/isFalse`, `isNull/isNotNull`, `isA<Type>()`, `throwsA(isA<ApiException>())`, `contains`, `containsAll`, `hasLength`, `isEmpty`, `greaterThan`, `closeTo(3.14, 0.01)`, `orderedEquals`, `unorderedEquals`, `predicate`, `allOf/anyOf`, `isA<User>().having((u) => u.name, 'name', 'Asha')`.

Async:
```dart
test('fetches user', () async {
  final user = await repo.getUser('1');
  expect(user.name, 'Asha');
});
expect(future, completion(equals(42)));
expect(future, throwsA(isA<TimeoutException>()));
expect(stream, emitsInOrder([1, 2, emitsDone]));
expect(stream, emitsThrough(3));
expect(stream, neverEmits(0));
```
Time-dependent code: `fake_async` / `FakeAsync().run((async) { ...; async.elapse(Duration(seconds: 5)); })`; inject a `Clock` (package `clock`) instead of calling `DateTime.now()` directly.

Run: `flutter test`, `flutter test test/cart_test.dart`, `--name "adds"`, `--tags`, `--coverage`, `-j 4` (concurrency), `--reporter expanded`.

---

## 22.3 Mocking & fakes

* **Fake** — a simple working implementation (in-memory repository). Preferred for many cases; readable.
* **Mock** — records calls and returns programmed responses; verify interactions.
* **Stub** — returns canned data.

### mocktail (no codegen — most popular)
```dart
import 'package:mocktail/mocktail.dart';

class MockAuthApi extends Mock implements AuthApi {}
class FakeLoginRequest extends Fake implements LoginRequest {}

void main() {
  setUpAll(() => registerFallbackValue(FakeLoginRequest())); // needed for any() with custom types

  test('login saves token', () async {
    final api = MockAuthApi();
    final store = InMemoryTokenStore();                       // a fake
    when(() => api.login(any())).thenAnswer((_) async => const LoginResponse(token: 't1'));

    final repo = AuthRepositoryImpl(api, store);
    await repo.login('a@b.com', 'pw');

    expect(await store.read(), 't1');
    verify(() => api.login(any())).called(1);
    verifyNoMoreInteractions(api);
  });

  test('throws on network error', () {
    final api = MockAuthApi();
    when(() => api.login(any())).thenThrow(const SocketException('no net'));
    expect(() => AuthRepositoryImpl(api, InMemoryTokenStore()).login('a', 'b'), throwsA(isA<NetworkFailure>()));
  });
}
```
* `thenReturn` for sync values; **`thenAnswer((_) async => ...)` for Futures** (using `thenReturn(Future.value(x))` is an error in mockito/mocktail).
* `captureAny()` + `verify(...).captured`.
* **mockito** — uses codegen `@GenerateNiceMocks([MockSpec<AuthApi>()])` + build_runner (null-safety era).

Rule: **mock at the boundaries** (API client, platform services), not your own domain logic. Too many mocks = brittle tests.

---

## 22.4 Widget tests 🧪

```dart
void main() {
  testWidgets('counter increments when FAB tapped', (WidgetTester tester) async {
    await tester.pumpWidget(const MaterialApp(home: CounterPage()));   // ❗ wrap in MaterialApp for Theme/Directionality/Navigator

    expect(find.text('0'), findsOneWidget);
    expect(find.text('1'), findsNothing);

    await tester.tap(find.byIcon(Icons.add));
    await tester.pump();                      // rebuild one frame

    expect(find.text('1'), findsOneWidget);
  });

  testWidgets('login shows error on invalid email', (tester) async {
    await tester.pumpWidget(MaterialApp(home: LoginPage(authRepository: FakeAuthRepository())));
    await tester.enterText(find.byKey(const Key('login_email')), 'bad-email');
    await tester.tap(find.widgetWithText(FilledButton, 'Login'));
    await tester.pumpAndSettle();
    expect(find.text('Enter a valid email'), findsOneWidget);
  });
}
```

### Finders
`find.text('x')`, `find.textContaining('x')`, `find.byType(ListTile)`, `find.byKey(const Key('k'))`, `find.byIcon(Icons.add)`, `find.byWidget(w)`, `find.byWidgetPredicate((w) => w is Text && w.data!.startsWith('A'))`, `find.byTooltip('Delete')`, `find.bySemanticsLabel('...')`, `find.descendant(of: ..., matching: ...)`, `find.ancestor(...)`, `find.widgetWithText(ElevatedButton, 'Save')`, `.first`, `.last`, `.at(i)`.
Matchers: `findsOneWidget`, `findsNothing`, `findsWidgets`, `findsNWidgets(n)`, `findsAtLeastNWidgets(n)`, `findsAny`.

### Interactions
`tap`, `longPress`, `enterText`, `drag(finder, Offset(0, -300))`, `fling`, `scrollUntilVisible(finder, 200, scrollable: find.byType(Scrollable).first)`, `ensureVisible`, `sendKeyEvent(LogicalKeyboardKey.enter)`, `pageBack()`, `binding.setSurfaceSize(Size(400, 800))` / `tester.view.physicalSize = ...` (+ `addTearDown(tester.view.reset)`) to test responsive layouts.

### `pump` vs `pumpAndSettle` vs `pump(duration)` (MOST ASKED)
* `pump()` — triggers **one frame** (rebuilds dirty widgets). Time doesn't advance (unless you pass a duration).
* `pump(Duration(ms: 500))` — advances the fake clock by that duration and pumps a frame — use to step through animations/timers.
* `pumpAndSettle()` — keeps pumping frames (100ms steps by default) **until no more frames are scheduled** (animations finished). ⚠️ **Times out** (error "pumpAndSettle timed out") with infinite animations (`CircularProgressIndicator`, repeating controllers) → use `pump(duration)` instead.
* Widget tests run in a **FakeAsync zone**: timers and `Future.delayed` only progress when you pump with durations. Real async I/O (HTTP, files) won't work naturally → use `tester.runAsync(() async {...})` for real async, or (better) fakes.
* By default, **HTTP requests in widget tests return 400** (`HttpOverrides` set by the test binding) — mock network.

### Providing dependencies in widget tests
```dart
await tester.pumpWidget(
  ProviderScope(
    overrides: [productRepoProvider.overrideWithValue(FakeProductRepo())],
    child: const MaterialApp(home: ProductListPage()),
  ),
);
// Bloc:
await tester.pumpWidget(BlocProvider<LoginBloc>.value(value: mockLoginBloc, child: const MaterialApp(home: LoginView())));
whenListen(mockLoginBloc, Stream.fromIterable([const LoginState(status: LoginStatus.failure, error: 'x')]), initialState: const LoginState());
```
Navigation: provide a `MockNavigatorObserver` or a test `GoRouter`, then verify current route/widgets.

Images: `Image.network` fails in tests → use `mocktail_image_network` (`mockNetworkImagesFor(() => tester.pumpWidget(...))`) or inject image providers.

---

## 22.5 Golden tests 🖼️

```dart
testWidgets('ProductCard golden', (tester) async {
  await tester.pumpWidget(MaterialApp(
    theme: AppTheme.light,
    home: Scaffold(body: Center(child: ProductCard(product: sampleProduct))),
  ));
  await expectLater(find.byType(ProductCard), matchesGoldenFile('goldens/product_card_light.png'));
});
```
* Generate/update: `flutter test --update-goldens`.
* ⚠️ **Fonts**: tests use the "Ahem" test font by default (text renders as boxes) unless you load real fonts (`loadAppFonts()` from `golden_toolkit` (discontinued), or `alchemist`, or load fonts manually with `FontLoader`).
* ⚠️ **Platform differences**: golden pixels differ between macOS/Linux/Windows rendering → generate goldens in the same environment as CI (e.g., Docker/Linux) or use tolerant comparators; `alchemist` provides CI-friendly goldens (with obscured text) + platform goldens.
* Test multiple themes (light/dark), text scales, locales (RTL), and screen sizes.
* Great for design systems (catch unintended visual changes in PRs).

---

## 22.6 Integration tests (E2E)

```yaml
dev_dependencies:
  integration_test:
    sdk: flutter
  flutter_test:
    sdk: flutter
```
`integration_test/app_test.dart`:
```dart
import 'package:integration_test/integration_test.dart';
import 'package:my_app/main.dart' as app;

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  testWidgets('user can log in and see home', (tester) async {
    app.main();                         // or pump your App with test config
    await tester.pumpAndSettle();
    await tester.enterText(find.byKey(const Key('login_email')), 'test@example.com');
    await tester.enterText(find.byKey(const Key('login_password')), 'password123');
    await tester.tap(find.byKey(const Key('login_submit')));
    await tester.pumpAndSettle(const Duration(seconds: 5));
    expect(find.text('Welcome'), findsOneWidget);
  });
}
```
Run: `flutter test integration_test/app_test.dart -d <device>`; for web: `flutter drive --driver=test_driver/integration_test.dart --target=integration_test/app_test.dart -d chrome`. Firebase Test Lab / AWS Device Farm / BrowserStack for device matrices.

Limitations of `integration_test`: can't interact with **native UI** (permission dialogs, notifications, system settings, WebViews' native content).
* **Patrol** (by LeanCode) — extends Flutter tests with native automation (grant permissions, tap notifications, toggle Wi-Fi), nicer finders (`$('Login').tap()`), test isolation, sharding.
* **Maestro** — YAML-based black-box UI flows (works with Flutter via semantics/text), popular for quick E2E.
* **Appium Flutter driver** — for QA teams using Appium.
* `flutter_driver` — the **old** API (deprecated in favour of integration_test).

Tips: use **stable keys** (`Key('login_submit')`) or semantics identifiers (`Semantics(identifier: ...)` for automation tools) instead of texts that change with localization; seed test data via a test backend/mock server; make tests independent; avoid fixed sleeps.

---

## 22.7 Testing specific things
* **Blocs** — `bloc_test` (Chapter 15).
* **Riverpod** — `ProviderContainer.test` + overrides (Chapter 15).
* **ChangeNotifier** — call methods, assert state, count `notifyListeners` with a listener counter.
* **Streams** — `emitsInOrder`, `StreamQueue` (package `async`).
* **Platform channels** — `setMockMethodCallHandler` (Chapter 19).
* **SharedPreferences** — `SharedPreferences.setMockInitialValues({})`.
* **Navigation with go_router** — pump a `MaterialApp.router` with the real router and fake dependencies; assert `find.byType(DetailsPage)`.
* **Accessibility** — `meetsGuideline` (Chapter 10).
* **Memory leaks** — `leak_tracker_flutter_testing` (`testWidgets(..., experimentalLeakTesting: LeakTesting.settings.withTrackedAll())`).
* **Performance** — `integration_test` with `binding.traceAction(...)` / `watchPerformance` to record frame timings in CI (`flutter drive --profile`).

---

## 22.8 Coverage
```bash
flutter test --coverage                       # coverage/lcov.info
genhtml coverage/lcov.info -o coverage/html   # (lcov tool) HTML report
lcov --remove coverage/lcov.info '**/*.g.dart' '**/*.freezed.dart' -o coverage/lcov.info  # exclude generated
```
Upload to Codecov/Coveralls/SonarQube in CI. Coverage is a **signal, not a goal** — 100% coverage with weak assertions is worthless; aim for meaningful coverage of business logic (e.g., 80%+ on domain/data layers).

---

## 22.9 TDD & testing best practices
* **Arrange–Act–Assert** structure; one behaviour per test; descriptive names ("emits failure when API returns 401").
* Test **behaviour**, not implementation details.
* Tests must be **deterministic** (no real time/network/random without seeds) and **independent** (no order dependence; reset singletons like get_it between tests).
* Keep test helpers: `pumpApp(tester, widget, {overrides})` extension wrapping MaterialApp, theme, localizations, providers.
* Write a failing test reproducing every production bug before fixing it (**regression tests**).
* TDD: Red → Green → Refactor.
* Run tests in CI on every PR; block merges on failures.
* Flaky test policy: fix or quarantine with a ticket — never ignore silently.

```dart
extension PumpApp on WidgetTester {
  Future<void> pumpApp(Widget widget, {List<Override> overrides = const []}) {
    return pumpWidget(ProviderScope(
      overrides: overrides,
      child: MaterialApp(
        localizationsDelegates: AppLocalizations.localizationsDelegates,
        supportedLocales: AppLocalizations.supportedLocales,
        theme: AppTheme.light,
        home: widget,
      ),
    ));
  }
}
```

---

## 22.10 Common test failures & fixes
| Failure | Fix |
|---|---|
| `No MediaQuery widget ancestor found` / `No Directionality widget found` / `No Material widget found` | Wrap in `MaterialApp` (or `Directionality`/`Material`) |
| `pumpAndSettle timed out` | Infinite animation → `pump(duration)`; replace spinners in tests |
| `A Timer is still pending even after the widget tree was disposed` | Cancel timers in dispose; pump enough time; avoid real timers |
| `Bad state: No element` from finder `.first` | Widget not found — pump/settle first, check finder |
| `The finder ... could not be tapped because it's offscreen` / hit test warning | `ensureVisible`/`scrollUntilVisible`, larger surface size, widget covered by another |
| Real HTTP returns 400 | Mock network |
| `MissingPluginException` | Mock channels / platform interface |
| Golden mismatch on CI only | Fonts/platform rendering differences → consistent environment |
| `LateInitializationError` in tests | setUp not initializing, test order dependence |
| `type 'Null' is not a subtype of type 'Future<...>'` (mocktail) | Missing `when(...).thenAnswer` stub for that call |

---

## 22.11 Interview Questions — Testing

**Q1. Types of tests in Flutter?** Unit, widget, integration (plus golden visual tests).

**Q2. pump vs pumpAndSettle?** pump renders a single frame (optionally advancing time); pumpAndSettle repeatedly pumps until no frames are scheduled — fails with endless animations.

**Q3. How do you mock dependencies?** Inject interfaces; use mocktail/mockito mocks or hand-written fakes; override providers or use BlocProvider.value with mock blocs.

**Q4. What are golden tests?** Snapshot tests comparing rendered widget pixels against reference images to catch visual regressions.

**Q5. How do you test a Bloc?** bloc_test's `blocTest` with build/act/expect/verify, mocking repositories.

**Q6. Why wrap widgets in MaterialApp during tests?** Many widgets need ancestors provided by MaterialApp (MediaQuery, Directionality, Theme, Navigator, Localizations).

**Q7. How do you test code that uses DateTime.now or timers?** Inject a clock; use fake_async or widget tester's fake time with pump(duration).

**Q8. integration_test vs flutter_driver vs Patrol?** integration_test runs widget-test-style tests on devices (replaces deprecated flutter_driver); Patrol adds native interactions and better ergonomics.

**Q9. What is code coverage and is 100% necessary?** Percentage of lines executed by tests; useful signal but not a goal — focus on critical logic and meaningful assertions.

**Q10. How do you make widget tests robust?** Use keys/semantics finders, avoid real network/time, test behaviour, helper pump methods, deterministic data.

**Q11. How do you test platform channel code?** Mock MethodChannel handlers with TestDefaultBinaryMessengerBinding, or swap platform interface instances with fakes.

**Q12. What's the difference between a mock and a fake?** A fake is a lightweight working implementation; a mock is programmed with expectations and verifies interactions.
