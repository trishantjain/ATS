const mongoose = require("mongoose");

const testedControllerSchema = new mongoose.Schema(
  {
    // Controller identity
    controllerIp: {
      type: String,
      required: true,
      trim: true,
    },

    unitSerialNo: {
      type: String,
      required: true,
      trim: true,
    },

    // Hardware identification
    cpu: {
      type: String,
      required: true,
      trim: true,
    },

    base: {
      type: String,
      required: true,
      trim: true,
    },

    psu: {
      type: String,
      required: true,
      trim: true,
    },

    camera: {
      type: String,
      required: true,
      trim: true,
    },

    // Testing information
    testedBy: {
      type: String,
      required: true,
      trim: true,
    },

    testedAt: {
      type: Date,
      default: Date.now,
    },

    status: {
      type: String,
      enum: ["Tested"],
      default: "Tested",
    },

    remark: {
      type: String,
      default: "",
      trim: true,
    },

    // ATS information
    testLevel: {
      type: String,
      enum: ["full-controller", "green-pcb"],
      default: "full-controller",
    },

    // Existing ATS report generated for this test
    reportPath: {
      type: String,
      default: "",
    },

    reportNo: {
      type: String,
      default: "",
    },

    // Keeps the previous record relationship
    previousRecordId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "TestedController",
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

testedControllerSchema.index({ controllerIp: 1 });
testedControllerSchema.index({ unitSerialNo: 1 });
testedControllerSchema.index({ cpu: 1 });
testedControllerSchema.index({ base: 1 });
testedControllerSchema.index({ psu: 1 });
testedControllerSchema.index({ camera: 1 });
testedControllerSchema.index({ testedAt: -1 });

module.exports = mongoose.model(
  "TestedController",
  testedControllerSchema
);