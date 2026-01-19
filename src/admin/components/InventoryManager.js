import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

// Calculate actual cost per serving from recipe items
const calculateCostPerServing = (recipe) => {
  if (!recipe?.items || !Array.isArray(recipe.items) || recipe.items.length === 0) {
    return null;
  }
  
  // Sum up all extendedCost values from items
  const totalCost = recipe.items.reduce((sum, item) => {
    const extendedCost = item.extendedCost || 0;
    return sum + (Number.isFinite(extendedCost) ? extendedCost : 0);
  }, 0);
  
  return Number(totalCost.toFixed(2));
};

const SHEET_ORDER = ['cocktails', 'mocktails', 'wine', 'beer', 'spirits', 'preMix', 'dryStock'];
const DROPDOWN_COLUMNS = {
  cocktails: ['ice', 'style'],
  mocktails: ['ice', 'style'],
  wine: ['style', 'hue', 'distributor'],
  spirits: ['spirit', 'distributor'],
  dryStock: ['type', 'distributor'],
  preMix: ['type'],
  beer: ['type']
};

const DEFAULT_COLUMN_WIDTH = 200;
const UNIT_COLUMN_WIDTH = 80;
const DEFAULT_ACTION_COLUMN_WIDTH = 56;

const COLUMN_WIDTHS = {
  cocktails: {
    name: 240,
    region: 120,
    style: 120,
    ice: 120,
    garnish: 120,
    sumOz: 80,
    unitCost: 80,
    itemNumber: 80,
    menu: 80
  },
  mocktails: {
    name: 240,
    region: 120,
    style: 120,
    ice: 120,
    garnish: 120,
    sumOz: 80,
    unitCost: 80,
    itemNumber: 80,
    menu: 80
  },
  wine: {
    name: 240,
    style: 120,
    hue: 80,
    region: 120,
    distributor: 120,
    sizeMl: 80,
    unitCost: 80,
    ounceCost: 80,
    glassCost: 80,
    itemNumber: 80,
    menu: 80
  },
  spirits: {
    name: 240,
    spirit: 120,
    region: 120,
    distributor: 120,
    sizeOz: 80,
    unitCost: 80,
    ounceCost: 80,
    itemNumber: 80,
    menu: 80
  },
  dryStock: {
    name: 240,
    type: 120,
    distributor: 120,
    sizeG: 80,
    sizeUnit: 100,
    unitCost: 80,
    gramCost: 80,
    itemNumber: 80
  },
  preMix: {
    name: 240,
    type: 120,
    cocktail: 120,
    ounceCost: 80,
    itemNumber: 80,
    menu: 80
  },
  beer: {
    name: 240,
    type: 120,
    region: 120,
    packCost: 80,
    numUnits: 80,
    unitCost: 80,
    itemNumber: 80,
    menu: 80
  }
};

const ACTION_COLUMN_WIDTHS = {
  cocktails: 22.4,
  mocktails: 22.4,
  wine: 22.4,
  spirits: 22.4,
  dryStock: 22.4,
  preMix: 22.4,
  beer: 22.4
};

const SORTABLE_COLUMNS = {
  cocktails: [
    { key: 'name', label: 'Name' },
    { key: 'style', label: 'Type' },
    { key: 'ice', label: 'Ice' }
  ],
  mocktails: [
    { key: 'name', label: 'Name' },
    { key: 'style', label: 'Type' },
    { key: 'ice', label: 'Ice' }
  ],
  wine: [
    { key: 'name', label: 'Name' },
    { key: 'style', label: 'Style' },
    { key: 'hue', label: 'Hue' },
    { key: 'region', label: 'Region' }
  ],
  spirits: [
    { key: 'name', label: 'Name' },
    { key: 'spirit', label: 'Spirit' },
    { key: 'region', label: 'Region' }
  ],
  dryStock: [
    { key: 'name', label: 'Name' },
    { key: 'type', label: 'Type' }
  ],
  preMix: [
    { key: 'name', label: 'Name' },
    { key: 'type', label: 'Type' }
  ],
  beer: [
    { key: 'name', label: 'Name' },
    { key: 'type', label: 'Type' },
    { key: 'region', label: 'Region' }
  ]
};

const CONVERTER_OPTIONS = [
  {
    id: 'lb_to_g',
    label: 'Pounds (lb) → Grams (g)',
    fromLabel: 'Pounds',
    fromUnit: 'lb',
    toUnit: 'g',
    factor: 453.59237
  },
  {
    id: 'oz_to_g',
    label: 'Ounces (oz) → Grams (g)',
    fromLabel: 'Ounces',
    fromUnit: 'oz',
    toUnit: 'g',
    factor: 28.3495231
  },
  {
    id: 'gallon_to_ml',
    label: 'Gallons → Milliliters',
    fromLabel: 'Gallons',
    fromUnit: 'gal',
    toUnit: 'ml',
    factor: 3785.41
  },
  {
    id: 'quart_to_ml',
    label: 'Quarts → Milliliters',
    fromLabel: 'Quarts',
    fromUnit: 'qt',
    toUnit: 'ml',
    factor: 946.353
  },
  {
    id: 'pint_to_ml',
    label: 'Pints → Milliliters',
    fromLabel: 'Pints',
    fromUnit: 'pt',
    toUnit: 'ml',
    factor: 473.176
  },
  {
    id: 'cup_to_ml',
    label: 'Cups → Milliliters',
    fromLabel: 'Cups',
    fromUnit: 'cup',
    toUnit: 'ml',
    factor: 236.588
  },
  {
    id: 'floz_to_ml',
    label: 'Fluid ounces → Milliliters',
    fromLabel: 'Fluid ounces',
    fromUnit: 'fl oz',
    toUnit: 'ml',
    factor: 29.5735
  },
  {
    id: 'liter_to_ml',
    label: 'Liters → Milliliters',
    fromLabel: 'Liters',
    fromUnit: 'L',
    toUnit: 'ml',
    factor: 1000
  }
];

const CONVERTER_SUPPORT_TEXT = 'lb · oz · gallon · quart · pint · cup · fl oz · liter';

