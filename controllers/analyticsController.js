const Sale = require("../models/Sale");
const Order = require("../models/Order");
const Expense = require("../models/Expense");
const Product = require("../models/Product");
const RevenueChanges = require("../models/RevenuesChanges");
const { endOfMonth, parseISO, isSameMonth } = require("date-fns");

exports.getFullSummary = async (req, res) => {
  try {
    const { date, type = "day" } = req.query;
    if (!date) {
      return res
        .status(400)
        .json({ success: false, message: "يرجى تحديد التاريخ" });
    }

    // Determine date format based on type
    let format;
    if (type === "day") format = "%Y-%m-%d";
    else if (type === "month") format = "%Y-%m";
    else if (type === "year") format = "%Y";

    const isLastDayOfMonth = (inputDate) => {
      const givenDate = parseISO(inputDate);
      const endDate = endOfMonth(givenDate);
      return (
        givenDate.toISOString().slice(0, 10) ===
        endDate.toISOString().slice(0, 10)
      );
    };

    const shortDate =
      type === "day"
        ? date
        : type === "month"
          ? date.slice(0, 7)
          : date.slice(0, 4);

    // ================================================
    // 1. DATE-FILTERED SALES CALCULATION
    // ================================================
    const sales = await Sale.find({
      $expr: {
        $or: [
          {
            $eq: [{ $dateToString: { format, date: "$createdAt" } }, shortDate],
          },
          {
            $eq: [{ $dateToString: { format, date: "$updatedAt" } }, shortDate],
          },
        ],
      },
    });

    let totalSales = 0;
    let profitSales = 0;

    sales.forEach((sale) => {
      const createdDate = sale.createdAt.toISOString().slice(0, 10);
      const updatedDate = sale.updatedAt.toISOString().slice(0, 10);
      const isSameDate = createdDate === updatedDate;

      // Case 1: Simple sale or same-day exchange
      if (!sale.isExchanged || isSameDate) {
        const matchDate = type === "day" ? createdDate === date : true;
        if (matchDate) {
          sale.items.forEach((item) => {
            totalSales += item.price * item.quantity;
            profitSales += (item.price - item.originalPrice) * item.quantity;
          });
        }
        return;
      }

      // Case 2: Cross-day exchange
      sale.exchanges.forEach((exchange) => {
        const exchangeDate = new Date(exchange.exchangedAt)
          .toISOString()
          .slice(0, 10);

        // Original sale impact
        const originalMatch = type === "day" ? createdDate === date : true;
        if (originalMatch) {
          totalSales +=
            exchange.originalItem.price * exchange.originalItem.quantity;
          profitSales +=
            (exchange.originalItem.price -
              exchange.originalItem.originalPrice) *
            exchange.originalItem.quantity;
        }

        // Exchange impact
        const exchangeMatch = type === "day" ? exchangeDate === date : true;
        if (exchangeMatch) {
          totalSales += exchange.priceDifference;
          profitSales +=
            (exchange.exchangedWith.price -
              exchange.exchangedWith.originalPrice) *
              exchange.exchangedWith.quantity -
            (exchange.originalItem.price -
              exchange.originalItem.originalPrice) *
              exchange.originalItem.quantity;
        }
      });
    });

    // ================================================
    // 2. DATE-FILTERED ORDERS CALCULATION
    // ================================================
    const orders = await Order.find({
      $expr: {
        $eq: [{ $dateToString: { format, date: "$updatedAt" } }, shortDate],
      },
      $or: [{ status: "تم الاستلام" }, { isPaid: true }],
      status: { $ne: "ارجاع" },
    }).populate("items.product", "originalPrice");

    let totalOrders = 0;
    let profitOrders = 0;

    orders.forEach((order) => {
      order.items.forEach((item) => {
        totalOrders += item.price * item.quantity;
        if (item.product?.originalPrice != null) {
          profitOrders +=
            (item.price - item.product.originalPrice) * item.quantity;
        }
      });
    });

    // ================================================
    // 3. DATE-FILTERED EXPENSES CALCULATION
    // ================================================
    const expenses = await Expense.find({});
    let totalExpenses = 0; // All expenses (for profit calculation)
    let totalNonFixedExpenses = 0; // Non-fixed, non-admin expenses (for revenue calculation)
    let adminExpenses = 0; // Admin expenses (only for profit calculation)

    expenses.forEach((exp) => {
      const createdAt = exp.createdAt.toISOString();
      const expDate = createdAt.slice(
        0,
        type === "day" ? 10 : type === "month" ? 7 : 4,
      );

      // Check if expense matches the date filter
      const dateMatches = expDate === shortDate;

      if (exp.admin) {
        // Admin expenses - only subtract from profit
        if (dateMatches) {
          adminExpenses += exp.amount;
          totalExpenses += exp.amount;
        }
      } else if (!exp.isFixed) {
        // Regular non-fixed expenses - subtract from both revenue and profit
        if (dateMatches) {
          totalNonFixedExpenses += exp.amount;
          totalExpenses += exp.amount;
        }
      } else {
        // Fixed expenses logic (daily/monthly/yearly)
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

    // ================================================
    // 4. ALL-TIME CALCULATIONS (for totalRevenue)
    // ================================================
    // ALL-TIME SALES
    const allSales = await Sale.find();
    let allTimeSales = 0;
    let allTimeSalesProfit = 0;

    allSales.forEach((sale) => {
      if (!sale.isExchanged) {
        sale.items.forEach((item) => {
          allTimeSales += item.price * item.quantity;
          allTimeSalesProfit +=
            (item.price - item.originalPrice) * item.quantity;
        });
        return;
      }

      sale.exchanges.forEach((exchange) => {
        // Original sale
        allTimeSales +=
          exchange.originalItem.price * exchange.originalItem.quantity;
        allTimeSalesProfit +=
          (exchange.originalItem.price - exchange.originalItem.originalPrice) *
          exchange.originalItem.quantity;

        // Exchange adjustment
        allTimeSales += exchange.priceDifference;
        allTimeSalesProfit +=
          (exchange.exchangedWith.price -
            exchange.exchangedWith.originalPrice) *
            exchange.exchangedWith.quantity -
          (exchange.originalItem.price - exchange.originalItem.originalPrice) *
            exchange.originalItem.quantity;
      });
    });

    // ALL-TIME ORDERS
    const allOrders = await Order.find({
      $or: [{ status: "تم الاستلام" }, { isPaid: true }],
      status: { $ne: "ارجاع" },
    }).populate("items.product", "originalPrice");

    let allTimeOrders = 0;
    let allTimeOrdersProfit = 0;

    allOrders.forEach((order) => {
      order.items.forEach((item) => {
        allTimeOrders += item.price * item.quantity;
        if (item.product?.originalPrice != null) {
          allTimeOrdersProfit +=
            (item.price - item.product.originalPrice) * item.quantity;
        }
      });
    });

    // ALL-TIME NON-FIXED EXPENSES (excluding admin expenses)
    const nonFixedExpenses = await Expense.find({
      isFixed: false,
      admin: false,
    });
    const allTimeNonFixedExpenses = nonFixedExpenses.reduce(
      (sum, exp) => sum + exp.amount,
      0,
    );

    // ALL-TIME REVENUE CHANGES
    const allRevenueChanges = await RevenueChanges.find({});
    const allTimeRevenueChanges = allRevenueChanges.reduce(
      (sum, r) => sum + r.amount,
      0,
    );

    // ================================================
    // 5. FINAL CALCULATIONS
    // ================================================
    const turnover = totalSales + totalOrders;
    const totalRevenue =
      allTimeSales +
      allTimeOrders -
      allTimeNonFixedExpenses +
      allTimeRevenueChanges;
    const netProfit = profitSales + profitOrders - totalExpenses; 

    // CAPITAL CALCULATION
    const products = await Product.find({});
    let totalOCapital = 0;
    let totalCapital = 0;
    products.forEach((product) => {
      product.colors.forEach((colorVariant) => {
        colorVariant.sizes.forEach((size) => {
          totalOCapital += size.quantity * product.originalPrice;
        });
      });
    });
    products.forEach((product) => {
      product.colors.forEach((colorVariant) => {
        colorVariant.sizes.forEach((size) => {
          totalCapital += size.quantity * product.price;
        });
      });
    });

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
        allTimeNonFixed: allTimeNonFixedExpenses,
      },
      revenueChanges: allTimeRevenueChanges,
      capital: {
        totalCapital,
        totalOCapital
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
    res
      .status(500)
      .json({
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

// ⚠️ Inventory Alerts
exports.getInventoryAlerts = async (req, res) => {
  try {
    const { minStockThreshold = 10, criticalThreshold = 5 } = req.query;

    const lowStockProducts = await Product.aggregate([
      { $unwind: "$colors" },
      { $unwind: "$colors.sizes" },
      {
        $match: {
          "colors.sizes.quantity": { $lte: parseInt(minStockThreshold) },
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
          status: {
            $cond: {
              if: {
                $lte: ["$colors.sizes.quantity", parseInt(criticalThreshold)],
              },
              then: "critical",
              else: "warning",
            },
          },
        },
      },
      { $sort: { quantity: 1 } },
    ]);

    // Out of stock products
    const outOfStockProducts = await Product.aggregate([
      { $unwind: "$colors" },
      { $unwind: "$colors.sizes" },
      {
        $match: {
          "colors.sizes.quantity": { $eq: 0 },
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
    ]);

    res.json({
      success: true,
      lowStock: lowStockProducts,
      outOfStock: outOfStockProducts,
      summary: {
        lowStockCount: lowStockProducts.length,
        outOfStockCount: outOfStockProducts.length,
        criticalCount: lowStockProducts.filter((p) => p.status === "critical")
          .length,
      },
    });
  } catch (error) {
    console.error("Error in getInventoryAlerts:", error);
    res
      .status(500)
      .json({ success: false, message: "خطأ في جلب تنبيهات المخزون" });
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
