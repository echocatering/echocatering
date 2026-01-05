# MenuManager ↔ InventoryManager Refactoring - Summary

## Overview
Successfully refactored the system to make **InventoryManager the single source of truth** for shared item fields, while MenuManager acts as a UI layer for managing menu presentation data.

## Completed Tasks (10/10)

### ✅ Task 1: Analyze Current Data Flow
- Identified all shared fields between MenuManager and InventoryManager
- Documented field mappings for each category
- Created analysis documents

### ✅ Task 2: Map Field Relationships
- Mapped MenuManager fields → Inventory columns for each category
- Created utility functions in `src/utils/menuInventorySync.js`
- Documented field ownership (Inventory vs MenuManager)

### ✅ Task 3: Update MenuManager to Read from Inventory
- Created new `/api/cocktails/menu-manager` endpoint
- Endpoint merges Inventory data (source of truth) with Cocktail data (MenuManager-only fields)
- Updated MenuManager to use new endpoint instead of `/cocktails`
- All Inventory items with itemNumbers now appear in MenuManager

### ✅ Task 4: Modify MenuManager 'SAVE CHANGES' to Write to Inventory
- Updated `handleSave` in MenuManager to write shared fields to Inventory first
- Then saves MenuManager-only fields to Cocktail model
- Proper error handling if Inventory save fails

### ✅ Task 5: Update MenuManager Create Flow
- New items create Inventory row first (gets itemNumber automatically)
- Then creates Cocktail entry with menuManagerId link
- Auto-increment itemNumber works globally across all categories

### ✅ Task 6: Replace ORDER Column with Item # Column
- Updated MenuManager table to show `itemNumber` instead of `order`
- Item # is pulled from Inventory (source of truth)
- Column width matches "Menu" column (80px)

### ✅ Task 7: Update MenuManager Delete
- Delete from MenuManager now hard-deletes from both Inventory and Cocktail
- Deletes associated files (video, map snapshots)
- Shows confirmation dialog before deletion

### ✅ Task 8: Remove Bidirectional Sync
- Updated `syncInventoryRowToMenuManager` to be read-only
- Only syncs shared fields, preserves MenuManager-only fields
- Marked all `sync-from-menu` routes as DEPRECATED
- Inventory → MenuManager sync is for display only (creates/updates shared fields)

### ✅ Task 9: Ensure MenuManager-Only Fields Save to Cocktail Model
- Concept, videoFile, mapSnapshotFile, narrative, featured are saved to Cocktail only
- These fields are never written to Inventory
- Preserved during Inventory → MenuManager sync

### ✅ Task 10: Testing Checklist Created
- Comprehensive testing checklist created in `docs/TESTING_CHECKLIST.md`
- Covers all major scenarios and edge cases
- Ready for manual testing

## Key Changes

### Backend Changes

1. **`server/routes/cocktails.js`**
   - New `/menu-manager` endpoint that merges Inventory + Cocktail data
   - Auto-creates Cocktail entries for Inventory items with itemNumbers
   - Updated DELETE route to hard-delete from Inventory

2. **`server/routes/inventory.js`**
   - Updated DELETE route to hard-delete rows and delete MenuManager entries
   - Updated PATCH route to hard-delete when `isDeleted` is set
   - Modified `syncInventoryRowToMenuManager` to preserve MenuManager-only fields
   - Marked all `sync-from-menu` routes as DEPRECATED
   - Added file deletion logic for videos and map snapshots

3. **`server/utils/inventoryHelpers.js`**
   - Updated `formatSheet` to filter out deleted rows
   - Updated `getMaxItemNumberAcrossAllSheets` to exclude deleted rows

### Frontend Changes

1. **`src/admin/components/MenuManager.js`**
   - Updated to use `/cocktails/menu-manager` endpoint
   - Modified `handleSave` to write shared fields to Inventory first
   - Updated delete handler to delete from both systems
   - Replaced ORDER column with Item # column

2. **`src/admin/components/InventoryManager.js`**
   - Updated Item # column width to 80px (matches Menu column)
   - Added editable Item # field functionality

3. **`src/utils/menuInventorySync.js`** (NEW)
   - Utility functions for field mapping
   - `extractSharedFieldsForInventory` - extracts fields to save to Inventory
   - `extractMenuManagerOnlyFields` - extracts fields to save to Cocktail
   - `mergeInventoryWithCocktail` - merges data for display

## Data Flow

### Read Flow
```
MenuManager → GET /cocktails/menu-manager
  ↓
Endpoint fetches Inventory rows (source of truth)
  ↓
Matches with Cocktail entries (for MenuManager-only fields)
  ↓
Matches with Recipes (by name)
  ↓
Returns merged data
```

### Write Flow (MenuManager Save)
```
User clicks "SAVE CHANGES"
  ↓
Extract shared fields → Write to Inventory
  ↓
Extract MenuManager-only fields → Write to Cocktail model
  ↓
Save recipe (if exists)
```

### Delete Flow
```
Delete from MenuManager
  ↓
Delete from Cocktail model
  ↓
Delete from Inventory (hard delete)
  ↓
Delete associated files (video, map)
```

## Field Ownership

### InventoryManager (Source of Truth)
- name
- region
- style/type/spirit
- ice (cocktails/mocktails)
- garnish/distributor
- itemNumber
- All cost/pricing fields
- All size/unit fields

### MenuManager (Cocktail Model Only)
- concept
- videoFile
- mapSnapshotFile
- narrative
- featured
- recipe (linked by name/title)

## Auto-Creation Logic

When MenuManager loads:
1. Fetches all Inventory rows with itemNumbers
2. For each row without a Cocktail entry:
   - Creates Cocktail entry with shared fields from Inventory
   - Sets `menuManagerId` in Inventory row
   - Preserves MenuManager-only fields as empty (ready for user input)

## Known Limitations

1. **Version Conflicts**: If Inventory sheet is updated between GET and PATCH, MenuManager save will fail with 409 error. User needs to refresh and try again.

2. **Race Conditions**: If same item is edited in both systems simultaneously, last save wins (Inventory is source of truth for shared fields).

3. **Recipe Matching**: Recipes are matched by name/title only. If names don't match exactly, recipe won't be linked.

## Testing Status

- ✅ Code implementation complete
- ⏳ Manual testing pending (see `docs/TESTING_CHECKLIST.md`)

## Next Steps

1. Run through testing checklist
2. Verify no data loss
3. Test edge cases
4. Monitor for any issues in production
5. Consider removing deprecated `sync-from-menu` routes in future version

## Files Modified

- `server/routes/cocktails.js`
- `server/routes/inventory.js`
- `server/utils/inventoryHelpers.js`
- `src/admin/components/MenuManager.js`
- `src/admin/components/InventoryManager.js`
- `src/utils/menuInventorySync.js` (NEW)

## Files Created

- `docs/MENUMANAGER_REFACTOR_ANALYSIS.md`
- `docs/MENUMANAGER_INVENTORY_REFACTOR_PLAN.md`
- `docs/TESTING_CHECKLIST.md`
- `docs/REFACTORING_SUMMARY.md` (this file)
- `src/utils/menuInventorySync.js`

