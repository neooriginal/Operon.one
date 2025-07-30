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
const multer = require('multer');
const rateLimit = require('express-rate-limit');
const logger = require('./utils/logger');
const config = require('./utils/config');


const app = express();

// Trust proxy for reverse proxy environments
if (process.env.TRUST_PROXY === 'true') {
  app.set('trust proxy', 1);
}

app.use(cors());
app.use(bodyParser.json());
app.use(require('cookie-parser')());


const apiLimiter = rateLimit({
  windowMs: config.rateLimit.windowMs, 
  max: config.rateLimit.maxRequests, 
  standardHeaders: true,
  message: { error: 'Too many requests, please try again later.' },
  keyGenerator: (req) => {
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
httpServer.timeout = config.tasks.defaultTimeout;
httpServer.keepAliveTimeout = config.tasks.defaultTimeout + 5000;

// Global function to update sidebar for specific users
global.updateSidebar = (userId, toolName, data) => {
    if (io) {
        io.to(`user:${userId}`).emit('sidebar_update', {
            toolName,
            data
        });
    }
};

const io = socket(httpServer, {
    cors: {
        origin: config.cors.origins,
        methods: config.cors.methods,
        credentials: config.cors.credentials
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
        const JWT_SECRET = config.auth.jwtSecret;
        
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
        logger.error('Socket authentication error', { error: error.message, userId });
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
      const JWT_SECRET = config.auth.jwtSecret;
      
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
            logger.error('Database error during HTML route authentication', { error: dbError.message });
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
      const JWT_SECRET = config.auth.jwtSecret;
      
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
            logger.error('Database error during admin authentication', { error: dbError.message });
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
        logger.error('Error getting chats', { error: error.message, userId: req.user.id });
        res.status(500).json({ error: 'Failed to retrieve chats' });
    }
});

app.post('/api/chats', authenticateToken, async (req, res) => {
    try {
        const { title } = req.body;
        const chat = await chatFunctions.createChat(req.user.id, title);
        res.status(201).json({ chat });
    } catch (error) {
        logger.error('Error creating chat', { error: error.message, userId: req.user.id });
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
            logger.error('Error getting task steps', { error: stepError.message, userId: req.user.id, chatId });
            // Continue without steps if there's an error
        }
        
        res.json({ messages, taskSteps });
    } catch (error) {
        logger.error('Error getting chat history', { error: error.message, userId: req.user.id, chatId: req.params.chatId });
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
        logger.error('Error getting chat files', { error: error.message, userId: req.user.id, chatId: req.params.chatId });
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
        logger.error('Error updating chat', { error: error.message, userId: req.user.id, chatId: req.params.chatId });
        res.status(500).json({ error: 'Failed to update chat' });
    }
});

app.delete('/api/chats/:chatId', authenticateToken, async (req, res) => {
    try {
        const chatId = req.params.chatId;
        await chatFunctions.deleteChat(req.user.id, chatId);
        res.json({ success: true });
    } catch (error) {
        logger.error('Error deleting chat', { error: error.message, userId: req.user.id, chatId: req.params.chatId });
        res.status(500).json({ error: 'Failed to delete chat' });
    }
});


app.get('/api/files/:fileId', isAuthenticated, async (req, res) => {
  const { fileId } = req.params;
  const userId = req.userId; 

  try {
    logger.debug('Fetching file details', { fileId, userId });
    
    const file = await fileFunctions.getTrackedFileById(userId, fileId);
    if (!file) {
      console.log(`File ${fileId} not found for user ${userId}`);
      return res.status(404).send({ error: 'File not found or access denied' });
    }
    
    // Remove file content from response (just metadata)
    const { fileContent, ...fileDetails } = file;
    logger.debug('File details found', { fileId, fileName: fileDetails.fileName || fileDetails.path, userId });
    res.json(fileDetails);
  } catch (error) {
    logger.error('Error fetching file details', { error: error.message, fileId, userId });
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
    logger.debug('Attempting to download file', { fileId, userId });
    
    const file = await fileFunctions.getTrackedFileById(userId, fileId);
    
    if (!file) {
      logger.warn('File not found for download', { fileId, userId });
      return res.status(404).send({ error: 'File not found or access denied' });
    }
    
    if (file.fileContent === null || file.fileContent === undefined) {
      logger.warn('File content unavailable', { fileId, userId });
      return res.status(404).send({ error: 'File content unavailable' });
    }

    const fileName = file.fileName || (file.path ? file.path.split('/').pop() : `download_${fileId}${file.fileExtension ? '.' + file.fileExtension : ''}`);
    const contentType = mime.lookup(fileName) || 'application/octet-stream';

    logger.debug('Serving file', { fileName, contentType, userId, fileId });
    
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
      logger.error('Error creating buffer for file', { error: bufferError.message, fileId, userId });
      return res.status(500).send({ error: 'Error processing file content' });
    }

    // Set appropriate headers
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Length', fileBuffer.length);
    res.setHeader('Cache-Control', 'no-cache');
    
    // Send the file
    res.end(fileBuffer);
    logger.debug('Successfully served file', { fileName, fileSize: fileBuffer.length, userId, fileId });

  } catch (error) {
    logger.error('Error downloading file', { error: error.message, fileId, userId });
    if (!res.headersSent) {
      res.status(500).send({ error: 'Internal Server Error' });
    }
  }
});

// Configure multer for file uploads - use memory storage to avoid saving to host
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB max file size
    files: 10 // Max 10 files per upload
  },
  fileFilter: (req, file, cb) => {
    // Allow all file types but log them
    logger.info('File upload attempted', {
      originalName: file.originalname,
      mimeType: file.mimetype,
      userId: req.userId
    });
    cb(null, true);
  }
});

