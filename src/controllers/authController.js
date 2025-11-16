import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import pool from '../config/db.js';

// User Registration
export const register = async (req, res) => {
  try {
    const { username, email, phone, password, ghost_name, bio } = req.body;

    // Validate input
    if (!username || !email || !phone || !password || !ghost_name) {
      return res.status(400).json({ error: 'All fields are required including ghost name' });
    }

    // Validate ghost_name format
    if (!ghost_name.startsWith('Ghost_')) {
      return res.status(400).json({ error: 'Ghost name must start with "Ghost_"' });
    }

    if (ghost_name.length < 8 || ghost_name.length > 50) {
      return res.status(400).json({ error: 'Ghost name must be between 8-50 characters' });
    }

    // Check if user already exists
    const userExists = await pool.query(
      'SELECT * FROM users WHERE username = $1 OR email = $2 OR phone = $3 OR ghost_name = $4',
      [username, email, phone, ghost_name]
    );

    if (userExists.rows.length > 0) {
      if (userExists.rows[0].ghost_name === ghost_name) {
        return res.status(400).json({ error: 'Ghost name already taken' });
      }
      return res.status(400).json({ error: 'User already exists' });
    }

    // Hash password
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    // Auto-generate bio: "hey i am {ghost_name}"
    const autoBio = bio || `hey i am ${ghost_name}`;

    // Insert user into database with ghost_name
    const newUser = await pool.query(
      'INSERT INTO users (username, email, phone, password_hash, bio, ghost_name) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, username, email, phone, bio, ghost_name, credits, is_premium, created_at',
      [username, email, phone, hashedPassword, autoBio, ghost_name]
    );

    // Generate JWT token
    const token = jwt.sign(
      { 
        user_id: newUser.rows[0].id, 
        username: newUser.rows[0].username, 
        ghost_name: newUser.rows[0].ghost_name 
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
        phone: newUser.rows[0].phone,
        ghost_name: newUser.rows[0].ghost_name,
        bio: newUser.rows[0].bio,
        credits: newUser.rows[0].credits,
        is_premium: newUser.rows[0].is_premium,
        created_at: newUser.rows[0].created_at
      }
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

// User Login
export const login = async (req, res) => {
  try {
    const { phone, password } = req.body;

    // Validate input
    if (!phone || !password) {
      return res.status(400).json({ error: 'Phone and password required' });
    }

    // Find user BY PHONE
    const user = await pool.query(
      'SELECT id, username, email, phone, password_hash, ghost_name, bio, avatar_url, credits, is_premium, created_at FROM users WHERE phone = $1',
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

    // Generate JWT token
    const token = jwt.sign(
      { 
        user_id: user.rows[0].id, 
        username: user.rows[0].username,
        ghost_name: user.rows[0].ghost_name 
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
        phone: user.rows[0].phone,
        ghost_name: user.rows[0].ghost_name,
        bio: user.rows[0].bio,
        avatar_url: user.rows[0].avatar_url,
        credits: user.rows[0].credits,
        is_premium: user.rows[0].is_premium,
        created_at: user.rows[0].created_at
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

// ========================================
// NEW: OTP-Based Registration
// ========================================
export const registerWithOTP = async (req, res) => {
  try {
    const { idToken, username, email, password, ghost_name } = req.body;

    // Validate input
    if (!idToken || !username || !email || !password || !ghost_name) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    // Verify Firebase ID token
    let decodedToken;
    try {
      const admin = await import('../services/otp/firebaseConfig.js');
      decodedToken = await admin.default.auth().verifyIdToken(idToken);
    } catch (error) {
      console.error('Firebase token verification failed:', error);
      return res.status(401).json({ error: 'Invalid OTP token' });
    }

    // Extract verified phone number from token
    const phone = decodedToken.phone_number;

    if (!phone) {
      return res.status(400).json({ error: 'Phone number not found in token' });
    }

    // Check if username, email, phone, or ghost_name already exists
    const userExists = await pool.query(
      'SELECT * FROM users WHERE username = $1 OR email = $2 OR phone = $3 OR ghost_name = $4',
      [username, email, phone, ghost_name]
    );

    if (userExists.rows.length > 0) {
      const existingUser = userExists.rows[0];
      if (existingUser.username === username) {
        return res.status(400).json({ error: 'Username already taken' });
      }
      if (existingUser.email === email) {
        return res.status(400).json({ error: 'Email already registered' });
      }
      if (existingUser.phone === phone) {
        return res.status(400).json({ error: 'Phone number already registered' });
      }
      if (existingUser.ghost_name === ghost_name) {
        return res.status(400).json({ error: 'Ghost name already taken' });
      }
    }

    // Hash password
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    // Auto-generate bio: "hey i am {ghost_name}"
    const bio = `hey i am ${ghost_name}`;

    // Insert user into database with ghost_name
    const newUser = await pool.query(
      'INSERT INTO users (username, email, phone, password_hash, bio, ghost_name) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, username, email, phone, bio, ghost_name',
      [username, email, phone, hashedPassword, bio, ghost_name]
    );

    // Generate JWT token
    const token = jwt.sign(
      { 
        user_id: newUser.rows[0].id, 
        username: newUser.rows[0].username,
        ghost_name: newUser.rows[0].ghost_name 
      },
      process.env.JWT_SECRET,
      { expiresIn: '30d' }
    );

    res.status(201).json({
      success: true,
      message: 'User registered successfully with OTP',
      token,
      user: {
        id: newUser.rows[0].id,
        username: newUser.rows[0].username,
        ghost_name: newUser.rows[0].ghost_name,
        email: newUser.rows[0].email,
        phone: newUser.rows[0].phone,
        bio: newUser.rows[0].bio
      }
    });
  } catch (error) {
    console.error('OTP Registration error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

// ========================================
// NEW: OTP-Based Login
// ========================================
export const loginWithOTP = async (req, res) => {
  try {
    const { idToken } = req.body;

    // Validate input
    if (!idToken) {
      return res.status(400).json({ error: 'ID token required' });
    }

    // Verify Firebase ID token
    let decodedToken;
    try {
      const admin = await import('../services/otp/firebaseConfig.js');
      decodedToken = await admin.default.auth().verifyIdToken(idToken);
    } catch (error) {
      console.error('Firebase token verification failed:', error);
      return res.status(401).json({ error: 'Invalid OTP token' });
    }

    // Extract verified phone number from token
    const phone = decodedToken.phone_number;

    if (!phone) {
      return res.status(400).json({ error: 'Phone number not found in token' });
    }

    // Find user by phone
    const user = await pool.query(
      'SELECT * FROM users WHERE phone = $1',
      [phone]
    );

    if (user.rows.length === 0) {
      return res.status(404).json({ 
        error: 'User not found. Please register first.',
        isNewUser: true 
      });
    }

    // Generate JWT token
    const token = jwt.sign(
      { 
        user_id: user.rows[0].id, 
        username: user.rows[0].username,
        ghost_name: user.rows[0].ghost_name 
      },
      process.env.JWT_SECRET,
      { expiresIn: '30d' }
    );

    res.json({
      success: true,
      message: 'Login successful with OTP',
      token,
      user: {
        id: user.rows[0].id,
        username: user.rows[0].username,
        ghost_name: user.rows[0].ghost_name,
        email: user.rows[0].email,
        phone: user.rows[0].phone
      }
    });
  } catch (error) {
    console.error('OTP Login error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};