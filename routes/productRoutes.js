const express = require("express");
const router = express.Router();
const productController = require("../controllers/productController");
const { protect } = require("../middleware/authMiddleware");

router.post("/", protect, productController.createProduct);

router.get("/", protect, productController.getProducts);

router.get("/:id", protect, productController.getProductById);

router.put("/:id", protect, productController.updateProduct);

router.delete("/:id", protect, productController.deleteProduct);

router.put(
  "/:productId/colors/:colorIndex/sizes/:sizeIndex/quantity",
  protect,
  productController.updateSizeQuantity
);
module.exports = router;
