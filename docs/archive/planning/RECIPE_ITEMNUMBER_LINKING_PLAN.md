# Recipe Linking by itemNumber - Implementation Plan

## Goal
Link Recipe data to Cocktail/Inventory by `itemNumber` instead of name/title matching. This makes linking more reliable and consistent with the rest of the system.

## Current State

### Recipe Model
- **No `itemNumber` field** - only has `title` (links to Cocktail `name`)
- Linked by: `recipe.title === cocktail.name` (name matching)

### Current Linking Flow
1. **MenuManager → Recipe**: Finds recipe by matching `recipe.title === cocktail.name`
2. **Recipe → Inventory**: Finds cocktail by `recipe.title`, then finds inventory by `cocktail.itemNumber`
3. **Recipe Sync**: Uses cocktail lookup by name to get itemNumber

### Problems with Name Matching
- Fragile: breaks if name changes
- Case-sensitive issues
- Multiple recipes with same name
- Not consistent with rest of system (everything else uses itemNumber)

## Target State

### Recipe Model
- **Add `itemNumber` field** - primary identifier for linking
- Keep `title` field (still needed for display)
- Linked by: `recipe.itemNumber === cocktail.itemNumber`

### New Linking Flow
1. **MenuManager → Recipe**: Finds recipe by `recipe.itemNumber === cocktail.itemNumber`
2. **Recipe → Inventory**: Finds inventory directly by `itemNumber` (no cocktail lookup needed)
3. **Recipe Sync**: Uses `recipe.itemNumber` directly to find inventory row

## Implementation Steps

### Phase 1: Add itemNumber to Recipe Schema

#### 1.1 Update `server/models/Recipe.js`
Add `itemNumber` field to RecipeSchema:

```javascript
const RecipeSchema = new Schema({
  title: { type: String, required: true },
  type: { type: String, enum: ['cocktail', 'mocktail', 'premix', 'beer', 'wine', 'spirit'], required: true },
  itemNumber: { type: Number, required: false, sparse: true }, // NEW: Link to Cocktail/Inventory
  video: {
    posterUrl: String,
    videoUrl: String
  },
  metadata: { type: MetadataSchema, default: () => ({}) },
  notes: String,
  batchNotes: String,
  batch: { type: BatchSettingsSchema, default: () => ({}) },
  items: { type: [RecipeItemSchema], default: [] },
  totals: { type: TotalsSchema, default: () => ({}) },
  backgroundColor: { type: String, default: '#e5e5e5', required: false }
}, { timestamps: true });
```

**Notes:**
- `required: false` - optional for backward compatibility
- `sparse: true` - allows multiple documents without itemNumber (for migration period)

### Phase 2: Update Recipe Save Endpoints

#### 2.1 Update `POST /api/recipes` in `server/routes/recipes.js`
Accept `itemNumber` from request body and store it:

```javascript
router.post('/', upload.single('video'), async (req, res, next) => {
  try {
    let body = req.body;
    
    // ... existing code ...
    
    // Extract itemNumber if provided
    let itemNumber = null;
    if (body.itemNumber !== undefined && body.itemNumber !== null) {
      itemNumber = Number(body.itemNumber);
      if (!Number.isFinite(itemNumber)) {
        itemNumber = null;
      }
    }
    
    const payload = await normalizeRecipePayload(body);
    
    // Add itemNumber to payload if provided
    if (itemNumber !== null) {
      payload.itemNumber = itemNumber;
    }
    
    const recipe = await Recipe.create(payload);
    
    // ... rest of existing code ...
  }
});
```

#### 2.2 Update `PUT /api/recipes/:id` in `server/routes/recipes.js`
Accept `itemNumber` from request body and update it:

```javascript
router.put('/:id', async (req, res, next) => {
  try {
    // ... existing code ...
    
    // Extract itemNumber if provided
    let itemNumber = null;
    if (mergedBody.itemNumber !== undefined && mergedBody.itemNumber !== null) {
      itemNumber = Number(mergedBody.itemNumber);
      if (!Number.isFinite(itemNumber)) {
        itemNumber = null;
      }
    }
    
    let payload;
    try {
      payload = await normalizeRecipePayload(mergedBody);
    } catch (normalizeError) {
      // ... error handling ...
    }
    
    // Add itemNumber to payload if provided
    if (itemNumber !== null) {
      payload.itemNumber = itemNumber;
    }
    
    const recipe = await Recipe.findById(req.params.id);
    if (!recipe) {
      return res.status(404).json({ message: 'Recipe not found.' });
    }
    
    recipe.set(payload);
    
    // ... rest of existing code ...
  }
});
```

