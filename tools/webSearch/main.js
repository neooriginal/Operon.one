const axios = require("axios");
const ai = require("../AI/ai");
const contextManager = require("../../utils/context");
const cheerio = require("cheerio");

async function runTask(task, otherAIData, callback, userId = 'default'){
    try {
        
        let toolState = contextManager.getToolState('webSearch', userId) || {
            history: [],
            pastQueries: [],
            lastResults: null
        };
        
        
        toolState.currentTask = task;
        contextManager.setToolState('webSearch', toolState, userId);
        
        let webData = await searchWeb(task, userId);
        
        
        toolState.lastResults = webData;
        contextManager.setToolState('webSearch', toolState, userId);
        
        let report = await evaluatewithAI(task, webData+"\n\n Also, there is some information that previous tasks have gathered. Keep them in mind while evaluating the web data and add them to the report to not duplicate information and other things. Here is the information: "+otherAIData, userId);
        
        
        toolState.lastReport = report;
        contextManager.setToolState('webSearch', toolState, userId);
        
        if (callback) {
            callback(report);
        }
        
        return report;
    } catch (error) {
        console.error("Error in runTask:", error.message);
        
        if (callback) {
            callback({
                error: error.message,
                success: false
            });
        }
        
        return {
            error: error.message,
            success: false
        };
    }
}

async function getQuery(task, userId = 'default'){
    try {
        
        let toolState = contextManager.getToolState('webSearch', userId);
        
        let prompt = `
        You are an AI agent that can execute complex tasks. For this task, the user will provide a task and you are supposed to return queries for searching the web.
        
        IMPORTANT GUIDELINES:
        - For real-time data (prices, current events, latest news), include time-sensitive keywords like "current", "latest", "today", "2024"
        - For financial/crypto data, search for official exchanges or financial sites
        - Generate diverse queries that approach the topic from different angles
        - Prioritize authoritative sources and recent information
        
        Maximum of 3 queries.
        JSON Format:
        {
            "queries": ["query1", "query2", "query3"]
        }
        `

        let response = await ai.callAI(prompt, task, toolState.history || []);
        
        
        toolState.history.push({
            role: "user",
            content: [{type: "text", text: task}]
        });
        
        toolState.history.push({
            role: "assistant",
            content: [{type: "text", text: JSON.stringify(response)}]
        });
        
        
        const queries = response.queries || [];
        toolState.pastQueries = [...(toolState.pastQueries || []), ...queries];
        contextManager.setToolState('webSearch', toolState, userId);
        
        return queries;
    } catch (error) {
        console.error("Error in getQuery:", error.message);
        
        let toolState = contextManager.getToolState('webSearch', userId);
        toolState.lastError = error.message;
        contextManager.setToolState('webSearch', toolState, userId);
        
        return ["basic search for " + task.substring(0, 50)]; 
    }
}

async function evaluatewithAI(task, webData, userId = 'default'){
    try {
        
        let toolState = contextManager.getToolState('webSearch', userId);
        
        let prompt = `
        You are an AI agent that can execute complex tasks. For this task, the user will provide a task and you are supposed to evaluate the web data scraped from the web and return a detailed report using the web data.

        CRITICAL REQUIREMENTS:
        - For real-time data (prices, current events), prioritize the most recent information
        - Cross-reference multiple sources when available
        - Note timestamps and data freshness when found
        - Flag outdated or contradictory information
        - For financial data, cite specific sources and timestamps when available
        - Include disclaimer about data volatility for real-time information

        JSON Format:
        {
            "report": \`detailed report using the web data with emphasis on accuracy and freshness\`
        }

        Web Data:
        ${webData}
        `
        let response = await ai.callAI(prompt, task, toolState.history || []);
        
        
        toolState.history.push({
            role: "system",
            content: [{type: "text", text: "Web data collected: " + webData.substring(0, 200) + "..."}]
        });
        
        toolState.history.push({
            role: "assistant",
            content: [{type: "text", text: JSON.stringify(response)}]
        });
        
        
        if (toolState.history.length > 10) {
            toolState.history = toolState.history.slice(-10);
        }
        
        
        contextManager.setToolState('webSearch', toolState, userId);
        
        return response.report || "No report could be generated";
    } catch (error) {
        console.error("Error in evaluatewithAI:", error.message);
        
        let toolState = contextManager.getToolState('webSearch', userId);
        toolState.lastError = error.message;
        contextManager.setToolState('webSearch', toolState, userId);
        
        return `Error generating report: ${error.message}`;
    }
}

