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
} = require("../controllers/analyticsController");

router.get("/summary", getFullSummary);
router.get("/top-products", getTopProducts);

router.get("/revenue-trend", getRevenueTrend);

// Product performance analysis
router.get("/product-performance", getProductPerformance);

// Customer analysis
router.get("/customer-analysis", getCustomerAnalysis);

// Sales channels analysis
router.get("/sales-channels", getSalesChannels);

// Inventory alerts
router.get("/inventory-alerts", getInventoryAlerts);

// Hourly sales pattern
router.get("/hourly-sales", getHourlySalesPattern);

// Expense analysis
router.get("/expense-analysis", getExpenseAnalysis);

module.exports = router;
