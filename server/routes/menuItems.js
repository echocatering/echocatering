const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { exec, execFile } = require('child_process');
const { promisify } = require('util');
const Cocktail = require('../models/Cocktail');
const InventorySheet = require('../models/InventorySheet');
const Recipe = require('../models/Recipe');
const { authenticateToken, requireEditor } = require('../middleware/auth');
const { isValidCountryCode, getCountryByCode } = require('../utils/countries');
const {
  ensureUploadDirs,
  videoDir,
  mapDir,
  deleteUpload,
  ensureItemDir,
  getItemDir,
  removeItemDir,
  getPreviewDir,
  ensurePreviewDir,
  removePreviewDir,
  cleanupOldPreviews
} = require('../utils/fileStorage');
const { optimizeVideo } = require('../utils/videoOptimizer');
const { uploadToCloudinary, cloudinary } = require('../utils/cloudinary');

const router = express.Router();

ensureUploadDirs();

const allowedCategories = ['cocktails', 'mocktails', 'beer', 'wine', 'spirits', 'premix'];
const allowedVideoTypes = /\.(mp4|mov|m4v|webm|avi|mkv)$/i;
const allowedImageTypes = /\.(jpg|jpeg|png|webp)$/i;
const activeStatusFilter = [{ status: { $exists: false } }, { status: 'active' }];

// Single source of truth for cocktail media fields (Cloudinary-first)
const buildCocktailMediaFields = (cocktail) => {
  if (!cocktail) {
    return {
      cloudinaryVideoUrl: '',
      cloudinaryVideoPublicId: '',
      cloudinaryIconUrl: '',
      cloudinaryIconPublicId: '',
      videoUrl: '',
      cloudinaryMapSnapshotUrl: '',
      cloudinaryMapSnapshotPublicId: ''
    };
  }

  const cloudinaryVideoUrl = cocktail.cloudinaryVideoUrl || '';
  const videoUrl = cloudinaryVideoUrl || cocktail.videoUrl || '';

  return {
    cloudinaryVideoUrl,
    cloudinaryVideoPublicId: cocktail.cloudinaryVideoPublicId || '',
    cloudinaryIconUrl: cocktail.cloudinaryIconUrl || '',
    cloudinaryIconPublicId: cocktail.cloudinaryIconPublicId || '',
    videoUrl,
    cloudinaryMapSnapshotUrl: cocktail.cloudinaryMapSnapshotUrl || '',
    cloudinaryMapSnapshotPublicId: cocktail.cloudinaryMapSnapshotPublicId || ''
  };
};

// Parse a numeric suffix from itemId strings like "item4"
const parseItemNumber = (itemId) => {
  if (!itemId) return null;
  const match = String(itemId).match(/^item(\d+)$/);
  return match ? parseInt(match[1], 10) : null;
};

// Ensure all cocktails have stable itemNumber/itemId assignments (run once per process)
let ensureItemNumbersPromise = null;
const ensureItemNumbers = async () => {
  if (ensureItemNumbersPromise) return ensureItemNumbersPromise;
  ensureItemNumbersPromise = (async () => {
    const cocktails = await Cocktail.find({}).sort({ createdAt: 1 });
    let maxNumber = 0;
    const usedNumbers = new Set();
    const updates = [];

    const reserveNext = () => {
      maxNumber += 1;
      while (usedNumbers.has(maxNumber)) {
        maxNumber += 1;
      }
      usedNumbers.add(maxNumber);
      return maxNumber;
    };

    cocktails.forEach((c) => {
      let n = Number.isFinite(c.itemNumber) ? c.itemNumber : parseItemNumber(c.itemId);
      if (Number.isFinite(n) && n > 0 && !usedNumbers.has(n)) {
        usedNumbers.add(n);
        if (n > maxNumber) maxNumber = n;
      } else {
        n = reserveNext();
      }

      const desiredId = `item${n}`;
      let changed = false;
      if (c.itemNumber !== n) {
        c.itemNumber = n;
        changed = true;
      }
      if (!c.itemId || c.itemId !== desiredId) {
        c.itemId = desiredId;
        changed = true;
      }
      if (changed) {
        updates.push(c.save());
      }
    });

    if (updates.length) {
      await Promise.all(updates);
      console.log(`✅ ensureItemNumbers: updated ${updates.length} cocktail(s)`);
    }
  })().catch((err) => {
    ensureItemNumbersPromise = null;
    throw err;
  });
  return ensureItemNumbersPromise;
};

// Get next sequential itemNumber/itemId (item1, item2, item3, etc.)
const getNextItemIdentifiers = async () => {
  try {
    await ensureItemNumbers();
    // Prefer itemNumber field if present
    const maxDoc = await Cocktail.findOne({ itemNumber: { $exists: true } })
      .sort({ itemNumber: -1 })
      .select('itemNumber')
      .lean();
    let maxNumber = maxDoc?.itemNumber || 0;

    // Fallback to parsing itemId if none had itemNumber
    if (!maxNumber) {
      const cocktails = await Cocktail.find({
        itemId: { $regex: /^item\\d+$/ }
      }).select('itemId').lean();
      const numbers = cocktails
        .map((c) => parseItemNumber(c.itemId))
        .filter((n) => Number.isFinite(n) && n > 0);
      maxNumber = numbers.length ? Math.max(...numbers) : 0;
    }

    const next = maxNumber + 1 || 1;
    return { itemNumber: next, itemId: `item${next}` };
  } catch (error) {
    console.error('Error getting next item identifiers:', error);
    const fallback = Date.now();
    return { itemNumber: fallback, itemId: `item${fallback}` };
  }
};

// Ensure item numbers/ids are consistent before handling requests
router.use(async (req, res, next) => {
  try {
    await ensureItemNumbers();
    next();
  } catch (err) {
    next(err);
  }
});

// Delete all files for an itemId/itemNumber (all files are in cocktails folder now)
const deleteItemFiles = (itemId, itemNumber = null) => {
  if (!itemId && !itemNumber) return;
  
  // Video files (various extensions)
  const videoExtensions = ['.mp4', '.mov', '.m4v', '.webm', '.avi', '.mkv'];
  // Map snapshot (PNG only, saved in cocktails folder)
  const mapExtensions = ['.png'];
  
  const filesToDelete = [];
  
  // Add files using itemNumber format (new format: 1.mp4, 1.png)
  if (itemNumber && Number.isFinite(itemNumber)) {
    filesToDelete.push(
      ...videoExtensions.map(ext => path.join(videoDir, `${itemNumber}${ext}`)),
      ...mapExtensions.map(ext => path.join(videoDir, `${itemNumber}${ext}`))
    );
  }
  
  // Also delete old format files (item1.mp4, item1.png) for backward compatibility
  if (itemId) {
    filesToDelete.push(
      ...videoExtensions.map(ext => path.join(videoDir, `${itemId}${ext}`)),
      ...mapExtensions.map(ext => path.join(videoDir, `${itemId}${ext}`))
    );
  }
  
  filesToDelete.forEach(filePath => {
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        console.log(`🗑️  Deleted: ${path.basename(filePath)}`);
      }
    } catch (err) {
      console.warn(`⚠️  Failed to delete ${filePath}:`, err.message);
    }
  });
};

// OLD STAGE1 DEBUG LOGGING REMOVED - No longer needed
// const stage1DebugLog = path.resolve(__dirname, '..', 'uploads', 'stage1_debug.log');
// const appendStage1Debug = (lines = []) => { ... };

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    // Save both videos and map snapshots to the same cocktails folder
    // This keeps all files for an item together: 1.mp4, 1.png, etc. (using itemNumber)
    return cb(null, videoDir);
  },
  filename: (req, file, cb) => {
    const ext = (path.extname(file.originalname) || '').toLowerCase();
    // For multipart/form-data, multer parses fields into req.body
    // The middleware sets req.itemNumber, but we also check req.body.itemNumber
    // as a fallback since multer may parse it after middleware runs
    const itemId = req.itemId || req.body?.itemId || 'temp';
    
    // Get itemNumber - try multiple sources in order of reliability
    let itemNumber = req.itemNumber;
    if (!itemNumber && req.body?.itemNumber) {
      itemNumber = Number(req.body.itemNumber);
    }
    if (!itemNumber || !Number.isFinite(itemNumber)) {
      itemNumber = parseItemNumber(itemId);
    }
    
    console.log(`📝 Multer filename function - fieldname: ${file.fieldname}, itemId: ${itemId}, itemNumber: ${itemNumber}, ext: ${ext}`);
    
    // Videos: use itemNumber format (e.g., 1.mp4, 2.mp4) to match map snapshots
    // For video files, use itemNumber if available, otherwise fall back to itemId
    if (file.fieldname === 'video' && itemNumber && Number.isFinite(itemNumber)) {
      const filename = `${itemNumber}${ext || '.mp4'}`;
      console.log(`   → Video filename: ${filename}`);
      cb(null, filename);
    } else {
      // Fallback to itemId format for other files or if itemNumber not available
      const filename = `${itemId}${ext || '.mp4'}`;
      console.log(`   → Video filename: ${filename}`);
      cb(null, filename);
    }
  }
});

const fileFilter = (req, file, cb) => {
  if (file.fieldname === 'video') {
    if (allowedVideoTypes.test(file.originalname)) {
      return cb(null, true);
    }
    return cb(new Error('Cocktail video must be a video file'));
  }
  return cb(new Error('Unsupported upload field'));
};

const mediaUpload = multer({ storage, fileFilter });
// OLD STAGE1 UPLOAD REMOVED - Using new video processing system
// const stage1Upload = multer({ ... });

