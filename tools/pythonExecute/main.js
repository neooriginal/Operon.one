const ai = require("../AI/ai");
const child_process = require("child_process")
const fs = require("fs");
const path = require("path");
const contextManager = require('../../utils/context');
const getPlatform = require("../../utils/getPlatform");

// Enhanced security function to validate paths
function validatePath(filePath, baseDirectory) {
    // Normalize paths to handle any directory traversal attempts
    const normalizedPath = path.normalize(filePath);
    const normalizedBaseDir = path.normalize(baseDirectory);
    
    // Check if file path is within allowed directory
    if (!normalizedPath.startsWith(normalizedBaseDir)) {
        throw new Error(`Security violation: Path "${filePath}" is outside the allowed directory "${baseDirectory}"`);
    }
    
    return normalizedPath;
}

function getBaseDirectory() {
    const applicationBaseDir = path.join(__dirname, '..', '..');
    return path.join(applicationBaseDir, 'output');
}

// Enhanced function to get user-specific directory
function getUserDirectory(userId = 'default') {
    const baseDir = getBaseDirectory();
    // Sanitize userId to prevent directory traversal
    const sanitizedUserId = userId.replace(/[^a-zA-Z0-9_-]/g, '_');
    return path.join(baseDir, sanitizedUserId);
}

// Ensure the base directory exists
function ensureBaseDirectoryExists(userId = 'default') {
    try {
        const baseDir = getBaseDirectory();
        if (!fs.existsSync(baseDir)) {
            fs.mkdirSync(baseDir, { recursive: true });
        }
        
        // Also ensure user directory exists
        const userDir = getUserDirectory(userId);
        if (!fs.existsSync(userDir)) {
            fs.mkdirSync(userDir, { recursive: true });
        }
        return true;
    } catch (error) {
        console.error("Error creating directories:", error.message);
        throw error;
    }
}

// Get validated path for python file
function getPythonFilePath(userId = 'default', timestamp) {
    const userDir = getUserDirectory(userId);
    const pythonFileName = `python_script_${userId}_${timestamp}.py`;
    const pythonFilePath = path.join(userDir, pythonFileName);
    
    // Validate that the path is within the user directory
    return validatePath(pythonFilePath, userDir);
}

