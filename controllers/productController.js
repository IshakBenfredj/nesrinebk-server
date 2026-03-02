const Product = require("../models/Product");
const StockHistory = require("../models/StockHistory");

const { generateBarcode } = require("../utils/barcodeGenerator");
const {
  uploadMultipleImages,
  deleteFileByUrl,
} = require("../utils/r2Storage");

exports.createProduct = async (req, res) => {
  try {
    const {
      name,
      fabric,
      description,
      price,
      category,
      colors,
      originalPrice,
    } = req.body;

    const userId = req.user?._id; // worker ID from auth middleware

    if (
      !name ||
      !price ||
      !originalPrice ||
      !category ||
      !colors ||
      colors.length === 0
    ) {
      return res.status(400).json({
        success: false,
        message: "الحقول المطلوبة مفقودة: الاسم، السعر، التصنيف، الألوان",
        data: null,
      });
    }

    const invalidColors = colors.some(
      (color) => !color.sizes || color.sizes.length === 0,
    );
    if (invalidColors) {
      return res.status(400).json({
        success: false,
        message: "يجب أن يحتوي كل لون على مقاس واحد على الأقل",
        data: null,
      });
    }

    // ✅ رفع الصور
    const processedColors = await Promise.all(
      colors.map(async (color) => {
        let uploadedImages = [];
        if (Array.isArray(color.images)) {
          const imagesToUpload = color.images.filter((img) =>
            img.startsWith("data:"),
          );
          const alreadyUploaded = color.images.filter(
            (img) => !img.startsWith("data:"),
          );
          if (imagesToUpload.length > 0) {
            const result = await uploadMultipleImages(imagesToUpload);
            uploadedImages = [...alreadyUploaded, ...result];
          } else {
            uploadedImages = alreadyUploaded;
          }
        }
        return {
          ...color,
          images: uploadedImages,
          sizes: color.sizes.map((size) => ({
            ...size,
            barcode: size.barcode || generateBarcode(),
          })),
        };
      }),
    );

    const product = new Product({
      name,
      description,
      price,
      category,
      fabric,
      originalPrice,
      colors: processedColors,
    });

    await product.save();
    await product.populate("category");

    // 📜 Log initial stock quantities
    const historyDocs = [];
    processedColors.forEach((color) => {
      color.sizes.forEach((size) => {
        historyDocs.push({
          productId: product._id,
          productName: product.name,
          color: color.color,
          size: size.size,
          changeAmount: size.quantity, // first time added
          newQuantity: size.quantity, // same as initial
          worker: userId,
        });
      });
    });
    await StockHistory.insertMany(historyDocs);

    res.status(201).json({
      success: true,
      message: "تم إنشاء المنتج بنجاح",
      data: product,
    });
  } catch (error) {
    console.error("Error creating product:", error);
    res.status(500).json({
      success: false,
      message: "حدث خطأ أثناء إنشاء المنتج",
      data: null,
    });
  }
};

exports.getProducts = async (req, res) => {
  try {
    const { category, color, search, minPrice, maxPrice } = req.query;
    const query = {};

    if (category) {
      // Updated: If category is provided, use $in operator since categories are now an array
      query.category = { $in: [category] }; // Assuming category is a single ID; adjust if multiple
    }
    if (color) query["colors.color"] = color;
    if (search) query.$text = { $search: search };
    if (minPrice || maxPrice) {
      query.price = {};
      if (minPrice) query.price.$gte = parseFloat(minPrice);
      if (maxPrice) query.price.$lte = parseFloat(maxPrice);
    }

    const products = await Product.find(query)
      // Updated: Populate categories (plural)
      .populate("category", "name")
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      data: products,
    });
  } catch (error) {
    console.error("Error fetching products:", error);
    res.status(500).json({
      success: false,
      message: "حدث خطأ أثناء جلب المنتجات",
      data: null,
    });
  }
};

