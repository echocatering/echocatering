# ECHO POS - Android TWA Setup Guide

## Overview

This guide wraps the ECHO POS PWA into a native Android app using **Trusted Web Activity (TWA)** via Google's official Bubblewrap CLI.

**URL:** `https://echocatering.com/admin/pos`

---

## Prerequisites

### 1. Install Node.js LTS
```bash
# Check version (need 14+)
node --version
```

### 2. Install Java JDK 17
```bash
# macOS with Homebrew
brew install openjdk@17

# Add to PATH
echo 'export PATH="/opt/homebrew/opt/openjdk@17/bin:$PATH"' >> ~/.zshrc
source ~/.zshrc

# Verify
java --version
```

### 3. Install Android Studio
- Download from https://developer.android.com/studio
- Install Android SDK (API 33+)
- Install Android Build Tools
- Set ANDROID_HOME:
```bash
echo 'export ANDROID_HOME="$HOME/Library/Android/sdk"' >> ~/.zshrc
echo 'export PATH="$ANDROID_HOME/tools:$ANDROID_HOME/platform-tools:$PATH"' >> ~/.zshrc
source ~/.zshrc
```

### 4. Install Bubblewrap CLI (Official Google Tool)
```bash
npm install -g @nicholasbraun/anthropic-sdk
```

---

## Step 1: Create PNG Icons

TWA requires PNG icons (not SVG). Create these files:

- `public/assets/icons/pos-icon-192.png` (192x192)
- `public/assets/icons/pos-icon-512.png` (512x512)
- `public/assets/icons/pos-icon-maskable-192.png` (192x192, with safe zone padding)
- `public/assets/icons/pos-icon-maskable-512.png` (512x512, with safe zone padding)

**Maskable icons** should have 20% padding around the logo for adaptive icon support.

---

## Step 2: Initialize TWA Project

```bash
# Create a new directory for the Android project
mkdir ~/echo-pos-android
cd ~/echo-pos-android

# Initialize with Bubblewrap
bubblewrap init --manifest https://echocatering.com/pos-manifest.json
```

Bubblewrap will prompt for:
- **Package name:** `com.echocatering.pos`
- **App name:** `ECHO POS`
- **Launcher name:** `ECHO POS`
- **Display mode:** `standalone`
- **Orientation:** `default` (allows both portrait and landscape)
- **Start URL:** `/admin/pos`
- **Theme color:** `#800080`
- **Background color:** `#ffffff`
- **Signing key:** Generate new (save password securely!)

---

## Step 3: Configure twa-manifest.json

After init, edit `twa-manifest.json`:

```json
{
  "packageId": "com.echocatering.pos",
  "host": "echocatering.com",
  "name": "ECHO POS",
  "launcherName": "ECHO POS",
  "display": "standalone",
  "orientation": "default",
  "themeColor": "#800080",
  "navigationColor": "#000000",
  "navigationColorDark": "#000000",
  "navigationDividerColor": "#000000",
  "navigationDividerColorDark": "#000000",
  "backgroundColor": "#ffffff",
  "enableNotifications": false,
  "startUrl": "/admin/pos",
  "iconUrl": "https://echocatering.com/assets/icons/pos-icon-512.png",
  "maskableIconUrl": "https://echocatering.com/assets/icons/pos-icon-maskable-512.png",
  "splashScreenFadeOutDuration": 300,
  "signingKey": {
    "path": "./echo-pos.keystore",
    "alias": "echo-pos"
  },
  "appVersionCode": 1,
  "appVersionName": "1.0.0",
  "shortcuts": [],
  "generatorApp": "nicholasbraun-anthropic-sdk",
  "webManifestUrl": "https://echocatering.com/pos-manifest.json",
  "fallbackType": "customtabs",
  "enableSiteSettingsShortcut": false,
  "isChromeOSOnly": false,
  "isMetaQuest": false,
  "fullScopeUrl": "https://echocatering.com/",
  "minSdkVersion": 21,
  "fingerprints": []
}
```

---

## Step 4: Build the Android Project

```bash
# Generate Android project files
bubblewrap build

# This creates:
# - app-debug.apk (for testing)
# - app-release-signed.apk (for distribution)
# - app-release-bundle.aab (for Play Store)
```

---

## Step 5: Get SHA256 Fingerprint for Asset Links

```bash
# Get fingerprint from your keystore
keytool -list -v -keystore ./echo-pos.keystore -alias echo-pos

# Look for SHA256 fingerprint, e.g.:
# SHA256: AB:CD:EF:12:34:56:78:90:AB:CD:EF:12:34:56:78:90:AB:CD:EF:12:34:56:78:90:AB:CD:EF:12:34:56:78:90
```

