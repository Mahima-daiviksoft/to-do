# Chapter 8 — The Widget Catalog: Text, Images, Buttons, Inputs, Forms, Scaffold, Dialogs & More

> **Goal:** Know the everyday widgets thoroughly — their important properties, gotchas, and the modern (Material 3) replacements for deprecated ones.

---

## 8.1 App shells: MaterialApp, CupertinoApp, WidgetsApp

```dart
MaterialApp(
  title: 'Shop',                        // used by OS task switcher (Android) / web tab
  debugShowCheckedModeBanner: false,    // hide DEBUG ribbon
  theme: lightTheme,
  darkTheme: darkTheme,
  themeMode: ThemeMode.system,          // .light/.dark/.system
  home: const HomePage(),               // OR routes / onGenerateRoute / router config
  routes: {'/settings': (_) => const SettingsPage()},
  navigatorKey: rootNavigatorKey,       // navigate without context
  scaffoldMessengerKey: messengerKey,   // show snackbars without context
  localizationsDelegates: AppLocalizations.localizationsDelegates,
  supportedLocales: AppLocalizations.supportedLocales,
  locale: const Locale('en'),
  builder: (context, child) => MediaQuery(           // wrap every route
    data: MediaQuery.of(context).copyWith(textScaler: TextScaler.noScaling), // (⚠️ accessibility — don't disable scaling casually)
    child: child!,
  ),
);
// With go_router or Navigator 2.0:
MaterialApp.router(routerConfig: router);
```
`MaterialApp` provides: `Navigator`, `Theme`, `MediaQuery`, `Localizations`, `Directionality`, `ScaffoldMessenger`, `DefaultTextStyle`, `Overlay`, `Shortcuts`/`Actions`, `HeroController`, etc. Many "No X ancestor found" errors mean you used something **above** MaterialApp.

---

## 8.2 Scaffold — the page skeleton 🦴

```dart
Scaffold(
  appBar: AppBar(
    title: const Text('Inbox'),
    centerTitle: true,
    leading: const BackButton(),            // usually automatic
    actions: [IconButton(icon: const Icon(Icons.search), onPressed: () {})],
    bottom: const TabBar(tabs: [...]),       // with DefaultTabController
    elevation: 0, scrolledUnderElevation: 3, // M3: tint when content scrolls under
  ),
  body: const InboxList(),
  floatingActionButton: FloatingActionButton.extended(
    onPressed: () {}, icon: const Icon(Icons.edit), label: const Text('Compose'),
  ),
  floatingActionButtonLocation: FloatingActionButtonLocation.endFloat,
  drawer: const AppDrawer(),          // left (start) drawer
  endDrawer: const FilterDrawer(),
  bottomNavigationBar: NavigationBar(  // M3 (BottomNavigationBar is M2 style)
    selectedIndex: index,
    onDestinationSelected: (i) => setState(() => index = i),
    destinations: const [
      NavigationDestination(icon: Icon(Icons.home_outlined), selectedIcon: Icon(Icons.home), label: 'Home'),
      NavigationDestination(icon: Icon(Icons.person_outline), label: 'Profile'),
    ],
  ),
  bottomSheet: null,
  backgroundColor: null,              // from theme
  resizeToAvoidBottomInset: true,     // shrink body when keyboard shows
  extendBody: false,                  // body behind bottom nav (for translucent bars)
  extendBodyBehindAppBar: false,
);
```

### Nested Scaffolds
Each route usually has its own Scaffold. Avoid Scaffold inside Scaffold body unless needed (e.g., tabs with own FAB); inner AppBars then don't handle status bar padding automatically.

---

## 8.3 Text & typography

