const socket = require("socket.io");
const server = require("http").createServer();
const express = require("express");
const path = require("path");
const fs = require('fs');
const bodyParser = require('body-parser');
const cors = require('cors');
const { router: authRoutes, authenticateToken } = require('./authRoutes');
const { chatFunctions, fileFunctions, taskStepFunctions } = require('./database');
const mime = require('mime-types');
const rateLimit = require('express-rate-limit');


const app = express();

// Trust proxy for reverse proxy environments
if (process.env.TRUST_PROXY === 'true') {
  app.set('trust proxy', 1);
}

app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, "public")));


const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, 
  max: 500, 
  standardHeaders: true,
  message: { error: 'Too many requests, please try again later.' },
  // Use proper IP extraction for trusted proxy environments
  keyGenerator: (req) => {
    // When behind a reverse proxy, use the real IP from X-Forwarded-For
    return req.ip || req.connection.remoteAddress;
  }
});
app.use('/api', apiLimiter);


const isAuthenticated = (req, res, next) => {
  
  authenticateToken(req, res, (err) => {
    if (err) {
        
        
        return res.status(401).send({ error: 'Authentication failed' });
    }
    
    if (req.user && req.user.id) {
        req.userId = req.user.id; 
        return next();
    } 
    
    res.status(401).send({ error: 'Unauthorized - User data missing after authentication' });
  });
};


app.use('/api', authRoutes);


const httpServer = require("http").createServer(app);

// Configure server timeouts
httpServer.timeout = parseInt(process.env.HTTP_TIMEOUT) || 60000;
httpServer.keepAliveTimeout = parseInt(process.env.KEEP_ALIVE_TIMEOUT) || 65000;

const io = socket(httpServer, {
    cors: {
        origin: ["http://localhost:3001", "http://127.0.0.1:3001", "http://localhost:3000", "http://127.0.0.1:3000"],
        methods: ["GET", "POST"],
        credentials: true
    }
});


io.use((socket, next) => {
    const token = socket.handshake.auth.token;
    const userId = socket.handshake.auth.userId;
    
    if (!token || !userId) {
        
        
        socket.authenticated = false;
        return next();
    }
    
    try {
        
        const jwt = require('jsonwebtoken');
        const JWT_SECRET = process.env.JWT_SECRET;
        
        jwt.verify(token, JWT_SECRET, (err, decoded) => {
            if (err) {
                socket.authenticated = false;
                return next(new Error('Invalid authentication token'));
            }
            
            
            if (decoded.id != userId) {
                socket.authenticated = false;
                return next(new Error('User ID mismatch'));
            }
            
            
            socket.userId = userId;
            socket.authenticated = true;
            socket.user = decoded;
            
            
            socket.taskCount = 0;
            socket.taskLastReset = Date.now();
            
            
            socket.join(`user:${userId}`);
            
            return next();
        });
    } catch (error) {
        console.error('Socket authentication error:', error.message);
        socket.authenticated = false;
        return next(new Error('Authentication error'));
    }
});


app.get("/dashboard", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "dashboard", "index.html"));
});

app.get("/dashboard/chat", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "dashboard", "index.html"));
});

app.get("/chat", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "dashboard", "index.html"));
});

app.get("/", (req, res) => {
    res.redirect("/dashboard");
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


app.get('/api/user/profile', authenticateToken, (req, res) => {
    
    res.json({ user: req.user });
});

app.get('/api/validate-token', authenticateToken, (req, res) => {
    
    res.json({ valid: true, user: req.user });
});


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
        
        // Get task steps for this chat
        let taskSteps = [];
        try {
            taskSteps = await taskStepFunctions.getTaskSteps(req.user.id, chatId);
        } catch (stepError) {
            console.error('Error getting task steps:', stepError);
            // Continue without steps if there's an error
        }
        
        res.json({ messages, taskSteps });
    } catch (error) {
        console.error('Error getting chat history:', error);
        res.status(500).json({ error: 'Failed to retrieve chat history' });
    }
});

