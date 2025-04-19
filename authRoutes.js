const express = require('express');
const jwt = require('jsonwebtoken');
const { userFunctions, settingsFunctions } = require('./database');
require('dotenv').config();

const router = express.Router();

// JWT secret key - should be in environment variables for security
const JWT_SECRET = process.env.JWT_SECRET;

// Register a new user
router.post('/register', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }
    
    // Check email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: 'Invalid email format' });
    }
    
    // Check password strength
    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters long' });
    }
    
    const user = await userFunctions.registerUser(email, password);
    
    // Generate JWT token
    const token = jwt.sign(
      { id: user.id, email: user.email },
      JWT_SECRET,
      { expiresIn: '7d' }
    );
    
    return res.status(201).json({
      id: user.id,
      email: user.email,
      token
    });
  } catch (error) {
    console.error('Registration error:', error);
    
    // Check for duplicate email error
    if (error.message.includes('UNIQUE constraint failed')) {
      return res.status(409).json({ error: 'Email already in use' });
    }
    
    return res.status(500).json({ error: 'Registration failed' });
  }
});

// Login user
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }
    
    const user = await userFunctions.loginUser(email, password);
    
    // Generate JWT token
    const token = jwt.sign(
      { id: user.id, email: user.email },
      JWT_SECRET,
      { expiresIn: '7d' }
    );
    
    return res.status(200).json({
      id: user.id,
      email: user.email,
      token
    });
  } catch (error) {
    console.error('Login error:', error);
    
    if (error.message === 'User not found' || error.message === 'Invalid password') {
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    
    return res.status(500).json({ error: 'Login failed' });
  }
});

// Validate token
router.get('/validate-token', authenticateToken, (req, res) => {
  // If middleware passes, token is valid
  res.status(200).json({ valid: true, user: req.user });
});

// Get user settings
router.get('/settings', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const settings = await settingsFunctions.getAllSettings(userId);
    res.status(200).json(settings);
  } catch (error) {
    console.error('Error getting settings:', error);
    res.status(500).json({ error: 'Failed to retrieve settings' });
  }
});

// Get specific setting
router.get('/settings/:key', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { key } = req.params;
    const value = await settingsFunctions.getSetting(userId, key);
    
    if (value === null) {
      return res.status(404).json({ error: `Setting '${key}' not found` });
    }
    
    res.status(200).json({ [key]: value });
  } catch (error) {
    console.error('Error getting setting:', error);
    res.status(500).json({ error: 'Failed to retrieve setting' });
  }
});

// Save setting
router.post('/settings/:key', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { key } = req.params;
    const { value } = req.body;
    
    if (value === undefined) {
      return res.status(400).json({ error: 'Setting value is required' });
    }
    
    // Convert any object/array to JSON string
    const storedValue = typeof value === 'object' ? JSON.stringify(value) : value;
    
    await settingsFunctions.saveSetting(userId, key, storedValue);
    res.status(200).json({ [key]: value });
  } catch (error) {
    console.error('Error saving setting:', error);
    res.status(500).json({ error: 'Failed to save setting' });
  }
});

// Delete setting
router.delete('/settings/:key', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { key } = req.params;
    
    const result = await settingsFunctions.deleteSetting(userId, key);
    
    if (!result.deleted) {
      return res.status(404).json({ error: `Setting '${key}' not found` });
    }
    
    res.status(200).json({ success: true });
  } catch (error) {
    console.error('Error deleting setting:', error);
    res.status(500).json({ error: 'Failed to delete setting' });
  }
});

// Middleware to authenticate JWT token
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN
  
  if (!token) {
    return res.status(401).json({ error: 'Authentication token required' });
  }
  
  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid or expired token' });
    }
    
    req.user = user;
    next();
  });
}

module.exports = {
  router,
  authenticateToken // Export middleware for use in other routes
}; 