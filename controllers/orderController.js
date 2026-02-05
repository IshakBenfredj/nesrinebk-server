const Order = require("../models/Order");
const Product = require("../models/Product");
const { updateProductStock } = require("../utils/productUtils");

async function getNextOrderNumber() {
  const lastOrder = await Order.findOne().sort({ orderNumber: -1 });
  return lastOrder ? lastOrder.orderNumber + 1 : 1;
}

// exports.createOrder = async (req, res) => {
//   try {
//     const {
//       fullName,
//       phone,
//       state,
//       deliveryType,
//       address,
//       items,
//       notes,
//       isPaid,
//       status,
//     } = req.body;

//     if (!items || items.length === 0) {
//       return res
//         .status(400)
//         .json({ success: false, message: "محتوى الطلبية فارغ" });
//     }

//     if (!deliveryType || !["مكتب", "منزل"].includes(deliveryType)) {
//       return res
//         .status(400)
//         .json({ success: false, message: "نوع التوصيل غير صالح" });
//     }

//     if (deliveryType === "منزل" && (!address || address.trim() === "")) {
//       return res.status(400).json({
//         success: false,
//         message: "العنوان مطلوب في حالة التوصيل للمنزل",
//       });
//     }

//     let totalPrice = 0;
//     const shouldDecreaseStock = status !== "غير مؤكدة" && status !== "ارجاع";

//     for (const item of items) {
//       const product = await Product.findById(item.product);
//       if (!product) {
//         return res
//           .status(404)
//           .json({ success: false, message: "المنتج غير موجود" });
//       }

//       let foundSize = null;
//       for (const color of product.colors) {
//         for (const size of color.sizes) {
//           if (size.barcode === item.barcode) {
//             foundSize = size;
//             break;
//           }
//         }
//       }

//       if (!foundSize) {
//         return res.status(400).json({
//           success: false,
//           message: `الباركود ${item.barcode} غير موجود`,
//         });
//       }

//       // ✅ تحقق من الكمية المتاحة بناءً على الطلبات المحجوزة
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
//       const availableQty = foundSize.quantity - reservedQty;

//       if (item.quantity > availableQty) {
//         return res.status(400).json({
//           success: false,
//           message: `الكمية غير متوفرة للمنتج ${product.name}. المتبقي ${availableQty} بعد حجز الطلبات.`,
//         });
//       }

//       totalPrice += item.quantity * item.price;

//       // ✅ إنقاص الكمية فقط إذا كانت الحالة ليست (غير مؤكدة / ارجاع)
//       if (shouldDecreaseStock) {
//         foundSize.quantity = Math.max(foundSize.quantity - item.quantity, 0);
//       }
//     }

//     const orderNumber = await getNextOrderNumber();

//     const newOrder = await Order.create({
//       fullName,
//       phone,
//       state,
//       deliveryType,
//       address: deliveryType === "منزل" ? address : "",
//       orderNumber,
//       items,
//       totalPrice,
//       notes,
//       isPaid,
//       status: status || "غير مؤكدة",
//       createdBy: req.user._id,
//     });

//     // ✅ تحديث الكمية في قاعدة البيانات إذا يجب الخصم
//     if (shouldDecreaseStock) {
//       for (const item of items) {
//         await Product.updateOne(
//           { _id: item.product, "colors.sizes.barcode": item.barcode },
//           { $inc: { "colors.$[].sizes.$[s].quantity": -item.quantity } },
//           { arrayFilters: [{ "s.barcode": item.barcode }] },
//         );
//       }
//     }

//     res
//       .status(201)
//       .json({ success: true, data: newOrder, message: "تم إنشاء طلبية بنجاح" });
//   } catch (err) {
//     console.error("Error creating order:", err);
//     res
//       .status(500)
//       .json({ success: false, message: "حدث خطأ أثناء إنشاء الطلبية" });
//   }
// };

