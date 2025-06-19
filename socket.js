const socket = require("socket.io");
const server = require("http").createServer();
const express = require("express");
const path = require("path");
const fs = require('fs');
const bodyParser = require('body-parser');
const cors = require('cors');
const { router: authRoutes, authenticateToken } = require('./authRoutes');
const adminRoutes = require('./adminRoutes');
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
app.use(require('cookie-parser')());


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
app.use('/api/admin', adminRoutes);


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


// Create a middleware for HTML routes that redirects to login if not authenticated
const requireAuthForHTML = (req, res, next) => {
  const { userFunctions } = require('./database');
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  
  // Helper function to verify token and user existence
  const verifyTokenAndUser = async (tokenToVerify) => {
    try {
      const jwt = require('jsonwebtoken');
      const JWT_SECRET = process.env.JWT_SECRET;
      
      return new Promise((resolve, reject) => {
        jwt.verify(tokenToVerify, JWT_SECRET, async (err, user) => {
          if (err) {
            return reject(err);
          }
          
          try {
            // Verify that the user still exists in the database
            const dbUser = await userFunctions.getUserById(user.id);
            if (!dbUser) {
              return reject(new Error('User no longer exists'));
            }
            
            req.user = user;
            resolve();
          } catch (dbError) {
            console.error('Database error during HTML route authentication:', dbError);
            reject(dbError);
          }
        });
      });
    } catch (error) {
      throw error;
    }
  };
  
  // Check for token in Authorization header
  if (token) {
    verifyTokenAndUser(token)
      .then(() => next())
      .catch(() => res.redirect('/login'));
  } else {
    // Check for token in cookies as backup
    const tokenFromCookie = req.cookies && req.cookies.authToken;
    
    if (tokenFromCookie) {
      verifyTokenAndUser(tokenFromCookie)
        .then(() => next())
        .catch(() => res.redirect('/login'));
    } else {
      // No valid authentication found, redirect to login
      return res.redirect('/login');
    }
  }
};

// Serve dashboard static files with authentication protection
app.use('/dashboard', requireAuthForHTML, express.static(path.join(__dirname, "public", "dashboard")));

// Admin panel protection with admin role verification
const requireAdminForHTML = async (req, res, next) => {
  const { userFunctions } = require('./database');
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  
  const verifyAdminToken = async (tokenToVerify) => {
    try {
      const jwt = require('jsonwebtoken');
      const JWT_SECRET = process.env.JWT_SECRET;
      
      return new Promise((resolve, reject) => {
        jwt.verify(tokenToVerify, JWT_SECRET, async (err, user) => {
          if (err) {
            return reject(err);
          }
          
          try {
            // Check if user exists and is admin
            const dbUser = await userFunctions.getUserById(user.id);
            if (!dbUser) {
              return reject(new Error('User no longer exists'));
            }
            
            const isAdmin = await userFunctions.isAdmin(user.id);
            if (!isAdmin) {
              return reject(new Error('Admin access required'));
            }
            
            req.user = user;
            resolve();
          } catch (dbError) {
            console.error('Database error during admin authentication:', dbError);
            reject(dbError);
          }
        });
      });
    } catch (error) {
      throw error;
    }
  };
  
  if (token) {
    try {
      await verifyAdminToken(token);
      next();
    } catch {
      res.status(403).send('Access denied. Admin privileges required.');
    }
  } else {
    const tokenFromCookie = req.cookies && req.cookies.authToken;
    
    if (tokenFromCookie) {
      try {
        await verifyAdminToken(tokenFromCookie);
        next();
      } catch {
        res.status(403).send('Access denied. Admin privileges required.');
      }
    } else {
      res.redirect('/login');
    }
  }
};

app.use('/admin', requireAdminForHTML, express.static(path.join(__dirname, "public", "admin")));
app.use('/assets', express.static(path.join(__dirname, "public", "assets")));
app.use('/legal', express.static(path.join(__dirname, "public", "legal")));
// Serve other public files without authentication (but prevent directory listing and auto-indexing)
app.use(express.static(path.join(__dirname, "public"), {
  dotfiles: 'deny',
  index: false, // Prevent serving index files automatically
  redirect: false
}));

// Health check endpoint for Docker
app.get("/health", (req, res) => {
    res.status(200).json({ status: "healthy", timestamp: new Date().toISOString() });
});

// Serve dashboard at root with authentication
app.get("/", requireAuthForHTML, (req, res) => {
    res.sendFile(path.join(__dirname, "public", "dashboard", "index.html"));
});

app.get("/chat", requireAuthForHTML, (req, res) => {
    res.sendFile(path.join(__dirname, "public", "dashboard", "index.html"));
});

app.get("/login", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "dashboard", "login.html"));
});

app.get("/register", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "dashboard", "register.html"));
});

app.get("/reset-password", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "dashboard", "reset-password.html"));
});

app.get("/settings", requireAuthForHTML, (req, res) => {
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
             console.error(`Error during disconnect cleanup: ${error.message}`);
         }
     });

     socketClient.on('check_running_task', async (data) => {
         if (!socketClient.authenticated) {
             socketClient.emit('task_status_checked', { 
                 error: 'Authentication required',
                 userId: socketClient.id
             });
             return;
         }

         try {
             const { contextManager } = require('./index');
             const { chatId = 1 } = data;
             const numericChatId = parseInt(chatId, 10) || 1;
             
             const isRunning = contextManager.isTaskRunning(socketClient.userId, numericChatId);
             
             if (isRunning) {
                 const context = contextManager.getContext(socketClient.userId, numericChatId);
                 const plan = context.plan || [];
                 const currentStepIndex = context.currentStepIndex || 0;
                 const question = context.question || '';
                 
                 socketClient.emit('task_status_checked', {
                     userId: socketClient.userId,
                     chatId: numericChatId,
                     isRunning: true,
                     taskId: context.lastTaskId,
                     question: question,
                     plan: plan,
                     currentStepIndex: currentStepIndex,
                     startTime: context.taskStartTime
                 });
                 
                 if (plan.length > 0) {
                     socketClient.emit('steps', {
                         userId: socketClient.userId,
                         chatId: numericChatId,
                         plan: plan,
                         restoredFromRunning: true
                     });
                     
                     for (let i = 0; i < currentStepIndex && i < plan.length; i++) {
                         socketClient.emit('step_completed', {
                             userId: socketClient.userId,
                             chatId: numericChatId,
                             step: plan[i].step || `Step ${i + 1}`,
                             action: plan[i].action || '',
                             metrics: {
                                 stepIndex: i,
                                 stepCount: i + 1,
                                 totalSteps: plan.length,
                                 successCount: i + 1
                             },
                             restoredFromRunning: true
                         });
                     }
                 }
                 
                 socketClient.emit('status_update', {
                     userId: socketClient.userId,
                     chatId: numericChatId,
                     status: currentStepIndex < plan.length ? 
                         `Resuming: Step ${currentStepIndex + 1}/${plan.length}` : 
                         'Processing task...',
                     restoredFromRunning: true
                 });
             } else {
                 socketClient.emit('task_status_checked', {
                     userId: socketClient.userId,
                     chatId: numericChatId,
                     isRunning: false
                 });
             }
         } catch (error) {
             console.error(`Error checking running task for ${socketClient.userId}:`, error);
             socketClient.emit('task_status_checked', { 
                 error: error.message,
                 userId: socketClient.userId
             });
         }
     });
 });

const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => {
    console.log(`Server with Socket.IO running on port ${PORT}`);
});

module.exports = io;