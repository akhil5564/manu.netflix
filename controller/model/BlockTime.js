// models/BlockTime.js or BlockTime.ts
import mongoose from "mongoose";

const blockTimeSchema = new mongoose.Schema({
  drawLabel: { type: String, required: true }, // same as draw in frontend
  type: { type: String, enum: ["admin", "master", "sub"], required: true },
  blockTime: { type: String, required: true },    // "HH:MM"
  unblockTime: { type: String, required: true },  // "HH:MM"
});

const BlockTime = mongoose.model("BlockTime", blockTimeSchema);

export default BlockTime;
