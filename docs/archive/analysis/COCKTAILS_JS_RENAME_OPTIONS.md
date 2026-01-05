# Better Name Options for cocktails.js

## Current Issues with "cocktails.js"

1. **Misleading name**: Handles ALL menu item types (cocktails, mocktails, wine, beer, spirits, premix), not just cocktails
2. **Legacy naming**: The "Cocktail" model is used for all menu items - it's a historical artifact
3. **Doesn't reflect actual function**: It's really about menu items + file management + metadata

## What It Actually Does

1. **File Management**: Videos, map snapshots (for all menu item types)
2. **MenuManager Metadata**: concept, narrative, videoFile, mapSnapshotFile (for all menu item types)
3. **Public API**: Serves menu items to the website (all types)
4. **CRUD Operations**: Create, update, delete menu items (all types)

## Recommended Name: `menuItems.js` ✅

**Why:**
- ✅ **Accurate**: Handles all menu item types, not just cocktails
- ✅ **Clear**: Immediately understandable what it does
- ✅ **RESTful**: Routes become `/api/menu-items` which is standard REST
- ✅ **Future-proof**: Easy to add more menu item types
- ✅ **Matches domain**: Uses the same language as your UI ("menu items")

**Routes would become:**
- `GET /api/menu-items` (instead of `/api/cocktails`)
- `GET /api/menu-items/menu-manager`
- `GET /api/menu-items/menu-gallery`
- `POST /api/menu-items`
- `PUT /api/menu-items/:id`
- etc.

## Alternative Options

### `menuContent.js`
- ✅ Broader term (content + metadata)
- ⚠️ Less specific - could be confused with other content types

### `menuMedia.js`
- ✅ Emphasizes file/media handling
- ❌ Misses the metadata/storage aspect
- ❌ Doesn't convey it handles all menu item types

### `menuAssets.js`
- ✅ Good for file-focused naming
- ⚠️ "Assets" is more generic, might be confused with other asset types

### `menuResources.js`
- ✅ Generic and accurate
- ⚠️ Too generic - "resources" could mean anything

## Recommendation: **`menuItems.js`**

This is the clearest, most accurate name that reflects what the file actually does.

