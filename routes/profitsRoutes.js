const express = require("express");
const router = express.Router();
const { getFullSummary } = require("../controllers/profitsController");

router.get("/summary", getFullSummary);

module.exports = router;