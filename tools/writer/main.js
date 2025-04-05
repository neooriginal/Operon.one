const ai = require("../AI/ai");
const contextManager = require('../../utils/context');

async function write(question, information, userId = 'default'){
    if (!question || typeof question !== 'string') {
        console.error("Writer: Invalid question provided");
        return { error: "Invalid question format", success: false };
    }

    // Initialize or get tool state
    let toolState = contextManager.getToolState('writer', userId) || {
        history: [],
        outputs: []
    };

    // Ensure information is a string even if it's null/undefined
    const safeInformation = information ? String(information) : "";
    
    let prompt = `
    You are an AI writer that can write about a given topic based on the information provided.

    Information: ${safeInformation}
    `
    try {
        const output = await ai.callAI(prompt, question, toolState.history, undefined, true, "auto", userId);
        
        // Validate output before using it
        if (!output || output.error || output.fallback) {
            console.error("Writer: Received invalid output from AI:", JSON.stringify(output, null, 2));
            
            // Track error in tool state
            toolState.lastError = {
                error: "Failed to generate content",
                details: output?.error || "Unknown error",
                timestamp: Date.now()
            };
            contextManager.setToolState('writer', toolState, userId);
            
            return { 
                error: "Failed to generate content", 
                details: output?.error || "Unknown error",
                success: false
            };
        }
        
        // Continue only if we have valid output
        toolState.history.push({
            role: "user", 
            content: [
                {type: "text", text: question}
            ]
        });
        
        toolState.history.push({
            role: "assistant", 
            content: [
                {type: "text", text: JSON.stringify(output, null, 2)}
            ]
        });
        
        // Track successful output
        toolState.outputs.push({
            question,
            timestamp: Date.now(),
            preview: JSON.stringify(output).substring(0, 200) + (JSON.stringify(output).length > 200 ? '...' : '')
        });
        
        // Limit history size
        if (toolState.history.length > 10) {
            toolState.history = toolState.history.slice(-10);
        }
        if (toolState.outputs.length > 10) {
            toolState.outputs = toolState.outputs.slice(-10);
        }
        
        // Save updated tool state
        contextManager.setToolState('writer', toolState, userId);
        
        return output;
    } catch (error) {
        console.error("Writer error:", error.message);
        
        // Track error in tool state
        toolState.lastError = {
            message: error.message,
            timestamp: Date.now()
        };
        contextManager.setToolState('writer', toolState, userId);
        
        return { 
            error: "Error in writer processing", 
            details: error.message,
            success: false
        };
    }
}

module.exports = {
    write
}
