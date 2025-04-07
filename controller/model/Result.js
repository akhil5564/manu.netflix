const mongoose = require('mongoose');

// Define your schema
const resultSchema = new mongoose.Schema({
  ticket: { type: String, required: true },
  result: { type: String, required: true, match: /^[0-9]{3}$/ }, // Validate 3-digit result
  date: { type: String, required: true }, // Store the date as a string
  time: { type: String, required: true }, // Store the time slot
}, { timestamps: true }); // Optionally, you can use timestamps

// Check if the model is already defined to prevent overwriting
let Result;

if (mongoose.models.Result) {
  Result = mongoose.models.Result; // If already defined, use the existing model
} else {
  Result = mongoose.model('Result', resultSchema); // If not, define the model
}

module.exports = Result;
