const mongoose = require('mongoose');

const gallerySchema = new mongoose.Schema({
  filename: {
    type: String,
    required: true,
    trim: true
  },
  originalName: {
    type: String,
    required: true,
    trim: true
  },
  title: {
    type: String,
    trim: true,
    maxlength: 200
  },
  description: {
    type: String,
    maxlength: 500
  },
  category: {
    type: String,
    enum: ['hero', 'gallery', 'footer', 'events', 'food', 'cocktails'],
    default: 'gallery'
  },
  tags: [{
    type: String,
    trim: true,
    maxlength: 50
  }],
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
  fileSize: {
    type: Number
  },
  mimeType: {
    type: String
  },
  dimensions: {
    width: Number,
    height: Number
  },
  altText: {
    type: String,
    maxlength: 200
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
gallerySchema.index({ category: 1, order: 1 });
gallerySchema.index({ isActive: 1 });
gallerySchema.index({ featured: 1 });
gallerySchema.index({ tags: 1 });

// Virtual for full image path
gallerySchema.virtual('imagePath').get(function() {
  return `/gallery/${this.filename}`;
});

// Virtual for thumbnail path
gallerySchema.virtual('thumbnailPath').get(function() {
  const nameWithoutExt = this.filename.replace(/\.[^/.]+$/, '');
  return `/gallery/thumbnails/${nameWithoutExt}_thumb.jpg`;
});

// Ensure virtuals are included in JSON output
gallerySchema.set('toJSON', { virtuals: true });

module.exports = mongoose.model('Gallery', gallerySchema);


