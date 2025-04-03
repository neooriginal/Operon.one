const ai = require("../AI/ai");

let history = [];

async function runTask(task, otherAIData, callback) {
    // Initialize history
    history = [];
    
    // Combine task with other AI data
    task = task + "\n\nOther AI Data: " + otherAIData;
    
    try {
        // Generate and execute mathematical operations
        let result = await performMathOperation(task);
        let summary = await evaluateOutput(task, result);
        callback(summary);
    } catch (error) {
        console.error("Error in runTask:", error.message);
        callback(`Error executing task: ${error.message}`);
    }
}

async function performMathOperation(task) {
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

    let response = await ai.callAI(prompt, task, history);
    
    // Add to history
    history.push({
        role: "user", 
        content: [
            {type: "text", text: task}
        ]
    });
    history.push({
        role: "assistant", 
        content: [
            {type: "text", text: response}
        ]
    });

    return response;
}

async function evaluateOutput(task, result) {
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
    
    let summary = await ai.callAI(prompt, task, history);
    return summary;
}

module.exports = {
    runTask
};