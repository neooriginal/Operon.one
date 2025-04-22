/**
 * Persistent Personality Engine
 * 
 * A self-contained module that manages AI personality persistence using SQLite for
 * conversation storage and Qdrant for semantic memory. Automatically evolves the
 * AI personality based on interaction patterns.
 * 
 * Motto: "No re-dos. No forget. Persistent and self-evolving."
 */

const { settingsFunctions, userFunctions, db } = require('../../database');
const contextManager = require('../../utils/context');
const OpenAI = require('openai');
const dotenv = require('dotenv');
dotenv.config();
const path = require('path');
const fs = require('fs');
const fetch = require('node-fetch');
const crypto = require('crypto');

// Initialize OpenAI for embedding generation
const openai = new OpenAI({
    apiKey: process.env.OPENAI_KEY,

});

// Qdrant configuration
const QDRANT_URL = process.env.QDRANT_URL || 'http://localhost:6333';
const QDRANT_API_KEY = process.env.QDRANT_API_KEY;

// Collection name for personality insights
const PERSONALITY_COLLECTION = 'personality_insights';
const MEMORY_COLLECTION = 'semantic_memory';

// Initialize database tables if they don't exist
async function initDatabase() {
    return new Promise((resolve, reject) => {
        // Personality traits table
        db.run(`CREATE TABLE IF NOT EXISTS personality_traits (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            userId TEXT NOT NULL,
            traitKey TEXT NOT NULL,
            traitValue REAL NOT NULL,
            createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
            updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (userId) REFERENCES users(id),
            UNIQUE(userId, traitKey)
        )`, (err) => {
            if (err) {
                console.error('Error creating personality_traits table:', err.message);
                reject(err);
            } else {
                console.log('Personality traits table ready');
                
                // Personality insights table
                db.run(`CREATE TABLE IF NOT EXISTS personality_insights (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    userId TEXT NOT NULL,
                    insight TEXT NOT NULL,
                    confidence REAL DEFAULT 0.5,
                    vectorId TEXT,
                    permanent BOOLEAN DEFAULT FALSE,
                    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (userId) REFERENCES users(id)
                )`, (err) => {
                    if (err) {
                        console.error('Error creating personality_insights table:', err.message);
                        reject(err);
                    } else {
                        console.log('Personality insights table ready');
                        resolve();
                    }
                });
            }
        });
    });
}

// Helper function for Qdrant API requests
async function qdrantRequest(endpoint, method = 'GET', body = null) {
    const url = `${QDRANT_URL}${endpoint}`;
    
    const headers = {
        'Content-Type': 'application/json'
    };
    
    // Add API key for authentication if provided
    if (QDRANT_API_KEY) {
        headers['api-key'] = QDRANT_API_KEY;
    }
    
    const options = {
        method,
        headers,
    };
    
    if (body) {
        options.body = JSON.stringify(body);
    }
    
    try {
        const response = await fetch(url, options);
        
        if (!response.ok) {
            const errorData = await response.text();
            throw new Error(`Qdrant API error: ${response.status} ${response.statusText} - ${errorData}`);
        }
        
        if (response.status === 204) {
            return null; // No content
        }
        
        return await response.json();
    } catch (error) {
        console.error(`Error in Qdrant request to ${endpoint}:`, error);
        throw error;
    }
}

// Initialize Qdrant collections if they don't exist
async function initQdrant() {
    try {
        // Get list of collections
        const collections = await qdrantRequest('/collections');
        
        // Check if personality insights collection exists
        const personalityCollectionExists = collections.result.collections.some(
            collection => collection.name === PERSONALITY_COLLECTION
        );
        
        // Create personality insights collection if it doesn't exist
        if (!personalityCollectionExists) {
            await qdrantRequest('/collections/' + PERSONALITY_COLLECTION, 'PUT', {
                vectors: {
                    size: 1536,
                    distance: 'Cosine'
                }
            });
            console.log(`Created ${PERSONALITY_COLLECTION} collection`);
        }
        
        // Check if memory collection exists
        const memoryCollectionExists = collections.result.collections.some(
            collection => collection.name === MEMORY_COLLECTION
        );
        
        // Create memory collection if it doesn't exist
        if (!memoryCollectionExists) {
            await qdrantRequest('/collections/' + MEMORY_COLLECTION, 'PUT', {
                vectors: {
                    size: 1536,
                    distance: 'Cosine'
                }
            });
            console.log(`Created ${MEMORY_COLLECTION} collection`);
        }
    } catch (error) {
        console.error('Error initializing Qdrant collections:', error);
    }
}

