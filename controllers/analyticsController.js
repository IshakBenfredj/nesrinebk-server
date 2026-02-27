const Sale = require("../models/Sale");
const Order = require("../models/Order");
const Expense = require("../models/Expense");
const Product = require("../models/Product");
const RevenueChanges = require("../models/RevenuesChanges");

/**
 * ─────────────────────────────────────────────
 *  HELPER: does a Date fall inside the window?
 * ─────────────────────────────────────────────
 *  type === "day"   → compare YYYY-MM-DD
 *  type === "range" → from (inclusive) .. to (inclusive, end of day)
 */
function makeDateMatcher(type, singleDate, from, to) {
  if (type === "day") {
    return (d) => d.toISOString().slice(0, 10) === singleDate;
  }
  // range
  const fromMs = new Date(from).setHours(0, 0, 0, 0);
  const toMs = new Date(to).setHours(23, 59, 59, 999);
  return (d) => d >= fromMs && d <= toMs;
}

/**
 * ─────────────────────────────────────────────────────────────────
 *  SALES LOGIC  (covers all combinations)
 *
 *  Cases
 *  ─────
 *  A. Normal sale (isPrePaid = false)
 *     • revenue  += total - discount   on createdAt
 *     • profit   += profit - discount  on createdAt
 *
 *  B. PrePaid, NOT yet completed (finalPaymentAt absent)
 *     • revenue  += prepaidAmount      on createdAt
 *     • profit   =  0  (deferred)
 *
 *  C. PrePaid, COMPLETED (finalPaymentAt present)
 *     • revenue  += prepaidAmount              on createdAt
 *     • revenue  += remaining - discount       on finalPaymentAt
 *       (remaining = total - prepaidAmount; if ≤ 0 skip it)
 *       (discount is applied once, on completion)
 *     • profit   += profit                     on finalPaymentAt
 *       (profit already accounts for discount + exchange on the model)
 *
 *  D. Exchange adjustments (isExchanged = true)
 *     discount is ALWAYS ignored for exchanges (= 0)
 *     • For each exchange entry:
 *         revenue += priceDifference           on exchangedAt
 *         profit  += (profit - profitBeforeExchange) on exchangedAt
 *     Special guard (PrePaid + not completed):
 *       if priceDifference < 0 && total < prepaidAmount → skip deduction
 *       (the customer already paid more than the new total; no cash flows back)
 *
 * ─────────────────────────────────────────────────────────────────
 */
function computeSalesForPeriod(sales, dateMatches) {
  let totalSales = 0;
  let profitSales = 0;

  sales.forEach((sale) => {
    const createdAt      = new Date(sale.createdAt);
    const finalPaymentAt = sale.finalPaymentAt ? new Date(sale.finalPaymentAt) : null;
    const exchangedAt    = sale.exchangedAt    ? new Date(sale.exchangedAt)    : null;

    const discount   = sale.discountAmount      || 0;
    const prepaid    = sale.prepaidAmount        || 0;
    const isPrePaid  = sale.isPrePaid;
    const isExchanged = sale.isExchanged;
    const isCompleted = !!finalPaymentAt;

    // فارق السعر بعد الاستبدال = total الجديد - totalBeforeExchange
    const priceDiff  = isExchanged
      ? (sale.total - (sale.totalBeforeExchange || 0))
      : 0;

    // فارق الربح بعد الاستبدال
    const profitDiff = isExchanged
      ? (sale.profit - (sale.profitBeforeExchange || 0))
      : 0;

    /* ══════════════════════════════════
       A. بيع عادي (بدون دفع مسبق)
       ══════════════════════════════════ */
    if (!isPrePaid) {
      if (!isExchanged) {
        // بيع عادي بسيط
        if (dateMatches(createdAt)) {
          totalSales  += sale.total - discount;
          profitSales += sale.profit - discount;
        }
      } else {
        // بيع عادي + استبدال
        // القيمة الأصلية يوم البيع
        if (dateMatches(createdAt)) {
          totalSales  += sale.totalBeforeExchange  || 0;
          profitSales += sale.profitBeforeExchange || 0;
        }
        // فارق الاستبدال يوم exchangedAt
        if (exchangedAt && dateMatches(exchangedAt)) {
          totalSales  += priceDiff;
          profitSales += profitDiff;
        }
      }
    }

    /* ══════════════════════════════════
       B & C. دفع مسبق
       ══════════════════════════════════ */
    if (isPrePaid) {
      // B. المبلغ المسبق دائماً يوم الإنشاء
      if (dateMatches(createdAt)) {
        totalSales += prepaid;
      }

      if (!isExchanged) {
        // C. دفع مسبق بدون استبدال — إكمال الدفع
        if (isCompleted && dateMatches(finalPaymentAt)) {
          const remaining = sale.total - prepaid;
          if (remaining > 0) totalSales += remaining;
          totalSales  -= discount;       // التخفيض مرة واحدة عند الاكتمال
          profitSales += sale.profit;    // الربح الكامل عند الاكتمال
        }
      } else {
        // دفع مسبق + استبدال
        if (!isCompleted) {
          // الدفع لم يكتمل بعد — أضف فارق الاستبدال يوم exchangedAt
          // مع الحماية: إذا total الجديد < prepaid والفارق سالب → لا خصم
          if (exchangedAt && dateMatches(exchangedAt)) {
            const safeDiff = (priceDiff < 0 && sale.total < prepaid) ? 0 : priceDiff;
            totalSales  += safeDiff;
            profitSales += profitDiff;
          }
        } else {
          // الدفع اكتمل بعد الاستبدال
          // فارق الاستبدال يوم exchangedAt
          if (exchangedAt && dateMatches(exchangedAt)) {
            totalSales  += priceDiff;
            profitSales += profitDiff;
          }
          // إكمال الدفع يوم finalPaymentAt
          if (dateMatches(finalPaymentAt)) {
            const remaining = sale.total - prepaid;
            if (remaining > 0) totalSales += remaining;
            // لا discount في حالة الاستبدال
            profitSales += sale.profit - (sale.profitBeforeExchange || 0);
          }
        }
      }
    }
  });

  return { totalSales, profitSales };
}

