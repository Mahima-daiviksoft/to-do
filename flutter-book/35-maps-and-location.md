# Chapter 35 — Maps & Location: Google Maps, OpenStreetMap, Geolocation, Geocoding, Geofencing & Background Tracking

> **Goal:** Show maps with markers and routes, get the user's location correctly (including permissions and denied cases), turn coordinates into addresses, track location in the background legally, and keep the battery healthy.

---

## 35.1 5-year-old picture 🗺️
Your phone has a **GPS compass** that knows where you are. The **map** is a picture book of the world. **Markers** are stickers you put on the pictures. To use the compass you must ask permission. Using it **while the app is closed** needs extra permission and a very good reason.

---

## 35.2 Location permissions: the rules
| Level | Android | iOS |
|---|---|---|
| While using the app | `ACCESS_COARSE_LOCATION` (approximate) and/or `ACCESS_FINE_LOCATION` (precise) | `NSLocationWhenInUseUsageDescription` |
| Background ("Always") | + `ACCESS_BACKGROUND_LOCATION` (Android 10+), requested **separately, after** foreground permission is granted. Since Android 11 the user picks "Allow all the time" in **Settings** | + `NSLocationAlwaysAndWhenInUseUsageDescription`, `UIBackgroundModes: location` |
| Precise vs approximate | Android 12+: the user can grant only approximate | iOS 14+: precise toggle (`NSLocationTemporaryUsageDescriptionDictionary` for temporary precise access) |

**Store policies:**
* Google Play requires a **declaration form** and a demo video for background location. It is only allowed for core features that clearly benefit the user (navigation, fitness tracking, delivery drivers, family safety).
* Apple reviews "Always" usage strictly.

Ask for **when-in-use** first. Ask for background only when the user turns on a feature that needs it, after showing an explanation screen.

---

## 35.3 Getting the location: `geolocator`

### Manifest / Info.plist
```xml
<!-- android/app/src/main/AndroidManifest.xml -->
<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
<uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />
```
```xml
<!-- ios/Runner/Info.plist -->
<key>NSLocationWhenInUseUsageDescription</key>
<string>We use your location to show nearby stores.</string>
```

### A location service that handles every case
```dart
import 'package:geolocator/geolocator.dart';

sealed class LocationResult {}
final class LocationOk extends LocationResult { LocationOk(this.position); final Position position; }
final class LocationServiceDisabled extends LocationResult {}
final class LocationDenied extends LocationResult {}
final class LocationDeniedForever extends LocationResult {}

class LocationService {
  Future<LocationResult> current() async {
    // 1. Is GPS/location turned on in the device settings?
    if (!await Geolocator.isLocationServiceEnabled()) return LocationServiceDisabled();

    // 2. Permission
    var permission = await Geolocator.checkPermission();
    if (permission == LocationPermission.denied) {
      permission = await Geolocator.requestPermission();
      if (permission == LocationPermission.denied) return LocationDenied();
    }
    if (permission == LocationPermission.deniedForever) return LocationDeniedForever();

    // 3. Position. Use the last known position first for speed, then a fresh fix with a timeout.
    final last = await Geolocator.getLastKnownPosition();   // may be null/stale; not supported on web
    try {
      final fresh = await Geolocator.getCurrentPosition(
        locationSettings: const LocationSettings(
          accuracy: LocationAccuracy.high,
          timeLimit: Duration(seconds: 10),
        ),
      );
      return LocationOk(fresh);
    } on Exception {
      if (last != null) return LocationOk(last);
      rethrow;
    }
  }

  Stream<Position> track({int distanceFilterMeters = 10}) => Geolocator.getPositionStream(
        locationSettings: LocationSettings(
          accuracy: LocationAccuracy.high,
          distanceFilter: distanceFilterMeters,   // only emit after moving N meters → saves battery
        ),
      );

  Future<void> openSettings() => Geolocator.openAppSettings();
  Future<void> openLocationSettings() => Geolocator.openLocationSettings();

  double distanceMeters(Position a, Position b) =>
      Geolocator.distanceBetween(a.latitude, a.longitude, b.latitude, b.longitude);
}
```
In the UI, use `switch` on the result:
* `LocationServiceDisabled` → show a "Turn on location" button that calls `openLocationSettings()`.
* `LocationDeniedForever` → show a "Open Settings" button.
* `LocationDenied` → explain why you need it and let the user retry.

