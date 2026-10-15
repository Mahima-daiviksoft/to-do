# Chapter 32 — Coding Rounds: Dart Problems, Output Puzzles, Machine-Coding Apps & Behavioral Questions

> Flutter interviews usually include: (1) Dart/DSA problems (easy–medium), (2) "predict the output" puzzles, (3) a **machine coding** round (build a small app in 60–120 min), and (4) behavioral questions. Every solution below is complete and idiomatic Dart 3.

---

# Part A — Dart problem solving

### A1. Reverse a string (Unicode-safe)
```dart
import 'package:characters/characters.dart';

String reverse(String s) => s.characters.toList().reversed.join();
// Simple ASCII version: s.split('').reversed.join();
void main() => print(reverse('Flutter 💙')); // 💙 rettulF
```
Why `characters`? `split('')` splits UTF-16 code units, breaking emoji/grapheme clusters.

### A2. Palindrome (ignore case & non-alphanumerics)
```dart
bool isPalindrome(String s) {
  final clean = s.toLowerCase().replaceAll(RegExp(r'[^a-z0-9]'), '');
  var i = 0, j = clean.length - 1;
  while (i < j) {
    if (clean[i] != clean[j]) return false;
    i++; j--;
  }
  return true;
}
// isPalindrome('A man, a plan, a canal: Panama') == true
```

### A3. FizzBuzz
```dart
void fizzBuzz(int n) {
  for (var i = 1; i <= n; i++) {
    print(switch ((i % 3, i % 5)) {
      (0, 0) => 'FizzBuzz',
      (0, _) => 'Fizz',
      (_, 0) => 'Buzz',
      _ => '$i',
    });
  }
}
```

### A4. Character frequency & first non-repeating character
```dart
String? firstUnique(String s) {
  final freq = <String, int>{};
  for (final c in s.split('')) {
    freq[c] = (freq[c] ?? 0) + 1;
  }
  for (final c in s.split('')) {
    if (freq[c] == 1) return c;
  }
  return null;
}
// firstUnique('swiss') == 'w'
```

### A5. Anagram check
```dart
bool isAnagram(String a, String b) {
  if (a.length != b.length) return false;
  final counts = <int, int>{};
  for (final c in a.codeUnits) counts[c] = (counts[c] ?? 0) + 1;
  for (final c in b.codeUnits) {
    final v = (counts[c] ?? 0) - 1;
    if (v < 0) return false;
    counts[c] = v;
  }
  return true;
}
```

### A6. Two Sum (O(n))
```dart
(int, int)? twoSum(List<int> nums, int target) {
  final seen = <int, int>{}; // value -> index
  for (var i = 0; i < nums.length; i++) {
    final need = target - nums[i];
    final j = seen[need];
    if (j != null) return (j, i);
    seen[nums[i]] = i;
  }
  return null;
}
// twoSum([2, 7, 11, 15], 9) == (0, 1)
```

### A7. Find duplicates
```dart
Set<T> duplicates<T>(Iterable<T> items) {
  final seen = <T>{};
  final dups = <T>{};
  for (final x in items) {
    if (!seen.add(x)) dups.add(x);   // Set.add returns false if already present
  }
  return dups;
}
```

### A8. Remove duplicates keeping order
```dart
List<T> unique<T>(List<T> items) => items.toSet().toList(); // LinkedHashSet keeps insertion order
```

### A9. Fibonacci (iterative + memoized recursive)
```dart
int fibIter(int n) {
  if (n < 2) return n;
  var a = 0, b = 1;
  for (var i = 2; i <= n; i++) {
    final t = a + b;
    a = b;
    b = t;
  }
  return b;
}

final _memo = <int, int>{};
int fibMemo(int n) => n < 2 ? n : _memo[n] ??= fibMemo(n - 1) + fibMemo(n - 2);
```

### A10. Valid parentheses
```dart
bool isValid(String s) {
  const pairs = {')': '(', ']': '[', '}': '{'};
  final stack = <String>[];
  for (final c in s.split('')) {
    if (pairs.containsValue(c)) {
      stack.add(c);
    } else if (pairs.containsKey(c)) {
      if (stack.isEmpty || stack.removeLast() != pairs[c]) return false;
    }
  }
  return stack.isEmpty;
}
```

