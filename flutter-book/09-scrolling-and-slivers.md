# Chapter 9 — Scrolling, Lists, Grids & Slivers

> **Goal:** Build fast, smooth lists of any size; understand viewports and slivers; implement pagination, pull-to-refresh, sticky headers, collapsing app bars, and fix scrolling bugs.

---

## 9.1 The 5-year-old picture: a window over a long paper roll 📜

Imagine a **very long paper roll** with drawings, and a **small window** you look through. You only need to *draw* the parts visible through the window (plus a little extra above and below so scrolling is smooth). That window is the **viewport**; the pieces of paper are **slivers** ("thin slices"); drawing only what's visible is **lazy building**.

---

## 9.2 SingleChildScrollView vs ListView

| | `SingleChildScrollView` | `ListView` (default ctor) | `ListView.builder` / `.separated` |
|---|---|---|---|
| Builds children | All at once | All at once (children list) | **Lazily**, only visible + cache extent |
| Good for | A form/one page bigger than screen | Small fixed lists | Long or infinite lists |
| Memory | All children | All children | Only visible ones |

```dart
ListView.builder(
  itemCount: items.length,          // null = infinite
  itemExtent: 72,                   // ⭐ fixed height → faster layout & jumping
  // prototypeItem: const ListTile(title: Text('x')), // alternative: measure one prototype
  padding: const EdgeInsets.symmetric(vertical: 8),
  itemBuilder: (context, index) {
    final item = items[index];
    return ListTile(key: ValueKey(item.id), title: Text(item.title));
  },
);

ListView.separated(
  itemCount: items.length,
  separatorBuilder: (_, __) => const Divider(height: 1),
  itemBuilder: (context, i) => ItemTile(item: items[i]),
);
```
**Never** do `ListView(children: hugeList.map(...).toList())` for hundreds/thousands of items — it builds everything.

### Important properties of scroll views
* `scrollDirection: Axis.horizontal`
* `reverse: true` (chat apps — newest at bottom, list starts at bottom)
* `controller: ScrollController()`
* `physics`: `BouncingScrollPhysics` (iOS), `ClampingScrollPhysics` (Android), `NeverScrollableScrollPhysics` (disable), `AlwaysScrollableScrollPhysics` (allow even if content short — needed for RefreshIndicator with few items), `PageScrollPhysics`. Default depends on platform (`ScrollConfiguration`).
* `shrinkWrap: true` — size to content (⚠️ builds all items, avoid for long lists).
* `primary` — use PrimaryScrollController (iOS tap-status-bar-to-top).
* `cacheExtent` — pixels pre-built beyond viewport (default 250).
* `keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag`.
* `addAutomaticKeepAlives`, `addRepaintBoundaries` (default true), `addSemanticIndexes`.
* `restorationId` for state restoration.

---

## 9.3 ScrollController