/**
 * All-time version of the same logic (no date filter needed for some parts,
 * but we still need to accumulate correctly without double-counting).
 *
 * For all-time we don't care WHEN things happened, only WHAT the final state is:
 *   • Normal sale        → total - discount  (once)
 *   • PrePaid, pending   → prepaidAmount     (money already in the machine)
 *   • PrePaid, completed → total - discount  (full amount, once)
 *   • Exchange adj       → + priceDifference (unless guarded)
 *
 * Profit all-time:
 *   • Normal / completed prepaid → sale.profit
 *   • Pending prepaid            → 0 (deferred)
 *   • Exchange delta             → profit - profitBeforeExchange
 */
function computeSalesAllTime(sales) {
  let allTimeSales = 0;
  let allTimeSalesProfit = 0;

  sales.forEach((sale) => {
    const discount = sale.discountAmount || 0;
    const prepaid = sale.prepaidAmount || 0;
    const isPrePaid = sale.isPrePaid;
    const completed = !!sale.finalPaymentAt;

    if (!isPrePaid) {
      allTimeSales += sale.total - discount;
      allTimeSalesProfit += sale.profit - discount;
      return;
    }

    // PrePaid
    if (!completed) {
      allTimeSales += prepaid; // only prepaid has been received
      // profit deferred
    } else {
      allTimeSales += sale.total - discount; // full amount
      allTimeSalesProfit += sale.profit;
    }

    // Exchanges for pending prepaid (guard)
    if (sale.isExchanged && sale.exchanges && !completed) {
      sale.exchanges.forEach((ex) => {
        if (ex.priceDifference < 0 && sale.total < prepaid) return;
        allTimeSales += ex.priceDifference;
      });
    }
  });

  return { allTimeSales, allTimeSalesProfit };
}

/**
 * ─────────────────────────────────────────────
 *  ORDERS LOGIC
 * ─────────────────────────────────────────────
 *  Count only orders with status "تم الاستلام".
 *  Revenue / profit date = statusUpdatedAt.
 */
async function computeOrdersForPeriod(dateMatches, filterQuery) {
  const orders = await Order.find(filterQuery).lean();
  let totalOrders = 0;
  let profitOrders = 0;

  orders.forEach((order) => {
    const d = new Date(order.statusUpdatedAt);
    if (!dateMatches(d)) return;
    totalOrders += order.total - (order.discountAmount || 0);
    profitOrders += order.profit - (order.discountAmount || 0);
  });

  return { totalOrders, profitOrders };
}

/**
 * ─────────────────────────────────────────────
 *  EXPENSES LOGIC
 * ─────────────────────────────────────────────
 *  - admin expenses      → count on createdAt
 *  - non-fixed, non-admin → count on createdAt
 *  - fixed (daily)        → count each matched day
 *  - fixed (monthly)      → count each matched month (once)
 *
 *  For "range" mode we need to know how many days / months are covered.
 */
function computeExpenses(expenses, type, singleDate, from, to) {
  let totalExpenses = 0;
  let adminExpenses = 0;
  let nonFixedExpenses = 0;

  // Helper: how many unique calendar-days in the period
  const daysInRange = () => {
    const msPerDay = 86400000;
    return Math.round((new Date(to) - new Date(from)) / msPerDay) + 1;
  };

  // Helper: how many unique calendar-months in the period
  const monthsInRange = () => {
    const f = new Date(from);
    const t = new Date(to);
    return (
      (t.getFullYear() - f.getFullYear()) * 12 +
      (t.getMonth() - f.getMonth()) +
      1
    );
  };

  const dateMatches = makeDateMatcher(type, singleDate, from, to);

  expenses.forEach((exp) => {
    const createdAt = new Date(exp.createdAt);

    /* ── admin ── */
    if (exp.admin) {
      if (dateMatches(createdAt)) {
        adminExpenses += exp.amount;
        totalExpenses += exp.amount;
      }
      return;
    }

    /* ── non-fixed, non-admin ── */
    if (!exp.isFixed) {
      if (dateMatches(createdAt)) {
        nonFixedExpenses += exp.amount;
        totalExpenses += exp.amount;
      }
      return;
    }

    /* ── fixed ── */
    if (exp.recurrence === "daily") {
      const count = type === "day" ? 1 : daysInRange();
      totalExpenses += exp.amount * count;
    } else if (exp.recurrence === "monthly") {
      const count = type === "day" ? 1 : monthsInRange();
      totalExpenses += exp.amount * count;
    }
  });

  return { totalExpenses, adminExpenses, nonFixedExpenses };
}

/* ═══════════════════════════════════════════════════════════════════
   MAIN CONTROLLER
   ═══════════════════════════════════════════════════════════════════ */
