import mongoose from "mongoose";

const blockTimeSchema = new mongoose.Schema({
  draw: { type: String, required: true },
  type: { type: String, enum: ["admin", "master", "sub"], required: true }, // added master & sub
  blockTime: { type: String, required: true },   // "HH:MM"
  unblockTime: { type: String, required: true }, // "HH:MM"
});

export default mongoose.model("BlockTime", blockTimeSchema);
