# Chapter 11 — Navigation & Routing: Navigator 1.0, Navigator 2.0, go_router, Deep Links

> **Goal:** Move between screens correctly, pass and return data, handle back buttons (Android predictive back!), nested navigation with bottom tabs, authentication redirects, deep links and web URLs.

---

## 11.1 5-year-old picture: a stack of plates 🍽️

The **Navigator** keeps screens like a **stack of plates**. Opening a new screen = **put a plate on top** (`push`). Going back = **take the top plate off** (`pop`). You only see the top plate.

```
push(Details)        pop()
┌─────────┐          
│ Details │ ← top     
├─────────┤          ┌─────────┐
│  Home   │          │  Home   │
└─────────┘          └─────────┘
```

---

## 11.2 Navigator 1.0 (imperative)

### Push and pop
```dart
// Push a new route
Navigator.of(context).push(
  MaterialPageRoute(builder: (context) => DetailsPage(id: item.id)),
);
// Shorthand
Navigator.push(context, MaterialPageRoute(builder: (_) => const SettingsPage()));

// Pop (go back)
Navigator.of(context).pop();
Navigator.pop(context);
Navigator.maybePop(context);          // pops only if possible
Navigator.canPop(context);
```
`MaterialPageRoute` gives platform-appropriate transitions; `CupertinoPageRoute` gives iOS swipe-back transition; `PageRouteBuilder` for custom transitions; `fullscreenDialog: true` for modal pages (slide-up, close "X").

### Passing data forward
Via constructor (type-safe — best):
```dart
Navigator.push(context, MaterialPageRoute(builder: (_) => DetailsPage(product: product)));
```

### Returning data back ↩️
```dart
// Screen A
final selected = await Navigator.push<Color>(
  context,
  MaterialPageRoute(builder: (_) => const ColorPickerPage()),
);
if (!context.mounted) return;
if (selected != null) setState(() => _color = selected);

// Screen B (ColorPickerPage)
onTap: () => Navigator.pop(context, Colors.red),
```
`selected` is `null` if the user pressed system back.

### Replacing & clearing the stack
```dart
Navigator.pushReplacement(context, MaterialPageRoute(builder: (_) => const HomePage())); // replace current (e.g., after splash)
Navigator.pushAndRemoveUntil(                                                            // e.g., after login/logout
  context,
  MaterialPageRoute(builder: (_) => const LoginPage()),
  (route) => false,          // remove ALL previous routes
);
Navigator.popUntil(context, (route) => route.isFirst);         // back to first
Navigator.popUntil(context, ModalRoute.withName('/home'));
```

### Named routes (legacy-ish)
```dart
MaterialApp(
  initialRoute: '/',
  routes: {
    '/': (_) => const HomePage(),
    '/details': (_) => const DetailsPage(),
  },
  onGenerateRoute: (settings) {       // for routes needing arguments/parsing
    if (settings.name == '/product') {
      final id = settings.arguments as String;
      return MaterialPageRoute(builder: (_) => ProductPage(id: id), settings: settings);
    }
    return null;
  },
  onUnknownRoute: (_) => MaterialPageRoute(builder: (_) => const NotFoundPage()),
);
Navigator.pushNamed(context, '/product', arguments: 'p42');
final args = ModalRoute.of(context)!.settings.arguments;
```
The Flutter team **no longer recommends named routes** for most apps: arguments aren't type-safe, deep link behaviour can't be customised, and they don't support the browser forward button well. Use a router package (go_router) instead.

### Navigating without BuildContext
```dart
final navigatorKey = GlobalKey<NavigatorState>();
MaterialApp(navigatorKey: navigatorKey, ...);
navigatorKey.currentState?.pushNamed('/login');   // e.g., from interceptor on 401
```
Use carefully — prefer routing state (go_router redirect) for auth flows.

### Route lifecycle observing
```dart
class LoggingObserver extends NavigatorObserver {
  @override
  void didPush(Route route, Route? previousRoute) => analytics.logScreen(route.settings.name);
  @override
  void didPop(Route route, Route? previousRoute) {}
}
MaterialApp(navigatorObservers: [LoggingObserver(), routeObserver]);
```
`RouteAware` + `RouteObserver<ModalRoute>` lets a screen know when it becomes visible again (`didPopNext`) — e.g., refresh data when returning.

