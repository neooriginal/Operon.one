const axios = require("axios");
const ai = require("../AI/ai");


async function runTask(task, otherAIData, callback){
    try {
        let webData = await searchWeb(task);
        let report = await evaluatewithAI(task, webData+"\n\n Also, there is some information that previous tasks have gathered. Keep them in mind while evaluating the web data and add them to the report to not duplicate information and other things. Here is the information: "+otherAIData);
        callback(report);
    } catch (error) {
        console.error("Error in runTask:", error.message);
        callback(`Error executing task: ${error.message}`);
    }
}

async function getQuery(task){
    try {
        let prompt = `
        You are an AI agent that can execute complex tasks. For this task, the user will provide a task and you are supposed to return queries for searching the web.
        Maximum of 30 queries.
        JSON Format:
        {
            "queries": ["query1", "query2", "query3"]
        }
        `

        let response = await ai.callAI(prompt, task);
        return response.queries || [];
    } catch (error) {
        console.error("Error in getQuery:", error.message);
        return ["basic search for " + task.substring(0, 50)]; // Fallback query
    }
}

async function evaluatewithAI(task, webData){
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
        let response = await ai.callAI(prompt, task);
        return response.report || "No report could be generated";
    } catch (error) {
        console.error("Error in evaluatewithAI:", error.message);
        return `Error generating report: ${error.message}`;
    }
}

async function searchWeb(task){
    try {
        let urls = [];
        let webData = [];
        let queries = await getQuery(task);
        
        for(let query of queries){
            try {
                let wikipediaArticle = await getWikipediaArticle(query);
                if (wikipediaArticle) {
                    webData.push(`Wikipedia article on "${query}":\n${wikipediaArticle}`);
                }
                
                // Use more reliable search API instead of screen scraping
                try {
                    // For now, let's use a more reliable public API - Wikipedia's API for related articles
                    if (wikipediaArticle) {
                        const relatedArticlesUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&format=json&srlimit=5`;
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