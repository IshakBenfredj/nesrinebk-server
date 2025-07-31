const mongoose = require("mongoose");

const OrderItemSchema = new mongoose.Schema(
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
    size: {
      type: String,
      required: true,
      uppercase: true,
    },
    color: {
      type: String,
      required: true,
    },
    price: {
      type: Number,
      required: true,
    },
  },
  { _id: false }
);

const OrderSchema = new mongoose.Schema(
  {
    fullName: { type: String, required: true },
    phone: { type: String, required: true },
    state: { type: String, required: true },
    deliveryType: {
      type: String,
      enum: ["مكتب", "منزل"],
      required: true,
    },
    address: {
      type: String,
      default: "",
    },
    orderNumber: { type: Number, required: true, unique: true },
    items: { type: [OrderItemSchema], required: true },
    totalPrice: { type: Number, required: true, min: 0 },
    notes: { type: String, default: "" },
    isPaid: { type: Boolean, default: false },
    status: {
      type: String,
      enum: ["غير مؤكدة", "مؤكدة", "قيد التوصيل", "تم الاستلام", "ارجاع"],
      default: "غير مؤكدة",
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  { timestamps: true }
);

OrderSchema.pre("validate", function (next) {
  if (
    this.deliveryType === "منزل" &&
    (!this.address || this.address.trim() === "")
  ) {
    return next(new Error("العنوان مطلوب عند اختيار التوصيل للمنزل"));
  }
  next();
});

module.exports = mongoose.model("Order", OrderSchema);
