const mongoose = require("mongoose");

const testedFanSchema = new mongoose.Schema(
  {
    fanTrayNo: {
      type: String,
      required: true,
      trim: true,
    },
    testedBy: {
      type: String,
      default: "ATS Operator",
      trim: true,
    },
    testedAt: {
      type: Date,
      default: Date.now,
    },
    status: {
      type: String,
      enum: ["Passed", "Failed"],
      required: true,
    },
    summary: {
      total: { type: Number, default: 0 },
      passed: { type: Number, default: 0 },
      failed: { type: Number, default: 0 },
    },
    steps: [
      {
        step: Number,
        fan: String,
        status: {
          type: String,
          enum: ["passed", "failed"],
        },
        message: String,
      },
    ],
    // comPort: {
    //   type: String,
    //   default: "",
    //   trim: true,
    // },
    // mac: {
    //   type: String,
    //   default: "ESP32-JIG",
    //   trim: true,
    // },
    reportNo: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    reportPath: {
      type: String,
      required: true,
      trim: true,
    },
  },
  { timestamps: true },
);

testedFanSchema.index({ fanTrayNo: 1, testedAt: -1 });
testedFanSchema.index({ testedAt: -1 });

module.exports = mongoose.model("TestedFan", testedFanSchema);
