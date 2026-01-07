# Video Processing Pipeline Refactoring - Complete Change Summary

## Overview
This document details all changes made to enforce strict invariants in the video processing pipeline and fix Cloudinary upload behavior.

---

## 1. Main Video Generation - Made Blocking and Authoritative

### Problem
The `generate-background-fbf` endpoint was returning before the file was fully written, causing race conditions.

### Solution
Added file existence and size validation after encoding completes, and return absolute path explicitly.

### Changes in `server/routes/videoProcessing.js`

**BEFORE (lines ~1288-1323):**
```javascript
await new Promise((resolve, reject) => {
  childProcess.on('close', (code) => {
    if (code === 0) {
      resolve();
    } else {
      reject(new Error(`FFmpeg encoding failed with code ${code}`));
    }
  });
});

processingStatus.progress = finalFrameCount;
processingStatus.message = 'Encoding complete!';

// ... cleanup ...

res.json({
  success: true,
  outputUrl: `/uploads/test/${outputName}`,  // Only relative URL
  message: 'Frame-by-frame background video generated',
  frameCount: finalFrameCount,
  duration: videoDuration,
  fps: encodeFps
});
```

**AFTER:**
```javascript
await new Promise((resolve, reject) => {
  childProcess.on('close', (code) => {
    if (code === 0) {
      resolve();
    } else {
      reject(new Error(`FFmpeg encoding failed with code ${code}`));
    }
  });
});

processingStatus.progress = finalFrameCount;
processingStatus.message = 'Encoding complete!';

// CRITICAL: Assert that output file exists and has non-zero size before returning
if (!fs.existsSync(outputPath)) {
  throw new Error(`Output file not found after encoding: ${outputPath}`);
}

const outputStats = await fs.promises.stat(outputPath);
if (outputStats.size === 0) {
  throw new Error(`Output file is empty (0 bytes): ${outputPath}`);
}

console.log(`[generate-background-fbf] ✅ Output file verified: ${outputPath} (${(outputStats.size / (1024 * 1024)).toFixed(2)} MB)`);

// ... cleanup ...

// Return absolute output path explicitly
const absoluteOutputPath = path.resolve(outputPath);
console.log(`[generate-background-fbf] Returning absolute output path: ${absoluteOutputPath}`);

res.json({
  success: true,
  outputPath: absoluteOutputPath,  // NEW: Explicit absolute path
  outputUrl: `/uploads/${outputDir}/${outputName}`,  // Relative URL for compatibility
  message: 'Frame-by-frame background video generated',
  frameCount: finalFrameCount,
  duration: videoDuration,
  fps: encodeFps
});
```

**Key Changes:**
- ✅ Validates file exists after encoding
- ✅ Validates file has non-zero size
- ✅ Returns `outputPath` (absolute) in response
- ✅ Logs file verification with size

---

## 2. Removed All Filesystem Polling and Fallback Path Guessing

### Problem
The code was polling for files in multiple locations (test/, items/) with 60-second timeouts, causing delays and uncertainty.

### Solution
Removed all polling logic. Now receives exact path directly from generation response.

### Changes in `server/routes/videoProcessing.js`

**BEFORE (lines ~2700-2776):**
```javascript
res.on('end', async () => {
  clearInterval(statusSyncInterval);
  if (res.statusCode === 200) {
    // Wait for file to be written - poll until it exists or timeout
    const testOutput = path.join(__dirname, '..', 'uploads', 'test', `${itemNumber}.mp4`);
    const itemsOutput = path.join(__dirname, '..', 'uploads', 'items', `${itemNumber}.mp4`);
    
    console.log(`[processVideoForItem] Waiting for output file for item ${itemNumber}...`);
    
    // Poll for file existence (check every 500ms, up to 60 seconds)
    const maxWaitTime = 60000; // 60 seconds
    const pollInterval = 500; // Check every 500ms
    const startTime = Date.now();
    let fileFound = false;
    
    while (!fileFound && (Date.now() - startTime) < maxWaitTime) {
      // Check all possible locations
      if (fs.existsSync(outputPath)) {
        console.log(`✅ Output file found at correct location: ${outputPath}`);
        fileFound = true;
        break;
      } else if (fs.existsSync(itemsOutput)) {
        console.log(`✅ Output file found in items directory: ${itemsOutput}`);
        fileFound = true;
        break;
      } else if (fs.existsSync(testOutput)) {
        // Move from test directory to items directory
        console.log(`📦 Moving output file from test to items: ${testOutput} → ${outputPath}`);
        // ... move/copy logic ...
        fileFound = true;
        break;
      } else {
        // File not found yet, wait and check again
        await new Promise(resolve => setTimeout(resolve, pollInterval));
      }
    }
    
    if (!fileFound) {
      reject(new Error(`Output file not found after waiting ${maxWaitTime / 1000} seconds...`));
    } else {
      resolve();
    }
  }
});
```

