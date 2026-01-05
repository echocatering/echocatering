const mongoose = require('mongoose');

const DatasetValueSchema = new mongoose.Schema({
  value: { type: String, required: true },
  label: { type: String, required: true },
  isDefault: { type: Boolean, default: false }
}, { _id: false });

const LinkedColumnSchema = new mongoose.Schema({
  sheetKey: { type: String, required: true },
  columnKey: { type: String, required: true }
}, { _id: false });

const InventoryDatasetSchema = new mongoose.Schema({
  _id: { type: String, required: true },
  label: { type: String, required: true },
  description: { type: String },
  values: { type: [DatasetValueSchema], default: [] },
  linkedColumns: { type: [LinkedColumnSchema], default: [] },
  updatedBy: { type: String }
}, {
  timestamps: true,
  versionKey: false
});

module.exports = mongoose.model('InventoryDataset', InventoryDatasetSchema);

