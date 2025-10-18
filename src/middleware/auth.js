import jwt from 'jsonwebtoken';

// Middleware to verify JWT token (Updated for Phone-Based Auth)
export const verifyToken = (req, res, next) => {
  // Get token from header
  const token = req.headers.authorization?.split(' ')[1]; // "Bearer TOKEN"

  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }

  try {
    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Attach user info to request (now includes phone)
    req.user = {
      user_id: decoded.user_id,
      phone: decoded.phone,
      username: decoded.username
    };
    
    console.log(`✅ Token verified for user ${decoded.user_id} (${decoded.phone})`);
    
    next(); // Continue to next middleware/route
  } catch (error) {
    console.error('Token verification failed:', error.message);
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
};