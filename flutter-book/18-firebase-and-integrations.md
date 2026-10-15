# Chapter 18 — Firebase, Backend Services & Common Integrations (Auth, Push, Analytics, Crashlytics, Payments, Maps, Media, Permissions, Background Work)

> **Goal:** Integrate the services every real company app uses — correctly, securely, and with knowledge of the platform gotchas that cause most production incidents.

---

## 18.1 Firebase setup (FlutterFire)

```bash
dart pub global activate flutterfire_cli
firebase login
flutterfire configure            # creates lib/firebase_options.dart, registers apps, downloads config
flutter pub add firebase_core
```
```dart
import 'package:firebase_core/firebase_core.dart';
import 'firebase_options.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await Firebase.initializeApp(options: DefaultFirebaseOptions.currentPlatform);
  runApp(const MyApp());
}
```
* Multiple environments: separate Firebase projects (dev/staging/prod) — `flutterfire configure --project=myapp-dev --out=lib/firebase_options_dev.dart` per flavor; plus `google-services.json` per Android flavor (`android/app/src/dev/`) and `GoogleService-Info.plist` per iOS scheme (copy script in build phase).
* Firebase **client config/API keys are not secrets** — security is enforced by **Security Rules** and **App Check**, not by hiding keys.

---

## 18.2 Firebase Authentication
```dart
final auth = FirebaseAuth.instance;
await auth.createUserWithEmailAndPassword(email: e, password: p);
await auth.signInWithEmailAndPassword(email: e, password: p);
await auth.signOut();
auth.authStateChanges().listen((user) { /* null = signed out */ });   // drive your router redirect with this
auth.idTokenChanges(); auth.userChanges();
final idToken = await auth.currentUser?.getIdToken();                  // send to your backend; verify server-side

// Google Sign-In (google_sign_in package + credential)
// Sign in with Apple (sign_in_with_apple) — REQUIRED by App Store if you offer other third-party logins (App Store guideline 4.8, with some exceptions)
// Phone auth: verifyPhoneNumber(codeSent:, verificationCompleted:, verificationFailed:, codeAutoRetrievalTimeout:)
try { ... } on FirebaseAuthException catch (e) {
  switch (e.code) {
    case 'user-not-found' || 'wrong-password' || 'invalid-credential': ...
    case 'email-already-in-use': ...
    case 'too-many-requests': ...
    case 'network-request-failed': ...
  }
}
```
Note: Firebase has moved toward `invalid-credential` for wrong email/password (email enumeration protection), so don't rely on `user-not-found`/`wrong-password` alone.

Other auth providers/backends: Supabase Auth, Auth0 (`auth0_flutter`), AWS Cognito/Amplify, Keycloak/OAuth2+PKCE with `flutter_appauth`, custom JWT backend.

**Auth architecture pattern:**
`AuthRepository` (wraps SDK) → exposes `Stream<AuthUser?>` → app-level auth state (Bloc/Riverpod) → router `redirect` + `refreshListenable` → on logout clear all user data.

---

