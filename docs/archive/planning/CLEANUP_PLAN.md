# Project Cleanup Plan - Step by Step

**Date:** January 3, 2026  
**Status:** Ready for Review  
**Goal:** Streamline project structure before deployment without breaking functionality

---

## 📋 Current Issues Identified

### 1. Root Directory Clutter
- `cleanup_cocktail_shared_fields.js` - Should be in scripts
- `test-api.html` - Test file, should be archived or removed
- `Icon` - Empty file, should be removed

### 2. Upload Directory Issues
- **Duplicates:** `server/uploads/cocktails/` and `server/uploads/items/` contain same files
- **Test files:** `server/uploads/test/` (~1.8GB of test frames)
- **Temp files:** `server/uploads/cocktails/temp_files/` (original videos)
- **Thumbnails:** `server/uploads/gallery/thumbnails/` (Cloudinary generates these)
- **Empty folder:** `server/uploads/maps/`

### 3. Script Organization
- ✅ Already organized into `scripts/active/` and `scripts/archive/`
- ⚠️ One orphaned script at root level

### 4. Documentation
- ✅ Already organized into `docs/active/` and `docs/archive/`

---

## 🎯 Step-by-Step Cleanup Plan

### **Phase 1: Safe File Cleanup** (No Code Changes)
**Risk Level:** ✅ Very Low - Only deleting test/temp files

#### Step 1.1: Delete Test/Temp Files
- Delete `server/uploads/test/` (test videos and frames)
- Delete `server/uploads/cocktails/temp_files/` (temporary processing files)
- Delete `server/uploads/gallery/thumbnails/` (Cloudinary generates these)
- **Tool:** Use existing `scripts/active/cleanup/cleanup-test-files.js`
- **Expected Savings:** ~2.3GB

#### Step 1.2: Remove Empty/Unused Folders
- Remove `server/uploads/maps/` (empty folder)
- Remove root-level `Icon` file (empty)

#### Step 1.3: Move Root-Level Files
- Move `cleanup_cocktail_shared_fields.js` → `scripts/archive/setup/`
- Move or remove `test-api.html` → `scripts/archive/test/` or delete if no longer needed

**Verification:** 
- Run server and verify website still works
- Check that no code references these deleted files

---

### **Phase 2: Upload Directory Consolidation** (Requires Code Review)
**Risk Level:** ⚠️ Medium - Need to verify which folder is actually used

#### Step 2.1: Identify Active Upload Folder
- Check `server/routes/videoProcessing.js` - which folder does it use?
- Check `server/routes/upload.js` - which folder does it use?
- Check `server/routes/menuItems.js` - which folder does it reference?
- Determine: `cocktails/` or `items/`?

#### Step 2.2: Consolidate Duplicate Folders
- If `items/` is the active folder:
  - Verify all code uses `items/`
  - Delete `server/uploads/cocktails/` (keep only `items/`)
- If `cocktails/` is the active folder:
  - Update code to use `items/` (standardize)
  - Delete `server/uploads/cocktails/` after migration

**Verification:**
- Test video upload functionality
- Test menu item display
- Verify all videos/images load correctly

---

### **Phase 3: Final Organization** (Optional)
**Risk Level:** ✅ Low - Documentation only

#### Step 3.1: Update Documentation
- Update `scripts/README.md` if needed
- Update `docs/README.md` if needed
- Create `.env.example` template (without secrets)

#### Step 3.2: Verify .gitignore
- Ensure `server/uploads/` is properly ignored
- Ensure `.env` is ignored
- Ensure `node_modules/` is ignored

---

## ✅ Pre-Cleanup Checklist

Before starting, verify:
- [ ] Server is running and website works
- [ ] All menu items display correctly
- [ ] Gallery images load
- [ ] Videos play correctly
- [ ] Admin panel works
- [ ] No critical errors in console

---

## 🚨 Safety Measures

1. **Backup First:** All cleanup steps are reversible via git
2. **Test After Each Phase:** Don't proceed to next phase if current phase breaks anything
3. **Incremental Approach:** One step at a time, verify, then continue
4. **Code Review:** Before deleting duplicate folders, verify which is actually used

---

## 📊 Expected Results

**After Phase 1:**
- ~2.3GB disk space freed
- Cleaner root directory
- No test/temp files

**After Phase 2:**
- Single source of truth for uploads (`items/`)
- No duplicate folders
- Consistent codebase

**After Phase 3:**
- Well-documented project
- Ready for deployment
- Professional structure

---

## 🔄 Rollback Plan

If anything breaks:
1. `git status` - See what changed
2. `git restore <file>` - Restore specific files
3. `git reset --hard HEAD` - Full rollback (if needed)

---

## 📝 Notes

- The cleanup script (`scripts/active/cleanup/cleanup-test-files.js`) already exists and is safe to use
- All upload folders (`gallery/`, `about/`, `logo/`, `items/`) should be kept for now (production files)
- Only test/temp files and duplicates will be removed
- No database changes required
- No code functionality changes (only file organization)

---

**Next Step:** Review this plan and approve Phase 1 to begin cleanup.