app.get('/api/chats/:chatId/files', authenticateToken, async (req, res) => {
    try {
        const chatId = req.params.chatId;
        const files = await fileFunctions.getTrackedFiles(req.user.id, chatId);
        
        // Format files to match the expected structure
        const formattedFiles = {
            host: files.hostFiles.map(file => ({
                id: file.id,
                fileName: file.originalName || (file.filePath ? file.filePath.split('/').pop() : `file_${file.id}`),
                path: file.filePath,
                content: file.fileContent
            })),
            container: files.containerFiles.map(file => ({
                id: file.id,
                fileName: file.originalName || (file.containerPath ? file.containerPath.split('/').pop() : `file_${file.id}`),
                path: file.containerPath,
                content: file.fileContent
            }))
        };
        
        res.json({ files: formattedFiles });
    } catch (error) {
        console.error('Error getting chat files:', error);
        res.status(500).json({ error: 'Failed to retrieve chat files' });
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


app.get('/api/files/:fileId', isAuthenticated, async (req, res) => {
  const { fileId } = req.params;
  const userId = req.userId; 

  try {
    console.log(`Fetching file details for ${fileId} for user ${userId}`);
    
    const file = await fileFunctions.getTrackedFileById(userId, fileId);
    if (!file) {
      console.log(`File ${fileId} not found for user ${userId}`);
      return res.status(404).send({ error: 'File not found or access denied' });
    }
    
    // Remove file content from response (just metadata)
    const { fileContent, ...fileDetails } = file;
    console.log(`File details found for ${fileId}: ${fileDetails.fileName || fileDetails.path}`);
    res.json(fileDetails);
  } catch (error) {
    console.error(`Error fetching file details for ID ${fileId}:`, error);
    res.status(500).send({ error: 'Internal Server Error' });
  }
});


app.get('/api/files/:fileId/download', isAuthenticated, async (req, res) => {
  const { fileId } = req.params;
  const userId = req.userId; 

  // Set timeout to prevent gateway timeouts
  req.setTimeout(30000, () => {
    if (!res.headersSent) {
      res.status(408).send({ error: 'Request timeout' });
    }
  });

  try {
    console.log(`Attempting to download file ${fileId} for user ${userId}`);
    
    const file = await fileFunctions.getTrackedFileById(userId, fileId);
    
    if (!file) {
      console.log(`File ${fileId} not found for user ${userId}`);
      return res.status(404).send({ error: 'File not found or access denied' });
    }
    
    if (file.fileContent === null || file.fileContent === undefined) {
      console.log(`File ${fileId} has no content for user ${userId}`);
      return res.status(404).send({ error: 'File content unavailable' });
    }

    const fileName = file.fileName || (file.path ? file.path.split('/').pop() : `download_${fileId}${file.fileExtension ? '.' + file.fileExtension : ''}`);
    const contentType = mime.lookup(fileName) || 'application/octet-stream';

    console.log(`Serving file ${fileName} (${contentType}) for user ${userId}`);
    
    const isBinary = contentType.indexOf('text/') !== 0 && 
                     contentType !== 'application/json' && 
                     contentType !== 'application/javascript';

    let fileBuffer;
    try {
      if (isBinary) {
        fileBuffer = Buffer.from(file.fileContent, 'base64');
      } else {
        fileBuffer = Buffer.from(file.fileContent, 'utf8');
      }
    } catch (bufferError) {
      console.error(`Error creating buffer for file ${fileId}:`, bufferError);
      return res.status(500).send({ error: 'Error processing file content' });
    }

    // Set appropriate headers
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Length', fileBuffer.length);
    res.setHeader('Cache-Control', 'no-cache');
    
    // Send the file
    res.end(fileBuffer);
    console.log(`Successfully served file ${fileName} (${fileBuffer.length} bytes) for user ${userId}`);

  } catch (error) {
    console.error(`Error downloading file for ID ${fileId}:`, error);
    if (!res.headersSent) {
      res.status(500).send({ error: 'Internal Server Error' });
    }
  }
});


io.on('connection', (socketClient) => {
     
     const userId = socketClient.authenticated ? socketClient.userId : socketClient.id;
     
     socketClient.on('submit_task', async (data) => {
         
         if (!socketClient.authenticated) {
             socketClient.emit('task_error', { 
                 error: 'Authentication required for task submission',
                 userId: socketClient.id
             });
             return;
         }
         
         
         const MAX_TASKS_PER_MINUTE = 5;
         const now = Date.now();
         
         
         if (now - socketClient.taskLastReset > 60000) {
             socketClient.taskCount = 0;
             socketClient.taskLastReset = now;
         }
         
         
         if (socketClient.taskCount >= MAX_TASKS_PER_MINUTE) {
             socketClient.emit('task_error', { 
                 error: 'Rate limit exceeded. Please try again later.',
                 userId: socketClient.userId
             });
             return;
         }
         
         
         socketClient.taskCount++;
         
         const { task, chatId = 1 } = data;
         
         
         let numericChatId;
         if (chatId === 'new' || chatId === null || chatId === undefined) {
             numericChatId = 1; // Default to 1 for new chats
         } else {
             numericChatId = parseInt(chatId, 10);
             if (isNaN(numericChatId)) {
                 socketClient.emit('task_error', { 
                     error: 'Invalid chat ID format',
                     userId: socketClient.userId
                 });
                 return;
             }
         }
         
         
         const taskUserId = socketClient.userId;
         
         console.log(`Task received from ${taskUserId} in chat ${numericChatId}: ${task}`);
         
         
         socketClient.chatId = numericChatId;
         
         try {
             // Import and call the central orchestrator
             const { centralOrchestrator } = require('./index');
             
             // Emit task received confirmation
             socketClient.emit('task_received', { 
                 userId: taskUserId, 
                 chatId: numericChatId, 
                 task: task 
             });
             
             // Process the task asynchronously
             centralOrchestrator(task, taskUserId, numericChatId, false)
                 .then(result => {
                     console.log(`Task completed for ${taskUserId}:`, result);
                 })
                 .catch(error => {
                     console.error(`Error in task processing for ${taskUserId}:`, error);
                     socketClient.emit('task_error', { 
                         error: 'Error processing your task: ' + error.message,
                         userId: taskUserId
                     });
                 });
             
         } catch (error) {
             console.error(`Error processing task for ${taskUserId}:`, error);
             socketClient.emit('task_error', { 
                 error: 'Error processing your task',
                 userId: taskUserId
             });
         }
     });

     socketClient.on('submit_clarification', async (data) => {
         
         if (!socketClient.authenticated) {
             socketClient.emit('task_error', { 
                 error: 'Authentication required for clarification submission',
                 userId: socketClient.id
             });
             return;
         }
         
         const { originalQuestion, answers, chatId = 1 } = data;
         
         
         let numericChatId;
         if (chatId === 'new' || chatId === null || chatId === undefined) {
             numericChatId = 1;
         } else {
             numericChatId = parseInt(chatId, 10);
             if (isNaN(numericChatId)) {
                 socketClient.emit('task_error', { 
                     error: 'Invalid chat ID format',
                     userId: socketClient.userId
                 });
                 return;
             }
         }
         
         const taskUserId = socketClient.userId;
         
         // Combine original question with clarifications (if any)
         let clarifiedTask;
         if (answers && answers.length > 0) {
             clarifiedTask = `${originalQuestion}\n\nAdditional details:\n${answers.join('\n')}`;
         } else {
             clarifiedTask = originalQuestion; // No clarifications provided, use original
         }
         
         console.log(`Clarification received from ${taskUserId} in chat ${numericChatId}: ${clarifiedTask}`);
         
         try {
             // Import and call the central orchestrator
             const { centralOrchestrator } = require('./index');
             
             // Emit task received confirmation
             socketClient.emit('task_received', { 
                 userId: taskUserId, 
                 chatId: numericChatId, 
                 task: clarifiedTask 
             });
             
             // Process the clarified task asynchronously
             centralOrchestrator(clarifiedTask, taskUserId, numericChatId, true)
                 .then(result => {
                     console.log(`Clarified task completed for ${taskUserId}:`, result);
                 })
                 .catch(error => {
                     console.error(`Error in clarified task processing for ${taskUserId}:`, error);
                     socketClient.emit('task_error', { 
                         error: 'Error processing your clarified task: ' + error.message,
                         userId: taskUserId
                     });
                 });
             
         } catch (error) {
             console.error(`Error processing clarified task for ${taskUserId}:`, error);
             socketClient.emit('task_error', { 
                 error: 'Error processing your clarified task',
                 userId: taskUserId
             });
         }
     });

     socketClient.on('disconnect', () => {
         console.log(`User disconnected: ${socketClient.id}`);
         
         
         try {
             
             const { cleanupUserResources } = require('./index');
             if (typeof cleanupUserResources === 'function' && socketClient.authenticated) {
                 cleanupUserResources(socketClient.userId).catch(err => {
                     console.error(`Error cleaning up resources for ${socketClient.userId}:`, err);
                 });
             }
         } catch (error) {
             console.error('Error during disconnect cleanup:', error);
         }
     });
 });

const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => {
    console.log(`Server with Socket.IO running on port ${PORT}`);
});

module.exports = io;