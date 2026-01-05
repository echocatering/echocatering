# MenuManager ↔ InventoryManager Refactoring - Complete Analysis

## Current Architecture

### Data Storage
1. **Cocktail Model** (MongoDB `cocktails` collection)
   - Stores: name, concept, ingredients, globalIngredients, garnish, regions, videoFile, mapSnapshotFile, itemNumber, order, category, etc.
   - Used by: MenuManager UI, public website

2. **InventorySheet Model** (MongoDB `inventorysheets` collection)
   - Stores: name, region, style/type/spirit, ice, garnish, itemNumber, unitCost, etc. in `rows` array
   - Used by: InventoryManager UI, recipe calculations

### Current Sync Mechanisms

#### Inventory → MenuManager (Auto-sync)
- `syncInventoryRowToMenuManager()` - Called when inventory row is saved
- Updates Cocktail model with inventory data
- Location: `server/routes/inventory.js:2128`

#### MenuManager → Inventory (Auto-sync)
- `POST /inventory/cocktails/sync-from-menu` - Syncs all cocktails
- `POST /inventory/mocktails/sync-from-menu` - Syncs all mocktails
- `POST /inventory/wine/sync-from-menu` - Syncs all wine
- `POST /inventory/beer/sync-from-menu` - Syncs all beer
- `POST /inventory/spirits/sync-from-menu` - Syncs all spirits
- `POST /inventory/preMix/sync-from-menu` - Syncs all premix
- Location: `server/routes/inventory.js:870-1426`

### Current Problems
1. **Dual source of truth** - Both systems store shared fields
2. **Sync conflicts** - Changes in one system overwrite the other
3. **Race conditions** - Simultaneous edits can cause data loss
4. **Complexity** - Bidirectional sync is hard to maintain
5. **Data inconsistency** - Fields can get out of sync

## Target Architecture

### Single Source of Truth: InventoryManager
- **InventoryManager** stores and manages all shared fields
- **MenuManager** reads shared fields from Inventory
- **MenuManager** writes shared fields to Inventory (on "SAVE CHANGES")
- **MenuManager** stores only MenuManager-specific fields in Cocktail model

### Data Flow

```
┌─────────────────┐
│  MenuManager    │ (UI Layer)
│  (Cocktail)     │
└────────┬────────┘
         │ reads shared fields
         ↓
┌─────────────────┐
│ InventoryManager│ (Source of Truth)
│ (InventorySheet)│
└─────────────────┘
```

### Field Ownership

#### InventoryManager (Source of Truth)
- name
- region → regions (split/join)
- style/type/spirit → ingredients
- ice (cocktails/mocktails only)
- garnish
- itemNumber (read-only in MenuManager)
- All cost/pricing fields
- All size/unit fields

#### MenuManager (Cocktail Model Only)
- concept
- videoFile (stored as `itemNumber.mp4`)
- mapSnapshotFile (stored as `itemNumber.png`)
- narrative
- recipe (linked by itemNumber)

## Implementation Plan

### Phase 1: Replace ORDER with Item # ✅
- [x] Update table header
- [x] Update table cell to show itemNumber

### Phase 2: Create API Endpoints for Inventory Lookup
- [ ] `GET /inventory/:sheetKey/by-name/:name` - Get row by name
- [ ] `GET /inventory/:sheetKey/by-item-number/:itemNumber` - Get row by item number
- [ ] `GET /inventory/:sheetKey/for-menu` - Get all rows formatted for MenuManager

### Phase 3: Update MenuManager Data Loading
- [ ] Modify `fetchCocktails` to also fetch from Inventory
- [ ] Merge Inventory data with Cocktail data using `mergeInventoryWithCocktail`
- [ ] Update state to include inventory data

### Phase 4: Update MenuManager Save Flow
- [ ] Split `handleSave` into:
  1. Extract shared fields → Save to Inventory
  2. Extract MenuManager-only fields → Save to Cocktail
- [ ] Remove auto-save behavior
- [ ] Only save on "SAVE CHANGES" button click

### Phase 5: Update MenuManager Create Flow
- [ ] When creating new item:
  1. Create Inventory row first (with itemNumber and name)
  2. Get itemNumber from Inventory
  3. Create Cocktail entry with itemNumber
  4. Link via menuManagerId

### Phase 6: Update MenuManager Delete Flow
- [ ] Delete from Cocktail model
- [ ] Delete from Inventory (hard delete, not soft delete)
- [ ] Show confirmation dialog
- [ ] Delete associated files (video, map)

### Phase 7: Remove Bidirectional Sync
- [ ] Remove or deprecate sync-from-menu routes
- [ ] Remove auto-sync from Inventory to MenuManager
- [ ] Keep Inventory → MenuManager sync only for initial data loading

