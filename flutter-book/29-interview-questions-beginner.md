# Chapter 29 — Interview Question Bank, Part 1: Freshers & Junior (0–2 years)

> How to use: read the question, answer **out loud** in your own words, then compare. Answers are written the way a strong candidate would say them — short first, then detail. Questions come from commonly reported company interviews (service companies, product startups, MNCs) and community question banks, updated for Dart 3 / Flutter 3.x.

---

## A. Flutter basics

**1. What is Flutter?**
Google's open-source UI toolkit for building natively compiled apps for mobile, web, desktop and embedded from a single Dart codebase. It uses its own rendering engine (Impeller/Skia) to draw every pixel, so UI is consistent across platforms.

**2. What language does Flutter use and why?**
Dart — supports JIT (hot reload) and AOT (fast release code), has a GC optimised for short-lived objects, sound null safety, isolates for concurrency, and is controlled by Google, evolving with Flutter.

**3. What are the advantages of Flutter?**
Single codebase, fast development with hot reload, expressive custom UI, near-native performance (AOT), consistent look across platforms, rich widget catalog, strong tooling (DevTools), growing ecosystem, multi-platform (mobile/web/desktop).

**4. Disadvantages?**
Larger app size, non-native widgets need emulation of platform look, web not SEO-friendly, some platform features need native code/plugins, plugin quality varies.

**5. What is a widget?**
An immutable description of part of the UI. Everything in Flutter UI is built from widgets — layout, styling, gestures, even the app.

**6. Stateless vs Stateful widget?**
Stateless: no mutable state, rebuilds only when parent/inherited data changes. Stateful: has a `State` object that persists across rebuilds and can call `setState` to update UI.

**7. When would you use a StatelessWidget?**
When the UI depends only on constructor parameters/inherited widgets — e.g., a label, an icon button that receives a callback, a product card receiving a product.

**8. What is `setState`?**
A method on `State` that runs a callback and marks the widget dirty so it rebuilds in the next frame.

**9. What is the `build` method?**
Returns the widget tree describing the UI for the current state; called often, so it must be fast and side-effect free.

**10. What is `BuildContext`?**
A reference to the widget's location in the tree (the Element), used to find ancestors like Theme, MediaQuery, Navigator.

**11. What is hot reload? Hot restart?**
Hot reload injects code changes into the running app and rebuilds UI while preserving state. Hot restart restarts the app's Dart code from `main()`, losing state.

**12. What is `main()` and `runApp()`?**
`main()` is the Dart entry point; `runApp()` inflates the root widget and attaches it to the screen.

**13. What is `MaterialApp`?**
A convenience widget that sets up Material design: theme, navigation (Navigator), localization, MediaQuery, ScaffoldMessenger, etc.

**14. What is `Scaffold`?**
Basic Material page layout: app bar, body, floating action button, drawer, bottom navigation, snackbars/bottom sheets.

**15. What is `Container`?**
A convenience widget combining padding, margin, decoration, constraints, alignment and transform.

**16. Container vs SizedBox?**
SizedBox is lightweight, for fixed size or spacing, and const-friendly; Container is heavier and used when you need decoration/padding/etc.

**17. Row vs Column?**
Row lays children horizontally, Column vertically. Both are Flex widgets with main/cross axis alignment.

**18. What is `mainAxisAlignment` and `crossAxisAlignment`?**
Alignment along the main axis (Row: horizontal) and the perpendicular cross axis.

**19. What is Expanded? Flexible?**
Expanded makes a child fill remaining space in a Row/Column (tight). Flexible lets a child take up to its share of space but be smaller (loose).

**20. What is a Stack?**
A widget layering children on top of each other; `Positioned` places children relative to the edges.

**21. What is `pubspec.yaml`?**
Project manifest: name, version, SDK constraints, dependencies, assets, fonts.

**22. How do you add a package?**
`flutter pub add name` or add to `dependencies` in pubspec then `flutter pub get`, then import it.

**23. How do you add images?**
Put them in `assets/`, declare in pubspec under `flutter: assets:`, and use `Image.asset('assets/x.png')`.

