import AWS from 'aws-sdk';
import { v4 as uuidv4 } from 'uuid';

// Configure AWS S3
const s3 = new AWS.S3({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION
});

// ============================================
// UPLOAD FILE TO S3
// ============================================
export const uploadToS3 = async (file, folder = 'uploads') => {
  const fileExtension = file.originalname.split('.').pop();
  const fileName = `${folder}/${uuidv4()}.${fileExtension}`;

  const params = {
    Bucket: process.env.AWS_S3_BUCKET_NAME,
    Key: fileName,
    Body: file.buffer,
    ContentType: file.mimetype,
    ACL: 'public-read'
  };

  const result = await s3.upload(params).promise();
  return result.Location;
};

// ============================================
// DELETE FILE FROM S3
// ============================================
export const deleteFromS3 = async (fileUrl) => {
  try {
    const fileName = fileUrl.split('.com/')[1];
    
    const params = {
      Bucket: process.env.AWS_S3_BUCKET_NAME,
      Key: fileName
    };

    await s3.deleteObject(params).promise();
    console.log('✅ Old avatar deleted from S3');
  } catch (error) {
    console.error('Error deleting from S3:', error);
  }
};