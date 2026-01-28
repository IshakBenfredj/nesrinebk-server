const jwt = require("jsonwebtoken");
const User = require("../models/User");
const bcrypt = require("bcryptjs");
const LoginHistory = require("../models/LoginHistory");

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
    if (!user || !(await user.matchPassword(password))) {
      return res.status(401).json({
        success: false,
        message: "رقم الهاتف أو كلمة المرور غير صحيحة",
      });
    }

    const token = generateToken(user);

    const ua = req.useragent; 

    await LoginHistory.create({
      user: user._id,
      userName: user.name,
      userPhone: user.phone,
      role: user.role,
      userAgent: req.headers["user-agent"] || "Unknown",
      isMobile: ua.isMobile,
      isTablet: ua.isTablet,
      isDesktop: ua.isDesktop,
      browser: ua.browser ? `${ua.browser} ${ua.version || ""}` : "Unknown",
      os: ua.os ? `${ua.os} (${ua.platform || ""})` : "Unknown",
      deviceBrand: getDeviceBrand(ua),
      ipAddress: req.ip || req.connection.remoteAddress || "Unknown",
    });

    res.json({
      success: true,
      token,
      user,
    });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ success: false, message: "خطأ في الخادم" });
  }
};

function getDeviceBrand(ua) {
  const agent = (ua.browser || "").toLowerCase();
  const os = (ua.os || "").toLowerCase();

  if (ua.isMobile || ua.isTablet) {
    if (os.includes("android")) return "Android Device";
    if (os.includes("ios")) return "iPhone / iPad";
    if (agent.includes("samsung")) return "Samsung";
    if (agent.includes("huawei")) return "Huawei";
    if (agent.includes("xiaomi")) return "Xiaomi";
    return "Mobile / Tablet";
  }

  // Desktop / Laptop
  if (os.includes("windows")) return "Windows PC";
  if (os.includes("mac")) return "Mac";
  if (os.includes("linux")) return "Linux PC";
  return "Desktop / Laptop";
}

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

// controllers/authController.js
exports.getUserHistory = async (req, res) => {
  try {
    const { userId } = req.query;

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    const query = {
      loginTime: { $gte: todayStart, $lte: todayEnd },
    };

    if (userId) {
      query.user = userId;
    }

    const history = await LoginHistory.find(query)
      .populate("user", "name phone role")
      .sort({ loginTime: -1 })
      .lean(); // faster query

    res.json({
      success: true,
      count: history.length,
      data: history,
    });
  } catch (err) {
    console.error("Error fetching login history:", err);
    res.status(500).json({ success: false, message: "خطأ في الخادم" });
  }
};