async function runTask(task, otherAIData, callback, userId = 'default'){
    try {
        // Initialize tool state
        let toolState = contextManager.getToolState('pythonExecute', userId) || {
            history: [],
            executions: []
        };
        
        // Reset history for new task
        toolState.currentTask = task;
        contextManager.setToolState('pythonExecute', toolState, userId);
        
        // Validate inputs
        if (!task || typeof task !== 'string') {
            console.error("Python Execute: Invalid task provided");
            
            // Track error in context
            toolState.lastError = "Invalid task format";
            contextManager.setToolState('pythonExecute', toolState, userId);
            
            const errorResult = { error: "Invalid task format", success: false };
            if (callback) callback(errorResult);
            return errorResult;
        }
        
        // Format the task with other AI data
        task = task + "\n\nOther AI Data: " + (otherAIData || "");
        
        // Ensure base directory exists
        await ensureBaseDirectoryExists(userId);
        
        // Generate Python code
        let codeResult;
        try {
            codeResult = await generateCode(task, userId);
            
            if (!codeResult || codeResult.error) {
                console.error("Failed to generate Python code:", codeResult?.error || "Unknown error");
                const errorMsg = "Failed to generate Python code: " + (codeResult?.error || "Unknown error");
                
                // Track error in context
                toolState.lastError = errorMsg;
                contextManager.setToolState('pythonExecute', toolState, userId);
                
                const errorResult = { error: errorMsg, success: false };
                if (callback) callback(errorResult);
                return errorResult;
            }
        } catch (error) {
            console.error("Error generating code:", error.message);
            const errorMsg = "Error generating code: " + error.message;
            
            // Track error in context
            toolState.lastError = errorMsg;
            contextManager.setToolState('pythonExecute', toolState, userId);
            
            const errorResult = { error: errorMsg, success: false };
            if (callback) callback(errorResult);
            return errorResult;
        }
        
        // Save the code to a file with the user ID in the filename to avoid conflicts
        const timestamp = Date.now();
        const pythonFilePath = getPythonFilePath(userId, timestamp);
        
        // Store the python file path in tool state
        toolState.currentPythonFile = pythonFilePath;
        contextManager.setToolState('pythonExecute', toolState, userId);
        
        try {
            // Add safety imports and directory restriction to Python code
            const safetyPrefix = generatePythonSafetyCode(userId);
            const enhancedCode = safetyPrefix + codeResult.code;
            
            fs.writeFileSync(pythonFilePath, enhancedCode);
        } catch (error) {
            console.error("Error saving Python file:", error.message);
            
            // Track error in context
            toolState.lastError = "Error saving Python file: " + error.message;
            contextManager.setToolState('pythonExecute', toolState, userId);
            
            const errorResult = { error: "Error saving Python file: " + error.message, success: false };
            if (callback) callback(errorResult);
            return errorResult;
        }
        
        // Install dependencies
        let dependenciesResult;
        try {
            dependenciesResult = installDependencies(codeResult["pip install"]);
            console.log("Dependencies result:", dependenciesResult);
            
            // Track dependencies in context
            toolState.lastDependencies = codeResult["pip install"];
            contextManager.setToolState('pythonExecute', toolState, userId);
        } catch (error) {
            console.error("Error installing dependencies:", error.message);
            // Non-critical error, can continue
            dependenciesResult = "Error installing dependencies: " + error.message;
            
            // Track error in context
            toolState.dependencyError = error.message;
            contextManager.setToolState('pythonExecute', toolState, userId);
        }
        
        // Execute code
        let executionResult;
        try {
            executionResult = executeCode(pythonFilePath);
            
            if (typeof executionResult === 'string' && executionResult.startsWith("Error:")) {
                console.error("Python execution failed:", executionResult);
                const errorMsg = "Python execution failed: " + executionResult;
                
                // Track error in context
                toolState.executionError = executionResult;
                contextManager.setToolState('pythonExecute', toolState, userId);
                
                const errorResult = { error: errorMsg, partial: executionResult, success: false };
                if (callback) callback(errorResult);
                return errorResult;
            }
            
            // Track successful execution in context
            toolState.executions.push({
                timestamp: timestamp,
                task: task.substring(0, 100) + (task.length > 100 ? '...' : ''),
                pythonFile: path.basename(pythonFilePath),
                outputPreview: executionResult.toString().substring(0, 200) + (executionResult.toString().length > 200 ? '...' : '')
            });
            contextManager.setToolState('pythonExecute', toolState, userId);
        } catch (error) {
            console.error("Error executing Python code:", error.message);
            const errorMsg = "Error executing Python code: " + error.message;
            
            // Track error in context
            toolState.executionError = error.message;
            contextManager.setToolState('pythonExecute', toolState, userId);
            
            const errorResult = { error: errorMsg, success: false };
            if (callback) callback(errorResult);
            return errorResult;
        }
        
        // Evaluate output
        let summary;
        try {
            summary = await evaluateOutput(task, executionResult, userId);
            
            if (!summary || summary.error) {
                console.error("Failed to evaluate output:", summary?.error || "Unknown error");
                // Return a partial result
                const result = {
                    result: executionResult.toString(),
                    dependencies: dependenciesResult,
                    success: false,
                    error: "Failed to evaluate output"
                };
                
                // Track evaluation failure in context
                toolState.evaluationError = "Failed to evaluate output";
                contextManager.setToolState('pythonExecute', toolState, userId);
                
                if (callback) callback(result);
                return result;
            }
            
            // Store evaluation in context
            toolState.lastEvaluation = summary;
            contextManager.setToolState('pythonExecute', toolState, userId);
        } catch (error) {
            console.error("Error evaluating output:", error.message);
            // Return a partial result with raw execution data
            const result = {
                result: executionResult.toString(),
                dependencies: dependenciesResult,
                success: false,
                error: "Error evaluating output: " + error.message
            };
            
            // Track evaluation error in context
            toolState.evaluationError = error.message;
            contextManager.setToolState('pythonExecute', toolState, userId);
            
            if (callback) callback(result);
            return result;
        }
        
        // Limit history size
        if (toolState.executions.length > 10) {
            toolState.executions = toolState.executions.slice(-10);
        }
        
        // Save final tool state
        contextManager.setToolState('pythonExecute', toolState, userId);
        
        // Execute callback and return
        if (callback) callback(summary);
        return summary;
    } catch (error) {
        console.error("Critical error in Python execution:", error.message);
        const errorMsg = "Critical error in Python execution: " + error.message;
        
        // Track critical error in context
        let toolState = contextManager.getToolState('pythonExecute', userId) || { history: [] };
        toolState.criticalError = error.message;
        contextManager.setToolState('pythonExecute', toolState, userId);
        
        const errorResult = { error: errorMsg, success: false };
        if (callback) callback(errorResult);
        return errorResult;
    }
}

