const express = require('express');
const multer = require('multer');
const path = require('path');
const Recipe = require('../models/Recipe');
const InventorySheet = require('../models/InventorySheet');
const { applyRowValues, mapValuesToPlain, applyFormulas } = require('../utils/inventoryHelpers');
const { normalizeRecipePayload } = require('../utils/recipeMath');
const {
  ensureUploadDirs,
  videoDir,
  deleteUpload
} = require('../utils/fileStorage');
const { optimizeVideo } = require('../utils/videoOptimizer');

const router = express.Router();

ensureUploadDirs();

// Multer configuration for video uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    return cb(null, videoDir);
  },
  filename: (req, file, cb) => {
    const ext = (path.extname(file.originalname) || '').toLowerCase();
    // For POST, use timestamp; for PUT, use recipe ID
    const recipeId = req.params.id || `recipe-${Date.now()}`;
    const filename = `${recipeId}${ext}`;
    cb(null, filename);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 500 * 1024 * 1024 }, // 500MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = /\.(mp4|mov|m4v|webm|avi|mkv)$/i;
    if (allowedTypes.test(file.originalname)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid video file type'));
    }
  }
});

const DEFAULT_INGREDIENT_SHEETS = ['spirits', 'dryStock', 'preMix'];

router.get('/', async (req, res, next) => {
  try {
    const { type, itemNumber } = req.query;
    const filter = {};
    if (type) {
      filter.type = type;
    }
    // Filter by itemNumber if provided
    if (itemNumber !== undefined && itemNumber !== null) {
      const num = Number(itemNumber);
      if (Number.isFinite(num)) {
        filter.itemNumber = num;
      }
    }
    const recipes = await Recipe.find(filter).sort({ updatedAt: -1 }).lean();
    console.log('GET recipes - first recipe keys:', recipes[0] ? Object.keys(recipes[0]) : 'no recipes');
    console.log('GET recipes - first recipe backgroundColor:', recipes[0]?.backgroundColor);
    
    // Use stored totals - no recalculation
    const recipesWithUpdatedTotals = recipes.map((recipe) => {
      const bgColor = recipe.backgroundColor || '#e5e5e5';
      return {
        ...recipe,
        backgroundColor: bgColor,
        totals: recipe.totals || { volumeOz: 0, costEach: 0 }
      };
    });
    
    res.json({ recipes: recipesWithUpdatedTotals });
  } catch (error) {
    next(error);
  }
});

router.get('/ingredients', async (req, res, next) => {
  try {
    const { sheetKeys } = req.query;
    const keys = sheetKeys
      ? sheetKeys
          .split(',')
          .map((key) => key.trim())
          .filter(Boolean)
      : DEFAULT_INGREDIENT_SHEETS;
    const sheets = await InventorySheet.find({ sheetKey: { $in: keys } })
      .select('sheetKey name columns rows updatedAt');
    const items = [];
    sheets.forEach((sheet) => {
      const rows = Array.isArray(sheet.rows) ? sheet.rows : [];
      rows.forEach((row) => {
        if (row.isDeleted) return;
        // Apply formulas to get calculated values (like ounceCost for pre-mix)
        // Convert row values to Map format for applyFormulas
        let valuesMap = row.values;
        if (!(valuesMap instanceof Map)) {
          valuesMap = new Map(Object.entries(valuesMap || {}));
        }
        const rowForFormulas = { values: valuesMap };
        if (sheet.columns) {
          applyFormulas(sheet, rowForFormulas);
        }
        // Convert back to plain object
        const values = mapValuesToPlain(rowForFormulas.values);
        items.push({
          id: `${sheet.sheetKey}:${row._id}`,
          sheetKey: sheet.sheetKey,
          rowId: row._id,
          name: values.name || values.item || '',
          values,
          updatedAt: row.updatedAt,
          sheetUpdatedAt: sheet.updatedAt
        });
      });
    });
    res.json({ items });
  } catch (error) {
    next(error);
  }
});

