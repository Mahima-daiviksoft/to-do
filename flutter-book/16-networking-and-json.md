# Chapter 16 — Networking: HTTP, Dio, JSON Serialization, REST, GraphQL, WebSockets, Error Handling & Offline

> **Goal:** Talk to servers like a professional: robust API clients with interceptors, token refresh, retries, cancellation, typed models, error mapping, caching and real-time connections.

---

## 16.1 5-year-old picture: sending letters 📮

Your app **writes a letter** (request) to a server: *"Dear server, please GIVE me the list of toys"* (`GET /toys`). The server **writes back** (response) with a status ("200 OK — here are the toys" or "404 — no such toys") and a **package** (body, usually **JSON** text). Your app must **unpack** the JSON into Dart objects (deserialization).

---

## 16.2 HTTP basics you must know

| Method | Meaning | Idempotent? |
|---|---|---|
| GET | Read | ✅ |
| POST | Create / action | ❌ |
| PUT | Replace | ✅ |
| PATCH | Partial update | ❌ (usually) |
| DELETE | Delete | ✅ |

Status codes: **2xx** success (200 OK, 201 Created, 204 No Content), **3xx** redirect (304 Not Modified), **4xx** client error (400 Bad Request, 401 Unauthorized = not logged in/token expired, 403 Forbidden = no permission, 404 Not Found, 409 Conflict, 422 Unprocessable Entity (validation), 429 Too Many Requests), **5xx** server error (500, 502 Bad Gateway, 503 Service Unavailable, 504 Gateway Timeout).

Headers: `Authorization: Bearer <token>`, `Content-Type: application/json`, `Accept`, `Accept-Language`, `If-None-Match`/`ETag`, `Cache-Control`, custom `X-Request-Id`, `Idempotency-Key`.

### Platform setup
* **Android**: `<uses-permission android:name="android.permission.INTERNET" />` in `src/main/AndroidManifest.xml` — **missing in release** is a classic bug: works in debug (debug manifest has it) but release can't connect! Cleartext HTTP (non-HTTPS) is blocked on Android 9+ unless `android:usesCleartextTraffic="true"` or network security config (only for dev!).
* **iOS**: App Transport Security blocks plain HTTP; exceptions via `NSAppTransportSecurity` in Info.plist (avoid in prod).
* **macOS**: enable `com.apple.security.network.client` entitlement — otherwise "Operation not permitted".
* **Web**: **CORS** — the server must send `Access-Control-Allow-Origin` headers; you can't fix CORS from Flutter code. During development use `web_dev_config.yaml` proxy (Flutter 3.38+) or a dev proxy.
* Android emulator → your laptop's localhost is `10.0.2.2`, not `localhost`. iOS simulator can use `localhost`. Physical device: use your machine's LAN IP or tunnelling (ngrok).

---

## 16.3 The `http` package (official, simple)

```dart
import 'dart:convert';
import 'package:http/http.dart' as http;

Future<List<Post>> fetchPosts() async {
  final uri = Uri.https('jsonplaceholder.typicode.com', '/posts', {'_limit': '10'});
  final response = await http.get(uri, headers: {'Accept': 'application/json'})
      .timeout(const Duration(seconds: 15));

  if (response.statusCode == 200) {
    final list = jsonDecode(response.body) as List<dynamic>;
    return list.map((e) => Post.fromJson(e as Map<String, dynamic>)).toList();
  }
  throw HttpException('Failed: ${response.statusCode}');
}

Future<Post> createPost(Post post) async {
  final res = await http.post(
    Uri.parse('https://api.example.com/posts'),
    headers: {'Content-Type': 'application/json'},
    body: jsonEncode(post.toJson()),      // ❗ encode! passing a Map sends form-encoded data
  );
  ...
}
```
* Reuse a `http.Client()` for multiple requests (keep-alive) and `close()` it.
* `response.body` decodes using charset from headers (defaults to latin1 if absent!) — for UTF-8 safety use `utf8.decode(response.bodyBytes)` when the server omits charset (common cause of garbled non-English text 🐛).
* Multipart upload: `http.MultipartRequest('POST', uri)..files.add(await http.MultipartFile.fromPath('file', path))`.
* Native-optimized clients: `cupertino_http` (NSURLSession on iOS/macOS), `cronet_http` (Cronet on Android) — HTTP/2/3, better performance, system proxy/VPN support.

---

## 16.4 Dio — the enterprise HTTP client

Dio adds **interceptors, global config, cancellation, timeouts, FormData, download/upload progress, transformers**.

