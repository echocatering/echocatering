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

async function resyncCocktailsMocktails() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/echo-catering', {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('✅ Connected to MongoDB');

    // Get all cocktail and mocktail recipes
    const recipes = await Recipe.find({ type: { $in: ['cocktail', 'mocktail'] } });
    console.log(`📋 Found ${recipes.length} recipes to sync`);

    const sheets = {
      cocktail: await InventorySheet.findOne({ sheetKey: 'cocktails' }),
      mocktail: await InventorySheet.findOne({ sheetKey: 'mocktails' })
    };

    if (!sheets.cocktail) {
      console.error('❌ Cocktails inventory sheet not found');
      process.exit(1);
    }
    if (!sheets.mocktail) {
      console.error('❌ Mocktails inventory sheet not found');
      process.exit(1);
    }

    // Ensure sumOz column exists in both sheets
    for (const [type, sheet] of Object.entries(sheets)) {
      const hasSumOz = sheet.columns.some((col) => col.key === 'sumOz');
      if (!hasSumOz) {
        console.log(`➕ Adding sumOz column to ${type} sheet`);
        const unitCostIndex = sheet.columns.findIndex((col) => col.key === 'unitCost');
        const sumOzColumn = {
          key: 'sumOz',
          label: 'Σ oz',
          type: 'number',
          unit: 'oz',
          precision: 2
        };
        if (unitCostIndex >= 0) {
          sheet.columns.splice(unitCostIndex, 0, sumOzColumn);
        } else {
          sheet.columns.push(sumOzColumn);
        }
        sheet.version += 1;
        await sheet.save();
        console.log(`✅ Added sumOz column to ${type} sheet`);
      }
    }

    let updated = 0;
    let errors = 0;

    for (const recipe of recipes) {
      try {
        const sheet = sheets[recipe.type];
        if (!sheet) {
          console.log(`⚠️  No sheet found for type "${recipe.type}"`);
          continue;
        }

        const columnsByKey = sheet.columns.reduce((acc, column) => {
          acc[column.key] = column;
          return acc;
        }, {});

        // Find the corresponding row in the inventory sheet
        let row = sheet.rows.find((rowItem) => {
          const recipeId = getRowRecipeId(rowItem);
          return recipeId && String(recipeId) === String(recipe._id);
        });

        if (!row) {
          console.log(`⚠️  No inventory row found for recipe "${recipe.title}" (${recipe._id})`);
          continue;
        }

        // Use recipe totals directly (they're already calculated and saved)
        let volumeOz = Number(recipe.totals?.volumeOz) || 0;
        let costEach = Number(recipe.totals?.costEach) || 0;

        // If totals are missing or zero, try to recalculate from items
        if ((volumeOz === 0 || costEach === 0) && recipe.items && Array.isArray(recipe.items) && recipe.items.length > 0) {
          try {
            const hydrated = await hydrateItems(recipe.items);
            volumeOz = hydrated.totals.volumeOz || volumeOz;
            costEach = hydrated.totals.costEach || costEach;
            console.log(`  Recalculated from items: volumeOz=${volumeOz}, costEach=${costEach}`);
          } catch (err) {
            console.log(`  Could not recalculate from items: ${err.message}`);
          }
        }

        // unitCost should be the total cost per serving (costEach), not cost per ounce
        const calculatedUnitCost = costEach;

        // Get current values from the row
        const valuesMap = ensureRowValuesMap(row);
        const currentSumOz = valuesMap.get('sumOz') || 0;
        const currentUnitCost = valuesMap.get('unitCost') || 0;

        const updateValues = {};
        let needsUpdate = false;

        // Update sumOz if different
        if (Math.abs(currentSumOz - volumeOz) > 0.01) {
          updateValues.sumOz = Number(volumeOz.toFixed(2));
          needsUpdate = true;
        }

        // Update unitCost if different
        if (Math.abs(currentUnitCost - calculatedUnitCost) > 0.01) {
          updateValues.unitCost = calculatedUnitCost;
          needsUpdate = true;
        }

        // Always update if we have valid data, even if values seem correct
        // This ensures we populate the new sumOz column
        if (needsUpdate || (volumeOz > 0 && calculatedUnitCost > 0)) {
          if (!needsUpdate) {
            // Force update to populate new column
            updateValues.sumOz = Number(volumeOz.toFixed(2));
            updateValues.unitCost = calculatedUnitCost;
          }
          applyRowValues(row, updateValues, columnsByKey);
          Object.entries(updateValues).forEach(([key, value]) => {
            valuesMap.set(key, value);
          });
          row.markModified('values');
          
          console.log(`✅ Updated "${recipe.title}":`, {
            sumOz: { old: currentSumOz, new: updateValues.sumOz || volumeOz },
            unitCost: { old: currentUnitCost, new: updateValues.unitCost || calculatedUnitCost },
            volumeOz,
            costEach
          });
          updated++;
        } else {
          console.log(`⚠️  "${recipe.title}" has no valid data (volumeOz: ${volumeOz}, costEach: ${costEach})`);
        }
      } catch (error) {
        console.error(`❌ Error processing recipe "${recipe.title}":`, error.message);
        errors++;
      }
    }

    // Save both sheets if any rows were updated
    if (updated > 0) {
      let saved = false;
      for (const [type, sheet] of Object.entries(sheets)) {
        const hasModifiedRows = sheet.rows.some(r => {
          // Check if row values were modified
          if (r.isModified && typeof r.isModified === 'function') {
            return r.isModified('values');
          }
          // If isModified doesn't exist, assume it was modified if we updated it
          return true;
        });
        if (hasModifiedRows || sheet.rows.length > 0) {
          sheet.markModified('rows');
          await sheet.save();
          saved = true;
          console.log(`✅ Saved ${type} sheet`);
        }
      }
      if (saved) {
        console.log(`\n✅ Saved ${updated} updated rows to database`);
      }
    }

    console.log(`\n📊 Summary:`);
    console.log(`   Updated: ${updated}`);
    console.log(`   Already correct: ${recipes.length - updated - errors}`);
    console.log(`   Errors: ${errors}`);
    console.log(`   Total: ${recipes.length}`);

    await mongoose.connection.close();
    console.log('\n✅ Done!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

resyncCocktailsMocktails();

