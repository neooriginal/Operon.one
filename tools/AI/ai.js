const OpenAI = require('openai');
const dotenv = require('dotenv');
const smartModelSelector = require('./smartModelSelector');
const tokenCalculation = require('./tokenCalculation');
const contextManager = require('../../utils/context');
const { getPersonalityPrompt } = require('../personalityEngine/getPersonalityPrompt');
const io = require('../../socket');
dotenv.config();

const openai = new OpenAI({
    apiKey: process.env.OPENROUTER_API_KEY,
    baseURL: "https://openrouter.ai/api/v1"
});

async function generateImage(prompt, userId = 'default'){
    // Initialize or get tool state
    let toolState = contextManager.getToolState('ai', userId) || {
        history: [],
        prompts: [],
        images: []
    };
    
    // Add prompt to tool state
    toolState.prompts.push({
        type: 'image',
        prompt,
        timestamp: Date.now()
    });
    
    const response = await openai.images.generate({
        prompt: prompt,
        n: 1,
        size: "1024x1024"
    });

    const imageUrl = response.data[0].url;
    
    // Store image generation in tool state
    toolState.images.push({
        prompt,
        url: imageUrl,
        timestamp: Date.now()
    });
    
    // Save updated tool state
    contextManager.setToolState('ai', toolState, userId);
    
    return imageUrl;
}

async function callAI(systemMessage, prompt, messages, image=undefined, jsonResponse=true, model="auto", userId = 'default', chatId = 1){
    // Initialize or get tool state
    const toolState = contextManager.getToolState('ai', userId, chatId) || { 
        history: [],
        prompts: [],
        responses: [],
        lastRequest: null,
        lastResponse: null
    };
    
    // Add prompt to tool state
    toolState.prompts.push({
        system: systemMessage,
        user: prompt,
        timestamp: Date.now(),
        model
    });
    contextManager.setToolState('ai', toolState, userId, chatId);
    
    let modelpicker = await smartModelSelector.getModel(prompt, model);
    model = modelpicker.model
    const maxTokens = modelpicker.maxTokens
    let tokens = tokenCalculation.calculateTokens(prompt);

    if(tokens > maxTokens){
        console.log("Tokens are too high, using smart model selector");
    }

    // Enhanced JSON instructions for models that struggle with structured output
    if(jsonResponse) {
        const jsonInstructions = `
You must respond with valid, parseable JSON only.
- Use escaped newlines (\\n) instead of actual line breaks in strings
- Ensure all quotes are properly escaped
- Do not include markdown formatting, code blocks, or any text outside the JSON
- Verify your response is a single, valid JSON object
- Ensure all required fields are present in your response
- For complex data, make sure arrays and nested objects are properly formatted
Example format: {"key": "value with \\n newline"}

Never respond with an empty message.
Consider the entire context and all requirements before generating a response.
`;
        systemMessage = systemMessage + jsonInstructions;
    }

    systemMessage = systemMessage+". NEVER EVER RESPOND WITH AN EMPTY STRING AND NEVER USE PLACEHOLDERS. Focus on accuracy and correctness over lengthy explanations. Prioritize functionality over verbose descriptions. Fully address all specifications and requirements."

    // Get personality prompt
    const personalityPrompt = await getPersonalityPrompt(userId);
    const combinedSystemPrompt = `${systemMessage}\n\n${personalityPrompt}`;
    
    let messagesForAPI = [
        {role: "system", content: [
            {type: "text", text: combinedSystemPrompt}
        ]},
    ];
    
    if(!image){
        messagesForAPI.push({role: "user", content: [
            {type: "text", text: prompt}
        ]});
    }else{
        messagesForAPI.push({role: "user", content: [
            {type: "text", text: prompt},
            {type: "image_url", image_url: {url: image}}
        ]});
    }
    
    // Add history messages
    if (Array.isArray(messages) && messages.length > 0) {
        messagesForAPI = messagesForAPI.concat(messages);
    }

    for(let i = 0; i < messagesForAPI.length; i++){
        if(!messagesForAPI[i].content[0].text){
            messagesForAPI.splice(i, 1);
        }
    }
    
    // Store request details in tool state
    toolState.lastRequest = {
        messages: messagesForAPI,
        model,
        jsonResponse
    };
    contextManager.setToolState('ai', toolState, userId, chatId);
    
    try {
        // Add retry logic for more reliability
        let attempts = 0;
        const maxAttempts = 3;
        let response = null;
        
        while (attempts < maxAttempts) {
            try {
                console.log(`Attempt ${attempts + 1} to get AI response...`);
                response = await openai.chat.completions.create({
                    model: model,
                    messages: messagesForAPI,
                    response_format: jsonResponse ? {type: "json_object"} : undefined,
                    max_tokens: jsonResponse ? 4096 : 8192, // Increase token limit for responses
                    temperature: 0.2 // Lower temperature for more deterministic outputs
                });
                break; // If successful, exit the retry loop
            } catch (retryError) {
                attempts++;
                console.error(`Attempt ${attempts} failed: ${retryError.message}`);
                if (attempts >= maxAttempts) {
                    throw retryError; // Re-throw if max attempts reached
                }
                // Wait before retrying (exponential backoff)
                await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, attempts)));
            }
        }

        if(!response?.choices?.[0]?.message?.content){
            console.log("No response from AI");
            console.log(response);
            console.log(response.choices[0]);
            
            // Store error in tool state
            toolState.lastError = "No response from AI";
            contextManager.setToolState('ai', toolState, userId, chatId);
            
            return {
                error: true,
                message: "No content received from AI system",
                fallback: true
            };
        }

        const responseContent = response.choices[0].message.content;
        
        // Store response in tool state without truncation for proper record-keeping
        toolState.responses.push({
            prompt,
            response: responseContent, // Don't truncate the response
            timestamp: Date.now(),
            model: model
        });
        
        // Limit history size
        if (toolState.responses.length > 50) {
            toolState.responses = toolState.responses.slice(-50);
        }
        if (toolState.prompts.length > 50) {
            toolState.prompts = toolState.prompts.slice(-50);
        }
        
        // Save updated tool state
        contextManager.setToolState('ai', toolState, userId, chatId);
        
        // Parse JSON response if needed
        if (jsonResponse) {
            try {
                const jsonResult = parseJSON(responseContent);
                return jsonResult;
            } catch (jsonError) {
                console.error('Error parsing JSON:', jsonError.message);
                console.log('Raw response:', responseContent);
                
                // Attempt to fix common JSON issues
                try {
                    const fixedJson = responseContent
                        .replace(/\\n/g, '\\n')
                        .replace(/\\'/g, "\\'")
                        .replace(/\\"/g, '\\"')
                        .replace(/\\&/g, '\\&')
                        .replace(/\\r/g, '\\r')
                        .replace(/\\t/g, '\\t')
                        .replace(/\\b/g, '\\b')
                        .replace(/\\f/g, '\\f');
                    
                    return parseJSON(fixedJson);
                } catch (fixError) {
                    console.error('Failed to fix JSON:', fixError.message);
                    
                    // Fallback to returning the raw string
                    return {
                        content: responseContent,
                        error: true,
                        message: "Failed to parse JSON response",
                        fallback: true
                    };
                }
            }
        }
        
        return responseContent;
    } catch (error) {
        console.error(`AI call error: ${error.message}`);
        
        // Store error in tool state
        toolState.lastError = error.message;
        contextManager.setToolState('ai', toolState, userId, chatId);
        
        // Return a structured error message
        if (jsonResponse) {
            return {
                error: true,
                message: error.message,
                details: error.toString(),
                fallback: true
            };
        } else {
            return `Error calling AI: ${error.message}`;
        }
    }
}

