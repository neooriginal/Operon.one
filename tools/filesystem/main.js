const fs = require('fs');
const path = require('path');
const ai = require('../AI/ai');
const contextManager = require('../../utils/context');
const { fileFunctions } = require('../../database');

// Map to store files created inside containers reported by other tools (bash/python)
// Not needed with database storage
// const containerFilesTracked = new Map(); // userId -> Set<containerPath>

// Container management with better error handling
async function getUserId(containerName) {
    // Parse userId from containerName or return 'default'
    return containerName.includes('-') ? containerName.split('-')[2] : 'default';
}

// NEW Function to Track Container Files reported by other tools
async function trackContainerFile(userId, containerPath, chatId = 1) {
    if (!userId || !containerPath) {
        console.error('Invalid userId or containerPath for tracking');
        return false;
    }

    try {
        // Store in database
        await fileFunctions.trackContainerFile(userId, containerPath, null, null, chatId);
        return true;
    } catch (error) {
        console.error('Error tracking container file:', error.message);
        return false;
    }
}

// Modified helper functions to accept containerName and use absolute paths
async function saveToFile(containerName, content, userPath, filename) {
    // Normalize paths for Docker (forward slashes), default path to /app/output
    const normalizedPath = userPath?.replace(/\\/g, '/') || '/app/output';
    const normalizedFilename = filename?.replace(/\\/g, '/') || '';
    const filePath = path.posix.join(normalizedPath, normalizedFilename);
    
    // Ensure the filePath is absolute or treated as such within the container
    if (!path.posix.isAbsolute(filePath)) {
        throw new Error(`File path must be absolute within the container: ${filePath}`);
    }
    
    try {
        // Get userId from containerName (assuming containerName format includes userId)
        const userId = containerName.includes('-') ? containerName.split('-')[2] : 'default';
        const chatId = 1; // Default chatId
        
        // Extract file extension
        const extension = path.extname(normalizedFilename).replace('.', '');
        
        // Save file to database instead of Docker container
        const result = await fileFunctions.saveContainerFileWithContent(
            userId, 
            filePath, 
            content, 
            normalizedFilename, 
            extension, 
            null, 
            chatId
        );
        
        console.log(`File saved to database: ${filePath}`);
        return filePath; // Return the absolute path used
    } catch (error) {
        console.error(`Error saving file to database: ${error.message}`);
        throw error;
    }
}

async function readFile(containerName, userPath, filename) {
    // Normalize paths for Docker (forward slashes), default path to /app/output
    const normalizedPath = userPath?.replace(/\\/g, '/') || '/app/output';
    const normalizedFilename = filename?.replace(/\\/g, '/') || '';
    const filePath = path.posix.join(normalizedPath, normalizedFilename);
    
    // Ensure the filePath is absolute or treated as such within the container
    if (!path.posix.isAbsolute(filePath)) {
        throw new Error(`File path must be absolute within the container: ${filePath}`);
    }
    
    try {
        // Get userId from containerName (assuming containerName format includes userId)
        const userId = containerName.includes('-') ? containerName.split('-')[2] : 'default';
        const chatId = 1; // Default chatId
        
        // Find the container file record first
        const files = await fileFunctions.getTrackedFiles(userId, chatId);
        const containerFile = files.containerFiles.find(file => file.containerPath === filePath);
        
        if (!containerFile) {
            throw new Error(`File not found in database: ${filePath}`);
        }
        
        // Get the file content from database
        const fileContent = await fileFunctions.getFileContent(userId, containerFile.id, 'container', chatId);
        if (!fileContent) {
            throw new Error(`File content not found in database: ${filePath}`);
        }
        
        return fileContent.content;
    } catch (error) {
        console.error(`Error reading file from database: ${error.message}`);
        throw error;
    }
}

