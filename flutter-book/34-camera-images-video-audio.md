# Chapter 34 — Camera, Image Picking, Video & Audio (Full Code)

> **Goal:** Build media features properly: pick and compress photos, show a live camera preview, record and play video, play audio (including in the background), and record your voice. Each section covers setup, complete code, lifecycle rules and the bugs companies hit most.

> Package APIs change between major versions. The code below follows each package's current major version as of 2026. Check the package's README and CHANGELOG when you upgrade.

---

## 34.1 5-year-old picture 📸

Your phone has **eyes** (camera), a **photo album** (gallery), a **TV** (video player), a **radio** (audio player) and **ears** (microphone). Flutter can't use them by itself. It asks the phone through **plugins**, and the phone only says yes if you asked **politely** (permissions with a reason).

---

## 34.2 Picking photos & videos: `image_picker`

Use this when the user only needs to **choose or take one photo/video**. It opens the system UI, so you don't build a camera screen yourself.

### Setup
* **iOS `Info.plist`:**
  * `NSPhotoLibraryUsageDescription`
  * `NSCameraUsageDescription`
  * `NSMicrophoneUsageDescription` (only if you record video with sound)
* **Android:** no permission is needed for the gallery on Android 13+, because the plugin uses the **Photo Picker** (Android 11–12 also get a backported picker through Google Play services). Taking a photo with the camera uses the system camera app.

### Code
```dart
import 'dart:io';
import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';

class AvatarPicker extends StatefulWidget {
  const AvatarPicker({super.key, required this.onPicked});
  final ValueChanged<File> onPicked;

  @override
  State<AvatarPicker> createState() => _AvatarPickerState();
}

class _AvatarPickerState extends State<AvatarPicker> {
  final _picker = ImagePicker();
  File? _file;
  bool _busy = false;                     // prevents "already_active" errors from double taps

  Future<void> _pick(ImageSource source) async {
    if (_busy) return;
    setState(() => _busy = true);
    try {
      final XFile? picked = await _picker.pickImage(
        source: source,
        maxWidth: 1080,                   // ⭐ resize on the device → smaller uploads & less memory
        maxHeight: 1080,
        imageQuality: 85,                 // JPEG quality 0–100
        preferredCameraDevice: CameraDevice.front,
      );
      if (picked == null || !mounted) return;   // user cancelled
      final file = File(picked.path);
      setState(() => _file = file);
      widget.onPicked(file);
    } on Exception catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Could not pick image: $e')));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  void _showSourceSheet() {
    showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      builder: (ctx) => SafeArea(
        child: Wrap(children: [
          ListTile(
            leading: const Icon(Icons.photo_library),
            title: const Text('Choose from gallery'),
            onTap: () { Navigator.pop(ctx); _pick(ImageSource.gallery); },
          ),
          ListTile(
            leading: const Icon(Icons.photo_camera),
            title: const Text('Take a photo'),
            onTap: () { Navigator.pop(ctx); _pick(ImageSource.camera); },
          ),
        ]),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: _showSourceSheet,
      child: CircleAvatar(
        radius: 48,
        backgroundImage: _file != null ? FileImage(_file!) : null,
        child: _file == null ? const Icon(Icons.add_a_photo, size: 32) : null,
      ),
    );
  }
}
```
Other APIs:
```dart
final List<XFile> many = await _picker.pickMultiImage(limit: 5, imageQuality: 80);
final XFile? video = await _picker.pickVideo(source: ImageSource.gallery, maxDuration: const Duration(minutes: 1));
final List<XFile> media = await _picker.pickMultipleMedia();   // photos + videos together
```

### ⚠️ Android "lost data" (activity killed while the camera is open)
On low-memory Android devices, the OS may **kill your app's activity** while the camera app is open. When the user comes back, `pickImage` never returns a value. You can recover the result at startup:
```dart
Future<void> retrieveLostData() async {
  final LostDataResponse response = await _picker.retrieveLostData();
  if (response.isEmpty) return;
  final files = response.files;
  if (files != null) { /* handle recovered images */ } else { /* response.exception */ }
}
```
You can reproduce this with **Developer options → Don't keep activities**.

