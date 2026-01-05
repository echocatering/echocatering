const mongoose = require('mongoose');
const InventoryDataset = require('../../server/models/InventoryDataset');
require('dotenv').config();

const toTitleCase = (text) => {
  if (!text || typeof text !== 'string') return text;
  const trimmed = text.trim();
  if (!trimmed) return trimmed;
  return trimmed
    .split(/\s+/)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
};

const addBeerTypes = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/echo-catering', {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('✅ Connected to MongoDB');

    const beerTypes = [
      'Ale', 'Lager', 'Pale Ale', 'India Pale Ale (IPA)', 'Double IPA', 'Triple IPA', 'Session IPA',
      'New England IPA (NEIPA)', 'West Coast IPA', 'Belgian IPA', 'Amber Ale', 'Red Ale', 'Irish Red Ale',
      'American Amber Ale', 'Brown Ale', 'English Brown Ale', 'American Brown Ale', 'Dark Ale', 'Blonde Ale',
      'Golden Ale', 'Wheat Ale', 'Hefeweizen', 'Witbier', 'Belgian Wit', 'Berliner Weisse', 'Gose',
      'Sour Ale', 'Lambic', 'Gueuze', 'Kriek', 'Framboise', 'Flanders Red Ale', 'Flanders Brown Ale',
      'Saison', 'Farmhouse Ale', 'Biere de Garde', 'Scotch Ale', 'Wee Heavy', 'Barleywine',
      'English Barleywine', 'American Barleywine', 'Mild Ale', 'English Mild', 'Porter', 'Robust Porter',
      'Baltic Porter', 'Stout', 'Dry Stout', 'Sweet Stout', 'Oatmeal Stout', 'Milk Stout', 'Imperial Stout',
      'Foreign Extra Stout', 'Coffee Stout', 'Chocolate Stout', 'Schwarzbier', 'Rauchbier', 'Bock',
      'Doppelbock', 'Eisbock', 'Maibock', 'Helles Bock', 'Traditional Bock', 'Munich Helles',
      'American Light Lager', 'American Lager', 'Pilsner', 'German Pilsner', 'Czech Pilsner', 'Vienna Lager',
      'Märzen', 'Oktoberfest', 'Dunkel', 'Kellerbier', 'Helles', 'Cream Ale', 'Altbier', 'Kölsch',
      'American Pale Lager', 'Steam Beer / California Common', 'Hybrid Beers', 'Experimental Beers',
      'Specialty Flavored Beers', 'Gluten-Free Beer'
    ];

    console.log(`\n📋 Adding ${beerTypes.length} beer types to dataset...\n`);

    // Find or create the beer.type dataset
    let dataset = await InventoryDataset.findById('beer.type');
    
    if (!dataset) {
      // Create the dataset if it doesn't exist
      dataset = new InventoryDataset({
        _id: 'beer.type',
        label: 'Beer Type',
        values: [],
        linkedColumns: []
      });
      await dataset.save();
      console.log('✅ Created beer.type dataset');
    }

    // Convert beer types to dataset format
    const existingValues = new Set((dataset.values || []).map(v => v.value.toLowerCase()));
    const newValues = beerTypes
      .map(type => {
        const value = toTitleCase(type);
        return { value, label: value };
      })
      .filter(item => !existingValues.has(item.value.toLowerCase()));

    if (newValues.length > 0) {
      dataset.values = [...(dataset.values || []), ...newValues];
      // Sort alphabetically
      dataset.values.sort((a, b) => {
        const aLabel = (a.label || a.value || '').toLowerCase();
        const bLabel = (b.label || b.value || '').toLowerCase();
        return aLabel.localeCompare(bLabel);
      });
      await dataset.save();
      console.log(`✅ Added ${newValues.length} new beer types`);
      console.log(`   Total beer types: ${dataset.values.length}`);
    } else {
      console.log(`✅ All beer types already exist (${dataset.values.length} total)`);
    }

    console.log('\n📊 Beer types in dataset:');
    dataset.values.forEach((type, index) => {
      console.log(`   ${index + 1}. ${type.label}`);
    });

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.disconnect();
  }
};

addBeerTypes();

