// controllers/bonusController.js
const User = require('../models/User');
const BonusConfig = require('../models/BonusConfig');
const BonusPeriod = require('../models/BonusPeriod');

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

    if (typeof isEnabled !== 'boolean') {
      return res.status(400).json({
        success: false,
        message: 'isEnabled يجب أن يكون boolean (true/false)',
      });
    }

    const config = await getConfig();
    const wasEnabled = config.isEnabled;
    config.isEnabled = isEnabled;
    await config.save();

    const now = new Date();

    // When enabling → create NEW open period for EVERY worker
    if (isEnabled && !wasEnabled) {
      const workers = await User.find({ role: 'worker' }).select('_id');

      const newPeriods = workers.map(worker => ({
        user: worker._id,
        startDate: now,
        endDate: null,
        status: 'pending',
        note: 'فتح تلقائي عند تفعيل النظام',
      }));

      if (newPeriods.length > 0) {
        await BonusPeriod.insertMany(newPeriods);
      }
    }

    // When disabling → close ALL open periods (set endDate)
    if (!isEnabled && wasEnabled) {
      const updateResult = await BonusPeriod.updateMany(
        { endDate: null, status: 'pending' },
        { $set: { endDate: now } }
      );

      console.log(`Closed ${updateResult.modifiedCount} open bonus periods`);
    }

    return res.json({
      success: true,
      isEnabled: config.isEnabled,
      message: isEnabled 
        ? 'تم تفعيل نظام البونص وإنشاء فترات جديدة لكل العمال' 
        : 'تم تعطيل نظام البونص وإغلاق جميع الفترات المفتوحة',
    });
  } catch (err) {
    console.error('Toggle bonus error:', err);
    return res.status(500).json({
      success: false,
      message: 'حدث خطأ أثناء تحديث حالة البونص',
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
    console.error('Get bonus status error:', err);
    return res.status(500).json({
      success: false,
      message: 'حدث خطأ في جلب حالة البونص',
    });
  }
};

exports.getWorkerBonus = async (req, res) => {
  try {
    const { workerId } = req.params;

    const worker = await User.findById(workerId);
    if (!worker || worker.role !== 'worker') {
      return res.status(404).json({
        success: false,
        message: 'العامل غير موجود أو ليس له صلاحية worker',
      });
    }

    // Find all pending periods for this worker
    const periods = await BonusPeriod.find({
      user: workerId,
      status: 'pending',
    })

    let totalUnpaid = 0;
    const resultPeriods = [];

    for (const period of periods) {
      // Get the calculated bonus using the virtual
      const bonusValue = await period.totalBonus;  

      console.log('bonusValue', bonusValue) // return 0 but i already create saled, it should return number

      // Get full details using static method
      const fullDetails = await BonusPeriod.calculateForPeriod(period);
      console.log('fullDetails', fullDetails) // return 0 but i already create saled, it should return number

      totalUnpaid += bonusValue;

      resultPeriods.push({
        _id: period._id,
        startDate: period.startDate,
        endDate: period.endDate || 'مفتوحة (حتى الآن)',
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
      unpaidPeriods: resultPeriods,
      totalUnpaidBonus: totalUnpaid,
    });
  } catch (err) {
    console.error('Get worker bonus error:', err);
    return res.status(500).json({
      success: false,
      message: 'حدث خطأ في جلب بيانات البونص لهذا العامل',
    });
  }
};

exports.payWorkerBonus = async (req, res) => {
  try {
    const { workerId } = req.params;

    const worker = await User.findById(workerId);
    if (!worker || worker.role !== 'worker') {
      return res.status(404).json({
        success: false,
        message: 'العامل غير موجود أو ليس له صلاحية worker',
      });
    }

    // Find all pending periods
    const periods = await BonusPeriod.find({
      user: workerId,
      status: 'pending',
    });

    if (periods.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'لا توجد فترات معلقة للدفع',
      });
    }

    // Calculate total to pay (for verification)
    let totalToPay = 0;
    for (const period of periods) {
      totalToPay += await period.totalBonus;
    }

    if (totalToPay <= 0) {
      return res.status(400).json({
        success: false,
        message: 'لا يوجد بونص مستحق للدفع',
      });
    }

    // Mark all pending as paid
    const updateResult = await BonusPeriod.updateMany(
      { user: workerId, status: 'pending' },
      {
        $set: {
          status: 'paid',
          paidAt: new Date(),
          paidBy: req.user._id,  // Assuming req.user is the admin
          note: 'دفع تلقائي كامل',
        },
      }
    );

    return res.json({
      success: true,
      paidAmount: totalToPay,
      updatedPeriods: updateResult.modifiedCount,
      message: `تم دفع البونص الكامل بقيمة ${totalToPay} د.ج`,
    });
  } catch (err) {
    console.error('Pay worker bonus error:', err);
    return res.status(500).json({
      success: false,
      message: 'حدث خطأ في دفع البونص',
    });
  }
};