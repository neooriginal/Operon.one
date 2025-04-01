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

async function callAI(systemMessage, prompt, messages, image=undefined, jsonResponse=true){
    const model = await smartModelSelector.getModel(prompt).model;
    const maxTokens = await smartModelSelector.getModel(prompt).maxTokens;
    let tokens = tokenCalculation.calculateTokens(prompt);

    if(tokens > maxTokens){
        console.log("Tokens are too high, using smart model selector");
    }


    if(jsonResponse)systemMessage = systemMessage+". ! Only respond with valid JSON !"

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
        return parseJSON(response.choices[0].message.content);
    }else{
        return response.choices[0].message.content;
    }
}

function parseJSON(jsonString) {
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
        
        // Try parsing the cleaned JSON
        return JSON.parse(cleanedJson);
    } catch (error) {
        console.error("Failed to parse JSON response:", error.message);
        // Return a basic object with the original content to avoid breaking
        return { 
            error: "Failed to parse as JSON",
            rawContent: jsonString
        };
    }
}

module.exports = {callAI, generateImage};