// Format text to title case (first letter capital, rest lowercase)
// Preserves country codes (2-3 letter uppercase codes like GB, US, FR)
// Preserves acronyms with multiple capitals (G&T, USA, etc.)
const toTitleCase = (text) => {
  if (!text || typeof text !== 'string') return text;
  const trimmed = text.trim();
  if (!trimmed) return trimmed;
  
  // Check if it's a country code (2-3 uppercase letters)
  if (/^[A-Z]{2,3}$/.test(trimmed)) {
    return trimmed; // Preserve country codes as-is
  }
  
  // For comma-separated values (like regions), process each part
  if (trimmed.includes(',')) {
    return trimmed
      .split(',')
      .map(part => {
        const partTrimmed = part.trim();
        // Preserve country codes
        if (/^[A-Z]{2,3}$/.test(partTrimmed)) {
          return partTrimmed;
        }
        // Apply title case to other parts, preserving acronyms
        return partTrimmed
          .split(/\s+/)
          .map(word => {
            // Preserve acronyms (patterns like G&T, USA, etc.)
            // Match: single letter + & + single letter (case-insensitive), convert to uppercase
            if (/^[A-Za-z]&[A-Za-z]$/.test(word)) {
              return word.toUpperCase(); // Convert G&T, g&t, G&t, g&T all to G&T
            }
            // Match: 2+ consecutive capitals (preserve as-is)
            if (/^[A-Z]{2,}$/.test(word)) {
              return word;
            }
            // Apply title case
            return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
          })
          .join(' ');
      })
      .join(', ');
  }
  
  // Apply title case to single value, preserving acronyms
  return trimmed
    .split(/\s+/)
    .map(word => {
      // Preserve acronyms (patterns like G&T, USA, etc.)
      // Match: single letter + & + single letter (case-insensitive), convert to uppercase
      if (/^[A-Za-z]&[A-Za-z]$/.test(word)) {
        return word.toUpperCase(); // Convert G&T, g&t, G&t, g&T all to G&T
      }
      // Match: 2+ consecutive capitals (preserve as-is)
      if (/^[A-Z]{2,}$/.test(word)) {
        return word;
      }
      // Apply title case
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(' ');
};

// List of shared fields between MenuManager and Inventory that should use title case
const getSharedFields = (sheetKey) => {
  const commonFields = ['name'];
  const categoryFields = {
    cocktails: ['name', 'region', 'style', 'ice', 'garnish'],
    mocktails: ['name', 'region', 'style', 'ice', 'garnish'],
    wine: ['name', 'style', 'hue', 'region', 'distributor'],
    beer: ['name', 'type', 'region'],
    spirits: ['name', 'spirit', 'region', 'distributor'],
    preMix: ['name', 'type', 'cocktail']
  };
  return categoryFields[sheetKey] || commonFields;
};

const InventoryManager = () => {
  const { apiCall, user } = useAuth();
  const { sheetKey } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [sheetList, setSheetList] = useState([]);
  const [sheetPayload, setSheetPayload] = useState(null);
  const [datasets, setDatasets] = useState([]);
  const [listLoading, setListLoading] = useState(true);
  const [sheetLoading, setSheetLoading] = useState(false);
  const [error, setError] = useState('');
  const [mocktailRecipes, setMocktailRecipes] = useState([]);
  const [mocktailRecipesLoading, setMocktailRecipesLoading] = useState(false);
  const [rowActionLoading, setRowActionLoading] = useState({ type: null, rowId: null });
  const [pendingDeleteRowId, setPendingDeleteRowId] = useState(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [pendingRowUpdates, setPendingRowUpdates] = useState({});
  const pendingRowUpdatesRef = useRef({});
  const [savingRows, setSavingRows] = useState({});
  const savingRowsRef = useRef({});
  const [datasetEditor, setDatasetEditor] = useState(null);
  const [datasetEditorValue, setDatasetEditorValue] = useState('');
  const [datasetSaving, setDatasetSaving] = useState(false);
  const [countries, setCountries] = useState([]);
  const [countryInputs, setCountryInputs] = useState({});
  const countriesRef = useRef([]);
  const countryInputsRef = useRef({});
  const [openRegionDropdown, setOpenRegionDropdown] = useState(null); // rowId of open dropdown
  const [regionSearchQuery, setRegionSearchQuery] = useState({}); // search query per row
  const [selectedRegions, setSelectedRegions] = useState({}); // { rowId: [countryCodes] }
  const [distributorOptions, setDistributorOptions] = useState([]);
  const distributorListRef = useRef([]);
  const [sortConfig, setSortConfig] = useState({});
  const [searchQuery, setSearchQuery] = useState('');
  const [converterOptionId, setConverterOptionId] = useState(
    CONVERTER_OPTIONS[0]?.id || null
  );
  const [converterInput, setConverterInput] = useState('');
  const [showHiddenColumns, setShowHiddenColumns] = useState(false);

  // Update search query when URL search param changes
  useEffect(() => {
    const searchParams = new URLSearchParams(location.search);
    const searchParam = searchParams.get('search') || '';
    if (searchParam && searchParam !== searchQuery) {
      setSearchQuery(searchParam);
    }
  }, [location.search, searchQuery]);

  useEffect(() => {
    const fetchSheets = async () => {
      setListLoading(true);
      try {
        const response = await apiCall('/inventory/sheets');
        const sheets = response?.sheets || [];
        sheets.sort((a, b) => SHEET_ORDER.indexOf(a.sheetKey) - SHEET_ORDER.indexOf(b.sheetKey));
        setSheetList(sheets);
      } catch (err) {
        setError(err.message || 'Failed to load inventory sheets.');
      } finally {
        setListLoading(false);
      }
    };

    fetchSheets();
  }, [apiCall]);

  useEffect(() => {
    let isMounted = true;
    const fetchCountries = async () => {
      try {
        const response = await apiCall('/countries');
        if (!isMounted) return;
        const list = Array.isArray(response) ? response : response?.countries;
        if (Array.isArray(list)) {
          setCountries(list);
        } else {
          setCountries([]);
        }
      } catch (err) {
        console.error('Failed to load countries', err);
      }
    };
    fetchCountries();
    return () => {
      isMounted = false;
    };
  }, [apiCall]);

  useEffect(() => {
    countriesRef.current = countries;
  }, [countries]);

  useEffect(() => {
    countryInputsRef.current = countryInputs;
  }, [countryInputs]);

  const closeRegionSelector = useCallback((rowId) => {
    setOpenRegionDropdown(null);
    setRegionSearchQuery(prev => {
      const updated = { ...prev };
      delete updated[rowId];
      return updated;
    });
  }, []);

  // Close region dropdown when clicking outside
  useEffect(() => {
    if (!openRegionDropdown) return;
    const handleClickOutside = (e) => {
      if (!e.target.closest('.region-dropdown-container')) {
        closeRegionSelector(openRegionDropdown);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [openRegionDropdown, closeRegionSelector]);

  const resolvedSheetKey = useMemo(() => {
    if (!sheetList.length) return null;
    if (sheetKey && sheetList.some((sheet) => sheet.sheetKey === sheetKey)) {
      return sheetKey;
    }
    return sheetList[0]?.sheetKey || null;
  }, [sheetList, sheetKey]);

  useEffect(() => {
    if (!resolvedSheetKey) return;
    if (resolvedSheetKey !== sheetKey) {
      navigate(`/admin/inventory/${resolvedSheetKey}`, { replace: true });
    }
  }, [resolvedSheetKey, sheetKey, navigate]);

  useEffect(() => {
    setPendingRowUpdates({});
    pendingRowUpdatesRef.current = {};
  }, [resolvedSheetKey]);

  useEffect(() => {
    const loadSheet = async () => {
      if (!resolvedSheetKey) return;
      setSheetLoading(true);
      setError('');
      try {
        // For cocktails and mocktails, add a query param to force refresh
        const refreshParam = (resolvedSheetKey === 'cocktails' || resolvedSheetKey === 'mocktails') 
          ? `?refresh=${Date.now()}` 
          : '';
        const response = await apiCall(`/inventory/${resolvedSheetKey}${refreshParam}`);
        setSheetPayload(response.sheet);
        setDatasets(response.datasets || []);
      } catch (err) {
        setError(err.message || 'Failed to load sheet data.');
      } finally {
        setSheetLoading(false);
      }
    };

    loadSheet();
  }, [resolvedSheetKey, apiCall]);

  useEffect(() => {
    const loadMocktailRecipes = async () => {
      if (resolvedSheetKey !== 'mocktails') return;
      setMocktailRecipesLoading(true);
      setError('');
      try {
        const response = await apiCall('/recipes?type=mocktail');
        // Filter to ensure only mocktail recipes are shown
        const mocktailRecipes = (response.recipes || []).filter(recipe => recipe.type === 'mocktail');
        const mapped = mocktailRecipes.map((recipe) => ({
          ...recipe,
          clientId: recipe._id,
          backgroundColor: recipe.backgroundColor || '#e5e5e5',
          metadata: recipe.metadata || {}
        }));
        setMocktailRecipes(mapped);
      } catch (err) {
        setError(err.message || 'Failed to load mocktail recipes.');
      } finally {
        setMocktailRecipesLoading(false);
      }
    };

    loadMocktailRecipes();
  }, [resolvedSheetKey, apiCall]);

  const activeSheetMeta = useMemo(
    () => sheetList.find((sheet) => sheet.sheetKey === resolvedSheetKey),
    [sheetList, resolvedSheetKey]
  );

  const activeColumns = useMemo(() => {
    if (!sheetPayload?.columns) return [];
    // Columns to hide/show with the "Show hidden columns" button
    const hideableColumnKeys = ['itemNumber', 'ingredients', 'concept', 'page'];
    let columns = sheetPayload.columns;
    
    // Filter out hideable columns when showHiddenColumns is false
    if (!showHiddenColumns) {
      columns = columns.filter((column) => !hideableColumnKeys.includes(column.key));
    }
    
    // Apply dryStock specific transformation
    if (sheetPayload.sheetKey !== 'dryStock') return columns;
    return columns.map((column) =>
      column.key === 'gramCost' ? { ...column, label: '$ / oz' } : column
    );
  }, [sheetPayload, showHiddenColumns]);
  const currentColumnWidths = COLUMN_WIDTHS[resolvedSheetKey] || {};
  const currentActionColumnWidth =
    ACTION_COLUMN_WIDTHS[resolvedSheetKey] ?? DEFAULT_ACTION_COLUMN_WIDTH;
  const dropdownColumnKeys = useMemo(
    () => DROPDOWN_COLUMNS[resolvedSheetKey] || [],
    [resolvedSheetKey]
  );
  const activeRows = useMemo(() => {
    if (!sheetPayload?.rows?.length) return [];
    let rows = sheetPayload.rows.filter((row) => !row.isDeleted);
    
    // For cocktails and mocktails, show all rows (including newly added empty rows)
    // Previously filtered to only show rows with recipeId or name, but now all rows are editable
    // No filtering needed - all rows should be visible
    
    // Apply search filter if search query exists
    if (searchQuery && searchQuery.trim().length > 0) {
      const queryLower = searchQuery.toLowerCase().trim();
      rows = rows.filter((row) => {
        const values = row.values || {};
        // Search across all visible field values
        return Object.values(values).some((value) => {
          if (value == null) return false;
          const valueStr = String(value).toLowerCase();
          return valueStr.includes(queryLower);
        });
      });
    }
    
    const config = sortConfig[resolvedSheetKey];
    if (!config?.column) {
      return rows.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    }
    const { column, direction } = config;
    return [...rows].sort((a, b) => {
      const aVal = a.values?.[column];
      const bVal = b.values?.[column];
      if (aVal == null && bVal == null) return 0;
      if (aVal == null) return direction === 'asc' ? -1 : 1;
      if (bVal == null) return direction === 'asc' ? 1 : -1;
      const aStr = String(aVal).toLowerCase();
      const bStr = String(bVal).toLowerCase();
      if (aStr < bStr) return direction === 'asc' ? -1 : 1;
      if (aStr > bStr) return direction === 'asc' ? 1 : -1;
      return 0;
    });
  }, [sheetPayload, sortConfig, resolvedSheetKey, searchQuery]);

  const selectedConverter = useMemo(() => {
    if (!CONVERTER_OPTIONS.length) return null;
    return (
      CONVERTER_OPTIONS.find((option) => option.id === converterOptionId) ||
      CONVERTER_OPTIONS[0]
    );
  }, [converterOptionId]);

  const converterOutput = useMemo(() => {
    if (!selectedConverter) return '';
    const numericValue = Number(converterInput);
    if (!Number.isFinite(numericValue)) return '';
    const result = numericValue * selectedConverter.factor;
    if (!Number.isFinite(result)) return '';
    return result.toFixed(2);
  }, [converterInput, selectedConverter]);

  const converterOutputLabel = useMemo(() => {
    if (!selectedConverter) return '';
    if (selectedConverter.toUnit === 'g') return 'Grams';
    if (selectedConverter.toUnit === 'ml') return 'Milliliters';
    return selectedConverter.toUnit;
  }, [selectedConverter]);

  const showConverter = resolvedSheetKey === 'dryStock' && Boolean(selectedConverter);

  const renderCellValue = (row, column) => {
    if (!row?.values) return '';
    // Handle both Map and plain object values
    let value;
    if (row.values instanceof Map) {
      value = row.values.get(column.key);
    } else {
      value = row.values[column.key];
    }
    if (value == null || value === '') return '';
    if (column.type === 'currency') {
      return `$${Number(value).toFixed(column.precision ?? 2)}`;
    }
    if (column.unit && column.type !== 'currency') {
      return `${value} ${column.unit}`;
    }
    // For dropdown columns, try to find the label from the dataset
    if (column.datasetId && column.type === 'dropdown') {
      const dataset = datasets.find((ds) => ds._id === column.datasetId);
      if (dataset && dataset.values) {
        // Try exact match first
        let option = dataset.values.find(
          (v) => String(v.value) === String(value)
        );
        // If no exact match, try case-insensitive match
        if (!option) {
          option = dataset.values.find(
            (v) => String(v.value).toLowerCase() === String(value).toLowerCase()
          );
        }
        if (option) {
          return option.label || option.value;
        }
      }
      // If no match found in dataset, still return the raw value
      return value;
    }
    return value;
  };

  const queueRowUpdate = (rowId, columnKey, value) => {
    const payload = { [columnKey]: value };
    setSheetPayload((prev) => {
      if (!prev) return prev;
      const updatedRows = prev.rows.map((row) => {
        if (row._id !== rowId) return row;
        return {
          ...row,
          values: {
            ...(row.values || {}),
            [columnKey]: value
          }
        };
      });
      return { ...prev, rows: updatedRows };
    });
    setPendingRowUpdates((prev) => ({
      ...prev,
      [rowId]: {
        ...(prev[rowId] || {}),
        [columnKey]: value
      }
    }));
    pendingRowUpdatesRef.current = {
      ...pendingRowUpdatesRef.current,
      [rowId]: {
        ...(pendingRowUpdatesRef.current[rowId] || {}),
        [columnKey]: value
      }
    };
    return payload;
  };

  const handleNameChange = useCallback((rowId, columnKey, value, currentSheetKey) => {
    // Don't apply title case while typing - just store the raw value
    queueRowUpdate(rowId, columnKey, value);
  }, []);
  
  const handleNameBlur = useCallback((rowId, columnKey, value, currentSheetKey) => {
    // Apply title case on blur for shared fields (except region which is handled separately)
    const sheetKeyToUse = currentSheetKey || sheetKey || 'cocktails';
    const sharedFields = getSharedFields(sheetKeyToUse);
    if (sharedFields.includes(columnKey) && columnKey !== 'region' && value && typeof value === 'string') {
      const titleCaseValue = toTitleCase(value);
      queueRowUpdate(rowId, columnKey, titleCaseValue);
    }
  }, [sheetKey]);

  const clearCountryInput = (rowId) => {
    setCountryInputs((prev) => {
      if (!prev[rowId]) return prev;
      const next = { ...prev };
      delete next[rowId];
      return next;
    });
    if (countryInputsRef.current[rowId]) {
      const clone = { ...countryInputsRef.current };
      delete clone[rowId];
      countryInputsRef.current = clone;
    }
  };

  const handleCountryInputChange = (rowId, value) => {
    setCountryInputs((prev) => ({
      ...prev,
      [rowId]: value
    }));
  };

  const resolveCountryCode = (rawValue) => {
    if (typeof rawValue !== 'string') return null;
    const trimmed = rawValue.trim();
    if (!trimmed) return null;
    const parenMatch = trimmed.match(/\(([A-Za-z]{2,3})\)$/);
    if (parenMatch) {
      return parenMatch[1].toUpperCase();
    }
    const list = countriesRef.current || [];
    const directMatch = list.find(
      (country) => country.code?.toLowerCase() === trimmed.toLowerCase()
    );
    if (directMatch) {
      return directMatch.code.toUpperCase();
    }
    const nameMatch = list.find(
      (country) => country.name?.toLowerCase() === trimmed.toLowerCase()
    );
    if (nameMatch) {
      return nameMatch.code.toUpperCase();
    }
    return null;
  };

  // Initialize selected regions from existing region values (comma-separated string or array)
  useEffect(() => {
    if (!sheetPayload?.rows || !countries.length) return;
    const initialSelections = {};
    sheetPayload.rows.forEach((row) => {
      if (row.isDeleted) return;
      const values = row.values || {};
      
      // Try to get from regions array first (new format), then fallback to region string
      let codes = [];
      if (values.regions && Array.isArray(values.regions)) {
        codes = values.regions
          .map(c => String(c).trim().toUpperCase())
          .filter(c => c && countriesRef.current.some(country => country.code === c));
      } else if (values.region) {
        // Parse comma-separated string to array of country codes
        codes = String(values.region)
          .split(',')
          .map(c => c.trim().toUpperCase())
          .filter(c => c && countriesRef.current.some(country => country.code === c));
      }
      
      if (codes.length > 0) {
        initialSelections[row._id] = codes;
      }
    });
    setSelectedRegions(prev => ({ ...prev, ...initialSelections }));
  }, [sheetPayload, countries]);

  const toggleRegion = (rowId, countryCode) => {
    setSelectedRegions(prev => {
      const current = prev[rowId] || [];
      const isSelected = current.includes(countryCode);
      const updated = isSelected
        ? current.filter(c => c !== countryCode)
        : [...current, countryCode];
      return { ...prev, [rowId]: updated };
    });
  };

  const commitRegionValue = (rowId) => {
    const selected = selectedRegions[rowId] || [];
    if (selected.length === 0) {
      queueRowUpdate(rowId, 'region', null);
      // Also clear regions array in Map
      queueRowUpdate(rowId, 'regions', null);
    } else {
      // Store as comma-separated string for backward compatibility
      const regionString = selected.join(', ');
      queueRowUpdate(rowId, 'region', regionString);
      // Also store as array in Map
      queueRowUpdate(rowId, 'regions', selected);
    }
    persistRow(rowId);
    setOpenRegionDropdown(null);
    setRegionSearchQuery(prev => {
      const updated = { ...prev };
      delete updated[rowId];
      return updated;
    });
  };

  const openRegionSelector = (rowId, e) => {
    e.stopPropagation();
    setOpenRegionDropdown(rowId);
    // Initialize search query if not exists
    if (!regionSearchQuery[rowId]) {
      setRegionSearchQuery(prev => ({ ...prev, [rowId]: '' }));
    }
  };

const formatCurrencyValue = (value, precision = 2) => {
  if (!Number.isFinite(value)) return '';
  return Number(value).toFixed(precision);
};

const handleCurrencyChange = (rowId, columnKey, rawValue) => {
  queueRowUpdate(rowId, columnKey, rawValue);
};

const commitCurrencyValue = (rowId, columnKey) => {
  const pendingValue = pendingRowUpdatesRef.current[rowId]?.[columnKey];
  if (pendingValue == null || pendingValue === '') {
    queueRowUpdate(rowId, columnKey, null);
    persistRow(rowId);
    return;
  }
  const numericValue = Number(pendingValue);
  if (Number.isNaN(numericValue)) {
    queueRowUpdate(rowId, columnKey, null);
  } else {
    queueRowUpdate(rowId, columnKey, Number(numericValue.toFixed(2)));
  }
  persistRow(rowId);
};

const handleSpiritsSizeChange = (rowId, rawValue) => {
  queueRowUpdate(rowId, 'sizeOz', rawValue);
};

const commitSpiritsSizeValue = (rowId) => {
  const pendingValue = pendingRowUpdatesRef.current[rowId]?.sizeOz;
  if (pendingValue == null || pendingValue === '') {
    queueRowUpdate(rowId, 'sizeOz', null);
    persistRow(rowId);
    return;
  }
  const numericValue = Number(pendingValue);
  if (!Number.isInteger(numericValue) || numericValue < 0) {
    queueRowUpdate(rowId, 'sizeOz', null);
  } else {
    queueRowUpdate(rowId, 'sizeOz', numericValue);
  }
  persistRow(rowId);
};

const handleWineSizeChange = (rowId, rawValue) => {
  queueRowUpdate(rowId, 'sizeMl', rawValue);
};

const commitWineSizeValue = (rowId) => {
  const pendingValue = pendingRowUpdatesRef.current[rowId]?.sizeMl;
  if (pendingValue == null || pendingValue === '') {
    queueRowUpdate(rowId, 'sizeMl', null);
    persistRow(rowId);
    return;
  }
  const numericValue = Number(pendingValue);
  if (!Number.isFinite(numericValue) || numericValue < 0) {
    queueRowUpdate(rowId, 'sizeMl', null);
  } else {
    queueRowUpdate(rowId, 'sizeMl', Math.round(numericValue));
  }
  persistRow(rowId);
};

const handleDryStockSizeChange = (rowId, rawValue) => {
  queueRowUpdate(rowId, 'sizeG', rawValue);
};

const commitDryStockSizeValue = (rowId) => {
  const pendingValue = pendingRowUpdatesRef.current[rowId]?.sizeG;
  if (pendingValue == null || pendingValue === '') {
    queueRowUpdate(rowId, 'sizeG', null);
    persistRow(rowId);
    return;
  }
  const numericValue = Number(pendingValue);
  if (!Number.isFinite(numericValue) || numericValue < 0) {
    queueRowUpdate(rowId, 'sizeG', null);
  } else {
    queueRowUpdate(rowId, 'sizeG', Number(numericValue.toFixed(2)));
  }
  persistRow(rowId);
};

const handleBeerNumUnitsChange = (rowId, rawValue) => {
  // Only allow whole numbers (no decimals, no letters)
  // Remove any non-digit characters
  const cleanedValue = rawValue.replace(/[^\d]/g, '');
  queueRowUpdate(rowId, 'numUnits', cleanedValue);
};

const commitBeerNumUnitsValue = (rowId) => {
  const pendingValue = pendingRowUpdatesRef.current[rowId]?.numUnits;
  if (pendingValue == null || pendingValue === '') {
    queueRowUpdate(rowId, 'numUnits', null);
    persistRow(rowId);
    return;
  }
  const numericValue = Number(pendingValue);
  if (!Number.isInteger(numericValue) || numericValue < 0) {
    queueRowUpdate(rowId, 'numUnits', null);
  } else {
    queueRowUpdate(rowId, 'numUnits', numericValue);
  }
  persistRow(rowId);
};

  const handleBeerNumUnitsIncrement = (rowId, delta) => {
    const pendingValue = pendingRowUpdatesRef.current[rowId]?.numUnits;
    const row = sheetPayload?.rows?.find(r => r._id === rowId);
    const currentValue = pendingValue ?? 
      (row?.values instanceof Map ? row.values.get('numUnits') : row?.values?.numUnits) ?? 0;
    const newValue = Math.max(0, (Number(currentValue) || 0) + delta);
    queueRowUpdate(rowId, 'numUnits', newValue);
    persistRow(rowId);
  };

  const handleItemNumberChange = (rowId, rawValue) => {
    // Only allow whole numbers (no decimals, no letters)
    // Remove any non-digit characters
    const cleanedValue = rawValue.replace(/[^\d]/g, '');
    queueRowUpdate(rowId, 'itemNumber', cleanedValue);
  };

  const commitItemNumberValue = (rowId) => {
    const pendingValue = pendingRowUpdatesRef.current[rowId]?.itemNumber;
    if (pendingValue == null || pendingValue === '') {
      queueRowUpdate(rowId, 'itemNumber', null);
      persistRow(rowId);
      return;
    }
    const numericValue = Number(pendingValue);
    if (!Number.isInteger(numericValue) || numericValue < 0) {
      queueRowUpdate(rowId, 'itemNumber', null);
    } else {
      queueRowUpdate(rowId, 'itemNumber', numericValue);
    }
    persistRow(rowId);
  };

  const persistRow = useCallback(async (rowId) => {
    const payload = pendingRowUpdatesRef.current[rowId];
    if (!payload || !resolvedSheetKey || savingRowsRef.current[rowId]) return;
    savingRowsRef.current = { ...savingRowsRef.current, [rowId]: true };
    setSavingRows((prev) => ({ ...prev, [rowId]: true }));
    setError('');
    try {
      const response = await apiCall(`/inventory/${resolvedSheetKey}`, {
        method: 'PATCH',
        body: JSON.stringify({
          rows: [{ _id: rowId, values: payload }],
          updatedBy: user?.email || 'admin'
        })
      });
      refreshSheetData(response);
      setPendingRowUpdates((prev) => {
        if (!prev[rowId]) return prev;
        const clone = { ...prev };
        delete clone[rowId];
        return clone;
      });
      delete pendingRowUpdatesRef.current[rowId];
    } catch (err) {
      setError(err.message || 'Failed to save changes.');
    } finally {
      savingRowsRef.current = { ...savingRowsRef.current };
      delete savingRowsRef.current[rowId];
      setSavingRows((prev) => {
        const clone = { ...prev };
        delete clone[rowId];
        return clone;
      });
    }
  }, [apiCall, resolvedSheetKey, user?.email]);

  const refreshSheetData = (response) => {
    const sheet = response?.sheet;
    const datasets = response?.datasets;
    if (sheet) {
      setSheetPayload(sheet);
    }
    if (Array.isArray(datasets)) {
      setDatasets(datasets);
    }
  };

  const menuNavSheetKeys = useMemo(() => {
    return ['cocktails', 'mocktails', 'wine', 'beer', 'spirits'];
  }, []);

  const persistMenuNavSettingForSheet = useCallback(
    async (targetSheetKey, nextEnabled) => {
      if (!targetSheetKey) return;

      const prevEnabled = sheetList.find((s) => s.sheetKey === targetSheetKey)?.menuNavEnabled;
      setSheetList((prev) =>
        prev.map((s) =>
          s.sheetKey === targetSheetKey
            ? { ...s, menuNavEnabled: Boolean(nextEnabled) }
            : s
        )
      );

      if (resolvedSheetKey === targetSheetKey) {
        setSheetPayload((prev) =>
          prev
            ? {
                ...prev,
                settings: {
                  ...(prev.settings || {}),
                  menuNavEnabled: Boolean(nextEnabled)
                }
              }
            : prev
        );
      }

      setError('');
      try {
        const response = await apiCall(`/inventory/${targetSheetKey}/settings`, {
          method: 'PATCH',
          body: JSON.stringify({
            settings: {
              menuNavEnabled: Boolean(nextEnabled)
            },
            updatedBy: user?.email || 'admin'
          })
        });

        const updated = response?.sheet;
        if (updated?.sheetKey) {
          setSheetList((prev) =>
            prev.map((s) =>
              s.sheetKey === updated.sheetKey
                ? { ...s, menuNavEnabled: updated?.settings?.menuNavEnabled !== false }
                : s
            )
          );
        }
        if (resolvedSheetKey === targetSheetKey) {
          refreshSheetData(response);
        }
      } catch (err) {
        setSheetList((prev) =>
          prev.map((s) =>
            s.sheetKey === targetSheetKey
              ? { ...s, menuNavEnabled: prevEnabled !== false }
              : s
          )
        );
        setError(err.message || 'Failed to save settings.');
      }
    },
    [apiCall, resolvedSheetKey, sheetList, user?.email]
  );

  const handleAddRow = async () => {
    if (!resolvedSheetKey) {
      console.error('Cannot add row: resolvedSheetKey is null/undefined');
      setError('Cannot add row: sheet not loaded.');
      return;
    }
    if (rowActionLoading.type) {
      return;
    }
    setRowActionLoading({ type: 'add', rowId: null });
    setError('');
    try {
      const payload = {
        values: {},
        updatedBy: user?.email || 'admin'
      };
      const response = await apiCall(`/inventory/${resolvedSheetKey}/rows`, {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      refreshSheetData(response);
      setPendingRowUpdates({});
      pendingRowUpdatesRef.current = {};
    } catch (err) {
      console.error('Error adding row:', err);
      setError(err.message || 'Failed to add row.');
    } finally {
      setRowActionLoading({ type: null, rowId: null });
    }
  };

  const handleDatasetChange = (rowId, column, value) => {
    queueRowUpdate(rowId, column.key, value);
    persistRow(rowId);
  };

  const activeDataset = useMemo(() => {
    if (!datasetEditor) return null;
    return datasets.find((ds) => ds._id === datasetEditor.datasetId) || null;
  }, [datasetEditor, datasets]);

  const closeDatasetEditor = () => {
    setDatasetEditor(null);
    setDatasetEditorValue('');
  };

  const handleAddDatasetValue = async () => {
    if (!datasetEditor) return;
    const dataset = datasets.find((ds) => ds._id === datasetEditor.datasetId);
    if (!dataset) return;
    const rawValue = datasetEditorValue.trim();
    if (!rawValue) return;
    const value = toTitleCase(rawValue);
    if (dataset.values?.some((entry) => entry.value.toLowerCase() === value.toLowerCase())) {
      setError('That option already exists.');
      return;
    }
    setDatasetSaving(true);
    setError('');
    try {
      const updatedValues = [...(dataset.values || []), { value, label: value }];
      const response = await apiCall(`/inventory/datasets/${dataset._id}`, {
        method: 'PUT',
        body: JSON.stringify({
          values: updatedValues
        })
      });
      if (response?.dataset) {
        setDatasets((prev) =>
          prev.map((ds) => (ds._id === response.dataset._id ? response.dataset : ds))
        );
        setDatasetEditorValue('');
      }
    } catch (err) {
      setError(err.message || 'Failed to update dropdown values.');
    } finally {
      setDatasetSaving(false);
    }
  };

  const handleRemoveDatasetValue = async (valueToRemove) => {
    if (!datasetEditor) return;
    const dataset = datasets.find((ds) => ds._id === datasetEditor.datasetId);
    if (!dataset) return;
    setDatasetSaving(true);
    setError('');
    try {
      const updatedValues = (dataset.values || []).filter(
        (entry) => entry.value !== valueToRemove
      );
      const response = await apiCall(`/inventory/datasets/${dataset._id}`, {
        method: 'PUT',
        body: JSON.stringify({
          values: updatedValues
        })
      });
      if (response?.dataset) {
        setDatasets((prev) =>
          prev.map((ds) => (ds._id === response.dataset._id ? response.dataset : ds))
        );
      }
    } catch (err) {
      setError(err.message || 'Failed to remove option.');
    } finally {
      setDatasetSaving(false);
    }
  };

  const handleMoveDatasetValue = async (fromIndex, toIndex) => {
    if (!datasetEditor) return;
    const dataset = datasets.find((ds) => ds._id === datasetEditor.datasetId);
    if (!dataset) return;
    const values = [...(dataset.values || [])];
    if (toIndex < 0 || toIndex >= values.length) return;
    const [moved] = values.splice(fromIndex, 1);
    values.splice(toIndex, 0, moved);
    setDatasetSaving(true);
    setError('');
    try {
      const response = await apiCall(`/inventory/datasets/${dataset._id}`, {
        method: 'PUT',
        body: JSON.stringify({ values })
      });
      if (response?.dataset) {
        setDatasets((prev) =>
          prev.map((ds) => (ds._id === response.dataset._id ? response.dataset : ds))
        );
      }
    } catch (err) {
      setError(err.message || 'Failed to reorder options.');
    } finally {
      setDatasetSaving(false);
    }
  };

  const handleSortDatasetValues = async (dataset, direction = 'asc') => {
    if (!dataset) return;
    setDatasetSaving(true);
    setError('');
    try {
      const sorted = [...(dataset.values || [])].sort((a, b) => {
        const aLabel = (a.label || a.value || '').toLowerCase();
        const bLabel = (b.label || b.value || '').toLowerCase();
        if (aLabel < bLabel) return direction === 'asc' ? -1 : 1;
        if (aLabel > bLabel) return direction === 'asc' ? 1 : -1;
        return 0;
      });
      const response = await apiCall(`/inventory/datasets/${dataset._id}`, {
        method: 'PUT',
        body: JSON.stringify({
          values: sorted
        })
      });
      if (response?.dataset) {
        setDatasets((prev) =>
          prev.map((ds) => (ds._id === response.dataset._id ? response.dataset : ds))
        );
      }
    } catch (err) {
      setError(err.message || 'Failed to sort options.');
    } finally {
      setDatasetSaving(false);
    }
  };

  const handleDeleteRow = async (rowId) => {
    if (!resolvedSheetKey || !rowId || rowActionLoading.type === 'delete') return;
    setRowActionLoading({ type: 'delete', rowId });
    setError('');
    try {
      const response = await apiCall(`/inventory/${resolvedSheetKey}/rows/${rowId}`, {
        method: 'DELETE'
      });
      refreshSheetData(response);
      setPendingRowUpdates((prev) => {
        const clone = { ...prev };
        delete clone[rowId];
        return clone;
      });
    } catch (err) {
      setError(err.message || 'Failed to delete row.');
    } finally {
      setRowActionLoading({ type: null, rowId: null });
      setPendingDeleteRowId(null);
      setShowDeleteModal(false);
    }
  };

  useEffect(() => {
    const distributors = datasets.find((ds) => ds._id === 'shared.distributor');
    if (distributors?.values?.length) {
      setDistributorOptions(distributors.values);
      distributorListRef.current = distributors.values;
    }
  }, [datasets]);

  return (
    <>
      {countries.length > 0 && (
        <datalist id="country-suggestions">
          {countries.map((country) => (
            <option key={country.code} value={`${country.name} (${country.code})`} />
          ))}
        </datalist>
      )}
      {showDeleteModal && pendingDeleteRowId && (
        <div className="delete-modal">
          <div className="delete-modal-content">
            <p className="delete-warning">This action can’t be undone…</p>
            <p className="delete-question">Are you sure?</p>
            <div className="delete-modal-actions">
              <button
                type="button"
                onClick={() => handleDeleteRow(pendingDeleteRowId)}
                className="primary"
              >
                Confirm
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowDeleteModal(false);
                  setPendingDeleteRowId(null);
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
      <div className="inventory-manager bg-white min-h-screen w-full p-8">
      <div className="max-w-6xl mx-auto">
        <header className="mb-6 flex flex-col gap-4" style={{ position: 'relative', zIndex: 1001, pointerEvents: 'auto' }}>
          <div className="flex items-center justify-between flex-wrap gap-4">
            <h1 className="text-3xl tracking-wide uppercase" style={{ fontWeight: 4 }}>
              {resolvedSheetKey === 'mocktails' ? 'MOCKTAILS' : (activeSheetMeta?.name || 'Inventory').toUpperCase()}
            </h1>
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '18px', alignItems: 'center' }}>
            {menuNavSheetKeys.map((key) => {
              const meta = sheetList.find((s) => s.sheetKey === key);
              if (!meta) return null;
              const isActive = resolvedSheetKey === key;
              const enabled = meta.menuNavEnabled !== false;
              const title = (meta.name || key).toUpperCase();
              return (
                <div key={key} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <button
                    type="button"
                    onClick={() => navigate(`/admin/inventory/${key}`)}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      padding: 0,
                      cursor: 'pointer',
                      fontFamily: 'Montserrat, sans-serif',
                      letterSpacing: '0.06em',
                      fontSize: '0.85rem',
                      color: isActive ? '#111827' : '#6b7280',
                      textTransform: 'uppercase'
                    }}
                  >
                    {title}
                  </button>

                  <label
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      cursor: 'pointer',
                      userSelect: 'none',
                      fontFamily: 'Montserrat, sans-serif',
                      color: enabled ? '#111' : '#555'
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={enabled}
                      onChange={(e) => persistMenuNavSettingForSheet(key, e.target.checked)}
                      style={{ accentColor: '#d0d0d0' }}
                    />
                    <span style={{ fontSize: '0.7rem', color: '#6b7280', letterSpacing: '0.04em' }}>
                      MENU NAV
                    </span>
                  </label>
                </div>
              );
            })}
          </div>
        </header>

        {error && (
          <div className="bg-red-100 text-red-700 px-4 py-3 rounded mb-4">
            {error}
          </div>
        )}

        <div className="bg-white border border-gray-200 rounded-lg overflow-visible shadow-sm">
          <div className="p-6">
            {sheetLoading || !sheetPayload ? (
              <div className="text-center text-gray-400 py-12">
                {sheetLoading ? '' : 'Select a sheet to view details.'}
              </div>
            ) : (
              <>
                <div className="flex items-center gap-4 mb-4">
                  {/* Search bar */}
                  <div className="flex-1 max-w-md relative">
                    <input
                      type="text"
                      placeholder="Search items..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full rounded-lg focus:outline-none inventory-search-input"
                      style={{
                        fontFamily: 'Montserrat, sans-serif',
                        fontSize: '0.75rem',
                        borderRadius: '0.5rem',
                        border: '1px solid #e5e7eb',
                        background: '#f9fafb',
                        color: '#4b5563',
                        padding: '0.2rem 0.75rem',
                        paddingRight: '1.75rem',
                        height: 'auto',
                        boxShadow: 'none'
                      }}
                      onFocus={(e) => {
                        e.target.style.border = '1px solid #9ca3af';
                        e.target.style.boxShadow = 'none';
                        e.target.style.outline = 'none';
                      }}
                      onBlur={(e) => {
                        e.target.style.border = '1px solid #e5e7eb';
                      }}
                    />
                    {searchQuery && (
                      <button
                        type="button"
                        onClick={() => {
                          setSearchQuery('');
                          // Clear search from URL
                          const url = new URL(window.location);
                          url.searchParams.delete('search');
                          navigate(url.pathname + url.search, { replace: true });
                        }}
                        style={{
                          position: 'absolute',
                          right: '0.5rem',
                          top: 'calc(50% + 1px)',
                          transform: 'translateY(-50%)',
                          background: 'transparent',
                          border: 'none',
                          cursor: 'pointer',
                          padding: '0',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: '#6b7280',
                          fontSize: '1.25rem',
                          lineHeight: '1',
                          width: '1rem',
                          height: '1rem',
                          zIndex: 10
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.color = '#111827';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.color = '#6b7280';
                        }}
                        aria-label="Clear search"
                      >
                        ×
                      </button>
                    )}
                  </div>
                  
                  {/* Sort options */}
                  {SORTABLE_COLUMNS[resolvedSheetKey]?.length ? (
                    <div className="sort-toolbar" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      {SORTABLE_COLUMNS[resolvedSheetKey].map((col) => {
                      const active = sortConfig[resolvedSheetKey]?.column === col.key;
                      const direction = sortConfig[resolvedSheetKey]?.direction || 'asc';
                      const nextDirection =
                        active && direction === 'asc'
                          ? 'desc'
                          : active && direction === 'desc'
                          ? null
                          : 'asc';
                      return (
                        <button
                          key={col.key}
                          className={`sort-btn ${active ? `active ${direction}` : ''}`}
                          onClick={() => {
                            setSortConfig((prev) => {
                              const current = prev[resolvedSheetKey];
                              if (active && direction === 'desc') {
                                const clone = { ...prev };
                                delete clone[resolvedSheetKey];
                                return clone;
                              }
                              return {
                                ...prev,
                                [resolvedSheetKey]: { column: col.key, direction: nextDirection || 'asc' }
                              };
                            });
                          }}
                        >
                          {col.label}
                        </button>
                      );
                    })}
                      <button
                        type="button"
                        onClick={() => setShowHiddenColumns((v) => !v)}
                        className="sort-btn"
                        title={showHiddenColumns ? 'Hide hidden columns' : 'Show hidden columns'}
                      >
                        •••
                      </button>
                    </div>
                  ) : null}
                </div>
                <div className="overflow-auto border border-gray-100 rounded">
                  <table
                    className="inventory-table min-w-full text-sm relative"
                    style={{ tableLayout: 'fixed' }}
                  >
                    <thead>
                      <tr className="bg-gray-50 text-left">
                        <th
                          className="py-2 text-xs tracking-wide text-gray-400"
                          style={{
                            width: currentActionColumnWidth,
                            minWidth: currentActionColumnWidth
                          }}
                        >
                          &nbsp;
                        </th>
                        {activeColumns.map((column) => {
                          const lowerLabel = column.label?.toLowerCase() || '';
                          const isUnitHeader =
                            lowerLabel.includes('$ / unit') || lowerLabel.includes('$ / oz');
                          let columnWidth =
                            currentColumnWidths[column.key] ?? DEFAULT_COLUMN_WIDTH;
                          if (isUnitHeader) {
                            columnWidth = UNIT_COLUMN_WIDTH;
                          }
                          // Hide dropdown editor for TYPE and ICE columns in cocktails/mocktails (they're synced from recipes, not editable)
                          const showEditorButton =
                            column.datasetId && 
                            dropdownColumnKeys.includes(column.key) &&
                            !((resolvedSheetKey === 'cocktails' || resolvedSheetKey === 'mocktails') && (column.key === 'style' || column.key === 'ice'));
                          const isEditingDataset = datasetEditor && datasetEditor.datasetId === column.datasetId;
                          return (
                            <th
                              key={column.key}
                              className="inventory-header-cell py-2 font-semibold text-xs tracking-wide text-gray-600 whitespace-nowrap"
                              style={{ width: columnWidth, minWidth: columnWidth, maxWidth: columnWidth }}
                            >
                              <div className="flex items-center justify-between gap-2">
                                <span>{column.label}</span>
                                {showEditorButton && (
                                  <button
                                    type="button"
                                    className="inventory-select fake-select-button text-xs px-3 py-1 inventory-ice-edit-btn"
                                    onClick={(e) => {
                                      e.preventDefault();
                                      setDatasetEditor({ datasetId: column.datasetId });
                                    }}
                                    title="Edit Ice options"
                                  />
                                )}
                              </div>
                              {showEditorButton && isEditingDataset && (
                                <div className="inventory-editor-popover">
                                  <div className="flex items-center justify-between mb-2">
                                    <span className="text-xs font-semibold text-gray-700">
                                      {activeDataset?.label || 'Options'}
                                    </span>
                                    <div className='editor-actions'>
                                      <button
                                        type='button'
                                        className='inventory-sort-button'
                                        onClick={() => handleSortDatasetValues(activeDataset, 'asc')}
                                        disabled={datasetSaving}
                                      >
                                        A→Z
                                      </button>
                                      <button
                                        type="button"
                                        className="inventory-editor-close"
                                        onClick={closeDatasetEditor}
                                        aria-label="Close"
                                      >
                                        ×
                                      </button>
                                    </div>
                                  </div>
                                  <div className="inventory-editor-options">
                                    {activeDataset?.values?.length ? (
                                      activeDataset.values.map((entry, idx) => {
                                        const moveUp = () => handleMoveDatasetValue(idx, idx - 1);
                                        const moveDown = () => handleMoveDatasetValue(idx, idx + 1);
                                        return (
                                          <div key={entry.value} className="inventory-editor-option">
                                            <div className="inventory-editor-move">
                                              <button
                                                type="button"
                                                onClick={moveUp}
                                                disabled={datasetSaving || idx === 0}
                                                title="Move up"
                                              >
                                                ▲
                                              </button>
                                              <button
                                                type="button"
                                                onClick={moveDown}
                                                disabled={datasetSaving || idx === (activeDataset.values?.length || 0) - 1}
                                                title="Move down"
                                              >
                                                ▼
                                              </button>
                                            </div>
                                            <span>{entry.label}</span>
                                            <button
                                              type="button"
                                              onClick={() => handleRemoveDatasetValue(entry.value)}
                                              disabled={datasetSaving}
                                              title="Remove option"
                                            >
                                              −
                                            </button>
                                          </div>
                                        );
                                      })
                                    ) : (
                                      <div className="inventory-editor-empty">No options yet.</div>
                                    )}
                                  </div>
                                  <div className="inventory-editor-input">
                                    <input
                                      type="text"
                                      value={datasetEditorValue}
                                      onChange={(e) => setDatasetEditorValue(e.target.value)}
                                      placeholder="Add option"
                                      disabled={datasetSaving}
                                    />
                                    <button
                                      type="button"
                                      onClick={handleAddDatasetValue}
                                      disabled={datasetSaving || !datasetEditorValue.trim()}
                                    >
                                      +
                                    </button>
                                  </div>
                                </div>
                              )}
                            </th>
                          );
                        })}
                      </tr>
                    </thead>
                    <tbody>
                      {activeRows.map((row) => {
                        const isRecipeRow = Boolean(row.values?.recipeId);
                        return (
                          <tr
                            key={row._id}
                            className="border-t border-gray-100 bg-gray-100 hover:bg-gray-100"
                          >
                            <td
                              className="py-2 text-center align-middle"
                              style={{
                                width: currentActionColumnWidth,
                                minWidth: currentActionColumnWidth
                              }}
                            >
                              <button
                                className="w-10 h-10 rounded-full bg-red-50 text-red-600 border border-red-100 text-xl leading-none disabled:opacity-50"
                                onClick={() => {
                                  setPendingDeleteRowId(row._id);
                                  setShowDeleteModal(true);
                                }}
                                disabled={
                                  (rowActionLoading.type === 'delete' && rowActionLoading.rowId === row._id)
                                }
                                title="Delete row"
                              >
                                −
                              </button>
                            </td>
                            {activeColumns.map((column) => {
                              const isMenuColumn = column.key === 'menu';
                              
                              // Handle menu column for all rows
                              if (isMenuColumn) {
                                const valuesMap = row.values instanceof Map 
                                  ? row.values 
                                  : new Map(Object.entries(row.values || {}));
                                const rowName = valuesMap.get('name');
                                
                                // Map sheetKey to MenuManager category
                                const categoryMap = {
                                  'cocktails': 'cocktails',
                                  'mocktails': 'mocktails',
                                  'wine': 'wine',
                                  'beer': 'beer',
                                  'spirits': 'spirits',
                                  'preMix': 'premix'
                                };
                                const category = categoryMap[resolvedSheetKey];
                                const columnWidth = currentColumnWidths[column.key] ?? DEFAULT_COLUMN_WIDTH;
                                
                                return (
                                  <td
                                    key={column.key}
                                    className="inventory-data-cell py-2 text-gray-700 whitespace-nowrap"
                                    style={{
                                      width: columnWidth,
                                      minWidth: columnWidth,
                                      maxWidth: columnWidth
                                    }}
                                  >
                                    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', width: '100%', height: '100%' }}>
                                      <button
                                        type="button"
                                        onClick={() => {
                                          const valuesMap = row.values instanceof Map 
                                            ? row.values 
                                            : new Map(Object.entries(row.values || {}));
                                          const itemNumber = valuesMap.get('itemNumber');
                                          
                                          if (category && itemNumber && Number.isFinite(Number(itemNumber))) {
                                            // Use itemNumber for reliable linking
                                            navigate(`/admin/menu?category=${category}&itemNumber=${itemNumber}`);
                                          } else if (category) {
                                            // Fallback to name if itemNumber not available
                                            const rowName = valuesMap.get('name');
                                            if (rowName) {
                                              navigate(`/admin/menu?category=${category}&itemId=${encodeURIComponent(rowName)}`);
                                            }
                                          }
                                        }}
                                        className="text-gray-600 hover:text-gray-900 text-lg font-semibold"
                                        style={{
                                          background: 'transparent',
                                          border: 'none',
                                          cursor: 'pointer',
                                          padding: 0,
                                          fontSize: '1.25rem',
                                          lineHeight: '1',
                                          display: 'flex',
                                          alignItems: 'center',
                                          justifyContent: 'center'
                                        }}
                                        title="View in Menu Manager"
                                      >
                                        ☰
                                      </button>
                                    </div>
                                  </td>
                                );
                              }
                              
                              // All rows are now editable (removed recipe row read-only restriction)
                              const lowerKey = column.key?.toLowerCase() || '';
                              const lowerLabel = column.label?.toLowerCase() || '';
                              const isNameColumn = lowerKey.includes('name') || lowerLabel.includes('name');
                              const isGarnishColumn = lowerKey.includes('garnish') || lowerLabel.includes('garnish');
                              const isIngredientsColumn = lowerKey.includes('ingredients') || lowerLabel.includes('ingredients');
                              const isConceptColumn = lowerKey.includes('concept') || lowerLabel.includes('concept');
                              const isNotesColumn = lowerKey.includes('notes') || lowerLabel.includes('notes');
                              const isCurrencyUnitColumn =
                                lowerLabel.includes('$ / unit') ||
                                lowerLabel.includes('$ / oz') ||
                                lowerLabel.includes('$ / glass') ||
                                lowerLabel.includes('$ / pack') ||
                                lowerLabel.includes('$ / oz') ||
                                lowerKey === 'unitcost' ||
                                lowerKey === 'ouncecost' ||
                                lowerKey === 'glasscost' ||
                                lowerKey === 'gramcost' ||
                                lowerKey === 'packcost';
                              const isSpiritsSizeColumn =
                                resolvedSheetKey === 'spirits' && column.key === 'sizeOz';
                              const isWineSizeColumn =
                                resolvedSheetKey === 'wine' && column.key === 'sizeMl';
                              const isRegionColumn = column.key === 'region';
                              const isPageColumn = column.key === 'page';
                              const isDryStockSizeColumn =
                                resolvedSheetKey === 'dryStock' && column.key === 'sizeG';
                              const isDryStockUnitColumn =
                                resolvedSheetKey === 'dryStock' && column.key === 'sizeUnit';
                              const isBeerNumUnitsColumn =
                                resolvedSheetKey === 'beer' && column.key === 'numUnits';
                              const isItemNumberColumn = column.key === 'itemNumber';
                              const isFormulaCurrencyColumn =
                                isCurrencyUnitColumn && column.type === 'formula';
                              const isEditableCurrencyColumn =
                                isCurrencyUnitColumn && column.type !== 'formula';
                              const isFreeTextColumn =
                                isNameColumn || isGarnishColumn || isIngredientsColumn || isConceptColumn || isNotesColumn;
                              const isDropdownColumn =
                                column.datasetId && dropdownColumnKeys.includes(column.key);
                              const dataset = isDropdownColumn
                                ? column.datasetId === 'shared.distributor'
                                  ? { _id: 'shared.distributor', values: distributorListRef.current }
                                  : datasets.find((ds) => ds._id === column.datasetId)
                                : null;
                              
                              let columnWidth =
                                currentColumnWidths[column.key] ?? DEFAULT_COLUMN_WIDTH;
                              if (isCurrencyUnitColumn) {
                                columnWidth = UNIT_COLUMN_WIDTH;
                              }
                              const hasOriginalValue =
                                row.values && Object.prototype.hasOwnProperty.call(row.values, column.key);
                              let cellValue = hasOriginalValue ? row.values[column.key] : null;
                              
                              // Don't apply title case when displaying - let user type freely, apply on blur
                              const formatCurrencyDisplay = (value) => {
                                if (value === null || value === undefined) return '';
                                const precision = column.precision ?? 2;
                                const numberValue = Number(value);
                                if (!Number.isFinite(numberValue)) return value;
                                return numberValue.toFixed(precision);
                              };
                              const hasCurrencyValue =
                                hasOriginalValue && cellValue !== null && cellValue !== undefined;
                              let currencyInputValue =
                                pendingRowUpdates[row._id]?.[column.key] ??
                                (hasCurrencyValue ? formatCurrencyDisplay(cellValue) : '');
                              return (
                                <td
                                  key={column.key}
                                  className="inventory-data-cell py-2 text-gray-700 whitespace-nowrap"
                                  style={{
                                    width: columnWidth,
                                    minWidth: columnWidth,
                                    maxWidth: columnWidth
                                  }}
                                >
                                  {isPageColumn ? (
                                    <select
                                      value={pendingRowUpdates[row._id]?.[column.key] ?? cellValue ?? ''}
                                      onChange={(e) => {
                                        const nextValue = e.target.value;
                                        handleNameChange(row._id, column.key, nextValue, resolvedSheetKey);
                                        persistRow(row._id);
                                      }}
                                      className="inventory-name-input w-full text-sm px-1 py-1"
                                    >
                                      <option value="">--</option>
                                      <option value="cocktails">COCKTAILS</option>
                                      <option value="mocktails">MOCKTAILS</option>
                                      <option value="beer">BEER</option>
                                      <option value="wine">WINE</option>
                                      <option value="spirits">SPIRITS</option>
                                      <option value="premix">PRE-MIX</option>
                                    </select>
                                  ) : isFreeTextColumn ? (
                                    <input
                                      type="text"
                                      value={pendingRowUpdates[row._id]?.[column.key] ?? cellValue ?? ''}
                                      onChange={(e) => handleNameChange(row._id, column.key, e.target.value, resolvedSheetKey)}
                                      onBlur={(e) => {
                                        handleNameBlur(row._id, column.key, e.target.value, resolvedSheetKey);
                                        persistRow(row._id);
                                      }}
                                      className="inventory-name-input w-full text-sm px-1 py-1"
                                    />
                                  ) : isFormulaCurrencyColumn ? (
                                    hasCurrencyValue ? (
                                      <div className="inventory-currency-input text-sm currency-readonly">
                                        <span className="currency-prefix">$</span>
                                        <input
                                          type="text"
                                          value={formatCurrencyDisplay(cellValue)}
                                          disabled
                                          tabIndex={-1}
                                          className="currency-input-field"
                                        />
                                      </div>
                                    ) : (
                                      <div className="inventory-currency-input text-sm currency-readonly currency-empty">
                                        <span className="currency-prefix">$</span>
                                        <input
                                          type="text"
                                          value=""
                                          disabled
                                          tabIndex={-1}
                                          className="currency-input-field"
                                        />
                                      </div>
                                    )
                                  ) : isEditableCurrencyColumn ? (
                                    <div className="inventory-currency-input text-sm">
                                      <span className="currency-prefix">$</span>
                                      <input
                                        type="text"
                                        inputMode="decimal"
                                        value={currencyInputValue}
                                        onChange={(e) =>
                                          handleCurrencyChange(row._id, column.key, e.target.value)
                                        }
                                        onBlur={() => commitCurrencyValue(row._id, column.key)}
                                        className="currency-input-field"
                                      />
                                    </div>
                                  ) : isRegionColumn ? (
                                    <div className="inventory-size-input text-sm">
                                      {(() => {
                                        // Get region value from row (could be string or array)
                                        const valuesMap = row.values instanceof Map 
                                          ? row.values 
                                          : new Map(Object.entries(row.values || {}));
                                        let regionValue = valuesMap.get('region') || valuesMap.get('regions');
                                        
                                        // Format as comma-separated country codes
                                        let regionDisplay = '';
                                        if (regionValue) {
                                          if (Array.isArray(regionValue)) {
                                            regionDisplay = regionValue.map(r => String(r).trim().toUpperCase()).filter(Boolean).join(', ');
                                          } else {
                                            // Handle comma-separated string
                                            regionDisplay = String(regionValue)
                                              .split(',')
                                              .map(r => r.trim().toUpperCase())
                                              .filter(Boolean)
                                              .join(', ');
                                          }
                                        }
                                        
                                        return (
                                          <input
                                            type="text"
                                            value={regionDisplay}
                                            readOnly
                                            className="size-input-field"
                                            style={{ textAlign: 'left', cursor: 'default' }}
                                          />
                                        );
                                      })()}
                                    </div>
                                  ) : isSpiritsSizeColumn ? (
                                    <div className="inventory-size-input text-sm">
                                      <input
                                        type="text"
                                        inputMode="numeric"
                                        value={
                                          pendingRowUpdates[row._id]?.sizeOz ??
                                          (cellValue === null || cellValue === undefined ? '' : cellValue)
                                        }
                                        onChange={(e) => handleSpiritsSizeChange(row._id, e.target.value)}
                                        onBlur={() => commitSpiritsSizeValue(row._id)}
                                        className="size-input-field"
                                      />
                                      <span className="size-suffix">ml</span>
                                    </div>
                                  ) : isWineSizeColumn ? (
                                    <div className="inventory-size-input text-sm">
                                      <input
                                        type="text"
                                        inputMode="numeric"
                                        value={
                                          pendingRowUpdates[row._id]?.sizeMl ??
                                          (cellValue === null || cellValue === undefined ? '' : cellValue)
                                        }
                                        onChange={(e) => handleWineSizeChange(row._id, e.target.value)}
                                        onBlur={() => commitWineSizeValue(row._id)}
                                        className="size-input-field"
                                      />
                                      <span className="size-suffix">ml</span>
                                    </div>
                                  ) : isDryStockSizeColumn ? (
                                    <div className="inventory-size-input text-sm">
                                      <input
                                        type="text"
                                        inputMode="decimal"
                                        value={
                                          pendingRowUpdates[row._id]?.sizeG ??
                                          (cellValue === null || cellValue === undefined ? '' : cellValue)
                                        }
                                        onChange={(e) => handleDryStockSizeChange(row._id, e.target.value)}
                                        onBlur={() => commitDryStockSizeValue(row._id)}
                                        className="size-input-field text-right"
                                      />
                                    </div>
                                  ) : isDryStockUnitColumn ? (
                                    <div className="inventory-unit-toggle flex items-center gap-2 text-sm">
                                      {['ml', 'g'].map((unit) => (
                                        <label
                                          key={unit}
                                          className={`unit-pill ${((row.values?.sizeUnit || 'g') === unit && 'active') || ''}`}
                                        >
                                          <input
                                            type="checkbox"
                                            checked={(row.values?.sizeUnit || 'g') === unit}
                                            onChange={() =>
                                              queueRowUpdate(row._id, 'sizeUnit', unit) || persistRow(row._id)
                                            }
                                          />
                                          <span>{unit}</span>
                                        </label>
                                      ))}
                                    </div>
                                  ) : isBeerNumUnitsColumn ? (
                                    <div className="inventory-size-input text-sm">
                                      <input
                                        type="text"
                                        inputMode="numeric"
                                        value={
                                          pendingRowUpdates[row._id]?.numUnits ??
                                          (cellValue === null || cellValue === undefined ? '' : cellValue)
                                        }
                                        onChange={(e) => handleBeerNumUnitsChange(row._id, e.target.value)}
                                        onBlur={() => commitBeerNumUnitsValue(row._id)}
                                        onKeyDown={(e) => {
                                          // Prevent decimal point, minus, plus, and letter keys
                                          if (e.key === '.' || e.key === '-' || e.key === '+' || e.key === 'e' || e.key === 'E') {
                                            e.preventDefault();
                                          }
                                        }}
                                        className="size-input-field"
                                        style={{ textAlign: 'right' }}
                                      />
                                    </div>
                                  ) : isItemNumberColumn ? (
                                    <div className="inventory-size-input text-sm">
                                      <input
                                        type="text"
                                        inputMode="numeric"
                                        value={
                                          pendingRowUpdates[row._id]?.itemNumber ??
                                          (cellValue === null || cellValue === undefined ? '' : cellValue)
                                        }
                                        readOnly
                                        className="size-input-field"
                                        style={{ textAlign: 'right', cursor: 'default' }}
                                      />
                                    </div>
                                  ) : isDropdownColumn ? (
                                    <div className="inventory-select-wrapper" style={{ position: 'relative', zIndex: 10 }}>
                                      <select
                                        value={(() => {
                                          if (!cellValue) return '';
                                          if (!dataset) return cellValue;
                                          // Find matching option value (case-insensitive)
                                          const matchingOption = dataset.values?.find(
                                            opt => String(opt.value).toLowerCase() === String(cellValue).toLowerCase()
                                          );
                                          return matchingOption ? matchingOption.value : cellValue;
                                        })()}
                                        onChange={(e) => {
                                          handleDatasetChange(row._id, column, e.target.value);
                                        }}
                                        onMouseDown={(e) => {
                                          e.stopPropagation();
                                        }}
                                        className="inventory-select w-full text-sm px-2 py-1"
                                        style={{ 
                                          position: 'relative', 
                                          zIndex: 11,
                                          pointerEvents: 'auto'
                                        }}
                                      >
                                        <option value="" hidden></option>
                                        {dataset?.values?.map((option) => (
                                          <option key={option.value} value={option.value}>
                                            {option.label}
                                          </option>
                                        ))}
                                      </select>
                                    </div>
                                  ) : isMenuColumn ? (
                                    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', width: '100%', height: '100%' }}>
                                      <button
                                        type="button"
                                        onClick={() => {
                                          const valuesMap = row.values instanceof Map 
                                            ? row.values 
                                            : new Map(Object.entries(row.values || {}));
                                          const itemNumber = valuesMap.get('itemNumber');
                                          
                                          // Map sheetKey to MenuManager category
                                          const categoryMap = {
                                            'cocktails': 'cocktails',
                                            'mocktails': 'mocktails',
                                            'wine': 'wine',
                                            'beer': 'beer',
                                            'spirits': 'spirits',
                                            'preMix': 'premix'
                                          };
                                          const category = categoryMap[resolvedSheetKey];
                                          
                                          if (category && itemNumber && Number.isFinite(Number(itemNumber))) {
                                            // Use itemNumber for reliable linking
                                            navigate(`/admin/menu?category=${category}&itemNumber=${itemNumber}`);
                                          } else if (category) {
                                            // Fallback to name if itemNumber not available
                                            const rowName = valuesMap.get('name');
                                            if (rowName) {
                                              navigate(`/admin/menu?category=${category}&itemId=${encodeURIComponent(rowName)}`);
                                            }
                                          }
                                        }}
                                        className="text-gray-600 hover:text-gray-900 text-lg font-semibold"
                                        style={{
                                          background: 'transparent',
                                          border: 'none',
                                          cursor: 'pointer',
                                          padding: 0,
                                          fontSize: '1.25rem',
                                          lineHeight: '1',
                                          display: 'flex',
                                          alignItems: 'center',
                                          justifyContent: 'center'
                                        }}
                                        title="View in Menu Manager"
                                      >
                                        ☰
                                      </button>
                                    </div>
                                  ) : (
                                    renderCellValue(row, column)
                                  )}
                                </td>
                              );
                            })}
                        </tr>
                        );
                      })}
                      <tr className="border-t border-gray-100">
                        <td
                          className="py-4 text-center"
                          style={{
                            width: currentActionColumnWidth,
                            minWidth: currentActionColumnWidth
                          }}
                        >
                          <button
                            className="w-10 h-10 rounded-full bg-gray-900 text-white text-xl leading-none disabled:opacity-50"
                            onClick={handleAddRow}
                            disabled={rowActionLoading.type === 'add'}
                            title="Add row"
                          >
                            {rowActionLoading.type === 'add' ? '…' : '+'}
                          </button>
                        </td>
                        {activeColumns.map((column) => {
                          const lowerLabel = column.label?.toLowerCase() || '';
                          let columnWidth =
                            currentColumnWidths[column.key] ?? DEFAULT_COLUMN_WIDTH;
                          if (columnWidth === DEFAULT_COLUMN_WIDTH && lowerLabel.includes('$ / unit')) {
                            columnWidth = 80;
                          }
                          return (
                            <td
                              key={`${column.key}-placeholder`}
                              style={{ width: columnWidth, minWidth: columnWidth }}
                            />
                          );
                        })}
                      </tr>
                    </tbody>
                  </table>
                </div>
                {showConverter && (
                  <div className="inventory-converter-card mt-4">
                    <div className="converter-header">
                      <div>
                        <p className="converter-title">Quick converter</p>
                        <p className="converter-subtitle">{CONVERTER_SUPPORT_TEXT}</p>
                      </div>
                      <div className="converter-select">
                        <label htmlFor="converter-select" className="converter-label">
                          Conversion
                        </label>
                        <select
                          id="converter-select"
                          value={converterOptionId}
                          onChange={(e) => setConverterOptionId(e.target.value)}
                        >
                          {CONVERTER_OPTIONS.map((option) => (
                            <option key={option.id} value={option.id}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <div className="converter-fields">
                      <div className="converter-field">
                        <label className="converter-label">{selectedConverter?.fromLabel}</label>
                        <div className="converter-input-wrapper">
                          <input
                            type="text"
                            inputMode="decimal"
                            value={converterInput}
                            onChange={(e) => setConverterInput(e.target.value)}
                            placeholder="Enter value"
                          />
                          <span className="converter-unit">{selectedConverter?.fromUnit}</span>
                        </div>
                      </div>
                      <div className="converter-field">
                        <label className="converter-label">{converterOutputLabel}</label>
                        <div className="converter-input-wrapper converter-output">
                          <input type="text" value={converterOutput} readOnly placeholder="—" />
                          <span className="converter-unit">{selectedConverter?.toUnit}</span>
                        </div>
                      </div>
                    </div>
                    <p className="converter-hint">Outputs in {selectedConverter?.toUnit}.</p>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
      </div>
    </>
  );
};

export default InventoryManager;

