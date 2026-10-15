# Chapter 17 — Local Storage: Preferences, Secure Storage, Files, SQLite (sqflite/Drift), NoSQL & Caching

> **Goal:** Choose the right storage for each kind of data, use it correctly, migrate schemas safely, and avoid data-loss and security bugs.

---

## 17.1 5-year-old picture: drawers, safes and filing cabinets 🗄️

* **Sticky notes on the fridge** (SharedPreferences) — tiny things like "dark mode on".
* **A locked safe** (secure storage) — secret keys, passwords, tokens.
* **A box of papers** (files) — photos, PDFs, downloads.
* **A big filing cabinet with an index** (databases) — thousands of organised records you can search.

---

## 17.2 Decision table

| Data | Store in | Why |
|---|---|---|
| Small settings/flags (theme, onboarding seen, last tab) | `shared_preferences` | Simple key-value, not secure |
| Tokens, passwords, encryption keys, PII secrets | `flutter_secure_storage` | Keychain (iOS) / Keystore-backed encryption (Android) |
| Structured relational data, queries, joins, offline-first | **Drift** (SQLite, typed, reactive) or **sqflite** | SQL power, migrations |
| Fast object storage / NoSQL | **ObjectBox**, **Isar (community fork)**, **Hive CE**, **Sembast** | Simple objects, speed |
| Large binary (images, PDFs, videos) | Files via `path_provider` | Don't put big blobs in prefs/DB |
| Cached HTTP responses/images | `dio_cache_interceptor`, `cached_network_image`(uses `flutter_cache_manager`) | Automatic expiry |
| Cloud-synced data | Firestore (offline cache), Supabase, Realm-like solutions | Sync handled |

> ⚠️ Ecosystem note (2024–2026): the original authors stopped maintaining **Hive** and **Isar**. Community forks **`hive_ce`** and **`isar_community`** continue them. For new projects, many teams choose **Drift** (actively maintained, SQL, web support) or **ObjectBox**. Interviewers may ask "Hive vs Isar vs Drift" — mention maintenance status.

---

## 17.3 shared_preferences

```dart
// Classic API (cached, synchronous reads after getInstance)
final prefs = await SharedPreferences.getInstance();
await prefs.setBool('onboarding_done', true);
await prefs.setString('locale', 'hi');
await prefs.setInt('launch_count', (prefs.getInt('launch_count') ?? 0) + 1);
await prefs.setStringList('recent_searches', ['a', 'b']);
final done = prefs.getBool('onboarding_done') ?? false;
await prefs.remove('locale');
await prefs.clear();
```
Newer APIs (shared_preferences 2.3+):
* `SharedPreferencesAsync` — always reads from the platform (no stale cache across isolates/processes).
* `SharedPreferencesWithCache` — explicit cache with an `allowList` of keys.
The legacy `SharedPreferences` class is planned for eventual deprecation — new code should prefer the new APIs.

