const docker = require('../docker');
const fs = require('fs');
const path = require('path');
const ai = require('../AI/ai');
const contextManager = require('../../utils/context');
const { fileFunctions } = require('../../database');


const containerFilesTracked = new Map(); 

// Sidebar management
function updateSidebarInfo(userId, currentFile, workingDirectory) {
    if (typeof global.updateSidebar === 'function') {
        const recentFiles = getRecentFiles(userId);
        global.updateSidebar(userId, 'filesystem', {
            currentFile,
            workingDirectory,
            recentFiles,
            timestamp: Date.now()
        });
    }
}

function getRecentFiles(userId) {
    const userFiles = Array.from(containerFilesTracked.values())
        .filter(file => file.userId === userId)
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
        .slice(0, 5)
        .map(file => file.path);
    return userFiles;
}


async function getContainer(userId = 'default', retries = 3) {
    let lastError;
    
    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            const containerName = await docker.createContainer(userId);
            return containerName;
        } catch (error) {
            lastError = error;
            console.warn(`Failed to get container (attempt ${attempt}/${retries}): ${error.message}`);
            
            
            if (attempt < retries) {
                const delay = Math.min(100 * Math.pow(2, attempt), 2000);
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
    }
    
    throw new Error(`Failed to get container after ${retries} attempts: ${lastError?.message || 'Unknown error'}`);
}