## 18.3 Cloud Firestore
```dart
final db = FirebaseFirestore.instance;

// Typed collection with converter
final todosRef = db.collection('users').doc(uid).collection('todos').withConverter<Todo>(
  fromFirestore: (snap, _) => Todo.fromJson({...snap.data()!, 'id': snap.id}),
  toFirestore: (todo, _) => todo.toJson()..remove('id'),
);

await todosRef.add(Todo(title: 'Buy milk'));
await todosRef.doc(id).update({'done': true});   // update on raw ref for partial fields
await todosRef.doc(id).delete();

// Real-time stream
Stream<List<Todo>> watch() => todosRef
    .where('done', isEqualTo: false)
    .orderBy('createdAt', descending: true)
    .limit(20)
    .snapshots()
    .map((s) => s.docs.map((d) => d.data()).toList());

// Pagination with cursors
final next = await todosRef.orderBy('createdAt').startAfterDocument(lastDoc).limit(20).get();

// Transactions & batched writes
await db.runTransaction((tx) async {
  final snap = await tx.get(accountRef);
  tx.update(accountRef, {'balance': (snap['balance'] as num) - 100});
});
final batch = db.batch()..set(a, dataA)..delete(b);
await batch.commit();

FieldValue.serverTimestamp(); FieldValue.increment(1); FieldValue.arrayUnion(['x']);
```
Key knowledge:
* Offline persistence enabled by default on mobile (cache); writes are queued.
* **Composite indexes** required for multi-field queries → error message includes a link to create it.
* Billing is per document read → avoid reading whole collections; paginate; denormalize data for reads.
* Listeners must be cancelled (StreamBuilder handles it; manual `listen` → cancel in dispose).
* **Security Rules** are mandatory (never ship `allow read, write: if true;`):
```
rules_version = '2';
service cloud.firestore {
  match /databases/{db}/documents {
    match /users/{uid}/todos/{todoId} {
      allow read, write: if request.auth != null && request.auth.uid == uid;
    }
  }
}
```
* Realtime Database (older JSON tree DB), Cloud Storage (`firebase_storage` for file uploads with `putFile`, progress via `snapshotEvents`), Cloud Functions (`cloud_functions` `httpsCallable('fn').call(data)`), **App Check** (`firebase_app_check` — attestation with Play Integrity / App Attest so only your genuine app can call your backend).

---

## 18.4 Push notifications (FCM) 🔔

### Concepts
* **FCM** (Firebase Cloud Messaging) delivers to Android directly and to iOS via **APNs** (upload APNs auth key `.p8` to Firebase).
* Message types:
  * **Notification message** (`notification` payload): OS shows it automatically when app is in background/terminated.
  * **Data message** (`data` only): delivered to your app code; you decide what to show (on iOS, data-only messages are delivered as "silent/background" pushes and are **throttled & not guaranteed**).
* App states: **foreground**, **background**, **terminated** — each handled differently.

### Code
```dart
@pragma('vm:entry-point')     // ❗ needed so the function isn't tree-shaken in release
Future<void> _firebaseMessagingBackgroundHandler(RemoteMessage message) async {
  await Firebase.initializeApp(options: DefaultFirebaseOptions.currentPlatform); // runs in its own isolate
  // light work only: e.g., update badge/local DB
}

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await Firebase.initializeApp(options: DefaultFirebaseOptions.currentPlatform);
  FirebaseMessaging.onBackgroundMessage(_firebaseMessagingBackgroundHandler); // top-level function
  runApp(const MyApp());
}

Future<void> setupPush() async {
  final fm = FirebaseMessaging.instance;
  final settings = await fm.requestPermission(alert: true, badge: true, sound: true); // iOS + Android 13+
  if (settings.authorizationStatus == AuthorizationStatus.denied) return;

  final token = await fm.getToken();          // send to your backend (associate with user)
  fm.onTokenRefresh.listen(sendTokenToServer);  // tokens change! (reinstall, restore, clear data)

  // Foreground messages: NOT shown automatically on Android → show with flutter_local_notifications
  FirebaseMessaging.onMessage.listen((m) => localNotifications.show(m));
  // iOS foreground presentation:
  await fm.setForegroundNotificationPresentationOptions(alert: true, badge: true, sound: true);

  // User tapped notification while app in background:
  FirebaseMessaging.onMessageOpenedApp.listen((m) => router.go(m.data['route'] ?? '/'));
  // App launched from terminated state by tapping a notification:
  final initial = await fm.getInitialMessage();
  if (initial != null) router.go(initial.data['route'] ?? '/');

  await fm.subscribeToTopic('promotions');
}
```
### Platform setup checklist
* **Android 13+**: `POST_NOTIFICATIONS` runtime permission (requestPermission handles it). Create **notification channels** (Android 8+) — with `flutter_local_notifications` (importance levels, sound).
* Default notification icon must be **white-on-transparent** (else shows a grey square) — set `com.google.firebase.messaging.default_notification_icon` meta-data.
* **iOS**: enable Push Notifications + Background Modes (Remote notifications) capabilities; APNs key in Firebase; test on a **real device** (simulators support push in recent Xcode versions via `.apns` files / drag & drop, but end-to-end FCM delivery is best tested on device).
* iOS rich notifications (images) need a **Notification Service Extension**.

