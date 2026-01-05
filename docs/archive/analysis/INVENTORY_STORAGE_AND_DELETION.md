# Inventory Storage and Deletion System

## How Inventory Items Are Stored

Inventory items are stored in **MongoDB** in the `InventorySheet` collection:

- **Structure**: Each inventory category (cocktails, mocktails, wine, spirits, beer, preMix, dryStock) is a single MongoDB document
- **Location**: `server/models/InventorySheet.js`
- **Schema**: Each sheet contains:
  - `sheetKey`: Unique identifier (e.g., 'cocktails', 'wine')
  - `columns`: Array of column definitions
  - `rows`: Array of row objects (this is where all items are stored)
  - `version`: Version number for optimistic locking

### Row Structure
Each row in the `rows` array contains:
- `_id`: MongoDB ObjectId
- `order`: Display order number
- `values`: A Map containing all the field values (name, itemNumber, unitCost, etc.)
- `isDeleted`: Boolean flag (false by default)
- `createdAt` / `updatedAt`: Timestamps

## Why Deletions Are "Soft Deletes"

The system uses **soft deletes** instead of hard deletes:

1. **When you delete a row**: The code sets `row.isDeleted = true` but does NOT remove it from the database
2. **Location**: See `server/routes/inventory.js` line 2565: `row.isDeleted = true;`
3. **Why soft deletes?**:
   - Preserves data history
   - Allows recovery if deleted by mistake
   - Maintains referential integrity
   - Easier to audit changes

## The Problem

**Deleted rows still affect item number calculations!**

When calculating the maximum item number for new items:
- The `getMaxItemNumberAcrossAllSheets()` function was checking ALL rows, including deleted ones
- This means if you deleted an item with itemNumber 282, it still counted toward the max
- New items would get 283, 284, etc. instead of starting from the actual highest active item

## The Fix

The `getMaxItemNumberAcrossAllSheets()` function now:
- **Skips deleted rows**: `if (row.isDeleted) return;`
- Only counts active (non-deleted) rows when finding the maximum item number
- This ensures new items get the correct next sequential number

## How to Actually Delete Items (Hard Delete)

If you want to permanently remove items from the database:

1. **Option 1**: Use MongoDB directly
   ```javascript
   // Remove deleted rows from a sheet
   await InventorySheet.updateOne(
     { sheetKey: 'cocktails' },
     { $pull: { rows: { isDeleted: true } } }
   );
   ```

2. **Option 2**: Create a cleanup script that:
   - Finds all rows with `isDeleted: true`
   - Uses MongoDB's `$pull` operator to remove them from the array
   - Saves the sheet

**Note**: Hard deletes are permanent and cannot be undone!

## Current State

- **Soft delete**: Items are marked as deleted but remain in database
- **Max calculation**: Now correctly excludes deleted rows
- **Display**: Deleted rows are filtered out in the UI (see `formatSheet` function)
- **Item numbers**: New items will get correct sequential numbers based on active items only