```dart
Text(
  'Hello world',
  style: Theme.of(context).textTheme.bodyLarge?.copyWith(fontWeight: FontWeight.w600),
  textAlign: TextAlign.center,
  maxLines: 2,
  overflow: TextOverflow.ellipsis,   // .clip/.fade/.ellipsis/.visible
  softWrap: true,
  textScaler: TextScaler.linear(1.0), // usually leave default to respect user setting
  semanticsLabel: 'Greeting',
  selectionColor: null,
)

Text.rich(TextSpan(
  text: 'By continuing you agree to our ',
  children: [
    TextSpan(
      text: 'Terms',
      style: const TextStyle(decoration: TextDecoration.underline),
      recognizer: _tapRecognizer, // TapGestureRecognizer()..onTap = openTerms — create in initState & dispose!
    ),
    const TextSpan(text: '.'),
  ],
));

const SelectableText('Copy me');
SelectionArea(child: Column(children: [...]));   // make many Texts selectable (web/desktop)
DefaultTextStyle(style: ..., child: ...);         // default style for subtree
```
* `TextStyle` props: `fontSize`, `fontWeight`, `fontStyle`, `color`, `letterSpacing`, `wordSpacing`, `height` (line height multiplier), `decoration`, `fontFamily`, `fontFeatures` (tabular numbers: `FontFeature.tabularFigures()`), `shadows`, `overflow`, `leadingDistribution`.
* **Text scaling:** `textScaleFactor` is deprecated (Flutter 3.16) in favour of `TextScaler` (supports nonlinear scaling on Android 14+).
* `google_fonts` package downloads fonts at runtime (cache) or bundle them — for production, consider bundling (offline, GDPR/privacy reasons): `GoogleFonts.config.allowRuntimeFetching = false;` with font files in assets.

---

## 8.4 Images 🖼️

```dart
Image.asset('assets/images/logo.png', width: 120, fit: BoxFit.contain);
Image.network(
  url,
  fit: BoxFit.cover,
  loadingBuilder: (context, child, progress) =>
      progress == null ? child : const Center(child: CircularProgressIndicator()),
  errorBuilder: (context, error, stack) => const Icon(Icons.broken_image),
  cacheWidth: 300,                 // ⭐ decode at smaller size → saves LOTS of memory
);
Image.file(File(path));
Image.memory(bytes);
const FadeInImage.assetNetwork(placeholder: 'assets/ph.png', image: url);
```
* `BoxFit`: `fill` (stretch), `contain` (fit inside, letterbox), `cover` (fill & crop), `fitWidth`, `fitHeight`, `none`, `scaleDown`.
* **`cached_network_image`** package — disk caching of network images (standard in production apps).
* SVG: **`flutter_svg`** package (`SvgPicture.asset('assets/icon.svg')`). For performance, `vector_graphics` precompiles SVGs.
* `Image.network` keeps decoded images in `ImageCache` (memory, default 1000 images / 100 MB). Huge images at full resolution cause **OOM crashes** — use `cacheWidth/cacheHeight` or `ResizeImage`.
* `precacheImage(AssetImage('assets/hero.png'), context)` in `didChangeDependencies` to avoid flicker.
* `Ink.image` / `Ink` for images with ink splashes.
* `CircleAvatar(backgroundImage: NetworkImage(url))`.

---

## 8.5 Icons
```dart
const Icon(Icons.favorite, color: Colors.red, size: 24, semanticLabel: 'Favorite');
const Icon(CupertinoIcons.heart);       // import cupertino_icons
Icon(Icons.adaptive.share);             // platform-adaptive icon
```
Custom icon fonts via FlutterIcon.com / `IconData(0xe800, fontFamily: 'MyIcons')`. Material Symbols via `material_symbols_icons` package. Tree shaking of icon fonts happens in release (`--no-tree-shake-icons` disables; required if you construct `IconData` dynamically from non-const values).

---

## 8.6 Buttons (Material 3)

