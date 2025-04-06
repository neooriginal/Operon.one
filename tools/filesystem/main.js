const fs = require('fs');
const path = require('path');
const ai = require('../AI/ai');
const contextManager = require('../../utils/context');

function getBaseDirectory(userId = 'default') {
    const applicationBaseDir = path.join(__dirname, '..', '..');
    const outputDir = path.join(applicationBaseDir, 'output');
    
    // User-specific directory inside output
    // Sanitize userId to prevent any directory traversal
    const sanitizedUserId = userId.replace(/[^a-zA-Z0-9_-]/g, '_');
    return path.join(outputDir, sanitizedUserId);
}

// Ensure the base directory exists, now with user-specific path
function ensureBaseDirectoryExists(userId = 'default') {
    // First ensure the main output directory exists
    const outputDir = path.join(__dirname, '..', '..', 'output');
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }
    
    // Then ensure user-specific directory exists
    const baseDir = getBaseDirectory(userId);
    if (!fs.existsSync(baseDir)) {
        fs.mkdirSync(baseDir, { recursive: true });
    }
}

// Enhanced security: Validate path and ensure it's within user directory
function validatePath(fullPath, baseDir) {
    // Normalize paths to handle any directory traversal attempts
    const normalizedPath = path.normalize(fullPath);
    const normalizedBaseDir = path.normalize(baseDir);
    
    // Ensure the full path is still within the base directory after normalization
    if (!normalizedPath.startsWith(normalizedBaseDir)) {
        throw new Error(`Security violation: Path "${fullPath}" is outside the allowed directory "${baseDir}"`);
    }
    
    return normalizedPath;
}

// Sanitize and resolve paths to prevent directory traversal, with user-specific base
function securePath(userPath, userId = 'default') {
    // Get the base directory for this user
    const baseDir = getBaseDirectory(userId);
    
    // If path is empty or undefined, return the user's base directory
    if (!userPath || userPath.trim() === '') {
        return baseDir;
    }
    
    // Handle absolute paths - reject any absolute paths immediately
    if (path.isAbsolute(userPath)) {
        throw new Error('Security violation: Absolute paths are not allowed');
    }
    
    // Remove any leading slashes and normalize path
    const normalizedPath = path.normalize(userPath.replace(/^[\/\\]+/, ''));
    
    // Check for path traversal attempts using ..
    if (normalizedPath.includes('..')) {
        throw new Error('Security violation: Directory traversal attempts are not allowed');
    }
    
    // Resolve the full path, using user-specific base
    const fullPath = path.resolve(baseDir, normalizedPath);
    
    // Final validation to ensure path is within user's directory
    return validatePath(fullPath, baseDir);
}

function saveToFile(content, userPath, filename, userId = 'default') {
    // First make sure user directory exists
    ensureBaseDirectoryExists(userId);
    
    // Sanitize filename to prevent directory traversal
    const sanitizedFilename = filename.replace(/[\/\\]/g, '_');
    
    // Get secure path for the directory
    const dirPath = securePath(userPath, userId);
    
    // Ensure the directory exists
    if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
    }
    
    const filePath = path.join(dirPath, sanitizedFilename);
    
    // Final security check on complete path
    validatePath(filePath, getBaseDirectory(userId));
    
    fs.writeFileSync(filePath, content);
}

function readFile(userPath, filename, userId = 'default') {
    // Sanitize filename to prevent directory traversal
    const sanitizedFilename = filename.replace(/[\/\\]/g, '_');
    
    const dirPath = securePath(userPath, userId);
    const filePath = path.join(dirPath, sanitizedFilename);
    
    // Final security check on complete path
    validatePath(filePath, getBaseDirectory(userId));
    
    if (!fs.existsSync(filePath)) {
        throw new Error(`File not found: ${sanitizedFilename}`);
    }
    
    return fs.readFileSync(filePath, 'utf8');
}