// File upload endpoint that saves directly to docker container
app.post('/api/upload', isAuthenticated, upload.array('files', 10), async (req, res) => {
  const userId = req.userId;
  const { chatId = 1 } = req.body;
  
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'No files uploaded' });
    }

    logger.info('Processing file uploads', {
      fileCount: req.files.length,
      userId,
      chatId
    });

    const uploadedFiles = [];
    
    // Import the filesystem tool
    const { sanitizeFilePath } = require('./index');
    
    for (const file of req.files) {
      try {
        // Create a safe filename
        const timestamp = Date.now();
        const safeName = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
        const fileName = `${timestamp}_${safeName}`;
        
        // Determine container path - save to user-specific directory in container
        const containerPath = `/app/uploads/${userId}/${fileName}`;
        
        // Get file extension
        const fileExtension = file.originalname.split('.').pop() || '';
        
        // Convert buffer to string for text files, or base64 for binary files
        let fileContent;
        const isTextFile = file.mimetype.startsWith('text/') ||
                          file.mimetype === 'application/json' ||
                          file.mimetype === 'application/javascript' ||
                          file.mimetype === 'application/xml';
        
        if (isTextFile) {
          fileContent = file.buffer.toString('utf8');
        } else {
          fileContent = file.buffer.toString('base64');
        }
        
        // Track the file in the database
        const tracked = await fileFunctions.trackContainerFile(
          userId,
          containerPath,
          file.originalname,
          `Uploaded file: ${file.originalname}`,
          chatId,
          fileContent,
          fileExtension
        );
        
        logger.info('File uploaded and tracked', {
          fileName: file.originalname,
          containerPath,
          fileId: tracked.id,
          userId,
          chatId
        });
        
        uploadedFiles.push({
          id: tracked.id,
          originalName: file.originalname,
          fileName: fileName,
          containerPath: containerPath,
          size: file.size,
          mimeType: file.mimetype,
          uploaded: true
        });
        
      } catch (fileError) {
        logger.error('Error processing individual file', {
          fileName: file.originalname,
          error: fileError.message,
          userId
        });
        
        uploadedFiles.push({
          originalName: file.originalname,
          error: `Failed to upload: ${fileError.message}`,
          uploaded: false
        });
      }
    }
    
    // Count successful uploads
    const successCount = uploadedFiles.filter(f => f.uploaded).length;
    const errorCount = uploadedFiles.filter(f => !f.uploaded).length;
    
    logger.info('File upload completed', {
      successCount,
      errorCount,
      userId,
      chatId
    });
    
    res.status(201).json({
      success: true,
      message: `Successfully uploaded ${successCount} file(s)${errorCount > 0 ? `, ${errorCount} failed` : ''}`,
      files: uploadedFiles,
      successCount,
      errorCount
    });
    
  } catch (error) {
    logger.error('Error handling file upload', {
      error: error.message,
      userId,
      chatId
    });
    res.status(500).json({
      error: 'Failed to upload files',
      details: error.message
    });
  }
});