---

## 11.3 Back button handling: `PopScope` (WillPopScope is deprecated)

Android 14+ introduced **predictive back** (preview of the previous screen while swiping). The system must know **in advance** whether back is allowed, so the old `WillPopScope` (async decision) was **deprecated in Flutter 3.12+** and replaced with `PopScope`:

```dart
PopScope<Object?>(
  canPop: !_hasUnsavedChanges,                       // decided in advance
  onPopInvokedWithResult: (didPop, result) async {   // Flutter 3.24+ (replaces onPopInvoked)
    if (didPop) return;                              // already popped
    final leave = await showDialog<bool>(
      context: context,
      builder: (c) => AlertDialog(
        title: const Text('Discard changes?'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(c, false), child: const Text('Stay')),
          TextButton(onPressed: () => Navigator.pop(c, true), child: const Text('Discard')),
        ],
      ),
    );
    if (leave == true && context.mounted) Navigator.pop(context);
  },
  child: const EditForm(),
);
```
* `canPop: false` blocks the back gesture/button and calls `onPopInvokedWithResult(didPop: false)`.
* For predictive back animations on Android, `PredictiveBackPageTransitionsBuilder` in the theme and `android:enableOnBackInvokedCallback="true"` in the manifest (the default behaviour changes with targetSdk 35/36 — predictive back is enabled by default for apps targeting Android 15+/16).
* "Double back to exit" pattern: `canPop: false` + track last back press time + `SystemNavigator.pop()`.

---

## 11.4 Navigator 2.0 (declarative Router API)

Navigator 2.0 (introduced in Flutter 1.22) lets you set the **whole page stack as a function of app state**, and syncs with the platform (browser URL, deep links).

Pieces:
* **`Page`** — immutable description of a route (`MaterialPage`, `CupertinoPage`, custom `Page`).
* **`Navigator(pages: [...], onDidRemovePage: ...)`** — declarative stack. (`onPopPage` was deprecated in 3.24 in favour of `onDidRemovePage`.)
* **`Router`** — coordinates:
  * **`RouteInformationProvider`** — gets route info (URL) from OS/browser.
  * **`RouteInformationParser`** — parses URL ↔ your app's route configuration (typed).
  * **`RouterDelegate`** — builds the `Navigator` with pages from app state; notifies on change; handles `setNewRoutePath` (deep link) and `currentConfiguration` (URL update).
  * **`BackButtonDispatcher`** — Android back button.

Minimal declarative example:
```dart
class _AppState extends State<App> {
  Book? _selected;
  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      home: Navigator(
        pages: [
          MaterialPage(key: const ValueKey('list'), child: BookList(onTap: (b) => setState(() => _selected = b))),
          if (_selected != null) MaterialPage(key: ValueKey(_selected), child: BookDetails(book: _selected!)),
        ],
        onDidRemovePage: (page) {
          if (page.key == ValueKey(_selected)) setState(() => _selected = null);
        },
      ),
    );
  }
}
```
Implementing RouterDelegate/Parser by hand is verbose and error-prone → teams use **go_router** (official, maintained by the Flutter team), or **auto_route** (codegen), or **beamer**.

Interview: *"Navigator 1.0 vs 2.0?"* → 1.0 is imperative push/pop; 2.0 is declarative (pages from state), supports deep linking/web URLs/browser history, and complex nested navigation, but is complex; router packages build on 2.0. They can coexist (go_router uses Navigator 2.0 and still allows `Navigator.push` for dialogs).

---

## 11.5 go_router — the standard choice 🧭

```yaml
dependencies:
  go_router: ^x.y.z    # check pub.dev for latest
```

### Basic setup
```dart
final router = GoRouter(
  initialLocation: '/',
  debugLogDiagnostics: true,
  routes: [
    GoRoute(
      path: '/',
      name: 'home',
      builder: (context, state) => const HomePage(),
      routes: [                               // nested (child) routes → stacked on parent
        GoRoute(
          path: 'product/:id',                // → /product/42
          name: 'product',
          builder: (context, state) {
            final id = state.pathParameters['id']!;
            final tab = state.uri.queryParameters['tab'];   // /product/42?tab=reviews
            final extra = state.extra as Product?;            // object (NOT in URL; lost on web refresh/deep link)
            return ProductPage(id: id, initialTab: tab, preloaded: extra);
          },
        ),
      ],
    ),
    GoRoute(path: '/login', builder: (_, __) => const LoginPage()),
  ],
  errorBuilder: (context, state) => NotFoundPage(error: state.error),
);

void main() => runApp(MaterialApp.router(routerConfig: router));
```

