# Chapter 25 — Mobile App Security for Flutter (OWASP MASVS in Practice)

> **Goal:** Build apps that protect user data and company systems. Banks, fintech, health and enterprise clients will ask about these topics, and security interviews for senior roles use OWASP terminology.

---

## 25.1 The golden rule 🔑

> **The app runs on a device you don't control. Anything inside the app (code, strings, assets, API keys) can be extracted, and any check in the app can be bypassed.**

**5-year-old:** Your app is a **letter you mail to a stranger**. You can put it in an envelope (obfuscation), but they can still open it. So **never write your secret password inside the letter** — keep secrets in your own house (the server).

Therefore: real security decisions (authorization, prices, payment success, feature entitlements) happen on the **server**. The client adds **defense in depth**.

---

## 25.2 OWASP Mobile Top 10 (2024) → Flutter mapping
| Risk | Flutter-specific practice |
|---|---|
| M1 Improper Credential Usage | No hard-coded secrets; tokens in secure storage; short-lived tokens |
| M2 Inadequate Supply Chain Security | Vet packages, pin versions (lock file), dependency scanning, verified publishers, review native code in plugins |
| M3 Insecure Authentication/Authorization | Server-side authz; OAuth2 + PKCE; biometrics as convenience only; session expiry |
| M4 Insufficient Input/Output Validation | Validate input; parameterized SQL; sanitize WebView content; deep link parameter validation |
| M5 Insecure Communication | HTTPS/TLS only; no cleartext; certificate pinning for high-risk apps |
| M6 Inadequate Privacy Controls | Minimize PII, consent, privacy manifests, data deletion |
| M7 Insufficient Binary Protections | Obfuscation, integrity checks, root/jailbreak detection, anti-tamper (RASP) where justified |
| M8 Security Misconfiguration | Disable debug flags in release, `android:debuggable=false`, `allowBackup` rules, exported components |
| M9 Insecure Data Storage | Secure storage, encrypted DB, no sensitive data in logs/prefs/caches/screenshots |
| M10 Insufficient Cryptography | Use vetted libraries/platform crypto; no custom crypto; proper key storage |

OWASP **MASVS** (verification standard) and **MASTG** (testing guide) are the references auditors use.

---

## 25.3 Secrets & API keys
* ❌ Hard-coding `const stripeSecretKey = 'sk_live_...'` — extractable from the binary (`strings libapp.so`) in minutes.
* ❌ `.env` assets — also bundled & readable.
* ✅ Keep secrets on the **backend**; the app calls your backend, which calls third parties.
* ✅ Public keys meant for clients (Firebase config, Stripe *publishable* key, Maps keys) are fine — **restrict them** (Android package + SHA-1, iOS bundle ID, HTTP referrers, API restrictions, quotas).
* ✅ `--dart-define` values are *not* secret either; `envied` obfuscation only slows attackers.
* Rotate keys if leaked; add secret scanning in CI (gitleaks, GitHub secret scanning); never commit keystores/`key.properties`/service account JSON.

---

## 25.4 Authentication & sessions
* OAuth 2.0 / OIDC with **Authorization Code + PKCE** (`flutter_appauth`) for third-party identity providers; system browser (ASWebAuthenticationSession / Custom Tabs), never embedded WebView for credentials.
* Access token short-lived (5–15 min), refresh token longer & rotated; store in secure storage; refresh with locking (Chapter 16).
* Logout: revoke tokens server-side, clear secure storage, DB, caches, in-memory state.
* **Biometrics** (`local_auth`) unlock locally-stored credentials/keys; never treat "biometric success" as server authentication by itself. For strong binding, use keys in Keystore/Secure Enclave that require biometric auth (`CryptoObject`), via plugins or native code.
* Re-authenticate for sensitive actions (change password, payments).
* Device binding / attestation: **Play Integrity API**, **App Attest/DeviceCheck** (iOS), Firebase App Check — backend verifies the request comes from a genuine app on a genuine device.
* Rate limiting & lockouts on the server; CAPTCHA/bot protection where needed.

---

