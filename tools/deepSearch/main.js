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
        let urls = []
        let queries = await getQuery(task);
        for(let query of queries){
            try {
                let response = await axios.get(`https://duckduckgo.com/?q=${encodeURIComponent(query)}`);
                //push first five urls into urls array which arent ads and dont have duckduckgo in the url
                let extractedUrls = response.data.match(/https?:\/\/[^\s]+/g) || [];
                let count = 0;
                for(let url of extractedUrls){
                    if(!url.includes("duckduckgo") && !url.includes("ad.com") && count < 5){
                        urls.push(url);
                        count++;
                    }
                }
                
                let wikipediaArticle = await getWikipediaArticle(query);
                if (wikipediaArticle) {
                    urls.push(wikipediaArticle);
                }
            } catch (queryError) {
                console.error(`Error processing query "${query}":`, queryError.message);
                continue; // Skip to next query on error
            }
        }
        return urls.length > 0 ? urls : "No search results found";
    } catch (error) {
        console.error("Error in searchWeb:", error.message);
        throw new Error(`Failed to search web: ${error.message}`);
    }
}

async function getWikipediaArticle(query) {
    try {
        // Search for the query
        const searchUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&format=json`;
        const searchResponse = await axios.get(searchUrl);
        
        if (!searchResponse.data.query || !searchResponse.data.query.search || !searchResponse.data.query.search.length) {
            return null;
        }
        
        // Get the title of the first search result
        const title = searchResponse.data.query.search[0].title;
        
        // Fetch the article in plain text
        const contentUrl = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`;
        const contentResponse = await axios.get(contentUrl);
        
        return contentResponse.data.extract || null;
    } catch (error) {
        console.error("Error fetching Wikipedia article:", error.message);
        return null;
    }
}

module.exports = {
    runTask
}