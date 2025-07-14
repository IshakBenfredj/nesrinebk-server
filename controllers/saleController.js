const Sale = require("../models/Sale");
const Product = require("../models/Product");
const DailyProfit = require("../models/DailyProfit");
const { updateProductStock } = require("../utils/productUtils");
const { v4: uuidv4 } = require("uuid");

// Create a new sale
exports.createSale = async (req, res) => {
  try {
    const { items, cashier } = req.body;

    // Validate items
    if (!items || items.length === 0) {
      return res.status(400).json({
        success: false,
        error: "No items in the sale",
      });
    }

    // Calculate totals
    let total = 0;
    let originalTotal = 0;
    let profit = 0;

    // Prepare items with original price
    const saleItems = await Promise.all(
      items.map(async (item) => {
        const product = await Product.findById(item.product);
        if (!product) {
          throw new Error(`Product not found: ${item.product}`);
        }

        // Find the specific size and color
        let foundSize = null;
        let foundColor = null;

        product.colors.forEach((color) => {
          color.sizes.forEach((size) => {
            if (size.barcode === item.barcode) {
              foundSize = size;
              foundColor = color;
            }
          });
        });

        if (!foundSize || !foundColor) {
          throw new Error(
            `Product variant not found for barcode: ${item.barcode}`
          );
        }

        // Check stock
        if (foundSize.quantity < item.quantity) {
          throw new Error(`Insufficient stock for product: ${product.name}`);
        }

        // Calculate prices
        const itemTotal = item.quantity * product.price;
        const itemOriginalTotal = item.quantity * product.originalPrice;
        const itemProfit = itemTotal - itemOriginalTotal;

        total += itemTotal;
        originalTotal += itemOriginalTotal;
        profit += itemProfit;

        return {
          product: product._id,
          barcode: item.barcode,
          quantity: item.quantity,
          price: product.price,
          originalPrice: product.originalPrice,
          size: foundSize.size,
          color: foundColor.color,
        };
      })
    );

    // Create the sale with a unique barcode
    const sale = new Sale({
      barcode: uuidv4().substring(0, 8).toUpperCase(), // Generate 8-char unique barcode
      items: saleItems,
      total,
      originalTotal,
      profit,
      cashier,
    });

    // Update product stocks and sold counts
    await Promise.all(
      saleItems.map(async (item) => {
        await updateProductStock(
          item.product,
          item.barcode,
          -item.quantity,
          true
        );
      })
    );

    // Save the sale
    await sale.save();

    // Update daily profit
    await updateDailyProfit(sale.createdAt, total, originalTotal, profit);

    res.status(201).json({
      success: true,
      data: sale,
    });
  } catch (error) {
    console.error("Error creating sale:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

// Get sale by ID
exports.getSaleById = async (req, res) => {
  try {
    const { id } = req.params;

    const sale = await Sale.findById(id)
      .populate("cashier", "name")
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
      expired: hoursDiff > 24,
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

    // First try to find by sale barcode
    let sale = await Sale.findOne({ barcode })
      .populate("cashier", "name")
      .populate({
        path: "items.product",
        model: "Product",
        select: "name price colors barcode",
      });

    // If not found by sale barcode, try by item barcode
    if (!sale) {
      sale = await Sale.findOne({ "items.barcode": barcode })
        .populate("cashier", "name")
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

    // Check if sale is within 24 hours for exchanges
    const now = new Date();
    const saleTime = new Date(sale.createdAt);
    const hoursDiff = (now - saleTime) / (1000 * 60 * 60);

    res.json({
      success: true,
      expired: hoursDiff > 24,
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
    const { exchanges, cashier } = req.body; // Now expects array of exchanges

    // Validate input
    if (!exchanges || !Array.isArray(exchanges) || exchanges.length === 0) {
      return res.status(400).json({
        success: false,
        error: "No exchange items provided",
      });
    }

    // Find the sale
    const sale = await Sale.findById(saleId);
    if (!sale) {
      return res.status(404).json({
        success: false,
        error: "Sale not found",
      });
    }

    // Check if sale is within 24 hours
    const now = new Date();
    const saleTime = new Date(sale.createdAt);
    const hoursDiff = (now - saleTime) / (1000 * 60 * 60);

    if (hoursDiff > 24) {
      return res.status(400).json({
        success: false,
        error: "Exchange period has expired (24 hours)",
      });
    }

    // Prepare for batch processing
    const stockUpdates = [];
    const exchangeRecords = [];
    let totalOriginalAmount = 0;
    let totalNewAmount = 0;
    let totalOriginalCost = 0;
    let totalNewCost = 0;

    // Process each exchange
    for (const exchange of exchanges) {
      const { originalBarcode, newBarcode, newQuantity } = exchange;

      // Find the original item in the sale
      const originalItem = sale.items.find(
        (item) => item.barcode === originalBarcode
      );
      if (!originalItem) {
        return res.status(404).json({
          success: false,
          error: `Original item with barcode ${originalBarcode} not found in sale`,
        });
      }

      // Find the new product
      const newProduct = await Product.findOne({
        "colors.sizes.barcode": newBarcode,
      });
      if (!newProduct) {
        return res.status(404).json({
          success: false,
          error: `New product with barcode ${newBarcode} not found`,
        });
      }

      // Find the specific size and color for new product
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
          error: `New product variant with barcode ${newBarcode} not found`,
        });
      }

      // Validate new quantity
      if (newQuantity < 1) {
        return res.status(400).json({
          success: false,
          error: `Invalid quantity for product ${newBarcode}`,
        });
      }

      if (newQuantity > newSize.quantity) {
        return res.status(400).json({
          success: false,
          error: `Insufficient stock for product ${newBarcode} (Available: ${newSize.quantity})`,
        });
      }

      // Prepare the exchanged item
      const exchangedItem = {
        product: newProduct._id,
        barcode: newBarcode,
        quantity: newQuantity,
        price: newProduct.price,
        originalPrice: newProduct.originalPrice,
        size: newSize.size,
        color: newColor.color,
      };

      // Calculate amounts
      const originalAmount = originalItem.quantity * originalItem.price;
      const newAmount = newQuantity * newProduct.price;
      const priceDifference = newAmount - originalAmount;

      const originalCost = originalItem.quantity * originalItem.originalPrice;
      const newCost = newQuantity * newProduct.originalPrice;

      // Add to stock updates
      stockUpdates.push(
        // Return original item to stock
        updateProductStock(
          originalItem.product,
          originalItem.barcode,
          originalItem.quantity,
          false
        ),
        // Remove new item from stock
        updateProductStock(newProduct._id, newBarcode, -newQuantity, false)
      );

      // Update sale items
      sale.items = sale.items.map((item) =>
        item.barcode === originalBarcode ? exchangedItem : item
      );

      // Add to exchange records
      exchangeRecords.push({
        originalItem,
        exchangedWith: exchangedItem,
        priceDifference,
      });

      // Accumulate totals
      totalOriginalAmount += originalAmount;
      totalNewAmount += newAmount;
      totalOriginalCost += originalCost;
      totalNewCost += newCost;
    }

    // Execute all stock updates
    await Promise.all(stockUpdates);

    // Recalculate sale totals
    sale.total = sale.items.reduce(
      (sum, item) => sum + item.quantity * item.price,
      0
    );
    sale.originalTotal = sale.items.reduce(
      (sum, item) => sum + item.quantity * item.originalPrice,
      0
    );
    sale.profit = sale.total - sale.originalTotal;
    sale.isExchanged = true;

    // Add all exchanges to history
    sale.exchanges.push(...exchangeRecords);

    // Save the updated sale
    await sale.save();

    // Update daily profit for both days
    await Promise.all([
      updateDailyProfit(
        saleTime,
        -totalOriginalAmount,
        -totalOriginalCost,
        -(totalOriginalAmount - totalOriginalCost)
      ),
      updateDailyProfit(
        now,
        totalNewAmount,
        totalNewCost,
        totalNewAmount - totalNewCost
      ),
    ]);

    res.json({
      success: true,
      data: sale,
    });
  } catch (error) {
    console.error("Error exchanging products:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

// Get all sales

exports.getAllSales = async (req, res) => {
  try {
    const { date, page = 1, limit = 10 } = req.query;

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
      .skip((page - 1) * limit)
      .limit(parseInt(limit))
      .populate("cashier", "name")
      .populate("items.product") // populate product in items
      .lean(); // convert to plain JS objects so we can modify deeply

    // Manually populate product inside exchanges' originalItem and exchangedWith
    sales = await Promise.all(
      sales.map(async (sale) => {
        if (sale.exchanges && sale.exchanges.length > 0) {
          for (const exchange of sale.exchanges) {
            if (exchange.originalItem?.product) {
              exchange.originalItem.product = await Product.findById(
                exchange.originalItem.product
              ).select("name price");
            }
            if (exchange.exchangedWith?.product) {
              exchange.exchangedWith.product = await Product.findById(
                exchange.exchangedWith.product
              ).select("name price");
            }
          }
        }
        return sale;
      })
    );

    const total = await Sale.countDocuments(query);

    res.json({
      success: true,
      data: {
        sales,
        total,
        pages: Math.ceil(total / limit),
        currentPage: parseInt(page),
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

// Helper function to update daily profit
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
      { upsert: true, new: true }
    );
  } catch (error) {
    console.error("Error updating daily profit:", error);
  }
};