// Generate Python safety code that prevents file operations outside user directory
function generatePythonSafetyCode(userId = 'default') {
    const userDir = getUserDirectory(userId);
    const escapedUserDir = userDir.replace(/\\/g, '\\\\'); // Escape backslashes for Python string
    
    return `
import os
import sys
import builtins
from pathlib import Path

# Security: Set allowed directory for file operations
ALLOWED_DIR = Path("${escapedUserDir}")

# Store original open function
_original_open = builtins.open

# Create a secure version of open that validates paths
def secure_open(file, mode='r', *args, **kwargs):
    file_path = Path(os.path.abspath(file))
    if not str(file_path).startswith(str(ALLOWED_DIR)):
        raise PermissionError(f"Security violation: Cannot access {file_path} outside of allowed directory {ALLOWED_DIR}")
    return _original_open(file, mode, *args, **kwargs)

# Replace built-in open with secure version
builtins.open = secure_open

# Secure os.path operations
_original_listdir = os.listdir
_original_mkdir = os.mkdir
_original_makedirs = os.makedirs
_original_remove = os.remove
_original_rmdir = os.rmdir
_original_rename = os.rename

def secure_path_operation(path_func, path, *args, **kwargs):
    path_obj = Path(os.path.abspath(path))
    if not str(path_obj).startswith(str(ALLOWED_DIR)):
        raise PermissionError(f"Security violation: Cannot access {path_obj} outside of allowed directory {ALLOWED_DIR}")
    return path_func(path, *args, **kwargs)

# Replace os functions with secure versions
os.listdir = lambda path, *args, **kwargs: secure_path_operation(_original_listdir, path, *args, **kwargs)
os.mkdir = lambda path, *args, **kwargs: secure_path_operation(_original_mkdir, path, *args, **kwargs)
os.makedirs = lambda path, *args, **kwargs: secure_path_operation(_original_makedirs, path, *args, **kwargs)
os.remove = lambda path, *args, **kwargs: secure_path_operation(_original_remove, path, *args, **kwargs)
os.rmdir = lambda path, *args, **kwargs: secure_path_operation(_original_rmdir, path, *args, **kwargs)
os.rename = lambda src, dst, *args, **kwargs: (
    secure_path_operation(lambda x: None, src) or 
    secure_path_operation(lambda x: None, dst) or
    _original_rename(src, dst, *args, **kwargs)
)

# Print security information
print(f"SECURITY: Python execution restricted to directory: {ALLOWED_DIR}\\n")

# User code begins below this line
# --------------------------------------------------------------------------

`
}

async function evaluateOutput(task, result, userId = 'default'){
    try {
        // Get tool state
        let toolState = contextManager.getToolState('pythonExecute', userId);
        
        let platform = getPlatform.getPlatform();
        
        // Ensure result is converted to string for evaluation
        const resultStr = typeof result === 'object' ? 
            JSON.stringify(result, null, 2) : String(result || '');
        
        let prompt = `
        Based on the following task, evaluate the output of the code and return a summary of the output in a JSON format.
        Task: ${task}
        Output: ${resultStr}

        Format:
        {
            "summary": \`SUMMARY HERE\`,
            "success": true/false
        }
        `
        const summary = await ai.callAI(prompt, task, toolState.history, undefined, true, "auto", userId);
        
        // Add evaluation to history
        toolState.history.push({
            role: "user", 
            content: [
                {type: "text", text: `Evaluate output: ${resultStr.substring(0, 200)}`}
            ]
        });
        
        toolState.history.push({
            role: "assistant", 
            content: [
                {type: "text", text: JSON.stringify(summary, null, 2)}
            ]
        });
        
        // Save updated history
        contextManager.setToolState('pythonExecute', toolState, userId);
        
        // Validate the summary
        if (!summary || typeof summary !== 'object') {
            return { 
                summary: "Failed to generate summary", 
                success: false,
                rawOutput: resultStr.substring(0, 1000)
            };
        }
        
        // Add raw output for reference
        summary.rawOutput = resultStr.substring(0, 1000);
        
        return summary;
    } catch (error) {
        console.error("Error evaluating output:", error.message);
        return {
            summary: "Error evaluating output: " + error.message,
            success: false,
            rawOutput: typeof result === 'object' ? 
                JSON.stringify(result).substring(0, 1000) : 
                String(result || '').substring(0, 1000)
        };
    }
}

