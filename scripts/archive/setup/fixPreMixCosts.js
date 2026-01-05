const mongoose = require('mongoose');
require('dotenv').config();

const Recipe = require('../../server/models/Recipe');
const InventorySheet = require('../../server/models/InventorySheet');
const { applyRowValues } = require('../../server/utils/inventoryHelpers');

async function fixPreMixCosts() {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/echo-catering');
    console.log('✅ Connected to MongoDB');

    const sheet = await InventorySheet.findOne({ sheetKey: 'preMix' });
    if (!sheet) {
      console.error('❌ Pre-mix inventory sheet not found');
      process.exit(1);
    }

    const columnsByKey = sheet.columns.reduce((acc, col) => {
      acc[col.key] = col;
      return acc;
    }, {});

    const lime = await Recipe.findOne({ title: 'Lime Acid' });
    const lavender = await Recipe.findOne({ title: 'Lavender Syrup' });

    if (lime) {
      // Fix costEach to 0.20, so ounceCost = 0.20 / 7.05 = 0.03
      lime.totals.costEach = 0.20;
      lime.markModified('totals');
      await lime.save();
      const calculatedOunceCost = Number((0.20 / lime.totals.volumeOz).toFixed(2));
      console.log(`✅ Fixed Lime Acid costEach to 0.20, ounceCost = ${calculatedOunceCost}`);

      const row = sheet.rows.find(r => {
        const recipeId = r.values instanceof Map ? r.values.get('recipeId') : r.values?.recipeId;
        return recipeId && String(recipeId) === String(lime._id);
      });
      if (row) {
        const valuesMap = row.values instanceof Map ? row.values : new Map(Object.entries(row.values || {}));
        applyRowValues(row, { ounceCost: calculatedOunceCost }, columnsByKey);
        valuesMap.set('ounceCost', calculatedOunceCost);
        row.markModified('values');
      }
    }

    if (lavender) {
      // Fix costEach to 1.29, so ounceCost = 1.29 / 40.97 = 0.03
      lavender.totals.costEach = 1.29;
      lavender.markModified('totals');
      await lavender.save();
      const calculatedOunceCost = Number((1.29 / lavender.totals.volumeOz).toFixed(2));
      console.log(`✅ Fixed Lavender Syrup costEach to 1.29, ounceCost = ${calculatedOunceCost}`);

      const row = sheet.rows.find(r => {
        const recipeId = r.values instanceof Map ? r.values.get('recipeId') : r.values?.recipeId;
        return recipeId && String(recipeId) === String(lavender._id);
      });
      if (row) {
        const valuesMap = row.values instanceof Map ? row.values : new Map(Object.entries(row.values || {}));
        applyRowValues(row, { ounceCost: calculatedOunceCost }, columnsByKey);
        valuesMap.set('ounceCost', calculatedOunceCost);
        row.markModified('values');
      }
    }

    if (lime || lavender) {
      sheet.markModified('rows');
      await sheet.save();
      console.log('✅ Saved inventory updates');
    }

    await mongoose.connection.close();
    console.log('\n✅ Done!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

fixPreMixCosts();

