# Chapter 37 — State Restoration, Custom Slivers & Advanced Widgets (Tables, Overlays, Search, Stepper, Autocomplete)

> **Goal:** Make apps survive Android process death without losing the user's work. Understand how slivers lay out by writing one. Master the "enterprise" widgets used in dashboards and admin apps: data tables, 2D tables, overlays/dropdowns, search and multi-step forms.

---

# Part A — State Restoration ♻️

## 37.1 5-year-old picture
You're drawing, and Mom says "bath time!" and takes your paper away (the OS kills the app to free memory). When you come back, a good mom gives you **your same drawing back**, not a blank page. **State restoration** is that mom.

## 37.2 Why it matters
On Android (and sometimes iOS), when your app is in the background and the device needs memory, the OS **kills the process**. When the user returns from the recent apps list, Android recreates the app and expects it to look **as they left it**: same screen, same scroll position, same typed text. Without restoration, Flutter starts from `main()` again with fresh state. The user lands on the home screen and their half-filled form is gone. Common real cases:
* The user opens the camera app or a payment app (UPI, bank 3DS page) from your app, and your app gets killed meanwhile.
* Low-end devices with many apps open.

**Test it:** Android **Developer options → "Don't keep activities"**, or `adb shell am kill <package>` while the app is in the background. Then reopen it from Recents.

## 37.3 How it works
* `MaterialApp(restorationScopeId: 'app')` turns on restoration for the app and its Navigator.
* Each widget that wants to restore state uses **`RestorationMixin`**, defines a **`restorationId`**, and registers **`RestorableProperty`** objects in `restoreState`.
* Data is saved into a **`RestorationBucket`** tree. The engine sends it to the OS (`onSaveInstanceState` on Android, NSCoder on iOS) and gets it back on relaunch.
* Only small, serializable data belongs here (IDs, scroll offsets, text, selected tab). **Do not** put large data or secrets in it. Load data again from the repository using the restored IDs.

## 37.4 Restoring a counter, a text field and a tab
```dart
class App extends StatelessWidget {
  const App({super.key});
  @override
  Widget build(BuildContext context) =>
      const MaterialApp(restorationScopeId: 'app', home: EditProfilePage());
}

class EditProfilePage extends StatefulWidget {
  const EditProfilePage({super.key});
  @override
  State<EditProfilePage> createState() => _EditProfilePageState();
}

class _EditProfilePageState extends State<EditProfilePage>
    with RestorationMixin, SingleTickerProviderStateMixin {
  // Built-in restorable types: RestorableInt, RestorableDouble, RestorableBool, RestorableString,
  // RestorableDateTime, RestorableTextEditingController, RestorableEnum, nullable variants (RestorableIntN, …)
  final RestorableTextEditingController _name = RestorableTextEditingController();
  final RestorableTextEditingController _bio = RestorableTextEditingController();
  final RestorableInt _tab = RestorableInt(0);
  final RestorableBool _agreed = RestorableBool(false);

  // A TabController we own: listener added ONCE (never inside build)
  late final TabController _tabs = TabController(length: 2, vsync: this)
    ..addListener(() => _tab.value = _tabs.index);

  @override
  String get restorationId => 'edit_profile';     // unique among siblings in its restoration scope

  @override
  void restoreState(RestorationBucket? oldBucket, bool initialRestore) {
    registerForRestoration(_name, 'name');
    registerForRestoration(_bio, 'bio');
    registerForRestoration(_tab, 'tab');
    registerForRestoration(_agreed, 'agreed');
    _tabs.index = _tab.value;                     // apply the restored tab
    // initialRestore == true → values just came back from the OS.
    // If there is nothing saved, the defaults above stay. Load server data now if needed:
    if (_name.value.text.isEmpty) _loadFromServerIfEmpty();
  }

  void _loadFromServerIfEmpty() { /* fetch the profile, then set _name.value.text = ... */ }

  @override
  void dispose() {
    _tabs.dispose();
    _name.dispose();      // ❗ restorable properties must be disposed
    _bio.dispose();
    _tab.dispose();
    _agreed.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Edit profile'),
        bottom: TabBar(controller: _tabs, tabs: const [Tab(text: 'Basic'), Tab(text: 'More')]),
      ),
      body: TabBarView(controller: _tabs, children: [
        ListView(padding: const EdgeInsets.all(16), children: [
          TextField(controller: _name.value, decoration: const InputDecoration(labelText: 'Name')),
          CheckboxListTile(
            value: _agreed.value,
            onChanged: (v) => setState(() => _agreed.value = v ?? false),
            title: const Text('Show profile publicly'),
          ),
        ]),
        ListView(padding: const EdgeInsets.all(16), children: [
          TextField(controller: _bio.value, maxLines: 5, decoration: const InputDecoration(labelText: 'Bio')),
        ]),
      ]),
    );
  }
}
```

