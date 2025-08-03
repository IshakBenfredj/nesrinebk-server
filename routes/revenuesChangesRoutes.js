const express = require("express");
const router = express.Router();
const {
  addRevenueChange,
  getRevenueChanges,
  getRevenueChange,
  updateRevenueChange,
  deleteRevenueChange,
} = require("../controllers/revenuesChangesController");
const { protect, authorizeRoles } = require("../middleware/authMiddleware");

router
  .route("/")
  .get(protect, authorizeRoles("admin"), getRevenueChanges)
  .post(protect, authorizeRoles("admin"), addRevenueChange);

router
  .route("/:id")
  .get(protect, authorizeRoles("admin"), getRevenueChange)
  .put(protect, authorizeRoles("admin"), updateRevenueChange)
  .delete(protect, authorizeRoles("admin"), deleteRevenueChange);

module.exports = router;
