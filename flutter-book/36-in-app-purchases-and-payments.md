# Chapter 36 — In-App Purchases, Subscriptions & Payment Gateways (Full Code)

> **Goal:** Sell digital products with Apple/Google billing correctly (including server verification, restores and subscription states), and take payments for physical goods with Stripe and Razorpay. Money bugs are the most expensive bugs, so follow the rules in this chapter carefully.

---

## 36.1 5-year-old picture 💰
If you sell **stickers that live inside the app** (coins, premium mode), the **app store is the shopkeeper** and takes its share. If you sell **real things** (shoes, pizza, taxi rides), you use a normal **cash register** (payment gateway) like Stripe or Razorpay. And never trust the child (the app) when it says "I paid!". Always ask the bank (your server) to check.

## 36.2 Which payment system? (store policies)
| You sell | Use | Notes |
|---|---|---|
| Digital content/features used in the app (premium, coins, subscriptions, ad removal) | **Apple IAP / Google Play Billing** | Required by App Store guideline 3.1.1 and Google Play's payments policy. There are regional exceptions: e.g., US external purchase links on iOS after the 2025 court ruling, EU DMA alternatives, Play alternative/user-choice billing in some countries. Check current rules before deciding |
| Physical goods/services (e-commerce, food, rides, tickets, consulting) | Payment gateway (Stripe, Razorpay, PayPal, Adyen, Braintree), Apple Pay / Google Pay via gateway | Store billing **not allowed** for these |
| "Reader" apps (Netflix/Spotify style) | Special rules (external link entitlement) | Check Apple's reader app rules |
| Person-to-person payments, donations to registered charities | Special cases | Check the guidelines |

---

## 36.3 Store product types
| Type | Apple | Google | Example |
|---|---|---|---|
| Consumable | Consumable | In-app product (consume after use) | Coins, gems |
| Non-consumable | Non-consumable | In-app product (not consumed) | Remove ads, unlock a level pack |
| Auto-renewing subscription | Auto-renewable subscription (subscription groups) | Subscription with base plans & offers | Premium monthly/yearly |
| Non-renewing subscription | Non-renewing | (model as in-app product) | Season pass |

Products are set up in **App Store Connect** (with agreements, tax and banking completed) and **Play Console** (the app must be uploaded to a testing track first). Product IDs should match across stores where possible (e.g., `premium_monthly`).

---

## 36.4 `in_app_purchase` (official plugin): complete purchase flow

```dart
import 'dart:async';
import 'package:in_app_purchase/in_app_purchase.dart';

class BillingService {
  BillingService(this._api);
  final PurchaseVerificationApi _api;          // your backend
  final InAppPurchase _iap = InAppPurchase.instance;
  StreamSubscription<List<PurchaseDetails>>? _sub;

  static const premiumMonthly = 'premium_monthly';
  static const coins100 = 'coins_100';
  static const removeAds = 'remove_ads';

  final _products = <String, ProductDetails>{};
  final _status = StreamController<BillingEvent>.broadcast();
  Stream<BillingEvent> get events => _status.stream;

  /// ❗ Call EARLY (e.g., at app start), so purchases completed while the app was
  /// closed or interrupted (pending, renewals, family approvals) are delivered and handled.
  Future<void> init() async {
    _sub = _iap.purchaseStream.listen(
      _onPurchases,
      onError: (Object e) => _status.add(BillingError('$e')),
    );
    if (!await _iap.isAvailable()) {
      _status.add(BillingError('Store not available'));
      return;
    }
    final response = await _iap.queryProductDetails({premiumMonthly, coins100, removeAds});
    if (response.notFoundIDs.isNotEmpty) {
      // Wrong IDs, products not approved yet, app not uploaded to a test track, or agreements missing
      _status.add(BillingError('Missing products: ${response.notFoundIDs}'));
    }
    for (final p in response.productDetails) {
      _products[p.id] = p;              // p.title, p.description, p.price (localized string), p.rawPrice, p.currencyCode
    }
  }

  ProductDetails? product(String id) => _products[id];

  Future<void> buy(String productId, {required String appUserId}) async {
    final product = _products[productId];
    if (product == null) throw StateError('Product $productId not loaded');
    final param = PurchaseParam(
      productDetails: product,
      applicationUserName: appUserId,   // links the purchase to your user (obfuscated account id on Play)
    );
    if (productId == coins100) {
      await _iap.buyConsumable(purchaseParam: param, autoConsume: true);
    } else {
      await _iap.buyNonConsumable(purchaseParam: param);   // ALSO used for subscriptions
    }
    // The result does NOT come back here. It arrives on purchaseStream.
  }

  Future<void> restore() => _iap.restorePurchases();     // App Store requires a visible "Restore Purchases" button

  Future<void> _onPurchases(List<PurchaseDetails> purchases) async {
    for (final p in purchases) {
      switch (p.status) {
        case PurchaseStatus.pending:
          _status.add(BillingPending(p.productID));       // e.g., cash payment or parental approval. Don't grant yet!
        case PurchaseStatus.canceled:
          _status.add(BillingCancelled(p.productID));
        case PurchaseStatus.error:
          _status.add(BillingError(p.error?.message ?? 'Purchase failed'));
        case PurchaseStatus.purchased:
        case PurchaseStatus.restored:
          // ❗ Verify on YOUR server before granting anything
          final ok = await _api.verify(
            platform: p.verificationData.source,                         // 'app_store' / 'google_play'
            productId: p.productID,
            token: p.verificationData.serverVerificationData,           // Play purchase token / App Store receipt or JWS (depends on plugin/StoreKit version)
          );
          if (ok) {
            _status.add(BillingSuccess(p.productID));
          } else {
            _status.add(BillingError('Verification failed'));
          }
      }
      // ❗ Always complete. On Android, a purchase not acknowledged within 3 days is
      // AUTOMATICALLY REFUNDED. On iOS, unfinished transactions are delivered again on every launch.
      if (p.pendingCompletePurchase) {
        await _iap.completePurchase(p);
      }
    }
  }

  Future<void> dispose() async {
    await _sub?.cancel();
    await _status.close();
  }
}

sealed class BillingEvent {}
final class BillingPending extends BillingEvent { BillingPending(this.productId); final String productId; }
final class BillingCancelled extends BillingEvent { BillingCancelled(this.productId); final String productId; }
final class BillingSuccess extends BillingEvent { BillingSuccess(this.productId); final String productId; }
final class BillingError extends BillingEvent { BillingError(this.message); final String message; }
```
> **When to complete a purchase:** complete it **after** your server has verified and granted the entitlement. If verification fails because of a temporary network error, don't complete it yet. The purchase will be delivered again so you can retry, but on Android remember the 3-day acknowledgement limit. If the purchase is invalid, complete it (or let it be refunded) and don't grant anything.

