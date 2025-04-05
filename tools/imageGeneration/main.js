const ai = require("../AI/ai");
const contextManager = require("../../utils/context");

async function runTask(task, otherAiData, callback, userId = 'default'){
    // Get or initialize user context
    let userContext = contextManager.getContext(userId);
    if (!userContext.imageGeneration) {
        userContext.imageGeneration = {
            history: []
        };
        contextManager.updateContext(userId, userContext);
    }
    
    let summary = await ai.generateImage(task+"\n\n"+otherAiData);
    
    // Store generation history in context
    userContext.imageGeneration.history.push({
        prompt: task,
        additionalData: otherAiData,
        timestamp: new Date().toISOString(),
        success: !!summary
    });
    contextManager.updateContext(userId, userContext);
    
    callback(summary);
}

module.exports = {runTask};