# Cloudinary Upload Integration Solution

## Problem
- Videos are uploaded to local storage but NOT uploaded to Cloudinary
- Database `cloudinaryVideoUrl` field is empty
- Cloudinary rewrites filenames (e.g., `1.mp4` → `1_g3xipv.mp4`)
- Frontend can't find videos because database doesn't have the actual Cloudinary URLs

## Current State

### What EXISTS:
1. ✅ `server/utils/cloudinary.js` - Has `uploadToCloudinary()` function
2. ✅ Database schema - Has `cloudinaryVideoUrl` field in Cocktail model
3. ✅ Frontend validation - Uses `isCloudinaryUrl()` to check URLs
4. ✅ Video upload handling - Videos are saved locally in `server/routes/menuItems.js`

### What's MISSING:
1. ❌ No call to `uploadToCloudinary()` when videos are uploaded
2. ❌ `cloudinaryVideoUrl` field never gets populated in database
3. ❌ No Cloudinary upload in video processing pipeline

## Solution Strategy

### Option 1: Upload to Cloudinary Immediately on Video Upload (Recommended)
**When**: Right after video is saved locally (in PUT `/api/menu-items/:id`)

**Steps**:
1. After video file is saved locally
2. Upload to Cloudinary using `uploadToCloudinary(filePath, { resourceType: 'video', folder: 'echo-catering/videos' })`
3. Save `result.url` (secure_url) to `cocktail.cloudinaryVideoUrl`
4. Save `result.publicId` to `cocktail.cloudinaryVideoPublicId`
5. Save cocktail to database

**Benefits**:
- Immediate Cloudinary URL available
- Frontend can render videos immediately
- Single upload operation

### Option 2: Background Job to Upload Existing Videos
**When**: One-time migration + future uploads

**Steps**:
1. Create script to upload all existing local videos to Cloudinary
2. Update database with Cloudinary URLs
3. Update upload handlers to upload new videos to Cloudinary immediately

**Benefits**:
- Fixes existing data
- Ensures all videos are in Cloudinary

### Option 3: Use Public ID Based on itemNumber
**When**: Upload to Cloudinary

**Strategy**:
- Use `publicId: 'echo-catering/videos/1'` for itemNumber 1
- This ensures predictable URLs even if Cloudinary rewrites filenames
- Can reconstruct URL: `https://res.cloudinary.com/duysruzct/video/upload/{version}/echo-catering/videos/1`

## Implementation Plan

### Step 1: Add Cloudinary Upload to Menu Items PUT Route
Location: `server/routes/menuItems.js` - around line 1549-1600

```javascript
const { uploadToCloudinary } = require('../utils/cloudinary');

// After video file is saved locally (around line 1573 or 1600)
if (videoFile) {
  // ... existing local file handling ...
  
  // UPLOAD TO CLOUDINARY
  try {
    console.log(`☁️  Uploading video to Cloudinary for item ${resolvedItemNumber}...`);
    const cloudinaryResult = await uploadToCloudinary(videoFile.path, {
      resourceType: 'video',
      folder: 'echo-catering/videos',
      publicId: `echo-catering/videos/${resolvedItemNumber}` // Use itemNumber for predictable ID
    });
    
    // Save Cloudinary URL and publicId to database
    cocktail.cloudinaryVideoUrl = cloudinaryResult.url;
    cocktail.cloudinaryVideoPublicId = cloudinaryResult.publicId;
    
    console.log(`✅ Cloudinary upload successful:`);
    console.log(`   URL: ${cloudinaryResult.url}`);
    console.log(`   Public ID: ${cloudinaryResult.publicId}`);
  } catch (cloudinaryError) {
    console.error(`❌ Cloudinary upload failed:`, cloudinaryError.message);
    // Don't fail the entire request - video is saved locally as fallback
    // But log error so we know upload failed
  }
}
```

### Step 2: Add Cloudinary Upload to POST Route (New Cocktails)
Location: `server/routes/menuItems.js` - around line 1409-1430

Same logic when creating new cocktails with videos.

### Step 3: Migration Script for Existing Videos
Create `server/scripts/uploadVideosToCloudinary.js`:

```javascript
// One-time script to upload all existing local videos to Cloudinary
// and update database with Cloudinary URLs
```

### Step 4: Handle Icon Videos Too
Same logic for `cloudinaryIconUrl` when icon videos are uploaded.

## Key Considerations

### 1. Cloudinary Folder Structure
- Videos: `echo-catering/videos/{itemNumber}`
- Icons: `echo-catering/videos/{itemNumber}_icon` (if applicable)

### 2. Public ID Strategy
- **Option A**: Use itemNumber (`echo-catering/videos/1`) - Predictable, overwrites on re-upload
- **Option B**: Let Cloudinary auto-generate - Unique, but harder to track

**Recommendation**: Use itemNumber for predictable URLs and easier management.

### 3. Error Handling
- Don't fail entire request if Cloudinary upload fails
- Log errors for monitoring
- Keep local file as fallback (though frontend won't use it now)

### 4. Cleanup
- After successful Cloudinary upload, could delete local file to save space
- OR keep local file as backup
- Consider Cloudinary's storage costs vs local storage

## Testing

1. Upload a new video via admin panel
2. Check database - `cloudinaryVideoUrl` should be populated
3. Check API response - `cloudinaryVideoUrl` should be in response
4. Check frontend - Video should render from Cloudinary

## Next Steps

1. Implement Cloudinary upload in PUT route
2. Implement Cloudinary upload in POST route  
3. Test with new video upload
4. Create migration script for existing videos
5. Run migration script to fix existing data
6. Remove hardcoded URL from menuGallery2.js (once DB has all URLs)

