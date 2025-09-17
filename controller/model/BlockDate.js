const mongoose = require("mongoose");

const blockDateSchema = new mongoose.Schema({
  ticket: { type: String, required: true },  // e.g., ALL, LSK3, DEAR1
  date: { type: String, required: true },    // YYYY-MM-DD
});

module.exports = mongoose.model("BlockDate", blockDateSchema);