async function trackContainerFile(userId, containerPath, chatId = 1) {
    if (!userId || !containerPath) {
        console.error('Invalid userId or containerPath for tracking');
        return false;
    }

    try {
        
        const tempContainer = await getContainer(userId);
        
        try {
            
            const fileContent = await docker.readFile(tempContainer, containerPath);
            
            
            const fileExtension = path.extname(containerPath).replace('.', '');
            
            
            const fileName = path.basename(containerPath);
            
            
            await fileFunctions.trackContainerFile(userId, containerPath, fileName, null, chatId, fileContent, fileExtension);
            
            return true;
        } catch (readError) {
            console.error(`Error reading container file for tracking: ${readError.message}`);
            
            const fileName = path.basename(containerPath);
            const fileExtension = path.extname(containerPath).replace('.', '');
            await fileFunctions.trackContainerFile(userId, containerPath, fileName, null, chatId, null, fileExtension);
            return false;
        } finally {
            
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


async function saveToFile(containerName, content, userPath, filename, userId = 'default') {
    
    const normalizedPath = userPath?.replace(/\\/g, '/') || '/app/output';
    const normalizedFilename = filename?.replace(/\\/g, '/') || '';
    const filePath = path.posix.join(normalizedPath, normalizedFilename);
    
    
    if (!path.posix.isAbsolute(filePath)) {
        throw new Error(`File path must be absolute within the container: ${filePath}`);
    }
    
    await docker.writeFile(containerName, filePath, content);
    
    // Update sidebar with current file information
    updateSidebarInfo(userId, filePath, normalizedPath);
    
    return filePath; 
}

async function readFile(containerName, userPath, filename) {
    
    const normalizedPath = userPath?.replace(/\\/g, '/') || '/app/output';
    const normalizedFilename = filename?.replace(/\\/g, '/') || '';
    const filePath = path.posix.join(normalizedPath, normalizedFilename);
    
    
    if (!path.posix.isAbsolute(filePath)) {
        throw new Error(`File path must be absolute within the container: ${filePath}`);
    }
    
    return await docker.readFile(containerName, filePath);
}

async function createDirectory(containerName, userPath) {
    
    const normalizedPath = userPath?.replace(/\\/g, '/') || '/app/output';
    
    
    if (!path.posix.isAbsolute(normalizedPath)) {
        throw new Error(`Directory path must be absolute within the container: ${normalizedPath}`);
    }
    
    await docker.executeCommand(containerName, `mkdir -p ${normalizedPath}`);
    return true;
}

async function deleteFile(containerName, userPath, filename) {
    
    const normalizedPath = userPath?.replace(/\\/g, '/') || '/app/output';
    const normalizedFilename = filename?.replace(/\\/g, '/') || '';
    const filePath = path.posix.join(normalizedPath, normalizedFilename);
    
    
    if (!path.posix.isAbsolute(filePath)) {
        throw new Error(`File path must be absolute within the container: ${filePath}`);
    }
    
    await docker.executeCommand(containerName, `rm -f ${filePath}`);
    return true;
}

async function deleteDirectory(containerName, userPath) {
    
    const normalizedPath = userPath?.replace(/\\/g, '/') || '/app/output';
    
    
    if (!path.posix.isAbsolute(normalizedPath)) {
        throw new Error(`Directory path must be absolute within the container: ${normalizedPath}`);
    }
    
    await docker.executeCommand(containerName, `rm -rf ${normalizedPath}`);
    return true;
}

async function listFiles(containerName, userPath) {
    
    const normalizedPath = userPath?.replace(/\\/g, '/') || '/app/output';
    
    
    if (!path.posix.isAbsolute(normalizedPath)) {
        throw new Error(`Directory path must be absolute within the container: ${normalizedPath}`);
    }
    
    
    const { stdout } = await docker.executeCommand(containerName, `find ${normalizedPath} -maxdepth 1 -type f -printf "%f\\n"`);
    return stdout.split('\\n').filter(Boolean);
}

async function listDirectories(containerName, userPath) {
    
    const normalizedPath = userPath?.replace(/\\/g, '\/') || '/app/output';
    
    
    if (!path.posix.isAbsolute(normalizedPath)) {
        throw new Error(`Directory path must be absolute within the container: ${normalizedPath}`);
    }
    
    
    
    const command = `mkdir -p ${normalizedPath} && find ${normalizedPath} -maxdepth 1 -type d -not -path "${normalizedPath}" -printf "%f\\n"`;
    const { stdout } = await docker.executeCommand(containerName, command);
    return stdout.split('\\n').filter(Boolean);
}


async function runStep(containerName, task, otherAIData, userId = 'default', chatId = 1) {
    const toolState = contextManager.getToolState('fileSystem', userId) || {
        history: [],
        operations: [],
        writtenFiles: [] 
    };

    let prompt = `
    You are an AI agent that can execute complex tasks. You are meant to control the filesystem inside a Docker container.
    Do your best to complete the task provided by the user. You can operate anywhere in the filesystem. Use absolute paths (e.g., /app/data/file.txt, /tmp/output.log). If no path is specified, operations will default to /app/output.
    
    Respond in a JSON format with the following format. Only respond with one at a time:
    {
        "action": "saveToFile",
        "content": "content to save",
        "path": "/path/to/save/to", 
        "filename": "filename.ext"
    },
    {
        "action": "deleteFile",
        "path": "/path/to/delete/from", 
        "filename": "filename.ext"
    },
    {
        "action": "createDirectory",
        "path": "/path/to/create" 
    },
    {
        "action": "deleteDirectory",
        "path": "/path/to/delete" 
    },
    {
        "action": "listFiles",
        "path": "/path/to/list/from" 
    },
    {
        "action": "listDirectories",
        "path": "/path/to/list/from" 
    },
    {
        "action": "readFile",
        "path": "/path/to/read/from", 
        "filename": "filename.ext"
    },
    {
        "action": "close",
        "summary": \`summary of the tasks results in detail\` 
        
    }

    Once you have enough information to confidently complete the task, respond with the "close" action. Look at previous messages for the information collected earlier and use it to summarize and finish the task.
    Never add placeholders but instead complete the task using the actions provided. Use absolute paths.

    Data previous AI has collected to complete the task:
    ${otherAIData}
    `;

    
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

    
    toolState.history.push({
        role: "assistant", 
        content: [
            {type: "text", text: JSON.stringify(result)}
        ]
    });

    try {
        let operationResult;
        
        

        if(result.action === "saveToFile"){
            
            if (!result.filename) {
                throw new Error("Filename must be provided for saveToFile action.");
            }
            const absoluteFilePath = await saveToFile(containerName, result.content, result.path, result.filename, userId);
            operationResult = `File saved: ${absoluteFilePath}`;
            
            
            toolState.operations.push({
                action: "saveToFile", 
                path: absoluteFilePath 
            });
            toolState.writtenFiles.push(absoluteFilePath); 
            
            
            const fileExtension = path.extname(result.filename).replace('.', '');
            
            
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
            
            
            toolState.operations.push({
                action: "deleteFile", 
                path: absoluteFilePath
            });
            
            

        } else if(result.action === "createDirectory"){
            if (!result.path) {
                 throw new Error("Path must be provided for createDirectory action.");
            }
            await createDirectory(containerName, result.path);
            operationResult = `Directory created: ${result.path}`;
            
            
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
            
            
            toolState.operations.push({
                action: "deleteDirectory", 
                path: result.path
            });
        } else if(result.action === "listFiles"){
            const files = await listFiles(containerName, result.path);
            const listPath = result.path?.replace(/\\/g, '/') || '/app/output';
            operationResult = `Files in ${listPath}: ${JSON.stringify(files)}`;
            
            
            toolState.operations.push({
                action: "listFiles", 
                path: listPath,
                result: files
            });
            
            
            toolState.history.push({
                role: "system", 
                content: [
                    {type: "text", text: operationResult}
                ]
            });
            
            
            contextManager.setToolState('fileSystem', toolState, userId);
            
            
            return runStep(containerName, task, otherAIData, userId, chatId).then(() => files); 

        } else if(result.action === "listDirectories"){
            const directories = await listDirectories(containerName, result.path);
            const listPath = result.path?.replace(/\\/g, '/') || '/app/output';
            operationResult = `Directories in ${listPath}: ${JSON.stringify(directories)}`;
            
            
            toolState.operations.push({
                action: "listDirectories", 
                path: listPath,
                result: directories
            });
            
            
            toolState.history.push({
                role: "system", 
                content: [
                    {type: "text", text: operationResult}
                ]
            });
            
            
            contextManager.setToolState('fileSystem', toolState, userId);
            
            
            return runStep(containerName, task, otherAIData, userId, chatId).then(() => directories); 

        } else if(result.action === "readFile"){
            if (!result.filename) {
                throw new Error("Filename must be provided for readFile action.");
            }
            const content = await readFile(containerName, result.path, result.filename);
            const normalizedPath = result.path?.replace(/\\/g, '/') || '/app/output';
            const normalizedFilename = result.filename?.replace(/\\/g, '/');
            const absoluteFilePath = path.posix.join(normalizedPath, normalizedFilename);
            operationResult = `File read: ${absoluteFilePath}`;
            
            // Update sidebar
            updateSidebarInfo(userId, absoluteFilePath, normalizedPath);
            
            
            toolState.operations.push({
                action: "readFile", 
                path: absoluteFilePath,
                preview: content.substring(0, 100) + (content.length > 100 ? '...' : '')
            });
            
            
            toolState.history.push({
                role: "system", 
                content: [
                    {type: "text", text: operationResult + "\\n\\nContent:\\n" + content}
                ]
            });
            
            
            contextManager.setToolState('fileSystem', toolState, userId);
            
            
            return runStep(containerName, task, otherAIData, userId, chatId).then(() => content); 

        } else if(result.action === "close"){
            
            if (toolState.history.length > 20) {
                toolState.history = toolState.history.slice(-20);
            }
            
            
            toolState.writtenFiles = [...new Set(toolState.writtenFiles || [])];

            
            contextManager.setToolState('fileSystem', toolState, userId);
            
            return {summary: result.summary, operations: toolState.operations};
        } else {
            operationResult = `Unknown action: ${result.action}`;
        }

        
        toolState.history.push({
            role: "system", 
            content: [
                {type: "text", text: operationResult}
            ]
        });
        
        
        toolState.writtenFiles = [...new Set(toolState.writtenFiles || [])];

        
        contextManager.setToolState('fileSystem', toolState, userId);
        
        
        return runStep(containerName, task, otherAIData, userId, chatId); 
    } catch (error) {
        console.error('Error in file operation:', error.message);
        
        

        
        toolState.history.push({
            role: "system", 
            content: [
                {type: "text", text: `Error: ${error.message}`}
            ]
        });
        
         
        toolState.writtenFiles = [...new Set(toolState.writtenFiles || [])];
        
        
        contextManager.setToolState('fileSystem', toolState, userId);
        
        
        return runStep(containerName, task, otherAIData, userId, chatId); 
    }
}


async function writeFileDirectly(content, userPath, filename, userId = 'default', chatId = 1) {
    try {
        
        const { sanitizeFilePath } = require('../../index');
        
        
        const baseDir = userPath || 'output';
        
        
        const sanitizedFullPath = sanitizeFilePath(path.join(baseDir, filename), userId);
        
        
        const dir = path.dirname(sanitizedFullPath);
        
        
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        
        
        fs.writeFileSync(sanitizedFullPath, content);
        
        
        const fileExtension = path.extname(sanitizedFullPath).replace('.', '');
        await fileFunctions.trackHostFile(userId, sanitizedFullPath, filename, null, chatId, content, fileExtension);
        
        
        const toolState = contextManager.getToolState('fileSystem', userId) || {
            history: [],
            operations: [],
            writtenFiles: []
        };
        
        toolState.writtenFiles.push({
            path: sanitizedFullPath,
            fileName: filename,
            content: content
        });
        
        contextManager.setToolState('fileSystem', toolState, userId);
        
        return {
            success: true,
            message: `File written successfully`,
            filePath: sanitizedFullPath,
            content: content
        };
    } catch (error) {
        console.error('Error writing file directly:', error);
        return {
            success: false,
            error: `Error writing file: ${error.message}`
        };
    }
}


async function runTask(task, otherAIData, callback, userId = 'default', chatId = 1) {
    let containerName = null;
    
    try {
        
        if (!await docker.checkDockerAvailability()) {
            throw new Error('Docker is not available or not running');
        }
        
        
        containerName = await getContainer(userId);
        
        
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
        
        if (containerName) {
            try {
                 
                 await docker.removeContainer(containerName);
                 
                 
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
        
        let fileData;
        try {
            fileData = await fileFunctions.getTrackedFiles(userId, chatId);
        } catch (dbError) {
            console.error(`Database error retrieving tracked files: ${dbError.message}`);
            fileData = { hostFiles: [], containerFiles: [] };
        }
        
        
        const toolState = contextManager.getToolState('fileSystem', userId) || {};
        
        
        const hostFiles = fileData.hostFiles.map(file => {
            
            if (!file.fileContent && fs.existsSync(file.filePath)) {
                try {
                    file.fileContent = fs.readFileSync(file.filePath, 'utf8');
                } catch (readError) {
                    console.warn(`Could not read host file ${file.filePath}: ${readError.message}`);
                }
            }
            
            return {
                id: file.id,
                path: file.filePath,
                fileName: file.originalName || path.basename(file.filePath),
                content: file.fileContent || null
            };
        });
        
        
        const writtenFiles = toolState.writtenFiles || [];
        for (const file of writtenFiles) {
            if (typeof file === 'object' && file.path) {
                
                const exists = hostFiles.some(hostFile => hostFile.path === file.path);
                if (!exists) {
                    hostFiles.push({
                        id: `temp_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
                        path: file.path,
                        fileName: file.fileName || path.basename(file.path),
                        content: file.content || null
                    });
                }
            }
        }
        
        
        return {
            hostFiles,
            containerFiles: fileData.containerFiles || []
        };
    } catch (error) {
        console.error(`Error in getWrittenFiles: ${error.message}`);
        return { hostFiles: [], containerFiles: [] };
    }
}

module.exports = {
    
    
    
    
    
    
    
    
    runStep, 
    writeFileDirectly, 
    runTask,
    getWrittenFiles, 
    trackFile,
    trackContainerFile 
};