exports.createOrder = async (req, res) => {
  try {
    const {
      fullName,
      phone,
      state,
      deliveryType,
      address,
      items,
      notes,
      isPaid,
      status = "غير مؤكدة",
      originalTotal,
      total,
      profit,
      discountAmount = 0,
    } = req.body;

    if (!items || items.length === 0) {
      return res
        .status(400)
        .json({ success: false, message: "محتوى الطلبية فارغ" });
    }

    if (!deliveryType || !["مكتب", "منزل"].includes(deliveryType)) {
      return res
        .status(400)
        .json({ success: false, message: "نوع التوصيل غير صالح" });
    }

    if (deliveryType === "منزل" && (!address || address.trim() === "")) {
      return res.status(400).json({
        success: false,
        message: "العنوان مطلوب في حالة التوصيل للمنزل",
      });
    }

    // Validate financial fields (sent from frontend)
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

    if (discountAmount > originalTotal) {
      return res.status(400).json({
        success: false,
        message: "مبلغ التخفيض لا يمكن أن يكون أكبر من الإجمالي الأصلي",
      });
    }

    let shouldDecreaseStock = status !== "غير مؤكدة" && status !== "ارجاع";

    for (const item of items) {
      const product = await Product.findById(item.product);
      if (!product) {
        return res
          .status(404)
          .json({ success: false, message: "المنتج غير موجود" });
      }

      let foundSize = null;
      for (const color of product.colors) {
        for (const size of color.sizes) {
          if (size.barcode === item.barcode) {
            foundSize = size;
            break;
          }
        }
        if (foundSize) break;
      }

      if (!foundSize) {
        return res.status(400).json({
          success: false,
          message: `الباركود ${item.barcode} غير موجود`,
        });
      }

      // Check reserved quantity
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
      const availableQty = foundSize.quantity - reservedQty;

      if (item.quantity > availableQty) {
        return res.status(400).json({
          success: false,
          message: `الكمية غير متوفرة للمنتج ${product.name}. المتبقي ${availableQty} بعد حجز الطلبات.`,
        });
      }

      // Decrease stock if needed
      if (shouldDecreaseStock) {
        foundSize.quantity = Math.max(foundSize.quantity - item.quantity, 0);
      }
    }

    const orderNumber = await getNextOrderNumber();

    const newOrder = await Order.create({
      fullName,
      phone,
      state,
      deliveryType,
      address: deliveryType === "منزل" ? address : "",
      orderNumber,
      items,
      total,
      originalTotal,
      profit,
      discountAmount,
      notes,
      isPaid,
      status,
      createdBy: req.user._id,
    });

    // Update stock in DB if needed
    if (shouldDecreaseStock) {
      for (const item of items) {
        await Product.updateOne(
          { _id: item.product, "colors.sizes.barcode": item.barcode },
          { $inc: { "colors.$[].sizes.$[s].quantity": -item.quantity } },
          { arrayFilters: [{ "s.barcode": item.barcode }] }
        );
      }
    }

    res
      .status(201)
      .json({ success: true, data: newOrder, message: "تم إنشاء طلبية بنجاح" });
  } catch (err) {
    console.error("Error creating order:", err);
    res
      .status(500)
      .json({ success: false, message: "حدث خطأ أثناء إنشاء الطلبية" });
  }
};

exports.updateOrderStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const order = await Order.findById(id);
    if (!order)
      return res
        .status(404)
        .json({ success: false, message: "الطلبية غير موجودة" });

    const oldStatus = order.status;
    order.status = status;
    await order.save();

    const shouldDecreaseNew = status !== "غير مؤكدة" && status !== "ارجاع";
    const shouldDecreaseOld =
      oldStatus !== "غير مؤكدة" && oldStatus !== "ارجاع";

    // ✅ إذا كانت الحالة الجديدة يجب أن تنقص المخزون والحالة القديمة لا
    if (shouldDecreaseNew && !shouldDecreaseOld) {
      for (const item of order.items) {
        await updateProductStock(
          item.product,
          item.barcode,
          -item.quantity,
          true,
        );
      }
    }

    // ✅ إذا كانت الحالة القديمة ناقصة المخزون والحالة الجديدة رجعت إلى غير مؤكدة / ارجاع
    if (!shouldDecreaseNew && shouldDecreaseOld) {
      for (const item of order.items) {
        await updateProductStock(
          item.product,
          item.barcode,
          item.quantity,
          true,
        );
      }
    }

    res.json({ success: true, data: order });
  } catch (err) {
    console.error("Error updating order status:", err);
    res
      .status(500)
      .json({ success: false, message: "حدث خطأ أثناء تحديث حالة الطلبية" });
  }
};