router.get('/ingredients/search', async (req, res, next) => {
  try {
    const { sheetKeys, query = '', limit = 20, ids } = req.query;
    const keys = sheetKeys
      ? sheetKeys
          .split(',')
          .map((key) => key.trim())
          .filter(Boolean)
      : DEFAULT_INGREDIENT_SHEETS;
    const limitValue = Math.max(1, Math.min(Number(limit) || 20, 100));
    const trimmedQuery = String(query || '').trim();
    const requestedIds = typeof ids === 'string' && ids.length
      ? ids
          .split(',')
          .map((id) => id.trim())
          .filter(Boolean)
      : [];

    if (!trimmedQuery && !requestedIds.length) {
      return res.json({ items: [] });
    }

    const sheets = await InventorySheet.find({ sheetKey: { $in: keys } })
      .select('sheetKey name columns rows updatedAt');

    const makeItemPayload = (sheet, row) => {
      // Apply formulas to get calculated values (like ounceCost for pre-mix)
      // Convert lean row to a format that applyFormulas can work with
      const rowDoc = row.toObject ? row : row;
      if (sheet.columns && rowDoc.values) {
        // If values is a Map, applyFormulas will work with it
        // If it's a plain object, convert to Map temporarily
        const originalValues = rowDoc.values;
        if (!(originalValues instanceof Map)) {
          rowDoc.values = new Map(Object.entries(originalValues || {}));
        }
        applyFormulas(sheet, rowDoc);
        // Convert back to plain object
        if (rowDoc.values instanceof Map) {
          rowDoc.values = Object.fromEntries(rowDoc.values.entries());
        }
      }
      const values = mapValuesToPlain(rowDoc.values || row.values);
      const name = values.name || values.item || '';
      if (!name) return null;
      return {
        id: `${sheet.sheetKey}:${row._id}`,
        sheetKey: sheet.sheetKey,
        rowId: row._id,
        name,
        values,
        updatedAt: row.updatedAt,
        sheetUpdatedAt: sheet.updatedAt
      };
    };

    const items = [];

    if (requestedIds.length) {
      const targets = new Map();
      requestedIds.forEach((id) => targets.set(id, null));
      sheets.forEach((sheet) => {
        const rows = Array.isArray(sheet.rows) ? sheet.rows : [];
        rows.forEach((row) => {
          if (row.isDeleted) return;
          const key = `${sheet.sheetKey}:${row._id}`;
          if (!targets.has(key)) return;
          const payload = makeItemPayload(sheet, row);
          if (payload) {
            targets.set(key, payload);
          }
        });
      });
      requestedIds.forEach((id) => {
        const payload = targets.get(id);
        if (payload) {
          items.push(payload);
        }
      });
      return res.json({ items });
    }

    const queryLower = trimmedQuery.toLowerCase();
    let reachedLimit = false;

    sheets.forEach((sheet) => {
      if (reachedLimit) return;
      const rows = Array.isArray(sheet.rows) ? sheet.rows : [];
      rows.forEach((row) => {
        if (reachedLimit) return;
        if (row.isDeleted) return;
        const payload = makeItemPayload(sheet, row);
        if (!payload) return;
        if (!payload.name.toLowerCase().includes(queryLower)) return;
        items.push(payload);
        if (items.length >= limitValue) {
          reachedLimit = true;
        }
      });
    });

    res.json({ items });
  } catch (error) {
    next(error);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const recipe = await Recipe.findById(req.params.id).lean();
    if (!recipe) {
      return res.status(404).json({ message: 'Recipe not found.' });
    }
    // Ensure backgroundColor is included
    const bgColor = recipe.backgroundColor || '#e5e5e5';
    console.log('GET single recipe backgroundColor from DB:', recipe.backgroundColor, 'using:', bgColor);
    const recipeWithColor = {
      ...recipe,
      backgroundColor: bgColor
    };
    res.json({ recipe: recipeWithColor });
  } catch (error) {
    next(error);
  }
});

