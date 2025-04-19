const socket = require("socket.io");
const server = require("http").createServer();
const express = require("express");
const path = require("path");
const fs = require('fs');
const bodyParser = require('body-parser');
const cors = require('cors');
const { router: authRoutes, authenticateToken } = require('./authRoutes');

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

// Download-Route
app.get('/download', authenticateToken, (req, res) => {
    const userId = req.user.id;
    const filePathQuery = req.query.filePath;

    if (!userId || !filePathQuery) {
        return res.status(400).send('Missing userId or filePath query parameter.');
    }

    // Sicherheitsmaßnahme: Bereinige UserID und Dateipfad
    const safeUserId = userId.toString().replace(/[^a-zA-Z0-9_-]/g, '_');
    // Normalisiere Pfad und stelle sicher, dass er innerhalb des erwarteten Output-Verzeichnisses liegt
    const requestedPath = path.normalize(filePathQuery);
    const baseOutputDir = path.join(__dirname, 'output');
    const userOutputDir = path.join(baseOutputDir, safeUserId);
    const absoluteRequestedPath = path.resolve(baseOutputDir, requestedPath); // Versuche, den Pfad relativ zum Output-Ordner aufzulösen

    console.log(`Download request for user ${safeUserId}, path: ${requestedPath}`);
    console.log(`Absolute path resolved to: ${absoluteRequestedPath}`);
    console.log(`Expected user directory: ${userOutputDir}`);

    // WICHTIG: Stelle sicher, dass der Pfad nicht außerhalb des User-Verzeichnisses liegt!
    // Dies ist eine grundlegende Prüfung, je nach Struktur ggf. anpassen!
    if (!absoluteRequestedPath.startsWith(userOutputDir) && !absoluteRequestedPath.startsWith(baseOutputDir)) { // Erlaube auch direkt im Output-Ordner (falls keine User-ID im Pfad)
         console.warn('Path traversal attempt detected or file not in expected directory!');
         return res.status(403).send('Access denied.');
     }

    // Prüfe, ob die Datei existiert
    fs.access(absoluteRequestedPath, fs.constants.R_OK, (err) => {
        if (err) {
            console.error('File not found or not readable:', err);
            return res.status(404).send('File not found or cannot be accessed.');
        }

        // Sende die Datei zum Download
        res.download(absoluteRequestedPath, path.basename(absoluteRequestedPath), (downloadErr) => {
            if (downloadErr) {
                console.error('Error sending file:', downloadErr);
                // Sende keinen weiteren Fehler, wenn Header bereits gesendet wurden
                if (!res.headersSent) {
                    res.status(500).send('Error downloading the file.');
                }
            }
        });
    });
});

// Socket.IO Logik
io.on('connection', (socketClient) => {
     console.log(`User connected: ${socketClient.id}, authenticated: ${socketClient.authenticated}`);

     // Use actual userId from authentication if available, otherwise use socket ID
     const userId = socketClient.authenticated ? socketClient.userId : socketClient.id;
     
     socketClient.on('submit_task', async (data) => {
         const { task } = data;
         // Use the userId from the message if authenticated, otherwise use socket ID
         const taskUserId = socketClient.authenticated ? (data.userId || userId) : socketClient.id;
         
         console.log(`Task received from ${taskUserId}: ${task}`);
         // Rufe den Orchestrator auf (angenommen, er ist hier verfügbar)
         // await centralOrchestrator(task, taskUserId);
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