exports.getFullSummary = async (req, res) => {
  try {
    const { type = "day", date, from, to } = req.query;

    /* ── Validate inputs ── */
    if (type === "day" && !date) {
      return res
        .status(400)
        .json({ success: false, message: "يرجى تحديد التاريخ" });
    }
    if (type === "range" && (!from || !to)) {
      return res
        .status(400)
        .json({ success: false, message: "يرجى تحديد من وإلى" });
    }

    const singleDate = type === "day" ? date : null;
    const dateMatches = makeDateMatcher(type, singleDate, from, to);

    /* ── 1. Sales ── */
    const allSales = await Sale.find().lean();
    const { totalSales, profitSales } = computeSalesForPeriod(
      allSales,
      dateMatches,
    );
    const { allTimeSales, allTimeSalesProfit } = computeSalesAllTime(allSales);

    /* ── 2. Orders (period) ── */
    // Fetch all "تم الاستلام" orders then filter by statusUpdatedAt in JS
    // (avoids complex $expr for range queries)
    const { totalOrders, profitOrders } = await computeOrdersForPeriod(
      dateMatches,
      { status: "تم الاستلام" },
    );

    /* ── 3. Orders (all-time) ── */
    const allOrders = await Order.find({ status: "تم الاستلام" }).lean();
    let allTimeOrders = 0;
    let allTimeOrdersProfit = 0;
    allOrders.forEach((o) => {
      allTimeOrders += o.total - (o.discountAmount || 0);
      allTimeOrdersProfit += o.profit - (o.discountAmount || 0);
    });

    /* ── 4. Expenses ── */
    const allExpenses = await Expense.find().lean();
    const { totalExpenses, adminExpenses } = computeExpenses(
      allExpenses,
      type,
      singleDate,
      from,
      to,
    );

    /* ── 5. All-time non-fixed, non-admin expenses (for totalRevenue) ── */
    const allNonFixedExpenses = await Expense.find({
      isFixed: false,
      admin: false,
    }).lean();
    const allTimeNonFixed = allNonFixedExpenses.reduce(
      (s, e) => s + e.amount,
      0,
    );

    /* ── 6. Revenue changes (all-time, for totalRevenue) ── */
    const allRevenueChangesDocs = await RevenueChanges.find().lean();
    const allTimeRevenueChanges = allRevenueChangesDocs.reduce(
      (s, r) => s + r.amount,
      0,
    );

    /* ── 7. Capital ── */
    const products = await Product.find().lean();
    let totalOCapital = 0;
    let totalCapital = 0;
    products.forEach((product) => {
      product.colors.forEach((color) => {
        color.sizes.forEach((size) => {
          totalOCapital += size.quantity * product.originalPrice;
          totalCapital += size.quantity * product.price;
        });
      });
    });

    /* ── 8. Final totals ── */

    // TURNOVER: sum of sales revenue + orders revenue in the selected period
    const turnover = totalSales + totalOrders;

    // NET PROFIT: period profits (sales + orders) minus ALL period expenses
    const netProfit = profitSales + profitOrders - totalExpenses;

    // TOTAL REVENUE (machine): all-time sales - all-time non-fixed/non-admin expenses + revenue changes
    const totalRevenue = allTimeSales - allTimeNonFixed + allTimeRevenueChanges;

    return res.json({
      success: true,
      date: type === "day" ? date : undefined,
      from: type === "range" ? from : undefined,
      to: type === "range" ? to : undefined,
      type,
      sales: {
        totalSales,
        profitSales,
        allTimeSales,
        allTimeSalesProfit,
      },
      orders: {
        totalOrders,
        profitOrders,
        allTimeOrders,
        allTimeOrdersProfit,
      },
      expenses: {
        dateFiltered: totalExpenses,
        adminExpenses,
        allTimeNonFixed,
      },
      revenueChanges: allTimeRevenueChanges,
      capital: {
        totalCapital,
        totalOCapital,
      },
      totals: {
        turnover,
        totalRevenue,
        netProfit,
      },
    });
  } catch (err) {
    console.error("❌ Error in getFullSummary:", err);
    return res
      .status(500)
      .json({ success: false, message: "خطأ في حساب الملخص" });
  }
};

function computeSalesRevenue(sales, filter, opts = {}) {
  const { upTo } = opts;

  // دالة مساعدة: هل التاريخ d يقع ضمن الحد المسموح؟
  const withinBound = (d) => !upTo || d <= upTo;

  let revenue = 0;

  sales.forEach((sale) => {
    // تطبيق الفلتر الخارجي إن وُجد
    if (filter && !filter(sale)) return;

    const discount = sale.discountAmount || 0;
    const prepaid = sale.prepaidAmount || 0;
    const isPrePaid = sale.isPrePaid;
    const finalAt = sale.finalPaymentAt ? new Date(sale.finalPaymentAt) : null;
    const createdAt = new Date(sale.createdAt);

    /* ── A. بيع عادي ── */
    if (!isPrePaid) {
      if (withinBound(createdAt)) {
        revenue += sale.total - discount;
      }
      return;
    }

    /* ── B / C. دفع مسبق ── */
    // B: المبلغ المسبق دائماً يُحسب يوم الإنشاء
    if (withinBound(createdAt)) {
      revenue += prepaid;
    }

    // C: الإكمال
    if (finalAt && withinBound(finalAt)) {
      const remaining = sale.total - prepaid;
      if (remaining > 0) revenue += remaining;
      revenue -= discount; // التخفيض مرة واحدة عند الاكتمال
    }

    /* ── D. استبدال قبل الاكتمال فقط ── */
    // إذا اكتمل الدفع: priceDifference مدمج في sale.total → لا نضيفه مجدداً
    if (sale.isExchanged && sale.exchanges?.length > 0 && !finalAt) {
      sale.exchanges.forEach((ex) => {
        const exAt = new Date(ex.exchangedAt);
        if (!withinBound(exAt)) return;

        let diff = ex.priceDifference;

        // حماية: total الجديد أقل من المسبق + الفارق سالب → لا خصم
        if (diff < 0 && sale.total < prepaid) {
          diff = 0;
        }

        revenue += diff;
      });
    }
  });

  return revenue;
}

/* ═══════════════════════════════════════════════════════════════════
   GET TOTAL REVENUE  —  ماكينة الدفع الكلية (منذ الأزل)
   ═══════════════════════════════════════════════════════════════════ */
