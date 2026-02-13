const Sale = require("../models/Sale");
const Product = require("../models/Product");
const Order = require("../models/Order");
const DailyProfit = require("../models/DailyProfit");
const { updateProductStock } = require("../utils/productUtils");
const BonusConfig = require("../models/BonusConfig");

const generateUniqueBarcode = async () => {
  let barcode;
  let exists = true;

  while (exists) {
    barcode = Math.floor(10000000 + Math.random() * 90000000).toString();
    const existingSale = await Sale.findOne({ barcode });
    exists = !!existingSale;
  }

  return barcode;
};

exports.createSale = async (req, res) => {
  try {
    const {
      items,
      cashier,
      originalTotal,
      total,
      profit,
      discountAmount = 0,
    } = req.body;

    // التحقق الأساسي
    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        success: false,
        message: "لا توجد منتجات في الطلب",
      });
    }

    if (!cashier) {
      return res.status(400).json({
        success: false,
        message: "معرف الكاشير مطلوب",
      });
    }

    // التحقق من القيم المالية (أمان إضافي)
    if (
      typeof originalTotal !== "number" ||
      typeof total !== "number" ||
      typeof profit !== "number" ||
      originalTotal < 0 ||
      total < 0 ||
      profit < 0
    ) {
      return res.status(400).json({
        success: false,
        message: "البيانات المالية غير صالحة",
      });
    }

    if (typeof discountAmount !== "number" || discountAmount < 0) {
      return res.status(400).json({
        success: false,
        message: "مبلغ التخفيض يجب أن يكون رقم موجب أو صفر",
      });
    }

    // التحقق من أن التخفيض لا يتجاوز الإجمالي
    if (discountAmount > originalTotal) {
      return res.status(400).json({
        success: false,
        message: "مبلغ التخفيض لا يمكن أن يكون أكبر من الإجمالي قبل التخفيض",
      });
    }

    const saleItems = [];

    // التحقق من كل عنصر + تحديث المخزون
    for (const item of items) {
      const product = await Product.findById(item.product);
      if (!product) {
        return res.status(400).json({
          success: false,
          message: `المنتج غير موجود: ${item.product}`,
        });
      }

      const color = product.colors.find((c) =>
        c.sizes.some((s) => s.barcode === item.barcode),
      );
      const size = color
        ? color.sizes.find((s) => s.barcode === item.barcode)
        : null;

      if (!color || !size) {
        return res.status(400).json({
          success: false,
          message: `لم يتم العثور على الباركود: ${item.barcode}`,
        });
      }

      // Check reserved quantity (your existing logic)
      const reservedOrders = await Order.aggregate([
        {
          $match: {
            status: { $in: ["غير مؤكدة", "مؤكدة"] },
            "items.barcode": item.barcode,
          },
        },
        { $unwind: "$items" },
        { $match: { "items.barcode": item.barcode } },
        {
          $group: {
            _id: "$items.barcode",
            reservedQty: { $sum: "$items.quantity" },
          },
        },
      ]);

      const reservedQty =
        reservedOrders.length > 0 ? reservedOrders[0].reservedQty : 0;
      const availableQty = size.quantity - reservedQty;

      if (availableQty <= 0) {
        return res.status(400).json({
          success: false,
          message: `لا يوجد مخزون متاح. الكمية في المخزن ${size.quantity} وكلها محجوزة.`,
        });
      }

      if (item.quantity > availableQty) {
        return res.status(400).json({
          success: false,
          message: `الكمية المطلوبة (${item.quantity}) أكبر من المتاحة (${availableQty}).`,
        });
      }

      saleItems.push({
        product: product._id,
        barcode: item.barcode,
        quantity: item.quantity,
        price: item.price,
        originalPrice: item.originalPrice,
        size: item.size,
        color: item.color,
      });
    }

    const uniqueBarcode = await generateUniqueBarcode();


    const sale = new Sale({
      barcode: uniqueBarcode,
      items: saleItems,
      total, 
      originalTotal, 
      discountAmount,
      profit, 
      cashier,
    });

    // Update stock
    await Promise.all(
      saleItems.map((item) =>
        updateProductStock(item.product, item.barcode, -item.quantity, true),
      ),
    );

    await sale.save();

    return res.status(201).json({
      success: true,
      data: sale,
    });
  } catch (error) {
    console.error("❌ createSale error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "حدث خطأ أثناء إنشاء الفاتورة",
    });
  }
};

