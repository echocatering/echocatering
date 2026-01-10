/**
 * One-time migration: copy InventorySheets + InventoryDatasets (and referenced cocktail/mocktail Recipes)
 * from a SOURCE MongoDB to a DEST MongoDB.
 *
 * ✅ Does NOT require you to paste secrets into chat.
 * ✅ Run locally with env vars.
 *
 * Usage:
 *   SOURCE_MONGODB_URI="mongodb://..." DEST_MONGODB_URI="mongodb+srv://..." CONFIRM_OVERWRITE=true node scripts/active/migrateInventoryToAtlas.js
 *
 * Optional:
 *   DRY_RUN=true            # don't write, just report counts
 *   BACKUP_DEST=true        # write JSON backups of dest collections into ./scripts/active/_backups/
 */

const fs = require('fs');
const path = require('path');
const { MongoClient, ObjectId } = require('mongodb');

function getDbNameFromUri(uri) {
  // Very small parser: take the path segment after the last slash, before ?.
  // If missing, default to "test".
  const m = String(uri || '').match(/\/([^/?]+)(\?|$)/);
  return m?.[1] || 'test';
}

function boolEnv(name) {
  const v = String(process.env[name] || '').toLowerCase();
  return v === '1' || v === 'true' || v === 'yes';
}

