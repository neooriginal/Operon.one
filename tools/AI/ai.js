const OpenAI = require('openai');
const dotenv = require('dotenv');
const smartModelSelector = require('./smartModelSelector');
const tokenCalculation = require('./tokenCalculation');
dotenv.config();

const openai = new OpenAI({
    apiKey: process.env.OPENROUTER_API_KEY,
    baseURL: "https://openrouter.ai/api/v1"
});

async function generateImage(prompt){
    const response = await openai.images.generate({
        prompt: prompt,
        n: 1,
        size: "1024x1024"
    });

    return response.data[0].url;
}

async function callAI(systemMessage, prompt, messages, image=undefined, jsonResponse=true, model="auto"){
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
Example format: {"key": "value with \\n newline"}

Never respond with an empty message.
`;
        systemMessage = systemMessage + jsonInstructions;
    }

    systemMessage = systemMessage+". NEVER EVER RESPOND WITH AN EMPTY STRING AND NEVER USE PLACEHOLDERS."

    let messagesForAPI = [
        {role: "system", content: [
            {type: "text", text: systemMessage}
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
    
    
    const response = await openai.chat.completions.create({
        model: model,
        messages: messagesForAPI,
        response_format: jsonResponse ? {type: "json_object"} : undefined
    });

    if(!response?.choices?.[0]?.message?.content){
        console.log("No response from AI");
        console.log(response);
        console.log(response.choices[0]);
        return;
    }

    if(jsonResponse){
        const result = parseJSON(response.choices[0].message.content);
        
        // Use proper JSON stringification for logging
        console.log(JSON.stringify(result, null, 2));
        
        return result;
    } else {
        return response.choices[0].message.content;
    }
}

function parseJSON(jsonString) {
    if (!jsonString || typeof jsonString !== 'string') {
        return { error: "Invalid input - not a string", fallback: true };
    }
    
    try {
        // First attempt direct parsing
        try {
            return JSON.parse(jsonString);
        } catch (e) {
            // Continue to cleanup attempts
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
        
        cleanedJson = result;
        
        // Try parsing the cleaned JSON
        try {
            return JSON.parse(cleanedJson);
        } catch (error) {
            throw error; // Re-throw to be caught by outer try/catch
        }
    } catch (error) {
        console.error("Failed to parse JSON response:", error.message);
        console.error("Original content:", jsonString.substring(0, 500) + (jsonString.length > 500 ? '...' : ''));
        // Return a basic object with the original content to avoid breaking
        return { 
            error: "Failed to parse as JSON",
            errorMessage: error.message,
            rawContent: jsonString,
            fallback: true
        };
    }
}

module.exports = {callAI, generateImage};
