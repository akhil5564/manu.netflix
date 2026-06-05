// const mongoose = require('mongoose');

// const rateSchema = new mongoose.Schema({
//   label: String, 
//  rate: Number,
// });

// const rateMasterSchema = new mongoose.Schema({
//   user: String,
//   draw: String,
//   rates: [rateSchema],
// }, { timestamps: true });

// module.exports = mongoose.model('RateMaster', rateMasterSchema);

const mongoose = require('mongoose');

const rateSchema = new mongoose.Schema({
  name: String,   // A, B, AB, SUPER
  label: String,  // Duplicate for compatibility
  rate: Number,   // 10, 20, etc
  assignRate: Number
});

const rateMasterSchema = new mongoose.Schema(
  {
    user: { type: String, required: true },
    draw: { type: String, required: true },
    rates: [rateSchema]
  },
  { timestamps: true }
);

/* 🔥 INDEXES */
rateMasterSchema.index({ user: 1, draw: 1 });

module.exports =
  mongoose.models.RateMaster ||
  mongoose.model('RateMaster', rateMasterSchema);