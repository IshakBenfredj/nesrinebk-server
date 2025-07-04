const mongoose = require("mongoose");

const SizeSchema = new mongoose.Schema(
  {
    size: {
      type: String,
      required: true,
      uppercase: true,
      trim: true,
    },
    quantity: {
      type: Number,
      required: true,
      min: 0,
    },
    barcode: {
      type: String,
      required: true,
      unique: true,
      maxlength: 6,
    },
  },
  { _id: false }
);

const ColorVariantSchema = new mongoose.Schema(
  {
    color: {
      type: String,
      required: true,
      match: [/^#([A-Fa-f0-9]{6})$/, "Hex color code"],
    },
    image: {
      type: String,
    },
    sizes: {
      type: [SizeSchema],
    },
  },
  { _id: false }
);

const ProductSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
    },
    price: {
      type: Number,
      required: true,
      min: 0,
    },
    colors: {
      type: [ColorVariantSchema],
      required: true,
    },
    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Category",
      required: true,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

ProductSchema.index({ name: "text", description: "text" });
ProductSchema.index({ "colors.color": 1 });
ProductSchema.index({ category: 1 });
ProductSchema.index({ price: 1 });

ProductSchema.virtual("totalStock").get(function () {
  return this.colors.reduce((total, color) => {
    return total + color.sizes.reduce((sum, size) => sum + size.quantity, 0);
  }, 0);
});

module.exports = mongoose.model("Product", ProductSchema);