Accuracy levels: `lowest`, `low`, `medium`, `high`, `best`, `bestForNavigation`. Higher accuracy uses more battery.

### Platform-specific settings
```dart
final settings = switch (defaultTargetPlatform) {
  TargetPlatform.android => AndroidSettings(
      accuracy: LocationAccuracy.high,
      distanceFilter: 10,
      intervalDuration: const Duration(seconds: 5),
      // Background tracking on Android: a foreground service with a visible notification
      foregroundNotificationConfig: const ForegroundNotificationConfig(
        notificationTitle: 'Tracking your run',
        notificationText: 'Location is used while your workout is active',
        enableWakeLock: true,
      ),
    ),
  TargetPlatform.iOS || TargetPlatform.macOS => AppleSettings(
      accuracy: LocationAccuracy.high,
      distanceFilter: 10,
      activityType: ActivityType.fitness,
      pauseLocationUpdatesAutomatically: true,
      allowBackgroundLocationUpdates: true,      // requires UIBackgroundModes: location
      showBackgroundLocationIndicator: true,     // blue pill in the status bar
    ),
  _ => const LocationSettings(accuracy: LocationAccuracy.high, distanceFilter: 10),
};
final stream = Geolocator.getPositionStream(locationSettings: settings);
```
For Android background tracking, also declare the foreground service permissions that the geolocator README lists for your version (`FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_LOCATION` on Android 14+) and `ACCESS_BACKGROUND_LOCATION` if tracking continues after the app is closed.

Alternatives: the `location` package (similar API), and `flutter_background_geolocation` (a commercial package with very reliable background tracking, geofencing, activity recognition and battery-conscious motion detection; licensed for Android release builds).

---

## 35.4 Geocoding (address ↔ coordinates)
```dart
import 'package:geocoding/geocoding.dart';

final placemarks = await placemarkFromCoordinates(12.9716, 77.5946);
final p = placemarks.first;
final address = '${p.street}, ${p.locality}, ${p.administrativeArea} ${p.postalCode}, ${p.country}';

final locations = await locationFromAddress('MG Road, Bengaluru');
final first = locations.first; // first.latitude, first.longitude
```
* The `geocoding` package uses the platform geocoders. They are free but have rate limits and vary in quality, and the package doesn't support the web.
* Production apps often use a backend proxy to the **Google Places/Geocoding APIs**, Mapbox, or HERE. That gives you autocomplete, keeps the API key on the server and enables caching.

---

## 35.5 Google Maps: `google_maps_flutter`

### Setup
1. In Google Cloud Console, enable **Maps SDK for Android** and **Maps SDK for iOS** (plus the Maps JavaScript API for web). Create API keys **restricted** by Android package + SHA-1 and by iOS bundle ID. Billing must be enabled.
2. **Android** `AndroidManifest.xml`, inside `<application>`:
```xml
<meta-data android:name="com.google.android.geo.API_KEY" android:value="${MAPS_API_KEY}" />
```
   You can inject the key from `local.properties`/CI with `manifestPlaceholders["MAPS_API_KEY"] = ...` in Gradle, so it isn't committed.
3. **iOS** `AppDelegate.swift`:
```swift
import GoogleMaps
// inside application(_:didFinishLaunchingWithOptions:) before GeneratedPluginRegistrant
GMSServices.provideAPIKey("YOUR_IOS_KEY")
```
4. **Web:** add the Maps JavaScript script tag with your key in `web/index.html`.

