// Utility functions for logo management

let cachedLogo = null;
let logoCacheExpiry = null;
const CACHE_DURATION = 30 * 1000; // 30 seconds - shorter cache for quicker updates

export const fetchLogo = async () => {
  // Check cache first
  if (cachedLogo && logoCacheExpiry && Date.now() < logoCacheExpiry) {
    return cachedLogo;
  }

  try {
    // Cloudinary is the source of truth for logo media
    const response = await fetch('/api/media/logo');
    if (response.ok) {
      const logoData = await response.json();
      
      // ONLY return if it's a Cloudinary URL - no fallbacks
      if (logoData && logoData.content && logoData.content.startsWith('https://res.cloudinary.com/') && !logoData.message) {
        cachedLogo = logoData;
        logoCacheExpiry = Date.now() + CACHE_DURATION;
        return logoData;
      }
    }
  } catch (error) {
    console.error('Error fetching logo:', error);
  }

  // Return empty content if no Cloudinary URL found (no fallback)
  return {
    content: '',
    title: 'ECHO Catering Logo',
    altText: 'ECHO Catering Logo'
  };
};

export const clearLogoCache = () => {
  cachedLogo = null;
  logoCacheExpiry = null;
};

export const getLogoPath = async () => {
  const logo = await fetchLogo();
  return logo.content || '';
};

export const getLogoMetadata = async () => {
  const logo = await fetchLogo();
  return {
    title: logo.title || 'ECHO Catering Logo',
    altText: logo.altText || 'ECHO Catering Logo'
  };
};