```dart
final dio = Dio(BaseOptions(
  baseUrl: 'https://api.example.com/v1',
  connectTimeout: const Duration(seconds: 10),
  receiveTimeout: const Duration(seconds: 20),
  sendTimeout: const Duration(seconds: 20),
  headers: {'Accept': 'application/json'},
  responseType: ResponseType.json,       // auto-decodes JSON
  validateStatus: (s) => s != null && s >= 200 && s < 300,
));

final res = await dio.get<List<dynamic>>('/products', queryParameters: {'page': 1});
final products = res.data!.map((e) => Product.fromJson(e as Map<String, dynamic>)).toList();

await dio.post('/orders', data: order.toJson());

// Upload with progress
final form = FormData.fromMap({'avatar': await MultipartFile.fromFile(path, filename: 'a.jpg')});
await dio.post('/me/avatar', data: form, onSendProgress: (sent, total) => print(sent / total));

// Download
await dio.download(url, savePath, onReceiveProgress: (r, t) {});

// Cancellation
final token = CancelToken();
dio.get('/search', queryParameters: {'q': q}, cancelToken: token);
token.cancel('user typed again');
```

### DioException types (Dio 5)
`connectionTimeout`, `sendTimeout`, `receiveTimeout`, `badCertificate`, `badResponse` (non-2xx; `e.response?.statusCode`), `cancel`, `connectionError` (no internet / DNS), `unknown`.

### Interceptors 🔌
```dart
class AuthInterceptor extends QueuedInterceptor {   // Queued: requests wait while one refresh happens
  AuthInterceptor(this._tokens, this._dio);
  final TokenStore _tokens;
  final Dio _dio;

  @override
  void onRequest(RequestOptions options, RequestInterceptorHandler handler) async {
    final token = await _tokens.accessToken();
    if (token != null) options.headers['Authorization'] = 'Bearer $token';
    handler.next(options);
  }

  @override
  void onError(DioException err, ErrorInterceptorHandler handler) async {
    final is401 = err.response?.statusCode == 401;
    final alreadyRetried = err.requestOptions.extra['retried'] == true;
    if (!is401 || alreadyRetried) return handler.next(err);

    try {
      final newToken = await _refreshToken();            // call refresh endpoint with a SEPARATE Dio (no interceptor loop)
      final opts = err.requestOptions
        ..headers['Authorization'] = 'Bearer $newToken'
        ..extra['retried'] = true;
      final response = await _dio.fetch(opts);           // retry original request
      handler.resolve(response);
    } catch (e) {
      await _tokens.clear();                             // refresh failed → logout
      authEvents.add(AuthEvent.loggedOut);
      handler.next(err);
    }
  }

  Future<String> _refreshToken() async {
    final refresh = await _tokens.refreshToken();
    final res = await Dio(BaseOptions(baseUrl: _dio.options.baseUrl))
        .post('/auth/refresh', data: {'refresh_token': refresh});
    await _tokens.save(res.data['access_token'], res.data['refresh_token']);
    return res.data['access_token'] as String;
  }
}

dio.interceptors.addAll([
  AuthInterceptor(tokenStore, dio),
  if (kDebugMode) LogInterceptor(requestBody: true, responseBody: true), // ❗ never log tokens/PII in production
  RetryInterceptor(dio: dio, retries: 3, retryDelays: const [Duration(seconds: 1), Duration(seconds: 2), Duration(seconds: 4)]), // dio_smart_retry
]);
```
**Token refresh race condition** (very common senior question): if 5 requests fail with 401 simultaneously, a naive interceptor calls refresh 5 times (and later refreshes invalidate earlier refresh tokens → user logged out). Solutions: `QueuedInterceptor` (processes one at a time), or a shared `Completer`/`Future` lock so only one refresh runs and others await it. Also refresh **proactively** shortly before expiry (JWT `exp`).

### Retrofit (typed API clients via codegen)
```dart
@RestApi(baseUrl: 'https://api.example.com/v1')
abstract class ProductApi {
  factory ProductApi(Dio dio, {String baseUrl}) = _ProductApi;

  @GET('/products')
  Future<List<Product>> getProducts(@Query('page') int page);

  @GET('/products/{id}')
  Future<Product> getProduct(@Path('id') String id);

  @POST('/orders')
  Future<Order> createOrder(@Body() CreateOrderRequest body);
}
```
Chopper is a similar codegen client.

---

## 16.5 JSON serialization