### Paywall UI snippet
```dart
final product = billing.product(BillingService.premiumMonthly);
FilledButton(
  onPressed: product == null ? null : () => billing.buy(product.id, appUserId: userId),
  child: Text(product == null ? 'Loading…' : 'Go Premium — ${product.price}/month'),  // ALWAYS show the store's localized price
);
TextButton(onPressed: billing.restore, child: const Text('Restore purchases'));
```
Paywall rules: show the price, the billing period, and the trial terms ("then ₹299/month"). Link to Terms and the Privacy Policy. Don't trick users. Apple and Google both reject misleading paywalls.

### Platform-specific extras
* **Android subscriptions with offers/base plans:** cast to `GooglePlayProductDetails` to get `subscriptionOfferDetails`. Upgrades/downgrades use `GooglePlayPurchaseParam(changeSubscriptionParam: ChangeSubscriptionParam(oldPurchaseDetails: ..., replacementMode: ...))`.
* **iOS:** `InAppPurchaseStoreKitPlatformAddition` gives access to the code redemption sheet and the offer code UI. Newer plugin versions support StoreKit 2.
* Use **Xcode StoreKit configuration files** for local testing without App Store Connect. Use sandbox testers, and Play **license testers** plus internal testing tracks.

---

## 36.5 Server-side verification & entitlements (the important part) 🔐
```
App ──purchase token──► Your backend ──► Google Play Developer API (purchases.products / purchases.subscriptionsv2)
                                     └──► App Store Server API (transaction info, JWS verification)
         ◄── entitlement (premium until 2026-11-15) ──┘
Store ──server notifications──► Your backend   (renewals, cancellations, refunds, billing retry, grace period)
        • Google: Real-Time Developer Notifications (Pub/Sub)
        • Apple: App Store Server Notifications V2
```
* The **server is the source of truth** for entitlements. The app asks `GET /me/entitlements` at startup and after purchases. It caches the answer locally for offline use, with a short trust window.
* Protect against **replay**: one purchase token per user, and store the token with its order ID.
* Handle every subscription state: active, in **grace period** (payment issue but access continues), **on hold / billing retry** (access paused), cancelled-but-active-until-expiry, expired, refunded/revoked, paused (Play), upgraded/downgraded.
* Never decide "premium" from a client-side flag in SharedPreferences. That can be changed on a rooted device.

---

