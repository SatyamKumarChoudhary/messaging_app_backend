import express from 'express';
import { 
  register, 
  login, 
  registerWithOTP, 
  loginWithOTP 
} from '../controllers/authController.js';

const router = express.Router();

// ========================================
// EXISTING ROUTES (Keep for backup)
// ========================================
router.post('/register', register);
router.post('/login', login);

// ========================================
// NEW ROUTES (OTP-Based)
// ========================================
router.post('/register-with-otp', registerWithOTP);
router.post('/login-with-otp', loginWithOTP);

export default router;