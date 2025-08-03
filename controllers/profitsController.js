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
const Sale = require("../models/Sale");
const Order = require("../models/Order");
const Expense = require("../models/Expense");
const Product = require("../models/Product");
const RevenueChanges = require("../models/RevenuesChanges");

exports.getFullSummary = async (req, res) => {
  try {
    const { date, type = "day" } = req.query;
    if (!date) {
      return res
        .status(400)
        .json({ success: false, message: "يرجى تحديد التاريخ" });
    }

    let format;
    if (type === "day") format = "%Y-%m-%d";
    else if (type === "month") format = "%Y-%m";
    else if (type === "year") format = "%Y";

    /** ✅ 1. حساب المبيعات */
    const sales = await Sale.find({
      $expr: {
        $or: [
          {
            $eq: [
              { $dateToString: { format, date: "$createdAt" } },
              type === "day"
                ? date
                : type === "month"
                ? date.slice(0, 7)
                : date.slice(0, 4),
            ],
          },
          {
            $eq: [
              { $dateToString: { format, date: "$updatedAt" } },
              type === "day"
                ? date
                : type === "month"
                ? date.slice(0, 7)
                : date.slice(0, 4),
            ],
          },
        ],
      },
    });

    let totalSales = 0;
    let profitSales = 0;

    sales.forEach((sale) => {
      const createdDate = sale.createdAt.toISOString().slice(0, 10);
      const updatedDate = sale.updatedAt.toISOString().slice(0, 10);

      if (!sale.isExchanged || createdDate === updatedDate) {
        if (createdDate === date) {
          totalSales += sale.total;
          profitSales += sale.profit;
        }
      } else {
        sale.exchanges.forEach((ex) => {
          const originalProfit =
            (ex.originalItem.price - ex.originalItem.originalPrice) *
            ex.originalItem.quantity;
          const exchangedProfit =
            (ex.exchangedWith.price - ex.exchangedWith.originalPrice) *
            ex.exchangedWith.quantity;

          if (createdDate === date) {
            totalSales += ex.originalItem.price * ex.originalItem.quantity;
            profitSales += originalProfit;
          }

          if (updatedDate === date) {
            totalSales += ex.priceDifference;
            profitSales += exchangedProfit - originalProfit;
          }
        });
      }
    });

    /** ✅ 2. حساب الطلبيات */
    const orders = await Order.find({
      $expr: {
        $eq: [
          { $dateToString: { format, date: "$updatedAt" } },
          type === "day"
            ? date
            : type === "month"
            ? date.slice(0, 7)
            : date.slice(0, 4),
        ],
      },
      $or: [{ status: "تم الاستلام" }, { isPaid: true }],
    }).populate("items.product", "originalPrice");

    let totalOrders = 0;
    let profitOrders = 0;

    orders.forEach((order) => {
      order.items.forEach((item) => {
        totalOrders += item.price * item.quantity;

        const product = item.product;
        if (product && product.originalPrice != null) {
          profitOrders += (item.price - product.originalPrice) * item.quantity;
        }
      });
    });

    /** ✅ 3. حساب المصاريف (حسب التاريخ المحدد) */
    const expensesByDate = await Expense.find({
      $expr: {
        $eq: [
          { $dateToString: { format, date: "$createdAt" } },
          type === "day"
            ? date
            : type === "month"
            ? date.slice(0, 7)
            : date.slice(0, 4),
        ],
      },
    });
    const totalExpenses = expensesByDate.reduce((sum, e) => sum + e.amount, 0);

    /** ✅ 4. حساب التغييرات في الخزنة (كل الوقت) */
    const revChanges = await RevenueChanges.find({});
    const revenueChangesSum = revChanges.reduce((sum, r) => sum + r.amount, 0);

    /** ✅ 5. حساب رأس المال */
    const products = await Product.find({});
    let totalCapital = 0;
    products.forEach((product) => {
      product.colors.forEach((colorVariant) => {
        colorVariant.sizes.forEach((size) => {
          totalCapital += size.quantity * product.originalPrice;
        });
      });
    });

    /** ✅ 6. حساب الإجماليات */
    const totalRevenue =
      totalSales + totalOrders - totalExpenses + revenueChangesSum;
    const netProfit = profitSales + profitOrders - totalExpenses;

    res.json({
      success: true,
      date,
      type,
      sales: { totalSales, profitSales },
      orders: { totalOrders, profitOrders },
      expenses: totalExpenses, // ⬅️ now filtered by date
      revenueChanges: revenueChangesSum,
      capital: totalCapital,
      totals: { totalRevenue, netProfit },
    });
  } catch (err) {
    console.error("❌ Error in getFullSummary:", err);
    res.status(500).json({ success: false, message: "خطأ في حساب الملخص" });
  }
};
