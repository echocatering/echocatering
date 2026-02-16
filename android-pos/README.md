# ECHO POS - Android Native App

Native Android POS application for ECHO Catering with Stripe Terminal M2 reader integration.

## Features

- **Stripe Terminal M2 Integration**: Bluetooth card reader support for in-person payments
- **Menu Management**: Categories, items, and modifiers synced from backend
- **Cart System**: Add/remove items with real-time total calculation
- **Tipping**: Pre-set tip percentages (15%, 20%, 25%) or custom amount
- **Sales Recording**: All transactions saved to MongoDB for analytics

## Requirements

- Android Studio Hedgehog (2023.1.1) or newer
- Android SDK 34
- JDK 17
- Physical Android device with Bluetooth (emulator won't work with real M2 reader)

## Setup

### 1. Open in Android Studio

```bash
cd android-pos
# Open this folder in Android Studio
```

### 2. Build & Run

1. Connect your Android device via USB
2. Enable USB debugging on the device
3. Click **Run** in Android Studio

## Pairing the M2 Reader

1. **Power on** the M2 reader (hold power button)
2. **Enter pairing mode**: Hold power button 5+ seconds until LED flashes blue
3. Open the app and tap **"No Reader"** in the header
4. Tap **"Scan for Readers"**
5. Select your reader from the list
6. Wait for connection (LED turns solid green)

## Payment Flow

1. Add items to cart from menu
2. Tap **Checkout**
3. Customer selects tip amount
4. Tap **Pay $X.XX**
5. Customer taps/inserts/swipes card on M2 reader
6. Payment confirmed → Cart cleared

## Troubleshooting

### Reader not found
- Ensure Bluetooth is enabled
- Check reader is in pairing mode (flashing blue LED)
- Grant all requested permissions

### Connection token error
- Verify `STRIPE_SECRET_KEY` is set in backend
- Check backend is running and accessible

### Payment fails
- Ensure reader is connected (solid green LED)
- Check minimum amount ($0.50 USD)
- Verify Stripe account is in live mode for real cards

## License

Proprietary - ECHO Catering
