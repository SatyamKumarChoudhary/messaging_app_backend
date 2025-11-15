import { verifyOTP } from './otpService.js';
import pool from '../../config/db.js';
import jwt from 'jsonwebtoken';

export async function sendOTPController(req, res) {
  const { phone } = req.body;

  if (!phone) {
    return res.status(400).json({ success: false, message: 'Phone number required' });
  }

  return res.json({
    success: true,
    message: 'Use Firebase Client SDK to send OTP',
    phone
  });
}

export async function verifyOTPController(req, res) {
  const { idToken } = req.body;

  if (!idToken) {
    return res.status(400).json({ success: false, message: 'ID token required' });
  }

  const verificationResult = await verifyOTP(idToken);

  if (!verificationResult.success) {
    return res.status(401).json({
      success: false,
      message: 'OTP verification failed',
      error: verificationResult.error
    });
  }

  const { phone } = verificationResult;

  try {
    const userQuery = await pool.query(
      'SELECT * FROM users WHERE phone = $1',
      [phone]
    );

    if (userQuery.rows.length === 0) {
      return res.json({
        success: true,
        isNewUser: true,
        phone
      });
    }

    const user = userQuery.rows[0];
    const token = jwt.sign(
      { id: user.id, phone: user.phone },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    return res.json({
      success: true,
      token,
      user: {
        id: user.id,
        phone: user.phone,
        username: user.username
      }
    });
  } catch (error) {
    console.error('Database error:', error);
    return res.status(500).json({
      success: false,
      message: 'Database error'
    });
  }
}
