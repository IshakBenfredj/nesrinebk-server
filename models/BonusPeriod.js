// models/BonusPeriod.js
const mongoose = require("mongoose");
const Sale = require("./Sale");
const Expense = require("./Expense");
const User = require("./User");
const BonusAdjustment = require("./BonusAdjustment");

const BonusPeriodSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    startDate: {
      type: Date,
      required: true,
    },
    endDate: {
      type: Date,
      default: null,
    },
    status: {
      type: String,
      enum: ["pending", "paid", "cancelled"],
      default: "pending",
      index: true,
    },
    paidAt: Date,
    paidBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    note: {
      type: String,
      trim: true,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

BonusPeriodSchema.index({ user: 1, status: 1, startDate: -1 });
BonusPeriodSchema.index({ user: 1, endDate: 1 });

BonusPeriodSchema.statics.calculateForPeriod = async function (periodDocOrId) {
  let period;

  // Allow passing either ID string or already-fetched document
  if (typeof periodDocOrId === "string") {
    period = await this.findById(periodDocOrId);
  } else {
    period = periodDocOrId;
  }

  if (!period || !period.user || !period.startDate) {
    return {
      netBonus: 0,
      details: { error: "Invalid or missing period data" },
    };
  }

  const end = period.endDate || new Date(); // Use current time if period is open

  // Get worker's bonus percentage
  const worker = await User.findById(period.user)
    .select("bonusPercentage")
    .lean();
  if (!worker || worker.bonusPercentage <= 0) {
    return {
      netBonus: 0,
      details: { reason: "Worker has no valid bonus percentage" },
    };
  }

  const percentage = worker.bonusPercentage / 100;

  // ── Sales ────────────────────────────────────────
  const sales = await Sale.find({
    cashier: period.user,
    createdAt: { $gte: period.startDate, $lte: end },
  })
    .select("total discountAmount isExchanged")
    .lean();

  let salesBonus = 0;
  sales.forEach((sale) => {
    const base = sale.isExchanged
      ? sale.total
      : sale.total - (sale.discountAmount || 0);
    salesBonus += base * percentage;
  });

  // ── Work days detection ──────────────────────────
  // A "work day" = any day the worker created at least one qualifying expense
  // const workDaysRaw = await Expense.distinct("createdAt", {
  //   user: period.user,
  //   admin: false,
  //   isFixed: false,
  //   createdAt: { $gte: period.startDate, $lte: end },
  // });

  // Normalize to start-of-day timestamps (no mutation)
  // const workDayTimestamps = workDaysRaw.map((d) => {
  //   const day = new Date(d);
  //   day.setHours(0, 0, 0, 0);
  //   return day.getTime();
  // });

  // ── Expenses only on work days ───────────────────
  // const expenses = await Expense.find({
  //   admin: false,
  //   isFixed: false,
  //   createdAt: { $gte: period.startDate, $lte: end },
  // })
  //   .select("amount createdAt")
  //   .lean();

  // const expensesOnWorkDays = expenses.filter((e) => {
  //   const expDay = new Date(e.createdAt);
  //   expDay.setHours(0, 0, 0, 0);
  //   return workDayTimestamps.includes(expDay.getTime());
  // });

  // const totalExpenses = expensesOnWorkDays.reduce(
  //   (sum, e) => sum + e.amount,
  //   0,
  // );

  const netBonus = salesBonus;

  const adjustments = await BonusAdjustment.find({ period: period._id })
    .select("amount")
    .lean();

  const totalAdjustments = adjustments.reduce(
    (sum, adj) => sum + adj.amount,
    0,
  );

  const finalNetBonus = Math.max(0, netBonus + (totalAdjustments || 0));

  return {
    netBonus: finalNetBonus ? Math.trunc(finalNetBonus) : 0,
    details: {
      salesCount: sales.length,
      salesBonus: salesBonus,
      // expensesCount: expensesOnWorkDays.length,
      // workDaysCount: workDayTimestamps.length,
      percentageUsed: worker.bonusPercentage,
    },
  };
};

// ──────────────────────────────────────────────
// VIRTUAL: Simple net bonus number (fast access)
// ──────────────────────────────────────────────
BonusPeriodSchema.virtual("totalBonus").get(async function () {
  if (!this.user || !this.startDate) return 0;

  const result = await this.constructor.calculateForPeriod(this);
  return result.netBonus;
});

module.exports = mongoose.model("BonusPeriod", BonusPeriodSchema);
