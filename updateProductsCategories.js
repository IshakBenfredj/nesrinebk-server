// scripts/backfill-order-missing-fields.js
// Run with: node scripts/backfill-order-missing-fields.js

const mongoose = require('mongoose');
require('dotenv').config();

const Order = require('./models/Order'); // ← adjust path to your Order model

async function backfillMissingFields() {
  try {
    // 1. Connect
    await mongoose.connect(process.env.MONGODB_URI || process.env.MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });

    console.log('→ Connected to MongoDB');

    // 2. Find documents missing source OR statusUpdatedAt
    const filter = {
      $or: [
        { source: { $exists: false } },
        { statusUpdatedAt: { $exists: false } },
      ],
    };

    const orders = await Order.find(filter)
      .select('_id orderNumber source statusUpdatedAt updatedAt createdAt')
      .lean();

    console.log(`\nFound ${orders.length} orders missing source or statusUpdatedAt`);

    if (orders.length === 0) {
      console.log('Nothing to update. Exiting.');
      return;
    }

    // 3. Prepare bulk operations
    const bulkOps = orders.map((order) => {
      const updateFields = {};

      if (!order.source) {
        updateFields.source = 'أخرى';
      }

      if (!order.statusUpdatedAt) {
        updateFields.statusUpdatedAt = new Date(); // today / now
      }

      return {
        updateOne: {
          filter: { _id: order._id },
          update: { $set: updateFields },
          timestamps: false, // ← very important: do NOT update updatedAt
        },
      };
    });

    // 4. Execute bulk write
    const result = await Order.bulkWrite(bulkOps, { ordered: false });

    console.log('\nBulk update summary:');
    console.log(`  Matched:   ${result.matchedCount}`);
    console.log(`  Modified:  ${result.modifiedCount}`);

    // 5. Optional: show sample of updated documents
    const sample = await Order.find({
      $or: [{ source: 'أخرى' }, { statusUpdatedAt: { $exists: true } }],
    })
      .sort({ createdAt: -1 })

    console.log('\nSample of updated orders:');
    console.table(
      sample.map((o) => ({
        orderNumber: o.orderNumber,
        source: o.source || '(was missing)',
        statusUpdatedAt: o.statusUpdatedAt
          ? o.statusUpdatedAt.toISOString()
          : '(was missing)',
        updatedAt: o.updatedAt.toISOString(),
        createdAt: o.createdAt.toISOString(),
      })),
    );

  } catch (err) {
    console.error('Error during backfill:', err);
  } finally {
    await mongoose.connection.close();
    console.log('→ Connection closed');
  }
}

backfillMissingFields();