exports.exchangeProducts = async (req, res) => {
  try {
    const { saleId } = req.params;
    const { exchanges } = req.body;
    const cashier = req.user._id;

    if (!exchanges || !Array.isArray(exchanges) || exchanges.length === 0) {
      return res.status(400).json({
        success: false,
        message: "لا توجد عناصر للاستبدال",
      });
    }

    const sale = await Sale.findById(saleId);
    if (!sale) {
      return res.status(404).json({
        success: false,
        message: "الفاتورة غير موجودة",
      });
    }

    const now = new Date();
    const saleTime = new Date(sale.createdAt);
    const hoursDiff = (now - saleTime) / (1000 * 60 * 60);

    if (hoursDiff > 50) {
      return res.json({
        success: false,
        expired: true,
        message: "انتهت فترة الـ 50 ساعة المسموح بها للاستبدال",
      });
    }

    // ────────────────────────────────────────────────
    // إذا كانت هذه أول عملية استبدال، احفظ القيم قبل الاستبدال
    // ────────────────────────────────────────────────
    if (!sale.isExchanged) {
      sale.totalBeforeExchange = sale.total;
      sale.originalTotalBeforeExchange = sale.originalTotal;
      sale.profitBeforeExchange = sale.profit;
    }

    const stockUpdates = [];
    const exchangeRecords = [];
    let totalOriginalAmount = 0;
    let totalNewAmount = 0;
    let totalOriginalCost = 0;
    let totalNewCost = 0;

    for (const exchange of exchanges) {
      const { originalBarcode, newBarcode, newQuantity } = exchange;

      if (newQuantity < 1) {
        return res.status(400).json({
          success: false,
          message: `الكمية يجب أن تكون أكبر من الصفر للباركود: ${newBarcode}`,
        });
      }

      const originalItem = sale.items.find(
        (item) => item.barcode === originalBarcode,
      );
      if (!originalItem) {
        return res.status(404).json({
          success: false,
          message: `المنتج الأصلي غير موجود في الفاتورة: ${originalBarcode}`,
        });
      }

      const newProduct = await Product.findOne({
        "colors.sizes.barcode": newBarcode,
      });
      if (!newProduct) {
        return res.status(404).json({
          success: false,
          message: `المنتج الجديد غير موجود: ${newBarcode}`,
        });
      }

      let newSize = null;
      let newColor = null;

      for (const color of newProduct.colors) {
        for (const size of color.sizes) {
          if (size.barcode === newBarcode) {
            newSize = size;
            newColor = color;
            break;
          }
        }
        if (newSize) break;
      }

      if (!newSize || !newColor) {
        return res.status(404).json({
          success: false,
          message: `لم يتم العثور على المقاس أو اللون للباركود: ${newBarcode}`,
        });
      }

      if (newSize.quantity < newQuantity) {
        return res.status(400).json({
          success: false,
          message: `الكمية غير متوفرة للمنتج: ${newProduct.name} (${newSize.size}) - يتوفر ${newSize.quantity}`,
        });
      }

      const exchangedItem = {
        product: newProduct._id,
        barcode: newBarcode,
        quantity: newQuantity,
        price: newProduct.price,
        originalPrice: newProduct.originalPrice,
        size: newSize.size,
        color: newColor.color,
      };

      const originalAmount = originalItem.quantity * originalItem.price;
      const newAmount = newQuantity * newProduct.price;
      const priceDifference = newAmount - originalAmount;

      const originalCost = originalItem.quantity * originalItem.originalPrice;
      const newCost = newQuantity * newProduct.originalPrice;

      stockUpdates.push(
        updateProductStock(
          originalItem.product,
          originalItem.barcode,
          originalItem.quantity,
          false, // return to stock
        ),
        updateProductStock(newProduct._id, newBarcode, -newQuantity, false), // remove from stock
      );

      // Update the sale items (replace old with new)
      sale.items = sale.items.map((item) =>
        item.barcode === originalBarcode ? exchangedItem : item,
      );

      exchangeRecords.push({
        originalItem,
        exchangedWith: exchangedItem,
        exchangedAt: now,
        priceDifference,
      });

      totalOriginalAmount += originalAmount;
      totalNewAmount += newAmount;
      totalOriginalCost += originalCost;
      totalNewCost += newCost;
    }

    await Promise.all(stockUpdates);

    // Recalculate current totals after exchange
    sale.total = sale.items.reduce(
      (sum, item) => sum + item.quantity * item.price,
      0,
    );
    sale.originalTotal = sale.items.reduce(
      (sum, item) => sum + item.quantity * item.originalPrice,
      0,
    );
    sale.profit = sale.total - sale.originalTotal;

    // Mark as exchanged (only once)
    sale.isExchanged = true;
    sale.exchanges.push(...exchangeRecords);
    sale.exchangeCashier = cashier;

    await sale.save();

    res.json({
      success: true,
      data: sale,
    });
  } catch (error) {
    console.error("Error exchanging products:", error);
    res.status(500).json({
      success: false,
      message: "حدث خطأ أثناء عملية الاستبدال",
    });
  }
};

