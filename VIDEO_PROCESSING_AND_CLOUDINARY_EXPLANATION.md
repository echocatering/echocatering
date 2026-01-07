# Video Processing & Cloudinary Integration - Complete Explanation

## Overview

This document explains the complete video processing pipeline and how it integrates with Cloudinary for cloud storage and delivery.

---

## Complete Flow Diagram

```
User Uploads Video
    ↓
[Frontend] MenuManager.js - handleProcessVideo()
    ↓
[API] POST /api/video-processing/upload-base/:itemNumber
    ↓
[Server] Saves to: server/uploads/items/temp_files/{itemNumber}/{itemNumber}_original.{ext}
    ↓
[Frontend] POST /api/video-processing/process/:itemNumber
    ↓
[Server] processVideoForItem(itemNumber) - ASYNC PROCESSING STARTS
    ↓
    ├─ Step 1: Preprocessing (crop 1:1, trim to 15.58s)
    ├─ Step 1b: White Balance Adjustment
    ├─ Step 2: Generate Icon Video (480x480, <2MB)
    ├─ Step 3: Generate Main Video (frame-by-frame processing)
    ├─ Step 4: Wait for files to be written
    ├─ Step 5: Upload to Cloudinary
    │   ├─ Upload Main Video → echo-catering/videos/{itemNumber}_full
    │   └─ Upload Icon Video → echo-catering/videos/{itemNumber}_icon
    ├─ Step 6: Update Database with Cloudinary URLs
    └─ Step 7: Cleanup temp files
    ↓
[Frontend] Polls status endpoint every 2 seconds
    ↓
[Frontend] When complete, refreshes cocktail list
    ↓
[Frontend] Displays video using Cloudinary URL
```

---

## Detailed Step-by-Step Process

### Phase 1: Frontend Upload (MenuManager.js)

**Location:** `src/admin/components/MenuManager.js`

**Function:** `handleProcessVideo(file, itemNumber)`

**What Happens:**
1. User selects video file and clicks "Process Video"
2. Frontend creates a preview URL from the file
3. Uploads video to server via `POST /api/video-processing/upload-base/:itemNumber`
4. Server saves file to: `server/uploads/items/temp_files/{itemNumber}/{itemNumber}_original.{ext}`
5. Frontend calls `POST /api/video-processing/process/:itemNumber` to start processing
6. Frontend starts polling status endpoint every 2 seconds

**Key Code:**
```javascript
// Upload video file
const formData = new FormData();
formData.append('video', file);
await fetch(`${API_BASE_URL}/api/video-processing/upload-base/${itemNumber}`, {
  method: 'POST',
  body: formData
});

// Start processing
await fetch(`${API_BASE_URL}/api/video-processing/process/${itemNumber}`, {
  method: 'POST'
});

// Start polling for status
startProcessingPoll(itemNumber);
```

---

### Phase 2: Server-Side Processing (videoProcessing.js)

**Location:** `server/routes/videoProcessing.js`

**Function:** `processVideoForItem(itemNumber)`

**Status Tracking:**
- Uses `itemProcessingStatus` Map to track progress per item
- Frontend polls `/api/video-processing/status/:itemNumber` to get updates
- Status includes: `stage`, `progress`, `message`, `active`, `error`

---

#### Step 1: Preprocessing

**Stage:** `preprocessing`

**What Happens:**
1. Reads original video from `temp_files/{itemNumber}/{itemNumber}_original.{ext}`
2. Uses `ffprobe` to get video dimensions
3. Crops video to 1:1 aspect ratio (centered)
4. Trims video to exactly 15.58 seconds (starting at 2 seconds)
5. Saves to: `temp_files/{itemNumber}/{itemNumber}_preprocessed.mov`

**FFmpeg Command:**
```bash
ffmpeg -y -ss 2 -i "{inputPath}" -t 15.58 \
  -vf "crop={cropSize}:{cropSize}:{cropX}:0" \
  -c:v prores_ks -profile:v 3 \
  -c:a copy "{preprocessedPath}"
```

**Progress:** 5% → 10%

---

#### Step 1b: White Balance Adjustment

**Stage:** `white-balance`

**What Happens:**
1. Samples top row of video to find brightest pixel
2. Calculates white balance scale factor
3. Applies uniform gain adjustment to entire video
4. Saves to: `temp_files/{itemNumber}/{itemNumber}_preprocessed_wb.mov`
5. Deletes intermediate preprocessed file

**Progress:** 10% → 15%

---

#### Step 2: Generate Icon Video

**Stage:** `icon-generation` / `creating-icon`

**Function:** `generateIconVideo(inputPath, outputPath, itemNumber)`

