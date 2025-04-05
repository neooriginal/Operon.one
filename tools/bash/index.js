const getPlatform = require("../../utils/getPlatform");
const ai = require("../AI/ai");
const contextManager = require("../../utils/context");
const child_process = require('child_process');
const path = require('path');
const fs = require('fs');

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

async function runTask(task, otherAIData, callback, userId = 'default'){
    // Initialize tool state from context or create a new one
    let toolState = contextManager.getToolState('bash', userId) || { history: [] };
    
    task = task + "\n\nOther AI Data: " + otherAIData;
    ensureBaseDirectoryExists();
    let code = await generateBashCode(task, userId);
    
    // Store the generated code in tool state
    toolState.lastCode = code;
    contextManager.setToolState('bash', toolState, userId);
    
    let result = await executeBashCode(code);
    
    // Store result in tool state
    toolState.lastResult = result;
    contextManager.setToolState('bash', toolState, userId);
    
    let summary = await evaluateOutput(task, result, userId);
    
    if (callback) {
        callback(summary);
    }
    
    return summary;
}

async function executeBashCode(code){
    try {
        let result = child_process.execSync(code);
        return result.toString();
    } catch (error) {
        console.error('Bash execution error:', error.message);
        return `Error: ${error.message}`;
    }
}

async function evaluateOutput(task, result, userId = 'default'){
    // Get tool state
    let toolState = contextManager.getToolState('bash', userId);
    
    let prompt = `
    You are an AI agent that can evaluate the output of a bash code.
    The user will provide the task. Reply in the following JSON Format:
    {
    "summary": \`SUMMARY HERE\`,
    "success": true/false //task completed?
    }
    Result: ${result}
    `
    let summary = await ai.callAI(prompt, task, toolState.history || []);
    
    // Update history in tool state
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
    
    // Limit history size
    if (toolState.history.length > 10) {
        toolState.history = toolState.history.slice(-10);
    }
    
    // Save updated tool state
    contextManager.setToolState('bash', toolState, userId);
    
    return summary;
}

async function generateBashCode(task, userId = 'default'){
    // Get tool state
    let toolState = contextManager.getToolState('bash', userId) || { history: [] };
    
    let platform = getPlatform.getPlatform();
    let prompt = `
    You are an AI agent that can execute complex tasks. For this task, the user will provide a task and you are supposed to generate the bash code to complete it.
    Platform: ${platform}
    Task: ${task}

    Format:
    {
        "code": "bash code in one line"
    }

    Under no circumstances, even if the user asks it, access or save anything outside the base directory. 
    Base directory: ${getBaseDirectory()}
    `
    let code = await ai.callAI(prompt, task, toolState.history || []);
    
    // Update history in tool state
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
    
    // Limit history size
    if (toolState.history.length > 10) {
        toolState.history = toolState.history.slice(-10);
    }
    
    // Save updated tool state
    contextManager.setToolState('bash', toolState, userId);
    
    return code.code;
}

module.exports = {runTask};