# Chapter 21 — App Architecture for Large Projects: MVVM, Clean Architecture, Repositories, DI, Modularization & Design Patterns

> **Goal:** Structure a codebase that 5–50 developers can work on for years without it collapsing. This chapter is crucial for senior interviews ("How would you architect X?") and for real company work.

---

## 21.1 Why architecture? (5-year-old) 🏠

If you build a house by throwing bricks anywhere, it falls when you add a second floor. **Architecture** is the **blueprint**: kitchen here, plumbing there, walls with clear jobs. Then many builders can work at once, and you can replace the fridge without breaking the walls.

Goals of good app architecture:
1. **Separation of concerns** — UI, business logic and data access are separate.
2. **Testability** — logic testable without UI or real network.
3. **Scalability** — add features without touching everything.
4. **Maintainability/readability** — newcomers find things quickly.
5. **Replaceability** — swap REST for GraphQL, Hive for Drift, Firebase for your own backend with limited changes.
6. **Team parallelism** — features developed independently.

---

## 21.2 The official Flutter architecture recommendation (docs.flutter.dev/app-architecture)

Flutter's team published an architecture guide (2024–2025) recommending **MVVM with a layered approach**:

```
┌──────────────────── UI layer ────────────────────┐
│  View (widgets)  ◄──listens──  ViewModel          │
│    user events ──calls──►   (ChangeNotifier,      │
│                              exposes UI state +   │
│                              Commands)            │
└───────────────────────────────┬───────────────────┘
                                │ uses
┌──────────────── (optional) Domain layer ─────────┐
│  Use cases / interactors (complex/reused logic)  │
└───────────────────────────────┬───────────────────┘
                                │
┌──────────────────── Data layer ──────────────────┐
│  Repositories (source of truth for app data,     │
│   caching, error handling, polling, domain models)│
│        │ use                                      │
│  Services (wrap ONE external API: HTTP client,   │
│   platform plugin, local storage, Firebase)      │
└──────────────────────────────────────────────────┘
```
Key recommendations:
* **Views** contain minimal logic (only UI logic: animations, simple if/else for layout, routing calls).
* **ViewModels** convert repository data into UI state, hold UI state, expose **Commands** (an object wrapping an action with `running`, `error`, `completed` states — prevents double execution and lets UI show loading/errors).
* **Repositories** are the single source of truth for each data type; they transform raw service data into **domain models**; handle caching, retries, errors (return a `Result` type).
* **Services** are stateless wrappers around APIs.
* **Unidirectional data flow**: data flows Data → UI; events flow UI → Data.
* **Dependency injection** via `provider` package in the official examples.
* Use **immutable data models** (freezed recommended), `Result<T>` (Ok/Error) for errors.
* **Feature/layer folder structure** (UI organized by feature, data by type).

Command and Result (simplified from the official `compass_app` sample):
```dart
// A tiny Result type (the official sample defines a similar sealed class)
sealed class Result<T> {
  const Result();
  const factory Result.ok(T value) = Ok<T>;
  const factory Result.error(Exception error) = Error<T>;
}
final class Ok<T> extends Result<T> { const Ok(this.value); final T value; }
final class Error<T> extends Result<T> { const Error(this.error); final Exception error; }

class Command0<T> extends ChangeNotifier {
  Command0(this._action);
  final Future<Result<T>> Function() _action;

  bool _running = false;
  bool get running => _running;
  Result<T>? _result;
  bool get error => _result is Error;
  bool get completed => _result is Ok;

  Future<void> execute() async {
    if (_running) return;           // prevents double taps / duplicate requests
    _running = true;
    _result = null;
    notifyListeners();
    try {
      _result = await _action();
    } finally {
      _running = false;
      notifyListeners();
    }
  }
}

class BookingViewModel extends ChangeNotifier {
  BookingViewModel({required BookingRepository repo}) : _repo = repo {
    load = Command0<void>(_load)..execute();
  }
  final BookingRepository _repo;
  late final Command0<void> load;

  List<Booking> _bookings = [];
  List<Booking> get bookings => List.unmodifiable(_bookings);

  Future<Result<void>> _load() async {
    final result = await _repo.getBookings();     // Future<Result<List<Booking>>>
    switch (result) {
      case Ok(:final value):
        _bookings = value;
        notifyListeners();
        return const Result.ok(null);
      case Error(:final error):
        return Result.error(error);
    }
  }
}

// View
ListenableBuilder(
  listenable: viewModel.load,
  builder: (context, _) {
    if (viewModel.load.running) return const Center(child: CircularProgressIndicator());
    if (viewModel.load.error) return ErrorRetry(onRetry: viewModel.load.execute);
    return ListenableBuilder(
      listenable: viewModel,
      builder: (context, _) => BookingList(viewModel.bookings),
    );
  },
);
```
> Note: naming a class `Error` shadows `dart:core`'s `Error` inside that library — the official sample does this deliberately; in your own code you may prefer `Failure`/`Err`.



