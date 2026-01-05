// Utility functions for fetching menu gallery data from the API

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:5002/api';

/**
 * Fetch menu gallery data from the API
 * @returns {Promise<Object>} Menu gallery data in the format expected by the frontend
 */
export const fetchMenuGalleryData = async () => {
  try {
    const response = await fetch(`${API_BASE_URL}/menu-items/menu-gallery`);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();
    console.log('📊 Fetched menu gallery data:', data);
    return data;
  } catch (error) {
    console.error('Error fetching menu gallery data:', error);
    // Return fallback data structure if API fails
    const fallbackData = {
      cocktails: {
        title: 'Echo Cocktails',
        videoFiles: [],
        cocktailInfo: {}
      },
      mocktails: {
        title: 'Echo Mocktails',
        videoFiles: [],
        cocktailInfo: {}
      },
      spirits: {
        title: 'Echo Spirits',
        videoFiles: [],
        cocktailInfo: {}
      }
    };
    console.log('📊 Using fallback data:', fallbackData);
    return fallbackData;
  }
};

/**
 * Get cocktails for a specific category
 * @param {string} category - The category to fetch
 * @returns {Promise<Object>} Category data
 */
export const fetchCategoryData = async (category) => {
  try {
    const response = await fetch(`${API_BASE_URL}/menu-items?category=${category}`);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();
    return data;
  } catch (error) {
    console.error(`Error fetching ${category} data:`, error);
    return [];
  }
};