### Web
`XFile.path` is a **blob URL** on the web, and `dart:io` `File` doesn't work there. Use `await xfile.readAsBytes()` and `Image.memory(bytes)` to show it.

---

## 34.3 Cropping & compressing
* **`image_cropper`** opens a native crop UI (uCrop on Android, TOCropViewController on iOS). On Android you must add `UCropActivity` to the manifest, as the plugin's README explains.
* **`flutter_image_compress`** does native compression and format conversion:
```dart
final XFile? out = await FlutterImageCompress.compressAndGetFile(
  input.absolute.path, '${tempDir.path}/out.jpg',
  quality: 80, minWidth: 1080, minHeight: 1080, format: CompressFormat.jpeg,
);
```
* **Pure Dart:** the `image` package can resize and apply filters. It is CPU-heavy, so always run it inside `Isolate.run`.
* **EXIF:** photos from phones may be **rotated** in their EXIF metadata. Either the server reads the EXIF orientation, or you "bake in" the rotation before uploading (compress libraries can do this, e.g. `autoCorrectionAngle`). Remove GPS EXIF data for privacy when needed.

---

## 34.4 Custom camera screen: the `camera` plugin

Use this when you need your **own** camera UI: a scanner overlay, KYC selfie frames, custom buttons, filters, or frame-by-frame image streams for ML.

### Setup
* **iOS `Info.plist`:**
  * `NSCameraUsageDescription`
  * `NSMicrophoneUsageDescription` (if `enableAudio` is true)
* **Android:** follow the README's `minSdk` requirement. The plugin requests the camera permission at runtime when you initialize the controller.

