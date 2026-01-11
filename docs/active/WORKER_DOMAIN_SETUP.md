# Setting up worker.echocatering.com (Permanent Domain)

## Step-by-Step Guide

### Prerequisites
- ✅ Domain `echocatering.com` is on Cloudflare
- ✅ You have `cloudflared` installed (`brew install cloudflare/cloudflare/cloudflared`)

---

## Step 1: Authenticate cloudflared with Cloudflare

```bash
cloudflared tunnel login
```

This opens your browser - authorize it with your Cloudflare account (the one that owns `echocatering.com`).

---

## Step 2: Create a Named Tunnel

```bash
cloudflared tunnel create worker-echo
```

**Output will look like:**
```
Tunnel credentials written to /Users/andybernegger/.cloudflared/<tunnel-id>.json
```

**Save the `<tunnel-id>`** (it's a UUID like `a1b2c3d4-e5f6-7890-abcd-ef1234567890`)

---

## Step 3: Create DNS Record (Easiest Method)

Cloudflare can create the DNS record automatically:

```bash
cloudflared tunnel route dns worker-echo worker.echocatering.com
```

**This automatically creates:**
- CNAME record: `worker` → `<tunnel-id>.cfargotunnel.com`
- Sets it to "Proxied" (orange cloud)

**✅ Done! Skip to Step 4.**

---

### Alternative: Manual DNS Setup (if auto-creation fails)

If the automatic DNS creation doesn't work, create it manually in Cloudflare Dashboard:

1. Go to Cloudflare Dashboard → `echocatering.com` → **DNS** → **Records**
2. Click **Add record**
3. Set:
   - **Type**: `CNAME`
   - **Name**: `worker`
   - **Target**: `<tunnel-id>.cfargotunnel.com` (replace with your tunnel ID from Step 2)
   - **Proxy status**: **Proxied** (orange cloud) ✅
   - **TTL**: Auto
4. Click **Save**

---

## Step 4: Create Tunnel Config File

Create/edit the config file:

```bash
mkdir -p ~/.cloudflared
nano ~/.cloudflared/config.yml
```

**Paste this (replace `<tunnel-id>` with your actual tunnel ID):**

```yaml
tunnel: <tunnel-id>
credentials-file: /Users/andybernegger/.cloudflared/<tunnel-id>.json

ingress:
  - hostname: worker.echocatering.com
    service: http://127.0.0.1:8787
  - service: http_status:404
```

**Save and exit** (in nano: `Ctrl+X`, then `Y`, then `Enter`)

---

## Step 5: Test the Tunnel

Start the tunnel (make sure your worker is running first):

```bash
# Terminal 1: Start the worker
cd /Users/andybernegger/echo-catering
set -a
source worker/local.env
set +a
node worker/index.js
```

```bash
# Terminal 2: Start the tunnel
cloudflared tunnel run worker-echo
```

You should see:
```
2026-01-11T18:30:00Z INF Requesting new quick Tunnel on trycloudflare.com...
2026-01-11T18:30:01Z INF +--------------------------------------------------------------------------------------------+
2026-01-11T18:30:01Z INF |  Your quick Tunnel has been created! Visit it at (it may take some time to be reachable): |
2026-01-11T18:30:01Z INF |  https://worker.echocatering.com                                                    |
2026-01-11T18:30:01Z INF +--------------------------------------------------------------------------------------------+
2026-01-11T18:30:02Z INF Connection established
```

**Test it:**
```bash
curl https://worker.echocatering.com/health
```

You should get:
```json
{"ok":true,"workerId":"andy-mac-worker","time":"2026-01-11T18:30:00.000Z"}
```

---

## Step 6: Update Render Environment Variable

1. Go to **Render Dashboard** → **Your Backend Service** → **Environment**
2. Find `VIDEO_WORKER_URL`
3. Set it to: `https://worker.echocatering.com`
4. Click **Save Changes**
5. Render will auto-redeploy (or manually redeploy if needed)

---

## Step 7: Verify from Render

After Render redeploys, check:

```bash
curl https://echocatering.com/api/video-worker/status
```

Should show:
```json
{
  "online": true,
  "workerId": "andy-mac-worker",
  "lastHeartbeatAt": "2026-01-11T18:30:00.000Z",
  "lastSeenSecondsAgo": 0,
  "configured": true
}
```

---

## ✅ Done!

Now `worker.echocatering.com` is permanent - it will **never change** even if you restart the tunnel or your computer.

---

## Running the Tunnel (Every Time You Process Videos)

**Two terminals:**

```bash
# Terminal 1: Worker
cd /Users/andybernegger/echo-catering
set -a && source worker/local.env && set +a
node worker/index.js
```

```bash
# Terminal 2: Tunnel
cloudflared tunnel run worker-echo
```

---

## Optional: Run Tunnel as a Service (Auto-Start on Reboot)

If you want the tunnel to start automatically when your Mac boots:

```bash
# Install the service
sudo cloudflared service install

# This creates a LaunchDaemon that runs the tunnel automatically
# It reads from ~/.cloudflared/config.yml

# Start it
sudo launchctl load /Library/LaunchDaemons/com.cloudflare.cloudflared.plist

# Check status
sudo launchctl list | grep cloudflared

# View logs
sudo log stream --predicate 'process == "cloudflared"' --level debug
```

**Note:** The service will auto-start the tunnel, but you'll still need to start the worker manually when you want to process videos.

