const mongoose = require('mongoose');

const dailyUserLimitSchema = new mongoose.Schema({
    date: {
      type: String, // YYYY-MM-DD
      required: true,
    },
    user: {
      type: String,
      required: true,
    },
    type: {
      type: String,
      required: true,
      enum: ['A', 'B', 'C', 'AB', 'BC', 'AC', 'SUPER', 'BOX'],
    },
    number: {
      type: String,
      required: true,
      trim: true,
    },
    remaining: {
      type: Number,
      required: true,
    },
  }, {
    timestamps: true,
  });
  
  // Indexes for fast lookups
  dailyUserLimitSchema.index({ date: 1, user: 1, type: 1, number: 1 });
  dailyUserLimitSchema.index({ user: 1, type: 1, number: 1 });
  
  module.exports = mongoose.model('DailyUserLimit', dailyUserLimitSchema);