### Map with markers, polyline and camera control
```dart
import 'dart:async';
import 'package:flutter/material.dart';
import 'package:google_maps_flutter/google_maps_flutter.dart';

class StoresMap extends StatefulWidget {
  const StoresMap({super.key, required this.stores});
  final List<Store> stores;
  @override
  State<StoresMap> createState() => _StoresMapState();
}

class _StoresMapState extends State<StoresMap> {
  final _controller = Completer<GoogleMapController>();
  Store? _selected;

  static const _initial = CameraPosition(target: LatLng(12.9716, 77.5946), zoom: 12);

  Set<Marker> get _markers => {
        for (final s in widget.stores)
          Marker(
            markerId: MarkerId(s.id),
            position: LatLng(s.lat, s.lng),
            infoWindow: InfoWindow(title: s.name, snippet: s.address),
            icon: BitmapDescriptor.defaultMarkerWithHue(
              s.id == _selected?.id ? BitmapDescriptor.hueAzure : BitmapDescriptor.hueRed,
            ),
            onTap: () => setState(() => _selected = s),
          ),
      };

  Set<Polyline> get _route => {
        if (widget.stores.length > 1)
          Polyline(
            polylineId: const PolylineId('route'),
            points: [for (final s in widget.stores) LatLng(s.lat, s.lng)],
            width: 5,
            color: Colors.blue,
          ),
      };

  Future<void> _fitAll() async {
    if (widget.stores.isEmpty) return;
    final lats = widget.stores.map((s) => s.lat);
    final lngs = widget.stores.map((s) => s.lng);
    final bounds = LatLngBounds(
      southwest: LatLng(lats.reduce((a, b) => a < b ? a : b), lngs.reduce((a, b) => a < b ? a : b)),
      northeast: LatLng(lats.reduce((a, b) => a > b ? a : b), lngs.reduce((a, b) => a > b ? a : b)),
    );
    final c = await _controller.future;
    await c.animateCamera(CameraUpdate.newLatLngBounds(bounds, 48));   // 48px padding
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: GoogleMap(
        initialCameraPosition: _initial,
        onMapCreated: (c) {
          if (!_controller.isCompleted) _controller.complete(c);
          _fitAll();
        },
        markers: _markers,
        polylines: _route,
        myLocationEnabled: true,          // needs location permission granted first!
        myLocationButtonEnabled: true,
        zoomControlsEnabled: false,
        mapToolbarEnabled: false,
        padding: const EdgeInsets.only(bottom: 80),   // keep the Google logo/buttons above your bottom UI
        // style: darkMapStyleJson,       // JSON from the Google styling wizard (newer API; older versions used controller.setMapStyle)
        onTap: (_) => setState(() => _selected = null),
        onCameraIdle: () { /* fetch markers for the visible region */ },
      ),
      floatingActionButton: FloatingActionButton(onPressed: _fitAll, child: const Icon(Icons.zoom_out_map)),
    );
  }
}
```
Other features:
* **Custom marker icons:** `BitmapDescriptor.asset(ImageConfiguration(size: Size(48, 48)), 'assets/pin.png')` in newer versions (older: `fromAssetImage`). You can also render a widget to bytes and use `BitmapDescriptor.bytes(...)`.
* Circles, polygons, heatmaps, tile overlays.
* Read the visible area with `getVisibleRegion()`.
* **Marker clustering** (built-in `ClusterManager` in recent versions, or `google_maps_cluster_manager`).
* **Gestures inside scroll views:** pass `gestureRecognizers: {Factory<OneSequenceGestureRecognizer>(() => EagerGestureRecognizer())}` so the map gets drag gestures.

### Performance and other gotchas
* The map is a **platform view** (Chapter 19). Avoid many maps on one screen or maps inside list items. For thumbnails, use the **Static Maps API** image instead.
* Thousands of markers → cluster them, and load markers by viewport (`onCameraIdle` + `getVisibleRegion`).
* Animating a moving car marker: interpolate positions with an `AnimationController` between updates, and update the marker set at a throttled rate.
* **Grey map** = wrong API key, API not enabled, or billing not set up. Check `adb logcat`, which shows the auth failure.

### Directions
The Maps SDK has **no routing built in**. Call the **Directions/Routes API** from your backend, decode the encoded polyline (`flutter_polyline_points` or your own decoder), and draw it as a `Polyline`. To open turn-by-turn navigation in Google/Apple Maps, use `url_launcher`:
```dart
final uri = Uri.parse('https://www.google.com/maps/dir/?api=1&destination=12.97,77.59&travelmode=driving');
await launchUrl(uri, mode: LaunchMode.externalApplication);
```

---

