# MenuManager ↔ InventoryManager Refactoring - Testing Checklist

## Overview
This document outlines the testing steps to verify the refactoring where InventoryManager is now the single source of truth for shared fields, and MenuManager acts as a UI layer.

## Pre-Testing Setup
- [ ] Server is running
- [ ] Database is accessible
- [ ] Have test data in InventoryManager with itemNumbers
- [ ] Have some items with MenuManager-only data (concept, videos, recipes)

## Test 1: Display All Inventory Items
**Goal:** Verify all Inventory items with itemNumbers appear in MenuManager

- [ ] Open MenuManager
- [ ] Navigate to each category (Cocktails, Mocktails, Wine, Beer, Spirits, Pre-Mix)
- [ ] Verify all items from Inventory appear in the list
- [ ] Verify Item # column shows correct itemNumbers from Inventory
- [ ] Verify items without itemNumbers don't appear (if that's expected)

**Expected Result:** All Inventory items with itemNumbers are visible in MenuManager

## Test 2: Auto-Creation of Cocktail Entries
**Goal:** Verify Inventory items without Cocktail entries get auto-created

- [ ] Check database for an Inventory item that doesn't have a corresponding Cocktail entry
- [ ] Refresh MenuManager
- [ ] Verify the item appears in MenuManager
- [ ] Verify a Cocktail entry was created in the database
- [ ] Verify the inventory row's `menuManagerId` was set

**Expected Result:** Missing Cocktail entries are auto-created when MenuManager loads

## Test 3: Display Inventory Data in Edit Form
**Goal:** Verify clicking an item shows Inventory data pre-filled

- [ ] Click on an item in MenuManager
- [ ] Verify the edit form opens
- [ ] Verify Name field shows Inventory name
- [ ] Verify Ingredients field shows Inventory style/type/spirit
- [ ] Verify Garnish field shows Inventory garnish/distributor
- [ ] Verify Regions map shows Inventory regions
- [ ] Verify Item # shows Inventory itemNumber
- [ ] Verify MenuManager-only fields (concept, video, map) are preserved if they exist

**Expected Result:** All shared fields are pre-filled from Inventory, MenuManager-only fields are preserved

## Test 4: Save Shared Fields to Inventory
**Goal:** Verify "SAVE CHANGES" writes shared fields to Inventory

- [ ] Edit an item in MenuManager
- [ ] Change Name, Ingredients, Garnish, or Regions
- [ ] Click "SAVE CHANGES"
- [ ] Verify success message
- [ ] Check InventoryManager - verify the changes were saved
- [ ] Verify MenuManager-only fields (concept, video) were NOT written to Inventory

**Expected Result:** Shared fields are saved to Inventory, MenuManager-only fields remain in Cocktail model

## Test 5: Save MenuManager-Only Fields
**Goal:** Verify MenuManager-only fields save to Cocktail model

- [ ] Edit an item in MenuManager
- [ ] Change Concept field
- [ ] Upload a video (if applicable)
- [ ] Click "SAVE CHANGES"
- [ ] Verify success message
- [ ] Check database - verify concept and videoFile are in Cocktail model
- [ ] Check InventoryManager - verify concept/video were NOT written to Inventory

**Expected Result:** MenuManager-only fields are saved to Cocktail model only

## Test 6: Create New Item
**Goal:** Verify creating a new item creates both Inventory row and Cocktail entry

- [ ] Click "NEW COCKTAIL" (or appropriate category)
- [ ] Fill in Name (required)
- [ ] Fill in other fields
- [ ] Select regions on map
- [ ] Click "SAVE CHANGES"
- [ ] Verify success message
- [ ] Check InventoryManager - verify new row was created with itemNumber
- [ ] Check MenuManager - verify item appears in list
- [ ] Verify Cocktail entry was created with menuManagerId link

**Expected Result:** New items create both Inventory row and Cocktail entry, properly linked

## Test 7: Delete from MenuManager
**Goal:** Verify deletion removes from both systems