function createDirectory(userPath, userId = 'default') {
    ensureBaseDirectoryExists(userId);
    const dirPath = securePath(userPath, userId);
    fs.mkdirSync(dirPath, { recursive: true });
}

function deleteFile(userPath, filename, userId = 'default') {
    // Sanitize filename to prevent directory traversal
    const sanitizedFilename = filename.replace(/[\/\\]/g, '_');
    
    const dirPath = securePath(userPath, userId);
    const filePath = path.join(dirPath, sanitizedFilename);
    
    // Final security check on complete path
    validatePath(filePath, getBaseDirectory(userId));
    
    if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
    }
}

function deleteDirectory(userPath, userId = 'default') {
    const dirPath = securePath(userPath, userId);
    
    // Extra checks to prevent deleting the user's root directory
    const baseDir = getBaseDirectory(userId);
    if (path.normalize(dirPath) === path.normalize(baseDir)) {
        throw new Error('Security violation: Cannot delete user root directory');
    }
    
    if (fs.existsSync(dirPath)) {
        fs.rmSync(dirPath, { recursive: true, force: true });
    }
}

function listFiles(userPath, userId = 'default') {
    const dirPath = securePath(userPath, userId);
    if (!fs.existsSync(dirPath)) {
        return [];
    }
    return fs.readdirSync(dirPath).filter(item => 
        fs.statSync(path.join(dirPath, item)).isFile()
    );
}

function listDirectories(userPath, userId = 'default') {
    const dirPath = securePath(userPath, userId);
    if (!fs.existsSync(dirPath)) {
        return [];
    }
    return fs.readdirSync(dirPath).filter(item => 
        fs.statSync(path.join(dirPath, item)).isDirectory()
    );
}

// Function to log security events
function logSecurityEvent(userId, action, details) {
    console.warn(`[SECURITY] User: ${userId}, Action: ${action}, Details: ${details}`);
    // Could add additional logging to a security log file if needed
}

// Block potentially unsafe operations on paths
function validateSafePath(pathStr) {
    // List of patterns that might indicate unsafe operations
    const unsafePatterns = [
        /\.\./,                    // Directory traversal
        /^[\/\\]/,                 // Absolute paths starting with / or \
        /^[a-zA-Z]:[\/\\]/,        // Windows absolute paths like C:\ or C:/
        /^~/,                      // Home directory
        /proc/i,                   // Linux proc filesystem
        /dev/i,                    // Device files
        /etc/i,                    // System configuration
        /sys/i,                    // System files
        /bin/i,                    // Binary directories
        /windows/i,                // Windows system directories
        /program\s*files/i,        // Program files
        /AppData/i,                // Application data
    ];
    
    // Check for unsafe patterns
    for (const pattern of unsafePatterns) {
        if (pattern.test(pathStr)) {
            throw new Error(`Security violation: Path "${pathStr}" contains unsafe pattern`);
        }
    }
    
    return true;
}

