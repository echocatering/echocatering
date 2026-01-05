# Cleanup and Migration Plan

**Purpose:** Organize the project for easier migration and remove unnecessary files.

## 📋 Current State Analysis

### Files Going to Cloudinary

1. **Gallery Images** → `echo-catering/gallery/`
   - Location: `server/uploads/gallery/`
   - Thumbnails: Generated in Cloudinary (no local needed)
   - Status: ✅ Already integrated

2. **About Page Images** → `echo-catering/about/`
   - Location: `server/uploads/about/`
   - Status: ✅ Already integrated

3. **Logo** → `echo-catering/logo/`
   - Location: `server/uploads/logo/`
   - Status: ✅ Already integrated

4. **Cocktail Videos/Images** → ❌ NOT YET INTEGRATED
   - Location: `server/uploads/cocktails/`
   - Status: ⚠️ Still using local storage only
   - Needs: Cloudinary integration for videos

### Files That Can Be Deleted

1. **Test Files** (`server/uploads/test/`)
   - `test.MOV` - Test video
   - `background_fbf.mp4` - Test video
   - `bg_frames/` - 932 PNG frame files (test processing)
   - `main_frames/` - 932 PNG frame files (test processing)
   - `composite_frames/` - Test frames
   - `recorded_frames/` - Test frames
   - `temp_frames/` - Test frames
   - **Action:** DELETE - These are development/test files

2. **Temporary Files** (`server/uploads/cocktails/temp_files/`)
   - `1/1_original.MOV` - Original video before processing
   - `2/2_original.MOV` - Original video before processing
   - **Action:** DELETE - These are temporary processing files

3. **Local Thumbnails** (`server/uploads/gallery/thumbnails/`)
   - All `*_thumb.jpg` files
   - **Action:** DELETE after migration - Cloudinary generates thumbnails on-the-fly

### Files to Keep (For Now)

1. **Gallery Images** (`server/uploads/gallery/*.jpg`)
   - Keep until migrated to Cloudinary
   - Delete after migration script runs successfully

2. **About Images** (`server/uploads/about/*.jpg`)
   - Keep until migrated to Cloudinary
   - Delete after migration script runs successfully

3. **Cocktail Media** (`server/uploads/cocktails/*.mp4`, `*.png`)
   - Keep until Cloudinary integration is complete
   - These need Cloudinary video support first

4. **Logo** (`server/uploads/logo/*`)
   - Keep until migrated to Cloudinary
   - Delete after migration script runs successfully

## 🎯 Recommended Cleanup Steps

### Phase 1: Delete Test/Temp Files (Safe - No Migration Needed)

```bash
# Delete test directory entirely
rm -rf server/uploads/test/

# Delete temp files in cocktails
rm -rf server/uploads/cocktails/temp_files/
```

### Phase 2: Organize Migration Scripts

**Current:** `scripts/migrateToCloudinary.js` (general migration)

**Recommended Structure:**
```
scripts/
  migrate/
    migrate-gallery.js      # Gallery images only
    migrate-about.js         # About images only
    migrate-logo.js          # Logo only
    migrate-cocktails.js     # Cocktail media (after Cloudinary video support)
    migrate-all.js           # Run all migrations in order
```

### Phase 3: Update File Organization

**Current Structure:**
```
server/uploads/
  ├── gallery/
  │   ├── *.jpg
  │   └── thumbnails/  ← Can delete after migration
  ├── cocktails/
  │   ├── *.mp4
  │   ├── *.png
  │   └── temp_files/  ← DELETE
  ├── about/
  │   └── *.jpg
  ├── logo/
  │   └── *.png
  ├── maps/  ← Check if used
  └── test/  ← DELETE
```

**After Cleanup:**
```
server/uploads/
  ├── gallery/      ← Keep until migrated
  ├── cocktails/    ← Keep until migrated
  ├── about/        ← Keep until migrated
  └── logo/         ← Keep until migrated
```

**After Migration:**
```
server/uploads/     ← Can be empty or minimal (fallback only)
```

## 📝 Migration Strategy

### Step 1: Clean Up Test/Temp Files
- Delete `server/uploads/test/` entirely
- Delete `server/uploads/cocktails/temp_files/`
- Delete `server/uploads/gallery/thumbnails/` (Cloudinary generates these)