## 35.6 OpenStreetMap with `flutter_map` (no Google dependency)
```dart
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';

FlutterMap(
  options: const MapOptions(initialCenter: LatLng(12.9716, 77.5946), initialZoom: 13),
  children: [
    TileLayer(
      urlTemplate: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
      userAgentPackageName: 'com.mycompany.app',     // required by the OSM tile usage policy
    ),
    MarkerLayer(markers: [
      Marker(
        point: const LatLng(12.9716, 77.5946),
        width: 40, height: 40,
        child: const Icon(Icons.location_pin, color: Colors.red, size: 40),
      ),
    ]),
    PolylineLayer(polylines: [
      Polyline(points: const [LatLng(12.97, 77.59), LatLng(12.98, 77.60)], strokeWidth: 4, color: Colors.blue),
    ]),
    const RichAttributionWidget(attributions: [TextSourceAttribution('OpenStreetMap contributors')]),
  ],
);
```
* It's pure Flutter widgets (no platform view), so it works the same on mobile, web and desktop.
* ⚠️ The public OSM tile servers **must not be used for heavy production traffic** (tile usage policy). Use a tile provider (MapTiler, Stadia, Thunderforest, Mapbox raster tiles) or host your own tiles.
* Offline tiles: `flutter_map_tile_caching`.
* Other options: **`mapbox_maps_flutter`** (official Mapbox SDK, vector maps and navigation) and `apple_maps_flutter`.

---

## 35.7 Geofencing (alert me when I enter or leave an area)
* The OS provides geofencing: Android `GeofencingClient` and iOS `CLCircularRegion` monitoring. iOS limits you to **20 regions per app**, and Android to **100 per app per user**.
* In Flutter, use plugins (`native_geofence`, `geofence_service`, or the commercial `flutter_background_geolocation`) or write your own with Pigeon (Chapter 19).
* Geofence events can wake your app in the background. The handler runs in a separate isolate, so mark it with `@pragma('vm:entry-point')` and set up dependencies again (Chapter 18).
* Accuracy is roughly 100 m+. For smaller zones, combine with an active location stream while the app is in the foreground.

---

## 35.8 Battery & privacy best practices 🔋
* Request the lowest accuracy that works (city-level search → `low`).
* Use `distanceFilter` and intervals. Stop streams when the screen is hidden (cancel subscriptions in `dispose`, react to app lifecycle).
* Use **significant-change / activity-based** tracking for long periods.
* Send location updates in batches (store locally, upload every N points or minutes).
* Show clearly when tracking is active (the persistent notification on Android, the blue indicator on iOS).
* Treat location as **sensitive personal data**: get consent, keep it only as long as needed, encrypt it at rest, and declare it in the Play Data safety form and App Store privacy labels.
* Mock locations: on Android, `Position.isMocked` can detect fake GPS apps. This matters for delivery and attendance apps.

---

## 35.9 Common map/location bugs
| Bug | Fix |
|---|---|
| Grey/blank Google map | API key restrictions/SHA-1, SDK not enabled, billing |
| Works in debug, fails in Play build | Add the Play App Signing SHA-1 to the key restrictions |
| `myLocationEnabled` shows nothing | Location permission not granted before building the map |
| Permission dialog never shows again | `deniedForever` → send the user to app settings |
| Background updates stop after minutes (Android) | No foreground service, or OEM battery optimizations → foreground service + ask the user to exempt the app |
| iOS background updates stop | `allowBackgroundLocationUpdates` + `UIBackgroundModes` + "Always" permission |
| `getCurrentPosition` hangs indoors | Use `timeLimit` and fall back to the last known position |
| Map gestures don't work inside ListView | `gestureRecognizers` with `EagerGestureRecognizer` |
| Jank with many markers | Clustering, load by viewport, cache bitmap descriptors |

---

## 35.10 Interview questions — maps & location

**Q1. How do you handle location permissions correctly?**
Check that the location service is on. Check the permission, then request it with an explanation first. Handle denied and denied-forever (open settings) cases. Ask for background permission separately and only when needed. Declare everything in the manifest and Info.plist.

**Q2. How do you track location in the background on Android 14?**
Use a foreground service with the location type, a visible notification, background location permission if tracking continues after the app is closed, and the store policy declaration. Use distance filters and batching to save battery.

**Q3. google_maps_flutter vs flutter_map?**
google_maps_flutter is a native platform view with Google tiles, billing and familiar Google features. flutter_map is pure Flutter: tiles from any provider, works the same on every platform, and is easier to customize. You need a proper tile provider for production.

**Q4. How do you show thousands of markers efficiently?**
Clustering, loading markers by viewport on camera idle, caching marker icons, and throttling updates.

**Q5. How do you draw a route between two points?**
Call a Directions/Routes API (ideally through your backend), decode the polyline, and draw a Polyline. For turn-by-turn, hand off to the native maps apps with url_launcher.

**Q6. How do you detect fake GPS?**
Use `Position.isMocked` on Android, plus server-side checks for impossible speed or jumps, and device integrity attestation.