### Complete camera page (with correct lifecycle handling)
```dart
import 'package:camera/camera.dart';
import 'package:flutter/material.dart';

class CameraPage extends StatefulWidget {
  const CameraPage({super.key});
  @override
  State<CameraPage> createState() => _CameraPageState();
}

class _CameraPageState extends State<CameraPage> with WidgetsBindingObserver {
  List<CameraDescription> _cameras = const [];
  CameraController? _controller;
  int _cameraIndex = 0;
  bool _recording = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _setup();
  }

  Future<void> _setup() async {
    try {
      _cameras = await availableCameras();
      if (_cameras.isEmpty) {
        setState(() => _error = 'No camera found');
        return;
      }
      await _initController(_cameras[_cameraIndex]);
    } on CameraException catch (e) {
      setState(() => _error = _describe(e));
    }
  }

  Future<void> _initController(CameraDescription description) async {
    final old = _controller;
    _controller = null;
    if (mounted) setState(() {});
    await old?.dispose();                         // ❗ always dispose the previous controller

    final controller = CameraController(
      description,
      ResolutionPreset.high,                      // low/medium/high/veryHigh/ultraHigh/max
      enableAudio: true,
      imageFormatGroup: ImageFormatGroup.jpeg,
    );
    try {
      await controller.initialize();
      await controller.setFlashMode(FlashMode.auto);
      if (!mounted) {
        await controller.dispose();
        return;
      }
      setState(() => _controller = controller);
    } on CameraException catch (e) {
      await controller.dispose();
      if (mounted) setState(() => _error = _describe(e));
    }
  }

  String _describe(CameraException e) => switch (e.code) {
        'CameraAccessDenied' => 'Camera permission denied. Enable it in Settings.',
        'CameraAccessDeniedWithoutPrompt' => 'Camera permission denied permanently (iOS). Open Settings.',
        'CameraAccessRestricted' => 'Camera access restricted (parental controls).',
        'AudioAccessDenied' => 'Microphone permission denied.',
        _ => 'Camera error: ${e.code} ${e.description}',
      };

  // ❗ The camera is a shared OS resource. Release it when the app goes to the background
  // and set it up again when the app comes back. Otherwise other apps can't use it,
  // and your preview may freeze or crash when the app resumes.
  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    final controller = _controller;
    if (controller == null || !controller.value.isInitialized) return;
    if (state == AppLifecycleState.inactive) {
      _controller = null;
      controller.dispose();
    } else if (state == AppLifecycleState.resumed) {
      _initController(controller.description);
    }
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _controller?.dispose();
    super.dispose();
  }

  Future<void> _takePicture() async {
    final c = _controller;
    if (c == null || !c.value.isInitialized || c.value.isTakingPicture) return;
    try {
      final XFile photo = await c.takePicture();
      if (!mounted) return;
      Navigator.of(context).pop(photo);           // return the file to the caller
    } on CameraException catch (e) {
      setState(() => _error = _describe(e));
    }
  }

  Future<void> _toggleRecording() async {
    final c = _controller;
    if (c == null) return;
    if (_recording) {
      final XFile video = await c.stopVideoRecording();
      setState(() => _recording = false);
      if (mounted) Navigator.of(context).pop(video);
    } else {
      await c.prepareForVideoRecording();         // iOS: avoids a delay at start
      await c.startVideoRecording();
      setState(() => _recording = true);
    }
  }

  void _switchCamera() {
    if (_cameras.length < 2) return;
    _cameraIndex = (_cameraIndex + 1) % _cameras.length;
    _initController(_cameras[_cameraIndex]);
  }

  @override
  Widget build(BuildContext context) {
    if (_error != null) {
      return Scaffold(appBar: AppBar(), body: Center(child: Text(_error!, textAlign: TextAlign.center)));
    }
    final c = _controller;
    if (c == null || !c.value.isInitialized) {
      return const Scaffold(backgroundColor: Colors.black, body: Center(child: CircularProgressIndicator()));
    }
    return Scaffold(
      backgroundColor: Colors.black,
      body: Stack(fit: StackFit.expand, children: [
        Center(child: CameraPreview(c)),         // keeps the camera's aspect ratio
        // Example overlay: a frame for document scanning
        IgnorePointer(
          child: Center(
            child: Container(
              width: 300, height: 190,
              decoration: BoxDecoration(border: Border.all(color: Colors.white, width: 2), borderRadius: BorderRadius.circular(12)),
            ),
          ),
        ),
        SafeArea(
          child: Align(
            alignment: Alignment.bottomCenter,
            child: Padding(
              padding: const EdgeInsets.all(24),
              child: Row(mainAxisAlignment: MainAxisAlignment.spaceEvenly, children: [
                IconButton(onPressed: _switchCamera, icon: const Icon(Icons.cameraswitch, color: Colors.white)),
                FloatingActionButton(onPressed: _takePicture, child: const Icon(Icons.camera)),
                IconButton(
                  onPressed: _toggleRecording,
                  icon: Icon(_recording ? Icons.stop : Icons.videocam, color: _recording ? Colors.red : Colors.white),
                ),
              ]),
            ),
          ),
        ),
      ]),
    );
  }
}

// Usage: final result = await Navigator.push<XFile>(context, MaterialPageRoute(builder: (_) => const CameraPage()));
```

### More controller features
```dart
await c.setZoomLevel(2.0);                       // range: getMinZoomLevel()/getMaxZoomLevel()
await c.setFocusPoint(const Offset(0.5, 0.5));   // normalized 0..1 coordinates
await c.setExposurePoint(const Offset(0.5, 0.5));
await c.setFlashMode(FlashMode.torch);
await c.lockCaptureOrientation(DeviceOrientation.portraitUp);
await c.pausePreview(); await c.resumePreview();

// Frame stream for ML (barcode, faces). It is heavy: process at most one frame at a time.
bool processing = false;
await c.startImageStream((CameraImage image) async {
  if (processing) return;
  processing = true;
  try { await detector.process(image); } finally { processing = false; }
});
await c.stopImageStream();
```
For barcodes or QR codes, use **`mobile_scanner`** instead of the camera plugin. It wraps ML Kit and AVFoundation and is much easier. For text and faces, use the **`google_mlkit_*`** packages, converting `CameraImage` to `InputImage` as their README shows.

