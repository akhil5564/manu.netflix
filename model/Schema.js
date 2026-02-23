const mongoose = require("mongoose");

// Row inside a group
const rowSchema = new mongoose.Schema({
  scheme: String,
  pos: Number,
  count: Number,
  amount: Number,
  super: Number
});

// Group inside a draw
const groupSchema = new mongoose.Schema({
  group: String,
  rows: [rowSchema]
});

// Draw inside a tab
const drawSchema = new mongoose.Schema({
  drawName: { type: String, required: true }, // e.g., "DEAR 1 PM"
  schemes: [groupSchema] // groups & rows
});

// Active tab containing multiple draws
const drawSchemeSchema = new mongoose.Schema(
  {
    activeTab: { type: Number, required: true }, // 1, 2, 3...
    draws: [drawSchema] // multiple draws per tab
  },
  { timestamps: true }
);

module.exports = mongoose.model("DrawScheme", drawSchemeSchema);
