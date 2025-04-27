const axios = require("axios");
const ai = require("../AI/ai");
const contextManager = require("../../utils/context");

async function runTask(task, otherAIData, callback, userId = 'default', intensity){
    try {
        // Get or initialize user-specific context
        let userContext = contextManager.getContext(userId);
        if (!userContext.deepSearch) {
            userContext.deepSearch = {
                searchHistory: [],
                lastQueries: []
            };
            contextManager.updateContext(userId, userContext);
        }

        let webData = await searchWeb(task, userId, intensity);
        
        // Store search in history
        userContext.deepSearch.searchHistory.push({
            task,
            timestamp: new Date().toISOString(),
            intensity: intensity
        });
        contextManager.updateContext(userId, userContext);
        
        let report = await evaluatewithAI(task, webData+"\n\n Also, there is some information that previous tasks have gathered. Keep them in mind while evaluating the web data and add them to the report to not duplicate information and other things. Here is the information: "+otherAIData, userId);
        callback(report);
    } catch (error) {
        console.error("Error in runTask:", error.message);
        callback(`Error executing task: ${error.message}`);
    }
}

async function getQuery(task, userId = 'default', intensity){
    try {
        // Determine the maximum number of queries based on intensity
        const maxQueries = intensity ? Math.min(Math.max(3, intensity * 3), 30) : 15;
        
        let prompt = `
        You are an AI agent that can execute complex tasks. For this task, the user will provide a task and you are supposed to return queries for searching the web.
        Maximum of ${maxQueries} queries.
        JSON Format:
        {
            "queries": ["query1", "query2", "query3"]
        }
        `

        let response = await ai.callAI(prompt, task);
        
        // Store queries in user context
        let userContext = contextManager.getContext(userId);
        userContext.deepSearch.lastQueries = response.queries || [];
        contextManager.updateContext(userId, userContext);
        
        return response.queries || [];
    } catch (error) {
        console.error("Error in getQuery:", error.message);
        return ["basic search for " + task.substring(0, 50)]; // Fallback query
    }
}

async function evaluatewithAI(task, webData, userId = 'default'){
    try {
        let prompt = `
        You are an AI agent that can execute complex tasks. For this task, the user will provide a task and you are supposed to evaluate the web data scraped from the web and return a detailled report using the web data.

        JSON Format:
        {
            "report": \`report using the web data\`
        }

        Web Data:
        ${webData}
        `
        
        // Get user context to check for any previous evaluations
        let userContext = contextManager.getContext(userId);
        if (!userContext.deepSearch.evaluations) {
            userContext.deepSearch.evaluations = [];
        }
        
        let response = await ai.callAI(prompt, task);
        
        // Store evaluation in context
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

async function searchWeb(task, userId = 'default', intensity){
    try {
        let urls = [];
        let webData = [];
        let queries = await getQuery(task, userId, intensity);
        
        // Limit number of queries based on intensity (default is 5 if not specified)
        const queryLimit = intensity ? Math.min(Math.max(1, intensity), 10) : 5;
        queries = queries.slice(0, queryLimit);
        
        for(let query of queries){
            try {
                // Get DuckDuckGo search results
                let duckDuckGoResults = await getDuckDuckGoResults(query, intensity);
                if (duckDuckGoResults && duckDuckGoResults.length > 0) {
                    webData.push(`DuckDuckGo results for "${query}":\n${duckDuckGoResults}`);
                }
                
                // Get Wikipedia article
                let wikipediaArticle = await getWikipediaArticle(query);
                if (wikipediaArticle) {
                    webData.push(`Wikipedia article on "${query}":\n${wikipediaArticle}`);
                }
                
                // Use more reliable search API instead of screen scraping
                try {
                    // For now, let's use a more reliable public API - Wikipedia's API for related articles
                    if (wikipediaArticle) {
                        // Adjust the number of related articles based on intensity
                        const relatedLimit = intensity ? Math.min(Math.max(1, intensity), 10) : 5;
                        const relatedArticlesUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&format=json&srlimit=${relatedLimit}`;
                        const relatedResponse = await axios.get(relatedArticlesUrl, { timeout: 15000 });
                        
                        if (relatedResponse.data.query && relatedResponse.data.query.search) {
                            const relatedArticles = relatedResponse.data.query.search;
                            for (let i = 1; i < relatedArticles.length; i++) { // Skip first one as we already got it
                                try {
                                    const title = relatedArticles[i].title;
                                    const contentUrl = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`;
                                    const contentResponse = await axios.get(contentUrl, { timeout: 15000 });
                                    
                                    if (contentResponse.data.extract) {
                                        webData.push(`Related Wikipedia article on "${title}":\n${contentResponse.data.extract}`);
                                    }
                                } catch (relatedError) {
                                    console.error(`Error fetching related article: ${relatedError.message}`);
                                    continue;
                                }
                                
                                // Short delay between API calls
                                await new Promise(resolve => setTimeout(resolve, 500));
                            }
                        }
                    }
              
                } catch (searchApiError) {
                    console.error(`Search API error for "${query}":`, searchApiError.message);
                    // Continue with other queries even if this API fails
                }
                
                // Add a delay between queries to avoid rate limiting
                await new Promise(resolve => setTimeout(resolve, 1000));
                
            } catch (queryError) {
                console.error(`Error processing query "${query}":`, queryError.message);
                continue; // Skip to next query on error
            }
        }
        
        // Return the compiled web data or a fallback message
        if (webData.length > 0) {
            return webData.join("\n\n");
        } else if (urls.length > 0) {
            return urls; // Backward compatibility
        } else {
            return "No search results found. Please try different search terms or check your internet connection.";
        }
    } catch (error) {
        console.error("Error in searchWeb:", error.message);
        return "Unable to search web due to network issues. Please try again later.";
    }
}

