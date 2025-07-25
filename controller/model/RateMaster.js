const rateSchema = new mongoose.Schema({
  name: String,
  rate: Number,
});

const rateMasterSchema = new mongoose.Schema({
  user: String,
  draw: String,
  rates: [rateSchema],
}, { timestamps: true });

module.exports = mongoose.model('RateMaster', rateMasterSchema);
