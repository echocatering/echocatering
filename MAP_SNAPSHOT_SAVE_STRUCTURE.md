# Map Snapshot Save Structure

## Overview

Map snapshots are PNG images generated from the interactive world map SVG in the Menu Manager. They capture the current state of selected countries/regions and are saved to Cloudinary for display on the frontend.

## Database Schema

### Cocktail Model Fields (`server/models/Cocktail.js`)

**Legacy Field (deprecated, kept for backward compatibility):**
- `mapSnapshotFile` (String, default: '') - Old local file reference, now cleared after Cloudinary upload

**Cloudinary Fields (current):**
- `cloudinaryMapSnapshotUrl` (String, default: '') - Full Cloudinary URL to the map snapshot image
- `cloudinaryMapSnapshotPublicId` (String, default: '') - Cloudinary public ID (e.g., `echo-catering/maps/1_map`)

**Virtual Field:**
- `mapSnapshotUrl` - Returns `cloudinaryMapSnapshotUrl` if available, otherwise falls back to local path

```javascript
cocktailSchema.virtual('mapSnapshotUrl').get(function() {
  if (this.cloudinaryMapSnapshotUrl && 
      this.cloudinaryMapSnapshotUrl.trim() !== '' && 
      (this.cloudinaryMapSnapshotUrl.startsWith('http://') || this.cloudinaryMapSnapshotUrl.startsWith('https://'))) {
    return this.cloudinaryMapSnapshotUrl;
  }
  return this.mapSnapshotFile ? `/menu-items/${this.mapSnapshotFile}` : '';
});
```

## Frontend: Map Snapshot Generation

### Location: `src/admin/components/MenuManager.js`

### Function: `saveMapSnapshot(itemNumber)`

**When it's called:**
- Automatically called when saving a cocktail item (for all non-premix categories)
- Called after the cocktail data is successfully saved to the database
- Only runs if `itemNumber` is valid and category is not 'premix'

**Process:**

1. **SVG Reference Retrieval**
   - Uses `svgRef.current` to get the actual SVG element
   - Waits up to 2 seconds (20 attempts × 100ms) for SVG to be ready
   - Throws error if SVG is not available

2. **Map Highlight Refresh**
   - Calls `refreshMapHighlights()` to ensure selected regions are visually updated
   - Waits 50ms for DOM updates to apply

3. **SVG Cloning and Processing**
   - Clones the SVG element with all current styles
   - Sets `xmlns` attribute for proper SVG namespace
   - Removes white background rectangles (filters out `#ffffff`, `#fff`, `white`, etc.)
   - Sets transparent background
   - Sets viewBox to `0 0 2000 857` if not present
   - Sets dimensions to `1200×600` pixels

4. **SVG to PNG Conversion**
   - Serializes SVG to string using `XMLSerializer`
   - Creates a Blob from the SVG string
   - Creates an Image object from the SVG Blob
   - Draws the image onto a Canvas (1200×600 pixels)
   - Converts canvas to PNG Blob using `canvas.toBlob()` with quality 1.0

5. **Upload to Server**
   - Creates FormData with the PNG blob
   - Field name: `'map'`
   - Filename: `{itemNumber}.png`
   - POSTs to `/api/menu-items/map/{itemNumber}`

**Code Flow:**
```javascript
// Called during cocktail save (handleSave)
if (!isPremix && finalItemNumber && Number.isFinite(finalItemNumber)) {
  try {
    await saveMapSnapshot(finalItemNumber);
  } catch (error) {
    console.error('Error saving map snapshot:', error);
    // Non-fatal: shows alert but doesn't fail the save
    alert(`Map snapshot could not be saved: ${error.message}`);
  }
}
```

## Backend: Map Snapshot Upload Route

### Location: `server/routes/menuItems.js`

### Route: `POST /api/menu-items/map/:itemNumber`

**Authentication:** Requires `authenticateToken` and `requireEditor` middleware

**Multer Configuration:**
- **Destination:** `server/uploads/items/` (same as video files)
- **Filename:** `{itemNumber}.png` (e.g., `1.png`, `2.png`)
- **Field name:** Must be `'map'`

**Process:**

1. **Validation**
   - Validates `itemNumber` from URL params (must be a finite number)
   - Checks that file was received (`req.file` exists)
   - Logs file details (filename, path, size)

