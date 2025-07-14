const express = require("express");
const router = express.Router();
const saleController = require("../controllers/saleController");
const { protect, authorizeRoles } = require("../middleware/authMiddleware");

router.post(
  "/",
  protect,
  authorizeRoles("worker", "admin"),
  saleController.createSale
);
router.post(
  "/:saleId/exchange",
  protect,
  authorizeRoles("worker", "admin"),
  saleController.exchangeProducts
);
router.get("/", protect, saleController.getAllSales);
router.get(
  "/barcode/:barcode",
  protect,
  authorizeRoles("worker", "admin"),
  saleController.getSaleByBarcode
);
router.get(
  "/id/:id",
  protect,
  authorizeRoles("worker", "admin"),
  saleController.getSaleById
);

module.exports = router;
