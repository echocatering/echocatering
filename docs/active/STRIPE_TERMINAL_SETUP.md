# Stripe Terminal M2 Reader Setup Guide

This guide walks through setting up Stripe Terminal with the M2 card reader for the ECHO POS system.

## Prerequisites

- Stripe account (you have this ✓)
- Stripe M2 card reader hardware
- Android device for the POS app

---

## Part 1: Stripe Dashboard Configuration

### Step 1: Enable Stripe Terminal

1. Go to [Stripe Dashboard](https://dashboard.stripe.com)
2. Navigate to **Payments** → **Readers** → **Terminal**
3. If Terminal isn't enabled, click **Get started with Terminal**
4. Select your business type and complete the onboarding

### Step 2: Create a Location

Stripe Terminal requires a "Location" to associate readers with:

1. Go to **Payments** → **Readers** → **Locations**
2. Click **+ New location**
3. Enter your business details:
   - **Display name**: "ECHO Catering POS" (or your preferred name)
   - **Address**: Your business address
4. Click **Create location**
5. **Copy the Location ID** (starts with `tml_...`) - you'll need this

### Step 3: Get Your API Keys

1. Go to **Developers** → **API keys**
2. Copy your **Secret key** (starts with `sk_live_...` or `sk_test_...`)
3. Add to your `.env` file:

```env
STRIPE_SECRET_KEY=sk_live_your_key_here
STRIPE_LOCATION_ID=tml_your_location_id_here
```

> ⚠️ **Important**: Use `sk_test_...` keys for development/testing, `sk_live_...` for production

---

## Part 2: M2 Reader Pairing

The M2 reader connects via **Bluetooth** and must be paired through the native Android app (not web).

### Step 1: Charge Your M2 Reader

- Charge the M2 reader fully before first use (USB-C cable)
- The LED will turn solid green when fully charged

### Step 2: Put Reader in Pairing Mode

1. **Turn on** the M2 reader (hold power button until LED lights up)
2. **Enter pairing mode**: Hold the power button for 5+ seconds until the LED flashes blue
3. The reader is now discoverable via Bluetooth

### Step 3: Register Reader with Stripe

The Android app will handle Bluetooth discovery and registration. The registration process:

1. App discovers the M2 via Bluetooth
2. App gets a **registration code** from the reader
3. App sends registration code to your backend
4. Backend calls Stripe API to register the reader
5. Reader is now associated with your Stripe account and location

---

## Part 3: Environment Variables

Add these to your `.env` file:

```env
# Stripe Terminal Configuration
STRIPE_SECRET_KEY=sk_live_xxxxxxxxxxxxxxxxxxxxx
STRIPE_LOCATION_ID=tml_xxxxxxxxxxxxxxxxxxxxx

# Optional: Webhook secret for payment events
STRIPE_WEBHOOK_SECRET=whsec_xxxxxxxxxxxxxxxxxxxxx
```

---

## Part 4: Backend API Endpoints

Your backend already has these endpoints at `/api/stripe/`:

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/connection-token` | POST | Get token for Terminal SDK |
| `/payment-intent` | POST | Create payment intent |
| `/capture-payment` | POST | Capture authorized payment |
| `/readers` | GET | List registered readers |
| `/register-reader` | POST | Register new reader |

---

## Part 5: Payment Flow

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  Android App    │     │   Your Backend  │     │   Stripe API    │
└────────┬────────┘     └────────┬────────┘     └────────┬────────┘
         │                       │                       │
         │ 1. Request connection token                   │
         │──────────────────────>│                       │
         │                       │ 2. Create token       │
         │                       │──────────────────────>│
         │                       │<──────────────────────│
         │<──────────────────────│                       │
         │                       │                       │
         │ 3. Connect to M2 reader (Bluetooth)           │
         │═══════════════════════════════════════════════│
         │                       │                       │
         │ 4. Create payment intent (amount, metadata)   │
         │──────────────────────>│                       │
         │                       │ 5. Create PI          │
         │                       │──────────────────────>│
         │                       │<──────────────────────│
         │<──────────────────────│ (client_secret)       │
         │                       │                       │
         │ 6. Collect payment on reader                  │
         │═══════════════════════│═══════════════════════│
         │ (Customer taps/inserts card)                  │
         │                       │                       │
         │ 7. Process payment result                     │
         │──────────────────────>│                       │
         │                       │ 8. Capture payment    │
         │                       │──────────────────────>│
         │                       │<──────────────────────│
         │<──────────────────────│ (success/failure)     │
         │                       │                       │
         │ 9. Save sale to database                      │
         │──────────────────────>│                       │
         │                       │ (Store in MongoDB)    │
```

---

## Part 6: Testing

### Test Mode

1. Use `sk_test_...` API key
2. Use Stripe's simulated reader in the Terminal SDK
3. Test card numbers:
   - **Success**: 4242 4242 4242 4242
   - **Decline**: 4000 0000 0000 0002

### Production Mode

1. Switch to `sk_live_...` API key
2. Connect real M2 reader
3. Process real cards

---

## Troubleshooting

### Reader Won't Pair
- Ensure reader is in pairing mode (flashing blue LED)
- Check Bluetooth is enabled on Android device
- Try restarting both reader and phone

### Connection Token Errors
- Verify `STRIPE_SECRET_KEY` is set correctly
- Check API key has Terminal permissions

### Payment Failures
- Check reader is connected (solid green LED)
- Ensure payment intent amount is > $0.50 USD
- Verify card is valid and has funds

---

## Next Steps

1. ✅ Configure Stripe Dashboard (Location, API keys)
2. ⏳ Build Android app with Stripe Terminal SDK
3. ⏳ Pair M2 reader through the app
4. ⏳ Test payment flow
5. ⏳ Go live!
