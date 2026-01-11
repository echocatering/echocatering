# Video Worker Workflow

## How Video Processing Works

### Architecture Overview

```
Render Admin UI (echocatering.com)
    ↓ (clicks "Process Video")
    ↓ Creates job in MongoDB
    ↓ Gets worker upload URL + token
    ↓
Browser → Uploads raw video directly to → Local Worker (worker.echocatering.com)
                                                      ↓
                                            Worker processes video (FFmpeg)
                                                      ↓
                                            Uploads processed videos to Cloudinary
                                                      ↓
                                            Updates job status in MongoDB
                                                      ↓
                                            Render admin UI shows progress
```

---

## Starting the Worker (Required Before Processing)

**The worker does NOT start automatically.** You must start it manually every time you want to process videos.

### Step 1: Start the Worker

Open Terminal 1:
```bash
cd /Users/andybernegger/echo-catering
node worker/index.js
```

**Keep this terminal open** - the worker runs until you stop it (Ctrl+C).

### Step 2: Start the Tunnel

Open Terminal 2:
```bash
cloudflared tunnel run worker-echo
```

**Keep this terminal open** - the tunnel runs until you stop it (Ctrl+C).

### Step 3: Verify Worker is Online

Check the Render admin UI:
- Go to any menu item
- Click "Upload Video" or "Change Video"
- In the video options modal, you should see: **"Worker: ONLINE"** (in green)

Or check via API:
```bash
curl https://echocatering.com/api/video-worker/status
```

Should show `"online": true`

### Step 4: Process Videos

Now you can:
1. Click "Process Video" in the admin UI (button will be enabled)
2. Select your video file
3. Wait for processing to complete
4. The processed video will appear in Cloudinary and on your website

---

## When to Start/Stop the Worker

### Start the worker when:
- ✅ You want to process videos
- ✅ You're actively editing/uploading content

### You can stop the worker when:
- ✅ You're done processing videos (saves CPU/memory)
- ✅ You're just browsing/editing text content (worker not needed)

**Note:** The Render backend and website work fine without the worker - only video processing requires it.

---

## Stopping the Worker

In Terminal 1 (Worker):
- Press `Ctrl+C` to stop the worker

In Terminal 2 (Tunnel):
- Press `Ctrl+C` to stop the tunnel

**Both can be stopped independently**, but you need both running for video processing to work.

---

## Auto-Start Worker on Mac Boot (Optional)

If you want the worker to start automatically when you log in to your Mac:

### Install Auto-Start Service

Run the installation script:

```bash
cd /Users/andybernegger/echo-catering
./scripts/active/install-worker-service.sh
```

This will:
- ✅ Create a LaunchAgent plist file
- ✅ Configure it to auto-start the worker on login
- ✅ Set up log files at `~/Library/Logs/echocatering-worker.log`

**After installation:**
- The worker will start automatically when you log in
- Logs are available at `~/Library/Logs/echocatering-worker.log`
- You'll still need to start the tunnel manually (or set it up as a service too)

### Useful Commands

```bash
# Check if service is running
launchctl list | grep echocatering

# View worker logs
tail -f ~/Library/Logs/echocatering-worker.log

# View error logs
tail -f ~/Library/Logs/echocatering-worker-error.log

# Stop auto-start (but keep service installed)
launchctl unload ~/Library/LaunchAgents/com.echocatering.worker.plist

# Start service manually
launchctl load ~/Library/LaunchAgents/com.echocatering.worker.plist

# Uninstall auto-start completely
launchctl unload ~/Library/LaunchAgents/com.echocatering.worker.plist
rm ~/Library/LaunchAgents/com.echocatering.worker.plist
```

**Note:** Even with auto-start, you'll still need to start the tunnel manually (or set it up as a service - see tunnel setup docs).

---

## Troubleshooting

### "Worker: OFFLINE" in Admin UI

**Causes:**
1. Worker not started (Terminal 1)
2. Tunnel not started (Terminal 2)
3. Worker crashed (check Terminal 1 for errors)
4. Tunnel disconnected (check Terminal 2 for errors)

**Fix:**
- Check both terminals are running
- Restart both if needed
- Verify: `curl https://echocatering.com/api/video-worker/status`

### "Process Video" Button is Grayed Out

**Cause:** Worker is offline

**Fix:** Start the worker + tunnel (see steps above)

### Processing Fails After Starting

**Check:**
1. Worker terminal for error messages
2. Render backend logs (in Render dashboard)
3. Network tab in browser DevTools for failed requests

---

## Quick Reference

| Task | Command |
|------|---------|
| Start worker | `cd /Users/andybernegger/echo-catering && node worker/index.js` |
| Start tunnel | `cloudflared tunnel run worker-echo` |
| Check worker status | `curl https://echocatering.com/api/video-worker/status` |
| Stop worker | `Ctrl+C` in worker terminal |
| Stop tunnel | `Ctrl+C` in tunnel terminal |