| Widget | Look | Use |
|---|---|---|
| `FilledButton` | solid fill | primary action (M3) |
| `FilledButton.tonal` | soft fill | secondary emphasis |
| `ElevatedButton` | raised with shadow/tint | when separation from patterned background needed |
| `OutlinedButton` | border | medium emphasis |
| `TextButton` | text only | low emphasis, dialogs |
| `IconButton` (+ `.filled`, `.filledTonal`, `.outlined`) | icon | toolbar actions |
| `FloatingActionButton` (`.small`, `.large`, `.extended`) | FAB | main screen action |
| `SegmentedButton` | segments | choose 1 or many options |
| `DropdownMenu` / `DropdownButton` | menu | choose one |
| `MenuAnchor`, `PopupMenuButton` | menus | overflow/context menus |
| `CupertinoButton` | iOS style | iOS UI |

Old `RaisedButton`, `FlatButton`, `OutlineButton` were **removed** (Flutter 2.x deprecated → removed in 3.x). Interviewers may ask: "What replaced RaisedButton?" → `ElevatedButton`.

```dart
FilledButton.icon(
  onPressed: isLoading ? null : submit,     // null onPressed = DISABLED
  icon: const Icon(Icons.send),
  label: const Text('Send'),
  style: FilledButton.styleFrom(
    minimumSize: const Size.fromHeight(48),
    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
  ),
);

// Per-state styling with WidgetStateProperty (was MaterialStateProperty before Flutter 3.19)
ButtonStyle(
  backgroundColor: WidgetStateProperty.resolveWith((states) {
    if (states.contains(WidgetState.disabled)) return Colors.grey;
    if (states.contains(WidgetState.pressed)) return Colors.blue.shade700;
    return Colors.blue;
  }),
);
```
**Disabling a button** = pass `onPressed: null`.

**Preventing double taps** (very common real bug: duplicate orders/payments): disable while loading, or guard with a flag:
```dart
bool _submitting = false;
Future<void> _submit() async {
  if (_submitting) return;
  setState(() => _submitting = true);
  try { await api.placeOrder(); } finally { if (mounted) setState(() => _submitting = false); }
}
```
(And the backend should be idempotent — use idempotency keys.)

### InkWell vs GestureDetector
* `InkWell` — Material ripple effect; needs a `Material` ancestor (else ripple is invisible/hidden behind a colored Container — wrap with `Material(color: ...)` or use `Ink` for decoration).
* `GestureDetector` — no visual feedback, many gestures (Chapter 13).

---

## 8.7 Text input — TextField & TextFormField ⌨️

```dart
class _LoginState extends State<Login> {
  final _emailCtrl = TextEditingController();
  final _focus = FocusNode();

  @override
  void dispose() {
    _emailCtrl.dispose();   // ❗ always dispose controllers & focus nodes
    _focus.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return TextField(
      controller: _emailCtrl,
      focusNode: _focus,
      keyboardType: TextInputType.emailAddress,
      textInputAction: TextInputAction.next,       // keyboard action button
      autofillHints: const [AutofillHints.email],   // password managers
      autocorrect: false,
      textCapitalization: TextCapitalization.none,
      obscureText: false,                            // true for passwords
      maxLength: 50,
      maxLines: 1,                                   // null = grows; minLines for multiline
      inputFormatters: [FilteringTextInputFormatter.deny(RegExp(r'\s'))],
      decoration: InputDecoration(
        labelText: 'Email',
        hintText: 'you@example.com',
        prefixIcon: const Icon(Icons.email),
        suffixIcon: IconButton(icon: const Icon(Icons.clear), onPressed: _emailCtrl.clear),
        border: const OutlineInputBorder(),
        errorText: _error,     // shows error state
        helperText: 'We never share it',
        counterText: '',       // hide maxLength counter
      ),
      onChanged: (value) {},
      onSubmitted: (_) => FocusScope.of(context).nextFocus(),
      onTapOutside: (_) => FocusScope.of(context).unfocus(),  // dismiss keyboard on outside tap
    );
  }
}
```
Common input formatters: `FilteringTextInputFormatter.digitsOnly`, `.allow(RegExp(...))`, `LengthLimitingTextInputFormatter(10)`, custom `TextInputFormatter` subclass for masks (phone, card) — or packages like `mask_text_input_formatter`.