async function main() {
  const sourceUri = process.env.SOURCE_MONGODB_URI;
  const destUri = process.env.DEST_MONGODB_URI;

  if (!sourceUri || !destUri) {
    throw new Error('Missing SOURCE_MONGODB_URI and/or DEST_MONGODB_URI env vars.');
  }

  const dryRun = boolEnv('DRY_RUN');
  const confirm = boolEnv('CONFIRM_OVERWRITE');
  const backupDest = boolEnv('BACKUP_DEST');

  if (!dryRun && !confirm) {
    throw new Error('Refusing to write without CONFIRM_OVERWRITE=true (or set DRY_RUN=true).');
  }

  const sourceDbName = process.env.SOURCE_DB_NAME || getDbNameFromUri(sourceUri);
  const destDbName = process.env.DEST_DB_NAME || getDbNameFromUri(destUri);

  const sourceClient = new MongoClient(sourceUri);
  const destClient = new MongoClient(destUri);

  console.log('🔄 Connecting to SOURCE:', { db: sourceDbName });
  try {
    await sourceClient.connect();
    console.log('✅ Connected to SOURCE');
  } catch (err) {
    const msg = err?.message || String(err);
    throw new Error(
      `SOURCE connection failed: ${msg}\n` +
        `Tips: ensure your local MongoDB is running and the URI/db name are correct.`
    );
  }

  console.log('🔄 Connecting to DEST:', { db: destDbName });
  try {
    await destClient.connect();
    console.log('✅ Connected to DEST');
  } catch (err) {
    const msg = err?.message || String(err);
    throw new Error(
      `DEST connection failed: ${msg}\n` +
        `Tips:\n` +
        `- Re-copy the Atlas connection string from MongoDB Atlas (Database → Connect → Drivers)\n` +
        `- If you recently rotated the DB user password, update the URI\n` +
        `- If your password contains special characters, URL-encode them (e.g. '@' → '%40')\n` +
        `- Verify the DB user exists and has read/write permissions on the target database`
    );
  }

  const sourceDb = sourceClient.db(sourceDbName);
  const destDb = destClient.db(destDbName);

  const COL_SHEETS = 'inventorysheets';
  const COL_DATASETS = 'inventorydatasets';
  const COL_RECIPES = 'recipes';

  const sourceSheets = await sourceDb.collection(COL_SHEETS).find({}).toArray();
  const sourceDatasets = await sourceDb.collection(COL_DATASETS).find({}).toArray();

  // Collect referenced recipeIds for cocktails/mocktails sheets so they don't get filtered out in prod.
  const recipeIds = new Set();
  for (const sheet of sourceSheets) {
    const key = String(sheet?.sheetKey || '');
    if (key !== 'cocktails' && key !== 'mocktails') continue;
    const rows = Array.isArray(sheet?.rows) ? sheet.rows : [];
    for (const row of rows) {
      if (row?.isDeleted) continue;
      const values = row?.values || {};
      const recipeId = values?.recipeId;
      if (typeof recipeId === 'string' && recipeId.trim()) {
        recipeIds.add(recipeId.trim());
      }
    }
  }

  const recipeObjectIds = Array.from(recipeIds)
    .map((id) => {
      try {
        return new ObjectId(id);
      } catch {
        return null;
      }
    })
    .filter(Boolean);

  const sourceRecipes =
    recipeObjectIds.length > 0
      ? await sourceDb
          .collection(COL_RECIPES)
          .find({ _id: { $in: recipeObjectIds } })
          .toArray()
      : [];

  console.log('📦 SOURCE counts:', {
    inventorySheets: sourceSheets.length,
    inventoryDatasets: sourceDatasets.length,
    referencedRecipes: sourceRecipes.length,
  });

  const destSheetsCount = await destDb.collection(COL_SHEETS).countDocuments();
  const destDatasetsCount = await destDb.collection(COL_DATASETS).countDocuments();
  const destRecipesCount =
    recipeObjectIds.length > 0
      ? await destDb.collection(COL_RECIPES).countDocuments({ _id: { $in: recipeObjectIds } })
      : 0;

  console.log('📦 DEST counts (before):', {
    inventorySheets: destSheetsCount,
    inventoryDatasets: destDatasetsCount,
    referencedRecipes: destRecipesCount,
  });

  if (backupDest) {
    const backupDir = path.join(__dirname, '_backups');
    fs.mkdirSync(backupDir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');

    const backup = async (colName) => {
      const docs = await destDb.collection(colName).find({}).toArray();
      const file = path.join(backupDir, `${colName}-${stamp}.json`);
      fs.writeFileSync(file, JSON.stringify(docs, null, 2));
      console.log('🧾 Backed up', colName, '→', file);
    };

    await backup(COL_SHEETS);
    await backup(COL_DATASETS);
    // Recipes can be huge; only backup the referenced set.
    if (recipeObjectIds.length > 0) {
      const docs = await destDb.collection(COL_RECIPES).find({ _id: { $in: recipeObjectIds } }).toArray();
      const file = path.join(backupDir, `${COL_RECIPES}-referenced-${stamp}.json`);
      fs.writeFileSync(file, JSON.stringify(docs, null, 2));
      console.log('🧾 Backed up referenced recipes →', file);
    }
  }

  if (dryRun) {
    console.log('✅ DRY_RUN=true — no writes performed.');
    await sourceClient.close();
    await destClient.close();
    return;
  }

  console.log('⚠️  Overwriting DEST inventory collections...');
  await destDb.collection(COL_SHEETS).deleteMany({});
  await destDb.collection(COL_DATASETS).deleteMany({});

  if (sourceDatasets.length > 0) {
    await destDb.collection(COL_DATASETS).insertMany(sourceDatasets, { ordered: true });
  }
  if (sourceSheets.length > 0) {
    await destDb.collection(COL_SHEETS).insertMany(sourceSheets, { ordered: true });
  }

  // Upsert referenced recipes only (don’t wipe all recipes in production).
  if (sourceRecipes.length > 0) {
    for (const r of sourceRecipes) {
      // eslint-disable-next-line no-await-in-loop
      await destDb.collection(COL_RECIPES).replaceOne({ _id: r._id }, r, { upsert: true });
    }
  }

  const destSheetsCountAfter = await destDb.collection(COL_SHEETS).countDocuments();
  const destDatasetsCountAfter = await destDb.collection(COL_DATASETS).countDocuments();
  const destRecipesCountAfter =
    recipeObjectIds.length > 0
      ? await destDb.collection(COL_RECIPES).countDocuments({ _id: { $in: recipeObjectIds } })
      : 0;

  console.log('✅ DEST counts (after):', {
    inventorySheets: destSheetsCountAfter,
    inventoryDatasets: destDatasetsCountAfter,
    referencedRecipes: destRecipesCountAfter,
  });

  await sourceClient.close();
  await destClient.close();
}

main().catch((err) => {
  console.error('❌ Migration failed:', err.message);
  process.exitCode = 1;
});


