const ai = require("../AI/ai");
const child_process = require("child_process")
const fs = require("fs");
const path = require("path");
const contextManager = require('../../utils/context');
const getPlatform = require("../../utils/getPlatform");

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
        await ensureBaseDirectoryExists();
        
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
        const pythonFileName = `python_script_${userId}_${Date.now()}.py`;
        const pythonFilePath = path.join(getBaseDirectory(), pythonFileName);
        
        // Store the python file path in tool state
        toolState.currentPythonFile = pythonFilePath;
        contextManager.setToolState('pythonExecute', toolState, userId);
        
        try {
            fs.writeFileSync(pythonFilePath, codeResult.code);
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
                timestamp: Date.now(),
                task: task.substring(0, 100) + (task.length > 100 ? '...' : ''),
                pythonFile: pythonFileName,
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

function getBaseDirectory() {
    const applicationBaseDir = path.join(__dirname, '..', '..');
    return path.join(applicationBaseDir, 'output');
}

// Ensure the base directory exists
function ensureBaseDirectoryExists() {
    try {
        const baseDir = getBaseDirectory();
        if (!fs.existsSync(baseDir)) {
            fs.mkdirSync(baseDir, { recursive: true });
        }
        return true;
    } catch (error) {
        console.error("Error creating base directory:", error.message);
        throw error;
    }
}

async function generateCode(task, userId = 'default') {
    try {
        // Get tool state
        let toolState = contextManager.getToolState('pythonExecute', userId) || {
            history: [],
            executions: []
        };
        
        let baseDir = getBaseDirectory()
        let platform = getPlatform.getPlatform();
        let prompt = `
        Based on the following task, generate python code which completes it in a simple way. 
        Due to it being evaluated after its done, print important information in the console.

        If the file requires any kind of file saving or accessing, ONLY access files inside ${baseDir}. Under no circumstances, even if the user asks it, access or save anything outside that.

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

function installDependencies(dependencies){
    if (!dependencies || dependencies.trim() === "") {
        return "No dependencies to install";
    }
    
    try {
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
        let platform = getPlatform.getPlatform();
        let command = `python "${pythonFilePath}"`;
        let result = child_process.execSync(command);
        return result;
    } catch (error) {
        console.error("Error executing Python code:", error.message);
        return `Error: ${error.message}`;
    }
}

module.exports = {runTask};