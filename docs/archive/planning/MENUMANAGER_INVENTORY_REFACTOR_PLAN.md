# MenuManager ↔ InventoryManager Refactoring Plan

## Overview
Refactor MenuManager to use InventoryManager as the single source of truth for shared fields, while MenuManager remains the UI layer for managing menu presentation data.

## Current State Analysis

### Data Storage Locations
1. **Cocktail Model** (MenuManager): Stores concept, video, map, recipe, itemNumber, name, ingredients, garnish, regions, etc.
2. **InventorySheet Model** (InventoryManager): Stores name, region, style, ice, garnish, itemNumber, unitCost, etc.

### Current Sync Flow
- **Bidirectional sync** exists between MenuManager and InventoryManager
- Changes in either system sync to the other automatically
- This creates conflicts and dual sources of truth

### Field Mapping (Current)

#### Cocktails/Mocktails
| MenuManager (Cocktail) | InventoryManager (InventorySheet) |
|------------------------|-----------------------------------|
| name | name |
| regions → region | region |
| ingredients → style | style |
| garnish | garnish |
| (no ice field) | ice |
| itemNumber | itemNumber |
| concept | (not in inventory) |
| videoFile | (not in inventory) |
| mapSnapshotFile | (not in inventory) |

#### Wine
| MenuManager | InventoryManager |
|-------------|------------------|
| name | name |
| regions → region | region |
| ingredients → style | style |
| globalIngredients → hue | hue |
| garnish → distributor | distributor |
| itemNumber | itemNumber |

#### Spirits
| MenuManager | InventoryManager |
|-------------|------------------|
| name | name |
| regions → region | region |
| ingredients → spirit | spirit |
| garnish → distributor | distributor |
| itemNumber | itemNumber |

#### Beer
| MenuManager | InventoryManager |
|-------------|------------------|
| name | name |
| regions → region | region |
| ingredients → type | type |
| itemNumber | itemNumber |

#### PreMix
| MenuManager | InventoryManager |
|-------------|------------------|
| name | name |
| ingredients → type | type |
| itemNumber | itemNumber |

## Target Architecture

### Data Flow
```
MenuManager (UI) 
    ↓ reads shared fields
InventoryManager (Source of Truth)
    ↓ stores
MongoDB InventorySheet
    ↓
MenuManager displays data from Inventory
    ↓ user edits
MenuManager local state (not auto-saved)
    ↓ "SAVE CHANGES" button
InventoryManager (writes shared fields)
    ↓
MenuManager saves MenuManager-only fields to Cocktail model
```

### Field Ownership

#### InventoryManager (Source of Truth)
- name
- region
- style/type/spirit
- ice (cocktails/mocktails)
- garnish
- itemNumber
- All cost/pricing fields
- All size/unit fields

#### MenuManager (Cocktail Model Only)
- concept
- videoFile
- mapSnapshotFile
- recipe (linked by itemNumber)
- narrative (if exists)

## Implementation Plan

### Phase 1: Field Mapping & Analysis ✅
- [x] Map all shared fields
- [x] Identify MenuManager-only fields
- [x] Document current sync mechanisms

### Phase 2: Update MenuManager Data Loading
- [ ] Modify MenuManager to fetch data from Inventory API
- [ ] Merge Inventory data with Cocktail data (for MenuManager-only fields)
- [ ] Update display logic to show Inventory fields

### Phase 3: Update MenuManager Save Flow
- [ ] Remove auto-save for shared fields
- [ ] Update "SAVE CHANGES" to write shared fields to Inventory
- [ ] Keep MenuManager-only fields saving to Cocktail model
- [ ] Create Inventory row when new item created in MenuManager

### Phase 4: Update MenuManager Delete Flow
- [ ] Delete from Cocktail model
- [ ] Delete from Inventory (hard delete)
- [ ] Show confirmation dialog

### Phase 5: Update MenuManager Table View
- [ ] Replace ORDER column with Item # column
- [ ] Display itemNumber from Inventory

### Phase 6: Remove Bidirectional Sync
- [ ] Remove sync-from-menu routes (or make them read-only)
- [ ] Remove auto-sync from Inventory to MenuManager
- [ ] Keep Inventory → MenuManager sync only for display purposes

### Phase 7: Testing & Cleanup
- [ ] Test create flow
- [ ] Test edit flow
- [ ] Test delete flow
- [ ] Verify no data loss
- [ ] Clean up legacy sync code

## Risk Analysis