## 37.5 Restoring navigation
Routes pushed with plain `Navigator.push` are **not** restorable, because closures can't be serialized. Use the restorable APIs with a **static** route builder and serializable arguments:
```dart
// Push
Navigator.restorablePush(context, _detailsRouteBuilder, arguments: productId);

// MUST be a static or top-level function
@pragma('vm:entry-point')
static Route<void> _detailsRouteBuilder(BuildContext context, Object? arguments) {
  return MaterialPageRoute<void>(builder: (_) => ProductDetailsPage(id: arguments! as String));
}
// Also: restorablePushNamed, restorablePushReplacement, restorablePopAndPushNamed …
// Dialogs: showDialog is not restorable → use Navigator.restorablePush with DialogRoute / RawDialogRoute.
```
* **go_router**: set `restorationScopeId` on `GoRouter` (and `MaterialApp.router`). Pages restore from the URL/location. Path parameters restore; **`extra` objects need an `extraCodec`** to be restorable (Chapter 11).
* Scroll positions: give scrollables a `restorationId` (`ListView(restorationId: 'feed')`) inside a restoration scope.
* Custom types: subclass `RestorableValue<T>` (implement `createDefaultValue`, `fromPrimitives`, `toPrimitives`, `didUpdateValue`), or `RestorableListenable`.
* Testing: `await tester.restartAndRestore();` in widget tests (with `restorationScopeId` set) simulates the save → kill → restore cycle. Also `tester.getRestorationData()` / `restoreFrom(data)`.

## 37.6 Alternatives & complements
* Persist drafts (form data) to local storage as the user types (debounced). This also survives the user swiping the app away, which restoration does **not** cover.
* Hydrated state management (`hydrated_bloc`, Riverpod offline persistence) for app-level state.
* Restore the user's **context** (which screen) through routing restoration, and their **data** through repositories.

---

# Part B — Writing a Custom Sliver (to really understand slivers) 🥓

## 37.7 The sliver protocol recap
* **In:** `SliverConstraints`
  * `scrollOffset`: how far this sliver's start has scrolled past the viewport's leading edge
  * `remainingPaintExtent`: how much visible space is left
  * `crossAxisExtent`
  * `overlap`: pinned headers above you
  * `cacheOrigin`/`remainingCacheExtent`
  * `axisDirection`, `growthDirection`, `userScrollDirection`
* **Out:** `SliverGeometry`
  * `scrollExtent`: total scrollable length of this sliver
  * `paintExtent`: how much it paints now (≤ remainingPaintExtent)
  * `layoutExtent`: how much space it uses before the next sliver (defaults to paintExtent)
  * `maxPaintExtent`
  * `hitTestExtent`
  * `paintOrigin`: draw offset; negative values allow overlap effects
  * `cacheExtent`, `hasVisualOverflow`