exports.getProductById = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id).populate(
      // Updated: Populate categories (plural)
      "category",
      "name",
    );
    if (!product) {
      return res.status(404).json({
        success: false,
        message: "المنتج غير موجود",
        data: null,
      });
    }
    res.json({
      success: true,
      data: product,
    });
  } catch (error) {
    console.error("Error fetching product:", error);
    res.status(500).json({
      success: false,
      message: "حدث خطأ أثناء جلب المنتج",
      data: null,
    });
  }
};
function isCloudinaryUrl(url) {
  try {
    const parsed = new URL(url);
    return parsed.hostname === 'res.cloudinary.com' ||
           parsed.hostname.endsWith('.cloudinary.com');
  } catch {
    return false;
  }
}
exports.updateProduct = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, price, category, colors, fabric, originalPrice } = req.body;
    const userId = req.user?._id;

    if (
      !name ||
      !price ||
      !originalPrice ||
      !category ||
      !Array.isArray(category) ||
      category.length === 0 ||
      !colors ||
      colors.length === 0
    ) {
      return res.status(400).json({
        success: false,
        message: "الحقول المطلوبة مفقودة: الاسم، السعر، التصنيف، الألوان",
        data: null,
      });
    }

    const product = await Product.findById(id);
    if (!product) {
      return res
        .status(404)
        .json({ success: false, message: "المنتج غير موجود" });
    }

    const oldColors = JSON.parse(JSON.stringify(product.colors));

    const processedColors = await Promise.all(
      colors.map(async (color) => {
        const existingColor = product.colors.find(
          (c) => c.color === color.color,
        );

        const base64Images = (color.images || []).filter((img) =>
          img.startsWith("data:"),
        );
        const retainedImages = (color.images || []).filter(
          (img) => !img.startsWith("data:"),
        );
        

        const newUploadedImages =
          base64Images.length > 0
            ? await uploadMultipleImages(base64Images)
            : [];

        const previousImages = existingColor?.images || [];
        const removedImages = previousImages.filter(
          (img) => !retainedImages.includes(img) && !isCloudinaryUrl(img),
        );
        await Promise.all(
          removedImages.map((img) => deleteFileByUrl(img)),
        );

        return {
          ...color,
          images: [...retainedImages, ...newUploadedImages],
          sizes: color.sizes.map((size) => {
            const existingSize = existingColor?.sizes?.find(
              (s) => s.size === size.size,
            );
            return {
              ...size,
              barcode: existingSize?.barcode || generateBarcode(),
            };
          }),
        };
      }),
    );

    product.name = name;
    product.price = price;
    product.category = category;
    product.originalPrice = originalPrice;
    product.colors = processedColors;
    if (fabric) product.fabric = fabric;

    // 📜 Logging changes
    const historyDocs = [];
    processedColors.forEach((color) => {
      color.sizes.forEach((size) => {
        const oldQty =
          oldColors
            .find((c) => c.color === color.color)
            ?.sizes.find((s) => s.size === size.size)?.quantity || 0;

        const changeAmount = size.quantity - oldQty;
        if (changeAmount !== 0) {
          historyDocs.push({
            productId: product._id,
            productName: product.name,
            color: color.color,
            size: size.size,
            changeAmount,
            newQuantity: size.quantity,
            worker: userId,
          });
        }
      });
    });
    if (historyDocs.length) await StockHistory.insertMany(historyDocs);

    await product.save();
    await product.populate("category");

    res.json({
      success: true,
      message: "تم تحديث المنتج بنجاح",
      data: product,
    });
  } catch (error) {
    console.error("Error updating product:", error);
    res.status(500).json({
      success: false,
      message: "حدث خطأ أثناء تحديث المنتج",
      data: null,
    });
  }
};

exports.deleteProduct = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) {
      return res.status(404).json({
        success: false,
        message: "المنتج غير موجود",
        data: null,
      });
    }

    // Delete all images from R2
    const imageUrls = product.colors.flatMap((color) => color.images || []);
    await Promise.all(imageUrls.map((url) => deleteFileByUrl(url)));

    await product.deleteOne();

    res.json({
      success: true,
      message: "تم حذف المنتج بنجاح",
      data: null,
    });
  } catch (error) {
    console.error("Error deleting product:", error);
    res.status(500).json({
      success: false,
      message: "حدث خطأ أثناء حذف المنتج",
      data: null,
    });
  }
};

