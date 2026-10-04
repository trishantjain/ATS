const mongoose = require("mongoose");

const reportRunSchema = new mongoose.Schema(
  {
    reportNo: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    fileName: {
      type: String,
      required: true,
    },
    filePath: {
      type: String,
      required: true,
    },
    generatedAt: {
      type: String,
      required: true,
    },
    mac: {
      type: String,
      default: "",
    },
    unitSerialNo: {
      type: String,
      default: "",
    },
    cpu: {
      type: String,
      default: "",
    },
    base: {
      type: String,
      default: "",
    },
    camera: {
      type: String,
      default: "",
    },
    psu: {
      type: String,
      default: "",
    },
    testLevel: {
      type: String,
      required: true,
    },
    eligible: {
      type: Boolean,
      required: true,
    },
  },
  {
    timestamps: true,
  },
);

module.exports = mongoose.model("ReportRun", reportRunSchema);