---

## 21.3 Clean Architecture (very common in companies/interviews)

Based on Robert C. Martin's Clean Architecture — **dependencies point inward**: outer layers depend on inner layers, never the reverse.

```
lib/features/auth/
├── presentation/          ← widgets, pages, state (Bloc/Cubit/Notifier/ViewModel)
│   ├── pages/login_page.dart
│   ├── widgets/
│   └── bloc/login_bloc.dart
├── domain/                ← PURE DART: no Flutter, no JSON, no Dio
│   ├── entities/user.dart
│   ├── repositories/auth_repository.dart   ← abstract interface
│   └── usecases/login_user.dart
└── data/
    ├── models/user_dto.dart                ← JSON (de)serialization, mapping to entities
    ├── datasources/auth_remote_data_source.dart
    ├── datasources/auth_local_data_source.dart
    └── repositories/auth_repository_impl.dart  ← implements domain interface
```
Flow: `LoginPage` → `LoginBloc` → `LoginUser` use case → `AuthRepository` (interface) ← `AuthRepositoryImpl` → remote/local data sources → API/DB.

```dart
// domain
abstract interface class AuthRepository {
  Future<Result<User>> login(String email, String password);
}
class LoginUser {
  const LoginUser(this._repo);
  final AuthRepository _repo;
  Future<Result<User>> call(String email, String password) {
    if (!email.contains('@')) return Future.value(const Err(InvalidEmailFailure()));
    return _repo.login(email, password);
  }
}

// data
class AuthRepositoryImpl implements AuthRepository {
  AuthRepositoryImpl(this._remote, this._local);
  final AuthRemoteDataSource _remote;
  final AuthLocalDataSource _local;
  @override
  Future<Result<User>> login(String email, String password) async {
    try {
      final dto = await _remote.login(email, password);
      await _local.saveToken(dto.token);
      return Ok(dto.toEntity());
    } on DioException catch (e) {
      return Err(mapDioError(e));
    }
  }
}
```
**Entities vs DTOs/models**: entities are business objects used everywhere in the app; DTOs mirror the API JSON. Mapping isolates the app from API changes.

### Criticism / pragmatism (senior insight)
Full Clean Architecture can be **over-engineering** for small features: use cases that just forward a call (`GetUser` → `repo.getUser()`), triple models per entity, lots of boilerplate. Pragmatic teams:
* Make the **domain layer optional** (the official Flutter guide does too) — add use cases only when logic is complex or shared.
* Keep repositories + clear state management as the minimum.
* Be consistent across the codebase.

---

## 21.4 Folder structure: feature-first vs layer-first

**Layer-first** (`lib/models`, `lib/screens`, `lib/services`, `lib/widgets`): simple for tiny apps; becomes a mess — a feature is scattered across folders.

**Feature-first** (recommended for medium/large):
```
lib/
├── main.dart / main_dev.dart / main_prod.dart
├── app/                       ← App widget, router, theme, DI bootstrap
├── core/                      ← shared: network client, errors, utils, extensions, constants, design system
│   ├── network/
│   ├── error/
│   ├── storage/
│   └── widgets/
├── features/
│   ├── auth/ (data/ domain/ presentation/)
│   ├── cart/
│   ├── checkout/
│   └── profile/
└── l10n/
```
Rules: features don't import each other's internals (only public APIs / shared core); shared code goes to `core` (but keep `core` from becoming a junk drawer).

---

## 21.5 Modularization & monorepos 🧩

For big apps: split into **packages** (local path dependencies):
```
repo/
├── apps/
│   ├── customer_app/
│   └── merchant_app/          ← multiple apps sharing packages
├── packages/
│   ├── design_system/
│   ├── api_client/            ← generated OpenAPI client
│   ├── core/
│   ├── feature_auth/
│   ├── feature_payments/
│   └── analytics/
└── pubspec.yaml               ← Dart pub workspace root (Dart 3.6+)
```
Benefits: enforced boundaries (a package can't import what it doesn't depend on), faster incremental builds & tests, team ownership (CODEOWNERS), reuse across apps (white-label apps).

