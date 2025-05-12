const express = require('express');
const jwt = require('jsonwebtoken');
const { userFunctions, settingsFunctions, mcpServerFunctions } = require('./database');
require('dotenv').config();

const router = express.Router();

// JWT secret key - should be in environment variables for security
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

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
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters long' });
    }
    
    const user = await userFunctions.registerUser(email, password);
    
    // Generate JWT token
    const token = jwt.sign(
      { id: user.id, email: user.email },
      JWT_SECRET,
      { expiresIn: '24h' }
    );
    
    return res.status(201).json({
      message: 'User registered successfully',
      token,
      user: {
        id: user.id,
        email: user.email
      }
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
      { expiresIn: '24h' }
    );
    
    return res.status(200).json({
      message: 'Login successful',
      token,
      user: {
        id: user.id,
        email: user.email
      }
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
    console.error('Get settings error:', error);
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
    return res.status(401).json({ error: 'Access denied. No token provided.' });
  }
  
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    res.status(403).json({ error: 'Invalid token.' });
  }
}

// MCP server routes

// Get all MCP servers for the user
router.get('/mcp-servers', authenticateToken, async (req, res) => {
  try {
    const servers = await mcpServerFunctions.getMCPServers(req.user.id);
    res.json({ servers });
  } catch (error) {
    console.error('Get MCP servers error:', error);
    res.status(500).json({ error: 'Failed to get MCP servers' });
  }
});

// Add a new MCP server
router.post('/mcp-servers', authenticateToken, async (req, res) => {
  try {
    const { name, type, endpoint, command, args, envVars, description } = req.body;
    
    // Validate input
    if (!name || !type) {
      return res.status(400).json({ error: 'Server name and type are required' });
    }
    
    if (type === 'sse' && !endpoint) {
      return res.status(400).json({ error: 'Endpoint URL is required for SSE servers' });
    }
    
    if (type === 'stdio' && !command) {
      return res.status(400).json({ error: 'Command is required for STDIO servers' });
    }
    
    const serverData = {
      name,
      type,
      endpoint: endpoint || '',
      command: command || null,
      args: args || [],
      envVars: envVars || {},
      description: description || ''
    };
    
    const server = await mcpServerFunctions.addMCPServer(req.user.id, serverData);
    res.status(201).json({ 
      message: 'MCP server added successfully',
      server
    });
  } catch (error) {
    console.error('Add MCP server error:', error);
    
    if (error.message.includes('already exists')) {
      return res.status(409).json({ error: error.message });
    }
    
    res.status(500).json({ error: 'Failed to add MCP server' });
  }
});

// Get a specific MCP server
router.get('/mcp-servers/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const server = await mcpServerFunctions.getMCPServerById(req.user.id, id);
    
    if (!server) {
      return res.status(404).json({ error: 'MCP server not found' });
    }
    
    res.json({ server });
  } catch (error) {
    console.error('Get MCP server error:', error);
    
    if (error.message === 'MCP server not found') {
      return res.status(404).json({ error: error.message });
    }
    
    res.status(500).json({ error: 'Failed to get MCP server' });
  }
});

// Update an MCP server
router.put('/mcp-servers/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, type, endpoint, command, args, envVars, description, enabled } = req.body;
    
    // Validate input
    if (!name || !type) {
      return res.status(400).json({ error: 'Server name and type are required' });
    }
    
    if (type === 'sse' && !endpoint) {
      return res.status(400).json({ error: 'Endpoint URL is required for SSE servers' });
    }
    
    if (type === 'stdio' && !command) {
      return res.status(400).json({ error: 'Command is required for STDIO servers' });
    }
    
    const serverData = {
      name,
      type,
      endpoint: endpoint || '',
      command: command || null,
      args: args || [],
      envVars: envVars || {},
      description: description || '',
      enabled: enabled
    };
    
    const server = await mcpServerFunctions.updateMCPServer(req.user.id, id, serverData);
    res.json({ 
      message: 'MCP server updated successfully',
      server
    });
  } catch (error) {
    console.error('Update MCP server error:', error);
    
    if (error.message.includes('already exists')) {
      return res.status(409).json({ error: error.message });
    }
    
    if (error.message.includes('not found')) {
      return res.status(404).json({ error: error.message });
    }
    
    res.status(500).json({ error: 'Failed to update MCP server' });
  }
});

// Toggle MCP server enabled/disabled
router.patch('/mcp-servers/:id/toggle', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { enabled } = req.body;
    
    if (enabled === undefined) {
      return res.status(400).json({ error: 'Enabled status is required' });
    }
    
    const result = await mcpServerFunctions.toggleMCPServerEnabled(req.user.id, id, enabled);
    res.json({ 
      message: `MCP server ${enabled ? 'enabled' : 'disabled'} successfully`,
      result
    });
  } catch (error) {
    console.error('Toggle MCP server error:', error);
    
    if (error.message.includes('not found')) {
      return res.status(404).json({ error: error.message });
    }
    
    res.status(500).json({ error: 'Failed to toggle MCP server' });
  }
});

// Delete an MCP server
router.delete('/mcp-servers/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await mcpServerFunctions.deleteMCPServer(req.user.id, id);
    
    res.json({ 
      message: 'MCP server deleted successfully',
      result
    });
  } catch (error) {
    console.error('Delete MCP server error:', error);
    
    if (error.message.includes('not found')) {
      return res.status(404).json({ error: error.message });
    }
    
    res.status(500).json({ error: 'Failed to delete MCP server' });
  }
});

module.exports = {
  router,
  authenticateToken // Export middleware for use in other routes
}; 