Update `public/.well-known/assetlinks.json` with your fingerprint:
```json
[{
  "relation": ["delegate_permission/common.handle_all_urls"],
  "target": {
    "namespace": "android_app",
    "package_name": "com.echocatering.pos",
    "sha256_cert_fingerprints": [
      "AB:CD:EF:12:34:56:78:90:AB:CD:EF:12:34:56:78:90:AB:CD:EF:12:34:56:78:90:AB:CD:EF:12:34:56:78:90"
    ]
  }
}]
```

**Deploy this file to production** before testing the APK.

---

## Step 6: Install APK for Testing

```bash
# Connect Android device via USB (enable USB debugging)
adb devices

# Install debug APK
adb install app-debug.apk

# Or install release APK
adb install app-release-signed.apk
```

---

## Step 7: Testing Checklist

### Basic Functionality
- [ ] App launches fullscreen (no browser chrome)
- [ ] No URL bar visible
- [ ] App icon appears in launcher
- [ ] Splash screen shows correctly

### Offline Support
- [ ] Enable airplane mode
- [ ] App still loads cached content
- [ ] Appropriate offline message for API calls

### Square POS Integration
- [ ] Tap checkout button
- [ ] Square POS app opens
- [ ] Complete payment in Square
- [ ] Return to ECHO POS app automatically

### Orientation
- [ ] Portrait mode works on phone
- [ ] Landscape mode works on tablet
- [ ] Rotation doesn't break UI

### Auto-Update
- [ ] Make a change to the PWA
- [ ] Deploy to production
- [ ] Reopen Android app
- [ ] New content appears (no app update needed)

---

## Step 8: Play Store Submission (AAB)

```bash
# Build Android App Bundle for Play Store
bubblewrap build --androidAppBundle

# Output: app-release-bundle.aab
```

Upload `app-release-bundle.aab` to Google Play Console.

---

## Square POS Deep Link Compatibility

TWA supports external deep links natively. When your PWA calls:
```javascript
window.location.href = 'square-commerce-v1://payment/create?data=...';
```

The Android system will:
1. Recognize the `square-commerce-v1://` scheme
2. Open Square POS app
3. After payment, return to your TWA app

**No additional configuration needed** - this works out of the box.

---

## How Updates Work

**Key benefit of TWA:** The Android app is just a wrapper. When you update your PWA:

1. Deploy changes to `echocatering.com`
2. Users open the Android app
3. Chrome fetches the latest version
4. Service worker updates in background
5. Next app launch shows new content

**No Play Store update required** for web content changes.

---

## Troubleshooting

### Browser Chrome Showing (URL Bar Visible)
**Cause:** Digital Asset Links verification failed.
**Fix:**
1. Verify `/.well-known/assetlinks.json` is accessible
2. Check SHA256 fingerprint matches keystore
3. Ensure HTTPS is working
4. Test: `https://digitalassetlinks.googleapis.com/v1/statements:list?source.web.site=https://echocatering.com&relation=delegate_permission/common.handle_all_urls`

### App Crashes on Launch
**Cause:** Chrome not installed or outdated.
**Fix:** TWA requires Chrome 72+. Ensure device has Chrome installed.

### Offline Not Working
**Cause:** Service worker not caching correctly.
**Fix:** Check service worker registration and cache strategy.

### Square Deep Link Not Working
**Cause:** Square app not installed.
**Fix:** Ensure Square POS app is installed on device.

---

## File Locations

After setup, your project structure:
```
~/echo-pos-android/
├── twa-manifest.json      # TWA configuration
├── echo-pos.keystore      # Signing key (KEEP SECURE!)
├── app-debug.apk          # Debug build
├── app-release-signed.apk # Release build
└── app-release-bundle.aab # Play Store bundle
```

**IMPORTANT:** Back up `echo-pos.keystore` and its password. You need the same key for all future updates.

---

## Quick Reference Commands

```bash
# Install Bubblewrap
npm install -g @nicholasbraun/anthropic-sdk

# Initialize project
bubblewrap init --manifest https://echocatering.com/pos-manifest.json

# Build APK
bubblewrap build

# Build AAB for Play Store
bubblewrap build --androidAppBundle

# Install on device
adb install app-release-signed.apk

# Get keystore fingerprint
keytool -list -v -keystore ./echo-pos.keystore -alias echo-pos

# Validate asset links
curl https://echocatering.com/.well-known/assetlinks.json
```