Reading/writing controller:
```dart
_emailCtrl.text;                          // read
_emailCtrl.text = 'a@b.com';              // write (moves cursor to... careful)
_emailCtrl.value = TextEditingValue(text: t, selection: TextSelection.collapsed(offset: t.length));
_emailCtrl.addListener(() => print(_emailCtrl.text));
```

Hide keyboard: `FocusScope.of(context).unfocus()` or `FocusManager.instance.primaryFocus?.unfocus()`.
Programmatic focus: `_focus.requestFocus()`; autofocus: `autofocus: true`.

### Common TextField bugs
| Bug | Fix |
|---|---|
| Controller created in `build` → cursor jumps, text resets | Create in `initState` (or as field), dispose in `dispose` |
| TextField in Row → unbounded width error | Wrap in `Expanded` |
| Keyboard covers field | `Scaffold(resizeToAvoidBottomInset: true)` + scrollable body; `Scrollable.ensureVisible`; `scrollPadding` |
| Bottom overflow when keyboard opens | `SingleChildScrollView` |
| `setState` on every keystroke rebuilding whole form | Keep form in its own widget; use `ValueListenableBuilder` on controller |
| Losing text when list scrolls (TextField in ListView items) | Keep values in a model/state, not only in item widgets; or keys + AutomaticKeepAlive |
| Arabic/RTL cursor issues | Use `TextDirection`/`Directionality` & locale correctly |

---

## 8.8 Forms & validation ✅

```dart
class SignUpForm extends StatefulWidget {
  const SignUpForm({super.key});
  @override
  State<SignUpForm> createState() => _SignUpFormState();
}

class _SignUpFormState extends State<SignUpForm> {
  final _formKey = GlobalKey<FormState>();
  final _password = TextEditingController();
  String? _email;
  bool _agree = false;

  @override
  void dispose() { _password.dispose(); super.dispose(); }

  void _submit() {
    final form = _formKey.currentState!;
    if (!form.validate()) return;   // runs all validators, shows errors
    form.save();                    // calls onSaved for each field
    // call API with _email, _password.text
  }

  @override
  Widget build(BuildContext context) {
    return Form(
      key: _formKey,
      autovalidateMode: AutovalidateMode.onUserInteraction,  // validate as user types (after first interaction)
      child: Column(children: [
        TextFormField(
          decoration: const InputDecoration(labelText: 'Email'),
          keyboardType: TextInputType.emailAddress,
          validator: (v) {
            if (v == null || v.trim().isEmpty) return 'Email is required';
            if (!RegExp(r'^[^@\s]+@[^@\s]+\.[^@\s]+$').hasMatch(v)) return 'Enter a valid email';
            return null;   // null = valid
          },
          onSaved: (v) => _email = v!.trim(),
        ),
        TextFormField(
          controller: _password,
          obscureText: true,
          decoration: const InputDecoration(labelText: 'Password'),
          validator: (v) => (v ?? '').length < 8 ? 'At least 8 characters' : null,
        ),
        TextFormField(
          obscureText: true,
          decoration: const InputDecoration(labelText: 'Confirm password'),
          validator: (v) => v != _password.text ? 'Passwords do not match' : null,
        ),
        FormField<bool>(                      // custom form field (checkbox)
          initialValue: _agree,
          validator: (v) => v == true ? null : 'You must accept the terms',
          builder: (state) => Column(children: [
            CheckboxListTile(
              value: state.value,
              onChanged: (v) { state.didChange(v); _agree = v!; },
              title: const Text('I accept the terms'),
            ),
            if (state.hasError) Text(state.errorText!, style: TextStyle(color: Theme.of(context).colorScheme.error)),
          ]),
        ),
        FilledButton(onPressed: _submit, child: const Text('Sign up')),
      ]),
    );
  }
}
```
* `AutovalidateMode`: `disabled`, `always`, `onUserInteraction`, `onUnfocus` (added in recent Flutter 3.x releases).
* Server-side errors: keep a `String? _serverError` and pass via `InputDecoration(errorText:)`, or use `forceErrorText` on `FormField`/`TextFormField` (available in recent Flutter 3.x releases).
* `form.reset()` resets fields to initial values.
* Packages for complex forms: `flutter_form_builder`, `reactive_forms`, `formz` (validation models, used with Bloc).
* Wrap forms in `AutofillGroup` for password managers; call `TextInput.finishAutofillContext()` after login.

