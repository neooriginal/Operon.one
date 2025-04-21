const socket = require("socket.io");
const server = require("http").createServer();
const express = require("express");
const path = require("path");
const fs = require('fs');
const bodyParser = require('body-parser');
const cors = require('cors');
const { router: authRoutes, authenticateToken } = require('./authRoutes');
const { chatFunctions } = require('./database');

// Serve static files from the public directory
const app = express();

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, "public")));

// API routes
app.use('/api', authRoutes);

// Create HTTP server with Express app
const httpServer = require("http").createServer(app);

const io = socket(httpServer, {
    cors: {
        origin: ["http://localhost:3001", "http://127.0.0.1:3001", "http://localhost:3000", "http://127.0.0.1:3000"],
        methods: ["GET", "POST"],
        credentials: true
    }
});

// Socket middleware to authenticate user based on token
io.use((socket, next) => {
    const token = socket.handshake.auth.token;
    const userId = socket.handshake.auth.userId;
    
    if (!token || !userId) {
        // Allow anonymous connections for landing page, etc.
        // But set a flag for restricted operations
        socket.authenticated = false;
        return next();
    }
    
    try {
        // You would verify the token here
        // For now, just trust the token and userId
        socket.userId = userId;
        socket.authenticated = true;
        return next();
    } catch (error) {
        console.error('Socket authentication error:', error.message);
        return next(new Error('Authentication error'));
    }
});

// Serve public routes
app.get("/dashboard", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "dashboard", "index.html"));
});

app.get("/chat", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "dashboard", "chat.html"));
});

app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "landingpage", "index.html"));
});

app.get("/login", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "dashboard", "login.html"));
});

app.get("/register", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "dashboard", "register.html"));
});

app.get("/settings", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "dashboard", "settings.html"));
});

app.get("/legal/terms", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "legal", "terms-of-service.html"));
});

app.get("/legal/privacy", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "legal", "privacy-policy.html"));
});

app.get("/legal/cookies", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "legal", "cookie-policy.html"));
});

// Restricted API routes (require authentication)
app.get('/api/user/profile', authenticateToken, (req, res) => {
    // Access user info from the token (added by authenticateToken middleware)
    res.json({ user: req.user });
});

// Chat API routes
app.get('/api/chats', authenticateToken, async (req, res) => {
    try {
        const chats = await chatFunctions.getUserChats(req.user.id);
        res.json({ chats });
    } catch (error) {
        console.error('Error getting chats:', error);
        res.status(500).json({ error: 'Failed to retrieve chats' });
    }
});

app.post('/api/chats', authenticateToken, async (req, res) => {
    try {
        const { title } = req.body;
        const chat = await chatFunctions.createChat(req.user.id, title);
        res.status(201).json({ chat });
    } catch (error) {
        console.error('Error creating chat:', error);
        res.status(500).json({ error: 'Failed to create chat' });
    }
});

app.get('/api/chats/:chatId', authenticateToken, async (req, res) => {
    try {
        const chatId = req.params.chatId;
        const messages = await chatFunctions.getChatHistory(req.user.id, chatId);
        res.json({ messages });
    } catch (error) {
        console.error('Error getting chat history:', error);
        res.status(500).json({ error: 'Failed to retrieve chat history' });
    }
});

app.put('/api/chats/:chatId', authenticateToken, async (req, res) => {
    try {
        const chatId = req.params.chatId;
        const { title } = req.body;
        await chatFunctions.updateChatTitle(req.user.id, chatId, title);
        res.json({ success: true });
    } catch (error) {
        console.error('Error updating chat:', error);
        res.status(500).json({ error: 'Failed to update chat' });
    }
});

app.delete('/api/chats/:chatId', authenticateToken, async (req, res) => {
    try {
        const chatId = req.params.chatId;
        await chatFunctions.deleteChat(req.user.id, chatId);
        res.json({ success: true });
    } catch (error) {
        console.error('Error deleting chat:', error);
        res.status(500).json({ error: 'Failed to delete chat' });
    }
});

