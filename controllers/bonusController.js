// controllers/bonusController.js
const User = require("../models/User");
const BonusConfig = require("../models/BonusConfig");
const BonusPeriod = require("../models/BonusPeriod");
const BonusAdjustment = require("../models/BonusAdjustment");

const getConfig = async () => {
  let config = await BonusConfig.findOne();
  if (!config) {
    config = new BonusConfig({ isEnabled: false });
    await config.save();
  }
  return config;
};

exports.toggleBonus = async (req, res) => {
  try {
    const { isEnabled } = req.body;

    if (typeof isEnabled !== "boolean") {
      return res.status(400).json({
        success: false,
        message: "isEnabled يجب أن يكون boolean (true/false)",
      });
    }

    const config = await getConfig();
    const wasEnabled = config.isEnabled;
    config.isEnabled = isEnabled;
    await config.save();

    const now = new Date();

    // When enabling → create NEW open period for EVERY worker
    if (isEnabled && !wasEnabled) {
      const workers = await User.find({ role: "worker" }).select("_id");

      const newPeriods = workers.map((worker) => ({
        user: worker._id,
        startDate: now,
        endDate: null,
        status: "pending",
        note: "فتح تلقائي عند تفعيل النظام",
      }));

      if (newPeriods.length > 0) {
        await BonusPeriod.insertMany(newPeriods);
      }
    }

    // When disabling → close ALL open periods (set endDate)
    if (!isEnabled && wasEnabled) {
      const updateResult = await BonusPeriod.updateMany(
        { endDate: null, status: "pending" },
        { $set: { endDate: now } },
      );

      console.log(`Closed ${updateResult.modifiedCount} open bonus periods`);
    }

    return res.json({
      success: true,
      isEnabled: config.isEnabled,
      message: isEnabled
        ? "تم تفعيل نظام البونص وإنشاء فترات جديدة لكل العمال"
        : "تم تعطيل نظام البونص وإغلاق جميع الفترات المفتوحة",
    });
  } catch (err) {
    console.error("Toggle bonus error:", err);
    return res.status(500).json({
      success: false,
      message: "حدث خطأ أثناء تحديث حالة البونص",
    });
  }
};

exports.getBonusStatus = async (req, res) => {
  try {
    const config = await getConfig();
    return res.json({
      success: true,
      data: { isEnabled: config.isEnabled },
    });
  } catch (err) {
    console.error("Get bonus status error:", err);
    return res.status(500).json({
      success: false,
      message: "حدث خطأ في جلب حالة البونص",
    });
  }
};

exports.getWorkerBonus = async (req, res) => {
  try {
    const { workerId } = req.params;

    const worker = await User.findById(workerId);
    if (!worker || worker.role !== "worker") {
      return 
    }

    const periods = await BonusPeriod.find({
      user: workerId,
      status: "pending",
    });

    const periodIds = periods.map((p) => p._id);
    const adjustments = await BonusAdjustment.find({
      period: { $in: periodIds },
    })
      .select("period amount reason createdBy createdAt")
      .populate("createdBy", "name")
      .sort({ createdAt: -1 })
      .lean();

    let totalUnpaid = 0;
    const resultPeriods = [];

    for (const period of periods) {
      const bonusValue = await period.totalBonus;
      const fullDetails = await BonusPeriod.calculateForPeriod(period);
      console.log("fullDetails", fullDetails);

      totalUnpaid += bonusValue;

      resultPeriods.push({
        _id: period._id,
        startDate: period.startDate,
        endDate: period.endDate || "مفتوحة (حتى الآن)",
        status: period.status,
        totalBonus: bonusValue,
        details: fullDetails.details,
      });
    }

    return res.json({
      success: true,
      worker: {
        _id: worker._id,
        name: worker.name,
        phone: worker.phone,
        bonusPercentage: worker.bonusPercentage || 0,
      },
      adjustments,
      unpaidPeriods: resultPeriods,
      totalUnpaidBonus: totalUnpaid,
    });
  } catch (err) {
    console.error("Get worker bonus error:", err);
    return res.status(500).json({
      success: false,
      message: "حدث خطأ في جلب بيانات البونص لهذا العامل",
    });
  }
};

