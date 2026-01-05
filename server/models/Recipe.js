const mongoose = require('mongoose');

const { Schema } = mongoose;

const FractionSchema = new Schema(
  {
    whole: { type: Number, default: 0 },
    numerator: { type: Number, default: 0 },
    denominator: { type: Number, default: 1 }
  },
  { _id: false }
);

const AmountSchema = new Schema(
  {
    display: { type: String, default: '' },
    value: { type: Number, default: 0 },
    unit: {
      type: String,
      default: 'oz'
    },
    fraction: { type: FractionSchema, default: () => ({}) }
  },
  { _id: false }
);

const PricingSnapshotSchema = new Schema(
  {
    currency: { type: String, default: 'USD' },
    perUnit: Number,
    perOz: Number,
    perMl: Number,
    perGram: Number
  },
  { _id: false }
);

const ConversionSchema = new Schema(
  {
    toOz: Number,
    toMl: Number,
    toGram: Number
  },
  { _id: false }
);

const RecipeItemSchema = new Schema(
  {
    order: { type: Number, default: 0 },
    inventoryKey: { type: String },
    ingredient: {
      sheetKey: { type: String },
      rowId: { type: String },
      name: { type: String }
    },
    amount: { type: AmountSchema, default: () => ({}) },
    conversions: { type: ConversionSchema, default: () => ({}) },
    pricing: { type: PricingSnapshotSchema, default: () => ({}) },
    extendedCost: { type: Number, default: 0 },
    notes: { type: String }
  },
  { _id: false }
);

const BatchSettingsSchema = new Schema(
  {
    size: { type: Number, default: 0 },
    unit: { type: String, enum: ['oz', 'ml'], default: 'oz' },
    yieldCount: { type: Number, default: 0 }
  },
  { _id: false }
);

const MetadataSchema = new Schema(
  {
    priceSet: Number,
    priceMin: Number,
    style: String,
    glassware: String,
    ice: String,
    garnish: String,
    type: String,
    cocktail: String
  },
  { _id: false }
);

const TotalsSchema = new Schema(
  {
    volumeOz: Number,
    costEach: Number
  },
  { _id: false }
);

const RecipeSchema = new Schema(
  {
    title: { type: String, required: true },
    type: { type: String, enum: ['cocktail', 'mocktail', 'premix', 'beer', 'wine', 'spirit'], required: true },
    itemNumber: { type: Number, required: false, sparse: true }, // Link to Cocktail/Inventory by itemNumber
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
  },
  { timestamps: true }
);

module.exports = mongoose.model('Recipe', RecipeSchema);

