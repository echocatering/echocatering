const mongoose = require('mongoose');

const ColumnSchema = new mongoose.Schema({
  key: { type: String, required: true },
  label: { type: String, required: true },
  type: { 
    type: String, 
    enum: ['text', 'number', 'currency', 'dropdown', 'formula'],
    default: 'text'
  },
  datasetId: { type: String },
  unit: { type: String },
  precision: { type: Number, default: 2 },
  required: { type: Boolean, default: false },
  formula: { type: mongoose.Schema.Types.Mixed },
  helperText: { type: String }
}, { _id: false });

const RowSchema = new mongoose.Schema({
  order: { type: Number, default: 0 },
  values: {
    type: Map,
    of: mongoose.Schema.Types.Mixed,
    default: {}
  },
  isDeleted: { type: Boolean, default: false }
}, {
  timestamps: true
});

const InventorySheetSchema = new mongoose.Schema({
  sheetKey: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  description: { type: String },
  settings: {
    menuNavEnabled: { type: Boolean, default: false }
  },
  columns: { type: [ColumnSchema], default: [] },
  rows: { type: [RowSchema], default: [] },
  version: { type: Number, default: 1 },
  updatedBy: { type: String }
}, {
  timestamps: true
});

module.exports = mongoose.model('InventorySheet', InventorySheetSchema);