### Common push bugs
| Bug | Fix |
|---|---|
| No notifications on iOS | APNs key missing/wrong team, capability missing, testing on simulator, provisioning profile without push |
| Foreground notification doesn't appear (Android) | Expected — show via flutter_local_notifications |
| Background handler not called in release | Missing `@pragma('vm:entry-point')`, handler not top-level |
| Tap doesn't navigate on cold start | Handle `getInitialMessage` after router is ready |
| Duplicate notifications | Both FCM notification payload and your local notification shown — use data messages or don't re-show |
| Notifications stopped for some users | Stale tokens: update on `onTokenRefresh`; remove invalid tokens server-side (`UNREGISTERED` errors) |
| Xiaomi/Oppo/etc. kill background app | OEM battery optimizations; ask users to whitelist; high-priority messages |

Local notifications & scheduling: `flutter_local_notifications` (with `timezone` for zoned schedules; Android 12+ exact alarms permission `SCHEDULE_EXACT_ALARM`/`USE_EXACT_ALARM` restrictions). Alternatives: OneSignal, Airship, AWS SNS/Pinpoint.

---

## 18.5 Crash reporting & analytics

### Crashlytics
```dart
FlutterError.onError = FirebaseCrashlytics.instance.recordFlutterFatalError;
PlatformDispatcher.instance.onError = (error, stack) {
  FirebaseCrashlytics.instance.recordError(error, stack, fatal: true);
  return true;
};
await FirebaseCrashlytics.instance.setUserIdentifier(hashedUserId);  // no raw PII
FirebaseCrashlytics.instance.log('Checkout started');                // breadcrumbs
await FirebaseCrashlytics.instance.setCrashlyticsCollectionEnabled(!kDebugMode);
```
* **Obfuscated builds** (`--obfuscate --split-debug-info=build/symbols`) → upload symbols (`firebase crashlytics:symbols:upload --app=<id> build/symbols`) or stack traces are unreadable.
* iOS: dSYM upload (Crashlytics run script). Android NDK: native symbols if needed.
* Alternatives: **Sentry** (`sentry_flutter` — performance tracing, release health, breadcrumbs, session replay), Bugsnag, Datadog, Instabug.

### Analytics
```dart
await FirebaseAnalytics.instance.logEvent(name: 'add_to_cart', parameters: {'item_id': id, 'value': 499});
await FirebaseAnalytics.instance.logScreenView(screenName: 'Checkout');
// GoRouter/Navigator: FirebaseAnalyticsObserver(analytics: FirebaseAnalytics.instance)
```
Org practice: an `AnalyticsService` interface (so you can swap/multiplex providers: Firebase, Mixpanel, Amplitude, Segment), an **event taxonomy document** (naming conventions, required params), **consent** management (GDPR/ATT — iOS App Tracking Transparency prompt via `app_tracking_transparency` when tracking across apps).

### Remote Config & A/B testing & feature flags
```dart
final rc = FirebaseRemoteConfig.instance;
await rc.setConfigSettings(RemoteConfigSettings(fetchTimeout: const Duration(seconds: 10), minimumFetchInterval: const Duration(hours: 1)));
await rc.setDefaults({'new_checkout_enabled': false, 'min_supported_version': '1.0.0'});
await rc.fetchAndActivate();
final enabled = rc.getBool('new_checkout_enabled');
rc.onConfigUpdated.listen((_) => rc.activate());   // real-time updates
```
Uses: kill switches, gradual rollouts, **force update** (compare `min_supported_version` with `package_info_plus` version → show blocking update dialog / `in_app_update` on Android / App Store link on iOS). Alternatives: LaunchDarkly, Statsig, ConfigCat, Unleash.

