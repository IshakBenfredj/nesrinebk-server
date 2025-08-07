// const mongoose = require("mongoose");
// const Sale = require("../models/Sale");
// const Order = require("../models/Order");
// const Expense = require("../models/Expense");
// const Product = require("../models/Product");

// exports.getFullSummary = async (req, res) => {
//   try {
//     const { date, type = "day" } = req.query;
//     if (!date) {
//       return res
//         .status(400)
//         .json({ success: false, message: "يرجى تحديد التاريخ" });
//     }

//     let format;
//     if (type === "day") format = "%Y-%m-%d";
//     else if (type === "month") format = "%Y-%m";
//     else if (type === "year") format = "%Y";

//     /** ✅ 1. حساب المبيعات */
//     const sales = await Sale.find({
//       $expr: {
//         $or: [
//           {
//             $eq: [
//               { $dateToString: { format, date: "$createdAt" } },
//               type === "day"
//                 ? date
//                 : type === "month"
//                 ? date.slice(0, 7)
//                 : date.slice(0, 4),
//             ],
//           },
//           {
//             $eq: [
//               { $dateToString: { format, date: "$updatedAt" } },
//               type === "day"
//                 ? date
//                 : type === "month"
//                 ? date.slice(0, 7)
//                 : date.slice(0, 4),
//             ],
//           },
//         ],
//       },
//     });

//     let totalSales = 0;
//     let profitSales = 0;

//     sales.forEach((sale) => {
//       const createdDate = sale.createdAt.toISOString().slice(0, 10);
//       const updatedDate = sale.updatedAt.toISOString().slice(0, 10);

//       if (!sale.isExchanged || createdDate === updatedDate) {
//         if (createdDate === date) {
//           totalSales += sale.total;
//           profitSales += sale.profit;
//         }
//       } else {
//         sale.exchanges.forEach((ex) => {
//           const originalProfit =
//             (ex.originalItem.price - ex.originalItem.originalPrice) *
//             ex.originalItem.quantity;
//           const exchangedProfit =
//             (ex.exchangedWith.price - ex.exchangedWith.originalPrice) *
//             ex.exchangedWith.quantity;

//           if (createdDate === date) {
//             totalSales += ex.originalItem.price * ex.originalItem.quantity;
//             profitSales += originalProfit;
//           }

//           if (updatedDate === date) {
//             totalSales += ex.priceDifference;
//             profitSales += exchangedProfit - originalProfit;
//           }
//         });
//       }
//     });

//     /** ✅ 2. حساب الطلبيات */
//     const orders = await Order.find({
//       $expr: {
//         $eq: [
//           { $dateToString: { format, date: "$updatedAt" } },
//           type === "day"
//             ? date
//             : type === "month"
//             ? date.slice(0, 7)
//             : date.slice(0, 4),
//         ],
//       },
//       $or: [{ status: "تم الاستلام" }, { isPaid: true }],
//     }).populate("items.product", "originalPrice");

//     let totalOrders = 0;
//     let profitOrders = 0;

//     orders.forEach((order) => {
//       order.items.forEach((item) => {
//         totalOrders += item.price * item.quantity;

//         const product = item.product;
//         if (product && product.originalPrice != null) {
//           profitOrders += (item.price - product.originalPrice) * item.quantity;
//         }
//       });
//     });

//     /** ✅ 3. حساب المصاريف */
//     const expenses = await Expense.find({
//       $expr: {
//         $eq: [
//           { $dateToString: { format, date: "$createdAt" } },
//           type === "day"
//             ? date
//             : type === "month"
//             ? date.slice(0, 7)
//             : date.slice(0, 4),
//         ],
//       },
//     });
//     const totalExpenses = expenses.reduce((sum, e) => sum + e.amount, 0);

//     /** ✅ 4. حساب رأس المال */
//     const products = await Product.find({});
//     let totalCapital = 0;

//     products.forEach((product) => {
//       product.colors.forEach((colorVariant) => {
//         colorVariant.sizes.forEach((size) => {
//           totalCapital += size.quantity * product.originalPrice;
//         });
//       });
//     });

//     /** ✅ 5. حساب الإجماليات */
//     const totalRevenue = totalSales + totalOrders - totalExpenses;
//     const netProfit = profitSales + profitOrders - totalExpenses;

//     res.json({
//       success: true,
//       date,
//       type,
//       sales: { totalSales, profitSales },
//       orders: { totalOrders, profitOrders },
//       expenses: totalExpenses,
//       capital: totalCapital, // ✅ رأس المال
//       totals: { totalRevenue, netProfit },
//     });
//   } catch (err) {
//     console.error("❌ Error in getFullSummary:", err);
//     res.status(500).json({ success: false, message: "خطأ في حساب الملخص" });
//   }
// };