const normalizeCategory = (value) => {
  if (!value) return null;
  const str = String(value).toLowerCase();
  
  // Map old category names to new ones
  const categoryMap = {
    'classics': 'cocktails',
    'originals': 'mocktails'
  };
  
  if (categoryMap[str]) {
    return categoryMap[str];
  }
  
  if (['hors-doeuvres', 'hors_doeuvres', "hors d'oeuvres", 'hors'].includes(str)) {
    return 'hors';
  }
  if (allowedCategories.includes(str)) {
    return str;
  }
  return null;
};

const parseRegions = (input) => {
  if (!input) return [];
  let source = input;
  if (typeof input === 'string') {
    try {
      const parsed = JSON.parse(input);
      if (Array.isArray(parsed)) {
        source = parsed;
      } else {
        source = input.split(',');
      }
    } catch (err) {
      source = input.split(',');
    }
  }
  if (!Array.isArray(source)) {
    source = [source];
  }
  return source
    .map((code) => String(code).toUpperCase().trim())
    .filter((code) => isValidCountryCode(code));
};

// Async exec helpers
const execAsync = promisify(exec);
const execFileAsync = promisify(execFile);

// OLD BUILD ITEM PATHS REMOVED - No longer needed (was only used by stage1/stage2)
// const buildItemPaths = (itemId, create = true) => { ... };

const clamp = (val, min, max, fallback) => {
  const num = typeof val === 'number' ? val : parseFloat(val);
  if (Number.isNaN(num)) return fallback;
  return Math.min(max, Math.max(min, num));
};

const buildFilterGraph = (params = {}, isWebM = false) => {
  const brightness = clamp(params.brightness, -1, 1, 0);
  const contrast = clamp(params.contrast, 0, 3, 1);
  const saturation = clamp(params.saturation, 0, 3, 1);
  const hue = clamp(params.hue, -180, 180, 0); // Hue rotation in degrees (-180 to 180)
  
  // Color temperature: -2000 to +2000K relative to 6500K (default)
  const temperature = clamp(params.temperature, -2000, 2000, 0);
  const temperatureK = 6500 + temperature; // Convert to absolute Kelvin

  const filters = [];
  
  // Check if any filters need to be applied
  const hasFilters = brightness !== 0 || contrast !== 1 || saturation !== 1 || hue !== 0 || temperature !== 0;
  
  if (!hasFilters) {
    return 'null';
  }

  // For WebM videos (transparent background), apply filters directly
  // For MP4 videos (white background), mask out white areas first
  if (isWebM) {
    // WebM has alpha channel - apply filters directly to foreground only
    // Filters automatically respect alpha channel
  
  // Add eq filter for brightness, contrast, saturation
  if (brightness !== 0 || contrast !== 1 || saturation !== 1) {
    filters.push(`eq=brightness=${brightness}:contrast=${contrast}:saturation=${saturation}`);
  }
  
  // Add hue filter if needed (separate filter, not part of eq)
  if (hue !== 0) {
    filters.push(`hue=h=${hue}`);
  }
  
  // Add color temperature filter
  if (temperature !== 0) {
    filters.push(`colortemperature=temperature=${temperatureK}`);
  }
  } else {
    // MP4 has white background - mask out white areas before applying filters
    // Only apply filters to foreground (non-white areas), preserve white background
    
    // Split video into two streams: original and filtered
    filters.push('split[orig][filt]');
    
    // Build color filters to apply
    const colorFilters = [];
    if (brightness !== 0 || contrast !== 1 || saturation !== 1) {
      colorFilters.push(`eq=brightness=${brightness}:contrast=${contrast}:saturation=${saturation}`);
    }
    if (hue !== 0) {
      colorFilters.push(`hue=h=${hue}`);
    }
    if (temperature !== 0) {
      colorFilters.push(`colortemperature=temperature=${temperatureK}`);
    }
    
    // Apply color filters to filtered stream
    if (colorFilters.length > 0) {
      filters.push(`[filt]${colorFilters.join(',')}[filt]`);
    } else {
      // If no color filters, just alias
      filters.push(`[filt]copy[filt]`);
    }
    
    // Create mask from original: white areas (luma > 0.90) = 0, foreground = 255
    // Using lutyuv to extract luma, then geq to create alpha mask
    filters.push(`[orig]lutyuv=y='if(lt(Y,229),255,0)':u='128':v='128'[mask]`);
    
    // Apply mask to filtered version using alphamerge (foreground gets filtered, white areas transparent)
    filters.push(`[filt][mask]alphamerge[fg]`);
    
    // Composite: overlay filtered foreground on original (preserves white background)
    filters.push(`[orig][fg]overlay=format=auto[out]`);
  }
  
  return filters.length > 0 ? filters.join(',') : 'null';
};

const findCocktailByAnyId = async (id) => {
  if (!id) return null;
  const byMongoId = await Cocktail.findById(id);
  if (byMongoId) return byMongoId;
  return Cocktail.findOne({ itemId: id });
};

const getMenuGalleryBuckets = () => ({
  cocktails: {
    title: 'Echo Cocktails',
    menuNavEnabled: false,
    videoFiles: [],
    cocktailInfo: {}
  },
  mocktails: {
    title: 'Echo Mocktails',
    menuNavEnabled: false,
    videoFiles: [],
    cocktailInfo: {}
  },
  beer: {
    title: 'Beer',
    menuNavEnabled: false,
    videoFiles: [],
    cocktailInfo: {}
  },
  wine: {
    title: 'Wine',
    menuNavEnabled: false,
    videoFiles: [],
    cocktailInfo: {}
  },
  spirits: {
    title: 'Echo Spirits',
    menuNavEnabled: false,
    videoFiles: [],
    cocktailInfo: {}
  },
  premix: {
    title: 'Pre-Mix',
    videoFiles: [],
    cocktailInfo: {}
  },
});

const sanitizeText = (value = '', max = 1000) => {
  return String(value).trim().slice(0, max);
};

const cleanupUploadedFiles = (files = {}) => {
  // All files (videos and map snapshots) are now in cocktails folder
  if (files.video) {
    files.video.forEach((file) => {
      const filePath = path.join(videoDir, file.filename);
      try {
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      } catch (err) {
        console.warn(`⚠️  Failed to delete ${file.filename}:`, err.message);
      }
    });
  }
  if (files.mapSnapshot) {
    files.mapSnapshot.forEach((file) => {
      const filePath = path.join(videoDir, file.filename);
      try {
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      } catch (err) {
        console.warn(`⚠️  Failed to delete ${file.filename}:`, err.message);
      }
    });
  }
};

const buildCocktailPayload = (body = {}) => {
  const payload = {
    name: sanitizeText(body.name, 100),
    concept: sanitizeText(body.concept, 1000),
    ingredients: sanitizeText(body.ingredients, 1000),
    globalIngredients: sanitizeText(body.globalIngredients, 500),
    garnish: sanitizeText(body.garnish, 500),
    category: normalizeCategory(body.category),
    regions: parseRegions(body.regions),
    featured: body.featured === 'true' || body.featured === true,
    mapType: body.mapType === 'us' ? 'us' : 'world'
  };

  if (body.order !== undefined) {
    const parsed = Number(body.order);
    if (Number.isFinite(parsed) && parsed >= 0) {
      payload.order = parsed;
    }
  }

  return payload;
};

const validatePayload = (payload, { requireRegions = true, requireConcept = true, requireIngredients = true } = {}) => {
  const errors = [];
  if (!payload.name) errors.push('Name is required');
  if (requireConcept && !payload.concept) errors.push('Concept is required');
  if (requireIngredients && !payload.ingredients) errors.push('Ingredients are required');
  if (!payload.category) errors.push('A valid section is required');
  if (requireRegions && (!Array.isArray(payload.regions) || payload.regions.length === 0)) {
    errors.push('Select at least one country on the map');
  }
  return errors;
};

