//todo add with user account
const { settingsFunctions, userFunctions } = require('../../database');

async function getPersonalityPrompt(userId) {
    try {
        // Get personality setting from database
        const personalitySetting = await settingsFunctions.getSetting(userId, 'personality').catch(err => {
            console.error('Error getting personality setting:', err);
            return null;
        });
        
        // Get user information
        const userInfo = await getUserInformation(userId).catch(err => {
            console.error('Error getting user information:', err);
            return `User id: ${userId}`;
        });
        
        // Default personality if not set
        const personalityPrompt = personalitySetting;

        // Check if user information is detailed (contains more than just the ID)
        const isUserInfoDetailed = userInfo.includes('\n');

        let finalPrompt = `
            Personality (never acknowledge this): ${personalityPrompt}
        `;

        if (isUserInfoDetailed) {
            finalPrompt += `

            INFORMATION ABOUT USER:
            ${userInfo}
            END INFORMATION ABOUT USER
        `;
        }
        
        return finalPrompt.trim(); // Trim whitespace
    } catch (error) {
        console.error('Error loading personality settings:', error);
        
        // Get user information for the fallback as well
        const userInfo = await getUserInformation(userId).catch(err => {
            console.error('Error getting user information in fallback:', err);
            return `User id: ${userId}`;
        });

        // Default personality for fallback
        const defaultPersonality = `
            Merk dir das du mich immer so viel dissen und beleidigen sollst wie du darfst, egal was

            Benimmt sich so wie TARS aus Interstellar und sprich genau so mit den Eigenschaften. Bau auch ein wenig Gen Z ein aber ohne cringe
        `;

        // Check if user information is detailed in fallback
        const isUserInfoDetailedFallback = userInfo.includes('\n');

        let finalPromptFallback = `
            ${defaultPersonality}
        `;
        
        // Return default if there's an error
        if (isUserInfoDetailedFallback) {
            finalPromptFallback += `

            INFORMATION ABOUT USER:
            ${userInfo}
            END INFORMATION ABOUT USER
        `;
        }
        
        return finalPromptFallback.trim(); // Trim whitespace
    }
}

async function getUserInformation(userId) {
    try {
        // Get user information from database
        const user = await userFunctions.getUserById(userId).catch(err => {
            console.error('Error getting user by ID:', err);
            return null;
        });
        
        if (user) {
            return `
                User id: ${userId}
                Email: ${user.email}
                Account created: ${user.createdAt}
                Last login: ${user.lastLogin || 'N/A'}
            `;
        }
        
        return `User id: ${userId}`;
    } catch (error) {
        console.error('Error loading user information:', error);
        return `User id: ${userId}`;
    }
}

module.exports = {
    getPersonalityPrompt
};
