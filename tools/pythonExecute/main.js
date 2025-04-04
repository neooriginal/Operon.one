const ai = require("../AI/ai");
const child_process = require("child_process")
const fs = require("fs");
const path = require("path");
let history = [];
const getPlatform = require("../../utils/getPlatform");

async function runTask(task, otherAIData, callback){
    try {
        history = [];
        
        // Validate inputs
        if (!task || typeof task !== 'string') {
            console.error("Python Execute: Invalid task provided");
            if (callback) callback("Error: Invalid task format");
            return { error: "Invalid task format", success: false };
        }
        
        // Format the task with other AI data
        task = task + "\n\nOther AI Data: " + (otherAIData || "");
        
        // Ensure base directory exists
        await ensureBaseDirectoryExists();
        
        // Generate Python code
        let codeResult;
        try {
            codeResult = await generateCode(task);
            
            if (!codeResult || codeResult.error) {
                console.error("Failed to generate Python code:", codeResult?.error || "Unknown error");
                const errorMsg = "Failed to generate Python code: " + (codeResult?.error || "Unknown error");
                if (callback) callback(errorMsg);
                return { error: errorMsg, success: false };
            }
        } catch (error) {
            console.error("Error generating code:", error.message);
            const errorMsg = "Error generating code: " + error.message;
            if (callback) callback(errorMsg);
            return { error: errorMsg, success: false };
        }
        
        // Install dependencies
        let dependenciesResult;
        try {
            dependenciesResult = installDependencies(codeResult);
            console.log("Dependencies result:", dependenciesResult);
        } catch (error) {
            console.error("Error installing dependencies:", error.message);
            // Non-critical error, can continue
            dependenciesResult = "Error installing dependencies: " + error.message;
        }
        
        // Execute code
        let executionResult;
        try {
            executionResult = executeCode(codeResult);
            
            if (typeof executionResult === 'string' && executionResult.startsWith("Error:")) {
                console.error("Python execution failed:", executionResult);
                const errorMsg = "Python execution failed: " + executionResult;
                if (callback) callback(errorMsg);
                return { error: errorMsg, partial: executionResult, success: false };
            }
        } catch (error) {
            console.error("Error executing Python code:", error.message);
            const errorMsg = "Error executing Python code: " + error.message;
            if (callback) callback(errorMsg);
            return { error: errorMsg, success: false };
        }
        
        // Evaluate output
        let summary;
        try {
            summary = await evaluateOutput(task, executionResult);
            
            if (!summary || summary.error) {
                console.error("Failed to evaluate output:", summary?.error || "Unknown error");
                // Return a partial result
                const result = {
                    result: executionResult,
                    dependencies: dependenciesResult,
                    success: false,
                    error: "Failed to evaluate output"
                };
                if (callback) callback(JSON.stringify(result, null, 2));
                return result;
            }
        } catch (error) {
            console.error("Error evaluating output:", error.message);
            // Return a partial result with raw execution data
            const result = {
                result: executionResult,
                dependencies: dependenciesResult,
                success: false,
                error: "Error evaluating output: " + error.message
            };
            if (callback) callback(JSON.stringify(result, null, 2));
            return result;
        }
        
        // Execute callback and return
        if (callback) callback(summary);
        return summary;
    } catch (error) {
        console.error("Critical error in Python execution:", error.message);
        const errorMsg = "Critical error in Python execution: " + error.message;
        if (callback) callback(errorMsg);
        return { error: errorMsg, success: false };
    }
}

async function evaluateOutput(task, result){
    try {
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
        const summary = await ai.callAI(prompt, task, history);
        
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

async function generateCode(task) {
    try {
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

        const code = await ai.callAI(prompt, task, history);
        
        if (!code || code.error) {
            console.error("Failed to generate code:", code?.error || "Unknown error");
            return { error: "Failed to generate Python code", fallback: true };
        }
        
        // Validate code object has required field
        if (!code.code) {
            console.error("Generated code missing 'code' field");
            return { error: "Generated code missing required 'code' field", fallback: true };
        }
        
        history.push({
            role: "user", 
            content: [
                {type: "text", text: task}
            ]
        });
        history.push({
            role: "assistant", 
            content: [
                {type: "text", text: JSON.stringify(code, null, 2)}
            ]
        });

        return code;
    } catch (error) {
        console.error("Error generating code:", error.message);
        return { error: `Error generating code: ${error.message}`, fallback: true };
    }
}

function installDependencies(code){
    let platform = getPlatform.getPlatform();
    let command = `pip install ${code}`;
    let result = child_process.execSync(command);
    return result;
}

function executeCode(code){
    let platform = getPlatform.getPlatform();
    let command = `python ${code}`;
    let result = child_process.execSync(command);
    return result;
}


module.exports = {runTask};