Firebase Performance Monitoring (`firebase_performance`), In-App Messaging, App Distribution (beta builds to testers), Test Lab (device farm).

---

## 18.6 Supabase & other BaaS
`supabase_flutter`: Postgres + Row Level Security, Auth, Storage, Realtime, Edge Functions.
```dart
await Supabase.initialize(url: url, anonKey: anonKey);   // anon key is public; RLS protects data
final data = await Supabase.instance.client.from('todos').select().eq('done', false).order('created_at');
Supabase.instance.client.from('todos').stream(primaryKey: ['id']).listen(...);
```
Others: AWS Amplify, Appwrite, PocketBase, Parse, Back4App; Serverpod / Dart Frog (Dart backends).

---

## 18.7 Permissions (permission_handler)
```dart
final status = await Permission.camera.status;
if (status.isDenied) {
  final result = await Permission.camera.request();
  if (result.isPermanentlyDenied) {
    // Explain & send to settings
    await openAppSettings();
  }
}
// Others: Permission.location, locationAlways, photos, storage (legacy), notification, microphone, contacts, bluetoothScan…
```
Rules:
* **Declare** in AndroidManifest (`<uses-permission>`) and Info.plist usage descriptions — else instant crash (iOS) or silent denial.
* Ask **in context** (when the user taps "Scan"), with a **pre-permission explanation** screen — better grant rates and required by store policies.
* Handle all states: granted, denied, permanently denied (Android "don't ask again" / iOS after first denial), restricted (parental controls), limited (iOS limited photo access), provisional (iOS notifications).
* Android 13+: granular media permissions (`READ_MEDIA_IMAGES`, `READ_MEDIA_VIDEO`, ...); Android 14+ "selected photos" partial access; prefer the **Photo Picker** (`image_picker` uses it) which needs **no permission**.
* Background location requires a separate permission + strong justification for Play/App Store review.
* Remove unused permissions (plugins can merge permissions into your manifest — check the merged manifest; remove with `tools:node="remove"`).

---

## 18.8 Device features & popular plugins (know what exists)

| Need | Package(s) |
|---|---|
| Camera / photos | `image_picker`, `camera`, `image_cropper`, `photo_manager` |
| Video | `video_player` (official), `chewie`, `media_kit`, `better_player_plus` |
| Audio | `just_audio`, `audioplayers`, `audio_service` (background), `record` |
| Location / geofencing | `geolocator`, `location`, `geocoding`, `flutter_background_geolocation` (commercial) |
| Maps | `google_maps_flutter`, `flutter_map` (OpenStreetMap), `mapbox_maps_flutter`, Apple Maps (`apple_maps_flutter`) |
| QR/Barcode | `mobile_scanner` |
| Biometrics | `local_auth` |
| In-app web | `webview_flutter` (official), `flutter_inappwebview` |
| URLs / phone / email | `url_launcher` (add `<queries>` in Android manifest for intent visibility on Android 11+; `LSApplicationQueriesSchemes` on iOS for canLaunch) |
| Share | `share_plus` |
| Device info / app version | `device_info_plus`, `package_info_plus` |
| Connectivity | `connectivity_plus` |
| Sensors | `sensors_plus` |
| Bluetooth | `flutter_blue_plus`, `flutter_reactive_ble` |
| NFC | `nfc_manager` |
| PDF | `pdf` + `printing`, `syncfusion_flutter_pdfviewer`, `pdfrx` |
| Charts | `fl_chart`, `syncfusion_flutter_charts`, `graphic` |
| Payments | `in_app_purchase` (official), RevenueCat `purchases_flutter`, Stripe `flutter_stripe`, Razorpay `razorpay_flutter`, `pay` (Google Pay/Apple Pay) |
| Ads | `google_mobile_ads` |
| Contacts / calendar | `flutter_contacts`, `device_calendar` |
| Home widgets | `home_widget` (Android/iOS home screen widgets — native UI) |
| On-device ML / AI | `google_mlkit_*`, `tflite_flutter`, Firebase AI Logic (`firebase_ai`), `google_generative_ai` (deprecated in favour of Firebase AI Logic) |
| App review / update | `in_app_review`, `in_app_update`, `upgrader` |

