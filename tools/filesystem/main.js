const fs = require('fs');
const path = require('path');

const ai = require('../AI/ai');
let history = [];
let summaryCallback = null;

function getBaseDirectory() {
    const applicationBaseDir = path.join(__dirname, '..', '..');
    return path.join(applicationBaseDir, 'output');
}

// Ensure the base directory exists
function ensureBaseDirectoryExists() {
    const baseDir = getBaseDirectory();
    if (!fs.existsSync(baseDir)) {
        fs.mkdirSync(baseDir, { recursive: true });
    }
}

// Sanitize and resolve paths to prevent directory traversal
function securePath(userPath) {
    // If path is empty or undefined, return the base directory
    if (!userPath || userPath.trim() === '') {
        return getBaseDirectory();
    }
    
    // Remove any leading slashes and normalize path
    const normalizedPath = path.normalize(userPath.replace(/^[\/\\]+/, ''));
    
    // Resolve the full path
    const fullPath = path.resolve(getBaseDirectory(), normalizedPath);
    
    // Ensure the path is within the base directory
    if (!fullPath.startsWith(getBaseDirectory())) {
        throw new Error('Security violation: Attempted to access path outside of allowed directory');
    }
    
    return fullPath;
}

function saveToFile(content, userPath, filename) {
    ensureBaseDirectoryExists();
    const dirPath = securePath(userPath);
    
    // Ensure the directory exists
    if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
    }
    
    const filePath = path.join(dirPath, filename);
    // Final security check on complete path
    if (!filePath.startsWith(getBaseDirectory())) {
        throw new Error('Security violation: Attempted to access path outside of allowed directory');
    }
    
    fs.writeFileSync(filePath, content);
}

function readFile(userPath, filename) {
    const dirPath = securePath(userPath);
    const filePath = path.join(dirPath, filename);
    
    // Final security check on complete path
    if (!filePath.startsWith(getBaseDirectory())) {
        throw new Error('Security violation: Attempted to access path outside of allowed directory');
    }
    
    if (!fs.existsSync(filePath)) {
        throw new Error(`File not found: ${filename}`);
    }
    
    return fs.readFileSync(filePath, 'utf8');
}

function createDirectory(userPath) {
    ensureBaseDirectoryExists();
    const dirPath = securePath(userPath);
    fs.mkdirSync(dirPath, { recursive: true });
}

function deleteFile(userPath, filename) {
    const dirPath = securePath(userPath);
    const filePath = path.join(dirPath, filename);
    
    // Final security check on complete path
    if (!filePath.startsWith(getBaseDirectory())) {
        throw new Error('Security violation: Attempted to access path outside of allowed directory');
    }
    
    if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
    }
}

function deleteDirectory(userPath) {
    const dirPath = securePath(userPath);
    if (fs.existsSync(dirPath)) {
        fs.rmSync(dirPath, { recursive: true, force: true });
    }
}

function listFiles(userPath) {
    const dirPath = securePath(userPath);
    if (!fs.existsSync(dirPath)) {
        return [];
    }
    return fs.readdirSync(dirPath).filter(item => 
        fs.statSync(path.join(dirPath, item)).isFile()
    );
}

function listDirectories(userPath) {
    const dirPath = securePath(userPath);
    if (!fs.existsSync(dirPath)) {
        return [];
    }
    return fs.readdirSync(dirPath).filter(item => 
        fs.statSync(path.join(dirPath, item)).isDirectory()
    );
}

async function runStep(task, otherAIData){
    let prompt = `
    You are an AI agent that can execute complex tasks. You are ment to control a the filesystem.
    Do your best to complete the task provided by the user. 
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
    `

    // Add user's most recent input to history with proper formatting
    history.push({
        role: "user", 
        content: [
            {type: "text", text: task}
        ]
    });

    let result = await ai.callAI(prompt, task, history);

    // Add AI response to history
    history.push({
        role: "assistant", 
        content: [
            {type: "text", text: result.toString()}
        ]
    });

    try {
        // Parse the result if it's a string (handle JSON parsing)
        if (typeof result === 'string') {
            try {
                result = JSON.parse(result);
            } catch (e) {
                console.error("Error parsing JSON from AI response:", e.message);
                throw new Error("Invalid response format from AI");
            }
        }

        if(result.action === "saveToFile"){
            saveToFile(result.content, result.path || '', result.filename);
        }else if(result.action === "deleteFile"){
            deleteFile(result.path || '', result.filename);
        }else if(result.action === "createDirectory"){
            createDirectory(result.path || '');
        }else if(result.action === "deleteDirectory"){
            deleteDirectory(result.path || '');
        }else if(result.action === "listFiles"){
            return listFiles(result.path || '');
        }else if(result.action === "listDirectories"){
            return listDirectories(result.path || '');
        }else if(result.action === "readFile"){
            return readFile(result.path || '', result.filename);
        }else if(result.action === "close"){
            if (summaryCallback) {
                summaryCallback(result.summary);
            }
            return;
        }
    } catch (error) {
        // Log error but continue execution
        console.error("Error in filesystem operation:", error.message);
        // Add error to history
        history.push({
            role: "system", 
            content: [
                {type: "text", text: `Error: ${error.message}`}
            ]
        });
    }

    runStep(task);
}

async function runTask(task, otherAIData, callback){
    // Initialize history
    history = [];
    
    // Ensure the base directory exists when starting a new task
    ensureBaseDirectoryExists();
    
    history.push({
        role: "user", 
        content: [
            {type: "text", text: otherAIData}
        ]
    });  
    
    return new Promise((resolve) => {
        summaryCallback = (summary) => {
            if (callback) callback(summary);
            resolve(summary);
        };
        runStep(task);
    });
}

module.exports = {
    runTask
};

