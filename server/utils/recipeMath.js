const InventorySheet = require('../models/InventorySheet');
const { mapValuesToPlain } = require('./inventoryHelpers');

const ML_PER_OZ = 29.5735;
const OZ_PER_ML = 1 / ML_PER_OZ;
const GRAMS_PER_OZ = 28.3495231;
const OZ_PER_TSP = 0.166667;
const OZ_PER_TBSP = 0.50000116165;
const OZ_PER_CUP = 8.11538430287086;

const fractionToDecimal = (fraction = {}) => {
  const whole = Number(fraction.whole) || 0;
  const numerator = Number(fraction.numerator) || 0;
  const denominator = Number(fraction.denominator) || 1;
  if (!denominator) return whole;
  return whole + numerator / denominator;
};

const deriveConversions = (value = 0, unit = 'oz') => {
  const numericValue = Number(value) || 0;
  switch (unit) {
    case 'oz':
      return {
        toOz: numericValue,
        toMl: numericValue * ML_PER_OZ,
        toGram: numericValue * GRAMS_PER_OZ
      };
    case 'ml':
      return {
        toOz: numericValue * OZ_PER_ML,
        toMl: numericValue,
        toGram: numericValue // assume syrup density ~ water
      };
    case 'g':
      return {
        toOz: numericValue / GRAMS_PER_OZ,
        toMl: numericValue, // placeholder until density support
        toGram: numericValue
      };
    case 'tsp':
      return {
        toOz: numericValue * OZ_PER_TSP,
        toMl: numericValue * OZ_PER_TSP * ML_PER_OZ,
        toGram: numericValue * OZ_PER_TSP * GRAMS_PER_OZ
      };
    case 'Tbsp':
      return {
        toOz: numericValue * OZ_PER_TBSP,
        toMl: numericValue * OZ_PER_TBSP * ML_PER_OZ,
        toGram: numericValue * OZ_PER_TBSP * GRAMS_PER_OZ
      };
    case 'Cup':
      return {
        toOz: numericValue * OZ_PER_CUP,
        toMl: numericValue * OZ_PER_CUP * ML_PER_OZ,
        toGram: numericValue * OZ_PER_CUP * GRAMS_PER_OZ
      };
    default:
      return {
        toOz: numericValue,
        toMl: numericValue * ML_PER_OZ,
        toGram: numericValue * GRAMS_PER_OZ
      };
  }
};

const derivePricingFromInventory = (values = {}) => {
  const parseNumber = (key) => {
    const raw = values[key];
    const num = Number(raw);
    return Number.isFinite(num) ? num : null;
  };
  // ounceCost (spirits/wine) and gramCost (dryStock) are both formula columns that compute $/oz
  const perOz = parseNumber('ounceCost') ?? parseNumber('gramCost') ?? null;
  return {
    currency: 'USD',
    perUnit: parseNumber('unitCost'),
    perOz,
    perGram: null, // gramCost is $/oz (not $/gram), so never use as perGram
    perMl: parseNumber('mlCost')
  };
};

const computeExtendedCost = (pricing = {}, conversions = {}, amountValue = 0) => {
  // Prefer perOz for liquid ingredients (most common case)
  if (pricing.perOz && conversions.toOz) {
    const cost = conversions.toOz * pricing.perOz;
    // Warn if cost seems unusually high
    if (cost > 50) {
      console.warn('⚠️ High perOz cost calculation:', {
        perOz: pricing.perOz,
        toOz: conversions.toOz,
        cost,
        hasPerGram: !!pricing.perGram,
        hasPerUnit: !!pricing.perUnit
      });
    }
    return cost;
  }
  if (pricing.perGram && conversions.toGram) {
    return conversions.toGram * pricing.perGram;
  }
  // perUnit should be used carefully - it's typically for whole units, not fractional amounts
  if (pricing.perUnit) {
    const cost = amountValue * pricing.perUnit;
    // Warn if perUnit is being used with a high multiplier
    if (cost > 50 && amountValue > 1) {
      console.warn('⚠️ High perUnit cost calculation:', {
        perUnit: pricing.perUnit,
        amountValue,
        cost,
        hasPerOz: !!pricing.perOz,
        hasPerGram: !!pricing.perGram
      });
    }
    return cost;
  }
  return 0;
};