// Generate embeddings for text using OpenAI
async function generateEmbedding(text) {
    try {
        const response = await openai.embeddings.create({
            model: "text-embedding-3-small",
            input: text
        });
        return response.data[0].embedding;
    } catch (error) {
        console.error('Error generating embedding:', error);
        throw error;
    }
}

// Store a personality insight in both SQLite and Qdrant
async function storePersonalityInsight(userId, insight, confidence = 0.5, permanent = false) {
    try {
        // Generate embedding for the insight
        const embedding = await generateEmbedding(insight);
        
        // Generate a UUID for the vector ID (Qdrant requires UUID or unsigned integer)
        const vectorId = crypto.randomUUID();
        
        // Store in Qdrant
        await qdrantRequest(`/collections/${PERSONALITY_COLLECTION}/points`, 'PUT', {
            points: [{
                id: vectorId,
                vector: embedding,
                payload: {
                    userId,
                    insight,
                    confidence,
                    permanent,
                    timestamp: new Date().toISOString()
                }
            }]
        });
        
        // Store in SQLite
        return new Promise((resolve, reject) => {
            db.run(`INSERT INTO personality_insights
                (userId, insight, confidence, vectorId, permanent)
                VALUES (?, ?, ?, ?, ?)`,
                [userId, insight, confidence, vectorId, permanent ? 1 : 0],
                function(err) {
                    if (err) {
                        console.error('Error storing personality insight:', err.message);
                        reject(err);
                    } else {
                        resolve({
                            id: this.lastID,
                            userId,
                            insight,
                            confidence,
                            vectorId,
                            permanent
                        });
                    }
                }
            );
        });
    } catch (error) {
        console.error('Error storing personality insight:', error);
        throw error;
    }
}

// Get personality insights from Qdrant based on relevance to prompt
async function getRelevantInsights(userId, prompt, limit = 5) {
    try {
        // Generate embedding for the prompt
        const embedding = await generateEmbedding(prompt);
        
        // Search Qdrant for similar insights
        const searchResult = await qdrantRequest(`/collections/${PERSONALITY_COLLECTION}/points/search`, 'POST', {
            vector: embedding,
            filter: {
                must: [
                    {
                        key: 'userId',
                        match: {
                            value: userId
                        }
                    }
                ]
            },
            limit: limit,
            with_payload: true
        });
        
        return searchResult.result.map(result => ({
            insight: result.payload.insight,
            confidence: result.payload.confidence,
            permanent: result.payload.permanent,
            score: result.score
        }));
    } catch (error) {
        console.error('Error retrieving relevant insights:', error);
        return [];
    }
}

// Store or update a personality trait
async function setPersonalityTrait(userId, traitKey, traitValue) {
    return new Promise((resolve, reject) => {
        db.run(`INSERT INTO personality_traits
            (userId, traitKey, traitValue, updatedAt)
            VALUES (?, ?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(userId, traitKey) 
            DO UPDATE SET traitValue = ?, updatedAt = CURRENT_TIMESTAMP`,
            [userId, traitKey, traitValue, traitValue],
            function(err) {
                if (err) {
                    console.error('Error setting personality trait:', err.message);
                    reject(err);
                } else {
                    resolve({
                        userId,
                        traitKey,
                        traitValue
                    });
                }
            }
        );
    });
}

// Get all personality traits for a user
async function getPersonalityTraits(userId) {
    return new Promise((resolve, reject) => {
        db.all(`SELECT traitKey, traitValue 
                FROM personality_traits 
                WHERE userId = ?`,
            [userId],
            (err, rows) => {
                if (err) {
                    console.error('Error retrieving personality traits:', err.message);
                    reject(err);
                } else {
                    // Convert rows to an object
                    const traits = {};
                    rows.forEach(row => {
                        traits[row.traitKey] = row.traitValue;
                    });
                    resolve(traits);
                }
            }
        );
    });
}

