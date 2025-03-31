const axios = require("axios");
const ai = require("../ai/main");


async function runTask(task, otherAIData, callback){
    let webData = await searchWeb(task);
    let report = await evaluatewithAI(task, webData+"\n\n Also, there is some information that previous tasks have gathered. Keep them in mind while evaluating the web data and add them to the report to not duplicate information and other things. Here is the information: "+otherAIData);
    callback(report);
}

async function getQuery(task){
    let prompt = `
    You are an AI agent that can execute complex tasks. For this task, the user will provide a task and you are supposed to return queries for searching the web.
    Maximum of 3 queries.
    JSON Format:
    {
        "queries": ["query1", "query2", "query3"]
    }
    `

    let response = await ai.callAI(prompt, task);
    return response.queries;
}

async function evaluatewithAI(task, webData){
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
    return response.report;
}

async function searchWeb(task){
    let urls = []
    let queries = await getQuery(task);
    for(let query of queries){
        let response = await axios.get(`https://duckduckgo.com/?q=${query}`);
        //push first five urls into urls array which arent ads and dont have duckduckgo in the url
        let urls = response.data.match(/https?:\/\/[^\s]+/g);
        let count = 0;
        for(let url of urls){
            if(!url.includes("duckduckgo") && !url.includes("ad.com") && count < 5){
                urls.push(url);
                count++;
            }
        }
    }
    return urls;
}


module.exports = {
    runTask
}