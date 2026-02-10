import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react';
import { useAuth } from '../../contexts/AuthContext';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';

const FRACTION_OPTIONS = [
  { label: '—', numerator: 0, denominator: 1 },
  { label: '1/8', numerator: 1, denominator: 8 },
  { label: '1/6', numerator: 1, denominator: 6 },
  { label: '1/4', numerator: 1, denominator: 4 },
  { label: '1/3', numerator: 1, denominator: 3 },
  { label: '1/2', numerator: 1, denominator: 2 },
  { label: '2/3', numerator: 2, denominator: 3 },
  { label: '3/4', numerator: 3, denominator: 4 }
];

const UNIT_OPTIONS = [
  { value: 'oz', label: 'oz' },
  { value: 'ml', label: 'ml' },
  { value: 'g', label: 'g' },
  { value: 'tsp', label: 'tsp' },
  { value: 'Tbsp', label: 'Tbsp' },
  { value: 'Cup', label: 'Cup' }
];

const SHOW_COCKTAIL_DETAILS = false;
const SHOW_BATCH_DETAILS = false;
const SHOW_NOTES = false;

// Format text to title case (first letter capital, rest lowercase)
// Handles multi-word strings by capitalizing first letter of each word
const toTitleCase = (text) => {
  if (!text || typeof text !== 'string') return text;
  const trimmed = text.trim();
  if (!trimmed) return trimmed;
  // Split by spaces and capitalize first letter of each word, lowercase the rest
  return trimmed
    .split(/\s+/)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
};

// Generate organized color palette matching the grid layout (6 rows x 10 columns)
// Organized by columns (hue families) with vertical light-to-dark progression
// Each column represents a hue family: Pinks/Reds → Oranges → Yellows → Greens → Cyans → Blues → Purples → Magentas → Pinks → Grays
const generateColorPalette = () => {
  const colors = [];
  
  // Build column by column to ensure proper hue families with light-to-dark progression
  
  // Column 1: Pinks/Reds (light pink → coral → red → dark red → maroon → very dark)
  colors.push('#ffe5e5', '#ffcccc', '#ff9999', '#ff6666', '#cc3333', '#660000');
  
  // Column 2: Oranges/Peaches (light peach → orange → bright orange → burnt orange → brown → very dark brown)
  colors.push('#ffe5cc', '#ffcc99', '#ff9900', '#cc6600', '#996633', '#331a00');
  
  // Column 3: Yellows (pale yellow → light yellow → bright yellow → olive → dark olive → very dark)
  colors.push('#ffffcc', '#ffff99', '#ffff00', '#cccc00', '#666600', '#333300');
  
  // Column 4: Greens (very light green → light mint → lime → green → forest → very dark green)
  colors.push('#e5ffe5', '#ccffcc', '#99ff99', '#00ff00', '#006600', '#003300');
  
  // Column 5: Cyans/Teals (light cyan → aqua → cyan → teal → dark teal → very dark)
  colors.push('#e5ffff', '#ccffff', '#00ffff', '#00cccc', '#006666', '#003333');
  
  // Column 6: Blues (light sky → sky blue → bright blue → royal → navy → very dark blue)
  colors.push('#e5f5ff', '#cce5ff', '#0066ff', '#0066cc', '#003366', '#001933');
  
  // Column 7: Purples (light lavender → lavender → purple → deep purple → indigo → very dark)
  colors.push('#f0e5ff', '#e5ccff', '#9900ff', '#6600cc', '#330066', '#1a0033');
  
  // Column 8: Magentas (light rose → light magenta → hot pink → magenta → dark fuchsia → very dark)
  colors.push('#ffe5f0', '#ffcce5', '#ff00cc', '#cc0099', '#660033', '#33001a');
  
  // Column 9: Pinks/Roses (light pink → rose → pink → dark pink → dark rose → very dark)
  colors.push('#ffcccc', '#ff99aa', '#ff6699', '#cc3366', '#990033', '#33001a');
  
  // Column 10: Grays/Whites (white → very light gray → light gray → medium gray → dark gray → black)
  colors.push('#ffffff', '#f5f5f5', '#cccccc', '#999999', '#666666', '#000000');
  
  // Now reorganize from column-major to row-major order for display
  const rowMajorColors = [];
  for (let row = 0; row < 6; row++) {
    for (let col = 0; col < 10; col++) {
      rowMajorColors.push(colors[col * 6 + row]);
    }
  }
  
  return rowMajorColors;
};

const PRESELECTED_COLORS = generateColorPalette();

const ML_PER_OZ = 29.5735;
const OZ_PER_ML = 1 / ML_PER_OZ;
const GRAMS_PER_OZ = 28.3495231;
const OZ_PER_TSP = 0.166667;
const OZ_PER_TBSP = 0.50000116165;
const OZ_PER_CUP = 8.11538430287086;

const uniqueId = () => Math.random().toString(36).slice(2, 9);

const defaultFraction = () => ({ whole: 0, numerator: 0, denominator: 1 });

const formatNumber = (value, digits = 2, fallback = '0.00') => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return numeric.toFixed(digits);
};

const formatFractionDisplay = (fraction) => {
  const { whole = 0, numerator = 0, denominator = 1 } = fraction || {};
  if (!numerator || !denominator) {
    return whole ? `${whole}` : '';
  }
  if (!whole) {
    return `${numerator}/${denominator}`;
  }
  return `${whole} ${numerator}/${denominator}`;
};

// Round to nearest 1/8
const roundToNearestEighth = (value) => {
  return Math.round(value * 8) / 8;
};

// Convert decimal to fraction string (rounds to nearest 1/8)
const decimalToFraction = (decimal) => {
  if (decimal === 0) return '0';
  const rounded = roundToNearestEighth(decimal);
  const whole = Math.floor(rounded);
  const fractional = rounded - whole;
  
  if (fractional === 0) {
    return whole.toString();
  }
  
  // Convert fractional part to fraction (denominator is always 8)
  const numerator = Math.round(fractional * 8);
  const denominator = 8;
  
  // Simplify the fraction
  const gcd = (a, b) => b === 0 ? a : gcd(b, a % b);
  const divisor = gcd(numerator, denominator);
  const simplifiedNum = numerator / divisor;
  const simplifiedDen = denominator / divisor;
  
  if (whole === 0) {
    return `${simplifiedNum}/${simplifiedDen}`;
  }
  return `${whole} ${simplifiedNum}/${simplifiedDen}`;
};

// Parse fraction string to decimal
const parseFractionInput = (input) => {
  if (!input || input.trim() === '') return 0;
  
  const trimmed = input.trim();
  
  // Allow partial decimal input (e.g., "1.", "1.3" while typing)
  // Only parse if it's a complete number
  if (trimmed.endsWith('.') || trimmed.match(/\.\d*$/)) {
    // Partial decimal - try to parse what we have
    const partial = trimmed.replace(/\.$/, '');
    if (partial === '') return 0;
    const decimal = parseFloat(partial);
    if (!isNaN(decimal) && isFinite(decimal)) {
      return roundToNearestEighth(decimal);
    }
  }
  
  // Try to parse as decimal first
  const decimal = parseFloat(trimmed);
  if (!isNaN(decimal) && isFinite(decimal)) {
    return roundToNearestEighth(decimal);
  }
  
  // Try to parse as fraction (e.g., "1 1/8", "3/8", "1/8")
  const mixedMatch = trimmed.match(/^(\d+)\s+(\d+)\/(\d+)$/);
  if (mixedMatch) {
    const whole = parseInt(mixedMatch[1], 10);
    const num = parseInt(mixedMatch[2], 10);
    const den = parseInt(mixedMatch[3], 10);
    if (den !== 0) {
      return roundToNearestEighth(whole + num / den);
    }
  }
  
  // Try to parse as simple fraction (e.g., "3/8", "1/8")
  const fractionMatch = trimmed.match(/^(\d+)\/(\d+)$/);
  if (fractionMatch) {
    const num = parseInt(fractionMatch[1], 10);
    const den = parseInt(fractionMatch[2], 10);
    if (den !== 0) {
      return roundToNearestEighth(num / den);
    }
  }
  
  // If we can't parse it, return 0 but allow the input to remain
  return 0;
};

const fractionToDecimal = (fraction) => {
  if (!fraction) return 0;
  const whole = Number(fraction.whole) || 0;
  const numerator = Number(fraction.numerator) || 0;
  const denominator = Number(fraction.denominator) || 1;
  if (!denominator) return whole;
  return whole + numerator / denominator;
};

const derivePricing = (values = {}) => {
  const parseValue = (key) => {
    const raw = values[key];
    if (raw === null || raw === undefined || raw === '') return null;
    // Handle string numbers (e.g., "5.43")
    const num = typeof raw === 'string' ? parseFloat(raw) : Number(raw);
    return Number.isFinite(num) && num >= 0 ? num : null;
  };
  const unitCost = parseValue('unitCost');
  const ounceCost = parseValue('ounceCost');
  const gramCost = parseValue('gramCost');
  const mlCost = parseValue('mlCost');
  
  // For pre-mix items, ounceCost is the primary field
  // For dry stock, gramCost is actually $/oz (despite the key name)
  // For spirits/wine, ounceCost is the primary field
  const perOz = ounceCost ?? gramCost ?? mlCost ?? null;
  
  // Debug: log if we're looking for ounceCost but not finding it
  if (values && 'ounceCost' in values && perOz === null) {
    console.warn('⚠️ ounceCost exists in values but parseValue returned null:', {
      raw: values.ounceCost,
      type: typeof values.ounceCost,
      parsed: parseValue('ounceCost')
    });
  }
  
  return {
    currency: 'USD',
    perUnit: unitCost,
    perOz,
    perGram: ounceCost != null ? null : gramCost,
    perMl: ounceCost != null ? null : mlCost
  };
};