// New API endpoint to get file content directly from the database
app.get('/api/getFileContent/:type/:fileId', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const fileId = req.params.fileId;
    const fileType = req.params.type; // 'container' or 'host'
    
    if (!fileId) {
      return res.status(400).json({ error: 'File ID is required' });
    }
    
    if (fileType !== 'container' && fileType !== 'host') {
      return res.status(400).json({ error: 'Invalid file type. Must be "container" or "host"' });
    }
    
    // Query the appropriate table based on fileType
    const tableName = fileType === 'container' ? 'container_files' : 'host_files';
    const pathField = fileType === 'container' ? 'containerPath' : 'filePath';
    
    // Get file content from database
    const db = require('./database').db;
    const result = await new Promise((resolve, reject) => {
      db.get(
        `SELECT fileContent, ${pathField} as filePath, originalName, fileExtension FROM ${tableName} WHERE id = ? AND userId = ?`,
        [fileId, userId],
        (err, row) => {
          if (err) {
            reject(err);
          } else {
            resolve(row);
          }
        }
      );
    });
    
    if (!result) {
      return res.status(404).json({ error: 'File not found' });
    }
    
    // If no content is stored in the database
    if (!result.fileContent) {
      return res.status(404).json({ error: 'File content not available' });
    }
    
    // Return file content and metadata
    res.json({
      filePath: result.filePath,
      fileName: result.originalName || path.basename(result.filePath),
      fileExtension: result.fileExtension,
      content: result.fileContent
    });
    
  } catch (error) {
    console.error('Error getting file content:', error);
    res.status(500).json({ error: 'Failed to get file content' });
  }
});

// New API endpoint to find file by path
app.get('/api/findFile', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const filePath = req.query.path;
    const fileType = req.query.type || 'container'; // 'container' or 'host'
    
    if (!filePath) {
      return res.status(400).json({ error: 'File path is required' });
    }
    
    if (fileType !== 'container' && fileType !== 'host') {
      return res.status(400).json({ error: 'Invalid file type. Must be "container" or "host"' });
    }
    
    // Query the appropriate table based on fileType
    const tableName = fileType === 'container' ? 'container_files' : 'host_files';
    const pathField = fileType === 'container' ? 'containerPath' : 'filePath';
    
    // Get file from database
    const db = require('./database').db;
    const result = await new Promise((resolve, reject) => {
      db.get(
        `SELECT id, ${pathField} as filePath, originalName, fileExtension FROM ${tableName} WHERE ${pathField} = ? AND userId = ?`,
        [filePath, userId],
        (err, row) => {
          if (err) {
            reject(err);
          } else {
            resolve(row);
          }
        }
      );
    });
    
    if (!result) {
      return res.status(404).json({ error: 'File not found' });
    }
    
    // Return file details
    res.json({
      id: result.id,
      filePath: result.filePath,
      fileName: result.originalName || path.basename(result.filePath),
      fileExtension: result.fileExtension
    });
    
  } catch (error) {
    console.error('Error finding file:', error);
    res.status(500).json({ error: 'Failed to find file' });
  }
});

// Socket.IO Logik
io.on('connection', (socketClient) => {
     console.log(`User connected: ${socketClient.id}, authenticated: ${socketClient.authenticated}`);

     // Use actual userId from authentication if available, otherwise use socket ID
     const userId = socketClient.authenticated ? socketClient.userId : socketClient.id;
     
     socketClient.on('submit_task', async (data) => {
         const { task, chatId = 1 } = data; // Default to chat ID 1 if not specified
         // Use the userId from the message if authenticated, otherwise use socket ID
         const taskUserId = socketClient.authenticated ? (data.userId || userId) : socketClient.id;
         
         console.log(`Task received from ${taskUserId} in chat ${chatId}: ${task}`);
         // Store current chatId for this user in the socket
         socketClient.chatId = chatId;
         
         // Rufe den Orchestrator auf (angenommen, er ist hier verfügbar)
         // await centralOrchestrator(task, taskUserId, chatId);
         // Stelle sicher, dass centralOrchestrator ioServer verwendet, um Events zu senden
     });

     socketClient.on('disconnect', () => {
         console.log(`User disconnected: ${socketClient.id}`);
     });
 });

const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => {
    console.log(`Server with Socket.IO running on port ${PORT}`);
});

module.exports = io;