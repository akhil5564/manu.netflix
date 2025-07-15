const mongoose = require('mongoose');

const counterSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
  currentId: { type: Number, required: true, default: 40000 },  // Start from 4000
});

const Counter = mongoose.model('Counter', counterSchema);

module.exports = Counter;
