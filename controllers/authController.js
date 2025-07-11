const jwt = require("jsonwebtoken");
const User = require("../models/User");

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