// PUT /orders/:id
exports.updateOrder = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      fullName,
      phone,
      state,
      deliveryType,
      address,
      items,
      notes,
      isPaid,
      status,
      originalTotal,
      total,
      profit,
      discountAmount = 0,
    } = req.body;

    const order = await Order.findById(id);
    if (!order) {
      return res.status(404).json({ success: false, message: "الطلبية غير موجودة" });
    }

    // Validate required fields
    if (!items || items.length === 0) {
      return res.status(400).json({ success: false, message: "المنتجات مطلوبة" });
    }

    if (!deliveryType || !["مكتب", "منزل"].includes(deliveryType)) {
      return res.status(400).json({ success: false, message: "نوع التوصيل غير صالح" });
    }

    if (deliveryType === "منزل" && (!address || address.trim() === "")) {
      return res.status(400).json({ success: false, message: "العنوان مطلوب للتوصيل للمنزل" });
    }

    // Financial validation
    if (
      typeof originalTotal !== "number" ||
      typeof total !== "number" ||
      typeof profit !== "number" ||
      originalTotal < 0 ||
      total < 0 ||
      profit < 0 ||
      discountAmount < 0 ||
      discountAmount > originalTotal
    ) {
      return res.status(400).json({ success: false, message: "البيانات المالية غير صالحة" });
    }

    // Stock rollback (add back old quantities if stock was decreased)
    const oldShouldDecrease = order.status !== "غير مؤكدة" && order.status !== "ارجاع";
    const newShouldDecrease = status !== "غير مؤكدة" && status !== "ارجاع";

    if (oldShouldDecrease) {
      // Add back old stock (rollback)
      for (const item of order.items) {
        await Product.updateOne(
          { _id: item.product, "colors.sizes.barcode": item.barcode },
          { $inc: { "colors.$[].sizes.$[s].quantity": item.quantity } },
          { arrayFilters: [{ "s.barcode": item.barcode }] }
        );
      }
    }

    // Validate new items stock
    for (const item of items) {
      const product = await Product.findById(item.product);
      if (!product) return res.status(404).json({ success: false, message: "منتج غير موجود" });

      const foundSize = product.colors
        .flatMap(c => c.sizes)
        .find(s => s.barcode === item.barcode);

      if (!foundSize) return res.status(400).json({ success: false, message: "باركود غير موجود" });

      // Check available stock (considering current reserved orders except this one)
      const reserved = await Order.aggregate([
        {
          $match: {
            _id: { $ne: order._id }, // exclude current order
            status: { $in: ["غير مؤكدة", "مؤكدة"] },
            "items.barcode": item.barcode,
          },
        },
        { $unwind: "$items" },
        { $match: { "items.barcode": item.barcode } },
        { $group: { _id: "$items.barcode", reservedQty: { $sum: "$items.quantity" } } },
      ]);

      const reservedQty = reserved[0]?.reservedQty || 0;
      const available = foundSize.quantity - reservedQty;

      if (item.quantity > available) {
        return res.status(400).json({
          success: false,
          message: `الكمية غير متاحة لـ ${product.name} - متبقي ${available}`,
        });
      }
    }

    // Apply new stock decrease if needed
    if (newShouldDecrease) {
      for (const item of items) {
        await Product.updateOne(
          { _id: item.product, "colors.sizes.barcode": item.barcode },
          { $inc: { "colors.$[].sizes.$[s].quantity": -item.quantity } },
          { arrayFilters: [{ "s.barcode": item.barcode }] }
        );
      }
    }

    // Update order
    const updatedOrder = await Order.findByIdAndUpdate(
      id,
      {
        fullName,
        phone,
        state,
        deliveryType,
        address: deliveryType === "منزل" ? address : "",
        items,
        total,
        originalTotal,
        profit,
        discountAmount,
        notes,
        isPaid,
        status,
      },
      { new: true, runValidators: true }
    );

    res.json({
      success: true,
      data: updatedOrder,
      message: "تم تحديث الطلبية بنجاح",
    });
  } catch (err) {
    console.error("Error updating order:", err);
    res.status(500).json({
      success: false,
      message: err.message || "حدث خطأ أثناء تحديث الطلبية",
    });
  }
};