const parseInventoryKey = (item) => {
  const inventoryKey = item.inventoryKey || item.ingredient?.inventoryKey || '';
  if (inventoryKey.includes(':')) {
    const [sheetKey, rowId] = inventoryKey.split(':');
    return { sheetKey, rowId, inventoryKey };
  }
  const sheetKey = item.ingredient?.sheetKey;
  const rowId = item.ingredient?.rowId;
  if (sheetKey && rowId) {
    return { sheetKey, rowId, inventoryKey: `${sheetKey}:${rowId}` };
  }
  return { sheetKey: null, rowId: null, inventoryKey: null };
};

const normalizeAmount = (amount = {}) => {
  const unit = amount.unit || 'oz';
  const fraction = {
    whole: Number(amount.fraction?.whole) || 0,
    numerator: Number(amount.fraction?.numerator) || 0,
    denominator: Number(amount.fraction?.denominator) || 1
  };
  const value =
    Number.isFinite(Number(amount.value)) && Number(amount.value) !== 0
      ? Number(amount.value)
      : fractionToDecimal(fraction);
  return {
    unit,
    fraction,
    value: Number(value.toFixed(3)),
    display: amount.display || null
  };
};

const sanitizeBatch = (batch = {}) => ({
  size: Number.isFinite(Number(batch.size)) ? Number(batch.size) : 0,
  unit: batch.unit === 'ml' ? 'ml' : 'oz',
  yieldCount: Number.isFinite(Number(batch.yieldCount)) ? Number(batch.yieldCount) : 0
});

const sanitizeMetadata = (metadata = {}) => ({
  priceSet: Number.isFinite(Number(metadata.priceSet)) ? Number(metadata.priceSet) : null,
  priceMin: Number.isFinite(Number(metadata.priceMin)) ? Number(metadata.priceMin) : null,
  style: metadata.style || '',
  glassware: metadata.glassware || '',
  ice: metadata.ice || '',
  garnish: metadata.garnish || '',
  type: metadata.type || '',
  cocktail: metadata.cocktail || ''
});

const extractInventoryRow = (sheet, rowId) => {
  if (!sheet) return null;
  try {
    if (!sheet.rows || typeof sheet.rows.id !== 'function') {
      console.warn('⚠️ Sheet rows is not a valid Mongoose array or missing id method');
      return null;
    }
    const rowDoc = sheet.rows.id(rowId);
    if (!rowDoc || rowDoc.isDeleted) return null;
    return {
      name: rowDoc.values?.get ? rowDoc.values.get('name') : rowDoc.values?.name,
      values: mapValuesToPlain(rowDoc.values)
    };
  } catch (error) {
    console.warn(`⚠️ Error extracting inventory row ${rowId}:`, error.message);
    return null;
  }
};

