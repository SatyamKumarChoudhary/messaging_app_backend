import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import pool from '../config/db.js';

// User Registration (Phone-Based)
export const register = async (req, res) => {
  try {
    const { username, email, phone, password } = req.body;

    // Validate input - Phone is REQUIRED
    if (!phone || !password) {
      return res.status(400).json({ error: 'Phone and password are required' });
    }

    // Phone validation (Indian format: +919876543210)
    const phoneRegex = /^\+91[6-9]\d{9}$/;
    if (!phoneRegex.test(phone)) {
      return res.status(400).json({ 
        error: 'Invalid phone format. Use: +919876543210' 
      });
    }

    // Check if phone already registered
    const userExists = await pool.query(
      'SELECT * FROM users WHERE phone = $1',
      [phone]
    );

    if (userExists.rows.length > 0) {
      return res.status(400).json({ error: 'Phone number already registered' });
    }

    // Hash password
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    // Insert user into database
    const newUser = await pool.query(
      'INSERT INTO users (username, email, phone, password_hash) VALUES ($1, $2, $3, $4) RETURNING id, username, email, phone',
      [username || null, email || null, phone, hashedPassword]
    );

    const userId = newUser.rows[0].id;

    // 🔥 DELIVER PENDING INVITES - Check if anyone sent messages to this phone before registration
    const pendingInvites = await pool.query(
      'SELECT * FROM pending_invites WHERE receiver_phone = $1 AND is_delivered = false',
      [phone]
    );

    if (pendingInvites.rows.length > 0) {
      console.log(`📨 Found ${pendingInvites.rows.length} pending invites for ${phone}`);
      
      // Move pending invites to messages table (now that user is registered)
      for (const invite of pendingInvites.rows) {
        await pool.query(
          'INSERT INTO messages (sender_id, receiver_id, text, is_delivered, created_at) VALUES ($1, $2, $3, $4, $5)',
          [invite.sender_id, userId, invite.text, false, invite.created_at]
        );
      }

      // Delete delivered pending invites
      await pool.query(
        'DELETE FROM pending_invites WHERE receiver_phone = $1',
        [phone]
      );

      console.log(`✅ Moved ${pendingInvites.rows.length} pending invites to messages table`);
    }

    // Generate JWT token (include phone)
    const token = jwt.sign(
      { 
        user_id: userId, 
        phone: phone,
        username: username || phone
      },
      process.env.JWT_SECRET,
      { expiresIn: '30d' }
    );

    res.status(201).json({
      success: true,
      message: 'User registered successfully',
      token,
      user: {
        id: newUser.rows[0].id,
        username: newUser.rows[0].username,
        email: newUser.rows[0].email,
        phone: newUser.rows[0].phone
      },
      pendingMessagesDelivered: pendingInvites.rows.length
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

// User Login (Phone-Based)
export const login = async (req, res) => {
  try {
    const { phone, password } = req.body;

    // Validate input
    if (!phone || !password) {
      return res.status(400).json({ error: 'Phone and password are required' });
    }

    // Find user by phone
    const user = await pool.query(
      'SELECT * FROM users WHERE phone = $1',
      [phone]
    );

    if (user.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Compare password
    const validPassword = await bcrypt.compare(password, user.rows[0].password_hash);

    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Generate JWT token (include phone)
    const token = jwt.sign(
      { 
        user_id: user.rows[0].id, 
        phone: user.rows[0].phone,
        username: user.rows[0].username || user.rows[0].phone
      },
      process.env.JWT_SECRET,
      { expiresIn: '30d' }
    );

    res.json({
      success: true,
      message: 'Login successful',
      token,
      user: {
        id: user.rows[0].id,
        username: user.rows[0].username,
        email: user.rows[0].email,
        phone: user.rows[0].phone
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};