### Phase 3: Update MenuManager to Pass itemNumber

#### 3.1 Update Recipe Save in `src/admin/components/MenuManager.js`
Pass `itemNumber` when saving recipe:

```javascript
// In handleSave function, around line 1364-1388
let recipeBody;
if (videoFile instanceof File) {
  const recipeFormData = new FormData();
  recipeFormData.append('title', recipeToSave.title);
  recipeFormData.append('type', recipeToSave.type);
  recipeFormData.append('itemNumber', cocktailData.itemNumber || ''); // NEW: Pass itemNumber
  recipeFormData.append('metadata', JSON.stringify(recipeToSave.metadata || {}));
  recipeFormData.append('items', JSON.stringify(recipeToSave.items || []));
  recipeFormData.append('totals', JSON.stringify(recipeToSave.totals || { volumeOz: 0, costEach: 0 }));
  recipeFormData.append('batch', JSON.stringify(recipeToSave.batch || {}));
  recipeFormData.append('backgroundColor', recipeToSave.backgroundColor || '#e5e5e5');
  if (recipeToSave.notes) {
    recipeFormData.append('notes', recipeToSave.notes);
  }
  recipeFormData.append('video', videoFile);
  recipeBody = recipeFormData;
} else {
  // Remove _videoFile from JSON payload
  const { _videoFile, ...recipeJson } = recipeToSave;
  recipeJson.itemNumber = cocktailData.itemNumber || null; // NEW: Pass itemNumber
  recipeBody = recipeJson;
}
```

### Phase 4: Update Recipe Fetching Logic

#### 4.1 Update `fetchRecipeForCocktail` in `src/admin/components/MenuManager.js`
Find recipe by `itemNumber` first, fall back to name matching:

```javascript
const fetchRecipeForCocktail = useCallback(async (cocktail) => {
  if (!cocktail || !cocktail._id || String(cocktail._id).startsWith('new-')) {
    // New item - create blank recipe
    const recipeType = getRecipeType(cocktail?.category || selectedCategory);
    if (recipeType) {
      setRecipe(createBlankRecipe(recipeType));
    } else {
      setRecipe(null);
    }
    return;
  }

  const recipeType = getRecipeType(cocktail.category);
  if (!recipeType) {
    setRecipe(null);
    return;
  }

  try {
    setRecipeLoading(true);
    
    // NEW: Try to find recipe by itemNumber first (primary method)
    if (cocktail.itemNumber) {
      const response = await apiCall(`/recipes?type=${recipeType}&itemNumber=${cocktail.itemNumber}`);
      const recipes = Array.isArray(response) 
        ? response 
        : (response?.recipes || []);
      
      const matchingRecipe = recipes.find(r => r.itemNumber === cocktail.itemNumber);
      if (matchingRecipe) {
        console.log('✅ Found matching recipe by itemNumber:', matchingRecipe.title, matchingRecipe._id);
        setRecipe(matchingRecipe);
        return;
      }
    }
    
    // FALLBACK: Try to find recipe by title (cocktail name) - for backward compatibility
    const response = await apiCall(`/recipes?type=${recipeType}`);
    const recipes = Array.isArray(response) 
      ? response 
      : (response?.recipes || []);
    
    console.log('🔍 Fetching recipe for cocktail:', {
      cocktailName: cocktail.name,
      cocktailItemNumber: cocktail.itemNumber,
      recipeType,
      recipesFound: recipes.length,
      recipeTitles: recipes.map(r => r.title)
    });
    
    // Try exact match first, then case-insensitive match
    let matchingRecipe = recipes.find(r => r.title === cocktail.name);
    if (!matchingRecipe) {
      matchingRecipe = recipes.find(r => 
        r.title && cocktail.name && 
        r.title.toLowerCase() === cocktail.name.toLowerCase()
      );
    }
    
    if (matchingRecipe) {
      console.log('✅ Found matching recipe by name:', matchingRecipe.title, matchingRecipe._id);
      setRecipe(matchingRecipe);
    } else {
      console.log('⚠️ No matching recipe found, creating blank recipe');
      // Create blank recipe if none exists
      setRecipe(createBlankRecipe(recipeType));
    }
  } catch (error) {
    console.error('Error fetching recipe:', error);
    const recipeType = getRecipeType(cocktail.category);
    if (recipeType) {
      setRecipe(createBlankRecipe(recipeType));
    } else {
      setRecipe(null);
    }
  } finally {
    setRecipeLoading(false);
  }
}, [apiCall, selectedCategory]);
```