function parseJSON(jsonString) {
    if (!jsonString || typeof jsonString !== 'string') {
        console.error("Invalid input to parseJSON - not a string");
        return { error: "Invalid input - not a string", fallback: true };
    }
    
    try {
        // First attempt direct parsing
        try {
            return JSON.parse(jsonString);
        } catch (e) {
            // Continue to cleanup attempts
            console.log("Initial JSON parse failed, attempting cleanup...");
        }

        // Clean up the string to handle various formats
        let cleanedJson = jsonString;
        
        // Remove markdown code blocks (with or without language identifier)
        if (cleanedJson.includes("```")) {
            // Match anything between code blocks, prioritizing json blocks
            const codeBlockRegex = /```(?:json)?([\s\S]*?)```/;
            const match = cleanedJson.match(codeBlockRegex);
            if (match && match[1]) {
                cleanedJson = match[1].trim();
                console.log("Extracted JSON from code block");
            }
        }
        
        // Handle literal newlines in strings by replacing them with escaped newlines
        // First identify strings in the JSON
        let inString = false;
        let isEscaped = false;
        let result = '';
        
        for (let i = 0; i < cleanedJson.length; i++) {
            const char = cleanedJson[i];
            
            if (inString) {
                if (char === '\\') {
                    isEscaped = !isEscaped;
                } else if (char === '"' && !isEscaped) {
                    inString = false;
                } else if ((char === '\n' || char === '\r') && !isEscaped) {
                    // Replace actual newlines in strings with escaped newlines
                    result += '\\n';
                    continue;
                } else {
                    isEscaped = false;
                }
            } else if (char === '"') {
                inString = true;
                isEscaped = false;
            }
            
            result += char;
        }
        
        // Try parsing the cleaned JSON
        try {
            const parsedResult = JSON.parse(result);
            return parsedResult;
        } catch (e) {
            console.error("JSON parsing failed after cleanup:", e.message);
            
            // Try one more approach - remove all non-printable characters
            const printableJson = cleanedJson.replace(/[^\x20-\x7E]/g, '');
            try {
                return JSON.parse(printableJson);
            } catch (e2) {
                // If all parsing attempts fail, return a structured error
                console.error("All JSON parsing attempts failed:", e2.message);
                return {
                    error: true,
                    message: "Failed to parse JSON after multiple attempts",
                    original: jsonString.substring(0, 100) + "...",
                    fallback: true
                };
            }
        }
    } catch (error) {
        console.error("Unexpected error in parseJSON:", error.message);
        return { 
            error: true, 
            message: error.message,
            fallback: true
        };
    }
}

// Helper function to validate response structure 
// This is a simple implementation that can be expanded
function validateResponse(response, expectedStructure) {
    // If response has error flag, it's already invalid
    if (response.error) {
        return { valid: false, message: response.message || "Response contains error flag" };
    }
    
    // Simple validation - check if required fields exist
    if (typeof expectedStructure === 'object') {
        for (const key of Object.keys(expectedStructure)) {
            if (!(key in response)) {
                return { 
                    valid: false, 
                    message: `Missing required field: ${key}` 
                };
            }
        }
    }
    
    return { valid: true };
}

module.exports = {callAI, generateImage};
