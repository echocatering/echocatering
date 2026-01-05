// Professional gallery utility functions with server API integration

// Fetch gallery images from the server API
export const fetchGalleryImages = async () => {
  try {
    console.log('🔍 fetchGalleryImages: Starting fetch to /api/gallery...');
    const response = await fetch('/api/gallery');
    console.log('🔍 fetchGalleryImages: Response received:', response);
    console.log('🔍 fetchGalleryImages: Response status:', response.status);
    console.log('🔍 fetchGalleryImages: Response ok:', response.ok);
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const images = await response.json();
    console.log('🔍 fetchGalleryImages: Parsed images:', images);
    
    const processedImages = images.map(img => ({
      ...img,
      src: img.imagePath || `/gallery/${img.filename}`,
      alt: img.title || img.originalName || 'Gallery image'
    }));
    
    console.log('🔍 fetchGalleryImages: Processed images:', processedImages);
    return processedImages;
  } catch (error) {
    console.warn('Failed to fetch gallery images from server, using fallback:', error);
    console.warn('Error details:', error.message);
    console.warn('Error stack:', error.stack);
    return getFallbackImages();
  }
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

// Fallback images for when server is unavailable
export const getFallbackImages = () => {
  return [
    {
      _id: 'fallback1',
      filename: '6d7aa8b6-ab25-4a6c-a2c6-473bf53a7a62~rs_1536.webp',
      src: '/gallery/6d7aa8b6-ab25-4a6c-a2c6-473bf53a7a62~rs_1536.webp',
      title: 'Gallery Image 1',
      alt: 'Gallery Image 1'
    },
    {
      _id: 'fallback2',
      filename: 'Modern-Citrus-Wedding-Signature-Drink-4-2.webp',
      src: '/gallery/Modern-Citrus-Wedding-Signature-Drink-4-2.webp',
      title: 'Modern Citrus Wedding Drink',
      alt: 'Modern Citrus Wedding Drink'
    },
    {
      _id: 'fallback3',
      filename: 'friends-at-a-cocktail-party.jpg',
      src: '/gallery/friends-at-a-cocktail-party.jpg',
      title: 'Friends at Cocktail Party',
      alt: 'Friends at Cocktail Party'
    },
    {
      _id: 'fallback4',
      filename: 'hors-doeuvres.jpg',
      src: '/gallery/hors-doeuvres.jpg',
      title: 'Hors D\'oeuvres Display',
      alt: 'Hors D\'oeuvres Display'
    }
  ];
};
