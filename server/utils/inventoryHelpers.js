const InventoryDataset = require('../models/InventoryDataset');

async function fetchDatasets(datasetIds = []) {
  if (!Array.isArray(datasetIds) || !datasetIds.length) {
    return [];
  }
  const uniqueIds = [...new Set(datasetIds)];
  return InventoryDataset.find({ _id: { $in: uniqueIds } }).lean();
}

function mapValuesToPlain(values) {
  if (!values) return {};
  if (values instanceof Map) {
    return Object.fromEntries(values.entries());
  }
  if (typeof values === 'object') {
    return { ...values };
  }
  return {};
}

function formatSheet(sheet) {
  const doc = sheet.toObject({ versionKey: false });
  if (Array.isArray(doc.rows)) {
    // Filter out deleted rows - they should not be visible in the UI
    doc.rows = doc.rows
      .filter((row) => !row.isDeleted)
      .map((row) => ({
      ...row,
      values: mapValuesToPlain(row.values)
    }));
  }
  if (doc.sheetKey === 'dryStock' && Array.isArray(doc.columns)) {
    doc.columns = doc.columns.map((column) =>
      column.key === 'gramCost' ? { ...column, label: '$ / oz' } : column
    );
  }
  return doc;
}

function applyRowValues(row, values = {}, columnsByKey = {}) {
  if (!row?.values || typeof values !== 'object') {
    return;
  }
  Object.entries(values).forEach(([key, value]) => {
    if (columnsByKey[key]) {
      row.values.set(key, value);
    }
  });
}

function applyFormulas(sheet, row) {
  if (!sheet?.columns?.length) return;
  let modified = false;

  sheet.columns.forEach((column) => {
    if (column.type !== 'formula' || !column.formula) return;

    const precision = Number.isInteger(column.precision) ? column.precision : 2;

    switch (column.formula.type) {
      case 'ratio': {
        const numerator = Number(row.values.get(column.formula.numerator));
        const denominator = Number(row.values.get(column.formula.denominator));
        if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) {
          row.values.set(column.key, null);
          break;
        }
        const result = numerator / denominator;
        row.values.set(column.key, Number(result.toFixed(precision)));
        modified = true;
        break;
      }
      case 'unitPerConvertedVolume': {
        const numerator = Number(row.values.get(column.formula.numerator));
        const volumeValue = Number(row.values.get(column.formula.volumeKey));
        const conversionFactor = Number(column.formula.conversionFactor);
        if (
          !Number.isFinite(numerator) ||
          !Number.isFinite(volumeValue) ||
          volumeValue <= 0 ||
          !Number.isFinite(conversionFactor) ||
          conversionFactor <= 0
        ) {
          row.values.set(column.key, null);
          break;
        }
        const convertedVolume = volumeValue / conversionFactor;
        if (convertedVolume === 0) {
          row.values.set(column.key, null);
          break;
        }
        const result = numerator / convertedVolume;
        row.values.set(column.key, Number(result.toFixed(precision)));
        modified = true;
        break;
      }
      case 'unitPerSizeUnit': {
        const numerator = Number(row.values.get(column.formula.numerator));
        const sizeValue = Number(row.values.get(column.formula.sizeKey));
        const unitSelection = (row.values.get(column.formula.unitKey) || '').toLowerCase();
        const gramFactor = Number(column.formula.gramFactor) || 28.3495;
        const milliliterFactor = Number(column.formula.milliliterFactor) || 29.5735;
        if (!Number.isFinite(numerator) || !Number.isFinite(sizeValue) || sizeValue <= 0) {
          row.values.set(column.key, null);
          break;
        }
        let ounces = null;
        if (unitSelection === 'g') {
          ounces = sizeValue / gramFactor;
        } else if (unitSelection === 'ml') {
          ounces = sizeValue / milliliterFactor;
        } else {
          ounces = sizeValue;
        }
        if (!Number.isFinite(ounces) || ounces <= 0) {
          row.values.set(column.key, null);
          break;
        }
        const result = numerator / ounces;
        row.values.set(column.key, Number(result.toFixed(precision)));
        modified = true;
        break;
      }
      case 'multiplier': {
        const sourceRaw = row.values.get(column.formula.sourceKey);
        if (sourceRaw === null || sourceRaw === undefined) {
          row.values.set(column.key, null);
          break;
        }
        const sourceValue = Number(sourceRaw);
        const factor = Number(column.formula.factor);
        if (!Number.isFinite(sourceValue) || !Number.isFinite(factor)) {
          row.values.set(column.key, null);
          break;
        }
        const result = sourceValue * factor;
        row.values.set(column.key, Number(result.toFixed(precision)));
        modified = true;
        break;
      }
      default:
        row.values.set(column.key, null);
        modified = true;
    }
  });

  if (modified && typeof row.markModified === 'function') {
    row.markModified('values');
  }
}

module.exports = {
  fetchDatasets,
  formatSheet,
  applyRowValues,
  applyFormulas,
  mapValuesToPlain
};