// #############################################################################################################
// #############################################################################################################
// #############################################################################################################
// #############################################################################################################

// const Sale = require("../models/Sale");
// const Order = require("../models/Order");
// const Expense = require("../models/Expense");
// const Product = require("../models/Product");
// const RevenueChanges = require("../models/RevenuesChanges");

// exports.getFullSummary = async (req, res) => {
//   try {
//     const { date, type = "day" } = req.query;
//     if (!date) {
//       return res
//         .status(400)
//         .json({ success: false, message: "يرجى تحديد التاريخ" });
//     }

//     let format;
//     if (type === "day") format = "%Y-%m-%d";
//     else if (type === "month") format = "%Y-%m";
//     else if (type === "year") format = "%Y";

//     /** ✅ 1. حساب المبيعات */
//     const sales = await Sale.find({
//       $expr: {
//         $or: [
//           {
//             $eq: [
//               { $dateToString: { format, date: "$createdAt" } },
//               type === "day"
//                 ? date
//                 : type === "month"
//                 ? date.slice(0, 7)
//                 : date.slice(0, 4),
//             ],
//           },
//           {
//             $eq: [
//               { $dateToString: { format, date: "$updatedAt" } },
//               type === "day"
//                 ? date
//                 : type === "month"
//                 ? date.slice(0, 7)
//                 : date.slice(0, 4),
//             ],
//           },
//         ],
//       },
//     });

//     let totalSales = 0;
//     let profitSales = 0;

//     sales.forEach((sale) => {
//       const createdDate = sale.createdAt.toISOString().slice(0, 10);
//       const updatedDate = sale.updatedAt.toISOString().slice(0, 10);

//       if (!sale.isExchanged || createdDate === updatedDate) {
//         if (createdDate === date) {
//           totalSales += sale.total;
//           profitSales += sale.profit;
//         }
//       } else {
//         sale.exchanges.forEach((ex) => {
//           const originalProfit =
//             (ex.originalItem.price - ex.originalItem.originalPrice) *
//             ex.originalItem.quantity;
//           const exchangedProfit =
//             (ex.exchangedWith.price - ex.exchangedWith.originalPrice) *
//             ex.exchangedWith.quantity;

//           if (createdDate === date) {
//             totalSales += ex.originalItem.price * ex.originalItem.quantity;
//             profitSales += originalProfit;
//           }

//           if (updatedDate === date) {
//             totalSales += ex.priceDifference;
//             profitSales += exchangedProfit - originalProfit;
//           }
//         });
//       }
//     });

//     /** ✅ 2. حساب الطلبيات */
//     const orders = await Order.find({
//       $expr: {
//         $eq: [
//           { $dateToString: { format, date: "$updatedAt" } },
//           type === "day"
//             ? date
//             : type === "month"
//             ? date.slice(0, 7)
//             : date.slice(0, 4),
//         ],
//       },
//       $or: [{ status: "تم الاستلام" }, { isPaid: true }],
//     }).populate("items.product", "originalPrice");

//     let totalOrders = 0;
//     let profitOrders = 0;

//     orders.forEach((order) => {
//       order.items.forEach((item) => {
//         totalOrders += item.price * item.quantity;

//         const product = item.product;
//         if (product && product.originalPrice != null) {
//           profitOrders += (item.price - product.originalPrice) * item.quantity;
//         }
//       });
//     });

//     /** ✅ 3. حساب المصاريف (حسب التاريخ المحدد) */
//     const expensesByDate = await Expense.find({
//       $expr: {
//         $eq: [
//           { $dateToString: { format, date: "$createdAt" } },
//           type === "day"
//             ? date
//             : type === "month"
//             ? date.slice(0, 7)
//             : date.slice(0, 4),
//         ],
//       },
//     });
//     const totalExpenses = expensesByDate.reduce((sum, e) => sum + e.amount, 0);

//     /** ✅ 4. حساب التغييرات في الخزنة (كل الوقت) */
//     const revChanges = await RevenueChanges.find({});
//     const revenueChangesSum = revChanges.reduce((sum, r) => sum + r.amount, 0);

//     /** ✅ 5. حساب رأس المال */
//     const products = await Product.find({});
//     let totalCapital = 0;
//     products.forEach((product) => {
//       product.colors.forEach((colorVariant) => {
//         colorVariant.sizes.forEach((size) => {
//           totalCapital += size.quantity * product.originalPrice;
//         });
//       });
//     });

//     /** ✅ 6. حساب الإجماليات */
//     const totalRevenue =
//       totalSales + totalOrders - totalExpenses + revenueChangesSum;
//     const netProfit = profitSales + profitOrders - totalExpenses;

