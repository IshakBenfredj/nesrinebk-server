const mongoose = require("mongoose");

const ExpenseSchema = new mongoose.Schema(
  {
    description: {
      type: String,
      required: true,
      trim: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    admin: {
      type: Boolean,
      default: false,
    },
    isFixed: {
      type: Boolean,
      default: false,
    },
    recurrence: {
      type: String,
      enum: ["daily", "monthly"],
      default: "monthly",
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Expense", ExpenseSchema);
