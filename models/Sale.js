const mongoose = require("mongoose");

const SaleItemSchema = new mongoose.Schema(
  {
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true,
    },
    barcode: {
      type: String,
      required: true,
    },
    quantity: {
      type: Number,
      required: true,
      min: 1,
    },
    price: {
      type: Number,
      required: true,
      min: 0,
    },
    size: {
      type: String,
      required: true,
      uppercase: true,
    },
    color: {
      type: String,
      required: true,
      match: [/^#([A-Fa-f0-9]{6})$/, "Hex color code"],
    },
    originalPrice: {
      type: Number,
      required: true,
      min: 0,
    },
  },
  { _id: false },
);

const ExchangeItemSchema = new mongoose.Schema(
  {
    originalItem: {
      type: SaleItemSchema,
      required: true,
    },
    exchangedWith: {
      type: SaleItemSchema,
      required: true,
    },
    exchangedAt: {
      type: Date,
      default: Date.now,
    },
    priceDifference: {
      type: Number,
      required: true,
    },
  },
  { _id: false },
);

const SaleSchema = new mongoose.Schema(
  {
    items: {
      type: [SaleItemSchema],
      required: true,
    },
    total: {
      type: Number,
      required: true,
      min: 0,
    },
    originalTotal: {
      type: Number,
      required: true,
      min: 0,
    },
    profit: {
      type: Number,
      required: true,
    },
    totalBeforeExchange: {
      type: Number,
      min: 0,
    },
    originalTotalBeforeExchange: {
      type: Number,
      min: 0,
    },
    profitBeforeExchange: {
      type: Number,
      min: 0,},
    cashier: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    exchangeCashier: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    exchanges: {
      type: [ExchangeItemSchema],
      default: [],
    },
    barcode: {
      type: String,
      required: true,
    },
    isExchanged: {
      type: Boolean,
      default: false,
    },
    discountAmount: {
      type: Number,
      default: 0,
      min: 0,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

// Indexes for faster queries
SaleSchema.index({ createdAt: 1 });
SaleSchema.index({ cashier: 1 });
SaleSchema.index({ "items.product": 1 });

module.exports = mongoose.model("Sale", SaleSchema);
