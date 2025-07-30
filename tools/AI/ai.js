const OpenAI = require('openai');
const dotenv = require('dotenv');
const smartModelSelector = require('./smartModelSelector');
const tokenCalculation = require('./tokenCalculation');
const contextManager = require('../../utils/context');
const { getPersonalityPrompt } = require('../personalityEngine/getPersonalityPrompt');
const { userFunctions, fileFunctions } = require('../../database');
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
    
    if (userId && userId !== 'default') {
        try {
            const remainingCredits = await userFunctions.getRemainingCredits(userId);
            const estimatedCost = Math.ceil(prompt.length * 1.2); // Rough estimate: 1.2 tokens per character
            
            if (remainingCredits < estimatedCost) {
                return {
                    error: true,
                    message: "Insufficient credits. Please redeem a code or contact support.",
                    creditsNeeded: estimatedCost,
                    creditsRemaining: remainingCredits,
                    fallback: true
                };
            }
        } catch (error) {
            console.error('Error checking credits:', error);
        }
    }
    
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

If you do not return valid JSON, your output will cause an API error. Do not include any notes or natural language explanations. Use \\n to be a valid json.
`;
        systemMessage = systemMessage + jsonInstructions;
    }

    systemMessage = systemMessage+". NEVER EVER RESPOND WITH AN EMPTY STRING AND NEVER USE PLACEHOLDERS. Focus on accuracy and correctness over lengthy explanations. Prioritize functionality over verbose descriptions. Fully address all specifications and requirements."

    // Get uploaded files context and images
    let filesContext = '';
    let imageFiles = [];
    if (userId && userId !== 'default') {
        try {
            const trackedFiles = await fileFunctions.getTrackedFiles(userId, chatId);
            const allFiles = [...trackedFiles.containerFiles, ...trackedFiles.hostFiles];
            
            if (allFiles.length > 0) {
                filesContext = `\n\nUPLOADED FILES AVAILABLE:\nThe user has uploaded the following files that you can reference and work with:\n\n`;
                
                allFiles.forEach((file, index) => {
                    const fileType = file.containerPath ? 'container' : 'host';
                    const filePath = file.containerPath || file.filePath;
                    const extension = file.fileExtension || 'unknown';
                    const contentSize = file.fileContent ? file.fileContent.length : 0;
                    
                    filesContext += `${index + 1}. File: "${file.originalName}" (ID: ${file.id})\n`;
                    filesContext += `   - Location: ${filePath}\n`;
                    filesContext += `   - Type: ${extension} file\n`;
                    filesContext += `   - Storage: ${fileType}\n`;
                    filesContext += `   - Size: ${contentSize} characters\n`;
                    if (file.description) {
                        filesContext += `   - Description: ${file.description}\n`;
                    }
                    filesContext += `   - Uploaded: ${file.createdAt}\n`;
                    
                    // Check if it's an image file
                    const isImageFile = isImageContent(file.fileExtension, file.originalName);
                    
                    if (file.fileContent && contentSize > 0) {
                        const isTextFile = isTextualContent(file.fileExtension, file.originalName);
                        const maxContentSize = 10000; // 10KB limit for including in context
                        
                        if (isImageFile && file.fileContent) {
                            // Add image to the image files array for vision processing
                            imageFiles.push({
                                id: file.id,
                                name: file.originalName,
                                data: `data:image/${extension};base64,${file.fileContent}`
                            });
                            filesContext += `   - Content: Image file (will be analyzed visually)\n`;
                        } else if (isTextFile && contentSize <= maxContentSize) {
                            filesContext += `   - Content Preview:\n`;
                            filesContext += `\`\`\`${file.fileExtension || 'text'}\n`;
                            filesContext += file.fileContent.substring(0, 5000); // First 5KB
                            if (contentSize > 5000) {
                                filesContext += `\n... (content truncated, total size: ${contentSize} characters)`;
                            }
                            filesContext += `\n\`\`\`\n`;
                        } else if (isTextFile) {
                            filesContext += `   - Content: Available (too large for preview - ${contentSize} characters)\n`;
                        } else {
                            filesContext += `   - Content: Binary file (not displayed)\n`;
                        }
                    } else {
                        filesContext += `   - Content: Not available\n`;
                    }
                    filesContext += `\n`;
                });
                
                filesContext += `IMPORTANT: You have direct access to the content of text files shown above. You can analyze, modify, reference, and work with this content directly. For image files, you can see and analyze them visually. For binary files or files too large to display, you can still reference them by name and provide guidance about their purpose.\n\n`;
            }
        } catch (error) {
            console.error('Error fetching uploaded files for AI context:', error);
            // Continue without files context if there's an error
        }
    }
    
    const personalityPrompt = await getPersonalityPrompt(userId);
    
    // Add file requirement detection
    const fileDetectionPrompt = `\n\nFILE REQUIREMENT DETECTION:
If the user asks you to analyze, process, work with, or modify any files (images, documents, code files, etc.) and no files are currently uploaded or available, you MUST inform them that they need to upload the relevant files first.

Look for requests like:
- "analyze this image/photo/picture"
- "process this document/file"
- "work with this code/script"
- "modify this file"
- "look at this image"
- "check this document"
- "review this file"
- Or any similar file-related requests

If no files are uploaded and the user is asking for file-related tasks, respond with something like:
"I don't see any files uploaded for this task. To help you with [specific task], please upload the relevant files using the upload button. You can drag and drop files or click the paperclip icon to upload them, then I'll be able to analyze and work with them."

Only mention this if the user is specifically requesting file-related work and no files are available.`;

    const combinedSystemPrompt = `${systemMessage}${filesContext}${fileDetectionPrompt}\n\n${personalityPrompt}`;
    
    let messagesForAPI = [
        {role: "system", content: [
            {type: "text", text: combinedSystemPrompt}
        ]},
    ];
    
    // Build user message content with text and any images
    let userContent = [{type: "text", text: prompt}];
    
    // Add single image if provided via parameter
    if (image) {
        userContent.push({type: "image_url", image_url: {url: image}});
    }
    
    // Add uploaded image files
    if (imageFiles && imageFiles.length > 0) {
        imageFiles.forEach(imageFile => {
            userContent.push({
                type: "image_url",
                image_url: {url: imageFile.data}
            });
        });
    }
    
    messagesForAPI.push({role: "user", content: userContent});
    
    
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
                    max_tokens: jsonResponse ? 4096 : 16384, 
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
        
        // Deduct credits after successful response
        if (userId && userId !== 'default') {
            try {
                const actualCost = Math.ceil((prompt.length + responseContent.length) * 1.0); // 1 token per character
                await userFunctions.updateCredits(userId, actualCost);
            } catch (error) {
                console.error('Error updating credits:', error);
            }
        }
        
        
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

