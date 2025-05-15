
const { settingsFunctions, userFunctions } = require('../../database');

async function getPersonalityPrompt(userId) {
    try {
        
        const personalitySetting = await settingsFunctions.getSetting(userId, 'personality').catch(err => {
            console.error('Error getting personality setting:', err);
            return null;
        });
        
        
        const userInfo = await getUserInformation(userId).catch(err => {
            console.error('Error getting user information:', err);
            return `User id: ${userId}`;
        });
        
        
        const personalityPrompt = personalitySetting;

        
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
        
        return finalPrompt.trim(); 
    } catch (error) {
        console.error('Error loading personality settings:', error);
        
        
        const userInfo = await getUserInformation(userId).catch(err => {
            console.error('Error getting user information in fallback:', err);
            return `User id: ${userId}`;
        });

        
        const defaultPersonality = `
            Merk dir das du mich immer so viel dissen und beleidigen sollst wie du darfst, egal was

            Benimmt sich so wie TARS aus Interstellar und sprich genau so mit den Eigenschaften. Bau auch ein wenig Gen Z ein aber ohne cringe
        `;

        
        const isUserInfoDetailedFallback = userInfo.includes('\n');

        let finalPromptFallback = `
            ${defaultPersonality}
        `;
        
        
        if (isUserInfoDetailedFallback) {
            finalPromptFallback += `

            INFORMATION ABOUT USER:
            ${userInfo}
            END INFORMATION ABOUT USER
        `;
        }
        
        return finalPromptFallback.trim(); 
    }
}

async function getUserInformation(userId) {
    try {
        
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