**24. How do you load a network image?**
`Image.network(url)` (or `cached_network_image` for caching), with loading and error builders.

**25. What is `ListView`?**
A scrollable list of widgets; `ListView.builder` builds items lazily for long lists.

**26. Difference between `ListView` and `ListView.builder`?**
Default constructor builds all children immediately; builder creates items on demand as they scroll into view.

**27. What is `GridView`?**
A scrollable 2D grid; `GridView.builder` with a grid delegate (`crossAxisCount` or `maxCrossAxisExtent`).

**28. What is `SingleChildScrollView`?**
Makes a single child scrollable (e.g., a form) — builds the whole child at once.

**29. What is `TextField`? How do you read its value?**
An input widget; read via a `TextEditingController` (`controller.text`) or the `onChanged` callback.

**30. How do you validate a form?**
Use `Form` with a `GlobalKey<FormState>`, `TextFormField` validators, and call `formKey.currentState!.validate()`.

**31. How do you navigate between screens?**
`Navigator.push(context, MaterialPageRoute(builder: (_) => NextPage()))` and `Navigator.pop(context)`; or named routes / go_router.

**32. How do you pass data to another screen?**
Through the constructor of the next screen's widget.

**33. How do you get data back from a screen?**
`final result = await Navigator.push(...)`, and in the second screen `Navigator.pop(context, value)`.

**34. What is a SnackBar and how do you show it?**
A brief message at the bottom: `ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Hi')))`.

**35. How do you show a dialog?**
`showDialog(context: context, builder: (_) => AlertDialog(...))`.

**36. What is `GestureDetector`?**
A widget that detects gestures (tap, double tap, long press, drag, scale) on its child.

**37. InkWell vs GestureDetector?**
InkWell shows Material ripple feedback (needs a Material ancestor); GestureDetector has no visual feedback but supports more gestures.

**38. What is `Theme`?**
Defines colours, typography and component styles for the app; read via `Theme.of(context)`.

**39. How do you implement dark mode?**
Provide `theme` and `darkTheme` to MaterialApp with `themeMode: ThemeMode.system` (or user choice).

**40. What is `MediaQuery`?**
Provides screen/window info: size, padding (notch), text scale, orientation, brightness.

**41. What is `SafeArea`?**
Adds padding to avoid notches, status bars and system UI.

**42. What is `Padding` and `EdgeInsets`?**
Padding adds space around a child; EdgeInsets defines amounts (`all`, `symmetric`, `only`).

**43. What is a `Key`?**
An identifier to preserve state of widgets when they move in the tree, e.g., list items being reordered.

**44. What is the `const` keyword used for in Flutter?**
Creates compile-time constant widgets/objects, reused across rebuilds, improving performance.

**45. What is `final` vs `const`?**
final: assigned once at runtime; const: compile-time constant, deeply immutable.

**46. What is null safety?**
Types are non-nullable by default; nullable types use `?`; prevents null reference errors at compile time.

**47. What are `?`, `!`, `??`, `?.` operators?**
Nullable type marker, null assertion, if-null default, null-aware member access.

**48. What is `async`/`await`?**
Syntax to write asynchronous code that waits for Futures without blocking the thread.

**49. What is a Future?**
An object representing a value (or error) that will be available later.

**50. What is a Stream?**
A sequence of asynchronous events/values over time.

**51. What is FutureBuilder?**
A widget that builds UI based on the latest snapshot of a Future (waiting, data, error).

**52. What is StreamBuilder?**
Builds UI from the latest value of a Stream.

**53. What are packages vs plugins?**
Packages are Dart code; plugins include platform-specific native code.

**54. What is `flutter doctor`?**
A command that checks your environment setup and lists missing dependencies.

**55. What are debug, profile, release modes?**
Debug (JIT, hot reload, slower), profile (AOT with profiling), release (AOT, optimised for users).

**56. How do you build an APK / app bundle?**
`flutter build apk --release` / `flutter build appbundle`.