**What Happens:**
1. Takes white-balanced video as input
2. Generates 480x480 pixel video (maintains aspect ratio with padding)
3. Tries multiple quality settings (CRF 18, 20, 22, 24) to get file under 2MB
4. Saves to: `server/uploads/items/{itemNumber}_icon.mp4`

**FFmpeg Command:**
```bash
ffmpeg -y -i "{inputPath}" \
  -vf "scale=480:480:force_original_aspect_ratio=decrease,pad=480:480:(ow-iw)/2:(oh-ih)/2" \
  -c:v libx264 -crf {crf} -preset slow \
  -movflags +faststart "{outputPath}"
```

**Quality Settings Tried:**
- CRF 18 (very high quality) - target
- CRF 20 (high quality) - fallback
- CRF 22 (good quality) - fallback
- CRF 24 (medium quality) - fallback

**Progress:** 15% → 20%

---

#### Step 3: Generate Main Video

**Stage:** `processing` → `extracting` → `preprocessing-frames` → `blurring` → `compositing` → `encoding`

**What Happens:**
1. Makes HTTP call to internal endpoint: `POST /api/video-processing/generate-background-fbf`
2. This endpoint performs frame-by-frame processing:
   - Extracts all frames from video (no dropped frames)
   - Preprocesses each frame (white/off-white fade)
   - Creates blurred background from each frame
   - Composites: blurred background + sharp video frame
   - Encodes final video with precise frame rate
3. Output saved to: `server/uploads/items/{itemNumber}.mp4`

**Status Sync:**
- While processing, syncs global `processingStatus` to per-item status every 500ms
- Frontend sees progress updates in real-time

**Progress:** 20% → 90%

---

#### Step 4: Wait for Files

**What Happens:**
1. After HTTP response completes, polls for main video file
2. Checks every 500ms for up to 60 seconds
3. Checks locations:
   - `uploads/items/{itemNumber}.mp4` (correct location)
   - `uploads/test/{itemNumber}.mp4` (fallback)
4. Moves/copies file if found in wrong location
5. Also waits up to 30 seconds for icon video (if needed)

**Progress:** 90%

---

#### Step 5: Upload to Cloudinary

**Stage:** `cloudinary-upload`

**Function:** `uploadVideosToCloudinary(itemNumber, mainVideoPath, iconVideoPath, status)`

**Location:** `server/routes/videoProcessing.js` (line ~2400)

**What Happens:**

1. **Configuration Check:**
   - Verifies Cloudinary env vars are set:
     - `CLOUDINARY_CLOUD_NAME`
     - `CLOUDINARY_API_KEY`
     - `CLOUDINARY_API_SECRET`
   - Returns early with error if not configured

2. **Upload Main Video:**
   - Checks if file exists: `server/uploads/items/{itemNumber}.mp4`
   - Uploads to Cloudinary with:
     - `resourceType: 'video'`
     - `folder: 'echo-catering/videos'`
     - `publicId: 'echo-catering/videos/{itemNumber}_full'`
   - Gets back Cloudinary URL (e.g., `https://res.cloudinary.com/duysruzct/video/upload/v1234567890/echo-catering/videos/1_full.mp4`)
   - Stores URL in `results.cloudinaryVideoUrl`

3. **Upload Icon Video:**
   - Checks if file exists: `server/uploads/items/{itemNumber}_icon.mp4`
   - Uploads to Cloudinary with:
     - `resourceType: 'video'`
     - `folder: 'echo-catering/videos'`
     - `publicId: 'echo-catering/videos/{itemNumber}_icon'`
   - Gets back Cloudinary URL
   - Stores URL in `results.cloudinaryIconUrl`

4. **Cloudinary Upload Function:**
   - Uses `uploadToCloudinary()` from `server/utils/cloudinary.js`
   - Calls `cloudinary.uploader.upload(filePath, uploadOptions)`
   - Returns: `{ url, publicId, width, height, format, bytes, duration }`

**Progress:** 92% → 96% (main) → 98% (icon) → 99% (database)

---

#### Step 6: Update Database

**What Happens:**
1. Finds Cocktail document by `itemNumber`
2. Updates with Cloudinary URLs:
   ```javascript
   {
     cloudinaryVideoUrl: "https://res.cloudinary.com/.../1_full.mp4",
     cloudinaryVideoPublicId: "echo-catering/videos/1_full",
     cloudinaryIconUrl: "https://res.cloudinary.com/.../1_icon.mp4",
     cloudinaryIconPublicId: "echo-catering/videos/1_icon"
   }
   ```
3. Saves document to MongoDB

**Database Model:** `server/models/Cocktail.js`
- Fields: `cloudinaryVideoUrl`, `cloudinaryVideoPublicId`, `cloudinaryIconUrl`, `cloudinaryIconPublicId`

