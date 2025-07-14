const Product = require("../models/Product");

// Update product stock and sold count
exports.updateProductStock = async (
  productId,
  barcode,
  quantity,
  incrementSoldCount = false
) => {
  try {
    const product = await Product.findById(productId);
    if (!product) {
      throw new Error("Product not found");
    }

    // Find the color and size to update
    let updated = false;
    const updatedColors = product.colors.map((color) => {
      const updatedSizes = color.sizes.map((size) => {
        if (size.barcode === barcode) {
          updated = true;
          return {
            ...size.toObject(),
            quantity: size.quantity + quantity,
          };
        }
        return size;
      });
      return { ...color.toObject(), sizes: updatedSizes };
    });

    if (!updated) {
      throw new Error("Product variant not found");
    }

    // Update the product
    const updateData = {
      colors: updatedColors,
    };

    if (incrementSoldCount) {
      updateData.$inc = { soldCount: quantity };
    }

    await Product.findByIdAndUpdate(productId, updateData);
  } catch (error) {
    console.error("Error updating product stock:", error);
    throw error;
  }
};