### A11. Flatten nested list
```dart
List<Object?> flatten(List<Object?> input) => [
      for (final e in input)
        if (e is List<Object?>) ...flatten(e) else e,
    ];
// flatten([1, [2, [3, 4]], 5]) == [1, 2, 3, 4, 5]
```

### A12. Group by
```dart
Map<K, List<T>> groupBy<T, K>(Iterable<T> items, K Function(T) key) {
  final map = <K, List<T>>{};
  for (final item in items) {
    map.putIfAbsent(key(item), () => []).add(item);
  }
  return map;
}
// groupBy(['apple', 'avocado', 'banana'], (s) => s[0]) => {a: [apple, avocado], b: [banana]}
```

### A13. Binary search
```dart
int binarySearch(List<int> sorted, int target) {
  var lo = 0, hi = sorted.length - 1;
  while (lo <= hi) {
    final mid = lo + ((hi - lo) >> 1);
    if (sorted[mid] == target) return mid;
    if (sorted[mid] < target) {
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return -1;
}
```

### A14. Merge overlapping intervals
```dart
List<(int, int)> merge(List<(int, int)> intervals) {
  if (intervals.isEmpty) return [];
  final sorted = [...intervals]..sort((a, b) => a.$1.compareTo(b.$1));
  final result = <(int, int)>[sorted.first];
  for (final (start, end) in sorted.skip(1)) {
    final (lastStart, lastEnd) = result.last;
    if (start <= lastEnd) {
      result[result.length - 1] = (lastStart, end > lastEnd ? end : lastEnd);
    } else {
      result.add((start, end));
    }
  }
  return result;
}
// merge([(1,3),(2,6),(8,10),(15,18)]) == [(1,6),(8,10),(15,18)]
```

### A15. LRU cache (very common!)
```dart
class LruCache<K, V> {
  LruCache(this.capacity) : assert(capacity > 0);
  final int capacity;
  final _map = <K, V>{};   // LinkedHashMap: iteration order = insertion order

  V? get(K key) {
    final value = _map.remove(key);
    if (value == null) return null;   // (assumes non-null values)
    _map[key] = value;                // move to most-recently-used end
    return value;
  }

  void put(K key, V value) {
    _map.remove(key);
    _map[key] = value;
    if (_map.length > capacity) {
      _map.remove(_map.keys.first);   // evict least recently used
    }
  }
}
```

### A16. Debounce function (generic utility)
```dart
import 'dart:async';

class Debouncer {
  Debouncer(this.delay);
  final Duration delay;
  Timer? _timer;

  void run(void Function() action) {
    _timer?.cancel();
    _timer = Timer(delay, action);
  }

  void dispose() => _timer?.cancel();
}
```

### A17. Throttle
```dart
class Throttler {
  Throttler(this.interval);
  final Duration interval;
  DateTime? _last;

  void run(void Function() action) {
    final now = DateTime.now();
    if (_last == null || now.difference(_last!) >= interval) {
      _last = now;
      action();
    }
  }
}
```

### A18. Retry with exponential backoff
```dart
Future<T> retry<T>(
  Future<T> Function() task, {
  int maxAttempts = 3,
  Duration initialDelay = const Duration(milliseconds: 500),
  bool Function(Object error)? retryIf,
}) async {
  var attempt = 0;
  var delay = initialDelay;
  while (true) {
    attempt++;
    try {
      return await task();
    } catch (e) {
      final shouldRetry = attempt < maxAttempts && (retryIf?.call(e) ?? true);
      if (!shouldRetry) rethrow;
      await Future<void>.delayed(delay);
      delay *= 2;
    }
  }
}
```

### A19. Run futures with limited concurrency
```dart
Future<List<R>> mapConcurrent<T, R>(List<T> items, int limit, Future<R> Function(T) f) async {
  final results = List<R?>.filled(items.length, null);
  var next = 0;
  Future<void> worker() async {
    while (true) {
      final i = next++;              // safe: single-threaded event loop
      if (i >= items.length) return;
      results[i] = await f(items[i]);
    }
  }
  await Future.wait(List.generate(limit, (_) => worker()));
  return results.cast<R>();
}
```

