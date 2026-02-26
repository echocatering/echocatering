const mongoose = require('mongoose');

/**
 * CateringEvent Model
 * Tracks catering events with full financial, inventory, and sales data.
 * Supports three payment models: consumption, flat_fee, hybrid.
 */

const inventoryItemSchema = new mongoose.Schema({
  name: { type: String, required: true },
  category: { type: String, default: 'spirits' },
  unitsPrepared: { type: Number, default: 0 },
  unitsReturned: { type: Number, default: 0 },
  unitsUsed: { type: Number, default: 0 }
}, { _id: false });

const glasswareSchema = new mongoose.Schema({
  type: { type: String, enum: ['ROX', 'TMBL'], required: true },
  sent: { type: Number, default: 0 },
  returnedClean: { type: Number, default: 0 },
  returnedDirty: { type: Number, default: 0 },
  broken: { type: Number, default: 0 }
}, { _id: false });

const drinkSaleSchema = new mongoose.Schema({
  name: { type: String, required: true },
  category: {
    type: String,
    enum: ['cocktails', 'mocktails', 'beer', 'wine', 'spirits', 'other'],
    default: 'other'
  },
  quantity: { type: Number, default: 0, min: 0 },
  unitPrice: { type: Number, default: 0, min: 0 },
  revenue: { type: Number, default: 0 }
}, { _id: true });

const timelineEntrySchema = new mongoose.Schema({
  intervalStart: { type: Date, required: true },
  intervalEnd: { type: Date, required: true },
  items: [{
    name: String,
    category: String,
    quantity: Number
  }]
}, { _id: false });

const cateringEventSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  date: { type: Date, required: true },
  startTime: { type: String, default: '' },
  endTime: { type: String, default: '' },
  venue: { type: String, default: '' },
  clientName: { type: String, default: '' },
  notes: { type: String, default: '' },

  // Guest & duration info
  guestCount: { type: Number, default: 0, min: 0 },
  durationHours: { type: Number, default: 0, min: 0 },

  // Payment model
  paymentModel: {
    type: String,
    enum: ['consumption', 'flat_fee', 'hybrid'],
    default: 'consumption'
  },

  // Flat fee / hybrid config
  flatFeeConfig: {
    baseRate: { type: Number, default: 0 },          // $ per guest for first block
    baseHours: { type: Number, default: 2 },          // hours covered by base rate
    drinksPerGuestPerHour: { type: Number, default: 2.5 }, // drinks/guest/hr for base block
    additionalDrinksPerHour: { type: Number, default: 1 }, // drinks/guest/hr for extra hours
    pricePerExtraDrink: { type: Number, default: 0 }  // for hybrid overage
  },

  // Financials (manually entered or auto-calculated)
  totalSales: { type: Number, default: 0 },
  totalTips: { type: Number, default: 0 },
  totalCost: { type: Number, default: 0 },
  accommodationCost: { type: Number, default: 0 }, // $ Accommodation
  travelCost: { type: Number, default: 0 },      // $ Transportation
  permitCost: { type: Number, default: 0 },      // $ Permit
  insuranceCost: { type: Number, default: 0 },   // $ Insurance
  laborCost: { type: Number, default: 0 },       // $ Labor (total)
  spillageCost: { type: Number, default: 0 },    // $ Spillage (using costPerUnit)
  taxesCost: { type: Number, default: 0 },       // $ Taxes
  cogsCost: { type: Number, default: 0 },        // $ COGS (cost of goods sold)
  totalRevenue: { type: Number, default: 0 },    // sales + tips
  totalProfit: { type: Number, default: 0 },     // revenue - all costs
  totalLoss: { type: Number, default: 0 },       // if negative profit
  netIncome: { type: Number, default: 0 },       // final income after all deductions
  
  // Labor breakdown
  laborDetails: [{
    title: { type: String, default: '' },
    rate: { type: Number, default: 0 },
    hours: { type: Number, default: 0 },
    total: { type: Number, default: 0 }
  }],
  
  // Spillage items (items wasted)
  spillageItems: [{
    name: { type: String },
    category: { type: String },
    quantity: { type: Number, default: 0 },
    costPerUnit: { type: Number, default: 0 },
    totalCost: { type: Number, default: 0 }
  }],

  // Drink sales breakdown (items sold)
  drinkSales: [drinkSaleSchema],

  // Inventory tracking
  bottlesPrepped: [inventoryItemSchema],
  glassware: [glasswareSchema],
  iceBlocksBrought: { type: Number, default: 0 },
  iceBlocksReturned: { type: Number, default: 0 },

  // Timeline data (for chart - 15-min intervals)
  timeline: [timelineEntrySchema],

  // Linked POS event (if synced from POS)
  posEventId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'PosEvent',
    default: null
  },

  status: {
    type: String,
    enum: ['draft', 'active', 'completed', 'cancelled'],
    default: 'draft'
  },

  // Event number for unique identification
  eventNumber: {
    type: Number,
    unique: true,
    sparse: true
  },

  // POS state saves - rolling backup array (keeps last 5 saves)
  posSaves: [{
    saveNumber: { type: Number, required: true },
    tabs: { type: mongoose.Schema.Types.Mixed, default: [] },
    eventSetupData: { type: mongoose.Schema.Types.Mixed, default: {} },
    uiState: { type: mongoose.Schema.Types.Mixed, default: {} },
    savedAt: { type: Date, default: Date.now },
    reason: { type: String, default: 'auto' } // 'auto-5min', 'item-added', 'payment-complete', etc.
  }],
  
  // Track the next save number for this event
  nextSaveNumber: { type: Number, default: 1 }
}, {
  timestamps: true
});

