const mongoose = require('mongoose');
const Cocktail = require('../../server/models/Cocktail');
const Recipe = require('../../server/models/Recipe');

// Connect to MongoDB
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/echo-catering';

mongoose.connect(MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => console.log('✅ Connected to MongoDB'))
.catch(err => {
  console.error('❌ MongoDB connection error:', err);
  process.exit(1);
});

async function updateLavenderGandTRecipe() {
  try {
    console.log('🔄 Updating Lavender G&T recipe with complete information...\n');

    // Find the Lavender G&T cocktail
    const cocktail = await Cocktail.findOne({ name: /lavender/i });
    if (!cocktail) {
      console.log('❌ Lavender G&T cocktail not found');
      process.exit(1);
    }

    console.log(`✅ Found cocktail: "${cocktail.name}" (ID: ${cocktail._id})`);

    // Find or create recipe linked to the cocktail
    let recipe = await Recipe.findOne({ title: cocktail.name, type: 'cocktail' });
    
    if (!recipe) {
      console.log('📝 Creating new recipe for cocktail...');
      recipe = new Recipe({
        title: cocktail.name,
        type: 'cocktail',
        items: [],
        totals: { volumeOz: 0, costEach: 0 },
        metadata: {},
        backgroundColor: '#e5ccff',
        batch: { size: 0, unit: 'oz', yieldCount: 0 }
      });
    }

    // Update with complete recipe data from MENU UI
    recipe.title = cocktail.name;
    recipe.type = 'cocktail';
    recipe.backgroundColor = '#e5ccff';
    
    // Set metadata
    recipe.metadata = {
      priceSet: 0,
      priceMin: 0,
      style: '',
      glassware: '',
      ice: 'Large Cube',
      garnish: 'Lavender',
      type: 'HIGHBALL',
      cocktail: ''
    };

    // Set items with correct ingredients and amounts
    // Note: These inventoryKeys need to match what's in your inventory
    // You may need to adjust the rowIds based on your actual inventory data
    recipe.items = [
      {
        order: 1,
        inventoryKey: 'dryStock:692782438edae34b1088af1b',
        ingredient: {
          sheetKey: 'dryStock',
          rowId: '692782438edae34b1088af1b',
          name: 'H20'
        },
        amount: {
          display: '3 1/2',
          value: 3.5,
          unit: 'oz',
          fraction: { whole: 3, numerator: 1, denominator: 2 }
        },
        conversions: { toOz: 3.5, toMl: 103.51, toGram: 99.22 },
        pricing: {
          currency: 'USD',
          perUnit: 0,
          perOz: null,
          perMl: null,
          perGram: 0
        },
        extendedCost: 0,
        notes: ''
      },
      {
        order: 2,
        inventoryKey: 'spirits:6927804f8edae34b1088a494',
        ingredient: {
          sheetKey: 'spirits',
          rowId: '6927804f8edae34b1088a494',
          name: "Hayman's Old Tom"
        },
        amount: {
          display: '1',
          value: 1,
          unit: 'oz',
          fraction: { whole: 1, numerator: 0, denominator: 1 }
        },
        conversions: { toOz: 1, toMl: 29.57, toGram: 28.35 },
        pricing: {
          currency: 'USD',
          perUnit: 32.99,
          perOz: 0.98,
          perMl: null,
          perGram: null
        },
        extendedCost: 0.98,
        notes: ''
      },
      {
        order: 3,
        inventoryKey: 'spirits:692780238edae34b1088a392',
        ingredient: {
          sheetKey: 'spirits',
          rowId: '692780238edae34b1088a392',
          name: 'Empress'
        },
        amount: {
          display: '1/2',
          value: 0.5,
          unit: 'oz',
          fraction: { whole: 0, numerator: 1, denominator: 2 }
        },
        conversions: { toOz: 0.5, toMl: 14.79, toGram: 14.17 },
        pricing: {
          currency: 'USD',
          perUnit: 34.99,
          perOz: 1.03,
          perMl: null,
          perGram: null
        },
        extendedCost: 0.515,
        notes: ''
      },
      {
        order: 4,
        inventoryKey: 'spirits:692771638edae34b10888b99',
        ingredient: {
          sheetKey: 'spirits',
          rowId: '692771638edae34b10888b99',
          name: 'Cocchi Americano'
        },
        amount: {
          display: '1/2',
          value: 0.5,
          unit: 'oz',
          fraction: { whole: 0, numerator: 1, denominator: 2 }
        },
        conversions: { toOz: 0.5, toMl: 14.79, toGram: 14.17 },
        pricing: {
          currency: 'USD',
          perUnit: 22,
          perOz: 0.87,
          perMl: null,
          perGram: null
        },
        extendedCost: 0.435,
        notes: ''
      },
      {
        order: 5,
        inventoryKey: 'preMix:692c9b288eac673562abf640',
        ingredient: {
          sheetKey: 'preMix',
          rowId: '692c9b288eac673562abf640',
          name: 'Lavender Syrup'
        },
        amount: {
          display: '1/2',
          value: 0.5,
          unit: 'oz',
          fraction: { whole: 0, numerator: 1, denominator: 2 }
        },
        conversions: { toOz: 0.5, toMl: 14.79, toGram: 14.17 },
        pricing: {
          currency: 'USD',
          perUnit: null,
          perOz: 0.03,
          perMl: null,
          perGram: null
        },
        extendedCost: 0.015,
        notes: ''
      },
      {
        order: 6,
        inventoryKey: 'dryStock:692787f58edae34b1088ba6b',
        ingredient: {
          sheetKey: 'dryStock',
          rowId: '692787f58edae34b1088ba6b',
          name: 'Tonic Syrup'
        },
        amount: {
          display: '1/2',
          value: 0.5,
          unit: 'oz',
          fraction: { whole: 0, numerator: 1, denominator: 2 }
        },
        conversions: { toOz: 0.5, toMl: 14.79, toGram: 14.17 },
        pricing: {
          currency: 'USD',
          perUnit: 0,
          perOz: null,
          perMl: null,
          perGram: 0
        },
        extendedCost: 0,
        notes: ''
      },
      {
        order: 7,
        inventoryKey: 'preMix:692ca60d8e3f65deb3a94e32',
        ingredient: {
          sheetKey: 'preMix',
          rowId: '692ca60d8e3f65deb3a94e32',
          name: 'Lime Acid'
        },
        amount: {
          display: '1/2',
          value: 0.5,
          unit: 'oz',
          fraction: { whole: 0, numerator: 1, denominator: 2 }
        },
        conversions: { toOz: 0.5, toMl: 14.79, toGram: 14.17 },
        pricing: {
          currency: 'USD',
          perUnit: null,
          perOz: 0.03,
          perMl: null,
          perGram: null
        },
        extendedCost: 0.015,
        notes: ''
      }
    ];

    // Calculate totals
    const totalVolumeOz = recipe.items.reduce((sum, item) => sum + (item.conversions?.toOz || 0), 0);
    const totalCost = recipe.items.reduce((sum, item) => sum + (item.extendedCost || 0), 0);
    
    recipe.totals = {
      volumeOz: Number(totalVolumeOz.toFixed(3)),
      costEach: Number(totalCost.toFixed(2))
    };

    recipe.batch = { size: 0, unit: 'oz', yieldCount: 0 };
    recipe.notes = '';
    recipe.batchNotes = '';

    // Mark arrays as modified for Mongoose
    recipe.markModified('items');
    recipe.markModified('totals');
    recipe.markModified('metadata');
    recipe.markModified('batch');

    await recipe.save();

    console.log('\n✅ Recipe updated successfully!');
    console.log(`   Recipe ID: ${recipe._id}`);
    console.log(`   Title: ${recipe.title}`);
    console.log(`   Items: ${recipe.items.length}`);
    console.log(`   Total Volume: ${recipe.totals.volumeOz} oz`);
    console.log(`   Total Cost: $${recipe.totals.costEach.toFixed(2)}`);
    console.log(`   Background Color: ${recipe.backgroundColor}`);
    console.log(`   Ice: ${recipe.metadata.ice || 'N/A'}`);
    console.log(`   Garnish: ${recipe.metadata.garnish || 'N/A'}`);
    console.log(`   Type: ${recipe.metadata.type || 'N/A'}`);
    console.log('\n📋 Ingredients:');
    recipe.items.forEach((item, idx) => {
      console.log(`   ${idx + 1}. ${item.ingredient.name}: ${item.amount.display} ${item.amount.unit}`);
    });

    process.exit(0);
  } catch (error) {
    console.error('❌ Error updating recipe:', error);
    process.exit(1);
  }
}

// Run update
updateLavenderGandTRecipe();

