const jwt = require("jsonwebtoken");
const User = require("../models/User");
const bcrypt = require("bcryptjs");

const generateToken = (user) => {
  return jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET, {
    expiresIn: "7d",
  });
};

exports.register = async (req, res) => {
  const { phone, password, role, name } = req.body;
  try {
    const userExists = await User.findOne({ phone });
    if (userExists)
      return res.status(400).json({ message: "المستخدم موجود بالفعل" });

    const user = await User.create({ phone, password, role, name });
    res
      .status(201)
      .json({ data: user, success: true, message: "تم إنشاء المستخدم بنجاح" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.login = async (req, res) => {
  const { phone, password } = req.body;
  try {
    const user = await User.findOne({ phone });
    if (!user || !(await user.matchPassword(password)))
      return res.status(500).json({ message: "بيانات الاعتماد غير صحيحة" });

    const token = generateToken(user);
    res.json({
      token,
      user,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.getProfile = async (req, res) => {
  const user = await User.findById(req.user._id).select("-password");
  res.json(user);
};

exports.getUsers = async (req, res) => {
  try {
    const users = await User.find();
    res.json(users);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// PUT /api/auth/users/:id
exports.editUser = async (req, res) => {
  const { id } = req.params;
  const { phone, name, role, password } = req.body;

  // Input validation
  if (!phone || !name || !role) {
    return res.status(400).json({
      success: false,
      message: "الهاتف والاسم والصلاحية مطلوبة",
    });
  }

  // Validate role
  const validRoles = ["admin", "social_media", "worker"];
  if (!validRoles.includes(role)) {
    return res.status(400).json({
      success: false,
      message: "الصلاحية المحددة غير صالحة",
    });
  }

  try {
    const updateData = { phone, name, role };

    // Only hash and add password if it is provided
    if (password && password.trim() !== "") {
      const hashedPassword = await bcrypt.hash(password, 10);
      updateData.password = hashedPassword;
    }

    const user = await User.findByIdAndUpdate(id, updateData, {
      new: true,
      runValidators: true,
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "المستخدم غير موجود",
      });
    }

    res.json({
      success: true,
      data: user,
      message: "تم تحديث المستخدم بنجاح",
    });
  } catch (err) {
    console.error("Error updating user:", err);

    if (err.name === "ValidationError") {
      return res.status(400).json({
        success: false,
        message: "بيانات غير صالحة",
        errors: err.errors,
      });
    }

    res.status(500).json({
      success: false,
      message: "حدث خطأ أثناء تحديث المستخدم",
    });
  }
};

// DELETE /api/auth/users/:id
exports.deleteUser = async (req, res) => {
  const { id } = req.params;

  // Prevent self-deletion
  if (req.user._id.toString() === id) {
    return res.status(400).json({
      success: false,
      message: "لا يمكنك حذف حسابك الخاص",
    });
  }

  try {
    const user = await User.findById(id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "المستخدم غير موجود",
      });
    }

    // Prevent deletion of last admin
    if (user.role === "admin") {
      const adminCount = await User.countDocuments({ role: "admin" });
      if (adminCount <= 1) {
        return res.status(400).json({
          success: false,
          message: "لا يمكن حذف آخر مدير في النظام",
        });
      }
    }

    await User.findByIdAndDelete(id);

    res.json({
      success: true,
      message: "تم حذف المستخدم بنجاح",
    });
  } catch (err) {
    console.error("Error deleting user:", err);
    res.status(500).json({
      success: false,
      message: "حدث خطأ أثناء حذف المستخدم",
    });
  }
};