#### 4.2 Update Recipe GET endpoint to support itemNumber query
Update `GET /api/recipes` in `server/routes/recipes.js`:

```javascript
router.get('/', async (req, res, next) => {
  try {
    const { type, itemNumber } = req.query;
    const query = {};
    
    if (type) {
      query.type = type;
    }
    
    // NEW: Filter by itemNumber if provided
    if (itemNumber !== undefined && itemNumber !== null) {
      const num = Number(itemNumber);
      if (Number.isFinite(num)) {
        query.itemNumber = num;
      }
    }
    
    const recipes = await Recipe.find(query).sort({ createdAt: -1 });
    res.json(recipes);
  } catch (error) {
    next(error);
  }
});
```

### Phase 5: Update Recipe Sync Logic

#### 5.1 Update `syncRecipeInventoryRow` in `server/routes/recipes.js`
Use `recipe.itemNumber` directly instead of looking up cocktail by name:

```javascript
const syncRecipeInventoryRow = async (recipe, payloadTotals = null) => {
  const sheetKey = SHEET_KEY_BY_RECIPE_TYPE[recipe.type];
  if (!sheetKey) return;
  const sheet = await InventorySheet.findOne({ sheetKey });
  if (!sheet) return;

  const columnsByKey = sheet.columns.reduce((acc, column) => {
    acc[column.key] = column;
    return acc;
  }, {});

  // Find existing inventory row - try multiple methods for robustness
  let row = null;
  let linkedCocktail = null; // Store the linked cocktail for later use (regions, etc.)
  
  // NEW: For cocktails/mocktails, find by itemNumber directly (primary method)
  if (sheetKey === 'cocktails' || sheetKey === 'mocktails') {
    // NEW: Use recipe.itemNumber directly if available
    if (recipe.itemNumber && Number.isFinite(recipe.itemNumber)) {
      // Find inventory row by itemNumber directly
      row = sheet.rows.find((rowItem) => {
        const valuesMap = ensureRowValuesMap(rowItem);
        const rowItemNumber = valuesMap.get('itemNumber');
        return rowItemNumber && Number(rowItemNumber) === Number(recipe.itemNumber);
      });
      
      if (row) {
        console.log(`✅ Found inventory row for recipe "${recipe.title}" via itemNumber ${recipe.itemNumber}`);
        
        // Also get linked cocktail for regions (if needed)
        const Cocktail = require('../models/Cocktail');
        try {
          const category = recipe.type === 'cocktail' ? 'cocktails' : 'mocktails';
          linkedCocktail = await Cocktail.findOne({
            itemNumber: recipe.itemNumber,
            category: category,
            status: { $ne: 'archived' }
          });
        } catch (err) {
          console.warn('Error finding cocktail by itemNumber:', err);
        }
      }
    }
    
    // FALLBACK: Find cocktail by recipe title to get itemNumber (for backward compatibility)
    if (!row) {
      const Cocktail = require('../models/Cocktail');
      try {
        const category = recipe.type === 'cocktail' ? 'cocktails' : 'mocktails';
        linkedCocktail = await Cocktail.findOne({
          name: { $regex: new RegExp(`^${recipe.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
          category: category,
          status: { $ne: 'archived' }
        });
        
        if (linkedCocktail && linkedCocktail.itemNumber) {
          // Find inventory row by itemNumber (primary identifier)
          row = sheet.rows.find((rowItem) => {
            const valuesMap = ensureRowValuesMap(rowItem);
            const rowItemNumber = valuesMap.get('itemNumber');
            return rowItemNumber && Number(rowItemNumber) === Number(linkedCocktail.itemNumber);
          });
          
          if (row) {
            console.log(`✅ Found inventory row for recipe "${recipe.title}" via itemNumber ${linkedCocktail.itemNumber} (from cocktail lookup)`);
          }
        }
      } catch (err) {
        console.warn('Error finding cocktail by recipe title:', err);
      }
    }
  }
  
  // Fallback: Find by recipeId (for preMix or if itemNumber method didn't work)
  if (!row) {
    row = sheet.rows.find((rowItem) => {
      const recipeId = getRowRecipeId(rowItem);
      return recipeId && String(recipeId) === String(recipe._id);
    });
    
    if (row) {
      console.log(`✅ Found inventory row for recipe "${recipe.title}" via recipeId`);
    }
  }

  // ... rest of existing sync logic ...
};
```

### Phase 6: Update Recipe Fetching in Menu Manager Endpoint

#### 6.1 Update `/api/cocktails/menu-manager` in `server/routes/cocktails.js`
Find recipes by `itemNumber` instead of name:

```javascript
// Around line 655-792
// Build recipe lookup maps
const recipeByItemNumber = new Map(); // NEW: Map by itemNumber
const recipeByName = new Map(); // Keep for fallback

