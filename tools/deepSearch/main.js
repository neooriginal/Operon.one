const axios = require("axios");
const ai = require("../AI/ai");
const contextManager = require("../../utils/context");

// Simple in-memory cache with TTL
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
        // Get or initialize user-specific context
        let userContext = contextManager.getContext(userId);
        if (!userContext.deepSearch) {
            userContext.deepSearch = {
                searchHistory: [],
                lastQueries: []
            };
            contextManager.updateContext(userId, userContext);
        }

        // Check cache for identical task
        const cacheKey = `task_${userId}_${task}`;
        const cachedReport = cache.get(cacheKey);
        if (cachedReport) {
            callback(cachedReport);
            return;
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
        
        // Cache the report
        cache.set(cacheKey, report);
        
        callback(report);
    } catch (error) {
        console.error("Error in runTask:", error.message);
        callback(`Error executing task: ${error.message}`);
    }
}

async function getQuery(task, userId = 'default', intensity) {
    try {
        // Check cache first
        const cacheKey = `queries_${userId}_${task}`;
        const cachedQueries = cache.get(cacheKey);
        if (cachedQueries) {
            return cachedQueries;
        }
        
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
        
        const queries = response.queries || [];
        // Cache the result
        cache.set(cacheKey, queries);
        
        return queries;
    } catch (error) {
        console.error("Error in getQuery:", error.message);
        return ["basic search for " + task.substring(0, 50)]; // Fallback query
    }
}

async function evaluatewithAI(task, webData, userId = 'default') {
    try {
        // Check cache first
        const cacheKey = `evaluation_${userId}_${task}_${webData.length}`;
        const cachedEvaluation = cache.get(cacheKey);
        if (cachedEvaluation) {
            return cachedEvaluation;
        }
        
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
        
        const report = response.report || "No report could be generated";
        // Cache the result
        cache.set(cacheKey, report);
        
        return report;
    } catch (error) {
        console.error("Error in evaluatewithAI:", error.message);
        return `Error generating report: ${error.message}`;
    }
}

async function searchWeb(task, userId = 'default', intensity) {
    try {
        let webData = [];
        let queries = await getQuery(task, userId, intensity);
        
        // Limit number of queries based on intensity (default is 5 if not specified)
        const queryLimit = intensity ? Math.min(Math.max(1, intensity), 10) : 5;
        queries = queries.slice(0, queryLimit);
        
        // Process all queries in parallel with Promise.all
        const results = await Promise.all(queries.map(async (query) => {
            try {
                const queryData = [];
                const cacheKey = `query_results_${query}`;
                const cachedResults = cache.get(cacheKey);
                
                if (cachedResults) {
                    return cachedResults;
                }
                
                // Run both DuckDuckGo and Wikipedia searches in parallel
                const [duckDuckGoResults, wikipediaResult] = await Promise.all([
                    getDuckDuckGoResults(query, intensity),
                    getWikipediaArticle(query)
                ]);
                
                if (duckDuckGoResults && duckDuckGoResults.length > 0) {
                    queryData.push(`DuckDuckGo results for "${query}":\n${duckDuckGoResults}`);
                }
                
                if (wikipediaResult) {
                    queryData.push(`Wikipedia article on "${query}":\n${wikipediaResult}`);
                }
                
                // Only get related articles if we have a Wikipedia result
                if (wikipediaResult) {
                    try {
                        const relatedArticles = await getRelatedWikipediaArticles(query, intensity);
                        if (relatedArticles && relatedArticles.length > 0) {
                            queryData.push(...relatedArticles);
                        }
                    } catch (relatedError) {
                        console.error(`Error getting related articles: ${relatedError.message}`);
                    }
                }
                
                // Cache the results
                cache.set(cacheKey, queryData, 3600); // Cache for 1 hour
                
                return queryData;
            } catch (queryError) {
                console.error(`Error processing query "${query}":`, queryError.message);
                return []; // Return empty array on error
            }
        }));
        
        // Flatten the results array and combine all data
        webData = results.flat();
        
        // Return the compiled web data or a fallback message
        if (webData.length > 0) {
            return webData.join("\n\n");
        } else {
            return "No search results found. Please try different search terms or check your internet connection.";
        }
    } catch (error) {
        console.error("Error in searchWeb:", error.message);
        return "Unable to search web due to network issues. Please try again later.";
    }
}

