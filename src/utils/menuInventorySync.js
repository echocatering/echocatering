/**
 * Utility functions for syncing data between MenuManager and InventoryManager
 * 
 * InventoryManager is the SINGLE SOURCE OF TRUTH for ALL fields:
 * - name, region, style/type/spirit, ice, garnish, itemNumber (visible columns)
 * - concept, videoFile, regions (array), page, mapSnapshotFile (hidden fields in values Map)
 * 
 * MenuManager (Cocktail model) is now minimal/optional - kept for backward compatibility
 */

// Map MenuManager category to Inventory sheetKey
export const categoryToSheetKey = {
  'cocktails': 'cocktails',
  'mocktails': 'mocktails',
  'wine': 'wine',
  'beer': 'beer',
  'spirits': 'spirits',
  'premix': 'preMix'
};

// Map Inventory sheetKey to MenuManager category
export const sheetKeyToCategory = {
  'cocktails': 'cocktails',
  'mocktails': 'mocktails',
  'wine': 'wine',
  'beer': 'beer',
  'spirits': 'spirits',
  'preMix': 'premix'
};

/**
 * Extract shared fields from MenuManager data to save to Inventory
 * These fields should be written to InventoryManager when "SAVE CHANGES" is clicked
 */
export const extractSharedFieldsForInventory = (cocktailData, category) => {
  const sheetKey = categoryToSheetKey[category];
  if (!sheetKey) return null;

  const sharedFields = {};

  // Common fields for all categories
  if (cocktailData.name) {
    sharedFields.name = cocktailData.name.trim();
  }

  // Category-specific field mappings
  switch (sheetKey) {
    case 'cocktails':
    case 'mocktails':
      if ('garnish' in cocktailData) {
        sharedFields.garnish = (cocktailData.garnish || '').trim();
      }
      // Store regions as array (not comma-separated string) - NEW: Inventory stores as array
      if (cocktailData.regions && Array.isArray(cocktailData.regions) && cocktailData.regions.length > 0) {
        sharedFields.regions = cocktailData.regions; // Store as array
        // Also keep region as string for backward compatibility with existing columns
        sharedFields.region = cocktailData.regions.map(r => String(r).trim()).join(', ');
      }
      break;

    case 'wine':
      if ('globalIngredients' in cocktailData) {
        sharedFields.hue = (cocktailData.globalIngredients || '').trim();
      }
      if ('garnish' in cocktailData) {
        sharedFields.distributor = (cocktailData.garnish || '').trim();
      }
      // Store regions as array (not comma-separated string) - NEW: Inventory stores as array
      if (cocktailData.regions && Array.isArray(cocktailData.regions) && cocktailData.regions.length > 0) {
        sharedFields.regions = cocktailData.regions; // Store as array
        // Also keep region as string for backward compatibility with existing columns
        sharedFields.region = cocktailData.regions.map(r => String(r).trim()).join(', ');
      }
      break;

    case 'spirits':
      if ('garnish' in cocktailData) {
        sharedFields.distributor = (cocktailData.garnish || '').trim();
      }
      // Store regions as array (not comma-separated string) - NEW: Inventory stores as array
      if (cocktailData.regions && Array.isArray(cocktailData.regions) && cocktailData.regions.length > 0) {
        sharedFields.regions = cocktailData.regions; // Store as array
        // Also keep region as string for backward compatibility with existing columns
        sharedFields.region = cocktailData.regions.map(r => String(r).trim()).join(', ');
      }
      break;

    case 'beer':
      if (cocktailData.regions && Array.isArray(cocktailData.regions) && cocktailData.regions.length > 0) {
        sharedFields.region = cocktailData.regions.map(r => String(r).trim()).join(', ');
      }
      break;

    case 'preMix':
      if ('ingredients' in cocktailData) {
        sharedFields.type = (cocktailData.ingredients || '').trim();
      }
      break;
  }

  // NEW: Add MenuManager-only fields to Inventory (stored in values Map but not as columns)
  // These fields are now stored in Inventory as the single source of truth
  if ('ingredients' in cocktailData) {
    sharedFields.ingredients = cocktailData.ingredients;
  }
  if ('concept' in cocktailData) {
    sharedFields.concept = cocktailData.concept;
  }
  if ('videoFile' in cocktailData) {
    sharedFields.videoFile = cocktailData.videoFile;
  }
  if ('mapSnapshotFile' in cocktailData) {
    sharedFields.mapSnapshotFile = cocktailData.mapSnapshotFile;
  }
  if ('page' in cocktailData) {
    sharedFields.page = cocktailData.page;
  } else {
    const menuCategory = sheetKeyToCategory[sheetKey] || category;
    if (menuCategory) {
      sharedFields.page = menuCategory;
    }
  }
  // regions array is already added above for cocktails/mocktails/wine/spirits/beer

  return sharedFields;
};

/**
 * Extract MenuManager-only fields that should be saved to Cocktail model
 * These are NOT saved to Inventory
 */