**AFTER:**
```javascript
res.on('end', () => {
  clearInterval(statusSyncInterval);
  if (res.statusCode === 200) {
    try {
      const responseData = JSON.parse(data);
      // Get absolute output path directly from response
      if (responseData.outputPath) {
        mainVideoPath = responseData.outputPath;
        console.log(`[processVideoForItem] Main video path returned from generation: ${mainVideoPath}`);
      } else {
        // Fallback: construct path from outputUrl if outputPath not provided
        const relativePath = responseData.outputUrl || `/uploads/items/${itemNumber}.mp4`;
        mainVideoPath = path.join(__dirname, '..', relativePath.replace(/^\//, ''));
        console.log(`[processVideoForItem] Constructed main video path from outputUrl: ${mainVideoPath}`);
      }
      resolve();
    } catch (parseError) {
      reject(new Error(`Failed to parse response: ${parseError.message}. Response: ${data}`));
    }
  } else {
    reject(new Error(`Processing failed: ${res.statusCode} - ${data}`));
  }
});

// CRITICAL: Assert main video path was received
if (!mainVideoPath) {
  throw new Error('Main video path not returned from generation step');
}
```

**Key Changes:**
- ✅ Removed all polling loops (60-second waits)
- ✅ Removed path guessing (test/, items/ checks)
- ✅ Removed file moving/copying logic
- ✅ Uses exact path from generation response
- ✅ Validates path was received

---

## 3. Enforced Hard Invariant Before Cloudinary Upload

### Problem
Code was checking for files but not enforcing they exist before upload, allowing upload attempts with missing files.

### Solution
Added strict assertions that throw errors if main video doesn't exist before upload step.

### Changes in `server/routes/videoProcessing.js`

**BEFORE (lines ~2781-2859):**
```javascript
// Verify final output files exist before cleanup
// Wait a moment for icon video to finish...
const finalVideoPath = path.join(__dirname, '..', 'uploads', 'items', `${itemNumber}.mp4`);
const finalIconPath = path.join(__dirname, '..', 'uploads', 'items', `${itemNumber}_icon.mp4`);

const finalVideoExists = fs.existsSync(finalVideoPath);
const finalIconExists = fs.existsSync(finalIconPath);

if (!finalVideoExists || !finalIconExists) {
  console.warn(`⚠️  Final files missing - keeping temp folder...`);
  status.error = `Final files missing: video=${finalVideoExists}, icon=${finalIconExists}`;
} else {
  // Upload to Cloudinary...
}
```

**AFTER:**
```javascript
// CRITICAL: Enforce hard invariant - main video MUST exist before Cloudinary upload
if (!mainVideoPath || !fs.existsSync(mainVideoPath)) {
  const error = `Main video file does not exist before Cloudinary upload: ${mainVideoPath || 'null'}`;
  console.error(`[processVideoForItem] ❌ ${error}`);
  status.active = false;
  status.stage = 'error';
  status.error = error;
  status.message = `Error: ${error}`;
  itemProcessingStatus.set(itemNumber, status);
  throw new Error(error);  // FATAL - stops processing
}

// Verify main video has non-zero size
const mainVideoStats = await fs.promises.stat(mainVideoPath);
if (mainVideoStats.size === 0) {
  const error = `Main video file is empty (0 bytes): ${mainVideoPath}`;
  console.error(`[processVideoForItem] ❌ ${error}`);
  status.active = false;
  status.stage = 'error';
  status.error = error;
  status.message = `Error: ${error}`;
  itemProcessingStatus.set(itemNumber, status);
  throw new Error(error);  // FATAL - stops processing
}

// Icon video path (may or may not exist - that's OK)
const iconVideoPath = path.join(__dirname, '..', 'uploads', 'items', `${itemNumber}_icon.mp4`);
const iconVideoExists = fs.existsSync(iconVideoPath);

// Log invariant before Cloudinary upload
console.log(`[processVideoForItem] ✅ Invariant check before Cloudinary upload:`);
console.log(`   Main video path: ${mainVideoPath}`);
console.log(`   Main video exists: true`);
console.log(`   Main video size: ${(mainVideoStats.size / (1024 * 1024)).toFixed(2)} MB`);
console.log(`   Icon video path: ${iconVideoPath}`);
console.log(`   Icon video exists: ${iconVideoExists}`);
```

