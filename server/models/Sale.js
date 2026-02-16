const mongoose = require('mongoose');

/**
 * Sale Model - Records all POS transactions from Stripe Terminal
 * Designed for analytics and reporting in the admin/sales dashboard
 */

const saleItemSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true
  },
  category: {
    type: String,
    default: 'uncategorized'
  },
  quantity: {
    type: Number,
    required: true,
    min: 1,
    default: 1
  },
  unitPrice: {
    type: Number,
    required: true,
    min: 0
  },
  modifier: {
    type: String,
    default: null
  },
  modifierPriceAdjustment: {
    type: Number,
    default: 0
  }
}, { _id: true });

const saleSchema = new mongoose.Schema({
  // Stripe identifiers
  stripePaymentIntentId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  stripeChargeId: {
    type: String,
    default: null
  },
  
  // Event association (links to POS events)
  eventId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'PosEvent',
    default: null,
    index: true
  },
  eventName: {
    type: String,
    default: null
  },
  
  // Tab information
  tabId: {
    type: String,
    default: null
  },
  tabName: {
    type: String,
    default: null
  },
  
  // Items sold
  items: [saleItemSchema],
  
  // Financial details (all in cents for precision)
  subtotalCents: {
    type: Number,
    required: true,
    min: 0
  },
  tipCents: {
    type: Number,
    default: 0,
    min: 0
  },
  taxCents: {
    type: Number,
    default: 0,
    min: 0
  },
  totalCents: {
    type: Number,
    required: true,
    min: 0
  },
  
  // Convenience fields in dollars (computed)
  subtotal: {
    type: Number,
    get: function() { return this.subtotalCents / 100; }
  },
  tip: {
    type: Number,
    get: function() { return this.tipCents / 100; }
  },
  tax: {
    type: Number,
    get: function() { return this.taxCents / 100; }
  },
  total: {
    type: Number,
    get: function() { return this.totalCents / 100; }
  },
  
  // Payment details
  paymentMethod: {
    type: String,
    enum: ['card_present', 'card', 'cash', 'other'],
    default: 'card_present'
  },
  cardBrand: {
    type: String,
    default: null
  },
  cardLast4: {
    type: String,
    default: null
  },
  
  // Status
  status: {
    type: String,
    enum: ['pending', 'succeeded', 'failed', 'refunded', 'partially_refunded'],
    default: 'pending',
    index: true
  },
  
  // Refund tracking
  refundedCents: {
    type: Number,
    default: 0,
    min: 0
  },
  refundReason: {
    type: String,
    default: null
  },
  
  // Receipt
  receiptUrl: {
    type: String,
    default: null
  },
  
  // Metadata
  currency: {
    type: String,
    default: 'usd',
    lowercase: true
  },
  readerId: {
    type: String,
    default: null
  },
  locationId: {
    type: String,
    default: null
  },
  
  // Timestamps
  completedAt: {
    type: Date,
    default: null
  }
}, {
  timestamps: true,
  toJSON: { getters: true },
  toObject: { getters: true }
});

// Indexes for analytics queries
saleSchema.index({ createdAt: -1 });
saleSchema.index({ status: 1, createdAt: -1 });
saleSchema.index({ eventId: 1, createdAt: -1 });
saleSchema.index({ 'items.category': 1, createdAt: -1 });

// Virtual for item count
saleSchema.virtual('itemCount').get(function() {
  return this.items.reduce((sum, item) => sum + item.quantity, 0);
});

// Static method: Get sales summary for a date range
saleSchema.statics.getSummary = async function(startDate, endDate, eventId = null) {
  const match = {
    status: 'succeeded',
    createdAt: { $gte: startDate, $lte: endDate }
  };
  if (eventId) {
    match.eventId = new mongoose.Types.ObjectId(eventId);
  }
  
  const result = await this.aggregate([
    { $match: match },
    {
      $group: {
        _id: null,
        totalSales: { $sum: '$totalCents' },
        totalTips: { $sum: '$tipCents' },
        totalTax: { $sum: '$taxCents' },
        transactionCount: { $sum: 1 },
        itemsSold: { $sum: { $size: '$items' } }
      }
    }
  ]);
  
  if (result.length === 0) {
    return {
      totalSales: 0,
      totalTips: 0,
      totalTax: 0,
      transactionCount: 0,
      itemsSold: 0
    };
  }
  
  return {
    totalSales: result[0].totalSales / 100,
    totalTips: result[0].totalTips / 100,
    totalTax: result[0].totalTax / 100,
    transactionCount: result[0].transactionCount,
    itemsSold: result[0].itemsSold
  };
};

// Static method: Get sales by category
saleSchema.statics.getSalesByCategory = async function(startDate, endDate, eventId = null) {
  const match = {
    status: 'succeeded',
    createdAt: { $gte: startDate, $lte: endDate }
  };
  if (eventId) {
    match.eventId = new mongoose.Types.ObjectId(eventId);
  }
  
  return this.aggregate([
    { $match: match },
    { $unwind: '$items' },
    {
      $group: {
        _id: '$items.category',
        quantity: { $sum: '$items.quantity' },
        revenue: { $sum: { $multiply: ['$items.unitPrice', '$items.quantity'] } }
      }
    },
    { $sort: { revenue: -1 } }
  ]);
};

// Static method: Get top selling items
saleSchema.statics.getTopItems = async function(startDate, endDate, limit = 10, eventId = null) {
  const match = {
    status: 'succeeded',
    createdAt: { $gte: startDate, $lte: endDate }
  };
  if (eventId) {
    match.eventId = new mongoose.Types.ObjectId(eventId);
  }
  
  return this.aggregate([
    { $match: match },
    { $unwind: '$items' },
    {
      $group: {
        _id: '$items.name',
        category: { $first: '$items.category' },
        quantity: { $sum: '$items.quantity' },
        revenue: { $sum: { $multiply: ['$items.unitPrice', '$items.quantity'] } }
      }
    },
    { $sort: { quantity: -1 } },
    { $limit: limit }
  ]);
};

// Static method: Get hourly sales breakdown
saleSchema.statics.getHourlySales = async function(date, eventId = null) {
  const startOfDay = new Date(date);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(date);
  endOfDay.setHours(23, 59, 59, 999);
  
  const match = {
    status: 'succeeded',
    createdAt: { $gte: startOfDay, $lte: endOfDay }
  };
  if (eventId) {
    match.eventId = new mongoose.Types.ObjectId(eventId);
  }
  
  return this.aggregate([
    { $match: match },
    {
      $group: {
        _id: { $hour: '$createdAt' },
        sales: { $sum: '$totalCents' },
        transactions: { $sum: 1 }
      }
    },
    { $sort: { _id: 1 } }
  ]);
};

module.exports = mongoose.model('Sale', saleSchema);