exports.deleteOrder = async (req, res) => {
  try {
    const { id } = req.params;

    const order = await Order.findById(id);
    if (!order)
      return res
        .status(404)
        .json({ success: false, message: "الطلبية غير موجودة" });

    await order.deleteOne();

    res.json({ success: true, message: "تم حذف الطلبية بنجاح" });
  } catch (err) {
    console.error("Error deleting order:", err);
    res
      .status(500)
      .json({ success: false, message: "حدث خطأ أثناء حذف الطلبية" });
  }
};

exports.getOrders = async (req, res) => {
  try {
    const { status, date, orderNumber, page, limit } = req.query;

    const query = {};

    // status filter
    if (status) {
      query.status = status;
    }

    // orderNumber filter
    if (orderNumber) {
      const num = parseInt(orderNumber, 10);
      if (!isNaN(num)) {
        query.orderNumber = num;
      }
    }

    // single day filter
    if (date) {
      const startDate = new Date(date);
      if (!isNaN(startDate.getTime())) {
        startDate.setHours(0, 0, 0, 0);
        const endDate = new Date(startDate);
        endDate.setHours(23, 59, 59, 999);
        query.createdAt = { $gte: startDate, $lte: endDate };
      }
    }

    // Build base query
    let ordersQuery = Order.find(query)
      .sort({ createdAt: -1 })
      .populate("createdBy", "name")
      .populate("items.product", "name")
      .lean();

    let pagination = null;
    let total = null;

    // ───────────────────────────────────────────────
    // PAGINATION only when BOTH page AND limit exist
    // ───────────────────────────────────────────────
    if (page && limit) {
      const pageNum  = parseInt(page, 10);
      const limitNum = parseInt(limit, 10);

      if (isNaN(pageNum) || pageNum < 1 || isNaN(limitNum) || limitNum < 1) {
        return res.status(400).json({
          success: false,
          message: "page و limit يجب أن يكونا أرقام موجبة صحيحة",
        });
      }

      // Optional safety (prevent someone requesting 100000 items)
      if (limitNum > 200) {
        return res.status(400).json({
          success: false,
          message: "الحد الأقصى المسموح به لـ limit هو 200",
        });
      }

      const skip = (pageNum - 1) * limitNum;
      ordersQuery = ordersQuery.skip(skip).limit(limitNum);

      total = await Order.countDocuments(query);

      pagination = {
        total,
        page: pageNum,
        limit: limitNum,
        pages: Math.ceil(total / limitNum),
        hasNext: skip + limitNum < total,
        hasPrev: pageNum > 1,
      };
    } else {
      // No page & limit → return ALL matching orders
      total = await Order.countDocuments(query);

      pagination = {
        total,
        all: true,
        message: "جميع الطلبيات (بدون تقسيم صفحات)",
      };
    }

    const orders = await ordersQuery;

    res.json({
      success: true,
      data: orders,
      pagination,
    });
  } catch (err) {
    console.error("Error fetching orders:", err);
    res.status(500).json({
      success: false,
      message: "حدث خطأ أثناء جلب الطلبيات",
      error: process.env.NODE_ENV === "development" ? err.message : undefined,
    });
  }
};

exports.getOrderById = async (req, res) => {
  try {
    const { id } = req.params;

    const order = await Order.findById(id).populate("createdBy", "name").populate("items.product", "name originalPrice");

    if (!order) {
      return res
        .status(404)
        .json({ success: false, message: "الطلبية غير موجودة" });
    }

    res.json({ success: true, data: order });
  } catch (err) {
    console.error("Error fetching order:", err);
    res
      .status(500)
      .json({ success: false, message: "حدث خطأ أثناء جلب الطلبية" });
  }
};
