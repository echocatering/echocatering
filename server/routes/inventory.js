const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs');
const InventorySheet = require('../models/InventorySheet');
const InventoryDataset = require('../models/InventoryDataset');
const Cocktail = require('../models/Cocktail');
const Recipe = require('../models/Recipe');
const { SHEET_DEFINITIONS, DATASET_DEFINITIONS } = require('../data/inventoryConfig');
const { videoDir } = require('../utils/fileStorage');
const {
  fetchDatasets,
  formatSheet,
  applyRowValues,
  applyFormulas,
  mapValuesToPlain
} = require('../utils/inventoryHelpers');

const router = express.Router();

// Helper function to delete item files (video and map snapshots)
const deleteItemFiles = (itemId) => {
  if (!itemId) return;
  
  // Video files (various extensions)
  const videoExtensions = ['.mp4', '.mov', '.m4v', '.webm', '.avi', '.mkv'];
  // Map snapshot (PNG only, saved in cocktails folder)
  const mapExtensions = ['.png'];
  
  const filesToDelete = [
    ...videoExtensions.map(ext => path.join(videoDir, `${itemId}${ext}`)),
    ...mapExtensions.map(ext => path.join(videoDir, `${itemId}${ext}`))
  ];
  
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

const columnLinksByDataset = SHEET_DEFINITIONS.reduce((acc, sheet) => {
  sheet.columns.forEach((column) => {
    if (column.datasetId) {
      if (!acc[column.datasetId]) {
        acc[column.datasetId] = [];
      }
      acc[column.datasetId].push({ sheetKey: sheet.sheetKey, columnKey: column.key });
    }
  });
  return acc;
}, {});

let seedPromise = null;
let dryStockRecalcPromise = null;

async function seedInventory() {
  // Seed datasets
  await Promise.all(DATASET_DEFINITIONS.map(async (definition) => {
    const update = {
      label: definition.label,
      description: definition.description || '',
      linkedColumns: columnLinksByDataset[definition._id] || []
    };
    if (definition.values?.length) {
      update.values = definition.values;
    }
    await InventoryDataset.updateOne(
      { _id: definition._id },
      { $setOnInsert: { _id: definition._id }, $set: update },
      { upsert: true }
    );
  }));

  // Seed sheets
  await Promise.all(SHEET_DEFINITIONS.map(async (definition) => {
    const existing = await InventorySheet.findOne({ sheetKey: definition.sheetKey });
    if (!existing) {
      await InventorySheet.create({
        sheetKey: definition.sheetKey,
        name: definition.name,
        description: definition.description || '',
        columns: definition.columns,
        rows: [],
        version: 1
      });
    } else {
      // Update columns from config if they've changed
      let columnsChanged = false;
      const configColumns = definition.columns || [];
      const existingColumns = existing.columns || [];
      
      // Create a map of existing columns by key for quick lookup
      const existingColumnsByKey = {};
      existingColumns.forEach((col) => {
        existingColumnsByKey[col.key] = col;
      });
      
      // Rebuild columns array in config order, updating existing columns and adding new ones
      const newColumns = [];
      configColumns.forEach((configCol) => {
        const existingCol = existingColumnsByKey[configCol.key];
        if (existingCol) {
          // Update existing column properties if they differ
          let colChanged = false;
          if (existingCol.label !== configCol.label) {
            existingCol.label = configCol.label;
            colChanged = true;
          }
          if (existingCol.datasetId !== configCol.datasetId) {
            existingCol.datasetId = configCol.datasetId;
            colChanged = true;
          }
          if (existingCol.type !== configCol.type) {
            existingCol.type = configCol.type;
            colChanged = true;
          }
          if (configCol.precision !== undefined && existingCol.precision !== configCol.precision) {
            existingCol.precision = configCol.precision;
            colChanged = true;
          }
          if (configCol.unit !== undefined && existingCol.unit !== configCol.unit) {
            existingCol.unit = configCol.unit;
            colChanged = true;
          }
          if (configCol.required !== undefined && existingCol.required !== configCol.required) {
            existingCol.required = configCol.required;
            colChanged = true;
          }
          if (colChanged) {
            columnsChanged = true;
          }
          newColumns.push(existingCol);
        } else {
          // Add new column if it doesn't exist
          newColumns.push(configCol);
          columnsChanged = true;
        }
      });
      
      // Check if column order changed
      if (newColumns.length !== existingColumns.length) {
        columnsChanged = true;
      } else {
        for (let i = 0; i < newColumns.length; i++) {
          if (newColumns[i].key !== existingColumns[i].key) {
            columnsChanged = true;
            break;
          }
        }
      }
      
      if (columnsChanged) {
        existing.columns = newColumns;
        existing.version += 1;
        await existing.save();
      }
    }
  }));
}

async function migrateLegacySheets() {
  const dryStockSheet = await InventorySheet.findOne({ sheetKey: 'dryStock' });
  if (dryStockSheet) {
    let updated = false;
    dryStockSheet.columns.forEach((column) => {
      if (column.key === 'item') {
        column.key = 'name';
        column.label = 'Name';
        updated = true;
      }
    });

    if (updated) {
      dryStockSheet.rows.forEach((row) => {
        if (row.values?.get && row.values.has('item')) {
          if (!row.values.has('name')) {
            row.values.set('name', row.values.get('item'));
          }
          row.values.delete('item');
        } else if (row.values && row.values.item !== undefined) {
          if (row.values.name === undefined) {
            row.values.name = row.values.item;
          }
          delete row.values.item;
        }
      });
      dryStockSheet.version += 1;
      await dryStockSheet.save();
    }
  }

  await Promise.all([
    ensureColumnDataset('spirits', 'sizeOz', {
      label: 'Size',
      type: 'dropdown',
      datasetId: 'spirits.size',
      unit: undefined,
      precision: undefined
    })
  ]);

  await ensureSpiritsOunceFormula();
  await removeWineWineryColumn();
  await ensureWineSizeAndOunceColumns();
  await ensureDryStockSizeUnitColumn();
  await ensureRegionColumnsUseCountryCodes();
  await ensureCocktailsTypeColumn();
  await ensureMocktailsColumns();
  await ensurePreMixOunceCostPrecision();
  await ensureCocktailsMocktailsSumOzColumn();
  await removeNotesColumnsFromWineSpiritsBeer();
  await addMenuColumnToSheets();
  await normalizeCocktailMocktailNamesToTitleCase();
}

async function addMenuColumnToSheets() {
  const sheetKeys = ['cocktails', 'mocktails', 'wine', 'spirits', 'beer', 'preMix'];
  for (const sheetKey of sheetKeys) {
    const sheet = await InventorySheet.findOne({ sheetKey });
    if (!sheet) continue;
    
    const menuColumn = sheet.columns.find(col => col.key === 'menu');
    if (menuColumn) {
      // Update existing menu column label
      if (menuColumn.label !== 'Menu') {
        menuColumn.label = 'Menu';
        sheet.version += 1;
        await sheet.save();
        console.log(`✅ Updated menu column label to "Menu" in ${sheetKey} sheet`);
      }
    } else {
      // Add menu column at the end
      sheet.columns.push({
        key: 'menu',
        label: 'Menu',
        type: 'text'
      });
      sheet.version += 1;
      await sheet.save();
      console.log(`✅ Added menu column to ${sheetKey} sheet`);
    }
  }
}

async function normalizeCocktailMocktailNamesToTitleCase() {
  const sheetKeys = ['cocktails', 'mocktails'];
  for (const sheetKey of sheetKeys) {
    const sheet = await InventorySheet.findOne({ sheetKey });
    if (!sheet) continue;
    
    let updated = false;
    sheet.rows.forEach(row => {
      if (row.isDeleted) return;
      
      const valuesMap = row.values instanceof Map 
        ? row.values 
        : new Map(Object.entries(row.values || {}));
      
      const currentName = valuesMap.get('name');
      if (currentName && typeof currentName === 'string') {
        const titleCaseName = toTitleCase(currentName);
        if (currentName !== titleCaseName) {
          valuesMap.set('name', titleCaseName);
          row.values = valuesMap;
          updated = true;
        }
      }
    });
    
    if (updated) {
      sheet.markModified('rows');
      sheet.version += 1;
      await sheet.save();
      console.log(`✅ Normalized ${sheetKey} names to title case`);
    }
  }
}

async function removeNotesColumnsFromWineSpiritsBeer() {
  const sheetKeys = ['wine', 'spirits', 'beer'];
  for (const sheetKey of sheetKeys) {
    const sheet = await InventorySheet.findOne({ sheetKey });
    if (!sheet) continue;
    
    const hasNotesColumn = sheet.columns.some(col => col.key === 'notes');
    if (!hasNotesColumn) continue;
    
    // Remove notes column
    sheet.columns = sheet.columns.filter(col => col.key !== 'notes');
    sheet.version += 1;
    await sheet.save();
    console.log(`✅ Removed notes column from ${sheetKey} sheet`);
  }
}

// Format text to title case (first letter capital, rest lowercase)
// Preserves acronyms with multiple capitals (G&T, USA, etc.)
// Handles multi-word strings by capitalizing first letter of each word
const toTitleCase = (text) => {
  if (!text || typeof text !== 'string') return text;
  const trimmed = text.trim();
  if (!trimmed) return trimmed;
  // Split by spaces and capitalize first letter of each word, lowercase the rest
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

async function normalizeAllDatasetValues() {
  try {
    const datasets = await InventoryDataset.find({});
    let totalUpdated = 0;
    let totalValuesUpdated = 0;
    
    // Create a mapping of old values to new values for updating rows
    const valueMapping = new Map();
    
    for (const dataset of datasets) {
      let hasChanges = false;
      const normalizedValues = (dataset.values || []).map((entry) => {
        const normalizedValue = toTitleCase(entry.value);
        const normalizedLabel = toTitleCase(entry.label || entry.value);
        
        if (normalizedValue !== entry.value || normalizedLabel !== entry.label) {
          hasChanges = true;
          totalValuesUpdated++;
          // Store mapping for row updates
          valueMapping.set(`${dataset._id}:${entry.value}`, normalizedValue);
          console.log(`  - "${entry.value}" → "${normalizedValue}" in dataset ${dataset._id}`);
          return {
            value: normalizedValue,
            label: normalizedLabel,
            isDefault: entry.isDefault || false
          };
        }
        return entry;
      });
      
      if (hasChanges) {
        dataset.values = normalizedValues;
        await dataset.save();
        totalUpdated++;
        console.log(`Updated dataset ${dataset._id} (${dataset.label})`);
      }
    }
    
    // Now update all inventory rows that reference these values
    if (valueMapping.size > 0) {
      const sheets = await InventorySheet.find({});
      let rowsUpdated = 0;
      
      for (const sheet of sheets) {
        let sheetChanged = false;
        const columnsByDataset = {};
        sheet.columns.forEach(col => {
          if (col.datasetId) {
            columnsByDataset[col.key] = col.datasetId;
          }
        });
        
        sheet.rows.forEach(row => {
          if (!row.values) return;
          let rowChanged = false;
          
          // Handle both Map and plain object
          const isMap = row.values instanceof Map;
          const valuesMap = isMap ? row.values : new Map(Object.entries(row.values || {}));
          
          Object.entries(columnsByDataset).forEach(([columnKey, datasetId]) => {
            const currentValue = valuesMap.get(columnKey);
            if (currentValue && typeof currentValue === 'string') {
              // Try exact match first
              const mappingKey = `${datasetId}:${currentValue}`;
              let newValue = valueMapping.get(mappingKey);
              
              // If no exact match, try case-insensitive match
              if (!newValue) {
                for (const [key, mappedValue] of valueMapping.entries()) {
                  const [keyDatasetId, keyValue] = key.split(':');
                  if (keyDatasetId === datasetId && keyValue.toLowerCase() === currentValue.toLowerCase()) {
                    newValue = mappedValue;
                    break;
                  }
                }
              }
              
              if (newValue && newValue !== currentValue) {
                valuesMap.set(columnKey, newValue);
                rowChanged = true;
                rowsUpdated++;
              }
            }
          });
          
          if (rowChanged) {
            if (isMap) {
              // For Mongoose Maps, we need to set individual values
              valuesMap.forEach((value, key) => {
                row.values.set(key, value);
              });
            } else {
              // Convert Map back to object
              row.values = Object.fromEntries(valuesMap);
            }
            sheetChanged = true;
          }
        });
        
        if (sheetChanged) {
          sheet.markModified('rows');
          await sheet.save();
        }
      }
      
      if (rowsUpdated > 0) {
        console.log(`✅ Updated ${rowsUpdated} row value(s) to match normalized dataset values.`);
      }
    }
    
    if (totalUpdated > 0) {
      console.log(`✅ Normalized ${totalUpdated} dataset(s) with ${totalValuesUpdated} total value(s) to title case format.`);
    } else {
      console.log(`✅ All dataset values are already in title case format.`);
    }
  } catch (error) {
    console.error('❌ Error normalizing dataset values:', error);
  }
}

async function ensureCocktailsTypeColumn() {
  const cocktailsSheet = await InventorySheet.findOne({ sheetKey: 'cocktails' });
  if (!cocktailsSheet) return;
  
  let changed = false;
  cocktailsSheet.columns.forEach((column) => {
    if (column.key === 'style') {
      if (column.label !== 'Type') {
        column.label = 'Type';
        changed = true;
      }
      if (column.datasetId !== 'cocktail.type') {
        column.datasetId = 'cocktail.type';
        changed = true;
      }
    }
  });
  
  if (changed) {
    cocktailsSheet.version += 1;
    await cocktailsSheet.save();
  }
}

async function ensureMocktailsColumns() {
  const mocktailsSheet = await InventorySheet.findOne({ sheetKey: 'mocktails' });
  if (!mocktailsSheet) {
    console.log('⚠️ Mocktails sheet not found');
    return;
  }
  
  let changed = false;
  mocktailsSheet.columns.forEach((column) => {
    if (column.key === 'style') {
      console.log(`  Checking style column: datasetId="${column.datasetId}", type="${column.type}"`);
      if (column.label !== 'Type') {
        column.label = 'Type';
        changed = true;
      }
      // Use the same dataset as cocktails since they share the same types
      if (column.datasetId !== 'cocktail.type') {
        console.log(`    Updating style column datasetId from "${column.datasetId}" to "cocktail.type" (shared with cocktails)`);
        column.datasetId = 'cocktail.type';
        changed = true;
      }
      if (column.type !== 'dropdown') {
        console.log(`    Updating style column type from "${column.type}" to "dropdown"`);
        column.type = 'dropdown';
        changed = true;
      }
    }
    if (column.key === 'ice') {
      console.log(`  Checking ice column: datasetId="${column.datasetId}", type="${column.type}"`);
      // Use the same dataset as cocktails since they share the same ice formats
      if (column.datasetId !== 'cocktails.ice') {
        console.log(`    Updating ice column datasetId from "${column.datasetId}" to "cocktails.ice" (shared with cocktails)`);
        column.datasetId = 'cocktails.ice';
        changed = true;
      }
      if (column.type !== 'dropdown') {
        console.log(`    Updating ice column type from "${column.type}" to "dropdown"`);
        column.type = 'dropdown';
        changed = true;
      }
    }
  });
  
  if (changed) {
    mocktailsSheet.markModified('columns');
    mocktailsSheet.version += 1;
    await mocktailsSheet.save();
    console.log('✅ Updated mocktails columns to use shared datasets with cocktails');
  } else {
    console.log('✅ Mocktails columns already have correct datasetIds');
  }
}

async function ensurePreMixOunceCostPrecision() {
  const sheet = await InventorySheet.findOne({ sheetKey: 'preMix' });
  if (!sheet) return;

  const targetColumn = sheet.columns.find((column) => column.key === 'ounceCost');
  if (!targetColumn) return;

  // Update precision to 2 if it's not already 2
  if (targetColumn.precision !== 2) {
    targetColumn.precision = 2;
    sheet.version += 1;
    await sheet.save();
    console.log('✅ Updated preMix ounceCost precision to 2');
  }
}

async function ensureCocktailsMocktailsSumOzColumn() {
  const sheets = await InventorySheet.find({ sheetKey: { $in: ['cocktails', 'mocktails'] } });
  
  for (const sheet of sheets) {
    let changed = false;
    const hasSumOz = sheet.columns.some((col) => col.key === 'sumOz');
    
    if (!hasSumOz) {
      // Find the unitCost column index to insert sumOz before it
      const unitCostIndex = sheet.columns.findIndex((col) => col.key === 'unitCost');
      const sumOzColumn = {
        key: 'sumOz',
        label: 'Σ oz',
        type: 'number',
        unit: 'oz',
        precision: 2
      };
      
      if (unitCostIndex >= 0) {
        sheet.columns.splice(unitCostIndex, 0, sumOzColumn);
      } else {
        sheet.columns.push(sumOzColumn);
      }
      changed = true;
      console.log(`✅ Added sumOz column to ${sheet.sheetKey} sheet`);
    }
    
    if (changed) {
      sheet.version += 1;
      await sheet.save();
    }
  }
}


async function ensureColumnDataset(sheetKey, columnKey, updates = {}) {
  const sheet = await InventorySheet.findOne({ sheetKey });
  if (!sheet) return;
  let changed = false;
  sheet.columns.forEach((column) => {
    if (column.key === columnKey) {
      Object.entries(updates).forEach(([key, value]) => {
        if (value === undefined) {
          if (column[key] !== undefined) {
            column[key] = undefined;
            changed = true;
          }
        } else if (column[key] !== value) {
          column[key] = value;
          changed = true;
        }
      });
    }
  });
  if (changed) {
    sheet.version += 1;
    await sheet.save();
  }
}

async function ensureSpiritsOunceFormula() {
  const sheet = await InventorySheet.findOne({ sheetKey: 'spirits' });
  if (!sheet) return;

  const targetColumn = sheet.columns.find((column) => column.key === 'ounceCost');
  if (!targetColumn) return;

  const desiredFormula = {
    type: 'unitPerConvertedVolume',
    numerator: 'unitCost',
    volumeKey: 'sizeOz',
    conversionFactor: 29.5735
  };

  const needsUpdate =
    targetColumn.formula?.type !== desiredFormula.type ||
    targetColumn.formula?.numerator !== desiredFormula.numerator ||
    targetColumn.formula?.volumeKey !== desiredFormula.volumeKey ||
    Number(targetColumn.formula?.conversionFactor) !== desiredFormula.conversionFactor ||
    (Number.isFinite(targetColumn.precision) && targetColumn.precision !== 2);

  if (!needsUpdate) return;

  targetColumn.formula = desiredFormula;
  targetColumn.precision = 2;
  targetColumn.unit = 'USD';
  targetColumn.helperText =
    'Automatically calculated using ml → oz conversion (29.57 ml per oz).';

  sheet.rows.forEach((row) => {
    applyFormulas(sheet, row);
  });

  sheet.version += 1;
  await sheet.save();
}

async function removeWineWineryColumn() {
  const sheet = await InventorySheet.findOne({ sheetKey: 'wine' });
  if (!sheet) return;

  const wineryIndex = sheet.columns.findIndex((column) => column.key === 'winery');
  if (wineryIndex === -1) return;

  sheet.columns.splice(wineryIndex, 1);
  sheet.rows.forEach((row) => {
    if (row.values?.delete) {
      row.values.delete('winery');
    } else if (row.values && row.values.winery !== undefined) {
      delete row.values.winery;
    }
  });

  sheet.version += 1;
  await sheet.save();
}

async function ensureWineSizeAndOunceColumns() {
  const sheet = await InventorySheet.findOne({ sheetKey: 'wine' });
  if (!sheet) return;

  const distributorIndex = sheet.columns.findIndex((column) => column.key === 'distributor');
  if (distributorIndex === -1) return;

  const regionColumn = sheet.columns.find((column) => column.key === 'region');
  if (regionColumn) {
    regionColumn.type = 'text';
    regionColumn.datasetId = undefined;
  }

  const hasSize = sheet.columns.some((column) => column.key === 'sizeMl');
  if (!hasSize) {
    sheet.columns.splice(distributorIndex + 1, 0, {
      key: 'sizeMl',
      label: 'Size',
      type: 'number',
      unit: 'ml',
      precision: 0
    });
    sheet.rows.forEach((row) => {
      if (!row.values?.has?.('sizeMl')) {
        if (row.values?.set) {
          row.values.set('sizeMl', null);
        } else if (row.values) {
          row.values.sizeMl = null;
        }
      }
    });
  }

  const hasOunce = sheet.columns.some((column) => column.key === 'ounceCost');
  if (!hasOunce) {
    const unitIndex = sheet.columns.findIndex((column) => column.key === 'unitCost');
    const insertIndex = unitIndex === -1 ? sheet.columns.length : unitIndex + 1;
    sheet.columns.splice(insertIndex, 0, {
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
    });
  }

  const glassColumn = sheet.columns.find((column) => column.key === 'glassCost');
  if (glassColumn) {
    const desiredGlassFormula = {
      type: 'multiplier',
      sourceKey: 'ounceCost',
      factor: 5
    };
    const needsGlassUpdate =
      glassColumn.type !== 'formula' ||
      glassColumn.precision !== 2 ||
      glassColumn.formula?.type !== desiredGlassFormula.type ||
      glassColumn.formula?.sourceKey !== desiredGlassFormula.sourceKey ||
      Number(glassColumn.formula?.factor) !== desiredGlassFormula.factor;
    if (needsGlassUpdate) {
      glassColumn.type = 'formula';
      glassColumn.precision = 2;
      glassColumn.unit = 'USD';
      glassColumn.formula = desiredGlassFormula;
      glassColumn.helperText = 'Calculated as $ / oz × 5.';
    }
  }

  sheet.rows.forEach((row) => applyFormulas(sheet, row));
  sheet.version += 1;
  await sheet.save();
}

async function ensureDryStockSizeUnitColumn() {
  const sheet = await InventorySheet.findOne({ sheetKey: 'dryStock' });
  if (!sheet) return;

  const sizeColumn = sheet.columns.find((column) => column.key === 'sizeG');
  if (sizeColumn) {
    sizeColumn.label = 'Size';
    sizeColumn.unit = undefined;
  }

  const hasUnitColumn = sheet.columns.some((column) => column.key === 'sizeUnit');
  if (!hasUnitColumn) {
    const sizeIndex = sheet.columns.findIndex((column) => column.key === 'sizeG');
    const insertIndex = sizeIndex === -1 ? sheet.columns.length : sizeIndex + 1;
    sheet.columns.splice(insertIndex, 0, {
      key: 'sizeUnit',
      label: 'ml / g',
      type: 'text',
      default: 'g'
    });
  }

  sheet.rows.forEach((row) => {
    const currentValue = row.values?.get ? row.values.get('sizeUnit') : row.values?.sizeUnit;
    if (!currentValue) {
      if (row.values?.set) {
        row.values.set('sizeUnit', 'g');
      } else if (row.values) {
        row.values.sizeUnit = 'g';
      }
    }
  });

  const gramCostColumn = sheet.columns.find((column) => column.key === 'gramCost');
  if (gramCostColumn) {
    gramCostColumn.label = '$ / oz';
    gramCostColumn.precision = 2;
    gramCostColumn.unit = 'USD';
    gramCostColumn.helperText = 'Automatically converts ml/g to oz before dividing unit cost.';
    gramCostColumn.formula = {
      type: 'unitPerSizeUnit',
      numerator: 'unitCost',
      sizeKey: 'sizeG',
      unitKey: 'sizeUnit',
      gramFactor: 28.3495,
      milliliterFactor: 29.5735
    };
  }

  sheet.rows.forEach((row) => applyFormulas(sheet, row));
  sheet.version += 1;
  await sheet.save();
}

async function ensureRegionColumnsUseCountryCodes() {
  const targets = ['wine', 'spirits'];
  for (const sheetKey of targets) {
    const sheet = await InventorySheet.findOne({ sheetKey });
    if (!sheet) continue;
    const regionColumn = sheet.columns.find((column) => column.key === 'region');
    if (regionColumn) {
      regionColumn.type = 'text';
      regionColumn.datasetId = undefined;
    }
    sheet.version += 1;
    await sheet.save();
  }
}

async function ensureSeeded() {
  if (!seedPromise) {
    seedPromise = (async () => {
      await seedInventory();
      await migrateLegacySheets();
      await normalizeAllDatasetValues();
      await ensureItemNumberColumnsAndValues();
    })().catch((error) => {
      seedPromise = null;
      throw error;
    });
  }
  return seedPromise;
}

async function ensureDryStockOunceCosts() {
  if (!dryStockRecalcPromise) {
    dryStockRecalcPromise = (async () => {
      const sheet = await InventorySheet.findOne({ sheetKey: 'dryStock' });
      if (!sheet) return;
      let updated = false;
      sheet.rows.forEach((row) => {
        const before = row.values?.get ? row.values.get('gramCost') : row.values?.gramCost;
        applyFormulas(sheet, row);
        const after = row.values?.get ? row.values.get('gramCost') : row.values?.gramCost;
        if (before !== after) {
          updated = true;
        }
      });
      if (updated) {
        sheet.version += 1;
        await sheet.save();
      }
    })().catch((error) => {
      dryStockRecalcPromise = null;
      throw error;
    });
  }
  return dryStockRecalcPromise;
}

async function loadSheet(req, res, next, sheetKey) {
  try {
    const sheet = await InventorySheet.findOne({ sheetKey });
    if (!sheet) {
      return res.status(404).json({ message: `Sheet "${sheetKey}" not found.` });
    }
    req.sheet = sheet;
    req.sheetColumnsByKey = sheet.columns.reduce((acc, column) => {
      acc[column.key] = column;
      return acc;
    }, {});
    req.datasetIds = sheet.columns
      .filter((column) => column.datasetId)
      .map((column) => column.datasetId);
    next();
  } catch (error) {
    next(error);
  }
}

router.use(async (req, res, next) => {
  try {
    await ensureSeeded();
    await ensureDryStockOunceCosts();
    next();
  } catch (error) {
    next(error);
  }
});

router.get('/sheets', async (req, res, next) => {
  try {
    const sheets = await InventorySheet.find({})
      .select('sheetKey name description version updatedAt rows')
      .lean();
    const payload = sheets.map((sheet) => ({
      sheetKey: sheet.sheetKey,
      name: sheet.name,
      description: sheet.description,
      version: sheet.version,
      updatedAt: sheet.updatedAt,
      rowCount: sheet.rows?.length || 0
    }));
    res.json({ sheets: payload });
  } catch (error) {
    next(error);
  }
});

router.get('/datasets/:datasetId', async (req, res, next) => {
  try {
    let dataset = await InventoryDataset.findById(req.params.datasetId);
    if (!dataset) {
      // Create the dataset if it doesn't exist
      dataset = new InventoryDataset({
        _id: req.params.datasetId,
        label: req.params.datasetId,
        values: [],
        linkedColumns: []
      });
      await dataset.save();
    }
    res.json({ dataset: dataset.toObject({ versionKey: false }) });
  } catch (error) {
    next(error);
  }
});

router.put('/datasets/:datasetId', async (req, res, next) => {
  try {
    const { label, values } = req.body;
    let dataset = await InventoryDataset.findById(req.params.datasetId);
    if (!dataset) {
      // Create the dataset if it doesn't exist
      const normalizedValues = Array.isArray(values) 
        ? values.map(v => ({
            value: toTitleCase(v.value || v),
            label: toTitleCase(v.label || v.value || v)
          }))
        : [];
      dataset = new InventoryDataset({
        _id: req.params.datasetId,
        label: label || req.params.datasetId,
        values: normalizedValues,
        linkedColumns: []
      });
    } else {
      if (label) dataset.label = label;
      if (Array.isArray(values)) {
        // Normalize all values to title case
        dataset.values = values.map(v => ({
          value: toTitleCase(v.value || v),
          label: toTitleCase(v.label || v.value || v)
        }));
      }
    }
    await dataset.save();
    res.json({ dataset: dataset.toObject({ versionKey: false }) });
  } catch (error) {
    next(error);
  }
});

// DEPRECATED: Sync cocktails from MenuManager - must be before /:sheetKey route
// NOTE: MenuManager now writes directly to Inventory on save, so this route is no longer needed
// Keeping for backward compatibility, but should not be called automatically
router.post('/cocktails/sync-from-menu', async (req, res, next) => {
  try {
    const sheet = await InventorySheet.findOne({ sheetKey: 'cocktails' });
    if (!sheet) {
      return res.status(404).json({ message: 'Cocktails inventory sheet not found.' });
    }

    const columnsByKey = sheet.columns.reduce((acc, column) => {
      acc[column.key] = column;
      return acc;
    }, {});

    // Get all active cocktails from MenuManager
    const cocktails = await Cocktail.find({
      category: 'cocktails',
      $or: [
        { status: { $exists: false } },
        { status: 'active' }
      ],
      isActive: { $ne: false }
    }).lean();

    console.log(`🔄 Syncing ${cocktails.length} cocktails from MenuManager to inventory...`);

    let created = 0;
    let updated = 0;
    let skipped = 0;
    const errors = [];

    // Get all cocktail recipes for matching
    const allRecipes = await Recipe.find({ type: 'cocktail' }).lean();
    const recipeMap = new Map();
    allRecipes.forEach(recipe => {
      if (recipe.title) {
        recipeMap.set(recipe.title.toLowerCase(), recipe);
      }
    });

    for (const cocktail of cocktails) {
      try {
        // Find matching recipe by name (case-insensitive)
        const recipe = recipeMap.get(cocktail.name?.toLowerCase());

        // Find existing inventory row by recipeId (if recipe exists) or by name
        let row = null;
        if (recipe) {
          row = sheet.rows.find((rowItem) => {
            const rowRecipeId = getRowRecipeId(rowItem);
            return rowRecipeId && String(rowRecipeId) === String(recipe._id);
          });
        }
        
        // If no row found by recipeId, try to find by name
        if (!row) {
          row = sheet.rows.find((rowItem) => {
            if (!rowItem.values) return false;
            const valuesMap = rowItem.values instanceof Map 
              ? rowItem.values 
              : new Map(Object.entries(rowItem.values || {}));
            const rowName = valuesMap.get('name');
            return rowName && rowName.toLowerCase() === cocktail.name?.toLowerCase();
          });
        }

        // Create new row if it doesn't exist
        if (!row) {
          sheet.rows.push({
            order: sheet.rows.length + 1,
            values: new Map()
          });
          row = sheet.rows[sheet.rows.length - 1];
          created++;
        } else {
          updated++;
        }

        const valuesMap = ensureRowValuesMap(row);

        if (recipe) {
          // Recipe exists - sync all fields
          const recipeItems = Array.isArray(recipe.items) ? recipe.items : [];
          
          // Get volume and cost from recipe totals
          let volumeOz = recipe.totals?.volumeOz;
          let costEach = recipe.totals?.costEach;
          
          // If totals not available, calculate from items
          if ((volumeOz === undefined || volumeOz === null || volumeOz === 0) && recipeItems.length > 0) {
            volumeOz = recipeItems.reduce((sum, item) => {
              const toOz = item.conversions?.toOz || 0;
              return sum + (Number.isFinite(toOz) ? toOz : 0);
            }, 0);
            volumeOz = Number(volumeOz.toFixed(3));
          }
          if ((costEach === undefined || costEach === null || costEach === 0) && recipeItems.length > 0) {
            costEach = recipeItems.reduce((sum, item) => {
              const extendedCost = item.extendedCost || 0;
              return sum + (Number.isFinite(extendedCost) ? extendedCost : 0);
            }, 0);
            costEach = Number(costEach.toFixed(2));
          }

          // Update all fields - apply title case to all shared fields
          const updateValues = {
            name: toTitleCase(cocktail.name || 'Untitled'),
            region: Array.isArray(cocktail.regions) && cocktail.regions.length > 0
              ? cocktail.regions.map(r => toTitleCase(String(r).trim())).join(', ')
              : '',
            style: toTitleCase(recipe.metadata?.style || recipe.metadata?.type || ''),
            ice: toTitleCase(recipe.metadata?.ice || ''),
            garnish: toTitleCase(recipe.metadata?.garnish || ''),
            sumOz: volumeOz !== undefined && volumeOz !== null ? Number(volumeOz.toFixed(2)) : 0,
          unitCost: costEach !== undefined && costEach !== null ? Number(costEach.toFixed(2)) : 0,
          // Don't sync itemNumber from MenuManager - inventory is source of truth
          // itemNumber: Number.isFinite(cocktail.itemNumber) ? cocktail.itemNumber : null
          };

          applyRowValues(row, updateValues, columnsByKey);
          valuesMap.set('recipeId', String(recipe._id));
          valuesMap.set('recipeType', 'cocktail');
          
          console.log(`✅ Synced "${cocktail.name}": recipe found, all fields updated`);
        } else {
          // No recipe - sync what we can from MenuManager - apply title case
          const updateValues = {
            name: toTitleCase(cocktail.name || 'Untitled'),
            region: Array.isArray(cocktail.regions) && cocktail.regions.length > 0
              ? cocktail.regions.map(r => toTitleCase(String(r).trim())).join(', ')
            : '',
          // Don't sync itemNumber from MenuManager - inventory is source of truth
          // itemNumber: Number.isFinite(cocktail.itemNumber) ? cocktail.itemNumber : null
          };
          applyRowValues(row, updateValues, columnsByKey);
          // Don't set recipeId if no recipe exists
          if (valuesMap.has('recipeId')) {
            valuesMap.delete('recipeId');
          }
          if (valuesMap.has('recipeType')) {
            valuesMap.delete('recipeType');
          }
          
          console.log(`⚠️  Synced "${cocktail.name}": no recipe found, synced name and region from MenuManager`);
          skipped++;
        }

        // Apply formulas (in case there are any formula columns)
        applyFormulas(sheet, row);
      } catch (error) {
        const errorMsg = `Error syncing cocktail "${cocktail.name}": ${error.message}`;
        console.error(`❌ ${errorMsg}`);
        errors.push(errorMsg);
      }
    }

    // Save the sheet
    sheet.markModified('rows');
    sheet.version += 1;
    await sheet.save();

    const summary = {
      total: cocktails.length,
      created,
      updated,
      skipped,
      errors: errors.length
    };

    console.log(`✅ Sync complete:`, summary);
    if (errors.length > 0) {
      console.error('Errors:', errors);
    }

    res.json({
      message: 'Cocktails synced from MenuManager',
      summary,
      errors: errors.length > 0 ? errors : undefined
    });
  } catch (error) {
    console.error('Error syncing cocktails from MenuManager:', error);
    next(error);
  }
});

// DEPRECATED: Sync mocktails from MenuManager - must be before /:sheetKey route
// NOTE: MenuManager now writes directly to Inventory on save, so this route is no longer needed
router.post('/mocktails/sync-from-menu', async (req, res, next) => {
  try {
    const sheet = await InventorySheet.findOne({ sheetKey: 'mocktails' });
    if (!sheet) {
      return res.status(404).json({ message: 'Mocktails inventory sheet not found.' });
    }

    const columnsByKey = sheet.columns.reduce((acc, column) => {
      acc[column.key] = column;
      return acc;
    }, {});

    // Get all active mocktails from MenuManager
    const mocktails = await Cocktail.find({
      category: 'mocktails',
      $or: [
        { status: { $exists: false } },
        { status: 'active' }
      ],
      isActive: { $ne: false }
    }).lean();

    console.log(`🔄 Syncing ${mocktails.length} mocktails from MenuManager to inventory...`);

    let created = 0;
    let updated = 0;
    let skipped = 0;
    const errors = [];

    // Get all mocktail recipes for matching
    const allRecipes = await Recipe.find({ type: 'mocktail' }).lean();
    const recipeMap = new Map();
    allRecipes.forEach(recipe => {
      if (recipe.title) {
        recipeMap.set(recipe.title.toLowerCase(), recipe);
      }
    });

    for (const mocktail of mocktails) {
      try {
        // Find matching recipe by name (case-insensitive)
        const recipe = recipeMap.get(mocktail.name?.toLowerCase());

        // Find existing inventory row by recipeId (if recipe exists) or by name
        let row = null;
        if (recipe) {
          row = sheet.rows.find((rowItem) => {
            const rowRecipeId = getRowRecipeId(rowItem);
            return rowRecipeId && String(rowRecipeId) === String(recipe._id);
          });
        }
        
        // If no row found by recipeId, try to find by name
        if (!row) {
          row = sheet.rows.find((rowItem) => {
            if (!rowItem.values) return false;
            const valuesMap = rowItem.values instanceof Map 
              ? rowItem.values 
              : new Map(Object.entries(rowItem.values || {}));
            const rowName = valuesMap.get('name');
            return rowName && rowName.toLowerCase() === mocktail.name?.toLowerCase();
          });
        }

        // Create new row if it doesn't exist
        if (!row) {
          sheet.rows.push({
            order: sheet.rows.length + 1,
            values: new Map()
          });
          row = sheet.rows[sheet.rows.length - 1];
          created++;
        } else {
          updated++;
        }

        const valuesMap = ensureRowValuesMap(row);

        if (recipe) {
          // Recipe exists - sync all fields
          const recipeItems = Array.isArray(recipe.items) ? recipe.items : [];
          
          // Get volume and cost from recipe totals
          let volumeOz = recipe.totals?.volumeOz;
          let costEach = recipe.totals?.costEach;
          
          // If totals not available, calculate from items
          if ((volumeOz === undefined || volumeOz === null || volumeOz === 0) && recipeItems.length > 0) {
            volumeOz = recipeItems.reduce((sum, item) => {
              const toOz = item.conversions?.toOz || 0;
              return sum + (Number.isFinite(toOz) ? toOz : 0);
            }, 0);
            volumeOz = Number(volumeOz.toFixed(3));
          }
          if ((costEach === undefined || costEach === null || costEach === 0) && recipeItems.length > 0) {
            costEach = recipeItems.reduce((sum, item) => {
              const extendedCost = item.extendedCost || 0;
              return sum + (Number.isFinite(extendedCost) ? extendedCost : 0);
            }, 0);
            costEach = Number(costEach.toFixed(2));
          }

          // Update all fields - apply title case to all shared fields
          const updateValues = {
            name: toTitleCase(mocktail.name || 'Untitled'),
            region: Array.isArray(mocktail.regions) && mocktail.regions.length > 0
              ? mocktail.regions.map(r => toTitleCase(String(r).trim())).join(', ')
              : '',
            style: toTitleCase(recipe.metadata?.style || recipe.metadata?.type || ''),
            ice: toTitleCase(recipe.metadata?.ice || ''),
            garnish: toTitleCase(recipe.metadata?.garnish || ''),
            sumOz: volumeOz !== undefined && volumeOz !== null ? Number(volumeOz.toFixed(2)) : 0,
          unitCost: costEach !== undefined && costEach !== null ? Number(costEach.toFixed(2)) : 0,
          // Don't sync itemNumber from MenuManager - inventory is source of truth
          // itemNumber: Number.isFinite(mocktail.itemNumber) ? mocktail.itemNumber : null
          };

          applyRowValues(row, updateValues, columnsByKey);
          valuesMap.set('recipeId', String(recipe._id));
          valuesMap.set('recipeType', 'mocktail');
          
          console.log(`✅ Synced "${mocktail.name}": recipe found, all fields updated`);
        } else {
          // No recipe - sync what we can from MenuManager - apply title case
          const updateValues = {
            name: toTitleCase(mocktail.name || 'Untitled'),
            region: Array.isArray(mocktail.regions) && mocktail.regions.length > 0
              ? mocktail.regions.map(r => toTitleCase(String(r).trim())).join(', ')
            : '',
          // Don't sync itemNumber from MenuManager - inventory is source of truth
          // itemNumber: Number.isFinite(mocktail.itemNumber) ? mocktail.itemNumber : null
          };
          applyRowValues(row, updateValues, columnsByKey);
          // Don't set recipeId if no recipe exists
          if (valuesMap.has('recipeId')) {
            valuesMap.delete('recipeId');
          }
          if (valuesMap.has('recipeType')) {
            valuesMap.delete('recipeType');
          }
          
          console.log(`⚠️  Synced "${mocktail.name}": no recipe found, synced name and region from MenuManager`);
          skipped++;
        }

        // Apply formulas (in case there are any formula columns)
        applyFormulas(sheet, row);
      } catch (error) {
        const errorMsg = `Error syncing mocktail "${mocktail.name}": ${error.message}`;
        console.error(`❌ ${errorMsg}`);
        errors.push(errorMsg);
      }
    }

    // Save the sheet
    sheet.markModified('rows');
    sheet.version += 1;
    await sheet.save();

    const summary = {
      total: mocktails.length,
      created,
      updated,
      skipped,
      errors: errors.length
    };

    console.log(`✅ Sync complete:`, summary);
    if (errors.length > 0) {
      console.error('Errors:', errors);
    }

    res.json({
      message: 'Mocktails synced from MenuManager',
      summary,
      errors: errors.length > 0 ? errors : undefined
    });
  } catch (error) {
    console.error('Error syncing mocktails from MenuManager:', error);
    next(error);
  }
});

// Sync pre-mix from MenuManager - must be before /:sheetKey route
// DEPRECATED: Sync preMix from MenuManager - must be before /:sheetKey route
// NOTE: MenuManager now writes directly to Inventory on save, so this route is no longer needed
router.post('/preMix/sync-from-menu', async (req, res, next) => {
  try {
    const sheet = await InventorySheet.findOne({ sheetKey: 'preMix' });
    if (!sheet) {
      return res.status(404).json({ message: 'Pre-Mix inventory sheet not found.' });
    }

    const columnsByKey = sheet.columns.reduce((acc, column) => {
      acc[column.key] = column;
      return acc;
    }, {});

    // Get all active pre-mix items from MenuManager
    const premixes = await Cocktail.find({
      category: 'premix',
      $or: [
        { status: { $exists: false } },
        { status: 'active' }
      ],
      isActive: { $ne: false }
    }).lean();

    console.log(`🔄 Syncing ${premixes.length} pre-mix items from MenuManager to inventory...`);

    let created = 0;
    let updated = 0;
    let skipped = 0;
    const errors = [];

    // Get all premix recipes for matching
    const allRecipes = await Recipe.find({ type: 'premix' }).lean();
    const recipeMap = new Map();
    allRecipes.forEach(recipe => {
      if (recipe.title) {
        recipeMap.set(recipe.title.toLowerCase(), recipe);
      }
    });

    for (const premix of premixes) {
      try {
        // Find matching recipe by name (case-insensitive)
        const recipe = recipeMap.get(premix.name?.toLowerCase());

        // Find existing inventory row by recipeId (if recipe exists) or by name
        let row = null;
        if (recipe) {
          row = sheet.rows.find((rowItem) => {
            const rowRecipeId = getRowRecipeId(rowItem);
            return rowRecipeId && String(rowRecipeId) === String(recipe._id);
          });
        }
        
        // If no row found by recipeId, try to find by name
        if (!row) {
          row = sheet.rows.find((rowItem) => {
            if (!rowItem.values) return false;
            const valuesMap = rowItem.values instanceof Map 
              ? rowItem.values 
              : new Map(Object.entries(rowItem.values || {}));
            const rowName = valuesMap.get('name');
            return rowName && rowName.toLowerCase() === premix.name?.toLowerCase();
          });
        }

        // Create new row if it doesn't exist
        if (!row) {
          sheet.rows.push({
            order: sheet.rows.length + 1,
            values: new Map()
          });
          row = sheet.rows[sheet.rows.length - 1];
          created++;
        } else {
          updated++;
        }

        const valuesMap = ensureRowValuesMap(row);

        if (recipe) {
          // Recipe exists - sync all fields
          const recipeItems = Array.isArray(recipe.items) ? recipe.items : [];
          
          // Get volume and cost from recipe totals
          let volumeOz = recipe.totals?.volumeOz;
          let costEach = recipe.totals?.costEach;
          
          // If totals not available, calculate from items
          if ((volumeOz === undefined || volumeOz === null || volumeOz === 0) && recipeItems.length > 0) {
            volumeOz = recipeItems.reduce((sum, item) => {
              const toOz = item.conversions?.toOz || 0;
              return sum + (Number.isFinite(toOz) ? toOz : 0);
            }, 0);
            volumeOz = Number(volumeOz.toFixed(3));
          }
          if ((costEach === undefined || costEach === null || costEach === 0) && recipeItems.length > 0) {
            costEach = recipeItems.reduce((sum, item) => {
              const extendedCost = item.extendedCost || 0;
              return sum + (Number.isFinite(extendedCost) ? extendedCost : 0);
            }, 0);
            costEach = Number(costEach.toFixed(2));
          }

          // Calculate ounceCost as costEach / volumeOz (cost per ounce)
          let ounceCost = null;
          if (volumeOz && volumeOz > 0 && costEach && costEach > 0) {
            ounceCost = Number((costEach / volumeOz).toFixed(2));
          }

          // Find all cocktails/mocktails that use this pre-mix item
          const preMixRowId = String(row._id);
          const cocktailsUsingThis = await Recipe.find({
            type: { $in: ['cocktail', 'mocktail'] },
            'items.ingredient.sheetKey': 'preMix',
            'items.ingredient.rowId': preMixRowId
          }).select('title type').lean();
          
          // Collect cocktail/mocktail names and apply title case
          const cocktailNames = cocktailsUsingThis
            .map(r => r.title)
            .filter(Boolean)
            .sort()
            .map(n => toTitleCase(n));
          
          const cocktailField = cocktailNames.length > 0 ? cocktailNames.join(', ') : '';

          // Update all fields - apply title case to all shared fields
          const updateValues = {
            name: toTitleCase(premix.name || 'Untitled'),
            type: toTitleCase(recipe.metadata?.type || ''),
            cocktail: cocktailField,
            ounceCost: ounceCost !== null ? ounceCost : 0
          };

          applyRowValues(row, updateValues, columnsByKey);
          valuesMap.set('recipeId', String(recipe._id));
          valuesMap.set('recipeType', 'premix');
          
          console.log(`✅ Synced "${premix.name}": recipe found, all fields updated`);
        } else {
          // No recipe - just add name - apply title case
          const updateValues = {
            name: toTitleCase(premix.name || 'Untitled')
          };
          applyRowValues(row, updateValues, columnsByKey);
          // Don't set recipeId if no recipe exists
          if (valuesMap.has('recipeId')) {
            valuesMap.delete('recipeId');
          }
          if (valuesMap.has('recipeType')) {
            valuesMap.delete('recipeType');
          }
          
          console.log(`⚠️  Synced "${premix.name}": no recipe found, name only`);
          skipped++;
        }

        // Apply formulas (in case there are any formula columns)
        applyFormulas(sheet, row);
      } catch (error) {
        const errorMsg = `Error syncing pre-mix "${premix.name}": ${error.message}`;
        console.error(`❌ ${errorMsg}`);
        errors.push(errorMsg);
      }
    }

    // Save the sheet
    sheet.markModified('rows');
    sheet.version += 1;
    await sheet.save();

    const summary = {
      total: premixes.length,
      created,
      updated,
      skipped,
      errors: errors.length
    };

    console.log(`✅ Sync complete:`, summary);
    if (errors.length > 0) {
      console.error('Errors:', errors);
    }

    res.json({
      message: 'Pre-Mix synced from MenuManager',
      summary,
      errors: errors.length > 0 ? errors : undefined
    });
  } catch (error) {
    console.error('Error syncing pre-mix from MenuManager:', error);
    next(error);
  }
});

// DEPRECATED: Sync wine from MenuManager - must be before /:sheetKey route
// NOTE: MenuManager now writes directly to Inventory on save, so this route is no longer needed
router.post('/wine/sync-from-menu', async (req, res, next) => {
  try {
    const sheet = await InventorySheet.findOne({ sheetKey: 'wine' });
    if (!sheet) {
      return res.status(404).json({ message: 'Wine inventory sheet not found.' });
    }

    const columnsByKey = sheet.columns.reduce((acc, column) => {
      acc[column.key] = column;
      return acc;
    }, {});

    // Get all active wine items from MenuManager
    const wines = await Cocktail.find({
      category: 'wine',
      $or: [
        { status: { $exists: false } },
        { status: 'active' }
      ],
      isActive: { $ne: false }
    }).lean();

    console.log(`🔄 Syncing ${wines.length} wine items from MenuManager to inventory...`);

    let created = 0;
    let updated = 0;
    const errors = [];

    for (const wine of wines) {
      try {
        // Find existing inventory row by name (case-insensitive)
        let row = sheet.rows.find((rowItem) => {
          if (!rowItem.values) return false;
          const valuesMap = rowItem.values instanceof Map 
            ? rowItem.values 
            : new Map(Object.entries(rowItem.values || {}));
          const rowName = valuesMap.get('name');
          return rowName && rowName.toLowerCase() === wine.name?.toLowerCase();
        });

        // Create new row if it doesn't exist
        if (!row) {
          sheet.rows.push({
            order: sheet.rows.length + 1,
            values: new Map()
          });
          row = sheet.rows[sheet.rows.length - 1];
          created++;
        } else {
          updated++;
        }

        const valuesMap = ensureRowValuesMap(row);

        // Merge MenuManager data with existing inventory data
        // Only update descriptive fields, preserve pricing/size fields from inventory
        const existingValues = row.values instanceof Map 
          ? Object.fromEntries(row.values) 
          : (row.values || {});
        
        const updateValues = {
          name: toTitleCase(wine.name || existingValues.name || 'Untitled'),
          style: toTitleCase(wine.ingredients || existingValues.style || ''),
          hue: toTitleCase(wine.globalIngredients || existingValues.hue || ''),
          region: Array.isArray(wine.regions) && wine.regions.length > 0
            ? wine.regions.map(r => toTitleCase(String(r).trim())).join(', ')
            : (existingValues.region ? existingValues.region.split(',').map(r => toTitleCase(r.trim())).join(', ') : ''),
          notes: toTitleCase(wine.concept || existingValues.notes || ''),
          distributor: toTitleCase(wine.garnish || existingValues.distributor || ''),
          // Don't sync itemNumber from MenuManager - preserve existing inventory value
          itemNumber: Number.isFinite(existingValues.itemNumber) ? existingValues.itemNumber : null
          // Don't update: sizeMl, unitCost, ounceCost, glassCost (inventory-only fields)
        };

        applyRowValues(row, updateValues, columnsByKey);
        valuesMap.set('menuManagerId', String(wine._id));
        valuesMap.set('menuManagerCategory', 'wine');
        
        // Apply formulas (in case there are any formula columns)
        applyFormulas(sheet, row);
      } catch (error) {
        const errorMsg = `Error syncing wine "${wine.name}": ${error.message}`;
        console.error(`❌ ${errorMsg}`);
        errors.push(errorMsg);
      }
    }

    // Save the sheet
    sheet.markModified('rows');
    sheet.version += 1;
    await sheet.save();

    const summary = {
      total: wines.length,
      created,
      updated,
      errors: errors.length
    };

    console.log(`✅ Sync complete:`, summary);
    if (errors.length > 0) {
      console.error('Errors:', errors);
    }

    res.json({
      message: 'Wine synced from MenuManager',
      summary,
      errors: errors.length > 0 ? errors : undefined
    });
  } catch (error) {
    console.error('Error syncing wine from MenuManager:', error);
    next(error);
  }
});

// DEPRECATED: Sync beer from MenuManager - must be before /:sheetKey route
// NOTE: MenuManager now writes directly to Inventory on save, so this route is no longer needed
router.post('/beer/sync-from-menu', async (req, res, next) => {
  try {
    const sheet = await InventorySheet.findOne({ sheetKey: 'beer' });
    if (!sheet) {
      return res.status(404).json({ message: 'Beer inventory sheet not found.' });
    }

    const columnsByKey = sheet.columns.reduce((acc, column) => {
      acc[column.key] = column;
      return acc;
    }, {});

    // Get all active beer items from MenuManager
    const beers = await Cocktail.find({
      category: 'beer',
      $or: [
        { status: { $exists: false } },
        { status: 'active' }
      ],
      isActive: { $ne: false }
    }).lean();

    console.log(`🔄 Syncing ${beers.length} beer items from MenuManager to inventory...`);

    let created = 0;
    let updated = 0;
    const errors = [];

    for (const beer of beers) {
      try {
        // Find existing inventory row by name (case-insensitive)
        let row = sheet.rows.find((rowItem) => {
          if (!rowItem.values) return false;
          const valuesMap = rowItem.values instanceof Map 
            ? rowItem.values 
            : new Map(Object.entries(rowItem.values || {}));
          const rowName = valuesMap.get('name');
          return rowName && rowName.toLowerCase() === beer.name?.toLowerCase();
        });

        // Create new row if it doesn't exist
        if (!row) {
          sheet.rows.push({
            order: sheet.rows.length + 1,
            values: new Map()
          });
          row = sheet.rows[sheet.rows.length - 1];
          created++;
        } else {
          updated++;
        }

        const valuesMap = ensureRowValuesMap(row);

        // Merge MenuManager data with existing inventory data
        const existingValues = row.values instanceof Map 
          ? Object.fromEntries(row.values) 
          : (row.values || {});
        
        const updateValues = {
          name: toTitleCase(beer.name || existingValues.name || 'Untitled'),
          type: toTitleCase(beer.ingredients || existingValues.type || ''),
          region: Array.isArray(beer.regions) && beer.regions.length > 0
            ? beer.regions.map(r => toTitleCase(String(r).trim())).join(', ')
            : (existingValues.region ? existingValues.region.split(',').map(r => toTitleCase(r.trim())).join(', ') : ''),
          notes: toTitleCase(beer.concept || existingValues.notes || ''),
          // Don't sync itemNumber from MenuManager - preserve existing inventory value
          itemNumber: Number.isFinite(existingValues.itemNumber) ? existingValues.itemNumber : null
          // Don't update: packCost, numUnits, unitCost (inventory-only fields)
        };

        applyRowValues(row, updateValues, columnsByKey);
        valuesMap.set('menuManagerId', String(beer._id));
        valuesMap.set('menuManagerCategory', 'beer');
        
        // Apply formulas (in case there are any formula columns)
        applyFormulas(sheet, row);
      } catch (error) {
        const errorMsg = `Error syncing beer "${beer.name}": ${error.message}`;
        console.error(`❌ ${errorMsg}`);
        errors.push(errorMsg);
      }
    }

    // Save the sheet
    sheet.markModified('rows');
    sheet.version += 1;
    await sheet.save();

    const summary = {
      total: beers.length,
      created,
      updated,
      errors: errors.length
    };

    console.log(`✅ Sync complete:`, summary);
    if (errors.length > 0) {
      console.error('Errors:', errors);
    }

    res.json({
      message: 'Beer synced from MenuManager',
      summary,
      errors: errors.length > 0 ? errors : undefined
    });
  } catch (error) {
    console.error('Error syncing beer from MenuManager:', error);
    next(error);
  }
});

// DEPRECATED: Sync spirits from MenuManager - must be before /:sheetKey route
// NOTE: MenuManager now writes directly to Inventory on save, so this route is no longer needed
router.post('/spirits/sync-from-menu', async (req, res, next) => {
  try {
    const sheet = await InventorySheet.findOne({ sheetKey: 'spirits' });
    if (!sheet) {
      return res.status(404).json({ message: 'Spirits inventory sheet not found.' });
    }

    const columnsByKey = sheet.columns.reduce((acc, column) => {
      acc[column.key] = column;
      return acc;
    }, {});

    // Get all active spirits items from MenuManager
    const spirits = await Cocktail.find({
      category: 'spirits',
      $or: [
        { status: { $exists: false } },
        { status: 'active' }
      ],
      isActive: { $ne: false }
    }).lean();

    console.log(`🔄 Syncing ${spirits.length} spirits items from MenuManager to inventory...`);

    let created = 0;
    let updated = 0;
    const errors = [];

    for (const spirit of spirits) {
      try {
        // Find existing inventory row by name (case-insensitive)
        let row = sheet.rows.find((rowItem) => {
          if (!rowItem.values) return false;
          const valuesMap = rowItem.values instanceof Map 
            ? rowItem.values 
            : new Map(Object.entries(rowItem.values || {}));
          const rowName = valuesMap.get('name');
          return rowName && rowName.toLowerCase() === spirit.name?.toLowerCase();
        });

        // Create new row if it doesn't exist
        if (!row) {
          sheet.rows.push({
            order: sheet.rows.length + 1,
            values: new Map()
          });
          row = sheet.rows[sheet.rows.length - 1];
          created++;
        } else {
          updated++;
        }

        const valuesMap = ensureRowValuesMap(row);

        // Merge MenuManager data with existing inventory data
        const existingValues = row.values instanceof Map 
          ? Object.fromEntries(row.values) 
          : (row.values || {});
        
        const updateValues = {
          name: toTitleCase(spirit.name || existingValues.name || 'Untitled'),
          spirit: toTitleCase(spirit.ingredients || existingValues.spirit || ''),
          region: Array.isArray(spirit.regions) && spirit.regions.length > 0
            ? spirit.regions.map(r => toTitleCase(String(r).trim())).join(', ')
            : (existingValues.region ? existingValues.region.split(',').map(r => toTitleCase(r.trim())).join(', ') : ''),
          notes: toTitleCase(spirit.concept || existingValues.notes || ''),
          distributor: toTitleCase(spirit.garnish || existingValues.distributor || ''),
          // Don't sync itemNumber from MenuManager - preserve existing inventory value
          itemNumber: Number.isFinite(existingValues.itemNumber) ? existingValues.itemNumber : null
          // Don't update: sizeOz, unitCost, ounceCost (inventory-only fields)
        };

        applyRowValues(row, updateValues, columnsByKey);
        valuesMap.set('menuManagerId', String(spirit._id));
        valuesMap.set('menuManagerCategory', 'spirits');
        
        // Apply formulas (in case there are any formula columns)
        applyFormulas(sheet, row);
      } catch (error) {
        const errorMsg = `Error syncing spirit "${spirit.name}": ${error.message}`;
        console.error(`❌ ${errorMsg}`);
        errors.push(errorMsg);
      }
    }

    // Save the sheet
    sheet.markModified('rows');
    sheet.version += 1;
    await sheet.save();

    const summary = {
      total: spirits.length,
      created,
      updated,
      errors: errors.length
    };

    console.log(`✅ Sync complete:`, summary);
    if (errors.length > 0) {
      console.error('Errors:', errors);
    }

    res.json({
      message: 'Spirits synced from MenuManager',
      summary,
      errors: errors.length > 0 ? errors : undefined
    });
  } catch (error) {
    console.error('Error syncing spirits from MenuManager:', error);
    next(error);
  }
});

// Sync existing inventory items to MenuManager (bulk operation) - must be before /:sheetKey route
// This endpoint uses the centralized syncInventoryRowToMenuManager function for consistency
router.post('/wine/sync-to-menu', async (req, res, next) => {
  try {
    const sheet = await InventorySheet.findOne({ sheetKey: 'wine' });
    if (!sheet) {
      return res.status(404).json({ message: 'Wine inventory sheet not found.' });
    }

    const rows = sheet.rows.filter(r => !r.isDeleted);
    console.log(`🔄 Syncing ${rows.length} wine items from inventory to MenuManager...`);

    const errors = [];
    for (const row of rows) {
      try {
        await syncInventoryRowToMenuManager('wine', row);
      } catch (error) {
        const valuesMap = row.values instanceof Map ? row.values : new Map(Object.entries(row.values || {}));
        const errorMsg = `Error syncing wine "${valuesMap.get('name')}": ${error.message}`;
        console.error(`❌ ${errorMsg}`);
        errors.push(errorMsg);
      }
    }

    // Save the sheet to persist menuManagerId values
    sheet.markModified('rows');
    sheet.version += 1;
    await sheet.save();

    const summary = {
      total: rows.length,
      errors: errors.length
    };

    console.log(`✅ Sync complete:`, summary);
    if (errors.length > 0) {
      console.error('Errors:', errors);
    }

    res.json({
      message: 'Wine synced from inventory to MenuManager',
      summary,
      errors: errors.length > 0 ? errors : undefined
    });
  } catch (error) {
    console.error('Error syncing wine from inventory to MenuManager:', error);
    next(error);
  }
});

// Sync existing inventory items to MenuManager - must be before /:sheetKey route
// Sync existing inventory items to MenuManager (bulk operation) - must be before /:sheetKey route
// This endpoint uses the centralized syncInventoryRowToMenuManager function for consistency
router.post('/beer/sync-to-menu', async (req, res, next) => {
  try {
    const sheet = await InventorySheet.findOne({ sheetKey: 'beer' });
    if (!sheet) {
      return res.status(404).json({ message: 'Beer inventory sheet not found.' });
    }

    const rows = sheet.rows.filter(r => !r.isDeleted);
    console.log(`🔄 Syncing ${rows.length} beer items from inventory to MenuManager...`);

    const errors = [];
    for (const row of rows) {
      try {
        await syncInventoryRowToMenuManager('beer', row);
      } catch (error) {
        const valuesMap = row.values instanceof Map ? row.values : new Map(Object.entries(row.values || {}));
        const errorMsg = `Error syncing beer "${valuesMap.get('name')}": ${error.message}`;
        console.error(`❌ ${errorMsg}`);
        errors.push(errorMsg);
      }
    }

    // Save the sheet to persist menuManagerId values
    sheet.markModified('rows');
    sheet.version += 1;
    await sheet.save();

    const summary = {
      total: rows.length,
      errors: errors.length
    };

    console.log(`✅ Sync complete:`, summary);
    if (errors.length > 0) {
      console.error('Errors:', errors);
    }

    res.json({
      message: 'Beer synced from inventory to MenuManager',
      summary,
      errors: errors.length > 0 ? errors : undefined
    });
  } catch (error) {
    console.error('Error syncing beer from inventory to MenuManager:', error);
    next(error);
  }
});

// Sync existing inventory items to MenuManager - must be before /:sheetKey route
// Sync existing inventory items to MenuManager (bulk operation) - must be before /:sheetKey route
// This endpoint uses the centralized syncInventoryRowToMenuManager function for consistency
router.post('/spirits/sync-to-menu', async (req, res, next) => {
  try {
    const sheet = await InventorySheet.findOne({ sheetKey: 'spirits' });
    if (!sheet) {
      return res.status(404).json({ message: 'Spirits inventory sheet not found.' });
    }

    const rows = sheet.rows.filter(r => !r.isDeleted);
    console.log(`🔄 Syncing ${rows.length} spirits items from inventory to MenuManager...`);

    const errors = [];
    for (const row of rows) {
      try {
        await syncInventoryRowToMenuManager('spirits', row);
      } catch (error) {
        const valuesMap = row.values instanceof Map ? row.values : new Map(Object.entries(row.values || {}));
        const errorMsg = `Error syncing spirits "${valuesMap.get('name')}": ${error.message}`;
        console.error(`❌ ${errorMsg}`);
        errors.push(errorMsg);
      }
    }

    // Save the sheet to persist menuManagerId values
    sheet.markModified('rows');
    sheet.version += 1;
    await sheet.save();

    const summary = {
      total: rows.length,
      errors: errors.length
    };

    console.log(`✅ Sync complete:`, summary);
    if (errors.length > 0) {
      console.error('Errors:', errors);
    }

    res.json({
      message: 'Spirits synced from inventory to MenuManager',
      summary,
      errors: errors.length > 0 ? errors : undefined
    });
  } catch (error) {
    console.error('Error syncing spirits from inventory to MenuManager:', error);
    next(error);
  }
});

// Helper function to get recipeId from inventory row
const getRowRecipeId = (row) => {
  if (!row?.values) {
    return null;
  }
  if (row.values instanceof Map) {
    return row.values.get('recipeId');
  }
  return row.values.recipeId;
};

// Helper function to ensure row values is a Map
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

// Get the maximum item number across all inventory sheets
// IMPORTANT: Only counts NON-DELETED rows (isDeleted = false)
async function getMaxItemNumberAcrossAllSheets() {
  const sheetKeys = ['cocktails', 'mocktails', 'wine', 'spirits', 'beer', 'preMix', 'dryStock'];
  let maxNumber = 0;
  
  for (const sheetKey of sheetKeys) {
    const sheet = await InventorySheet.findOne({ sheetKey });
    if (!sheet || !sheet.rows) continue;
    
    // Only check rows that are NOT deleted
    sheet.rows.forEach((row) => {
      if (row.isDeleted) return; // Skip deleted rows
      
      const valuesMap = ensureRowValuesMap(row);
      const itemNumber = valuesMap.get('itemNumber');
      const num = Number(itemNumber);
      if (Number.isFinite(num) && num > 0 && num > maxNumber) {
        maxNumber = num;
      }
    });
  }
  
  return maxNumber;
}

// Ensure every sheet has an Item# column and backfill values (preferring linked cocktail numbers)
async function ensureItemNumberColumnsAndValues() {
  const categoryMap = {
    cocktails: 'cocktails',
    mocktails: 'mocktails',
    wine: 'wine',
    spirits: 'spirits',
    beer: 'beer',
    preMix: 'premix',
    dryStock: null
  };

  const sheetKeys = ['cocktails', 'mocktails', 'wine', 'spirits', 'beer', 'preMix', 'dryStock'];
  for (const sheetKey of sheetKeys) {
    const sheet = await InventorySheet.findOne({ sheetKey });
    if (!sheet) continue;

    const columns = sheet.columns || [];
    const hasMenuIndex = columns.findIndex((col) => col.key === 'menu');
    const itemNumberIndex = columns.findIndex((col) => col.key === 'itemNumber');
    const itemNumberCol = {
      key: 'itemNumber',
      label: 'Item#',
      type: 'number',
      precision: 0
    };

    let columnsChanged = false;
    if (itemNumberIndex === -1) {
      if (hasMenuIndex >= 0) {
        columns.splice(hasMenuIndex, 0, itemNumberCol);
      } else {
        columns.push(itemNumberCol);
      }
      columnsChanged = true;
    } else {
      const existing = columns[itemNumberIndex];
      if (existing.label !== 'Item#' || existing.type !== 'number' || existing.precision !== 0) {
        existing.label = 'Item#';
        existing.type = 'number';
        existing.precision = 0;
        columnsChanged = true;
      }
      if (hasMenuIndex >= 0 && itemNumberIndex > hasMenuIndex) {
        columns.splice(itemNumberIndex, 1);
        columns.splice(hasMenuIndex, 0, existing);
        columnsChanged = true;
      }
    }

    // Get global max item number across all sheets first
    const globalMaxNumber = await getMaxItemNumberAcrossAllSheets();
    
    // Track item numbers to detect duplicates within this sheet
    const itemNumberCounts = new Map();
    
    // First pass: count occurrences of each item number in this sheet
    sheet.rows.forEach((row) => {
      const valuesMap = ensureRowValuesMap(row);
      const existing = valuesMap.get('itemNumber');
      const num = Number(existing);
      if (Number.isFinite(num) && num > 0) {
        itemNumberCounts.set(num, (itemNumberCounts.get(num) || 0) + 1);
      }
    });

    // Track used numbers across all sheets (for duplicate detection)
    const usedNumbers = new Set();
    // Get all item numbers from all sheets to avoid duplicates
    const allSheetKeys = ['cocktails', 'mocktails', 'wine', 'spirits', 'beer', 'preMix', 'dryStock'];
    for (const key of allSheetKeys) {
      if (key === sheetKey) continue; // Skip current sheet, we'll process it separately
      const otherSheet = await InventorySheet.findOne({ sheetKey: key });
      if (otherSheet && otherSheet.rows) {
        otherSheet.rows.forEach((row) => {
          const valuesMap = ensureRowValuesMap(row);
          const itemNum = valuesMap.get('itemNumber');
          const num = Number(itemNum);
          if (Number.isFinite(num) && num > 0) {
            usedNumbers.add(num);
        }
      });
      }
    }

    let maxNumber = globalMaxNumber;
    const reserveNext = () => {
      maxNumber += 1;
      while (usedNumbers.has(maxNumber)) {
        maxNumber += 1;
      }
      usedNumbers.add(maxNumber);
      return maxNumber;
    };

    let rowsChanged = false;
    sheet.rows.forEach((row) => {
      const valuesMap = ensureRowValuesMap(row);
      const existing = valuesMap.get('itemNumber');
      const num = Number(existing);
      
      // If itemNumber exists and is valid (> 0), ALWAYS keep it - don't reassign
      // This respects manual assignments and makes inventory the source of truth
      if (Number.isFinite(num) && num > 0) {
        // Valid number exists - keep it, don't change it
        return;
      }

      // Only assign new itemNumber if missing or invalid (<= 0)
      // Inventory is the source of truth - don't sync from MenuManager
      if (!Number.isFinite(num) || num <= 0) {
          const next = reserveNext();
          valuesMap.set('itemNumber', next);
        itemNumberCounts.set(next, (itemNumberCounts.get(next) || 0) + 1);
        rowsChanged = true;
      }
    });

    if (columnsChanged) {
      sheet.columns = columns;
      sheet.version += 1;
    }
    if (rowsChanged) {
      sheet.markModified('rows');
      sheet.version += 1;
    }
    if (columnsChanged || rowsChanged) {
      await sheet.save();
      console.log(`✅ Ensured Item# column/values for ${sheetKey}`);
    }
  }
}

// Helper function to capitalize first letter of each word
// Format text to title case (first letter capital, rest lowercase)
// Handles multi-word strings by capitalizing first letter of each word
const capitalizeWords = (str) => {
  if (!str || typeof str !== 'string') return str;
  return toTitleCase(str);
};

const capitalizeWordsOld = (str) => {
  if (!str || typeof str !== 'string') return str;
  return str.trim().split(/\s+/).map(word => {
    if (word.length === 0) return word;
    return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
  }).join(' ');
};

// Helper function to sync inventory row to MenuManager (read-only sync - only updates shared fields)
// This ensures Cocktail entries exist for display in MenuManager, but does NOT overwrite MenuManager-only fields
const syncInventoryRowToMenuManager = async (sheetKey, row) => {
  // Map sheetKey to MenuManager category
  const categoryMap = {
    'wine': 'wine',
    'beer': 'beer',
    'spirits': 'spirits',
    'cocktails': 'cocktails',
    'mocktails': 'mocktails',
    'preMix': 'premix'
  };
  
  const category = categoryMap[sheetKey];
  if (!category) {
    return; // Skip unsupported categories
  }

  const Cocktail = require('../models/Cocktail');
  // Ensure row.values is a Map - if not, convert and assign back
  let valuesMap = row.values instanceof Map 
    ? row.values 
    : new Map(Object.entries(row.values || {}));
  
  // If we created a new Map, assign it back to row.values
  if (!(row.values instanceof Map)) {
    row.values = valuesMap;
  }
  
  const name = valuesMap.get('name');
  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    return; // Skip rows without names
  }

  try {
    // Find existing MenuManager item by name or by menuManagerId
    const menuManagerId = valuesMap.get('menuManagerId');
    let menuItem = null;
    
    if (menuManagerId) {
      menuItem = await Cocktail.findById(menuManagerId);
    }
    
    if (!menuItem) {
      // Try to find by name (case-insensitive)
      const nameLower = name.trim().toLowerCase();
      menuItem = await Cocktail.findOne({
        $expr: {
          $eq: [{ $toLower: { $trim: { input: '$name' } } }, nameLower]
        },
        category: category
      });
    }

    // Get itemNumber from inventory (inventory is source of truth)
    const inventoryItemNumber = valuesMap.get('itemNumber');

    // Prepare update data based on category - apply title case to all text fields
    const updateData = {
      name: toTitleCase(name),
      category: category,
      isActive: true,
      status: 'active'
    };
    
    // Sync itemNumber FROM inventory TO MenuManager
    if (Number.isFinite(inventoryItemNumber) && inventoryItemNumber > 0) {
      updateData.itemNumber = inventoryItemNumber;
    }

    // Helpers to avoid overwriting with empty strings
    const setIfPresent = (targetKey, rawValue, titleCase = true) => {
      if (rawValue === undefined || rawValue === null) return;
      const isString = typeof rawValue === 'string';
      const trimmed = isString ? rawValue.trim() : rawValue;
      const valueToSet =
        titleCase && isString && trimmed !== ''
          ? toTitleCase(trimmed)
          : (isString ? trimmed : rawValue);
      updateData[targetKey] = valueToSet;
    };

    // Whitelist sync: only fields that match MenuManager UI labels and Inventory column titles
    // Name is already handled above; here we sync Ingredients, Concept, Page, Garnish, and Regions.
    setIfPresent('ingredients', valuesMap.get('ingredients')); // hidden column only
    setIfPresent('concept', valuesMap.get('concept'));
    setIfPresent('page', valuesMap.get('page'), false);
    setIfPresent('garnish', valuesMap.get('garnish'));        // visible column

    // Regions (countries) from either regions array or region string
    const regionsArray = valuesMap.get('regions');
    if (Array.isArray(regionsArray) && regionsArray.length > 0) {
      updateData.regions = regionsArray.map(r => toTitleCase(String(r).trim())).filter(Boolean);
    } else {
      const region = valuesMap.get('region') || '';
      updateData.regions = region
        ? region.split(',').map(r => toTitleCase(r.trim())).filter(Boolean)
        : [];
    }

    if (menuItem) {
      // Update existing item - only update shared fields, preserve MenuManager-only fields
      // Preserve: concept, videoFile, mapSnapshotFile, narrative, featured
      const preservedFields = {
        concept: menuItem.concept,
        videoFile: menuItem.videoFile,
        mapSnapshotFile: menuItem.mapSnapshotFile,
        narrative: menuItem.narrative,
        featured: menuItem.featured,
        itemId: menuItem.itemId || (updateData.itemNumber ? `item${updateData.itemNumber}` : menuItem.itemId)
      };
      
      Object.assign(menuItem, updateData, preservedFields);
      await menuItem.save();
      // Update the inventory row to store the menuManagerId
      valuesMap.set('menuManagerId', String(menuItem._id));
      valuesMap.set('menuManagerCategory', category);
      console.log(`✅ Updated existing ${category} in MenuManager: ${menuItem.name} (ID: ${menuItem._id})`);
    } else {
      // Create new item in MenuManager
      const maxOrder = await Cocktail.findOne({ category: category })
        .sort({ order: -1 })
        .select('order')
        .lean();
      const nextOrder = maxOrder ? (maxOrder.order || 0) + 1 : 0;

      const newMenuItem = new Cocktail({
        ...updateData,
        order: nextOrder,
        itemId: `${category}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
      });
      await newMenuItem.save();
      // Update the inventory row to store the menuManagerId
      valuesMap.set('menuManagerId', String(newMenuItem._id));
      valuesMap.set('menuManagerCategory', category);
      console.log(`✅ Created new ${category} in MenuManager: ${newMenuItem.name} (ID: ${newMenuItem._id})`);
    }
    
    // Mark row as modified to ensure menuManagerId is saved
    // The calling function should save the sheet after this
    row.markModified('values');
  } catch (error) {
    console.error(`❌ Error syncing ${sheetKey} inventory row "${name}" to MenuManager:`, error);
    // Don't throw - allow inventory save to continue even if MenuManager sync fails
  }
};

router.param('sheetKey', loadSheet);

// Get inventory row by name (for MenuManager lookup)
router.get('/:sheetKey/by-name/:name', async (req, res, next) => {
  try {
    const sheet = req.sheet;
    const searchName = decodeURIComponent(req.params.name).trim().toLowerCase();
    
    if (!sheet || !sheet.rows) {
      return res.json({ row: null });
    }

    const matchingRow = sheet.rows.find((row) => {
      if (row.isDeleted) return false;
      const valuesMap = ensureRowValuesMap(row);
      const rowName = valuesMap.get('name');
      return rowName && rowName.trim().toLowerCase() === searchName;
    });

    if (matchingRow) {
      const rowObj = matchingRow.toObject ? matchingRow.toObject() : { ...matchingRow };
      res.json({
        row: {
          ...rowObj,
          values: mapValuesToPlain(matchingRow.values)
        }
      });
    } else {
      res.json({ row: null });
    }
  } catch (error) {
    next(error);
  }
});

// Get inventory row by itemNumber (for MenuManager lookup)
router.get('/:sheetKey/by-item-number/:itemNumber', async (req, res, next) => {
  try {
    const sheet = req.sheet;
    const itemNumber = Number(req.params.itemNumber);
    
    if (!sheet || !sheet.rows || !Number.isFinite(itemNumber)) {
      return res.json({ row: null });
    }

    const matchingRow = sheet.rows.find((row) => {
      if (row.isDeleted) return false;
      const valuesMap = ensureRowValuesMap(row);
      const rowItemNumber = valuesMap.get('itemNumber');
      return Number.isFinite(Number(rowItemNumber)) && Number(rowItemNumber) === itemNumber;
    });

    if (matchingRow) {
      const rowObj = matchingRow.toObject ? matchingRow.toObject() : { ...matchingRow };
      res.json({
        row: {
          ...rowObj,
          values: mapValuesToPlain(matchingRow.values)
        }
      });
    } else {
      res.json({ row: null });
    }
  } catch (error) {
    next(error);
  }
});

// Get all inventory rows formatted for MenuManager (for bulk loading)
router.get('/:sheetKey/for-menu', async (req, res, next) => {
  try {
    const datasets = await fetchDatasets(req.datasetIds);
    let sheet = req.sheet;
    
    // Format sheet and filter out deleted rows
    const formattedSheet = formatSheet(sheet);
    
    res.json({
      rows: formattedSheet.rows || [],
      datasets
    });
  } catch (error) {
    next(error);
  }
});

router.get('/:sheetKey', async (req, res, next) => {
  const Recipe = require('../models/Recipe');
  try {
    const datasets = await fetchDatasets(req.datasetIds);
    let sheet = req.sheet;
    
    // For cocktails and mocktails, filter to only show rows with valid recipes
    let formattedSheet;
    if (req.params.sheetKey === 'cocktails' || req.params.sheetKey === 'mocktails') {
      try {
        const rows = Array.from(sheet.rows || []);
        const validRecipeIds = new Set();
        
        // Collect all recipeIds from rows
        const recipeIds = rows
          .map((row) => {
            if (!row?.values) return null;
            const valuesMap = row.values instanceof Map ? row.values : new Map(Object.entries(row.values || {}));
            const recipeId = valuesMap.get('recipeId');
            return recipeId && typeof recipeId === 'string' && recipeId.trim().length > 0 ? recipeId.trim() : null;
          })
          .filter(Boolean);
        
        // Verify which recipeIds actually exist in the database
        if (recipeIds.length > 0) {
          const existingRecipes = await Recipe.find({ 
            _id: { $in: recipeIds },
            type: req.params.sheetKey === 'cocktails' ? 'cocktail' : 'mocktail'
          }).select('_id').lean();
          
          existingRecipes.forEach((recipe) => {
            validRecipeIds.add(String(recipe._id));
          });
        }
        
        // Create a filtered rows array
        const filteredRows = rows.filter((row) => {
          if (!row?.values) return false;
          const valuesMap = row.values instanceof Map ? row.values : new Map(Object.entries(row.values || {}));
          const recipeId = valuesMap.get('recipeId');
          const name = valuesMap.get('name');
          
          // If row has a recipeId, it must be valid
          if (recipeId && typeof recipeId === 'string' && recipeId.trim().length > 0) {
            return validRecipeIds.has(recipeId.trim());
          }
          
          // If row has no recipeId but has a name, include it (synced from MenuManager)
          if (name && typeof name === 'string' && name.trim().length > 0) {
            return true;
          }
          
          // Otherwise exclude the row
          return false;
        });
        
        // Format the sheet first, then modify the rows
        formattedSheet = formatSheet(sheet);
        // Replace rows with filtered rows, properly formatted
        formattedSheet.rows = filteredRows.map((row) => {
          const rowObj = row.toObject ? row.toObject() : (typeof row === 'object' ? { ...row } : row);
          return {
            ...rowObj,
            values: mapValuesToPlain(row.values)
          };
        });
        
        console.log(`Filtered ${req.params.sheetKey} sheet: ${rows.length} rows -> ${filteredRows.length} rows (with valid recipes or synced from MenuManager)`);
      } catch (filterError) {
        console.error(`Error filtering ${req.params.sheetKey} sheet:`, filterError);
        // If filtering fails, use original formatted sheet
        formattedSheet = formatSheet(sheet);
      }
    } else {
      formattedSheet = formatSheet(sheet);
    }
    
    res.json({
      sheet: formattedSheet,
      datasets
    });
  } catch (error) {
    console.error('Error in GET /:sheetKey:', error);
    next(error);
  }
});

router.post('/:sheetKey/rows', async (req, res, next) => {
  try {
    const { values = {}, order, updatedBy } = req.body || {};
    const sheet = req.sheet;
    const row = {
      _id: new mongoose.Types.ObjectId(),
      order: Number.isFinite(order) ? order : sheet.rows.length + 1,
      values: new Map(),
      updatedBy
    };
    applyRowValues(row, values, req.sheetColumnsByKey);
    
    // Auto-assign item number if not provided
    const valuesMap = ensureRowValuesMap(row);
    const existingItemNumber = valuesMap.get('itemNumber');
    if (!existingItemNumber || !Number.isFinite(Number(existingItemNumber)) || Number(existingItemNumber) <= 0) {
      const maxNumber = await getMaxItemNumberAcrossAllSheets();
      const nextItemNumber = maxNumber + 1;
      valuesMap.set('itemNumber', nextItemNumber);
      console.log(`✅ Auto-assigned item number ${nextItemNumber} to new row in ${req.params.sheetKey}`);
    }
    
    applyFormulas(sheet, row);
    sheet.rows.push(row);
    sheet.version += 1;
    sheet.updatedBy = updatedBy || 'system';
    await sheet.save();
    
    // Sync to MenuManager for all categories (bidirectional sync)
    // Only sync if row has a name (new rows without names will sync later when name is added)
    try {
      // Get the actual Mongoose document from the array (after save)
      const savedRow = sheet.rows[sheet.rows.length - 1];
      
      // Ensure we can access the values - Mongoose may have serialized the Map
      let valuesMap;
      if (savedRow.values instanceof Map) {
        valuesMap = savedRow.values;
      } else if (savedRow.values && typeof savedRow.values === 'object') {
        valuesMap = new Map(Object.entries(savedRow.values));
        // Update the row to use the Map
        savedRow.values = valuesMap;
      } else {
        valuesMap = new Map();
        savedRow.values = valuesMap;
      }
      
      const rowName = valuesMap.get('name');
      
      // Only sync if row has a name
      if (rowName && typeof rowName === 'string' && rowName.trim().length > 0) {
        await syncInventoryRowToMenuManager(req.params.sheetKey, savedRow);
        // Mark the rows array as modified to ensure menuManagerId is persisted
        sheet.markModified('rows');
        sheet.version += 1; // Increment version to trigger frontend refresh
        await sheet.save();
        console.log(`✅ Inventory row for "${rowName}" synced to MenuManager and menuManagerId saved.`);
      } else {
        console.log(`ℹ️  New row added without name - will sync to MenuManager when name is provided.`);
      }
    } catch (syncError) {
      console.error('Error syncing inventory row to MenuManager:', syncError);
      console.error('Sync error stack:', syncError.stack);
      // Don't fail the request if sync fails
    }
    
    // Fetch datasets if available
    let datasets = [];
    try {
      if (req.datasetIds && Array.isArray(req.datasetIds)) {
        datasets = await fetchDatasets(req.datasetIds);
      }
    } catch (datasetError) {
      console.error('Error fetching datasets:', datasetError);
      // Don't fail the request if dataset fetch fails
    }
    
    res.status(201).json({
      sheet: formatSheet(sheet),
      datasets
    });
  } catch (error) {
    console.error('Error in POST /:sheetKey/rows:', error);
    console.error('Error stack:', error.stack);
    next(error);
  }
});

router.patch('/:sheetKey', async (req, res, next) => {
  try {
    const { version, rows = [], updatedBy } = req.body || {};
    const sheet = req.sheet;
    if (Number.isFinite(version) && version !== sheet.version) {
      return res.status(409).json({
        message: 'Sheet has changed, please refresh.',
        sheet: formatSheet(sheet)
      });
    }
    if (!Array.isArray(rows) || !rows.length) {
      return res.status(400).json({ message: 'rows payload is required.' });
    }

    const errors = [];
    for (const payload of rows) {
      if (!payload._id) {
        errors.push({ rowId: null, message: 'Row _id is required.' });
        continue;
      }
      const row = sheet.rows.id(payload._id);
      if (!row) {
        errors.push({ rowId: payload._id, message: 'Row not found.' });
        continue;
      }
      
      // All rows can be fully edited (removed recipe row read-only restriction for cocktails/mocktails/preMix)
      // For cocktails, mocktails, and preMix, even recipe-linked rows are editable for two-way sync
      if (payload.hasOwnProperty('order') && Number.isFinite(payload.order)) {
        row.order = payload.order;
      }
      if (payload.hasOwnProperty('isDeleted')) {
        const wasDeleted = row.isDeleted;
        const shouldDelete = Boolean(payload.isDeleted);
        
        // If row is being deleted, delete from MenuManager and files (all categories support bidirectional sync)
        if (shouldDelete && !wasDeleted && ['wine', 'beer', 'spirits', 'cocktails', 'mocktails', 'preMix'].includes(req.params.sheetKey)) {
          try {
            const valuesMap = row.values instanceof Map 
              ? row.values 
              : new Map(Object.entries(row.values || {}));
            const menuManagerId = valuesMap.get('menuManagerId');
            
            if (menuManagerId) {
              const menuItem = await Cocktail.findById(menuManagerId);
              if (menuItem) {
                // Delete associated files (video and map snapshots)
                const itemId = menuItem.itemId;
                if (itemId) {
                  console.log(`🗑️  Deleting all files for itemId: ${itemId}`);
                  deleteItemFiles(itemId);
                } else {
                  // Fallback: delete specific files if itemId is missing (legacy support)
                  console.log(`⚠️  No itemId found, deleting specific files: ${menuItem.videoFile}, ${menuItem.mapSnapshotFile}`);
                  if (menuItem.videoFile) {
                    const videoPath = path.join(videoDir, menuItem.videoFile);
                    try {
                      if (fs.existsSync(videoPath)) {
                        fs.unlinkSync(videoPath);
                      }
                    } catch (err) {
                      console.warn(`⚠️  Failed to delete video ${menuItem.videoFile}:`, err.message);
                    }
                  }
                  if (menuItem.mapSnapshotFile) {
                    const mapPath = path.join(videoDir, menuItem.mapSnapshotFile);
                    try {
                      if (fs.existsSync(mapPath)) {
                        fs.unlinkSync(mapPath);
                      }
                    } catch (err) {
                      console.warn(`⚠️  Failed to delete map snapshot ${menuItem.mapSnapshotFile}:`, err.message);
                    }
                  }
                }
                
                // Delete the MenuManager item
                await menuItem.deleteOne();
                console.log(`✅ Deleted ${req.params.sheetKey} from MenuManager (via PATCH): ${menuItem.name}`);
              }
            }
          } catch (syncError) {
            console.error('Error syncing deletion to MenuManager:', syncError);
            // Don't fail the request if sync fails
          }
        }
        
        // Hard delete: remove the row from the array instead of soft delete
        if (shouldDelete) {
          const rowIndex = sheet.rows.findIndex(r => r._id.toString() === payload._id);
          if (rowIndex !== -1) {
            sheet.rows.splice(rowIndex, 1);
          }
          // Skip further processing for deleted rows
          continue;
        }
      }
      applyRowValues(row, payload.values || {}, req.sheetColumnsByKey);
      applyFormulas(sheet, row);
      
      // Sync to MenuManager for all categories (read-only sync - only updates shared fields)
      // Only sync if row is not deleted
      if (!row.isDeleted) {
        try {
          await syncInventoryRowToMenuManager(req.params.sheetKey, row);
          // Mark rows array as modified to ensure menuManagerId is persisted
          sheet.markModified('rows');
        } catch (syncError) {
          console.error('Error syncing inventory row to MenuManager:', syncError);
          // Don't fail the request if sync fails
        }
      }
    }

    if (errors.length) {
      return res.status(400).json({ message: 'Some rows failed to update.', errors });
    }

    sheet.version += 1;
    sheet.updatedBy = updatedBy || 'system';
    await sheet.save();
    const datasets = await fetchDatasets(req.datasetIds);
    res.json({
      sheet: formatSheet(sheet),
      datasets
    });
  } catch (error) {
    next(error);
  }
});

router.delete('/:sheetKey/rows/:rowId', async (req, res, next) => {
  try {
    const { rowId } = req.params;
    const sheet = req.sheet;
    const row = sheet.rows.id(rowId);
    if (!row) {
      return res.status(404).json({ message: 'Row not found.' });
    }
    
    // If this is a synced category, delete from MenuManager as well (all categories support bidirectional sync)
    if (['wine', 'beer', 'spirits', 'cocktails', 'mocktails', 'preMix'].includes(req.params.sheetKey)) {
      try {
        const valuesMap = row.values instanceof Map 
          ? row.values 
          : new Map(Object.entries(row.values || {}));
        const menuManagerId = valuesMap.get('menuManagerId');
        
        if (menuManagerId) {
          const menuItem = await Cocktail.findById(menuManagerId);
          if (menuItem) {
            // Delete associated files (video and map snapshots)
            const itemId = menuItem.itemId;
            if (itemId) {
              console.log(`🗑️  Deleting all files for itemId: ${itemId}`);
              deleteItemFiles(itemId);
            } else {
              // Fallback: delete specific files if itemId is missing (legacy support)
              console.log(`⚠️  No itemId found, deleting specific files: ${menuItem.videoFile}, ${menuItem.mapSnapshotFile}`);
              if (menuItem.videoFile) {
                const videoPath = path.join(videoDir, menuItem.videoFile);
                try {
                  if (fs.existsSync(videoPath)) {
                    fs.unlinkSync(videoPath);
                  }
                } catch (err) {
                  console.warn(`⚠️  Failed to delete video ${menuItem.videoFile}:`, err.message);
                }
              }
              if (menuItem.mapSnapshotFile) {
                const mapPath = path.join(videoDir, menuItem.mapSnapshotFile);
                try {
                  if (fs.existsSync(mapPath)) {
                    fs.unlinkSync(mapPath);
                  }
                } catch (err) {
                  console.warn(`⚠️  Failed to delete map snapshot ${menuItem.mapSnapshotFile}:`, err.message);
                }
              }
            }
            
            // Delete the MenuManager item
            await menuItem.deleteOne();
            console.log(`✅ Deleted ${req.params.sheetKey} from MenuManager: ${menuItem.name}`);
          }
        }
      } catch (syncError) {
        console.error('Error syncing deletion to MenuManager:', syncError);
        // Don't fail the deletion if sync fails
      }
    }
    
    // Hard delete: remove the row from the array instead of soft delete
    const rowIndex = sheet.rows.findIndex(r => r._id.toString() === rowId);
    if (rowIndex !== -1) {
      sheet.rows.splice(rowIndex, 1);
    }
    sheet.version += 1;
    await sheet.save();
    const datasets = await fetchDatasets(req.datasetIds);
    res.json({
      sheet: formatSheet(sheet),
      datasets
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;