async function createDirectory(containerName, userPath) {
    // Normalize path for Docker (forward slashes), default path to /app/output
    const normalizedPath = userPath?.replace(/\\/g, '/') || '/app/output';
    
    // Ensure the path is absolute
    if (!path.posix.isAbsolute(normalizedPath)) {
        throw new Error(`Directory path must be absolute within the container: ${normalizedPath}`);
    }
    
    try {
        // Get userId from containerName (assuming containerName format includes userId)
        const userId = containerName.includes('-') ? containerName.split('-')[2] : 'default';
        const chatId = 1; // Default chatId
        
        // Create directory in database
        await fileFunctions.createDirectory(userId, normalizedPath, chatId);
        return true;
    } catch (error) {
        console.error(`Error creating directory in database: ${error.message}`);
        throw error;
    }
}

async function deleteFile(containerName, userPath, filename) {
    // Normalize paths for Docker (forward slashes), default path to /app/output
    const normalizedPath = userPath?.replace(/\\/g, '/') || '/app/output';
    const normalizedFilename = filename?.replace(/\\/g, '/') || '';
    const filePath = path.posix.join(normalizedPath, normalizedFilename);
    
    // Ensure the filePath is absolute
    if (!path.posix.isAbsolute(filePath)) {
        throw new Error(`File path must be absolute within the container: ${filePath}`);
    }
    
    try {
        // Get userId from containerName
        const userId = containerName.includes('-') ? containerName.split('-')[2] : 'default';
        const chatId = 1; // Default chatId
        
        // Find the file in database
        const files = await fileFunctions.getTrackedFiles(userId, chatId);
        const fileToDelete = files.containerFiles.find(file => file.containerPath === filePath);
        
        if (!fileToDelete) {
            // If file not found, consider it already deleted
            return true;
        }
        
        // Delete the file and its content
        await fileFunctions.deleteTrackedFiles(userId, [fileToDelete.id], 'container');
        return true;
    } catch (error) {
        console.error(`Error deleting file from database: ${error.message}`);
        throw error;
    }
}

async function deleteDirectory(containerName, userPath) {
    // Normalize path for Docker (forward slashes), default path to /app/output
    const normalizedPath = userPath?.replace(/\\/g, '/') || '/app/output';
    
    // Ensure the path is absolute
    if (!path.posix.isAbsolute(normalizedPath)) {
        throw new Error(`Directory path must be absolute within the container: ${normalizedPath}`);
    }
    
    try {
        // Get userId from containerName
        const userId = containerName.includes('-') ? containerName.split('-')[2] : 'default';
        const chatId = 1; // Default chatId
        
        // Delete directory from database
        await fileFunctions.deleteDirectory(userId, normalizedPath, chatId);
        return true;
    } catch (error) {
        console.error(`Error deleting directory from database: ${error.message}`);
        throw error;
    }
}

async function listFiles(containerName, userPath) {
    // Normalize path for Docker (forward slashes), default path to /app/output
    const normalizedPath = userPath?.replace(/\\/g, '/') || '/app/output';
    
    // Ensure the path is absolute
    if (!path.posix.isAbsolute(normalizedPath)) {
        throw new Error(`Directory path must be absolute within the container: ${normalizedPath}`);
    }
    
    try {
        // Get userId from containerName
        const userId = containerName.includes('-') ? containerName.split('-')[2] : 'default';
        const chatId = 1; // Default chatId
        
        // List files from database
        const files = await fileFunctions.listFilesInDirectory(userId, normalizedPath, chatId);
        return files;
    } catch (error) {
        console.error(`Error listing files from database: ${error.message}`);
        throw error;
    }
}

async function listDirectories(containerName, userPath) {
    // Normalize path for Docker (forward slashes), default path to /app/output
    const normalizedPath = userPath?.replace(/\\/g, '/') || '/app/output';
    
    // Ensure the path is absolute
    if (!path.posix.isAbsolute(normalizedPath)) {
        throw new Error(`Directory path must be absolute within the container: ${normalizedPath}`);
    }
    
    try {
        // Get userId from containerName
        const userId = containerName.includes('-') ? containerName.split('-')[2] : 'default';
        const chatId = 1; // Default chatId
        
        // List directories from database
        const directories = await fileFunctions.listDirectoriesInDirectory(userId, normalizedPath, chatId);
        return directories;
    } catch (error) {
        console.error(`Error listing directories from database: ${error.message}`);
        throw error;
    }
}