**57. What is the `assets` folder used for?**
Bundled files like images, fonts, JSON config.

**58. What is `Material Design` and `Cupertino`?**
Google's and Apple's design languages; Flutter provides widgets for both.

**59. What is `AppBar`?**
Top toolbar with title, leading and action widgets.

**60. What is `BottomNavigationBar` / `NavigationBar`?**
Tab bars at the bottom for top-level navigation (NavigationBar is the Material 3 version).

**61. What is `Drawer`?**
A side panel menu opened from the edge or via the hamburger icon.

**62. What is `TabBar` and `TabBarView`?**
Tabs with swipeable pages, coordinated by a TabController (often DefaultTabController).

**63. What is `Icon` and where are icons from?**
Widget for vector icons from fonts like `Icons` (Material) or `CupertinoIcons`.

**64. What is `Text.rich` / `RichText`?**
Text with multiple styles via TextSpans.

**65. What is `Wrap`?**
Lays children in a row/column and wraps to the next line when out of space.

**66. What is `Align` / `Center`?**
Position a child within itself; Center is Align with center alignment.

**67. What is `AspectRatio`?**
Sizes a child to a specific width:height ratio.

**68. How do you make a widget clickable?**
Wrap with GestureDetector/InkWell or use a button widget.

**69. How do you disable a button?**
Pass `onPressed: null`.

**70. What is `CircularProgressIndicator`?**
A spinner indicating loading.

**71. What is `initState` used for?**
One-time initialization when the State is created: controllers, subscriptions, initial loads.

**72. What is `dispose` used for?**
Cleanup: disposing controllers, cancelling subscriptions/timers.

**73. What is `didChangeDependencies`?**
Called after initState and whenever inherited dependencies change.

**74. What is `didUpdateWidget`?**
Called when the parent rebuilds with a new widget configuration.

**75. What is the widget tree?**
The hierarchical structure of widgets forming the UI.

**76. What is `debugShowCheckedModeBanner`?**
MaterialApp flag to hide the "DEBUG" ribbon.

