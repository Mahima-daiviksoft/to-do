# Chapter 15 — State Management, Part 2: Riverpod, Bloc/Cubit, GetX, MobX, Redux, Signals

> **Goal:** Become fluent in the two dominant enterprise solutions — **Riverpod** and **Bloc** — and know enough about the others to discuss trade-offs and maintain legacy code.

> Versions: this chapter reflects **Riverpod 3.x** (released Sept 2025) and **flutter_bloc 9.x**. Where older APIs are still common in codebases, they're noted.

---

# Part A — Riverpod 🌊

## 15.1 What and why

**5-year-old:** Riverpod is a **magic backpack of ingredients**. Any widget can reach into the backpack (`ref`) and grab an ingredient (`provider`). If an ingredient changes (the milk goes sour), everyone using it is told automatically. Ingredients can be made from other ingredients (pancakes need milk + eggs). And you don't need to know where in the house (widget tree) the backpack is.

Riverpod (an anagram of *Provider*), by the same author as Provider, fixes Provider's problems:
* **No dependency on BuildContext/widget tree position** to find providers → no `ProviderNotFoundException`.
* **Compile-time safety** — providers are global *declarations* (final variables), but their **state** lives in a `ProviderContainer` (inside `ProviderScope`), so they are not global singletons and are fully testable/overridable.
* **Multiple providers of the same type** — fine (they're distinct variables).
* **Async-first**: `FutureProvider`, `StreamProvider`, `AsyncNotifier`, and `AsyncValue` (loading/data/error) built in.
* **Auto-dispose**, **families** (parameterised providers), caching, **combining providers** reactively with `ref.watch`.
* Works outside Flutter (pure Dart).

## 15.2 Setup
```yaml
dependencies:
  flutter_riverpod: ^3.0.0
  riverpod_annotation: ^3.0.0     # for codegen (optional)
dev_dependencies:
  riverpod_generator: ^3.0.0
  build_runner: ^2.4.0
  riverpod_lint: ^3.0.0           # (lints; works via the analyzer plugin system in recent versions)
```
```dart
void main() {
  runApp(const ProviderScope(child: MyApp()));   // ❗ required at the root
}
```

## 15.3 Provider types

| Provider | For | Example |
|---|---|---|
| `Provider` | Read-only computed values / services / DI | repository, filtered list |
| `FutureProvider` | Async read-only value (one-shot fetch) | user profile |
| `StreamProvider` | Stream of values | auth state changes, websockets |
| `NotifierProvider` | Synchronous mutable state with methods | counter, filters, cart |
| `AsyncNotifierProvider` | Async state with methods (load + mutate) | todo list from API |
| `StreamNotifierProvider` | Stream-based state with methods | chat |
| *Legacy:* `StateProvider`, `StateNotifierProvider`, `ChangeNotifierProvider` | old code | In Riverpod 3 moved to `package:flutter_riverpod/legacy.dart` |

### Manual (no codegen) syntax
```dart
// Service / DI
final apiClientProvider = Provider<ApiClient>((ref) {
  final client = ApiClient(baseUrl: ref.watch(configProvider).apiUrl);
  ref.onDispose(client.close);
  return client;
});

// Notifier (sync)
class Counter extends Notifier<int> {
  @override
  int build() => 0;                       // initial state
  void increment() => state++;            // assigning `state` notifies listeners
}
final counterProvider = NotifierProvider<Counter, int>(Counter.new);

// FutureProvider (auto-dispose when nobody listens)
final userProvider = FutureProvider.autoDispose<User>((ref) async {
  final api = ref.watch(apiClientProvider);
  return api.fetchMe();
});

// Family (parameter)
final productProvider = FutureProvider.autoDispose.family<Product, String>((ref, id) async {
  return ref.watch(apiClientProvider).fetchProduct(id);
});

// AsyncNotifier
class TodoList extends AsyncNotifier<List<Todo>> {
  @override
  Future<List<Todo>> build() => ref.watch(todoRepoProvider).fetchAll();

  Future<void> add(String title) async {
    final repo = ref.read(todoRepoProvider);
    state = const AsyncLoading();
    state = await AsyncValue.guard(() async {
      await repo.add(title);
      return repo.fetchAll();
    });
  }

  Future<void> toggle(String id) async {
    final previous = state.value ?? [];
    // Optimistic update
    state = AsyncData([
      for (final t in previous) if (t.id == id) t.copyWith(done: !t.done) else t,
    ]);
    try {
      await ref.read(todoRepoProvider).toggle(id);
    } catch (e) {
      state = AsyncData(previous);   // rollback the optimistic change
      rethrow;                       // let the UI show a snackbar (catch at call site)
    }
  }
}
final todoListProvider = AsyncNotifierProvider<TodoList, List<Todo>>(TodoList.new);
```
> Tip: When a provider **rebuilds itself** (e.g., after `ref.invalidate` or a watched dependency changes), Riverpod keeps the previous value available while loading (`state.value`, `isRefreshing`/`isReloading`), so the UI can show old data with a small progress indicator. When you assign `AsyncLoading()` manually, decide explicitly whether to keep old data (e.g., keep a local copy) — helper names for this differ between Riverpod versions, so check the docs for yours.

### Code generation syntax (recommended by Riverpod docs)
```dart
import 'package:riverpod_annotation/riverpod_annotation.dart';
part 'todo_providers.g.dart';

@riverpod                                  // auto-dispose by default
Future<User> user(Ref ref) => ref.watch(apiClientProvider).fetchMe();   // → userProvider

@riverpod
Future<Product> product(Ref ref, String id) =>                         // family automatically
    ref.watch(apiClientProvider).fetchProduct(id);                       // → productProvider(id)

@Riverpod(keepAlive: true)                 // not auto-disposed
ApiClient apiClient(Ref ref) => ApiClient();

@riverpod
class TodoList extends _$TodoList {        // → todoListProvider
  @override
  Future<List<Todo>> build() => ref.watch(todoRepoProvider).fetchAll();
  Future<void> add(String title) async { ... }
}
```
Run `dart run build_runner watch -d`.

## 15.4 Consuming providers in widgets
```dart
class TodoPage extends ConsumerWidget {           // instead of StatelessWidget
  const TodoPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final todos = ref.watch(todoListProvider);    // rebuilds on change

    // Side effects (snackbars, navigation) — NOT in build logic, use listen:
    ref.listen(todoListProvider, (previous, next) {
      if (next is AsyncError) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('${next.error}')));
      }
    });

    return switch (todos) {
      AsyncData(:final value) => TodoListView(value),
      AsyncError(:final error) => ErrorView(error, onRetry: () => ref.invalidate(todoListProvider)),
      _ => const Center(child: CircularProgressIndicator()),
    };
    // or: todos.when(data: ..., error: (e, st) => ..., loading: () => ...)
  }
}

// Calling methods: read the notifier (don't watch in callbacks)
onPressed: () => ref.read(todoListProvider.notifier).add('Buy milk'),

// Rebuild only on part of state
final doneCount = ref.watch(todoListProvider.select((s) => s.value?.where((t) => t.done).length ?? 0));

// Stateful version
class EditPage extends ConsumerStatefulWidget { ... }
class _EditPageState extends ConsumerState<EditPage> {
  @override
  void initState() {
    super.initState();
    // ref is available in ConsumerState; use ref.read here, not watch
  }
}

// Local scope rebuild:
Consumer(builder: (context, ref, child) => Text('${ref.watch(counterProvider)}'));
```

### `ref.watch` vs `ref.read` vs `ref.listen` (most asked Riverpod question)
| | When | Rebuilds? | Where |
|---|---|---|---|
| `ref.watch(p)` | Need the value to build UI / compute a provider | ✅ | `build` of widgets and providers |
| `ref.read(p)` | One-off read, typically to call a method | ❌ | callbacks (onPressed), notifier methods |
| `ref.listen(p, cb)` | React to changes with side effects (navigate, snackbar, log) | ❌ (calls cb) | build of widgets (Riverpod manages lifecycle), providers |

**Rule:** don't `ref.read` inside `build` to get a value for display — UI won't update.

Other ref methods: `ref.invalidate(p)` (reset & recompute lazily), `ref.refresh(p)` (invalidate + read immediately, returns new value), `ref.onDispose`, `ref.onCancel`/`onResume` (listeners leaving/coming back), `ref.keepAlive()` (prevent auto-dispose, returns a link you can `close()`), `ref.mounted` (Riverpod 3: check after `await` in notifiers, like widget `mounted`).

## 15.5 Combining providers (reactive dependency graph)
```dart
@riverpod
List<Todo> filteredTodos(Ref ref) {
  final filter = ref.watch(todoFilterProvider);
  final todos = ref.watch(todoListProvider).value ?? const [];
  return switch (filter) {
    Filter.all => todos,
    Filter.done => todos.where((t) => t.done).toList(),
    Filter.active => todos.where((t) => !t.done).toList(),
  };
}
```
When the filter or todos change, `filteredTodos` recomputes, and widgets watching it rebuild — if the result is different (`==`). Search with debounce & cancellation:
```dart
@riverpod
Future<List<Result>> search(Ref ref, String query) async {
  // Debounce: if the provider is disposed/rebuilt within 300ms, abort
  var cancelled = false;
  ref.onDispose(() => cancelled = true);
  await Future<void>.delayed(const Duration(milliseconds: 300));
  if (cancelled) throw Exception('cancelled');

  final cancelToken = CancelToken();          // dio
  ref.onDispose(cancelToken.cancel);
  return ref.watch(apiProvider).search(query, cancelToken: cancelToken);
}
```

## 15.6 Auto-dispose, keepAlive, caching
* **autoDispose**: state destroyed when no longer listened to (e.g., leaving a screen) → no memory leak, fresh data next time.
* `ref.keepAlive()` to cache e.g. after successful load; combine with a timer to expire cache:
```dart
final link = ref.keepAlive();
final timer = Timer(const Duration(minutes: 5), link.close);
ref.onDispose(timer.cancel);
```

## 15.7 Riverpod 3 highlights (know for interviews in 2026)
* **Automatic retry** of failing providers (exponential backoff by default; configurable / disable with `retry:`).
* **`Ref.mounted`** to check whether the notifier/provider is still alive after async gaps.
* Listeners are **paused** when widgets aren't visible (e.g., under another route / `TickerMode` off) to save resources.
* **Offline persistence** (experimental) and **mutations** (experimental) APIs.
* `AsyncValue` is sealed with `AsyncData`, `AsyncError`, `AsyncLoading`; `valueOrNull` removed — `.value` returns null during errors/loading without previous data.
* `StateProvider`, `StateNotifierProvider`, `ChangeNotifierProvider` moved to `legacy` imports.
* Family notifiers receive arguments through the **constructor** (`FamilyNotifier` removed).
* Notifiers are recreated on provider rebuild.
* Unified `Ref` (no more `FutureProviderRef` etc. subtypes in codegen).
* `ProviderContainer.test()` helper for tests.

## 15.8 Testing Riverpod
```dart
test('counter increments', () {
  final container = ProviderContainer.test();       // auto-disposed after test (Riverpod 3)
  expect(container.read(counterProvider), 0);
  container.read(counterProvider.notifier).increment();
  expect(container.read(counterProvider), 1);
});

test('todo list loads from repository', () async {
  final container = ProviderContainer.test(overrides: [
    todoRepoProvider.overrideWithValue(FakeTodoRepo([Todo(id: '1', title: 'A')])),
  ]);
  final todos = await container.read(todoListProvider.future);
  expect(todos.single.title, 'A');
});

testWidgets('shows todos', (tester) async {
  await tester.pumpWidget(ProviderScope(
    overrides: [todoListProvider.overrideWith(() => FakeTodoList())],
    child: const MaterialApp(home: TodoPage()),
  ));
  await tester.pump();
  expect(find.text('A'), findsOneWidget);
});
```

## 15.9 Riverpod best practices & pitfalls
* Keep providers **small and focused**; derive with `ref.watch`.
* Don't put `BuildContext` or widgets in providers.
* Use `ref.listen` for one-time side effects; never navigate inside `build` directly.
* Don't call `ref.read` on autoDispose providers in callbacks expecting state to persist — if nobody watches it, it may be disposed immediately after read. Watch it somewhere or keepAlive.
* Avoid `ref.watch` inside notifier methods (use `ref.read`); `ref.watch` belongs in `build`.
* Avoid passing complex objects as family parameters unless they implement `==`/`hashCode` (records, freezed, primitives) — otherwise each call creates a new provider → infinite loading/leaks.
* "Modifying a provider while the widget tree was building" error → don't mutate state during build/initState; use `Future.microtask` or move to event.
* `ProviderScope` overrides for flavors/environments and tests.
* Use `riverpod_lint` to catch mistakes.

---

# Part B — Bloc & Cubit 🧱

## 15.10 The idea

**5-year-old:** A **Bloc** is a **vending machine** 🥤. You press buttons (**events**). The machine does its internal work and drops out a snack (**state**). You can't reach inside; you can only press buttons and look at what comes out. Everyone can see what was pressed and what came out — great for debugging.

A **Cubit** is a **simpler vending machine** where instead of pressing labelled buttons (events), you directly call functions (`increment()`), and it emits new states.

```
UI ──(event)──► Bloc ──(state stream)──► UI
                 │
                 ▼
            Repository → API/DB
```
* Based on **Streams** (Bloc = Business Logic Component, pattern introduced by Google in 2018; library by Felix Angelov/VGV).
* Enforces separation: UI ↔ Bloc ↔ Repository ↔ Data providers.
* Every state change is traceable (BlocObserver: onEvent, onChange, onTransition, onError) → excellent for large teams and debugging.

## 15.11 Cubit
```dart
class CounterCubit extends Cubit<int> {
  CounterCubit() : super(0);                 // initial state
  void increment() => emit(state + 1);
  void decrement() => emit(state - 1);
}
```

## 15.12 Bloc with events and states (Dart 3 sealed classes)
```dart
// Events
sealed class LoginEvent {}
final class LoginEmailChanged extends LoginEvent { LoginEmailChanged(this.email); final String email; }
final class LoginPasswordChanged extends LoginEvent { LoginPasswordChanged(this.password); final String password; }
final class LoginSubmitted extends LoginEvent {}

// State (single class with status — common pattern)
enum LoginStatus { initial, submitting, success, failure }

final class LoginState extends Equatable {
  const LoginState({this.email = '', this.password = '', this.status = LoginStatus.initial, this.error});
  final String email;
  final String password;
  final LoginStatus status;
  final String? error;

  bool get isValid => email.contains('@') && password.length >= 8;

  LoginState copyWith({String? email, String? password, LoginStatus? status, String? error}) => LoginState(
        email: email ?? this.email,
        password: password ?? this.password,
        status: status ?? this.status,
        error: error,
      );

  @override
  List<Object?> get props => [email, password, status, error];
}

// Bloc
class LoginBloc extends Bloc<LoginEvent, LoginState> {
  LoginBloc({required AuthRepository authRepository})
      : _auth = authRepository,
        super(const LoginState()) {
    on<LoginEmailChanged>((event, emit) => emit(state.copyWith(email: event.email)));
    on<LoginPasswordChanged>((event, emit) => emit(state.copyWith(password: event.password)));
    on<LoginSubmitted>(_onSubmitted, transformer: droppable()); // ignore extra taps while submitting (bloc_concurrency)
  }

  final AuthRepository _auth;

  Future<void> _onSubmitted(LoginSubmitted event, Emitter<LoginState> emit) async {
    if (!state.isValid) return;
    emit(state.copyWith(status: LoginStatus.submitting));
    try {
      await _auth.logIn(email: state.email, password: state.password);
      emit(state.copyWith(status: LoginStatus.success));
    } on AuthException catch (e) {
      emit(state.copyWith(status: LoginStatus.failure, error: e.message));
    }
  }
}
```
Bloc 8+ removed `mapEventToState` (async generator style) in favour of `on<Event>` handlers. If you see `mapEventToState` in a codebase, it's Bloc ≤7.

### Event transformers (`bloc_concurrency`)
By default (Bloc 8+), events are processed **concurrently**. Transformers:
* `sequential()` — one at a time in order (queue).
* `droppable()` — ignore new events while one is processing (prevent double submit).
* `restartable()` — cancel the running handler, start the new one (search-as-you-type).
* `concurrent()` — default.
Debounce: custom transformer `(events, mapper) => events.debounceTime(300.ms).switchMap(mapper)` with rxdart.

### Emitting from streams
```dart
on<TodosSubscriptionRequested>((event, emit) async {
  await emit.forEach<List<Todo>>(
    _repo.watchTodos(),
    onData: (todos) => state.copyWith(todos: todos, status: Status.success),
    onError: (_, __) => state.copyWith(status: Status.failure),
  );
});
```
⚠️ Never `emit` after the handler completed (e.g., inside a `stream.listen` callback) → error "emit was called after an event handler completed normally". Use `emit.forEach`/`emit.onEach` or add an internal event.

### Bloc vs Cubit
| Cubit | Bloc |
|---|---|
| Methods → emit | Events → handlers → emit |
| Less boilerplate | More boilerplate |
| Can't use event transformers | Debounce/throttle/droppable/restartable |
| Traceability: state changes only | Full event → state transitions |
| Good for simple features | Good for complex flows, audit trails |
Start with Cubit; refactor to Bloc when you need event processing control.

## 15.13 Flutter widgets (flutter_bloc)
```dart
// Provide (creates & closes automatically)
BlocProvider(
  create: (context) => LoginBloc(authRepository: context.read<AuthRepository>()),
  child: const LoginView(),
);
MultiBlocProvider(providers: [...], child: ...);
RepositoryProvider(create: (_) => AuthRepository(), child: ...);   // DI for repositories
BlocProvider.value(value: existingBloc, child: ...);              // existing instance (e.g., to new route) — not closed automatically

// Build UI from state
BlocBuilder<LoginBloc, LoginState>(
  buildWhen: (prev, curr) => prev.status != curr.status,   // rebuild filter
  builder: (context, state) => state.status == LoginStatus.submitting
      ? const CircularProgressIndicator()
      : FilledButton(onPressed: () => context.read<LoginBloc>().add(LoginSubmitted()), child: const Text('Login')),
);

// Side effects (navigation, snackbars) — called once per state change
BlocListener<LoginBloc, LoginState>(
  listenWhen: (prev, curr) => prev.status != curr.status,
  listener: (context, state) {
    if (state.status == LoginStatus.success) context.go('/home');
    if (state.status == LoginStatus.failure) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(state.error ?? 'Login failed')));
    }
  },
  child: ...,
);

BlocConsumer<LoginBloc, LoginState>(listener: ..., builder: ...);   // both
BlocSelector<LoginBloc, LoginState, bool>(selector: (s) => s.isValid, builder: (_, isValid) => ...);
MultiBlocListener(listeners: [...], child: ...);

// Extensions
context.read<LoginBloc>();                         // no listen (callbacks)
context.watch<LoginBloc>().state;                  // listen (build)
context.select((LoginBloc b) => b.state.email);    // listen to part
```

## 15.14 Testing Bloc (`bloc_test` + `mocktail`)
```dart
class MockAuthRepository extends Mock implements AuthRepository {}

void main() {
  late MockAuthRepository auth;
  setUp(() => auth = MockAuthRepository());

  blocTest<LoginBloc, LoginState>(
    'emits [submitting, success] when login succeeds',
    setUp: () => when(() => auth.logIn(email: any(named: 'email'), password: any(named: 'password')))
        .thenAnswer((_) async {}),
    build: () => LoginBloc(authRepository: auth),
    seed: () => const LoginState(email: 'a@b.com', password: '12345678'),
    act: (bloc) => bloc.add(LoginSubmitted()),
    expect: () => const [
      LoginState(email: 'a@b.com', password: '12345678', status: LoginStatus.submitting),
      LoginState(email: 'a@b.com', password: '12345678', status: LoginStatus.success),
    ],
    verify: (_) => verify(() => auth.logIn(email: 'a@b.com', password: '12345678')).called(1),
  );
}
```
Widget tests: `MockBloc`/`MockCubit` from bloc_test + `whenListen(bloc, Stream.fromIterable([...]), initialState: ...)`.

## 15.15 Bloc ecosystem
* `BlocObserver` — global logging/analytics/crash reporting of transitions & errors (`Bloc.observer = AppBlocObserver();`).
* `hydrated_bloc` — persists state automatically (`toJson`/`fromJson`) — great for settings, carts.
* `replay_bloc` — undo/redo.
* `bloc_lint` / `bloc_tools` (CLI) — lint rules & generators; VS Code/IntelliJ extensions for scaffolding.
* `very_good_cli` — project templates using Bloc + layered architecture.

## 15.16 Bloc pitfalls
* **Equality**: states must implement `==` (Equatable/freezed/records). Bloc **doesn't emit** a state equal to the current one (`emit` skips if `state == newState`). Mutating a list in place then emitting the same object → **no rebuild**! Always create new lists: `emit(state.copyWith(items: [...state.items, newItem]))`.
* Without Equatable, two identical-content states are unequal → unnecessary rebuilds.
* Forgetting to `close()` blocs you create manually (BlocProvider with `create` closes automatically).
* Using `BlocProvider(create: ...)` with an existing bloc → it gets closed when the provider is disposed; use `.value`.
* Putting navigation inside the bloc (it should be UI concern via BlocListener).
* Bloc-to-bloc direct dependencies (tight coupling) → prefer communicating via repositories (shared streams) or presentation layer (BlocListener in UI dispatches to another bloc).
* `emit` after close → `StateError: Cannot emit new states after calling close` — check `isClosed` after awaits in Cubits.

---

# Part C — Other solutions

## 15.17 GetX
All-in-one: state (`.obs` + `Obx`, `GetBuilder`), DI (`Get.put`, `Get.find`, `Get.lazyPut`), routing (`Get.to(Page())`, `Get.back()`), snackbars/dialogs without context, translations.
```dart
class CounterController extends GetxController {
  final count = 0.obs;
  void increment() => count.value++;
}
final c = Get.put(CounterController());
Obx(() => Text('${c.count}'));
```
✅ Extremely fast to start, little boilerplate.
❌ Criticised by much of the community and many companies: lots of "magic"/global state, weaker testability, mixing concerns (routing+state+DI+utils in one package), large API surface, historically slow maintenance and breaking changes, non-idiomatic patterns (context-less everything). **Interview-safe answer:** "I can work with GetX in existing codebases, but for new large projects I prefer Riverpod/Bloc for testability and explicit architecture."

## 15.18 MobX
Observables, actions, computed values, reactions; uses code generation:
```dart
part 'counter.g.dart';
class Counter = _Counter with _$Counter;
abstract class _Counter with Store {
  @observable int value = 0;
  @computed bool get isEven => value.isEven;
  @action void increment() => value++;
}
Observer(builder: (_) => Text('${counter.value}'));
reaction((_) => counter.value, (v) => print('changed to $v'));
```
Transparent reactive programming (like MobX in JS). Good for teams from React+MobX.

## 15.19 Redux
Single immutable **store**, **actions**, pure **reducers** `(state, action) => newState`, **middleware** for side effects (`redux_thunk`, `redux_epics`), `StoreProvider`/`StoreConnector` (`flutter_redux`). Predictable, time travel, but verbose. Rare in new Flutter projects.

## 15.20 Signals
`signals` package (inspired by Preact/SolidJS signals): fine-grained reactivity.
```dart
final count = signal(0);
final doubled = computed(() => count.value * 2);
effect(() => print('count is ${count.value}'));
Watch((context) => Text('${doubled.value}'));
count.value++;
```
Simple and performant; growing popularity.

## 15.21 flutter_hooks
Not state management per se — React-style hooks to reduce StatefulWidget boilerplate:
```dart
class Search extends HookWidget {
  @override
  Widget build(BuildContext context) {
    final controller = useTextEditingController();          // auto-disposed
    final anim = useAnimationController(duration: const Duration(seconds: 1));
    final count = useState(0);
    useEffect(() { final sub = stream.listen(...); return sub.cancel; }, [stream]);
    return TextField(controller: controller);
  }
}
```
Often combined with Riverpod (`hooks_riverpod`, `HookConsumerWidget`). Rules: hooks must be called unconditionally in the same order in `build`.

---

## 15.22 Choosing for an organisation (decision guide)

| Situation | Recommendation |
|---|---|
| Small app / prototype / 1–2 devs | setState + ValueNotifier/ChangeNotifier, or Provider/Riverpod |
| Following official Flutter architecture guide | MVVM with ChangeNotifier ViewModels + repositories (+ Provider for DI) |
| Large team, need strict conventions, audit trail, many juniors | Bloc (with very_good structure) |
| Large app, heavy async/caching, want less boilerplate, strong DI/testing | Riverpod (with codegen) |
| Existing codebase | **Stay consistent** with what's there; migrate gradually only with strong reasons |

Migration strategy (e.g., Provider → Riverpod or GetX → Bloc): feature-by-feature, both can coexist; start with new features; write tests around the old behaviour first; don't do a big-bang rewrite.

---

## 15.23 Interview Questions — Riverpod, Bloc, others

**Q1. What problems does Riverpod solve over Provider?** No BuildContext dependency, compile-time safety (no ProviderNotFound), multiple providers of the same type, easy combination/dependency of providers, built-in async handling, auto-dispose & families, easier testing/overrides, usable outside Flutter.

**Q2. ref.watch vs ref.read vs ref.listen?** watch = subscribe & rebuild (build methods); read = one-time read (callbacks); listen = side effects on changes.

**Q3. What is a family modifier?** Creates a parameterised provider: a separate cached state per argument (e.g., productProvider(id)); args need proper equality.

**Q4. What is autoDispose?** Destroys provider state when it has no listeners; prevents leaks and gives fresh state; `ref.keepAlive` to retain.

**Q5. What is AsyncValue?** Riverpod's sealed union for async state: AsyncData, AsyncError, AsyncLoading, with helpers like `when`, `value`, `isLoading`, `hasError`, and `AsyncValue.guard`.

**Q6. Notifier vs StateNotifier vs StateProvider?** Notifier (Riverpod 2+) is the modern class-based mutable provider; StateNotifier and StateProvider are legacy APIs (moved to legacy in Riverpod 3).

**Q7. Explain the Bloc pattern.** UI dispatches events; Bloc processes them (calling repositories) and emits new immutable states via a stream; UI rebuilds from states. Separation, testability, traceability.

**Q8. Bloc vs Cubit?** Cubit exposes methods that emit states; Bloc receives events handled by `on<Event>` with transformers; Bloc gives more control/traceability, Cubit less boilerplate.

**Q9. BlocBuilder vs BlocListener vs BlocConsumer?** Builder rebuilds UI; Listener runs side effects once per change; Consumer does both.

**Q10. Why use Equatable with Bloc?** Value equality for states/events so identical states are deduplicated and tests can compare expected states.

**Q11. Why might a Bloc not rebuild UI after emit?** Emitted state is equal to the previous (same instance mutated, or Equatable props missing the changed field).

**Q12. How do you prevent duplicate submissions in Bloc?** `droppable()` transformer, status checks, disabling the button.

**Q13. How do you implement search with debounce in Bloc?** A custom transformer using `debounceTime` + `switchMap` (rxdart) or `restartable()`.

**Q14. How do blocs communicate?** Via shared repositories exposing streams, or in the presentation layer using BlocListener to add events to another bloc; avoid direct bloc dependencies.

**Q15. What is BlocObserver?** Global hook to observe all bloc creations, events, changes, transitions, errors and closes — logging/analytics/crash reporting.

**Q16. What is HydratedBloc?** Bloc extension that automatically persists and restores state using storage.

**Q17. Why do some teams avoid GetX?** Implicit global state and magic, mixing concerns, harder testing, maintenance concerns, non-standard patterns.

**Q18. Which state management do you prefer and why?** Give a reasoned answer with trade-offs (e.g., Riverpod for compile-safe DI + async; Bloc for strict event-driven architecture in large teams), emphasise consistency.

**Q19. How would you test a Notifier/Cubit?** Unit test with ProviderContainer (overrides with fakes) / blocTest with mocked repositories; assert state sequences.

**Q20. What is `AsyncValue.guard`?** Runs a future and converts the result to AsyncData or AsyncError, avoiding manual try/catch.