### 16.5.1 Manual
```dart
class User {
  const User({required this.id, required this.name, this.email, required this.createdAt, this.tags = const []});
  final int id;
  final String name;
  final String? email;
  final DateTime createdAt;
  final List<String> tags;

  factory User.fromJson(Map<String, dynamic> json) => User(
        id: json['id'] as int,
        name: json['name'] as String,
        email: json['email'] as String?,
        createdAt: DateTime.parse(json['created_at'] as String),
        tags: (json['tags'] as List<dynamic>? ?? const []).cast<String>(),
      );

  Map<String, dynamic> toJson() => {
        'id': id,
        'name': name,
        if (email != null) 'email': email,
        'created_at': createdAt.toIso8601String(),
        'tags': tags,
      };
}
```
With Dart 3 patterns (validates shape and fails clearly):
```dart
factory User.fromJson(Map<String, dynamic> json) {
  if (json case {'id': int id, 'name': String name, 'created_at': String created}) {
    return User(id: id, name: name, email: json['email'] as String?, createdAt: DateTime.parse(created));
  }
  throw FormatException('Invalid user JSON: $json');
}
```
⚠️ JSON numbers: `1` decodes as `int`, `1.0` or `1.5` as `double`. A server sending `price: 10` sometimes and `10.5` other times → `json['price'] as double` crashes for `10`. Use `(json['price'] as num).toDouble()`.

### 16.5.2 `json_serializable` (codegen — most common)
```dart
import 'package:json_annotation/json_annotation.dart';
part 'user.g.dart';

@JsonSerializable(fieldRename: FieldRename.snake, explicitToJson: true)
class User {
  User({
    required this.id,
    required this.name,
    this.email,
    required this.createdAt,
    this.avatar = '',
    this.role = Role.unknown,
    this.address,
  });

  final int id;                                    // "id"
  final String name;                               // "name"
  final String? email;                             // nullable → missing key OK
  final DateTime createdAt;                        // "created_at" (snake rename), ISO-8601 parsed automatically
  @JsonKey(name: 'avatar_url', defaultValue: '')   // custom key + default when missing/null
  final String avatar;
  @JsonKey(unknownEnumValue: Role.unknown)         // new server enum values won't crash old apps
  final Role role;
  final Address? address;                          // nested model — explicitToJson makes toJson recurse

  @JsonKey(includeFromJson: false, includeToJson: false)
  bool selected = false;                           // UI-only field, not serialized

  factory User.fromJson(Map<String, dynamic> json) => _$UserFromJson(json);
  Map<String, dynamic> toJson() => _$UserToJson(this);
}
```
`dart run build_runner build --delete-conflicting-outputs`. Custom `JsonConverter<T, S>` for special formats (e.g., epoch timestamps).

### 16.5.3 `freezed` (immutable models + unions + JSON)
```dart
import 'package:freezed_annotation/freezed_annotation.dart';
part 'product.freezed.dart';
part 'product.g.dart';

@freezed
abstract class Product with _$Product {          // freezed 3.x: `abstract class` (or `sealed` for unions)
  const factory Product({
    required String id,
    required String name,
    @Default(0) int stock,
    double? discount,
  }) = _Product;

  factory Product.fromJson(Map<String, dynamic> json) => _$ProductFromJson(json);
}

final p2 = p1.copyWith(stock: 5);   // copyWith, ==, hashCode, toString generated
```
Union (sealed) types with freezed:
```dart
@freezed
sealed class PaymentResult with _$PaymentResult {
  const factory PaymentResult.success(String txnId) = PaymentSuccess;
  const factory PaymentResult.failed(String reason) = PaymentFailed;
}
```
(In freezed 3, `when`/`map` helpers were removed in favour of Dart 3 `switch` pattern matching.) Note: freezed versions changed syntax (`class X with _$X` → `abstract class`/`sealed class`); check your version.

Other options: `dart_mappable`, `built_value` (older, Google), Dart 3 macros (`@JsonCodable`) — **cancelled** in 2025.

### 16.5.4 Parse big JSON off the main thread
```dart
final users = await Isolate.run(() =>
    (jsonDecode(body) as List).map((e) => User.fromJson(e as Map<String, dynamic>)).toList());
```
Dio: set `dio.transformer = BackgroundTransformer()` (default in Dio 5 already uses background decoding for large responses on native).

---

## 16.6 Error handling architecture (production pattern)

