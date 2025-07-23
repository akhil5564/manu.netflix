const mongoose = require('mongoose');

const rateMasterSchema = new mongoose.Schema({
  user: String,
  draw: String,
  rates: [
    {
      name: String,
      rate: Number,
      assignRate: Number,
    },
  ],
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model('RateMaster', rateMasterSchema);