---

## 8.9 Selection controls

```dart
Checkbox(value: checked, onChanged: (v) => setState(() => checked = v!), tristate: false);
CheckboxListTile(value: x, onChanged: ..., title: const Text('Wi-Fi'));
Switch(value: on, onChanged: (v) => setState(() => on = v));
Switch.adaptive(...);                         // Cupertino on iOS
SwitchListTile(...);
Radio<Gender>(value: Gender.male, groupValue: g, onChanged: (v) => setState(() => g = v));
// Note: newer Flutter versions introduce RadioGroup to manage groupValue/onChanged — check your version.
Slider(value: v, min: 0, max: 100, divisions: 10, label: '${v.round()}', onChanged: ...);
RangeSlider(values: RangeValues(20, 80), onChanged: ...);
ChoiceChip(label: Text('S'), selected: size == 'S', onSelected: ...);
FilterChip(...); InputChip(...); ActionChip(...);
DropdownMenu<String>(
  dropdownMenuEntries: const [DropdownMenuEntry(value: 'in', label: 'India')],
  onSelected: (v) {},
);
DropdownButtonFormField<String>(items: [...], onChanged: ..., validator: ...);
```
Date & time pickers:
```dart
final date = await showDatePicker(
  context: context,
  initialDate: DateTime.now(),
  firstDate: DateTime(2000),
  lastDate: DateTime(2100),
);
final time = await showTimePicker(context: context, initialTime: TimeOfDay.now());
final range = await showDateRangePicker(context: context, firstDate: ..., lastDate: ...);
// iOS style: CupertinoDatePicker inside showCupertinoModalPopup
```

---

## 8.10 Dialogs, bottom sheets, snackbars, overlays 💬

### Dialogs
```dart
final confirmed = await showDialog<bool>(
  context: context,
  barrierDismissible: false,          // tap outside doesn't close
  builder: (dialogContext) => AlertDialog(
    title: const Text('Delete item?'),
    content: const Text('This cannot be undone.'),
    actions: [
      TextButton(onPressed: () => Navigator.pop(dialogContext, false), child: const Text('Cancel')),
      FilledButton(onPressed: () => Navigator.pop(dialogContext, true), child: const Text('Delete')),
    ],
  ),
);
if (confirmed == true) { ... }  // could be null if dismissed
```
* Dialogs are **routes** pushed on the Navigator → `Navigator.pop(context, result)` returns a value.
* Use the **dialog's own context** (`dialogContext`) to pop, especially with nested navigators.
* `showAdaptiveDialog` + `AlertDialog.adaptive` for iOS look.
* `SimpleDialog`, `Dialog` (custom content), `Dialog.fullscreen`.
* `showGeneralDialog` for custom transitions.
* Use `useRootNavigator: true` (default for showDialog) to show above nested navigators (bottom nav tabs).