export const extractMenuManagerOnlyFields = (cocktailData) => {
  // Note: concept, videoFile, mapSnapshotFile are now stored in Inventory (values Map)
  // But we still save them to Cocktail model for backward compatibility and as a backup
  return {
    concept: cocktailData.concept || '',
    videoFile: cocktailData.videoFile || '',
    mapSnapshotFile: cocktailData.mapSnapshotFile || '',
    narrative: cocktailData.narrative || '', // narrative stays in Cocktail model only
    // itemNumber is read-only from Inventory, but we store it in Cocktail for reference
    itemNumber: cocktailData.itemNumber || null,
    // Keep order for backward compatibility (but Item # is the real identifier)
    order: cocktailData.order || 0
  };
};

/**
 * Merge Inventory data with Cocktail data for display in MenuManager
 * Inventory provides shared fields, Cocktail provides MenuManager-only fields
 */
export const mergeInventoryWithCocktail = (inventoryRow, cocktailData, category) => {
  const sheetKey = categoryToSheetKey[category];
  if (!sheetKey || !inventoryRow) {
    // Fallback to cocktail data if no inventory row
    return cocktailData || {};
  }

  const values = inventoryRow.values || {};
  const merged = { ...cocktailData };

  // Always use Inventory name
  if (values.name) {
    merged.name = values.name;
  }

  // Read ingredients strictly from Inventory hidden column; no fallbacks
  if (values.ingredients !== undefined && values.ingredients !== null) {
    merged.ingredients = values.ingredients;
  } else {
    merged.ingredients = cocktailData && cocktailData.ingredients !== undefined
      ? cocktailData.ingredients
      : '';
  }

  // Map other Inventory fields to MenuManager fields based on category
  switch (sheetKey) {
    case 'cocktails':
    case 'mocktails':
      if (values.garnish !== undefined && values.garnish !== null) merged.garnish = values.garnish;
      if (values.regions && Array.isArray(values.regions)) {
        merged.regions = values.regions;
      } else if (values.region) {
        merged.regions = values.region.split(',').map(r => r.trim()).filter(Boolean);
      }
      break;

    case 'wine':
      if (values.hue) merged.globalIngredients = values.hue;
      if (values.distributor !== undefined && values.distributor !== null) {
        merged.garnish = values.distributor;
      } else if (cocktailData && cocktailData.garnish !== undefined) {
        merged.garnish = cocktailData.garnish;
      }
      if (values.regions && Array.isArray(values.regions)) {
        merged.regions = values.regions;
      } else if (values.region) {
        merged.regions = values.region.split(',').map(r => r.trim()).filter(Boolean);
      }
      break;

    case 'spirits':
      if (values.distributor !== undefined && values.distributor !== null) {
        merged.garnish = values.distributor;
      } else if (cocktailData && cocktailData.garnish !== undefined) {
        merged.garnish = cocktailData.garnish;
      }
      if (values.regions && Array.isArray(values.regions)) {
        merged.regions = values.regions;
      } else if (values.region) {
        merged.regions = values.region.split(',').map(r => r.trim()).filter(Boolean);
      }
      break;

    case 'beer':
      if (values.regions && Array.isArray(values.regions)) {
        merged.regions = values.regions;
      } else if (values.region) {
        merged.regions = values.region.split(',').map(r => r.trim()).filter(Boolean);
      }
      break;

    case 'preMix':
      break;
  }

  // Item number comes from Inventory (source of truth)
  if (values.itemNumber !== undefined && values.itemNumber !== null) {
    merged.itemNumber = Number(values.itemNumber);
  }

  // NEW: Read MenuManager-only fields from Inventory first (single source of truth)
  // Fallback to Cocktail only if Inventory doesn't have them (for migration)
  if (values.concept !== undefined && values.concept !== null) {
    merged.concept = values.concept;
  } else if (cocktailData && cocktailData.concept !== undefined) {
    merged.concept = cocktailData.concept;
  }
  
  if (values.videoFile !== undefined && values.videoFile !== null) {
    merged.videoFile = values.videoFile;
  } else if (cocktailData && cocktailData.videoFile !== undefined) {
    merged.videoFile = cocktailData.videoFile;
  }
  
  if (values.mapSnapshotFile !== undefined && values.mapSnapshotFile !== null) {
    merged.mapSnapshotFile = values.mapSnapshotFile;
  } else if (cocktailData && cocktailData.mapSnapshotFile !== undefined) {
    merged.mapSnapshotFile = cocktailData.mapSnapshotFile;
  }
  
  if (values.page !== undefined && values.page !== null) {
    merged.page = values.page;
  } else if (cocktailData && cocktailData.page !== undefined) {
    merged.page = cocktailData.page;
  }
  
  // narrative stays in Cocktail model (not moved to Inventory)
  if (cocktailData && cocktailData.narrative !== undefined) {
    merged.narrative = cocktailData.narrative;
  }

  return merged;
};

/**
 * Get Inventory sheetKey from MenuManager category
 */
export const getSheetKeyFromCategory = (category) => {
  return categoryToSheetKey[category] || null;
};

/**
 * Get MenuManager category from Inventory sheetKey
 */
export const getCategoryFromSheetKey = (sheetKey) => {
  return sheetKeyToCategory[sheetKey] || null;
};

