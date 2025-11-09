import pool from '../config/db.js';
import { uploadToS3, deleteFromS3 } from '../utils/s3Upload.js';

// ============================================
// GET USER PROFILE
// ============================================
export const getProfile = async (req, res) => {
  try {
    const userId = req.user.user_id;

    const result = await pool.query(
      `SELECT id, username, email, phone, ghost_name, bio, avatar_url, 
              credits, is_premium, created_at, updated_at 
       FROM users 
       WHERE id = $1`,
      [userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({
      success: true,
      user: result.rows[0]
    });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

// ============================================
// UPDATE PROFILE (username, bio)
// ============================================
export const updateProfile = async (req, res) => {
  try {
    const userId = req.user.user_id;
    const { username, bio } = req.body;

    // Validation
    if (!username && bio === undefined) {
      return res.status(400).json({ error: 'Provide at least one field to update' });
    }

    // Check if username is taken (if updating username)
    if (username) {
      const usernameExists = await pool.query(
        'SELECT id FROM users WHERE username = $1 AND id != $2',
        [username, userId]
      );

      if (usernameExists.rows.length > 0) {
        return res.status(400).json({ error: 'Username already taken' });
      }
    }

    // Build dynamic update query
    let updateFields = [];
    let values = [];
    let paramCount = 1;

    if (username) {
      updateFields.push(`username = $${paramCount}`);
      values.push(username);
      paramCount++;
    }

    if (bio !== undefined) {
      updateFields.push(`bio = $${paramCount}`);
      values.push(bio);
      paramCount++;
    }

    values.push(userId);

    const query = `
      UPDATE users 
      SET ${updateFields.join(', ')} 
      WHERE id = $${paramCount}
      RETURNING id, username, email, phone, ghost_name, bio, avatar_url, 
                credits, is_premium, created_at, updated_at
    `;

    const result = await pool.query(query, values);

    res.json({
      success: true,
      message: 'Profile updated successfully',
      user: result.rows[0]
    });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

// ============================================
// UPLOAD AVATAR
// ============================================
export const uploadAvatar = async (req, res) => {
  try {
    const userId = req.user.user_id;

    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    // Validate file type
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    if (!allowedTypes.includes(req.file.mimetype)) {
      return res.status(400).json({ error: 'Only JPG, PNG, and WEBP images allowed' });
    }

    // Validate file size (max 5MB)
    if (req.file.size > 5 * 1024 * 1024) {
      return res.status(400).json({ error: 'File size must be less than 5MB' });
    }

    // Get current avatar URL (to delete old one)
    const currentUser = await pool.query(
      'SELECT avatar_url FROM users WHERE id = $1',
      [userId]
    );

    // Upload new avatar to S3
    const avatarUrl = await uploadToS3(req.file, 'avatars');

    // Update database with new avatar URL
    const result = await pool.query(
      `UPDATE users 
       SET avatar_url = $1 
       WHERE id = $2 
       RETURNING avatar_url`,
      [avatarUrl, userId]
    );

    // Delete old avatar from S3 (if exists)
    if (currentUser.rows[0]?.avatar_url) {
      await deleteFromS3(currentUser.rows[0].avatar_url);
    }

    res.json({
      success: true,
      message: 'Avatar updated successfully',
      avatar_url: result.rows[0].avatar_url
    });
  } catch (error) {
    console.error('Upload avatar error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};