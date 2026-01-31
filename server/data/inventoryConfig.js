const SHEET_DEFINITIONS = [
  {
    sheetKey: 'cocktails',
    name: 'Cocktails',
    description: 'Reference costs for finished cocktails.',
    columns: [
      { key: 'name', label: 'Name', type: 'text', required: true },
      { key: 'region', label: 'Region', type: 'text' },
      { key: 'style', label: 'Type', type: 'dropdown', datasetId: 'cocktail.type' },
      { key: 'ice', label: 'Ice', type: 'dropdown', datasetId: 'cocktails.ice' },
      { key: 'garnish', label: 'Garnish', type: 'dropdown', datasetId: 'cocktails.garnish' },
      { key: 'sumOz', label: 'Σ oz', type: 'number', unit: 'oz', precision: 2 },
      { key: 'unitCost', label: '$ / Unit', type: 'currency', unit: 'USD', precision: 2 },
      { key: 'salesPrice', label: '$ Sales', type: 'currency', unit: 'USD', precision: 2 },
      { key: 'itemNumber', label: 'Item#', type: 'number', precision: 0 },
      { key: 'menu', label: 'Menu', type: 'text' },
      { key: 'ingredients', label: 'Ingredients', type: 'text', hidden: true },
      { key: 'concept', label: 'Concept', type: 'text', hidden: true },
      { key: 'page', label: 'Page', type: 'text', hidden: true },
      { key: 'mapType', label: 'Map Type', type: 'dropdown', datasetId: 'shared.mapType', hidden: true }
    ]
  },
  {
    sheetKey: 'mocktails',
    name: 'Mocktails',
    description: 'Reference costs for finished mocktails.',
    columns: [
      { key: 'name', label: 'Name', type: 'text', required: true },
      { key: 'region', label: 'Region', type: 'text' },
      { key: 'style', label: 'Type', type: 'dropdown', datasetId: 'cocktail.type' },
      { key: 'ice', label: 'Ice', type: 'dropdown', datasetId: 'cocktails.ice' },
      { key: 'garnish', label: 'Garnish', type: 'dropdown', datasetId: 'mocktails.garnish' },
      { key: 'sumOz', label: 'Σ oz', type: 'number', unit: 'oz', precision: 2 },
      { key: 'unitCost', label: '$ / Unit', type: 'currency', unit: 'USD', precision: 2 },
      { key: 'salesPrice', label: '$ Sales', type: 'currency', unit: 'USD', precision: 2 },
      { key: 'itemNumber', label: 'Item#', type: 'number', precision: 0 },
      { key: 'menu', label: 'Menu', type: 'text' },
      { key: 'ingredients', label: 'Ingredients', type: 'text', hidden: true },
      { key: 'concept', label: 'Concept', type: 'text', hidden: true },
      { key: 'page', label: 'Page', type: 'text', hidden: true },
      { key: 'mapType', label: 'Map Type', type: 'dropdown', datasetId: 'shared.mapType', hidden: true }
    ]
  },
  {
    sheetKey: 'wine',
    name: 'Wine',
    description: 'Wine inventory with tasting and sourcing info.',
    columns: [
      { key: 'name', label: 'Name', type: 'text', required: true },
      { key: 'style', label: 'Style', type: 'dropdown', datasetId: 'wine.style' },
      { key: 'hue', label: 'Hue', type: 'dropdown', datasetId: 'wine.hue' },
      { key: 'region', label: 'Region', type: 'text' },
      { key: 'distributor', label: 'Distributor', type: 'dropdown', datasetId: 'shared.distributor' },
      { key: 'sizeMl', label: 'Size', type: 'number', unit: 'ml', precision: 0 },
      { key: 'unitCost', label: '$ / Unit', type: 'currency', unit: 'USD', precision: 2 },
      {
        key: 'ounceCost',
        label: '$ / oz',
        type: 'formula',
        unit: 'USD',
        precision: 2,
        formula: {
          type: 'unitPerConvertedVolume',
          numerator: 'unitCost',
          volumeKey: 'sizeMl',
          conversionFactor: 29.5735
        },
        helperText: 'Automatically calculated using ml → oz conversion (29.57 ml per oz).'
      },
      {
        key: 'glassCost',
        label: '$ / Glass',
        type: 'formula',
        unit: 'USD',
        precision: 2,
        formula: {
          type: 'multiplier',
          sourceKey: 'ounceCost',
          factor: 5
        },
        helperText: 'Calculated as $ / oz × 5.'
      },
      { key: 'salesPrice', label: '$ Sales', type: 'currency', unit: 'USD', precision: 2 },
      { key: 'itemNumber', label: 'Item#', type: 'number', precision: 0 },
      { key: 'menu', label: 'Menu', type: 'text' },
      { key: 'ingredients', label: 'Ingredients', type: 'text', hidden: true },
      { key: 'concept', label: 'Concept', type: 'text', hidden: true },
      { key: 'page', label: 'Page', type: 'text', hidden: true },
      { key: 'mapType', label: 'Map Type', type: 'dropdown', datasetId: 'shared.mapType', hidden: true }
    ]
  },
  {
    sheetKey: 'spirits',
    name: 'Spirits',
    description: 'Base spirits with distributor pricing.',
    columns: [
      { key: 'name', label: 'Name', type: 'text', required: true },
      { key: 'spirit', label: 'Spirit', type: 'dropdown', datasetId: 'spirits.type' },
      { key: 'region', label: 'Region', type: 'text' },
      { key: 'distributor', label: 'Distributor', type: 'dropdown', datasetId: 'shared.distributor' },
      { key: 'sizeOz', label: 'Size', type: 'dropdown', datasetId: 'spirits.size' },
      { key: 'unitCost', label: '$ / Unit', type: 'currency', unit: 'USD', precision: 2 },
      {
        key: 'ounceCost',
        label: '$ / oz',
        type: 'formula',
        unit: 'USD',
        precision: 2,
        formula: {
          type: 'unitPerConvertedVolume',
          numerator: 'unitCost',
          volumeKey: 'sizeOz',
          conversionFactor: 29.5735
        },
        helperText: 'Automatically calculated using ml → oz conversion (29.57 ml per oz).'
      },
      { key: 'salesPrice', label: '$ Sales', type: 'currency', unit: 'USD', precision: 2 },
      { key: 'itemNumber', label: 'Item#', type: 'number', precision: 0 },
      { key: 'menu', label: 'Menu', type: 'text' },
      { key: 'ingredients', label: 'Ingredients', type: 'text', hidden: true },
      { key: 'concept', label: 'Concept', type: 'text', hidden: true },
      { key: 'page', label: 'Page', type: 'text', hidden: true },
      { key: 'mapType', label: 'Map Type', type: 'dropdown', datasetId: 'shared.mapType', hidden: true }
    ]
  },
  {
    sheetKey: 'dryStock',
    name: 'Dry Stock',
    description: 'Non-liquid ingredients, acids, spices, syrups.',
    columns: [
      { key: 'name', label: 'Name', type: 'text', required: true },
      { key: 'type', label: 'Type', type: 'dropdown', datasetId: 'drystock.type' },
      { key: 'distributor', label: 'Distributor', type: 'dropdown', datasetId: 'shared.distributor' },
      { key: 'sizeG', label: 'Size', type: 'number', precision: 2 },
      {
        key: 'sizeUnit',
        label: 'ml / g',
        type: 'text',
        default: 'g'
      },
      { key: 'unitCost', label: '$ / Unit', type: 'currency', unit: 'USD', precision: 2 },
      {
        key: 'gramCost',
        label: '$ / oz',
        type: 'formula',
        unit: 'USD',
        precision: 2,
        formula: {
          type: 'unitPerSizeUnit',
          numerator: 'unitCost',
          sizeKey: 'sizeG',
          unitKey: 'sizeUnit',
          gramFactor: 28.3495,
          milliliterFactor: 29.5735
        },
        helperText: 'Automatically converts ml/g to oz before dividing unit cost.'
      },
      { key: 'salesPrice', label: '$ Sales', type: 'currency', unit: 'USD', precision: 2 },
      { key: 'itemNumber', label: 'Item#', type: 'number', precision: 0 }
    ]
  },
  {
    sheetKey: 'preMix',
    name: 'Pre-Mix',
    description: 'House syrups, acids, and batches.',
    columns: [
      { key: 'name', label: 'Name', type: 'text', required: true },
      { key: 'type', label: 'Type', type: 'dropdown', datasetId: 'premix.type' },
      { key: 'cocktail', label: 'Cocktail', type: 'dropdown', datasetId: 'cocktails.name' },
      { key: 'ounceCost', label: '$ / oz', type: 'currency', unit: 'USD', precision: 2 },
      { key: 'salesPrice', label: '$ Sales', type: 'currency', unit: 'USD', precision: 2 },
      { key: 'itemNumber', label: 'Item#', type: 'number', precision: 0 },
      { key: 'menu', label: 'Menu', type: 'text' }
    ]
  },
  {
    sheetKey: 'beer',
    name: 'Beer',
    description: 'Beer inventory with pack pricing.',
    columns: [
      { key: 'name', label: 'Name', type: 'text', required: true },
      { key: 'type', label: 'Type', type: 'dropdown', datasetId: 'beer.type' },
      { key: 'region', label: 'Region', type: 'text' },
      { key: 'packCost', label: '$/Pack', type: 'currency', unit: 'USD', precision: 2 },
      { key: 'numUnits', label: '#Units', type: 'number', precision: 0 },
      {
        key: 'unitCost',
        label: '$/Unit',
        type: 'formula',
        unit: 'USD',
        precision: 2,
        formula: {
          type: 'ratio',
          numerator: 'packCost',
          denominator: 'numUnits'
        },
        helperText: 'Automatically calculated as $/Pack ÷ #Units.'
      },
      { key: 'salesPrice', label: '$ Sales', type: 'currency', unit: 'USD', precision: 2 },
      { key: 'itemNumber', label: 'Item#', type: 'number', precision: 0 },
      { key: 'menu', label: 'Menu', type: 'text' },
      { key: 'ingredients', label: 'Ingredients', type: 'text', hidden: true },
      { key: 'concept', label: 'Concept', type: 'text', hidden: true },
      { key: 'page', label: 'Page', type: 'text', hidden: true },
      { key: 'mapType', label: 'Map Type', type: 'dropdown', datasetId: 'shared.mapType', hidden: true }
    ]
  }
];