### A20. Countdown stream
```dart
Stream<int> countdown(int from) async* {
  for (var i = from; i >= 0; i--) {
    yield i;
    if (i > 0) await Future<void>.delayed(const Duration(seconds: 1));
  }
}
```

### A21. Implement `map` for a custom iterable using `sync*`
```dart
Iterable<R> myMap<T, R>(Iterable<T> source, R Function(T) f) sync* {
  for (final x in source) {
    yield f(x);
  }
}
```

### A22. Deep equality of JSON-like structures
```dart
import 'package:collection/collection.dart';
const deepEq = DeepCollectionEquality();
deepEq.equals({'a': [1, 2]}, {'a': [1, 2]}); // true
```

### A23. Count words, top-K frequent
```dart
List<MapEntry<String, int>> topK(String text, int k) {
  final counts = <String, int>{};
  for (final w in text.toLowerCase().split(RegExp(r'\W+')).where((w) => w.isNotEmpty)) {
    counts[w] = (counts[w] ?? 0) + 1;
  }
  final entries = counts.entries.toList()
    ..sort((a, b) => b.value != a.value ? b.value.compareTo(a.value) : a.key.compareTo(b.key));
  return entries.take(k).toList();
}
```

### A24. Simple event bus with streams
```dart
class EventBus {
  final _controller = StreamController<Object>.broadcast();
  Stream<T> on<T>() => _controller.stream.where((e) => e is T).cast<T>();
  void fire(Object event) => _controller.add(event);
  Future<void> dispose() => _controller.close();
}
```

---

# Part B — Predict the output (with explanations) 🧩

**B1.**
```dart
void main() async {
  print(1);
  Future.delayed(Duration.zero, () => print(2));
  scheduleMicrotask(() => print(3));
  await Future.value();
  print(4);
}
```
Output: `1 3 4 2`. Sync `1`; microtask 3 queued; `await Future.value()` schedules continuation as a microtask after 3 → `3`, `4`; the timer event `2` last.

**B2.**
```dart
void main() {
  const a = [1, 2];
  const b = [1, 2];
  final c = [1, 2];
  print(identical(a, b)); // ?
  print(a == c);          // ?
}
```
`true` (const canonicalized), `false` (List `==` is identity).

**B3.**
```dart
mixin A { String who() => 'A'; }
mixin B { String who() => 'B'; }
class C with A, B {}
void main() => print(C().who());
```
`B` — last mixin wins.

**B4.**
```dart
void main() {
  final fns = <Function>[];
  for (var i = 0; i < 3; i++) {
    fns.add(() => print(i));
  }
  for (final f in fns) f();
}
```
`0 1 2` — each loop iteration has a fresh `i`.

**B5.**
```dart
void main() {
  var list = [1, 2, 3];
  final mapped = list.map((e) { print('map $e'); return e * 2; });
  print('before');
  print(mapped.first);
}
```
`before`, `map 1`, `2` — lazy; `first` evaluates only the first element.

**B6.**
```dart
Future<void> f() async {
  print('f start');
  await Future.delayed(Duration.zero);
  print('f end');
}
void main() {
  f();
  print('main');
}
```
`f start`, `main`, `f end`.

**B7.**
```dart
void main() {
  String? name;
  print(name?.length ?? -1);
  name ??= 'Flutter';
  name ??= 'Dart';
  print(name);
}
```
`-1`, `Flutter`.

**B8.**
```dart
class P { P() { print('P'); } }
class Q extends P { Q() : super() { print('Q'); } }
void main() => Q();
```
`P` then `Q`.

**B9.**
```dart
void main() {
  try {
    Future.error('boom');
    print('after');
  } catch (e) {
    print('caught $e');
  }
}
```
Prints `after`; the error is **not** caught (not awaited) → reported as an unhandled async error.

**B10.**
```dart
void main() {
  final s = {1, 2, 3};
  final m = {};
  print(s is Set<int>);  // true — a set literal (implementation is a LinkedHashSet)
  print(m is Map);      // true — `{}` is a Map literal
}
```

