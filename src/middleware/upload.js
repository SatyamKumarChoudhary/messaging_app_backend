import multer from 'multer';

// File size limits (in bytes)
const MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_VIDEO_SIZE = 50 * 1024 * 1024; // 50MB
const MAX_AUDIO_SIZE = 20 * 1024 * 1024; // 20MB
const MAX_FILE_SIZE = 25 * 1024 * 1024;  // 25MB

// Allowed file types
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
const ALLOWED_VIDEO_TYPES = ['video/mp4', 'video/mpeg', 'video/quicktime', 'video/webm'];
const ALLOWED_AUDIO_TYPES = ['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/ogg', 'audio/webm'];
const ALLOWED_FILE_TYPES = ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];

// Configure Multer to store files in memory (not disk)
const storage = multer.memoryStorage();

// File filter function
const fileFilter = (req, file, cb) => {
  const mimeType = file.mimetype;

  // Check if file type is allowed
  const isImage = ALLOWED_IMAGE_TYPES.includes(mimeType);
  const isVideo = ALLOWED_VIDEO_TYPES.includes(mimeType);
  const isAudio = ALLOWED_AUDIO_TYPES.includes(mimeType);
  const isFile = ALLOWED_FILE_TYPES.includes(mimeType);

  if (isImage || isVideo || isAudio || isFile) {
    cb(null, true); // Accept file
  } else {
    cb(new Error('Invalid file type. Only images, videos, audio, and documents are allowed.'), false);
  }
};

// Multer upload configuration
export const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: MAX_VIDEO_SIZE, // Maximum file size (use largest limit)
  },
});

// Validate file size based on type (called after upload)
export const validateFileSize = (file) => {
  const mimeType = file.mimetype;

  if (ALLOWED_IMAGE_TYPES.includes(mimeType) && file.size > MAX_IMAGE_SIZE) {
    throw new Error(`Image file too large. Maximum size: ${MAX_IMAGE_SIZE / 1024 / 1024}MB`);
  }
  
  if (ALLOWED_VIDEO_TYPES.includes(mimeType) && file.size > MAX_VIDEO_SIZE) {
    throw new Error(`Video file too large. Maximum size: ${MAX_VIDEO_SIZE / 1024 / 1024}MB`);
  }
  
  if (ALLOWED_AUDIO_TYPES.includes(mimeType) && file.size > MAX_AUDIO_SIZE) {
    throw new Error(`Audio file too large. Maximum size: ${MAX_AUDIO_SIZE / 1024 / 1024}MB`);
  }
  
  if (ALLOWED_FILE_TYPES.includes(mimeType) && file.size > MAX_FILE_SIZE) {
    throw new Error(`File too large. Maximum size: ${MAX_FILE_SIZE / 1024 / 1024}MB`);
  }

  return true;
};