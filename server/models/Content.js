const mongoose = require('mongoose');

const contentSchema = new mongoose.Schema({
  page: {
    type: String,
    required: true,
    trim: true,
    enum: ['home', 'echo-originals', 'echo-classics', 'spirits', 'event-gallery', 'about', 'global']
  },
  section: {
    type: String,
    required: true,
    trim: true,
    maxlength: 100
  },
  type: {
    type: String,
    enum: ['text', 'html', 'image', 'video', 'info-box', 'hero', 'footer', 'logo'],
    default: 'text'
  },
  title: {
    type: String,
    trim: true,
    maxlength: 200
  },
  altText: {
    type: String,
    trim: true,
    maxlength: 200
  },
  content: {
    type: String,
    required: false,
    maxlength: 10000
  },
  position: {
    type: String,
    enum: ['left', 'right', 'center', 'top', 'bottom'],
    default: 'center'
  },
  order: {
    type: Number,
    default: 0
  },
  isActive: {
    type: Boolean,
    default: true
  },
  metadata: {
    type: Map,
    of: String
  },
  styles: {
    backgroundColor: String,
    textColor: String,
    fontSize: String,
    fontWeight: String,
    padding: String,
    margin: String,
    borderRadius: String,
    border: String,
    boxShadow: String
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

// Indexes for efficient queries
contentSchema.index({ page: 1, section: 1 });
contentSchema.index({ page: 1, order: 1 });
contentSchema.index({ isActive: 1 });
contentSchema.index({ type: 1 });

// Compound index for unique content per page/section
contentSchema.index({ page: 1, section: 1, type: 1 }, { unique: true });

module.exports = mongoose.model('Content', contentSchema);


