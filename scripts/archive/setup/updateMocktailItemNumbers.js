// One-off script to renumber mocktails:
// - Green Silence  -> itemNumber 3
// - Golder Basalisk -> itemNumber 4
// and rename their media files accordingly.

const path = require('path');
const fs = require('fs');
const mongoose = require('mongoose');

const Cocktail = require('../server/models/Cocktail');
const InventorySheet = require('../server/models/InventorySheet');
const Recipe = require('../server/models/Recipe');

const VIDEO_DIR = path.join(__dirname, '../server/uploads/items');

async function safeRename(oldName, newName) {
  if (!oldName || oldName === newName) return;
  const oldPath = path.join(VIDEO_DIR, oldName);
  const newPath = path.join(VIDEO_DIR, newName);

  if (!fs.existsSync(oldPath)) {
    console.log(`  - Skip rename, source missing: ${oldName}`);
    return;
  }

  if (fs.existsSync(newPath)) {
    console.log(`  - Target already exists, not overwriting: ${newName}`);
    return;
  }

  fs.renameSync(oldPath, newPath);
  console.log(`  ✅ Renamed ${oldName} -> ${newName}`);
}

async function run() {
  const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/echo-catering';
  console.log('Connecting to MongoDB:', uri);
  await mongoose.connect(uri);

  try {
    const targets = [
      { name: 'Green Silence', targetNumber: 3 },
      { name: 'Golder Basalisk', targetNumber: 4 }
    ];

    // 1) Update Cocktail documents and rename files
    for (const { name, targetNumber } of targets) {
      const cocktail = await Cocktail.findOne({ name, category: 'mocktails' });
      if (!cocktail) {
        console.warn(`⚠️  Cocktail not found for name="${name}"`);
        continue;
      }

      console.log(`\n▶ Updating cocktail "${name}" (_id=${cocktail._id})`);
      console.log('  - Old itemNumber:', cocktail.itemNumber);

      // Rename video/map files to match new itemNumber
      if (cocktail.videoFile) {
        const ext = path.extname(cocktail.videoFile) || '.mp4';
        const newVideo = `${targetNumber}${ext}`;
        await safeRename(cocktail.videoFile, newVideo);
        cocktail.videoFile = newVideo;
      }

      if (cocktail.mapSnapshotFile) {
        const mapExt = path.extname(cocktail.mapSnapshotFile) || '.png';
        const newMap = `${targetNumber}${mapExt}`;
        await safeRename(cocktail.mapSnapshotFile, newMap);
        cocktail.mapSnapshotFile = newMap;
      }

      cocktail.itemNumber = targetNumber;
      cocktail.itemId = `item${targetNumber}`;

      await cocktail.save();
      console.log(`  ✅ Cocktail updated to itemNumber=${targetNumber}, itemId=${cocktail.itemId}`);
      console.log(`  - videoFile: ${cocktail.videoFile || '(none)'}`);
      console.log(`  - mapSnapshotFile: ${cocktail.mapSnapshotFile || '(none)'}`);
    }

    // 2) Update Inventory mocktails sheet itemNumber values
    const mocktailSheet = await InventorySheet.findOne({ sheetKey: 'mocktails' });
    if (!mocktailSheet) {
      console.warn('\n⚠️  Mocktails InventorySheet not found');
    } else {
      console.log('\n▶ Updating InventorySheet.mocktails itemNumber values');
      const rows = mocktailSheet.rows || [];
      let updatedRows = 0;

      for (const row of rows) {
        if (!row.values) continue;
        const values = row.values instanceof Map ? Object.fromEntries(row.values) : row.values;
        if (!values.name) continue;

        if (values.name === 'Green Silence') {
          values.itemNumber = 3;
          updatedRows++;
        } else if (values.name === 'Golder Basalisk') {
          values.itemNumber = 4;
          updatedRows++;
        } else {
          continue;
        }

        // Write back values (support Map or plain object)
        if (row.values instanceof Map) {
          Object.entries(values).forEach(([k, v]) => row.values.set(k, v));
        } else {
          row.values = values;
        }
      }

      if (updatedRows > 0) {
        await mocktailSheet.save();
        console.log(`  ✅ Updated itemNumber for ${updatedRows} inventory row(s)`);
      } else {
        console.log('  ⚠️  No matching inventory rows found by name');
      }
    }

    // 3) Update Recipe itemNumber fields
    console.log('\n▶ Updating Recipe.itemNumber links');
    const recipes = await Recipe.find({
      title: { $in: ['Green Silence', 'Golder Basalisk'] }
    });

    for (const recipe of recipes) {
      const target =
        recipe.title === 'Green Silence'
          ? 3
          : recipe.title === 'Golder Basalisk'
          ? 4
          : null;
      if (!target) continue;

      console.log(`  - Recipe "${recipe.title}" (_id=${recipe._id}) itemNumber: ${recipe.itemNumber} -> ${target}`);
      recipe.itemNumber = target;
      await recipe.save();
    }

    console.log('\n✅ Done. Verify in MenuManager and InventoryManager that:');
    console.log('  - Green Silence is item 3');
    console.log('  - Golder Basalisk is item 4');
  } catch (err) {
    console.error('❌ Migration error:', err);
  } finally {
    await mongoose.disconnect();
  }
}

run();