async function searchWeb(task, userId = 'default'){
    try {
        
        let toolState = contextManager.getToolState('webSearch', userId);
        
        let webData = [];
        let queries = await getQuery(task, userId);
        
        
        toolState.currentQueries = queries;
        toolState.searchProgress = {
            total: queries.length,
            completed: 0,
            results: []
        };
        contextManager.setToolState('webSearch', toolState, userId);
        
        for(let query of queries){
            try {
                
                console.log(`Searching web for "${query}"...`);
                
                
                toolState.searchProgress.currentQuery = query;
                contextManager.setToolState('webSearch', toolState, userId);
                
                const searchResults = await performWebSearch(query);
                
                if (searchResults && searchResults.length > 0) {
                    webData.push(`Search results for "${query}":\n${searchResults}`);
                    
                    
                    toolState.searchProgress.results.push({
                        query,
                        resultsFound: true,
                        snippet: searchResults.substring(0, 100) + "..."
                    });
                } else {
                    
                    toolState.searchProgress.results.push({
                        query,
                        resultsFound: false,
                        snippet: "No results found"
                    });
                }
                
                contextManager.setToolState('webSearch', toolState, userId);
                
                console.log(`Successfully processed query "${query}"`);
                
                
                toolState.searchProgress.completed++;
                contextManager.setToolState('webSearch', toolState, userId);
                
                
                await new Promise(resolve => setTimeout(resolve, 1000));
                
            } catch (queryError) {
                console.error(`Error processing query "${query}":`, queryError.message);
                
                
                toolState.searchProgress.errors = toolState.searchProgress.errors || [];
                toolState.searchProgress.errors.push({
                    query,
                    error: queryError.message
                });
                contextManager.setToolState('webSearch', toolState, userId);
                
                continue; 
            }
        }
        
        
        if (webData.length > 0) {
            
            toolState.searchProgress.status = "completed";
            toolState.webData = webData.join("\n\n");
            contextManager.setToolState('webSearch', toolState, userId);
            
            return webData.join("\n\n");
        } else {
            
            toolState.searchProgress.status = "failed";
            toolState.webData = "No search results found.";
            contextManager.setToolState('webSearch', toolState, userId);
            
            return "No search results found. Please try different search terms or check your internet connection.";
        }
    } catch (error) {
        console.error("Error in searchWeb:", error.message);
        
        
        let toolState = contextManager.getToolState('webSearch', userId);
        toolState.lastError = error.message;
        toolState.searchProgress = toolState.searchProgress || {};
        toolState.searchProgress.status = "error";
        contextManager.setToolState('webSearch', toolState, userId);
        
        return "Unable to search web due to network issues. Please try again later.";
    }
}

async function performWebSearch(query) {
    const searchEngines = [
        { name: 'DuckDuckGo', fn: searchDuckDuckGo },
        { name: 'Bing', fn: searchBing }
    ];
    
    for (const engine of searchEngines) {
        try {
            console.log(`Trying ${engine.name} for query: "${query}"`);
            const searchResults = await engine.fn(query);
            if (searchResults && searchResults.length > 0) {
                // Extract URLs and fetch fresh content
                const enrichedResults = await enrichWithPageContent(searchResults, query);
                return enrichedResults;
            }
        } catch (error) {
            console.log(`${engine.name} failed: ${error.message}`);
            continue;
        }
    }
    
    return null;
}