router.post('/', upload.single('video'), async (req, res, next) => {
  try {
    let body = req.body;
    
    // Ensure title is present and not empty (FormData sends it as a string)
    if (!body.title || (typeof body.title === 'string' && !body.title.trim())) {
      return res.status(400).json({
        message: 'Recipe title is required',
        errors: [{ field: 'title', message: 'Recipe title cannot be empty' }]
      });
    }
    
    // Handle FormData (for all recipe types with video upload)
    // Parse JSON string fields from FormData
    const jsonFields = ['metadata', 'items', 'totals', 'batch'];
    jsonFields.forEach(field => {
      if (typeof body[field] === 'string') {
        try {
          body[field] = JSON.parse(body[field]);
        } catch (e) {
          if (field === 'metadata') {
            body[field] = {};
          } else if (field === 'items') {
            body[field] = [];
          } else if (field === 'totals') {
            body[field] = { volumeOz: 0, costEach: 0 };
          } else if (field === 'batch') {
            body[field] = { size: 0, unit: 'oz', yieldCount: 0 };
          }
        }
      }
    });
    
    // Handle video upload if present
    if (req.file) {
      // Add video URL to payload
      if (!body.video) {
        body.video = {};
      }
      const videoFilename = req.file.filename;
      const videoUrl = `/menu-items/${videoFilename}`;
      body.video.videoUrl = videoUrl;
      
      // Optimize video in background
      optimizeVideo(req.file.path).catch(err => {
        console.error('Video optimization error:', err);
      });
    }
    
    const payload = await normalizeRecipePayload(body);
    const recipe = await Recipe.create(payload);
    
    // If video was uploaded, update the filename to use recipe ID
    if (req.file && recipe._id) {
      const ext = path.extname(req.file.filename);
      const newFilename = `${recipe._id}${ext}`;
      const oldPath = req.file.path;
      const newPath = path.join(videoDir, newFilename);
      
      try {
        const fs = require('fs');
        if (fs.existsSync(oldPath)) {
          fs.renameSync(oldPath, newPath);
          recipe.video = recipe.video || {};
          recipe.video.videoUrl = `/menu-items/${newFilename}`;
          await recipe.save();
        }
      } catch (renameError) {
        console.error('Error renaming video file:', renameError);
      }
    }
    
    try {
      await syncRecipeInventoryRow(recipe);
    } catch (syncError) {
      console.error('Error syncing recipe inventory row:', syncError);
      // Don't fail the save if sync fails
    }
    // If this is a cocktail or mocktail, update pre-mix rows to reference it
    if (recipe.type === 'cocktail' || recipe.type === 'mocktail') {
      try {
        await syncCocktailToPreMixRows(recipe);
      } catch (syncError) {
        console.error('Error syncing cocktail/mocktail to pre-mix rows:', syncError);
        // Don't fail the save if sync fails
      }
    }
    const recipeObj = recipe.toObject({ versionKey: false });
    res.status(201).json({ recipe: recipeObj });
  } catch (error) {
    console.error('Recipe POST error:', error);
    if (error.message && error.message.includes('title is required')) {
      return res.status(400).json({
        message: 'Recipe title is required',
        errors: [{ field: 'title', message: 'Recipe title cannot be empty' }]
      });
    }
    if (error.name === 'ValidationError') {
      return res.status(400).json({
        message: 'Validation failed',
        errors: Object.keys(error.errors || {}).map((key) => ({
          field: key,
          message: error.errors[key].message
        }))
      });
    }
    next(error);
  }
});