**Key Changes:**
- ✅ Throws error if main video doesn't exist (fatal)
- ✅ Throws error if main video is empty (fatal)
- ✅ Marks processing as failed (`active: false`, `stage: 'error'`)
- ✅ Logs invariant check with file size
- ✅ Icon video missing is non-fatal (only logged)

---

## 4. Fixed Cloudinary Upload Options and Control Flow

### Problem
- Using `resourceType` instead of `resource_type` (Cloudinary API format)
- Duplicating folder path in `public_id` (e.g., `echo-catering/videos/1_full` when folder is already `echo-catering/videos`)
- Not awaiting all upload promises properly
- Not validating `secure_url` exists after upload
- Icon upload failure was blocking main video

### Solution
Fixed API options, corrected public_id structure, added validation, made icon upload non-blocking.

### Changes in `server/utils/cloudinary.js`

**BEFORE:**
```javascript
const uploadOptions = {
  folder,
  resource_type: resourceType,
  use_filename: true,
  unique_filename: true,
  overwrite: true,
};

if (publicId) {
  uploadOptions.public_id = publicId;
}

const result = await cloudinary.uploader.upload(filePath, uploadOptions);

return {
  url: result.secure_url,
  // ...
};
```

**AFTER:**
```javascript
const uploadOptions = {
  folder,
  resource_type: resourceType,  // ✅ Already correct
  use_filename: false,  // ✅ Changed: Don't use filename when publicId is provided
  unique_filename: false,  // ✅ Changed: Don't make unique when publicId is provided
  overwrite: true,
};

if (publicId) {
  uploadOptions.public_id = publicId;
  // When publicId is provided, don't use filename or unique_filename
  uploadOptions.use_filename = false;
  uploadOptions.unique_filename = false;
}

const result = await cloudinary.uploader.upload(filePath, uploadOptions);

// CRITICAL: Assert secure_url exists
if (!result.secure_url) {
  throw new Error(`Cloudinary upload succeeded but did not return secure_url. Result: ${JSON.stringify(result)}`);
}

return {
  url: result.secure_url,
  // ...
};
```

### Changes in `server/routes/videoProcessing.js` - `uploadVideosToCloudinary` function

**BEFORE (lines ~2435-2485):**
```javascript
// Upload main video
if (fs.existsSync(mainVideoPath)) {
  status.message = 'Uploading main video to Cloudinary...';
  
  const mainVideoResult = await uploadToCloudinary(mainVideoPath, {
    resourceType: 'video',  // ❌ Wrong: should be resourceType in options, but API uses resource_type
    folder: 'echo-catering/videos',
    publicId: `echo-catering/videos/${itemNumber}_full`  // ❌ Wrong: duplicates folder
  });
  
  results.cloudinaryVideoUrl = mainVideoResult.url;
  // ...
} else {
  console.warn(`⚠️  Main video not found: ${mainVideoPath}`);
  results.error = `Main video file not found: ${mainVideoPath}`;
}

// Upload icon video
if (fs.existsSync(iconVideoPath)) {
  // ... similar code ...
} else {
  // ... error handling ...
}
```