### Navigating
```dart
context.go('/product/42');               // GO to location: replaces stack to match URL hierarchy (/, /product/42)
context.push('/product/42');             // PUSH on top of current stack (returns Future for result)
context.goNamed('product', pathParameters: {'id': '42'}, queryParameters: {'tab': 'reviews'});
context.pushNamed('product', pathParameters: {'id': '42'}, extra: product);
context.pop();                           // or context.pop(result)
context.replace('/x');  context.pushReplacement('/x');
context.canPop();
final result = await context.push<bool>('/confirm');
```
**`go` vs `push`** (very common interview question):
* `go` **navigates to a URL**; the page stack becomes whatever the route hierarchy for that URL defines (sub-routes stacked on parents). Previous stack outside that hierarchy is discarded. Browser URL updates.
* `push` **adds a page on top** of the current stack (like Navigator.push), regardless of hierarchy. Good for "detail on top of current context" and awaiting results.

### Redirects & authentication guard
```dart
final router = GoRouter(
  refreshListenable: authNotifier,       // re-run redirect when auth state changes (ChangeNotifier / Listenable)
  redirect: (context, state) {
    final loggedIn = authNotifier.isLoggedIn;
    final loggingIn = state.matchedLocation == '/login';
    if (!loggedIn && !loggingIn) {
      return '/login?from=${Uri.encodeComponent(state.uri.toString())}';  // remember where to go back
    }
    if (loggedIn && loggingIn) return state.uri.queryParameters['from'] ?? '/';
    return null;                          // no redirect
  },
  routes: [...],
);
```
Per-route `redirect:` also available. Avoid redirect loops (go_router throws after a limit, `redirectLimit` default 5).

For Riverpod/Bloc: expose auth state as a `Listenable` (e.g., a `ValueNotifier` updated by a stream listener, or the `GoRouterRefreshStream` pattern).

### ShellRoute & StatefulShellRoute (bottom navigation with nested stacks)
```dart
GoRouter(routes: [
  StatefulShellRoute.indexedStack(
    builder: (context, state, navigationShell) => ScaffoldWithNavBar(navigationShell: navigationShell),
    branches: [
      StatefulShellBranch(routes: [
        GoRoute(path: '/home', builder: (_, __) => const HomeTab(), routes: [
          GoRoute(path: 'details/:id', builder: (_, s) => DetailsPage(id: s.pathParameters['id']!)),
        ]),
      ]),
      StatefulShellBranch(routes: [
        GoRoute(path: '/profile', builder: (_, __) => const ProfileTab()),
      ]),
    ],
  ),
]);

class ScaffoldWithNavBar extends StatelessWidget {
  const ScaffoldWithNavBar({super.key, required this.navigationShell});
  final StatefulNavigationShell navigationShell;
  @override
  Widget build(BuildContext context) => Scaffold(
    body: navigationShell,                       // IndexedStack of branch navigators — each keeps its own stack & state
    bottomNavigationBar: NavigationBar(
      selectedIndex: navigationShell.currentIndex,
      onDestinationSelected: (i) => navigationShell.goBranch(i, initialLocation: i == navigationShell.currentIndex), // tap active tab → pop to root
      destinations: const [
        NavigationDestination(icon: Icon(Icons.home), label: 'Home'),
        NavigationDestination(icon: Icon(Icons.person), label: 'Profile'),
      ],
    ),
  );
}
```
`ShellRoute` (non-stateful) wraps routes in a common UI (e.g., persistent bottom bar) with one nested navigator but doesn't preserve each tab's stack.

Showing a full-screen page **above** the bottom bar from inside a branch: give the route `parentNavigatorKey: rootNavigatorKey`.