router.put('/:id', async (req, res, next) => {
  try {
    // Check if the request is multipart/form-data
    const isMultipart = req.is('multipart/form-data');
    
    // Conditionally apply multer middleware only for multipart requests
    if (isMultipart) {
      await new Promise((resolve, reject) => {
        upload.single('video')(req, res, (err) => {
          if (err) return reject(err);
          resolve();
        });
      });
    }
    
    let body = req.body;
    
    console.log('PUT /recipes/:id - Request received');
    console.log('Content-Type:', req.get('Content-Type'));
    console.log('Is multipart:', isMultipart);
    console.log('Body keys:', Object.keys(body || {}));
    console.log('Body type:', typeof body);
    console.log('Has file:', !!req.file);
    console.log('Title:', body?.title);
    
    // Ensure body exists and has data
    if (!body || Object.keys(body).length === 0) {
      console.error('❌ Request body is empty');
      return res.status(400).json({
        message: 'Request body is empty. Please ensure Content-Type is set correctly.',
        error: 'Empty body'
      });
    }
    
    // Ensure title is present and not empty (FormData sends it as a string)
    if (!body.title || (typeof body.title === 'string' && !body.title.trim())) {
      return res.status(400).json({
        message: 'Recipe title is required',
        errors: [{ field: 'title', message: 'Recipe title cannot be empty' }]
      });
    }
    
    // Handle both FormData (strings) and JSON (objects)
    // Parse JSON string fields from FormData, or use objects if already parsed
    const jsonFields = ['metadata', 'items', 'totals', 'batch'];
    jsonFields.forEach(field => {
      if (typeof body[field] === 'string') {
        // FormData - parse JSON string
        try {
          body[field] = JSON.parse(body[field]);
        } catch (e) {
          console.warn(`Failed to parse ${field} as JSON:`, e.message);
          if (field === 'metadata') {
            body[field] = {};
          } else if (field === 'items') {
            body[field] = [];
          } else if (field === 'totals') {
            body[field] = { volumeOz: 0, costEach: 0 };
          } else if (field === 'batch') {
            body[field] = { size: 0, unit: 'oz', yieldCount: 0 };
          }
        }
      } else if (!body[field]) {
        // Set defaults if field is missing (for both FormData and JSON)
        if (field === 'metadata') {
          body[field] = {};
        } else if (field === 'items') {
          body[field] = [];
        } else if (field === 'totals') {
          body[field] = { volumeOz: 0, costEach: 0 };
        } else if (field === 'batch') {
          body[field] = { size: 0, unit: 'oz', yieldCount: 0 };
        }
      }
      // If field is already an object (from JSON), use it as-is - no parsing needed
    });
    
    console.log('Body after parsing:', {
      title: body.title,
      type: body.type,
      hasMetadata: !!body.metadata,
      itemsCount: Array.isArray(body.items) ? body.items.length : 'not array',
      hasTotals: !!body.totals,
      hasBatch: !!body.batch
    });
    
    // Load existing recipe first to preserve all fields and check for old video
    const existingRecipe = await Recipe.findById(req.params.id).lean();
    if (!existingRecipe) {
      return res.status(404).json({ message: 'Recipe not found.' });
    }
    
    // Merge existing recipe data with new data from FormData
    // This ensures we don't lose any fields when only updating the video
    const mergedBody = {
      ...existingRecipe,
      ...body
    };
    
    // Re-parse JSON fields in merged body if they came as strings (FormData)
    // If they're already objects (JSON), use them as-is
    jsonFields.forEach(field => {
      if (typeof mergedBody[field] === 'string') {
        // FormData - parse JSON string
        try {
          mergedBody[field] = JSON.parse(mergedBody[field]);
        } catch (e) {
          // Keep existing value if parsing fails
          if (existingRecipe[field]) {
            mergedBody[field] = existingRecipe[field];
          }
        }
      } else if (!mergedBody[field] && existingRecipe[field]) {
        // Use existing value if new value is missing (for both FormData and JSON)
        mergedBody[field] = existingRecipe[field];
      }
      // If field is already an object (from JSON), use it as-is - no parsing needed
    });
    
    // Handle video upload if present
    if (req.file) {
      // Add video URL to payload
      if (!mergedBody.video) {
        mergedBody.video = {};
      }
      const videoFilename = req.file.filename;
      const videoUrl = `/menu-items/${videoFilename}`;
      mergedBody.video.videoUrl = videoUrl;
      
      // Delete old video if it exists
      if (existingRecipe?.video?.videoUrl) {
        const oldVideoPath = path.join(videoDir, path.basename(existingRecipe.video.videoUrl));
        deleteUpload(oldVideoPath).catch(err => {
          console.warn('Failed to delete old video:', err);
        });
      }
      
      // Optimize video in background
      optimizeVideo(req.file.path).catch(err => {
        console.error('Video optimization error:', err);
      });
    }
    
    let payload;
    try {
      payload = await normalizeRecipePayload(mergedBody);
    } catch (normalizeError) {
      console.error('Error normalizing recipe payload:', normalizeError);
      console.error('Normalize error stack:', normalizeError.stack);
      return res.status(400).json({
        message: normalizeError.message || 'Invalid recipe data',
        error: process.env.NODE_ENV === 'development' ? normalizeError.toString() : {}
      });
    }
    
    const recipe = await Recipe.findById(req.params.id);
    if (!recipe) {
      return res.status(404).json({ message: 'Recipe not found.' });
    }
    const wasCocktail = recipe.type === 'cocktail';
    const wasMocktail = recipe.type === 'mocktail';
    const oldTitle = recipe.title;
    console.log('PUT payload totals:', payload.totals);
    recipe.set(payload);
    recipe.backgroundColor = recipe.backgroundColor || '#e5e5e5';
    // Explicitly ensure totals are set
    if (payload.totals) {
      recipe.totals = payload.totals;
      recipe.markModified('totals');
    }
    console.log('Recipe totals before save:', recipe.totals);
    await recipe.save();
    console.log('Recipe totals after save:', recipe.totals);
    // Pass payload totals to sync function to ensure we use the most up-to-date value
    try {
      await syncRecipeInventoryRow(recipe, payload.totals);
    } catch (syncError) {
      console.error('Error syncing recipe inventory row:', syncError);
      // Don't fail the save if sync fails
    }
    // If this is a cocktail or mocktail (or was one), update pre-mix rows
    if (recipe.type === 'cocktail' || recipe.type === 'mocktail') {
      try {
        await syncCocktailToPreMixRows(recipe);
      } catch (syncError) {
        console.error('Error syncing cocktail/mocktail to pre-mix rows:', syncError);
        // Don't fail the save if sync fails
      }
    } else if ((wasCocktail || wasMocktail) && recipe.type !== 'cocktail' && recipe.type !== 'mocktail') {
      // Recipe type changed from cocktail/mocktail to something else - clear references
      const oldType = wasCocktail ? 'cocktail' : 'mocktail';
      try {
        await syncCocktailToPreMixRows({ ...recipe.toObject(), title: oldTitle, type: oldType });
      } catch (syncError) {
        console.error('Error clearing cocktail/mocktail references:', syncError);
        // Don't fail the save if sync fails
      }
    }
    // Reload the recipe to ensure we have the latest data including totals
    const savedRecipe = await Recipe.findById(req.params.id).lean();
    if (!savedRecipe) {
      return res.status(404).json({ message: 'Recipe not found after save.' });
    }
    // Ensure totals are included
    console.log('PUT response recipe totals:', savedRecipe.totals);
    res.json({ recipe: savedRecipe });
  } catch (error) {
    console.error('Recipe PUT error:', error);
    console.error('Error name:', error.name);
    console.error('Error message:', error.message);
    console.error('Error stack:', error.stack);
    console.error('Request body keys:', Object.keys(req.body || {}));
    console.error('Request file:', req.file ? { filename: req.file.filename, size: req.file.size } : 'none');
    
    // Handle specific error types
    if (error.message && error.message.includes('title is required')) {
      return res.status(400).json({
        message: 'Recipe title is required',
        errors: [{ field: 'title', message: 'Recipe title cannot be empty' }]
      });
    }
    if (error.name === 'ValidationError') {
      return res.status(400).json({
        message: 'Validation failed',
        errors: Object.keys(error.errors || {}).map((key) => ({
          field: key,
          message: error.errors[key].message
        }))
      });
    }
    
    // Return detailed error response
    const errorResponse = {
      message: error.message || 'Something went wrong!',
      error: error.toString()
    };
    
    // Include stack trace in development
    if (process.env.NODE_ENV !== 'production') {
      errorResponse.stack = error.stack;
      errorResponse.details = {
        name: error.name,
        bodyKeys: Object.keys(req.body || {}),
        hasFile: !!req.file
      };
    }
    
    return res.status(500).json(errorResponse);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const recipe = await Recipe.findById(req.params.id).lean();
    if (!recipe) {
      return res.status(404).json({ message: 'Recipe not found.' });
    }
    // If this is a cocktail or mocktail, clear references from pre-mix rows before deleting
    if (recipe.type === 'cocktail' || recipe.type === 'mocktail') {
      const preMixSheet = await InventorySheet.findOne({ sheetKey: 'preMix' });
      if (preMixSheet) {
        const columnsByKey = preMixSheet.columns.reduce((acc, column) => {
          acc[column.key] = column;
          return acc;
        }, {});
        const cocktailTitle = recipe.title || '';
        let hasChanges = false;
        
        preMixSheet.rows.forEach((row) => {
          const recipeId = getRowRecipeId(row);
          if (!recipeId) return; // Only update recipe rows
          
          const valuesMap = ensureRowValuesMap(row);
          const currentCocktail = valuesMap instanceof Map 
            ? valuesMap.get('cocktail')
            : (row.values instanceof Map ? row.values.get('cocktail') : row.values?.cocktail);
          
          if (currentCocktail === cocktailTitle) {
            applyRowValues(row, { cocktail: '' }, columnsByKey);
            hasChanges = true;
          }
        });
        
        if (hasChanges) {
          preMixSheet.markModified('rows');
          await preMixSheet.save();
        }
      }
    }
    await Recipe.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

const SHEET_KEY_BY_RECIPE_TYPE = {
  premix: 'preMix',
  cocktail: 'cocktails',
  mocktail: 'mocktails'
};

const getRowRecipeId = (row) => {
  if (!row?.values) {
    return null;
  }
  if (row.values instanceof Map) {
    return row.values.get('recipeId');
  }
  return row.values.recipeId;
};

const ensureRowValuesMap = (row) => {
  if (!row.values) {
    row.values = new Map();
    return row.values;
  }
  if (row.values instanceof Map) {
    return row.values;
  }
  const cloned = new Map(Object.entries(row.values));
  row.values = cloned;
  return cloned;
};

const computeOunceCost = (recipe) => {
  const totalOz = Number(recipe.totals?.volumeOz) || 0;
  const costEach = Number(recipe.totals?.costEach) || 0;
  if (totalOz <= 0) return null;
  return Number((costEach / totalOz).toFixed(3));
};

const syncRecipeInventoryRow = async (recipe, payloadTotals = null) => {
  const sheetKey = SHEET_KEY_BY_RECIPE_TYPE[recipe.type];
  if (!sheetKey) return;
  const sheet = await InventorySheet.findOne({ sheetKey });
  if (!sheet) return;

  const columnsByKey = sheet.columns.reduce((acc, column) => {
    acc[column.key] = column;
    return acc;
  }, {});

  // Find existing inventory row - try multiple methods for robustness
  let row = null;
  let linkedCocktail = null; // Store the linked cocktail for later use (regions, etc.)
  
  // For cocktails/mocktails, find by itemNumber (primary method)
  if (sheetKey === 'cocktails' || sheetKey === 'mocktails') {
    // NEW: Use recipe.itemNumber directly if available (most efficient)
    if (recipe.itemNumber && Number.isFinite(recipe.itemNumber)) {
      // Find inventory row by itemNumber directly
      row = sheet.rows.find((rowItem) => {
        const valuesMap = ensureRowValuesMap(rowItem);
        const rowItemNumber = valuesMap.get('itemNumber');
        return rowItemNumber && Number(rowItemNumber) === Number(recipe.itemNumber);
      });
      
      if (row) {
        console.log(`✅ Found inventory row for recipe "${recipe.title}" via itemNumber ${recipe.itemNumber}`);
        
        // Also get linked cocktail for regions (if needed)
        const Cocktail = require('../models/Cocktail');
        try {
          const category = recipe.type === 'cocktail' ? 'cocktails' : 'mocktails';
          linkedCocktail = await Cocktail.findOne({
            itemNumber: recipe.itemNumber,
            category: category,
            status: { $ne: 'archived' }
          });
        } catch (err) {
          console.warn('Error finding cocktail by itemNumber:', err);
        }
      }
    }
    
    // FALLBACK: Find cocktail by recipe title to get itemNumber (for backward compatibility)
    if (!row) {
      const Cocktail = require('../models/Cocktail');
      try {
        const category = recipe.type === 'cocktail' ? 'cocktails' : 'mocktails';
        linkedCocktail = await Cocktail.findOne({
          name: { $regex: new RegExp(`^${recipe.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
          category: category,
          status: { $ne: 'archived' }
        });
        
        if (linkedCocktail && linkedCocktail.itemNumber) {
          // Find inventory row by itemNumber (primary identifier)
          row = sheet.rows.find((rowItem) => {
            const valuesMap = ensureRowValuesMap(rowItem);
            const rowItemNumber = valuesMap.get('itemNumber');
            return rowItemNumber && Number(rowItemNumber) === Number(linkedCocktail.itemNumber);
          });
          
          if (row) {
            console.log(`✅ Found inventory row for recipe "${recipe.title}" via itemNumber ${linkedCocktail.itemNumber} (from cocktail lookup)`);
          }
        }
      } catch (err) {
        console.warn('Error finding cocktail by recipe title:', err);
      }
    }
  }
  
  // Fallback: Find by recipeId (for preMix or if itemNumber method didn't work)
  if (!row) {
    row = sheet.rows.find((rowItem) => {
      const recipeId = getRowRecipeId(rowItem);
      return recipeId && String(recipeId) === String(recipe._id);
    });
    
    if (row) {
      console.log(`✅ Found inventory row for recipe "${recipe.title}" via recipeId`);
    }
  }

  // CRITICAL: Recipe sync NEVER creates inventory rows - only updates existing ones
  // MenuManager is the single source of truth for creating inventory rows
  // This applies to ALL categories for consistency
  if (!row) {
    console.log(`⚠️  Recipe sync: No existing inventory row found for recipe "${recipe.title}" (${recipe.type}). Recipe sync cannot create inventory rows - MenuManager must create them first.`);
    return; // Exit early - don't create new rows for any category
  }

  // Ensure recipe is a Mongoose document with items
  let recipeItems = recipe.items;
  if (!recipeItems && recipe.toObject) {
    const recipeObj = recipe.toObject();
    recipeItems = recipeObj.items;
  }
  if (!Array.isArray(recipeItems)) {
    recipeItems = [];
  }

  // Name comes from MenuManager (cocktail.name), not from recipe.title
  // Recipe sync should not overwrite name - it comes from MenuManager via extractSharedFieldsForInventory
  const updateValues = {
    // Don't set name here - it comes from MenuManager on save
  };

  if (sheetKey === 'preMix') {
    updateValues.type = recipe.metadata?.type || '';
    updateValues.cocktail = recipe.metadata?.cocktail || '';
    
    // Get volume and cost totals - prefer payloadTotals if provided (most up-to-date)
    let volumeOz = payloadTotals?.volumeOz;
    let costEach = payloadTotals?.costEach;
    if (volumeOz === undefined || volumeOz === null) {
      volumeOz = recipe.totals?.volumeOz;
    }
    if (costEach === undefined || costEach === null) {
      costEach = recipe.totals?.costEach;
    }
    
    // Calculate ounceCost as costEach / volumeOz (cost per ounce)
    let ounceCost = null;
    if (volumeOz && volumeOz > 0 && costEach && costEach > 0) {
      ounceCost = Number((costEach / volumeOz).toFixed(2));
    }
    
    updateValues.ounceCost = ounceCost !== null ? ounceCost : 0;
    
    console.log(`✅ Synced ${recipe.type} "${recipe.title}" to inventory:`, {
      costEach,
      volumeOz,
      ounceCost: updateValues.ounceCost,
      source: payloadTotals ? 'payload' : 'recipe'
    });
  } else if (sheetKey === 'cocktails' || sheetKey === 'mocktails') {
    // For cocktails/mocktails, map metadata.type to the 'style' column (which displays as TYPE)
    const cocktailType = recipe.metadata?.type || '';
    console.log(`Syncing ${recipe.type} recipe ${recipe._id}: type="${cocktailType}" to style column`);
    updateValues.style = cocktailType;
    updateValues.ice = recipe.metadata?.ice || '';
    updateValues.garnish = recipe.metadata?.garnish || '';
    
    // Get regions from the linked Cocktail model (not recipe metadata)
    // Regions are stored on the Cocktail, not in recipe metadata
    let regions = [];
    if (linkedCocktail && Array.isArray(linkedCocktail.regions)) {
      regions = linkedCocktail.regions;
    }
    
    // Format regions array as comma-separated string
    if (regions.length > 0) {
      updateValues.region = regions.join(', ');
    } else {
      updateValues.region = '';
    }
    
    // Get volume and cost totals - prefer payloadTotals if provided (most up-to-date)
    let volumeOz = payloadTotals?.volumeOz;
    let costEach = payloadTotals?.costEach;
    if (volumeOz === undefined || volumeOz === null) {
      volumeOz = recipe.totals?.volumeOz;
    }
    if (costEach === undefined || costEach === null) {
      costEach = recipe.totals?.costEach;
    }
    
    // If totals not available, calculate from items
    if ((volumeOz === undefined || volumeOz === null || volumeOz === 0) && recipeItems && recipeItems.length > 0) {
      volumeOz = recipeItems.reduce((sum, item) => {
        const toOz = item.conversions?.toOz || 0;
        return sum + (Number.isFinite(toOz) ? toOz : 0);
      }, 0);
      volumeOz = Number(volumeOz.toFixed(3));
    }
    if ((costEach === undefined || costEach === null || costEach === 0) && recipeItems && recipeItems.length > 0) {
      costEach = recipeItems.reduce((sum, item) => {
        const extendedCost = item.extendedCost || 0;
        return sum + (Number.isFinite(extendedCost) ? extendedCost : 0);
      }, 0);
      costEach = Number(costEach.toFixed(2));
    }
    
    // Store volume in sumOz column
    updateValues.sumOz = volumeOz !== undefined && volumeOz !== null ? Number(volumeOz.toFixed(2)) : 0;
    
    // unitCost should be the total cost per serving (costEach), not cost per ounce
    // This matches what the recipe builder shows at the bottom: total $/amt
    updateValues.unitCost = costEach !== undefined && costEach !== null ? Number(costEach.toFixed(2)) : 0;
    
    console.log(`✅ Synced ${recipe.type} "${recipe.title}" to inventory:`, {
      sumOz: updateValues.sumOz,
      unitCost: updateValues.unitCost,
      costEach,
      volumeOz,
      source: payloadTotals ? 'payload' : 'recipe'
    });
  }

  const valuesMap = ensureRowValuesMap(row);
  
  // UNIFIED LOGIC FOR ALL CATEGORIES:
  // Recipe sync only updates recipe-specific fields on existing inventory rows
  // MenuManager is the single source of truth for creating inventory rows and managing item data
  
  console.log(`📝 Recipe sync: Updating inventory row for "${recipe.title}" with values:`, updateValues);
  
  // Set recipe linkage (for all categories)
  valuesMap.set('recipeId', String(recipe._id));
  valuesMap.set('recipeType', recipe.type);
  
  // Update recipe-specific fields (totals, style, etc.)
  // This preserves all other fields that MenuManager manages
  applyRowValues(row, updateValues, columnsByKey);
  
  // Verify values were set
  console.log(`✅ Recipe sync: Applied values to inventory row:`, {
    style: valuesMap.get('style'),
    ice: valuesMap.get('ice'),
    garnish: valuesMap.get('garnish'),
    region: valuesMap.get('region'),
    sumOz: valuesMap.get('sumOz'),
    unitCost: valuesMap.get('unitCost')
  });
  
  // For cocktails/mocktails, name comes from MenuManager on save (not from recipe sync)
  // Recipe sync should NOT set name - it comes from MenuManager via extractSharedFieldsForInventory on save
  // Only ensure menuManagerId is set for linking
  if ((sheetKey === 'cocktails' || sheetKey === 'mocktails')) {
    const rowItemNumber = valuesMap.get('itemNumber');
    if (rowItemNumber && Number.isFinite(Number(rowItemNumber))) {
      const Cocktail = require('../models/Cocktail');
      try {
        const cocktail = await Cocktail.findOne({
          itemNumber: Number(rowItemNumber),
          category: recipe.type === 'cocktail' ? 'cocktails' : 'mocktails',
          status: { $ne: 'archived' }
        });
        
        if (cocktail) {
          // Ensure menuManagerId is set (backup identifier)
          valuesMap.set('menuManagerId', String(cocktail._id));
          // Name is NOT set here - it comes from MenuManager on save via extractSharedFieldsForInventory
        }
      } catch (err) {
        console.warn('Could not find cocktail for menuManagerId:', err);
      }
    }
  }
  
  sheet.markModified('rows');
  await sheet.save();
  console.log(`Synced recipe ${recipe._id} to ${sheetKey} inventory row. Style value: ${valuesMap.get('style')}`);
};

// Sync cocktail/mocktail references to pre-mix inventory rows
const syncCocktailToPreMixRows = async (cocktailRecipe) => {
  if (!cocktailRecipe || (cocktailRecipe.type !== 'cocktail' && cocktailRecipe.type !== 'mocktail')) return;
  
  const preMixSheet = await InventorySheet.findOne({ sheetKey: 'preMix' });
  if (!preMixSheet) return;

  const columnsByKey = preMixSheet.columns.reduce((acc, column) => {
    acc[column.key] = column;
    return acc;
  }, {});

  // Find all pre-mix ingredients used in this cocktail
  const preMixItems = (Array.isArray(cocktailRecipe.items) ? cocktailRecipe.items : []).filter(
    (item) => item && item.ingredient?.sheetKey === 'preMix' && item.ingredient?.rowId
  );

  // Collect row IDs of pre-mixes used in this cocktail
  const preMixRowIdsUsed = new Set();
  for (const item of preMixItems) {
    const preMixRowId = String(item.ingredient.rowId);
    // Find the pre-mix inventory row that matches this rowId
    const preMixRow = preMixSheet.rows.find((row) => String(row._id) === preMixRowId);
    if (preMixRow) {
      // Check if this row has a recipeId (meaning it's a recipe, not just an inventory item)
      const recipeId = getRowRecipeId(preMixRow);
      if (recipeId) {
        preMixRowIdsUsed.add(preMixRowId);
      }
    }
  }

  // Update all pre-mix recipe rows
  let hasChanges = false;
  const cocktailTitle = cocktailRecipe.title || '';
  
  preMixSheet.rows.forEach((row) => {
    const rowId = String(row._id);
    const recipeId = getRowRecipeId(row);
    
    // Only update rows that are recipes (have a recipeId)
    if (!recipeId) return;
    
    const valuesMap = ensureRowValuesMap(row);
    const currentCocktail = valuesMap instanceof Map 
      ? valuesMap.get('cocktail')
      : (row.values instanceof Map ? row.values.get('cocktail') : row.values?.cocktail);
    
    if (preMixRowIdsUsed.has(rowId)) {
      // This pre-mix is used in the cocktail - set the cocktail name
      if (currentCocktail !== cocktailTitle) {
        applyRowValues(row, { cocktail: cocktailTitle }, columnsByKey);
        hasChanges = true;
      }
    } else {
      // This pre-mix is not used in the cocktail - clear the reference if it was set
      if (currentCocktail === cocktailTitle) {
        applyRowValues(row, { cocktail: '' }, columnsByKey);
        hasChanges = true;
      }
    }
  });

  if (hasChanges) {
    preMixSheet.markModified('rows');
    await preMixSheet.save();
  }
};

module.exports = router;

