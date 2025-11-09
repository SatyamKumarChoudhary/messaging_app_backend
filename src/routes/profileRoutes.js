import express from 'express';
import { 
  getProfile, 
  updateProfile, 
  uploadAvatar 
} from '../controllers/profileController.js';
import { verifyToken } from '../middleware/auth.js';

const router = express.Router();

// All profile routes require authentication
router.use(verifyToken);

// GET /api/profile - Get user profile
router.get('/', getProfile);

// PUT /api/profile/update - Update profile (username, bio)
router.put('/update', updateProfile);

// POST /api/profile/avatar - Upload avatar
router.post('/avatar', uploadAvatar);

export default router;