### Type-safe routes
`go_router_builder` generates typed route classes:
```dart
@TypedGoRoute<ProductRoute>(path: '/product/:id')
class ProductRoute extends GoRouteData with $ProductRoute {   // (mixin name depends on go_router_builder version)
  const ProductRoute({required this.id});
  final String id;
  @override
  Widget build(BuildContext context, GoRouterState state) => ProductPage(id: id);
}
const ProductRoute(id: '42').go(context);
```

### Custom transitions
```dart
GoRoute(
  path: '/modal',
  pageBuilder: (context, state) => CustomTransitionPage(
    key: state.pageKey,
    child: const ModalPage(),
    transitionsBuilder: (context, animation, secondary, child) =>
        FadeTransition(opacity: animation, child: child),
  ),
);
```

### go_router gotchas
* `extra` is not serialized into the URL: lost on web refresh, deep links, and process death restoration (unless you provide an `extraCodec`). Prefer path/query params with IDs and fetch data.
* `context.go` inside `initState`/build → schedule after frame or use redirect.
* Don't create the `GoRouter` inside `build` (recreated → navigation state lost). Create once (top-level final, or in a provider).
* Using `Navigator.push` alongside go_router works but those pages aren't URL-addressable.
* Breaking changes happen in major versions — read the changelog when upgrading (e.g., `GoRouterState.location` → `uri`, `queryParams` → `uri.queryParameters`, `params` → `pathParameters`).

### auto_route (alternative)
Code-generated, strongly typed routes (`context.router.push(ProductRoute(id: '42'))`), nested routers, guards (`AutoRouteGuard`), tabs (`AutoTabsRouter`). Popular in large codebases.

---

## 11.6 Deep links & App Links / Universal Links 🔗

**Deep link** = a URL that opens a specific screen in your app, e.g., `https://shop.example.com/product/42` or `myshop://product/42`.

| Type | Example | Verified ownership? | Opens app directly? |
|---|---|---|---|
| Custom scheme | `myshop://product/42` | ❌ (any app can claim) | Shows chooser / may conflict |
| Android App Links | `https://...` | ✅ via `assetlinks.json` | ✅ |
| iOS Universal Links | `https://...` | ✅ via `apple-app-site-association` | ✅ |

### Android setup
`android/app/src/main/AndroidManifest.xml` inside `<activity ...MainActivity>`:
```xml
<intent-filter android:autoVerify="true">
  <action android:name="android.intent.action.VIEW" />
  <category android:name="android.intent.category.DEFAULT" />
  <category android:name="android.intent.category.BROWSABLE" />
  <data android:scheme="https" android:host="shop.example.com" />
</intent-filter>
```
Host `https://shop.example.com/.well-known/assetlinks.json` with your package name and **SHA-256 signing certificate fingerprints** (both upload key and **Play App Signing key** — a common mistake is only adding the debug/upload key!).

Flutter's built-in deep link handling is controlled by `<meta-data android:name="flutter_deeplinking_enabled" android:value="true" />` (enabled by default in recent Flutter versions). If you use a third-party deep link plugin (e.g., `app_links`, Firebase Dynamic Links legacy, Branch), you may need to **disable** Flutter's handling to avoid double handling.

Test: `adb shell am start -a android.intent.action.VIEW -c android.intent.category.BROWSABLE -d "https://shop.example.com/product/42" com.example.shop`.