// Extracted related articles functionality to a separate function
async function getRelatedWikipediaArticles(query, intensity) {
    try {
        const cacheKey = `related_wiki_${query}_${intensity}`;
        const cachedResults = cache.get(cacheKey);
        
        if (cachedResults) {
            return cachedResults;
        }
        
        const relatedLimit = intensity ? Math.min(Math.max(1, intensity), 10) : 5;
        const relatedArticlesUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&format=json&srlimit=${relatedLimit}`;
        const relatedResponse = await axios.get(relatedArticlesUrl, { timeout: 10000 });
        
        if (!relatedResponse.data.query || !relatedResponse.data.query.search) {
            return [];
        }
        
        const relatedArticles = relatedResponse.data.query.search;
        const articlePromises = [];
        
        // Skip the first one as we already got it in the main wikipedia search
        for (let i = 1; i < relatedArticles.length; i++) {
            const title = relatedArticles[i].title;
            articlePromises.push(getWikipediaArticleByTitle(title));
        }
        
        // Get all related articles in parallel
        const articles = await Promise.all(articlePromises);
        const results = articles
            .filter(article => article.content) // Filter out any null results
            .map(article => `Related Wikipedia article on "${article.title}":\n${article.content}`);
        
        // Cache the results
        cache.set(cacheKey, results, 3600);
        
        return results;
    } catch (error) {
        console.error(`Error fetching related Wikipedia articles: ${error.message}`);
        return [];
    }
}

async function getWikipediaArticleByTitle(title) {
    try {
        const cacheKey = `wiki_article_${title}`;
        const cachedArticle = cache.get(cacheKey);
        
        if (cachedArticle) {
            return cachedArticle;
        }
        
        const contentUrl = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`;
        const contentResponse = await axios.get(contentUrl, { timeout: 10000 });
        
        const result = {
            title,
            content: contentResponse.data.extract || null
        };
        
        // Cache the result
        cache.set(cacheKey, result, 3600); // Cache for 1 hour
        
        return result;
    } catch (error) {
        console.error(`Error fetching Wikipedia article by title: ${error.message}`);
        return { title, content: null };
    }
}

async function getDuckDuckGoResults(query, intensity = 5) {
    try {
        const cacheKey = `ddg_${query}_${intensity}`;
        const cachedResults = cache.get(cacheKey);
        
        if (cachedResults) {
            return cachedResults;
        }
        
        // Determine number of results to fetch based on intensity
        const resultLimit = intensity ? Math.min(Math.max(3, intensity * 2), 15) : 10;
        
        // Use the DuckDuckGo HTML API
        const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
        const response = await axios.get(searchUrl, {
            timeout: 10000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            }
        });
        
        // Extract search results from HTML
        const html = response.data;
        const results = [];
        
        // Extract results from the HTML response with regex
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
        
        const resultText = results.join('\n\n');
        // Cache the results
        cache.set(cacheKey, resultText, 3600); // Cache for 1 hour
        
        return resultText;
    } catch (error) {
        console.error("Error fetching DuckDuckGo results:", error.message);
        return null;
    }
}

async function getWikipediaArticle(query) {
    try {
        const cacheKey = `wiki_search_${query}`;
        const cachedArticle = cache.get(cacheKey);
        
        if (cachedArticle) {
            return cachedArticle;
        }
        
        // Search for the query with reduced timeout
        const axiosConfig = {
            timeout: 10000 // 10 second timeout
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
        
        const extract = contentResponse.data.extract || null;
        
        // Cache the result
        cache.set(cacheKey, extract, 3600); // Cache for 1 hour
        
        return extract;
    } catch (error) {
        console.error("Error fetching Wikipedia article:", error.message);
        return null;
    }
}

module.exports = {
    runTask
}