**B11.** Flutter: what's printed when the button is tapped?
```dart
class Demo extends StatefulWidget { const Demo({super.key}); @override State<Demo> createState() => _DemoState(); }
class _DemoState extends State<Demo> {
  int n = 0;
  @override
  Widget build(BuildContext context) {
    print('build $n');
    return TextButton(onPressed: () { setState(() => n++); setState(() => n++); }, child: Text('$n'));
  }
}
```
After a tap: `build 2` once — multiple setState calls in the same frame are batched into one rebuild.

**B12.** Why doesn't the colour swap?
```dart
Row(children: swapped ? [Tile(), Tile2()] : [Tile2(), Tile()])
```
If `Tile`/`Tile2` are *different types*, Flutter replaces elements (state lost but no "wrong state" issue). If both are the same StatefulWidget type without keys, state stays by position → colours don't swap. Fix with keys.

---

# Part C — Machine coding rounds 🛠️

Typical prompt: *"Build an app that fetches users from an API, shows them in a list with loading/error states, supports pull-to-refresh and search, and a details screen. Use any state management. 90 minutes."*

Evaluation criteria: works end-to-end, clean architecture (separation of UI/state/data), error/loading/empty states, code readability, naming, null safety, no obvious bugs (dispose, mounted), small widgets, maybe tests, git commits.

### C1. Users directory (Riverpod 3 + http) — complete solution

`pubspec.yaml` deps: `flutter_riverpod`, `http`.

