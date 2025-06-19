const express = require('express');
const jwt = require('jsonwebtoken');
const { userFunctions, settingsFunctions } = require('./database');
const emailService = require('./utils/emailService');
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
 * @returns {Object} 201 - User object with authentication token (if email verification disabled) or verification required message
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
    
    // If email service is available, send verification code
    if (emailService.isEmailServiceAvailable()) {
      const verificationCode = emailService.generateVerificationCode(true); // Use alphanumeric code
      await userFunctions.storeEmailVerification(email, verificationCode);
      
      const emailSent = await emailService.sendVerificationEmail(email, verificationCode);
      
      if (emailSent) {
        return res.status(201).json({
          message: 'Registration successful. Please check your email for verification code.',
          requiresVerification: true,
          email: email
        });
      } else {
        // If email fails, allow registration to proceed without verification
        console.warn('Email verification failed, allowing registration without verification');
      }
    }
    
    // If email service is not available or email sending failed, complete registration immediately
    await userFunctions.verifyEmailCode(email, 'skip-verification');
    
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
      token,
      emailVerified: true
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
 * Verify email with verification code
 * @route POST /verify-email
 * @param {Object} req.body - Email verification information
 * @param {string} req.body.email - User email
 * @param {string} req.body.code - Verification code
 * @returns {Object} 200 - User object with authentication token
 * @returns {Object} 400 - Missing email/code or invalid code
 * @returns {Object} 500 - Server error
 */
router.post('/verify-email', async (req, res) => {
  try {
    const { email, code } = req.body;
    
    if (!email || !code) {
      return res.status(400).json({ error: 'Email and verification code are required' });
    }
    
    const isValid = await userFunctions.verifyEmailCode(email, code);
    
    if (!isValid) {
      return res.status(400).json({ error: 'Invalid or expired verification code' });
    }
    
    // Get user data
    const user = await userFunctions.getUserByEmail(email);
    if (!user) {
      return res.status(400).json({ error: 'User not found' });
    }
    
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
    
    // Send welcome email
    if (emailService.isEmailServiceAvailable()) {
      emailService.sendWelcomeEmail(email).catch(err => {
        console.error('Error sending welcome email:', err);
      });
    }
    
    return res.status(200).json({
      id: user.id,
      email: user.email,
      token,
      emailVerified: true
    });
  } catch (error) {
    console.error('Email verification error:', error);
    return res.status(500).json({ error: 'Email verification failed' });
  }
});

/**
 * Resend verification email
 * @route POST /resend-verification
 * @param {Object} req.body - Resend verification information
 * @param {string} req.body.email - User email
 * @returns {Object} 200 - Success message
 * @returns {Object} 400 - Missing email or email service unavailable
 * @returns {Object} 500 - Server error
 */