## 37.8 Example: how `SliverToBoxAdapter` really works
This is essentially the framework's own implementation (`RenderSliverToBoxAdapter`). Reading it teaches you the protocol:
```dart
class MySliverBox extends SingleChildRenderObjectWidget {
  const MySliverBox({super.key, required Widget super.child});
  @override
  RenderMySliverBox createRenderObject(BuildContext context) => RenderMySliverBox();
}

class RenderMySliverBox extends RenderSliverSingleBoxAdapter {
  @override
  void performLayout() {
    if (child == null) {
      geometry = SliverGeometry.zero;
      return;
    }
    final constraints = this.constraints;
    // 1. Lay out the box child with box constraints: cross axis = viewport width, main axis unbounded
    child!.layout(constraints.asBoxConstraints(), parentUsesSize: true);
    final childExtent = switch (constraints.axis) {
      Axis.horizontal => child!.size.width,
      Axis.vertical => child!.size.height,
    };
    // 2. How much of [0, childExtent] is visible given the current scroll offset?
    final paintedChildSize = calculatePaintOffset(constraints, from: 0.0, to: childExtent);
    final cacheExtent = calculateCacheOffset(constraints, from: 0.0, to: childExtent);
    // 3. Report geometry
    geometry = SliverGeometry(
      scrollExtent: childExtent,
      paintExtent: paintedChildSize,
      cacheExtent: cacheExtent,
      maxPaintExtent: childExtent,
      hitTestExtent: paintedChildSize,
      hasVisualOverflow: childExtent > constraints.remainingPaintExtent || constraints.scrollOffset > 0.0,
    );
    // 4. Position the child (negative offset when partially scrolled off the top)
    setChildParentData(child!, constraints, geometry!);
  }
}
// Usage: CustomScrollView(slivers: [MySliverBox(child: Text('Hello')), SliverList(...)])
```

## 37.9 Example: a sliver that fades its child as it scrolls away
Building on the same class, override `paint` to apply opacity based on the scroll offset:
```dart
class RenderFadingSliverBox extends RenderMySliverBox {
  @override
  bool get alwaysNeedsCompositing => child != null;   // we push an OpacityLayer (same idea as RenderOpacity)

  @override
  void paint(PaintingContext context, Offset offset) {
    if (child == null || geometry == null || !geometry!.visible) {
      layer = null;
      return;
    }
    final extent = geometry!.scrollExtent;
    final progress = extent == 0 ? 0.0 : (constraints.scrollOffset / extent).clamp(0.0, 1.0);
    final alpha = ((1 - progress) * 255).round();
    final childParentData = child!.parentData! as SliverPhysicalParentData;
    layer = context.pushOpacity(
      offset,
      alpha,
      (context, offset) => context.paintChild(child!, offset + childParentData.paintOffset),
      oldLayer: layer as OpacityLayer?,      // reuse the layer between frames
    );
  }
}
```
The sliver is laid out again on every scroll, so `paint` runs with the new `scrollOffset` and the fade updates automatically. (Create a widget class whose `createRenderObject` returns `RenderFadingSliverBox`, just like `MySliverBox`.) For most pinned/floating headers, **don't** write render slivers. Use `SliverPersistentHeader`, `PinnedHeaderSliver`, `SliverFloatingHeader`, `SliverResizingHeader` or `SliverLayoutBuilder`:
```dart
SliverLayoutBuilder(
  builder: (context, constraints) {
    final collapsed = constraints.scrollOffset > 120;
    return SliverToBoxAdapter(child: AnimatedOpacity(opacity: collapsed ? 0 : 1, duration: const Duration(milliseconds: 200), child: const Header()));
  },
);
```

---

# Part C — Data tables 📊

## 37.10 `DataTable` (small tables) with sorting & selection
```dart
class OrdersTable extends StatefulWidget {
  const OrdersTable({super.key, required this.orders});
  final List<Order> orders;
  @override
  State<OrdersTable> createState() => _OrdersTableState();
}

class _OrdersTableState extends State<OrdersTable> {
  late List<Order> _rows = [...widget.orders];
  int? _sortColumn;
  bool _ascending = true;
  final _selected = <String>{};

  void _sort<T extends Comparable<T>>(T Function(Order o) key, int column, bool asc) {
    setState(() {
      _rows.sort((a, b) => asc ? key(a).compareTo(key(b)) : key(b).compareTo(key(a)));
      _sortColumn = column;
      _ascending = asc;
    });
  }

  @override
  Widget build(BuildContext context) {
    return SingleChildScrollView(                 // horizontal scroll for wide tables
      scrollDirection: Axis.horizontal,
      child: DataTable(
        sortColumnIndex: _sortColumn,
        sortAscending: _ascending,
        showCheckboxColumn: true,
        columns: [
          DataColumn(label: const Text('Order'), onSort: (i, asc) => _sort((o) => o.id, i, asc)),
          DataColumn(label: const Text('Customer'), onSort: (i, asc) => _sort((o) => o.customer, i, asc)),
          DataColumn(label: const Text('Total'), numeric: true, onSort: (i, asc) => _sort((o) => o.total, i, asc)),
          const DataColumn(label: Text('Status')),
        ],
        rows: [
          for (final o in _rows)
            DataRow(
              key: ValueKey(o.id),
              selected: _selected.contains(o.id),
              onSelectChanged: (v) => setState(() => v! ? _selected.add(o.id) : _selected.remove(o.id)),
              cells: [
                DataCell(Text(o.id)),
                DataCell(Text(o.customer)),
                DataCell(Text('₹${o.total.toStringAsFixed(2)}')),
                DataCell(Chip(label: Text(o.status))),
              ],
            ),
        ],
      ),
    );
  }
}
```
⚠️ `DataTable` builds **all rows** at once. It's fine for tens of rows, but slow for thousands.

