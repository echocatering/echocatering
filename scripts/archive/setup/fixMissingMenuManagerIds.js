const mongoose = require('mongoose');
const Cocktail = require('../../server/models/Cocktail');
const InventorySheet = require('../../server/models/InventorySheet');
require('dotenv').config();

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/echo-catering', {
  useNewUrlParser: true,
  useUnifiedTopology: true
}).then(() => {
  console.log('✅ Connected to MongoDB');
  fixMissingLinks();
}).catch(err => {
  console.error('❌ MongoDB connection error:', err);
  process.exit(1);
});

async function fixMissingLinks() {
  try {
    console.log('🔄 Fixing missing menuManagerId links...\n');

    // Get all cocktails
    const cocktails = await Cocktail.find({}).lean();
    
    // Get all inventory sheets
    const inventorySheets = await InventorySheet.find({
      sheetKey: { $in: ['cocktails', 'mocktails', 'wine', 'beer', 'spirits', 'preMix'] }
    });

    const categoryToSheetKey = {
      'cocktails': 'cocktails',
      'mocktails': 'mocktails',
      'wine': 'wine',
      'beer': 'beer',
      'spirits': 'spirits',
      'premix': 'preMix'
    };

    let fixed = 0;
    let alreadyLinked = 0;
    let notFound = 0;

    for (const cocktail of cocktails) {
      const sheetKey = categoryToSheetKey[cocktail.category];
      if (!sheetKey) {
        console.log(`⚠️  Skipping ${cocktail.name} - unknown category: ${cocktail.category}`);
        continue;
      }

      const sheet = inventorySheets.find(s => s.sheetKey === sheetKey);
      if (!sheet) {
        console.log(`⚠️  Skipping ${cocktail.name} - sheet not found: ${sheetKey}`);
        notFound++;
        continue;
      }

      // Find matching inventory row
      const row = sheet.rows.find(row => {
        if (row.isDeleted) return false;
        
        const valuesMap = row.values instanceof Map 
          ? row.values 
          : new Map(Object.entries(row.values || {}));
        
        const existingMenuManagerId = valuesMap.get('menuManagerId');
        
        // Skip if already linked to a different cocktail
        if (existingMenuManagerId && String(existingMenuManagerId) !== String(cocktail._id)) {
          return false;
        }
        
        // Match by menuManagerId (if already set)
        if (existingMenuManagerId && String(existingMenuManagerId) === String(cocktail._id)) {
          return true;
        }
        
        // Match by itemNumber
        if (cocktail.itemNumber && valuesMap.get('itemNumber') === cocktail.itemNumber) {
          return true;
        }
        
        // Match by name (case-insensitive)
        const rowName = valuesMap.get('name');
        if (cocktail.name && rowName && 
            rowName.toLowerCase().trim() === cocktail.name.toLowerCase().trim()) {
          return true;
        }
        
        return false;
      });

      if (!row) {
        console.log(`⚠️  No matching inventory row found for: ${cocktail.name} (${cocktail.category})`);
        notFound++;
        continue;
      }

      const valuesMap = row.values instanceof Map 
        ? row.values 
        : new Map(Object.entries(row.values || {}));
      
      const existingMenuManagerId = valuesMap.get('menuManagerId');
      
      if (existingMenuManagerId && String(existingMenuManagerId) === String(cocktail._id)) {
        alreadyLinked++;
        continue;
      }

      // Set the menuManagerId
      valuesMap.set('menuManagerId', String(cocktail._id));
      row.values = valuesMap;
      sheet.markModified('rows');
      
      console.log(`✅ Fixed link: ${cocktail.name} (${cocktail.category}) -> Inventory row`);
      fixed++;
    }

    // Save all sheets
    if (fixed > 0) {
      for (const sheet of inventorySheets) {
        if (sheet.isModified('rows')) {
          sheet.version += 1;
          await sheet.save();
        }
      }
    }

    console.log('\n📊 Summary:');
    console.log(`   ✅ Fixed: ${fixed}`);
    console.log(`   ℹ️  Already linked: ${alreadyLinked}`);
    console.log(`   ⚠️  Not found: ${notFound}`);
    console.log('\n✅ Done!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error fixing links:', error);
    process.exit(1);
  }
}

