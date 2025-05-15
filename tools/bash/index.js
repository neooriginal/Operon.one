const getPlatform = require("../../utils/getPlatform");
const ai = require("../AI/ai");
const docker = require("../docker");
const contextManager = require("../../utils/context");
const path = require('path');


async function safeExecuteInContainer(command, userId = 'default', retries = 3) {
    let containerName = null;
    let containerCreated = false;
    let lastError = null;
    
    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            
            containerName = await docker.createContainer(userId);
            containerCreated = true;
            
            
            const { stdout, stderr } = await docker.executeCommand(containerName, command);
            
            
            const result = stderr ? `${stdout}\nSTDERR: ${stderr}` : stdout;
            return result;
        } catch (error) {
            lastError = error;
            console.warn(`Bash operation failed (attempt ${attempt}/${retries}): ${error.message}`);
            
            
            if (containerCreated && containerName) {
                try {
                    await docker.removeContainer(containerName);
                } catch (cleanupError) {
                    console.error(`Failed to clean up container: ${cleanupError.message}`);
                }
            }
            
            containerCreated = false;
            containerName = null;
            
            
            if (attempt < retries) {
                const delay = Math.min(100 * Math.pow(2, attempt), 2000);
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
    }
    
    return `Error: ${lastError?.message || 'Operation failed after multiple retries'}`;
}

async function runTask(task, otherAIData, callback, userId = 'default') {
    try {
        
        let toolState = contextManager.getToolState('bash', userId) || { history: [] };
        
        task = task + "\n\nOther AI Data: " + otherAIData;
        
        
        let code = await generateBashCode(task, userId);
        
        
        toolState.lastCode = code;
        contextManager.setToolState('bash', toolState, userId);
        
        
        let result = await executeBashCode(code, userId);
        
        
        toolState.lastResult = result;
        contextManager.setToolState('bash', toolState, userId);
        
        
        let summary = await evaluateOutput(task, result, userId);
        
        if (callback) {
            callback(summary);
        }
        
        return summary;
    } catch (error) {
        console.error("Error in bash task:", error.message);
        const errorResult = { 
            error: error.message, 
            success: false 
        };
        
        if (callback) {
            callback(errorResult);
        }
        
        return errorResult;
    } finally {
        
        try {
            await docker.cleanupAllContainers();
        } catch (cleanupError) {
            console.error(`Error during cleanup: ${cleanupError.message}`);
        }
    }
}

async function executeBashCode(code, userId = 'default') {
    try {
        
        return await safeExecuteInContainer(code, userId);
    } catch (error) {
        console.error('Bash execution error:', error.message);
        return `Error: ${error.message}`;
    }
}

async function evaluateOutput(task, result, userId = 'default') {
    
    let toolState = contextManager.getToolState('bash', userId);
    
    const createdContainerFiles = [];
    const resultStr = String(result || ''); 
    const outputLines = resultStr.split('\n');
    for (const line of outputLines) {
        if (line.startsWith('CREATED_FILE:')) {
            const filePath = line.substring('CREATED_FILE:'.length).trim();
            if (filePath) {
                createdContainerFiles.push(filePath);
            }
        }
    }

    let prompt = `
    You are an AI agent that can evaluate the output of a bash code.
    The user will provide the task. Reply in the following JSON Format:
    {
    "summary": \"SUMMARY HERE\",
    "success": true/false 
    }
    Result: ${resultStr} 
    `;
    let summary;
    try {
      summary = await ai.callAI(prompt, task, toolState.history || [], undefined, true, 'auto', userId);
    } catch (aiError) {
      console.error(`AI call failed during bash evaluation: ${aiError.message}`);
      summary = { summary: `Evaluation failed due to AI error: ${aiError.message}`, success: false };
    }
    
    
    toolState.history.push({
        role: "user", 
        content: [
            {type: "text", text: task}
        ]
    });
    
    toolState.history.push({
        role: "assistant", 
        content: [
            {type: "text", text: JSON.stringify(summary)}
        ]
    });
    
    
    if (toolState.history.length > 10) {
        toolState.history = toolState.history.slice(-10);
    }
    
    
    contextManager.setToolState('bash', toolState, userId);

    
    
    if (typeof summary !== 'object' || summary === null) {
        console.warn('Bash evaluateOutput received non-object summary, creating default.');
        
        const originalSummaryContent = typeof summary === 'string' ? summary : 'Invalid content';
        summary = { 
            summary: `Evaluation failed or produced invalid format. Original output hint: ${originalSummaryContent.substring(0,100)}`, 
            success: false 
        };
    }
    if (createdContainerFiles.length > 0) {
        summary.createdContainerFiles = createdContainerFiles;
    }
    

    return summary;
}

async function generateBashCode(task, userId = 'default') {
    
    let toolState = contextManager.getToolState('bash', userId) || { history: [] };
    
    let prompt = `
    You are an AI agent that can execute complex tasks. For this task, the user will provide a task and you are supposed to generate the bash code to complete it.

    Task: ${task}

    Format:
    {
        "code": "bash code in one line"
    }

    IMPORTANT: Your code will be executed in a Docker container based on Linux with Python installed.
    You have full access to the container's filesystem.
    Your code should be compatible with a typical Linux environment.
    **IMPORTANT**: If your code creates any files, echo their absolute paths within the container on separate lines, each prefixed with 'CREATED_FILE:' (e.g., 'echo "CREATED_FILE:/app/result.txt"').
    `;
    let code = await ai.callAI(prompt, task, toolState.history || [], undefined, true, 'auto', userId);
    
    
    toolState.history.push({
        role: "user", 
        content: [
            {type: "text", text: task}
        ]
    });
    
    toolState.history.push({
        role: "assistant", 
        content: [
            {type: "text", text: JSON.stringify(code)}
        ]
    });
    
    
    if (toolState.history.length > 10) {
        toolState.history = toolState.history.slice(-10);
    }
    
    
    contextManager.setToolState('bash', toolState, userId);
    
    return code.code;
}

module.exports = { runTask };