### Bottom sheets
```dart
final choice = await showModalBottomSheet<String>(
  context: context,
  isScrollControlled: true,       // allow > half screen & keyboard handling
  showDragHandle: true,
  useSafeArea: true,
  builder: (ctx) => Padding(
    padding: EdgeInsets.only(bottom: MediaQuery.viewInsetsOf(ctx).bottom), // above keyboard
    child: const ShareOptions(),
  ),
);
// Draggable heights:
DraggableScrollableSheet(initialChildSize: 0.4, minChildSize: 0.2, maxChildSize: 0.9,
  builder: (ctx, scrollController) => ListView(controller: scrollController, children: ...));
// Persistent: Scaffold.of(context).showBottomSheet(...)
```

### SnackBars
```dart
ScaffoldMessenger.of(context).showSnackBar(
  SnackBar(
    content: const Text('Item deleted'),
    action: SnackBarAction(label: 'UNDO', onPressed: undo),
    behavior: SnackBarBehavior.floating,
    duration: const Duration(seconds: 4),
  ),
);
ScaffoldMessenger.of(context).hideCurrentSnackBar();
```
`Scaffold.of(context).showSnackBar` was **removed** — use `ScaffoldMessenger` (snackbars survive route changes). For showing snackbars from non-UI code (e.g., a service), use a `GlobalKey<ScaffoldMessengerState>` on MaterialApp.

Also: `MaterialBanner` (`showMaterialBanner`), toasts via packages (`fluttertoast`, `toastification`).

### Tooltips, popups & overlays
```dart
const Tooltip(message: 'Add item', child: Icon(Icons.add));
PopupMenuButton<String>(itemBuilder: (_) => [const PopupMenuItem(value: 'edit', child: Text('Edit'))], onSelected: ...);
MenuAnchor(menuChildren: [...], builder: (context, controller, child) => IconButton(onPressed: controller.open, ...));
```
`Overlay` / `OverlayEntry` / **`OverlayPortal`** (Flutter 3.10+, declarative overlay tied to widget tree) for custom popups like autocomplete dropdowns; `CompositedTransformTarget` + `CompositedTransformFollower` to anchor overlays to widgets. `Autocomplete<T>` widget built-in.

---

## 8.11 Lists & tiles (intro — scrolling deep dive in Chapter 9)

```dart
ListTile(
  leading: const CircleAvatar(child: Text('A')),
  title: const Text('Asha'),
  subtitle: const Text('Last seen 2m ago'),
  trailing: const Icon(Icons.chevron_right),
  onTap: () {},
  dense: false,
  contentPadding: const EdgeInsets.symmetric(horizontal: 16),
);
const Divider(height: 1);
Card(child: ListTile(...));
ExpansionTile(title: const Text('FAQ'), children: [const Text('Answer')]);
Dismissible(
  key: ValueKey(item.id),             // REQUIRED unique key
  direction: DismissDirection.endToStart,
  background: Container(color: Colors.red),
  confirmDismiss: (dir) async => await askConfirm(),
  onDismissed: (_) => setState(() => items.remove(item)), // MUST remove from data or error:
  child: ListTile(title: Text(item.title)),               // "A dismissed Dismissible widget is still part of the tree."
);
ReorderableListView(onReorder: (oldI, newI) {...}, children: [for (final i in items) ListTile(key: ValueKey(i.id), ...)]);
```

---

## 8.12 Progress, feedback & misc
```dart
const CircularProgressIndicator();
const LinearProgressIndicator(value: 0.4);     // determinate
CircularProgressIndicator.adaptive();
RefreshIndicator(onRefresh: () async => await reload(), child: ListView(...)); // pull to refresh (child must be scrollable & AlwaysScrollableScrollPhysics if few items)
const Badge(label: Text('3'), child: Icon(Icons.notifications));
Chip(label: const Text('Flutter'), onDeleted: () {});
Stepper(steps: [...]);
TabBar + TabBarView + DefaultTabController(length: 3, child: ...);
NavigationRail(...); NavigationDrawer(...);
SearchAnchor / SearchBar (M3 search);
Placeholder();   // draws a box with an X — scaffolding
```
`HapticFeedback.lightImpact()`, `SystemSound.play(SystemSoundType.click)`, `Clipboard.setData(ClipboardData(text: 'x'))`, `SystemChrome.setPreferredOrientations([...])`, `SystemChrome.setSystemUIOverlayStyle(...)` / `AnnotatedRegion<SystemUiOverlayStyle>` for status bar icon colours.

