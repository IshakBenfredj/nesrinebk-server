const express = require("express");
const router = express.Router();
const {
  getFullSummary,
  getTopProducts,
  getRevenueTrend,
  getProductPerformance,
  getCustomerAnalysis,
  getSalesChannels,
  getInventoryAlerts,
  getHourlySalesPattern,
  getExpenseAnalysis,
  getTotalRevenue,
} = require("../controllers/analyticsController");
const { protect } = require("../middleware/authMiddleware");

router.get("/summary", protect, getFullSummary);
router.get("/top-products", protect, getTopProducts);

router.get("/revenue-trend", protect, getRevenueTrend);

// Product performance analysis
router.get("/product-performance", protect, getProductPerformance);

// Customer analysis
router.get("/customer-analysis", protect, getCustomerAnalysis);

// Sales channels analysis
router.get("/sales-channels", protect, getSalesChannels);

// Inventory alerts
router.get("/inventory-alerts", protect, getInventoryAlerts);

// Hourly sales pattern
router.get("/hourly-sales", protect, getHourlySalesPattern);

// Expense analysis
router.get("/expense-analysis", protect, getExpenseAnalysis);

// In your routes file
router.get('/total-revenue', protect, getTotalRevenue);

module.exports = router;
