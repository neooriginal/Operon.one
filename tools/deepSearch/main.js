const axios = require("axios");
const ai = require("../AI/ai");
const contextManager = require("../../utils/context");
const cheerio = require("cheerio");


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
        
        
        const queryLimit = intensity ? Math.min(Math.max(3, intensity * 2), 20) : 8;
        queries = queries.slice(0, queryLimit);
        
        
        const results = await Promise.all(queries.map(async (query) => {
            try {
                
                const [
                    duckDuckGoResults, 
                    wikipediaResults, 
                    bingResults, 
                    googleScholarResults,
                    stackOverflowResults
                ] = await Promise.all([
                    getDuckDuckGoResults(query, intensity),
                    getWikipediaResults(query, intensity),
                    getBingResults(query, intensity),
                    getGoogleScholarResults(query, intensity),
                    getStackOverflowResults(query, intensity)
                ]);
                
                const queryData = [];
                
                if (duckDuckGoResults && duckDuckGoResults.length > 0) {
                    queryData.push(`DuckDuckGo results for "${query}":\n${duckDuckGoResults}`);
                }
                
                if (wikipediaResults && wikipediaResults.length > 0) {
                    queryData.push(wikipediaResults);
                }
                
                if (bingResults && bingResults.length > 0) {
                    queryData.push(`Bing results for "${query}":\n${bingResults}`);
                }
                
                if (googleScholarResults && googleScholarResults.length > 0) {
                    queryData.push(`Google Scholar results for "${query}":\n${googleScholarResults}`);
                }
                
                if (stackOverflowResults && stackOverflowResults.length > 0) {
                    queryData.push(`Stack Overflow results for "${query}":\n${stackOverflowResults}`);
                }
                
                return queryData;
            } catch (queryError) {
                console.error(`Error processing query "${query}":`, queryError.message);
                return []; 
            }
        }));
        
        
        webData = results.flat();
        
        
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

async function getDuckDuckGoResults(query, intensity = 5) {
    try {
        
        const resultLimit = intensity ? Math.min(Math.max(5, intensity * 3), 20) : 10;
        
        
        const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
        const response = await axios.get(searchUrl, {
            timeout: 8000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            }
        });
        
        
        const $ = cheerio.load(response.data);
        const results = [];
        
        $('.result__snippet').each((i, el) => {
            if (i < resultLimit) {
                const snippet = $(el).text().trim();
                if (snippet.length > 20) {
                    results.push(snippet);
                }
            }
        });
        
        return results.join('\n\n');
    } catch (error) {
        console.error("Error fetching DuckDuckGo results:", error.message);
        return null;
    }
}

async function getWikipediaResults(query, intensity = 5) {
    try {
        
        const axiosConfig = {
            timeout: 8000
        };
        
        
        const mainArticle = await getWikipediaArticle(query, axiosConfig);
        let results = [];
        
        if (mainArticle) {
            results.push(`Wikipedia article on "${query}":\n${mainArticle}`);
        }
        
        
        if (intensity > 3 && mainArticle) {
            const relatedArticles = await getRelatedWikipediaArticles(query, intensity, axiosConfig);
            if (relatedArticles && relatedArticles.length > 0) {
                results = results.concat(relatedArticles);
            }
        }
        
        return results.join('\n\n');
    } catch (error) {
        console.error("Error fetching Wikipedia results:", error.message);
        return null;
    }
}

async function getWikipediaArticle(query, axiosConfig) {
    try {
        const searchUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&format=json`;
        const searchResponse = await axios.get(searchUrl, axiosConfig);
        
        if (!searchResponse.data.query || !searchResponse.data.query.search || !searchResponse.data.query.search.length) {
            return null;
        }
        
        
        const title = searchResponse.data.query.search[0].title;
        
        
        const contentUrl = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`;
        const contentResponse = await axios.get(contentUrl, axiosConfig);
        
        return contentResponse.data.extract || null;
    } catch (error) {
        console.error("Error fetching Wikipedia article:", error.message);
        return null;
    }
}