**Progress:** 99%

---

#### Step 7: Cleanup

**What Happens:**
1. Deletes entire temp folder: `server/uploads/items/temp_files/{itemNumber}/`
2. Final files remain in: `server/uploads/items/`
   - `{itemNumber}.mp4` (main video)
   - `{itemNumber}_icon.mp4` (icon video)

**Progress:** 100%

---

### Phase 3: Frontend Status Polling

**Location:** `src/admin/components/MenuManager.js`

**Function:** `startProcessingPoll(itemNumber)`

**What Happens:**
1. Polls `GET /api/video-processing/status/:itemNumber` every 2 seconds
2. Updates `processingStatus` state with latest progress
3. Shows processing overlay in UI with:
   - Loading spinner
   - Current stage message
   - Progress percentage
4. When `status.active === false`:
   - Stops polling
   - If `status.stage === 'complete'` and no error:
     - Calls `fetchCocktails()` to refresh list
     - New Cloudinary URLs are now in the data

---

### Phase 4: Frontend Display

**Location:** `src/admin/components/MenuManager.js` and `src/pages/menuGallery2.js`

**What Happens:**
1. `fetchCocktails()` retrieves updated cocktail data from API
2. API endpoint (`/api/menu-items/menu-manager`) returns cocktails with `cloudinaryVideoUrl`
3. Frontend checks for Cloudinary URL using `isCloudinaryUrl()`:
   ```javascript
   if (isCloudinaryUrl(currentCocktail.cloudinaryVideoUrl)) {
     videoSrc = currentCocktail.cloudinaryVideoUrl;
   }
   ```
4. Video element uses Cloudinary URL directly:
   ```javascript
   <video src={cloudinaryVideoUrl} autoPlay muted loop playsInline />
   ```

**No Local Fallbacks:**
- Frontend ONLY uses Cloudinary URLs
- If no Cloudinary URL exists, video is hidden (no local file fallback)

---

## File Paths Summary

### During Processing:
- **Original Upload:** `server/uploads/items/temp_files/{itemNumber}/{itemNumber}_original.{ext}`
- **Preprocessed:** `server/uploads/items/temp_files/{itemNumber}/{itemNumber}_preprocessed.mov`
- **White-Balanced:** `server/uploads/items/temp_files/{itemNumber}/{itemNumber}_preprocessed_wb.mov`

### Final Output:
- **Main Video:** `server/uploads/items/{itemNumber}.mp4`
- **Icon Video:** `server/uploads/items/{itemNumber}_icon.mp4`

### Cloudinary:
- **Main Video Public ID:** `echo-catering/videos/{itemNumber}_full`
- **Icon Video Public ID:** `echo-catering/videos/{itemNumber}_icon`
- **Full URLs:** `https://res.cloudinary.com/{cloud_name}/video/upload/v{version}/{public_id}.mp4`

---

## Cloudinary Integration Details

### Configuration

**File:** `server/utils/cloudinary.js`

**Environment Variables Required:**
```env
CLOUDINARY_CLOUD_NAME=your-cloud-name
CLOUDINARY_API_KEY=your-api-key
CLOUDINARY_API_SECRET=your-api-secret
```

**Configuration:**
```javascript
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});
```

### Upload Function

**Function:** `uploadToCloudinary(filePath, options)`

**Options:**
- `resourceType: 'video'` (required for videos)
- `folder: 'echo-catering/videos'` (organizes in Cloudinary)
- `publicId: 'echo-catering/videos/{itemNumber}_full'` (predictable ID)
- `overwrite: true` (allows re-uploading with same ID)

**Returns:**
```javascript
{
  url: "https://res.cloudinary.com/.../video.mp4",
  publicId: "echo-catering/videos/1_full",
  width: 1920,
  height: 1920,
  format: "mp4",
  bytes: 1234567,
  duration: 15.58
}
```

### Public ID Structure

**Main Videos:**
- Pattern: `echo-catering/videos/{itemNumber}_full`
- Example: `echo-catering/videos/1_full`
- Full URL: `https://res.cloudinary.com/duysruzct/video/upload/v1767647969/echo-catering/videos/1_full.mp4`

**Icon Videos:**
- Pattern: `echo-catering/videos/{itemNumber}_icon`
- Example: `echo-catering/videos/1_icon`
- Full URL: `https://res.cloudinary.com/duysruzct/video/upload/v1767647969/echo-catering/videos/1_icon.mp4`

**Benefits of Predictable Public IDs:**
- Easy to find videos in Cloudinary dashboard
- Can be referenced programmatically
- `overwrite: true` allows re-processing same item