const DATASET_DEFINITIONS = [
  { _id: 'cocktail.type', label: 'Cocktail Types', values: [] },
  { _id: 'cocktails.ice', label: 'Ice Formats', values: [] },
  { _id: 'cocktails.garnish', label: 'Garnishes', values: [] },
  { _id: 'cocktails.name', label: 'Cocktail Names', values: [] },
  { _id: 'mocktail.type', label: 'Mocktail Types', values: [] },
  { _id: 'mocktails.ice', label: 'Ice Formats', values: [] },
  { _id: 'mocktails.garnish', label: 'Garnishes', values: [] },
  { _id: 'mocktails.name', label: 'Mocktail Names', values: [] },
  {
    _id: 'wine.style',
    label: 'Wine Styles',
    values: [
      { value: 'Cabernet Sauvignon', label: 'Cabernet Sauvignon' },
      { value: 'Merlot', label: 'Merlot' },
      { value: 'Pinot Noir', label: 'Pinot Noir' },
      { value: 'Syrah/Shiraz', label: 'Syrah/Shiraz' },
      { value: 'Pinot Grigio', label: 'Pinot Grigio' },
      { value: 'Chenin Blanc', label: 'Chenin Blanc' },
      { value: 'Gewürztraminer', label: 'Gewürztraminer' },
      { value: 'Viognier', label: 'Viognier' },
      { value: 'Zinfandel', label: 'Zinfandel' },
      { value: 'Malbec', label: 'Malbec' },
      { value: 'Sangiovese', label: 'Sangiovese' },
      { value: 'Nebbiolo', label: 'Nebbiolo' },
      { value: 'Muscat', label: 'Muscat' },
      { value: 'Semillon', label: 'Semillon' },
      { value: 'Torrontés', label: 'Torrontés' },
      { value: 'Grüner Veltliner', label: 'Grüner Veltliner' },
      { value: 'Grenache', label: 'Grenache' },
      { value: 'Barbera', label: 'Barbera' },
      { value: 'Petite Sirah', label: 'Petite Sirah' },
      { value: 'Verdejo', label: 'Verdejo' },
      { value: 'Fiano', label: 'Fiano' },
      { value: 'Albariño', label: 'Albariño' },
      { value: 'Prosecco', label: 'Prosecco' }
    ]
  },
  { _id: 'wine.hue', label: 'Wine Hues', values: [] },
  { _id: 'wine.region', label: 'Wine Regions', values: [] },
  { _id: 'spirits.type', label: 'Spirit Types', values: [] },
  { _id: 'spirits.region', label: 'Spirit Regions', values: [] },
  { _id: 'spirits.size', label: 'Spirit Sizes', values: [] },
  { _id: 'drystock.type', label: 'Dry Stock Types', values: [] },
  { _id: 'premix.type', label: 'Pre-mix Types', values: [] },
  { _id: 'beer.type', label: 'Beer Types', values: [] },
  { _id: 'shared.distributor', label: 'Distributors', values: [] },
  { _id: 'shared.mapType', label: 'Map Types', values: [{ value: 'world', label: 'World' }, { value: 'us', label: 'US' }] }
];

module.exports = {
  SHEET_DEFINITIONS,
  DATASET_DEFINITIONS
};

