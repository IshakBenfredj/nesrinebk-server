const express = require("express");
const router = express.Router();
const bonusCtrl = require("../controllers/bonusController");
const { authorizeRoles, protect } = require("../middleware/authMiddleware");

router.put("/toggle", protect, authorizeRoles("admin"), bonusCtrl.toggleBonus);
router.get(
  "/status",
  protect,
  authorizeRoles("admin"),
  bonusCtrl.getBonusStatus,
);
router.get("/worker/:workerId", protect, bonusCtrl.getWorkerBonus);
router.post("/pay/:workerId", protect, bonusCtrl.payWorkerBonus);

module.exports = router;