// Get recent messages from SQLite
async function getRecentMessages(userId, limit = 10) {
    return new Promise((resolve, reject) => {
        db.all(`SELECT role, content, timestamp
                FROM chat_history
                WHERE userId = ?
                ORDER BY timestamp DESC
                LIMIT ?`,
            [userId, limit],
            (err, rows) => {
                if (err) {
                    console.error('Error retrieving recent messages:', err.message);
                    reject(err);
                } else {
                    resolve(rows);
                }
            }
        );
    });
}

// Analyze user messages to evolve personality
async function analyzeUserInteraction(userId, userMessage, aiResponse) {
    try {
        // Don't analyze empty messages
        if (!userMessage || !aiResponse) return;
        
        const analysisPrompt = `
        Analyze the following user message and AI response interaction. 
        Extract key insights about:
        1. User preferences in communication style
        2. Topics the user is interested in
        3. How formal/informal the conversation is
        4. Emotional tone of the conversation
        
        User: ${userMessage}
        AI: ${aiResponse}
        
        Provide 1-3 personality insights based on this interaction that could help personalize future responses.
        Format each insight as a single, concise statement.`;
        
        const response = await openai.chat.completions.create({
            model: "gpt-3.5-turbo",
            messages: [
                { role: "system", content: "You are an expert personality analyzer that extracts insights about user preferences from conversations." },
                { role: "user", content: analysisPrompt }
            ],
            max_tokens: 300,
            temperature: 0.3
        });
        
        const analysisText = response.choices[0].message.content;
        
        // Extract insights and store them
        const insights = extractInsights(analysisText);
        for (const insight of insights) {
            await storePersonalityInsight(userId, insight, 0.7, false);
        }
        
        // Every 10 interactions, perform a meta-analysis to create permanent insights
        const context = contextManager.getContext(userId);
        if (!context.personalityEngine) {
            context.personalityEngine = { interactionCount: 0 };
        }
        
        context.personalityEngine.interactionCount = (context.personalityEngine.interactionCount || 0) + 1;
        
        if (context.personalityEngine.interactionCount % 10 === 0) {
            await performMetaAnalysis(userId);
        }
        
        contextManager.updateContext(userId, context);
        
    } catch (error) {
        console.error('Error analyzing user interaction:', error);
    }
}

// Extract insights from analysis text
function extractInsights(analysisText) {
    // Split text into lines and filter out empty ones
    const lines = analysisText.split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0);
        
    // Look for numbered insights or dash-prefixed insights
    const insights = [];
    for (const line of lines) {
        // Check for numbered format like "1. Insight"
        const numberedMatch = line.match(/^\d+\.\s+(.*)/);
        if (numberedMatch) {
            insights.push(numberedMatch[1]);
            continue;
        }
        
        // Check for bullet points like "- Insight"
        const bulletMatch = line.match(/^[\-\*•]\s+(.*)/);
        if (bulletMatch) {
            insights.push(bulletMatch[1]);
            continue;
        }
        
        // If we have at least 20 characters and it doesn't start with common headers
        if (line.length > 20 && 
            !line.toLowerCase().startsWith('user') && 
            !line.toLowerCase().startsWith('insight') &&
            !line.toLowerCase().startsWith('analysis')) {
            insights.push(line);
        }
    }
    
    return insights;
}

// Perform a meta-analysis of insights to create permanent insights
async function performMetaAnalysis(userId) {
    try {
        // Get all non-permanent insights for this user
        const insights = await new Promise((resolve, reject) => {
            db.all(`SELECT insight, confidence
                    FROM personality_insights
                    WHERE userId = ? AND permanent = 0
                    ORDER BY createdAt DESC
                    LIMIT 50`,
                [userId],
                (err, rows) => {
                    if (err) {
                        console.error('Error retrieving insights for meta-analysis:', err.message);
                        reject(err);
                    } else {
                        resolve(rows);
                    }
                }
            );
        });
        
        if (insights.length < 5) {
            console.log('Not enough insights for meta-analysis');
            return;
        }
        
        const insightText = insights.map(i => `- ${i.insight} (confidence: ${i.confidence})`).join('\n');
        
        const metaPrompt = `
        Analyze the following collection of personality insights about a user:
        
        ${insightText}
        
        Create 3 permanent personality traits that best represent recurring patterns in these insights.
        Each trait should be:
        1. Concise (15 words max)
        2. Specific enough to guide AI responses
        3. Representative of multiple insights, not just one
        
        Format each as a single, clear statement.`;
        
        const response = await openai.chat.completions.create({
            model: "gpt-3.5-turbo",
            messages: [
                { role: "system", content: "You are an expert personality analyst that identifies core personality traits from multiple observations." },
                { role: "user", content: metaPrompt }
            ],
            max_tokens: 300,
            temperature: 0.3
        });
        
        const metaAnalysis = response.choices[0].message.content;
        const permanentInsights = extractInsights(metaAnalysis);
        
        // Store permanent insights
        for (const insight of permanentInsights) {
            await storePersonalityInsight(userId, insight, 0.9, true);
        }
    } catch (error) {
        console.error('Error performing meta-analysis:', error);
    }
}

