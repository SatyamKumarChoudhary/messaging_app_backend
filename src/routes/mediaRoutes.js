import express from 'express';
import { uploadMedia } from '../controllers/mediaController.js';
import { verifyToken } from '../middleware/auth.js';
import { upload } from '../middleware/upload.js';

const router = express.Router();

// All media routes require authentication
router.use(verifyToken);

// POST /api/media/upload - Upload single file (image/video/audio/file)
router.post('/upload', upload.single('file'), uploadMedia);

export default router;