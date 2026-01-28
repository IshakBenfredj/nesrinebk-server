const mongoose = require('mongoose');
const Product = require('./models/Product'); // adjust path

mongoose.connect('mongodb+srv://nesrinebka21:nesrinebka21@cluster0.2yyiwtw.mongodb.net/nesrinebka?retryWrites=true&w=majority&appName=Cluster0', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

async function updateProducts() {
  try {
    const products = await Product.find({});
    console.log(`Found ${products.length} products`);

    let updatedCount = 0;

    for (const product of products) {
      console.log(`Product ${product._id}: category =`, product.category, `type:`, typeof product.category);

      if (!Array.isArray(product.category)) {
        console.log(`→ Updating product ${product._id} (was ${product.category})`);
        product.category = [product.category];
        await product.save();
        updatedCount++;
      }
    }

    console.log(`Update complete. ${updatedCount} products were modified.`);
  } catch (error) {
    console.error('Error:', error);
  } finally {
    mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  }
}

updateProducts();