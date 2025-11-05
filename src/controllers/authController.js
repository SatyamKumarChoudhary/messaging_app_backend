import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import pool from '../config/db.js';

// User Registration (Phone-Based)
// User Registration
export const register = async (req, res) => {
  try {
    const { username, email, phone, password, ghost_name } = req.body;

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

    // Insert user into database
    const newUser = await pool.query(
      'INSERT INTO users (username, email, phone, password_hash, ghost_name) VALUES ($1, $2, $3, $4, $5) RETURNING id, username, email, phone, ghost_name',
      [username, email, phone, hashedPassword, ghost_name]
    );

    // Generate JWT token
    const token = jwt.sign(
      { user_id: newUser.rows[0].id, username: newUser.rows[0].username, ghost_name: newUser.rows[0].ghost_name },
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
        ghost_name: newUser.rows[0].ghost_name
      }
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

// User Login (Phone-Based)
// User Login
// User Login (PHONE + PASSWORD)
export const login = async (req, res) => {
  try {
    const { phone, password } = req.body;  // ← USE PHONE, NOT USERNAME

    // Validate input
    if (!phone || !password) {
      return res.status(400).json({ error: 'Phone and password required' });
    }

    // Find user BY PHONE
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
        ghost_name: user.rows[0].ghost_name
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};