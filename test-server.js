const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');
const { centralOrchestrator } = require('./index');

// Create Express app
const app = express();

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname)));

// Serve the test UI
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'test-ui.html'));
});

// API endpoint to submit tasks
app.post('/task', async (req, res) => {
    try {
        const { task, userId } = req.body;
        console.log(`Received task from UI: ${task} (User: ${userId})`);
        
        // Start the orchestrator in the background
        centralOrchestrator(task, userId).catch(err => {
            console.error('Error in orchestrator:', err);
        });
        
        // Return success immediately
        res.json({ success: true, message: 'Task submitted successfully' });
    } catch (error) {
        console.error('Error handling task:', error);
        res.status(500).json({ success: false, message: 'Error processing task' });
    }
});

// Start the server on a different port than the socket
const PORT = 3001;
app.listen(PORT, () => {
    console.log(`Test server running on http://localhost:${PORT}`);
}); 