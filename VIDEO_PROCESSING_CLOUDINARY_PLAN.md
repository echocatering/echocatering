# Video Processing + Cloudinary Integration - Foolproof Plan

## Current Video Processing Flow

### Step 1: Upload
- **Endpoint**: `POST /api/video-processing/upload-base/:itemNumber`
- **Location**: Video saved to `server/uploads/items/temp_files/{itemNumber}/{itemNumber}_original.{ext}`
- **Status**: ✅ Working

### Step 2: Process
- **Endpoint**: `POST /api/video-processing/process/:itemNumber`
- **Function**: `processVideoForItem(itemNumber)` (line 2344)
- **Steps**:
  1. Preprocess (crop 1:1, trim to 15.58s)
  2. White balance adjustment
  3. Generate icon video → `server/uploads/items/{itemNumber}_icon.mp4`
  4. Generate main video → `server/uploads/items/{itemNumber}.mp4`
  5. Cleanup temp files
  6. **MISSING**: Upload to Cloudinary ❌
  7. **MISSING**: Update database ❌

### Step 3: Completion
- **Location**: Lines 2517-2539 in `videoProcessing.js`
- **Current**: Just marks status as complete
- **Missing**: Cloudinary upload and database update

## Problem

1. Videos are processed and saved locally
2. **Cloudinary upload never happens**
3. **Database never gets `cloudinaryVideoUrl`**
4. Frontend can't find videos (no Cloudinary URLs in database)

## Solution: Add Cloudinary Upload & Database Update

### Integration Points

#### 1. After Final Videos Are Created (videoProcessing.js)

**Location**: After line 2534 (before marking complete)

**What to add**:
- Upload main video (`{itemNumber}.mp4`) to Cloudinary
- Upload icon video (`{itemNumber}_icon.mp4`) to Cloudinary  
- Update database with Cloudinary URLs
- Update processing status with Cloudinary upload progress

### Implementation Plan

#### Phase 1: Add Cloudinary Upload Function

**File**: `server/routes/videoProcessing.js`

**Add imports at top**:
```javascript
const Cocktail = require('../models/Cocktail');
const { uploadToCloudinary } = require('../utils/cloudinary');
```

#### Phase 2: Create Upload Helper Function

**Add new function before `processVideoForItem`**:
```javascript
/**
 * Upload processed videos to Cloudinary and update database
 * @param {number} itemNumber - Item number
 * @param {string} mainVideoPath - Path to main video file
 * @param {string} iconVideoPath - Path to icon video file
 * @param {object} status - Processing status object to update
 * @returns {Promise<object>} Object with cloudinaryVideoUrl and cloudinaryIconUrl
 */
const uploadVideosToCloudinary = async (itemNumber, mainVideoPath, iconVideoPath, status) => {
  const results = {
    cloudinaryVideoUrl: null,
    cloudinaryIconUrl: null,
    error: null
  };
  
  try {
    // Update status
    status.stage = 'cloudinary-upload';
    status.message = 'Uploading videos to Cloudinary...';
    status.progress = 92;
    
    // Upload main video
    if (fs.existsSync(mainVideoPath)) {
      status.message = 'Uploading main video to Cloudinary...';
      const mainVideoResult = await uploadToCloudinary(mainVideoPath, {
        resourceType: 'video',
        folder: 'echo-catering/videos',
        publicId: `echo-catering/videos/${itemNumber}_full` // Predictable public ID
      });
      
      results.cloudinaryVideoUrl = mainVideoResult.url;
      console.log(`✅ Main video uploaded to Cloudinary: ${mainVideoResult.url}`);
      status.progress = 96;
    } else {
      console.warn(`⚠️  Main video not found: ${mainVideoPath}`);
    }
    
    // Upload icon video
    if (fs.existsSync(iconVideoPath)) {
      status.message = 'Uploading icon video to Cloudinary...';
      const iconVideoResult = await uploadToCloudinary(iconVideoPath, {
        resourceType: 'video',
        folder: 'echo-catering/videos',
        publicId: `echo-catering/videos/${itemNumber}_icon` // Predictable public ID
      });
      
      results.cloudinaryIconUrl = iconVideoResult.url;
      console.log(`✅ Icon video uploaded to Cloudinary: ${iconVideoResult.url}`);
      status.progress = 98;
    } else {
      console.warn(`⚠️  Icon video not found: ${iconVideoPath}`);
    }
    
    // Update database
    if (results.cloudinaryVideoUrl || results.cloudinaryIconUrl) {
      status.message = 'Updating database with Cloudinary URLs...';
      
      const updateData = {};
      if (results.cloudinaryVideoUrl) {
        updateData.cloudinaryVideoUrl = results.cloudinaryVideoUrl;
        updateData.cloudinaryVideoPublicId = `echo-catering/videos/${itemNumber}_full`;
      }
      if (results.cloudinaryIconUrl) {
        updateData.cloudinaryIconUrl = results.cloudinaryIconUrl;
        updateData.cloudinaryIconPublicId = `echo-catering/videos/${itemNumber}_icon`;
      }
      
      // Find cocktail by itemNumber and update
      const cocktail = await Cocktail.findOne({ itemNumber: itemNumber });
      if (cocktail) {
        Object.assign(cocktail, updateData);
        await cocktail.save();
        console.log(`✅ Database updated with Cloudinary URLs for item ${itemNumber}`);
      } else {
        console.warn(`⚠️  Cocktail not found for itemNumber ${itemNumber} - cannot update database`);
      }
      
      status.progress = 99;
    }
    
    return results;
  } catch (error) {
    console.error(`❌ Cloudinary upload failed for item ${itemNumber}:`, error);
    results.error = error.message;
    // Don't throw - processing succeeded, Cloudinary upload is bonus
    // But log error so we know it failed
    return results;
  }
};
```

