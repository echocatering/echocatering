# Video Processing Complete Breakdown

## Overview

This document provides a complete breakdown of how video files are processed, saved, and uploaded to Cloudinary in the echo-catering system. It covers all three video upload options and the complete flow from frontend to Cloudinary.

---

## Video Upload Options (Frontend)

When a user selects a video file in MenuManager, they get three options:

### 1. **Process Video** (Full Processing Pipeline)
- **Frontend Function:** `handleProcessVideo(file, itemNumber)` in `MenuManager.js`
- **What it does:** Full frame-by-frame processing with background blur effects
- **Produces:** Main video (processed) + Icon video (480x480)

### 2. **Upload Video** (Direct Upload - No Processing)
- **Frontend Function:** `handleUploadVideo(file)` in `MenuManager.js`
- **What it does:** Just sets the file for preview and saves filename to state
- **No backend upload:** Only updates frontend state with `videoFile: file.name`
- **No Cloudinary upload:** User must manually save cocktail to trigger upload
- **Use case:** Simple video upload without processing

### 3. **Upload Icon** (Icon-Only Processing)
- **Frontend Function:** `handleUploadIcon(file, itemNumber)` in `MenuManager.js`
- **What it does:** Processes video to create icon version only (480x480, <2MB)
- **Produces:** Icon video only (no main video)

---

## Option 1: Process Video (Full Pipeline)

### Frontend Flow

**File:** `src/admin/components/MenuManager.js`

**Function:** `handleProcessVideo(file, itemNumber)`

**Steps:**

1. **User selects video and clicks "Process Video"**
   - File object is created from user selection
   - `itemNumber` is passed from current cocktail

2. **Frontend sets processing status**
   ```javascript
   setProcessingStatus({
     active: true,
     stage: 'uploading',
     progress: 0,
     total: 100,
     message: 'Uploading video...',
     itemNumber: itemNumber
   });
   ```

3. **Upload video to server (Step 1)**
   - Creates `FormData` with field `'video'`
   - POSTs to: `/api/video-processing/upload-base/:itemNumber`
   - Server saves to: `server/uploads/items/temp_files/{itemNumber}/{itemNumber}_original.{ext}`