exports.getTotalRevenue = async (req, res) => {
  try {
    const allSales = await Sale.find().lean();

    // كل مبيعات المتجر بدون فلتر تاريخ
    const salesRevenue = computeSalesRevenue(allSales);

    // المصاريف غير الثابتة وغير الإدارية فقط
    const nonFixedExpenses = await Expense.find({
      isFixed: false,
      admin: false,
    }).lean();
    const totalNonFixed = nonFixedExpenses.reduce((s, e) => s + e.amount, 0);

    // تغييرات الخزينة
    const allRC = await RevenueChanges.find().lean();
    const totalRC = allRC.reduce((s, r) => s + r.amount, 0);

    const totalRevenue = salesRevenue - totalNonFixed + totalRC;

    return res.json({
      success: true,
      totalRevenue,
      breakdown: {
        salesRevenue,
        nonFixedExpenses: totalNonFixed,
        revenueChanges: totalRC,
      },
    });
  } catch (err) {
    console.error("❌ getTotalRevenue error:", err);
    return res
      .status(500)
      .json({ success: false, message: "خطأ في حساب الإيرادات الكلية" });
  }
};

/* ═══════════════════════════════════════════════════════════════════
   GET REVENUE HISTORY  —  تاريخ الماكينة ليوم محدد
   ═══════════════════════════════════════════════════════════════════ */
exports.getRevenueHistory = async (req, res) => {
  try {
    let { date } = req.query;
    if (!date) date = new Date().toISOString().split("T")[0];

    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);

    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    // نهاية اليوم السابق
    const prevDayEnd = new Date(startOfDay.getTime() - 1);

    // ─────────────────────────────────────────
    //  A. رصيد الماكينة قبل هذا اليوم (revenueBeforeChanges)
    // ─────────────────────────────────────────
    const salesBeforeDay = await Sale.find({
      $or: [
        { createdAt: { $lte: prevDayEnd } },
        { finalPaymentAt: { $lte: prevDayEnd } },
        { "exchanges.exchangedAt": { $lte: prevDayEnd } },
      ],
    }).lean();

    const revenueBefore = (() => {
      // نستخدم computeSalesRevenue مع upTo = prevDayEnd
      const sr = computeSalesRevenue(salesBeforeDay, null, {
        upTo: prevDayEnd,
      });

      const expBefore = 0; // سيُحسب أدناه بشكل منفصل للدقة
      return sr;
    })();

    // المصاريف قبل اليوم
    const expensesBefore = await Expense.find({
      createdAt: { $lte: prevDayEnd },
      isFixed: false,
      admin: false,
    }).lean();
    const totalExpBefore = expensesBefore.reduce((s, e) => s + e.amount, 0);

    // تغييرات الخزينة قبل اليوم
    const rcBefore = await RevenueChanges.find({
      createdAt: { $lte: prevDayEnd },
    }).lean();
    const totalRCBefore = rcBefore.reduce((s, r) => s + r.amount, 0);

    const revenueBeforeDay = Math.round(
      revenueBefore - totalExpBefore + totalRCBefore,
    );

    // ─────────────────────────────────────────
    //  B. الرصيد الكلي حتى نهاية اليوم المحدد
    // ─────────────────────────────────────────
    const salesUpToDate = await Sale.find({
      $or: [
        { createdAt: { $lte: endOfDay } },
        { finalPaymentAt: { $lte: endOfDay } },
        { "exchanges.exchangedAt": { $lte: endOfDay } },
      ],
    }).lean();

    const salesRevUpToDate = computeSalesRevenue(salesUpToDate, null, {
      upTo: endOfDay,
    });

    const expUpToDate = await Expense.find({
      createdAt: { $lte: endOfDay },
      isFixed: false,
      admin: false,
    }).lean();
    const totalExpUpToDate = expUpToDate.reduce((s, e) => s + e.amount, 0);

    const rcUpToDate = await RevenueChanges.find({
      createdAt: { $lte: endOfDay },
    }).lean();
    const totalRCUpToDate = rcUpToDate.reduce((s, r) => s + r.amount, 0);

    const totalRevenueUpToDate = Math.round(
      salesRevUpToDate - totalExpUpToDate + totalRCUpToDate,
    );

    // ─────────────────────────────────────────
    //  C. الأحداث التي وقعت خلال اليوم المحدد
    // ─────────────────────────────────────────
    const daySales = await Sale.find({
      $or: [
        { createdAt: { $gte: startOfDay, $lte: endOfDay } },
        { finalPaymentAt: { $gte: startOfDay, $lte: endOfDay } },
        { "exchanges.exchangedAt": { $gte: startOfDay, $lte: endOfDay } },
      ],
    }).lean();

    const dayExpenses = await Expense.find({
      createdAt: { $gte: startOfDay, $lte: endOfDay },
      isFixed: false,
      admin: false,
    }).lean();

    const dayRC = await RevenueChanges.find({
      createdAt: { $gte: startOfDay, $lte: endOfDay },
    }).lean();

    const changes = [];

    // ── معالجة المبيعات ──
    daySales.forEach((sale) => {
      const discount = sale.discountAmount || 0;
      const prepaid = sale.prepaidAmount || 0;
      const isPrePaid = sale.isPrePaid;
      const finalAt = sale.finalPaymentAt
        ? new Date(sale.finalPaymentAt)
        : null;
      const createdAt = new Date(sale.createdAt);

      const createdInDay = createdAt >= startOfDay && createdAt <= endOfDay;
      const completedInDay =
        finalAt && finalAt >= startOfDay && finalAt <= endOfDay;

      const exchangesInDay = (sale.exchanges || []).filter((ex) => {
        const d = new Date(ex.exchangedAt);
        return d >= startOfDay && d <= endOfDay;
      });

      /* ── بيع عادي ── */
      if (!isPrePaid) {
        if (createdInDay) {
          changes.push({
            type: "sale",
            description: `بيع عادي — ${sale.barcode}`,
            amount: sale.total - discount,
            timestamp: sale.createdAt,
          });
        }
      }

      /* ── دفع مسبق ── */
      if (isPrePaid) {
        // المبلغ المسبق
        if (createdInDay) {
          changes.push({
            type: "prepaid",
            description: `دفع مسبق — ${sale.barcode}`,
            amount: prepaid,
            timestamp: sale.createdAt,
          });
        }

        // إكمال الدفع
        if (completedInDay) {
          const remaining = sale.total - prepaid;

          if (remaining > 0) {
            changes.push({
              type: "final_payment",
              description: `إكمال الدفع المتبقي — ${sale.barcode}`,
              amount: remaining,
              timestamp: sale.finalPaymentAt,
            });
          }

          // التخفيض مرة واحدة عند الاكتمال
          if (discount > 0) {
            changes.push({
              type: "discount",
              description: `تطبيق التخفيض — ${sale.barcode}`,
              amount: -discount,
              timestamp: sale.finalPaymentAt,
            });
          }
        }
      }

      /* ── استبدالات اليوم ── */
      // نُضيف priceDifference فقط إذا لم يكتمل الدفع بعد
      // (إذا اكتمل: priceDifference مدمج في sale.total المحسوب أعلاه)
      if (!finalAt) {
        exchangesInDay.forEach((ex) => {
          let amount = ex.priceDifference;

          // حماية: total جديد < prepaid + فارق سالب → لا خصم
          if (amount < 0 && sale.total < prepaid) {
            amount = 0;
          }

          changes.push({
            type: "exchange",
            description: `استبدال — فرق ${ex.priceDifference > 0 ? "+" : ""}${ex.priceDifference} دج — ${sale.barcode}`,
            amount,
            timestamp: ex.exchangedAt,
          });
        });
      }
    });

    // ── المصاريف ──
    dayExpenses.forEach((exp) => {
      changes.push({
        type: "expense",
        description: exp.description,
        amount: -exp.amount,
        timestamp: exp.createdAt,
      });
    });

    // ── تغييرات الخزينة ──
    dayRC.forEach((rc) => {
      changes.push({
        type: "revenue_change",
        description: rc.description,
        amount: rc.amount,
        timestamp: rc.createdAt,
      });
    });

    // ── ترتيب زمني + رصيد متراكم ──
    changes.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

    let running = revenueBeforeDay;
    const dailyHistory = changes.map((c) => {
      running += c.amount;
      return {
        ...c,
        runningTotalAfter: Math.round(running),
        time: new Date(c.timestamp).toLocaleTimeString("ar-DZ", {
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        }),
      };
    });

    return res.json({
      success: true,
      selectedDate: date,
      revenueBeforeChanges: revenueBeforeDay,
      totalRevenueUpToDate,
      dailyChangesCount: changes.length,
      dailyHistory,
    });
  } catch (err) {
    console.error("❌ getRevenueHistory error:", err);
    return res
      .status(500)
      .json({ success: false, message: "خطأ في جلب تاريخ الإيرادات" });
  }
};