router.post('/resend-verification', async (req, res) => {
  try {
    const { email } = req.body;
    
    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }
    
    if (!emailService.isEmailServiceAvailable()) {
      return res.status(400).json({ error: 'Email service is not available' });
    }
    
    // Check if user exists and is not already verified
    const isVerified = await userFunctions.isEmailVerified(email);
    if (isVerified) {
      return res.status(400).json({ error: 'Email is already verified' });
    }
    
    const verificationCode = emailService.generateVerificationCode();
    await userFunctions.storeEmailVerification(email, verificationCode);
    
    const emailSent = await emailService.sendVerificationEmail(email, verificationCode);
    
    if (emailSent) {
      return res.status(200).json({ message: 'Verification email sent successfully' });
    } else {
      return res.status(500).json({ error: 'Failed to send verification email' });
    }
  } catch (error) {
    console.error('Resend verification error:', error);
    return res.status(500).json({ error: 'Failed to resend verification email' });
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
 * @returns {Object} 401 - Invalid credentials or unverified email
 * @returns {Object} 500 - Server error
 */
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }
    
    const user = await userFunctions.loginUser(email, password);
    
    // Check if email verification is required and if user's email is verified
    if (emailService.isEmailServiceAvailable() && !user.emailVerified) {
      return res.status(401).json({ 
        error: 'Email not verified. Please check your email for the verification code.',
        requiresVerification: true,
        email: user.email
      });
    }
    
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
      token,
      emailVerified: Boolean(user.emailVerified)
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
 * Get user's remaining credits
 * @route GET /credits
 * @returns {Object} 200 - Credits information
 */
router.get('/credits', authenticateToken, async (req, res) => {
  try {
    const remainingCredits = await userFunctions.getRemainingCredits(req.user.id);
    res.status(200).json({ credits: remainingCredits });
  } catch (error) {
    console.error('Error fetching credits:', error);
    res.status(500).json({ error: 'Failed to fetch credits' });
  }
});

/**
 * Redeem a credits code
 * @route POST /redeem-code
 * @param {Object} req.body - Code information
 * @param {string} req.body.code - Redemption code
 * @returns {Object} 200 - Credits added
 * @returns {Object} 400 - Invalid code
 * @returns {Object} 500 - Server error
 */
router.post('/redeem-code', authenticateToken, async (req, res) => {
  try {
    const { code } = req.body;
    
    if (!code || typeof code !== 'string') {
      return res.status(400).json({ error: 'Valid code is required' });
    }
    
    const result = await userFunctions.redeemCode(req.user.id, code.trim().toUpperCase());
    res.status(200).json({ 
      message: `Successfully redeemed ${result.creditsAdded} credits!`,
      creditsAdded: result.creditsAdded 
    });
  } catch (error) {
    console.error('Error redeeming code:', error);
    if (error.message.includes('Invalid or already used')) {
      return res.status(400).json({ error: 'Invalid or already used code' });
    }
    res.status(500).json({ error: 'Failed to redeem code' });
  }
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
 * Request password reset
 * @route POST /reset-password
 * @param {Object} req.body - Reset request information
 * @param {string} req.body.email - User email
 * @returns {Object} 200 - Success message
 * @returns {Object} 400 - Email required or email service unavailable
 * @returns {Object} 404 - User not found
 * @returns {Object} 500 - Server error
 */
router.post('/reset-password', async (req, res) => {
  try {
    const { email } = req.body;
    
    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }
    
    // Check if email service is available
    if (!emailService.isEmailServiceAvailable()) {
      return res.status(400).json({ error: 'Password reset is not available - email service not configured' });
    }
    
    // Check if user exists
    const user = await userFunctions.getUserByEmail(email);
    if (!user) {
      return res.status(404).json({ error: 'No account found with that email address' });
    }
    
    // Generate and store reset code
    const resetCode = emailService.generateVerificationCode(true); // Use alphanumeric code
    await userFunctions.storePasswordResetCode(email, resetCode);
    
    // Send reset email
    const emailSent = await emailService.sendPasswordResetEmail(email, resetCode);
    
    if (emailSent) {
      return res.status(200).json({ 
        message: 'Password reset instructions sent to your email',
        email: email
      });
    } else {
      return res.status(500).json({ error: 'Failed to send reset email' });
    }
  } catch (error) {
    console.error('Password reset request error:', error);
    return res.status(500).json({ error: 'Failed to process password reset request' });
  }
});

/**
 * Verify reset code and update password
 * @route POST /verify-reset
 * @param {Object} req.body - Reset verification information
 * @param {string} req.body.email - User email
 * @param {string} req.body.code - Reset code
 * @param {string} req.body.newPassword - New password
 * @returns {Object} 200 - Success message
 * @returns {Object} 400 - Missing fields or invalid password
 * @returns {Object} 401 - Invalid or expired reset code
 * @returns {Object} 500 - Server error
 */
router.post('/verify-reset', async (req, res) => {
  try {
    const { email, code, newPassword } = req.body;
    
    if (!email || !code || !newPassword) {
      return res.status(400).json({ error: 'Email, reset code and new password are required' });
    }
    
    // Validate new password
    const passwordValidation = validatePassword(newPassword);
    if (!passwordValidation.isValid) {
      return res.status(400).json({ 
        error: 'Password requirements not met',
        details: passwordValidation.messages
      });
    }
    
    // Verify reset code
    const isValid = await userFunctions.verifyPasswordResetCode(email, code);
    if (!isValid) {
      return res.status(401).json({ error: 'Invalid or expired reset code' });
    }
    
    // Update password
    await userFunctions.updatePassword(email, newPassword);
    
    // Get user data for login
    const user = await userFunctions.getUserByEmail(email);
    
    // Create new token
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
      message: 'Password reset successful',
      id: user.id,
      email: user.email,
      token,
      emailVerified: Boolean(user.emailVerified)
    });
  } catch (error) {
    console.error('Password reset verification error:', error);
    return res.status(500).json({ error: 'Failed to reset password' });
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