### Common camera bugs
| Bug | Fix |
|---|---|
| Black preview after returning from background | Handle `didChangeAppLifecycleState` (dispose on inactive, set up again on resumed) |
| `CameraException(cameraPermission)` | Permission denied → show a "go to Settings" message (`openAppSettings`) |
| Preview stretched | Don't force the preview to fill the screen. Keep the aspect ratio, or use `FittedBox(fit: BoxFit.cover)` with a sized box and clipping |
| Crash on hot reload | Camera native state + hot reload is fragile → hot restart |
| `takePicture` called twice | Check `value.isTakingPicture` |
| Out-of-memory with image stream | Throttle frames, process in isolates, lower the resolution preset |
| Emulator issues | Test on real devices |

---

## 34.5 Video playback: `video_player` (official) + `chewie` (ready-made controls)

### Setup
* **Android:** add the `INTERNET` permission for network videos. Cleartext HTTP needs extra config, so use HTTPS.
* **iOS:** HTTPS only (ATS rules).
* **Web:** autoplay rules apply. Browsers usually allow autoplay only when the video is **muted**.

### Complete player with controls
```dart
import 'package:flutter/material.dart';
import 'package:video_player/video_player.dart';

class VideoScreen extends StatefulWidget {
  const VideoScreen({super.key, required this.url});
  final String url;
  @override
  State<VideoScreen> createState() => _VideoScreenState();
}

class _VideoScreenState extends State<VideoScreen> {
  late final VideoPlayerController _controller;
  late final Future<void> _init;

  @override
  void initState() {
    super.initState();
    _controller = VideoPlayerController.networkUrl(
      Uri.parse(widget.url),
      videoPlayerOptions: VideoPlayerOptions(mixWithOthers: true),   // don't stop the user's music
    );
    _init = _controller.initialize().then((_) {
      _controller.setLooping(false);
      _controller.play();
    });
    // Other sources: VideoPlayerController.asset('assets/intro.mp4'), .file(File(path)), .contentUri(uri) on Android
  }

  @override
  void dispose() {
    _controller.dispose();               // ❗ releases native decoders. Leaks here are very costly
    super.dispose();
  }

  String _fmt(Duration d) =>
      '${d.inMinutes.remainder(60).toString().padLeft(2, '0')}:${d.inSeconds.remainder(60).toString().padLeft(2, '0')}';

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Video')),
      body: FutureBuilder<void>(
        future: _init,                   // created once in initState (not inside build!)
        builder: (context, snapshot) {
          if (snapshot.hasError) return Center(child: Text('Cannot play video: ${snapshot.error}'));
          if (snapshot.connectionState != ConnectionState.done) {
            return const Center(child: CircularProgressIndicator());
          }
          return Column(children: [
            AspectRatio(
              aspectRatio: _controller.value.aspectRatio,
              child: Stack(alignment: Alignment.bottomCenter, children: [
                VideoPlayer(_controller),
                VideoProgressIndicator(_controller, allowScrubbing: true),
              ]),
            ),
            // Rebuild ONLY the controls whenever the player value changes
            ValueListenableBuilder<VideoPlayerValue>(
              valueListenable: _controller,
              builder: (context, value, _) => Row(children: [
                IconButton(
                  icon: Icon(value.isPlaying ? Icons.pause : Icons.play_arrow),
                  onPressed: () => value.isPlaying ? _controller.pause() : _controller.play(),
                ),
                Text('${_fmt(value.position)} / ${_fmt(value.duration)}'),
                if (value.isBuffering) const Padding(padding: EdgeInsets.all(8), child: SizedBox.square(dimension: 16, child: CircularProgressIndicator(strokeWidth: 2))),
                const Spacer(),
                IconButton(
                  icon: Icon(value.volume == 0 ? Icons.volume_off : Icons.volume_up),
                  onPressed: () => _controller.setVolume(value.volume == 0 ? 1 : 0),
                ),
              ]),
            ),
          ]);
        },
      ),
    );
  }
}
```
`VideoPlayerController` is a `ValueNotifier<VideoPlayerValue>`. That's why `ValueListenableBuilder` works with it. Other useful APIs: `seekTo(Duration)`, `setPlaybackSpeed(1.5)`, `value.hasError`, `value.errorDescription`, `value.buffered`, `value.size`, `value.isCompleted`.

