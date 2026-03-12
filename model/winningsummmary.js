const mongoose = require("mongoose");

const WinningSummarySchema = new mongoose.Schema(
  {
    /* =========================
       🔹 IDENTITY (FILTER KEYS)
    ========================= */

    date: {
      type: String,           // "2026-02-15"
      required: true,
      index: true
    },

    timeLabel: {
      type: String,           // "MORNING", "EVENING"
      required: true,
      index: true
    },

    agent: {
      type: String,           // Direct agent username
      required: true,
      index: true
    },

    createdByPath: {
      type: [String],         // ["SubAdmin1", "Admin1"]
      default: []
    },

    scheme: {
      type: String,           // Scheme used for calculation
      default: "N/A"
    },

    /* =========================
       🔹 COUNTS
    ========================= */

    totalBills: {
      type: Number,           // No. of bills having winning
      default: 0
    },

    totalWinningEntries: {
      type: Number,           // Total winning lines
      default: 0
    },

    /* =========================
       🔹 AMOUNTS (CORE)
    ========================= */

    totalBillAmount: {
      type: Number,           // Total ticket price (of winning bills)
      default: 0
    },

    totalWinningAmount: {
      type: Number,           // 💰 GRAND TOTAL PAYOUT
      default: 0
    },

    superTotalAmount: {
      type: Number,           // For frontend super total display
      default: 0
    },

    winCounts: {
      type: Map,
      of: Number,             // { "SUPER 1": 5, "BOX perfect": 2 }
      default: {}
    },

    winPrizes: {
      type: Map,
      of: Number,             // { "SUPER 1": 500, "BOX perfect": 5000 }
      default: {}
    },

    /* =========================
       🔹 META
    ========================= */

    createdAt: {
      type: Date,
      default: Date.now
    }
  },
  { timestamps: true }
);

/* =========================
   🔥 COMPOUND INDEX (FAST)
========================= */
WinningSummarySchema.index(
  { date: 1, timeLabel: 1, agent: 1 },
  { unique: true }
);

module.exports = mongoose.model("WinningSummary", WinningSummarySchema);