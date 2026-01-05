# InventoryManager as Single Source of Truth - Implementation Plan

## Goal
Make InventoryManager the single source of truth for ALL fields (including regions, concept, videoFile, page), not just shared fields. These additional fields will be stored in the InventorySheet `values` Map but NOT as visible columns.

## Current State

### Data Storage
- **InventorySheet Model**: Uses `values` Map to store row data (can store ANY key-value pairs)
- **Cocktail Model**: Stores concept, videoFile, mapSnapshotFile, regions (array), narrative, etc.
- **Current Flow**: MenuManager reads from both Inventory and Cocktail, merges them

### Fields Currently Split
- **In Inventory**: name, region (string), style/type/spirit, ice, garnish, itemNumber
- **In Cocktail**: concept, videoFile, mapSnapshotFile, regions (array), narrative, page (if exists)

## Target State

### Data Storage
- **InventorySheet Model**: Stores ALL fields in `values` Map:
  - `name`, `region` (string), `style`, `ice`, `garnish`, `itemNumber` (existing columns)
  - `concept`, `videoFile`, `regions` (array), `page`, `mapSnapshotFile` (hidden fields in Map)
- **Cocktail Model**: Minimal/optional - can be kept for backward compatibility or removed later

### Data Flow
1. **MenuManager Save**: Writes ALL fields to Inventory
2. **MenuManager Read**: Reads ALL fields from Inventory (falls back to Cocktail for migration)
3. **Recipe Sync**: Reads regions from Inventory (not Cocktail)

## Implementation Steps

### Phase 1: Update Save Logic (MenuManager → Inventory)

#### 1.1 Update `extractSharedFieldsForInventory()` in `src/utils/menuInventorySync.js`
- Add `concept`, `videoFile`, `regions` (as array), `page` (if exists) to shared fields
- Store `regions` as array in Inventory (not comma-separated string)
- These fields will be stored in `values` Map but won't have columns

**Changes:**
```javascript
export const extractSharedFieldsForInventory = (cocktailData, category) => {
  // ... existing code ...
  
  // Add MenuManager-only fields (stored in Inventory but not as columns)
  if (cocktailData.concept) {
    sharedFields.concept = cocktailData.concept;
  }
  if (cocktailData.videoFile) {
    sharedFields.videoFile = cocktailData.videoFile;
  }
  if (cocktailData.mapSnapshotFile) {
    sharedFields.mapSnapshotFile = cocktailData.mapSnapshotFile;
  }
  if (cocktailData.page) {
    sharedFields.page = cocktailData.page;
  }
  // Store regions as array (not comma-separated string)
  if (cocktailData.regions && Array.isArray(cocktailData.regions)) {
    sharedFields.regions = cocktailData.regions; // Store as array
  }
  
  return sharedFields;
};
```

#### 1.2 Update `MenuManager.js` save logic
- Ensure `extractSharedFieldsForInventory()` includes all fields
- Remove `extractMenuManagerOnlyFields()` usage (or keep it minimal for Cocktail model only)
- When saving to Inventory, include concept, videoFile, regions (array), page

**Location**: `src/admin/components/MenuManager.js` around line 1124

### Phase 2: Update Read Logic (Inventory → MenuManager)

#### 2.1 Update `mergeInventoryWithCocktail()` in `src/utils/menuInventorySync.js`
- Read `concept`, `videoFile`, `regions` (array), `page` from Inventory first
- Fall back to Cocktail only if Inventory doesn't have them (for migration)

**Changes:**
```javascript
export const mergeInventoryWithCocktail = (inventoryRow, cocktailData, category) => {
  // ... existing code ...
  
  // Read MenuManager-only fields from Inventory (new source of truth)
  if (values.concept !== undefined) merged.concept = values.concept;
  if (values.videoFile !== undefined) merged.videoFile = values.videoFile;
  if (values.mapSnapshotFile !== undefined) merged.mapSnapshotFile = values.mapSnapshotFile;
  if (values.page !== undefined) merged.page = values.page;
  
  // Read regions from Inventory (as array)
  if (values.regions && Array.isArray(values.regions)) {
    merged.regions = values.regions;
  } else if (values.region) {
    // Fallback: parse comma-separated string (for backward compatibility)
    merged.regions = values.region.split(',').map(r => r.trim()).filter(Boolean);
  }
  
  // Fallback to Cocktail only if Inventory doesn't have these fields (migration)
  if (cocktailData && (!values.concept && cocktailData.concept)) {
    merged.concept = cocktailData.concept;
  }
  if (cocktailData && (!values.videoFile && cocktailData.videoFile)) {
    merged.videoFile = cocktailData.videoFile;
  }
  // ... etc for other fields
  
  return merged;
};
```

