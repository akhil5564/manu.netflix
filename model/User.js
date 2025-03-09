const mongoose = require('mongoose');

const dataSchema = new mongoose.Schema({
  customId: { type: Number, required: true, unique: true },
  selectedTime: { type: String, required: true },
  tableRows: [
    {
      letter: { type: String, required: true },
      num: { type: String, required: true },
      count: { type: String, required: true },
      amount: { type: String, required: true },
    },
  ],
  createdAt: { type: Date, default: Date.now },
});

const DataModel = mongoose.model('Data', dataSchema);

module.exports = DataModel;