```dart
// lib/main.dart
import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:http/http.dart' as http;

void main() => runApp(const ProviderScope(child: App()));

class App extends StatelessWidget {
  const App({super.key});
  @override
  Widget build(BuildContext context) => MaterialApp(
        title: 'Users',
        theme: ThemeData(colorSchemeSeed: Colors.indigo),
        home: const UsersPage(),
      );
}

// ---------- Model ----------
class User {
  const User({required this.id, required this.name, required this.email, required this.company});
  final int id;
  final String name;
  final String email;
  final String company;

  factory User.fromJson(Map<String, dynamic> json) => User(
        id: json['id'] as int,
        name: json['name'] as String,
        email: json['email'] as String,
        company: (json['company'] as Map<String, dynamic>)['name'] as String,
      );
}

// ---------- Data ----------
class UserRepository {
  UserRepository(this._client);
  final http.Client _client;

  Future<List<User>> fetchUsers() async {
    final res = await _client
        .get(Uri.parse('https://jsonplaceholder.typicode.com/users'))
        .timeout(const Duration(seconds: 15));
    if (res.statusCode != 200) {
      throw Exception('Server error (${res.statusCode})');
    }
    final list = jsonDecode(res.body) as List<dynamic>;
    return list.map((e) => User.fromJson(e as Map<String, dynamic>)).toList();
  }
}

final httpClientProvider = Provider<http.Client>((ref) {
  final client = http.Client();
  ref.onDispose(client.close);
  return client;
});

final userRepositoryProvider =
    Provider<UserRepository>((ref) => UserRepository(ref.watch(httpClientProvider)));

final usersProvider = FutureProvider<List<User>>(
  (ref) => ref.watch(userRepositoryProvider).fetchUsers(),
);

class SearchQuery extends Notifier<String> {
  @override
  String build() => '';
  void set(String value) => state = value;
}

final searchQueryProvider = NotifierProvider<SearchQuery, String>(SearchQuery.new);

final filteredUsersProvider = Provider<AsyncValue<List<User>>>((ref) {
  final query = ref.watch(searchQueryProvider).trim().toLowerCase();
  return ref.watch(usersProvider).whenData(
        (users) => query.isEmpty
            ? users
            : users
                .where((u) => u.name.toLowerCase().contains(query) || u.email.toLowerCase().contains(query))
                .toList(),
      );
});

// ---------- UI ----------
class UsersPage extends ConsumerWidget {
  const UsersPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final users = ref.watch(filteredUsersProvider);
    return Scaffold(
      appBar: AppBar(
        title: const Text('Users'),
        bottom: const PreferredSize(
          preferredSize: Size.fromHeight(64),
          child: Padding(padding: EdgeInsets.fromLTRB(16, 0, 16, 8), child: _SearchField()),
        ),
      ),
      body: RefreshIndicator(
        onRefresh: () => ref.refresh(usersProvider.future),
        child: switch (users) {
          AsyncData(:final value) when value.isEmpty => const _CenteredScrollable(child: Text('No users found')),
          AsyncData(:final value) => ListView.separated(
              physics: const AlwaysScrollableScrollPhysics(),
              itemCount: value.length,
              separatorBuilder: (_, __) => const Divider(height: 1),
              itemBuilder: (context, i) => _UserTile(user: value[i]),
            ),
          AsyncError(:final error) => _CenteredScrollable(
              child: Column(mainAxisSize: MainAxisSize.min, children: [
                Text('Something went wrong\n$error', textAlign: TextAlign.center),
                const SizedBox(height: 12),
                FilledButton(onPressed: () => ref.invalidate(usersProvider), child: const Text('Retry')),
              ]),
            ),
          _ => const Center(child: CircularProgressIndicator()),
        },
      ),
    );
  }
}

class _SearchField extends ConsumerStatefulWidget {
  const _SearchField();
  @override
  ConsumerState<_SearchField> createState() => _SearchFieldState();
}

class _SearchFieldState extends ConsumerState<_SearchField> {
  final _controller = TextEditingController();
  Timer? _debounce;

  @override
  void dispose() {
    _debounce?.cancel();
    _controller.dispose();
    super.dispose();
  }

  void _onChanged(String value) {
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 300), () {
      ref.read(searchQueryProvider.notifier).set(value);
    });
  }

  @override
  Widget build(BuildContext context) => TextField(
        controller: _controller,
        onChanged: _onChanged,
        textInputAction: TextInputAction.search,
        decoration: const InputDecoration(
          hintText: 'Search by name or email',
          prefixIcon: Icon(Icons.search),
          border: OutlineInputBorder(),
          isDense: true,
        ),
      );
}

class _UserTile extends StatelessWidget {
  const _UserTile({required this.user});
  final User user;

  @override
  Widget build(BuildContext context) => ListTile(
        leading: CircleAvatar(child: Text(user.name[0])),
        title: Text(user.name),
        subtitle: Text(user.email),
        trailing: const Icon(Icons.chevron_right),
        onTap: () => Navigator.of(context).push(
          MaterialPageRoute<void>(builder: (_) => UserDetailsPage(user: user)),
        ),
      );
}

class UserDetailsPage extends StatelessWidget {
  const UserDetailsPage({super.key, required this.user});
  final User user;

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context).textTheme;
    return Scaffold(
      appBar: AppBar(title: Text(user.name)),
      body: ListView(padding: const EdgeInsets.all(16), children: [
        Text(user.name, style: t.headlineSmall),
        const SizedBox(height: 8),
        Text(user.email, style: t.bodyLarge),
        const SizedBox(height: 8),
        Text('Works at ${user.company}', style: t.bodyMedium),
      ]),
    );
  }
}

class _CenteredScrollable extends StatelessWidget {
  const _CenteredScrollable({required this.child});
  final Widget child;
  @override
  Widget build(BuildContext context) => LayoutBuilder(
        builder: (context, c) => SingleChildScrollView(
          physics: const AlwaysScrollableScrollPhysics(),   // keeps pull-to-refresh working
          child: SizedBox(height: c.maxHeight, child: Center(child: child)),
        ),
      );
}
```
Talking points: repository abstraction (swap for fakes in tests), derived filtered provider, debounce, refresh via `ref.refresh(provider.future)`, error retry with `invalidate`, disposal of timers/controllers, AlwaysScrollableScrollPhysics for refresh on empty/error.

**Unit test for the repository**
```dart
import 'package:http/testing.dart';
test('fetchUsers parses users', () async {
  final client = MockClient((_) async => http.Response(
      '[{"id":1,"name":"Leanne","email":"l@x.com","company":{"name":"Acme"}}]', 200));
  final users = await UserRepository(client).fetchUsers();
  expect(users.single.company, 'Acme');
});
```

### C2. Todo app with Cubit + persistence (shared_preferences)