---

## 8.13 Cupertino (iOS-style) widgets

`CupertinoApp`, `CupertinoPageScaffold`, `CupertinoNavigationBar`, `CupertinoSliverNavigationBar` (large titles), `CupertinoTabScaffold`/`CupertinoTabBar`, `CupertinoButton`, `CupertinoSwitch`, `CupertinoSlider`, `CupertinoTextField`, `CupertinoAlertDialog`, `CupertinoActionSheet`, `CupertinoDatePicker`, `CupertinoPicker`, `CupertinoActivityIndicator`, `CupertinoContextMenu`, `CupertinoListSection`/`CupertinoListTile`, `CupertinoPageRoute` (swipe-back), `CupertinoSegmentedControl`/`CupertinoSlidingSegmentedControl`, `CupertinoSearchTextField`.

Adaptive approach: Material widgets with `.adaptive` constructors (`Switch.adaptive`, `Slider.adaptive`, `CircularProgressIndicator.adaptive`, `AlertDialog.adaptive`, `Checkbox.adaptive`), or branch on `Theme.of(context).platform` / `defaultTargetPlatform`.

---

## 8.14 Interview Questions — Common widgets

**Q1. What replaced `RaisedButton`/`FlatButton`/`OutlineButton`?** `ElevatedButton`/`TextButton`/`OutlinedButton` (and M3 adds `FilledButton`).

**Q2. How do you disable a button?** Set `onPressed: null`.

**Q3. How do you validate a form?** Wrap fields in `Form` with a `GlobalKey<FormState>`, give `TextFormField`s `validator`s returning error strings or null, and call `formKey.currentState!.validate()`.

**Q4. TextField vs TextFormField?** `TextFormField` wraps `TextField` in a `FormField`, integrating with `Form` (validator, onSaved, reset, autovalidate).

**Q5. Why must controllers be disposed?** They hold listeners/resources (and for TextEditingController, platform text input connections); not disposing leaks memory.

**Q6. How do you return data from a dialog?** `Navigator.pop(context, value)` and `await showDialog<T>(...)`.

**Q7. ScaffoldMessenger vs Scaffold.of for snackbars?** ScaffoldMessenger (root-level, persists across routes) replaced Scaffold.showSnackBar.

**Q8. InkWell ripple not visible — why?** InkWell needs a `Material` ancestor and draws on it; an opaque `Container` color between hides the ink. Use `Material`/`Ink` for colour.

**Q9. How do you prevent images from consuming too much memory?** `cacheWidth`/`cacheHeight`/`ResizeImage`, appropriately sized server images, caching packages, limit ImageCache size.

**Q10. What is `Dismissible` and its common error?** Swipe-to-dismiss widget requiring a unique key; after `onDismissed` you must remove the item from the data list, else "A dismissed Dismissible widget is still part of the tree".

**Q11. How do you show a bottom sheet that resizes with the keyboard?** `showModalBottomSheet(isScrollControlled: true)` + bottom padding = `MediaQuery.viewInsetsOf(context).bottom`.

**Q12. What's `WidgetStateProperty`?** (Previously `MaterialStateProperty`) a way to resolve style values based on interaction states (pressed, hovered, focused, disabled, selected, error).

**Q13. How do you make text selectable?** `SelectableText` or wrap in `SelectionArea`.

**Q14. How do you dismiss the keyboard?** `FocusScope.of(context).unfocus()` / `FocusManager.instance.primaryFocus?.unfocus()`, `onTapOutside`, or `keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag` on scroll views.
