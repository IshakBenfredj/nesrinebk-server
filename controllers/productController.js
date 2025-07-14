const Product = require("../models/Product");
const { generateBarcode } = require("../utils/barcodeGenerator");
const {
  uploadMultipleImages,
  deleteImageFromCloudinary,
} = require("../utils/cloudinary");

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
      (color) => !color.sizes || color.sizes.length === 0
    );
    if (invalidColors) {
      return res.status(400).json({
        success: false,
        message: "يجب أن يحتوي كل لون على مقاس واحد على الأقل",
        data: null,
      });
    }

    // ✅ تجهيز الألوان ورفع صورها
    const processedColors = await Promise.all(
      colors.map(async (color) => {
        let uploadedImages = [];

        if (Array.isArray(color.images)) {
          // فقط الصور التي هي base64 سيتم رفعها
          const imagesToUpload = color.images.filter((img) =>
            img.startsWith("data:")
          );

          const alreadyUploaded = color.images.filter(
            (img) => !img.startsWith("data:")
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
      })
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

    if (category) query.category = category;
    if (color) query["colors.color"] = color;
    if (search) query.$text = { $search: search };
    if (minPrice || maxPrice) {
      query.price = {};
      if (minPrice) query.price.$gte = parseFloat(minPrice);
      if (maxPrice) query.price.$lte = parseFloat(maxPrice);
    }

    const products = await Product.find(query)
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
      "category",
      "name"
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
      message: "تم جلب المنتج بنجاح",
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

exports.updateProduct = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, price, category, colors, fabric, originalPrice } = req.body;

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
      (color) => !color.sizes || color.sizes.length === 0
    );
    if (invalidColors) {
      return res.status(400).json({
        success: false,
        message: "يجب أن يحتوي كل لون على مقاس واحد على الأقل",
      });
    }

    const product = await Product.findById(id);
    if (!product) {
      return res.status(404).json({
        success: false,
        message: "المنتج غير موجود",
      });
    }

    // تحديث الألوان والصور
    const processedColors = await Promise.all(
      colors.map(async (color) => {
        const existingColor = product.colors.find(
          (c) => c.color === color.color
        );

        // الصور الجديدة (التي سيتم رفعها)
        const base64Images = (color.images || []).filter((img) =>
          img.startsWith("data:")
        );
        const retainedImages = (color.images || []).filter(
          (img) => !img.startsWith("data:")
        );

        // رفع الصور الجديدة إن وجدت
        const newUploadedImages =
          base64Images.length > 0
            ? await uploadMultipleImages(base64Images)
            : [];

        // حذف الصور التي كانت موجودة سابقًا وتم حذفها من الواجهة
        const previousImages = existingColor?.images || [];
        const removedImages = previousImages.filter(
          (img) => !retainedImages.includes(img)
        );

        await Promise.all(
          removedImages.map((img) => deleteImageFromCloudinary(img))
        );

        return {
          ...color,
          images: [...retainedImages, ...newUploadedImages],
          sizes: color.sizes.map((size) => {
            const existingSize = existingColor?.sizes?.find(
              (s) => s.size === size.size
            );

            return {
              ...size,
              barcode: existingSize?.barcode || generateBarcode(),
            };
          }),
        };
      })
    );

    product.name = name;
    product.price = price;
    product.category = category;
    product.originalPrice = originalPrice;
    product.colors = processedColors;
    if (fabric) {
      product.fabric = fabric;
    }

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
    const product = await Product.findByIdAndDelete(req.params.id);
    if (!product) {
      return res.status(404).json({
        success: false,
        message: "المنتج غير موجود",
        data: null,
      });
    }
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

exports.updateSizeQuantity = async (req, res) => {
  try {
    const { productId, colorIndex, sizeIndex } = req.params;
    const { quantity } = req.body;

    if (typeof quantity !== "number" || quantity < 0) {
      return res.status(400).json({
        success: false,
        message: "الكمية يجب أن تكون رقم موجب",
        data: null,
      });
    }

    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({
        success: false,
        message: "المنتج غير موجود",
        data: null,
      });
    }

    const colorIdx = parseInt(colorIndex);
    if (colorIdx < 0 || colorIdx >= product.colors.length) {
      return res.status(400).json({
        success: false,
        message: "اللون المحدد غير موجود",
        data: null,
      });
    }

    const szIdx = parseInt(sizeIndex);
    if (szIdx < 0 || szIdx >= product.colors[colorIdx].sizes.length) {
      return res.status(400).json({
        success: false,
        message: "المقاس المحدد غير موجود",
        data: null,
      });
    }

    product.colors[colorIdx].sizes[szIdx].quantity = quantity;

    await product.save();

    res.json({
      success: true,
      message: "تم تحديث الكمية بنجاح",
      data: {
        productId,
        colorIndex,
        sizeIndex,
        newQuantity: quantity,
      },
    });
  } catch (error) {
    console.error("Error updating size quantity:", error);
    res.status(500).json({
      success: false,
      message: "حدث خطأ أثناء تحديث الكمية",
      data: null,
    });
  }
};
