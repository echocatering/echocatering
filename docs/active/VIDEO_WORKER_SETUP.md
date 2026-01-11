## Video Worker (Local CPU) + Cloudflare Tunnel (trycloudflare) — Setup

### Goal
- Use **Render admin UI** as the control surface.
- Upload the **raw video** directly from the browser to your **local worker** (NOT Cloudinary).
- Run heavy FFmpeg processing on your **Mac CPU** (later step).
- Upload only the processed outputs to **Cloudinary**.
- Keep job status visible in Render admin (online/offline + progress).

### 1) Render backend env vars (required)
In Render → Backend Service → Environment:
- **`VIDEO_WORKER_SECRET`**: a long random string (shared secret between worker ↔ backend)
- **`VIDEO_WORKER_URL`**: set this later once you have the `https://xxxxx.trycloudflare.com` URL
 
Also required on the worker (local only):
- **`CLOUDINARY_CLOUD_NAME`**
- **`CLOUDINARY_API_KEY`**
- **`CLOUDINARY_API_SECRET`**

### 2) Start the local worker (Mac)
From repo root:

```bash
cd /Users/andybernegger/echo-catering

# Create a local env file you DO NOT commit (example values):
cat > worker/local.env <<'EOF'
WORKER_PORT=8787
WORKER_ID=andy-mac-worker
RENDER_API_BASE=https://echocatering.onrender.com
ALLOWED_ORIGIN=https://echocatering.onrender.com
VIDEO_WORKER_SECRET=REPLACE_WITH_THE_SAME_VALUE_AS_RENDER

# Cloudinary creds (local worker uploads processed outputs)
CLOUDINARY_CLOUD_NAME=REPLACE_ME
CLOUDINARY_API_KEY=REPLACE_ME
CLOUDINARY_API_SECRET=REPLACE_ME
EOF

# Start the worker
set -a
source worker/local.env
set +a
node worker/index.js
```

Local health check:
- `http://127.0.0.1:8787/health`

### 3) Start Cloudflare Tunnel (temporary trycloudflare hostname)
In a separate terminal:

```bash
# Install cloudflared if you don't have it.
# (Homebrew)
brew install cloudflare/cloudflare/cloudflared

# Start a temporary tunnel to your local worker port
cloudflared tunnel --url http://127.0.0.1:8787
```

Cloudflared will print a URL like:
- `https://xxxxx.trycloudflare.com`

### 4) Tell Render where your worker lives (temporary)
Set Render backend env var:
- **`VIDEO_WORKER_URL`** = the `https://xxxxx.trycloudflare.com` URL

### 5) Verify worker online from Render
After redeploy (or env refresh), hit:
- `https://echocatering.onrender.com/api/video-worker/status`

You should see:
- `configured: true`
- `online: true`

### Notes
- `trycloudflare.com` URLs can change if the tunnel restarts. When that happens, just update `VIDEO_WORKER_URL` in Render.
- **For a permanent setup**, see "Setting up worker.echocatering.com (Permanent Tunnel)" below.

---

## Setting up worker.echocatering.com (Permanent Tunnel)

**Benefits:**
- Stable URL (never changes)
- No need to update Render env vars when tunnel restarts
- Professional subdomain
- Can run as a service (auto-starts on reboot)

### Steps:

1. **Install Cloudflare Tunnel CLI** (if not already installed):
   ```bash
   brew install cloudflare/cloudflare/cloudflared
   ```

2. **Authenticate with Cloudflare**:
   ```bash
   cloudflared tunnel login
   ```
   (Opens browser to authorize - use the account that owns echocatering.com)

3. **Create a named tunnel**:
   ```bash
   cloudflared tunnel create worker-echo
   ```
   This will output a tunnel UUID - save it (you'll see it in the output).

4. **Create DNS record in Cloudflare Dashboard**:
   - Go to Cloudflare Dashboard → echocatering.com → DNS
   - Add a CNAME record:
     - **Name**: `worker`
     - **Target**: `<tunnel-id>.cfargotunnel.com` (replace `<tunnel-id>` with the UUID from step 3)
     - **Proxy status**: Proxied (orange cloud) ✅
     - **TTL**: Auto

5. **Create tunnel config file**:
   ```bash
   mkdir -p ~/.cloudflared
   ```
   
   Create/edit `~/.cloudflared/config.yml`:
   ```yaml
   tunnel: <tunnel-id>
   credentials-file: /Users/andybernegger/.cloudflared/<tunnel-id>.json
   
   ingress:
     - hostname: worker.echocatering.com
       service: http://127.0.0.1:8787
     - service: http_status:404
   ```
   (Replace `<tunnel-id>` with the UUID from step 3)

6. **Test the tunnel**:
   ```bash
   cloudflared tunnel run worker-echo
   ```
   You should see "Connection established" messages. Verify it works:
   ```bash
   curl https://worker.echocatering.com/health
   ```

7. **Update Render environment variable**:
   - Go to Render Dashboard → Backend Service → Environment
   - Set `VIDEO_WORKER_URL` = `https://worker.echocatering.com`
   - Redeploy (or wait for env refresh)

8. **Optional: Run tunnel as a service** (auto-starts on reboot):
   ```bash
   # Install the service
   sudo cloudflared service install
   
   # Start the service
   sudo launchctl load /Library/LaunchDaemons/com.cloudflare.cloudflared.plist
   
   # Check status
   sudo launchctl list | grep cloudflared
   ```

**Troubleshooting:**
- If DNS doesn't resolve: Wait a few minutes for DNS propagation, or check that the CNAME record is correct
- If connection fails: Make sure the worker is running (`node worker/index.js`)
- To view tunnel logs: `cloudflared tunnel info worker-echo`