## 25.5 Secure data storage
* Tokens/keys → `flutter_secure_storage` (Chapter 17 gotchas: iOS keychain persists after uninstall; Android backup restore).
* Sensitive DBs → SQLCipher / encrypted Hive with key in secure storage.
* Don't log sensitive data (`print(token)`!); strip logs in release; scrub crash reports.
* Caches: HTTP caches may store sensitive responses — disable caching for sensitive endpoints (`Cache-Control: no-store`).
* Clipboard: avoid copying secrets; clear after timeout; Android 13+ shows clipboard preview — mark sensitive (`ClipDescription.EXTRA_IS_SENSITIVE` via native).
* **Screenshots / app switcher snapshots**: hide sensitive screens:
  * Android: `FLAG_SECURE` (`WindowManager.LayoutParams.FLAG_SECURE`) via a plugin (`flutter_windowmanager_plus`, `no_screenshot`, `screen_protector`) or native code — blocks screenshots/recording and blanks recents thumbnail.
  * iOS: can't fully block screenshots; detect via `UIApplication.userDidTakeScreenshotNotification`; obscure content when going to background (overlay on `inactive` lifecycle state) and detect screen recording (`UIScreen.isCaptured`).
* Keyboard: `enableSuggestions: false`, `autocorrect: false` for sensitive fields; `obscureText` for passwords (prevents keyboard learning on most IMEs).

---

## 25.6 Network security
* HTTPS only (Android blocks cleartext by default since API 28; iOS ATS).
* **Certificate / public key pinning** for high-risk apps:
```dart
// Dio with a custom HttpClient (native platforms)
(dio.httpClientAdapter as IOHttpClientAdapter).createHttpClient = () {
  final client = HttpClient(context: SecurityContext(withTrustedRoots: false)
    ..setTrustedCertificatesBytes(pinnedCertPemBytes));   // trust ONLY your cert/CA
  return client;
};
// Alternative: validateCertificate callback in IOHttpClientAdapter checking SHA-256 fingerprint of cert.der
```
  Plan **rotation** (pin multiple keys/CA, remote-config fallback, expiry monitoring) — pinning failures brick older app versions.
* Android `network_security_config.xml` can declare pins and debug-only user CA trust.
* Don't disable certificate validation (`badCertificateCallback = (_, __, ___) => true`) except in local debug with explicit guards.
* Validate server responses (types/sizes); limit redirects.

---

## 25.7 Code protection (binary hardening)
* **Obfuscation**: `flutter build apk --obfuscate --split-debug-info=build/symbols` — renames Dart symbols in the AOT snapshot. Keep symbols to de-obfuscate crashes. Note: obfuscation doesn't hide strings or logic flow; it raises the bar.
* Release builds are AOT machine code (harder to reverse than JS/Java bytecode) but tools (e.g., reFlutter, Blutter) can analyze Flutter snapshots — assume determined attackers can read your logic.
* Android R8 for Java/Kotlin code.
* **Root/jailbreak detection** (`flutter_jailbreak_detection`, `safe_device`, freeRASP/`freerasp` by Talsec): detect rooted devices, emulators, debuggers, hooking frameworks (Frida), tampering (signature mismatch), and react (warn, limit features, report to backend). All bypassable by skilled attackers → combine with server-side attestation (Play Integrity / App Attest).
* Don't rely on client checks for business rules (e.g., "isPremium" flag in prefs → server must enforce).

---

## 25.8 Input validation & injection
* SQL: always parameterized (`whereArgs`), Drift handles this.
* WebView: don't load untrusted URLs with JS bridges enabled; validate `JavascriptChannel` messages; restrict navigation (`NavigationDelegate`); don't expose sensitive native functions to web content.
* Deep links: treat parameters as untrusted — validate IDs, don't auto-execute actions (e.g., `myapp://transfer?to=x&amount=1000` must require user confirmation & server checks); prevent open redirects.
* File paths: avoid path traversal when saving/downloading (`../`).
* Rendering HTML/Markdown from users: sanitize.

---

