# Cloudinary-Only Media Pipeline (Backend + Frontend)

Production goal: all media (images + videos) are uploaded by the backend directly to Cloudinary, persisted in MongoDB with Cloudinary URLs + metadata, and consumed by the frontend without any filesystem checks or local fallbacks. The same flow must work locally and on Render with identical logic and env-driven configuration.

## Quick Start Guide

### 1. Set Up Environment Variables

**Locally (create/update `.env` in project root):**
```bash
CLOUDINARY_CLOUD_NAME=your-cloud-name
CLOUDINARY_API_KEY=your-api-key
CLOUDINARY_API_SECRET=your-api-secret
MONGODB_URI=mongodb+srv://user:pass@cluster.mongodb.net/echo-catering
PORT=5002
NODE_ENV=development
```

**On Render:**
1. Go to your Render service dashboard
2. Navigate to "Environment" tab
3. Add these environment variables:
   - `CLOUDINARY_CLOUD_NAME`
   - `CLOUDINARY_API_KEY`
   - `CLOUDINARY_API_SECRET`
   - `MONGODB_URI`
   - `NODE_ENV=production`
   - `PORT` (usually auto-set by Render)

### 2. Install Dependencies

```bash
cd /Users/andybernegger/echo-catering
npm install
```

### 3. Start Backend Locally

```bash
cd server
node index.js
```

**Expected output:**
```
✅ Connected to MongoDB Atlas
✅ SERVER SUCCESSFULLY STARTED
   Port: 5002
   Environment: development
   Database: ✅ Connected
```

**If you see errors about missing env vars:**
```
Missing required environment variables: CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY
```
→ Check your `.env` file exists and contains all required variables.

### 4. Test Upload Endpoint

**Option A: Using curl**
```bash
curl -X POST \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -F "gallery=@/path/to/your/image.jpg" \
  http://localhost:5002/api/upload/gallery
```

**Option B: Using the admin panel**
1. Start your React dev server: `npm start` (in project root)
2. Log in to the admin panel
3. Navigate to gallery upload section
4. Upload an image

**Expected response:**
```json
{
  "success": true,
  "message": "Image uploaded successfully",
  "file": {
    "cloudinaryUrl": "https://res.cloudinary.com/your-cloud/image/upload/...",
    "publicId": "echo-catering/gallery/1_gallery",
    "thumbnailUrl": "https://res.cloudinary.com/...",
    "filename": "1.jpg",
    "originalName": "your-image.jpg"
  }
}
```

### 5. Verify in Database

Check MongoDB Atlas or your local MongoDB:
```javascript
// MongoDB shell or Compass
db.galleries.findOne({ photoNumber: 1 })
// Should show:
// {
//   cloudinaryUrl: "https://res.cloudinary.com/...",
//   cloudinaryPublicId: "echo-catering/gallery/1_gallery",
//   ...
// }
```

### 6. Test Gallery Fetch

```bash
curl http://localhost:5002/api/gallery
```

**Expected:** Array of gallery objects with `cloudinaryUrl` and `imagePath` fields pointing to Cloudinary.

### 7. Test Frontend

1. Start React dev server: `npm start` (from project root)
2. Navigate to gallery page
3. Images should load from Cloudinary URLs
4. Check browser Network tab - all image requests should go to `res.cloudinary.com`

### 8. Deploy to Render

**Backend:**
1. Push your code to GitHub
2. In Render dashboard, trigger a new deploy
3. Ensure all environment variables are set (see step 1)
4. Wait for deploy to complete
5. Check logs for: `✅ Connected to MongoDB Atlas` and no env errors

**Frontend:**
1. Deploy React build (usually automatic via Render)
2. Ensure frontend points to backend API URL

### 9. Test on Render

After deployment:
```bash
curl https://your-app.onrender.com/api/health
# Should return: {"status":"OK","timestamp":"..."}

curl https://your-app.onrender.com/api/gallery
# Should return gallery array with Cloudinary URLs
```

### Troubleshooting

**"Missing required environment variables" error:**
- Check `.env` file exists in project root (locally)
- Verify Render environment variables are set (case-sensitive)
- Restart server after adding env vars

**"Cloudinary upload failed" error:**
- Verify Cloudinary credentials are correct
- Check Cloudinary dashboard for upload limits/quota
- Ensure `CLOUDINARY_CLOUD_NAME` matches your Cloudinary account

**"MongoDB connection failed" error:**
- Verify `MONGODB_URI` is correct
- Check MongoDB Atlas IP whitelist (should allow all IPs or Render IPs)
- Ensure MongoDB cluster is running (free tier may pause after inactivity)

**Images not loading in frontend:**
- Check browser console for 404s
- Verify `/api/gallery` returns Cloudinary URLs (not local paths)
- Check Network tab - requests should go to `res.cloudinary.com`
- Clear browser cache

**Upload works but gallery is empty:**
- Check MongoDB connection
- Verify gallery documents have `cloudinaryUrl` field
- Check `/api/gallery` response - should include Cloudinary URLs

---