exports.getTopProducts = async (req, res) => {
  try {
    const { period, day, month, year } = req.query;

    if (!period || !year) {
      return res.status(400).json({
        success: false,
        message: "يرجى تحديد الفترة (day أو month أو year) والسنة",
      });
    }

    const yearNum = parseInt(year);
    const monthNum = month ? parseInt(month) : null;
    const dayNum = day ? parseInt(day) : null;

    // Build date match based on period
    const matchDate = (dateField) => {
      const expr = [{ $eq: [{ $year: `$${dateField}` }, yearNum] }];

      if (period === "month" || period === "day") {
        if (!monthNum)
          throw new Error("يجب تحديد الشهر عند اختيار الفترة month أو day");
        expr.push({ $eq: [{ $month: `$${dateField}` }, monthNum] });
      }

      if (period === "day") {
        if (!dayNum) throw new Error("يجب تحديد اليوم عند اختيار الفترة day");
        expr.push({ $eq: [{ $dayOfMonth: `$${dateField}` }, dayNum] });
      }

      return { $expr: { $and: expr } };
    };

    // ===== Helper to get top products =====
    const getTop = (Model, qtyField, totalField) =>
      Model.aggregate([
        { $match: matchDate("createdAt") },
        { $unwind: "$items" },
        {
          $group: {
            _id: {
              product: "$items.product",
              barcode: "$items.barcode",
              color: "$items.color",
              size: "$items.size",
            },
            [totalField]: { $sum: `$items.${qtyField}` },
          },
        },
        { $sort: { [totalField]: -1 } },
        { $limit: 10 },
        {
          $lookup: {
            from: "products",
            localField: "_id.product",
            foreignField: "_id",
            as: "productData",
          },
        },
        { $unwind: "$productData" },
        {
          $project: {
            name: "$productData.name",
            barcode: "$_id.barcode",
            color: "$_id.color",
            size: "$_id.size",
            [totalField]: 1,
          },
        },
      ]);

    const topSales = await getTop(Sale, "quantity", "totalSold");
    const topOrders = await getTop(Order, "quantity", "totalOrdered");

    res.json({ success: true, topSales, topOrders });
  } catch (err) {
    console.error("❌ Error in getTopProducts:", err);
    res.status(500).json({
      success: false,
      message: err.message || "خطأ في جلب أفضل المنتجات",
    });
  }
};

