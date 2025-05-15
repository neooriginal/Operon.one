const ai = require('../AI/ai');
const { memoryFunctions } = require('../../database');

/**
 * Stores a memory JSON for a specific user.
 * @param {string} userId - The user identifier.
 * @param {object} memoryJson - The memory object to store.
 */
async function storeMemory(userId, memoryJson) {
    console.log(`[Memory Tool] Storing memory for user ${userId}:`, JSON.stringify(memoryJson).substring(0, 100) + '...');
    try {
        await memoryFunctions.storeMemory(userId, memoryJson);
        return true;
    } catch (error) {
        console.error('[Memory Tool] Error storing memory:', error.message);
        return false;
    }
}

/**
 * Retrieves memories for a specific user based on a query.
 * @param {string} userId - The user identifier.
 * @param {string} query - The query string to search memories.
 * @returns {Promise<Array<object>>} - A promise resolving to an array of relevant memories.
 */
async function retrieveMemories(userId, query) {
    console.log(`[Memory Tool] Retrieving memories for user ${userId} based on query: ${query}`);
    try {
        if (query && query.trim()) {
            return await memoryFunctions.searchMemories(userId, query);
        }
        return await memoryFunctions.getMemories(userId);
    } catch (error) {
        console.error('[Memory Tool] Error retrieving memories:', error.message);
        return [];
    }
}

/**
 * Generates and stores memories based on a prompt using AI.
 * @param {string} prompt - The prompt containing information to memorize.
 * @param {string} inputData - Additional context data (currently unused by memory tool).
 * @param {function} callback - Callback function executed upon completion.
 * @param {string} userId - User identifier.
 * @returns {Promise<object>} - A promise resolving to the summary of the operation.
 */
async function runTask(prompt, inputData, callback, userId = 'default') {
    let summary = { success: false, storedMemories: 0, retrievedMemories: 0, error: null };
    try {
        const memoryGenerationPrompt = `
        Analyze the following text and extract key information to be stored as memories.
        Format the output as a JSON array, where each object represents a distinct memory.
        Each memory object must include:
        - "type": (e.g., "relationship", "event", "fact", "orb_interaction", "personal_preference", "goal")
        - "content": A detailed description of the memory.
        - "keywords": An array of relevant keywords for searching.
        - "metadata": An object containing context like:
            - "time": (e.g., "Morning", "2024-07-27T10:30:00Z", "childhood") - Be specific if possible.
            - "location": (e.g., "User's home", "Virtual Space X", "London") - Be specific if possible.
            - "people_involved": [List of names or identifiers]
            - "related_entities": [List of related concepts, objects, orbs etc.]
        - "importance": A score from 1 (trivial) to 10 (critical).
        - "storageDuration": How long to keep this memory (e.g., "1 hour", "2 days", "1 month", "forever").

        Example Memory Object:
        {
          "type": "event",
          "content": "User mentioned attending a virtual concert by 'SynthWave Collective' last night.",
          "keywords": ["virtual concert", "SynthWave Collective", "music", "event", "last night"],
          "metadata": {
            "time": "yesterday evening",
            "location": "virtual reality",
            "people_involved": ["user"],
            "related_entities": ["SynthWave Collective"]
          },
          "importance": 6,
          "storageDuration": "1 month"
        }

        Text to analyze:
        ---
        ${prompt}
        ---
        Generate the JSON array of memories based *only* on the text provided above.
        If no specific memories can be extracted, return an empty array [].
        `;

        
        const generatedMemories = await ai.callAI(memoryGenerationPrompt, "Extracting memories from text", [], undefined, true, "auto", userId);

        if (Array.isArray(generatedMemories) && generatedMemories.length > 0) {
            
            for (const memory of generatedMemories) {
                
                if (memory.type && memory.content && memory.storageDuration) {
                    await storeMemory(userId, memory);
                    summary.storedMemories++;
                } else {
                     console.warn("[Memory Tool] Skipping invalid memory object:", memory);
                }
            }
            summary.success = true;
            summary.message = `Successfully generated and stored ${summary.storedMemories} memories.`;

        } else if (Array.isArray(generatedMemories) && generatedMemories.length === 0) {
            summary.success = true;
            summary.message = "No specific memories were extracted from the provided text.";
        } else {
            console.error("[Memory Tool] AI did not return a valid array:", generatedMemories);
            summary.error = "AI failed to generate memories in the expected format.";
            summary.details = generatedMemories; 
        }

    } catch (error) {
        console.error("Error in Memory tool runTask:", error);
        summary.error = error.message;
    }

    
    if (callback) {
        callback(summary);
    }

    return summary;
}

module.exports = {
    runTask,
    storeMemory,
    retrieveMemories 
}; 