```dart
// todo.dart
import 'dart:convert';
import 'package:equatable/equatable.dart';

class Todo extends Equatable {
  const Todo({required this.id, required this.title, this.done = false});
  final String id;
  final String title;
  final bool done;

  Todo copyWith({String? title, bool? done}) => Todo(id: id, title: title ?? this.title, done: done ?? this.done);
  Map<String, dynamic> toJson() => {'id': id, 'title': title, 'done': done};
  factory Todo.fromJson(Map<String, dynamic> j) =>
      Todo(id: j['id'] as String, title: j['title'] as String, done: j['done'] as bool? ?? false);

  @override
  List<Object?> get props => [id, title, done];
}

// todo_repository.dart
import 'package:shared_preferences/shared_preferences.dart';

class TodoRepository {
  TodoRepository(this._prefs);
  final SharedPreferences _prefs;
  static const _key = 'todos_v1';

  List<Todo> load() {
    final raw = _prefs.getString(_key);
    if (raw == null) return const [];
    return (jsonDecode(raw) as List<dynamic>)
        .map((e) => Todo.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  Future<void> save(List<Todo> todos) =>
      _prefs.setString(_key, jsonEncode(todos.map((t) => t.toJson()).toList()));
}

// todo_cubit.dart
import 'package:flutter_bloc/flutter_bloc.dart';

enum TodoFilter { all, active, done }

class TodoState extends Equatable {
  const TodoState({this.todos = const [], this.filter = TodoFilter.all});
  final List<Todo> todos;
  final TodoFilter filter;

  List<Todo> get visible => switch (filter) {
        TodoFilter.all => todos,
        TodoFilter.active => todos.where((t) => !t.done).toList(),
        TodoFilter.done => todos.where((t) => t.done).toList(),
      };
  int get remaining => todos.where((t) => !t.done).length;

  TodoState copyWith({List<Todo>? todos, TodoFilter? filter}) =>
      TodoState(todos: todos ?? this.todos, filter: filter ?? this.filter);

  @override
  List<Object?> get props => [todos, filter];
}

class TodoCubit extends Cubit<TodoState> {
  TodoCubit(this._repo) : super(TodoState(todos: _repo.load()));
  final TodoRepository _repo;

  void add(String title) {
    final trimmed = title.trim();
    if (trimmed.isEmpty) return;
    final todo = Todo(id: DateTime.now().microsecondsSinceEpoch.toString(), title: trimmed);
    _update([...state.todos, todo]);                     // new list → new state
  }

  void toggle(String id) => _update([
        for (final t in state.todos) t.id == id ? t.copyWith(done: !t.done) : t,
      ]);

  void remove(String id) => _update(state.todos.where((t) => t.id != id).toList());

  void setFilter(TodoFilter f) => emit(state.copyWith(filter: f));

  void _update(List<Todo> todos) {
    emit(state.copyWith(todos: todos));
    _repo.save(todos);     // fire-and-forget persistence (could await & handle errors)
  }
}

// main.dart
Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  final prefs = await SharedPreferences.getInstance();
  runApp(BlocProvider(create: (_) => TodoCubit(TodoRepository(prefs)), child: const MaterialApp(home: TodoPage())));
}

class TodoPage extends StatefulWidget {
  const TodoPage({super.key});
  @override
  State<TodoPage> createState() => _TodoPageState();
}

class _TodoPageState extends State<TodoPage> {
  final _controller = TextEditingController();

  @override
  void dispose() { _controller.dispose(); super.dispose(); }

  void _submit() {
    context.read<TodoCubit>().add(_controller.text);
    _controller.clear();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: BlocSelector<TodoCubit, TodoState, int>(
          selector: (s) => s.remaining,
          builder: (_, remaining) => Text('Todos ($remaining left)'),
        ),
        actions: [
          PopupMenuButton<TodoFilter>(
            onSelected: context.read<TodoCubit>().setFilter,
            itemBuilder: (_) => [for (final f in TodoFilter.values) PopupMenuItem(value: f, child: Text(f.name))],
          ),
        ],
      ),
      body: Column(children: [
        Padding(
          padding: const EdgeInsets.all(12),
          child: Row(children: [
            Expanded(
              child: TextField(
                controller: _controller,
                onSubmitted: (_) => _submit(),
                decoration: const InputDecoration(hintText: 'What needs to be done?'),
              ),
            ),
            IconButton(onPressed: _submit, icon: const Icon(Icons.add)),
          ]),
        ),
        Expanded(
          child: BlocBuilder<TodoCubit, TodoState>(
            builder: (context, state) {
              final items = state.visible;
              if (items.isEmpty) return const Center(child: Text('Nothing here 🎉'));
              return ListView.builder(
                itemCount: items.length,
                itemBuilder: (context, i) {
                  final todo = items[i];
                  return Dismissible(
                    key: ValueKey(todo.id),
                    background: Container(color: Colors.red),
                    onDismissed: (_) => context.read<TodoCubit>().remove(todo.id),
                    child: CheckboxListTile(
                      value: todo.done,
                      onChanged: (_) => context.read<TodoCubit>().toggle(todo.id),
                      title: Text(
                        todo.title,
                        style: todo.done ? const TextStyle(decoration: TextDecoration.lineThrough) : null,
                      ),
                    ),
                  );
                },
              );
            },
          ),
        ),
      ]),
    );
  }
}
```
(Imports for Flutter/Equatable/Bloc/SharedPreferences omitted between "files" for brevity — in a real project each file has its own imports.)