// 📊 Revenue Trend Analysis
exports.getRevenueTrend = async (req, res) => {
  try {
    const { range = "6months" } = req.query;

    let startDate = new Date();
    let groupBy = { $dateToString: { format: "%Y-%m", date: "$createdAt" } };

    switch (range) {
      case "7days":
        startDate.setDate(startDate.getDate() - 7);
        groupBy = { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } };
        break;
      case "30days":
        startDate.setDate(startDate.getDate() - 30);
        groupBy = { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } };
        break;
      case "3months":
        startDate.setMonth(startDate.getMonth() - 3);
        break;
      case "1year":
        startDate.setFullYear(startDate.getFullYear() - 1);
        break;
      default: // 6months
        startDate.setMonth(startDate.getMonth() - 6);
    }

    // Sales trend
    const salesTrend = await Sale.aggregate([
      { $match: { createdAt: { $gte: startDate } } },
      {
        $group: {
          _id: groupBy,
          totalSales: { $sum: "$total" },
          totalProfit: { $sum: "$profit" },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    // Orders trend
    const ordersTrend = await Order.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate },
          $or: [{ status: "تم الاستلام" }, { isPaid: true }],
          status: { $ne: "ارجاع" },
        },
      },
      {
        $group: {
          _id: groupBy,
          totalOrders: { $sum: "$totalPrice" },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    // Combine data
    const combinedData = [];
    const dateMap = new Map();

    salesTrend.forEach((item) => {
      dateMap.set(item._id, {
        date: item._id,
        sales: item.totalSales,
        salesProfit: item.totalProfit,
        salesCount: item.count,
        orders: 0,
        ordersCount: 0,
      });
    });

    ordersTrend.forEach((item) => {
      if (dateMap.has(item._id)) {
        dateMap.get(item._id).orders = item.totalOrders;
        dateMap.get(item._id).ordersCount = item.count;
      } else {
        dateMap.set(item._id, {
          date: item._id,
          sales: 0,
          salesProfit: 0,
          salesCount: 0,
          orders: item.totalOrders,
          ordersCount: item.count,
        });
      }
    });

    const data = Array.from(dateMap.values()).sort((a, b) =>
      a.date.localeCompare(b.date),
    );

    res.json({ success: true, data });
  } catch (error) {
    console.error("Error in getRevenueTrend:", error);
    res
      .status(500)
      .json({ success: false, message: "خطأ في جلب اتجاه الإيرادات" });
  }
};

// 📦 Product Performance Analysis
exports.getProductPerformance = async (req, res) => {
  try {
    const { range = "6months", limit = 10 } = req.query;

    let startDate = new Date();
    switch (range) {
      case "7days":
        startDate.setDate(startDate.getDate() - 7);
        break;
      case "30days":
        startDate.setDate(startDate.getDate() - 30);
        break;
      case "3months":
        startDate.setMonth(startDate.getMonth() - 3);
        break;
      case "1year":
        startDate.setFullYear(startDate.getFullYear() - 1);
        break;
      default: // 6months
        startDate.setMonth(startDate.getMonth() - 6);
    }

    // Sales performance
    const salesPerformance = await Sale.aggregate([
      { $match: { createdAt: { $gte: startDate } } },
      { $unwind: "$items" },
      {
        $group: {
          _id: "$items.product",
          totalSold: { $sum: "$items.quantity" },
          totalRevenue: {
            $sum: { $multiply: ["$items.price", "$items.quantity"] },
          },
          totalProfit: {
            $sum: {
              $multiply: [
                { $subtract: ["$items.price", "$items.originalPrice"] },
                "$items.quantity",
              ],
            },
          },
        },
      },
      {
        $lookup: {
          from: "products",
          localField: "_id",
          foreignField: "_id",
          as: "product",
        },
      },
      { $unwind: "$product" },
      {
        $project: {
          name: "$product.name",
          totalSold: 1,
          totalRevenue: 1,
          totalProfit: 1,
          currentStock: {
            $sum: {
              $map: {
                input: "$product.colors",
                as: "color",
                in: {
                  $sum: "$$color.sizes.quantity",
                },
              },
            },
          },
        },
      },
      { $sort: { totalSold: -1 } },
      { $limit: parseInt(limit) },
    ]);

    // Orders performance
    const ordersPerformance = await Order.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate },
          $or: [{ status: "تم الاستلام" }, { isPaid: true }],
          status: { $ne: "ارجاع" },
        },
      },
      { $unwind: "$items" },
      {
        $group: {
          _id: "$items.product",
          totalOrdered: { $sum: "$items.quantity" },
          orderRevenue: {
            $sum: { $multiply: ["$items.price", "$items.quantity"] },
          },
        },
      },
      {
        $lookup: {
          from: "products",
          localField: "_id",
          foreignField: "_id",
          as: "product",
        },
      },
      { $unwind: "$product" },
      {
        $project: {
          name: "$product.name",
          totalOrdered: 1,
          orderRevenue: 1,
        },
      },
      { $sort: { totalOrdered: -1 } },
      { $limit: parseInt(limit) },
    ]);

    res.json({
      success: true,
      salesPerformance,
      ordersPerformance,
    });
  } catch (error) {
    console.error("Error in getProductPerformance:", error);
    res
      .status(500)
      .json({ success: false, message: "خطأ في جلب أداء المنتجات" });
  }
};

