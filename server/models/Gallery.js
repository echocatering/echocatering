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
  photoNumber: {
    type: Number,
    unique: true,
    sparse: true
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
  // Cloudinary fields for image storage
  cloudinaryUrl: {
    type: String,
    default: ''
  },
  cloudinaryPublicId: {
    type: String,
    default: ''
  },
  thumbnailUrl: {
    type: String,
    default: ''
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

// Virtual for full image path - prefer Cloudinary URL if available
gallerySchema.virtual('imagePath').get(function() {
  // Prefer Cloudinary URL if available, fallback to local
  // Check for truthy value AND that it's not an empty string AND that it starts with http/https
  if (this.cloudinaryUrl && 
      this.cloudinaryUrl.trim() !== '' && 
      (this.cloudinaryUrl.startsWith('http://') || this.cloudinaryUrl.startsWith('https://'))) {
    return this.cloudinaryUrl;
  }
  return `/gallery/${this.filename}`;
});

// Virtual for thumbnail path - use Cloudinary transformation if available
gallerySchema.virtual('thumbnailPath').get(function() {
  // If cloudinaryPublicId exists, generate Cloudinary thumbnail URL
  if (this.cloudinaryPublicId && this.cloudinaryPublicId.trim() !== '') {
    try {
      const cloudinary = require('cloudinary').v2;
      // Only generate URL if Cloudinary is configured
      if (cloudinary.config().cloud_name) {
        return cloudinary.url(this.cloudinaryPublicId, {
          width: 200,
          height: 200,
          crop: 'fill',
          quality: 'auto',
          fetch_format: 'auto'
        });
      }
    } catch (error) {
      // Cloudinary not configured or error - fall through to use cloudinaryUrl or fallback
      console.warn('Cloudinary not configured for thumbnail generation:', error.message);
    }
  }
  
  // If we have a Cloudinary URL, use it directly (no transformation)
  if (this.cloudinaryUrl && 
      this.cloudinaryUrl.trim() !== '' && 
      this.cloudinaryUrl.startsWith('https://')) {
    return this.cloudinaryUrl;
  }
  
  // Fallback (should not be used with Cloudinary-only storage)
  const nameWithoutExt = this.filename.replace(/\.[^/.]+$/, '');
  return `/gallery/thumbnails/${nameWithoutExt}_thumb.jpg`;
});

// Ensure virtuals are included in JSON output
gallerySchema.set('toJSON', { virtuals: true });

module.exports = mongoose.model('Gallery', gallerySchema);