#### Phase 3: Integrate into processVideoForItem

**Location**: After line 2534 (after verifying final files exist, before marking complete)

**Add this code**:
```javascript
    // Verify final output files exist before cleanup
    const finalVideoPath = path.join(__dirname, '..', 'uploads', 'items', `${itemNumber}.mp4`);
    const finalIconPath = path.join(__dirname, '..', 'uploads', 'items', `${itemNumber}_icon.mp4`);
    
    const finalVideoExists = fs.existsSync(finalVideoPath);
    const finalIconExists = fs.existsSync(finalIconPath);
    
    if (!finalVideoExists || !finalIconExists) {
      console.warn(`⚠️  Final files missing - keeping temp folder for item ${itemNumber}`);
      console.warn(`   Video exists: ${finalVideoExists}, Icon exists: ${finalIconExists}`);
    } else {
      // ✅ ADD CLOUDINARY UPLOAD HERE
      try {
        const cloudinaryResults = await uploadVideosToCloudinary(
          itemNumber,
          finalVideoPath,
          finalIconPath,
          status
        );
        
        if (cloudinaryResults.error) {
          console.error(`⚠️  Cloudinary upload failed (but processing succeeded): ${cloudinaryResults.error}`);
        } else {
          console.log(`✅ Cloudinary upload complete for item ${itemNumber}`);
          console.log(`   Main video: ${cloudinaryResults.cloudinaryVideoUrl || 'not uploaded'}`);
          console.log(`   Icon video: ${cloudinaryResults.cloudinaryIconUrl || 'not uploaded'}`);
        }
      } catch (cloudinaryError) {
        // Don't fail processing if Cloudinary upload fails
        console.error(`⚠️  Cloudinary upload error (processing still succeeded):`, cloudinaryError);
      }
      
      // Both final files exist - delete entire temp folder immediately (no longer needed)
      try {
        await fs.promises.rm(tempDir, { recursive: true, force: true });
        console.log(`✅ Cleaned up temp folder for item ${itemNumber} (processing complete)`);
      } catch (cleanupError) {
        console.warn(`⚠️  Failed to delete temp folder for item ${itemNumber}:`, cleanupError.message);
      }
    }
    
    status.stage = 'complete';
    status.message = 'Processing complete!';
    status.progress = 100;
    status.active = false;
```

#### Phase 4: Update Cloudinary Utility (if needed)

**Check**: `server/utils/cloudinary.js` already has `uploadToCloudinary` function ✅

**May need to adjust**:
- Set `overwrite: true` to allow re-uploads with same public ID
- Or keep `overwrite: false` and handle existing files

**Recommended**: Use `overwrite: true` so re-processing updates the Cloudinary file

### Testing Plan

1. **Upload new video** via admin panel
2. **Watch processing status** - should show "Uploading videos to Cloudinary..." stage
3. **Check database** - `cloudinaryVideoUrl` and `cloudinaryIconUrl` should be populated
4. **Check API response** - `/api/menu-items/menu-gallery` should include Cloudinary URLs
5. **Check frontend** - Videos should render from Cloudinary

### Error Handling

- **If Cloudinary upload fails**: Log error but don't fail processing
- **If database update fails**: Log error but processing still succeeds
- **If file missing**: Log warning but continue with available files
- **Status updates**: Always update processing status so user knows what's happening

### Benefits

1. ✅ Videos automatically uploaded to Cloudinary after processing
2. ✅ Database automatically updated with Cloudinary URLs
3. ✅ Frontend can immediately access videos
4. ✅ Predictable public IDs (easy to manage)
5. ✅ Graceful error handling (processing still succeeds if Cloudinary fails)
6. ✅ Status updates show Cloudinary upload progress

### Edge Cases Handled

- File missing (checks exist before upload)
- Database record not found (logs warning)
- Cloudinary upload failure (doesn't break processing)
- Partial success (uploads what it can)
- Re-processing (overwrites Cloudinary files)

### Next Steps

1. Implement `uploadVideosToCloudinary` function
2. Integrate into `processVideoForItem` 
3. Test with a new video upload
4. Verify database gets updated
5. Verify frontend can access videos
6. Monitor logs for any issues

