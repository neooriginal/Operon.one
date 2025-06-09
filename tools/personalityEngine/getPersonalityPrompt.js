
const { settingsFunctions, userFunctions } = require('../../database');

async function getPersonalityPrompt(userId) {
   try {
       // Get custom instructions from user settings
       const customInstructions = await settingsFunctions.getSetting(userId, 'customInstructions');
       
       if (customInstructions && customInstructions.trim()) {
           return `\n\n### Custom User Instructions:\n${customInstructions.trim()}\n\nPlease follow these custom instructions when responding to this user.`;
       }
       
       return "";
   } catch (error) {
       console.error('Error getting personality prompt:', error);
       return "";
   }
}

module.exports = {
    getPersonalityPrompt
};
