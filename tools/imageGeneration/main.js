const ai = require("../AI/ai");
const contextManager = require("../../utils/context");
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const crypto = require('crypto');

// Helper function to download image from URL and save to disk
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
    // Get or initialize user context
    let userContext = contextManager.getContext(userId);
    if (!userContext.imageGeneration) {
        userContext.imageGeneration = {
            history: []
        };
        contextManager.updateContext(userId, userContext);
    }
    
    try {
        // Generate the image URL using the AI service
        let imageUrl = await ai.generateImage(task+"\n\n"+otherAiData, userId);
        
        // Create the images directory in the user's output folder
        const outputDir = path.join(__dirname, '../../output', userId.replace(/[^a-zA-Z0-9_-]/g, '_'));
        const imagesDir = path.join(outputDir, 'images');
        
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }
        
        if (!fs.existsSync(imagesDir)) {
            fs.mkdirSync(imagesDir, { recursive: true });
        }
        
        // Generate a unique filename based on timestamp and random hash
        const timestamp = Date.now();
        const randomHash = crypto.randomBytes(4).toString('hex');
        const imageFileName = `image_${timestamp}_${randomHash}.png`;
        const imagePath = path.join(imagesDir, imageFileName);
        
        // Download and save the image
        const savedImagePath = await downloadAndSaveImage(imageUrl, imagePath);
        
        // Create a summary with both the URL and the saved file path
        const summary = {
            success: true,
            imageUrl: imageUrl,
            filePath: savedImagePath,
            relativePath: `output/${userId.replace(/[^a-zA-Z0-9_-]/g, '_')}/images/${imageFileName}`
        };
        
        // Store generation history in context
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
        
        // Create error summary
        const errorSummary = {
            success: false,
            error: error.message,
            details: error.toString()
        };
        
        // Store failure in history
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