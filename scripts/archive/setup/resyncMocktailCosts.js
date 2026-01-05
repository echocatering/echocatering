const mongoose = require('mongoose');
require('dotenv').config();

const Recipe = require('../../server/models/Recipe');
const InventorySheet = require('../../server/models/InventorySheet');
const { hydrateItems } = require('../../server/utils/recipeMath');
const { applyRowValues } = require('../../server/utils/inventoryHelpers');

const getRowRecipeId = (row) => {
  if (!row?.values) {
    return null;
  }
  if (row.values instanceof Map) {
    return row.values.get('recipeId');
  }
  return row.values.recipeId;
};

const ensureRowValuesMap = (row) => {
  if (!row.values) {
    row.values = new Map();
    return row.values;
  }
  if (row.values instanceof Map) {
    return row.values;
  }
  const cloned = new Map(Object.entries(row.values));
  row.values = cloned;
  return cloned;
};

async function resyncMocktailCosts() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/echo-catering', {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('✅ Connected to MongoDB');

    // Get all mocktail recipes
    const mocktailRecipes = await Recipe.find({ type: 'mocktail' });
    console.log(`📋 Found ${mocktailRecipes.length} mocktail recipes`);

    // Get the mocktails inventory sheet
    const sheet = await InventorySheet.findOne({ sheetKey: 'mocktails' });
    if (!sheet) {
      console.error('❌ Mocktails inventory sheet not found');
      process.exit(1);
    }

    const columnsByKey = sheet.columns.reduce((acc, column) => {
      acc[column.key] = column;
      return acc;
    }, {});

    let updated = 0;
    let errors = 0;

    for (const recipe of mocktailRecipes) {
      try {
        // Find the corresponding row in the inventory sheet
        let row = sheet.rows.find((rowItem) => {
          const recipeId = getRowRecipeId(rowItem);
          return recipeId && String(recipeId) === String(recipe._id);
        });

        if (!row) {
          console.log(`⚠️  No inventory row found for recipe "${recipe.title}" (${recipe._id})`);
          continue;
        }

        // Recalculate cost from items using the same logic as the recipe builder
        let recipeItems = recipe.items;
        if (!Array.isArray(recipeItems)) {
          recipeItems = [];
        }

        let calculatedCost = 0;
        if (recipeItems.length > 0) {
          const hydrated = await hydrateItems(recipeItems);
          calculatedCost = hydrated.totals.costEach;
        } else {
          calculatedCost = Number(recipe.totals?.costEach) || 0;
        }

        // Get current unitCost from the row
        const valuesMap = ensureRowValuesMap(row);
        const currentUnitCost = valuesMap.get('unitCost') || 0;

        if (Math.abs(currentUnitCost - calculatedCost) > 0.01) {
          // Update the unitCost
          applyRowValues(row, { unitCost: calculatedCost }, columnsByKey);
          valuesMap.set('unitCost', calculatedCost);
          row.markModified('values');
          
          console.log(`✅ Updated "${recipe.title}":`, {
            old: currentUnitCost,
            new: calculatedCost,
            difference: (calculatedCost - currentUnitCost).toFixed(2)
          });
          updated++;
        } else {
          console.log(`✓ "${recipe.title}" already has correct cost: ${calculatedCost}`);
        }
      } catch (error) {
        console.error(`❌ Error processing recipe "${recipe.title}":`, error.message);
        errors++;
      }
    }

    if (updated > 0) {
      sheet.markModified('rows');
      await sheet.save();
      console.log(`\n✅ Saved ${updated} updated rows to database`);
    }

    console.log(`\n📊 Summary:`);
    console.log(`   Updated: ${updated}`);
    console.log(`   Already correct: ${mocktailRecipes.length - updated - errors}`);
    console.log(`   Errors: ${errors}`);
    console.log(`   Total: ${mocktailRecipes.length}`);

    await mongoose.connection.close();
    console.log('\n✅ Done!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

resyncMocktailCosts();