## 25.9 Platform configuration hardening
**Android**
* `android:debuggable` is false in release automatically — don't override.
* Exported components: `android:exported` explicit (required Android 12+); only export what's needed; protect with permissions.
* `android:allowBackup` / `dataExtractionRules` to exclude sensitive data.
* `usesCleartextTraffic=false`.
* Intent filters & PendingIntents with `FLAG_IMMUTABLE`.
* Keep `targetSdk` up to date (security behaviour changes).
* Tapjacking: `filterTouchesWhenObscured` for sensitive buttons (native).

**iOS**
* ATS enabled; keychain accessibility classes; `NSFaceIDUsageDescription` for Face ID; Privacy manifest (`PrivacyInfo.xcprivacy`); data protection entitlement (`NSFileProtectionComplete`) for files.
* Universal Links instead of custom schemes for sensitive flows (custom schemes can be hijacked).

**Web**
* XSS considerations (HtmlElementView, `dart:js_interop`), CSP headers, don't store tokens in localStorage if avoidable (prefer httpOnly cookies with backend), CORS correctly configured server-side.

---

## 25.10 Supply chain & dependencies
* Review packages before adding (Chapter 2 checklist), especially plugins with native code and broad permissions.
* Commit `pubspec.lock`; pin git dependencies to commit SHAs.
* Dependency update cadence with changelog review; Dependabot/Renovate for pub (supported).
* OSV scanner (`osv-scanner --lockfile=pubspec.lock`) for known vulnerabilities.
* Protect CI secrets (signing keys in secret storage, least privilege), signed commits/tags if required, SBOM generation for regulated industries.

---

## 25.11 Privacy & compliance
* Collect minimum data; get consent (GDPR/DPDP/CCPA); ATT prompt on iOS for tracking; Google Play **Data safety** form & App Store **privacy nutrition labels** must match reality (SDKs included!).
* Account deletion in-app is **required** by both Apple (since 2022) and Google Play (since 2023/2024) if you allow account creation.
* Children's apps: COPPA / Families policy restrictions on ads/analytics SDKs.
* Health/finance: HIPAA, PCI-DSS (never store card data; use gateway SDKs/tokenization), RBI guidelines (India) for payments & data localization.

---

## 25.12 Security testing
* Static analysis: MobSF (Mobile Security Framework) on APK/IPA; lints; secret scanning.
* Dynamic: proxy traffic (Burp/mitmproxy) to verify TLS/pinning and no sensitive data leakage; Frida-based tests in pentests.
* Third-party penetration testing before major releases for regulated apps.
* Threat modeling (STRIDE) for new features handling sensitive data.

---

## 25.13 Interview Questions — Security

**Q1. How do you store sensitive data in Flutter?** flutter_secure_storage (Keychain/Keystore) for small secrets; encrypted DB for larger data; never SharedPreferences/plain files; clear on logout.

**Q2. How do you protect API keys?** Don't ship secrets; proxy via backend; restrict public client keys by app signature/bundle/API; use App Check/attestation.

**Q3. What is certificate pinning and its risk?** Trusting only specific certs/keys for your domains to block MITM; risk of breaking the app on certificate rotation — pin multiple keys, plan rotation.

**Q4. Does obfuscation make the app secure?** No — it raises reverse-engineering cost; secrets and critical logic must stay on the server.

**Q5. How do you prevent screenshots of sensitive screens?** Android FLAG_SECURE; on iOS obscure content when backgrounded and detect screen capture/screenshot.

**Q6. What is OWASP MASVS?** The OWASP Mobile Application Security Verification Standard defining security requirements (storage, crypto, auth, network, platform, code quality, resilience, privacy).

**Q7. How do you implement secure authentication?** OAuth2/OIDC with PKCE via system browser, short-lived tokens, refresh rotation, secure storage, server-side authorization, MFA/biometric re-auth for sensitive actions.

**Q8. What is root/jailbreak detection and its limitations?** Detects compromised devices/hooking; bypassable — combine with server-side integrity attestation and risk-based responses.

**Q9. How do you secure deep links?** Use verified App Links/Universal Links, validate parameters, require auth/confirmation for actions, avoid sensitive data in URLs.

**Q10. How do you handle third-party package risk?** Vetting, version pinning, vulnerability scanning, minimal permissions, code review of native parts, update policies.