**bloc_test for TodoCubit**
```dart
class MockRepo extends Mock implements TodoRepository {}
void main() {
  late MockRepo repo;
  setUp(() {
    repo = MockRepo();
    when(() => repo.load()).thenReturn(const []);
    when(() => repo.save(any())).thenAnswer((_) async {});
  });
  blocTest<TodoCubit, TodoState>(
    'add creates a todo',
    build: () => TodoCubit(repo),
    act: (c) => c.add('Milk'),
    verify: (c) {
      expect(c.state.todos.single.title, 'Milk');
      verify(() => repo.save(any())).called(1);
    },
  );
}
```
(`registerFallbackValue(<Todo>[])` may be needed for `any()` with typed lists in mocktail.)

### C3. Stopwatch (tests lifecycle & timers)
```dart
class StopwatchPage extends StatefulWidget {
  const StopwatchPage({super.key});
  @override
  State<StopwatchPage> createState() => _StopwatchPageState();
}

class _StopwatchPageState extends State<StopwatchPage> with SingleTickerProviderStateMixin {
  final _stopwatch = Stopwatch();
  late final Ticker _ticker = createTicker((_) => setState(() {}));   // rebuild each frame while running

  @override
  void dispose() {
    _ticker.dispose();
    super.dispose();
  }

  void _toggle() {
    setState(() {
      if (_stopwatch.isRunning) {
        _stopwatch.stop();
        _ticker.stop();
      } else {
        _stopwatch.start();
        _ticker.start();
      }
    });
  }

  void _reset() => setState(() { _stopwatch.reset(); });

  String _format(Duration d) {
    String two(int n) => n.toString().padLeft(2, '0');
    return '${two(d.inMinutes.remainder(60))}:${two(d.inSeconds.remainder(60))}.${two(d.inMilliseconds.remainder(1000) ~/ 10)}';
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        body: Center(
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            Text(_format(_stopwatch.elapsed),
                style: Theme.of(context).textTheme.displayMedium?.copyWith(fontFeatures: const [FontFeature.tabularFigures()])),
            const SizedBox(height: 24),
            Row(mainAxisSize: MainAxisSize.min, children: [
              FilledButton(onPressed: _toggle, child: Text(_stopwatch.isRunning ? 'Stop' : 'Start')),
              const SizedBox(width: 12),
              OutlinedButton(onPressed: _stopwatch.isRunning ? null : _reset, child: const Text('Reset')),
            ]),
          ]),
        ),
      );
}
```
Talking points: Ticker vs Timer.periodic (frame-synced, paused offscreen), tabular figures to avoid jitter, dispose, only the text needs rebuilding (could extract to its own widget for efficiency).
(Requires `import 'package:flutter/scheduler.dart';` for `Ticker` and `dart:ui` for `FontFeature`.)