// exports.createSale = async (req, res) => {
//   try {
//     const { items, cashier } = req.body;

//     if (!items || items.length === 0) {
//       return res.status(400).json({
//         success: false,
//         message: "لا توجد منتجات في الطلب",
//       });
//     }

//     let total = 0;
//     let originalTotal = 0;
//     let profit = 0;
//     const saleItems = [];

//     for (const item of items) {
//       const product = await Product.findById(item.product);
//       if (!product) {
//         return res.status(400).json({
//           success: false,
//           message: `المنتج غير موجود: ${item.product}`,
//         });
//       }

//       const color = product.colors.find((c) =>
//         c.sizes.some((s) => s.barcode === item.barcode)
//       );
//       const size = color
//         ? color.sizes.find((s) => s.barcode === item.barcode)
//         : null;

//       if (!color || !size) {
//         return res.status(400).json({
//           success: false,
//           message: `لم يتم العثور على الباركود: ${item.barcode}`,
//         });
//       }

//       // ✅ Check reserved quantity
//       const reservedOrders = await Order.aggregate([
//         {
//           $match: {
//             status: { $in: ["غير مؤكدة", "مؤكدة"] },
//             "items.barcode": item.barcode,
//           },
//         },
//         { $unwind: "$items" },
//         { $match: { "items.barcode": item.barcode } },
//         {
//           $group: {
//             _id: "$items.barcode",
//             reservedQty: { $sum: "$items.quantity" },
//           },
//         },
//       ]);

//       const reservedQty =
//         reservedOrders.length > 0 ? reservedOrders[0].reservedQty : 0;
//       const availableQty = size.quantity - reservedQty;

//       if (availableQty <= 0) {
//         return res.status(400).json({
//           success: false,
//           message: `لا يوجد مخزون متاح لهذا المنتج. الكمية في المخزن ${size.quantity} وكلها محجوزة.`,
//         });
//       }

//       if (item.quantity > availableQty) {
//         return res.status(400).json({
//           success: false,
//           message: `الكمية المطلوبة (${item.quantity}) أكبر من المتاحة (${availableQty}) بسبب الطلبيات المحجوزة.`,
//         });
//       }

//       const itemTotal = item.quantity * product.price;
//       const itemOriginalTotal = item.quantity * product.originalPrice;
//       const itemProfit = itemTotal - itemOriginalTotal;

//       total += itemTotal;
//       originalTotal += itemOriginalTotal;
//       profit += itemProfit;

//       saleItems.push({
//         product: product._id,
//         barcode: item.barcode,
//         quantity: item.quantity,
//         price: product.price,
//         originalPrice: product.originalPrice,
//         size: size.size,
//         color: color.color,
//       });
//     }

//     // ✅ Generate unique barcode
//     const uniqueBarcode = await generateUniqueBarcode();

//     const sale = new Sale({
//       barcode: uniqueBarcode,
//       items: saleItems,
//       total,
//       originalTotal,
//       profit,
//       cashier,
//     });

//     // Update stock
//     await Promise.all(
//       saleItems.map((item) =>
//         updateProductStock(item.product, item.barcode, -item.quantity, true)
//       )
//     );

//     await sale.save();

//     return res.status(201).json({
//       success: true,
//       // message: "تم إنشاء الفاتورة بنجاح",
//       data: sale,
//     });
//   } catch (error) {
//     console.error("❌ createSale error:", error);
//     return res.status(500).json({
//       success: false,
//       message: error.message || "حدث خطأ أثناء إنشاء الفاتورة",
//     });
//   }
// };