2. **Cocktail Lookup**
   - Finds `Cocktail` record by `itemNumber`
   - Returns 404 if cocktail not found
   - Deletes temp file if cocktail not found

3. **Old File Cleanup**
   - If `cocktail.mapSnapshotFile` exists, deletes the old local file
   - This is for cleanup of legacy local files (Cloudinary-only storage now)

4. **Cloudinary Upload**
   - Uploads the temp PNG file to Cloudinary
   - **Public ID:** `{itemNumber}_map` (e.g., `1_map`, `2_map`)
   - **Folder:** `echo-catering/maps` (creates `echo-catering/maps/{itemNumber}_map`)
   - **Resource Type:** `image`
   - **Overwrite:** `true` (allows re-uploading maps for the same item)
   - Validates that `secure_url` is returned

5. **Database Update**
   - Sets `cocktail.cloudinaryMapSnapshotUrl` = Cloudinary secure URL
   - Sets `cocktail.cloudinaryMapSnapshotPublicId` = Cloudinary public ID
   - Clears `cocktail.mapSnapshotFile` = `null` (no local file reference)
   - Saves the cocktail record

6. **Cleanup**
   - Deletes the temp file from `server/uploads/items/` after successful upload
   - Returns success response with Cloudinary URL and public ID

**Response:**
```json
{
  "success": true,
  "itemNumber": 1,
  "cloudinaryUrl": "https://res.cloudinary.com/.../echo-catering/maps/1_map.png",
  "publicId": "echo-catering/maps/1_map"
}
```

**Error Handling:**
- If Cloudinary upload fails, deletes temp file and returns 500 error
- If cocktail not found, deletes temp file and returns 404 error
- All errors are logged with detailed messages

## Cloudinary Storage Structure

**Folder:** `echo-catering/maps/`

**Public ID Format:** `{itemNumber}_map`

**Examples:**
- Item 1: `echo-catering/maps/1_map`
- Item 2: `echo-catering/maps/2_map`
- Item 15: `echo-catering/maps/15_map`

**Full URL Format:**
```
https://res.cloudinary.com/{cloud_name}/image/upload/{version}/echo-catering/maps/{itemNumber}_map.png
```

## Frontend Display

### Menu Gallery Pages

**Location:** `src/pages/menuGallery2.js`, `src/pages/menugallery.js`, `src/pages/Home.js`

**Usage:**
```javascript
<img 
  src={info?.mapSnapshot || '/assets/images/worldmap.svg'} 
  alt="World Map" 
/>
```

The `mapSnapshot` field comes from the API response, which uses the `mapSnapshotUrl` virtual that prioritizes Cloudinary URLs.

## Key Characteristics

1. **Cloudinary-Only Storage:** Maps are stored exclusively in Cloudinary, not locally
2. **Automatic Generation:** Maps are automatically generated and saved when a cocktail is saved
3. **Overwrite Behavior:** Re-uploading a map for the same item overwrites the existing Cloudinary asset
4. **Non-Fatal:** Map snapshot save failures don't prevent cocktail saves from succeeding
5. **Mandatory for Non-Premix:** Maps are generated for all categories except 'premix'
6. **Consistent Naming:** Public IDs follow the pattern `{itemNumber}_map` for easy identification

## Data Flow Summary

```
1. User selects countries on map in MenuManager
2. User clicks "Save Changes"
3. Cocktail data is saved to database
4. saveMapSnapshot(itemNumber) is called
5. SVG is cloned, processed, and converted to PNG
6. PNG is uploaded to /api/menu-items/map/{itemNumber}
7. Backend saves PNG temporarily to server/uploads/items/{itemNumber}.png
8. Backend uploads PNG to Cloudinary with public_id: {itemNumber}_map
9. Backend updates Cocktail record with cloudinaryMapSnapshotUrl
10. Backend deletes temp file
11. Frontend receives success response
12. Map snapshot is now available via cloudinaryMapSnapshotUrl
```

## Related Files

- **Frontend:** `src/admin/components/MenuManager.js` (saveMapSnapshot function)
- **Backend:** `server/routes/menuItems.js` (POST /api/menu-items/map/:itemNumber)
- **Model:** `server/models/Cocktail.js` (schema and virtuals)
- **Display:** `src/pages/menuGallery2.js`, `src/pages/menugallery.js`, `src/pages/Home.js`

