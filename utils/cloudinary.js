// utils/cloudinary.js
const cloudinary = require("cloudinary").v2;
require("dotenv").config();

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

/**
 * Upload a single image (base64 or URL)
 */
const uploadSingleImage = async (imageData, folder = "products") => {
  return await cloudinary.uploader.upload(imageData, {
    folder,
  });
};

/**
 * Upload multiple images (returns array of uploaded URLs)
 */
const uploadMultipleImages = async (images, folder = "products") => {
  const uploaded = await Promise.all(
    images.map((img) => uploadSingleImage(img, folder))
  );
  return uploaded.map((file) => file.secure_url);
};

const deleteImageFromCloudinary = async (imageUrl) => {
  const publicId = imageUrl.split("/").pop().split(".")[0];
  console.log('publicId', 'products/'+publicId)
  await cloudinary.uploader.destroy('products/'+publicId);
};
module.exports = {
  uploadSingleImage,
  uploadMultipleImages,
  deleteImageFromCloudinary,
};
