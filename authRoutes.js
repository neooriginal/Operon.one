const express = require('express');
const jwt = require('jsonwebtoken');
const { userFunctions, settingsFunctions } = require('./database');
require('dotenv').config();

/**
 * Express router for authentication-related routes
 * @type {import('express').Router}
 */
const router = express.Router();

const JWT_SECRET = process.env.JWT_SECRET;

/**
 * Register a new user
 * @route POST /register
 * @param {Object} req.body - User registration information
 * @param {string} req.body.email - User email
 * @param {string} req.body.password - User password (min 8 characters)
 * @returns {Object} 201 - User object with authentication token
 * @returns {Object} 400 - Email/password validation errors
 * @returns {Object} 409 - Email already in use
 * @returns {Object} 500 - Server error
 */
router.post('/register', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }
    
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: 'Invalid email format' });
    }
    
    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters long' });
    }
    
    const user = await userFunctions.registerUser(email, password);
    
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
    
    if (error.message.includes('UNIQUE constraint failed')) {
      return res.status(409).json({ error: 'Email already in use' });
    }
    
    return res.status(500).json({ error: 'Registration failed' });
  }
});

/**
 * Authenticate a user
 * @route POST /login
 * @param {Object} req.body - User login credentials
 * @param {string} req.body.email - User email
 * @param {string} req.body.password - User password
 * @returns {Object} 200 - User object with authentication token
 * @returns {Object} 400 - Missing email/password
 * @returns {Object} 401 - Invalid credentials
 * @returns {Object} 500 - Server error
 */
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }
    
    const user = await userFunctions.loginUser(email, password);
    
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

/**
 * Validate a user's JWT token
 * @route GET /validate-token
 * @param {string} req.headers.authorization - Bearer token
 * @returns {Object} 200 - Token validation status and user info
 * @returns {Object} 401 - Missing token
 * @returns {Object} 403 - Invalid token
 */
router.get('/validate-token', authenticateToken, (req, res) => {
  res.status(200).json({ valid: true, user: req.user });
});

/**
 * Get all user settings
 * @route GET /settings
 * @param {string} req.headers.authorization - Bearer token
 * @returns {Object} 200 - All user settings
 * @returns {Object} 500 - Server error
 */
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

/**
 * Get a specific user setting by key
 * @route GET /settings/:key
 * @param {string} req.headers.authorization - Bearer token
 * @param {string} req.params.key - Setting key
 * @returns {Object} 200 - Setting value
 * @returns {Object} 404 - Setting not found
 * @returns {Object} 500 - Server error
 */
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

/**
 * Create or update a user setting
 * @route POST /settings/:key
 * @param {string} req.headers.authorization - Bearer token
 * @param {string} req.params.key - Setting key
 * @param {*} req.body.value - Setting value (any valid JSON value)
 * @returns {Object} 200 - Updated setting
 * @returns {Object} 400 - Missing value
 * @returns {Object} 500 - Server error
 */
router.post('/settings/:key', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { key } = req.params;
    const { value } = req.body;
    
    if (value === undefined) {
      return res.status(400).json({ error: 'Setting value is required' });
    }
    
    const storedValue = typeof value === 'object' ? JSON.stringify(value) : value;
    
    await settingsFunctions.saveSetting(userId, key, storedValue);
    res.status(200).json({ [key]: value });
  } catch (error) {
    console.error('Error saving setting:', error);
    res.status(500).json({ error: 'Failed to save setting' });
  }
});

/**
 * Delete a user setting
 * @route DELETE /settings/:key
 * @param {string} req.headers.authorization - Bearer token
 * @param {string} req.params.key - Setting key to delete
 * @returns {Object} 200 - Success confirmation
 * @returns {Object} 404 - Setting not found
 * @returns {Object} 500 - Server error
 */
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

/**
 * Middleware to authenticate JWT token
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 * @returns {void}
 */
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; 
  
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

/**
 * Authentication router and middleware
 * @module authRoutes
 */
module.exports = {
  router,
  authenticateToken 
}; 