const deriveConversions = (amountValue, unit) => {
  const value = Number(amountValue) || 0;
  switch (unit) {
    case 'oz':
      return {
        toOz: value,
        toMl: value * ML_PER_OZ,
        toGram: value * GRAMS_PER_OZ
      };
    case 'ml':
      return {
        toOz: value * OZ_PER_ML,
        toMl: value,
        toGram: value // assume 1ml water weight for display
      };
    case 'g':
      return {
        toOz: value / GRAMS_PER_OZ,
        toMl: value, // placeholder for syrups
        toGram: value
      };
    case 'tsp':
      return {
        toOz: value * OZ_PER_TSP,
        toMl: value * OZ_PER_TSP * ML_PER_OZ,
        toGram: value * OZ_PER_TSP * GRAMS_PER_OZ
      };
    case 'Tbsp':
      return {
        toOz: value * OZ_PER_TBSP,
        toMl: value * OZ_PER_TBSP * ML_PER_OZ,
        toGram: value * OZ_PER_TBSP * GRAMS_PER_OZ
      };
    case 'Cup':
      return {
        toOz: value * OZ_PER_CUP,
        toMl: value * OZ_PER_CUP * ML_PER_OZ,
        toGram: value * OZ_PER_CUP * GRAMS_PER_OZ
      };
    default:
      return {
        toOz: value,
        toMl: value * ML_PER_OZ,
        toGram: value * GRAMS_PER_OZ
      };
  }
};

const computeRowCost = (pricing = {}, conversions = {}, amountValue = 0) => {
  if (pricing.perOz && conversions.toOz) {
    return conversions.toOz * pricing.perOz;
  }
  if (pricing.perGram && conversions.toGram) {
    return conversions.toGram * pricing.perGram;
  }
  if (pricing.perUnit) {
    return amountValue * pricing.perUnit;
  }
  return 0;
};

const hydrateRow = (row, inventoryMap) => {
  const ingredientKey =
    row.inventoryKey ||
    row.ingredient?.inventoryKey ||
    (row.ingredient?.sheetKey && row.ingredient?.rowId
      ? `${row.ingredient.sheetKey}:${row.ingredient.rowId}`
      : null);
  const source = ingredientKey ? inventoryMap.get(ingredientKey) : null;
  
  // Debug logging when source is missing but we have an ingredientKey
  // Only warn if inventoryMap has been populated (size > 0) but this specific key is missing
  // This prevents warnings during initial load when inventoryMap is empty
  if (ingredientKey && !source && inventoryMap.size > 0) {
    console.warn('⚠️ Ingredient not found in inventoryMap:', {
      ingredientKey,
      ingredientName: row.ingredient?.name,
      inventoryMapSize: inventoryMap.size,
      availableKeys: Array.from(inventoryMap.keys()).slice(0, 5)
    });
  }
  
  
  const pricing = source ? derivePricing(source.values) : row.pricing || {};
  
  // Debug logging when pricing.perOz is missing
  // Only warn if the ingredient has pricing fields but perOz couldn't be derived
  // (Don't warn if ingredient has no pricing fields at all - that's expected for some items)
  if (ingredientKey && !pricing.perOz && source && inventoryMap.size > 0) {
    const hasPricingFields = source.values && (
      'ounceCost' in source.values ||
      'gramCost' in source.values ||
      'mlCost' in source.values ||
      'unitCost' in source.values
    );
    
    // Only warn if pricing fields exist but couldn't be parsed
    if (hasPricingFields) {
      console.debug('⚠️ No perOz in pricing for ingredient (has pricing fields but could not derive perOz):', {
        ingredientName: row.ingredient?.name || source.name,
        ingredientKey,
        sourceValues: source.values,
        derivedPricing: pricing
      });
    }
  }
  
  
  const amountValue = row.amount?.value ?? fractionToDecimal(row.amount?.fraction);
  const amount = {
    unit: row.amount?.unit || 'oz',
    fraction: row.amount?.fraction || defaultFraction(),
    value: Number.isFinite(amountValue) ? amountValue : 0,
    display: row.amount?.display !== undefined && row.amount.display !== null 
      ? row.amount.display 
      : (amountValue === 0 || amountValue === undefined || amountValue === null ? '' : decimalToFraction(amountValue))
  };
  const conversions = deriveConversions(amount.value, amount.unit);
  const extendedCost = computeRowCost(pricing, conversions, amount.value);
  return {
    ...row,
    amount,
    pricing,
    conversions,
    extendedCost
  };
};

const calculateTotals = (items = []) => {
  const volumeOz = items.reduce((sum, item) => sum + (item.conversions?.toOz || 0), 0);
  const costEach = items.reduce((sum, item) => sum + (item.extendedCost || 0), 0);
  return {
    volumeOz: Number(volumeOz.toFixed(3)),
    costEach: Number(costEach.toFixed(2))
  };
};

const buildBatchRows = (items = [], batch) => {
  const totalOz = items.reduce((sum, item) => sum + (item.conversions?.toOz || 0), 0);
  const targetValue = Number(batch?.size) || 0;
  const targetOz = batch?.unit === 'ml' ? targetValue * OZ_PER_ML : targetValue;
  if (!totalOz || !targetOz) {
    return [];
  }
  const ratio = targetOz / totalOz;
  return items.map((item) => {
    const oz = (item.conversions?.toOz || 0) * ratio;
    const ml = oz * ML_PER_OZ;
    return {
      id: item.inventoryKey || item.ingredient?.rowId || uniqueId(),
      name: item.ingredient?.name || 'Ingredient',
      oz: Number(oz.toFixed(2)),
      ml: Number(ml.toFixed(1))
    };
  });
};

const labelForSheet = (sheetKey) => {
  switch (sheetKey) {
    case 'spirits':
      return 'Spirits';
    case 'dryStock':
      return 'Dry Stock';
    case 'preMix':
      return 'Pre-Mix';
    case 'cocktails':
      return 'Cocktails';
    case 'mocktails':
      return 'Mocktails';
    case 'wine':
      return 'Wine';
    default:
      return sheetKey || 'Inventory';
  }
};

