// Import + re-export strict Cloudinary URL validator for shared use.
// NOTE: `export { x } from '...'` does not create a local binding, so we must import it
// to use it within this module.
import { isCloudinaryUrl } from '../components/CloudinaryAsset';
export { isCloudinaryUrl };

/**
 * Generates an optimized Cloudinary URL with transformations
 * @param {string} url - The original Cloudinary URL
 * @param {object} options - Transformation options
 * @param {number} options.width - Maximum width in pixels
 * @param {string} options.crop - Crop mode (default: 'scale')
 * @param {string} options.quality - Quality setting (default: 'auto')
 * @param {string} options.format - Format setting (default: 'auto')
 * @returns {string} - Optimized Cloudinary URL with transformations
 */
export function getOptimizedCloudinaryUrl(url, options = {}) {
  if (!isCloudinaryUrl(url)) {
    return url; // Return original URL if not a Cloudinary URL
  }

  const {
    width,
    crop = 'scale',
    quality = 'auto',
    format = 'auto'
  } = options;

  // Remove any existing query parameters or hash
  const cleanUrl = url.split('?')[0].split('#')[0];
  
  // Parse the URL
  // Cloudinary URLs have format: https://res.cloudinary.com/{cloud}/{resource_type}/upload/{transformations}/{public_id}.{format}
  const urlObj = new URL(cleanUrl);
  const pathParts = urlObj.pathname.split('/').filter(p => p); // Remove empty strings
  
  const uploadIndex = pathParts.indexOf('upload');
  
  if (uploadIndex === -1) {
    return url; // Invalid Cloudinary URL structure
  }

  // Build transformation parameters
  const transformations = [];
  
  if (width) {
    transformations.push(`w_${width}`);
  }
  
  if (crop && crop !== 'none') {
    transformations.push(`c_${crop}`);
  }
  
  if (quality) {
    transformations.push(`q_${quality}`);
  }
  
  if (format) {
    transformations.push(`f_${format}`);
  }

  // If no transformations, return original URL
  if (transformations.length === 0) {
    return url;
  }

  // Check if there are already transformations (they would be between 'upload' and the public_id)
  // If uploadIndex + 1 exists and doesn't look like a public_id (no file extension), it might be transformations
  // For simplicity, we'll insert our transformations after 'upload'
  const transformationString = transformations.join(',');
  
  // Insert transformation string after 'upload'
  const newPathParts = [...pathParts];
  newPathParts.splice(uploadIndex + 1, 0, transformationString);
  urlObj.pathname = '/' + newPathParts.join('/');

  return urlObj.toString();
}

/**
 * Convenience functions for common optimization scenarios
 */

/**
 * Get optimized URL for hero gallery (1000px width, best quality)
 */
export function getHeroOptimizedUrl(url) {
  return getOptimizedCloudinaryUrl(url, {
    width: 1000,
    crop: 'scale',
    quality: 'auto',
    format: 'auto'
  });
}

/**
 * Get optimized URL for event gallery (500px width, best quality)
 */
export function getEventOptimizedUrl(url) {
  return getOptimizedCloudinaryUrl(url, {
    width: 500,
    crop: 'scale',
    quality: 'auto',
    format: 'auto'
  });
}

/**
 * Get optimized URL for about section (1000px width, best quality)
 */
export function getAboutOptimizedUrl(url) {
  return getOptimizedCloudinaryUrl(url, {
    width: 1000,
    crop: 'scale',
    quality: 'auto',
    format: 'auto'
  });
}