## 37.11 `PaginatedDataTable` (pages of rows)
```dart
class OrdersSource extends DataTableSource {
  OrdersSource(this.orders);
  final List<Order> orders;

  @override
  DataRow? getRow(int index) {
    if (index >= orders.length) return null;
    final o = orders[index];
    return DataRow.byIndex(index: index, cells: [DataCell(Text(o.id)), DataCell(Text(o.customer)), DataCell(Text('${o.total}'))]);
  }

  @override
  int get rowCount => orders.length;
  @override
  bool get isRowCountApproximate => false;   // true when the server total is unknown
  @override
  int get selectedRowCount => 0;
}

PaginatedDataTable(
  header: const Text('Orders'),
  rowsPerPage: 10,
  availableRowsPerPage: const [10, 25, 50],
  onRowsPerPageChanged: (v) => setState(() => _rowsPerPage = v!),
  onPageChanged: (firstRowIndex) => _maybeFetchMore(firstRowIndex),   // load server pages lazily
  columns: const [DataColumn(label: Text('Order')), DataColumn(label: Text('Customer')), DataColumn(label: Text('Total'), numeric: true)],
  source: OrdersSource(orders),
);
```
When the data changes, call `notifyListeners()` on the source (`DataTableSource` is a `ChangeNotifier`).

## 37.12 Huge 2D tables: `TableView` (`two_dimensional_scrollables`, official)
It builds lazily in **both directions**, supports pinned header rows and columns, and handles very large grids such as spreadsheets:
```dart
import 'package:two_dimensional_scrollables/two_dimensional_scrollables.dart';

TableView.builder(
  rowCount: 10000,
  columnCount: 50,
  pinnedRowCount: 1,           // sticky header row
  pinnedColumnCount: 1,        // sticky first column
  columnBuilder: (index) => TableSpan(
    extent: FixedTableSpanExtent(index == 0 ? 160 : 100),
    foregroundDecoration: const TableSpanDecoration(border: TableSpanBorder(trailing: BorderSide(color: Colors.black12))),
  ),
  rowBuilder: (index) => TableSpan(
    extent: const FixedTableSpanExtent(44),
    backgroundDecoration: TableSpanDecoration(color: index.isEven ? Colors.black.withValues(alpha: 0.03) : null),
  ),
  cellBuilder: (context, vicinity) => TableViewCell(
    child: Padding(
      padding: const EdgeInsets.symmetric(horizontal: 8),
      child: Align(
        alignment: Alignment.centerLeft,
        child: Text(vicinity.row == 0 ? 'Col ${vicinity.column}' : 'R${vicinity.row}C${vicinity.column}'),
      ),
    ),
  ),
);
```
The same package has `TreeView` for hierarchical rows. Other options: `data_table_2` (a DataTable with fixed headers), `syncfusion_flutter_datagrid` and `pluto_grid`/`trina_grid` (feature-rich grids with editing, filtering and export; check licenses).

---

# Part D — Overlays, dropdowns & search 🪟

