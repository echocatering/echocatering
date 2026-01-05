// Professional dynamic gallery system with server API integration
import { fetchGalleryImages, getFallbackImages } from './galleryUtils';

class DynamicGallery {
  constructor() {
    this.images = [];
    this.isLoaded = false;
    this.lastFetch = null;
    this.cacheTimeout = 5 * 60 * 1000; // 5 minutes cache
  }

  // Load images from the server with caching
  async loadImages(forceRefresh = false) {
    console.log('🔍 DynamicGallery.loadImages() called, forceRefresh:', forceRefresh);
    const now = Date.now();
    
    // Return cached images if they're still fresh
    if (!forceRefresh && this.isLoaded && this.lastFetch && (now - this.lastFetch) < this.cacheTimeout) {
      console.log('📦 Using cached gallery images');
      return this.images;
    }
    
    console.log('🔍 Fetching fresh images from server...');
    return await this._fetchImages();
  }

  // Fetch images from the server API
  async _fetchImages() {
    try {
      console.log('🔄 Fetching gallery images from server...');
      console.log('🔍 About to call fetchGalleryImages()...');
      const images = await fetchGalleryImages();
      console.log('🔍 fetchGalleryImages() returned:', images);
      
      this.images = images;
      this.isLoaded = true;
      this.lastFetch = Date.now();
      
      console.log(`✅ Loaded ${images.length} gallery images`);
      return images;
    } catch (error) {
      console.warn('Gallery API not available, using fallback:', error);
      console.warn('Error details:', error.message);
      this.images = getFallbackImages();
      this.isLoaded = true;
      this.lastFetch = Date.now();
      return this.images;
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
    console.log('🔍 DynamicGallery.getHeroImages() called');
    const images = await this.loadImages();
    console.log('🔍 DynamicGallery.loadImages() returned:', images);
    console.log('🔍 Returning images:', images);
    return images; // Return all images instead of limiting to 4
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