recipes.forEach((recipe) => {
  if (recipe.itemNumber && Number.isFinite(recipe.itemNumber)) {
    recipeByItemNumber.set(recipe.itemNumber, recipe);
  }
  if (recipe.title) {
    recipeByName.set(recipe.title.toLowerCase().trim(), recipe);
  }
});

// ... later in mergedItems.map ...

// Find matching recipe - NEW: Try itemNumber first
let recipe = null;
if (itemNumber) {
  recipe = recipeByItemNumber.get(Number(itemNumber));
}
// Fallback: Find by name (for backward compatibility)
if (!recipe && name) {
  recipe = recipeByName.get(name.toLowerCase().trim());
}
```

### Phase 7: Migration Script

#### 7.1 Create `scripts/migrateRecipesToItemNumber.js`
One-time script to add `itemNumber` to existing recipes:

```javascript
require('dotenv').config();
const mongoose = require('mongoose');
const Recipe = require('../server/models/Recipe');
const Cocktail = require('../server/models/Cocktail');

(async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/echo-catering');
    console.log('✅ Connected to MongoDB');

    // Find all recipes without itemNumber
    const recipes = await Recipe.find({ 
      $or: [
        { itemNumber: { $exists: false } },
        { itemNumber: null }
      ]
    });

    console.log(`\n📋 Found ${recipes.length} recipe(s) without itemNumber\n`);

    let updated = 0;
    let skipped = 0;

    for (const recipe of recipes) {
      // Try to find matching cocktail by name
      const category = recipe.type === 'cocktail' ? 'cocktails' : 
                      recipe.type === 'mocktail' ? 'mocktails' : null;
      
      if (!category) {
        console.log(`⚠️  Skipping ${recipe.type} recipe "${recipe.title}" (no category mapping)`);
        skipped++;
        continue;
      }

      const cocktail = await Cocktail.findOne({
        name: { $regex: new RegExp(`^${recipe.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
        category: category,
        status: { $ne: 'archived' }
      });

      if (cocktail && cocktail.itemNumber) {
        recipe.itemNumber = cocktail.itemNumber;
        await recipe.save();
        console.log(`✅ Updated recipe "${recipe.title}" with itemNumber: ${cocktail.itemNumber}`);
        updated++;
      } else {
        console.log(`⚠️  No matching cocktail found for recipe "${recipe.title}"`);
        skipped++;
      }
    }

    console.log(`\n✅ Migration complete:`);
    console.log(`   - Updated: ${updated}`);
    console.log(`   - Skipped: ${skipped}`);

    await mongoose.disconnect();
  } catch (error) {
    console.error('Migration error:', error);
    process.exit(1);
  }
})();
```

## Testing Checklist

- [ ] New recipe created with itemNumber
- [ ] Existing recipe updated with itemNumber
- [ ] MenuManager finds recipe by itemNumber
- [ ] Recipe sync finds inventory by itemNumber
- [ ] Fallback to name matching still works (backward compatibility)
- [ ] Migration script successfully adds itemNumber to existing recipes
- [ ] Recipe GET endpoint filters by itemNumber
- [ ] No breaking changes to existing functionality

## Benefits

1. **More Reliable**: itemNumber is stable, names can change
2. **Consistent**: Everything else uses itemNumber
3. **Faster**: Direct lookup by itemNumber (no name matching)
4. **Simpler**: No need to look up cocktail to get itemNumber
5. **Backward Compatible**: Falls back to name matching if itemNumber not available

## Rollout Plan

1. **Step 1**: Add itemNumber field to Recipe schema (Phase 1)
2. **Step 2**: Update save endpoints to accept itemNumber (Phase 2)
3. **Step 3**: Update MenuManager to pass itemNumber (Phase 3)
4. **Step 4**: Update fetching logic to use itemNumber (Phase 4)
5. **Step 5**: Update recipe sync to use itemNumber (Phase 5)
6. **Step 6**: Update menu-manager endpoint (Phase 6)
7. **Step 7**: Run migration script (Phase 7)
8. **Step 8**: Test thoroughly
9. **Step 9**: Remove name matching fallback (optional, later)

