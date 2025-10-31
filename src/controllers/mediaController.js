import { uploadToS3, getFileCategory } from '../services/s3Service.js';
import { validateFileSize } from '../middleware/upload.js';

/**
 * Upload media file to S3
 * POST /api/media/upload
 */
export const uploadMedia = async (req, res) => {
  try {
    const userId = req.user.user_id; // From JWT token
    const file = req.file; // From multer

    // Validate file exists
    if (!file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    // Validate file size based on type
    try {
      validateFileSize(file);
    } catch (sizeError) {
      return res.status(400).json({ error: sizeError.message });
    }

    console.log(`📤 Uploading file: ${file.originalname} (${file.size} bytes)`);

    // Upload to S3
    const s3Url = await uploadToS3(
      file.buffer,
      file.originalname,
      file.mimetype,
      userId
    );

    // Determine file category
    const fileCategory = getFileCategory(file.mimetype);

    // Return success response
    res.status(200).json({
      success: true,
      message: 'File uploaded successfully',
      data: {
        media_url: s3Url,
        file_name: file.originalname,
        file_size: file.size,
        file_type: file.mimetype,
        message_type: fileCategory, // 'image', 'video', 'audio', or 'file'
      },
    });

  } catch (error) {
    console.error('Upload media error:', error);
    res.status(500).json({ 
      error: 'Failed to upload file',
      details: error.message 
    });
  }
};