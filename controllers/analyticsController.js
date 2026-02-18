const Sale = require("../models/Sale");
const Order = require("../models/Order");
const Expense = require("../models/Expense");
const Product = require("../models/Product");
const RevenueChanges = require("../models/RevenuesChanges");

const { parseISO, isSameMonth } = require("date-fns");
const endOfMonth = require("date-fns/endOfMonth");

exports.getFullSummary = async (req, res) => {
  try {
    const { date, type = "day" } = req.query;
    if (!date) {
      return res.status(400).json({ success: false, message: "يرجى تحديد التاريخ" });
    }

    let format;
    if (type === "day") format = "%Y-%m-%d";
    else if (type === "month") format = "%Y-%m";
    else if (type === "year") format = "%Y";

    const isLastDayOfMonth = (inputDate) => {
      const givenDate = parseISO(inputDate);
      const endDate = endOfMonth(givenDate);
      return givenDate.toISOString().slice(0, 10) === endDate.toISOString().slice(0, 10);
    };

    const shortDate = type === "day" ? date : type === "month" ? date.slice(0, 7) : date.slice(0, 4);

    const dateMatches = (d) => {
      const ds = d.toISOString().slice(0, type === "day" ? 10 : type === "month" ? 7 : 4);
      return ds === shortDate;
    };

    // 1. DATE-FILTERED SALES
    const sales = await Sale.find().lean();

    let totalSales = 0;
    let profitSales = 0;

    sales.forEach((sale) => {
      const createdAt = new Date(sale.createdAt);
      const finalPaymentAt = sale.finalPaymentAt ? new Date(sale.finalPaymentAt) : null;

      const discount = sale.discountAmount || 0;
      const currentNet = sale.total - discount;

      // A. Prepaid revenue → on creation (no discount yet)
      if (sale.isPrePaid && dateMatches(createdAt)) {
        totalSales += sale.prepaidAmount || 0;
      }

      // B. Completion: remaining revenue + apply discount + full profit
      if (sale.isPrePaid && finalPaymentAt && dateMatches(finalPaymentAt)) {
        const remaining = sale.total - (sale.prepaidAmount || 0);
        if (remaining > 0) {
          totalSales += remaining;
        }
        totalSales -= discount;           // التخفيض يُطبق هنا فقط
        profitSales += sale.profit;       // الربح الكامل بعد التخفيض والاستبدال
      }

      // C. Normal sale or fully prepaid at creation
      if (!sale.isPrePaid || sale.prepaidAmount >= sale.total) {
        if (dateMatches(createdAt)) {
          totalSales += sale.total - discount;
          profitSales += sale.profit - discount;  // خصم التخفيض من الربح
        }
      }

      // D. Exchange adjustments (discount = 0)
      if (sale.isExchanged && sale.exchanges?.length > 0) {
        sale.exchanges.forEach((ex) => {
          const exchangedAt = new Date(ex.exchangedAt);
          if (dateMatches(exchangedAt)) {
            let adjAmount = ex.priceDifference;

            // Special protection: if negative exchange and total now < prepaid → do NOT deduct
            if (adjAmount < 0 && !sale.finalPaymentAt && sale.total < (sale.prepaidAmount || 0)) {
              adjAmount = 0; // لا ننقص من الماكينة
            }

            totalSales += adjAmount;

            // Profit change = new profit - old profit
            const profitDiff = sale.profit - (sale.profitBeforeExchange || 0);
            profitSales += profitDiff;
          }
        });
      }
    });

    // 2. DATE-FILTERED ORDERS (unchanged)
    const orders = await Order.find({
      $expr: { $eq: [{ $dateToString: { format, date: "$statusUpdatedAt" } }, shortDate] },
      status: "تم الاستلام",
    }).populate("items.product", "originalPrice").lean();

    let totalOrders = 0;
    let profitOrders = 0;

    orders.forEach((order) => {
      totalOrders += order.total - (order.discountAmount || 0);
      profitOrders += order.profit - (order.discountAmount || 0);
    });

    // 3. DATE-FILTERED EXPENSES (unchanged)
    const expenses = await Expense.find({}).lean();
    let totalExpenses = 0;
    let totalNonFixedExpenses = 0;
    let adminExpenses = 0;

    expenses.forEach((exp) => {
      const createdAt = exp.createdAt.toISOString();
      const expDate = createdAt.slice(0, type === "day" ? 10 : type === "month" ? 7 : 4);
      const matches = expDate === shortDate;

      if (exp.admin) {
        if (matches) {
          adminExpenses += exp.amount;
          totalExpenses += exp.amount;
        }
      } else if (!exp.isFixed) {
        if (matches) {
          totalNonFixedExpenses += exp.amount;
          totalExpenses += exp.amount;
        }
      } else {
        if (type === "day" && exp.recurrence === "daily") {
          totalExpenses += exp.amount;
        } else if (type === "month") {
          if (exp.recurrence === "daily") {
            totalExpenses += exp.amount;
          } else if (exp.recurrence === "monthly" && isLastDayOfMonth(date)) {
            if (isSameMonth(parseISO(date), exp.createdAt)) {
              totalExpenses += exp.amount;
            }
          }
        } else if (type === "year") {
          totalExpenses += exp.amount;
        }
      }
    });

    // 4. ALL-TIME VALUES
    let allTimeSales = 0;
    let allTimeSalesProfit = 0;

    sales.forEach((sale) => {
      const discount = sale.discountAmount || 0;
      const net = sale.total - discount;

      if (!sale.isPrePaid) {
        allTimeSales += net;
        allTimeSalesProfit += sale.profit;
        return;
      }

      allTimeSales += sale.prepaidAmount || 0;

      if (sale.finalPaymentAt) {
        const remaining = sale.total - (sale.prepaidAmount || 0);
        allTimeSales += Math.max(0, remaining);
        allTimeSales -= discount;
        allTimeSalesProfit += sale.profit;
      }

      // Special protection for exchanges before completion (all-time)
      if (sale.isExchanged && sale.exchanges?.length > 0 && !sale.finalPaymentAt) {
        sale.exchanges.forEach((ex) => {
          if (ex.priceDifference < 0 && sale.total < (sale.prepaidAmount || 0)) {
            // No deduction
          } else {
            allTimeSales += ex.priceDifference;
          }
        });
      }
    });

    // All-time orders (unchanged)
    const allOrders = await Order.find({
      status: { $in: ["تم الاستلام"] },
    }).populate("items.product", "originalPrice").lean();

    let allTimeOrders = 0;
    let allTimeOrdersProfit = 0;

    allOrders.forEach((order) => {
      allTimeOrders += order.total - (order.discountAmount || 0);
      allTimeOrdersProfit += order.profit - (order.discountAmount || 0);
    });

    // All-time non-fixed expenses
    const nonFixedExpenses = await Expense.find({ isFixed: false, admin: false }).lean();
    const allTimeNonFixed = nonFixedExpenses.reduce((sum, e) => sum + e.amount, 0);

    // All-time revenue changes
    const allRevenueChangesDocs = await RevenueChanges.find({}).lean();
    const allTimeRevenueChanges = allRevenueChangesDocs.reduce((sum, r) => sum + r.amount, 0);

    // CAPITAL (unchanged)
    const products = await Product.find({}).lean();
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

    // FINAL CALCULATIONS
    const turnover = totalSales + totalOrders;
    const totalRevenue = allTimeSales - allTimeNonFixed + allTimeRevenueChanges;
    const netProfit = profitSales + profitOrders - totalExpenses;

    res.json({
      success: true,
      date,
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
        allTimeNonFixed: allTimeNonFixed,
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
    res.status(500).json({ success: false, message: "خطأ في حساب الملخص" });
  }
};

exports.getTotalRevenue = async (req, res) => {
  try {
    const allSales = await Sale.find().lean();
    let allTimeSalesRevenue = 0;

    allSales.forEach((sale) => {
      const discount = sale.discountAmount || 0;
      const net = sale.total - discount;

      if (!sale.isPrePaid) {
        // Normal sale: full amount (with discount)
        allTimeSalesRevenue += net;
        return;
      }

      // Prepaid sale: always count prepaid
      allTimeSalesRevenue += sale.prepaidAmount || 0;

      // Remaining only if completed
      if (sale.finalPaymentAt) {
        const remaining = sale.total - (sale.prepaidAmount || 0);
        allTimeSalesRevenue += Math.max(0, remaining);

        // Apply discount only on completion
        allTimeSalesRevenue -= discount;
      }

      // Exchange impact (already in sale.total, but for special case before completion)
      if (sale.isExchanged && sale.exchanges?.length > 0 && !sale.finalPaymentAt) {
        sale.exchanges.forEach((ex) => {
          if (ex.priceDifference < 0 && sale.total < sale.prepaidAmount) {
            // Do not deduct negative difference if new total < prepaid
            // (no reduction in revenue)
          } else {
            allTimeSalesRevenue += ex.priceDifference;
          }
        });
      }
    });

    const nonFixedExpenses = await Expense.find({ isFixed: false, admin: false }).lean();
    const allTimeNonFixedExpenses = nonFixedExpenses.reduce((sum, e) => sum + e.amount, 0);

    const allRevenueChanges = await RevenueChanges.find().lean();
    const allTimeRevenueChanges = allRevenueChanges.reduce((sum, r) => sum + r.amount, 0);

    const totalRevenue = allTimeSalesRevenue - allTimeNonFixedExpenses + allTimeRevenueChanges;

    res.json({
      success: true,
      totalRevenue,
      breakdown: {
        salesRevenue: allTimeSalesRevenue,
        nonFixedExpenses: allTimeNonFixedExpenses,
        revenueChanges: allTimeRevenueChanges,
      },
    });
  } catch (err) {
    console.error("❌ getTotalRevenue error:", err);
    res.status(500).json({ success: false, message: "خطأ في حساب الإيرادات الكلية" });
  }
};

exports.getRevenueHistory = async (req, res) => {
  try {
    let { date } = req.query;
    if (!date) date = new Date().toISOString().split("T")[0];

    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);

    const endOfDay = new Date(startOfDay);
    endOfDay.setHours(23, 59, 59, 999);

    // A. Revenue BEFORE selected day (historical context)
    const prevDayEnd = new Date(startOfDay);
    prevDayEnd.setMilliseconds(-1);

    const salesBefore = await Sale.find({
      createdAt: { $lte: prevDayEnd },
    }).lean();

    let revenueBefore = 0;

    salesBefore.forEach((s) => {
      const discount = s.discountAmount || 0;
      const net = s.total - discount;

      if (!s.isPrePaid) {
        revenueBefore += net;
      } else {
        revenueBefore += s.prepaidAmount || 0;
        if (s.finalPaymentAt && s.finalPaymentAt <= prevDayEnd) {
          const remaining = s.total - (s.prepaidAmount || 0);
          revenueBefore += Math.max(0, remaining);
          revenueBefore -= discount; // discount applied on completion
        }
      }

      // Exchange special case before completion
      if (s.isExchanged && s.exchanges?.length > 0 && !s.finalPaymentAt) {
        s.exchanges.forEach((ex) => {
          if (ex.priceDifference < 0 && s.total < s.prepaidAmount) {
            // No deduction if new total < prepaid
          } else {
            revenueBefore += ex.priceDifference;
          }
        });
      }
    });

    const expensesBefore = await Expense.find({
      createdAt: { $lte: prevDayEnd },
      isFixed: false,
      admin: false,
    }).lean();
    revenueBefore -= expensesBefore.reduce((s, e) => s + e.amount, 0);

    const rcBefore = await RevenueChanges.find({
      createdAt: { $lte: prevDayEnd },
    }).lean();
    revenueBefore += rcBefore.reduce((s, r) => s + r.amount, 0);

    revenueBefore = Math.round(revenueBefore);

    // B. All operations UP TO AND INCLUDING the selected date
    const salesUpToDate = await Sale.find({
      createdAt: { $lte: endOfDay },
    }).lean();

    let totalSalesUpToDate = 0;

    salesUpToDate.forEach((s) => {
      const discount = s.discountAmount || 0;
      const net = s.total - discount;

      if (!s.isPrePaid) {
        totalSalesUpToDate += net;
      } else {
        totalSalesUpToDate += s.prepaidAmount || 0;
        if (s.finalPaymentAt && s.finalPaymentAt <= endOfDay) {
          const remaining = s.total - (s.prepaidAmount || 0);
          totalSalesUpToDate += Math.max(0, remaining);
          totalSalesUpToDate -= discount;
        }
      }

      // Exchange special case before completion
      if (s.isExchanged && s.exchanges?.length > 0 && !s.finalPaymentAt) {
        s.exchanges.forEach((ex) => {
          if (ex.priceDifference < 0 && s.total < s.prepaidAmount) {
            // No deduction
          } else {
            totalSalesUpToDate += ex.priceDifference;
          }
        });
      }
    });

    const expensesUpToDate = await Expense.find({
      createdAt: { $lte: endOfDay },
      isFixed: false,
      admin: false,
    }).lean();
    const totalExpensesUpToDate = expensesUpToDate.reduce((s, e) => s + e.amount, 0);

    const revenueChangesUpToDate = await RevenueChanges.find({
      createdAt: { $lte: endOfDay },
    }).lean();
    const totalRevenueChangesUpToDate = revenueChangesUpToDate.reduce((s, r) => s + r.amount, 0);

    const totalRevenueUpToDate = Math.round(
      totalSalesUpToDate - totalExpensesUpToDate + totalRevenueChangesUpToDate
    );

    // C. Only changes THAT HAPPENED on the selected day
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

    daySales.forEach((sale) => {
      const createdInDay = sale.createdAt >= startOfDay && sale.createdAt <= endOfDay;
      const completedInDay = sale.finalPaymentAt && sale.finalPaymentAt >= startOfDay && sale.finalPaymentAt <= endOfDay;
      const exchangesInDay = sale.exchanges?.filter((ex) => {
        const exDate = new Date(ex.exchangedAt);
        return exDate >= startOfDay && exDate <= endOfDay;
      }) || [];

      if (sale.isPrePaid) {
        if (createdInDay) {
          changes.push({
            type: "prepaid",
            description: `دفع مسبق - ${sale.barcode}`,
            amount: sale.prepaidAmount || 0,
            timestamp: sale.createdAt,
          });
        }

        if (completedInDay) {
          const remaining = sale.total - (sale.prepaidAmount || 0);
          if (remaining > 0) {
            changes.push({
              type: "final_payment",
              description: `إكمال دفع متبقي - ${sale.barcode}`,
              amount: remaining,
              timestamp: sale.finalPaymentAt,
            });
          }

          if (sale.discountAmount > 0) {
            changes.push({
              type: "discount",
              description: `تطبيق التخفيض - ${sale.barcode}`,
              amount: -sale.discountAmount,
              timestamp: sale.finalPaymentAt,
            });
          }
        }
      } else if (createdInDay) {
        const net = sale.total - (sale.discountAmount || 0);
        changes.push({
          type: "sale",
          description: `بيع عادي - ${sale.barcode}`,
          amount: net,
          timestamp: sale.createdAt,
        });
      }

      // Exchanges with protection
      exchangesInDay.forEach((ex) => {
        let amount = ex.priceDifference;
        // Special rule: if negative difference and new total < prepaid → no deduction
        if (amount < 0 && !sale.finalPaymentAt && sale.total < (sale.prepaidAmount || 0)) {
          amount = 0;
        }
        changes.push({
          type: "exchange",
          description: `استبدال - فرق ${ex.priceDifference} دج - ${sale.barcode}`,
          amount: amount,
          timestamp: ex.exchangedAt,
        });
      });
    });

    dayExpenses.forEach((exp) => {
      changes.push({
        type: "expense",
        description: exp.description,
        amount: -exp.amount,
        timestamp: exp.createdAt,
      });
    });

    dayRC.forEach((rc) => {
      changes.push({
        type: "revenue_change",
        description: rc.description,
        amount: rc.amount,
        timestamp: rc.createdAt,
      });
    });

    changes.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

    let running = revenueBefore;
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

    res.json({
      success: true,
      selectedDate: date,
      revenueBeforeChanges: revenueBefore,
      totalRevenueUpToDate,
      dailyChangesCount: changes.length,
      dailyHistory,
    });
  } catch (err) {
    console.error("Error in getRevenueHistory:", err);
    res.status(500).json({ success: false, message: "خطأ في جلب تاريخ الإيرادات" });
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
