# Testing Checklist - Post Cleanup & Consolidation

**Date:** January 5, 2026  
**Purpose:** Verify all functionality after folder consolidation and path changes

---

## 🚨 Critical Tests (Must Pass)

### 1. **Server Startup**
- [ ] Server starts without errors
- [ ] Database connects successfully
- [ ] All routes load correctly
- [ ] No missing module errors

**How to test:**
```bash
npm run server
# Check for errors in console
```

---

### 2. **Video File Serving**
- [ ] Videos load from `/menu-items/{itemNumber}.mp4`
- [ ] Icon videos load from `/menu-items/{itemNumber}_icon.mp4`
- [ ] Map snapshots load from `/menu-items/{itemNumber}.png`
- [ ] No 404 errors for existing videos

**How to test:**
- Open browser console
- Navigate to menu gallery page
- Check Network tab for video/image requests
- Verify all files load (status 200)

**Expected paths:**
- ✅ `/menu-items/1.mp4` (not `/cocktails/1.mp4`)
- ✅ `/menu-items/1_icon.mp4`
- ✅ `/menu-items/1.png`

---

### 3. **Video Upload & Processing**
- [ ] Can upload new video via admin panel
- [ ] Video processing starts correctly
- [ ] Processing status updates in real-time
- [ ] Final video appears after processing
- [ ] Icon video is generated
- [ ] Temp files are cleaned up after processing

**How to test:**
1. Log into admin panel
2. Go to Menu Manager
3. Select an item
4. Upload a new video
5. Watch processing status
6. Verify final video appears
7. Check `server/uploads/items/temp_files/` is cleaned up

**Expected behavior:**
- Upload goes to `items/temp_files/{itemNumber}/`
- Processing creates `items/{itemNumber}.mp4` and `items/{itemNumber}_icon.mp4`
- Temp folder deleted after successful processing

---

### 4. **Admin Panel - Menu Manager**
- [ ] Menu items display correctly
- [ ] Videos play in preview
- [ ] Can edit item details
- [ ] Can save changes
- [ ] Item numbers display correctly

**How to test:**
- Navigate to admin panel → Menu Manager
- Verify all items show with videos
- Click on an item to edit
- Make a change and save
- Verify change persists

---

### 5. **Frontend - Public Website**
- [ ] Home page loads
- [ ] Menu gallery displays items
- [ ] Videos play on menu gallery
- [ ] About page images load
- [ ] Gallery images load
- [ ] Logo displays correctly

**How to test:**
- Start both server and frontend:
  ```bash
  npm run server  # Terminal 1
  npm start       # Terminal 2
  ```
- Navigate through all pages
- Check browser console for 404 errors
- Verify all images/videos load

**Expected paths:**
- ✅ `/menu-items/1.mp4` (videos)
- ✅ `/gallery/*.jpg` (gallery images)
- ✅ `/about/*.jpg` (about images)
- ✅ `/logo/*.png` (logo)

---

## ⚠️ Important Tests (Should Pass)

### 6. **API Endpoints**
- [ ] `GET /api/menu-items` returns data
- [ ] `GET /api/menu-items/menu-gallery` returns items
- [ ] `GET /api/gallery` returns gallery items
- [ ] `GET /api/content` returns content
- [ ] `POST /api/video-processing/upload-base/:itemNumber` works
- [ ] `POST /api/video-processing/process/:itemNumber` works
- [ ] `GET /api/video-processing/status/:itemNumber` works

**How to test:**
```bash
# Test menu items
curl http://localhost:5001/api/menu-items

# Test menu gallery
curl http://localhost:5001/api/menu-items/menu-gallery

# Test gallery
curl http://localhost:5001/api/gallery
```

---

### 7. **Database Queries**
- [ ] Cocktail collection queries work
- [ ] InventorySheet queries work
- [ ] Gallery collection queries work
- [ ] Content collection queries work

**How to test:**
- Check server logs for database errors
- Verify API endpoints return data (not empty arrays)
- Check admin panel shows data

---

### 8. **File Paths in Code**
- [ ] No references to old `cocktails/` paths (except backward compatibility)
- [ ] All new code uses `items/` paths
- [ ] Static file serving works for both `/menu-items` and `/cocktails` routes

**How to test:**
- Search codebase for hardcoded `/cocktails/` paths:
  ```bash
  grep -r "uploads/cocktails" server/ src/ --exclude-dir=node_modules
  ```
- Should only find:
  - Comments/documentation
  - Backward compatibility routes (serving from `items/`)

---

## ✅ Nice-to-Have Tests (Optional)

### 9. **Scripts Still Work**
- [ ] Cleanup script runs: `node scripts/active/cleanup/cleanup-test-files.js`
- [ ] Generate scripts work (if needed)
- [ ] Migration scripts accessible in archive

**How to test:**
```bash
# Test cleanup script (dry run)
node scripts/active/cleanup/cleanup-test-files.js

# Verify scripts are accessible
ls scripts/archive/setup/
ls scripts/archive/generate/
```

---

### 10. **Documentation Access**
- [ ] Can find docs in `docs/active/`
- [ ] Historical docs in `docs/archive/`
- [ ] README files still readable

**How to test:**
- Check `docs/active/` has current docs
- Check `docs/archive/` has historical docs
- Verify no broken links in README files

---

## 🔍 What to Look For

### **Errors to Watch For:**
- ❌ `ENOENT` errors (file not found)
- ❌ 404 errors for videos/images
- ❌ Database connection errors
- ❌ Module not found errors
- ❌ Path resolution errors

### **Success Indicators:**
- ✅ All videos/images load
- ✅ No console errors
- ✅ Processing completes successfully
- ✅ Temp files cleaned up
- ✅ Admin panel fully functional
- ✅ Public website displays correctly

---

## 📝 Quick Test Script

Run this to check basic functionality:

```bash
# 1. Start server
npm run server

# 2. In another terminal, test endpoints
curl http://localhost:5001/api/menu-items | head -20
curl http://localhost:5001/api/menu-items/menu-gallery | head -20

# 3. Check file serving
curl -I http://localhost:5001/menu-items/1.mp4
curl -I http://localhost:5001/menu-items/1_icon.mp4
curl -I http://localhost:5001/menu-items/1.png

# 4. Start frontend and visually verify
npm start
```

---

## 🚨 If Something Breaks

### **Videos Not Loading:**
1. Check `server/uploads/items/` has video files
2. Check `server/index.js` serves from `items/`
3. Check browser console for 404 errors
4. Verify file paths in database match actual files

### **Processing Not Working:**
1. Check `server/uploads/items/temp_files/` exists
2. Check video processing route uses `items/` paths
3. Check server logs for errors
4. Verify temp cleanup logic works

### **Database Issues:**
1. Check `.env` has correct `MONGODB_URI`
2. Check server connects to database
3. Verify collections exist
4. Check for timeout errors

---

## ✅ Priority Order

**Test in this order:**
1. **Server startup** (5 min) - Must work first
2. **File serving** (5 min) - Critical for display
3. **Video upload** (10 min) - Core functionality
4. **Admin panel** (5 min) - Management tool
5. **Public website** (5 min) - User-facing
6. **API endpoints** (5 min) - Backend functionality

**Total time:** ~35 minutes for full test

---

**Status:** Ready for testing! Start with server startup and work through the checklist.

