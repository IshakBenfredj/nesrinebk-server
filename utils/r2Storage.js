// r2Storage.js

const {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
} = require("@aws-sdk/client-s3");
require("dotenv").config(); 
const s3 = new S3Client({
  region: "auto",
  endpoint: process.env.R2_ENDPOINT,
  forcePathStyle: true, 
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

const BUCKET_NAME = process.env.R2_BUCKET_NAME;
const PUBLIC_URL  = process.env.R2_PUBLIC_URL;

const uploadFile = async (
  fileData,
  folder = "uploads",
  fileName = null,
  contentType = "application/octet-stream"
) => {
  if (typeof fileData === "string" && fileData.startsWith("http")) {
    return fileData;
  }

  let buffer;
  let mimeType = contentType;

  if (typeof fileData === "string" && fileData.includes(";base64,")) {
    const [meta, data] = fileData.split(";base64,");
    mimeType = meta.replace("data:", "");
    buffer = Buffer.from(data, "base64");
  } else if (Buffer.isBuffer(fileData)) {
    buffer = fileData;
  } else {
    throw new Error("fileData must be base64 string or Buffer");
  }

  const ext  = (mimeType.split("/")[1] || "bin").replace(/[^a-z0-9]/gi, "");
  const base = fileName || `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  const key  = `${folder}/${base}.${ext}`;

  await s3.send(
    new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
      Body: buffer,
      ContentType: mimeType,
    })
  );

  return `${PUBLIC_URL}/${key}`;
};

// Helpers
const uploadSingleImage = (data, folder = "images", fileName = null) =>
  uploadFile(data, folder, fileName, "image/jpeg");

const uploadAudio = (data, folder = "audios", fileName = null) =>
  uploadFile(data, folder, fileName, "audio/mpeg");

const uploadVideo = (data, folder = "videos", fileName = null) =>
  uploadFile(data, folder, fileName, "video/mp4");

const uploadMultipleImages = (images, folder = "images") =>
  Promise.all(images.map((img) => uploadSingleImage(img, folder)));

const deleteFileByUrl = async (fileUrl) => {
  try {
    if (!fileUrl) return;
    const key = new URL(fileUrl).pathname.replace(/^\//, "");
    if (!key) return;

    await s3.send(
      new DeleteObjectCommand({
        Bucket: BUCKET_NAME,
        Key: key,
      })
    );

    console.log(`[R2] Deleted: ${key}`);
  } catch (err) {
    console.error("[R2] Delete failed:", err.message);
  }
};

module.exports = {
  uploadFile,
  uploadSingleImage,
  uploadAudio,
  uploadVideo,
  uploadMultipleImages,
  deleteFileByUrl,
};