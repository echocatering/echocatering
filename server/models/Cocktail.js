const mongoose = require('mongoose');

const SECTION_OPTIONS = ['cocktails', 'mocktails', 'beer', 'wine', 'spirits', 'premix'];
const STATUS_OPTIONS = ['active', 'archived'];

const cocktailSchema = new mongoose.Schema({
  // Stable numeric identifier used for filenames and ordering across systems
  itemNumber: {
    type: Number,
    required: false,
    unique: true,
    sparse: true
  },
  name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 100
  },
  videoFile: {
    type: String,
    required: false,
    trim: true,
    default: ''
  },
  // Stage pipeline media
  stage1File: {
    type: String,
    default: ''
  },
  stage2File: {
    type: String,
    default: ''
  },
  backgroundFile: {
    type: String,
    default: ''
  },
  filterParams: {
    type: Object,
    default: {}
  },
  concept: {
    type: String,
    required: false,
    maxlength: 1000,
    default: ''
  },
  ingredients: {
    type: String,
    required: false,
    maxlength: 1000,
    default: ''
  },
  globalIngredients: {
    type: String,
    required: false,
    maxlength: 500,
    default: ''
  },
  garnish: {
    type: String,
    required: false,
    maxlength: 500,
    default: ''
  },
  narrative: {
    type: String,
    required: false,
    maxlength: 1000,
    default: ''
  },
  regions: {
    type: [String],
    default: []
  },
  category: {
    type: String,
    enum: SECTION_OPTIONS,
    required: false,
    default: 'cocktails'
  },
  status: {
    type: String,
    enum: STATUS_OPTIONS,
    default: 'active'
  },
  archivedAt: {
    type: Date,
    default: null
  },
  mapSnapshotFile: {
    type: String,
    default: ''
  },
  itemId: {
    type: String,
    required: false,
    unique: true,
    sparse: true,
    trim: true,
    index: true
  },
  order: {
    type: Number,
    default: 0
  },
  isActive: {
    type: Boolean,
    default: true
  },
  featured: {
    type: Boolean,
    default: false
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Index for efficient queries
cocktailSchema.index({ category: 1, order: 1 });
cocktailSchema.index({ isActive: 1 });
cocktailSchema.index({ status: 1 });
// Guardrail: itemNumber should be unique, but keep sparse to allow migration
cocktailSchema.index({ itemNumber: 1 }, { unique: true, sparse: true });

// Virtual for full video path
cocktailSchema.virtual('videoPath').get(function() {
  return `/uploads/items/${this.videoFile}`;
});

cocktailSchema.virtual('videoUrl').get(function() {
  return this.videoFile ? `/menu-items/${this.videoFile}` : '';
});

cocktailSchema.virtual('mapSnapshotPath').get(function() {
  return this.mapSnapshotFile ? `/uploads/items/${this.mapSnapshotFile}` : '';
});

cocktailSchema.virtual('mapSnapshotUrl').get(function() {
  return this.mapSnapshotFile ? `/menu-items/${this.mapSnapshotFile}` : '';
});

// Ensure virtuals are included in JSON output
cocktailSchema.set('toJSON', { virtuals: true });

module.exports = mongoose.model('Cocktail', cocktailSchema);


