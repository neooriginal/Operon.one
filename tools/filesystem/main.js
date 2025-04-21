const docker = require('../docker');
const fs = require('fs');
const path = require('path');
const ai = require('../AI/ai');
const contextManager = require('../../utils/context');
const { fileFunctions } = require('../../database');

// Map to store files created inside containers reported by other tools (bash/python)
const containerFilesTracked = new Map(); // userId -> Set<containerPath>

// Container management with better error handling
async function getContainer(userId = 'default', retries = 3) {
    let lastError;
    
    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            const containerName = await docker.createContainer(userId);
            return containerName;
        } catch (error) {
            lastError = error;
            console.warn(`Failed to get container (attempt ${attempt}/${retries}): ${error.message}`);
            
            // Wait before retrying (exponential backoff)
            if (attempt < retries) {
                const delay = Math.min(100 * Math.pow(2, attempt), 2000);
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
    }
    
    throw new Error(`Failed to get container after ${retries} attempts: ${lastError?.message || 'Unknown error'}`);
}

// NEW Function to Track Container Files with content
async function trackContainerFile(userId, containerPath, chatId = 1) {
    if (!userId || !containerPath) {
        console.error('Invalid userId or containerPath for tracking');
        return false;
    }

    try {
        // Get a container instance to read the file (since the original might be deleted)
        const tempContainer = await getContainer(userId);
        
        try {
            // Read the file content from container
            const fileContent = await docker.readFile(tempContainer, containerPath);
            
            // Get file extension
            const fileExtension = path.extname(containerPath).replace('.', '');
            
            // Extract filename from path
            const fileName = path.basename(containerPath);
            
            // Store in database with content and extension
            await fileFunctions.trackContainerFile(userId, containerPath, fileName, null, chatId, fileContent, fileExtension);
            
            return true;
        } catch (readError) {
            console.error(`Error reading container file for tracking: ${readError.message}`);
            // Still track the file even if content can't be read
            await fileFunctions.trackContainerFile(userId, containerPath, null, null, chatId);
            return false;
        } finally {
            // Clean up the temporary container
            try {
                await docker.removeContainer(tempContainer);
            } catch (cleanupError) {
                console.error(`Error cleaning up temporary container: ${cleanupError.message}`);
            }
        }
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
    
    await docker.writeFile(containerName, filePath, content);
    return filePath; // Return the absolute path used
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
    
    return await docker.readFile(containerName, filePath);
}

async function createDirectory(containerName, userPath) {
    // Normalize path for Docker (forward slashes), default path to /app/output
    const normalizedPath = userPath?.replace(/\\/g, '/') || '/app/output';
    
    // Ensure the path is absolute
    if (!path.posix.isAbsolute(normalizedPath)) {
        throw new Error(`Directory path must be absolute within the container: ${normalizedPath}`);
    }
    
    await docker.executeCommand(containerName, `mkdir -p ${normalizedPath}`);
    return true;
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
    
    await docker.executeCommand(containerName, `rm -f ${filePath}`);
    return true;
}

async function deleteDirectory(containerName, userPath) {
    // Normalize path for Docker (forward slashes), default path to /app/output
    const normalizedPath = userPath?.replace(/\\/g, '/') || '/app/output';
    
    // Ensure the path is absolute
    if (!path.posix.isAbsolute(normalizedPath)) {
        throw new Error(`Directory path must be absolute within the container: ${normalizedPath}`);
    }
    
    await docker.executeCommand(containerName, `rm -rf ${normalizedPath}`);
    return true;
}

async function listFiles(containerName, userPath) {
    // Normalize path for Docker (forward slashes), default path to /app/output
    const normalizedPath = userPath?.replace(/\\/g, '/') || '/app/output';
    
    // Ensure the path is absolute
    if (!path.posix.isAbsolute(normalizedPath)) {
        throw new Error(`Directory path must be absolute within the container: ${normalizedPath}`);
    }
    
    // Use find with -maxdepth 1 to list only files in the target directory
    const { stdout } = await docker.executeCommand(containerName, `find ${normalizedPath} -maxdepth 1 -type f -printf "%f\\n"`);
    return stdout.split('\\n').filter(Boolean);
}

async function listDirectories(containerName, userPath) {
    // Normalize path for Docker (forward slashes), default path to /app/output
    const normalizedPath = userPath?.replace(/\\/g, '/') || '/app/output';
    
    // Ensure the path is absolute
    if (!path.posix.isAbsolute(normalizedPath)) {
        throw new Error(`Directory path must be absolute within the container: ${normalizedPath}`);
    }
    
    // Use find with -maxdepth 1 to list only directories in the target directory
    // Exclude the directory itself ('.')
    const { stdout } = await docker.executeCommand(containerName, `find ${normalizedPath} -maxdepth 1 -type d -not -path "${normalizedPath}" -printf "%f\\n"`);
    return stdout.split('\\n').filter(Boolean);
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
            
            // Extract file extension
            const fileExtension = path.extname(result.filename).replace('.', '');
            
            // Track container file in database with content
            try {
                await fileFunctions.trackContainerFile(userId, absoluteFilePath, result.filename, null, chatId, result.content, fileExtension);
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

// Modified writeFileDirectly to store content directly in database
async function writeFileDirectly(content, userPath, filename, userId = 'default', chatId = 1) {
    let containerName = null;
    try {
        containerName = await getContainer(userId); // Get container for this specific operation
        const absoluteFilePath = await saveToFile(containerName, content, userPath, filename);

        // Update tool state if necessary
        const toolState = contextManager.getToolState('fileSystem', userId) || {
            history: [],
            operations: [],
            writtenFiles: []
        };
        toolState.writtenFiles.push(absoluteFilePath);
        toolState.writtenFiles = [...new Set(toolState.writtenFiles || [])];
        contextManager.setToolState('fileSystem', toolState, userId);
        
        // Extract file extension
        const fileExtension = path.extname(filename).replace('.', '');
        
        // Track file in database with content
        try {
            await fileFunctions.trackContainerFile(userId, absoluteFilePath, filename, null, chatId, content, fileExtension);
        } catch (trackingError) {
            console.warn(`Failed to track container file ${absoluteFilePath}: ${trackingError.message}`);
        }

        return absoluteFilePath; // Return path

    } finally {
        // Clean up the container used for this operation
        if (containerName) {
            try {
                await docker.removeContainer(containerName);
            } catch (cleanupError) {
                console.error(`Error during container cleanup: ${cleanupError.message}`);
            }
        }
    }
}

// Modified runTask to manage container lifecycle and pass containerName to runStep
async function runTask(task, otherAIData, callback, userId = 'default', chatId = 1) {
    let containerName = null;
    
    try {
        // Start by checking Docker availability
        if (!await docker.checkDockerAvailability()) {
            throw new Error('Docker is not available or not running');
        }
        
        // Get a container for the duration of this task
        containerName = await getContainer(userId);
        
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
    } finally {
        // Clean up the container used for this task ONLY if it was created
        if (containerName) {
            try {
                 // We should remove the specific container used for the task
                 await docker.removeContainer(containerName);
                 // Let's keep the cleanupAllContainers call in index.js as a final safety net
                 // await docker.cleanupAllContainers(); // Removed this redundant call
            } catch (cleanupError) {
                console.error(`Error during container cleanup: ${cleanupError.message}`);
            }
        }
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
    // Keep direct helpers if they are needed elsewhere, but ensure they get containerName
    // saveToFile, // These might become internal if only runStep uses them
    // readFile,
    // createDirectory,
    // deleteFile,
    // deleteDirectory,
    // listFiles,
    // listDirectories,
    runStep, // Keep if needed externally, but runTask is the main entry point
    writeFileDirectly, // Keep this exported function
    runTask,
    getWrittenFiles, // Export the new function
    trackFile,
    trackContainerFile // Ensure this is exported
};

