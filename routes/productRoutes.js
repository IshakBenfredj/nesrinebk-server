const express = require("express");
const router = express.Router();
const productController = require("../controllers/productController");

// Create a new product
router.post("/", productController.createProduct);

// Get all products with optional filters
router.get("/", productController.getProducts);

// Get a single product by ID
router.get("/:id", productController.getProductById);

// Update a product
router.put("/:id", productController.updateProduct);

// Delete a product
router.delete("/:id", productController.deleteProduct);

router.put(
  "/:productId/colors/:colorIndex/sizes/:sizeIndex/quantity",
  productController.updateSizeQuantity
);
module.exports = router;
