const ai = require("../AI/ai");
let history = [];
async function write(question, information){
    if (!question || typeof question !== 'string') {
        console.error("Writer: Invalid question provided");
        return { error: "Invalid question format", success: false };
    }

    // Ensure information is a string even if it's null/undefined
    const safeInformation = information ? String(information) : "";
    
    let prompt = `
    You are an AI writer that can write about a given topic based on the information provided.

    Information: ${safeInformation}
    `
    try {
        const output = await ai.callAI(prompt, question, history);
        
        // Validate output before using it
        if (!output || output.error || output.fallback) {
            console.error("Writer: Received invalid output from AI:", JSON.stringify(output, null, 2));
            return { 
                error: "Failed to generate content", 
                details: output?.error || "Unknown error",
                success: false
            };
        }
        
        // Continue only if we have valid output
        history.push({role: "user", content: [
            {type: "text", text: question}
        ]});
        history.push({role: "assistant", content: [
            {type: "text", text: JSON.stringify(output, null, 2)}
        ]});
        
        return output;
    } catch (error) {
        console.error("Writer error:", error.message);
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
