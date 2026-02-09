// set-status-updated-at-to-yesterday.js
const mongoose = require('mongoose');
const Order = require('./models/Order'); // ← adjust path to your Order model

require('dotenv').config();

async function setStatusUpdatedAtToYesterday() {
  try {
    await mongoose.connect(process.env.MONGODB_URI || process.env.MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });

    console.log('Connected to MongoDB');

    // Target date: 8 February 2026 at 00:00:00 (midnight)
    const targetDate = new Date('2026-02-07T00:00:00.000Z');

    console.log(`Target date: ${targetDate.toISOString()} (${targetDate.toLocaleDateString('fr-FR')})`);

    // Option A: Update ALL documents
    // const filter = {};

    // Option B: Update only documents that already have the field (safer)
    const filter = { statusUpdatedAt: { $exists: true } };

    // Option C: Update only documents created before a certain date
    // const filter = { createdAt: { $lt: new Date('2026-02-09') } };

    const result = await Order.updateMany(
      filter,
      { $set: { statusUpdatedAt: targetDate } },
      { timestamps: false } // ← prevents automatic update of updatedAt
    );

    console.log('Update result:');
    console.log(`- Matched documents:   ${result.matchedCount}`);
    console.log(`- Modified documents:  ${result.modifiedCount}`);

    // Optional: show a few examples after update
    const sample = await Order.find(filter)
      .sort({ createdAt: -1 })
      .limit(5)
      .select('orderNumber status statusUpdatedAt updatedAt createdAt');

    console.log('\nSample documents after update:');
    console.table(sample.map(doc => ({
      orderNumber: doc.orderNumber,
      status: doc.status,
      statusUpdatedAt: doc.statusUpdatedAt?.toISOString(),
      updatedAt: doc.updatedAt?.toISOString(),
      createdAt: doc.createdAt?.toISOString()
    })));

  } catch (err) {
    console.error('Error during update:', err);
  } finally {
    await mongoose.connection.close();
    console.log('Connection closed');
  }
}

setStatusUpdatedAtToYesterday();