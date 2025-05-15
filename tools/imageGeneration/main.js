const ai = require("../AI/ai");
const contextManager = require("../../utils/context");
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const crypto = require('crypto');


async function downloadAndSaveImage(imageUrl, filePath) {
    try {
        const response = await axios({
            method: 'GET',
            url: imageUrl,
            responseType: 'stream'
        });

        const writer = fs.createWriteStream(filePath);
        response.data.pipe(writer);

        return new Promise((resolve, reject) => {
            writer.on('finish', () => resolve(filePath));
            writer.on('error', reject);
        });
    } catch (error) {
        console.error("Error downloading image:", error.message);
        throw error;
    }
}

async function runTask(task, otherAiData, callback, userId = 'default'){
    
    let userContext = contextManager.getContext(userId);
    if (!userContext.imageGeneration) {
        userContext.imageGeneration = {
            history: []
        };
        contextManager.updateContext(userId, userContext);
    }
    
    try {
        
        let imageUrl = await ai.generateImage(task+"\n\n"+otherAiData, userId);
        
        
        const outputDir = path.join(__dirname, '../../output', userId.replace(/[^a-zA-Z0-9_-]/g, '_'));
        const imagesDir = path.join(outputDir, 'images');
        
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }
        
        if (!fs.existsSync(imagesDir)) {
            fs.mkdirSync(imagesDir, { recursive: true });
        }
        
        
        const timestamp = Date.now();
        const randomHash = crypto.randomBytes(4).toString('hex');
        const imageFileName = `image_${timestamp}_${randomHash}.png`;
        const imagePath = path.join(imagesDir, imageFileName);
        
        
        const savedImagePath = await downloadAndSaveImage(imageUrl, imagePath);
        
        
        const summary = {
            success: true,
            imageUrl: imageUrl,
            filePath: savedImagePath,
            relativePath: `output/${userId.replace(/[^a-zA-Z0-9_-]/g, '_')}/images/${imageFileName}`
        };
        
        
        userContext.imageGeneration.history.push({
            prompt: task,
            additionalData: otherAiData,
            timestamp: new Date().toISOString(),
            success: true,
            imageUrl: imageUrl,
            filePath: savedImagePath
        });
        contextManager.updateContext(userId, userContext);
        
        callback(summary);
        return summary;
    } catch (error) {
        console.error("Image generation error:", error.message);
        
        
        const errorSummary = {
            success: false,
            error: error.message,
            details: error.toString()
        };
        
        
        userContext.imageGeneration.history.push({
            prompt: task,
            additionalData: otherAiData,
            timestamp: new Date().toISOString(),
            success: false,
            error: error.message
        });
        contextManager.updateContext(userId, userContext);
        
        callback(errorSummary);
        return errorSummary;
    }
}

module.exports = {runTask};