// 👥 Customer Analysis
exports.getCustomerAnalysis = async (req, res) => {
  try {
    const { range = "6months" } = req.query;

    let startDate = new Date();
    switch (range) {
      case "7days":
        startDate.setDate(startDate.getDate() - 7);
        break;
      case "30days":
        startDate.setDate(startDate.getDate() - 30);
        break;
      case "3months":
        startDate.setMonth(startDate.getMonth() - 3);
        break;
      case "1year":
        startDate.setFullYear(startDate.getFullYear() - 1);
        break;
      default: // 6months
        startDate.setMonth(startDate.getMonth() - 6);
    }

    // Order customer analysis
    const customerData = await Order.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate },
          $or: [{ status: "تم الاستلام" }, { isPaid: true }],
          status: { $ne: "ارجاع" },
        },
      },
      {
        $group: {
          _id: { phone: "$phone", name: "$fullName" },
          orderCount: { $sum: 1 },
          totalSpent: { $sum: "$totalPrice" },
          avgOrderValue: { $avg: "$totalPrice" },
          lastOrderDate: { $max: "$createdAt" },
        },
      },
      {
        $addFields: {
          customerSegment: {
            $switch: {
              branches: [
                { case: { $gte: ["$orderCount", 10] }, then: "عملاء مميزون" },
                { case: { $gte: ["$orderCount", 5] }, then: "عملاء منتظمون" },
                { case: { $gte: ["$orderCount", 2] }, then: "عملاء متكررون" },
              ],
              default: "عملاء جدد",
            },
          },
        },
      },
      {
        $group: {
          _id: "$customerSegment",
          count: { $sum: 1 },
          totalRevenue: { $sum: "$totalSpent" },
          avgOrderValue: { $avg: "$avgOrderValue" },
        },
      },
      { $sort: { totalRevenue: -1 } },
    ]);

    // Top customers
    const topCustomers = await Order.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate },
          $or: [{ status: "تم الاستلام" }, { isPaid: true }],
          status: { $ne: "ارجاع" },
        },
      },
      {
        $group: {
          _id: { phone: "$phone", name: "$fullName" },
          orderCount: { $sum: 1 },
          totalSpent: { $sum: "$totalPrice" },
          lastOrder: { $max: "$createdAt" },
        },
      },
      { $sort: { totalSpent: -1 } },
      { $limit: 10 },
      {
        $project: {
          customerName: "$_id.name",
          phone: "$_id.phone",
          orderCount: 1,
          totalSpent: 1,
          lastOrder: 1,
        },
      },
    ]);

    res.json({
      success: true,
      customerSegments: customerData,
      topCustomers,
    });
  } catch (error) {
    console.error("Error in getCustomerAnalysis:", error);
    res
      .status(500)
      .json({ success: false, message: "خطأ في جلب تحليل العملاء" });
  }
};

// 📈 Sales Channels Analysis
exports.getSalesChannels = async (req, res) => {
  try {
    const { range = "6months" } = req.query;

    let startDate = new Date();
    switch (range) {
      case "7days":
        startDate.setDate(startDate.getDate() - 7);
        break;
      case "30days":
        startDate.setDate(startDate.getDate() - 30);
        break;
      case "3months":
        startDate.setMonth(startDate.getMonth() - 3);
        break;
      case "1year":
        startDate.setFullYear(startDate.getFullYear() - 1);
        break;
      default: // 6months
        startDate.setMonth(startDate.getMonth() - 6);
    }

    // Sales (in-store)
    const salesData = await Sale.aggregate([
      { $match: { createdAt: { $gte: startDate } } },
      {
        $group: {
          _id: null,
          count: { $sum: 1 },
          revenue: { $sum: "$total" },
          profit: { $sum: "$profit" },
        },
      },
    ]);

    // Orders (online)
    const ordersData = await Order.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate },
          $or: [{ status: "تم الاستلام" }, { isPaid: true }],
          status: { $ne: "ارجاع" },
        },
      },
      {
        $group: {
          _id: null,
          count: { $sum: 1 },
          revenue: { $sum: "$totalPrice" },
        },
      },
    ]);

    const sales = salesData[0] || { count: 0, revenue: 0, profit: 0 };
    const orders = ordersData[0] || { count: 0, revenue: 0 };

    const totalRevenue = sales.revenue + orders.revenue;

    const channelsData = [
      {
        channel: "المتجر الفعلي",
        count: sales.count,
        revenue: sales.revenue,
        percentage:
          totalRevenue > 0
            ? ((sales.revenue / totalRevenue) * 100).toFixed(1)
            : 0,
        profit: sales.profit,
      },
      {
        channel: "الطلبات أونلاين",
        count: orders.count,
        revenue: orders.revenue,
        percentage:
          totalRevenue > 0
            ? ((orders.revenue / totalRevenue) * 100).toFixed(1)
            : 0,
      },
    ];

    res.json({ success: true, data: channelsData, totalRevenue });
  } catch (error) {
    console.error("Error in getSalesChannels:", error);
    res.status(500).json({ success: false, message: "خطأ في جلب قنوات البيع" });
  }
};

exports.getOrdersSourcesData = async (req, res) => {
  try {
    const { range = "30days" } = req.query;

    let startDate = new Date();
    if (range === "1year") {
      startDate.setFullYear(startDate.getFullYear() - 1);
    } else if (range === "3months") {
      startDate.setMonth(startDate.getMonth() - 3);
    } else if (range === "1day") {
      startDate.setDate(startDate.getDate() - 1);
    } else {
      // default 30 days
      startDate.setDate(startDate.getDate() - 30);
    }

    const sources = await Order.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate },
        },
      },
      {
        $group: {
          _id: "$source",
          count: { $sum: 1 },
          // Optional: total revenue per source
          // revenue: { $sum: "$total" },
        },
      },
      {
        $project: {
          source: "$_id",
          count: 1,
          // revenue: 1,
          _id: 0,
        },
      },
      { $sort: { count: -1 } },
    ]);

    res.json({ success: true, data: sources });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// ⚠️ Inventory Alerts