exports.getSaleById = async (req, res) => {
  try {
    const { id } = req.params;

    const sale = await Sale.findById(id)
      .populate("cashier", "name")
      .populate("exchangeCashier", "name")
      .populate({
        path: "items.product",
        select: "name price colors barcode",
      })
      .populate({
        path: "exchanges.originalItem.product",
        select: "name price colors barcode",
      })
      .populate({
        path: "exchanges.exchangedWith.product",
        select: "name price colors barcode",
      });

    if (!sale) {
      return res.status(404).json({
        success: false,
        error: "الفاتورة غير موجودة",
      });
    }

    const now = new Date();
    const saleTime = new Date(sale.createdAt);
    const hoursDiff = (now - saleTime) / (1000 * 60 * 60);

    res.json({
      success: true,
      expired: hoursDiff > 50,
      data: sale,
    });
  } catch (error) {
    console.error("Error finding sale by ID:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

exports.getSaleByBarcode = async (req, res) => {
  try {
    const { barcode } = req.params;

    let sale = await Sale.findOne({ barcode })
      .populate("cashier", "name")
      .populate("exchangeCashier", "name")
      .populate({
        path: "items.product",
        model: "Product",
        select: "name price colors barcode",
      });

    if (!sale) {
      sale = await Sale.findOne({ "items.barcode": barcode })
        .populate("cashier", "name")
        .populate("exchangeCashier", "name")
        .populate({
          path: "items.product",
          model: "Product",
          select: "name price colors barcode",
        });
    }

    if (!sale) {
      return res.status(404).json({
        success: false,
        error: "الفاتورة غير موجودة",
      });
    }

    const now = new Date();
    const saleTime = new Date(sale.createdAt);
    const hoursDiff = (now - saleTime) / (1000 * 60 * 60);

    res.json({
      success: true,
      expired: hoursDiff > 50,
      data: sale,
    });
  } catch (error) {
    console.error("Error finding sale by barcode:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

exports.exchangeProducts = async (req, res) => {
  try {
    const { saleId } = req.params;
    const { exchanges } = req.body;
    const cashier = req.user._id;

    if (!exchanges || !Array.isArray(exchanges) || exchanges.length === 0) {
      return res.status(400).json({
        success: false,
        message: "لا توجد عناصر للاستبدال",
      });
    }

    const sale = await Sale.findById(saleId);
    if (!sale) {
      return res.status(404).json({
        success: false,
        message: "الفاتورة غير موجودة",
      });
    }

    const now = new Date();
    const saleTime = new Date(sale.createdAt);
    const hoursDiff = (now - saleTime) / (1000 * 60 * 60);

    if (hoursDiff > 50) {
      return res.json({
        success: false,
        expired: true,
        message: "انتهت فترة الـ 50 ساعة المسموح بها للاستبدال",
      });
    }

    const stockUpdates = [];
    const exchangeRecords = [];
    let totalOriginalAmount = 0;
    let totalNewAmount = 0;
    let totalOriginalCost = 0;
    let totalNewCost = 0;

    for (const exchange of exchanges) {
      const { originalBarcode, newBarcode, newQuantity } = exchange;

      if (newQuantity < 1) {
        return res.status(400).json({
          success: false,
          message: `الكمية يجب أن تكون أكبر من الصفر للباركود: ${newBarcode}`,
        });
      }

      const originalItem = sale.items.find(
        (item) => item.barcode === originalBarcode,
      );
      if (!originalItem) {
        return res.status(404).json({
          success: false,
          message: `المنتج الأصلي غير موجود في الفاتورة: ${originalBarcode}`,
        });
      }

      const newProduct = await Product.findOne({
        "colors.sizes.barcode": newBarcode,
      });
      if (!newProduct) {
        return res.status(404).json({
          success: false,
          message: `المنتج الجديد غير موجود: ${newBarcode}`,
        });
      }

      let newSize = null;
      let newColor = null;

      for (const color of newProduct.colors) {
        for (const size of color.sizes) {
          if (size.barcode === newBarcode) {
            newSize = size;
            newColor = color;
            break;
          }
        }
        if (newSize) break;
      }

      if (!newSize || !newColor) {
        return res.status(404).json({
          success: false,
          message: `لم يتم العثور على المقاس أو اللون للباركود: ${newBarcode}`,
        });
      }

      if (newSize.quantity < newQuantity) {
        return res.status(400).json({
          success: false,
          message: `الكمية غير متوفرة للمنتج: ${newProduct.name} (${newSize.size}) - يتوفر ${newSize.quantity}`,
        });
      }

      const exchangedItem = {
        product: newProduct._id,
        barcode: newBarcode,
        quantity: newQuantity,
        price: newProduct.price,
        originalPrice: newProduct.originalPrice,
        size: newSize.size,
        color: newColor.color,
      };

      const originalAmount = originalItem.quantity * originalItem.price;
      const newAmount = newQuantity * newProduct.price;
      const priceDifference = newAmount - originalAmount;

      const originalCost = originalItem.quantity * originalItem.originalPrice;
      const newCost = newQuantity * newProduct.originalPrice;

      stockUpdates.push(
        updateProductStock(
          originalItem.product,
          originalItem.barcode,
          originalItem.quantity,
          false,
        ),

        updateProductStock(newProduct._id, newBarcode, -newQuantity, false),
      );

      sale.items = sale.items.map((item) =>
        item.barcode === originalBarcode ? exchangedItem : item,
      );

      exchangeRecords.push({
        originalItem,
        exchangedWith: exchangedItem,
        exchangedAt: now,
        priceDifference,
      });

      totalOriginalAmount += originalAmount;
      totalNewAmount += newAmount;
      totalOriginalCost += originalCost;
      totalNewCost += newCost;
    }

    await Promise.all(stockUpdates);

    sale.total = sale.items.reduce(
      (sum, item) => sum + item.quantity * item.price,
      0,
    );
    sale.originalTotal = sale.items.reduce(
      (sum, item) => sum + item.quantity * item.originalPrice,
      0,
    );
    sale.profit = sale.total - sale.originalTotal;
    sale.isExchanged = true;
    sale.exchanges.push(...exchangeRecords);
    sale.exchangeCashier = cashier;

    await sale.save();

    // await Promise.all([
    //   updateDailyProfit(
    //     saleTime,
    //     -totalOriginalAmount,
    //     -totalOriginalCost,
    //     -(totalOriginalAmount - totalOriginalCost)
    //   ),
    //   updateDailyProfit(
    //     now,
    //     totalNewAmount,
    //     totalNewCost,
    //     totalNewAmount - totalNewCost
    //   ),
    // ]);

    res.json({
      success: true,
      data: sale,
    });
  } catch (error) {
    console.error("Error exchanging products:", error);
    res.status(500).json({
      success: false,
      message: "حدث خطأ أثناء عملية الاستبدال",
    });
  }
};

exports.getAllSales = async (req, res) => {
  try {
    const { date } = req.query;

    let query = {};
    if (date) {
      const startDate = new Date(date);
      startDate.setHours(0, 0, 0, 0);

      const endDate = new Date(date);
      endDate.setHours(23, 59, 59, 999);

      query.createdAt = { $gte: startDate, $lte: endDate };
    }

    let sales = await Sale.find(query)
      .sort({ createdAt: -1 })
      .populate("cashier", "name")
      .populate("exchangeCashier", "name")
      .populate("items.product")
      .lean();

    // Populate nested product info in exchanges
    sales = await Promise.all(
      sales.map(async (sale) => {
        if (sale.exchanges && sale.exchanges.length > 0) {
          for (const exchange of sale.exchanges) {
            if (exchange.originalItem?.product) {
              exchange.originalItem.product = await Product.findById(
                exchange.originalItem.product,
              ).select("name price");
            }
            if (exchange.exchangedWith?.product) {
              exchange.exchangedWith.product = await Product.findById(
                exchange.exchangedWith.product,
              ).select("name price");
            }
          }
        }
        return sale;
      }),
    );

    const total = await Sale.countDocuments(query);

    res.json({
      success: true,
      data: {
        sales,
        total,
        // you can keep these or remove them — they're now just informational
        // pages: 1,
        // currentPage: 1,
      },
    });
  } catch (error) {
    console.error("Error getting sales:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

const updateDailyProfit = async (date, totalSales, totalOriginal, profit) => {
  try {
    const saleDate = new Date(date);
    saleDate.setHours(0, 0, 0, 0);

    await DailyProfit.findOneAndUpdate(
      { date: saleDate },
      {
        $inc: {
          totalSales,
          totalOriginal,
          totalProfit: profit,
          salesCount: profit > 0 ? 1 : 0,
          exchangeAdjustments: profit < 0 ? profit : 0,
          finalProfit: profit,
        },
      },
      { upsert: true, new: true },
    );
  } catch (error) {
    console.error("Error updating daily profit:", error);
  }
};
