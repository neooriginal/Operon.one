const axios = require("axios");
const ai = require("../AI/ai");
const contextManager = require("../../utils/context");
const cheerio = require("cheerio");

// Sidebar management
function updateDeepSearchSidebar(userId, data) {
    if (typeof global.updateSidebar === 'function') {
        global.updateSidebar(userId, 'deepSearch', {
            ...data,
            timestamp: Date.now()
        });
    }
}


const cache = {
    data: {},
    set: function(key, value, ttlSeconds = 3600) {
        this.data[key] = {
            value,
            expiry: Date.now() + (ttlSeconds * 1000)
        };
    },
    get: function(key) {
        const item = this.data[key];
        if (!item) return null;
        if (Date.now() > item.expiry) {
            delete this.data[key];
            return null;
        }
        return item.value;
    }
};

async function runTask(task, otherAIData, callback, userId = 'default', intensity) {
    try {
        
        let userContext = contextManager.getContext(userId);
        if (!userContext.deepSearch) {
            userContext.deepSearch = {
                searchHistory: [],
                lastQueries: []
            };
            contextManager.updateContext(userId, userContext);
        }

        let webData = await searchWeb(task, userId, intensity);
        
        
        userContext.deepSearch.searchHistory.push({
            task,
            timestamp: new Date().toISOString(),
            intensity: intensity
        });
        contextManager.updateContext(userId, userContext);
        
        let report = await evaluatewithAI(task, webData+"\n\n Also, there is some information that previous tasks have gathered. Keep them in mind while evaluating the web data and add them to the report to not duplicate information and other things. Here is the information: "+otherAIData, userId);
        
        // Update sidebar with completion status
        updateDeepSearchSidebar(userId, {
            currentTask: task,
            status: 'Report completed',
            reportSummary: report.substring(0, 200) + (report.length > 200 ? '...' : ''),
            completed: true
        });
        
        callback(report);
    } catch (error) {
        console.error("Error in runTask:", error.message);
        callback(`Error executing task: ${error.message}`);
    }
}

async function getQuery(task, userId = 'default', intensity) {
    try {
        
        const maxQueries = intensity ? Math.min(Math.max(5, intensity * 4), 40) : 20;
        
        let prompt = `
        You are an AI agent that can execute complex tasks. For this task, the user will provide a task and you are supposed to return queries for searching the web.
        Return diverse queries covering different aspects of the task.
        Maximum of ${maxQueries} queries.
        JSON Format:
        {
            "queries": ["query1", "query2", "query3"]
        }
        `

        let response = await ai.callAI(prompt, task);
        
        
        let userContext = contextManager.getContext(userId);
        userContext.deepSearch.lastQueries = response.queries || [];
        contextManager.updateContext(userId, userContext);
        
        return response.queries || [];
    } catch (error) {
        console.error("Error in getQuery:", error.message);
        return ["basic search for " + task.substring(0, 50)]; 
    }
}

async function evaluatewithAI(task, webData, userId = 'default') {
    try {
        let prompt = `
        You are an AI agent that can execute complex tasks. For this task, the user will provide a task and you are supposed to evaluate the web data scraped from the web and return a detailled report using the web data.
        
        Include all relevant information found in the search results.
        Add citations to sources where appropriate.
        Structure your report with clear sections and highlights.

        JSON Format:
        {
            "report": \`report using the web data\`
        }

        Web Data:
        ${webData}
        `
        
        
        let userContext = contextManager.getContext(userId);
        if (!userContext.deepSearch.evaluations) {
            userContext.deepSearch.evaluations = [];
        }
        
        let response = await ai.callAI(prompt, task);
        
        
        userContext.deepSearch.evaluations.push({
            task,
            timestamp: new Date().toISOString(),
            summary: response.report?.substring(0, 100) + "..." || "No report"
        });
        contextManager.updateContext(userId, userContext);
        
        return response.report || "No report could be generated";
    } catch (error) {
        console.error("Error in evaluatewithAI:", error.message);
        return `Error generating report: ${error.message}`;
    }
}

async function searchWeb(task, userId = 'default', intensity) {
    try {
        let webData = [];
        let queries = await getQuery(task, userId, intensity);
        
        // Update sidebar with current search status
        updateDeepSearchSidebar(userId, {
            currentTask: task,
            status: 'Searching web...',
            queriesGenerated: queries.length,
            queries: queries.slice(0, 5) // Show first 5 queries
        });
        
        const queryLimit = intensity ? Math.min(Math.max(3, intensity * 2), 20) : 8;
        queries = queries.slice(0, queryLimit);
        
        
        const results = await Promise.all(queries.map(async (query) => {
            try {
                
                const bingResults = await getBingResults(query, intensity);
                
                const queryData = [];
                
                if (bingResults && bingResults.length > 0) {
                    queryData.push(`Bing results for "${query}":\n${bingResults}`);
                }
                
                return queryData;
            } catch (queryError) {
                console.error(`Error processing query "${query}":`, queryError.message);
                return []; 
            }
        }));
        
        
        webData = results.flat();
        
        
        // Update sidebar with results found
        updateDeepSearchSidebar(userId, {
            currentTask: task,
            status: 'Processing results...',
            queriesProcessed: queries.length,
            resultsFound: webData.length
        });
        
        if (webData.length > 0) {
            return webData.join("\n\n");
        } else {
            updateDeepSearchSidebar(userId, {
                currentTask: task,
                status: 'No results found',
                queriesProcessed: queries.length,
                resultsFound: 0
            });
            return "No search results found. Please try different search terms or check your internet connection.";
        }
    } catch (error) {
        console.error("Error in searchWeb:", error.message);
        return "Unable to search web due to network issues. Please try again later.";
    }
}

async function getBingResults(query, intensity = 5) {
    try {
        const resultLimit = intensity ? Math.min(Math.max(5, intensity * 2), 15) : 8;
        const searchUrl = `https://www.bing.com/search?q=${encodeURIComponent(query)}`;
        const response = await axios.get(searchUrl, {
            timeout: 8000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            }
        });
        
        const $ = cheerio.load(response.data);
        const results = [];
        
        $('.b_algo').each((i, el) => {
            if (i < resultLimit) {
                const title = $(el).find('h2').text().trim();
                const snippet = $(el).find('.b_caption p').text().trim();
                if (snippet.length > 20) {
                    results.push(`${title}: ${snippet}`);
                }
            }
        });
        
        return results.join('\n\n');
    } catch (error) {
        console.error("Error fetching Bing results:", error.message);
        return null;
    }
}

module.exports = {
    runTask
}