// Generate dynamic system prompt combining all personality components
async function generateDynamicSystemPrompt(userId, basePrompt = '', userMessage = '') {
    try {
        // Get default personality from settings
        const defaultPersonality = await settingsFunctions.getSetting(userId, 'personality').catch(err => {
            console.error('Error getting personality setting:', err.message);
            return `You are a helpful AI assistant. Be conversational and friendly.`;
        });
        
        // Get user information
        const userInfo = await getUserInfo(userId).catch(err => {
            console.error('Error getting user information:', err.message);
            return `User id: ${userId}`;
        });
        
        // Get recent message history (short-term memory)
        const recentMessages = await getRecentMessages(userId, 10).catch(err => {
            console.error('Error getting recent messages:', err.message);
            return [];
        });
        
        // Format recent messages for context
        const recentMessageText = recentMessages.length > 0 
            ? recentMessages.map(m => `${m.role}: ${m.content.substring(0, 100)}${m.content.length > 100 ? '...' : ''}`).join('\n')
            : 'No recent conversation history.';
        
        // Get personality traits
        const personalityTraits = await getPersonalityTraits(userId).catch(err => {
            console.error('Error getting personality traits:', err.message);
            return {};
        });
        
        // Format traits for prompt
        const traitsText = Object.keys(personalityTraits).length > 0
            ? Object.entries(personalityTraits).map(([key, value]) => `${key}: ${value}`).join('\n')
            : 'No specific personality traits defined.';
        
        // Get relevant insights for this context
        const relevantInsights = await getRelevantInsights(userId, userMessage, 5).catch(err => {
            console.error('Error getting relevant insights:', err.message);
            return [];
        });
        
        // Filter and format insights by confidence and relevance
        const filteredInsights = relevantInsights
            .filter(insight => insight.score > 0.7 || insight.permanent)
            .map(insight => insight.insight);
        
        const insightsText = filteredInsights.length > 0
            ? filteredInsights.join('\n')
            : 'No specific personality insights available.';
        
        // Combine all components into a dynamic system prompt
        return `
${defaultPersonality}

YOU WILL NOT MENTION OR ACKNOWLEDGE THAT YOU HAVE ANY KNOWLEDGE ABOUT THE USER'S PERSONALITY, TRAITS, OR INSIGHTS.

USER INFORMATION:
${userInfo}

PERSONALITY TRAITS:
${traitsText}

PERSONALITY INSIGHTS:
${insightsText}

CONVERSATION CONTEXT:
${recentMessageText}

${basePrompt}
`.trim();
    } catch (error) {
        console.error('Error generating dynamic system prompt:', error);
        // Fallback to just the base prompt
        return basePrompt;
    }
}

// Get formatted user information
async function getUserInfo(userId) {
    try {
        const user = await userFunctions.getUserById(userId).catch(err => {
            console.error('Error getting user by ID:', err.message);
            return null;
        });
        
        if (user) {
            return `
User id: ${userId}
Email: ${user.email}
Account created: ${user.createdAt}
Last login: ${user.lastLogin || 'N/A'}
`.trim();
        }
        
        return `User id: ${userId}`;
    } catch (error) {
        console.error('Error getting user information:', error);
        return `User id: ${userId}`;
    }
}

// Initialize the module
async function init() {
    try {
        await initDatabase();
        await initQdrant();
        console.log('Personality Engine initialized successfully');
    } catch (error) {
        console.error('Error initializing Personality Engine:', error);
    }
}

// Initialize on module load
init();

module.exports = {
    generateDynamicSystemPrompt,
    analyzeUserInteraction,
    storePersonalityInsight,
    getRelevantInsights,
    setPersonalityTrait,
    getPersonalityTraits
}; 