## 36.6 RevenueCat (managed subscriptions backend), the common choice
RevenueCat (`purchases_flutter`) handles receipt validation, entitlements, cross-platform subscription status, webhooks, paywalls (`purchases_ui_flutter`), analytics and experiments.
```dart
await Purchases.configure(PurchasesConfiguration(Platform.isIOS ? appleApiKey : googleApiKey)..appUserID = userId);
final offerings = await Purchases.getOfferings();
final package = offerings.current?.monthly;
if (package != null) {
  // Method names changed across major versions (e.g., purchasePackage vs purchase(PurchaseParams...)). Check your version.
  final result = await Purchases.purchasePackage(package);
}
final info = await Purchases.getCustomerInfo();
final isPremium = info.entitlements.active.containsKey('premium');
Purchases.addCustomerInfoUpdateListener((info) { /* update UI */ });
```
Trade-off: you pay RevenueCat fees above a revenue threshold, and you depend on a vendor, but you save a lot of backend work. Alternatives: Adapty, Qonversion, Glassfy.

---

## 36.7 Stripe (`flutter_stripe`) for physical goods/services

### Flow (PaymentIntent + Payment Sheet)
```
1. App → your backend: "create order for cart X"
2. Backend → Stripe: create PaymentIntent(amount, currency, customer, idempotency key) → returns client_secret
   (+ ephemeral key & customer id if saving cards)
3. App: initPaymentSheet(clientSecret) → presentPaymentSheet()
4. Stripe → backend webhook: payment_intent.succeeded → backend marks order PAID (source of truth)
5. App polls/listens for order status (don't rely only on the app callback)
```
### Setup
* Android: `MainActivity` must extend **`FlutterFragmentActivity`** (not FlutterActivity), and the app theme must be a `Theme.AppCompat`/`MaterialComponents` descendant. Otherwise the payment sheet crashes or does nothing.
* iOS: a minimum iOS version per the README. Apple Pay needs a merchant ID capability.

```dart
import 'package:flutter_stripe/flutter_stripe.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  Stripe.publishableKey = const String.fromEnvironment('STRIPE_PK');   // publishable key only. NEVER the secret key
  Stripe.merchantIdentifier = 'merchant.com.mycompany.shop';         // Apple Pay
  await Stripe.instance.applySettings();
  runApp(const App());
}

Future<PaymentOutcome> checkout(String orderId) async {
  final intent = await api.createPaymentIntent(orderId);   // backend returns clientSecret, customerId, ephemeralKey
  await Stripe.instance.initPaymentSheet(
    paymentSheetParameters: SetupPaymentSheetParameters(
      paymentIntentClientSecret: intent.clientSecret,
      merchantDisplayName: 'My Shop',
      customerId: intent.customerId,
      customerEphemeralKeySecret: intent.ephemeralKey,
      applePay: const PaymentSheetApplePay(merchantCountryCode: 'US'),
      googlePay: const PaymentSheetGooglePay(merchantCountryCode: 'US', testEnv: true),
      style: ThemeMode.system,
      returnURL: 'myshop://stripe-redirect',   // for redirect-based payment methods
    ),
  );
  try {
    await Stripe.instance.presentPaymentSheet();
    // The UI succeeded, but CONFIRM with the backend (webhook-updated order status)
    final paid = await api.waitForOrderPaid(orderId, timeout: const Duration(seconds: 20));
    return paid ? PaymentOutcome.success : PaymentOutcome.processing;
  } on StripeException catch (e) {
    if (e.error.code == FailureCode.Canceled) return PaymentOutcome.cancelled;
    return PaymentOutcome.failed;
  }
}
enum PaymentOutcome { success, processing, cancelled, failed }
```
3-D Secure (SCA) authentication is handled by the Payment Sheet. Use idempotency keys on the server so retries don't create duplicate charges.

---