### Payments: policy knowledge (interviews ask!)
* **Digital goods/subscriptions** consumed in the app (premium features, coins) → must use **Apple In-App Purchase / Google Play Billing** (store policies), with exceptions/regional changes (e.g., US court rulings in 2025 allowing external purchase links on iOS in the US, EU DMA alternatives, Google Play alternative billing in some regions). Know that rules changed and vary by region.
* **Physical goods/services** (e-commerce, food delivery, rides) → normal payment gateways (Stripe, Razorpay, PayPal).
* Always **verify purchases server-side** (receipts / Google Play Developer API / App Store Server API & notifications), handle pending/restored purchases, and `completePurchase` to avoid automatic refunds on Android (3 days un-acknowledged).

---

## 18.9 Background work
Flutter apps can't run arbitrary Dart forever in the background on mobile; the OS controls it.
| Need | Tool |
|---|---|
| Periodic/deferred work (sync, uploads) | `workmanager` (Android WorkManager; iOS BGTaskScheduler — iOS runs it opportunistically, not exact) |
| Background fetch | `background_fetch` |
| Long-running (music, navigation, tracking) | Foreground service (Android, with notification and **foreground service type** declarations required on Android 14+) — `flutter_foreground_task`; iOS background modes (audio, location) |
| Large downloads/uploads | `background_downloader` (uses URLSession / WorkManager) |
| Alarms | `android_alarm_manager_plus` (Android only) |
| Push-triggered | FCM data/silent push → background handler |

Background Dart code runs in a **separate isolate** with a fresh memory space — re-initialize Firebase/DI there; annotate entry points with `@pragma('vm:entry-point')`.

---

## 18.10 Interview Questions — Integrations

**Q1. How do push notifications work in Flutter?** FCM (via APNs on iOS) delivers messages; app requests permission, registers a token with backend; handle foreground (onMessage + local notification), background tap (onMessageOpenedApp), terminated tap (getInitialMessage), and background data handler (top-level, vm:entry-point).

**Q2. Notification vs data messages?** Notification messages are displayed by the OS when app isn't in foreground; data messages are handled by app code (and are throttled on iOS when silent).

**Q3. How do you secure Firestore?** Security Rules validating auth and data, App Check, least-privilege structure; client API keys aren't secrets.

**Q4. How do you implement force update?** Remote config / backend minimum version vs package_info version → blocking dialog to store (in_app_update on Android).

**Q5. How do you handle permissions properly?** Declare in manifests, request contextually with rationale, handle denied/permanently denied (open settings), use permissionless pickers when possible.

**Q6. How do you report crashes in release?** Crashlytics/Sentry with FlutterError.onError + PlatformDispatcher.onError, upload symbols for obfuscated builds, breadcrumbs, user IDs (hashed).

**Q7. What are the rules for in-app payments?** Digital content → store billing (IAP/Play Billing) with server-side verification; physical goods → regular payment gateways; regional rule variations exist.

**Q8. How do you run tasks in the background?** workmanager/BGTaskScheduler for deferred tasks, foreground services for long-running work, push-triggered handlers; separate isolate with re-initialization.

**Q9. Why does my background message handler not run in release?** It must be a top-level/static function annotated with `@pragma('vm:entry-point')` to survive tree shaking, and registered before runApp.

**Q10. Firebase vs Supabase?** Firebase: NoSQL (Firestore), mature mobile SDKs, FCM, Crashlytics; Supabase: Postgres SQL with RLS, open-source, relational queries, realtime; choose based on data model and vendor needs.