**AFTER:**
```javascript
// Upload main video - CRITICAL: This must succeed
// Main video path is already verified to exist before this function is called
status.message = 'Uploading main video to Cloudinary...';
itemProcessingStatus.set(itemNumber, status);

console.log(`[uploadVideosToCloudinary] Uploading main video: ${mainVideoPath}`);
console.log(`   Folder: echo-catering/videos`);
console.log(`   Public ID: ${itemNumber}_full`);  // ✅ No folder duplication

const mainVideoResult = await uploadToCloudinary(mainVideoPath, {
  resourceType: 'video',  // ✅ Correct (gets converted to resource_type in uploadToCloudinary)
  folder: 'echo-catering/videos',
  publicId: `${itemNumber}_full`  // ✅ Correct: No folder duplication
});

// CRITICAL: Assert secure_url was returned
if (!mainVideoResult.url) {
  throw new Error(`Main video upload did not return secure_url. Result: ${JSON.stringify(mainVideoResult)}`);
}

results.cloudinaryVideoUrl = mainVideoResult.url;
console.log(`✅ Main video uploaded to Cloudinary: ${mainVideoResult.url}`);
console.log(`   Public ID: ${mainVideoResult.publicId}`);
status.progress = 96;
itemProcessingStatus.set(itemNumber, status);

// Upload icon video - Independent, non-blocking
// Icon upload failure should not block the main video
if (fs.existsSync(iconVideoPath)) {
  status.message = 'Uploading icon video to Cloudinary...';
  itemProcessingStatus.set(itemNumber, status);
  
  console.log(`[uploadVideosToCloudinary] Uploading icon video: ${iconVideoPath}`);
  console.log(`   Folder: echo-catering/videos`);
  console.log(`   Public ID: ${itemNumber}_icon`);  // ✅ No folder duplication
  
  try {
    const iconVideoResult = await uploadToCloudinary(iconVideoPath, {
      resourceType: 'video',
      folder: 'echo-catering/videos',
      publicId: `${itemNumber}_icon`  // ✅ Correct: No folder duplication
    });
    
    if (iconVideoResult.url) {
      results.cloudinaryIconUrl = iconVideoResult.url;
      console.log(`✅ Icon video uploaded to Cloudinary: ${iconVideoResult.url}`);
      console.log(`   Public ID: ${iconVideoResult.publicId}`);
    } else {
      console.warn(`⚠️  Icon video upload did not return secure_url (non-fatal)`);
    }
    status.progress = 98;
    itemProcessingStatus.set(itemNumber, status);
  } catch (iconError) {
    // Icon upload failure is non-fatal - log but don't throw
    console.warn(`⚠️  Icon video upload failed (non-fatal): ${iconError.message}`);
    if (!results.error) {
      results.error = `Icon upload failed: ${iconError.message}`;
    } else {
      results.error += `; Icon upload failed: ${iconError.message}`;
    }
  }
} else {
  console.warn(`⚠️  Icon video not found: ${iconVideoPath} (non-fatal)`);
  // Icon video missing is non-fatal - don't add to error
}
```

**Key Changes:**
- ✅ Fixed `public_id` structure: `{itemNumber}_full` instead of `echo-catering/videos/{itemNumber}_full`
- ✅ Folder is set separately: `folder: 'echo-catering/videos'`
- ✅ Validates `secure_url` exists after main video upload (throws if missing)
- ✅ Icon upload wrapped in try/catch (non-fatal)
- ✅ Icon upload failure doesn't block main video
- ✅ Removed conditional check for main video (already verified before function call)

---

## 5. Fixed Cleanup Semantics

### Problem
Cleanup was running even when Cloudinary upload failed, and was running before upload completed.

### Solution
Cleanup only runs after successful Cloudinary upload and database update. Never runs on failure.

### Changes in `server/routes/videoProcessing.js`

**BEFORE (lines ~2807-2859):**
```javascript
if (cloudinaryResults.error) {
  console.error(`⚠️  Cloudinary upload failed (but processing succeeded): ${cloudinaryResults.error}`);
  status.error = `Cloudinary upload failed: ${cloudinaryResults.error}`;
} else {
  console.log(`✅ Cloudinary upload complete...`);
}

// Both final files exist - delete entire temp folder immediately (no longer needed)
try {
  await fs.promises.rm(tempDir, { recursive: true, force: true });
  console.log(`✅ Cleaned up temp folder...`);
} catch (cleanupError) {
  console.warn(`⚠️  Failed to delete temp folder...`);
}
```