### iOS setup
* Xcode → Signing & Capabilities → **Associated Domains** → `applinks:shop.example.com`.
* Host `https://shop.example.com/.well-known/apple-app-site-association` (JSON, no extension, served as `application/json`, HTTPS, no redirects) listing `TEAMID.bundleId` and paths.
* `Info.plist`: `FlutterDeepLinkingEnabled` = YES (for Flutter's handler; default in recent versions).
* Test: `xcrun simctl openurl booted "https://shop.example.com/product/42"`.

### With go_router
Once platform setup is done, the URL path is passed to the router, which matches `/product/42` → ProductPage automatically, including on cold start. Make sure your redirect logic (auth) preserves the deep link target (`?from=`).

DevTools has a **Deep Links validator** tool to check Android/iOS config.

Note: **Firebase Dynamic Links was shut down (August 2025)** — teams migrated to App Links/Universal Links directly or to providers like Branch, AppsFlyer OneLink, Adjust.

---

## 11.7 Web URLs
* URL strategy: default is **hash** (`/#/product/42`) historically; use path URLs:
```dart
import 'package:flutter_web_plugins/url_strategy.dart';
void main() { usePathUrlStrategy(); runApp(...); }
```
(go_router: path strategy also via this.) Server must rewrite all routes to `index.html` (SPA fallback), or refreshes give 404.
* Browser back/forward works with Router API / go_router.

---

## 11.8 Navigation architecture best practices (org level)
1. **Single source of truth** for routes: a `router.dart` with route constants or typed routes.
2. Pass **IDs**, not big objects, between screens (deep-linkable, restoration-safe); load data in the destination via repository/cache.
3. Centralize **auth guards** in redirect; never sprinkle "if not logged in push login" in screens.
4. Keep navigation **out of business logic** where possible: logic emits state/events, UI layer navigates (or use a navigation service abstraction for testability).
5. Track screens for analytics with a `NavigatorObserver`.
6. Handle **unknown routes** (404 page).
7. Test deep links on cold start, warm start, logged-out state.
8. Restoration: `restorationScopeId` in MaterialApp and `RestorableProperty` / go_router restoration for Android process death.

---

## 11.9 Common navigation bugs
| Bug | Cause | Fix |
|---|---|---|
| "Navigator operation requested with a context that does not include a Navigator" | context above MaterialApp | use context below MaterialApp / navigatorKey |
| Black screen after pop | popped the last route | check `canPop`; use `maybePop`; don't pop root |
| Dialog pop closes the page instead | used page context with nested navigators / popped twice | pop with dialog's context; `useRootNavigator` alignment |
| `setState` after navigating away | async continues | `mounted` checks |
| Double navigation on double tap | | debounce/disable button; go_router `go` is idempotent for same location |
| Back button exits app from tab | nested navigators not handling back | StatefulShellRoute / `NavigatorPopHandler` / PopScope |
| Deep link opens app but not the page | router not matching path / redirect swallowing it | debugLogDiagnostics, preserve `from` param |
| App Links open browser instead of app | assetlinks fingerprint missing (Play signing key) / autoVerify failed | fix assetlinks.json; `adb shell pm get-app-links <pkg>` |
| Page rebuilds/resets on keyboard open | Router/GoRouter created inside a widget that rebuilds (MediaQuery dependency) | create router once outside build |

---

## 11.10 Interview Questions — Navigation

**Q1. How does the Navigator work?** It manages a stack of `Route` objects (with an Overlay); push adds, pop removes; only top routes are visible.

**Q2. How do you pass data between screens and return results?** Constructor arguments forward; `Navigator.pop(context, result)` + `await Navigator.push` (or `context.pop(result)` with `await context.push`).

**Q3. Difference between `push`, `pushReplacement`, `pushAndRemoveUntil`?** Add on top; replace current; add and remove previous routes until predicate true (clear stack).

**Q4. What is Navigator 2.0?** Declarative Router API: pages list derived from app state, Router with RouteInformationParser/RouterDelegate syncing with platform URLs and deep links.

**Q5. go vs push in go_router?** go navigates to a location (stack defined by route hierarchy, URL-synced); push adds a page atop the current stack.

**Q6. How do you protect routes requiring login?** go_router `redirect` with `refreshListenable` bound to auth state (or auto_route guards).

**Q7. How do you keep separate navigation stacks per bottom tab?** `StatefulShellRoute.indexedStack` (go_router), nested Navigators with IndexedStack, or auto_route `AutoTabsRouter`.

**Q8. What replaced WillPopScope and why?** `PopScope` with `canPop` and `onPopInvokedWithResult`, because Android predictive back needs to know ahead of time whether pop is allowed.

**Q9. How do deep links work in Flutter?** Platform config (Android intent filters with App Links verification; iOS Associated Domains with AASA) delivers URL to Flutter's router which parses it into routes.

**Q10. How do you navigate without context (e.g., from a service)?** GlobalKey<NavigatorState> on MaterialApp, or router instance (`router.go(...)`), ideally through an abstraction.

**Q11. What is `RouteAware`?** Mixin to get notified when a route is pushed/popped relative to the current one (didPush, didPopNext...), via a RouteObserver.

**Q12. Why avoid passing objects via `extra`?** Not part of the URL — not restorable, not deep-linkable, lost on web refresh.
