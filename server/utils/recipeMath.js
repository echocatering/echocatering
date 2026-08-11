const InventorySheet = require('../models/InventorySheet');
const { mapValuesToPlain, applyFormulas } = require('./inventoryHelpers');

const ML_PER_OZ = 29.5735;
const OZ_PER_ML = 1 / ML_PER_OZ;
const GRAMS_PER_OZ = 28.3495231;
const OZ_PER_TSP = 0.166667;
const OZ_PER_TBSP = 0.50000116165;
// US customary cup = 8 fl oz exactly, which keeps 1 Cup = 16 Tbsp consistent with
// OZ_PER_TBSP above. (The old 8.11538 value was a 240 ml metric cup, 1.4% off.)
const OZ_PER_CUP = 8;

// $/oz is stored at this precision rather than the column's 2dp display precision.
// Rounding money-per-ounce to cents before multiplying by a quarter-ounce pour destroys
// cheap ingredients: a syrup at $0.0057/oz became $0.01/oz, a 75% overstatement.
const RATE_PRECISION = 6;

const roundTo = (value, digits) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  return Number(numeric.toFixed(digits));
};

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
    if (raw === null || raw === undefined || raw === '') return null;
    const num = Number(raw);
    return Number.isFinite(num) ? num : null;
  };
  const unitCost = parseNumber('unitCost');
  const sumOz = parseNumber('sumOz');
  // ounceCost (spirits/wine) and gramCost (dryStock) are both formula columns that compute $/oz
  // For cocktails/mocktails, derive $/oz from unitCost (total cost) / sumOz (total volume)
  // ?? not || so that a genuine $0.00/oz (water) counts as a known price, not a missing one.
  let perOz = parseNumber('ounceCost') ?? parseNumber('gramCost') ?? null;
  if (perOz === null && unitCost != null && sumOz != null && sumOz > 0) {
    perOz = unitCost / sumOz;
  }
  return {
    currency: 'USD',
    perUnit: unitCost,
    perOz,
    perGram: null, // gramCost is $/oz (not $/gram), so never use as perGram
    perMl: parseNumber('mlCost')
  };
};

// An ingredient is priced only when we know what an ounce of it costs. There is deliberately
// no fall back to perUnit (the whole-container price): billing amount x unitCost treated a
// half-ounce pour as half a $310 jug, which is how a pre-mix came to report $438.39.
// Unknown stays unknown — it contributes $0 and is shown as "—" rather than invented.
const isPricedPerOz = (pricing = {}) =>
  pricing.perOz !== null && pricing.perOz !== undefined && Number.isFinite(Number(pricing.perOz));

const computeExtendedCost = (pricing = {}, conversions = {}) => {
  if (isPricedPerOz(pricing)) {
    return Number(pricing.perOz) * (conversions.toOz || 0);
  }
  if (pricing.perGram != null && Number.isFinite(Number(pricing.perGram))) {
    return Number(pricing.perGram) * (conversions.toGram || 0);
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
    // Recompute the formula columns in memory before reading them. Values stored before the
    // precision change are rounded to cents; recomputing here means recipe costs use the
    // full-precision rate without waiting for every sheet to be re-saved.
    applyFormulas(sheet, rowDoc);
    return {
      name: rowDoc.values?.get ? rowDoc.values.get('name') : rowDoc.values?.name,
      values: mapValuesToPlain(rowDoc.values)
    };
  } catch (error) {
    console.warn(`⚠️ Error extracting inventory row ${rowId}:`, error.message);
    return null;
  }
};

// A pre-mix row carries no purchase price of its own — what a house syrup costs per ounce is
// simply what it costs to make. Reading that from the pre-mix's own recipe on demand means
// editing a syrup immediately reflows into every cocktail using it, instead of waiting for
// someone to re-open and re-save that syrup (which is why every pre-mix was costing $0).
const MAX_PREMIX_DEPTH = 3;

const createResolutionContext = () => ({
  sheetCache: {},
  premixCache: new Map(),
  resolving: new Set(),
  depth: 0
});

const resolvePreMixPerOz = async (itemNumber, ctx) => {
  if (itemNumber === null || itemNumber === undefined || itemNumber === '') return null;
  const key = String(itemNumber);
  if (ctx.premixCache.has(key)) return ctx.premixCache.get(key);
  // Depth cap and in-progress set together stop a pre-mix that (directly or indirectly)
  // references itself from recursing forever.
  if (ctx.depth >= MAX_PREMIX_DEPTH || ctx.resolving.has(key)) return null;

  ctx.resolving.add(key);
  try {
    // Lazy require: the Recipe model pulls in this module's siblings, so requiring it at
    // load time would create a cycle.
    const Recipe = require('../models/Recipe');
    const numeric = Number(itemNumber);
    if (!Number.isFinite(numeric)) return null;
    const premix = await Recipe.findOne({ type: 'premix', itemNumber: numeric })
      .sort({ updatedAt: -1 }) // Several legacy pre-mixes share an itemNumber; newest wins
      .lean();
    if (!premix || !Array.isArray(premix.items) || !premix.items.length) return null;

    // Recompute rather than trusting premix.totals: those were stored by the old math and
    // may carry the whole-container inflation this change removes.
    const hydrated = await hydrateItems(premix.items, {
      ...ctx,
      depth: ctx.depth + 1
    });
    const volumeOz = hydrated.totals.volumeOzRaw;
    if (!volumeOz || volumeOz <= 0) return null;
    const perOz = roundTo(hydrated.totals.costEachRaw / volumeOz, RATE_PRECISION);
    ctx.premixCache.set(key, perOz);
    return perOz;
  } catch (error) {
    console.warn(`⚠️ Could not resolve pre-mix cost for itemNumber ${itemNumber}:`, error.message);
    return null;
  } finally {
    ctx.resolving.delete(key);
  }
};

