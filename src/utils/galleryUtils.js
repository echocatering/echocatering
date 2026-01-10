// Professional gallery utility functions with server API integration

// Fetch gallery images from the server API
export const fetchGalleryImages = async () => {
  // Cloudinary is the source of truth for gallery media
  const response = await fetch('/api/media/gallery');
  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  const images = await response.json();
  return images.map((item) => ({
    ...item,
    // Normalize to what the gallery UI expects
    src: item.url,
    imagePath: item.url,
    cloudinaryUrl: item.url,
    alt: 'Gallery image',
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