## 37.13 `OverlayPortal`: a custom anchored dropdown
```dart
class AnchoredMenu extends StatefulWidget {
  const AnchoredMenu({super.key, required this.items, required this.onSelected});
  final List<String> items;
  final ValueChanged<String> onSelected;
  @override
  State<AnchoredMenu> createState() => _AnchoredMenuState();
}

class _AnchoredMenuState extends State<AnchoredMenu> {
  final _portal = OverlayPortalController();
  final _link = LayerLink();
  final _groupId = Object();           // tapping either the button or the menu doesn't count as "outside"

  @override
  Widget build(BuildContext context) {
    return OverlayPortal(
      controller: _portal,
      overlayChildBuilder: (context) => CompositedTransformFollower(
        link: _link,
        targetAnchor: Alignment.bottomLeft,       // stick the menu's top-left to the button's bottom-left
        followerAnchor: Alignment.topLeft,
        offset: const Offset(0, 4),
        child: Align(
          alignment: AlignmentDirectional.topStart,   // the overlay gives full-screen constraints → let the menu size itself
          child: TapRegion(
            groupId: _groupId,
            onTapOutside: (_) => _portal.hide(),
            child: Material(
              elevation: 6,
              borderRadius: BorderRadius.circular(8),
              child: ConstrainedBox(
                constraints: const BoxConstraints(maxHeight: 240, minWidth: 180),
                child: ListView(
                  shrinkWrap: true,
                  padding: EdgeInsets.zero,
                  children: [
                    for (final item in widget.items)
                      ListTile(
                        dense: true,
                        title: Text(item),
                        onTap: () {
                          _portal.hide();
                          widget.onSelected(item);
                        },
                      ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
      child: CompositedTransformTarget(
        link: _link,
        child: TapRegion(
          groupId: _groupId,
          child: OutlinedButton.icon(
            onPressed: _portal.toggle,
            icon: const Icon(Icons.arrow_drop_down),
            label: const Text('Choose'),
          ),
        ),
      ),
    );
  }
}
```
Why `OverlayPortal` instead of `OverlayEntry`? The overlay child is part of **your widget tree**, so it inherits Theme, Provider/Riverpod scopes and Localizations, and it rebuilds with your state. There is no manual insert/remove, and nothing leaks when the widget is disposed. Use `MenuAnchor` / `DropdownMenu` first if they fit your design.

## 37.14 `SearchAnchor` + `SearchBar` (Material 3 search)
```dart
SearchAnchor(
  builder: (context, controller) => SearchBar(
    controller: controller,
    hintText: 'Search products',
    leading: const Icon(Icons.search),
    onTap: controller.openView,
    onChanged: (_) => controller.openView(),
  ),
  suggestionsBuilder: (context, controller) async {     // can be async → fetch from the API
    final query = controller.text.trim();
    if (query.isEmpty) return recentSearches.map((s) => ListTile(leading: const Icon(Icons.history), title: Text(s), onTap: () => controller.closeView(s)));
    final results = await api.searchSuggestions(query); // ⚠️ add debounce/cancel for real apps (wrap in your own debouncer)
    return results.map((r) => ListTile(title: Text(r.name), onTap: () {
      controller.closeView(r.name);
      context.push('/product/${r.id}');
    }));
  },
);
```
`SearchAnchor.bar(...)` is a shortcut. For a full-screen search page, use `showSearch` with a `SearchDelegate` (the older API, still valid).

## 37.15 `Autocomplete` (inline suggestions under a text field)
```dart
Autocomplete<City>(
  displayStringForOption: (c) => c.name,
  optionsBuilder: (TextEditingValue value) {
    if (value.text.isEmpty) return const Iterable<City>.empty();
    return cities.where((c) => c.name.toLowerCase().startsWith(value.text.toLowerCase()));
  },
  onSelected: (city) => debugPrint('Selected ${city.name}'),
  fieldViewBuilder: (context, controller, focusNode, onSubmit) => TextField(
    controller: controller,
    focusNode: focusNode,
    decoration: const InputDecoration(labelText: 'City'),
  ),
);
```
`optionsBuilder` may return a `Future` for async suggestions. Use `RawAutocomplete` for full control of the options layout.

