const express = require("express");
const router = express.Router();
const productController = require("../controllers/productController");

router.post("/", productController.createProduct);

router.get("/", productController.getProducts);

router.get("/:id", productController.getProductById);

router.put("/:id", productController.updateProduct);

router.delete("/:id", productController.deleteProduct);

router.put(
  "/:productId/colors/:colorIndex/sizes/:sizeIndex/quantity",
  productController.updateSizeQuantity
);
module.exports = router;