---

## Database Schema

**Model:** `Cocktail` (MongoDB)

**Cloudinary Fields:**
```javascript
{
  itemNumber: 1,
  name: "Lavender G&T",
  // ... other fields ...
  cloudinaryVideoUrl: "https://res.cloudinary.com/.../1_full.mp4",
  cloudinaryVideoPublicId: "echo-catering/videos/1_full",
  cloudinaryIconUrl: "https://res.cloudinary.com/.../1_icon.mp4",
  cloudinaryIconPublicId: "echo-catering/videos/1_icon"
}
```

**API Response:**
- Endpoint: `GET /api/menu-items/menu-manager`
- Returns cocktails with `cloudinaryVideoUrl` and `cloudinaryIconUrl` fields
- Frontend uses these URLs directly (no local path fallbacks)

---

## Error Handling

### Processing Errors
- Errors are caught and stored in `status.error`
- Processing continues even if icon generation fails
- Cloudinary upload errors don't fail processing (but are logged)

### Cloudinary Upload Errors
- If upload fails, error is stored in `results.error`
- Database update is skipped if no URLs to save
- Processing is marked complete even if Cloudinary upload fails

### Frontend Errors
- If Cloudinary URL is invalid, video is hidden (no fallback)
- Console logs show which URLs were checked
- Processing status shows errors in UI

---

## Status Tracking

### Per-Item Status Map

**Location:** `server/routes/videoProcessing.js`

**Structure:**
```javascript
itemProcessingStatus = Map<itemNumber, {
  active: boolean,
  stage: string,
  progress: number,
  total: number,
  message: string,
  startTime: number,
  estimatedTimeRemaining: number,
  error: string | null,
  itemNumber: number
}>
```

### Stages
1. `uploading` - Video being uploaded to server
2. `preprocessing` - Cropping and trimming
3. `white-balance` - Applying white balance
4. `icon-generation` - Creating icon video
5. `processing` - Main video processing
6. `extracting` - Extracting frames
7. `preprocessing-frames` - Processing frames
8. `blurring` - Blurring backgrounds
9. `compositing` - Compositing frames
10. `encoding` - Encoding final video
11. `cloudinary-upload` - Uploading to Cloudinary
12. `complete` - Processing finished

---

## Key Functions Reference

### Backend

1. **`processVideoForItem(itemNumber)`**
   - Main processing function
   - Orchestrates all steps
   - Updates status throughout

2. **`generateIconVideo(inputPath, outputPath, itemNumber)`**
   - Creates 480x480 icon video
   - Tries multiple quality settings
   - Returns success/failure

3. **`uploadVideosToCloudinary(itemNumber, mainVideoPath, iconVideoPath, status)`**
   - Uploads both videos to Cloudinary
   - Updates database with URLs
   - Returns upload results

4. **`uploadToCloudinary(filePath, options)`**
   - Generic Cloudinary upload function
   - Handles configuration
   - Returns Cloudinary response

### Frontend

1. **`handleProcessVideo(file, itemNumber)`**
   - Initiates upload and processing
   - Sets initial status
   - Starts polling

2. **`startProcessingPoll(itemNumber)`**
   - Polls status endpoint
   - Updates UI with progress
   - Refreshes data when complete

3. **`fetchCocktails()`**
   - Retrieves updated cocktail list
   - Includes Cloudinary URLs
   - Updates state

---

## Troubleshooting

### Videos Not Uploading to Cloudinary

**Check:**
1. Environment variables in `.env` file
2. Server console logs for `[uploadVideosToCloudinary]` messages
3. File existence: `server/uploads/items/{itemNumber}.mp4` and `{itemNumber}_icon.mp4`
4. Cloudinary configuration check in logs

### Videos Not Appearing on Frontend

**Check:**
1. Database has `cloudinaryVideoUrl` field
2. API response includes `cloudinaryVideoUrl`
3. Frontend console logs show URL being used
4. Browser network tab shows video loading from Cloudinary

### Processing Fails

**Check:**
1. Server console for error messages
2. Status endpoint: `GET /api/video-processing/status/:itemNumber`
3. File permissions in `server/uploads/` directory
4. FFmpeg installation and availability

---

## Summary

The video processing system:
1. Uploads original video to server
2. Processes video through multiple stages (preprocessing, white balance, icon generation, main processing)
3. Uploads final videos to Cloudinary with predictable public IDs
4. Updates database with Cloudinary URLs
5. Frontend displays videos using Cloudinary URLs directly
6. No local file fallbacks - Cloudinary is the source of truth

The entire process is asynchronous, with real-time status updates via polling, and robust error handling that doesn't fail the entire process if individual steps fail.