// Modified runStep to accept containerName, remove path validation, and track written files
async function runStep(containerName, task, otherAIData, userId = 'default', chatId = 1) {
    const toolState = contextManager.getToolState('fileSystem', userId) || {
        history: [],
        operations: [],
        writtenFiles: [] // Initialize writtenFiles array
    };

    let prompt = `
    You are an AI agent that can execute complex tasks. You are meant to control the filesystem inside a Docker container.
    Do your best to complete the task provided by the user. You can operate anywhere in the filesystem. Use absolute paths (e.g., /app/data/file.txt, /tmp/output.log). If no path is specified, operations will default to /app/output.
    
    Respond in a JSON format with the following format. Only respond with one at a time:
    {
        "action": "saveToFile",
        "content": "content to save",
        "path": "/path/to/save/to", // Optional, defaults to /app/output
        "filename": "filename.ext"
    },
    {
        "action": "deleteFile",
        "path": "/path/to/delete/from", // Optional, defaults to /app/output
        "filename": "filename.ext"
    },
    {
        "action": "createDirectory",
        "path": "/path/to/create" // Required absolute path
    },
    {
        "action": "deleteDirectory",
        "path": "/path/to/delete" // Required absolute path
    },
    {
        "action": "listFiles",
        "path": "/path/to/list/from" // Optional, defaults to /app/output
    },
    {
        "action": "listDirectories",
        "path": "/path/to/list/from" // Optional, defaults to /app/output
    },
    {
        "action": "readFile",
        "path": "/path/to/read/from", // Optional, defaults to /app/output
        "filename": "filename.ext"
    },
    {
        "action": "close",
        "summary": \`summary of the tasks results in detail\` 
        //do when you are done with the task
    }

    Once you have enough information to confidently complete the task, respond with the "close" action. Look at previous messages for the information collected earlier and use it to summarize and finish the task.
    Never add placeholders but instead complete the task using the actions provided. Use absolute paths.

    Data previous AI has collected to complete the task:
    ${otherAIData}
    `;

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
        
        // Removed path validation calls (validateSafePath)

        if(result.action === "saveToFile"){
            // Ensure filename is provided
            if (!result.filename) {
                throw new Error("Filename must be provided for saveToFile action.");
            }
            const absoluteFilePath = await saveToFile(containerName, result.content, result.path, result.filename);
            operationResult = `File saved: ${absoluteFilePath}`;
            
            // Track operation and written file path
            toolState.operations.push({
                action: "saveToFile", 
                path: absoluteFilePath // Log the absolute path used
            });
            toolState.writtenFiles.push(absoluteFilePath); // Add to written files list
            
            // Track container file in database
            try {
                await fileFunctions.trackContainerFile(userId, absoluteFilePath, null, null, chatId);
            } catch (trackingError) {
                console.warn(`Failed to track container file ${absoluteFilePath}: ${trackingError.message}`);
            }
            
        } else if(result.action === "deleteFile"){
            if (!result.filename) {
                throw new Error("Filename must be provided for deleteFile action.");
            }
            await deleteFile(containerName, result.path, result.filename);
            const normalizedPath = result.path?.replace(/\\/g, '/') || '/app/output';
            const normalizedFilename = result.filename?.replace(/\\/g, '/');
            const absoluteFilePath = path.posix.join(normalizedPath, normalizedFilename);
            operationResult = `File deleted: ${absoluteFilePath}`;
            
            // Track operation
            toolState.operations.push({
                action: "deleteFile", 
                path: absoluteFilePath
            });
            // Optionally remove from writtenFiles if needed, but deletion tracking might be sufficient
            // toolState.writtenFiles = toolState.writtenFiles.filter(p => p !== absoluteFilePath);

        } else if(result.action === "createDirectory"){
            if (!result.path) {
                 throw new Error("Path must be provided for createDirectory action.");
            }
            await createDirectory(containerName, result.path);
            operationResult = `Directory created: ${result.path}`;
            
            // Track operation
            toolState.operations.push({
                action: "createDirectory", 
                path: result.path
            });
        } else if(result.action === "deleteDirectory"){
             if (!result.path) {
                 throw new Error("Path must be provided for deleteDirectory action.");
            }
            await deleteDirectory(containerName, result.path);
            operationResult = `Directory deleted: ${result.path}`;
            
            // Track operation
            toolState.operations.push({
                action: "deleteDirectory", 
                path: result.path
            });
        } else if(result.action === "listFiles"){
            const files = await listFiles(containerName, result.path);
            const listPath = result.path?.replace(/\\/g, '/') || '/app/output';
            operationResult = `Files in ${listPath}: ${JSON.stringify(files)}`;
            
            // Track operation
            toolState.operations.push({
                action: "listFiles", 
                path: listPath,
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
            return runStep(containerName, task, otherAIData, userId, chatId).then(() => files); // Pass containerName

        } else if(result.action === "listDirectories"){
            const directories = await listDirectories(containerName, result.path);
            const listPath = result.path?.replace(/\\/g, '/') || '/app/output';
            operationResult = `Directories in ${listPath}: ${JSON.stringify(directories)}`;
            
            // Track operation
            toolState.operations.push({
                action: "listDirectories", 
                path: listPath,
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
            return runStep(containerName, task, otherAIData, userId, chatId).then(() => directories); // Pass containerName

        } else if(result.action === "readFile"){
            if (!result.filename) {
                throw new Error("Filename must be provided for readFile action.");
            }
            const content = await readFile(containerName, result.path, result.filename);
            const normalizedPath = result.path?.replace(/\\/g, '/') || '/app/output';
            const normalizedFilename = result.filename?.replace(/\\/g, '/');
            const absoluteFilePath = path.posix.join(normalizedPath, normalizedFilename);
            operationResult = `File read: ${absoluteFilePath}`;
            
            // Track operation
            toolState.operations.push({
                action: "readFile", 
                path: absoluteFilePath,
                preview: content.substring(0, 100) + (content.length > 100 ? '...' : '')
            });
            
            // Add operation result to history
            toolState.history.push({
                role: "system", 
                content: [
                    {type: "text", text: operationResult + "\\n\\nContent:\\n" + content}
                ]
            });
            
            // Save tool state
            contextManager.setToolState('fileSystem', toolState, userId);
            
            // Continue with next step
            return runStep(containerName, task, otherAIData, userId, chatId).then(() => content); // Pass containerName

        } else if(result.action === "close"){
            // Limit history size
            if (toolState.history.length > 20) {
                toolState.history = toolState.history.slice(-20);
            }
            
            // Ensure writtenFiles are unique before saving
            toolState.writtenFiles = [...new Set(toolState.writtenFiles || [])];

            // Save tool state one last time
            contextManager.setToolState('fileSystem', toolState, userId);
            
            return {summary: result.summary, operations: toolState.operations};
        } else {
            operationResult = `Unknown action: ${result.action}`;
        }

        // Add operation result to history
        toolState.history.push({
            role: "system", 
            content: [
                {type: "text", text: operationResult}
            ]
        });
        
        // Ensure writtenFiles are unique
        toolState.writtenFiles = [...new Set(toolState.writtenFiles || [])];

        // Save tool state
        contextManager.setToolState('fileSystem', toolState, userId);
        
        // Continue with next step
        return runStep(containerName, task, otherAIData, userId, chatId); // Pass containerName
    } catch (error) {
        console.error('Error in file operation:', error.message);
        
        // Removed security logging related to path validation

        // Add error to history
        toolState.history.push({
            role: "system", 
            content: [
                {type: "text", text: `Error: ${error.message}`}
            ]
        });
        
         // Ensure writtenFiles are unique even on error
        toolState.writtenFiles = [...new Set(toolState.writtenFiles || [])];
        
        // Save tool state
        contextManager.setToolState('fileSystem', toolState, userId);
        
        // Continue with next step to let the AI handle the error
        return runStep(containerName, task, otherAIData, userId, chatId); // Pass containerName
    }
}

// Modified writeFileDirectly to align with new saveToFile signature
async function writeFileDirectly(content, userPath, filename, userId = 'default', chatId = 1) {
    try {
        // Normalize paths for consistent storage
        const normalizedPath = userPath?.replace(/\\/g, '/') || '/app/output';
        const normalizedFilename = filename?.replace(/\\/g, '/') || '';
        const filePath = path.posix.join(normalizedPath, normalizedFilename);
        
        // Ensure path is absolute
        if (!path.posix.isAbsolute(filePath)) {
            throw new Error(`File path must be absolute: ${filePath}`);
        }
        
        // Extract file extension
        const extension = path.extname(normalizedFilename).replace('.', '');
        
        // Save directly to database
        const result = await fileFunctions.saveContainerFileWithContent(
            userId, 
            filePath, 
            content, 
            normalizedFilename, 
            extension, 
            null, 
            chatId
        );
        
        // Update tool state
        const toolState = contextManager.getToolState('fileSystem', userId) || {
            history: [],
            operations: [],
            writtenFiles: []
        };
        toolState.writtenFiles.push(filePath);
        toolState.writtenFiles = [...new Set(toolState.writtenFiles || [])];
        contextManager.setToolState('fileSystem', toolState, userId);
        
        return filePath;
    } catch (error) {
        console.error(`Error in writeFileDirectly: ${error.message}`);
        throw error;
    }
}

// Modified runTask to manage container lifecycle and pass containerName to runStep
async function runTask(task, otherAIData, callback, userId = 'default', chatId = 1) {
    try {
        // Create a pseudo container name for compatibility with existing code
        const containerName = `pseudo-container-${Date.now()}-${userId}`;
        
        // Pass the containerName to runStep
        const result = await runStep(containerName, task, otherAIData, userId, chatId);
        
        if (callback) {
            callback(result);
        }
        
        return result;
    } catch (error) {
        console.error(`Error in filesystem task: ${error.message}`);
        
        const errorResult = { 
            error: error.message, 
            success: false 
        };
        
        if (callback) {
            callback(errorResult);
        }
        
        return errorResult;
    }
}

/**
 * Track a written file for a specific user.
 * This function adds the file to the tracking list for the user.
 */
async function trackFile(userId, filePath, chatId = 1) {
    if (!userId || !filePath) {
        console.error('Invalid userId or filePath for tracking');
        return false;
    }

    try {
        // Store in database instead of in-memory
        await fileFunctions.trackHostFile(userId, filePath, null, null, chatId);
        return true;
    } catch (error) {
        console.error('Error tracking file:', error.message);
        return false;
    }
}

/**
 * Get all written files for a specific user.
 * Returns an object with hostFiles and containerFiles arrays.
 */
async function getWrittenFiles(userId = 'default', chatId = 1) {
    try {
        // Get tracked files from database
        const trackedFiles = await fileFunctions.getTrackedFiles(userId, chatId);
        
        // Format the data for compatibility with existing code
        return {
            hostFiles: trackedFiles.hostFiles.map(file => ({
                fileName: file.originalName || path.basename(file.filePath),
                path: file.filePath
            })),
            containerFiles: trackedFiles.containerFiles.map(file => ({
                fileName: file.originalName || path.basename(file.containerPath),
                path: file.containerPath
            }))
        };
    } catch (error) {
        console.error('Error getting tracked files:', error.message);
        return { hostFiles: [], containerFiles: [] };
    }
}

module.exports = {
    // Remove Docker-specific functions
    runStep,
    writeFileDirectly,
    runTask,
    getWrittenFiles,
    trackFile,
    trackContainerFile,
    // These functions now work with the database, not Docker
    saveToFile,
    readFile,
    createDirectory,
    deleteFile,
    deleteDirectory,
    listFiles,
    listDirectories
};

