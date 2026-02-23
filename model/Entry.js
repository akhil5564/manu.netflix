// const mongoose = require('mongoose');

// const EntrySchema = new mongoose.Schema({
//   number: String,
//   count: Number,
//   type: String,
//   timeLabel: String,
//   timeCode: String,
//   createdBy: String,
//   toggleCount: String,
//   billNo: String, // <-- THIS IS REQUIRED
//   createdAt: { type: Date, default: Date.now },
// });

// // module.exports = mongoose.model('Entry', EntrySchema);
// module.exports =
//   mongoose.models.Entry ||
//   mongoose.model('Entry', EntrySchema);

const mongoose = require('mongoose');

const EntrySchema = new mongoose.Schema({
  number: String,
  count: Number,
  rate: Number,
  type: String,
  timeLabel: String,
  timeCode: String,
  createdBy: String,
  toggleCount: String,
  billNo: String,
  date: { type: Date, default: Date.now },
  createdAt: { type: Date, default: Date.now },
});

/* 🔥 PERFORMANCE INDEX */
EntrySchema.index({
  createdBy: 1,
  createdAt: 1,
  timeLabel: 1,
});
EntrySchema.index({ createdBy: 1, date: 1, timeLabel: 1 });
EntrySchema.index({ billNo: 1 });


// // module.exports = mongoose.model('Entry', EntrySchema);
module.exports =
  mongoose.models.Entry ||
  mongoose.model('Entry', EntrySchema);
