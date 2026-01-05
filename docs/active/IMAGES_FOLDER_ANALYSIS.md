# Images Folder Analysis

**Date:** January 5, 2026  
**Purpose:** Determine which files in `public/assets/images/` are actively used vs legacy

---

## 📁 Files in `public/assets/images/`

### ✅ **ACTIVE FILES (In Use)**

1. **`favicon.ico`**
   - **Used in:** `public/index.html` (line 5)
   - **Purpose:** Browser favicon
   - **Status:** ✅ Active

2. **`logo192.png`**
   - **Used in:** `public/index.html` (line 12) - Apple touch icon
   - **Purpose:** iOS home screen icon
   - **Status:** ✅ Active

3. **`logo512.png`**
   - **Used in:** `public/manifest.json` (line 16)
   - **Purpose:** PWA manifest icon
   - **Status:** ✅ Active (but path needs update in manifest.json)

4. **`worldmap.svg`**
   - **Used in:** 11 references
   - **Locations:**
     - `src/pages/Home.js` - Fallback for map snapshots
     - `src/pages/menuGallery2.js` - Fallback for map snapshots
     - `src/pages/menugallery.js` - Fallback for map snapshots
     - `src/admin/components/MenuManager.js` - Map preview (3 places)
     - `scripts/active/generate/generateMapSnapshots.js` - Map generation
     - `scripts/archive/generate-old/generateMapSnapshots.js` - Map generation
     - `scripts/archive/verify/verifyMapSnapshots.js` - Map verification
     - `server/utils/countries.js` - Country parsing (but path needs update)
   - **Purpose:** Base world map SVG for generating country-highlighted map snapshots
   - **Status:** ✅ Active - Critical for map functionality

5. **`logo.PNG`**
   - **Used in:** 15 references (fallback/placeholder)
   - **Locations:**
     - `src/components/DynamicLogo.js` - Default logo
     - `src/Layout.js` - Fallback logo
     - `src/utils/logoUtils.js` - Default logo
     - `src/admin/components/LogoManager.js` - Fallback logo
     - `src/admin/components/WebsiteManager.js` - Fallback logo
     - `server/index.js` - Default logo
     - `server/setupLogo.js` - Default logo
     - `server/routes/content.js` - Default logo (2 places)
   - **Purpose:** Default/fallback logo when no custom logo is uploaded
   - **Status:** ✅ Active - Important fallback

6. **`about photo.png`**
   - **Used in:** 35 references (fallback/placeholder)
   - **Locations:**
     - `src/pages/Home.js` - Default about section images
     - `src/pages/About.js` - Default about section images
     - `src/admin/components/ContentManager.js` - Default about images
     - `server/routes/content.js` - Default about images (multiple places)
   - **Purpose:** Default/placeholder image for about page sections (story, mission, team)
   - **Status:** ✅ Active - Important fallback/placeholder

---

### ❓ **POTENTIALLY LEGACY (Not Found in Code)**

1. **`COCKTAILS.svg`**
   - **References found:** 0
   - **Status:** ❓ Likely legacy - No code references found
   - **Recommendation:** Check if used in design files or can be removed

2. **`wmamo2.svg`**
   - **References found:** 0
   - **Status:** ❓ Likely legacy - No code references found
   - **Recommendation:** Check if used in design files or can be removed

---

## 🔧 **Issues Found**

### **1. `public/manifest.json` - Old Paths**
```json
{
  "src": "resources/favicon.ico",  // ❌ Should be "assets/images/favicon.ico"
  "src": "resources/logo192.png",  // ❌ Should be "assets/images/logo192.png"
  "src": "resources/logo512.png"   // ❌ Should be "assets/images/logo512.png"
}
```

### **2. `server/utils/countries.js` - Old Path**
```javascript
const svgPath = path.join(__dirname, '..', '..', 'public', 'resources', 'worldmap.svg');
// ❌ Should be: 'public', 'assets', 'images', 'worldmap.svg'
```

---

## 📊 **Summary**

**Active Files (6):**
- ✅ `favicon.ico` - Browser favicon
- ✅ `logo192.png` - iOS icon
- ✅ `logo512.png` - PWA icon (path needs update)
- ✅ `worldmap.svg` - Map generation (critical)
- ✅ `logo.PNG` - Default logo (important fallback)
- ✅ `about photo.png` - Default about image (important fallback)

**Potentially Legacy (2):**
- ❓ `COCKTAILS.svg` - No references found
- ❓ `wmamo2.svg` - No references found

**Action Items:**
1. Update `public/manifest.json` paths
2. Update `server/utils/countries.js` path
3. Investigate `COCKTAILS.svg` and `wmamo2.svg` usage
4. Consider if legacy files can be removed

---

**Conclusion:** Most files are actively used as fallbacks/placeholders or for core functionality. Only 2 files appear to be legacy and may be removable.

