import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import crypto from 'crypto';
import dotenv from 'dotenv';

dotenv.config();

// Initialize S3 Client
const s3Client = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

/**
 * Upload file to S3 bucket
 * @param {Buffer} fileBuffer - File data
 * @param {string} fileName - Original file name
 * @param {string} mimeType - File MIME type (image/jpeg, video/mp4, etc.)
 * @param {number} userId - User ID for organizing files
 * @param {number} messageId - Message ID for tracking
 * @returns {Promise<string>} - Public S3 URL
 */
export const uploadToS3 = async (fileBuffer, fileName, mimeType, userId, messageId = null) => {
  try {
    // Determine folder based on file type
    let folder = 'files';
    if (mimeType.startsWith('image/')) folder = 'images';
    else if (mimeType.startsWith('video/')) folder = 'videos';
    else if (mimeType.startsWith('audio/')) folder = 'audio';

    // Get current date for organizing (YYYY/MM format)
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');

    // Generate unique filename: userId_messageId_randomHash.ext
    const fileExtension = fileName.split('.').pop();
    const randomHash = crypto.randomBytes(8).toString('hex');
    const msgId = messageId || 'temp';
    const s3FileName = `${userId}_msg${msgId}_${randomHash}.${fileExtension}`;

    // Full S3 key (path): folder/YYYY/MM/filename
    const s3Key = `${folder}/${year}/${month}/${s3FileName}`;

    // Upload parameters
    const uploadParams = {
      Bucket: process.env.AWS_S3_BUCKET_NAME,
      Key: s3Key,
      Body: fileBuffer,
      ContentType: mimeType,
      // ACL: 'public-read', // Deprecated, use bucket policy instead
    };

    // Upload to S3
    const command = new PutObjectCommand(uploadParams);
    await s3Client.send(command);

    // Construct public URL
    const publicUrl = `https://${process.env.AWS_S3_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${s3Key}`;

    console.log(`✅ File uploaded to S3: ${publicUrl}`);
    
    return publicUrl;

  } catch (error) {
    console.error('❌ S3 upload error:', error);
    throw new Error('Failed to upload file to S3');
  }
};

/**
 * Get file type category from MIME type
 * @param {string} mimeType - MIME type
 * @returns {string} - 'image', 'video', 'audio', or 'file'
 */
export const getFileCategory = (mimeType) => {
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('video/')) return 'video';
  if (mimeType.startsWith('audio/')) return 'audio';
  return 'file';
};