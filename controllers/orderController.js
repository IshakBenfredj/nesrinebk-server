const Order = require("../models/Order");
const Product = require("../models/Product");
const { updateProductStock } = require("../utils/productUtils");

async function getNextOrderNumber() {
  const lastOrder = await Order.findOne().sort({ orderNumber: -1 });
  return lastOrder ? lastOrder.orderNumber + 1 : 1;
}

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
      status,
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

    let totalPrice = 0;
    const shouldDecreaseStock =
      status !== "غير مؤكدة" && status !== "مؤكدة" && status !== "ارجاع";

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
      }

      if (!foundSize) {
        return res.status(400).json({
          success: false,
          message: `الباركود ${item.barcode} غير موجود`,
        });
      }

      // ✅ تحقق من الكمية المتاحة بناءً على الطلبات المحجوزة
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

      totalPrice += item.quantity * item.price;

      // ✅ إنقاص الكمية فقط إذا كانت الحالة ليست (غير مؤكدة / مؤكدة / ارجاع)
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
      totalPrice,
      notes,
      isPaid,
      status: status || "غير مؤكدة",
      createdBy: req.user._id,
    });

    // ✅ تحديث الكمية في قاعدة البيانات إذا يجب الخصم
    if (shouldDecreaseStock) {
      for (const item of items) {
        await Product.updateOne(
          { _id: item.product, "colors.sizes.barcode": item.barcode },
          { $inc: { "colors.$[].sizes.$[s].quantity": -item.quantity } },
          { arrayFilters: [{ "s.barcode": item.barcode }] }
        );
      }
    }

    res.status(201).json({ success: true, data: newOrder });
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

    const shouldDecreaseNew =
      status !== "غير مؤكدة" && status !== "مؤكدة" && status !== "ارجاع";
    const shouldDecreaseOld =
      oldStatus !== "غير مؤكدة" &&
      oldStatus !== "مؤكدة" &&
      oldStatus !== "ارجاع";

    // ✅ إذا كانت الحالة الجديدة يجب أن تنقص المخزون والحالة القديمة لا
    if (shouldDecreaseNew && !shouldDecreaseOld) {
      for (const item of order.items) {
        await updateProductStock(
          item.product,
          item.barcode,
          -item.quantity,
          true
        );
      }
    }

    // ✅ إذا كانت الحالة القديمة ناقصة المخزون والحالة الجديدة رجعت إلى غير مؤكدة / مؤكدة / ارجاع
    if (!shouldDecreaseNew && shouldDecreaseOld) {
      for (const item of order.items) {
        await updateProductStock(
          item.product,
          item.barcode,
          item.quantity,
          true
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
    } = req.body;

    const order = await Order.findById(id);
    if (!order)
      return res
        .status(404)
        .json({ success: false, message: "الطلبية غير موجودة" });

    // ✅ تحقق من نوع التوصيل
    if (
      deliveryType &&
      deliveryType === "منزل" &&
      (!address || address.trim() === "")
    ) {
      return res.status(400).json({
        success: false,
        message: "العنوان مطلوب في حالة التوصيل للمنزل",
      });
    }

    // ✅ تحديث الحقول
    order.fullName = fullName || order.fullName;
    order.phone = phone || order.phone;
    order.state = state || order.state;
    order.deliveryType = deliveryType || order.deliveryType;
    order.address = deliveryType === "منزل" ? address : "";
    order.notes = notes || order.notes;
    order.isPaid = isPaid ?? order.isPaid;

    // ✅ تحديث العناصر وحساب المجموع
    if (items && items.length > 0) {
      let totalPrice = 0;
      for (const item of items) {
        totalPrice += item.quantity * item.price;
      }
      order.items = items;
      order.totalPrice = totalPrice;
    }

    await order.save();

    res.json({ success: true, data: order });
  } catch (err) {
    console.error("Error updating order:", err);
    res
      .status(500)
      .json({ success: false, message: "حدث خطأ أثناء تحديث الطلبية" });
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
    const { status, date, orderNumber, page = 1, limit = 10 } = req.query;
    const query = {};

    if (status) query.status = status;

    if (orderNumber) query.orderNumber = parseInt(orderNumber);

    if (date) {
      const startDate = new Date(date);
      startDate.setHours(0, 0, 0, 0);
      const endDate = new Date(date);
      endDate.setHours(23, 59, 59, 999);
      query.createdAt = { $gte: startDate, $lte: endDate };
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const orders = await Order.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .populate("createdBy", "name");

    const total = await Order.countDocuments(query);

    res.json({
      success: true,
      data: orders,
      total,
      pages: Math.ceil(total / limit),
      currentPage: parseInt(page),
    });
  } catch (err) {
    console.error("Error fetching orders:", err);
    res
      .status(500)
      .json({ success: false, message: "حدث خطأ أثناء جلب الطلبيات" });
  }
};

exports.getOrderById = async (req, res) => {
  try {
    const { id } = req.params;

    const order = await Order.findById(id).populate("createdBy", "name");

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