4. **Start processing (Step 2)**
   - POSTs to: `/api/video-processing/process/:itemNumber`
   - Server starts async processing (doesn't wait)
   - Frontend receives `{ success: true }` immediately

5. **Start polling for status**
   - Calls `startProcessingPoll(itemNumber)`
   - Polls every 2 seconds: `GET /api/video-processing/status/:itemNumber`
   - Updates UI with progress until `active: false`

---

### Backend Processing Flow

**File:** `server/routes/videoProcessing.js`

**Route 1: Upload Base Video**

**Endpoint:** `POST /api/video-processing/upload-base/:itemNumber`

**Multer Configuration:**
```javascript
destination: server/uploads/items/temp_files/{itemNumber}/
filename: {itemNumber}_original.{ext}
```

**What happens:**
1. Receives video file via `multer.single('video')`
2. **Saves to:** `server/uploads/items/temp_files/{itemNumber}/{itemNumber}_original.{ext}`
   - Example: `server/uploads/items/temp_files/1/1_original.mov`
3. Returns `{ success: true, filePath, filename }`

**Important:** The temp folder is **cleaned up before upload** (removes existing folder if present).

---

**Route 2: Start Processing**

**Endpoint:** `POST /api/video-processing/process/:itemNumber`

**Function:** `processVideoForItem(itemNumber)` (async, runs in background)

**Complete Processing Steps:**

#### Step 1: Locate Original File
- **Location:** `server/uploads/items/temp_files/{itemNumber}/`
- **File pattern:** `{itemNumber}_original.*`
- **Throws error if not found**

#### Step 2: Preprocessing (5% → 10%)
- **Stage:** `preprocessing`
- **Message:** "Cropping and trimming video..."
- **What happens:**
  1. Uses `ffprobe` to get video dimensions
  2. Calculates 1:1 crop (centered, uses height as width)
  3. Trims video: starts at 2 seconds, duration 15.58 seconds
  4. **Saves to:** `server/uploads/items/temp_files/{itemNumber}/{itemNumber}_preprocessed.mov`
- **FFmpeg command:**
  ```bash
  ffmpeg -y -ss 2 -i "{inputPath}" -t 15.58 \
    -vf "crop={cropSize}:{cropSize}:{cropX}:0" \
    -c:v prores_ks -profile:v 3 -c:a copy "{preprocessedPath}"
  ```

#### Step 3: White Balance (10% → 15%)
- **Stage:** `white-balance`
- **Message:** "Applying white balance..."
- **What happens:**
  1. Samples top row of video to find brightest pixel
  2. Calculates white balance scale factor
  3. Applies uniform gain adjustment to entire video
  4. **Saves to:** `server/uploads/items/temp_files/{itemNumber}/{itemNumber}_preprocessed_wb.mov`
  5. **Deletes:** `{itemNumber}_preprocessed.mov` (intermediate file)

#### Step 4: Generate Icon Video (15% → 20%)
- **Stage:** `icon-generation`
- **Message:** "Generating icon video..."
- **Function:** `generateIconVideo(inputPath, outputPath, itemNumber)`
- **What happens:**
  1. Takes white-balanced video as input
  2. Generates 480x480 pixel video (maintains aspect ratio with padding)
  3. Tries multiple quality settings (CRF 18, 20, 22, 24) to get file under 2MB
  4. **Saves to:** `server/uploads/items/{itemNumber}_icon.mp4` (FINAL LOCATION)
- **FFmpeg command (for each quality attempt):**
  ```bash
  ffmpeg -y -i "{inputPath}" \
    -vf "scale=480:480:force_original_aspect_ratio=decrease,pad=480:480:(ow-iw)/2:(oh-ih)/2" \
    -c:v libx264 -crf {crf} -preset slow \
    -movflags +faststart "{outputPath}"
  ```
- **Important:** Icon video is saved directly to final location (NOT in temp folder)

#### Step 5: Generate Main Video (20% → 90%)
- **Stage:** `processing` → `extracting` → `preprocessing-frames` → `blurring` → `compositing` → `encoding`
- **Message:** Various stage-specific messages
- **What happens:**
  1. Makes HTTP call to internal endpoint: `POST /api/video-processing/generate-background-fbf`
  2. Sends JSON payload:
     ```json
     {
       "videoPath": "uploads/items/temp_files/1/1_preprocessed_wb.mov",
       "maxDuration": 15.58,
       "preprocess": false,
       "encodingCRF": 30,
       "outputFilename": "1.mp4",
       "itemNumber": 1,
       "outputDir": "items"
     }
     ```
  3. **Frame-by-frame processing:**
     - Extracts ALL frames (no dropped frames)
     - Preprocesses each frame (white/off-white fade)
     - Creates blurred background from each frame
     - Composites: blurred background + sharp video frame
     - Encodes final video with precise frame rate
  4. **Saves to:** `server/uploads/items/{itemNumber}.mp4` (FINAL LOCATION)
  5. Endpoint returns: `{ outputPath: "/absolute/path/to/{itemNumber}.mp4" }`

**Status Syncing:**
- While processing, syncs global `processingStatus` to per-item status every 500ms
- Frontend sees progress updates in real-time (20% → 90%)

#### Step 6: Verify Files Exist (90%)
- **CRITICAL INVARIANT CHECK:**
  - Asserts main video exists: `server/uploads/items/{itemNumber}.mp4`
  - Asserts main video has non-zero size
  - **If file missing or empty, throws error and stops processing**
  - Logs file size for debugging

#### Step 7: Upload to Cloudinary (92% → 99%)
- **Stage:** `cloudinary-upload`
- **Message:** "Uploading videos to Cloudinary..."
- **Function:** `uploadVideosToCloudinary(itemNumber, mainVideoPath, iconVideoPath, status)`

**Cloudinary Upload Process:**

1. **Configuration Check:**
   - Verifies `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`
   - Returns early with error if not configured

2. **Upload Main Video (92% → 96%):**
   - **File:** `server/uploads/items/{itemNumber}.mp4`
   - **Verifies file exists before upload**
   - **Cloudinary options:**
     ```javascript
     {
       public_id: `${itemNumber}_full`,
       folder: 'echo-catering/videos',
       resource_type: 'video',
       overwrite: true
     }
     ```
   - **Cloudinary Public ID:** `echo-catering/videos/{itemNumber}_full`
   - **Result:** `cloudinaryVideoUrl` = `https://res.cloudinary.com/.../video/upload/v{version}/echo-catering/videos/{itemNumber}_full.mp4`
   - **CRITICAL:** If `secure_url` is not returned, throws error (fatal)

3. **Upload Icon Video (96% → 98%):**
   - **File:** `server/uploads/items/{itemNumber}_icon.mp4`
   - **Checks if file exists** (may not exist if icon generation failed)
   - **If exists, uploads with:**
     ```javascript
     {
       public_id: `${itemNumber}_icon`,
       folder: 'echo-catering/videos',
       resource_type: 'video',
       overwrite: true
     }
     ```
   - **Cloudinary Public ID:** `echo-catering/videos/{itemNumber}_icon`
   - **Result:** `cloudinaryIconUrl` = `https://res.cloudinary.com/.../video/upload/v{version}/echo-catering/videos/{itemNumber}_icon.mp4`
   - **Non-fatal:** Icon upload failure doesn't stop processing

#### Step 8: Update Database (99%)
- **Message:** "Updating database with Cloudinary URLs..."
- **What happens:**
  1. Finds `Cocktail` document by `itemNumber`
  2. Updates with:
     ```javascript
     {
       cloudinaryVideoUrl: mainVideoResult.secure_url, // REQUIRED
       cloudinaryVideoPublicId: mainVideoResult.public_id, // e.g., "echo-catering/videos/1_full"
       cloudinaryIconUrl: iconVideoResult?.secure_url, // Optional (if icon uploaded)
       cloudinaryIconPublicId: iconVideoResult?.public_id // Optional
     }
     ```
  3. Saves document to MongoDB
  4. **CRITICAL:** Only updates DB if main video upload succeeded

#### Step 9: Cleanup (After Success)
- **CRITICAL:** Cleanup ONLY runs after successful Cloudinary upload and DB update
- **If Cloudinary upload fails, cleanup does NOT run** (files kept for debugging)

**Cleanup Steps:**

1. **Delete temp folder:**
   - **Location:** `server/uploads/items/temp_files/{itemNumber}/`
   - **Contains:** All intermediate files (original, preprocessed, white-balanced, etc.)
   - **Action:** `fs.promises.rm(tempDir, { recursive: true, force: true })`

2. **Delete main video file:**
   - **Location:** `server/uploads/items/{itemNumber}.mp4`
   - **Action:** `fs.promises.unlink(mainVideoPath)`
   - **Reason:** Cloudinary-only storage (no local files after upload)

3. **Delete icon video file:**
   - **Location:** `server/uploads/items/{itemNumber}_icon.mp4`
   - **Action:** `fs.promises.unlink(iconVideoPath)` (if exists)
   - **Reason:** Cloudinary-only storage

#### Step 10: Mark Complete (100%)
- **Stage:** `complete`
- **Message:** "Processing complete!"
- **Status:**
  ```javascript
  {
    active: false,
    stage: 'complete',
    progress: 100,
    message: 'Processing complete!'
  }
  ```

**Error Handling:**
- If ANY fatal error occurs (missing file, Cloudinary upload failure), processing is marked as failed:
  ```javascript
  {
    active: false,
    stage: 'error',
    error: error.message,
    message: `Error: ${error.message}`
  }
  ```
- Files are NOT cleaned up on error (kept for debugging)

---

## Option 2: Upload Video (Direct Upload)

### Frontend Flow

**File:** `src/admin/components/MenuManager.js`

**Function:** `handleUploadVideo(file)`

**What happens:**

1. **User selects video and clicks "Upload Video"**
2. **Frontend only:**
   - Creates preview URL: `URL.createObjectURL(file)`
   - Sets `videoPreviewUrl` state
   - Sets `videoUpload` state to file object
   - Updates `editingCocktail.videoFile` to `file.name`
   - **NO backend API call**

3. **Video is displayed in preview:**
   - `<video>` element uses `videoPreviewUrl` (blob URL)
   - User can see video before saving

4. **When user clicks "Save Changes":**
   - Video file is included in FormData
   - Sent to `/api/menu-items` (POST) or `/api/menu-items/:id` (PUT)
   - Backend saves video locally and optionally uploads to Cloudinary
   - **NOTE:** This is handled by the menu items route, NOT video processing route

**Key Difference:**
- **Process Video:** Immediate upload + processing + Cloudinary
- **Upload Video:** Only frontend preview, actual upload happens when saving cocktail

---

## Option 3: Upload Icon (Icon-Only Processing)

### Frontend Flow

**File:** `src/admin/components/MenuManager.js`

**Function:** `handleUploadIcon(file, itemNumber)`

**Steps:**

1. **User selects video and clicks "Upload Icon"**
2. **Sets processing status:**
   ```javascript
   setProcessingStatus({
     active: true,
     stage: 'creating-icon',
     progress: 0,
     total: 100,
     message: 'Creating icon version...',
     itemNumber: itemNumber
   });
   ```

3. **Uploads video to server:**
   - Creates `FormData` with field `'video'`
   - POSTs to: `/api/video-processing/process-icon/:itemNumber`
   - Server processes and generates icon

4. **Starts polling for status**

---

### Backend Processing Flow

**Endpoint:** `POST /api/video-processing/process-icon/:itemNumber`

**Steps:**

1. **Upload video to temp folder:**
   - **Saves to:** `server/uploads/items/temp_files/{itemNumber}/{itemNumber}_original.{ext}`

2. **Apply white balance:**
   - Samples top row for white balance
   - Applies uniform gain
   - **Saves to:** `temp_files/{itemNumber}/{itemNumber}_icon_wb.mov`

3. **Generate icon video:**
   - Calls `generateIconVideo(wbPath, iconOutputPath, itemNumber)`
   - **Saves to:** `server/uploads/items/{itemNumber}_icon.mp4` (FINAL LOCATION)

4. **Upload to Cloudinary (if implemented):**
   - **NOTE:** Current implementation may not upload icon to Cloudinary automatically
   - Icon file remains in local storage until manually uploaded

5. **Update status:**
   - Sets `active: false` when complete
   - Frontend polling stops

**Important:** Icon-only processing does NOT create a main video.

---

## File Paths Summary

### During Processing (Temp Files)

**Location:** `server/uploads/items/temp_files/{itemNumber}/`

**Files:**
- `{itemNumber}_original.{ext}` - Original uploaded file
- `{itemNumber}_preprocessed.mov` - Cropped/trimmed (deleted after white balance)
- `{itemNumber}_preprocessed_wb.mov` - White-balanced version
- `{itemNumber}_icon_wb.mov` - Icon-specific white-balanced (for icon-only processing)

**Cleanup:** Temp folder deleted after successful Cloudinary upload

---

### Final Output Files

**Location:** `server/uploads/items/`

**Files:**
- `{itemNumber}.mp4` - Main processed video (after full processing)
- `{itemNumber}_icon.mp4` - Icon video (480x480, <2MB)

**Cleanup:** Both files deleted after successful Cloudinary upload

---

### Cloudinary Storage

**Folder:** `echo-catering/videos/`

**Public IDs:**
- Main video: `echo-catering/videos/{itemNumber}_full`
- Icon video: `echo-catering/videos/{itemNumber}_icon`

**Full URLs:**
- Main: `https://res.cloudinary.com/{cloud_name}/video/upload/v{version}/echo-catering/videos/{itemNumber}_full.mp4`
- Icon: `https://res.cloudinary.com/{cloud_name}/video/upload/v{version}/echo-catering/videos/{itemNumber}_icon.mp4`

---

## Database Updates

**Model:** `Cocktail` (MongoDB)

**Fields Updated (after Cloudinary upload):**

```javascript
{
  itemNumber: 1,
  // ... other fields ...
  cloudinaryVideoUrl: "https://res.cloudinary.com/.../1_full.mp4", // REQUIRED
  cloudinaryVideoPublicId: "echo-catering/videos/1_full",
  cloudinaryIconUrl: "https://res.cloudinary.com/.../1_icon.mp4", // Optional
  cloudinaryIconPublicId: "echo-catering/videos/1_icon"
}
```

**Update Timing:**
- **Only updated after successful Cloudinary upload**
- **Main video upload is required** (fatal if fails)
- **Icon video upload is optional** (non-fatal if fails)

---

## Status Tracking

### Per-Item Status Map

**Location:** `server/routes/videoProcessing.js`

**Structure:**
```javascript
itemProcessingStatus = Map<itemNumber, {
  active: boolean,
  stage: string,
  progress: number, // 0-100
  total: number, // 100
  message: string,
  startTime: number,
  estimatedTimeRemaining: number | null,
  error: string | null,
  itemNumber: number
}>
```

### Stages

1. `uploading` - Video being uploaded to server (0-5%)
2. `preprocessing` - Cropping and trimming (5-10%)
3. `white-balance` - Applying white balance (10-15%)
4. `icon-generation` - Creating icon video (15-20%)
5. `processing` - Main video processing started (20%)
6. `extracting` - Extracting frames (20-40%)
7. `preprocessing-frames` - Processing frames (40-60%)
8. `blurring` - Blurring backgrounds (60-80%)
9. `compositing` - Compositing frames (80-85%)
10. `encoding` - Encoding final video (85-90%)
11. `cloudinary-upload` - Uploading to Cloudinary (92-99%)
12. `complete` - Processing finished (100%)
13. `error` - Processing failed

---

## Critical Invariants

### Before Cloudinary Upload

1. **Main video file MUST exist:**
   - Path: `server/uploads/items/{itemNumber}.mp4`
   - File must have non-zero size
   - If missing or empty, processing fails immediately

2. **Icon video may or may not exist:**
   - Path: `server/uploads/items/{itemNumber}_icon.mp4`
   - Icon upload failure is non-fatal

### After Cloudinary Upload

1. **Database MUST be updated with Cloudinary URLs:**
   - `cloudinaryVideoUrl` is REQUIRED
   - `cloudinaryIconUrl` is OPTIONAL

2. **Cleanup ONLY runs after success:**
   - Temp folder deleted
   - Local video files deleted
   - If Cloudinary upload fails, files are kept for debugging

---

## Common Issues and Diagnostics

### Issue 1: Video Not Uploading to Cloudinary

**Check:**
1. **Environment variables:**
   ```bash
   CLOUDINARY_CLOUD_NAME=your-cloud-name
   CLOUDINARY_API_KEY=your-api-key
   CLOUDINARY_API_SECRET=your-api-secret
   ```

2. **Server logs:**
   - Look for `[uploadVideosToCloudinary]` messages
   - Check for "Cloudinary config check" log
   - Look for "Cloudinary upload failed" errors

3. **File existence:**
   - Check: `server/uploads/items/{itemNumber}.mp4`
   - File must exist and have non-zero size
   - Logs show file existence checks

4. **Processing status:**
   - Check: `GET /api/video-processing/status/:itemNumber`
   - Look for `stage: 'cloudinary-upload'`
   - Check for `error` field

### Issue 2: Processing Completes but No Cloudinary URL in DB

**Possible causes:**
1. Cloudinary upload failed silently
2. Database update failed after upload
3. Processing marked complete before Cloudinary upload

**Diagnosis:**
- Check server logs for Cloudinary upload errors
- Check if `cloudinaryVideoUrl` is in status response
- Check MongoDB directly for `cloudinaryVideoUrl` field

### Issue 3: Files Deleted Before Upload

**This should NOT happen** - current code verifies files exist before upload.

**If it happens:**
- Check server logs for file existence checks
- Look for ENOENT errors in Cloudinary upload
- Check if cleanup ran too early (should only run after Cloudinary upload)

### Issue 4: Icon Video Not Generated

**Possible causes:**
1. Icon generation failed (all quality settings exceeded 2MB)
2. White balance step failed
3. File permissions issue

**Diagnosis:**
- Check logs for "Icon generation error"
- Check if `{itemNumber}_icon.mp4` exists in `server/uploads/items/`
- Check processing status for icon-specific errors

---

## Key Differences from Map/Gallery Uploads

### Map/Gallery Uploads
- **Single API call:** Upload → Cloudinary → DB → Delete temp file
- **Simpler flow:** No multi-step processing
- **Synchronous:** Returns when complete

### Video Processing
- **Multiple API calls:** Upload → Start processing → Poll status
- **Complex flow:** Multiple processing stages
- **Asynchronous:** Processing happens in background, frontend polls for status

### Common Patterns
- **Both verify file exists before Cloudinary upload**
- **Both upload to Cloudinary FIRST, then update DB**
- **Both delete temp files only after successful upload**
- **Both use Cloudinary-only storage** (delete local files after upload)

---

## Summary

### Process Video Flow

```
1. Frontend: Upload video → /api/video-processing/upload-base/:itemNumber
   ↓
2. Server: Save to temp_files/{itemNumber}/{itemNumber}_original.{ext}
   ↓
3. Frontend: Start processing → /api/video-processing/process/:itemNumber
   ↓
4. Server: Process video (async):
   - Preprocess (crop, trim)
   - White balance
   - Generate icon video → saves to items/{itemNumber}_icon.mp4
   - Generate main video → saves to items/{itemNumber}.mp4
   ↓
5. Server: Verify files exist
   ↓
6. Server: Upload to Cloudinary:
   - Main video → echo-catering/videos/{itemNumber}_full
   - Icon video → echo-catering/videos/{itemNumber}_icon
   ↓
7. Server: Update database with Cloudinary URLs
   ↓
8. Server: Cleanup (delete temp folder + local video files)
   ↓
9. Frontend: Polling detects completion, refreshes cocktail list
   ↓
10. Frontend: Displays video using Cloudinary URL
```

### Upload Video Flow

```
1. Frontend: User selects file → handleUploadVideo(file)
   ↓
2. Frontend: Creates preview URL, updates state
   ↓
3. Frontend: User clicks "Save Changes"
   ↓
4. Frontend: Sends video in FormData to /api/menu-items
   ↓
5. Server: Saves video locally (handled by menu items route)
   ↓
6. Server: Optionally uploads to Cloudinary (if route supports it)
```

### Upload Icon Flow

```
1. Frontend: Upload video → /api/video-processing/process-icon/:itemNumber
   ↓
2. Server: Save to temp_files, apply white balance
   ↓
3. Server: Generate icon video → saves to items/{itemNumber}_icon.mp4
   ↓
4. Server: Mark processing complete
   ↓
5. Frontend: Polling detects completion
```

---

## Important Notes

1. **Cloudinary upload is REQUIRED for main video** - processing fails if upload fails
2. **Cloudinary upload is OPTIONAL for icon video** - processing continues if icon upload fails
3. **Local files are deleted after Cloudinary upload** - Cloudinary-only storage
4. **Temp folder is deleted after successful upload** - intermediate files removed
5. **Files are kept on error** - for debugging failed processing
6. **Status is tracked per-item** - multiple videos can process simultaneously
7. **Frontend polls for status** - real-time progress updates