async function runStep(task, otherAIData, userId = 'default'){
    // Get tool state from context
    const toolState = contextManager.getToolState('fileSystem', userId) || { 
        history: [], 
        operations: []
    };

    let prompt = `
    You are an AI agent that can execute complex tasks. You are meant to control the filesystem.
    Do your best to complete the task provided by the user. 
    
    SECURITY CRITICAL: You MUST follow these strict guidelines:
    1. ONLY operate within the user's allowed directory
    2. NEVER attempt to access files outside the user directory
    3. NEVER use absolute paths
    4. NEVER use path traversal techniques (like ../ or ..\)
    5. NEVER try to access system directories or sensitive files
    
    Respond in a JSON format with the following format. Only respond with one at a time:
    {
        "action": "saveToFile",
        "content": "content to save",
        "path": "path to save to",
        "filename": "filename to save to"
    },
    {
        "action": "deleteFile",
        "path": "path to delete",
        "filename": "filename to delete"
    },
    {
        "action": "createDirectory",
        "path": "path to create"
    },
    {
        "action": "deleteDirectory",
        "path": "path to delete"
    },
    {
        "action": "listFiles",
        "path": "path to list"
    },
    {
        "action": "listDirectories",
        "path": "path to list"
    },
    {
        "action": "readFile",
        "path": "path to read",
        "filename": "filename to read"
    },
    {
        "action": "close",
        "summary": \`summary of the tasks results in detail\` 
        //do when you are done with the task
    }

    Once you have enough information to confidently complete the task, respond with the "close" action. Look at previous messages for the information collected earlier and use it to summarize and finish the task.
    Never add placeholders but instead complete the task using the actions provided.

    Data previous AI has collected to complete the task:
    ${otherAIData}
    `

    // Add user's most recent input to history with proper formatting
    if (task && !toolState.history.some(entry => 
        entry.role === "user" && 
        entry.content.some(c => c.type === "text" && c.text === task)
    )) {
        toolState.history.push({
            role: "user", 
            content: [
                {type: "text", text: task}
            ]
        });
    }

    let result = await ai.callAI(prompt, task, toolState.history);

    // Add AI response to history
    toolState.history.push({
        role: "assistant", 
        content: [
            {type: "text", text: JSON.stringify(result)}
        ]
    });

    try {
        let operationResult;
        
        // Pre-validate any paths in the result to catch attempts to access outside dirs
        if (result.path) {
            validateSafePath(result.path);
        }
        if (result.filename) {
            validateSafePath(result.filename);
        }

        if(result.action === "saveToFile"){
            saveToFile(result.content, result.path || '', result.filename, userId);
            operationResult = `File saved: ${result.filename} to path: ${result.path || ''}`;
            
            // Track operation in tool state
            toolState.operations.push({
                action: "saveToFile", 
                path: result.path || '', 
                filename: result.filename
            });
        }else if(result.action === "deleteFile"){
            deleteFile(result.path || '', result.filename, userId);
            operationResult = `File deleted: ${result.filename} from path: ${result.path || ''}`;
            
            // Track operation in tool state
            toolState.operations.push({
                action: "deleteFile", 
                path: result.path || '', 
                filename: result.filename
            });
        }else if(result.action === "createDirectory"){
            createDirectory(result.path || '', userId);
            operationResult = `Directory created: ${result.path || ''}`;
            
            // Track operation in tool state
            toolState.operations.push({
                action: "createDirectory", 
                path: result.path || ''
            });
        }else if(result.action === "deleteDirectory"){
            deleteDirectory(result.path || '', userId);
            operationResult = `Directory deleted: ${result.path || ''}`;
            
            // Track operation in tool state
            toolState.operations.push({
                action: "deleteDirectory", 
                path: result.path || ''
            });
        }else if(result.action === "listFiles"){
            const files = listFiles(result.path || '', userId);
            operationResult = `Files in ${result.path || ''}: ${JSON.stringify(files)}`;
            
            // Track operation in tool state
            toolState.operations.push({
                action: "listFiles", 
                path: result.path || '',
                result: files
            });
            
            // Add operation result to history
            toolState.history.push({
                role: "system", 
                content: [
                    {type: "text", text: operationResult}
                ]
            });
            
            // Save tool state
            contextManager.setToolState('fileSystem', toolState, userId);
            
            // Continue with next step
            return runStep(task, otherAIData, userId).then(() => files);
        }else if(result.action === "listDirectories"){
            const directories = listDirectories(result.path || '', userId);
            operationResult = `Directories in ${result.path || ''}: ${JSON.stringify(directories)}`;
            
            // Track operation in tool state
            toolState.operations.push({
                action: "listDirectories", 
                path: result.path || '',
                result: directories
            });
            
            // Add operation result to history
            toolState.history.push({
                role: "system", 
                content: [
                    {type: "text", text: operationResult}
                ]
            });
            
            // Save tool state
            contextManager.setToolState('fileSystem', toolState, userId);
            
            // Continue with next step
            return runStep(task, otherAIData, userId).then(() => directories);
        }else if(result.action === "readFile"){
            const content = readFile(result.path || '', result.filename, userId);
            operationResult = `File read: ${result.filename} from path: ${result.path || ''}`;
            
            // Track operation in tool state
            toolState.operations.push({
                action: "readFile", 
                path: result.path || '',
                filename: result.filename,
                preview: content.substring(0, 100) + (content.length > 100 ? '...' : '')
            });
            
            // Add operation result to history
            toolState.history.push({
                role: "system", 
                content: [
                    {type: "text", text: operationResult + "\n\nContent:\n" + content}
                ]
            });
            
            // Save tool state
            contextManager.setToolState('fileSystem', toolState, userId);
            
            // Continue with next step
            return runStep(task, otherAIData, userId).then(() => content);
        }else if(result.action === "close"){
            // Limit history size
            if (toolState.history.length > 20) {
                toolState.history = toolState.history.slice(-20);
            }
            
            // Save tool state one last time
            contextManager.setToolState('fileSystem', toolState, userId);
            
            return {summary: result.summary, operations: toolState.operations};
        }else{
            operationResult = `Unknown action: ${result.action}`;
        }

        // Add operation result to history
        toolState.history.push({
            role: "system", 
            content: [
                {type: "text", text: operationResult}
            ]
        });
        
        // Save tool state
        contextManager.setToolState('fileSystem', toolState, userId);
        
        // Continue with next step
        return runStep(task, otherAIData, userId);
    } catch (error) {
        console.error('Error in file operation:', error.message);
        
        // Log security violations
        if (error.message.includes('Security violation')) {
            logSecurityEvent(userId, result?.action || 'unknown', error.message);
        }
        
        // Add error to history
        toolState.history.push({
            role: "system", 
            content: [
                {type: "text", text: `Error: ${error.message}`}
            ]
        });
        
        // Save tool state
        contextManager.setToolState('fileSystem', toolState, userId);
        
        // Continue with next step to let the AI handle the error
        return runStep(task, otherAIData, userId);
    }
}