async function getDuckDuckGoResults(query, intensity = 5) {
    try {
        // Determine number of results to fetch based on intensity
        const resultLimit = intensity ? Math.min(Math.max(3, intensity * 2), 15) : 10;
        
        // Use the DuckDuckGo HTML API
        const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
        const response = await axios.get(searchUrl, {
            timeout: 15000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            }
        });
        
        // Extract search results from HTML
        // This is a simple approach - in production, use a proper HTML parser
        const html = response.data;
        const results = [];
        
        // Extract results from the HTML response
        // Simple regex pattern to extract snippets
        const snippetRegex = /<a class="result__snippet"[^>]*>(.*?)<\/a>/g;
        let match;
        let count = 0;
        
        while ((match = snippetRegex.exec(html)) !== null && count < resultLimit) {
            if (match[1]) {
                // Clean up HTML entities and tags
                const snippet = match[1].replace(/&amp;/g, '&')
                    .replace(/&lt;/g, '<')
                    .replace(/&gt;/g, '>')
                    .replace(/<[^>]*>/g, '')
                    .trim();
                
                if (snippet.length > 20) { // Only add substantial snippets
                    results.push(snippet);
                    count++;
                }
            }
        }
        
        return results.join('\n\n');
    } catch (error) {
        console.error("Error fetching DuckDuckGo results:", error.message);
        return null;
    }
}

async function getWikipediaArticle(query) {
    try {
        // Search for the query with timeout config
        const axiosConfig = {
            timeout: 15000 // 15 second timeout
        };
        
        const searchUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&format=json`;
        const searchResponse = await axios.get(searchUrl, axiosConfig);
        
        if (!searchResponse.data.query || !searchResponse.data.query.search || !searchResponse.data.query.search.length) {
            return null;
        }
        
        // Get the title of the first search result
        const title = searchResponse.data.query.search[0].title;
        
        // Fetch the article in plain text
        const contentUrl = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`;
        const contentResponse = await axios.get(contentUrl, axiosConfig);
        
        return contentResponse.data.extract || null;
    } catch (error) {
        console.error("Error fetching Wikipedia article:", error.message);
        return null;
    }
}

module.exports = {
    runTask
}