cateringEventSchema.index({ date: -1 });
cateringEventSchema.index({ status: 1 });

/**
 * Calculate financials based on payment model before saving.
 */
cateringEventSchema.methods.recalculate = function () {
  const drinkRevenue = this.drinkSales.reduce((sum, d) => {
    d.revenue = d.quantity * d.unitPrice;
    return sum + d.revenue;
  }, 0);

  if (this.paymentModel === 'consumption') {
    this.totalSales = drinkRevenue;
  } else if (this.paymentModel === 'flat_fee') {
    const cfg = this.flatFeeConfig;
    const baseDrinks = this.guestCount * cfg.drinksPerGuestPerHour * cfg.baseHours;
    const extraHours = Math.max(0, this.durationHours - cfg.baseHours);
    const extraDrinks = this.guestCount * cfg.additionalDrinksPerHour * extraHours;
    const totalCoveredDrinks = baseDrinks + extraDrinks;
    this.totalSales = this.guestCount * cfg.baseRate + extraDrinks * (cfg.pricePerExtraDrink || 0);
    this._coveredDrinks = totalCoveredDrinks;
  } else if (this.paymentModel === 'hybrid') {
    const cfg = this.flatFeeConfig;
    const baseDrinks = this.guestCount * cfg.drinksPerGuestPerHour * cfg.baseHours;
    const extraHours = Math.max(0, this.durationHours - cfg.baseHours);
    const coveredDrinks = baseDrinks + this.guestCount * cfg.additionalDrinksPerHour * extraHours;
    const totalDrinksSold = this.drinkSales.reduce((s, d) => s + d.quantity, 0);
    const overageDrinks = Math.max(0, totalDrinksSold - coveredDrinks);
    const flatBase = this.guestCount * cfg.baseRate;
    const overage = overageDrinks * cfg.pricePerExtraDrink;
    this.totalSales = flatBase + overage;
  }

  this.totalRevenue = this.totalSales + this.totalTips;
  
  // Calculate total costs
  const totalExpenses = (this.travelCost || 0) + 
    (this.permitCost || 0) + 
    (this.insuranceCost || 0) + 
    (this.laborCost || 0) + 
    (this.spillageCost || 0) + 
    (this.taxesCost || 0) + 
    (this.cogsCost || 0);
  
  this.totalCost = totalExpenses;
  this.netIncome = this.totalRevenue - totalExpenses;
  this.totalProfit = Math.max(0, this.netIncome);
  this.totalLoss = Math.max(0, -this.netIncome);
};

module.exports = mongoose.model('CateringEvent', cateringEventSchema);
