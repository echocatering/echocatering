# Cloudinary Overwrite Implementation

**Date:** January 2026  
**Purpose:** Document the automatic Cloudinary file overwriting system and how assets are accessed throughout the application

---

## Table of Contents

1. [Overview](#overview)
2. [Overwrite Implementation](#overwrite-implementation)
3. [Public ID Structure](#public-id-structure)
4. [Backend: How Files Are Uploaded](#backend-how-files-are-uploaded)
5. [Backend: Database Models and Virtuals](#backend-database-models-and-virtuals)
6. [Frontend: How Assets Are Accessed](#frontend-how-assets-are-accessed)
7. [Frontend: Cloudinary URL Validation](#frontend-cloudinary-url-validation)
8. [API Responses](#api-responses)
9. [Examples](#examples)

---

## Overview

The system automatically uploads files to Cloudinary and **overwrites existing files** when the same file is re-uploaded. This ensures:

- ✅ No duplicate files in Cloudinary
- ✅ Same URL structure (with updated version parameter)
- ✅ Automatic replacement when files are updated
- ✅ Consistent public IDs for predictable overwriting

### Supported File Types

1. **Logo** - Single logo file
2. **Gallery Images** - Event gallery photos
3. **About Section Images** - About page section images
4. **Map Snapshots** - Country map PNGs for menu items
5. **Videos** - Main videos (`{itemNumber}_full`) and icon videos (`{itemNumber}_icon`)

---

## Overwrite Implementation

### How It Works

When a file is uploaded:

1. **Consistent Public ID**: Each file type uses a predictable `publicId` that doesn't change between uploads
2. **Overwrite Enabled**: The `uploadToCloudinary` function has `overwrite: true` set
3. **Same URL**: Cloudinary maintains the same URL structure (with updated version), so existing references continue to work

### Key Configuration

**File:** `server/utils/cloudinary.js`

```javascript
const uploadOptions = {
  folder,
  resource_type: resourceType,
  use_filename: false,
  unique_filename: false,
  overwrite: true, // ✅ This enables overwriting
};

if (publicId) {
  uploadOptions.public_id = publicId; // Consistent publicId ensures overwrite
}
```

---

## Public ID Structure

Each file type uses a specific public ID format to ensure consistent overwriting:

| File Type | Public ID Format | Example | Cloudinary Path |
|-----------|----------------|---------|-----------------|
| **Logo** | `logo` | `logo` | `echo-catering/logo/logo` |
| **Gallery** | `{original-filename}` | `my-image` | `echo-catering/gallery/my-image` |
| **About Section** | `section{number}` | `section1` | `echo-catering/about/section1` |
| **Map Snapshot** | `{itemNumber}_map` | `1_map` | `echo-catering/maps/1_map` |
| **Main Video** | `{itemNumber}_full` | `1_full` | `echo-catering/videos/1_full` |
| **Icon Video** | `{itemNumber}_icon` | `1_icon` | `echo-catering/videos/1_icon` |

### Example URLs

After upload, Cloudinary generates URLs like:

```
https://res.cloudinary.com/{cloud_name}/image/upload/v{version}/echo-catering/logo/logo.png
https://res.cloudinary.com/{cloud_name}/image/upload/v{version}/echo-catering/gallery/my-image.jpg
https://res.cloudinary.com/{cloud_name}/image/upload/v{version}/echo-catering/about/section1.jpg
https://res.cloudinary.com/{cloud_name}/image/upload/v{version}/echo-catering/maps/1_map.png
https://res.cloudinary.com/{cloud_name}/video/upload/v{version}/echo-catering/videos/1_full.mp4
https://res.cloudinary.com/{cloud_name}/video/upload/v{version}/echo-catering/videos/1_icon.mp4
```

**Note:** The `v{version}` parameter changes when a file is overwritten, but the base URL structure remains the same.

---

## Backend: How Files Are Uploaded

### 1. Logo Upload (`POST /api/upload/logo`)

**File:** `server/routes/upload.js`

```javascript
// Extract publicId from existing record if available, otherwise use "logo"
let publicId = 'logo';
if (existingLogo?.cloudinaryPublicId) {
  const existingId = existingLogo.cloudinaryPublicId;
  if (existingId.includes('/')) {
    publicId = existingId.split('/').pop(); // Get last part after /
  } else {
    publicId = existingId;
  }
}

const cloudinaryResult = await uploadToCloudinary(req.file.path, {
  folder: 'echo-catering/logo',
  resourceType: 'image',
  publicId: publicId, // Consistent publicId ensures overwrite
});
```

**Database Update:**
- Updates `Content` record with `cloudinaryUrl` and `cloudinaryPublicId`
- Page: `'global'`, Section: `'header'`, Type: `'logo'`

### 2. Gallery Upload (`POST /api/upload/gallery`)

**File:** `server/routes/upload.js`

```javascript
// Use original filename (without extension) as publicId
const originalBaseName = file.originalname.replace(/\.[^/.]+$/, '');
const publicId = originalBaseName; // Use original filename as publicId

// Check for existing Gallery record by originalName or cloudinaryPublicId
let galleryImage = await Gallery.findOne({ 
  $or: [
    { originalName: file.originalname },
    { cloudinaryPublicId: publicId }
  ]
});

const cloudinaryResult = await uploadToCloudinary(file.path, {
  folder: 'echo-catering/gallery',
  resourceType: 'image',
  publicId: publicId, // Consistent publicId based on original filename
});
```

**Database Update:**
- Updates or creates `Gallery` record with `cloudinaryUrl` and `cloudinaryPublicId`
- If record exists, updates filename and Cloudinary fields (overwrites previous upload)

### 3. About Section Images (`POST /api/upload/about-image`)

**File:** `server/routes/upload.js`

**Scenario A: Section-specific upload (when `sectionNumber` is provided):**

```javascript
// Use consistent publicId for section
const publicId = `section${sectionNumber}`; // e.g., "section1", "section2"

const cloudinaryResult = await uploadToCloudinary(sectionFilePath, {
  folder: 'echo-catering/about',
  resourceType: 'image',
  publicId: publicId, // Consistent publicId ensures overwrite
});
```

**Database Update:**
- Updates or creates `Content` record
- Page: `'about'`, Section: `'section{number}'`, Type: `'image'`

**Scenario B: General upload (no `sectionNumber`):**

```javascript
// Use filename-based publicId
const baseName = req.file.filename.replace(/-\d{13}-\d+\./, '.').replace(/\.[^/.]+$/, '');
const publicId = baseName;

const cloudinaryResult = await uploadToCloudinary(actualFilePath, {
  folder: 'echo-catering/about',
  resourceType: 'image',
  publicId: publicId,
});
```

### 4. Map Snapshots (`POST /api/menu-items/map/:itemNumber`)

**File:** `server/routes/menuItems.js`

```javascript
const cloudinaryResult = await uploadToCloudinary(req.file.path, {
  folder: 'echo-catering/maps',
  resourceType: 'image',
  publicId: `${itemNumber}_map` // e.g., "1_map", "2_map"
});
```

**Database Update:**
- Updates `Cocktail` record with `cloudinaryMapSnapshotUrl` and `cloudinaryMapSnapshotPublicId`

### 5. Video Uploads (Main and Icon)

**File:** `server/routes/videoProcessing.js`

```javascript
// Main video
const mainVideoResult = await uploadToCloudinary(mainVideoPath, {
  resourceType: 'video',
  folder: 'echo-catering/videos',
  publicId: `${itemNumber}_full` // e.g., "1_full", "2_full"
});

// Icon video (if exists)
const iconVideoResult = await uploadToCloudinary(iconVideoPath, {
  resourceType: 'video',
  folder: 'echo-catering/videos',
  publicId: `${itemNumber}_icon` // e.g., "1_icon", "2_icon"
});
```

**Database Update:**
- Updates `Cocktail` record with:
  - `cloudinaryVideoUrl` and `cloudinaryVideoPublicId` (main video)
  - `cloudinaryIconUrl` and `cloudinaryIconPublicId` (icon video)

---

## Backend: Database Models and Virtuals

### Cocktail Model (`server/models/Cocktail.js`)

**Cloudinary Fields:**
- `cloudinaryVideoUrl` - Main video Cloudinary URL
- `cloudinaryVideoPublicId` - Main video public ID
- `cloudinaryIconUrl` - Icon video Cloudinary URL
- `cloudinaryIconPublicId` - Icon video public ID
- `cloudinaryMapSnapshotUrl` - Map snapshot Cloudinary URL
- `cloudinaryMapSnapshotPublicId` - Map snapshot public ID

**Virtual Properties:**

```javascript
// videoUrl virtual - prefers Cloudinary, falls back to local
cocktailSchema.virtual('videoUrl').get(function() {
  if (this.cloudinaryVideoUrl && 
      this.cloudinaryVideoUrl.trim() !== '' && 
      (this.cloudinaryVideoUrl.startsWith('http://') || 
       this.cloudinaryVideoUrl.startsWith('https://'))) {
    return this.cloudinaryVideoUrl;
  }
  return this.videoFile ? `/menu-items/${this.videoFile}` : '';
});

// iconVideoUrl virtual - prefers Cloudinary, falls back to local
cocktailSchema.virtual('iconVideoUrl').get(function() {
  if (this.cloudinaryIconUrl && 
      this.cloudinaryIconUrl.trim() !== '' && 
      (this.cloudinaryIconUrl.startsWith('http://') || 
       this.cloudinaryIconUrl.startsWith('https://'))) {
    return this.cloudinaryIconUrl;
  }
  const iconFile = this.videoFile ? this.videoFile.replace('.mp4', '_icon.mp4') : '';
  return iconFile ? `/menu-items/${iconFile}` : '';
});

// mapSnapshotUrl virtual - prefers Cloudinary, falls back to local
cocktailSchema.virtual('mapSnapshotUrl').get(function() {
  if (this.cloudinaryMapSnapshotUrl && 
      this.cloudinaryMapSnapshotUrl.trim() !== '' && 
      (this.cloudinaryMapSnapshotUrl.startsWith('http://') || 
       this.cloudinaryMapSnapshotUrl.startsWith('https://'))) {
    return this.cloudinaryMapSnapshotUrl;
  }
  return this.mapSnapshotFile ? `/menu-items/${this.mapSnapshotFile}` : '';
});
```

### Gallery Model (`server/models/Gallery.js`)

**Cloudinary Fields:**
- `cloudinaryUrl` - Image Cloudinary URL
- `cloudinaryPublicId` - Image public ID

**Virtual Property:**

```javascript
// imagePath virtual - prefers Cloudinary, falls back to local
gallerySchema.virtual('imagePath').get(function() {
  if (this.cloudinaryUrl && 
      this.cloudinaryUrl.trim() !== '' && 
      (this.cloudinaryUrl.startsWith('http://') || 
       this.cloudinaryUrl.startsWith('https://'))) {
    return this.cloudinaryUrl;
  }
  return `/gallery/${this.filename}`;
});
```

### Content Model (`server/models/Content.js`)

**Cloudinary Fields:**
- `cloudinaryUrl` - Content Cloudinary URL
- `cloudinaryPublicId` - Content public ID

**Used For:**
- Logo (page: `'global'`, section: `'header'`, type: `'logo'`)
- About section images (page: `'about'`, section: `'section{number}'`, type: `'image'`)

---

## Frontend: How Assets Are Accessed

### 1. Cloudinary URL Validation Utility

**File:** `src/components/CloudinaryAsset.js` and `src/utils/cloudinaryUtils.js`

```javascript
/**
 * Validates a Cloudinary URL
 * Must be an absolute URL starting with https://res.cloudinary.com/
 */
export function isCloudinaryUrl(url) {
  return typeof url === 'string' && url.trim().startsWith('https://res.cloudinary.com/');
}
```

**Usage:**
```javascript
import { isCloudinaryUrl } from '../utils/cloudinaryUtils';

if (isCloudinaryUrl(image.cloudinaryUrl)) {
  // Use Cloudinary URL
}
```

### 2. CloudinaryAsset Component

**File:** `src/components/CloudinaryAsset.js`

A reusable component that automatically renders images or videos based on the URL:

```javascript
import CloudinaryAsset from '../components/CloudinaryAsset';

<CloudinaryAsset
  src={cloudinaryUrl}
  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
  alt="Description"
/>
```

**Features:**
- Auto-detects video vs image (checks for `/video/upload/` in URL)
- Only renders if URL is a valid Cloudinary URL
- Videos automatically have `autoPlay`, `muted`, `loop`, `playsInline`
- Returns `null` if URL is invalid

### 3. Accessing Assets in Components

#### Menu Items (Videos and Maps)

**File:** `src/pages/menuGallery2.js`

```javascript
import { isCloudinaryUrl } from '../utils/cloudinaryUtils';

// Get video URL from API response
const videoSrc = info?.cloudinaryVideoUrl || info?.videoUrl;

// Only render if it's a Cloudinary URL
if (isCloudinaryUrl(videoSrc)) {
  return (
    <video autoPlay muted loop playsInline>
      <source src={videoSrc} type="video/mp4" />
    </video>
  );
}
```

**API Endpoint:** `GET /api/menu-items/menu-gallery`

Returns:
```json
{
  "cocktails": {
    "cocktailInfo": {
      "item-1": {
        "cloudinaryVideoUrl": "https://res.cloudinary.com/.../1_full.mp4",
        "cloudinaryIconUrl": "https://res.cloudinary.com/.../1_icon.mp4",
        "mapSnapshot": "/menu-items/1.png",
        "videoUrl": "https://res.cloudinary.com/.../1_full.mp4"
      }
    }
  }
}
```

#### Gallery Images

**File:** `src/pages/event_gallery.js`

```javascript
import { isCloudinaryUrl } from '../utils/cloudinaryUtils';

// Get image from API
const imageSrc = image?.cloudinaryUrl || image?.src;

// Render with Cloudinary transformations
{isCloudinaryUrl(imageSrc) && (
  <img
    src={`${imageSrc}?w=1200&auto=format`}
    srcSet={`${imageSrc}?w=800&auto=format 800w, ${imageSrc}?w=1200&auto=format 1200w`}
    sizes="(max-width: 1200px) 50vw, 33vw"
    loading="lazy"
    alt="Gallery image"
  />
)}
```

**API Endpoint:** `GET /api/gallery`

Returns:
```json
[
  {
    "cloudinaryUrl": "https://res.cloudinary.com/.../my-image.jpg",
    "cloudinaryPublicId": "my-image",
    "imagePath": "https://res.cloudinary.com/.../my-image.jpg",
    "filename": "my-image-1234567890-123.jpg"
  }
]
```

**Note:** The `imagePath` virtual automatically returns the Cloudinary URL if available.

#### Logo

**File:** `src/components/DynamicLogo.js` and `src/admin/components/ContentManager.js`

```javascript
// Fetch logo from API
const logoContent = await fetch('/api/content?page=global&section=header&type=logo');

// Use Cloudinary URL
const logoUrl = logoContent.cloudinaryUrl || logoContent.content;

{isCloudinaryUrl(logoUrl) && (
  <img src={logoUrl} alt="Logo" />
)}
```

**API Endpoint:** `GET /api/content?page=global&section=header&type=logo`

Returns:
```json
{
  "cloudinaryUrl": "https://res.cloudinary.com/.../logo.png",
  "cloudinaryPublicId": "logo",
  "content": "/uploads/logo/logo-1234567890.png"
}
```

#### About Section Images

**File:** `src/admin/components/ContentManager.js`

```javascript
// Fetch about section content
const aboutContent = await fetch('/api/content?page=about&section=section1&type=image');

// Use Cloudinary URL
const imageUrl = aboutContent.cloudinaryUrl || aboutContent.metadata?.image;

{isCloudinaryUrl(imageUrl) && (
  <img src={imageUrl} alt="About section" />
)}
```

**API Endpoint:** `GET /api/content?page=about&section=section1&type=image`

Returns:
```json
{
  "cloudinaryUrl": "https://res.cloudinary.com/.../section1.jpg",
  "cloudinaryPublicId": "section1",
  "metadata": {
    "image": "/uploads/about/section1.jpg"
  }
}
```

---

## API Responses

### Upload Responses

All upload routes return both `localPath` and `cloudinaryUrl`:

```json
{
  "success": true,
  "filename": "1.png",
  "itemNumber": 1,
  "localPath": "/menu-items/1.png",
  "cloudinaryUrl": "https://res.cloudinary.com/.../1_map.png"
}
```

### Fetch Responses

All fetch endpoints prioritize Cloudinary URLs:

- **Menu Items:** `cloudinaryVideoUrl`, `cloudinaryIconUrl`, `cloudinaryMapSnapshotUrl`
- **Gallery:** `cloudinaryUrl` (via `imagePath` virtual)
- **Content:** `cloudinaryUrl` (logo, about images)

---

## Examples

### Example 1: Re-uploading a Logo

1. **First Upload:**
   - File: `logo.svg`
   - Public ID: `logo`
   - Cloudinary URL: `https://res.cloudinary.com/.../v1234567890/echo-catering/logo/logo.svg`
   - Database: `cloudinaryUrl` = `https://res.cloudinary.com/.../v1234567890/echo-catering/logo/logo.svg`

2. **Re-upload (Overwrite):**
   - File: `new-logo.svg`
   - Public ID: `logo` (same as before)
   - Cloudinary URL: `https://res.cloudinary.com/.../v9876543210/echo-catering/logo/logo.svg` (new version)
   - Database: `cloudinaryUrl` = `https://res.cloudinary.com/.../v9876543210/echo-catering/logo/logo.svg`
   - **Result:** Old file is overwritten, URL structure remains the same (version updated)

### Example 2: Re-uploading a Gallery Image

1. **First Upload:**
   - Original filename: `event-photo.jpg`
   - Generated filename: `event-photo-1234567890-123.jpg`
   - Public ID: `event-photo` (from original filename)
   - Cloudinary URL: `https://res.cloudinary.com/.../v1234567890/echo-catering/gallery/event-photo.jpg`

2. **Re-upload (Overwrite):**
   - Original filename: `event-photo.jpg` (same name)
   - Generated filename: `event-photo-9876543210-456.jpg` (new timestamp)
   - Public ID: `event-photo` (same as before)
   - Cloudinary URL: `https://res.cloudinary.com/.../v9876543210/echo-catering/gallery/event-photo.jpg` (new version)
   - **Result:** Old file is overwritten, database record is updated with new filename and Cloudinary URL

### Example 3: Re-processing a Video

1. **First Processing:**
   - Item Number: `1`
   - Public IDs: `1_full`, `1_icon`
   - Cloudinary URLs:
     - Main: `https://res.cloudinary.com/.../v1234567890/echo-catering/videos/1_full.mp4`
     - Icon: `https://res.cloudinary.com/.../v1234567890/echo-catering/videos/1_icon.mp4`

2. **Re-processing (Overwrite):**
   - Item Number: `1` (same)
   - Public IDs: `1_full`, `1_icon` (same)
   - Cloudinary URLs:
     - Main: `https://res.cloudinary.com/.../v9876543210/echo-catering/videos/1_full.mp4` (new version)
     - Icon: `https://res.cloudinary.com/.../v9876543210/echo-catering/videos/1_icon.mp4` (new version)
   - **Result:** Old videos are overwritten, URLs updated in database

---

## Summary

### Key Points

1. **Consistent Public IDs**: Each file type uses a predictable public ID format
2. **Automatic Overwriting**: `overwrite: true` ensures existing files are replaced
3. **URL Stability**: Base URL structure remains the same (version parameter updates)
4. **Database Sync**: All Cloudinary URLs are stored in database records
5. **Frontend Priority**: Frontend components prioritize Cloudinary URLs over local paths
6. **Validation**: Strict validation ensures only Cloudinary URLs are rendered

### File Type Summary

| Type | Public ID | Overwrites? | Database Field |
|------|-----------|------------|----------------|
| Logo | `logo` | ✅ Yes | `Content.cloudinaryUrl` |
| Gallery | `{original-filename}` | ✅ Yes | `Gallery.cloudinaryUrl` |
| About Section | `section{number}` | ✅ Yes | `Content.cloudinaryUrl` |
| Map Snapshot | `{itemNumber}_map` | ✅ Yes | `Cocktail.cloudinaryMapSnapshotUrl` |
| Main Video | `{itemNumber}_full` | ✅ Yes | `Cocktail.cloudinaryVideoUrl` |
| Icon Video | `{itemNumber}_icon` | ✅ Yes | `Cocktail.cloudinaryIconUrl` |

---

**Last Updated:** January 2026

