// const mongoose = require("mongoose");

// const SalesReportSummarySchema = new mongoose.Schema(
//   {
//     userId: {
//       type: mongoose.Schema.Types.ObjectId,
//       ref: "User",
//       required: true
//     },

//     createdBy: { type: String, required: true },

//     date: { type: String, required: true },

//     drawTime: {
//       type: String,
//       enum: ["DEAR 1 PM", "KERALA 3 PM", "DEAR 6 PM", "DEAR 8 PM" ],
//       required: true
//     },

//     totalCount: { type: Number, default: 0 },
//     totalAmount: { type: Number, default: 0 },
//     billNo:{type:String},

//     schemes: [
//       {
//         rows: [
//           {
//             scheme: String,
//             count: Number,
//             amount: Number
//           }
//         ]
//       }
//     ]
//   },
//   { timestamps: true }
// );

// module.exports =
//   mongoose.models.SalesReportSummary ||
//   mongoose.model("SalesReportSummary", SalesReportSummarySchema);


const mongoose = require("mongoose");

const SalesReportSummarySchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },

    createdBy: { type: String, required: true },

    date: { type: String, required: true },

    drawTime: {
      type: String,
      enum: ["DEAR 1 PM", "KERALA 3 PM", "DEAR 6 PM", "DEAR 8 PM"],
      required: true
    },

    // Personal Sales (Directly by this user)
    selfCount: { type: Number, default: 0 },
    selfAmount: { type: Number, default: 0 },

    // Branch Sales (Summed up from all children)
    childCount: { type: Number, default: 0 },
    childAmount: { type: Number, default: 0 },

    // Total Sales (Combined: self + branch)
    totalCount: { type: Number, default: 0 },
    totalAmount: { type: Number, default: 0 },

    billNo: { type: String },

    schemes: [
      {
        rows: [
          {
            scheme: String,
            count: Number,
            amount: Number
          }
        ]
      }
    ]
  },
  { timestamps: true }
);

module.exports =
  mongoose.models.SalesReportSummary ||
  mongoose.model("SalesReportSummary", SalesReportSummarySchema);