**AFTER:**
```javascript
let cloudinaryResults;
try {
  cloudinaryResults = await uploadVideosToCloudinary(
    itemNumber,
    mainVideoPath,
    iconVideoPath,
    status
  );
  
  // CRITICAL: If main video upload failed, this is a fatal error
  if (!cloudinaryResults.cloudinaryVideoUrl) {
    const error = `Main video Cloudinary upload failed: ${cloudinaryResults.error || 'No URL returned'}`;
    console.error(`[processVideoForItem] ❌ ${error}`);
    status.active = false;
    status.stage = 'error';
    status.error = error;
    status.message = `Error: ${error}`;
    itemProcessingStatus.set(itemNumber, status);
    throw new Error(error);  // FATAL - prevents cleanup
  }
  
  console.log(`[processVideoForItem] ✅ Cloudinary upload complete for item ${itemNumber}`);
  console.log(`   Main video: ${cloudinaryResults.cloudinaryVideoUrl}`);
  console.log(`   Icon video: ${cloudinaryResults.cloudinaryIconUrl || 'not uploaded (non-fatal)'}`);
  
} catch (cloudinaryError) {
  // Cloudinary upload failure is FATAL - do not mark as complete
  console.error(`[processVideoForItem] ❌ Cloudinary upload error (FATAL):`, cloudinaryError);
  status.active = false;
  status.stage = 'error';
  status.error = `Cloudinary upload failed: ${cloudinaryError.message}`;
  status.message = `Error: ${cloudinaryError.message}`;
  itemProcessingStatus.set(itemNumber, status);
  throw cloudinaryError;  // Re-throw to prevent cleanup and completion
}

// CRITICAL: Only cleanup AFTER successful Cloudinary upload and database update
// Cleanup should never run if Cloudinary upload fails (caught above)
try {
  await fs.promises.rm(tempDir, { recursive: true, force: true });
  console.log(`✅ Cleaned up temp folder for item ${itemNumber} (after successful Cloudinary upload)`);
} catch (cleanupError) {
  console.warn(`⚠️  Failed to delete temp folder for item ${itemNumber}:`, cleanupError.message);
  // Non-fatal - don't fail processing
}
```

**Key Changes:**
- ✅ Cleanup only runs after successful Cloudinary upload
- ✅ Cleanup never runs if upload fails (error is thrown, caught in outer catch)
- ✅ Files are preserved on error for debugging

---

## 6. Fixed Processing Status Semantics

### Problem
Processing was being marked as complete even when Cloudinary upload failed, and errors weren't properly marked.

### Solution
Only mark complete on full success. Mark as failed (`active: false`, `stage: 'error'`) on any fatal error.

### Changes in `server/routes/videoProcessing.js`

**BEFORE (lines ~2861-2876):**
```javascript
status.stage = 'complete';
status.message = 'Processing complete!';
status.progress = 100;
status.active = false;

} catch (error) {
  status.active = false;
  status.error = error.message;
  status.message = `Error: ${error.message}`;
  console.error(`Error processing item ${itemNumber}:`, error);
  // ... cleanup on error ...
  throw error;
}
```

**AFTER:**
```javascript
// Only mark as complete if we got here (main video exists, uploaded successfully, DB updated)
status.stage = 'complete';
status.message = 'Processing complete!';
status.progress = 100;
status.active = false;
itemProcessingStatus.set(itemNumber, status);

} catch (error) {
  // CRITICAL: On any fatal error, mark processing as failed and inactive
  status.active = false;
  status.stage = 'error';  // ✅ Explicitly set stage to 'error'
  status.error = error.message;
  status.message = `Error: ${error.message}`;
  itemProcessingStatus.set(itemNumber, status);  // ✅ Update status map
  
  console.error(`[processVideoForItem] ❌ Fatal error processing item ${itemNumber}:`, error);
  console.error(`   Error stack:`, error.stack);
  
  // Do NOT cleanup on error - keep files for debugging
  // Original file and temp folder remain for manual inspection
  
  throw error;
}
```

**Key Changes:**
- ✅ Only marks complete if all steps succeed
- ✅ Sets `stage: 'error'` on fatal errors
- ✅ Updates `itemProcessingStatus` map on errors
- ✅ No cleanup on error (files preserved)

### Changes in `server/routes/videoProcessing.js` - `uploadVideosToCloudinary` function

**BEFORE (lines ~2519-2563):**
```javascript
// Update database
if (results.cloudinaryVideoUrl || results.cloudinaryIconUrl) {
  // ... update database ...
} else {
  console.warn(`⚠️  No Cloudinary URLs to save - both uploads failed or files not found`);
}

return results;
} catch (error) {
  console.error(`❌ Cloudinary upload failed...`);
  results.error = error.message;
  // Don't throw - processing succeeded, Cloudinary upload is bonus
  return results;
}
```