Tools:
* **Pub workspaces** (Dart 3.6+): root `pubspec.yaml` with `workspace: [apps/customer_app, packages/core, ...]`, members with `resolution: workspace` → single shared resolution & lock file, `dart pub get` once.
* **Melos** — scripts across packages (`melos bootstrap`, `melos run test`, versioning/publishing, filtering by changed packages). Melos 7 works on top of pub workspaces.
* OpenAPI generators (`openapi_generator`, `swagger_parser`) to produce typed API clients from backend specs.

---

## 21.6 Dependency Injection (DI) 💉

**5-year-old:** Instead of a toy making its own batteries, you **hand** it batteries. Then you can hand it **pretend batteries** in tests.

**Constructor injection** (the core idea):
```dart
class CheckoutViewModel {
  CheckoutViewModel({required this.cartRepository, required this.paymentService});
  final CartRepository cartRepository;
  final PaymentService paymentService;
}
```
How to wire up instances:
1. **Provider / Riverpod** — providers as DI containers (Riverpod providers are ideal: lazy, overridable in tests, scoped).
2. **get_it** — service locator:
```dart
final getIt = GetIt.instance;
void setupDi(Env env) {
  getIt
    ..registerLazySingleton<Dio>(() => buildDio(env))
    ..registerLazySingleton<AuthApi>(() => AuthApi(getIt()))
    ..registerLazySingleton<AuthRepository>(() => AuthRepositoryImpl(getIt(), getIt()))
    ..registerFactory<LoginBloc>(() => LoginBloc(authRepository: getIt()));   // new each time
}
final repo = getIt<AuthRepository>();
// tests: getIt.reset(); register fakes; or allowReassignment
```
   * `registerSingleton` (eager), `registerLazySingleton` (on first use), `registerFactory` (new instance each time), `registerSingletonAsync` (async init) + `allReady()`, **scopes** (`pushNewScope` on login / `popScope` on logout — great for user sessions).
3. **injectable** — annotations (`@injectable`, `@lazySingleton`, `@module`, `@Environment('dev')`) generating get_it registration code.
4. **BlocProvider/RepositoryProvider** for Bloc apps.

Service locator criticism: dependencies hidden (calls to `getIt()` inside classes) → prefer injecting via constructors and only use the locator at composition roots (where objects are created).

---

## 21.7 SOLID in Flutter (with examples)
* **S**ingle Responsibility — a widget renders; a repository fetches; a validator validates. A 1,500-line `HomePage` violates it.
* **O**pen/Closed — extend behaviour via new classes (new payment method class implementing `PaymentMethod`) instead of editing a giant `switch`.
* **L**iskov Substitution — any `AuthRepository` implementation (real/fake) must behave correctly where the interface is expected.
* **I**nterface Segregation — small interfaces (`Readable`, `Writable`), not one god interface.
* **D**ependency Inversion — high-level modules (blocs) depend on abstractions (`AuthRepository`), not concretions (`FirebaseAuthRepository`).

Other principles: DRY (but avoid premature abstraction — "rule of three"), KISS, YAGNI, composition over inheritance, Law of Demeter.

---

## 21.8 Design patterns used in Flutter (interview list)
| Pattern | Where in Flutter |
|---|---|
| **Composite** | Widget tree itself |
| **Observer** | ChangeNotifier, Streams, Listenable, InheritedWidget dependents |
| **Builder** | `ListView.builder`, `LayoutBuilder`, builder callbacks |
| **Factory** | Factory constructors, `fromJson` |
| **Singleton** | `WidgetsBinding.instance`, `FirebaseAuth.instance`, get_it singletons |
| **Strategy** | `ScrollPhysics`, `Curve`, `SliverGridDelegate`, `PageTransitionsBuilder` |
| **Decorator** | Wrapping widgets (`Padding(child:)`), Dio interceptors |
| **Adapter** | Repository mapping DTOs → entities; platform interface implementations |
| **Facade** | Repository hiding multiple data sources |
| **Repository** | Data layer |
| **Command** | Official MVVM Commands, `Intent`/`Action` |
| **State** | Bloc states / sealed classes |
| **Proxy** | `ProxyWidget`, `ProxyProvider` |
| **Delegate** | `SliverChildBuilderDelegate`, `CustomPainter`, `LocalizationsDelegate` |
| **Template method** | `State` lifecycle hooks, `RenderBox.performLayout` |
| **Visitor** | `visitChildElements`, `Element.visitChildren` |
| **Mediator** | Bloc between UI and repositories |
| **Dependency Injection** | Providers, get_it |

---

## 21.9 Error handling architecture
* **Layers translate errors**: data layer catches technical exceptions and maps to domain failures; presentation maps failures to user messages (localized).
* **Result type** vs throwing: Result makes errors explicit in signatures (`Future<Result<User>>`); exceptions keep happy paths clean. Pick one convention per codebase.
* Global handlers for unexpected errors (FlutterError.onError, PlatformDispatcher.onError) + crash reporting.
* UI patterns: inline field errors, snackbar for transient, full-screen error with retry for page loads, offline banner.