## 36.8 Razorpay (popular in India) 🇮🇳
```dart
import 'package:razorpay_flutter/razorpay_flutter.dart';

class RazorpayCheckout {
  RazorpayCheckout(this._api) {
    _razorpay.on(Razorpay.EVENT_PAYMENT_SUCCESS, _onSuccess);
    _razorpay.on(Razorpay.EVENT_PAYMENT_ERROR, _onError);
    _razorpay.on(Razorpay.EVENT_EXTERNAL_WALLET, _onWallet);
  }
  final OrdersApi _api;
  final _razorpay = Razorpay();

  Future<void> pay({required String cartId, required String phone, required String email}) async {
    // 1. Backend creates the Razorpay ORDER (amount in paise, receipt id) with its key secret
    final order = await _api.createRazorpayOrder(cartId);
    // 2. Open checkout with the PUBLIC key id + order_id
    _razorpay.open({
      'key': order.keyId,
      'amount': order.amountPaise,          // e.g. 49900 = ₹499.00
      'currency': 'INR',
      'order_id': order.id,
      'name': 'My Shop',
      'description': 'Order #${order.receipt}',
      'prefill': {'contact': phone, 'email': email},
      'retry': {'enabled': true, 'max_count': 2},
    });
  }

  Future<void> _onSuccess(PaymentSuccessResponse r) async {
    // 3. ❗ Backend verifies the signature HMAC_SHA256(order_id + "|" + payment_id, key_secret) == r.signature
    await _api.verifyRazorpayPayment(orderId: r.orderId!, paymentId: r.paymentId!, signature: r.signature!);
  }

  void _onError(PaymentFailureResponse r) { /* r.code, r.message → show retry */ }
  void _onWallet(ExternalWalletResponse r) { /* r.walletName */ }

  void dispose() => _razorpay.clear();   // ❗ removes listeners
}
```
Also handle **payment captured webhooks** (`payment.captured`, `order.paid`) on the server. The app callback can be lost if the app is killed mid-payment. For UPI intent flows, check the plugin docs for the Android `<queries>` entries needed for UPI apps. Other Indian gateways: Cashfree, PayU, PhonePe PG, Paytm.

---

## 36.9 Google Pay / Apple Pay buttons (`pay` package)
The `pay` package shows the native Google Pay/Apple Pay buttons and returns a payment token. You send that token to your gateway (Stripe/Adyen/Braintree) on the server. The configuration JSON defines the gateway and merchant info. Apple Pay needs a merchant ID, a processing certificate and a domain or app capability.

---

## 36.10 Payment correctness checklist ✅
- [ ] Prices come from the server or store (never hard-coded or computed only on the client)
- [ ] The server creates orders/intents with **idempotency keys**
- [ ] The app never marks an order paid. **Webhooks** do, and the app reads the status
- [ ] Double-tap protection on the pay button
- [ ] Recovery when the app is killed mid-payment (check pending orders at launch)
- [ ] Every store purchase is verified server-side and completed/acknowledged
- [ ] Restore purchases button (iOS); subscription management link (Play / App Store)
- [ ] Refund/revocation notifications handled
- [ ] Testing: sandbox/license testers, test cards (4242…), failure cases, 3DS, slow networks
- [ ] PCI scope minimized (never touch raw card numbers; use SDK UIs/tokenization)
- [ ] Analytics: checkout funnel events; alerts on payment failure spikes

---

## 36.11 Common payment bugs
| Bug | Cause / Fix |
|---|---|
| Products not found | Product not active/approved, app not uploaded to a Play testing track, App Store agreements/tax/banking incomplete, bundle ID mismatch, waiting for propagation (can take hours) |
| Users refunded automatically after 3 days (Play) | Purchases never acknowledged → `completePurchase` after granting |
| "Purchase dialog appears again on every launch" (iOS) | Transactions not finished → `completePurchase` |
| Premium lost after reinstall | No restore flow / entitlement not fetched from the server |
| Payment sheet doesn't open on Android (Stripe) | `MainActivity` must be a `FlutterFragmentActivity`; AppCompat theme |
| Duplicate charges | No idempotency key; double taps |
| Paid but order shows failed | App killed before the callback → use webhooks + order status polling |
| Razorpay success but backend unverified | Signature verification missing |

---

## 36.12 Interview questions — payments

**Q1. When must you use in-app purchases instead of Stripe?**
For digital goods or features consumed in the app (premium, coins, subscriptions), store billing is required, with some regional exceptions. Physical goods and real-world services must use regular gateways.

**Q2. Why verify purchases on the server?**
Client data can be tampered with. Server verification against the Apple/Google APIs prevents fraud and replay. The server tracks entitlements and processes renewal and refund notifications.

**Q3. What happens if you don't acknowledge a Play purchase?**
It is automatically refunded after 3 days. On iOS, unfinished transactions keep being delivered again.

**Q4. How do you handle subscriptions' lifecycle?**
With server notifications (RTDN, App Store Server Notifications) that update the entitlement state: renewals, grace period, billing retry or hold, cancellation, expiry, refunds and plan changes. The app reads the entitlements from the backend.

**Q5. Describe a reliable Stripe checkout flow.**
The backend creates a PaymentIntent with an idempotency key. The app shows the Payment Sheet with the client secret. A Stripe webhook marks the order paid, and the app confirms the order status with the backend.

**Q6. How does Razorpay verification work?**
The backend creates the order. After checkout, the app sends payment_id, order_id and signature to the backend, which checks the HMAC-SHA256 with the key secret. Webhooks give extra assurance.

**Q7. RevenueCat — why use it?**
It manages receipt validation, cross-platform entitlements, webhooks, paywalls and analytics, so you don't build a subscription backend yourself. The trade-off is cost and vendor dependency.
