# Project Structure & Setup FAQ

## 1. Can I get rid of my local project folder?

**Yes, but with important caveats:**

- ✅ **All code is in Git** (GitHub: `https://github.com/echocatering/echocatering.git`)
- ✅ You can delete the local folder and clone it again anytime: `git clone https://github.com/echocatering/echocatering.git`
- ⚠️ **Important**: The file `worker/local.env` is **NOT in Git** (and shouldn't be - it contains secrets)
  - Before deleting: **Save your `worker/local.env` contents somewhere secure** (password manager, encrypted note, etc.)
  - When you clone again: Recreate `worker/local.env` with the same values

**Before deleting, save this file securely:**
```
worker/local.env
```

**Recommended**: Keep the local folder if you plan to:
- Run the worker (for video processing)
- Make code changes
- Test locally before deploying to Render

---

## 2. Is my worker in my local project folder or separate?

**The worker is inside your local project folder:**
- Location: `/Users/andybernegger/echo-catering/worker/`
- Files:
  - `worker/index.js` (worker code - **in Git**)
  - `worker/local.env` (config/secrets - **NOT in Git**, must be recreated)
  - `worker/uploads/` (temporary video files - **NOT in Git**)

The worker code (`worker/index.js`) is part of the same Git repository, so it's backed up. However, the worker **runs on your Mac**, not on Render. If you delete the local folder, you'll need to:
1. Clone the repo again
2. Recreate `worker/local.env`
3. Install dependencies (`npm install` in the repo root)
4. Start the worker again

---

## 3. Can I use worker.echocatering.com instead of trycloudflare.com URLs?

**Yes!** You can set up a permanent Cloudflare Tunnel with a custom subdomain.

**Current setup (temporary):**
- Uses `https://xxxxx.trycloudflare.com` (changes every time the tunnel restarts)

**Better setup (permanent):**
- Use `https://worker.echocatering.com` (stable URL, never changes)

### Steps to set up worker.echocatering.com:

1. **Install Cloudflare Tunnel CLI** (if not already installed):
   ```bash
   brew install cloudflare/cloudflare/cloudflared
   ```

2. **Authenticate with Cloudflare**:
   ```bash
   cloudflared tunnel login
   ```
   (This opens a browser to authorize)

3. **Create a named tunnel**:
   ```bash
   cloudflared tunnel create worker-echo
   ```
   (This creates a tunnel ID - save it)

4. **Create a DNS record** (in Cloudflare Dashboard):
   - Go to your `echocatering.com` domain in Cloudflare
   - Add a CNAME record:
     - Name: `worker`
     - Target: `<tunnel-id>.cfargotunnel.com`
     - Proxy status: Proxied (orange cloud)

5. **Create a config file** `~/.cloudflared/config.yml`:
   ```yaml
   tunnel: <tunnel-id>
   credentials-file: /Users/andybernegger/.cloudflared/<tunnel-id>.json
   
   ingress:
     - hostname: worker.echocatering.com
       service: http://127.0.0.1:8787
     - service: http_status:404
   ```

6. **Run the tunnel**:
   ```bash
   cloudflared tunnel run worker-echo
   ```

7. **Update Render environment variable**:
   - In Render → Backend Service → Environment
   - Set `VIDEO_WORKER_URL` = `https://worker.echocatering.com`

8. **Optional: Run tunnel as a service** (so it starts automatically):
   ```bash
   cloudflared service install
   sudo cloudflared service install
   ```

**Benefits:**
- ✅ Stable URL (never changes)
- ✅ No need to update Render env vars when tunnel restarts
- ✅ Professional subdomain
- ✅ Works even after computer restarts (if run as a service)

---

## 4. If I close my computer, how do I access my Render project?

**Render is completely independent of your local machine:**
- ✅ Render runs in the cloud (AWS infrastructure)
- ✅ Your website is always accessible at `https://echocatering.onrender.com` (or `https://echocatering.com` if you set up custom domain)
- ✅ The Render admin UI is accessible at `https://dashboard.render.com`
- ✅ **You can access everything from any device with a web browser**

**What stops when you close your computer:**
- ❌ The **local worker** (video processing) stops
  - Video processing jobs will show "worker offline"
  - The worker must run on your Mac (for CPU-intensive FFmpeg processing)
  - To process videos: Start the worker + tunnel again

**What keeps running:**
- ✅ Render backend (always running)
- ✅ Render frontend (always running)
- ✅ MongoDB Atlas database (always running)
- ✅ Cloudinary storage (always running)
- ✅ Website is accessible 24/7

**To process videos after closing your computer:**
1. Open your computer
2. Start the worker: `cd /Users/andybernegger/echo-catering && set -a && source worker/local.env && set +a && node worker/index.js`
3. Start the tunnel: `cloudflared tunnel run worker-echo` (or use the service if installed)

---

## 5. Can I see all files and contents on Git if my local folder is gone?

**Yes! Everything is on GitHub:**

- **View online**: Go to `https://github.com/echocatering/echocatering`
- **Clone again**: `git clone https://github.com/echocatering/echocatering.git`
- **All code files are there**: All `.js`, `.json`, `.md`, etc. files (except gitignored files)

**What's NOT in Git (and shouldn't be):**
- `worker/local.env` (contains secrets - must recreate manually)
- `node_modules/` (dependencies - reinstall with `npm install`)
- `worker/uploads/` (temporary files - recreated automatically)
- `.env` files (local environment configs)

**To get everything back after deleting:**
```bash
# Clone the repo
git clone https://github.com/echocatering/echocatering.git
cd echocatering

# Install dependencies
npm install

# Recreate worker/local.env (from your saved backup)
# (Create the file with your saved values)

# You're ready!
```

---

## Summary

| Question | Answer |
|----------|--------|
| Can I delete local folder? | Yes, but save `worker/local.env` first |
| Worker location? | Inside project folder (`/worker/`) |
| Use worker.echocatering.com? | Yes, set up named Cloudflare Tunnel |
| Access Render when computer closed? | Yes, Render is always accessible via web |
| See files on Git? | Yes, everything is on GitHub |

**Recommendation:** Keep the local folder if you're actively developing or processing videos. Only delete it if you're sure you won't need it for a while, and always save `worker/local.env` securely first.