---

## 21.10 Environment & configuration architecture
* **Flavors**: dev / staging / prod (Chapter 26) with different app IDs, names, icons, Firebase projects, API base URLs.
* `AppConfig` object built from `--dart-define-from-file` and injected at startup.
* Feature flags via remote config with local defaults.
* Separate `main_dev.dart`, `main_prod.dart` calling a shared `bootstrap(AppConfig)`:
```dart
Future<void> bootstrap(AppConfig config) async {
  WidgetsFlutterBinding.ensureInitialized();
  await setupErrorHandling(config);
  await setupDi(config);
  runApp(ProviderScope(overrides: [appConfigProvider.overrideWithValue(config)], child: const App()));
}
```

---

## 21.11 Architecture case study: an e-commerce app (system design answer template)

**Requirements**: browse catalog (offline cache), search, product details, cart (sync across devices), checkout with payment gateway, order tracking (real-time), push notifications, auth, analytics, dark mode, i18n (EN/HI/AR).

**Answer structure** (use in interviews):
1. **Clarify** scope, scale (DAU), platforms, offline needs, team size.
2. **High-level modules**: auth, catalog, search, cart, checkout, orders, profile, notifications; core: network, storage, design system, analytics, config.
3. **Layers**: UI (Riverpod/Bloc), domain (cart rules, pricing), data (repositories with remote + local sources).
4. **Data flow**: catalog repository → stale-while-revalidate (Drift cache + API); search with debounce + cancellation; cart as local source of truth synced to server (optimistic updates, conflict resolution: server wins on price/stock); orders via WebSocket/FCM updates.
5. **Navigation**: go_router with StatefulShellRoute tabs, deep links (`/product/:id`), auth redirect preserving target.
6. **Networking**: Dio + interceptors (auth refresh with queue, retry, logging), OpenAPI generated client, error mapping, certificate pinning if needed.
7. **Payments**: gateway SDK via plugin; server creates order/payment intent; app never trusts client-side success — verify via backend webhook; idempotency keys.
8. **Performance**: image CDN with sizes, cached_network_image, list virtualization, pagination (cursor), isolates for parsing, startup optimization.
9. **Security**: secure storage for tokens, obfuscation, root/jailbreak detection (optional), no secrets in app, App Check/Play Integrity.
10. **Quality**: unit/widget/golden/integration tests, CI with lint/test/build, feature flags, staged rollouts, crash monitoring, analytics funnels.
11. **Scalability of team**: monorepo packages per feature, CODEOWNERS, design system package, ADRs (architecture decision records).

---

## 21.12 Interview Questions — Architecture

**Q1. How do you structure a large Flutter app?** Feature-first folders/packages, layered architecture (presentation/domain/data), repositories as single source of truth, DI, consistent state management, shared core & design system, tests per layer.

**Q2. What is the repository pattern?** An abstraction over data sources providing a clean API for domain data, handling caching, mapping and errors so the rest of the app doesn't know where data comes from.

**Q3. Explain Clean Architecture in Flutter.** Presentation, domain (entities, use cases, repository interfaces — pure Dart), data (models, data sources, repository implementations); dependency rule points inward; benefits testability & independence; trade-off boilerplate.

**Q4. What does the official Flutter architecture guide recommend?** MVVM: Views + ViewModels in UI layer, Repositories + Services in data layer, optional domain use cases, unidirectional data flow, Commands, Result type, immutable models, DI with provider.

**Q5. What is dependency injection and how do you do it in Flutter?** Supplying dependencies from outside rather than creating them inside; constructor injection wired via Riverpod/Provider/get_it(+injectable)/RepositoryProvider.

**Q6. Service locator vs DI?** Locator pulls dependencies from a global registry (hidden dependencies); DI pushes them via constructors (explicit). Use the locator only at composition roots.

**Q7. How do you share code between multiple apps?** Monorepo with packages (pub workspaces/melos), design system package, shared core/network/analytics packages.

**Q8. Entities vs models/DTOs?** Entities: domain objects independent of external formats; DTOs: data transfer shapes matching APIs/DB, mapped to entities.

**Q9. What design patterns does Flutter use?** Composite (widgets), observer (listenables/streams), builder, factory, singleton, strategy, delegate, decorator, repository, etc.

**Q10. How do you avoid over-engineering?** Start simple, add layers when complexity demands, avoid pass-through use cases, keep consistent conventions, document decisions (ADRs).
