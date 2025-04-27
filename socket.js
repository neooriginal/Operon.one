const socket = require("socket.io");
const server = require("http").createServer();
const express = require("express");
const path = require("path");
const fs = require('fs');
const bodyParser = require('body-parser');
const cors = require('cors');
const { router: authRoutes, authenticateToken } = require('./authRoutes');
const { chatFunctions, fileFunctions } = require('./database');
const mime = require('mime-types');

// Serve static files from the public directory
const app = express();

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, "public")));

// Authentication middleware for file endpoints
const isAuthenticated = (req, res, next) => {
  // Use the existing authenticateToken middleware for consistency
  authenticateToken(req, res, (err) => {
    if (err) {
        // If authenticateToken sends a response (like 401/403), it won't call next(err)
        // If it calls next with an error, handle it here
        return res.status(401).send({ error: 'Authentication failed' });
    }
    // If authentication is successful, req.user should be populated
    if (req.user && req.user.id) {
        req.userId = req.user.id; // Attach userId for consistency with previous placeholder
        return next();
    } 
    // Fallback if req.user is not populated correctly
    res.status(401).send({ error: 'Unauthorized - User data missing after authentication' });
  });
};

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

// Endpoint to get file details (authenticated)
app.get('/api/files/:fileId', isAuthenticated, async (req, res) => {
  const { fileId } = req.params;
  const userId = req.userId; // Get userId from auth middleware

  try {
    const file = await fileFunctions.getTrackedFileById(userId, fileId);
    if (!file) {
      return res.status(404).send({ error: 'File not found or access denied' });
    }
    // Send back file details (excluding content for this endpoint)
    const { fileContent, ...fileDetails } = file;
    res.json(fileDetails);
  } catch (error) {
    console.error(`Error fetching file details for ID ${fileId}:`, error);
    res.status(500).send({ error: 'Internal Server Error' });
  }
});

// Endpoint to download file content (authenticated)
app.get('/api/files/:fileId/download', isAuthenticated, async (req, res) => {
  const { fileId } = req.params;
  const userId = req.userId; // Get userId from auth middleware

  try {
    const file = await fileFunctions.getTrackedFileById(userId, fileId);
    if (!file || file.fileContent === null || file.fileContent === undefined) {
      return res.status(404).send({ error: 'File not found, content unavailable, or access denied' });
    }

    const fileName = file.fileName || `download_${fileId}${file.fileExtension ? '.' + file.fileExtension : ''}`;
    const contentType = mime.lookup(fileName) || 'application/octet-stream';

    // Determine if the file should be treated as binary based on mime type or extension
    const isBinary = contentType.indexOf('text/') !== 0 && 
                     contentType !== 'application/json' && 
                     contentType !== 'application/javascript';

    // Properly handle both binary and text files
    let fileBuffer;
    if (isBinary) {
      // For binary files, assume base64 encoding
      try {
        fileBuffer = Buffer.from(file.fileContent, 'base64');
      } catch (e) {
        // Fallback to utf8 if base64 decoding fails
        fileBuffer = Buffer.from(file.fileContent, 'utf8');
      }
    } else {
      // For text files
      fileBuffer = Buffer.from(file.fileContent, 'utf8');
    }

    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Length', fileBuffer.length);
    
    // Send the buffer directly
    res.end(fileBuffer);

  } catch (error) {
    console.error(`Error downloading file for ID ${fileId}:`, error);
    res.status(500).send({ error: 'Internal Server Error' });
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