exports.payWorkerBonus = async (req, res) => {
  try {
    const { workerId } = req.params;

    const worker = await User.findById(workerId);
    if (!worker || worker.role !== "worker") {
      return res.status(404).json({
        success: false,
        message: "العامل غير موجود أو ليس له صلاحية worker",
      });
    }

    const periods = await BonusPeriod.find({
      user: workerId,
      status: "pending",
    });

    if (periods.length === 0) {
      return res.status(400).json({
        success: false,
        message: "لا توجد فترات معلقة للدفع",
      });
    }

    let totalToPay = 0;
    for (const period of periods) {
      totalToPay += await period.totalBonus;
    }

    if (totalToPay <= 0) {
      return res.status(400).json({
        success: false,
        message: "لا يوجد بونص مستحق للدفع",
      });
    }

    // Mark all pending as paid
    const updateResult = await BonusPeriod.updateMany(
      { user: workerId, status: "pending" },
      {
        $set: {
          status: "paid",
          paidAt: new Date(),
          paidBy: req.user._id,
          note: "دفع تلقائي كامل",
        },
      },
    );

    return res.json({
      success: true,
      paidAmount: totalToPay,
      updatedPeriods: updateResult.modifiedCount,
      message: `تم دفع البونص الكامل بقيمة ${totalToPay} د.ج`,
    });
  } catch (err) {
    console.error("Pay worker bonus error:", err);
    return res.status(500).json({
      success: false,
      message: "حدث خطأ في دفع البونص",
    });
  }
};

exports.createAdjustment = async (req, res) => {
  try {
    const { amount, reason } = req.body;
    const { periodId } = req.params;

    if (!periodId || !amount || !reason) {
      return res.status(400).json({
        success: false,
        message: "الفترة والمبلغ والسبب مطلوبة",
      });
    }

    const period = await BonusPeriod.findById(periodId);
    if (!period) {
      return res.status(404).json({
        success: false,
        message: "الفترة غير موجودة",
      });
    }

    if (period.status !== "pending") {
      return res.status(400).json({
        success: false,
        message: "لا يمكن إضافة تعديلات إلى فترة مغلقة أو مدفوعة",
      });
    }

    const adjustment = await BonusAdjustment.create({
      period: periodId,
      amount: Number(amount),
      reason,
      createdBy: req.user._id,
    });

    return res.status(201).json({
      success: true,
      data: adjustment,
      message: "تم إضافة التعديل بنجاح",
    });
  } catch (err) {
    console.error("Create adjustment error:", err);
    return res.status(500).json({
      success: false,
      message: "حدث خطأ أثناء إضافة التعديل",
    });
  }
};

exports.getAdjustmentsForPeriod = async (req, res) => {
  try {
    const { periodId } = req.params;

    const adjustments = await BonusAdjustment.find({ period: periodId })
      .populate("createdBy", "name")
      .sort({ createdAt: -1 })
      .lean();

    return res.json({
      success: true,
      count: adjustments.length,
      data: adjustments,
    });
  } catch (err) {
    console.error("Get adjustments error:", err);
    return res.status(500).json({
      success: false,
      message: "حدث خطأ في جلب التعديلات",
    });
  }
};

exports.deleteAdjustment = async (req, res) => {
  try {
    const { adjustmentId } = req.params;

    const adjustment = await BonusAdjustment.findById(adjustmentId);
    if (!adjustment) {
      return res.status(404).json({
        success: false,
        message: "التعديل غير موجود",
      });
    }

    const period = await BonusPeriod.findById(adjustment.period);
    if (period.status !== "pending") {
      return res.status(400).json({
        success: false,
        message: "لا يمكن حذف تعديلات من فترة مغلقة أو مدفوعة",
      });
    }

    await BonusAdjustment.findByIdAndDelete(adjustmentId);

    return res.json({
      success: true,
      message: "تم حذف التعديل بنجاح",
    });
  } catch (err) {
    console.error("Delete adjustment error:", err);
    return res.status(500).json({
      success: false,
      message: "حدث خطأ أثناء حذف التعديل",
    });
  }
};