Never let raw `DioException`/`SocketException` reach the UI. Map to **domain failures**:
```dart
sealed class AppFailure implements Exception {
  const AppFailure(this.message);
  final String message;
}
final class NetworkFailure extends AppFailure { const NetworkFailure() : super('No internet connection'); }
final class TimeoutFailure extends AppFailure { const TimeoutFailure() : super('The request timed out'); }
final class UnauthorizedFailure extends AppFailure { const UnauthorizedFailure() : super('Please log in again'); }
final class ServerFailure extends AppFailure { const ServerFailure(super.message, {this.statusCode}); final int? statusCode; }
final class ValidationFailure extends AppFailure { const ValidationFailure(super.message, this.fieldErrors); final Map<String, String> fieldErrors; }
final class UnknownFailure extends AppFailure { const UnknownFailure([super.message = 'Something went wrong']); }

AppFailure mapDioError(DioException e) => switch (e.type) {
  DioExceptionType.connectionTimeout || DioExceptionType.sendTimeout || DioExceptionType.receiveTimeout => const TimeoutFailure(),
  DioExceptionType.connectionError => const NetworkFailure(),
  DioExceptionType.badResponse => switch (e.response?.statusCode) {
      401 => const UnauthorizedFailure(),
      422 => ValidationFailure('Invalid data', _fieldErrors(e.response?.data)),
      final code => ServerFailure(_serverMessage(e.response?.data) ?? 'Server error', statusCode: code),
    },
  DioExceptionType.cancel => const UnknownFailure('Cancelled'),
  _ => const UnknownFailure(),
};
```
Repository returns a `Result<T>` (or throws AppFailure); UI shows user-friendly messages, logs technical details to crash reporting. Libraries: `fpdart` (`Either<Failure, T>`, `TaskEither`), `dartz` (older), or your own sealed `Result`.

### Retry strategy
* Retry only **idempotent** requests (GET/PUT/DELETE) or POSTs with **idempotency keys**.
* Exponential backoff with jitter; cap retries (3).
* Retry on timeouts, 502/503/504, connection errors — not on 4xx.

### Connectivity
`connectivity_plus` tells you the network *type* (wifi/mobile/none) — **not** whether internet actually works (captive portals!). For real reachability, use `internet_connection_checker_plus` or just attempt the request and handle failure. Listen to connectivity changes to auto-retry queued actions.

---

## 16.7 Caching & offline-first

Levels:
1. **HTTP caching**: honor `Cache-Control`/`ETag` — `dio_cache_interceptor`.
2. **Repository cache**: in-memory (Map with TTL) + persistent (database) — **stale-while-revalidate**: show cached data immediately, fetch fresh, update UI.
3. **Offline-first**: local DB is the **source of truth**; UI watches DB streams (Drift/Isar/ObjectBox/Firestore); sync engine pushes local changes (outbox/queue) and pulls server changes; conflict resolution (last-write-wins, versioning, server-authoritative merge).

```dart
class ProductRepository {
  ProductRepository(this._api, this._db);
  final ProductApi _api;
  final ProductDao _db;

  Stream<List<Product>> watchProducts() => _db.watchAll();   // UI listens here

  Future<void> refresh() async {
    final fresh = await _api.getProducts(1);
    await _db.replaceAll(fresh);                              // triggers stream update
  }
}
```

---

## 16.8 GraphQL
`graphql_flutter` / `graphql` (with normalized cache), `ferry` (codegen, typed, streams), `artemis` (older codegen).
```dart
final client = GraphQLClient(link: AuthLink(getToken: () async => 'Bearer $t').concat(HttpLink('https://api.example.com/graphql')), cache: GraphQLCache(store: HiveStore()));
final result = await client.query(QueryOptions(document: gql(r'''
  query Product($id: ID!) { product(id: $id) { id name price } }
'''), variables: {'id': '42'}));
if (result.hasException) { ... }
```
Know: queries/mutations/subscriptions, fragments, normalized caching, over-/under-fetching benefits, N+1 on the server side, persisted queries.

---

## 16.9 Real-time: WebSockets, SSE, gRPC, MQTT
```dart
import 'package:web_socket_channel/web_socket_channel.dart';
final channel = WebSocketChannel.connect(Uri.parse('wss://chat.example.com/ws'));
await channel.ready;                        // throws if connection fails
channel.stream.listen((msg) => handle(msg), onDone: reconnect, onError: (_) => reconnect());
channel.sink.add(jsonEncode({'type': 'message', 'text': 'hi'}));
await channel.sink.close();
```
Production concerns: **reconnection with backoff**, **heartbeats/pings**, re-subscribe after reconnect, message ordering & dedup (ids), app background (sockets die on mobile when backgrounded — use push notifications to wake/sync), auth on connect (token in query/header, refresh).
* Socket.IO: `socket_io_client`.
* SSE (server-sent events): one-way streaming over HTTP (used by LLM streaming APIs!) — read a streamed response line by line.
* **gRPC**: `grpc` package + protobuf codegen; HTTP/2; strongly typed; streaming; gRPC-Web on web.
* MQTT (IoT): `mqtt_client`.

