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
- Later, you can move to a stable hostname like `worker.echocatering.com` without changing the architecture.