const hydrateItems = async (items = []) => {
  const sheetCache = {};
  const normalized = [];
  let totalVolumeOz = 0;
  let totalCost = 0;

  for (let index = 0; index < items.length; index += 1) {
    const rawItem = items[index] || {};
    // Remove frontend-only fields
    const { tempId, _id, ...item } = rawItem;
    const { sheetKey, rowId, inventoryKey } = parseInventoryKey(item);
    let inventoryData = null;
    if (sheetKey && rowId) {
      try {
        if (!sheetCache[sheetKey]) {
          sheetCache[sheetKey] = await InventorySheet.findOne({ sheetKey });
        }
        if (sheetCache[sheetKey]) {
          inventoryData = extractInventoryRow(sheetCache[sheetKey], rowId);
        }
      } catch (inventoryError) {
        console.warn(`⚠️ Error fetching inventory data for ${sheetKey}:${rowId}:`, inventoryError.message);
        // Continue without inventory data - use item's existing pricing
      }
    }

    const amount = normalizeAmount(item.amount || {});
    const conversions = deriveConversions(amount.value, amount.unit);
    const pricing = inventoryData
      ? derivePricingFromInventory(inventoryData.values)
      : item.pricing || {};
    const extendedCost = computeExtendedCost(pricing, conversions, amount.value);

    // Debug logging for high costs
    if (extendedCost > 50) {
      console.warn('⚠️ High ingredient cost detected:', {
        ingredientName: item.ingredient?.name || inventoryData?.name || 'Unknown',
        amount: amount.value,
        unit: amount.unit,
        conversions,
        pricing,
        extendedCost,
        inventoryKey,
        inventoryData: inventoryData ? {
          name: inventoryData.name,
          values: inventoryData.values
        } : null
      });
    }

    totalVolumeOz += conversions.toOz || 0;
    totalCost += extendedCost || 0;

    normalized.push({
      order: Number.isFinite(item.order) ? item.order : index,
      inventoryKey: inventoryKey || (sheetKey && rowId ? `${sheetKey}:${rowId}` : undefined),
      ingredient: {
        sheetKey: sheetKey || '',
        rowId: rowId || '',
        name: item.ingredient?.name || inventoryData?.name || ''
      },
      amount,
      conversions: {
        toOz: Number((conversions.toOz || 0).toFixed(4)),
        toMl: Number((conversions.toMl || 0).toFixed(2)),
        toGram: Number((conversions.toGram || 0).toFixed(2))
      },
      pricing,
      extendedCost: Number(extendedCost.toFixed(4)),
      notes: item.notes || ''
    });
  }

  const totals = {
    volumeOz: Number(totalVolumeOz.toFixed(3)),
    costEach: Number(totalCost.toFixed(2))
  };

  // Debug logging for high total costs
  if (totals.costEach > 50) {
    console.warn('⚠️ High recipe total cost detected:', {
      totalCost: totals.costEach,
      totalVolumeOz: totals.volumeOz,
      costPerOz: totals.volumeOz > 0 ? (totals.costEach / totals.volumeOz).toFixed(2) : 'N/A',
      itemCount: normalized.length,
      items: normalized.map(item => ({
        name: item.ingredient?.name || 'Unknown',
        amount: item.amount?.value,
        unit: item.amount?.unit,
        extendedCost: item.extendedCost,
        pricing: item.pricing
      }))
    });
  }

  return {
    items: normalized,
    totals
  };
};

const normalizeRecipePayload = async (payload = {}) => {
  const title = String(payload.title || '').trim();
  if (!title) {
    throw new Error('Recipe title is required');
  }

  // Preserve the type from payload, defaulting to 'cocktail' if not specified
  const type = payload.type === 'premix' ? 'premix' 
    : payload.type === 'mocktail' ? 'mocktail' 
    : 'cocktail';
  // Preserve backgroundColor if provided, otherwise use default
  let backgroundColor = '#e5e5e5';
  if (payload.backgroundColor) {
    const colorStr = String(payload.backgroundColor).trim();
    // Validate hex color format
    const hexColorRegex = /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/;
    if (hexColorRegex.test(colorStr)) {
      backgroundColor = colorStr;
    }
  }

  // Extract itemNumber if provided
  let itemNumber = null;
  if (payload.itemNumber !== undefined && payload.itemNumber !== null) {
    const num = Number(payload.itemNumber);
    if (Number.isFinite(num)) {
      itemNumber = num;
    }
  }

  const base = {
    title,
    type,
    itemNumber: itemNumber, // Link to Cocktail/Inventory by itemNumber
    video: {
      posterUrl: String(payload.video?.posterUrl || '').trim(),
      videoUrl: String(payload.video?.videoUrl || '').trim()
    },
    metadata: sanitizeMetadata(payload.metadata || {}),
    notes: String(payload.notes || '').trim(),
    batchNotes: String(payload.batchNotes || '').trim(),
    batch: sanitizeBatch(payload.batch || {}),
    items: Array.isArray(payload.items) ? payload.items : [],
    backgroundColor: backgroundColor
  };

  const hydrated = await hydrateItems(base.items);
  return {
    ...base,
    items: hydrated.items,
    totals: hydrated.totals
  };
};

module.exports = {
  normalizeRecipePayload,
  hydrateItems
};