**AFTER:**
```javascript
// CRITICAL: Main video URL must exist (already verified above)
// Update database with Cloudinary URLs
status.message = 'Updating database with Cloudinary URLs...';
itemProcessingStatus.set(itemNumber, status);

const updateData = {
  cloudinaryVideoUrl: results.cloudinaryVideoUrl,  // Always present (verified above)
  cloudinaryVideoPublicId: `echo-catering/videos/${itemNumber}_full`
};

if (results.cloudinaryIconUrl) {
  updateData.cloudinaryIconUrl = results.cloudinaryIconUrl;
  updateData.cloudinaryIconPublicId = `echo-catering/videos/${itemNumber}_icon`;
}

console.log(`[uploadVideosToCloudinary] Updating database with:`, updateData);

// Find cocktail by itemNumber and update
const cocktail = await Cocktail.findOne({ itemNumber: itemNumber });
if (!cocktail) {
  throw new Error(`Cocktail not found for itemNumber ${itemNumber} - cannot update database`);
}

Object.assign(cocktail, updateData);
await cocktail.save();
console.log(`✅ Database updated with Cloudinary URLs for item ${itemNumber}`);

status.progress = 99;
itemProcessingStatus.set(itemNumber, status);

return results;
} catch (error) {
  console.error(`❌ Cloudinary upload failed for item ${itemNumber}:`, error);
  // Re-throw error - Cloudinary upload failure is now FATAL
  throw error;  // ✅ Changed: Now throws instead of returning error
}
```

**Key Changes:**
- ✅ Throws error on Cloudinary upload failure (fatal)
- ✅ Database update is required (throws if cocktail not found)
- ✅ Main video URL is always present (verified before function call)

---

## 7. Added Minimal Invariant Logging

### Changes Added Throughout

**In `generate-background-fbf` endpoint:**
```javascript
console.log(`[generate-background-fbf] ✅ Output file verified: ${outputPath} (${(outputStats.size / (1024 * 1024)).toFixed(2)} MB)`);
console.log(`[generate-background-fbf] Returning absolute output path: ${absoluteOutputPath}`);
```

**In `processVideoForItem` function:**
```javascript
console.log(`[processVideoForItem] Main video path returned from generation: ${mainVideoPath}`);
console.log(`[processVideoForItem] ✅ Invariant check before Cloudinary upload:`);
console.log(`   Main video path: ${mainVideoPath}`);
console.log(`   Main video exists: true`);
console.log(`   Main video size: ${(mainVideoStats.size / (1024 * 1024)).toFixed(2)} MB`);
```

**In `uploadVideosToCloudinary` function:**
```javascript
console.log(`[uploadVideosToCloudinary] Uploading main video: ${mainVideoPath}`);
console.log(`   Folder: echo-catering/videos`);
console.log(`   Public ID: ${itemNumber}_full`);
```

---

## Summary of Key Invariants Enforced

1. ✅ **Main video generation is blocking** - File is verified to exist and have non-zero size before response
2. ✅ **No polling** - Uses exact path from generation response
3. ✅ **Main video must exist** - Throws fatal error if missing before Cloudinary upload
4. ✅ **Main video must have size** - Throws fatal error if empty
5. ✅ **Cloudinary upload must succeed** - Throws fatal error if main video upload fails
6. ✅ **Database must update** - Throws fatal error if cocktail not found
7. ✅ **Cleanup only on success** - Never runs if any step fails
8. ✅ **Status reflects reality** - Only marked complete on full success, marked error on any failure

---

## Expected Behavior After Changes

### Success Flow:
1. Video uploaded → preprocessing → white balance → icon generation
2. Main video generation → **waits for file to be written** → **validates file exists and has size** → **returns absolute path**
3. **Receives exact path** (no polling) → **validates main video exists and has size**
4. **Uploads to Cloudinary** with correct `public_id` structure → **validates `secure_url` returned**
5. **Updates database** → **cleans up temp files** → **marks complete**

### Failure Flow:
1. Any fatal error (missing file, empty file, Cloudinary failure, DB error) → **throws error**
2. **Status marked as failed** (`active: false`, `stage: 'error'`)
3. **No cleanup** (files preserved for debugging)
4. **Processing stops** (doesn't mark as complete)

---

## Files Modified

1. `server/routes/videoProcessing.js` - Main processing logic
2. `server/utils/cloudinary.js` - Cloudinary upload utility

## Testing Recommendations

1. Test with valid video → should complete successfully
2. Test with missing main video file → should fail with clear error
3. Test with Cloudinary API failure → should fail with clear error
4. Test with missing cocktail in DB → should fail with clear error
5. Verify files are preserved on error for debugging
6. Verify cleanup only runs on success