async function generateCode(task, userId = 'default') {
    try {
        // Get tool state
        let toolState = contextManager.getToolState('pythonExecute', userId) || {
            history: [],
            executions: []
        };
        
        let userDir = getUserDirectory(userId);
        let platform = getPlatform.getPlatform();
        let prompt = `
        Based on the following task, generate python code which completes it in a simple way. 
        Due to it being evaluated after its done, print important information in the console.

        SECURITY CRITICAL: Your code MUST follow these strict security guidelines:
        1. ONLY access files inside the directory: ${userDir}
        2. NEVER use absolute paths
        3. NEVER try to access parent directories or system directories
        4. NEVER use os.system, subprocess, or any command execution functions
        5. NEVER import any networking, system access, or potentially dangerous libraries
        6. ALL file operations MUST use relative paths within the allowed directory
        7. DO NOT attempt to bypass security restrictions in any way

        The code will be executed in a sandbox with security measures that will prevent access outside
        the allowed directory, but you must still write secure code.

        respond in the following JSON format:
        {
        "code": \`CODE HERE\`,
        "pip install": "libraries which are required, if any",
        }
        Platform: ${platform}
        `

        const code = await ai.callAI(prompt, task, toolState.history, undefined, true, "auto", userId);
        
        if (!code || code.error) {
            console.error("Failed to generate code:", code?.error || "Unknown error");
            return { error: "Failed to generate Python code", fallback: true };
        }
        
        // Validate code object has required field
        if (!code.code) {
            console.error("Generated code missing 'code' field");
            return { error: "Generated code missing required 'code' field", fallback: true };
        }
        
        // Add to history
        toolState.history.push({
            role: "user", 
            content: [
                {type: "text", text: task}
            ]
        });
        
        toolState.history.push({
            role: "assistant", 
            content: [
                {type: "text", text: JSON.stringify(code, null, 2)}
            ]
        });
        
        // Limit history size
        if (toolState.history.length > 10) {
            toolState.history = toolState.history.slice(-10);
        }
        
        // Save updated history
        contextManager.setToolState('pythonExecute', toolState, userId);

        return code;
    } catch (error) {
        console.error("Error generating code:", error.message);
        return { error: `Error generating code: ${error.message}`, fallback: true };
    }
}

// Function to validate dependency installation security
function validateDependencies(dependencies) {
    if (!dependencies || dependencies.trim() === "") {
        return true;
    }
    
    // List of potentially dangerous packages
    const dangerousPackages = [
        'ansible', 'paramiko', 'fabric', 'metasploit', 'scapy', 'nmap', 
        'pwntools', 'winreg', 'pywin32', 'os-sys', 'pyinstaller'
    ];
    
    const dependencyList = dependencies.split(/\s+/);
    
    for (const dep of dependencyList) {
        // Remove version specifications for checking
        const packageName = dep.split(/[=<>~]/)[0].trim().toLowerCase();
        
        if (dangerousPackages.includes(packageName)) {
            throw new Error(`Security violation: Blocked installation of potentially dangerous package: ${packageName}`);
        }
    }
    
    return true;
}

function installDependencies(dependencies){
    if (!dependencies || dependencies.trim() === "") {
        return "No dependencies to install";
    }
    
    try {
        // Validate dependencies first
        validateDependencies(dependencies);
        
        let platform = getPlatform.getPlatform();
        let command = `pip install ${dependencies}`;
        let result = child_process.execSync(command);
        return result.toString();
    } catch (error) {
        console.error("Error installing dependencies:", error.message);
        return `Error: ${error.message}`;
    }
}

function executeCode(pythonFilePath){
    try {
        // Validate that the Python file path exists and is within the allowed directory
        if (!fs.existsSync(pythonFilePath)) {
            throw new Error(`Python file does not exist: ${pythonFilePath}`);
        }
        
        // Additional validation to ensure the file is inside a valid user directory
        const baseDir = getBaseDirectory();
        if (!pythonFilePath.startsWith(baseDir)) {
            throw new Error(`Security violation: Attempted to execute Python file outside of allowed directory: ${pythonFilePath}`);
        }
        
        let platform = getPlatform.getPlatform();
        
        // Use a secure execution method
        let command = `python "${pythonFilePath}"`;
        let result = child_process.execSync(command, {
            // Set a timeout to prevent long-running scripts
            timeout: 30000, // 30 seconds
            // Limit memory usage
            maxBuffer: 1024 * 1024 // 1MB
        });
        
        return result;
    } catch (error) {
        console.error("Error executing Python code:", error.message);
        return `Error: ${error.message}`;
    }
}

module.exports = {runTask};