// Get uploaded files for a user/chat
app.get('/api/uploads', isAuthenticated, async (req, res) => {
  const userId = req.userId;
  const { chatId = 1 } = req.query;
  
  try {
    const files = await fileFunctions.getTrackedFiles(userId, chatId);
    
    // Format only container files (uploaded files)
    const uploadedFiles = files.containerFiles.map(file => ({
      id: file.id,
      filename: file.originalName, // Match JavaScript expectation
      originalName: file.originalName,
      containerPath: file.containerPath,
      fileExtension: file.fileExtension,
      upload_date: file.createdAt, // Match JavaScript expectation
      size: file.fileContent ? file.fileContent.length : 0, // Calculate size from content
      hasContent: !!file.fileContent
    }));
    
    res.json(uploadedFiles); // Return array directly to match JavaScript expectation
    
  } catch (error) {
    logger.error('Error fetching uploaded files', {
      error: error.message,
      userId,
      chatId
    });
    res.status(500).json({
      error: 'Failed to fetch uploaded files',
      details: error.message
    });
  }
});

// Delete an uploaded file
app.delete('/api/uploads/:fileId', isAuthenticated, async (req, res) => {
  const { fileId } = req.params;
  const userId = req.userId;
  
  try {
    // Get the file to verify ownership
    const file = await fileFunctions.getTrackedFileById(userId, fileId);
    if (!file) {
      return res.status(404).json({ error: 'File not found or access denied' });
    }
    
    // Only allow deletion of container files (uploaded files)
    if (file.type !== 'container') {
      return res.status(403).json({ error: 'Cannot delete this type of file' });
    }
    
    // Delete from database
    const result = await fileFunctions.deleteTrackedFiles(userId, [fileId], 'container');
    
    if (result.deleted > 0) {
      logger.info('File deleted', { fileId, fileName: file.fileName, userId });
      res.json({
        success: true,
        message: 'File deleted successfully',
        deletedCount: result.deleted
      });
    } else {
      res.status(404).json({ error: 'File not found' });
    }
    
  } catch (error) {
    logger.error('Error deleting file', {
      error: error.message,
      fileId,
      userId
    });
    res.status(500).json({
      error: 'Failed to delete file',
      details: error.message
    });
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
         
         logger.task(taskUserId, numericChatId, 'Task received', { task: task.substring(0, 100) + '...' });
         
         
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
                     logger.task(taskUserId, numericChatId, 'Task completed successfully');
                 })
                 .catch(error => {
                     logger.error('Error in task processing', { error: error.message, userId: taskUserId, chatId: numericChatId });
                     socketClient.emit('task_error', { 
                         error: 'Error processing your task: ' + error.message,
                         userId: taskUserId
                     });
                 });
             
         } catch (error) {
             logger.error('Error processing task', { error: error.message, userId: taskUserId, chatId: numericChatId });
             socketClient.emit('task_error', { 
                 error: 'Error processing your task',
                 userId: taskUserId
             });
         }
     });

     // Handle task cancellation
     socketClient.on('cancel_task', async (data) => {
         if (!socketClient.authenticated) {
             socketClient.emit('task_error', { 
                 error: 'Authentication required for task cancellation',
                 userId: socketClient.id
             });
             return;
         }
         
         try {
             const { chatId = 1 } = data;
             const numericChatId = parseInt(chatId, 10) || 1;
             const taskUserId = socketClient.userId;
             
             logger.info('Task cancellation requested', { userId: taskUserId, chatId: numericChatId });
             
             // Import context manager and cancel the task
             const { contextManager } = require('./index');
             const cancelled = contextManager.cancelTask(taskUserId, numericChatId);
             
             if (cancelled) {
                 logger.info('Task cancelled successfully', { userId: taskUserId, chatId: numericChatId });
                 socketClient.emit('task_cancellation_confirmed', { 
                     userId: taskUserId, 
                     chatId: numericChatId, 
                     message: 'Task cancellation initiated' 
                 });
             } else {
                 logger.warn('No running task to cancel', { userId: taskUserId, chatId: numericChatId });
                 socketClient.emit('task_error', { 
                     error: 'No running task to cancel',
                     userId: taskUserId,
                     chatId: numericChatId
                 });
             }
         } catch (error) {
             logger.error('Error cancelling task', { error: error.message, userId: socketClient.userId });
             socketClient.emit('task_error', { 
                 error: 'Error cancelling task: ' + error.message,
                 userId: socketClient.userId
             });
         }
     });

     // Handle tool sidebar updates
     socketClient.on('request_sidebar_info', (data) => {
         if (!socketClient.authenticated) {
             return;
         }
         const { toolName } = data;
         // Emit request to get current sidebar info for the specific tool
         socketClient.emit('sidebar_info_requested', { toolName, userId: socketClient.userId });
     });

     // Handle email notification preference updates
     socketClient.on('update_email_notification_preference', async (data) => {
         if (!socketClient.authenticated) {
             return;
         }
         
         try {
             const { chatId, enabled } = data;
             const { settingsFunctions } = require('./database');
             
             await settingsFunctions.saveSetting(
                 socketClient.userId, 
                 `email_notifications_${chatId}`, 
                 enabled.toString()
             );
             
             logger.info('Email notification preference updated', { userId: socketClient.userId, chatId, enabled });
             
             socketClient.emit('email_notification_preference_updated', {
                 chatId,
                 enabled,
                 success: true
             });
         } catch (error) {
             logger.error('Error updating email notification preference', { error: error.message, userId: socketClient.userId });
             socketClient.emit('email_notification_preference_updated', {
                 chatId: data.chatId,
                 enabled: data.enabled,
                 success: false,
                 error: error.message
             });
         }
     });

     socketClient.on('disconnect', () => {
         logger.info('User disconnected', { socketId: socketClient.id, userId: socketClient.userId });
         
         
         try {
             
             const { cleanupUserResources } = require('./index');
             if (typeof cleanupUserResources === 'function' && socketClient.authenticated) {
                 cleanupUserResources(socketClient.userId).catch(err => {
                     logger.error('Error cleaning up resources', { error: err.message, userId: socketClient.userId });
                 });
             }
         } catch (error) {
             logger.error('Error during disconnect cleanup', { error: error.message, socketId: socketClient.id });
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
                     // Check if email service is available
                     const emailService = require('./utils/emailService');
                     const emailServiceAvailable = emailService.isEmailServiceAvailable();
                     
                     socketClient.emit('steps', {
                         userId: socketClient.userId,
                         chatId: numericChatId,
                         plan: plan,
                         restoredFromRunning: true,
                         emailServiceAvailable
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
                 // Check if task was recently cancelled
                 const wasCancelled = contextManager.wasTaskRecentlyCancelled(socketClient.userId, numericChatId);
                 
                 if (wasCancelled) {
                     const cancellationInfo = contextManager.getCancellationInfo(socketClient.userId, numericChatId);
                     
                     socketClient.emit('task_status_checked', {
                         userId: socketClient.userId,
                         chatId: numericChatId,
                         isRunning: false,
                         wasCancelled: true,
                         cancelledAt: cancellationInfo.cancelledAt,
                         cancelledBy: cancellationInfo.cancelledBy
                     });
                 } else {
                     socketClient.emit('task_status_checked', {
                         userId: socketClient.userId,
                         chatId: numericChatId,
                         isRunning: false,
                         wasCancelled: false
                     });
                 }
             }
         } catch (error) {
             logger.error('Error checking running task', { error: error.message, userId: socketClient.userId });
             socketClient.emit('task_status_checked', { 
                 error: error.message,
                 userId: socketClient.userId
             });
         }
     });
 });

const PORT = config.server.port;
httpServer.listen(PORT, () => {
    logger.info('Server started', { port: PORT, environment: config.server.environment });
});

module.exports = io;