const RecipeBuilder = ({ recipe, onChange, type, saving, onSave, onDelete, disableTitleEdit = false, hideActions = false, forceUppercaseTitle = false, showOnlyName = false }) => {
  const { apiCall } = useAuth();
  const [inventoryCache, setInventoryCache] = useState({});
  const [ingredientSearch, setIngredientSearch] = useState({});
  const [searchState, setSearchState] = useState({});
  const [openDropdownKey, setOpenDropdownKey] = useState(null);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [videoFile, setVideoFile] = useState(null);
  const [videoPreviewUrl, setVideoPreviewUrl] = useState(null);
  const [typeDataset, setTypeDataset] = useState(null);
  const [typeEditorOpen, setTypeEditorOpen] = useState(false);
  const [typeEditorValue, setTypeEditorValue] = useState('');
  const [typeEditorSaving, setTypeEditorSaving] = useState(false);
  const [iceDataset, setIceDataset] = useState(null);
  const [iceEditorOpen, setIceEditorOpen] = useState(false);
  const [iceEditorValue, setIceEditorValue] = useState('');
  const [iceEditorSaving, setIceEditorSaving] = useState(false);
  const [garnishDataset, setGarnishDataset] = useState(null);
  const [garnishEditorOpen, setGarnishEditorOpen] = useState(false);
  const [garnishEditorValue, setGarnishEditorValue] = useState('');
  const [garnishEditorSaving, setGarnishEditorSaving] = useState(false);
  const [batchCheckboxes, setBatchCheckboxes] = useState({});
  const [batchSize, setBatchSize] = useState('1000');
  const [batchUnit, setBatchUnit] = useState('ml');
  const [amountInputs, setAmountInputs] = useState({}); // Store raw input values while typing
  const searchTimersRef = useRef({});
  const inventoryCacheRef = useRef({});
  const isUserUpdatingRef = useRef(false); // Track if user is actively typing/editing
  const recipeRef = useRef(recipe); // Keep a ref to the current recipe
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [exporting, setExporting] = useState(false);
  const recipeCardRef = useRef(null);

  // Get save button label based on recipe type
  const saveButtonLabel = useMemo(() => {
    const typeLabels = {
      cocktail: 'SAVE COCKTAIL',
      mocktail: 'SAVE MOCKTAIL',
      premix: 'SAVE PRE-MIX',
      beer: 'SAVE BEER',
      wine: 'SAVE WINE'
    };
    return typeLabels[type] || 'SAVE RECIPE';
  }, [type]);

  useEffect(() => {
    return () => {
      Object.values(searchTimersRef.current).forEach((timer) => {
        if (timer) clearTimeout(timer);
      });
      // Reset batch checkboxes when component unmounts
      setBatchCheckboxes({});
    };
  }, []);

  const TYPE_DATASET_ID = useMemo(
    () => {
      if (type === 'premix') return 'premix.type';
      return 'cocktail.type'; // Use cocktail.type for cocktails and mocktails
    },
    [type]
  );

  const ICE_DATASET_ID = useMemo(
    () => 'cocktails.ice', // Use same ice list for all recipe types
    [type]
  );

  const GARNISH_DATASET_ID = useMemo(
    () => {
      if (type === 'cocktail') return 'cocktails.garnish';
      if (type === 'mocktail') return 'mocktails.garnish';
      return 'cocktails.garnish'; // fallback
    },
    [type]
  );

  const fetchTypeDataset = useCallback(
    async () => {
      try {
        const response = await apiCall(`/inventory/datasets/${TYPE_DATASET_ID}`);
        if (response?.dataset) {
          setTypeDataset(response.dataset);
        }
      } catch (error) {
        console.error('Failed to load type dataset', error);
      }
    },
    [apiCall, TYPE_DATASET_ID]
  );

  useEffect(() => {
    fetchTypeDataset();
  }, [fetchTypeDataset]);

  const fetchIceDataset = useCallback(
    async () => {
      // Load ice dataset for all recipe types (cocktail, mocktail, premix)
      if (type !== 'cocktail' && type !== 'mocktail' && type !== 'premix') return;
      try {
        const response = await apiCall(`/inventory/datasets/${ICE_DATASET_ID}`);
        if (response?.dataset) {
          setIceDataset(response.dataset);
        }
      } catch (error) {
        console.error('Failed to load ice dataset', error);
      }
    },
    [apiCall, ICE_DATASET_ID, type]
  );

  useEffect(() => {
    fetchIceDataset();
  }, [fetchIceDataset]);

  const fetchGarnishDataset = useCallback(
    async () => {
      if (type !== 'cocktail' && type !== 'mocktail') return;
      try {
        const response = await apiCall(`/inventory/datasets/${GARNISH_DATASET_ID}`);
        if (response?.dataset) {
          setGarnishDataset(response.dataset);
        }
      } catch (error) {
        console.error('Failed to load garnish dataset', error);
      }
    },
    [apiCall, GARNISH_DATASET_ID, type]
  );

  useEffect(() => {
    fetchGarnishDataset();
  }, [fetchGarnishDataset]);

  const updateIceDatasetValues = useCallback(
    async (values = []) => {
      try {
        setIceEditorSaving(true);
        const response = await apiCall(`/inventory/datasets/${ICE_DATASET_ID}`, {
          method: 'PUT',
          body: JSON.stringify({ values })
        });
        if (response?.dataset) {
          setIceDataset(response.dataset);
        }
      } catch (error) {
        console.error('Failed to update ice dataset', error);
        alert(`Failed to update ice options: ${error.message || 'Unknown error'}`);
      } finally {
        setIceEditorSaving(false);
      }
    },
    [apiCall, ICE_DATASET_ID]
  );

  const handleAddIceValue = async () => {
    const rawValue = iceEditorValue.trim();
    if (!rawValue) return;
    const value = toTitleCase(rawValue);
    
    // Check if value already exists
    if (iceDataset?.values?.some((entry) => entry.value.toLowerCase() === value.toLowerCase())) {
      alert('That option already exists.');
      return;
    }
    
    const nextValues = [
      ...(iceDataset?.values || []),
      { value, label: value }
    ];
    
    await updateIceDatasetValues(nextValues);
    setIceEditorValue('');
  };

  const handleMoveIceValue = (index, direction) => {
    if (!iceDataset?.values?.length) return;
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= iceDataset.values.length) return;
    const next = [...iceDataset.values];
    const [moved] = next.splice(index, 1);
    next.splice(nextIndex, 0, moved);
    updateIceDatasetValues(next);
  };

  const handleRemoveIceValue = (value) => {
    if (!iceDataset?.values?.length) return;
    const next = iceDataset.values.filter((entry) => entry.value !== value);
    updateIceDatasetValues(next);
  };

  const handleSortIceValues = async (direction = 'asc') => {
    if (!iceDataset) return;
    setIceEditorSaving(true);
    try {
      const sorted = [...(iceDataset.values || [])].sort((a, b) => {
        const aLabel = (a.label || a.value || '').toLowerCase();
        const bLabel = (b.label || b.value || '').toLowerCase();
        if (aLabel < bLabel) return direction === 'asc' ? -1 : 1;
        if (aLabel > bLabel) return direction === 'asc' ? 1 : -1;
        return 0;
      });
      await updateIceDatasetValues(sorted);
    } catch (error) {
      console.error('Failed to sort ice options', error);
    } finally {
      setIceEditorSaving(false);
    }
  };

  const closeIceEditor = () => {
    setIceEditorOpen(false);
    setIceEditorValue('');
  };

  const updateGarnishDatasetValues = useCallback(
    async (values = []) => {
      try {
        setGarnishEditorSaving(true);
        const response = await apiCall(`/inventory/datasets/${GARNISH_DATASET_ID}`, {
          method: 'PUT',
          body: JSON.stringify({ values })
        });
        if (response?.dataset) {
          setGarnishDataset(response.dataset);
        }
      } catch (error) {
        console.error('Failed to update garnish dataset', error);
        alert(`Failed to update garnish options: ${error.message || 'Unknown error'}`);
      } finally {
        setGarnishEditorSaving(false);
      }
    },
    [apiCall, GARNISH_DATASET_ID]
  );

  const handleAddGarnishValue = async () => {
    const rawValue = garnishEditorValue.trim();
    if (!rawValue) return;
    const value = toTitleCase(rawValue);
    
    // Check if value already exists
    if (garnishDataset?.values?.some((entry) => entry.value.toLowerCase() === value.toLowerCase())) {
      alert('That option already exists.');
      return;
    }
    
    const nextValues = [
      ...(garnishDataset?.values || []),
      { value, label: value }
    ];
    
    await updateGarnishDatasetValues(nextValues);
    setGarnishEditorValue('');
  };

  const handleMoveGarnishValue = (index, direction) => {
    if (!garnishDataset?.values?.length) return;
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= garnishDataset.values.length) return;
    const next = [...garnishDataset.values];
    const [moved] = next.splice(index, 1);
    next.splice(nextIndex, 0, moved);
    updateGarnishDatasetValues(next);
  };

  const handleRemoveGarnishValue = (value) => {
    if (!garnishDataset?.values?.length) return;
    const next = garnishDataset.values.filter((entry) => entry.value !== value);
    updateGarnishDatasetValues(next);
  };

  const handleSortGarnishValues = async (direction = 'asc') => {
    if (!garnishDataset) return;
    setGarnishEditorSaving(true);
    try {
      const sorted = [...(garnishDataset.values || [])].sort((a, b) => {
        const aLabel = (a.label || a.value || '').toLowerCase();
        const bLabel = (b.label || b.value || '').toLowerCase();
        if (aLabel < bLabel) return direction === 'asc' ? -1 : 1;
        if (aLabel > bLabel) return direction === 'asc' ? 1 : -1;
        return 0;
      });
      await updateGarnishDatasetValues(sorted);
    } catch (error) {
      console.error('Failed to sort garnish options', error);
    } finally {
      setGarnishEditorSaving(false);
    }
  };

  const closeGarnishEditor = () => {
    setGarnishEditorOpen(false);
    setGarnishEditorValue('');
  };

  const updateTypeDatasetValues = useCallback(
    async (values = []) => {
      try {
        setTypeEditorSaving(true);
        const response = await apiCall(`/inventory/datasets/${TYPE_DATASET_ID}`, {
          method: 'PUT',
          body: JSON.stringify({ values })
        });
        if (response?.dataset) {
          setTypeDataset(response.dataset);
        }
      } catch (error) {
        console.error('Failed to update type dataset', error);
        alert(`Failed to update type options: ${error.message || 'Unknown error'}`);
      } finally {
        setTypeEditorSaving(false);
      }
    },
    [apiCall, TYPE_DATASET_ID]
  );

  const handleAddTypeValue = async () => {
    const rawValue = typeEditorValue.trim();
    if (!rawValue) return;
    const value = toTitleCase(rawValue);
    
    // Check if value already exists
    if (typeDataset?.values?.some((entry) => entry.value.toLowerCase() === value.toLowerCase())) {
      alert('That option already exists.');
      return;
    }
    
    const nextValues = [
      ...(typeDataset?.values || []),
      { value, label: value }
    ];
    
    await updateTypeDatasetValues(nextValues);
    setTypeEditorValue('');
  };

  const handleMoveTypeValue = (index, direction) => {
    if (!typeDataset?.values?.length) return;
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= typeDataset.values.length) return;
    const next = [...typeDataset.values];
    const [moved] = next.splice(index, 1);
    next.splice(nextIndex, 0, moved);
    updateTypeDatasetValues(next);
  };

  const handleRemoveTypeValue = (value) => {
    if (!typeDataset?.values?.length) return;
    const next = typeDataset.values.filter((entry) => entry.value !== value);
    updateTypeDatasetValues(next);
  };

  const handleSortTypeValues = async (direction = 'asc') => {
    if (!typeDataset) return;
    setTypeEditorSaving(true);
    try {
      const sorted = [...(typeDataset.values || [])].sort((a, b) => {
        const aLabel = (a.label || a.value || '').toLowerCase();
        const bLabel = (b.label || b.value || '').toLowerCase();
        if (aLabel < bLabel) return direction === 'asc' ? -1 : 1;
        if (aLabel > bLabel) return direction === 'asc' ? 1 : -1;
        return 0;
      });
      await updateTypeDatasetValues(sorted);
    } catch (error) {
      console.error('Failed to sort type options', error);
    } finally {
      setTypeEditorSaving(false);
    }
  };

  const closeTypeEditor = () => {
    setTypeEditorOpen(false);
    setTypeEditorValue('');
  };

  const items = recipe.items || [];
  const recipeKey = recipe?._id || recipe?.clientId || 'new';

  const inventoryMap = useMemo(() => {
    const map = new Map();
    Object.values(inventoryCache).forEach((item) => {
      if (item?.id) {
        map.set(item.id, item);
      }
    });
    return map;
  }, [inventoryCache]);

  useEffect(() => {
    inventoryCacheRef.current = inventoryCache;
  }, [inventoryCache]);

  const upsertInventoryItems = useCallback((list = []) => {
    if (!list.length) return;
    setInventoryCache((prev) => {
      const next = { ...prev };
      list.forEach((item) => {
        if (item?.id) {
          next[item.id] = item;
        }
      });
      return next;
    });
  }, []);

  const fetchInventoryByIds = useCallback(
    async (ids = []) => {
      if (!ids.length) return;
      try {
        const response = await apiCall(
          `/recipes/ingredients/search?ids=${encodeURIComponent(ids.join(','))}`
        );
        const fetchedItems = response.items || [];
        upsertInventoryItems(fetchedItems);
      } catch (error) {
        console.error('Failed to hydrate inventory items', error);
      }
    },
    [apiCall, upsertInventoryItems]
  );

  const fetchSearchResults = useCallback(
    async (rowKey, query) => {
      if (!query || query.length < 1) {
        setSearchState((prev) => ({
          ...prev,
          [rowKey]: { loading: false, items: [] }
        }));
        return;
      }
      setSearchState((prev) => ({
        ...prev,
        [rowKey]: { ...(prev[rowKey] || {}), loading: true }
      }));
      try {
        const response = await apiCall(
          `/recipes/ingredients/search?query=${encodeURIComponent(query)}&limit=20`
        );
        const items = response.items || [];
        upsertInventoryItems(items);
        setSearchState((prev) => ({
          ...prev,
          [rowKey]: { loading: false, items }
        }));
      } catch (error) {
        console.error('Inventory search failed', error);
        setSearchState((prev) => ({
          ...prev,
          [rowKey]: { loading: false, error: error.message, items: [] }
        }));
      }
    },
    [apiCall, upsertInventoryItems]
  );

  const handleIngredientInputChange = useCallback(
    (rowKey, value) => {
      setIngredientSearch((prev) => ({ ...prev, [rowKey]: value }));
      setOpenDropdownKey(rowKey);
      if (searchTimersRef.current[rowKey]) {
        clearTimeout(searchTimersRef.current[rowKey]);
      }
      if (!value || !value.trim()) {
        setSearchState((prev) => ({
          ...prev,
          [rowKey]: { loading: false, items: [] }
        }));
        setOpenDropdownKey(null);
        return;
      }
      searchTimersRef.current[rowKey] = setTimeout(() => {
        fetchSearchResults(rowKey, value.trim());
      }, 200);
    },
    [fetchSearchResults]
  );

  // Update recipe ref when recipe prop changes
  useEffect(() => {
    recipeRef.current = recipe;
  }, [recipe]);

  useEffect(() => {
    if (!items.length) return;
    // Skip re-hydration if user is actively typing/editing
    if (isUserUpdatingRef.current || Object.keys(amountInputs).length > 0) {
      return; // Don't re-hydrate while user is typing
    }
    // Always re-hydrate items to get current inventory pricing (especially for pre-mix ounceCost)
    // This ensures saved recipes get updated pricing from inventory
    // But preserve the display value if it's empty (user is typing or field is blank)
    const hydrated = items.map((item) => {
      const hydratedItem = hydrateRow(item, inventoryMap);
      // Preserve empty display to keep field blank
      if (item.amount?.display === '' && hydratedItem.amount?.display !== '') {
        hydratedItem.amount.display = '';
      }
      return hydratedItem;
    });
    // Only update if pricing actually changed (to avoid infinite loops)
    const hasPricingChanges = hydrated.some((item, idx) => {
      const oldPricing = items[idx]?.pricing;
      const newPricing = item.pricing;
      return JSON.stringify(oldPricing) !== JSON.stringify(newPricing);
    });
    if (hasPricingChanges || hydrated.length !== items.length) {
      updateItems(hydrated);
    }
  }, [items, inventoryMap, amountInputs, recipeKey]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const next = {};
    (recipe.items || []).forEach((row, idx) => {
      const key = row.tempId || row._id || `row-${idx}`;
      if (row.ingredient?.name) {
        next[key] = row.ingredient.name;
      }
    });
    setIngredientSearch(next);
  }, [recipeKey]);

  const updateRecipe = (nextRecipe) => {
    // Mark that this is a user-initiated update
    isUserUpdatingRef.current = true;
    onChange(nextRecipe);
    // Clear the flag after a short delay to allow re-hydration to resume
    setTimeout(() => {
      isUserUpdatingRef.current = false;
    }, 100);
  };

  useEffect(() => {
    const missingKeys = (recipe.items || [])
      .map((row) => {
        if (row.inventoryKey) return row.inventoryKey;
        if (row.ingredient?.inventoryKey) return row.ingredient.inventoryKey;
        if (row.ingredient?.sheetKey && row.ingredient?.rowId) {
          return `${row.ingredient.sheetKey}:${row.ingredient.rowId}`;
        }
        return null;
      })
      .filter(Boolean)
      .filter((key) => !inventoryCacheRef.current[key]);
    
    if (missingKeys.length) {
      fetchInventoryByIds(missingKeys).then(() => {
        // After fetching by IDs, check if any items are still missing
        // If so, try searching by ingredient name
        const stillMissing = (recipe.items || [])
          .map((row, idx) => {
            const ingredientKey =
              row.inventoryKey ||
              row.ingredient?.inventoryKey ||
              (row.ingredient?.sheetKey && row.ingredient?.rowId
                ? `${row.ingredient.sheetKey}:${row.ingredient.rowId}`
                : null);
            if (ingredientKey && !inventoryCacheRef.current[ingredientKey] && row.ingredient?.name) {
              return { row, idx, ingredientName: row.ingredient.name };
            }
            return null;
          })
          .filter(Boolean);
        
        if (stillMissing.length > 0) {
          // Search for each missing ingredient by name
          const searchPromises = stillMissing.map(({ row, idx, ingredientName }) => {
            return apiCall(`/recipes/ingredients/search?query=${encodeURIComponent(ingredientName)}&limit=5`)
              .then((response) => {
                const items = response.items || [];
                // Find exact match by name (case-insensitive)
                const exactMatch = items.find(
                  (item) => item.name && item.name.toLowerCase() === ingredientName.toLowerCase()
                );
                const match = exactMatch || items[0];
                if (match) {
                  upsertInventoryItems([match]);
                  // Update the recipe item to use the correct inventory key
                  const currentRecipe = recipeRef.current || recipe;
                  const updatedItems = [...(currentRecipe.items || [])];
                  if (updatedItems[idx]) {
                    updatedItems[idx] = {
                      ...updatedItems[idx],
                      inventoryKey: match.id,
                      ingredient: {
                        ...updatedItems[idx].ingredient,
                        inventoryKey: match.id,
                        sheetKey: match.sheetKey,
                        rowId: match.rowId,
                        name: match.name
                      }
                    };
                    updateRecipe({ ...currentRecipe, items: updatedItems });
                  }
                } else {
                  console.warn(`⚠️ No match found for ingredient "${ingredientName}"`);
                }
              })
              .catch((error) => {
                console.error(`Failed to search for ingredient "${ingredientName}":`, error);
              });
          });
          // Wait for all searches to complete
          Promise.all(searchPromises).catch((error) => {
            console.error('Error during ingredient name searches:', error);
          });
        }
      });
    }
  }, [recipe.items, recipeKey, fetchInventoryByIds, apiCall, upsertInventoryItems, recipe, updateRecipe]);

  const updateItems = (nextItems) => {
    const totals = calculateTotals(nextItems);
    updateRecipe({ ...recipe, items: nextItems, totals });
  };

  const handleTitleChange = (value) => {
    // Use the ref to get the latest recipe to avoid stale closures
    const currentRecipe = recipeRef.current || recipe;
    // Store raw value while typing - Title Case will be applied on blur
    updateRecipe({ ...currentRecipe, title: value });
  };

  const handleTitleBlur = () => {
    // Apply Title Case formatting when user finishes typing
    const currentRecipe = recipeRef.current || recipe;
    if (currentRecipe?.title) {
      const formattedTitle = toTitleCase(currentRecipe.title);
      if (formattedTitle !== currentRecipe.title) {
        updateRecipe({ ...currentRecipe, title: formattedTitle });
      }
    }
  };

  const handleVideoChange = (field, value) => {
    const currentRecipe = recipeRef.current || recipe;
    updateRecipe({ ...currentRecipe, video: { ...(currentRecipe.video || {}), [field]: value } });
  };

  const handleVideoFileSelect = (file) => {
    if (!file) {
      setVideoFile(null);
      if (videoPreviewUrl) {
        URL.revokeObjectURL(videoPreviewUrl);
        setVideoPreviewUrl(null);
      }
      return;
    }
    setVideoFile(file);
    const fileUrl = URL.createObjectURL(file);
    setVideoPreviewUrl(fileUrl);
    // Store video file in recipe for parent to access
    const currentRecipe = recipeRef.current || recipe;
    updateRecipe({ ...currentRecipe, _videoFile: file });
  };

  const handleMetadataChange = (field, value) => {
    const currentRecipe = recipeRef.current || recipe;
    const updatedMetadata = { ...(currentRecipe.metadata || {}), [field]: value };
    updateRecipe({ ...currentRecipe, metadata: updatedMetadata });
  };

  const handleNotesChange = (value, field = 'notes') => {
    const currentRecipe = recipeRef.current || recipe;
    updateRecipe({ ...currentRecipe, [field]: value });
  };

  const handleBackgroundColorChange = (color) => {
    const currentRecipe = recipeRef.current || recipe;
    updateRecipe({ ...currentRecipe, backgroundColor: color });
  };

  // Export functions
  const exportAsImage = async (format = 'png') => {
    if (!recipeCardRef.current) return;
    
    try {
      setExporting(true);
      const bgColor = recipe?.backgroundColor || '#ffffff';
      const canvas = await html2canvas(recipeCardRef.current, {
        backgroundColor: bgColor,
        scale: 2,
        logging: false,
        useCORS: true
      });
      
      const dataUrl = canvas.toDataURL(`image/${format}`, 1.0);
      const link = document.createElement('a');
      link.download = `${recipe.title || 'recipe'}.${format}`;
      link.href = dataUrl;
      link.click();
    } catch (error) {
      console.error('Error exporting image:', error);
      alert('Failed to export image. Please try again.');
    } finally {
      setExporting(false);
      setShowExportMenu(false);
    }
  };

  const exportAsPDF = async () => {
    if (!recipeCardRef.current) return;
    
    try {
      setExporting(true);
      const bgColor = recipe?.backgroundColor || '#ffffff';
      const canvas = await html2canvas(recipeCardRef.current, {
        backgroundColor: bgColor,
        scale: 2,
        logging: false,
        useCORS: true
      });
      
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();
      const imgWidth = canvas.width;
      const imgHeight = canvas.height;
      const ratio = Math.min(pdfWidth / imgWidth, pdfHeight / imgHeight);
      const imgX = (pdfWidth - imgWidth * ratio) / 2;
      const imgY = 0;
      
      pdf.addImage(imgData, 'PNG', imgX, imgY, imgWidth * ratio, imgHeight * ratio);
      pdf.save(`${recipe.title || 'recipe'}.pdf`);
    } catch (error) {
      console.error('Error exporting PDF:', error);
      alert('Failed to export PDF. Please try again.');
    } finally {
      setExporting(false);
      setShowExportMenu(false);
    }
  };

  const exportAsJSON = () => {
    try {
      const dataStr = JSON.stringify(recipe, null, 2);
      const dataBlob = new Blob([dataStr], { type: 'application/json' });
      const url = URL.createObjectURL(dataBlob);
      const link = document.createElement('a');
      link.download = `${recipe.title || 'recipe'}.json`;
      link.href = url;
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error exporting JSON:', error);
      alert('Failed to export JSON. Please try again.');
    } finally {
      setShowExportMenu(false);
    }
  };

  const printRecipe = () => {
    if (!recipeCardRef.current) return;
    
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      alert('Please allow popups to print the recipe.');
      return;
    }
    
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>${recipe.title || 'Recipe'}</title>
          <style>
            body {
              font-family: 'Montserrat', sans-serif;
              padding: 20px;
              margin: 0;
            }
            .recipe-print {
              max-width: 800px;
              margin: 0 auto;
            }
            table {
              width: 100%;
              border-collapse: collapse;
              margin: 20px 0;
            }
            th, td {
              border: 1px solid #ddd;
              padding: 8px;
              text-align: left;
            }
            th {
              background-color: #f0f0f0;
              font-weight: bold;
            }
            @media print {
              body { margin: 0; padding: 10px; }
            }
          </style>
        </head>
        <body>
          <div class="recipe-print">
            <h1>${recipe.title || 'Recipe'}</h1>
            ${recipe.metadata?.type ? `<p><strong>Type:</strong> ${recipe.metadata.type}</p>` : ''}
            ${recipe.metadata?.ice ? `<p><strong>Ice:</strong> ${recipe.metadata.ice}</p>` : ''}
            ${recipe.metadata?.garnish ? `<p><strong>Garnish:</strong> ${recipe.metadata.garnish}</p>` : ''}
            <h2>Ingredients</h2>
            <table>
              <thead>
                <tr>
                  <th>Ingredient</th>
                  <th>Amount</th>
                  <th>Unit</th>
                  <th>Cost</th>
                </tr>
              </thead>
              <tbody>
                ${(recipe.items || []).map(item => `
                  <tr>
                    <td>${item.ingredient?.name || ''}</td>
                    <td>${item.amount?.display || item.amount?.value || ''}</td>
                    <td>${item.amount?.unit || ''}</td>
                    <td>$${item.extendedCost?.toFixed(2) || '0.00'}</td>
                  </tr>
                `).join('')}
              </tbody>
              <tfoot>
                <tr>
                  <td colspan="3"><strong>Total</strong></td>
                  <td><strong>$${recipe.totals?.costEach?.toFixed(2) || '0.00'}</strong></td>
                </tr>
              </tfoot>
            </table>
            ${recipe.totals?.volumeOz ? `<p><strong>Total Volume:</strong> ${recipe.totals.volumeOz.toFixed(2)} oz</p>` : ''}
            ${recipe.notes ? `<h2>Notes</h2><p>${recipe.notes}</p>` : ''}
          </div>
        </body>
      </html>
    `);
    
    printWindow.document.close();
    setTimeout(() => {
      printWindow.print();
    }, 250);
    setShowExportMenu(false);
  };

  const addRow = () => {
    const tempId = uniqueId();
    const row = hydrateRow(
      {
        tempId,
        inventoryKey: '',
        ingredient: { sheetKey: '', rowId: '', name: '' },
        ingredientLabel: '',
        amount: { unit: 'oz', fraction: defaultFraction(), value: 0, display: '' },
        pricing: { currency: 'USD' },
        order: items.length + 1
      },
      inventoryMap
    );
    updateItems([...items, row]);
    setIngredientSearch((prev) => ({ ...prev, [tempId]: '' }));
  };

  const updateRow = (index, updater) => {
    const nextItems = items.map((item, idx) => {
      if (idx !== index) return item;
      const updated = typeof updater === 'function' ? updater(item) : { ...item, ...updater };
      return hydrateRow(updated, inventoryMap);
    });
    updateItems(nextItems);
  };

  const removeRow = (index, rowKey) => {
    const nextItems = items.filter((_, idx) => idx !== index);
    updateItems(nextItems);
    setIngredientSearch((prev) => {
      const clone = { ...prev };
      delete clone[rowKey];
      return clone;
    });
    setSearchState((prev) => {
      const clone = { ...prev };
      delete clone[rowKey];
      return clone;
    });
    if (openDropdownKey === rowKey) {
      setOpenDropdownKey(null);
    }
  };

  const handleIngredientSelect = (rowKey, index, key, payload) => {
    const source = payload || inventoryMap.get(key);
    if (!source) {
      updateRow(index, {
        inventoryKey: '',
        ingredient: { sheetKey: '', rowId: '', name: '', inventoryKey: '' }
      });
      return;
    }
    upsertInventoryItems([source]);
    updateRow(index, {
      inventoryKey: key,
      ingredient: {
        sheetKey: source.sheetKey,
        rowId: String(source.rowId),
        name: source.name || source.values?.name || '',
        inventoryKey: key
      }
    });
    const resolvedLabel = source.name || source.values?.name || '';
    setIngredientSearch((prev) => ({
      ...prev,
      [rowKey]: resolvedLabel
    }));
    setOpenDropdownKey(null);
  };

  const handleAmountChange = (index, inputValue) => {
    const rowKey = items[index]?.tempId || items[index]?._id || `row-${index}`;
    
    // Always store raw input while typing - this allows free typing
    setAmountInputs(prev => ({
      ...prev,
      [rowKey]: inputValue
    }));
    
    // Parse the input (can be decimal or fraction string)
    const amountValue = parseFractionInput(inputValue);
    
    // Always update the row, even with partial input
    updateRow(index, (row) => {
      // Convert to fraction format for storage
      const rounded = roundToNearestEighth(amountValue);
      const whole = Math.floor(rounded);
      const fractional = rounded - whole;
      const numerator = Math.round(fractional * 8);
      const denominator = 8;
      
      // Simplify fraction
      const gcd = (a, b) => b === 0 ? a : gcd(b, a % b);
      const divisor = gcd(numerator, denominator);
      const simplifiedNum = numerator / divisor;
      const simplifiedDen = denominator / divisor;
      
      const fraction = {
        whole,
        numerator: simplifiedNum,
        denominator: simplifiedDen
      };
      
      return {
        ...row,
        amount: {
          ...(row.amount || {}),
          fraction,
          value: amountValue,
          display: inputValue // Keep raw input as display while typing
        }
      };
    });
    
    // Force a small delay to ensure state updates are processed
    // This prevents the input from being cleared during re-renders
  };
  
  const handleAmountBlur = (index) => {
    const rowKey = items[index]?.tempId || items[index]?._id || `row-${index}`;
    const rawInput = amountInputs[rowKey];
    
    // Parse and format the final value
    const amountValue = rawInput !== undefined ? parseFractionInput(rawInput) : (items[index]?.amount?.value || 0);
    
    updateRow(index, (row) => {
      const rounded = roundToNearestEighth(amountValue);
      const whole = Math.floor(rounded);
      const fractional = rounded - whole;
      const numerator = Math.round(fractional * 8);
      const denominator = 8;
      
      const gcd = (a, b) => b === 0 ? a : gcd(b, a % b);
      const divisor = gcd(numerator, denominator);
      const simplifiedNum = numerator / divisor;
      const simplifiedDen = denominator / divisor;
      
      const fraction = {
        whole,
        numerator: simplifiedNum,
        denominator: simplifiedDen
      };
      
      return {
        ...row,
        amount: {
          ...(row.amount || {}),
          fraction,
          value: amountValue,
          display: amountValue === 0 ? '' : decimalToFraction(amountValue)
        }
      };
    });
    
    // Clear the raw input
    setAmountInputs(prev => {
      const next = { ...prev };
      delete next[rowKey];
      return next;
    });
  };

  const handleUnitChange = (index, unit) => {
    updateRow(index, (row) => ({
      ...row,
      amount: {
        ...(row.amount || {}),
        unit
      }
    }));
  };

  const handleBatchChange = (field, value) => {
    updateRecipe({ ...recipe, batch: { ...(recipe.batch || {}), [field]: value } });
  };

  // Calculate batch rows based on batch size input
  const batchRows = useMemo(() => {
    const totalOz = items.reduce((sum, item) => sum + (item.conversions?.toOz || 0), 0);
    const targetValue = Number(batchSize) || 0;
    
    if (!totalOz || !targetValue) {
      return items.map((item, index) => ({
        id: item.tempId || item._id || `row-${index}`,
        name: item.ingredient?.name || 'Ingredient',
        oz: 0,
        ml: 0,
        originalOz: item.conversions?.toOz || 0
      }));
    }
    
    // Calculate the factor based on the new method
    // If ml is selected: factor = targetMl / (totalOz * 29.5735)
    // If oz is selected: factor = (targetOz * 29.5735) / (totalOz * 29.5735) = targetOz / totalOz
    let factor;
    if (batchUnit === 'ml') {
      const totalMl = totalOz * ML_PER_OZ;
      factor = targetValue / totalMl;
    } else {
      factor = targetValue / totalOz;
    }
    
    // Check if H2O (or H20) is an ingredient
    const h2oIndex = items.findIndex((item) => {
      const name = item.ingredient?.name || '';
      return name.toUpperCase() === 'H2O' || name.toUpperCase() === 'H20' || name.toUpperCase() === 'WATER';
    });
    
    // Calculate target total ML
    const targetTotalMl = batchUnit === 'ml' ? targetValue : targetValue * ML_PER_OZ;
    
    return items.map((item, index) => {
      const ingredientOz = item.conversions?.toOz || 0;
      
      // If this is H2O, adjust to meet target total
      if (index === h2oIndex && h2oIndex !== -1) {
        // Calculate sum of all other ingredients
        const otherIngredientsMl = items.reduce((sum, otherItem, otherIndex) => {
          if (otherIndex === h2oIndex) return sum;
          const otherOz = otherItem.conversions?.toOz || 0;
          const otherMl = otherOz * ML_PER_OZ;
          const otherScaledMl = otherMl * factor;
          return sum + Math.round(otherScaledMl);
        }, 0);
        
        // H2O ML = target total - sum of all other ingredients
        const h2oMl = Math.round(targetTotalMl - otherIngredientsMl);
        const h2oOz = h2oMl / ML_PER_OZ;
        const roundedOz = roundToNearestEighth(h2oOz);
        
        return {
          id: item.tempId || item._id || `row-${index}`,
          name: item.ingredient?.name || 'Ingredient',
          oz: roundedOz,
          ozDisplay: decimalToFraction(roundedOz),
          ml: Math.max(0, h2oMl), // Ensure non-negative
          originalOz: ingredientOz
        };
      }
      
      // For all other ingredients, calculate normally
      // Calculate: (ingredientOz * 29.5735) * factor
      const ingredientMl = ingredientOz * ML_PER_OZ;
      const scaledMl = ingredientMl * factor;
      
      // Round ML to nearest whole number (this is the final ML value)
      const finalMl = Math.round(scaledMl);
      
      // Calculate OZ from the rounded ML (for display)
      const scaledOz = finalMl / ML_PER_OZ;
      const roundedOz = roundToNearestEighth(scaledOz);
      
      return {
        id: item.tempId || item._id || `row-${index}`,
        name: item.ingredient?.name || 'Ingredient',
        oz: roundedOz,
        ozDisplay: decimalToFraction(roundedOz),
        ml: Math.round(finalMl), // Ensure it's definitely rounded
        originalOz: ingredientOz
      };
    });
  }, [items, batchSize, batchUnit]);

  const totalBatchOz = batchRows.reduce((sum, row) => sum + row.oz, 0);
  const totalBatchMl = batchRows.reduce((sum, row) => sum + row.ml, 0);
  const totalBatchOzDisplay = decimalToFraction(totalBatchOz);
  // Always round total ML to whole number
  const totalBatchMlRounded = Math.round(totalBatchMl);

  const shouldShowSidePanel = SHOW_COCKTAIL_DETAILS || SHOW_BATCH_DETAILS || SHOW_NOTES;

  // Always recalculate totals from items to ensure accuracy
  const totals = calculateTotals(items);

  // Only use custom background color for premix, otherwise use default
  const backgroundColor = (type === 'premix' && recipe?.backgroundColor) ? recipe.backgroundColor : '#d0d0d0';

  return (
    <div className="recipe-builder-card" ref={recipeCardRef} style={{ backgroundColor: '#d0d0d0', border: '2px solid #666666' }}>
      <div className="recipe-builder-header" style={{ backgroundColor }}>
        <div className="recipe-title-section" style={{ backgroundColor }}>
          <div style={{ position: 'relative' }}>
            <label className="recipe-label">NAME</label>
            <input
              type="text"
              className="recipe-title-input"
              value={forceUppercaseTitle ? (recipe?.title || '').toUpperCase() : (recipe?.title || '')}
              onChange={(e) => {
                if (!disableTitleEdit) {
                  const value = forceUppercaseTitle ? e.target.value.toUpperCase() : e.target.value;
                  handleTitleChange(value);
                }
              }}
              onBlur={() => {
                if (!disableTitleEdit && !forceUppercaseTitle) {
                  handleTitleBlur();
                }
              }}
              placeholder=""
              readOnly={disableTitleEdit}
              style={disableTitleEdit ? { 
                backgroundColor: 'white', 
                cursor: 'not-allowed',
                opacity: 1
              } : {
                textTransform: forceUppercaseTitle ? 'uppercase' : 'none'
              }}
              title={disableTitleEdit ? 'Recipe name is synced with cocktail name above' : ''}
            />
            {recipe?.itemNumber && (
              <span
                style={{
                  position: 'absolute',
                  bottom: '4px',
                  right: '8px',
                  fontSize: '11px',
                  color: '#999',
                  pointerEvents: 'none',
                  userSelect: 'none'
                }}
              >
                {recipe.itemNumber}
              </span>
            )}
          </div>
          <div className="recipe-details-row">
            {/* Color picker for premix */}
            {type === 'premix' && (
              <div className="recipe-type-picker">
                <div className="recipe-type-label-row">
                  <label className="recipe-label">COLOR</label>
                </div>
                <div className="recipe-type-select-wrapper" style={{ position: 'relative' }}>
                  <div 
                    className="recipe-type-display-box"
                    style={{ 
                      cursor: 'pointer',
                      backgroundColor: '#ffffff',
                      border: '2px solid #666666',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      aspectRatio: '1',
                      width: '100%',
                      maxWidth: '60px'
                    }}
                    onClick={() => setShowColorPicker(!showColorPicker)}
                  >
                    <div
                      style={{
                        width: '90%',
                        aspectRatio: '1',
                        backgroundColor: recipe?.backgroundColor || '#e5e5e5',
                        border: '1px solid #999'
                      }}
                    />
                  </div>
                  {showColorPicker && (
                    <div 
                      style={{
                        position: 'absolute',
                        top: '100%',
                        left: 0,
                        marginTop: '4px',
                        backgroundColor: 'white',
                        border: '1px solid #d4d4d4',
                        borderRadius: '8px',
                        boxShadow: '0 4px 14px rgba(0, 0, 0, 0.15)',
                        zIndex: 1000,
                        padding: '12px',
                        display: 'grid',
                        gridTemplateColumns: 'repeat(10, 1fr)',
                        gap: '4px',
                        width: '400px'
                      }}
                      onMouseLeave={() => setShowColorPicker(false)}
                    >
                      {PRESELECTED_COLORS.map((color) => (
                        <button
                          key={color}
                          type="button"
                          onClick={() => {
                            handleBackgroundColorChange(color);
                            setShowColorPicker(false);
                          }}
                          style={{
                            width: '32px',
                            height: '32px',
                            backgroundColor: color,
                            border: recipe?.backgroundColor === color ? '2px solid #000' : '1px solid #ccc',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            padding: 0
                          }}
                          title={color}
                        />
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
            <div className="recipe-type-picker">
              <div className="recipe-type-label-row">
                <label className="recipe-label">TYPE</label>
                <button
                  type="button"
                  className="inventory-select fake-select-button inventory-ice-edit-btn"
                  onClick={() => setTypeEditorOpen((prev) => !prev)}
                  title="Manage type options"
                />
              </div>
              <div className="recipe-type-select-wrapper">
                <div className="recipe-type-display-box">
                  <span className="recipe-type-display-text">
                    {(() => {
                      const typeValue = recipe.metadata?.type;
                      if (!typeValue) return '';
                      // Try to find the label from the dataset
                      const datasetOption = typeDataset?.values?.find(
                        (v) => String(v.value).toLowerCase() === String(typeValue).toLowerCase()
                      );
                      // Always show the type if it exists, prefer label but fallback to value
                      const displayText = datasetOption?.label || typeValue;
                      return displayText;
                    })()}
                  </span>
                  <select
                    value={recipe.metadata?.type || ''}
                    onChange={(e) => handleMetadataChange('type', e.target.value)}
                    className="recipe-type-select-hidden"
                  >
                    <option value="" hidden>
                    </option>
                    {(typeDataset?.values || []).map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              {typeEditorOpen && (
                <div className="inventory-editor-popover">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-semibold text-gray-700">
                        {typeDataset?.label || 'Type options'}
                      </span>
                      <div className='editor-actions'>
                        <button
                          type='button'
                          className='inventory-sort-button'
                          onClick={() => handleSortTypeValues('asc')}
                          disabled={typeEditorSaving}
                        >
                          A→Z
                        </button>
                        <button
                          type="button"
                          className="inventory-editor-close"
                          onClick={closeTypeEditor}
                          aria-label="Close"
                        >
                          ×
                        </button>
                      </div>
                    </div>
                    <div className="inventory-editor-options">
                      {typeDataset?.values?.length ? (
                        typeDataset.values.map((entry, idx) => (
                          <div key={entry.value} className="inventory-editor-option">
                            <div className="inventory-editor-move">
                              <button
                                type="button"
                                onClick={() => handleMoveTypeValue(idx, -1)}
                                disabled={typeEditorSaving || idx === 0}
                                title="Move up"
                              >
                                ▲
                              </button>
                              <button
                                type="button"
                                onClick={() => handleMoveTypeValue(idx, 1)}
                                disabled={
                                  typeEditorSaving ||
                                  idx === (typeDataset.values?.length || 0) - 1
                                }
                                title="Move down"
                              >
                                ▼
                              </button>
                            </div>
                            <span>{entry.label}</span>
                            <button
                              type="button"
                              onClick={() => handleRemoveTypeValue(entry.value)}
                              disabled={typeEditorSaving}
                              title="Remove option"
                            >
                              −
                            </button>
                          </div>
                        ))
                      ) : (
                        <div className="inventory-editor-empty">No options yet.</div>
                      )}
                    </div>
                    <div className="inventory-editor-input">
                      <input
                        type="text"
                        value={typeEditorValue}
                        onChange={(e) => setTypeEditorValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && typeEditorValue.trim() && !typeEditorSaving) {
                            e.preventDefault();
                            handleAddTypeValue();
                          }
                        }}
                        placeholder="Add option"
                        disabled={typeEditorSaving}
                      />
                      <button
                        type="button"
                        onClick={handleAddTypeValue}
                        disabled={typeEditorSaving || !typeEditorValue.trim()}
                      >
                        +
                      </button>
                    </div>
                </div>
              )}
            </div>
            {(type === 'cocktail' || type === 'mocktail') && (
              <div className="recipe-type-picker">
                <div className="recipe-type-label-row">
                  <label className="recipe-label">ICE</label>
                  <button
                    type="button"
                    className="inventory-select fake-select-button inventory-ice-edit-btn"
                    onClick={() => setIceEditorOpen((prev) => !prev)}
                    title="Manage ice options"
                  />
                </div>
                <div className="recipe-type-select-wrapper">
                  <div className="recipe-type-display-box">
                    <span className="recipe-type-display-text">
                      {(() => {
                        const iceValue = recipe.metadata?.ice;
                        if (!iceValue) return '';
                        const datasetOption = iceDataset?.values?.find(
                          (v) => String(v.value).toLowerCase() === String(iceValue).toLowerCase()
                        );
                        return datasetOption?.label || iceValue;
                      })()}
                    </span>
                    <select
                      value={recipe.metadata?.ice || ''}
                      onChange={(e) => handleMetadataChange('ice', e.target.value)}
                      className="recipe-type-select-hidden"
                    >
                      <option value="" hidden></option>
                      {(iceDataset?.values || []).map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                {iceEditorOpen && (
                  <div className="inventory-editor-popover">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-semibold text-gray-700">
                        {iceDataset?.label || 'Ice options'}
                      </span>
                      <div className='editor-actions'>
                        <button
                          type='button'
                          className='inventory-sort-button'
                          onClick={() => handleSortIceValues('asc')}
                          disabled={iceEditorSaving}
                        >
                          A→Z
                        </button>
                        <button
                          type="button"
                          className="inventory-editor-close"
                          onClick={closeIceEditor}
                          aria-label="Close"
                        >
                          ×
                        </button>
                      </div>
                    </div>
                    <div className="inventory-editor-options">
                      {iceDataset?.values?.length ? (
                        iceDataset.values.map((entry, idx) => (
                          <div key={entry.value} className="inventory-editor-option">
                            <div className="inventory-editor-move">
                              <button
                                type="button"
                                onClick={() => handleMoveIceValue(idx, -1)}
                                disabled={iceEditorSaving || idx === 0}
                                title="Move up"
                              >
                                ▲
                              </button>
                              <button
                                type="button"
                                onClick={() => handleMoveIceValue(idx, 1)}
                                disabled={
                                  iceEditorSaving ||
                                  idx === (iceDataset.values?.length || 0) - 1
                                }
                                title="Move down"
                              >
                                ▼
                              </button>
                            </div>
                            <span>{entry.label}</span>
                            <button
                              type="button"
                              onClick={() => handleRemoveIceValue(entry.value)}
                              disabled={iceEditorSaving}
                              title="Remove option"
                            >
                              −
                            </button>
                          </div>
                        ))
                      ) : (
                        <div className="inventory-editor-empty">No options yet.</div>
                      )}
                    </div>
                    <div className="inventory-editor-input">
                      <input
                        type="text"
                        value={iceEditorValue}
                        onChange={(e) => setIceEditorValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && iceEditorValue.trim() && !iceEditorSaving) {
                            e.preventDefault();
                            handleAddIceValue();
                          }
                        }}
                        placeholder="Add option"
                        disabled={iceEditorSaving}
                      />
                      <button
                        type="button"
                        onClick={handleAddIceValue}
                        disabled={iceEditorSaving || !iceEditorValue.trim()}
                      >
                        +
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
            {(type === 'cocktail' || type === 'mocktail') && (
              <div className="recipe-type-picker">
                <div className="recipe-type-label-row">
                  <label className="recipe-label">GARNISH</label>
                </div>
                <div className="recipe-type-select-wrapper">
                  <input
                    type="text"
                    className="recipe-type-display-box recipe-garnish-input"
                    value={recipe.metadata?.garnish || ''}
                    onChange={(e) => handleMetadataChange('garnish', e.target.value)}
                    placeholder=""
                  />
                </div>
              </div>
            )}
          </div>
        </div>
        {!hideActions && (
        <div className="recipe-actions" style={{ backgroundColor }}>
          <button type="button" className="recipes-primary-btn" disabled={saving} onClick={onSave}>
            {saving ? 'Saving…' : saveButtonLabel}
          </button>
          {onDelete ? (
            <button
              type="button"
              className="recipes-primary-btn"
              disabled={saving}
              onClick={onDelete}
            >
              DELETE
            </button>
          ) : null}
        </div>
        )}
        {hideActions && (
          <div className="recipe-actions" style={{ position: 'relative', backgroundColor, display: 'flex', gap: '8px' }}>
            <button
              type="button"
              className="recipes-primary-btn"
              disabled={saving}
              onClick={() => onSave && onSave()}
              style={{ 
                position: 'relative',
                backgroundColor: '#d0d0d0',
                color: '#000',
                border: '2px solid #666666',
                borderColor: '#666666',
                borderRadius: '0'
              }}
              onMouseEnter={(e) => {
                if (!e.currentTarget.disabled) {
                  e.currentTarget.style.backgroundColor = '#b8b8b8';
                  e.currentTarget.style.borderColor = '#666666';
                }
              }}
              onMouseLeave={(e) => {
                if (!e.currentTarget.disabled) {
                  e.currentTarget.style.backgroundColor = '#d0d0d0';
                  e.currentTarget.style.borderColor = '#666666';
                }
              }}
            >
              {saving ? 'Saving…' : 'SAVE RECIPE'}
            </button>
            <button
              type="button"
              className="recipes-primary-btn"
              disabled={exporting}
              onClick={() => setShowExportMenu(!showExportMenu)}
              style={{ 
                position: 'relative',
                backgroundColor: '#d0d0d0',
                color: '#000',
                border: '2px solid #666666',
                borderColor: '#666666',
                borderRadius: '0'
              }}
              onMouseEnter={(e) => {
                if (!e.currentTarget.disabled) {
                  e.currentTarget.style.backgroundColor = '#b8b8b8';
                  e.currentTarget.style.borderColor = '#666666';
                }
              }}
              onMouseLeave={(e) => {
                if (!e.currentTarget.disabled) {
                  e.currentTarget.style.backgroundColor = '#d0d0d0';
                  e.currentTarget.style.borderColor = '#666666';
                }
              }}
            >
              {exporting ? 'Exporting…' : 'EXPORT RECIPE'}
            </button>
            {showExportMenu && (
              <div
                style={{
                  position: 'absolute',
                  top: '100%',
                  left: 0,
                  marginTop: '4px',
                  backgroundColor: 'white',
                  border: '1px solid #d4d4d4',
                  borderRadius: '8px',
                  boxShadow: '0 4px 14px rgba(0, 0, 0, 0.15)',
                  zIndex: 1000,
                  minWidth: '200px',
                  padding: '8px 0'
                }}
                onMouseLeave={() => setShowExportMenu(false)}
              >
                <button
                  type="button"
                  onClick={printRecipe}
                  style={{
                    width: '100%',
                    padding: '8px 16px',
                    textAlign: 'left',
                    border: 'none',
                    background: 'transparent',
                    cursor: 'pointer',
                    fontFamily: 'Montserrat, sans-serif',
                    fontSize: '0.9rem'
                  }}
                  onMouseEnter={(e) => e.target.style.backgroundColor = '#d0d0d0'}
                  onMouseLeave={(e) => e.target.style.backgroundColor = 'transparent'}
                >
                  🖨️ Print
                </button>
                <button
                  type="button"
                  onClick={exportAsPDF}
                  disabled={exporting}
                  style={{
                    width: '100%',
                    padding: '8px 16px',
                    textAlign: 'left',
                    border: 'none',
                    background: 'transparent',
                    cursor: exporting ? 'not-allowed' : 'pointer',
                    fontFamily: 'Montserrat, sans-serif',
                    fontSize: '0.9rem',
                    opacity: exporting ? 0.5 : 1
                  }}
                  onMouseEnter={(e) => !exporting && (e.target.style.backgroundColor = '#d0d0d0')}
                  onMouseLeave={(e) => e.target.style.backgroundColor = 'transparent'}
                >
                  📄 Export as PDF
                </button>
                <button
                  type="button"
                  onClick={() => exportAsImage('png')}
                  disabled={exporting}
                  style={{
                    width: '100%',
                    padding: '8px 16px',
                    textAlign: 'left',
                    border: 'none',
                    background: 'transparent',
                    cursor: exporting ? 'not-allowed' : 'pointer',
                    fontFamily: 'Montserrat, sans-serif',
                    fontSize: '0.9rem',
                    opacity: exporting ? 0.5 : 1
                  }}
                  onMouseEnter={(e) => !exporting && (e.target.style.backgroundColor = '#d0d0d0')}
                  onMouseLeave={(e) => e.target.style.backgroundColor = 'transparent'}
                >
                  🖼️ Export as PNG
                </button>
                <button
                  type="button"
                  onClick={() => exportAsImage('jpg')}
                  disabled={exporting}
                  style={{
                    width: '100%',
                    padding: '8px 16px',
                    textAlign: 'left',
                    border: 'none',
                    background: 'transparent',
                    cursor: exporting ? 'not-allowed' : 'pointer',
                    fontFamily: 'Montserrat, sans-serif',
                    fontSize: '0.9rem',
                    opacity: exporting ? 0.5 : 1
                  }}
                  onMouseEnter={(e) => !exporting && (e.target.style.backgroundColor = '#d0d0d0')}
                  onMouseLeave={(e) => e.target.style.backgroundColor = 'transparent'}
                >
                  🖼️ Export as JPG
                </button>
                <button
                  type="button"
                  onClick={exportAsJSON}
                  style={{
                    width: '100%',
                    padding: '8px 16px',
                    textAlign: 'left',
                    border: 'none',
                    background: 'transparent',
                    cursor: 'pointer',
                    fontFamily: 'Montserrat, sans-serif',
                    fontSize: '0.9rem'
                  }}
                  onMouseEnter={(e) => e.target.style.backgroundColor = '#d0d0d0'}
                  onMouseLeave={(e) => e.target.style.backgroundColor = 'transparent'}
                >
                  📋 Export as JSON
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      <div className={`recipe-layout-grid recipe-layout-with-batch ${shouldShowSidePanel ? '' : 'no-side-panel'}`}>
        <section className="recipe-media-panel" style={{ border: '2px solid #666666' }}>
          <div className="recipe-media-inputs">
            <label className="recipe-label">NOTES:</label>
            <textarea
              className="recipe-input"
              value={recipe.metadata?.style || ''}
              onChange={(e) => handleMetadataChange('style', e.target.value)}
              rows={3}
              style={{ border: 'none', outline: 'none' }}
            />
          </div>
        </section>

        <section className="recipe-table-panel" style={{ border: '2px solid #666666' }}>
          <table className="inventory-table recipe-table">
            <thead>
              <tr>
                <th>INGREDIENT</th>
                <th>AMT</th>
                <th>UNIT</th>
                <th>Σ oz</th>
                <th>$ / oz</th>
                <th>$ / AMT</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {items.map((row, index) => {
                const rowKey = row.tempId || row._id || `row-${index}`;
                const searchValue = ingredientSearch[rowKey] ?? row.ingredient?.name ?? '';
                const state = searchState[rowKey] || { items: [] };
                const options = state.items || [];
                return (
                <tr key={rowKey}>
                  <td>
                    <div className="ingredient-selector">
                      <input
                        type="text"
                        className="recipe-input ingredient-input"
                        value={searchValue}
                        placeholder="Type ingredient"
                        onChange={(e) => handleIngredientInputChange(rowKey, e.target.value)}
                        onFocus={() => {
                          setOpenDropdownKey(rowKey);
                          // If there's already a value, trigger a search to show results
                          if (searchValue && searchValue.trim().length > 0) {
                            handleIngredientInputChange(rowKey, searchValue);
                          }
                        }}
                        onBlur={() => {
                          setTimeout(() => {
                            if (openDropdownKey === rowKey) {
                              setOpenDropdownKey(null);
                            }
                          }, 120);
                        }}
                      />
                      {openDropdownKey === rowKey && (
                        <div className="ingredient-dropdown">
                          {state.loading ? (
                            <div className="ingredient-empty">Searching…</div>
                          ) : options.length ? (
                            options.map((item) => (
                              <button
                                type="button"
                                key={item.id}
                                className="ingredient-option"
                                onMouseDown={(e) => e.preventDefault()}
                                onClick={() =>
                                  handleIngredientSelect(rowKey, index, item.id, item)
                                }
                              >
                                <span className="ingredient-name">{item.name}</span>
                                <span className="ingredient-sheet">
                                  {labelForSheet(item.sheetKey)}
                                </span>
                              </button>
                            ))
                          ) : searchValue && searchValue.trim().length ? (
                            <div className="ingredient-empty">No matches found</div>
                          ) : (
                            <div className="ingredient-empty">Type to search inventory</div>
                          )}
                        </div>
                      )}
                    </div>
                  </td>
                  <td>
                    <input
                      type="text"
                      className="recipe-input"
                      value={(() => {
                        const rowKey = row.tempId || row._id || `row-${index}`;
                        // Priority 1: If user is typing, always show raw input
                        if (amountInputs[rowKey] !== undefined) {
                          return amountInputs[rowKey];
                        }
                        // Priority 2: Show stored display value if it exists
                        const display = row.amount?.display;
                        if (display !== undefined && display !== null && display !== '') {
                          return display;
                        }
                        // Priority 3: If value is 0 or empty, show blank
                        const value = row.amount?.value;
                        if (value === undefined || value === null || value === 0) {
                          return '';
                        }
                        // Priority 4: Format the value as fraction
                        return decimalToFraction(value);
                      })()}
                      onChange={(e) => handleAmountChange(index, e.target.value)}
                      onBlur={() => handleAmountBlur(index)}
                      placeholder="0"
                    />
                  </td>
                  <td>
                    <select
                      className="recipe-input"
                      value={row.amount?.unit || 'oz'}
                      onChange={(e) => handleUnitChange(index, e.target.value)}
                    >
                      {UNIT_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="text-right">{formatNumber(row.conversions?.toOz, 2)}</td>
                  <td className="text-right">
                    {(() => {
                      const perOz = row.pricing?.perOz;
                      // More lenient check - allow 0 as a valid value
                      if (perOz != null && perOz !== '' && Number.isFinite(Number(perOz))) {
                        const numValue = Number(perOz);
                        if (numValue >= 0) {
                          return `$${formatNumber(numValue, 2)}`;
                        }
                      }
                      return '—';
                    })()}
                  </td>
                  <td className="text-right">{`$${formatNumber(row.extendedCost, 2)}`}</td>
                  <td className="text-center">
                    <button
                      type="button"
                      className="recipes-remove-row"
                      onClick={() => removeRow(index, rowKey)}
                    >
                      ×
                    </button>
                  </td>
                </tr>
              );
              })}
              <tr>
                <td colSpan={7}>
                  <button type="button" className="recipes-add-row" onClick={addRow}>
                    + Add ingredient
                  </button>
                </td>
              </tr>
            </tbody>
            <tfoot>
              <tr style={{ backgroundColor: '#d0d0d0' }}>
                <td colSpan={3} className="text-right font-semibold" style={{ backgroundColor: '#d0d0d0', color: '#000' }}>
                  TOTAL
                </td>
                <td className="text-right font-semibold" style={{ backgroundColor: '#d0d0d0', color: '#000' }}>{formatNumber(totals.volumeOz, 2)} oz</td>
                <td style={{ backgroundColor: '#d0d0d0' }} />
                <td className="text-right font-semibold" style={{ backgroundColor: '#d0d0d0', color: '#000' }}>
                  {`$${formatNumber(totals.costEach, 2)}`}
                </td>
                <td style={{ backgroundColor: '#d0d0d0' }} />
              </tr>
            </tfoot>
          </table>
        </section>

        <section className="recipe-media-panel" style={{ border: '2px solid #666666' }}>
          <div className="recipe-batch-section">
            <table className="recipe-batch-table">
              <thead>
                <tr>
                  <th style={{ backgroundColor: '#d0d0d0', color: '#000' }}>OZ</th>
                  <th style={{ backgroundColor: '#d0d0d0', color: '#000' }}>BATCH</th>
                  <th style={{ backgroundColor: '#d0d0d0', color: '#000' }}>ML</th>
                </tr>
              </thead>
              <tbody>
                {batchRows.map((row, index) => {
                  const rowId = row.id;
                  const isChecked = batchCheckboxes[rowId] || false;
                  return (
                    <tr key={rowId}>
                      <td className="text-center">{row.ozDisplay || ''}</td>
                      <td className="text-center">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={(e) => {
                            setBatchCheckboxes(prev => ({
                              ...prev,
                              [rowId]: e.target.checked
                            }));
                          }}
                          className="recipe-batch-checkbox"
                        />
                      </td>
                      <td className="text-center">
                        {(() => {
                          if (row.ml <= 0) return '';
                          // Always display as whole number
                          const mlValue = Number(row.ml);
                          const rounded = Math.round(mlValue);
                          return rounded.toFixed(0);
                        })()}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr style={{ backgroundColor: '#d0d0d0' }}>
                  <td className="text-center font-semibold" style={{ backgroundColor: '#d0d0d0', color: '#000' }}>
                    {totalBatchOzDisplay || ''}
                  </td>
                  <td style={{ backgroundColor: '#d0d0d0' }}></td>
                  <td className="text-center font-semibold" style={{ backgroundColor: '#d0d0d0', color: '#000' }}>
                    {totalBatchMlRounded > 0 
                      ? `${totalBatchMlRounded.toFixed(0)} ML` 
                      : ''}
                  </td>
                </tr>
                <tr style={{ backgroundColor: '#d0d0d0' }}>
                  <td colSpan={3} className="recipe-batch-input-row" style={{ backgroundColor: '#d0d0d0' }}>
                    <div className="recipe-batch-input-group">
                      <input
                        type="number"
                        className="recipe-input recipe-batch-size-input"
                        value={batchSize}
                        onChange={(e) => setBatchSize(e.target.value)}
                        placeholder="0"
                        step="0.01"
                      />
                      <select
                        className="recipe-input recipe-batch-unit-select"
                        value={batchUnit}
                        onChange={(e) => setBatchUnit(e.target.value)}
                      >
                        <option value="oz">oz</option>
                        <option value="ml">ml</option>
                      </select>
                    </div>
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </section>

        {shouldShowSidePanel && (
          <section className="recipe-side-panel">
            {SHOW_COCKTAIL_DETAILS && type === 'cocktail' && (
              <div className="recipe-info-card">
                <h3>COCKTAIL INFORMATION</h3>
                <label className="recipe-label mt-2">PRICE (SET)</label>
                <input
                  type="number"
                  className="recipe-input"
                  value={recipe.metadata?.priceSet || ''}
                  onChange={(e) => handleMetadataChange('priceSet', e.target.value)}
                />
                <label className="recipe-label mt-2">PRICE (MIN)</label>
                <input
                  type="number"
                  className="recipe-input"
                  value={recipe.metadata?.priceMin || ''}
                  onChange={(e) => handleMetadataChange('priceMin', e.target.value)}
                />
                <label className="recipe-label mt-2">STYLE</label>
                <input
                  type="text"
                  className="recipe-input"
                  value={recipe.metadata?.style || ''}
                  onChange={(e) => handleMetadataChange('style', e.target.value)}
                />
                <label className="recipe-label mt-2">GLASSWARE</label>
                <input
                  type="text"
                  className="recipe-input"
                  value={recipe.metadata?.glassware || ''}
                  onChange={(e) => handleMetadataChange('glassware', e.target.value)}
                />
                <label className="recipe-label mt-2">ICE</label>
                <input
                  type="text"
                  className="recipe-input"
                  value={recipe.metadata?.ice || ''}
                  onChange={(e) => handleMetadataChange('ice', e.target.value)}
                />
                <label className="recipe-label mt-2">GARNISH</label>
                <input
                  type="text"
                  className="recipe-input"
                  value={recipe.metadata?.garnish || ''}
                  onChange={(e) => handleMetadataChange('garnish', e.target.value)}
                />
              </div>
            )}

            {SHOW_NOTES && type !== 'cocktail' && (
              <div className="recipe-info-card">
                <h3>NOTES</h3>
                <textarea
                  className="recipe-textarea"
                  rows={10}
                  value={recipe.notes || ''}
                  onChange={(e) => handleNotesChange(e.target.value)}
                />
              </div>
            )}

            {SHOW_BATCH_DETAILS && (
              <div className="recipe-batch-card">
                <h3>BATCH</h3>
                <div className="batch-row">
                  <label className="recipe-label">Amount</label>
                  <input
                    type="number"
                    className="recipe-input"
                    value={recipe.batch?.size || ''}
                    onChange={(e) => handleBatchChange('size', e.target.value)}
                  />
                  <select
                    className="recipe-input"
                    value={recipe.batch?.unit || 'oz'}
                    onChange={(e) => handleBatchChange('unit', e.target.value)}
                  >
                    <option value="oz">oz</option>
                    <option value="ml">ml</option>
                  </select>
                </div>
                <div className="batch-row">
                  <label className="recipe-label">Yield (servings)</label>
                  <input
                    type="number"
                    className="recipe-input"
                    value={recipe.batch?.yieldCount || ''}
                    onChange={(e) => handleBatchChange('yieldCount', e.target.value)}
                  />
                </div>
                <table className="recipe-batch-table">
                  <thead>
                    <tr>
                      <th style={{ backgroundColor: '#d0d0d0', color: '#000' }}>Ingredient</th>
                      <th style={{ backgroundColor: '#d0d0d0', color: '#000' }}>oz</th>
                      <th style={{ backgroundColor: '#d0d0d0', color: '#000' }}>ml</th>
                    </tr>
                  </thead>
                  <tbody>
                    {batchRows.map((row) => (
                      <tr key={row.id}>
                        <td>{row.name}</td>
                        <td className="text-right">{row.oz.toFixed(2)}</td>
                        <td className="text-right">{row.ml.toFixed(1)}</td>
                      </tr>
                    ))}
                    {!batchRows.length && (
                      <tr>
                        <td colSpan={3} className="text-center text-gray-400">
                          Enter batch amount to calculate totals.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}
      </div>

      {SHOW_COCKTAIL_DETAILS && SHOW_NOTES && type === 'cocktail' && (
        <section className="recipe-notes-panel" style={{ border: '2px solid #666666' }}>
          <div>
            <label className="recipe-label">NOTES</label>
            <textarea
              className="recipe-textarea"
              rows={6}
              value={recipe.notes || ''}
              onChange={(e) => handleNotesChange(e.target.value)}
            />
          </div>
        </section>
      )}
    </div>
  );
};

export default RecipeBuilder;

