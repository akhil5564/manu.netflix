const mongoose = require('mongoose');

const dataSchema = new mongoose.Schema({
  customId: { type: Number, required: true },
  selectedTime: { type: String, required: true },
  username: { type: String, required: true },
  tableRows: [
    {
      letter: { type: String, required: true },
      num: { type: String, required: true },
      count: { type: Number, required: true }, // Changed to Number for numeric data
      amount: { type: Number, required: true }, // Changed to Number for numeric data
    },
  ],
  createdAt: { type: Date, default: Date.now },
});

// Add an index on `username` for fast querying
dataSchema.index({ username: 1 });

const DataModel = mongoose.model('Data', dataSchema);

module.exports = DataModel;