Facts:
* Android: stored in XML (`SharedPreferences`) or **DataStore** (newer backend option); iOS/macOS: `NSUserDefaults`; web: `localStorage`; Windows/Linux: JSON file.
* **Not encrypted** — readable on rooted/jailbroken devices and in backups. Never store tokens/passwords.
* Data **isn't guaranteed to be persisted** synchronously across crashes (write is async).
* Not for large data (it's loaded into memory).
* Only primitive types — store complex objects as JSON strings (or use a DB).
* Tests: `SharedPreferences.setMockInitialValues({'key': value})`.

Best practice: wrap in a typed `SettingsStore` class with keys as constants — avoid string typos scattered everywhere.

---

## 17.4 flutter_secure_storage 🔐

```dart
const storage = FlutterSecureStorage(
  aOptions: AndroidOptions(encryptedSharedPreferences: true), // option depends on plugin version; newer versions use their own cipher by default
  iOptions: IOSOptions(accessibility: KeychainAccessibility.first_unlock_this_device),
);
await storage.write(key: 'refresh_token', value: token);
final token = await storage.read(key: 'refresh_token');
await storage.delete(key: 'refresh_token');
await storage.deleteAll();
```
* iOS: **Keychain**. ⚠️ Keychain items **survive app uninstall** on iOS! If a user reinstalls, old tokens may still exist → on first launch after install (detect using a SharedPreferences flag, which *is* wiped on uninstall), clear secure storage.
* Android: encrypts values using keys stored in the **Android Keystore**. Android **Auto Backup** can restore encrypted data to a new device where the Keystore key doesn't exist → decryption crashes (`BadPaddingException`). Exclude secure storage files from backup (`android:allowBackup="false"` or `fullBackupContent`/`dataExtractionRules` rules) or handle errors by clearing.
* `KeychainAccessibility` choices matter for background access (e.g., `first_unlock` to read in background fetch).
* Biometric-protected secrets: `local_auth` + secure storage (or platform APIs binding keys to biometrics).

---

## 17.5 Files with path_provider

```dart
import 'dart:io';
import 'package:path_provider/path_provider.dart';
import 'package:path/path.dart' as p;

final docs = await getApplicationDocumentsDirectory();   // user data, backed up (iOS)
final support = await getApplicationSupportDirectory();  // app data not user-visible
final temp = await getTemporaryDirectory();              // cache; OS may delete anytime
final cache = await getApplicationCacheDirectory();
// Android only: getExternalStorageDirectory(), getExternalCacheDirectories(); iOS: getLibraryDirectory()
// Desktop: getDownloadsDirectory()

final file = File(p.join(docs.path, 'notes.json'));
await file.writeAsString(jsonEncode(notes), flush: true);
final content = await file.readAsString();
if (await file.exists()) await file.delete();
```
* `dart:io` isn't available on **web** — use conditional imports or IndexedDB-based storage.
* Always build paths with `package:path` (`p.join`) — never string-concatenate with `/`.
* Write atomically for important data: write to a temp file, then `rename` (prevents corruption on crash).
* Large file copies/encryption → isolate.
* User-visible files (save to Downloads/Gallery): Android scoped storage rules (Android 10+), `MediaStore`; packages `gal` (save images/videos to gallery), `file_picker`, `share_plus`, `open_filex`. iOS needs `UIFileSharingEnabled`/`LSSupportsOpeningDocumentsInPlace` to expose files in the Files app.

---

## 17.6 SQLite with sqflite

```dart
import 'package:sqflite/sqflite.dart';

class NotesDb {
  static const _version = 2;
  Database? _db;

  Future<Database> get db async => _db ??= await openDatabase(
        p.join(await getDatabasesPath(), 'notes.db'),
        version: _version,
        onConfigure: (db) async => db.execute('PRAGMA foreign_keys = ON'),
        onCreate: (db, version) async {
          await db.execute('''
            CREATE TABLE notes(
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              title TEXT NOT NULL,
              body TEXT,
              pinned INTEGER NOT NULL DEFAULT 0,
              updated_at INTEGER NOT NULL
            )''');
          await db.execute('CREATE INDEX idx_notes_updated ON notes(updated_at)');
        },
        onUpgrade: (db, oldVersion, newVersion) async {
          if (oldVersion < 2) {
            await db.execute('ALTER TABLE notes ADD COLUMN pinned INTEGER NOT NULL DEFAULT 0');
          }
          // if (oldVersion < 3) { ... } — cumulative, never edit old steps
        },
      );

  Future<int> insert(Note n) async =>
      (await db).insert('notes', n.toMap(), conflictAlgorithm: ConflictAlgorithm.replace);

  Future<List<Note>> search(String q) async {
    final rows = await (await db).query('notes',
        where: 'title LIKE ?', whereArgs: ['%$q%'],          // ❗ parameterised — prevents SQL injection
        orderBy: 'updated_at DESC', limit: 50);
    return rows.map(Note.fromMap).toList();
  }

  Future<void> bulkInsert(List<Note> notes) async {
    final database = await db;
    await database.transaction((txn) async {                  // ❗ transactions: atomic + MUCH faster
      final batch = txn.batch();
      for (final n in notes) batch.insert('notes', n.toMap());
      await batch.commit(noResult: true);
    });
  }
}
```
Notes:
* SQLite has no boolean/date types → store `INTEGER` 0/1 and epoch millis (or ISO text).
* Inside a `transaction`, use `txn`, **not** `db` → using `db` inside deadlocks!
* `sqflite` works on Android/iOS/macOS; desktop via `sqflite_common_ffi`; web via `sqflite_common_ffi_web` (experimental).
* Keep a single DB instance (opening multiple connections → "database is locked").
* Migrations: increase `version`; `onUpgrade` must handle **every** older version path; test upgrades from old app versions with real data!

---

## 17.7 Drift (type-safe, reactive SQLite) ⭐

```dart
import 'package:drift/drift.dart';
part 'app_database.g.dart';

class Todos extends Table {
  IntColumn get id => integer().autoIncrement()();
  TextColumn get title => text().withLength(min: 1, max: 200)();
  BoolColumn get done => boolean().withDefault(const Constant(false))();
  DateTimeColumn get createdAt => dateTime().withDefault(currentDateAndTime)();
  IntColumn get categoryId => integer().nullable().references(Categories, #id)();
}

class Categories extends Table {
  IntColumn get id => integer().autoIncrement()();
  TextColumn get name => text()();
}

@DriftDatabase(tables: [Todos, Categories])
class AppDatabase extends _$AppDatabase {
  AppDatabase(super.e);

  @override
  int get schemaVersion => 2;

  @override
  MigrationStrategy get migration => MigrationStrategy(
        onCreate: (m) => m.createAll(),
        onUpgrade: (m, from, to) async {
          if (from < 2) await m.addColumn(todos, todos.categoryId);
        },
        beforeOpen: (details) async => customStatement('PRAGMA foreign_keys = ON'),
      );

  Stream<List<Todo>> watchActive() =>
      (select(todos)..where((t) => t.done.equals(false))..orderBy([(t) => OrderingTerm.desc(t.createdAt)])).watch();

  Future<int> addTodo(String title) => into(todos).insert(TodosCompanion.insert(title: title));
  Future<void> toggle(Todo t) => update(todos).replace(t.copyWith(done: !t.done));
}
// Open with drift_flutter: AppDatabase(driftDatabase(name: 'app'))
```
Why teams love Drift: compile-time checked queries (Dart API or `.drift` SQL files), **streams that auto-update** UI when tables change, migrations tooling (`drift_dev schema dump` + generated step-by-step migrations + migration tests), joins, transactions, isolates support, web support (WASM SQLite), encryption via SQLCipher setup.

---

## 17.8 NoSQL options (brief)

### Hive (CE)
```dart
await Hive.initFlutter();
final box = await Hive.openBox<String>('settings');
await box.put('theme', 'dark');
box.get('theme');
// Typed objects need TypeAdapters (codegen with hive_ce_generator)
ValueListenableBuilder(valueListenable: box.listenable(), builder: ...);
```
Pure Dart, fast for small/medium data, encryption via `HiveAesCipher` (store key in secure storage). Boxes are loaded into memory (non-lazy boxes). Not for complex queries.

### Isar (community)
Fast, indexed queries, links, full-text-ish search, multi-isolate. Original maintainer left; use `isar_community` fork.

### ObjectBox
Very fast embedded object DB with relations, queries, vector search (on-device AI), and a commercial sync product.

### Sembast
Pure-Dart NoSQL JSON store; works on web (IndexedDB) — simple.

---

## 17.9 Web storage
* `shared_preferences` → localStorage.
* IndexedDB via `idb_shim`, Drift (WASM + OPFS/IndexedDB), Sembast web, Hive CE (IndexedDB).
* Remember: browser storage can be cleared by the user/browser at any time; quota limits.

---

## 17.10 Data security at rest
* Encrypt sensitive databases: **SQLCipher** (`sqlcipher_flutter_libs` with Drift/sqflite), Hive encryption; key in secure storage.
* Don't store PII unnecessarily (privacy laws: GDPR, India's DPDP Act 2023, CCPA).
* Clear user data on logout (DB, files, secure storage, caches, image cache).
* Exclude sensitive files from cloud backups when required.

