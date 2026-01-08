// Professional gallery utility functions with server API integration

// Fetch gallery images from the server API
export const fetchGalleryImages = async () => {
  console.log('🔍 fetchGalleryImages: Starting fetch to /api/gallery...');
  const response = await fetch('/api/gallery');
  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  const images = await response.json();
  return images.map(img => ({
    ...img,
    src: img.imagePath || img.cloudinaryUrl,
    alt: img.title || img.originalName || 'Gallery image'
  }));
};

// Get all gallery images (async)
export const getGalleryImages = async () => {
  return await fetchGalleryImages();
};

// Get a subset of images for specific use cases (like footer)
export const getGalleryImagesSubset = async (count = 4) => {
  const allImages = await getGalleryImages();
  return allImages.slice(0, count);
};

// Get random subset of images
export const getRandomGalleryImages = async (count = 4) => {
  const allImages = await getGalleryImages();
  const shuffled = [...allImages].sort(() => 0.5 - Math.random());
  return shuffled.slice(0, count);
};

// Get images for hero rotation (all images)
export const getHeroImages = async () => {
  return await getGalleryImages(); // Return all images instead of subset
};

// Dynamic function to get all images (primary method)
export const getAllGalleryImages = async () => {
  return await getGalleryImages();
};