### Chewie (full-screen, speed menu, subtitles)
```dart
final chewie = ChewieController(
  videoPlayerController: _controller,
  autoPlay: true,
  looping: false,
  allowFullScreen: true,
  playbackSpeeds: const [0.5, 1, 1.5, 2],
  errorBuilder: (context, msg) => Center(child: Text(msg)),
);
Chewie(controller: chewie);
// dispose both: chewie.dispose(); _controller.dispose();
```

### Video feeds (Reels/Shorts style), the senior-level part
* Use a vertical `PageView.builder`. Keep at most **3 controllers alive** (previous, current, next) and dispose the others. Each decoder uses native memory, and devices limit how many can run at once.
* Play only the visible page. Pause when the route is covered (`RouteAware`) or the app goes to the background.
* Preload the next video's `initialize()` early. Cache downloads using `flutter_cache_manager` and play from the file. Use HLS streaming (`.m3u8`) for adaptive bitrate.
* In plain lists, use `visibility_detector` to autoplay the most visible video.
* Alternatives: **`media_kit`** (libmpv based, desktop + mobile, many formats) and **`better_player_plus`** (DRM, caching, HLS tracks).
* DRM (Widevine/FairPlay) usually needs a specialized plugin or native SDK.
* Picture-in-picture and background playback need native/platform work or specialized plugins.

---

## 34.6 Audio playback: `just_audio` (+ `audio_service` for background)

```dart
import 'package:just_audio/just_audio.dart';
import 'package:audio_session/audio_session.dart';

class PlayerService {
  final player = AudioPlayer();

  Future<void> init() async {
    final session = await AudioSession.instance;
    await session.configure(const AudioSessionConfiguration.music());   // handles interruptions like phone calls & ducking
    player.playbackEventStream.listen((_) {}, onError: (Object e, StackTrace st) {
      // network/codec errors arrive here
    });
  }

  Future<void> playUrl(String url) async {
    try {
      await player.setUrl(url);            // also: setAsset, setFilePath, setAudioSource(...)
      await player.play();                 // ⚠️ the Future completes when playback STOPS/pauses, not when it starts!
    } on PlayerException catch (e) {
      // e.code, e.message
    } on PlayerInterruptedException {
      // a new source was loaded before this one finished loading
    }
  }

  Future<void> playlist(List<String> urls) async {
    await player.setAudioSource(ConcatenatingAudioSource(
      children: [for (final u in urls) AudioSource.uri(Uri.parse(u))],
    ));
    // ⚠️ Newer just_audio versions prefer `player.setAudioSources([...])`. Check your version's README.
    player.play();
  }

  Future<void> dispose() => player.dispose();
}
```
Building the UI from streams:
```dart
StreamBuilder<PlayerState>(
  stream: service.player.playerStateStream,
  builder: (context, snap) {
    final state = snap.data;
    final processing = state?.processingState;
    if (processing == ProcessingState.loading || processing == ProcessingState.buffering) {
      return const CircularProgressIndicator();
    }
    final playing = state?.playing ?? false;
    return IconButton(
      icon: Icon(playing ? Icons.pause : Icons.play_arrow),
      onPressed: playing ? service.player.pause : service.player.play,
    );
  },
);
StreamBuilder<Duration>(
  stream: service.player.positionStream,
  builder: (_, snap) => Slider(
    value: (snap.data ?? Duration.zero).inMilliseconds.toDouble()
        .clamp(0, (service.player.duration ?? Duration.zero).inMilliseconds.toDouble()),
    max: (service.player.duration ?? Duration.zero).inMilliseconds.toDouble().clamp(1, double.infinity),
    onChanged: (v) => service.player.seek(Duration(milliseconds: v.toInt())),
  ),
);
```

