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
        Maximum of 3 queries.
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
        let webData = [];
        let queries = await getQuery(task);
        
        for(let query of queries){
            try {
                // Configure axios with timeout
                const axiosConfig = {
                    timeout: 15000 // 15 second timeout
                };
                
                // Search Wikipedia for the query
                console.log(`Searching Wikipedia for "${query}"...`);
                const searchUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&format=json&srlimit=3`;
                const searchResponse = await axios.get(searchUrl, axiosConfig);
                
                if (searchResponse.data.query && searchResponse.data.query.search) {
                    const articles = searchResponse.data.query.search;
                    
                    for (let article of articles) {
                        try {
                            const title = article.title;
                            const contentUrl = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`;
                            const contentResponse = await axios.get(contentUrl, axiosConfig);
                            
                            if (contentResponse.data.extract) {
                                webData.push(`Wikipedia article on "${title}":\n${contentResponse.data.extract}`);
                            }
                        } catch (articleError) {
                            console.error(`Error fetching article: ${articleError.message}`);
                            continue;
                        }
                        
                        // Short delay between API calls
                        await new Promise(resolve => setTimeout(resolve, 500));
                    }
                }
                
                console.log(`Successfully processed query "${query}"`);
                
                // Add a delay between queries
                await new Promise(resolve => setTimeout(resolve, 1000));
                
            } catch (queryError) {
                console.error(`Error processing query "${query}":`, queryError.message);
                continue; // Skip to next query on error
            }
        }
        
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

module.exports = {
    runTask
}