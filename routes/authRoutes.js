const express = require("express");
const router = express.Router();
const {
  register,
  login,
  getProfile,
  getUsers,
  editUser,
  deleteUser,
} = require("../controllers/authController");
const { protect, authorizeRoles } = require("../middleware/authMiddleware");

router.post("/register", register);
router.post("/login", login);
router.get("/users", protect, authorizeRoles("admin"), getUsers);
router.put("/users/:id", protect, authorizeRoles("admin"), editUser);
router.delete("/users/:id", protect, authorizeRoles("admin"), deleteUser);
router.get("/me", protect, getProfile);

module.exports = router;