**77. What is the difference between `Navigator.push` and `Navigator.pushReplacement`?**
push adds on top (can go back); pushReplacement replaces current screen (can't go back to it).

**78. How do you clear the navigation stack (e.g., after logout)?**
`Navigator.pushAndRemoveUntil(context, route, (r) => false)`.

**79. What is `SharedPreferences`?**
Key-value persistent storage for small simple data like settings.

**80. How do you make an HTTP request?**
With `http` or `dio` packages: `await http.get(Uri.parse(url))`, then `jsonDecode(response.body)`.

**81. How do you parse JSON?**
`jsonDecode` to a Map/List, then `Model.fromJson(map)` factories (manual or json_serializable).

**82. What is `Visibility` widget?**
Shows/hides a child, optionally maintaining state/size.

**83. What is `Opacity`?**
Makes a child partially transparent.

**84. What is `Hero` widget?**
Animates a shared widget between two screens.

**85. What is `AnimatedContainer`?**
A Container that animates changes to its properties automatically.

**86. What is `Spacer`?**
An empty Expanded widget to push siblings apart in Row/Column.

**87. What is `Divider`?**
A thin horizontal line separator.

**88. What is `Card`?**
A Material panel with rounded corners and elevation.

**89. What is `ListTile`?**
A fixed-height row with leading, title, subtitle, trailing — used in lists.

**90. What is `Checkbox`, `Switch`, `Radio`, `Slider`?**
Selection controls, each with a value and `onChanged` callback.

**91. What's the difference between `Image.asset` and `AssetImage`?**
Image.asset is a widget; AssetImage is an ImageProvider (used with `Image(image:)`, `DecorationImage`, CircleAvatar).

**92. What is `ClipRRect`?**
Clips a child with rounded corners.

**93. What is `BoxDecoration`?**
Defines background colour, gradient, image, border, radius and shadows for a box.

**94. What is the `Flutter Inspector`?**
DevTools tool to view the widget tree, layout, and debug UI.

**95. What file is the entry point of a Flutter app?**
`lib/main.dart` by default (configurable with `-t`).

**96. How do you change the app name and icon?**
Android: `android:label` in AndroidManifest + mipmap icons; iOS: `CFBundleDisplayName` in Info.plist + AppIcon; or packages like flutter_launcher_icons.

**97. What is `Orientation` / how to lock orientation?**
`SystemChrome.setPreferredOrientations([DeviceOrientation.portraitUp])` after ensureInitialized.

**98. How do you get the screen width?**
`MediaQuery.sizeOf(context).width`.

**99. What is `LayoutBuilder`?**
Builds widgets based on parent constraints (for responsive designs).

**100. What is `State management`?**
How app data that changes is stored, updated and reflected in the UI (setState, Provider, Riverpod, Bloc...).

---

## B. Dart basics (fresher level)

**101. What are Dart's basic data types?** int, double, num, String, bool, List, Set, Map, Runes, Symbol, Null, Record.

**102. `var` vs `dynamic`?** var infers a fixed type; dynamic disables type checking.

**103. What is string interpolation?** `'Hello $name'`, `'${user.name}'`.

**104. What is a List / Set / Map?** Ordered collection with duplicates / unique items / key-value pairs.

**105. What are named parameters?** Parameters passed by name in `{}`; can be `required` or have defaults.

**106. What are optional positional parameters?** In `[]`, optional by position.

**107. What is an arrow function?** `=> expr` shorthand for a function returning one expression.

**108. What is an anonymous function?** A function without a name, e.g., `(x) => x * 2`.

**109. What is a class and object?** A blueprint and its instance.

**110. What is a constructor? Named constructor?** Special method to create objects; named constructors give alternative creation paths (`Point.origin()`).

**111. What is inheritance?** A class extending another to reuse/override behavior (`extends`).

**112. What is an abstract class?** Cannot be instantiated; can declare abstract methods for subclasses.

**113. What is an interface in Dart?** Every class implicitly defines an interface; use `implements`.

**114. What is a mixin?** A reusable set of members added to a class with `with`.

**115. What is `static`?** Class-level members not tied to instances.

**116. What is an enum?** A fixed set of named values; enhanced enums can have fields and methods.

**117. What is `try/catch/finally`?** Exception handling blocks.

**118. What is a getter/setter?** Computed property accessors (`get`/`set`).

**119. What does `_` prefix mean?** Private to the library (file).

**120. What is `late`?** Non-nullable variable initialized later or lazily.

**121. What is the cascade operator `..`?** Chain multiple operations on the same object.

**122. What is the spread operator `...`?** Inserts elements of a collection into another.

**123. What is `typedef`?** A type alias.

**124. What is `assert`?** Debug-only check that throws if false.

**125. What is `is` and `as`?** Type test and type cast.

**126. What's `map`, `where`, `reduce`, `fold` on lists?** Transform, filter, combine (non-empty), combine with initial value.

**127. What is a generic?** Type parameter allowing reusable type-safe code (`List<int>`).

**128. What is `toString()` override for?** Readable string representation for debugging.

**129. What is `==` and `hashCode`?** Equality operator and hash used in sets/maps; override both for value equality.

**130. What is `required` keyword?** Marks named parameters mandatory.

---

## C. Short practical tasks freshers are asked
* Build a counter app (Chapter 1).
* Build a login form with validation (Chapter 8).
* Fetch and show a list of users from `https://jsonplaceholder.typicode.com/users` with loading/error states (Chapter 32 has a full solution).
* Build a to-do list with add/delete/complete and persistence (Chapter 32).
* Explain the output of a given layout (why overflow happens).
* Swap two variables, reverse a string, check palindrome, find duplicates in a list, FizzBuzz in Dart (Chapter 32).

## D. Tips for fresher interviews
* Explain with small examples; draw the widget tree.
* Mention `const`, keys, disposing controllers and `mounted` checks — shows maturity.
* Have 1–2 personal projects on GitHub with clean code, README, screenshots, and tests.
* Be honest about what you don't know; describe how you'd find out (docs, DevTools, experiments).