async function getRelatedWikipediaArticles(query, intensity, axiosConfig) {
    try {
        const relatedLimit = intensity ? Math.min(Math.max(2, intensity), 10) : 3;
        const relatedArticlesUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&format=json&srlimit=${relatedLimit + 1}`;
        const relatedResponse = await axios.get(relatedArticlesUrl, axiosConfig);
        
        if (!relatedResponse.data.query || !relatedResponse.data.query.search) {
            return [];
        }
        
        const relatedArticles = relatedResponse.data.query.search;
        const articlePromises = [];
        
        
        for (let i = 1; i < relatedArticles.length; i++) {
            const title = relatedArticles[i].title;
            articlePromises.push(getWikipediaArticleByTitle(title, axiosConfig));
        }
        
        
        const articles = await Promise.all(articlePromises);
        return articles
            .filter(article => article.content) 
            .map(article => `Related Wikipedia article on "${article.title}":\n${article.content}`);
    } catch (error) {
        console.error(`Error fetching related Wikipedia articles: ${error.message}`);
        return [];
    }
}

async function getWikipediaArticleByTitle(title, axiosConfig) {
    try {
        const contentUrl = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`;
        const contentResponse = await axios.get(contentUrl, axiosConfig);
        
        return {
            title,
            content: contentResponse.data.extract || null
        };
    } catch (error) {
        console.error(`Error fetching Wikipedia article by title: ${error.message}`);
        return { title, content: null };
    }
}

async function getBingResults(query, intensity = 5) {
    try {
        const resultLimit = intensity ? Math.min(Math.max(5, intensity * 2), 15) : 8;
        
        
        
        const searchUrl = `https://api.bing.microsoft.com/v7.0/search?q=${encodeURIComponent(query)}&count=${resultLimit}`;
        
        try {
            const response = await axios.get(searchUrl, {
                timeout: 8000,
                headers: {
                    'Ocp-Apim-Subscription-Key': process.env.BING_API_KEY || '',
                }
            });
            
            if (!response.data || !response.data.webPages || !response.data.webPages.value) {
                return null;
            }
            
            const results = response.data.webPages.value.map(result => 
                `${result.name}: ${result.snippet}`
            );
            
            return results.join('\n\n');
        } catch (error) {
            
            return getBingResultsFallback(query, resultLimit);
        }
    } catch (error) {
        console.error("Error fetching Bing results:", error.message);
        return null;
    }
}

async function getBingResultsFallback(query, resultLimit) {
    try {
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
        console.error("Error fetching Bing results fallback:", error.message);
        return null;
    }
}

async function getGoogleScholarResults(query, intensity = 5) {
    try {
        const resultLimit = intensity ? Math.min(Math.max(3, intensity), 10) : 5;
        const searchUrl = `https://scholar.google.com/scholar?q=${encodeURIComponent(query)}&hl=en`;
        
        const response = await axios.get(searchUrl, {
            timeout: 8000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            }
        });
        
        const $ = cheerio.load(response.data);
        const results = [];
        
        $('.gs_ri').each((i, el) => {
            if (i < resultLimit) {
                const title = $(el).find('.gs_rt').text().trim();
                const snippet = $(el).find('.gs_rs').text().trim();
                const authors = $(el).find('.gs_a').text().trim();
                
                if (snippet.length > 20) {
                    results.push(`${title}\nAuthors: ${authors}\n${snippet}`);
                }
            }
        });
        
        return results.join('\n\n');
    } catch (error) {
        console.error("Error fetching Google Scholar results:", error.message);
        return null;
    }
}

async function getStackOverflowResults(query, intensity = 5) {
    try {
        
        if (!isTechnicalQuery(query)) {
            return null;
        }
        
        const resultLimit = intensity ? Math.min(Math.max(3, intensity), 8) : 5;
        const searchUrl = `https://api.stackexchange.com/2.3/search?order=desc&sort=relevance&intitle=${encodeURIComponent(query)}&site=stackoverflow&filter=withbody`;
        
        const response = await axios.get(searchUrl, {
            timeout: 8000
        });
        
        if (!response.data || !response.data.items) {
            return null;
        }
        
        const results = [];
        for (let i = 0; i < Math.min(resultLimit, response.data.items.length); i++) {
            const item = response.data.items[i];
            const title = item.title;
            
            
            const $ = cheerio.load(item.body);
            const body = $.text().substring(0, 500) + (item.body.length > 500 ? '...' : '');
            
            results.push(`Q: ${title}\nA: ${body}`);
        }
        
        return results.join('\n\n');
    } catch (error) {
        console.error("Error fetching Stack Overflow results:", error.message);
        return null;
    }
}

function isTechnicalQuery(query) {
    const technicalKeywords = [
        'code', 'programming', 'javascript', 'python', 'java', 'c++', 'c#', 
        'php', 'html', 'css', 'sql', 'database', 'api', 'framework', 'library',
        'algorithm', 'function', 'error', 'bug', 'fix', 'implementation', 
        'programming', 'development', 'software', 'web', 'app', 'mobile',
        'server', 'client', 'frontend', 'backend', 'fullstack', 'devops',
        'deployment', 'cloud', 'aws', 'azure', 'google cloud'
    ];
    
    const lowerQuery = query.toLowerCase();
    return technicalKeywords.some(keyword => lowerQuery.includes(keyword));
}

module.exports = {
    runTask
}