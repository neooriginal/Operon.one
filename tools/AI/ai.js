const OpenAI = require('openai');
const dotenv = require('dotenv');
const smartModelSelector = require('./smartModelSelector');
const tokenCalculation = require('./tokenCalculation');
dotenv.config();

const openai = new OpenAI({
    apiKey: process.env.OPENROUTER_API_KEY,
    baseURL: "https://openrouter.ai/api/v1"
});



async function callAI(systemMessage, prompt, messages, image=undefined){
    const model = await smartModelSelector.getModel(prompt).model;
    const maxTokens = await smartModelSelector.getModel(prompt).maxTokens;
    let tokens = tokenCalculation.calculateTokens(prompt);

    if(tokens > maxTokens){
        console.log("Tokens are too high, using smart model selector");
    }


    let messagesForAPI = [
        {role: "system", content: [
            {type: "text", text: systemMessage+"; REMEMBER TO RESPOND IN JSON FORMAT"}
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
        response_format: {type: "json_object"}
    });

    if(!response?.choices?.[0]?.message?.content){
        console.log("No response from AI");
        console.log(response);
        return;
    }
    
    return parseJSON(response.choices[0].message.content);
}

function parseJSON(jsonString){
    //parse json in a smart way (eg when json includes ```json or similar) it still parses
    let json = jsonString;
    if(jsonString.includes("```json")){
        json = jsonString.split("```json")[1].split("```")[0];
    }
    return JSON.parse(json);
}

module.exports = {callAI};