## Environment Requirements
- `CLOUDINARY_CLOUD_NAME`
- `CLOUDINARY_API_KEY`
- `CLOUDINARY_API_SECRET`
- `MONGODB_URI`
- Optional: `CLOUDINARY_FOLDER` (default `echo-catering`), `ALLOWED_ORIGINS`, `RENDER_EXTERNAL_URL`
- Fail fast if any Cloudinary or Mongo env vars are missing; log which vars are absent (never log secrets).

## Backend: Required State
1) **Upload endpoint** (`/api/upload/gallery` or consolidated `/api/upload`):
   - Accept multipart with `multer` **memoryStorage**.
   - Stream to Cloudinary via `cloudinary.uploader.upload_stream` (no disk writes).
   - Persist a `Gallery` document with: `cloudinaryUrl (secure_url)`, `cloudinaryPublicId`, `resource_type`, `format`, `bytes`, `width`, `height`, `duration` (videos), `mimeType`, `fileSize`, `title`, `photoNumber/order`, `thumbnailUrl` via Cloudinary transform.
   - On DB failure after Cloudinary success, delete the Cloudinary asset to avoid orphans.
   - Reject missing/misconfigured env with 500 + clear log.

2) **No filesystem usage**:
   - Remove directory creation, diskStorage, temp file cleanup, and any `/uploads` reads/writes in upload routes.
   - Delete/list endpoints should operate on Cloudinary + Mongo only (never `server/uploads`).

3) **Gallery read endpoints** (`/api/gallery`):
   - Source of truth: Mongo documents only.
   - Do not scan filesystem or check for local existence. If DB unavailable, return 503 or empty array with a clear log.
   - Ensure JSON includes `cloudinaryUrl`, `cloudinaryPublicId`, and `thumbnailPath/imagePath` virtuals that resolve to Cloudinary URLs.

4) **Static serving**:
   - Stop serving `/uploads` for gallery/media if not needed. Frontend must rely on Cloudinary URLs.

5) **Cloudinary util**:
   - Provide stream helper around `upload_stream`.
   - Validate env at startup; throw descriptive error if missing.

## Frontend: Required State
1) **Gallery fetch**:
   - Fetch from `/api/gallery` and render `imagePath`/`cloudinaryUrl` directly.
   - Remove `getFallbackImages` and any `/gallery/...` local fallbacks.
   - Add loading and error UI states; if fetch fails, show an error message instead of local assets.

2) **Cloudinary assumptions**:
   - Treat all returned URLs as Cloudinary. No filesystem existence checks.
   - Keep `isCloudinaryUrl` validator for safety; hide/bail on non-Cloudinary URLs rather than falling back to local paths.

3) **Menu/gallery videos**:
   - Use `cloudinaryVideoUrl` (or `videoUrl` only if it is a Cloudinary URL). Do not reference `/menu-items/...` local paths.

## API Contracts (proposed)
- `POST /api/upload/gallery`
  - Multipart field: `gallery` (image/video).
  - Response: `{ success, message, file: { cloudinaryUrl, publicId, thumbnailUrl, width, height, bytes, resourceType, format } }`
- `DELETE /api/upload/gallery/:id`
  - Deletes Cloudinary asset via `cloudinaryPublicId` and removes Mongo document.
- `GET /api/gallery`
  - Returns array of documents with Cloudinary-backed `imagePath`/`thumbnailPath`.

## Migration / Cleanup Checklist
- [ ] Replace diskStorage with memoryStorage + `upload_stream`.
- [ ] Remove all `fs` reads/writes from upload routes (gallery, about, logo, copy-to-section, cocktail).
- [ ] Remove `/uploads`-based delete/list logic; implement Cloudinary + Mongo deletes only.
- [ ] Simplify `/api/gallery` to DB-only; remove filesystem scans and existence checks.
- [ ] Validate Cloudinary/Mongo env on startup; log and abort if missing.
- [ ] Frontend: drop fallback images; add loading/error UI; rely on Cloudinary URLs for gallery and menu media.
- [ ] Retest on local and Render with identical env sets.

## Verification Steps
Local (same steps on Render with deployed URLs):
1. Set env: `CLOUDINARY_*`, `MONGODB_URI`, (optionally `CLOUDINARY_FOLDER`).
2. Start backend; confirm startup log shows Cloudinary + Mongo connected and no warnings about env.
3. `curl -F "gallery=@/path/to/img.jpg" http://localhost:5002/api/upload/gallery`
   - Expect 200 with `cloudinaryUrl` and `publicId`.
   - Confirm Mongo doc contains Cloudinary fields; no local file created in `server/uploads`.
4. Hit `GET /api/gallery`; ensure entries return Cloudinary URLs; no local paths.
5. Load frontend gallery: images load from Cloudinary; loading state then success; simulate 500 to see error UI.
6. Delete an item via API; verify Cloudinary asset is removed and Mongo doc deleted.
7. Render deploy: repeat steps 3–6 against the Render URL; ensure no code path differs by `NODE_ENV`.

## Notes on Failure Modes
- Missing env → startup error; respond 500 with `CLOUDINARY_CONFIG_MISSING`.
- Cloudinary upload fails → return 502/500 with `CLOUDINARY_UPLOAD_FAILED`, no DB write.
- DB write fails after upload → delete Cloudinary asset; return 500 `DB_WRITE_FAILED`.
- DB down on read → return 503 or empty array with log `DB_UNAVAILABLE`; never scan filesystem.