// exports.updateSizeQuantity = async (req, res) => {
//   try {
//     const { productId, colorIndex, sizeIndex } = req.params;
//     const { quantity } = req.body;

//     if (typeof quantity !== "number" || quantity < 0) {
//       return res.status(400).json({
//         success: false,
//         message: "الكمية يجب أن تكون رقم موجب",
//         data: null,
//       });
//     }

//     const product = await Product.findById(productId);
//     if (!product) {
//       return res.status(404).json({
//         success: false,
//         message: "المنتج غير موجود",
//         data: null,
//       });
//     }

//     const colorIdx = parseInt(colorIndex);
//     if (colorIdx < 0 || colorIdx >= product.colors.length) {
//       return res.status(400).json({
//         success: false,
//         message: "اللون المحدد غير موجود",
//         data: null,
//       });
//     }

//     const szIdx = parseInt(sizeIndex);
//     if (szIdx < 0 || szIdx >= product.colors[colorIdx].sizes.length) {
//       return res.status(400).json({
//         success: false,
//         message: "المقاس المحدد غير موجود",
//         data: null,
//       });
//     }

//     product.colors[colorIdx].sizes[szIdx].quantity = quantity;

//     await product.save();

//     const changeAmount = quantity - oldQuantity;
//     if (changeAmount !== 0) {
//       await StockHistory.create({
//         productId: product._id,
//         productName: product.name,
//         color: product.colors[colorIdx].color,
//         size: sizeObj.size,
//         changeAmount,
//         newQuantity: quantity,
//         worker: userId,
//       });
//     }

//     res.json({
//       success: true,
//       message: "تم تحديث الكمية بنجاح",
//       data: {
//         productId,
//         colorIndex,
//         sizeIndex,
//         newQuantity: quantity,
//       },
//     });
//   } catch (error) {
//     console.error("Error updating size quantity:", error);
//     res.status(500).json({
//       success: false,
//       message: "حدث خطأ أثناء تحديث الكمية",
//       data: null,
//     });
//   }
// };

exports.updateSizeQuantity = async (req, res) => {
  try {
    const { productId, colorIndex, sizeIndex } = req.params;
    const { quantity } = req.body;
    const userId = req.user?._id; // worker ID from auth middleware

    if (typeof quantity !== "number" || quantity < 0) {
      return res
        .status(400)
        .json({ success: false, message: "الكمية يجب أن تكون رقم موجب" });
    }

    const product = await Product.findById(productId);
    if (!product) {
      return res
        .status(404)
        .json({ success: false, message: "المنتج غير موجود" });
    }

    const colorIdx = parseInt(colorIndex);
    const szIdx = parseInt(sizeIndex);

    const sizeObj = product.colors[colorIdx].sizes[szIdx];
    const oldQuantity = sizeObj.quantity;
    console.log(
      `Updating stock for product ${productId}, color ${colorIdx}, size ${sizeIndex}: ${oldQuantity} -> ${quantity}`,
    );
    sizeObj.quantity = quantity;

    await product.save();

    const changeAmount = quantity - oldQuantity;
    if (changeAmount !== 0) {
      await StockHistory.create({
        productId: product._id,
        productName: product.name,
        color: product.colors[colorIdx].color,
        size: sizeObj.size,
        changeAmount,
        newQuantity: quantity,
        worker: userId,
      });
    }

    res.json({
      success: true,
      message: "تم تحديث الكمية بنجاح",
      data: { productId, colorIndex, sizeIndex, newQuantity: quantity },
    });
  } catch (error) {
    console.error("Error updating size quantity:", error);
    res
      .status(500)
      .json({ success: false, message: "حدث خطأ أثناء تحديث الكمية" });
  }
};
