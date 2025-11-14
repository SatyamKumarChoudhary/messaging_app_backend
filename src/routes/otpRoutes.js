import express from 'express';
import { sendOTPController, verifyOTPController } from '../services/otp/otpController.js';

const router = express.Router();

/**
 * @route   POST /api/otp/send
 * @desc    Initiate OTP sending (frontend will use Firebase Client SDK)
 * @access  Public
 * @body    { phone: "+919876543210" }
 */
router.post('/send', sendOTPController);

/**
 * @route   POST /api/otp/verify
 * @desc    Verify OTP token from Firebase
 * @access  Public
 * @body    { idToken: "firebase-id-token-from-frontend" }
 * @returns { success, token, user } or { success, isNewUser: true, phone }
 */
router.post('/verify', verifyOTPController);

export default router;