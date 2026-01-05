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
    // Use the content endpoint for logo
    const response = await fetch('/api/content/logo');
    if (response.ok) {
      const logoData = await response.json();
      
      // If we got valid logo data, cache and return it
      if (logoData && logoData.content && !logoData.message) {
        cachedLogo = logoData;
        logoCacheExpiry = Date.now() + CACHE_DURATION;
        return logoData;
      }
    }
  } catch (error) {
    console.error('Error fetching logo:', error);
  }

  // Return default logo if fetch fails or no logo in database
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
