// update-orders-to-new-schema.js
require("dotenv").config();
const mongoose = require("mongoose");

// ────────────────────────────────────────────────
// Import BOTH models (Order + Product)
const Order = require("./models/Order");       // your Order model
const Product = require("./models/Product");   // ← ADD THIS LINE (adjust path)

// Use your real connection string (or keep it in .env)
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://nesrinebka21:nesrinebka21@cluster0.2yyiwtw.mongodb.net/nesrinebka?retryWrites=true&w=majority&appName=Cluster0';

if (!MONGODB_URI) {
  console.error("MONGODB_URI is not defined");
  process.exit(1);
}

async function updateOrders() {
  try {
    // 1. Connect to MongoDB
    await mongoose.connect(MONGODB_URI);
    console.log("Connected to MongoDB");

    // 2. Find orders that still have totalPrice (old field) and no total (new field)
    const ordersToUpdate = await Order.find({
      totalPrice: { $exists: true },
      total: { $exists: false },
    })
      .populate({
        path: "items.product",
        select: "originalPrice price name", // only needed fields
      })
      .lean();

    if (ordersToUpdate.length === 0) {
      console.log("No orders need updating. All already migrated.");
      return;
    }

    console.log(`Found ${ordersToUpdate.length} orders to update...`);

    const bulkOps = ordersToUpdate.map((order) => {
      let calculatedOriginalTotal = 0;
      let calculatedProfit = 0;

      // Calculate using populated product data (if available)
      if (order.items && Array.isArray(order.items)) {
        order.items.forEach((item) => {
          const product = item.product;

          // If product was populated → use real originalPrice
          const itemOriginalPrice = product?.originalPrice || 0;
          const itemPrice = product?.price || item.price || order.totalPrice / order.items.length;

          calculatedOriginalTotal += itemOriginalPrice * item.quantity;
          calculatedProfit += (itemPrice - itemOriginalPrice) * item.quantity;
        });
      } else {
        // Very old fallback
        calculatedOriginalTotal = order.totalPrice;
        calculatedProfit = 0;
      }

      return {
        updateOne: {
          filter: { _id: order._id },
          update: {
            $set: {
              total: order.totalPrice,
              originalTotal: calculatedOriginalTotal,
              profit: calculatedProfit,
              discountAmount: 0,
            },
            $unset: { totalPrice: "" }, // remove old field
          },
        },
      };
    });

    // 3. Run bulk update
    const result = await Order.bulkWrite(bulkOps, { ordered: false });

    console.log("Update complete!");
    console.log(`Matched: ${result.matchedCount}`);
    console.log(`Modified: ${result.modifiedCount}`);

  } catch (err) {
    console.error("Error during migration:", err);
  } finally {
    await mongoose.connection.close();
    console.log("MongoDB connection closed");
  }
}

// Run
updateOrders();