- [ ] Select an item in MenuManager
- [ ] Click Delete
- [ ] Confirm deletion
- [ ] Verify success message
- [ ] Check InventoryManager - verify item is removed (hard delete)
- [ ] Check database - verify Cocktail entry is deleted
- [ ] Verify associated files (video, map) are deleted

**Expected Result:** Deletion removes item from both Inventory and Cocktail, plus associated files

## Test 8: Delete from InventoryManager
**Goal:** Verify deletion from Inventory also deletes MenuManager entry

- [ ] Delete an item from InventoryManager
- [ ] Verify success message
- [ ] Check MenuManager - verify item no longer appears
- [ ] Check database - verify Cocktail entry is deleted
- [ ] Verify associated files (video, map) are deleted

**Expected Result:** Deleting from Inventory also deletes MenuManager entry and files

## Test 9: Recipe Linking
**Goal:** Verify recipes are matched and displayed correctly

- [ ] Ensure you have recipes with names matching Inventory items
- [ ] Open MenuManager
- [ ] Click on an item that has a matching recipe
- [ ] Verify recipe data is available/displayed
- [ ] Verify recipe is linked by name/title

**Expected Result:** Recipes are matched by name and included in item data

## Test 10: Data Preservation
**Goal:** Verify existing data is not lost

- [ ] Check items that had concept, videos, or recipes before refactoring
- [ ] Verify they still have that data after refactoring
- [ ] Verify shared fields (name, ingredients, garnish) match Inventory
- [ ] Verify MenuManager-only fields are preserved

**Expected Result:** No data loss - all existing data is preserved

## Test 11: Concurrent Edits
**Goal:** Verify no conflicts when editing same item in both systems

- [ ] Open same item in both MenuManager and InventoryManager
- [ ] Edit shared field (e.g., name) in InventoryManager and save
- [ ] Edit same field in MenuManager and save
- [ ] Verify last save wins (Inventory is source of truth)
- [ ] Verify MenuManager-only fields in MenuManager are preserved

**Expected Result:** Inventory changes overwrite MenuManager shared fields, but MenuManager-only fields are preserved

## Test 12: Item Number Assignment
**Goal:** Verify itemNumbers are assigned correctly

- [ ] Create a new item in any category
- [ ] Verify it gets the next available itemNumber (max + 1)
- [ ] Verify itemNumber is unique across all categories
- [ ] Verify itemNumber persists after save

**Expected Result:** New items get correct auto-incremented itemNumbers

## Test 13: Filtering and Sorting
**Goal:** Verify MenuManager filtering works correctly

- [ ] Test category filtering (Cocktails, Mocktails, etc.)
- [ ] Test archived items view
- [ ] Verify items are sorted by itemNumber
- [ ] Verify table shows correct Item # column

**Expected Result:** Filtering and sorting work correctly with new data structure

## Test 14: Edge Cases
**Goal:** Verify edge cases are handled

- [ ] Item with itemNumber but no name (should not appear)
- [ ] Item with name but no itemNumber (should not appear in main list)
- [ ] Item with duplicate itemNumber (should be handled)
- [ ] Item with special characters in name
- [ ] Very long names/descriptions

**Expected Result:** Edge cases are handled gracefully without errors

## Known Issues to Watch For
- [ ] Items not appearing after refresh
- [ ] Data loss when saving
- [ ] Conflicts between Inventory and MenuManager
- [ ] Missing recipes or concept data
- [ ] ItemNumbers not persisting
- [ ] Files not deleting properly

## Rollback Plan
If issues are found:
1. The sync-from-menu routes are still available (though deprecated)
2. Can manually sync data if needed
3. Database backups should be available

## Success Criteria
✅ All Inventory items with itemNumbers appear in MenuManager
✅ Shared fields are saved to Inventory
✅ MenuManager-only fields are saved to Cocktail model
✅ No data loss during refactoring
✅ Deletions work in both directions
✅ Recipes are matched and displayed
✅ Auto-creation works for missing Cocktail entries