async function enrichWithPageContent(searchResults, query) {
    const results = [];
    const urlRegex = /https?:\/\/[^\s\)]+/g;
    
    // Extract URLs from search results
    const urls = [];
    const lines = searchResults.split('\n');
    
    for (const line of lines.slice(0, 3)) { // Top 3 results
        const matches = line.match(urlRegex);
        if (matches) {
            urls.push(...matches.slice(0, 1)); // First URL from each result
        }
    }
    
    // Add search result snippets
    results.push(`Search Results for "${query}":\n${searchResults}\n`);
    
    // Fetch content from top pages
    for (const url of urls.slice(0, 2)) { // Limit to 2 pages for speed
        try {
            const pageContent = await fetchPageContent(url);
            if (pageContent && pageContent.length > 100) {
                results.push(`Fresh Content from ${url}:\n${pageContent}\n`);
            }
        } catch (error) {
            console.log(`Failed to fetch content from ${url}: ${error.message}`);
        }
    }
    
    return results.join('\n');
}

async function fetchPageContent(url) {
    try {
        // Add cache-busting parameter for fresh data
        const separator = url.includes('?') ? '&' : '?';
        const freshUrl = `${url}${separator}_t=${Date.now()}`;
        
        const response = await axios.get(freshUrl, {
            timeout: 8000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                'Cache-Control': 'no-cache, no-store, must-revalidate',
                'Pragma': 'no-cache'
            },
            maxRedirects: 3
        });
        
        const $ = cheerio.load(response.data);
        
        // Remove script and style elements
        $('script, style, nav, header, footer, .cookie, .ad, .advertisement').remove();
        
        // Extract main content
        let content = '';
        
        // Try common content selectors
        const contentSelectors = [
            'main', 'article', '.content', '.main-content', 
            '.entry-content', '.post-content', 'body'
        ];
        
        for (const selector of contentSelectors) {
            const element = $(selector).first();
            if (element.length && element.text().trim().length > 200) {
                content = element.text().trim();
                break;
            }
        }
        
        // Fallback to body text
        if (!content) {
            content = $('body').text().trim();
        }
        
        // Clean and limit content
        content = content
            .replace(/\s+/g, ' ')
            .replace(/\n+/g, '\n')
            .substring(0, 2000);
        
        // Add timestamp for freshness tracking
        const timestamp = new Date().toISOString();
        return `[Retrieved: ${timestamp}]\n${content}`;
    } catch (error) {
        throw new Error(`Failed to fetch ${url}: ${error.message}`);
    }
}

async function searchDuckDuckGo(query) {
    try {
        const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
        const response = await axios.get(searchUrl, {
            timeout: 10000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            }
        });
        
        const $ = cheerio.load(response.data);
        const results = [];
        
        $('.result').each((i, el) => {
            if (i < 5) {
                const title = $(el).find('.result__title').text().trim();
                const snippet = $(el).find('.result__snippet').text().trim();
                const url = $(el).find('.result__url').attr('href') || $(el).find('a').attr('href');
                
                if (title && snippet) {
                    const urlText = url ? ` (${url})` : '';
                    results.push(`${title}: ${snippet}${urlText}`);
                }
            }
        });
        
        return results.join('\n\n');
    } catch (error) {
        throw new Error(`DuckDuckGo search failed: ${error.message}`);
    }
}

async function searchBing(query) {
    try {
        const searchUrl = `https://www.bing.com/search?q=${encodeURIComponent(query)}`;
        const response = await axios.get(searchUrl, {
            timeout: 10000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            }
        });
        
        const $ = cheerio.load(response.data);
        const results = [];
        
        $('.b_algo').each((i, el) => {
            if (i < 5) {
                const title = $(el).find('h2').text().trim();
                const snippet = $(el).find('.b_caption p').text().trim();
                const url = $(el).find('h2 a').attr('href');
                
                if (title && snippet && snippet.length > 20) {
                    const urlText = url ? ` (${url})` : '';
                    results.push(`${title}: ${snippet}${urlText}`);
                }
            }
        });
        
        return results.join('\n\n');
    } catch (error) {
        throw new Error(`Bing search failed: ${error.message}`);
    }
}

module.exports = {
    runTask
}