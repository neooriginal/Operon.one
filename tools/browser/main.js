const puppeteer = require('puppeteer');
const elementNumberingScript = require('./scriptInjector');
const ai = require('../AI/ai');
let browser = undefined;
let page = undefined;
let history = [];
let summaryCallback = null;

async function initialize(){
    if(browser){
        return browser;
    }
    browser = await puppeteer.launch({
        headless: false,
        defaultViewport: null,
    });
    return browser;
}

async function taskFunction(task, data, image, websiteTextContent){

    data = "Elements avalible for interaction: " + data + "\n\n" + "Website text content: " + websiteTextContent;
    let prompt = `
    You are an AI agent that can execute complex tasks. You are ment to control a web browser and navigate through the web.
    Do your best to complete the task provided by the user. 
    Respond in a JSON format with the following format. Only respond with one at a time:
    {
        "action": "goToPage",
        "url": "url to go to",
    },
    {
        "action": "click",
        "element": "element to click" //number of the element. either from image provided or from the data provided by the user,
    },
    {
        "action": "input",
        "text": "text to input" //input needs to be selected from the page
    },
    {
        "action": "scroll",
        "direction": "up" //up or down
    },
    {
        "action": "close",
        "summary": \`summary of the tasks results in detail\` 
        //do when you are done with the task
    }

    The main task is: ${task}

    Once you have enough information to confidently complete the task, respond with the "close" action. Look at previous messages for the information collected earlier and use it to summarize and finish the task.
    `

    
    // Add user's most recent input to history with proper formatting
    history.push({
        role: "user", 
        content: [
            {type: "text", text: data}
        ]
    });

    let result = await ai.callAI(prompt, data, history, image);

    // Add AI response to history
    history.push({
        role: "assistant", 
        content: [
            {type: "text", text: result.toString()}
        ]
    });

    
    if(result.action === "goToPage"){
        await goToPage(result.url);
    }else if(result.action === "click"){
        await click(result.element);
    }else if(result.action === "input"){
        await input(result.element, result.text);
    }else if(result.action === "scroll"){
        await scroll(result.direction);
    }else if(result.action === "close"){
        console.log(result.summary);
        if (summaryCallback) {
            summaryCallback(result.summary);
        }
        await close();
        return;
    }

    let content = await getContent();
    taskFunction(task, content.elements, content.screenshot, content.websiteTextContent);
}

async function initialAI(task){
    let prompt = `
    You are an AI agent that can execute complex tasks. You are ment to control a web browser and navigate through the web.
    Do your best to complete the task provided by the user. 
    Respond in a JSON format with the following format:
    {
        "action": "goToPage",
        "url": "url to go to"
    }
        `
    let result = await ai.callAI(prompt, task, []);
    if(result.action === "goToPage"){
        await goToPage(result.url);
    }else{
        console.log("Mistake, retrying...");
        initialAI(task);
        return;
    }

    let content = await getContent();
    taskFunction(task, content.elements, content.screenshot, content.websiteTextContent);
}

// Add function to run task from external files
async function runTask(task, otherAIData, callback) {
    history = []; // Reset history for a new task
    history.push({
        role: "user", 
        content: [
            {type: "text", text: otherAIData}
        ]
    });
    
    return new Promise((resolve) => {
        summaryCallback = (summary) => {
            if (callback) callback(summary);
            resolve(summary);
        };
        initialAI(task);
    });
}

async function goToPage(url){
    const browser = await initialize();
    page = await browser.newPage();
   
    await page.goto(url);
    await sleep(1000);
    return {success: true};
}

async function sleep(ms){
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function scroll(direction){
    if(direction === "up"){
        await page.evaluate(`window.scrollTo(0, -1000);`);
    }else if(direction === "down"){
        await page.evaluate(`window.scrollTo(0, 1000);`);
    }
}

async function click(element){
    let result = undefined;
    let listener = page.on('console', message => {
        if(message.text().startsWith('Error clicking element:')){
            result = message.text();
        }
    });
    await page.evaluate(`
        try{
            window.clickElement(${JSON.stringify(element)});
        }catch(e){
            console.log("Error clicking element: " + e);
        }
        `);
    page.off('console', listener);
    if(!result)result="success";
    return {result: result};
}

async function input(element, text){
    await page.type(element, text);
}

async function getContent() {
    let elements = [];
    
    // Listen for console messages before navigating
     let listener = page.on('console', message => {
        if(message.text().startsWith('Element')){
            elements.push(message.text());
        }
    });
        // Remove unnecessary elements before extracting text
    await page.evaluate(() => {
            const selectorsToRemove = [
                '.ads', '.ad', '.sponsored', '.popup', '.newsletter', '[aria-label="advertisement"]'
            ];
        document.querySelectorAll(selectorsToRemove.join(',')).forEach(el => el.remove());
    });

    await page.evaluate(elementNumberingScript);
    await sleep(1000);
    //remove listener
    page.off('console', listener);

    const screenshotOptions = {
        encoding: 'base64',
        quality: 80,
        type: 'jpeg', // jpeg is faster than png
        fullPage: false,
        clip: null,
        timeout: 10000, // 10 seconds timeout specifically for screenshot
    };

    let screenshot = await page.screenshot(screenshotOptions);
    let contentType = screenshotOptions.type === 'png' ? 'image/png' : 'image/jpeg';
    screenshot = `data:${contentType};base64,${screenshot}`;

    const websiteTextContent = await page.evaluate(() => {
        return document.body.innerText.trim().replace(/\s+/g, ' ').substring(0, 1000);
    });

    return {elements: elements.toString(), screenshot: screenshot, websiteTextContent: websiteTextContent};
}

async function close(){
    try {
        if(browser){
            await page.close();
            await browser.close();
            await sleep(1000);
            browser = undefined;
        }
    } catch (error) {
        console.error('Error closing browser:', error);
        browser = undefined; // Ensure browser is reset even if close fails
    }
}

module.exports = {
    runTask // Export the new function
};