---

## 17.11 Common storage bugs
| Bug | Cause / Fix |
|---|---|
| `MissingPluginException(No implementation found for method getAll on channel plugins.flutter.io/shared_preferences)` | Plugin added without full restart/rebuild; in tests not mocked; called in a background isolate without setup → full rebuild, `setMockInitialValues`, BackgroundIsolateBinaryMessenger |
| `Binding has not yet been initialized` | Using storage before `runApp` without `WidgetsFlutterBinding.ensureInitialized()` |
| Data lost after app update | Changed key names/DB schema without migration |
| `DatabaseException(no such column)` after update | Missing `onUpgrade` step / didn't bump version |
| Database locked / deadlock | Using `db` inside `transaction` instead of `txn`; multiple instances |
| Tokens survive reinstall on iOS | Keychain persists — clear on first run |
| Crash decrypting secure storage after device restore | Backup restored without Keystore key — exclude from backup, catch & reset |
| Slow app start | Opening big Hive boxes / heavy DB work before first frame → lazy open, show UI first |
| Web: `Unsupported operation: Platform._operatingSystem` / dart:io errors | dart:io used on web → conditional imports |

---

## 17.12 Interview Questions — Storage

**Q1. Where would you store an auth token?** flutter_secure_storage (Keychain/Keystore), never SharedPreferences; consider short-lived access tokens + refresh tokens.

**Q2. SharedPreferences limitations?** Small primitive data only, unencrypted, async writes, loaded into memory, not for complex/large data.

**Q3. sqflite vs Drift vs Hive/Isar/ObjectBox?** sqflite: raw SQLite with manual SQL; Drift: typed, reactive SQLite with migrations tooling; Hive: lightweight key-value boxes; Isar/ObjectBox: fast NoSQL object DBs with indexes/queries; consider maintenance status (Hive/Isar community forks).

**Q4. How do you handle DB migrations?** Versioned schema; cumulative onUpgrade steps for every old version; never modify past migrations; test upgrade paths; Drift's schema tools.

**Q5. How do you make DB writes fast?** Batch inserts in transactions, indexes on queried columns, avoid N+1 queries, run heavy work in isolates.

**Q6. Which directory for what?** Documents for user data, Support for app internal data, Temporary/Cache for re-creatable caches.

**Q7. How do you clear data on logout?** Delete tokens from secure storage, clear DB tables/user-specific files, caches (image cache, HTTP cache), reset state providers/blocs.

**Q8. What is an offline-first approach?** Local DB as source of truth, UI observes it, background sync with server and conflict resolution.