async function writeFileDirectly(content, userPath, filename, userId = 'default'){
    ensureBaseDirectoryExists(userId);
    // Sanitize filename to prevent directory traversal
    const sanitizedFilename = filename.replace(/[\/\\]/g, '_');
    
    const dirPath = securePath(userPath, userId);
    const filePath = path.join(dirPath, sanitizedFilename);
    
    // Final security check
    validatePath(filePath, getBaseDirectory(userId));
    
    // Create directories if they don't exist
    if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
    }
    
    fs.writeFileSync(filePath, content);
}

async function runTask(task, otherAIData, callback, userId = 'default'){
    // Initialize tool state
    const toolState = contextManager.getToolState('fileSystem', userId) || { 
        history: [], 
        operations: []
    };
    
    // Reset operations for new task
    toolState.operations = [];
    
    // If history is too long, trim it
    if (toolState.history.length > 20) {
        toolState.history = toolState.history.slice(-10);
    }
    
    // Save initial state
    contextManager.setToolState('fileSystem', toolState, userId);
    
    // Ensure user directory exists
    ensureBaseDirectoryExists(userId);
    
    try {
        // Store callback for later use
        const summary = await runStep(task, otherAIData, userId);
        
        if (callback) {
            callback(summary);
        }
        
        return summary;
    } catch (error) {
        console.error("Error in fileSystem tool:", error);
        
        // Log security violations
        if (error.message.includes('Security violation')) {
            logSecurityEvent(userId, 'task_execution', error.message);
        }
        
        if (callback) {
            callback({
                error: error.message,
                success: false
            });
        }
        
        return {
            error: error.message,
            success: false
        };
    }
}

module.exports = {
    runTask,
    // Export these functions for direct use
    saveToFile,
    readFile,
    listFiles,
    listDirectories,
    createDirectory,
    deleteFile,
    deleteDirectory,
    writeFileDirectly
};