// Helper function to determine if file content is textual
function isTextualContent(fileExtension, filename) {
    const textExtensions = new Set([
        'txt', 'md', 'json', 'xml', 'html', 'htm', 'css', 'js', 'ts', 'jsx', 'tsx',
        'py', 'java', 'c', 'cpp', 'h', 'hpp', 'cs', 'php', 'rb', 'go', 'rs', 'swift',
        'kt', 'scala', 'sh', 'bash', 'ps1', 'bat', 'cmd', 'sql', 'r', 'matlab', 'm',
        'yml', 'yaml', 'toml', 'ini', 'cfg', 'conf', 'properties', 'env', 'gitignore',
        'dockerfile', 'makefile', 'cmake', 'gradle', 'pom', 'package', 'lock',
        'log', 'csv', 'tsv', 'rtf', 'tex', 'bib', 'srt', 'vtt', 'asm', 's'
    ]);
    
    // Check by extension
    if (fileExtension && textExtensions.has(fileExtension.toLowerCase())) {
        return true;
    }
    
    // Check by filename patterns (files without extensions)
    if (filename) {
        const lowercaseFilename = filename.toLowerCase();
        const textFilenames = [
            'readme', 'license', 'changelog', 'dockerfile', 'makefile', 'cmakelists',
            'package.json', 'package-lock.json', 'yarn.lock', 'composer.json', 'gemfile',
            'requirements.txt', 'setup.py', 'pyproject.toml', 'cargo.toml', 'go.mod',
            'pom.xml', 'build.gradle', 'webpack.config.js', 'tsconfig.json', 'eslintrc',
            'prettierrc', 'babelrc', 'gitignore', 'gitattributes', 'editorconfig'
        ];
        
        for (const textFilename of textFilenames) {
            if (lowercaseFilename.includes(textFilename)) {
                return true;
            }
        }
    }
    
    return false;
}

// Helper function to determine if content is an image
function isImageContent(fileExtension, filename) {
    const imageExtensions = new Set([
        'jpg', 'jpeg', 'png', 'gif', 'bmp', 'svg', 'webp', 'ico', 'tiff', 'tif'
    ]);
    
    // Check by extension
    if (fileExtension && imageExtensions.has(fileExtension.toLowerCase())) {
        return true;
    }
    
    // Check by filename for image-like patterns
    if (filename) {
        const lowercaseFilename = filename.toLowerCase();
        for (const imgExt of imageExtensions) {
            if (lowercaseFilename.endsWith(`.${imgExt}`)) {
                return true;
            }
        }
    }
    
    return false;
}

module.exports = {callAI, generateImage};
