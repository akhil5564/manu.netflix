    const mongoose = require('mongoose');

const dailyLimitUsageSchema = new mongoose.Schema({
  date: { type: String, required: true }, // YYYY-MM-DD
  type: { type: String, required: true }, // SUPER, BOX, AB, BC, AC, A, B, C
  remaining: { type: Number, required: true }, // remaining for the day (per type)
}, { timestamps: true });

dailyLimitUsageSchema.index({ date: 1, type: 1 }, { unique: true });
// Auto-purge after 14 days (14 * 24 * 60 * 60 = 1209600 seconds)
// dailyLimitUsageSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 });

module.exports = mongoose.model('DailyLimitUsage', dailyLimitUsageSchema);