### Step 2: Migrate Category by Category

1. **Gallery Images** (Easiest - Already integrated)
   - Run migration script
   - Verify all images accessible from Cloudinary
   - Delete local files

2. **About Images** (Easy - Already integrated)
   - Run migration script
   - Verify all images accessible
   - Delete local files

3. **Logo** (Easy - Already integrated)
   - Run migration script
   - Verify logo accessible
   - Delete local files

4. **Cocktail Media** (Requires Cloudinary video support)
   - First: Add Cloudinary video upload to cocktail route
   - Then: Run migration script
   - Verify videos accessible
   - Delete local files

### Step 3: Update Code to Remove Local Fallbacks

After all files are migrated:
- Remove local file serving routes (or keep as fallback)
- Update models to require Cloudinary URLs
- Clean up unused file handling code

## 🔧 Code Changes Needed

### 1. Add Cocktail Video Support to Cloudinary

**File:** `server/routes/upload.js`
- Update `/api/upload/cocktail` route to upload to Cloudinary
- Use `resourceType: 'video'` for videos
- Store `cloudinaryPublicId` in database

### 2. Organize Migration Scripts

Create separate migration scripts for each category:
- Easier to run incrementally
- Easier to debug
- Can verify each category before moving to next

### 3. Update Models

**Files to update:**
- `server/models/Cocktail.js` - Add Cloudinary fields
- `server/models/Gallery.js` - Already has Cloudinary fields ✅
- `server/models/Content.js` - Check if needs Cloudinary fields

## 📊 File Size Analysis

**Before Cleanup:**
- `server/uploads/test/` - ~1.8GB (932 frame files × 2 directories)
- `server/uploads/cocktails/temp_files/` - ~500MB (original videos)
- `server/uploads/gallery/thumbnails/` - ~50MB (can regenerate)

**After Cleanup:**
- Estimated reduction: ~2.3GB
- Remaining files: Only production files that need migration

## ✅ Checklist for Clean Migration

- [ ] Delete test/temp files
- [ ] Delete local thumbnails (Cloudinary generates these)
- [ ] Organize migration scripts by category
- [ ] Add Cloudinary video support for cocktails
- [ ] Run gallery migration and verify
- [ ] Run about migration and verify
- [ ] Run logo migration and verify
- [ ] Run cocktail migration and verify (after video support)
- [ ] Delete local files after each successful migration
- [ ] Update code to remove local fallbacks (optional)
- [ ] Update documentation

## 🚀 Quick Start for New Chat Session

If starting fresh:

1. **Read this file** - Understand the current state
2. **Check `docs/DEPLOYMENT_STATUS.md`** - See deployment status
3. **Run cleanup script** - Delete test/temp files
4. **Organize migration scripts** - Create category-specific scripts
5. **Migrate incrementally** - One category at a time
6. **Verify after each step** - Don't delete until verified

## 📁 Recommended File Structure After Cleanup

```
echo-catering/
├── server/
│   ├── uploads/           ← Minimal (fallback only after migration)
│   │   ├── gallery/       ← Empty after migration
│   │   ├── cocktails/     ← Empty after migration
│   │   ├── about/         ← Empty after migration
│   │   └── logo/          ← Empty after migration
│   ├── routes/
│   │   └── upload.js     ← Cloudinary integration
│   └── utils/
│       └── cloudinary.js  ← Cloudinary utilities
├── scripts/
│   └── migrate/
│       ├── migrate-gallery.js
│       ├── migrate-about.js
│       ├── migrate-logo.js
│       ├── migrate-cocktails.js
│       └── migrate-all.js
└── docs/
    ├── CLEANUP_AND_MIGRATION_PLAN.md  ← This file
    └── DEPLOYMENT_STATUS.md
```

## 💡 Key Principles

1. **Migrate incrementally** - One category at a time
2. **Verify before deleting** - Always verify Cloudinary URLs work
3. **Keep local as fallback** - Until everything is verified
4. **Organize by purpose** - Separate scripts for each category
5. **Document everything** - So next chat session understands

---

**Next Steps:** Start with Phase 1 (delete test/temp files) - this is safe and will free up ~2.3GB immediately.

