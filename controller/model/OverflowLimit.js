const mongoose = require("mongoose");

const OverflowLimitSchema = new mongoose.Schema(
  {
    drawTime: {
      type: String,
      required: true,
      unique: true
    },
    limits: {
      type: Object,
      required: true
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model("OverflowLimit", OverflowLimitSchema);