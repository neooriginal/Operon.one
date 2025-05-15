const axios = require("axios");
const ai = require("../AI/ai");
const contextManager = require("../../utils/context");

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
        You are an AI agent that can execute complex tasks. For this task, the user will provide a task and you are supposed to evaluate the web data scraped from the web and return a detailled report using the web data.

        JSON Format:
        {
            "report": \`report using the web data\`
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
                
                const axiosConfig = {
                    timeout: 15000 
                };
                
                
                console.log(`Searching Wikipedia for "${query}"...`);
                
                
                toolState.searchProgress.currentQuery = query;
                contextManager.setToolState('webSearch', toolState, userId);
                
                const searchUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&format=json&srlimit=3`;
                const searchResponse = await axios.get(searchUrl, axiosConfig);
                
                if (searchResponse.data.query && searchResponse.data.query.search) {
                    const articles = searchResponse.data.query.search;
                    
                    for (let article of articles) {
                        try {
                            const title = article.title;
                            
                            
                            toolState.searchProgress.currentArticle = title;
                            contextManager.setToolState('webSearch', toolState, userId);
                            
                            const contentUrl = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`;
                            const contentResponse = await axios.get(contentUrl, axiosConfig);
                            
                            if (contentResponse.data.extract) {
                                const articleData = `Wikipedia article on "${title}":\n${contentResponse.data.extract}`;
                                webData.push(articleData);
                                
                                
                                toolState.searchProgress.results.push({
                                    query,
                                    title,
                                    snippet: contentResponse.data.extract.substring(0, 100) + "..."
                                });
                                contextManager.setToolState('webSearch', toolState, userId);
                            }
                        } catch (articleError) {
                            console.error(`Error fetching article: ${articleError.message}`);
                            continue;
                        }
                        
                        
                        await new Promise(resolve => setTimeout(resolve, 500));
                    }
                }
                
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

module.exports = {
    runTask
}