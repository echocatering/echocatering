/**
 * Backfills the $/oz column on every Pre-Mix inventory row.
 *
 * A pre-mix has no purchase price of its own — what a house syrup costs per ounce is simply
 * what it costs to make. That value was only ever written when someone opened and re-saved
 * that pre-mix's recipe, so most rows had no $/oz at all, and every cocktail using a house
 * syrup silently costed it at $0.
 *
 * Recipes now resolve pre-mix cost live, so this script is not required for correctness — it
 * exists so the Inventory sheet's $/oz column reads correctly too.
 *
 * Run with:  node scripts/active/backfillPreMixOunceCost.js
 *   --dry    print what would change without writing
 */

require('dotenv').config();
const mongoose = require('mongoose');
const InventorySheet = require('../../server/models/InventorySheet');
const { createResolutionContext, resolvePreMixPerOz } = require('../../server/utils/recipeMath');

const DRY_RUN = process.argv.includes('--dry');

async function backfillPreMixOunceCost() {
  const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/echo-catering';
  console.log('🔌 Connecting to MongoDB...');
  await mongoose.connect(mongoUri);
  console.log('✅ Connected\n');

  const sheet = await InventorySheet.findOne({ sheetKey: 'preMix' });
  if (!sheet) {
    console.log('No preMix sheet found — nothing to do.');
    return;
  }

  const ctx = createResolutionContext();
  const rows = (sheet.rows || []).filter((row) => !row.isDeleted);
  console.log(`Found ${rows.length} pre-mix rows${DRY_RUN ? ' (dry run)' : ''}\n`);

  let updated = 0;
  let unresolved = 0;

  for (const row of rows) {
    const name = row.values.get('name') || '(unnamed)';
    const itemNumber = row.values.get('itemNumber');
    const before = row.values.get('ounceCost');

    const perOz = await resolvePreMixPerOz(itemNumber, ctx);
    if (perOz === null) {
      console.log(`  ⚠️  ${name} (#${itemNumber}) — no recipe found, leaving $/oz as ${before ?? 'empty'}`);
      unresolved += 1;
      continue;
    }

    const changed = Number(before) !== perOz;
    console.log(
      `  ${changed ? '✏️ ' : '   '} ${name} (#${itemNumber}): ${before ?? 'empty'} → $${perOz.toFixed(6)}/oz`
    );

    if (changed && !DRY_RUN) {
      row.values.set('ounceCost', perOz);
      row.markModified('values');
      updated += 1;
    } else if (changed) {
      updated += 1;
    }
  }

  if (!DRY_RUN && updated > 0) {
    sheet.markModified('rows');
    await sheet.save();
  }

  console.log(
    `\n${DRY_RUN ? 'Would update' : 'Updated'} ${updated} row(s); ${unresolved} unresolved.`
  );
}

backfillPreMixOunceCost()
  .catch((error) => {
    console.error('❌ Backfill failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
    console.log('🔌 Disconnected');
  });
