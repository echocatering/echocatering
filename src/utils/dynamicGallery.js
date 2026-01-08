// Professional dynamic gallery system with server API integration
import { fetchGalleryImages } from './galleryUtils';

class DynamicGallery {
  constructor() {
    this.images = [];
    this.isLoaded = false;
    this.lastFetch = null;
    this.cacheTimeout = 5 * 60 * 1000; // 5 minutes cache
  }

  // Load images from the server with caching
  async loadImages(forceRefresh = false) {
    const now = Date.now();
    
    // Return cached images if they're still fresh
    if (!forceRefresh && this.isLoaded && this.lastFetch && (now - this.lastFetch) < this.cacheTimeout) {
      return this.images;
    }
    
    return await this._fetchImages();
  }

  // Fetch images from the server API
  async _fetchImages() {
    try {
      const images = await fetchGalleryImages();
      
      this.images = images;
      this.isLoaded = true;
      this.lastFetch = Date.now();
      return images;
    } catch (error) {
      console.error('❌ Gallery API not available:', error);
      this.isLoaded = false;
      throw error;
    }
  }

  // Get all images
  async getAllImages() {
    return await this.loadImages();
  }

  // Get a subset of images
  getSubset(start, count) {
    if (!this.isLoaded) {
      console.warn('Gallery not loaded yet, call loadImages() first');
      return [];
    }
    return this.images.slice(start, start + count);
  }

  // Get random subset of images
  getRandomSubset(count) {
    if (!this.isLoaded) {
      console.warn('Gallery not loaded yet, call loadImages() first');
      return [];
    }
    const shuffled = [...this.images].sort(() => 0.5 - Math.random());
    return shuffled.slice(0, count);
  }

  // Get hero images (all images)
  async getHeroImages() {
    return await this.loadImages(); // Return all images instead of limiting to 4
  }

  // Get footer images (first 4)
  async getFooterImages() {
    const images = await this.loadImages();
    return images.slice(0, 4);
  }

  // Refresh images (reload from server)
  async refresh() {
    this.isLoaded = false;
    return await this.loadImages(true);
  }

  // Get image by ID
  getImageById(id) {
    if (!this.isLoaded) {
      console.warn('Gallery not loaded yet, call loadImages() first');
      return null;
    }
    return this.images.find(img => img._id === id);
  }

  // Get images by category
  getImagesByCategory(category) {
    if (!this.isLoaded) {
      console.warn('Gallery not loaded yet, call loadImages() first');
      return [];
    }
    return this.images.filter(img => img.category === category);
  }

  // Get featured images
  getFeaturedImages() {
    if (!this.isLoaded) {
      console.warn('Gallery not loaded yet, call loadImages() first');
      return [];
    }
    return this.images.filter(img => img.featured);
  }
}

// Export singleton instance
const dynamicGallery = new DynamicGallery();
export default dynamicGallery;