```dart
class _FeedState extends State<Feed> {
  final _controller = ScrollController();

  @override
  void initState() {
    super.initState();
    _controller.addListener(_onScroll);
  }

  void _onScroll() {
    final pos = _controller.position;
    if (pos.pixels >= pos.maxScrollExtent - 300) {   // near bottom
      context.read<FeedCubit>().loadMore();
    }
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  void scrollToTop() => _controller.animateTo(0,
      duration: const Duration(milliseconds: 400), curve: Curves.easeOut);
  ...
}
```
* `jumpTo(offset)`, `animateTo(offset, ...)`, `offset`, `position.maxScrollExtent`, `position.userScrollDirection`, `hasClients` (check before using!).
* Error: *"ScrollController attached to multiple scroll views"* — same controller given to two scrollables. *"ScrollController not attached to any scroll views"* — used before build or after dispose (`if (_controller.hasClients)`).
* `NotificationListener<ScrollNotification>` alternative to controllers: listen to `ScrollStartNotification`, `ScrollUpdateNotification`, `ScrollEndNotification`, `OverscrollNotification`, `UserScrollNotification`; return `true` to stop bubbling.
* Scroll to a specific widget: `Scrollable.ensureVisible(key.currentContext!)`; for index-based scrolling in long lazy lists use `scrollable_positioned_list` / `super_sliver_list` packages (ListView can't scroll to an index of unbuilt variable-height items).

---

## 9.4 Infinite scrolling / pagination (production pattern)

```dart
class PagedList extends StatefulWidget { ... }

class _PagedListState extends State<PagedList> {
  final _items = <Item>[];
  int _page = 1;
  bool _loading = false;
  bool _hasMore = true;
  Object? _error;

  @override
  void initState() { super.initState(); _loadMore(); }

  Future<void> _loadMore() async {
    if (_loading || !_hasMore) return;            // ❗ guard against duplicate calls
    setState(() { _loading = true; _error = null; });
    try {
      final page = await api.fetchItems(page: _page, limit: 20);
      if (!mounted) return;
      setState(() {
        _items.addAll(page);
        _page++;
        _hasMore = page.length == 20;
      });
    } catch (e) {
      if (mounted) setState(() => _error = e);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _refresh() async {
    setState(() { _items.clear(); _page = 1; _hasMore = true; });
    await _loadMore();
  }

  @override
  Widget build(BuildContext context) {
    return RefreshIndicator(
      onRefresh: _refresh,
      child: ListView.builder(
        physics: const AlwaysScrollableScrollPhysics(),
        itemCount: _items.length + 1,   // +1 for footer
        itemBuilder: (context, i) {
          if (i < _items.length) {
            if (i == _items.length - 5) _loadMore();  // prefetch near end (side effect in build: acceptable here because guarded, but many teams prefer a scroll listener)
            return ItemTile(key: ValueKey(_items[i].id), item: _items[i]);
          }
          if (_error != null) return TextButton(onPressed: _loadMore, child: const Text('Retry'));
          if (_hasMore) return const Padding(padding: EdgeInsets.all(16), child: Center(child: CircularProgressIndicator()));
          return const SizedBox.shrink();
        },
      ),
    );
  }
}
```
⚠️ Calling `_loadMore()` (which calls `setState`) from `itemBuilder` *during build* can trigger "setState() called during build". Safer: schedule it: `WidgetsBinding.instance.addPostFrameCallback((_) => _loadMore());` or use a scroll listener. Packages: **`infinite_scroll_pagination`** (popular, handles all states).

Pagination styles: **offset/limit (page numbers)** (simple, but duplicates/skips when data changes) vs **cursor-based** (`nextCursor` from server; stable for feeds). Senior interview: prefer cursor-based for live feeds.

---

## 9.5 GridView

```dart
GridView.builder(
  gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
    crossAxisCount: 2, mainAxisSpacing: 8, crossAxisSpacing: 8, childAspectRatio: 3 / 4,
  ),
  itemCount: products.length,
  itemBuilder: (_, i) => ProductCard(product: products[i]),
);

// Responsive: as many columns as fit with max tile width 200
GridView.builder(
  gridDelegate: const SliverGridDelegateWithMaxCrossAxisExtent(maxCrossAxisExtent: 200, childAspectRatio: 1),
  ...
);
GridView.count(crossAxisCount: 3, children: [...]);
GridView.extent(maxCrossAxisExtent: 150, children: [...]);
```
Gotcha: grid tiles have **fixed aspect ratio**; content taller than the tile → overflow. Use `childAspectRatio` or `mainAxisExtent` (fixed height) on the delegate. Staggered/masonry grids: `flutter_staggered_grid_view` package.

---

## 9.6 PageView, TabBarView, carousels

```dart
final _pageController = PageController(viewportFraction: 0.9);  // peek next page
PageView.builder(
  controller: _pageController,
  itemCount: banners.length,
  onPageChanged: (i) => setState(() => _current = i),
  itemBuilder: (_, i) => BannerCard(banners[i]),
);
_pageController.animateToPage(2, duration: const Duration(milliseconds: 300), curve: Curves.ease);
```
* Material 3 `CarouselView` (Flutter 3.24+) for carousels.
* Tabs: `DefaultTabController(length: 3, child: Scaffold(appBar: AppBar(bottom: TabBar(tabs: ...)), body: TabBarView(children: ...)))`. Or a manual `TabController` with `TickerProviderStateMixin`.
* Tabs/pages lose state when scrolled away → keep alive (9.8).

---

## 9.7 Slivers & CustomScrollView 🥓

A **sliver** is a piece of a scrollable area that knows how to lay itself out lazily based on the visible portion (`SliverConstraints` in, `SliverGeometry` out — a different protocol from boxes!). `ListView` itself is just a `CustomScrollView` with one `SliverList` (plus padding).

Use **CustomScrollView** when you want **multiple different scrolling things to scroll together as one** (header + grid + list + footer), collapsing app bars, sticky headers — **instead of nesting ListViews with shrinkWrap**.

```dart
CustomScrollView(
  slivers: [
    SliverAppBar(
      pinned: true,          // stays visible (collapsed) at top
      floating: false,       // reappears immediately on scroll up if true
      snap: false,           // with floating: snaps fully open/closed
      expandedHeight: 220,
      stretch: true,
      flexibleSpace: FlexibleSpaceBar(
        title: const Text('Goa Trip'),
        background: Image.network(coverUrl, fit: BoxFit.cover),
      ),
    ),
    const SliverToBoxAdapter(child: Padding(padding: EdgeInsets.all(16), child: Text('Highlights'))),
    SliverPadding(
      padding: const EdgeInsets.symmetric(horizontal: 16),
      sliver: SliverGrid.builder(
        gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(crossAxisCount: 3, mainAxisSpacing: 8, crossAxisSpacing: 8),
        itemCount: photos.length,
        itemBuilder: (_, i) => PhotoTile(photos[i]),
      ),
    ),
    SliverList.separated(
      itemCount: reviews.length,
      separatorBuilder: (_, __) => const Divider(),
      itemBuilder: (_, i) => ReviewTile(reviews[i]),
    ),
    const SliverFillRemaining(hasScrollBody: false, child: Center(child: Text('The end'))),
  ],
);
```

### Sliver catalogue
| Sliver | Purpose |
|---|---|
| `SliverList` / `SliverList.builder` / `.separated` / `.list` | Lazy list |
| `SliverFixedExtentList`, `SliverPrototypeExtentList`, `SliverVariedExtentList` | Faster lists with known extents |
| `SliverGrid` | Lazy grid |
| `SliverAppBar`, `SliverAppBar.medium/.large` (M3) | Collapsing app bar |
| `SliverToBoxAdapter` | Put one normal (box) widget inside |
| `SliverPadding` | Padding around a sliver |
| `SliverFillRemaining` | Fill leftover viewport space |
| `SliverFillViewport` | Children fill viewport (pages) |
| `SliverPersistentHeader` | Custom sticky/collapsing headers (with delegate) |
| `SliverOpacity`, `SliverIgnorePointer`, `SliverVisibility`, `SliverOffstage` | Sliver versions of effects |
| `SliverAnimatedList` | Animated insert/remove |
| `SliverLayoutBuilder` | Build based on SliverConstraints |
| `SliverMainAxisGroup`, `SliverCrossAxisGroup` (3.13+) | Group slivers; sticky header per section with `pinned` SliverPersistentHeader |
| `SliverResizingHeader`, `PinnedHeaderSliver`, `SliverFloatingHeader` (3.24+) | Easier headers without delegates |
| `DecoratedSliver` (3.16+) | Background decoration for slivers |
| `SliverSafeArea` | Safe area for slivers |

**Error:** putting a box widget directly in `slivers:` → *"A RenderViewport expected a child of type RenderSliver but received a child of type RenderPadding"* (or similar). Wrap box widgets in `SliverToBoxAdapter`; use `SliverPadding` not `Padding`.

### SliverPersistentHeader (sticky header)
```dart
class _HeaderDelegate extends SliverPersistentHeaderDelegate {
  _HeaderDelegate(this.title);
  final String title;
  @override double get minExtent => 48;
  @override double get maxExtent => 48;
  @override
  Widget build(BuildContext context, double shrinkOffset, bool overlapsContent) =>
      Container(color: Theme.of(context).colorScheme.surface, alignment: Alignment.centerLeft,
          padding: const EdgeInsets.symmetric(horizontal: 16), child: Text(title));
  @override
  bool shouldRebuild(_HeaderDelegate old) => old.title != title;
}
SliverPersistentHeader(pinned: true, delegate: _HeaderDelegate('Section A'));
```
For grouped sticky headers ("contacts A, B, C"), use `SliverMainAxisGroup` with a pinned header per group, or the `sliver_tools` / `flutter_sticky_header` packages.

### NestedScrollView
Outer header (e.g., collapsing app bar + TabBar) + inner scrollable per tab, coordinated:
```dart
NestedScrollView(
  headerSliverBuilder: (context, innerBoxIsScrolled) => [
    SliverOverlapAbsorber(
      handle: NestedScrollView.sliverOverlapAbsorberHandleFor(context),
      sliver: SliverAppBar(pinned: true, expandedHeight: 200, forceElevated: innerBoxIsScrolled,
        bottom: const TabBar(tabs: [Tab(text: 'Posts'), Tab(text: 'Media')])),
    ),
  ],
  body: TabBarView(children: [PostsTab(), MediaTab()]), // each uses SliverOverlapInjector at top
);
```
NestedScrollView has subtle bugs (overlap, scroll position sharing); test carefully.

---

## 9.8 Keeping state alive in lists, tabs and pages

Lazy lists **dispose** off-screen items (state lost: text typed, video position, checkbox local state). Options:
1. **Lift state up** into a model / state management (best practice).
2. `AutomaticKeepAliveClientMixin`:
```dart
class _TabState extends State<MyTab> with AutomaticKeepAliveClientMixin {
  @override
  bool get wantKeepAlive => true;
  @override
  Widget build(BuildContext context) {
    super.build(context);  // ❗ must call
    return ListView(...);
  }
}
```
3. `PageStorageKey` to remember **scroll position** across tab switches:
`ListView(key: const PageStorageKey('feed-list'), ...)`.
4. `IndexedStack` for bottom nav tabs (keeps all alive — memory trade-off), or go_router's `StatefulShellRoute` (Chapter 11).

---

## 9.9 Animated lists & reordering
```dart
final _listKey = GlobalKey<AnimatedListState>();
AnimatedList(
  key: _listKey,
  initialItemCount: items.length,
  itemBuilder: (context, i, animation) => SizeTransition(sizeFactor: animation, child: ItemTile(items[i])),
);
void insert(Item item) { items.insert(0, item); _listKey.currentState!.insertItem(0); }
void remove(int i) {
  final removed = items.removeAt(i);
  _listKey.currentState!.removeItem(i, (ctx, anim) => SizeTransition(sizeFactor: anim, child: ItemTile(removed)));
}
```
`ReorderableListView.builder` (needs keys), `SliverReorderableList`, `ReorderableDragStartListener` for custom handles. `implicitly_animated_reorderable_list` / `animated_list_plus` packages diff lists automatically.

---

## 9.10 Scroll performance checklist ⚡
1. Use `.builder` constructors for long lists.
2. Provide `itemExtent`/`prototypeItem` when heights are fixed.
3. Keep `itemBuilder` cheap: no heavy computation, no synchronous JSON parsing, no creating controllers.
4. Use `const` widgets inside items.
5. Avoid `shrinkWrap: true` + nested ListViews; use slivers.
6. Images: proper sizes (`cacheWidth`), `cached_network_image`, placeholders with fixed sizes (avoid layout jumps).
7. Avoid `Opacity`, `ClipPath`, `BackdropFilter`, `saveLayer`-heavy effects per item; avoid `IntrinsicHeight` in items.
8. Avoid rebuilding the whole list when one item changes: per-item state (e.g., `select` in Provider/Riverpod, `BlocSelector`), keys.
9. Profile in **profile mode** with DevTools performance view (Chapter 23).
10. For **very** large or complex lists: `super_sliver_list` (better extent estimation, jump to index).

---

## 9.11 Common scrolling bugs
| Bug | Fix |
|---|---|
| Unbounded height (ListView in Column) | `Expanded` / slivers |
| Nested scroll views fighting (inner ListView scrolls instead of outer) | Use single CustomScrollView; or inner `physics: NeverScrollableScrollPhysics()` + `shrinkWrap` for SHORT lists |
| RefreshIndicator doesn't trigger with few items | `physics: AlwaysScrollableScrollPhysics()` |
| Scroll position resets after setState | Controller recreated in build, or key changes; keep controller in State; use PageStorageKey |
| `ScrollController not attached` | Check `hasClients`; call after first frame |
| Horizontal list inside vertical list has no height | Wrap in `SizedBox(height: ...)` |
| Jank when scrolling images | Resize/cache images, `RepaintBoundary` (default), avoid expensive effects |
| Lost text in TextFields inside list | Lift state; keys; keep alive |
| Load-more fires many times | Guard with `_loading` flag; debounce |
| Overscroll glow/stretch unwanted | `ScrollConfiguration(behavior: ScrollConfiguration.of(context).copyWith(overscroll: false), ...)` |
| Can't drag-scroll with mouse on web/desktop | Since Flutter 2.5, mouse drag scrolling is disabled by default; add `PointerDeviceKind.mouse` to `ScrollBehavior.dragDevices` via a custom `MaterialScrollBehavior` |

---

## 9.12 Interview Questions — Scrolling

**Q1. ListView vs ListView.builder?** Default ListView builds all children upfront; builder lazily builds visible items — use for long/infinite lists.

**Q2. What is a sliver?** A portion of a scrollable area using the sliver layout protocol (SliverConstraints → SliverGeometry) enabling lazy and custom scroll effects; composed in CustomScrollView.

**Q3. When use CustomScrollView?** When combining multiple scrollable sections (lists, grids, headers) into one scroll, or for effects like collapsing/sticky headers.

**Q4. Why avoid shrinkWrap?** It forces the scrollable to lay out all children to compute its size, losing laziness — expensive for long lists.

**Q5. How do you implement infinite scroll?** ScrollController listener or NotificationListener detecting near-end, guarded loading flag, page/cursor tracking, footer loader & error/retry, refresh resetting state.

**Q6. How do you preserve state of tabs/list items?** AutomaticKeepAliveClientMixin, PageStorageKey, IndexedStack, StatefulShellRoute, or lifting state out of widgets.

**Q7. What does `itemExtent` do?** Gives fixed main-axis extent per item allowing O(1) layout calculations and efficient jumps/scrollbar.

**Q8. NestedScrollView use case?** Coordinating an outer collapsing header with inner scroll views (e.g., profile header + tabs with lists).

**Q9. How do you make a sticky header?** `SliverAppBar(pinned: true)`, `SliverPersistentHeader(pinned: true)`, `PinnedHeaderSliver`, or grouping with `SliverMainAxisGroup`.

**Q10. What is cacheExtent?** Area before/after the visible viewport where items are pre-built for smooth scrolling.
