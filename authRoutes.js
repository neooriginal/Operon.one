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
 * Validate password strength and requirements
 * @param {string} password - Password to validate
 * @returns {Object} Validation result with isValid boolean and messages array
 */
function validatePassword(password) {
  const result = {
    isValid: true,
    messages: []
  };

  if (password.length < 8) {
    result.isValid = false;
    result.messages.push('Password must be at least 8 characters long');
  }

  if (password.length > 128) {
    result.isValid = false;
    result.messages.push('Password must be less than 128 characters long');
  }

  if (!/[a-z]/.test(password)) {
    result.isValid = false;
    result.messages.push('Password must contain at least one lowercase letter');
  }

  if (!/[A-Z]/.test(password)) {
    result.isValid = false;
    result.messages.push('Password must contain at least one uppercase letter');
  }

  if (!/[0-9]/.test(password)) {
    result.isValid = false;
    result.messages.push('Password must contain at least one number');
  }

  if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
    result.isValid = false;
    result.messages.push('Password must contain at least one special character');
  }

  const commonPasswords = [
    'password', '123456', '123456789', '12345678', '12345', 
    'qwerty', 'abc123', 'password123', 'admin', 'letmein'
  ];
  
  if (commonPasswords.includes(password.toLowerCase())) {
    result.isValid = false;
    result.messages.push('Password is too common, please choose a more secure password');
  }

  return result;
}

/**
 * Register a new user
 * @route POST /register
 * @param {Object} req.body - User registration information
 * @param {string} req.body.email - User email
 * @param {string} req.body.password - User password (min 8 chars, must include uppercase, lowercase, number, special char)
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
    
    const passwordValidation = validatePassword(password);
    if (!passwordValidation.isValid) {
      return res.status(400).json({ 
        error: 'Password requirements not met',
        details: passwordValidation.messages
      });
    }
    
    const user = await userFunctions.registerUser(email, password);
    
    const token = jwt.sign(
      { id: user.id, email: user.email },
      JWT_SECRET,
      { expiresIn: '7d' }
    );
    
    // Set secure HTTP-only cookie
    res.cookie('authToken', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    });
    
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
    
    // Set secure HTTP-only cookie
    res.cookie('authToken', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    });
    
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
 * Logout a user and clear authentication cookie
 * @route POST /logout
 * @returns {Object} 200 - Logout success
 */
router.post('/logout', (req, res) => {
  // Clear the authentication cookie
  res.clearCookie('authToken', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax'
  });
  
  res.status(200).json({ success: true, message: 'Logged out successfully' });
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
 * Get MCP servers configuration for the user
 * @route GET /settings/mcpServers
 * @param {string} req.headers.authorization - Bearer token
 * @returns {Object} 200 - MCP servers configuration
 * @returns {Object} 404 - No MCP servers configured
 * @returns {Object} 500 - Server error
 */
router.get('/settings/mcpServers', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const mcpServersJson = await settingsFunctions.getSetting(userId, 'mcpServers');
    
    if (mcpServersJson === null) {
      return res.status(200).json({ mcpServers: '{}' });
    }
    
    res.status(200).json({ mcpServers: mcpServersJson });
  } catch (error) {
    console.error('Error getting MCP servers:', error);
    res.status(500).json({ error: 'Failed to retrieve MCP servers' });
  }
});

/**
 * Save MCP servers configuration for the user
 * @route POST /settings/mcpServers
 * @param {string} req.headers.authorization - Bearer token
 * @param {Object} req.body.value - MCP servers configuration object
 * @returns {Object} 200 - Success confirmation with saved data
 * @returns {Object} 400 - Invalid configuration format
 * @returns {Object} 500 - Server error
 */
router.post('/settings/mcpServers', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { value } = req.body;
    
    if (!value || typeof value !== 'object') {
      return res.status(400).json({ error: 'Invalid MCP servers configuration format' });
    }
    
    // Validate each server configuration
    for (const [serverName, config] of Object.entries(value)) {
      if (!config.command || !Array.isArray(config.args)) {
        return res.status(400).json({ 
          error: `Invalid configuration for server '${serverName}': command and args are required` 
        });
      }
      
      // Validate environment variables if provided
      if (config.env && typeof config.env !== 'object') {
        return res.status(400).json({ 
          error: `Invalid environment variables for server '${serverName}'` 
        });
      }
    }
    
    const mcpServersJson = JSON.stringify(value);
    await settingsFunctions.saveSetting(userId, 'mcpServers', mcpServersJson);
    
    res.status(200).json({ success: true, mcpServers: value });
  } catch (error) {
    console.error('Error saving MCP servers:', error);
    res.status(500).json({ error: 'Failed to save MCP servers configuration' });
  }
});

/**
 * Delete MCP servers configuration for the user
 * @route DELETE /settings/mcpServers
 * @param {string} req.headers.authorization - Bearer token
 * @returns {Object} 200 - Success confirmation
 * @returns {Object} 404 - No MCP servers configured
 * @returns {Object} 500 - Server error
 */
router.delete('/settings/mcpServers', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    
    const existingValue = await settingsFunctions.getSetting(userId, 'mcpServers');
    if (existingValue === null) {
      return res.status(404).json({ error: 'No MCP servers configuration found' });
    }
    
    await settingsFunctions.deleteSetting(userId, 'mcpServers');
    res.status(200).json({ success: true, message: 'MCP servers configuration deleted' });
  } catch (error) {
    console.error('Error deleting MCP servers:', error);
    res.status(500).json({ error: 'Failed to delete MCP servers configuration' });
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
  
  jwt.verify(token, JWT_SECRET, async (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid or expired token' });
    }
    
    try {
      // Verify that the user still exists in the database
      const dbUser = await userFunctions.getUserById(user.id);
      if (!dbUser) {
        return res.status(403).json({ error: 'User no longer exists' });
      }
      
      req.user = user;
      next();
    } catch (error) {
      console.error('Database error during token validation:', error);
      return res.status(500).json({ error: 'Authentication verification failed' });
    }
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