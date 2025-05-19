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
    
    let toolState = contextManager.getToolState('ai', userId) || {
        history: [],
        prompts: [],
        images: []
    };
    
    
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
    
    
    toolState.images.push({
        prompt,
        url: imageUrl,
        timestamp: Date.now()
    });
    
    
    contextManager.setToolState('ai', toolState, userId);
    
    return imageUrl;
}

async function callAI(systemMessage, prompt, messages, image=undefined, jsonResponse=true, model="auto", userId = 'default', chatId = 1){
    
    const toolState = contextManager.getToolState('ai', userId, chatId) || { 
        history: [],
        prompts: [],
        responses: [],
        lastRequest: null,
        lastResponse: null
    };
    
    
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
    
    
    if (Array.isArray(messages) && messages.length > 0) {
        messagesForAPI = messagesForAPI.concat(messages);
    }

    for(let i = 0; i < messagesForAPI.length; i++){
        if(!messagesForAPI[i].content[0].text){
            messagesForAPI.splice(i, 1);
        }
    }
    
    
    toolState.lastRequest = {
        messages: messagesForAPI,
        model,
        jsonResponse
    };
    contextManager.setToolState('ai', toolState, userId, chatId);
    
    try {
        
        let attempts = 0;
        const maxAttempts = 3;
        let response = null;
        
        while (attempts < maxAttempts) {
            try {
                response = await openai.chat.completions.create({
                    model: model,
                    messages: messagesForAPI,
                    response_format: jsonResponse ? {type: "json_object"} : undefined,
                    max_tokens: jsonResponse ? 4096 : 8192, 
                    temperature: 0.2 
                });
                break; 
            } catch (retryError) {
                attempts++;
                console.error(`Attempt ${attempts} failed: ${retryError.message}`);
                if (attempts >= maxAttempts) {
                    throw retryError; 
                }
                
                await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, attempts)));
            }
        }

        if(!response?.choices?.[0]?.message?.content){
            console.log("No response from AI");
            console.log(response);
            
            if (response?.choices?.[0]?.message?.refusal) {
                console.log("AI refusal:", response.choices[0].message.refusal);
            } else if (response?.choices?.[0]?.message?.reasoning) {
                console.log("AI reasoning:", response.choices[0].message.reasoning);
            }
            
            toolState.lastError = "No response from AI";
            contextManager.setToolState('ai', toolState, userId, chatId);
            
            return {
                error: true,
                message: "No content received from AI system",
                fallback: true
            };
        }

        const responseContent = response.choices[0].message.content;
        
        
        toolState.responses.push({
            prompt,
            response: responseContent, 
            timestamp: Date.now(),
            model: model
        });
        
        
        if (toolState.responses.length > 50) {
            toolState.responses = toolState.responses.slice(-50);
        }
        if (toolState.prompts.length > 50) {
            toolState.prompts = toolState.prompts.slice(-50);
        }
        
        
        contextManager.setToolState('ai', toolState, userId, chatId);
        
        
        if (jsonResponse) {
            try {
                const jsonResult = parseJSON(responseContent);
                return jsonResult;
            } catch (jsonError) {
                console.error('Error parsing JSON:', jsonError.message);
                console.log('Raw response:', responseContent);
                
                
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
        
        
        toolState.lastError = error.message;
        contextManager.setToolState('ai', toolState, userId, chatId);
        
        
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
        
        try {
            return JSON.parse(jsonString);
        } catch (e) {
            
            console.log("Initial JSON parse failed, attempting cleanup...");
        }

        
        let cleanedJson = jsonString;
        
        
        if (cleanedJson.includes("```")) {
            
            const codeBlockRegex = /```(?:json)?([\s\S]*?)```/;
            const match = cleanedJson.match(codeBlockRegex);
            if (match && match[1]) {
                cleanedJson = match[1].trim();
                console.log("Extracted JSON from code block");
            }
        }
        
        
        
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
        
        
        try {
            const parsedResult = JSON.parse(result);
            return parsedResult;
        } catch (e) {
            console.error("JSON parsing failed after cleanup:", e.message);
            
            
            const printableJson = cleanedJson.replace(/[^\x20-\x7E]/g, '');
            try {
                return JSON.parse(printableJson);
            } catch (e2) {
                
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



function validateResponse(response, expectedStructure) {
    
    if (response.error) {
        return { valid: false, message: response.message || "Response contains error flag" };
    }
    
    
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
