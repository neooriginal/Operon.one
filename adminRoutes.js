const express = require('express');
const jwt = require('jsonwebtoken');
const { userFunctions } = require('./database');
require('dotenv').config();

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET;

/**
 * Admin authentication middleware
 * Verifies both valid JWT token and admin role
 */
async function authenticateAdmin(req, res, next) {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '') || req.cookies.authToken;
    
    if (!token) {
      return res.status(401).json({ error: 'Access denied. No token provided.' });
    }

    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;

    // Check if user is admin
    const isAdmin = await userFunctions.isAdmin(decoded.id);
    if (!isAdmin) {
      return res.status(403).json({ error: 'Access denied. Admin privileges required.' });
    }

    next();
  } catch (error) {
    console.error('Admin authentication error:', error);
    return res.status(401).json({ error: 'Invalid token or insufficient privileges.' });
  }
}

/**
 * Get all redemption codes
 * @route GET /admin/codes
 * @returns {Object} 200 - Array of redemption codes with usage info
 * @returns {Object} 401/403 - Authentication/authorization error
 */
router.get('/codes', authenticateAdmin, async (req, res) => {
  try {
    const codes = await userFunctions.getAllRedemptionCodes();
    
    // Add usage statistics
    const stats = {
      total: codes.length,
      used: codes.filter(code => code.isUsed).length,
      unused: codes.filter(code => !code.isUsed).length,
      totalCreditsIssued: codes.reduce((sum, code) => sum + code.credits, 0),
      creditsRedeemed: codes.filter(code => code.isUsed).reduce((sum, code) => sum + code.credits, 0)
    };

    res.status(200).json({
      codes,
      stats
    });
  } catch (error) {
    console.error('Error fetching redemption codes:', error);
    res.status(500).json({ error: 'Failed to fetch redemption codes' });
  }
});

/**
 * Create new redemption code
 * @route POST /admin/codes
 * @param {Object} req.body - Code creation data
 * @param {string} req.body.code - Code string
 * @param {number} req.body.credits - Credit amount
 * @returns {Object} 201 - Created code object
 * @returns {Object} 400 - Validation error
 * @returns {Object} 409 - Code already exists
 */
router.post('/codes', authenticateAdmin, async (req, res) => {
  try {
    const { code, credits } = req.body;

    if (!code || !credits || typeof code !== 'string' || typeof credits !== 'number') {
      return res.status(400).json({ error: 'Valid code string and credits number are required' });
    }

    if (credits <= 0 || credits > 50000) {
      return res.status(400).json({ error: 'Credits must be between 1 and 50,000' });
    }

    if (code.length < 3 || code.length > 20) {
      return res.status(400).json({ error: 'Code must be between 3 and 20 characters' });
    }

    const newCode = await userFunctions.createRedemptionCode(code, credits);
    res.status(201).json({
      message: 'Redemption code created successfully',
      code: newCode
    });
  } catch (error) {
    console.error('Error creating redemption code:', error);
    if (error.message.includes('UNIQUE constraint failed')) {
      return res.status(409).json({ error: 'Code already exists' });
    }
    res.status(500).json({ error: 'Failed to create redemption code' });
  }
});

/**
 * Delete redemption code
 * @route DELETE /admin/codes/:id
 * @param {string} req.params.id - Code ID
 * @returns {Object} 200 - Deletion success
 * @returns {Object} 404 - Code not found
 */
router.delete('/codes/:id', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    if (!id || isNaN(parseInt(id))) {
      return res.status(400).json({ error: 'Valid code ID is required' });
    }

    const result = await userFunctions.deleteRedemptionCode(parseInt(id));
    
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Redemption code not found' });
    }

    res.status(200).json({
      message: 'Redemption code deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting redemption code:', error);
    res.status(500).json({ error: 'Failed to delete redemption code' });
  }
});

/**
 * Generate random code
 * @route GET /admin/generate-code
 * @returns {Object} 200 - Generated code string
 */
router.get('/generate-code', authenticateAdmin, (req, res) => {
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < 8; i++) {
    result += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  res.status(200).json({ suggestedCode: result });
});

module.exports = router; 