//     res.json({
//       success: true,
//       date,
//       type,
//       sales: { totalSales, profitSales },
//       orders: { totalOrders, profitOrders },
//       expenses: totalExpenses,
//       revenueChanges: revenueChangesSum,
//       capital: totalCapital,
//       totals: { totalRevenue, netProfit },
//     });
//   } catch (err) {
//     console.error("❌ Error in getFullSummary:", err);
//     res.status(500).json({ success: false, message: "خطأ في حساب الملخص" });
//   }
// };


//############################################### 
//############################################### 
//###############################################


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
      return res.status(400).json({ success: false, message: "يرجى تحديد التاريخ" });
    }

    // Determine date format based on type
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

    // ================================================
    // 1. DATE-FILTERED SALES CALCULATION
    // ================================================
    const sales = await Sale.find({
      $expr: {
        $or: [
          { $eq: [{ $dateToString: { format, date: "$createdAt" } }, shortDate] },
          { $eq: [{ $dateToString: { format, date: "$updatedAt" } }, shortDate] },
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
          sale.items.forEach(item => {
            totalSales += item.price * item.quantity;
            profitSales += (item.price - item.originalPrice) * item.quantity;
          });
        }
        return;
      }

      // Case 2: Cross-day exchange
      sale.exchanges.forEach((exchange) => {
        const exchangeDate = new Date(exchange.exchangedAt).toISOString().slice(0, 10);
        
        // Original sale impact
        const originalMatch = type === "day" ? createdDate === date : true;
        if (originalMatch) {
          totalSales += exchange.originalItem.price * exchange.originalItem.quantity;
          profitSales += (exchange.originalItem.price - exchange.originalItem.originalPrice) * 
                        exchange.originalItem.quantity;
        }
        
        // Exchange impact
        const exchangeMatch = type === "day" ? exchangeDate === date : true;
        if (exchangeMatch) {
          totalSales += exchange.priceDifference;
          profitSales += (exchange.exchangedWith.price - exchange.exchangedWith.originalPrice) * 
                        exchange.exchangedWith.quantity -
                        (exchange.originalItem.price - exchange.originalItem.originalPrice) * 
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
          profitOrders += (item.price - item.product.originalPrice) * item.quantity;
        }
      });
    });

    // ================================================
    // 3. DATE-FILTERED EXPENSES CALCULATION
    // ================================================
    const expenses = await Expense.find({});
    let totalExpenses = 0;              // All expenses (for profit calculation)
    let totalNonFixedExpenses = 0;       // Non-fixed, non-admin expenses (for revenue calculation)
    let adminExpenses = 0;               // Admin expenses (only for profit calculation)

    expenses.forEach((exp) => {
      const createdAt = exp.createdAt.toISOString();
      const expDate = createdAt.slice(0, type === "day" ? 10 : type === "month" ? 7 : 4);

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
        sale.items.forEach(item => {
          allTimeSales += item.price * item.quantity;
          allTimeSalesProfit += (item.price - item.originalPrice) * item.quantity;
        });
        return;
      }

      sale.exchanges.forEach((exchange) => {
        // Original sale
        allTimeSales += exchange.originalItem.price * exchange.originalItem.quantity;
        allTimeSalesProfit += (exchange.originalItem.price - exchange.originalItem.originalPrice) * 
                            exchange.originalItem.quantity;
        
        // Exchange adjustment
        allTimeSales += exchange.priceDifference;
        allTimeSalesProfit += (exchange.exchangedWith.price - exchange.exchangedWith.originalPrice) * 
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
          allTimeOrdersProfit += (item.price - item.product.originalPrice) * item.quantity;
        }
      });
    });

    // ALL-TIME NON-FIXED EXPENSES (excluding admin expenses)
    const nonFixedExpenses = await Expense.find({ isFixed: false, admin: false });
    const allTimeNonFixedExpenses = nonFixedExpenses.reduce((sum, exp) => sum + exp.amount, 0);

    // ALL-TIME REVENUE CHANGES
    const allRevenueChanges = await RevenueChanges.find({});
    const allTimeRevenueChanges = allRevenueChanges.reduce((sum, r) => sum + r.amount, 0);

    // ================================================
    // 5. FINAL CALCULATIONS
    // ================================================
    const turnover = totalSales + totalOrders;
    const totalRevenue = allTimeSales + allTimeOrders - allTimeNonFixedExpenses + allTimeRevenueChanges;
    const netProfit = profitSales + profitOrders - totalExpenses; // Includes admin expenses

    // CAPITAL CALCULATION
    const products = await Product.find({});
    let totalCapital = 0;
    products.forEach((product) => {
      product.colors.forEach((colorVariant) => {
        colorVariant.sizes.forEach((size) => {
          totalCapital += size.quantity * product.originalPrice;
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
      capital: totalCapital,
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


// const Sale = require("../models/Sale");
// const Order = require("../models/Order");
// const Expense = require("../models/Expense");
// const Product = require("../models/Product");
// const RevenueChanges = require("../models/RevenuesChanges");
// const { endOfMonth, parseISO, isSameMonth } = require("date-fns");

// exports.getFullSummary = async (req, res) => {
//   try {
//     const { date, type = "day" } = req.query;
//     if (!date) {
//       return res.status(400).json({ success: false, message: "يرجى تحديد التاريخ" });
//     }

//     // Determine date format based on type
//     let format;
//     if (type === "day") format = "%Y-%m-%d";
//     else if (type === "month") format = "%Y-%m";
//     else if (type === "year") format = "%Y";

//     const isLastDayOfMonth = (inputDate) => {
//       const givenDate = parseISO(inputDate);
//       const endDate = endOfMonth(givenDate);
//       return givenDate.toISOString().slice(0, 10) === endDate.toISOString().slice(0, 10);
//     };

//     const shortDate = type === "day" ? date : type === "month" ? date.slice(0, 7) : date.slice(0, 4);

//     // ================================================
//     // 1. DATE-FILTERED SALES CALCULATION
//     // ================================================
//     const sales = await Sale.find({
//       $expr: {
//         $or: [
//           { $eq: [{ $dateToString: { format, date: "$createdAt" } }, shortDate] },
//           { $eq: [{ $dateToString: { format, date: "$updatedAt" } }, shortDate] },
//         ],
//       },
//     });

//     let totalSales = 0;
//     let profitSales = 0;

//     sales.forEach((sale) => {
//       const createdDate = sale.createdAt.toISOString().slice(0, 10);
//       const updatedDate = sale.updatedAt.toISOString().slice(0, 10);
//       const isSameDate = createdDate === updatedDate;

//       // Case 1: Simple sale or same-day exchange
//       if (!sale.isExchanged || isSameDate) {
//         const matchDate = type === "day" ? createdDate === date : true;
//         if (matchDate) {
//           sale.items.forEach(item => {
//             totalSales += item.price * item.quantity;
//             profitSales += (item.price - item.originalPrice) * item.quantity;
//           });
//         }
//         return;
//       }

//       // Case 2: Cross-day exchange
//       sale.exchanges.forEach((exchange) => {
//         const exchangeDate = new Date(exchange.exchangedAt).toISOString().slice(0, 10);
        
//         // Original sale impact
//         const originalMatch = type === "day" ? createdDate === date : true;
//         if (originalMatch) {
//           totalSales += exchange.originalItem.price * exchange.originalItem.quantity;
//           profitSales += (exchange.originalItem.price - exchange.originalItem.originalPrice) * 
//                         exchange.originalItem.quantity;
//         }
        
//         // Exchange impact
//         const exchangeMatch = type === "day" ? exchangeDate === date : true;
//         if (exchangeMatch) {
//           totalSales += exchange.priceDifference;
//           profitSales += (exchange.exchangedWith.price - exchange.exchangedWith.originalPrice) * 
//                         exchange.exchangedWith.quantity -
//                         (exchange.originalItem.price - exchange.originalItem.originalPrice) * 
//                         exchange.originalItem.quantity;
//         }
//       });
//     });

//     // ================================================
//     // 2. DATE-FILTERED ORDERS CALCULATION
//     // ================================================
//     const orders = await Order.find({
//       $expr: {
//         $eq: [{ $dateToString: { format, date: "$updatedAt" } }, shortDate],
//       },
//       $or: [{ status: "تم الاستلام" }, { isPaid: true }],
//       status: { $ne: "ارجاع" },
//     }).populate("items.product", "originalPrice");

//     let totalOrders = 0;
//     let profitOrders = 0;

//     orders.forEach((order) => {
//       order.items.forEach((item) => {
//         totalOrders += item.price * item.quantity;
//         if (item.product?.originalPrice != null) {
//           profitOrders += (item.price - item.product.originalPrice) * item.quantity;
//         }
//       });
//     });

//     // ================================================
//     // 3. DATE-FILTERED EXPENSES CALCULATION
//     // ================================================
//     const expenses = await Expense.find({});
//     let totalExpenses = 0;
//     let totalNonFixedExpenses = 0;

//     expenses.forEach((exp) => {
//       const createdAt = exp.createdAt.toISOString();
//       const expDate = createdAt.slice(0, type === "day" ? 10 : type === "month" ? 7 : 4);

//       if (!exp.isFixed && expDate === shortDate) {
//         totalNonFixedExpenses += exp.amount;
//         totalExpenses += exp.amount;
//       }

//       if (exp.isFixed) {
//         if (type === "day" && exp.recurrence === "daily") {
//           totalExpenses += exp.amount;
//         } else if (type === "month") {
//           if (exp.recurrence === "daily") {
//             totalExpenses += exp.amount;
//           } else if (exp.recurrence === "monthly" && isLastDayOfMonth(date)) {
//             if (isSameMonth(parseISO(date), exp.createdAt)) {
//               totalExpenses += exp.amount;
//             }
//           }
//         } else if (type === "year") {
//           totalExpenses += exp.amount;
//         }
//       }
//     });

//     // ================================================
//     // 4. ALL-TIME CALCULATIONS (for totalRevenue)
//     // ================================================
//     // ALL-TIME SALES
//     const allSales = await Sale.find();
//     let allTimeSales = 0;
//     let allTimeSalesProfit = 0;

//     allSales.forEach((sale) => {
//       if (!sale.isExchanged) {
//         sale.items.forEach(item => {
//           allTimeSales += item.price * item.quantity;
//           allTimeSalesProfit += (item.price - item.originalPrice) * item.quantity;
//         });
//         return;
//       }

//       sale.exchanges.forEach((exchange) => {
//         // Original sale
//         allTimeSales += exchange.originalItem.price * exchange.originalItem.quantity;
//         allTimeSalesProfit += (exchange.originalItem.price - exchange.originalItem.originalPrice) * 
//                             exchange.originalItem.quantity;
        
//         // Exchange adjustment
//         allTimeSales += exchange.priceDifference;
//         allTimeSalesProfit += (exchange.exchangedWith.price - exchange.exchangedWith.originalPrice) * 
//                             exchange.exchangedWith.quantity -
//                             (exchange.originalItem.price - exchange.originalItem.originalPrice) * 
//                             exchange.originalItem.quantity;
//       });
//     });

//     // ALL-TIME ORDERS
//     const allOrders = await Order.find({
//       $or: [{ status: "تم الاستلام" }, { isPaid: true }],
//       status: { $ne: "ارجاع" },
//     }).populate("items.product", "originalPrice");

//     let allTimeOrders = 0;
//     let allTimeOrdersProfit = 0;

//     allOrders.forEach((order) => {
//       order.items.forEach((item) => {
//         allTimeOrders += item.price * item.quantity;
//         if (item.product?.originalPrice != null) {
//           allTimeOrdersProfit += (item.price - item.product.originalPrice) * item.quantity;
//         }
//       });
//     });

//     // ALL-TIME NON-FIXED EXPENSES
//     const nonFixedExpenses = await Expense.find({ isFixed: false });
//     const allTimeNonFixedExpenses = nonFixedExpenses.reduce((sum, exp) => sum + exp.amount, 0);

//     // ALL-TIME REVENUE CHANGES
//     const allRevenueChanges = await RevenueChanges.find({});
//     const allTimeRevenueChanges = allRevenueChanges.reduce((sum, r) => sum + r.amount, 0);

//     // ================================================
//     // 5. FINAL CALCULATIONS
//     // ================================================
//     const turnover = totalSales + totalOrders;
//     const totalRevenue = allTimeSales + allTimeOrders - allTimeNonFixedExpenses + allTimeRevenueChanges;
//     const netProfit = profitSales + profitOrders - totalExpenses;

//     // CAPITAL CALCULATION
//     const products = await Product.find({});
//     let totalCapital = 0;
//     products.forEach((product) => {
//       product.colors.forEach((colorVariant) => {
//         colorVariant.sizes.forEach((size) => {
//           totalCapital += size.quantity * product.originalPrice;
//         });
//       });
//     });

//     res.json({
//       success: true,
//       date,
//       type,
//       sales: {
//         totalSales,
//         profitSales,
//         allTimeSales,
//         allTimeSalesProfit,
//       },
//       orders: {
//         totalOrders,
//         profitOrders,
//         allTimeOrders,
//         allTimeOrdersProfit,
//       },
//       expenses: {
//         dateFiltered: totalExpenses,
//         allTimeNonFixed: allTimeNonFixedExpenses,
//       },
//       revenueChanges: allTimeRevenueChanges,
//       capital: totalCapital,
//       totals: {
//         turnover,
//         totalRevenue,
//         netProfit,
//       },
//     });
//   } catch (err) {
//     console.error("❌ Error in getFullSummary:", err);
//     res.status(500).json({ success: false, message: "خطأ في حساب الملخص" });
//   }
// };

// exports.getFullSummary = async (req, res) => {
//   try {
//     const { date, type = "day" } = req.query;
//     if (!date) {
//       return res
//         .status(400)
//         .json({ success: false, message: "يرجى تحديد التاريخ" });
//     }

//     let format;
//     if (type === "day") format = "%Y-%m-%d";
//     else if (type === "month") format = "%Y-%m";
//     else if (type === "year") format = "%Y";

//     const isLastDayOfMonth = (inputDate) => {
//       const givenDate = parseISO(inputDate);
//       const endDate = endOfMonth(givenDate);
//       return (
//         givenDate.toISOString().slice(0, 10) ===
//         endDate.toISOString().slice(0, 10)
//       );
//     };

//     const shortDate =
//       type === "day"
//         ? date
//         : type === "month"
//         ? date.slice(0, 7)
//         : date.slice(0, 4);

//     // ================================================
//     // 1. DATE-FILTERED SALES CALCULATION
//     // ================================================

//     const sales = await Sale.find({
//       $expr: {
//         $or: [
//           {
//             $eq: [{ $dateToString: { format, date: "$createdAt" } }, shortDate],
//           },
//           {
//             $eq: [{ $dateToString: { format, date: "$updatedAt" } }, shortDate],
//           },
//         ],
//       },
//     });

//     let totalSales = 0;
//     let profitSales = 0;

//     sales.forEach((sale) => {
//       const createdDate = sale.createdAt.toISOString().slice(0, 10);
//       const updatedDate = sale.updatedAt.toISOString().slice(0, 10);
//       const isSameDate = createdDate === updatedDate;

//       // Case 1: Simple sale (no exchange)
//       if (!sale.isExchanged) {
//         if (createdDate === date) {
//           totalSales += sale.total;
//           profitSales += sale.profit;
//         }
//         return;
//       }

//       // Case 2: Exchange happened on same day
//       if (isSameDate && createdDate === date) {
//         totalSales += sale.total;
//         profitSales += sale.profit;
//         return;
//       }

//       // Case 3: Exchange happened on different days
//       sale.exchanges.forEach((exchange) => {
//         const exchangeDate = new Date(exchange.exchangedAt)
//           .toISOString()
//           .slice(0, 10);

//         // Original sale impact (on creation date)
//         if (createdDate === date) {
//           totalSales +=
//             exchange.originalItem.price * exchange.originalItem.quantity;
//           profitSales +=
//             (exchange.originalItem.price -
//               exchange.originalItem.originalPrice) *
//             exchange.originalItem.quantity;
//         }

//         // Exchange impact (on exchange date)
//         if (exchangeDate === date) {
//           totalSales += exchange.priceDifference;
//           profitSales +=
//             (exchange.exchangedWith.price -
//               exchange.exchangedWith.originalPrice) *
//               exchange.exchangedWith.quantity -
//             (exchange.originalItem.price -
//               exchange.originalItem.originalPrice) *
//               exchange.originalItem.quantity;
//         }
//       });
//     });

//     // ================================================
//     // 2. DATE-FILTERED ORDERS CALCULATION
//     // ================================================

//     const orders = await Order.find({
//       $expr: {
//         $eq: [{ $dateToString: { format, date: "$updatedAt" } }, shortDate],
//       },
//       $or: [{ status: "تم الاستلام" }, { isPaid: true }],
//       status: { $ne: "ارجاع" },
//     }).populate("items.product", "originalPrice");

//     let totalOrders = 0;
//     let profitOrders = 0;

//     orders.forEach((order) => {
//       order.items.forEach((item) => {
//         totalOrders += item.price * item.quantity;

//         const product = item.product;
//         if (product && product.originalPrice != null) {
//           profitOrders += (item.price - product.originalPrice) * item.quantity;
//         }
//       });
//     });

//     // ================================================
//     // 3. DATE-FILTERED EXPENSES CALCULATION
//     // ================================================

//     const expenses = await Expense.find({});
//     let totalExpenses = 0;
//     let totalNonFixedExpenses = 0;

//     expenses.forEach((exp) => {
//       const createdAt = exp.createdAt.toISOString();
//       const expDate = createdAt.slice(
//         0,
//         type === "day" ? 10 : type === "month" ? 7 : 4
//       );

//       if (!exp.isFixed && expDate === shortDate) {
//         totalNonFixedExpenses += exp.amount;
//         totalExpenses += exp.amount;
//       }

//       if (exp.isFixed) {
//         if (type === "day" && exp.recurrence === "daily") {
//           totalExpenses += exp.amount;
//         } else if (type === "month") {
//           if (exp.recurrence === "daily") {
//             totalExpenses += exp.amount;
//           } else if (exp.recurrence === "monthly" && isLastDayOfMonth(date)) {
//             if (isSameMonth(parseISO(date), exp.createdAt)) {
//               totalExpenses += exp.amount;
//             }
//           }
//         } else if (type === "year") {
//           totalExpenses += exp.amount;
//         }
//       }
//     });

//     // ================================================
//     // 4. ALL-TIME CALCULATIONS (for totalRevenue)
//     // ================================================

//     /** 🔴 ALL-TIME SALES */
//     const allSales = await Sale.find();
//     let allTimeSales = 0;
//     let allTimeSalesProfit = 0;

//     allSales.forEach((sale) => {
//       if (!sale.isExchanged) {
//         allTimeSales += sale.total;
//         allTimeSalesProfit += sale.profit;
//         return;
//       }

//       sale.exchanges.forEach((exchange) => {
//         // Original sale
//         allTimeSales +=
//           exchange.originalItem.price * exchange.originalItem.quantity;
//         allTimeSalesProfit +=
//           (exchange.originalItem.price - exchange.originalItem.originalPrice) *
//           exchange.originalItem.quantity;

//         // Exchange adjustment
//         allTimeSales += exchange.priceDifference;
//         allTimeSalesProfit +=
//           (exchange.exchangedWith.price -
//             exchange.exchangedWith.originalPrice) *
//             exchange.exchangedWith.quantity -
//           (exchange.originalItem.price - exchange.originalItem.originalPrice) *
//             exchange.originalItem.quantity;
//       });
//     });

//     /** 🔴 ALL-TIME ORDERS */
//     const allOrders = await Order.find({
//       $or: [{ status: "تم الاستلام" }, { isPaid: true }],
//       status: { $ne: "ارجاع" },
//     }).populate("items.product", "originalPrice");

//     let allTimeOrders = 0;
//     let allTimeOrdersProfit = 0;

//     allOrders.forEach((order) => {
//       order.items.forEach((item) => {
//         allTimeOrders += item.price * item.quantity;

//         const product = item.product;
//         if (product && product.originalPrice != null) {
//           allTimeOrdersProfit +=
//             (item.price - product.originalPrice) * item.quantity;
//         }
//       });
//     });

//     /** 🔴 ALL-TIME NON-FIXED EXPENSES */
//     const nonFixedExpenses = await Expense.find({ isFixed: false });
//     const allTimeNonFixedExpenses = nonFixedExpenses.reduce(
//       (sum, exp) => sum + exp.amount,
//       0
//     );

//     /** 🔴 ALL-TIME REVENUE CHANGES */
//     const allRevenueChanges = await RevenueChanges.find({});
//     const allTimeRevenueChanges = allRevenueChanges.reduce(
//       (sum, r) => sum + r.amount,
//       0
//     );

//     // ================================================
//     // 5. FINAL CALCULATIONS
//     // ================================================

//     /** 🔴 TOTAL REVENUE (cash in register) */
//     const totalRevenue =
//       allTimeSales +
//       allTimeOrders -
//       allTimeNonFixedExpenses +
//       allTimeRevenueChanges;

//     /** ✅ Turnover (date-filtered) */
//     const turnover = totalSales + totalOrders;

//     /** ✅ Net Profit (date-filtered) */
//     const netProfit = profitSales + profitOrders - totalExpenses;

//     /** ✅ Capital (all inventory value) */
//     const products = await Product.find({});
//     let totalCapital = 0;
//     products.forEach((product) => {
//       product.colors.forEach((colorVariant) => {
//         colorVariant.sizes.forEach((size) => {
//           totalCapital += size.quantity * product.originalPrice;
//         });
//       });
//     });

//     res.json({
//       success: true,
//       date,
//       type,
//       sales: {
//         totalSales,
//         profitSales,
//         allTimeSales,
//         allTimeSalesProfit,
//       },
//       orders: {
//         totalOrders,
//         profitOrders,
//         allTimeOrders,
//         allTimeOrdersProfit,
//       },
//       expenses: {
//         dateFiltered: totalExpenses,
//         allTimeNonFixed: allTimeNonFixedExpenses,
//       },
//       revenueChanges: allTimeRevenueChanges,
//       capital: totalCapital,
//       totals: {
//         turnover, // Date-filtered sales + orders
//         totalRevenue, // All-time cash balance
//         netProfit, // Date-filtered profit
//       },
//     });
//   } catch (err) {
//     console.error("❌ Error in getFullSummary:", err);
//     res.status(500).json({ success: false, message: "خطأ في حساب الملخص" });
//   }
// };
// exports.getFullSummary = async (req, res) => {
//   try {
//     const { date, type = "day" } = req.query;
//     if (!date) {
//       return res
//         .status(400)
//         .json({ success: false, message: "يرجى تحديد التاريخ" });
//     }

//     let format;
//     if (type === "day") format = "%Y-%m-%d";
//     else if (type === "month") format = "%Y-%m";
//     else if (type === "year") format = "%Y";

//     const isLastDayOfMonth = (inputDate) => {
//       const givenDate = parseISO(inputDate);
//       const endDate = endOfMonth(givenDate);
//       return (
//         givenDate.toISOString().slice(0, 10) ===
//         endDate.toISOString().slice(0, 10)
//       );
//     };

//     const shortDate =
//       type === "day"
//         ? date
//         : type === "month"
//         ? date.slice(0, 7)
//         : date.slice(0, 4);

//     /** ✅ 1. المبيعات */
//     const sales = await Sale.find({
//       $expr: {
//         $or: [
//           {
//             $eq: [{ $dateToString: { format, date: "$createdAt" } }, shortDate],
//           },
//           {
//             $eq: [{ $dateToString: { format, date: "$updatedAt" } }, shortDate],
//           },
//         ],
//       },
//     });

//     let totalSales = 0;
//     let profitSales = 0;

//     sales.forEach((sale) => {
//       const createdDate = sale.createdAt.toISOString().slice(0, 10);
//       const updatedDate = sale.updatedAt.toISOString().slice(0, 10);

//       if (!sale.isExchanged || createdDate === updatedDate) {
//         if (createdDate === date) {
//           totalSales += sale.total;
//           profitSales += sale.profit;
//         }
//       } else {
//         sale.exchanges.forEach((ex) => {
//           const originalProfit =
//             (ex.originalItem.price - ex.originalItem.originalPrice) *
//             ex.originalItem.quantity;
//           const exchangedProfit =
//             (ex.exchangedWith.price - ex.exchangedWith.originalPrice) *
//             ex.exchangedWith.quantity;

//           if (createdDate === date) {
//             totalSales += ex.originalItem.price * ex.originalItem.quantity;
//             profitSales += originalProfit;
//           }

//           if (updatedDate === date) {
//             totalSales += ex.priceDifference;
//             profitSales += exchangedProfit - originalProfit;
//           }
//         });
//       }
//     });

//     /** ✅ 2. الطلبيات */
//     const orders = await Order.find({
//       $expr: {
//         $eq: [{ $dateToString: { format, date: "$updatedAt" } }, shortDate],
//       },
//       $or: [{ status: "تم الاستلام" }, { isPaid: true }],
//       status: { $ne: "ارجاع" },
//     }).populate("items.product", "originalPrice");

//     let totalOrders = 0;
//     let profitOrders = 0;

//     orders.forEach((order) => {
//       order.items.forEach((item) => {
//         totalOrders += item.price * item.quantity;

//         const product = item.product;
//         if (product && product.originalPrice != null) {
//           profitOrders += (item.price - product.originalPrice) * item.quantity;
//         }
//       });
//     });

//     /** ✅ 3. المصاريف */
//     const expenses = await Expense.find({});
//     let totalExpenses = 0;

//     expenses.forEach((exp) => {
//       const createdAt = exp.createdAt.toISOString();
//       const expDate = createdAt.slice(
//         0,
//         type === "day" ? 10 : type === "month" ? 7 : 4
//       );

//       if (!exp.isFixed && expDate === shortDate) {
//         totalExpenses += exp.amount;
//       }

//       if (exp.isFixed) {
//         if (type === "day" && exp.recurrence === "daily") {
//           totalExpenses += exp.amount;
//         } else if (type === "month") {
//           if (exp.recurrence === "daily") {
//             totalExpenses += exp.amount;
//           } else if (exp.recurrence === "monthly" && isLastDayOfMonth(date)) {
//             if (isSameMonth(parseISO(date), exp.createdAt)) {
//               totalExpenses += exp.amount;
//             }
//           }
//         } else if (type === "year") {
//           totalExpenses += exp.amount;
//         }
//       }
//     });

//     /** ✅ 4. تغييرات الخزنة */
//     const revChanges = await RevenueChanges.find({});
//     const revenueChangesSum = revChanges.reduce((sum, r) => sum + r.amount, 0);

//     /** ✅ 5. رأس المال */
//     const products = await Product.find({});
//     let totalCapital = 0;
//     products.forEach((product) => {
//       product.colors.forEach((colorVariant) => {
//         colorVariant.sizes.forEach((size) => {
//           totalCapital += size.quantity * product.originalPrice;
//         });
//       });
//     });

//     /** ✅ 6. Turnover + Revenue */
//     const turnover = totalSales + totalOrders;

//     const expensesTotal = expenses.reduce(
//       (acc, expense) => acc + expense.amount,
//       0
//     );

//     const totalRevenue =
//       totalSales + totalOrders - expensesTotal + revenueChangesSum;
//     const netProfit = profitSales + profitOrders - totalExpenses;

//     res.json({
//       success: true,
//       date,
//       type,
//       sales: { totalSales, profitSales },
//       orders: { totalOrders, profitOrders },
//       expenses: totalExpenses,
//       revenueChanges: revenueChangesSum,
//       capital: totalCapital,
//       totals: {
//         turnover,
//         totalRevenue,
//         netProfit,
//       },
//     });
//   } catch (err) {
//     console.error("❌ Error in getFullSummary:", err);
//     res.status(500).json({ success: false, message: "خطأ في حساب الملخص" });
//   }
// };