## 37.16 `Stepper` (multi-step forms / onboarding / checkout)
```dart
class CheckoutStepper extends StatefulWidget {
  const CheckoutStepper({super.key});
  @override
  State<CheckoutStepper> createState() => _CheckoutStepperState();
}

class _CheckoutStepperState extends State<CheckoutStepper> {
  int _step = 0;
  final _formKeys = [GlobalKey<FormState>(), GlobalKey<FormState>()];

  bool _validateCurrent() => _step >= _formKeys.length || _formKeys[_step].currentState!.validate();

  @override
  Widget build(BuildContext context) {
    return Stepper(
      currentStep: _step,
      type: StepperType.vertical,                    // .horizontal for wide screens
      onStepContinue: () {
        if (!_validateCurrent()) return;
        if (_step < 2) setState(() => _step++); else _placeOrder();
      },
      onStepCancel: _step == 0 ? null : () => setState(() => _step--),
      onStepTapped: (i) { if (i < _step) setState(() => _step = i); },   // only allow going back
      controlsBuilder: (context, details) => Row(children: [
        FilledButton(onPressed: details.onStepContinue, child: Text(_step == 2 ? 'Place order' : 'Next')),
        const SizedBox(width: 8),
        if (details.onStepCancel != null) TextButton(onPressed: details.onStepCancel, child: const Text('Back')),
      ]),
      steps: [
        Step(
          title: const Text('Address'),
          isActive: _step >= 0,
          state: _step > 0 ? StepState.complete : StepState.editing,
          content: Form(key: _formKeys[0], child: TextFormField(decoration: const InputDecoration(labelText: 'Street'), validator: (v) => (v ?? '').isEmpty ? 'Required' : null)),
        ),
        Step(
          title: const Text('Delivery slot'),
          isActive: _step >= 1,
          state: _step > 1 ? StepState.complete : (_step == 1 ? StepState.editing : StepState.indexed),
          content: Form(key: _formKeys[1], child: DropdownButtonFormField<String>(
            items: const [DropdownMenuItem(value: 'am', child: Text('Morning')), DropdownMenuItem(value: 'pm', child: Text('Evening'))],
            onChanged: (_) {},
            validator: (v) => v == null ? 'Pick a slot' : null,
          )),
        ),
        Step(title: const Text('Review'), isActive: _step >= 2, content: const Text('Order summary…')),
      ],
    );
  }

  void _placeOrder() { /* … */ }
}
```
Note: `Stepper` builds every step's `content`. The forms stay in the tree, so their keys stay valid. In production, many teams build a **PageView-based wizard** with their own progress indicator for full design control, and keep the wizard state in their state management, so a back gesture or process death doesn't lose it.

---

## 37.17 Interview questions — this chapter

**Q1. What is state restoration and when is it needed?**
It restores UI state after the OS kills a backgrounded app (Android process death). You enable it with `restorationScopeId`, use RestorationMixin with RestorableProperties, and use restorable navigator APIs. Test it with "Don't keep activities".

**Q2. Why can't `Navigator.push` routes be restored?**
They are built from closures, which can't be serialized. Restorable pushes use static route builders and serializable arguments.

**Q3. Restoration vs persisting state to storage?**
Restoration covers process death after the OS kills the app (saved instance state). It does not survive the user swiping the app away or a reboot. Persistence (DB/prefs) survives everything. Use both for important drafts.

**Q4. Explain SliverConstraints and SliverGeometry.**
The constraints describe the scroll offset, remaining paint extent, overlap and cross-axis size. The geometry reports scroll extent, paint extent, layout extent, max paint extent and hit test extent, so the viewport can place the next slivers and know what's visible.

**Q5. DataTable vs PaginatedDataTable vs TableView?**
DataTable builds every row (small data). PaginatedDataTable shows pages from a DataTableSource. TableView builds lazily in both directions with pinned rows and columns (huge grids).

**Q6. OverlayPortal vs OverlayEntry?**
OverlayPortal declares the overlay child inside the widget tree, so it inherits context (theme, providers), updates with state and needs no manual insert/remove. OverlayEntry is imperative.

**Q7. How do you anchor a popup to a widget?**
CompositedTransformTarget + CompositedTransformFollower sharing a LayerLink, rendered in an overlay (OverlayPortal), with TapRegion to close it on outside taps.