exports.getInventoryAlerts = async (req, res) => {
  try {
    const { lowStockThreshold = 5 } = req.query; // default threshold = 5

    // Low stock: quantity <= 5 AND quantity > 0
    const lowStockProducts = await Product.aggregate([
      { $unwind: "$colors" },
      { $unwind: "$colors.sizes" },
      {
        $match: {
          $and: [
            { "colors.sizes.quantity": { $gt: 0 } }, // not zero
            { "colors.sizes.quantity": { $lte: parseInt(lowStockThreshold) } }, // <= threshold
          ],
        },
      },
      {
        $project: {
          name: 1,
          color: "$colors.color",
          size: "$colors.sizes.size",
          barcode: "$colors.sizes.barcode",
          quantity: "$colors.sizes.quantity",
          price: 1,
          originalPrice: 1,
          status: "low_stock", // fixed status
        },
      },
      { $sort: { quantity: 1 } }, // lowest first
    ]);

    // Out of stock: quantity exactly 0
    const outOfStockProducts = await Product.aggregate([
      { $unwind: "$colors" },
      { $unwind: "$colors.sizes" },
      {
        $match: {
          "colors.sizes.quantity": 0,
        },
      },
      {
        $project: {
          name: 1,
          color: "$colors.color",
          size: "$colors.sizes.size",
          barcode: "$colors.sizes.barcode",
          quantity: "$colors.sizes.quantity",
          price: 1,
          originalPrice: 1,
          status: "out_of_stock",
        },
      },
      { $sort: { name: 1 } }, // alphabetical for out-of-stock
    ]);

    res.json({
      success: true,
      lowStock: lowStockProducts,
      outOfStock: outOfStockProducts,
      summary: {
        lowStockCount: lowStockProducts.length,
        outOfStockCount: outOfStockProducts.length,
        // No critical count anymore
        totalAlerts: lowStockProducts.length + outOfStockProducts.length,
      },
    });
  } catch (error) {
    console.error("Error in getInventoryAlerts:", error);
    res.status(500).json({
      success: false,
      message: "خطأ في جلب تنبيهات المخزون",
    });
  }
};

// ⏰ Hourly Sales Pattern
exports.getHourlySalesPattern = async (req, res) => {
  try {
    const { date } = req.query;
    let targetDate;

    if (date) {
      targetDate = new Date(date);
    } else {
      targetDate = new Date();
    }

    const startOfDay = new Date(targetDate);
    startOfDay.setHours(0, 0, 0, 0);

    const endOfDay = new Date(targetDate);
    endOfDay.setHours(23, 59, 59, 999);

    // Sales pattern
    const salesPattern = await Sale.aggregate([
      {
        $match: {
          createdAt: { $gte: startOfDay, $lte: endOfDay },
        },
      },
      {
        $group: {
          _id: { $hour: "$createdAt" },
          count: { $sum: 1 },
          revenue: { $sum: "$total" },
          profit: { $sum: "$profit" },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    // Orders pattern
    const ordersPattern = await Order.aggregate([
      {
        $match: {
          createdAt: { $gte: startOfDay, $lte: endOfDay },
        },
      },
      {
        $group: {
          _id: { $hour: "$createdAt" },
          count: { $sum: 1 },
          revenue: { $sum: "$totalPrice" },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    // Create hourly data (0-23)
    const hourlyData = [];
    for (let hour = 0; hour < 24; hour++) {
      const salesData = salesPattern.find((s) => s._id === hour) || {
        count: 0,
        revenue: 0,
        profit: 0,
      };
      const ordersData = ordersPattern.find((o) => o._id === hour) || {
        count: 0,
        revenue: 0,
      };

      hourlyData.push({
        hour: `${hour.toString().padStart(2, "0")}:00`,
        salesCount: salesData.count,
        salesRevenue: salesData.revenue,
        salesProfit: salesData.profit,
        ordersCount: ordersData.count,
        ordersRevenue: ordersData.revenue,
        totalRevenue: salesData.revenue + ordersData.revenue,
      });
    }

    res.json({
      success: true,
      data: hourlyData,
      date: targetDate.toISOString().split("T")[0],
    });
  } catch (error) {
    console.error("Error in getHourlySalesPattern:", error);
    res
      .status(500)
      .json({ success: false, message: "خطأ في جلب نمط المبيعات اليومي" });
  }
};

// 💰 Expense Analysis
exports.getExpenseAnalysis = async (req, res) => {
  try {
    const { range = "6months" } = req.query;

    let startDate = new Date();
    switch (range) {
      case "7days":
        startDate.setDate(startDate.getDate() - 7);
        break;
      case "30days":
        startDate.setDate(startDate.getDate() - 30);
        break;
      case "3months":
        startDate.setMonth(startDate.getMonth() - 3);
        break;
      case "1year":
        startDate.setFullYear(startDate.getFullYear() - 1);
        break;
      default: // 6months
        startDate.setMonth(startDate.getMonth() - 6);
    }

    const expenseAnalysis = await Expense.aggregate([
      { $match: { createdAt: { $gte: startDate } } },
      {
        $group: {
          _id: {
            category: {
              $cond: {
                if: "$admin",
                then: "مصاريف إدارية",
                else: {
                  $cond: {
                    if: "$isFixed",
                    then: "مصاريف ثابتة",
                    else: "مصاريف متغيرة",
                  },
                },
              },
            },
            month: { $dateToString: { format: "%Y-%m", date: "$createdAt" } },
          },
          totalAmount: { $sum: "$amount" },
          count: { $sum: 1 },
        },
      },
      { $sort: { "_id.month": 1 } },
    ]);

    // Category totals
    const categoryTotals = await Expense.aggregate([
      { $match: { createdAt: { $gte: startDate } } },
      {
        $group: {
          _id: {
            $cond: {
              if: "$admin",
              then: "مصاريف إدارية",
              else: {
                $cond: {
                  if: "$isFixed",
                  then: "مصاريف ثابتة",
                  else: "مصاريف متغيرة",
                },
              },
            },
          },
          total: { $sum: "$amount" },
          count: { $sum: 1 },
        },
      },
      { $sort: { total: -1 } },
    ]);

    res.json({
      success: true,
      monthlyExpenses: expenseAnalysis,
      categoryTotals,
    });
  } catch (error) {
    console.error("Error in getExpenseAnalysis:", error);
    res
      .status(500)
      .json({ success: false, message: "خطأ في جلب تحليل المصروفات" });
  }
};
