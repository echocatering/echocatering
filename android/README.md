# ECHO POS - TWA Square Callback Setup

## Overview

This document describes the TWA (Trusted Web Activity) configuration for reliable return-to-app flow when launching Square POS via deep link.

## How It Works

1. **User initiates checkout** in the ECHO POS app
2. **Square POS opens** via `square-commerce-v1://payment/create?data=...`
3. **User completes/cancels payment** in Square POS
4. **Square calls back** to `echocatering://square-callback?status=...`
5. **Android routes callback** to TWA app (not Chrome) via intent filter
6. **PWA parses callback** and shows success/error UI

## Custom Callback Scheme

The callback uses a custom scheme `echocatering://` instead of `https://` because:
- Custom schemes are routed by Android's intent system
- The TWA's `additionalIntentFilters` captures the custom scheme
- This ensures the callback returns to the TWA app, not Chrome
- Works reliably in kiosk/screen-pinned mode

## Files

### `twa-manifest.json`

Contains the TWA configuration including the critical `additionalIntentFilters`:

```json
{
  "additionalIntentFilters": [
    {
      "action": "android.intent.action.VIEW",
      "autoVerify": false,
      "categories": [
        "android.intent.category.DEFAULT",
        "android.intent.category.BROWSABLE"
      ],
      "data": {
        "scheme": "echocatering",
        "host": "square-callback"
      }
    }
  ]
}
```

This generates an AndroidManifest entry like:
```xml
<intent-filter>
    <action android:name="android.intent.action.VIEW"/>
    <category android:name="android.intent.category.DEFAULT"/>
    <category android:name="android.intent.category.BROWSABLE"/>
    <data android:scheme="echocatering" android:host="square-callback"/>
</intent-filter>
```

### Square Deep Link Payload

The PWA sends this payload to Square POS:

```javascript
const squarePaymentData = {
  amount_money: {
    amount: totalCents,  // Amount in cents
    currency_code: 'USD'
  },
  callback_url: 'echocatering://square-callback',  // Custom scheme!
  client_id: 'sq0idp-...',  // Your Square Client ID
  version: '1.3',
  notes: 'Tab: P1',
  location_id: 'L...',  // Your Square Location ID
  options: {
    supported_tender_types: ['CREDIT_CARD', 'CASH', 'OTHER', 'SQUARE_GIFT_CARD', 'CARD_ON_FILE']
  },
  state: JSON.stringify({
    tabId: 'tab-123',
    tabName: 'P1',
    testMode: false,
    tipAmount: 5.00,
    items: [{ name: 'Margarita', modifier: null, price: 12.00 }]
  })
};

// Encode as base64 and create deep link
const encodedData = btoa(JSON.stringify(squarePaymentData));
const deepLinkUrl = `square-commerce-v1://payment/create?data=${encodedData}`;
```

### PWA Callback Handler

Located in `src/admin/components/POSSalesUI.js`:

```javascript
useEffect(() => {
  const parseSquareCallback = () => {
    const urlParams = new URLSearchParams(window.location.search);
    
    const status = urlParams.get('status');
    const transactionId = urlParams.get('transaction_id');
    const errorCode = urlParams.get('error_code');
    
    if (status || transactionId || errorCode) {
      // Process callback...
      if (status === 'ok' && transactionId) {
        // Payment successful
      } else {
        // Payment canceled or failed
      }
    }
  };
  
  parseSquareCallback();
}, []);
```

## Build & Reinstall Instructions

### Prerequisites

```bash
# Install Bubblewrap CLI
npm install -g @nicholasbraun/anthropic-sdk

# Ensure Java JDK 17 is installed
java --version

# Ensure Android SDK is configured
echo $ANDROID_HOME
```

### Build Steps

```bash
# Navigate to android directory
cd ~/echo-pos-android

# Copy the updated twa-manifest.json
cp /path/to/echo-catering/android/twa-manifest.json ./

# Rebuild the TWA
bubblewrap build

# This generates:
# - app-debug.apk (for testing)
# - app-release-signed.apk (for production)
```

### Install on Device

```bash
# Connect device via USB (enable USB debugging)
adb devices

# Uninstall old version first (important for intent filter changes!)
adb uninstall com.echocatering.pos

# Install new APK
adb install app-release-signed.apk
```

### IMPORTANT: Reinstall Required

**Intent filter changes require a full reinstall.** Simply updating the APK is not enough:

1. The `additionalIntentFilters` are baked into the AndroidManifest at build time
2. Android caches intent filters from the installed app
3. You MUST uninstall and reinstall for changes to take effect

```bash
# Full reinstall sequence
adb uninstall com.echocatering.pos
adb install app-release-signed.apk
```

## Testing

### Test the Deep Link Flow

1. Open ECHO POS app on the tablet
2. Add items to a tab
3. Tap CHECKOUT
4. Square POS should open
5. Complete or cancel the payment
6. App should return to ECHO POS automatically
7. Success/error overlay should appear

### Test in Kiosk Mode

1. Enable screen pinning on the tablet
2. Pin the ECHO POS app
3. Perform a checkout
4. Verify Square opens (may require allowing Square in pinned mode)
5. Complete payment
6. Verify return to ECHO POS (not Chrome)

### Debug Logging

Check the browser console for callback parsing:
```
[POS] Checking for Square callback... {url, status, transactionId, errorCode}
[POS] Square callback received: {callbackData}
[POS] Payment successful! Transaction ID: xxx
```

## Troubleshooting

### Callback Opens Chrome Instead of TWA

**Cause:** Intent filter not registered properly
**Fix:** 
1. Verify `additionalIntentFilters` in twa-manifest.json
2. Rebuild with `bubblewrap build`
3. **Uninstall** old app: `adb uninstall com.echocatering.pos`
4. Install new APK: `adb install app-release-signed.apk`

### Square POS Doesn't Open

**Cause:** Square app not installed or deep link malformed
**Fix:**
1. Ensure Square POS app is installed
2. Check console for deep link URL
3. Verify CLIENT_ID is set in environment

### Callback Parameters Not Parsed

**Cause:** URL parameters stripped by TWA
**Fix:**
1. Check if URL contains query parameters
2. Verify the callback URL scheme matches intent filter
3. Check console for parsing errors

## Square Callback Response Format

### Successful Payment
```
echocatering://square-callback?status=ok&transaction_id=xxx&client_transaction_id=yyy
```

### Canceled Payment
```
echocatering://square-callback?status=error&error_code=payment_canceled
```

### Failed Payment
```
echocatering://square-callback?status=error&error_code=xxx
```

## Version History

- **v1.1.0** - Added custom callback scheme for reliable TWA return flow
- **v1.0.0** - Initial TWA setup with https callback (unreliable)