---

## 16.10 Security in networking (summary — Chapter 25 for more)
* HTTPS everywhere; **certificate pinning** for high-security apps (banking): Dio `HttpClient` with `badCertificateCallback` checking fingerprints / `SecurityContext` with trusted certs; pinning on both platforms via plugins (`http_certificate_pinning`). Plan pin rotation (pin the intermediate/public key, ship backup pins), or you'll brick old app versions when certificates change.
* Store tokens in **secure storage** (Keychain/Keystore), not SharedPreferences.
* Don't log tokens/PII; strip from crash reports.
* Don't embed secret API keys in the app — proxy through your backend.

---

## 16.11 Testing networking code
* Abstract API behind an interface; inject fakes into repositories.
* Mock `http.Client` with `MockClient` from `package:http/testing.dart`:
```dart
final client = MockClient((request) async =>
    http.Response(jsonEncode([{'id': 1, 'title': 'x'}]), 200, headers: {'content-type': 'application/json'}));
```
* Dio: `http_mock_adapter` (`DioAdapter`).
* Widget tests: Flutter's `TestWidgetsFlutterBinding` makes **real HTTP calls return 400** by default — always mock network in tests.

---

## 16.12 Common networking bugs
| Bug | Cause / Fix |
|---|---|
| Works in debug, fails in release on Android | INTERNET permission missing in main manifest |
| `SocketException: Connection refused` on emulator | Using `localhost` → `10.0.2.2` |
| `HandshakeException` / CERTIFICATE_VERIFY_FAILED | invalid/self-signed cert, old Android root CAs (Let's Encrypt on Android < 7.1.1), wrong system time |
| Garbled non-English text | decode `bodyBytes` as UTF-8 |
| `type 'int' is not a subtype of type 'double'` | use `(x as num).toDouble()` |
| `XMLHttpRequest error` on web | CORS / mixed content (http on https page) |
| Infinite 401 loop | refresh endpoint going through same auth interceptor; retry flag missing |
| Multiple refreshes | QueuedInterceptor / lock |
| UI freezes on large responses | parse in isolate |
| Responses arrive out of order in search | cancel previous request (CancelToken / switchMap / restartable) |
| Memory leak / setState after dispose | cancel requests in dispose; check `mounted` |
| Request body empty on server | forgot `jsonEncode` / `Content-Type` header |

---

## 16.13 Interview Questions — Networking

**Q1. http vs Dio?** http is minimal and official; Dio adds interceptors, base options, cancellation, FormData, progress, retries ecosystem — better for large apps.

**Q2. How do you handle token refresh?** Auth interceptor adds token; on 401, refresh once (queued/locked), retry original request, logout on refresh failure; refresh endpoint uses a separate client to avoid loops.

**Q3. How do you parse JSON?** jsonDecode → Map → fromJson factories (manual or json_serializable/freezed); heavy payloads in an isolate.

**Q4. Why use code generation for JSON?** Less boilerplate, fewer typos, consistent null handling, nested models, maintainability.

**Q5. How do you handle errors from APIs?** Map transport and HTTP errors into domain failure types; show friendly messages; log details; retry where appropriate.

**Q6. How do you cancel requests?** Dio CancelToken (or closing http client); cancel in dispose or when a newer request supersedes.

**Q7. What is CORS and why does it affect Flutter web?** Browser security policy requiring the server to allow cross-origin requests; it's fixed on the server/proxy, not in Flutter.

**Q8. How do you build an offline-first app?** Local DB as single source of truth, UI observes DB, sync layer with outbox queue and conflict resolution, connectivity awareness, background sync.

**Q9. What is certificate pinning?** Validating the server certificate/public key against known values to prevent MITM even with compromised CAs; requires rotation planning.

**Q10. How do you implement retries correctly?** Exponential backoff with jitter for transient failures, only idempotent requests or with idempotency keys, max attempts.

**Q11. What is an interceptor?** Middleware hooking into request/response/error to modify, log, retry or resolve them.

**Q12. REST vs GraphQL?** REST: resource endpoints, simple caching; GraphQL: single endpoint, clients specify fields, reduces over/under-fetching, needs more tooling and caching strategy.