#### 2.2 Update `/api/cocktails/menu-manager` endpoint in `server/routes/cocktails.js`
- Read `concept`, `videoFile`, `regions` (array), `page` from Inventory
- Fall back to Cocktail for migration

**Location**: `server/routes/cocktails.js` around line 806-813

**Changes:**
```javascript
// Start with inventory data (source of truth)
const merged = {
  // ... existing fields ...
  // Read MenuManager-only fields from Inventory
  concept: values.concept || cocktail?.concept || '',
  videoFile: values.videoFile || cocktail?.videoFile || '',
  mapSnapshotFile: values.mapSnapshotFile || cocktail?.mapSnapshotFile || '',
  page: values.page || cocktail?.page || '',
  // Read regions from Inventory (as array)
  regions: (values.regions && Array.isArray(values.regions)) 
    ? values.regions 
    : (values.region ? String(values.region).split(',').map(r => r.trim()).filter(Boolean) : [])
    || cocktail?.regions || []
};
```

### Phase 3: Update Recipe Sync Logic

#### 3.1 Update `syncRecipeInventoryRow()` in `server/routes/recipes.js`
- Read `regions` from Inventory row (not from Cocktail)
- Use `values.regions` (array) if available, fall back to `values.region` (string)

**Location**: `server/routes/recipes.js` around line 800-807

**Changes:**
```javascript
// Get regions from Inventory row (not Cocktail)
let regions = [];
if (row) {
  const valuesMap = ensureRowValuesMap(row);
  // Prefer regions array from Inventory
  const regionsArray = valuesMap.get('regions');
  if (Array.isArray(regionsArray) && regionsArray.length > 0) {
    regions = regionsArray;
  } else {
    // Fallback: parse comma-separated string
    const regionString = valuesMap.get('region') || '';
    if (regionString) {
      regions = regionString.split(',').map(r => r.trim()).filter(Boolean);
    }
  }
}

// Format regions array as comma-separated string for display
if (regions.length > 0) {
  updateValues.region = regions.join(', ');
} else {
  updateValues.region = '';
}
```

### Phase 4: Migration Strategy

#### 4.1 One-Time Migration Script
- Copy `concept`, `videoFile`, `regions` (array), `page` from Cocktail to Inventory
- Run once to migrate existing data
- After migration, Inventory becomes source of truth

**Script Location**: `scripts/migrateCocktailFieldsToInventory.js`

**Logic:**
1. Find all Cocktails
2. For each Cocktail, find matching Inventory row by `itemNumber` or `menuManagerId`
3. Copy `concept`, `videoFile`, `regions` (convert to array), `page` to Inventory row `values` Map
4. Save Inventory row

### Phase 5: Backward Compatibility

#### 5.1 Dual Read Strategy (Temporary)
- Read from Inventory first
- Fall back to Cocktail if Inventory field is missing
- This ensures smooth migration without breaking existing data

#### 5.2 Update Cocktail Model Save (Optional)
- Keep saving to Cocktail model for backward compatibility
- Or remove Cocktail model entirely (bigger change, do later)

## Testing Checklist

- [ ] Save new item: concept, videoFile, regions, page saved to Inventory
- [ ] Read existing item: fields read from Inventory (not Cocktail)
- [ ] Recipe sync: regions read from Inventory
- [ ] Migration: existing Cocktail data copied to Inventory
- [ ] Backward compatibility: items without Inventory fields fall back to Cocktail
- [ ] No breaking changes: existing functionality still works

## Risk Mitigation

1. **Data Loss**: Migration script backs up data before migration
2. **Breaking Changes**: Dual read strategy ensures backward compatibility
3. **Performance**: Inventory `values` Map can handle additional fields efficiently
4. **Consistency**: All fields in one place (Inventory) reduces sync issues

## Rollout Plan

1. **Step 1**: Update save logic (Phase 1) - new saves go to Inventory
2. **Step 2**: Update read logic (Phase 2) - reads from Inventory first
3. **Step 3**: Update recipe sync (Phase 3) - reads regions from Inventory
4. **Step 4**: Run migration script (Phase 4) - copy existing data
5. **Step 5**: Test thoroughly (Testing Checklist)
6. **Step 6**: Remove Cocktail model fields (optional, later)

## Notes

- InventorySheet `values` Map can store ANY key-value pairs (not just columns)
- These fields won't appear as columns in InventoryManager UI (by design)
- MenuManager will read/write these fields from/to Inventory
- Recipe sync will read regions from Inventory (not Cocktail)
- This makes InventoryManager the true single source of truth