// Inventory rows have been recreated over time, leaving older recipes pointing at row ids
// that no longer exist — which is why a pre-mix could vanish from a cocktail's cost even
// though a row of that exact name is sitting in the sheet. Matching on an exact,
// case-insensitive name within the SAME sheet repairs the link; anything looser risks
// silently costing a cocktail against the wrong ingredient, so nothing looser is attempted.
const findRowByExactName = (sheet, sheetKey, name, ctx) => {
  if (!sheet || !name) return null;
  if (!ctx.nameIndex) ctx.nameIndex = {};
  if (!ctx.nameIndex[sheetKey]) {
    const index = new Map();
    (sheet.rows || []).forEach((row) => {
      if (row.isDeleted) return;
      const rowName = row.values?.get ? row.values.get('name') : row.values?.name;
      if (!rowName) return;
      const key = String(rowName).trim().toLowerCase();
      if (!index.has(key)) index.set(key, row); // First match wins
    });
    ctx.nameIndex[sheetKey] = index;
  }
  return ctx.nameIndex[sheetKey].get(String(name).trim().toLowerCase()) || null;
};

const hydrateItems = async (items = [], context = null) => {
  const ctx = context || createResolutionContext();
  const normalized = [];
  let totalVolumeOz = 0;
  let totalCost = 0;

  for (let index = 0; index < items.length; index += 1) {
    const rawItem = items[index] || {};
    // Remove frontend-only fields
    const { tempId, _id, ...item } = rawItem;
    const { sheetKey, rowId, inventoryKey } = parseInventoryKey(item);
    let inventoryData = null;
    let resolvedRowId = rowId;
    if (sheetKey) {
      try {
        if (!ctx.sheetCache[sheetKey]) {
          ctx.sheetCache[sheetKey] = await InventorySheet.findOne({ sheetKey });
        }
        const sheet = ctx.sheetCache[sheetKey];
        if (sheet) {
          if (rowId) {
            inventoryData = extractInventoryRow(sheet, rowId);
          }
          if (!inventoryData && item.ingredient?.name) {
            // Stale row id — recover by exact name so the cost isn't silently lost.
            const match = findRowByExactName(sheet, sheetKey, item.ingredient.name, ctx);
            if (match) {
              resolvedRowId = String(match._id);
              inventoryData = extractInventoryRow(sheet, resolvedRowId);
            }
          }
        }
      } catch (inventoryError) {
        console.warn(`⚠️ Error fetching inventory data for ${sheetKey}:${rowId}:`, inventoryError.message);
        // Continue without inventory data - use item's existing pricing
      }
    }
    const resolvedKey = sheetKey && resolvedRowId ? `${sheetKey}:${resolvedRowId}` : inventoryKey;

    const amount = normalizeAmount(item.amount || {});
    const conversions = deriveConversions(amount.value, amount.unit);
    // When the inventory row is gone we keep whatever pricing was last stored on the item,
    // so a discontinued ingredient's cost stays frozen instead of silently dropping to $0.
    const pricing = inventoryData
      ? derivePricingFromInventory(inventoryData.values)
      : item.pricing || {};

    if (sheetKey === 'preMix' && inventoryData && !isPricedPerOz(pricing)) {
      const perOz = await resolvePreMixPerOz(inventoryData.values?.itemNumber, ctx);
      if (perOz !== null) {
        pricing.perOz = perOz;
      }
    }

    const extendedCost = computeExtendedCost(pricing, conversions);

    totalVolumeOz += conversions.toOz || 0;
    totalCost += extendedCost || 0;

    normalized.push({
      order: Number.isFinite(item.order) ? item.order : index,
      // Persist the repaired link so the lookup heals permanently on the next save.
      inventoryKey: resolvedKey || undefined,
      ingredient: {
        sheetKey: sheetKey || '',
        rowId: resolvedRowId || '',
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
    costEach: Number(totalCost.toFixed(2)),
    // Unrounded companions, used when this recipe is itself an ingredient (pre-mix $/oz):
    // dividing an already-rounded total by volume compounds the rounding error.
    volumeOzRaw: totalVolumeOz,
    costEachRaw: totalCost
  };

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
  // Strip the unrounded companions — they exist for in-process chaining, not for storage.
  const { volumeOzRaw, costEachRaw, ...totals } = hydrated.totals;
  return {
    ...base,
    items: hydrated.items,
    totals
  };
};

module.exports = {
  normalizeRecipePayload,
  hydrateItems,
  createResolutionContext,
  resolvePreMixPerOz,
  derivePricingFromInventory,
  isPricedPerOz,
  RATE_PRECISION,
  roundTo
};