### C4. Custom reusable widget: star rating
```dart
class StarRating extends StatelessWidget {
  const StarRating({super.key, required this.value, this.max = 5, this.onChanged, this.size = 28});
  final int value;
  final int max;
  final ValueChanged<int>? onChanged;
  final double size;

  @override
  Widget build(BuildContext context) {
    final color = Theme.of(context).colorScheme.primary;
    return Semantics(
      label: 'Rating $value of $max',
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          for (var i = 1; i <= max; i++)
            IconButton(
              visualDensity: VisualDensity.compact,
              iconSize: size,
              tooltip: '$i star${i > 1 ? 's' : ''}',
              onPressed: onChanged == null ? null : () => onChanged!(i),
              icon: Icon(i <= value ? Icons.star : Icons.star_border, color: color),
            ),
        ],
      ),
    );
  }
}
```
Talking points: stateless & controlled (parent owns value), accessibility, theming, null callback = read-only.

### C5. Other common machine-coding prompts (practice list)
1. Weather app (API, search city, current + forecast, error handling, units toggle, caching last result).
2. Product catalog with cart (Riverpod/Bloc), badge count, quantity changes, totals, checkout summary.
3. Infinite scroll list with pagination & pull-to-refresh (Chapter 9 pattern).
4. Login flow with validation, loading state, mocked API, token storage, auto-login & logout.
5. Image gallery grid with Hero detail view and pinch-to-zoom (InteractiveViewer).
6. Chat UI (reverse list, input bar, message bubbles, timestamps grouping).
7. Expense tracker with charts (fl_chart) and local DB (Drift/sqflite).
8. Quiz app with timer per question and results screen.
9. Kanban board with drag & drop between columns.
10. Countdown/OTP input with auto-focus between fields & resend timer.
11. Movie search with debounce, cancellation, and details (OMDb/TMDb).
12. Settings screen with dark mode & locale switching persisted.

**Machine coding strategy (90 minutes):**
* 5 min: clarify requirements, list screens/states.
* 10 min: skeleton — models, repository interface, state, routing.
* 45 min: core flows end-to-end (happy path first).
* 15 min: loading/error/empty states, edge cases, polish.
* 10 min: one or two tests, README with decisions & next steps.
* 5 min: walkthrough prep: explain architecture & trade-offs.
* Commit in small steps; keep it running at all times.

---

# Part D — Behavioral & HR questions (with STAR answers) 🗣️

Use **STAR**: **S**ituation, **T**ask, **A**ction, **R**esult (+ what you learned).

**D1. Tell me about yourself.** 60–90s: current role & domain, Flutter experience (apps shipped, scale), strengths (architecture, performance, mentoring), a highlight achievement with numbers, why this role.

**D2. Describe a challenging bug you solved.** *Example:* "Users reported random logouts (S). I owned the investigation (T). I added breadcrumbs around token refresh, discovered parallel 401s triggered multiple refresh calls invalidating each other; I replaced the interceptor with a queued single-flight refresh and added tests simulating concurrent requests (A). Logout complaints dropped to zero, crash-free sessions improved, and we documented the pattern (R)."

**D3. A time you improved performance.** Measure → fix → numbers: "Reduced feed jank: 30% janky frames → 3% by moving JSON parsing to an isolate, adding image cacheWidth, and splitting rebuild scopes."

**D4. A disagreement with a teammate/lead.** Show respect, data-driven discussion, prototype comparison, compromise/ADR, outcome.

**D5. A failure or mistake.** Own it, explain fix and prevention (e.g., shipped crash due to missing null handling → added tests, lint rules, staged rollout).

**D6. How do you handle tight deadlines?** Prioritize must-haves, communicate early, feature flags, cut scope not quality on critical paths.

**D7. How do you keep up with Flutter changes?** Release notes & breaking changes pages, Flutter/Dart blogs, GitHub issues, Flutter YouTube (Widget of the Week, Observable Flutter), community newsletters, conferences, experimenting with beta in side projects.

**D8. Why Flutter (over native/React Native)?** Productivity, consistent UI, performance, multi-platform reach, team's experience; acknowledge cases where native is better.

**D9. How do you mentor juniors?** Pairing, constructive reviews, documentation, gradually increasing ownership.

**D10. Where do you see yourself in 3–5 years?** Growth aligned with company: technical leadership, architecture, mentoring, cross-platform strategy.

**D11. Questions to ask the interviewer:** Team size & structure, state management/architecture choices, release cadence & CI, testing culture, how tech debt is handled, on-call/incident process, design system maturity, biggest technical challenge in the next 6 months.
