# Options for Refactoring cocktails.js

## Current Situation

**cocktails.js** currently handles:
1. **Public API** (used by website): `GET /api/cocktails`, `GET /api/cocktails/menu-gallery`
2. **MenuManager-specific**: `GET /api/cocktails/menu-manager`
3. **File uploads**: Video and map snapshot handling
4. **CRUD operations**: POST, PUT, DELETE for cocktails
5. **Admin operations**: Archive, restore, reorder, etc.

## Option 1: Keep Separate (RECOMMENDED) ✅

**Keep `cocktails.js` as-is** - it's still doing important work:

### Pros:
- ✅ **Separation of concerns**: File handling, public API, and admin operations are different concerns
- ✅ **Public API independence**: The website uses `/api/cocktails` - shouldn't be tied to MenuManager
- ✅ **File handling complexity**: Multer config, video optimization, file cleanup is complex - better isolated
- ✅ **Standard REST structure**: Follows common pattern of resource-based routes (`/cocktails`, `/inventory`, `/recipes`)
- ✅ **Future flexibility**: Easy to add more cocktail-related endpoints without bloating MenuManager routes

### Cons:
- ⚠️ Some endpoints are MenuManager-specific (but that's okay - they're still cocktail-related)

## Option 2: Split into Two Files

**Create `menumanager.js` route file** and move MenuManager-specific endpoint:

### Structure:
- **`cocktails.js`**: Public API, file uploads, CRUD operations
- **`menumanager.js`**: MenuManager-specific data merging endpoint

### Pros:
- ✅ Clearer separation: MenuManager endpoint in its own file
- ✅ `cocktails.js` becomes more focused on public API and file handling

### Cons:
- ⚠️ Adds another route file to maintain
- ⚠️ The `/menu-manager` endpoint still needs to merge Inventory + Cocktail + Recipe data, so it needs access to all those models anyway

## Option 3: Move Everything to MenuManager Component (NOT RECOMMENDED) ❌

**This doesn't make sense because:**
- ❌ `MenuManager.js` is a **React component** (frontend)
- ❌ `cocktails.js` is an **Express route file** (backend)
- ❌ They're in completely different layers and can't be merged
- ❌ Backend routes should stay in `server/routes/`

## Recommendation: **Option 1 - Keep Separate**

**Why:**
1. **19 endpoints** is still significant - not "light" enough to justify merging
2. **Public API** (`/api/cocktails`, `/api/cocktails/menu-gallery`) is used by the website, not just MenuManager
3. **File handling** (Multer, video optimization) is complex and benefits from isolation
4. **Standard REST pattern** - resource-based routes are easier to understand and maintain
5. **Future-proof** - if you need to add more cocktail endpoints, they have a clear home

**The `/menu-manager` endpoint is fine where it is** - it's still cocktail-related, even if it's MenuManager-specific. Many APIs have admin-specific endpoints alongside public ones.

## If You Want to Clean It Up

Instead of merging, consider:
1. **Extract file handling** to a separate utility module (already partially done)
2. **Document the separation** clearly (which endpoints are public vs admin)
3. **Consider Option 2** only if you plan to add many more MenuManager-specific endpoints