// @route   GET /api/menu-items
// @desc    Get all menu items
// @access  Public
router.get('/', async (req, res) => {
  try {
    const { category, section, active, status, featured, includeArchived } = req.query;
    const query = {};

    const resolvedCategory = normalizeCategory(category || section);
    if (resolvedCategory) {
      query.category = resolvedCategory;
    }

    if (featured !== undefined) {
      query.featured = featured === 'true';
    }

    if (typeof status === 'string') {
      if (status === 'archived') {
        query.status = 'archived';
        query.isActive = false;
      } else {
        query.$or = activeStatusFilter;
        query.isActive = true;
      }
    } else if (active !== undefined) {
      const activeBool = active === 'true';
      if (activeBool) {
        query.$or = activeStatusFilter;
      } else {
        query.status = 'archived';
      }
      query.isActive = activeBool;
    } else if (!includeArchived || includeArchived === 'false') {
      query.$or = activeStatusFilter;
    }

    // Only return items with itemId (new system) - filter out old items without itemId
    // This prevents old hardcoded items from competing with new items
    query.itemId = { $exists: true, $ne: null, $ne: '' };

    const cocktails = await Cocktail.find(query)
      .sort({ category: 1, order: 1, name: 1 })
      .lean(); // Use lean() for better performance and consistency

    res.json(cocktails);
  } catch (error) {
    console.error('Get cocktails error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /api/menu-items/menu-manager
// @desc    Get menu items merged with inventory data for MenuManager UI
// @desc    Inventory is source of truth for shared fields (name, region, style, garnish, itemNumber)
// @desc    Cocktail model provides MenuManager-only fields (concept, videoFile, mapSnapshotFile)
// @desc    Recipe model provides recipe information (linked by name/title)
// @access  Private
router.get('/menu-manager', [authenticateToken], async (req, res) => {
  try {
    const { category, section, active, status, featured, includeArchived } = req.query;

    // Map category to sheetKey
    const categoryToSheetKey = {
      'cocktails': 'cocktails',
      'mocktails': 'mocktails',
      'wine': 'wine',
      'beer': 'beer',
      'spirits': 'spirits',
      'premix': 'preMix'
    };

    const resolvedCategory = normalizeCategory(category || section);
    let targetSheetKey = null;
    if (resolvedCategory) {
      targetSheetKey = categoryToSheetKey[resolvedCategory];
    }

    // Fetch inventory sheets - start from Inventory (source of truth)
    const sheetKeys = targetSheetKey 
      ? [targetSheetKey] 
      : Object.values(categoryToSheetKey);
    const inventorySheets = await InventorySheet.find({ sheetKey: { $in: sheetKeys } }).lean();

    // Collect all inventory rows (not deleted, with names)
    const inventoryRows = [];
    inventorySheets.forEach(sheet => {
      if (!sheet.rows || !Array.isArray(sheet.rows)) return;
      
      sheet.rows.forEach(row => {
        // Skip deleted rows
        if (row.isDeleted) return;
        
        const values = row.values instanceof Map 
          ? Object.fromEntries(row.values)
          : (row.values || {});
        
        const name = values.name;
        if (!name || typeof name !== 'string' || name.trim().length === 0) {
          return; // Skip rows without names
        }
        
        // Find the category for this sheet
        const sheetCategory = Object.keys(categoryToSheetKey).find(
          cat => categoryToSheetKey[cat] === sheet.sheetKey
        );
        
        inventoryRows.push({
          sheetKey: sheet.sheetKey,
          category: sheetCategory,
          row,
          values
        });
      });
    });

    // Fetch all cocktails to create a lookup map
    const cocktailQuery = {};
    if (resolvedCategory) {
      cocktailQuery.category = resolvedCategory;
    }
    const allCocktails = await Cocktail.find(cocktailQuery).lean();
    
    // Create lookup maps for cocktails
    const cocktailById = new Map();
    const cocktailByItemNumber = new Map();
    const cocktailByName = new Map();
    
    allCocktails.forEach(cocktail => {
      if (cocktail._id) {
        cocktailById.set(String(cocktail._id), cocktail);
      }
      if (cocktail.itemNumber) {
        cocktailByItemNumber.set(cocktail.itemNumber, cocktail);
      }
      if (cocktail.name) {
        const key = `${normalizeCategory(cocktail.category)}:${cocktail.name.toLowerCase().trim()}`;
        cocktailByName.set(key, cocktail);
      }
    });

    // Fetch all recipes for matching
    const recipeQuery = {};
    if (resolvedCategory === 'cocktails') {
      recipeQuery.type = 'cocktail';
    } else if (resolvedCategory === 'mocktails') {
      recipeQuery.type = 'mocktail';
    } else if (resolvedCategory === 'premix') {
      recipeQuery.type = 'premix';
    }
    const allRecipes = await Recipe.find(recipeQuery).lean();
    const recipeByItemNumber = new Map(); // NEW: Map by itemNumber
    const recipeByName = new Map(); // Keep for fallback
    allRecipes.forEach(recipe => {
      if (recipe.itemNumber && Number.isFinite(recipe.itemNumber)) {
        recipeByItemNumber.set(recipe.itemNumber, recipe);
      }
      if (recipe.title) {
        recipeByName.set(recipe.title.toLowerCase().trim(), recipe);
      }
    });

    // Auto-create Cocktail entries for Inventory items that don't have them
    const cocktailsToCreate = [];
    const createdCocktails = new Map();
    
    for (const { sheetKey, category, row, values } of inventoryRows) {
      const itemNumber = values.itemNumber;
      const name = values.name;
      const menuManagerId = values.menuManagerId;

      // Find matching cocktail
      let cocktail = null;
      if (menuManagerId) {
        cocktail = cocktailById.get(String(menuManagerId));
      }
      if (!cocktail && itemNumber) {
        cocktail = cocktailByItemNumber.get(Number(itemNumber));
      }
      if (!cocktail && name) {
        const key = `${category}:${name.toLowerCase().trim()}`;
        cocktail = cocktailByName.get(key);
      }

        // If no cocktail exists but we have an itemNumber, create one
      if (!cocktail && itemNumber && name) {
        const newCocktail = new Cocktail({
          name: name,
          category: category || 'cocktails',
          itemNumber: Number(itemNumber),
          itemId: `item${itemNumber}`,
          status: 'active',
          isActive: true,
          order: Number(itemNumber) || 0,
          concept: '',
          ingredients: values.ingredients || '',
          garnish: values.garnish || '',
          regions: values.region ? String(values.region).split(',').map(r => r.trim()).filter(Boolean) : []
        });

        cocktailsToCreate.push(newCocktail);
        createdCocktails.set(Number(itemNumber), newCocktail);
      }
    }

    // Save all new cocktails
    const savedCocktailsMap = new Map(); // Map itemNumber -> saved cocktail
    if (cocktailsToCreate.length > 0) {
      console.log(`📝 Auto-creating ${cocktailsToCreate.length} Cocktail entries for Inventory items...`);
      const savedCocktails = await Cocktail.insertMany(cocktailsToCreate);
      
      // Update inventory rows with menuManagerId and build lookup map
      for (const savedCocktail of savedCocktails) {
        savedCocktailsMap.set(savedCocktail.itemNumber, savedCocktail.toObject());
        
        const inventoryRow = inventoryRows.find(({ values }) => {
          const rowItemNumber = values.itemNumber;
          return rowItemNumber && Number(rowItemNumber) === savedCocktail.itemNumber;
        });
        
        if (inventoryRow) {
          const sheet = await InventorySheet.findOne({ sheetKey: inventoryRow.sheetKey });
          if (sheet) {
            const row = sheet.rows.id(inventoryRow.row._id);
            if (row) {
              const valuesMap = row.values instanceof Map 
                ? row.values 
                : new Map(Object.entries(row.values || {}));
              valuesMap.set('menuManagerId', String(savedCocktail._id));
              row.values = valuesMap;
              sheet.markModified('rows');
              await sheet.save();
            }
          }
        }
      }
      
      // Add created cocktails to lookup maps
      savedCocktails.forEach(cocktail => {
        const cocktailObj = cocktail.toObject();
        if (cocktail._id) {
          cocktailById.set(String(cocktail._id), cocktailObj);
        }
        if (cocktail.itemNumber) {
          cocktailByItemNumber.set(cocktail.itemNumber, cocktailObj);
        }
        if (cocktail.name) {
          const key = `${normalizeCategory(cocktail.category)}:${cocktail.name.toLowerCase().trim()}`;
          cocktailByName.set(key, cocktailObj);
        }
      });
      
      console.log(`✅ Created ${savedCocktails.length} Cocktail entries`);
    }

    // Build merged items starting from inventory rows
    const mergedItems = inventoryRows.map(({ sheetKey, category, row, values }) => {
      const itemNumber = values.itemNumber;
      const name = values.name;
      const menuManagerId = values.menuManagerId;

      // Find matching cocktail (including newly created ones)
      let cocktail = null;
      if (menuManagerId) {
        cocktail = cocktailById.get(String(menuManagerId));
      }
      if (!cocktail && itemNumber) {
        cocktail = cocktailByItemNumber.get(Number(itemNumber));
        // Also check newly created cocktails
        if (!cocktail && savedCocktailsMap.has(Number(itemNumber))) {
          cocktail = savedCocktailsMap.get(Number(itemNumber));
        }
      }
      if (!cocktail && name) {
        const key = `${category}:${name.toLowerCase().trim()}`;
        cocktail = cocktailByName.get(key);
      }

      // Find matching recipe - NEW: Try itemNumber first
      let recipe = null;
      if (itemNumber) {
        recipe = recipeByItemNumber.get(Number(itemNumber));
      }
      // Fallback: Find by name (for backward compatibility)
      if (!recipe && name) {
        recipe = recipeByName.get(name.toLowerCase().trim());
      }

      // Start with inventory data (source of truth)
      // If no cocktail exists, we still need to return the item so MenuManager can display it
      // The _id will be null, which means it needs to be created when saved
      const merged = {
        _id: cocktail?._id || null,
        name: name || '',
        category: category || 'cocktails',
        itemNumber: itemNumber ? Number(itemNumber) : null,
        status: cocktail?.status || 'active',
        isActive: cocktail?.isActive !== false,
        order: cocktail?.order || (itemNumber || 0),
        // NEW: Read MenuManager-only fields from Inventory first (single source of truth)
        // Fallback to Cocktail only if Inventory doesn't have them (for migration)
        concept: values.concept || cocktail?.concept || '',
        videoFile: values.videoFile || cocktail?.videoFile || '',
        mapSnapshotFile: values.mapSnapshotFile || cocktail?.mapSnapshotFile || '',
        page: values.page || cocktail?.page || '',
        // narrative stays in Cocktail model (not moved to Inventory)
        narrative: cocktail?.narrative || '',
        featured: cocktail?.featured || false,
      itemId: cocktail?.itemId || (itemNumber ? `item${itemNumber}` : null),
      // Cloudinary media fields (ensure UI can render processed assets)
      ...buildCocktailMediaFields(cocktail)
      };

      // Read ingredients from Inventory (hidden column) as source of truth.
      if (values.ingredients !== undefined && values.ingredients !== null && values.ingredients !== '') {
        merged.ingredients = values.ingredients;
      }
      // No fallback to legacy fields; if missing in Inventory, leave empty.
      if (merged.ingredients === undefined) {
        merged.ingredients = '';
      }

      // Map other inventory fields to MenuManager fields based on category
      switch (sheetKey) {
        case 'cocktails':
        case 'mocktails':
          merged.garnish = values.garnish || '';
          // NEW: Read regions from Inventory (as array) first, fallback to string or cocktail
          if (values.regions && Array.isArray(values.regions)) {
            merged.regions = values.regions;
          } else if (values.region) {
            merged.regions = String(values.region).split(',').map(r => r.trim()).filter(Boolean);
          } else {
            merged.regions = cocktail?.regions || [];
          }
          break;

        case 'wine':
          merged.globalIngredients = values.hue || '';
          merged.garnish = values.distributor || '';
          // NEW: Read regions from Inventory (as array) first, fallback to string or cocktail
          if (values.regions && Array.isArray(values.regions)) {
            merged.regions = values.regions;
          } else if (values.region) {
            merged.regions = String(values.region).split(',').map(r => r.trim()).filter(Boolean);
          } else {
            merged.regions = cocktail?.regions || [];
          }
          break;

        case 'spirits':
          merged.garnish = values.distributor || '';
          // NEW: Read regions from Inventory (as array) first, fallback to string or cocktail
          if (values.regions && Array.isArray(values.regions)) {
            merged.regions = values.regions;
          } else if (values.region) {
            merged.regions = String(values.region).split(',').map(r => r.trim()).filter(Boolean);
          } else {
            merged.regions = cocktail?.regions || [];
          }
          break;

        case 'beer':
          // NEW: Read regions from Inventory (as array) first, fallback to string or cocktail
          if (values.regions && Array.isArray(values.regions)) {
            merged.regions = values.regions;
          } else if (values.region) {
            merged.regions = String(values.region).split(',').map(r => r.trim()).filter(Boolean);
          } else {
            merged.regions = cocktail?.regions || [];
          }
          break;

        case 'preMix':
          merged.regions = cocktail?.regions || [];
          break;
      }

      // Add recipe if found
      if (recipe) {
        merged.recipe = recipe;
      }

      return merged;
    });

    // Apply filtering based on query params
    let filtered = mergedItems;
    
    if (status === 'archived') {
      filtered = filtered.filter(item => item.status === 'archived');
    } else if (!includeArchived || includeArchived === 'false') {
      filtered = filtered.filter(item => item.status !== 'archived' && item.isActive !== false);
    }

    if (featured !== undefined) {
      const featuredBool = featured === 'true';
      filtered = filtered.filter(item => item.featured === featuredBool);
    }

    // Sort by category, then itemNumber, then name
    filtered.sort((a, b) => {
      if (a.category !== b.category) {
        return (a.category || '').localeCompare(b.category || '');
      }
      if (a.itemNumber !== b.itemNumber) {
        return (a.itemNumber || 0) - (b.itemNumber || 0);
      }
      return (a.name || '').localeCompare(b.name || '');
    });

    res.json(filtered);
  } catch (error) {
    console.error('Get menu-manager cocktails error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /api/menu-items/menu-gallery
// @desc    Get menu items formatted for menu gallery (grouped by category)
// @access  Public
router.get('/menu-gallery', async (req, res) => {
  try {
    // Source all item info from inventory sheets (cocktails, mocktails, beer, wine, spirits)
    const sheetKeys = ['cocktails', 'mocktails', 'beer', 'wine', 'spirits'];
    const sheets = await InventorySheet.find({ sheetKey: { $in: sheetKeys } }).lean();
    const menuGalleryData = getMenuGalleryBuckets();

    const menuNavBySheetKey = new Map();
    sheets.forEach((sheet) => {
      const enabled = sheet?.settings?.menuNavEnabled;
      menuNavBySheetKey.set(sheet.sheetKey, enabled === true);
    });

    sheetKeys.forEach((sheetKey) => {
      const category = normalizeCategory(sheetKey);
      if (!category || !menuGalleryData[category]) return;
      menuGalleryData[category].menuNavEnabled = (menuNavBySheetKey.get(sheetKey) === true);
    });

    const sheetsByKey = new Map();
    sheets.forEach((s) => sheetsByKey.set(s.sheetKey, s));

    const normalizeCountries = (regionValue) => {
      const codes = String(regionValue || '')
        .split(',')
        .map((c) => c.trim().toUpperCase())
        .filter(Boolean);
      const countries = codes.map((code) => {
        const meta = getCountryByCode(code);
        return { code, name: meta?.name || code };
      });
      return { codes, countries };
    };

    // Pre-fetch all cocktails to avoid N+1 queries
    const allItemNumbers = new Set();
    sheetKeys.forEach((sheetKey) => {
      const sheet = sheetsByKey.get(sheetKey);
      if (!sheet || !Array.isArray(sheet.rows)) return;
      sheet.rows.forEach((row) => {
        if (row.isDeleted) return;
        const values =
          row.values instanceof Map ? Object.fromEntries(row.values) : row.values || {};
        const itemNumber = Number(values.itemNumber);
        if (Number.isFinite(itemNumber)) {
          allItemNumbers.add(itemNumber);
        }
      });
    });
    
    // Fetch all cocktails - get full Mongoose documents to ensure all fields are included
    const cocktails = await Cocktail.find({ itemNumber: { $in: Array.from(allItemNumbers) } });
    const cocktailsByItemNumber = new Map();
    
    cocktails.forEach(cocktail => {
      if (cocktail.itemNumber) {
        // Get the raw field value directly from the document using .get() method
        // This is the most reliable way to get the actual database value
        const cloudinaryVideoUrlRaw = cocktail.get('cloudinaryVideoUrl');
        const cloudinaryIconUrlRaw = cocktail.get('cloudinaryIconUrl');
        const videoFileRaw = cocktail.get('videoFile');
        const mediaFields = buildCocktailMediaFields(cocktail.toObject ? cocktail.toObject() : cocktail);
        
        // Get virtuals
        const cocktailJson = cocktail.toJSON({ virtuals: true });
        
        // MANUALLY construct the object to ensure cloudinaryVideoUrl is ALWAYS included
        // Don't rely on toObject() which might omit fields
        const cocktailObj = {
          itemNumber: cocktail.itemNumber,
          name: cocktail.name,
          videoFile: videoFileRaw || null,
          // CRITICAL: Always include cloudinaryVideoUrl - use raw value from database, fallback to helper
          cloudinaryVideoUrl: cloudinaryVideoUrlRaw !== undefined ? cloudinaryVideoUrlRaw : mediaFields.cloudinaryVideoUrl,
          cloudinaryIconUrl: cloudinaryIconUrlRaw !== undefined ? cloudinaryIconUrlRaw : mediaFields.cloudinaryIconUrl,
          // Include virtuals
          videoUrl: mediaFields.videoUrl || cocktailJson.videoUrl || null,
          iconVideoUrl: cocktailJson.iconVideoUrl || null,
          mapSnapshotUrl: mediaFields.cloudinaryMapSnapshotUrl || cocktailJson.mapSnapshotUrl || null,
          cloudinaryVideoPublicId: mediaFields.cloudinaryVideoPublicId || null,
          cloudinaryIconPublicId: mediaFields.cloudinaryIconPublicId || null,
          cloudinaryMapSnapshotUrl: mediaFields.cloudinaryMapSnapshotUrl || null,
          cloudinaryMapSnapshotPublicId: mediaFields.cloudinaryMapSnapshotPublicId || null
        };
        
        cocktailsByItemNumber.set(cocktail.itemNumber, cocktailObj);
      }
    });

    // Process all rows and collect item numbers first
    const allRows = [];
    sheetKeys.forEach((sheetKey) => {
      const sheet = sheetsByKey.get(sheetKey);
      if (!sheet || !Array.isArray(sheet.rows)) return;
      sheet.rows.forEach((row) => {
        if (!row.isDeleted) {
          allRows.push({ row, sheetKey });
        }
      });
    });
    
    // Now process each row with async/await support
    for (const { row, sheetKey } of allRows) {
      const sheet = sheetsByKey.get(sheetKey);
      if (!sheet) continue;
      
      if (row.isDeleted) continue;
      
        const values =
          row.values instanceof Map ? Object.fromEntries(row.values) : row.values || {};
        const itemNumber = Number(values.itemNumber);
      if (!Number.isFinite(itemNumber)) continue;

        const category = normalizeCategory(sheetKey);
      if (!category || !menuGalleryData[category]) continue;

        const key = `item-${itemNumber}`;
        const { codes, countries } = normalizeCountries(values.region);

        menuGalleryData[category].videoFiles.push(key);
        
      // FOOLPROOF: Query database DIRECTLY for this item's cloudinaryVideoUrl and cloudinaryMapSnapshotUrl
      // This bypasses any map/caching issues
      const cocktailFromDb = await Cocktail.findOne({ itemNumber: itemNumber })
        .select('cloudinaryVideoUrl cloudinaryMapSnapshotUrl videoFile mapSnapshotFile cloudinaryVideoPublicId cloudinaryIconUrl cloudinaryIconPublicId cloudinaryMapSnapshotPublicId').lean();
      
      const mediaFromDb = buildCocktailMediaFields(cocktailFromDb);
      const videoFileFromDb = cocktailFromDb?.videoFile || null;
      const mapSnapshotFileFromDb = cocktailFromDb?.mapSnapshotFile || null;
      const cloudinaryVideoUrlValue = mediaFromDb.cloudinaryVideoUrl || null;
      const cloudinaryMapSnapshotUrlValue = mediaFromDb.cloudinaryMapSnapshotUrl || null;
      
      // Determine videoUrl (Cloudinary preferred)
      let videoUrl = mediaFromDb.videoUrl || `/menu-items/${itemNumber}.mp4`;
      if (!mediaFromDb.videoUrl && videoFileFromDb) {
        videoUrl = `/menu-items/${videoFileFromDb}`;
      }
      
      // Also get from map for other fields (but cloudinaryVideoUrl comes from DB)
      const cocktail = cocktailsByItemNumber.get(itemNumber);
      
      // Create cocktailInfo entry - ALWAYS include cloudinaryVideoUrl and cloudinaryMapSnapshotUrl fields
      // Create as a single object literal to ensure all fields are included
      const cocktailInfoEntry = {
          name: values.name || '',
          concept: values.concept || '',
          ingredients: values.ingredients || '',
          garnish: values.garnish || '',
          countryCodes: codes,
          countries,
          itemNumber,
          // Map snapshot: prioritize Cloudinary URL, fallback to local path only if no Cloudinary URL
          mapSnapshot: cloudinaryMapSnapshotUrlValue ? cloudinaryMapSnapshotUrlValue : (mapSnapshotFileFromDb ? `/menu-items/${mapSnapshotFileFromDb}` : `/menu-items/${itemNumber}.png`),
          cloudinaryMapSnapshotUrl: cloudinaryMapSnapshotUrlValue ? String(cloudinaryMapSnapshotUrlValue) : null,
          mapSnapshotUrl: cloudinaryMapSnapshotUrlValue ? String(cloudinaryMapSnapshotUrlValue) : null, // Alias for compatibility
          videoUrl: videoUrl,
          // CRITICAL: Always include cloudinaryVideoUrl - explicitly set it, never omit
          cloudinaryVideoUrl: cloudinaryVideoUrlValue ? String(cloudinaryVideoUrlValue) : null,
          cloudinaryVideoPublicId: mediaFromDb.cloudinaryVideoPublicId || null,
          cloudinaryIconUrl: mediaFromDb.cloudinaryIconUrl || null,
          cloudinaryIconPublicId: mediaFromDb.cloudinaryIconPublicId || null,
          cloudinaryMapSnapshotPublicId: mediaFromDb.cloudinaryMapSnapshotPublicId || null,
          category
        };
      
      // Store it
      menuGalleryData[category].cocktailInfo[key] = cocktailInfoEntry;
    }

    // ABSOLUTE FINAL FIX: Force cloudinaryVideoUrl into ALL items before sending
    const finalItemNums = Array.from(allItemNumbers);
    if (finalItemNums.length > 0) {
      const allItems = await Cocktail.find({ itemNumber: { $in: finalItemNums } })
        .select('itemNumber cloudinaryVideoUrl').lean();
      
      allItems.forEach(c => {
        Object.values(menuGalleryData).forEach(cat => {
          if (cat.cocktailInfo) {
            Object.keys(cat.cocktailInfo).forEach(key => {
              if (cat.cocktailInfo[key].itemNumber === c.itemNumber) {
                cat.cocktailInfo[key].cloudinaryVideoUrl = c.cloudinaryVideoUrl || null;
              }
            });
          }
        });
      });
    }

    // Disable caching for this endpoint to ensure fresh data
    res.set({
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0'
    });
    res.json(menuGalleryData);
  } catch (error) {
    console.error('Get menu gallery error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

router.get('/archived', [authenticateToken, requireEditor], async (req, res) => {
  try {
    const archived = await Cocktail.find({ status: 'archived' })
      .sort({ archivedAt: -1, category: 1, name: 1 });

    const grouped = archived.reduce((acc, cocktail) => {
      const key = normalizeCategory(cocktail.category) || 'uncategorized';
      if (!acc[key]) acc[key] = [];
      acc[key].push(cocktail);
      return acc;
    }, {});

    res.json(grouped);
  } catch (error) {
    console.error('Get archived cocktails error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /api/menu-items/:id
// @desc    Get cocktail by ID
// @access  Public
router.get('/:id', async (req, res) => {
  try {
    const cocktail = await Cocktail.findById(req.params.id);
    if (!cocktail) {
      return res.status(404).json({ message: 'Cocktail not found' });
    }
    res.json(cocktail);
  } catch (error) {
    console.error('Get cocktail error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Middleware to generate itemId before multer processes files
// Note: For multipart/form-data, req.body might not be parsed yet
// We need to parse it manually or rely on multer to parse it first
const generateItemIdMiddleware = async (req, res, next) => {
  try {
    // For multipart/form-data, we need to wait for multer to parse it
    // But we can't do that here. Instead, we'll set up a way for multer
    // to access itemNumber from the request after it's parsed.
    // The multer filename function will check req.itemNumber first, then req.body.itemNumber
    
    // Try to get itemNumber from body if already parsed (shouldn't happen for multipart, but just in case)
    let itemNumber = null;
    let itemId = null;
    
    if (req.body && req.body.itemNumber && Number.isFinite(Number(req.body.itemNumber))) {
      itemNumber = Number(req.body.itemNumber);
      itemId = `item${itemNumber}`;
      req.body.itemId = itemId;
      req.body.itemNumber = itemNumber;
      req.itemId = itemId;
      req.itemNumber = itemNumber;
    } else if (req.body && req.body.itemId) {
      itemId = req.body.itemId;
      itemNumber = parseItemNumber(itemId);
      if (itemNumber) {
        req.body.itemNumber = itemNumber;
        req.itemNumber = itemNumber;
      }
      req.itemId = itemId;
    } else if (!req.body || !req.body.itemId) {
      // Generate new itemId/itemNumber if not provided
      const nextIds = await getNextItemIdentifiers();
      itemNumber = nextIds.itemNumber;
      itemId = nextIds.itemId;
      req.body = req.body || {};
      req.body.itemId = itemId;
      req.body.itemNumber = itemNumber;
      req.itemId = itemId;
      req.itemNumber = itemNumber;
    }
    
    next();
  } catch (error) {
    console.error('Error generating itemId:', error);
    return res.status(500).json({ message: 'Error generating item ID' });
  }
};

// @route   POST /api/menu-items/map/:itemNumber
// @desc    Save map snapshot PNG for an item
// @access  Private (Editor)
const mapUpload = multer({
  dest: videoDir,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB max
});

router.post('/map/:itemNumber',
  authenticateToken,
  requireEditor,
  mapUpload.single('map'),
  async (req, res) => {
    const itemNumber = Number(req.params.itemNumber);

    if (!Number.isFinite(itemNumber)) {
      return res.status(400).json({ error: 'Invalid item number' });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'No map file uploaded' });
    }

    const tempFilePath = req.file.path;

    try {
      // Verify file exists on disk
      try {
        const stats = await fs.promises.stat(tempFilePath);
      } catch (statErr) {
        throw new Error(`Uploaded file not found on disk: ${tempFilePath}`);
      }

      // Find cocktail
      const cocktail = await Cocktail.findOne({ itemNumber: itemNumber });
      if (!cocktail) {
        await fs.promises.unlink(tempFilePath); // cleanup
        return res.status(404).json({ error: 'Cocktail not found' });
      }

      // Upload to Cloudinary
      const uploadResult = await cloudinary.uploader.upload(tempFilePath, {
        folder: 'echo-catering/maps',
        public_id: `${itemNumber}_map`,
        resource_type: 'image',
        overwrite: true,
      });

      if (!uploadResult || !uploadResult.secure_url) {
        throw new Error('Cloudinary upload failed - no secure_url returned');
      }

      // Update cocktail
      cocktail.cloudinaryMapSnapshotUrl = uploadResult.secure_url;
      cocktail.cloudinaryMapSnapshotPublicId = uploadResult.public_id;
      cocktail.mapSnapshotFile = null; // clear local reference
      await cocktail.save();

      // Delete temp file
      await fs.promises.unlink(tempFilePath);

      res.json({
        success: true,
        itemNumber: itemNumber,
        cloudinaryUrl: uploadResult.secure_url,
        publicId: uploadResult.public_id,
      });
    } catch (err) {
      console.error('Error saving map snapshot:', err);
      // Cleanup temp file if exists
      try { 
        await fs.promises.unlink(tempFilePath); 
      } catch (cleanupErr) {
        // best-effort cleanup
      }
      res.status(500).json({
        error: 'Server error saving map snapshot',
        ...(process.env.NODE_ENV !== 'production' ? { message: err.message } : {})
      });
    }
  }
);

// Helper function to handle cocktail updates (shared between POST redirect and PUT)
const handleCocktailUpdate = async (req, res, cocktail) => {
  try {
    const itemId = req.body.itemId || req.itemId || cocktail.itemId;
    const payload = buildCocktailPayload(req.body);
    
    // Merge payload with existing cocktail data
    const merged = {
      name: payload.name || cocktail.name,
      concept: payload.concept || cocktail.concept,
      ingredients: cocktail.ingredients || '',
      globalIngredients: cocktail.globalIngredients || '',
      garnish: cocktail.garnish || '',
      category: payload.category || normalizeCategory(cocktail.category) || cocktail.category,
      regions: payload.regions?.length ? payload.regions : cocktail.regions,
      featured: typeof payload.featured === 'boolean' ? payload.featured : cocktail.featured,
      order: payload.order ?? cocktail.order
    };

    const validationErrors = validatePayload(merged, { 
      requireRegions: false, 
      requireConcept: false, 
      requireIngredients: false 
    });
    if (validationErrors.length) {
      cleanupUploadedFiles(req.files);
      return res.status(400).json({ message: 'Validation failed', errors: validationErrors });
    }

    const videoFile = req.files?.video?.[0];

    // Update itemId if missing
    if (!cocktail.itemId && itemId) {
      cocktail.itemId = itemId;
    }
    
    const resolvedItemNumber = Number.isFinite(req.body.itemNumber)
      ? req.body.itemNumber
      : parseItemNumber(itemId);
    if (Number.isFinite(resolvedItemNumber) && cocktail.itemNumber !== resolvedItemNumber) {
      cocktail.itemNumber = resolvedItemNumber;
    }

    cocktail.name = merged.name;
    cocktail.concept = merged.concept;
    cocktail.ingredients = merged.ingredients;
    cocktail.globalIngredients = merged.globalIngredients;
    cocktail.garnish = merged.garnish;
    cocktail.category = merged.category;
    cocktail.regions = merged.regions;
    cocktail.mapType = payload.mapType || cocktail.mapType || 'world';
    cocktail.featured = merged.featured;
    cocktail.order = merged.order;

    // Handle video file if uploaded
    if (videoFile) {
      const uploadedFilePath = path.join(videoDir, videoFile.filename);
      if (fs.existsSync(uploadedFilePath)) {
        try {
          const optimizationResult = await optimizeVideo(uploadedFilePath);
          if (optimizationResult.success && !optimizationResult.skipped) {
            console.log(`   🎬 Video optimized: ${optimizationResult.message}`);
          }
        } catch (optError) {
          console.warn(`   ⚠️  Video optimization failed (continuing anyway):`, optError.message);
        }
        
        // Delete old video if different
        if (cocktail.videoFile && cocktail.videoFile !== videoFile.filename) {
          const oldVideoPath = path.join(videoDir, cocktail.videoFile);
          try {
            if (fs.existsSync(oldVideoPath)) {
              fs.unlinkSync(oldVideoPath);
            }
          } catch (err) {
            console.warn(`   ⚠️  Failed to delete old video:`, err.message);
          }
        }
        cocktail.videoFile = videoFile.filename;
      }
    }

    await cocktail.save();
    console.log(`✅ Updated cocktail with itemId: ${itemId}, itemNumber: ${cocktail.itemNumber}`);
    res.json(cocktail);
  } catch (error) {
    console.error('Update cocktail error:', error);
    cleanupUploadedFiles(req.files);
    const errorMessage = error.code === 11000 
      ? 'Duplicate item - an item with this name or ID already exists'
      : error.name === 'ValidationError'
        ? `Validation error: ${Object.values(error.errors || {}).map(e => e.message).join(', ')}`
        : error.message || 'Server error';
    res.status(500).json({ message: errorMessage });
  }
};

// @route   POST /api/menu-items
// @desc    Create new menu item
// @access  Private (Editor)
router.post('/',
  authenticateToken,
  requireEditor,
  generateItemIdMiddleware,
  mediaUpload.fields([
    { name: 'video', maxCount: 1 }
  ]),
  async (req, res) => {
    try {
      const itemId = req.body.itemId || req.itemId;
      const itemNumber = Number.isFinite(req.body.itemNumber)
        ? req.body.itemNumber
        : parseItemNumber(itemId);
      
      // Check if a cocktail with this itemNumber already exists
      // This can happen if a previous save failed after creating the inventory row
      if (itemNumber && Number.isFinite(itemNumber)) {
        const existingCocktail = await Cocktail.findOne({ itemNumber });
        if (existingCocktail) {
          console.log(`⚠️ Found existing cocktail with itemNumber ${itemNumber}, redirecting to update`);
          // Redirect to PUT endpoint logic - update instead of create
          req.params = { id: existingCocktail._id.toString() };
          req.existingCocktail = existingCocktail;
          req.body.itemId = existingCocktail.itemId || itemId;
          req.body.itemNumber = itemNumber;
          req.itemId = existingCocktail.itemId || itemId;
          req.itemNumber = itemNumber;
          // Continue to update logic below
          return handleCocktailUpdate(req, res, existingCocktail);
        }
      }
      
      // Delete any existing files for this itemId/itemNumber (shouldn't happen, but safety check)
      deleteItemFiles(itemId, itemNumber);
      
      const payload = buildCocktailPayload(req.body);
      // For new items, only require name - other fields can be added later
      const validationErrors = validatePayload(payload, { 
        requireRegions: false, 
        requireConcept: false, 
        requireIngredients: false 
      });
      const videoFile = req.files?.video?.[0];

      console.log(`📹 POST /api/menu-items - Processing files:`);
      console.log(`   - req.files:`, req.files ? Object.keys(req.files) : 'none');
      console.log(`   - videoFile:`, videoFile ? {
        filename: videoFile.filename,
        originalname: videoFile.originalname,
        path: videoFile.path,
        size: videoFile.size
      } : 'none');

      // Video is optional for new items (can be added later)
      // Map snapshot is mandatory and will be generated automatically
      
      // Verify video file was saved correctly and optimize if needed
      if (videoFile) {
        const videoPath = path.join(videoDir, videoFile.filename);
        if (fs.existsSync(videoPath)) {
          console.log(`   ✅ Video file saved successfully to: ${videoPath}`);
          // Automatically optimize video for web playback
          try {
            const optimizationResult = await optimizeVideo(videoPath);
            if (optimizationResult.success && !optimizationResult.skipped) {
              console.log(`   🎬 Video optimized: ${optimizationResult.message}`);
            }
          } catch (optError) {
            console.warn(`   ⚠️  Video optimization failed (continuing anyway):`, optError.message);
          }
        } else {
          console.error(`   ❌ Video file NOT found at expected path: ${videoPath}`);
          console.error(`   ⚠️  Multer should have saved file directly to destination. Check multer configuration.`);
        }
      }

      if (validationErrors.length) {
        cleanupUploadedFiles(req.files);
        deleteItemFiles(itemId, itemNumber); // Clean up any uploaded files
        return res.status(400).json({ message: 'Validation failed', errors: validationErrors });
      }

      const lastCocktail = await Cocktail.findOne({
        category: payload.category,
        $or: activeStatusFilter
      }).sort({ order: -1 });
      const nextOrder = payload.order ?? (lastCocktail ? lastCocktail.order + 1 : 0);

      const cocktail = new Cocktail({
        itemId: itemId,
        itemNumber: itemNumber,
        name: payload.name,
        concept: payload.concept || '',
        ingredients: payload.ingredients || '',
        globalIngredients: payload.globalIngredients || '',
        garnish: payload.garnish || '',
        regions: payload.regions || [],
        mapType: payload.mapType || 'world',
        category: payload.category,
        featured: payload.featured || false,
        order: nextOrder,
        status: 'active',
        isActive: true,
        archivedAt: null,
        videoFile: videoFile ? videoFile.filename : null // Optional - can be added later
      });

      await cocktail.save();
      console.log(`✅ Created cocktail with itemId: ${itemId}, itemNumber: ${itemNumber}, name: ${payload.name}`);
      if (videoFile) console.log(`   - video: ${videoFile.filename}`);
      res.status(201).json(cocktail);
    } catch (error) {
      console.error('Create cocktail error:', error);
      cleanupUploadedFiles(req.files);
      if (req.body.itemId || req.itemId) {
        const errorItemId = req.body.itemId || req.itemId;
        const errorItemNumber = Number.isFinite(req.body.itemNumber) ? req.body.itemNumber : parseItemNumber(errorItemId);
        deleteItemFiles(errorItemId, errorItemNumber);
      }
      // Return more specific error message for debugging
      const errorMessage = error.code === 11000 
        ? 'Duplicate item - an item with this name or ID already exists'
        : error.name === 'ValidationError'
          ? `Validation error: ${Object.values(error.errors || {}).map(e => e.message).join(', ')}`
          : error.message || 'Server error';
      res.status(500).json({ message: errorMessage });
    }
  }
);

// Middleware to set itemId from existing cocktail for updates
const setItemIdFromCocktailMiddleware = async (req, res, next) => {
  try {
    const cocktail = await Cocktail.findById(req.params.id);
    if (!cocktail) {
      return res.status(404).json({ message: 'Cocktail not found' });
    }
    
    // Use existing itemId/itemNumber or generate new ones if missing (for migration)
    let itemId = cocktail.itemId;
    let itemNumber = cocktail.itemNumber;
    if (!itemId || !Number.isFinite(itemNumber)) {
      const nextIds = await getNextItemIdentifiers();
      itemId = itemId || nextIds.itemId;
      itemNumber = Number.isFinite(itemNumber) ? itemNumber : nextIds.itemNumber;
    }
    console.log(`🔧 Setting itemId for update: ${itemId} (cocktail: ${cocktail.name})`);
    
    // Set in multiple places to ensure multer can access it
    req.body.itemId = itemId;
    req.body.itemNumber = itemNumber;
    req.itemId = itemId;
    req.itemNumber = itemNumber;
    req.existingCocktail = cocktail; // Store for later use
    
    // Also set it directly on the request object for multer
    if (!req.itemId) {
      req.itemId = itemId;
    }
    
    next();
  } catch (error) {
    console.error('Error setting itemId from cocktail:', error);
    return res.status(500).json({ message: 'Error processing request' });
  }
};

// @route   PUT /api/menu-items/:id
// @desc    Update menu item
// @access  Private (Editor)
router.put('/:id',
  authenticateToken,
  requireEditor,
  setItemIdFromCocktailMiddleware,
  mediaUpload.fields([
    { name: 'video', maxCount: 1 }
  ]),
  async (req, res) => {
    try {
      const cocktail = req.existingCocktail;
      const itemId = req.body.itemId || req.itemId || cocktail.itemId;

      console.log('📥 PUT request body garnish:', req.body.garnish);
      const payload = buildCocktailPayload(req.body);
      console.log('📦 Built payload garnish:', payload.garnish);
      // Inventory is source of truth for shared fields; only keep MenuManager-only fields here
      const merged = {
        name: payload.name || cocktail.name, // Name used for ID/display; inventory stays authoritative
        concept: payload.concept || cocktail.concept,
        // Do NOT overwrite shared fields (ingredients, garnish, regions) in Cocktail; keep legacy values minimal
        ingredients: cocktail.ingredients || '', // keep existing legacy value only
        globalIngredients: cocktail.globalIngredients || '',
        garnish: cocktail.garnish || '',
        category: payload.category || normalizeCategory(cocktail.category) || cocktail.category,
        regions: cocktail.regions, // do not overwrite from payload; inventory owns regions
        featured: typeof payload.featured === 'boolean' ? payload.featured : cocktail.featured,
        order: payload.order ?? cocktail.order
      };

      // For updates, only require name - concept and ingredients can be added later
      const validationErrors = validatePayload(merged, { 
        requireRegions: false, 
        requireConcept: false, 
        requireIngredients: false 
      });
      if (validationErrors.length) {
        cleanupUploadedFiles(req.files);
        return res.status(400).json({ message: 'Validation failed', errors: validationErrors });
      }

      const videoFile = req.files?.video?.[0];

      // Update itemId if it was missing (migration case)
      if (!cocktail.itemId && itemId) {
        cocktail.itemId = itemId;
      }
  const resolvedItemNumber = Number.isFinite(req.body.itemNumber)
    ? req.body.itemNumber
    : parseItemNumber(itemId);
  if (Number.isFinite(resolvedItemNumber) && cocktail.itemNumber !== resolvedItemNumber) {
    cocktail.itemNumber = resolvedItemNumber;
  }

      cocktail.name = merged.name;
      cocktail.concept = merged.concept;
      // Do not overwrite shared fields in Cocktail; Inventory is source of truth
      cocktail.ingredients = merged.ingredients;
      cocktail.globalIngredients = merged.globalIngredients;
      cocktail.garnish = merged.garnish;
      cocktail.category = merged.category;
      cocktail.regions = merged.regions;
      cocktail.mapType = payload.mapType || cocktail.mapType || 'world';
      cocktail.featured = merged.featured;
      cocktail.order = merged.order;

      // Replace video file if new one uploaded
      if (videoFile) {
        console.log(`📹 Processing video upload for itemId ${itemId}:`);
        console.log(`   - Uploaded file: ${videoFile.filename}`);
        console.log(`   - Original name: ${videoFile.originalname}`);
        console.log(`   - File path: ${videoFile.path}`);
        console.log(`   - File size: ${videoFile.size} bytes`);
        console.log(`   - Current videoFile in DB: ${cocktail.videoFile}`);
        
        // Check if the uploaded file already has the correct name
        const uploadedFilePath = path.join(videoDir, videoFile.filename);
        const isSameFile = cocktail.videoFile === videoFile.filename;
        
        if (isSameFile && fs.existsSync(uploadedFilePath)) {
          // File already has the correct name and exists - don't delete or replace
          console.log(`   ✅ Video file already has correct name (${videoFile.filename}) and exists - keeping it`);
          // Optimize existing file if needed
          try {
            const optimizationResult = await optimizeVideo(uploadedFilePath);
            if (optimizationResult.success && !optimizationResult.skipped) {
              console.log(`   🎬 Video optimized: ${optimizationResult.message}`);
            }
          } catch (optError) {
            console.warn(`   ⚠️  Video optimization failed (continuing anyway):`, optError.message);
          }
          // No need to update cocktail.videoFile - it's already correct
        } else {
          // File has different name or doesn't exist - need to replace it
          console.log(`   🔄 Replacing video file...`);
          
          // Verify the file was actually saved by multer
          if (fs.existsSync(uploadedFilePath)) {
            console.log(`   ✅ File exists at: ${uploadedFilePath}`);
          } else {
            console.error(`   ❌ File NOT found at expected path: ${uploadedFilePath}`);
            console.error(`   ⚠️  Multer should have saved file directly to destination. Check multer configuration.`);
            throw new Error(`Video file not found at expected location: ${uploadedFilePath}`);
          }
          
          // Optimize video after it's in the final location
          if (fs.existsSync(uploadedFilePath)) {
            try {
              const optimizationResult = await optimizeVideo(uploadedFilePath);
              if (optimizationResult.success && !optimizationResult.skipped) {
                console.log(`   🎬 Video optimized: ${optimizationResult.message}`);
              }
            } catch (optError) {
              console.warn(`   ⚠️  Video optimization failed (continuing anyway):`, optError.message);
            }
          }
          
          // Delete the OLD video file (the one currently in database) if it's different
          if (cocktail.videoFile && cocktail.videoFile !== videoFile.filename) {
            const oldVideoPath = path.join(videoDir, cocktail.videoFile);
            try {
              if (fs.existsSync(oldVideoPath)) {
                fs.unlinkSync(oldVideoPath);
                console.log(`   🗑️  Deleted old video: ${cocktail.videoFile}`);
              } else {
                console.log(`   ℹ️  Old video file not found (may have been deleted): ${cocktail.videoFile}`);
              }
            } catch (err) {
              console.warn(`   ⚠️  Failed to delete old video ${cocktail.videoFile}:`, err.message);
            }
          }
          
          // Save new video filename
          cocktail.videoFile = videoFile.filename; // Will be item4.mp4 (or .mov, etc.)
          console.log(`   ✅ Updated video filename to: ${videoFile.filename}`);
        }
      } else {
        console.log(`⚠️  No video file uploaded for itemId ${itemId}`);
        console.log(`   - Current videoFile in DB: ${cocktail.videoFile}`);
        if (cocktail.videoFile) {
          const existingVideoPath = path.join(videoDir, cocktail.videoFile);
          if (!fs.existsSync(existingVideoPath)) {
            console.log(`   ⚠️  Video file ${cocktail.videoFile} is missing from ${videoDir}`);
          } else {
            console.log(`   ✅ Existing video file found: ${existingVideoPath}`);
          }
        }
      }


      await cocktail.save();
      console.log(`✅ Updated cocktail with itemId: ${itemId}`);
      res.json(cocktail);
    } catch (error) {
      console.error('Update cocktail error:', error);
      cleanupUploadedFiles(req.files);
      res.status(500).json({ message: 'Server error' });
    }
  }
);

// @route   DELETE /api/menu-items/:id
// @desc    Delete cocktail
// @access  Private (Editor)
router.delete('/:id', [authenticateToken, requireEditor], async (req, res) => {
  try {
    const cocktail = await Cocktail.findById(req.params.id);
    if (!cocktail) {
      return res.status(404).json({ message: 'Cocktail not found' });
    }

    // Delete all files for this itemId (video, map, and any other extensions)
    const itemId = cocktail.itemId;
    if (itemId) {
      console.log(`🗑️  Deleting all files for itemId: ${itemId}`);
      const deleteItemNumber = cocktail.itemNumber || parseItemNumber(itemId);
      deleteItemFiles(itemId, deleteItemNumber);
    } else {
      // Fallback: delete specific files if itemId is missing (legacy support)
      const deleteItemNumber = cocktail.itemNumber || parseItemNumber(itemId);
      console.log(`⚠️  No itemId found, deleting specific files: ${cocktail.videoFile}, ${cocktail.mapSnapshotFile}`);
      // Both files are in cocktails folder now
      if (cocktail.videoFile) {
        const videoPath = path.join(videoDir, cocktail.videoFile);
        try {
          if (fs.existsSync(videoPath)) {
            fs.unlinkSync(videoPath);
          }
        } catch (err) {
          console.warn(`⚠️  Failed to delete video ${cocktail.videoFile}:`, err.message);
        }
      }
      if (cocktail.mapSnapshotFile) {
        const mapPath = path.join(videoDir, cocktail.mapSnapshotFile);
        try {
          if (fs.existsSync(mapPath)) {
            fs.unlinkSync(mapPath);
          }
        } catch (err) {
          console.warn(`⚠️  Failed to delete map snapshot ${cocktail.mapSnapshotFile}:`, err.message);
        }
      }
    }

    // If this is a synced category, hard delete from inventory as well (all categories support bidirectional sync)
    const categoryToSheetKey = {
      'wine': 'wine',
      'beer': 'beer',
      'spirits': 'spirits',
      'cocktails': 'cocktails',
      'mocktails': 'mocktails',
      'premix': 'preMix'
    };
    
    if (categoryToSheetKey[cocktail.category]) {
      try {
        const InventorySheet = require('../models/InventorySheet');
        const sheetKey = categoryToSheetKey[cocktail.category];
        const sheet = await InventorySheet.findOne({ sheetKey: sheetKey });
        
        if (sheet) {
          const row = sheet.rows.find((rowItem) => {
            if (!rowItem.values) return false;
            const valuesMap = rowItem.values instanceof Map 
              ? rowItem.values 
              : new Map(Object.entries(rowItem.values || {}));
            const menuManagerId = valuesMap.get('menuManagerId');
            return menuManagerId && String(menuManagerId) === String(cocktail._id);
          });
          
          if (row) {
            // Hard delete: remove the row from the array
            const rowIndex = sheet.rows.findIndex(r => r._id.toString() === row._id.toString());
            if (rowIndex !== -1) {
              sheet.rows.splice(rowIndex, 1);
              sheet.markModified('rows');
              sheet.version += 1;
              await sheet.save();
              console.log(`✅ Hard deleted ${cocktail.category} from inventory: ${cocktail.name}`);
            }
          }
        }
      } catch (syncError) {
        console.error('Error syncing deletion to inventory:', syncError);
        // Don't fail the deletion if sync fails
      }
    }
    
    await cocktail.deleteOne();
    console.log(`✅ Deleted cocktail with itemId: ${itemId || 'unknown'}`);
    res.json({ message: 'Cocktail deleted successfully' });
  } catch (error) {
    console.error('Delete cocktail error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

router.post('/:id/archive', [authenticateToken, requireEditor], async (req, res) => {
  try {
    const cocktail = await Cocktail.findById(req.params.id);
    if (!cocktail) {
      return res.status(404).json({ message: 'Cocktail not found' });
    }

    cocktail.status = 'archived';
    cocktail.isActive = false;
    cocktail.archivedAt = new Date();
    await cocktail.save();

    res.json(cocktail);
  } catch (error) {
    console.error('Archive cocktail error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

router.post('/:id/restore', [authenticateToken, requireEditor], async (req, res) => {
  try {
    const cocktail = await Cocktail.findById(req.params.id);
    if (!cocktail) {
      return res.status(404).json({ message: 'Cocktail not found' });
    }

    cocktail.status = 'active';
    cocktail.isActive = true;
    cocktail.archivedAt = null;
    await cocktail.save();

    res.json(cocktail);
  } catch (error) {
    console.error('Restore cocktail error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   PUT /api/menu-items/:id/toggle
// @desc    Toggle cocktail active status
// @access  Private (Editor)
router.put('/:id/toggle', [authenticateToken, requireEditor], async (req, res) => {
  try {
    const cocktail = await Cocktail.findById(req.params.id);
    if (!cocktail) {
      return res.status(404).json({ message: 'Cocktail not found' });
    }

    cocktail.isActive = !cocktail.isActive;
    cocktail.status = cocktail.isActive ? 'active' : 'archived';
    cocktail.archivedAt = cocktail.isActive ? null : new Date();
    await cocktail.save();

    res.json(cocktail);
  } catch (error) {
    console.error('Toggle cocktail error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   PUT /api/menu-items/reorder
// @desc    Reorder cocktails
// @access  Private (Editor)
router.put('/reorder', [authenticateToken, requireEditor], async (req, res) => {
  try {
    const { category, cocktailIds } = req.body;

    if (!category || !Array.isArray(cocktailIds)) {
      return res.status(400).json({ message: 'Category and cocktailIds array required' });
    }

    // Update order for each cocktail
    const updatePromises = cocktailIds.map((id, index) => {
      return Cocktail.findByIdAndUpdate(id, { order: index }, { new: true });
    });

    await Promise.all(updatePromises);

    // Get updated cocktails
    const cocktails = await Cocktail.find({ category })
      .sort({ order: 1 });

    res.json(cocktails);
  } catch (error) {
    console.error('Reorder cocktails error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// OLD STAGE1/STAGE2 ENDPOINTS REMOVED - Using new video processing system in videoProcessing.js
// Stage media APIs (REMOVED - replaced by /api/video-processing/upload-base and /api/video-processing/process)
// All BGMV2 and stage1/stage2 code has been removed

// Preview generation endpoint - generates ffmpeg preview videos (still useful, but updated to not require stage1)
router.post('/:id/preview', [authenticateToken, requireEditor], async (req, res) => {
  try {
    const cocktail = await findCocktailByAnyId(req.params.id);
    if (!cocktail) {
      return res.status(404).json({ message: 'Cocktail not found' });
    }
    if (!cocktail.itemId) {
      return res.status(400).json({ message: 'ItemId missing. Run stage1 first.' });
    }

    const itemId = cocktail.itemId;
    // Check for .mp4 (expected format with white background)
    const rootStage1 = path.join(videoDir, `${itemId}.mp4`);

    if (!fs.existsSync(rootStage1)) {
      return res.status(400).json({ message: 'Source video not found.' });
    }
    
    const isWebM = false; // Now using MP4 format

    // Ensure preview directory exists
    const previewDir = await ensurePreviewDir(itemId);
    if (!previewDir) {
      return res.status(500).json({ message: 'Failed to create preview directory' });
    }

    // Clean up old previews (keep max 8)
    await cleanupOldPreviews(itemId, 8);

    // Generate unique preview filename with timestamp
    const timestamp = Date.now();
    const previewFile = path.join(previewDir, `preview_${timestamp}.mp4`);

    // Build filter graph from request body
    const filterGraph = buildFilterGraph(req.body || {}, isWebM);
    
    console.log(`🔍 Filter graph: ${filterGraph}`);
    console.log(`🔍 Request body:`, JSON.stringify(req.body));

    // Generate preview (short clip for speed - first 3 seconds)
    // Complex filters (with labels like [orig], [filt]) need -filter_complex, not -vf
    // Simple filters can use -vf
    const usesComplexFilters = filterGraph !== 'null' && filterGraph.includes('[') && filterGraph.includes(']');
    const filterFlag = filterGraph === 'null' ? '' : (usesComplexFilters ? `-filter_complex "${filterGraph}" -map "[out]"` : `-vf "${filterGraph}"`);
    
    // Use MP4 format for preview (H.264, near-lossless quality - slightly lower CRF for speed)
    const previewCmd = `ffmpeg -y -i "${rootStage1}" -t 3 ${filterFlag} -c:v libx264 -preset slow -crf 14 -profile:v high -level 4.1 -an -movflags +faststart "${previewFile}"`.trim().replace(/\s+/g, ' ');
    
    console.log(`🎬 Generating preview: ${previewCmd}`);
    console.log(`📁 Preview file path: ${previewFile}`);
    
    await execAsync(previewCmd);
    
    // Verify file was created
    if (!fs.existsSync(previewFile)) {
      throw new Error(`Preview file was not created: ${previewFile}`);
    }
    
    const fileStats = fs.statSync(previewFile);
    console.log(`✅ Preview file created: ${previewFile} (${fileStats.size} bytes)`);

    // Return preview URL
    const previewUrl = `/menu-items/${itemId}_preview/preview_${timestamp}.mp4`;
    console.log(`🔗 Preview URL: ${previewUrl}`);
    res.json({
      preview: previewUrl,
      itemId
    });
  } catch (error) {
    console.error('Preview generation error:', error);
    res.status(500).json({ message: 'Preview generation failed', error: error.message });
  }
});

// Cleanup preview directory
router.delete('/:id/preview', [authenticateToken, requireEditor], async (req, res) => {
  try {
    const cocktail = await findCocktailByAnyId(req.params.id);
    if (!cocktail || !cocktail.itemId) {
      return res.status(404).json({ message: 'Cocktail not found' });
    }

    await removePreviewDir(cocktail.itemId);
    res.json({ message: 'Preview directory cleaned up' });
  } catch (error) {
    console.error('Preview cleanup error:', error);
    res.status(500).json({ message: 'Preview cleanup failed', error: error.message });
  }
});

router.get('/:id/media', [authenticateToken, requireEditor], async (req, res) => {
  try {
    const cocktail = await findCocktailByAnyId(req.params.id);
    if (!cocktail) {
      return res.status(404).json({ message: 'Cocktail not found' });
    }
    const itemId = cocktail.itemId;
    const tempDir = path.join(videoDir, itemId);
    // Check for video files using itemNumber if available, otherwise itemId
    const itemNumber = cocktail.itemNumber || parseItemNumber(itemId);
    const videoFileName = itemNumber ? `${itemNumber}.mp4` : (itemId ? `${itemId}.mp4` : null);
    const rootVideo = videoFileName ? path.join(videoDir, videoFileName) : null;
    const hasVideo = rootVideo && fs.existsSync(rootVideo);
    
    // Check for temp processing folder (new video processing system uses items/temp_files/{itemNumber})
    const tempProcessingDir = itemNumber ? path.join(videoDir, 'temp_files', String(itemNumber)) : null;
    const tempDirExists = tempProcessingDir && fs.existsSync(tempProcessingDir);
    
    // Build video URL
    const videoUrl = hasVideo ? `/menu-items/${videoFileName}` : '';

    // If temp folder exists, video is still processing
    let processingStatus = cocktail.processingStatus || 'none';
    if (tempDirExists && !hasVideo) {
      // Temp folder exists but no final output yet = definitely processing
      processingStatus = 'processing';
    } else if (tempDirExists && hasVideo) {
      // Temp folder exists but output is ready = likely finishing up, still show processing
      processingStatus = 'processing';
    }

    res.json({
      itemId,
      itemNumber,
      stage1: videoUrl, // Keep 'stage1' key for backward compatibility with frontend
      background: '', // Background images no longer used
      filterParams: cocktail.filterParams || {},
      processingStatus: processingStatus,
      processingMessage: cocktail.processingMessage || (tempDirExists ? 'Processing Video' : ''),
      processingProgress: cocktail.processingProgress || (tempDirExists ? 50 : 0)
    });
  } catch (error) {
    console.error('Media fetch error:', error);
    res.status(500).json({ message: 'Failed to fetch media', error: error.message });
  }
});

// @route   GET /api/menu-items/categories
// @desc    Get all categories with cocktail counts
// @access  Public
router.get('/categories', async (req, res) => {
  try {
    const categories = await Cocktail.aggregate([
      {
        $group: {
          _id: '$category',
          count: { $sum: 1 },
          activeCount: {
            $sum: { $cond: ['$isActive', 1, 0] }
          },
          archivedCount: {
            $sum: {
              $cond: [{ $eq: ['$status', 'archived'] }, 1, 0]
            }
          }
        }
      },
      {
        $project: {
          category: '$_id',
          count: 1,
          activeCount: 1,
          archivedCount: 1,
          _id: 0
        }
      },
      {
        $sort: { category: 1 }
      }
    ]);

    res.json(categories);
  } catch (error) {
    console.error('Get categories error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;


