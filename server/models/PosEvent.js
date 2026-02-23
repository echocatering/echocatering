/**
 * PosEvent.js
 * 
 * MongoDB model for POS events and their associated tabs/items.
 * 
 * This model stores completed POS events for historical records and analytics.
 * The local UI is the source of truth during an active event, and data is
 * synced to this model when the event ends.
 * 
 * Key design decisions:
 * - Base prices are stored with each item at the time of addition for historical accuracy
 * - Modifiers and their price adjustments are stored per item
 * - Timestamps are preserved for timeline aggregation
 * - Tab structure mirrors the local UI state for easy sync
 */

const mongoose = require('mongoose');

// Schema for individual items within a tab
const PosItemSchema = new mongoose.Schema({
  // Reference to the menu item (for linking back to current item data)
  menuItemId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Cocktail',
    required: false
  },
  // Item details at time of sale (historical accuracy)
  name: {
    type: String,
    required: true
  },
  category: {
    type: String,
    required: true
  },
  // Base price from DB at time of addition
  basePrice: {
    type: Number,
    required: true,
    default: 0
  },
  // Modifier applied (if any)
  modifier: {
    type: String,
    default: null
  },
  // Modifier price adjustment
  modifierPriceAdjustment: {
    type: Number,
    default: 0
  },
  // Final price (basePrice + modifierPriceAdjustment)
  finalPrice: {
    type: Number,
    required: true,
    default: 0
  },
  // Timestamp when item was added to the tab
  addedAt: {
    type: Date,
    required: true,
    default: Date.now
  },
  // Quantity (for future use, currently always 1)
  quantity: {
    type: Number,
    default: 1
  }
}, { _id: true });

// Schema for tabs within an event
const PosTabSchema = new mongoose.Schema({
  // Local tab ID (preserved from UI)
  localId: {
    type: String,
    required: true
  },
  // Tab display name (e.g., "S1", "S2", or custom name)
  name: {
    type: String,
    required: true
  },
  // Items in this tab
  items: [PosItemSchema],
  // Tab status
  status: {
    type: String,
    enum: ['open', 'closed', 'voided'],
    default: 'closed'
  },
  // Tab totals (calculated on sync)
  subtotal: {
    type: Number,
    default: 0
  },
  itemCount: {
    type: Number,
    default: 0
  },
  // Tip amount for this tab (added when payment completes)
  tipAmount: {
    type: Number,
    default: 0
  },
  // Timestamps
  createdAt: {
    type: Date,
    default: Date.now
  },
  closedAt: {
    type: Date,
    default: null
  }
}, { _id: true });

// Main POS Event schema
const PosEventSchema = new mongoose.Schema({
  // Event name/identifier
  name: {
    type: String,
    required: true,
    trim: true
  },
  // Event date
  date: {
    type: Date,
    required: true,
    default: Date.now
  },
  // Event status
  status: {
    type: String,
    enum: ['active', 'ended', 'cancelled'],
    default: 'active'
  },
  // All tabs for this event
  tabs: [PosTabSchema],
  // Event-level aggregations (calculated on end)
  summary: {
    totalRevenue: {
      type: Number,
      default: 0
    },
    totalTips: {
      type: Number,
      default: 0
    },
    totalItems: {
      type: Number,
      default: 0
    },
    totalTabs: {
      type: Number,
      default: 0
    },
    // Items per category
    categoryBreakdown: {
      type: Map,
      of: {
        count: Number,
        revenue: Number
      },
      default: {}
    },
    // 15-minute interval breakdown
    timelineBreakdown: [{
      intervalStart: Date,
      intervalEnd: Date,
      itemCount: Number,
      revenue: Number
    }]
  },
  // Timestamps
  startedAt: {
    type: Date,
    default: Date.now
  },
  endedAt: {
    type: Date,
    default: null
  }
}, {
  timestamps: true
});

// Index for efficient queries
PosEventSchema.index({ date: -1 });
PosEventSchema.index({ status: 1 });
PosEventSchema.index({ 'tabs.localId': 1 });

// Method to calculate summary aggregations
PosEventSchema.methods.calculateSummary = function() {
  let totalRevenue = 0;
  let totalTips = 0;
  let totalItems = 0;
  const categoryBreakdown = new Map();
  const timelineMap = new Map();

  this.tabs.forEach(tab => {
    // Add tip amount from this tab
    totalTips += tab.tipAmount || 0;
    
    tab.items.forEach(item => {
      totalItems += item.quantity || 1;
      totalRevenue += (item.finalPrice || 0) * (item.quantity || 1);

      // Category breakdown
      const cat = item.category || 'other';
      if (!categoryBreakdown.has(cat)) {
        categoryBreakdown.set(cat, { count: 0, revenue: 0 });
      }
      const catData = categoryBreakdown.get(cat);
      catData.count += item.quantity || 1;
      catData.revenue += (item.finalPrice || 0) * (item.quantity || 1);

      // Timeline breakdown (15-minute intervals)
      const addedAt = new Date(item.addedAt);
      const intervalStart = new Date(addedAt);
      intervalStart.setMinutes(Math.floor(intervalStart.getMinutes() / 15) * 15, 0, 0);
      const intervalKey = intervalStart.toISOString();

      if (!timelineMap.has(intervalKey)) {
        const intervalEnd = new Date(intervalStart);
        intervalEnd.setMinutes(intervalEnd.getMinutes() + 15);
        timelineMap.set(intervalKey, {
          intervalStart,
          intervalEnd,
          itemCount: 0,
          revenue: 0
        });
      }
      const intervalData = timelineMap.get(intervalKey);
      intervalData.itemCount += item.quantity || 1;
      intervalData.revenue += (item.finalPrice || 0) * (item.quantity || 1);
    });
  });

  // Sort timeline by interval start
  const timelineBreakdown = Array.from(timelineMap.values())
    .sort((a, b) => a.intervalStart - b.intervalStart);

  this.summary = {
    totalRevenue,
    totalTips,
    totalItems,
    totalTabs: this.tabs.length,
    categoryBreakdown,
    timelineBreakdown
  };

  return this.summary;
};

module.exports = mongoose.model('PosEvent', PosEventSchema);
