const Expense = require("../models/Expense");

exports.addExpense = async (req, res) => {
  try {
    const { description, amount } = req.body;
    const user = req.user._id; 

    if (!description || !amount || !user) {
      return res
        .status(400)
        .json({ success: false, message: "كل الحقول مطلوبة" });
    }

    const expense = await Expense.create({ description, amount, user });
    await expense.populate("user");
    res.status(201).json({ success: true, data: expense });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: "خطأ في إضافة المصروف",
    });
  }
};

exports.getExpenses = async (req, res) => {
  try {
    const expenses = await Expense.find().populate("user");
    res.json({ success: true, data: expenses });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: "خطأ في جلب المصروفات",
    });
  }
};

// ➤ Get Single Expense
exports.getExpense = async (req, res) => {
  try {
    const expense = await Expense.findById(req.params.id).populate("user");
    if (!expense)
      return res
        .status(404)
        .json({ success: false, message: "المصروف غير موجود" });
    res.json({ success: true, data: expense });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: "خطأ في جلب المصروف",
    });
  }
};

// ➤ Update Expense
exports.updateExpense = async (req, res) => {
  try {
    const { description, amount, user } = req.body;
    const expense = await Expense.findByIdAndUpdate(
      req.params.id,
      { description, amount, user },
      { new: true }
    );
    if (!expense)
      return res
        .status(404)
        .json({ success: false, message: "المصروف غير موجود" });
    res.json({ success: true, data: expense });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: "خطأ في تعديل المصروف",
    });
  }
};

exports.deleteExpense = async (req, res) => {
  try {
    const expense = await Expense.findByIdAndDelete(req.params.id);
    if (!expense)
      return res
        .status(404)
        .json({ success: false, message: "المصروف غير موجود" });
    res.json({ success: true, message: "تم حذف المصروف بنجاح" });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: "خطأ في حذف المصروف",
    });
  }
};