### Potential Failure Points
1. **Data Loss**: If sync is removed incorrectly, existing data could be lost
2. **Race Conditions**: Multiple users editing same item
3. **Missing Fields**: Fields that exist in MenuManager but not Inventory
4. **Recipe Linking**: Recipes are linked by name, need to ensure itemNumber linking works
5. **File References**: Video/map files referenced by itemNumber, need to ensure consistency

### Mitigation Strategies
1. **Backup First**: Create backup script before making changes
2. **Gradual Migration**: Implement read from Inventory first, then write
3. **Validation**: Ensure all required fields are present before save
4. **Error Handling**: Comprehensive error handling and rollback mechanisms
5. **Testing**: Test each phase thoroughly before proceeding

## Field Mapping Details

### Cocktails
```javascript
Inventory → MenuManager:
- name → name
- region → regions (split by comma)
- style → ingredients
- ice → (not in MenuManager)
- garnish → garnish
- itemNumber → itemNumber

MenuManager → Inventory:
- name → name
- regions (join) → region
- ingredients → style
- garnish → garnish
- itemNumber → itemNumber (read-only from Inventory)
```

### Mocktails
Same as cocktails

### Wine
```javascript
Inventory → MenuManager:
- name → name
- region → regions (split by comma)
- style → ingredients
- hue → globalIngredients
- distributor → garnish
- itemNumber → itemNumber

MenuManager → Inventory:
- name → name
- regions (join) → region
- ingredients → style
- globalIngredients → hue
- garnish → distributor
- itemNumber → itemNumber (read-only from Inventory)
```

### Spirits
```javascript
Inventory → MenuManager:
- name → name
- region → regions (split by comma)
- spirit → ingredients
- distributor → garnish
- itemNumber → itemNumber

MenuManager → Inventory:
- name → name
- regions (join) → region
- ingredients → spirit
- garnish → distributor
- itemNumber → itemNumber (read-only from Inventory)
```

### Beer
```javascript
Inventory → MenuManager:
- name → name
- region → regions (split by comma)
- type → ingredients
- itemNumber → itemNumber

MenuManager → Inventory:
- name → name
- regions (join) → region
- ingredients → type
- itemNumber → itemNumber (read-only from Inventory)
```

### PreMix
```javascript
Inventory → MenuManager:
- name → name
- type → ingredients
- itemNumber → itemNumber

MenuManager → Inventory:
- name → name
- ingredients → type
- itemNumber → itemNumber (read-only from Inventory)
```

## API Changes Needed

### New Endpoints
1. `GET /inventory/:sheetKey/by-name/:name` - Get inventory row by name
2. `GET /inventory/:sheetKey/by-item-number/:itemNumber` - Get inventory row by item number
3. `POST /inventory/:sheetKey/create-from-menu` - Create inventory row from MenuManager data

### Modified Endpoints
1. `PUT /cocktails/:id` - Should write shared fields to Inventory
2. `POST /cocktails` - Should create Inventory row first, then Cocktail

### Removed/Deprecated
1. `POST /inventory/cocktails/sync-from-menu` - Remove or make read-only
2. `POST /inventory/mocktails/sync-from-menu` - Remove or make read-only
3. Auto-sync in `syncInventoryRowToMenuManager` - Remove write operations

## Implementation Steps

### Step 1: Create Helper Functions
- `getInventoryRowByName(sheetKey, name)` - Fetch inventory row
- `getInventoryRowByItemNumber(sheetKey, itemNumber)` - Fetch inventory row
- `mergeInventoryWithCocktailData(inventoryRow, cocktailData)` - Merge for display
- `extractSharedFields(cocktailData, category)` - Extract fields to save to Inventory
- `extractMenuManagerOnlyFields(cocktailData)` - Extract fields to save to Cocktail

### Step 2: Update MenuManager Data Loading
- Modify `fetchCocktails` to also fetch from Inventory
- Merge data sources
- Update state management

### Step 3: Update MenuManager Save
- Split save into two operations:
  1. Save shared fields to Inventory
  2. Save MenuManager-only fields to Cocktail
- Update `handleSave` function

### Step 4: Update MenuManager Create
- Create Inventory row first (with itemNumber and name)
- Then create Cocktail entry
- Link them via menuManagerId

### Step 5: Update MenuManager Delete
- Delete from Cocktail model
- Delete from Inventory (hard delete)
- Delete associated files

### Step 6: Update Table View
- Replace ORDER column with Item # column
- Display itemNumber from Inventory

### Step 7: Cleanup
- Remove bidirectional sync code
- Remove sync-from-menu routes (or deprecate)
- Update documentation

