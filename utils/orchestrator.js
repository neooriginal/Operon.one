const contextManager = require('./context');
const { centralOrchestrator } = require('../index');
const io = require('../socket');

/**
 * Process a task and respond with AI
 * @param {string} task - The task/question to process
 * @param {string} userId - User identifier
 * @param {number} chatId - Chat identifier (default: 1)
 */
async function processTask(task, userId, chatId = 1) {
    try {
        // Add user's message to history
        await contextManager.addToHistory({
            role: "user",
            content: task
        }, userId, chatId);
        
        // Process the task using the central orchestrator
        const response = await centralOrchestrator(task, userId, chatId);
        
        // Send response to the client directly (now handled in AI tool)
        // io.emit('ai_message', { userId, text: response });
        
        return response;
    } catch (error) {
        console.error('Error processing task:', error);
        io.emit('ai_message', { 
            userId, 
            chatId,
            text: `Error processing your task: ${error.message}` 
        });
        return null;
    }
} 