### Phase 8: Testing & Cleanup
- [ ] Test create flow
- [ ] Test edit flow
- [ ] Test delete flow
- [ ] Test all categories
- [ ] Verify no data loss
- [ ] Clean up legacy code

## Risk Analysis

### High Risk Areas
1. **Data Loss During Migration**
   - Risk: Existing data might be lost if sync is removed incorrectly
   - Mitigation: Create backup script, test on dev first

2. **Recipe Linking**
   - Risk: Recipes are currently linked by name, need to link by itemNumber
   - Mitigation: Update recipe lookup to use itemNumber

3. **File References**
   - Risk: Video/map files referenced by itemNumber, need consistency
   - Mitigation: Ensure itemNumber is set before file upload

4. **Race Conditions**
   - Risk: Multiple users editing same item simultaneously
   - Mitigation: Use version numbers, optimistic locking

5. **Missing Fields**
   - Risk: Fields that exist in MenuManager but not Inventory
   - Mitigation: Map all fields carefully, handle missing gracefully

### Medium Risk Areas
1. **Display Logic**
   - Risk: MenuManager might not display data correctly after merge
   - Mitigation: Test all display scenarios

2. **Form Validation**
   - Risk: Validation might break with new data flow
   - Mitigation: Update validation logic

3. **Search/Filter**
   - Risk: Search might not work with merged data
   - Mitigation: Test search functionality

## Field Mapping Details

### Cocktails/Mocktails
```javascript
// Inventory → MenuManager (for display)
{
  name: inventoryRow.values.name,
  ingredients: inventoryRow.values.style,
  garnish: inventoryRow.values.garnish,
  regions: inventoryRow.values.region?.split(',') || [],
  itemNumber: inventoryRow.values.itemNumber
}

// MenuManager → Inventory (on save)
{
  name: cocktailData.name,
  style: cocktailData.ingredients,
  garnish: cocktailData.garnish,
  region: cocktailData.regions?.join(', ') || ''
}
```

### Wine
```javascript
// Inventory → MenuManager
{
  name: inventoryRow.values.name,
  ingredients: inventoryRow.values.style,
  globalIngredients: inventoryRow.values.hue,
  garnish: inventoryRow.values.distributor,
  regions: inventoryRow.values.region?.split(',') || [],
  itemNumber: inventoryRow.values.itemNumber
}

// MenuManager → Inventory
{
  name: cocktailData.name,
  style: cocktailData.ingredients,
  hue: cocktailData.globalIngredients,
  distributor: cocktailData.garnish,
  region: cocktailData.regions?.join(', ') || ''
}
```

### Spirits
```javascript
// Inventory → MenuManager
{
  name: inventoryRow.values.name,
  ingredients: inventoryRow.values.spirit,
  garnish: inventoryRow.values.distributor,
  regions: inventoryRow.values.region?.split(',') || [],
  itemNumber: inventoryRow.values.itemNumber
}

// MenuManager → Inventory
{
  name: cocktailData.name,
  spirit: cocktailData.ingredients,
  distributor: cocktailData.garnish,
  region: cocktailData.regions?.join(', ') || ''
}
```

### Beer
```javascript
// Inventory → MenuManager
{
  name: inventoryRow.values.name,
  ingredients: inventoryRow.values.type,
  regions: inventoryRow.values.region?.split(',') || [],
  itemNumber: inventoryRow.values.itemNumber
}

// MenuManager → Inventory
{
  name: cocktailData.name,
  type: cocktailData.ingredients,
  region: cocktailData.regions?.join(', ') || ''
}
```

### PreMix
```javascript
// Inventory → MenuManager
{
  name: inventoryRow.values.name,
  ingredients: inventoryRow.values.type,
  itemNumber: inventoryRow.values.itemNumber
}

// MenuManager → Inventory
{
  name: cocktailData.name,
  type: cocktailData.ingredients
}
```

## Implementation Strategy

### Step-by-Step Approach
1. **Start with read-only** - Make MenuManager read from Inventory first
2. **Then add write** - Add save to Inventory functionality
3. **Then remove sync** - Remove bidirectional sync last
4. **Test each step** - Verify before proceeding

### Backward Compatibility
- Keep Cocktail model fields for MenuManager-only data
- Keep existing API endpoints (deprecate gradually)
- Ensure existing data is not lost

### Migration Path
1. Create helper functions for data merging
2. Update MenuManager to use merged data
3. Update save flow to write to both (temporary)
4. Remove Cocktail model writes for shared fields
5. Remove sync routes