### Background audio & lock-screen controls
Use **`audio_service`**. Your handler class (extends `BaseAudioHandler`) wraps the player. It publishes `mediaItem` and `playbackState` (controls: play/pause/skip) and runs a foreground service on Android with a media notification. **`just_audio_background`** is a simpler option for basic cases.
* **Android:** follow the README's manifest entries. These include the media playback foreground service type (`FOREGROUND_SERVICE_MEDIA_PLAYBACK` for Android 14+) and the `AudioService`/`MediaButtonReceiver` declarations. MainActivity may need to extend `AudioServiceActivity`.
* **iOS:** add `UIBackgroundModes` → `audio`.

Short sound effects (button clicks, games): use **`audioplayers`** or `flame_audio`. They have low latency and can play several sounds at once.

---

## 34.7 Recording audio: `record`
```dart
import 'package:record/record.dart';
import 'package:path_provider/path_provider.dart';

final recorder = AudioRecorder();

Future<void> start() async {
  if (!await recorder.hasPermission()) return;                 // asks for permission if needed
  final dir = await getTemporaryDirectory();
  final path = '${dir.path}/note_${DateTime.now().millisecondsSinceEpoch}.m4a';
  await recorder.start(const RecordConfig(encoder: AudioEncoder.aacLc, bitRate: 128000, sampleRate: 44100), path: path);
}

Future<String?> stop() => recorder.stop();          // returns the file path
// recorder.onAmplitudeChanged(const Duration(milliseconds: 100)) → animated waveform
// recorder.pause() / resume() / cancel(); recorder.dispose() when done
```
Setup:
* **iOS:** `NSMicrophoneUsageDescription`.
* **Android:** `RECORD_AUDIO`.

---

## 34.8 Uploading media reliably
* **Small files:** Dio `FormData` with `onSendProgress` (Chapter 16).
* **Large files and videos:**
  * Get a **pre-signed URL** from your backend, then upload straight to S3/GCS. Your servers never carry the bytes.
  * Use **resumable / multipart uploads** (tus protocol, S3 multipart) so a broken connection doesn't restart from zero.
  * Use **`background_downloader`** for uploads that continue in the background (URLSession on iOS, WorkManager on Android).
* Compress before uploading. Generate thumbnails with `video_thumbnail`. Show progress and allow cancel and retry.
* Validate type and size on **both** the client and the server.

---

## 34.9 Interview questions — media

**Q1. `image_picker` vs `camera`?**
image_picker opens the system picker or camera to choose a single photo or video. It's simple and needs no permission for the gallery on modern Android. The `camera` plugin gives you a live preview and full control for building a custom camera UI, image streams and video recording.

**Q2. Why must you dispose the CameraController on `inactive`?**
The camera is an exclusive OS resource. If you don't release it in the background, other apps can't use it and your preview breaks or crashes on resume. Set it up again on `resumed`.

**Q3. How do you reduce image upload size?**
Pass `maxWidth`/`imageQuality` to the picker, use native compression, convert to WebP/JPEG, strip EXIF data, and upload through pre-signed URLs.

**Q4. How do you build a TikTok-style feed efficiently?**
Use a PageView with at most ~3 live video controllers. Preload the next video and dispose far-away ones. Play only the visible item, use HLS with caching, and pause when the screen is covered or the app is in the background.

**Q5. How do you play audio in the background with lock-screen controls?**
Use audio_service (a foreground service and media session on Android; background mode `audio` on iOS) together with just_audio, and configure audio_session to handle interruptions.

**Q6. What does `retrieveLostData` solve?**
Android can kill your activity while the camera app is open. retrieveLostData recovers the picked result when the app restarts.

**Q7. How do you scan QR codes?**
With mobile_scanner (ML Kit / AVFoundation). It handles the preview, detection, the torch and lifecycle.

**Q8. Why doesn't `File` work with picked images on web?**
dart:io doesn't exist on the web. XFile gives you bytes (`readAsBytes`) and a blob URL instead.
