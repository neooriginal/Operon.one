const ai = require("../AI/ai");
const contextManager = require('../../utils/context');

async function runTask(task, otherAIData, callback, userId = 'default') {
    
    let toolState = contextManager.getToolState('math', userId) || {
        history: [],
        operations: []
    };
    
    
    task = task + "\n\nOther AI Data: " + otherAIData;
    
    try {
        
        let result = await performMathOperation(task, userId);
        let summary = await evaluateOutput(task, result, userId);
        
        if (callback) {
            callback(summary);
        }
        
        return summary;
    } catch (error) {
        console.error("Error in runTask:", error.message);
        
        
        toolState.lastError = {
            message: error.message,
            timestamp: Date.now()
        };
        contextManager.setToolState('math', toolState, userId);
        
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

async function performMathOperation(task, userId = 'default') {
    
    let toolState = contextManager.getToolState('math', userId) || {
        history: [],
        operations: []
    };
    
    let prompt = `
    You are an AI agent that can execute complex mathematical operations. For this task, the user will provide a mathematical problem and you are supposed to solve it.
    Task: ${task}

    Format:
    {
        "operation": "the mathematical operation to perform",
        "result": "the calculated result",
        "explanation": "explanation of how the result was calculated"
    }
    `

    let response = await ai.callAI(prompt, task, toolState.history, undefined, true, "auto", userId);
    
    
    toolState.history.push({
        role: "user", 
        content: [
            {type: "text", text: task}
        ]
    });
    
    toolState.history.push({
        role: "assistant", 
        content: [
            {type: "text", text: JSON.stringify(response)}
        ]
    });
    
    
    toolState.operations.push({
        task: task,
        operation: response.operation,
        result: response.result,
        timestamp: Date.now()
    });
    
    
    if (toolState.history.length > 10) {
        toolState.history = toolState.history.slice(-10);
    }
    if (toolState.operations.length > 10) {
        toolState.operations = toolState.operations.slice(-10);
    }
    
    
    contextManager.setToolState('math', toolState, userId);

    return response;
}

async function evaluateOutput(task, result, userId = 'default') {
    
    let toolState = contextManager.getToolState('math', userId);
    
    let prompt = `
    Based on the following task, evaluate the mathematical operation and return a summary in a JSON format.
    Task: ${task}
    Result: ${JSON.stringify(result)}

    Format:
    {
        "summary": "detailed summary of the mathematical operation and its result",
        "success": true/false
    }
    `
    
    let summary = await ai.callAI(prompt, task, toolState.history, undefined, true, "auto", userId);
    
    
    toolState.lastEvaluation = {
        summary: summary.summary,
        success: summary.success,
        timestamp: Date.now()
    };
    
    
    contextManager.setToolState('math', toolState, userId);
    
    return summary;
}

module.exports = {
    runTask
};