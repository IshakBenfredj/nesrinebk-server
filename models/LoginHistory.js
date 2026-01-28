const mongoose = require("mongoose");

const loginHistorySchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    userName: {
      type: String,
      required: true,
    },
    userPhone: {
      type: String,
      required: true,
    },
    role: {
      type: String,
      enum: ["admin", "social_media", "worker"],
      required: true,
    },
    loginTime: {
      type: Date,
      default: Date.now,
      required: true,
    },
    userAgent: {
      type: String,
      required: true,
    },
    isMobile: { type: Boolean, default: false },
    isTablet: { type: Boolean, default: false },
    isDesktop: { type: Boolean, default: false },
    browser: String,
    os: String,
    deviceBrand: String,
    ipAddress: String,
  },
  {
    timestamps: true,
  },
);

loginHistorySchema.index({ user: 1, loginTime: -1 });

module.exports = mongoose.model("LoginHistory", loginHistorySchema);
