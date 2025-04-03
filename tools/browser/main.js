const puppeteer = require('puppeteer');
const elementNumberingScript = require('./scriptInjector');
const ai = require('../AI/ai');
let browser = undefined;
let page = undefined;
let history = [];
let lastActions = [];
let summaryCallback = null;

// Token optimization settings
const MAX_WEBSITE_TEXT_LENGTH = 500; // Reduced from 1000
const MAX_ELEMENT_COUNT = 15; // Limit number of elements
const SCREENSHOT_QUALITY = 50; // Reduced from 80
const MAX_HISTORY_LENGTH = 3; // Keep only recent interactions

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
    // Truncate data to reduce tokens
    const elementData = limitElements(data);
    const truncatedWebsiteContent = websiteTextContent.substring(0, MAX_WEBSITE_TEXT_LENGTH);
    
    data = "Elements avalible for interaction: " + elementData + "\n\n" + "Website text content: " + truncatedWebsiteContent;
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
        "text": "text to input", //input needs to be selected from the page
        "element": "element to input text into" //number of the element. either from image provided or from the data provided by the user,
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

    Try not to repeat actions and actually check that an action might have already been completed even though there is no big ui feedback.
    Last actions you did: ${lastActions.join(", ")}

    The main task is: ${task}

    Once you have enough information to confidently complete the task, respond with the "close" action. Look at previous messages for the information collected earlier and use it to summarize and finish the task.
    `

    // Manage history - add user's most recent input 
    history.push({
        role: "user", 
        content: [
            {type: "text", text: data}
        ]
    });
    
    // Keep history limited to prevent token growth
    limitHistory();

    let result = await ai.callAI(prompt, data, history, image, undefined, "browser");

    if(!result)return taskFunction(task, content.elements, content.screenshot, content.websiteTextContent);
    // Add AI response to history
    history.push({
        role: "assistant", 
        content: [
            {type: "text", text: result.toString()}
        ]
    });
    
    // Keep history limited again after adding response
    limitHistory();

    lastActions.push(result.toString());
    
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

// Helper function to limit history length
function limitHistory() {
    if (history.length > MAX_HISTORY_LENGTH * 2) { // *2 to account for pairs of user/assistant messages
        // Keep only the most recent interactions
        history = history.slice(-MAX_HISTORY_LENGTH * 2);
    }
}

// Helper function to limit elements data
function limitElements(elementData) {
    if (!elementData) return "";
    
    // Split by elements and take only top elements
    const elements = elementData.split(',').slice(0, MAX_ELEMENT_COUNT);
    return elements.join(',');
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
    lastActions = [];
    
    // Only add other AI data if it exists and isn't too large
    if (otherAIData) {
        const truncatedData = otherAIData.substring(0, MAX_WEBSITE_TEXT_LENGTH);
        history.push({
            role: "user", 
            content: [
                {type: "text", text: truncatedData}
            ]
        });
    }
    
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
    
    try {
        // Set up a promise that will resolve if navigation occurs
        const navigationPromise = page.waitForNavigation({ timeout: 5000 }).catch(() => {});
        
        // Execute the click
        await page.evaluate(`
            try{
                window.clickElement(${JSON.stringify(element)});
            }catch(e){
                console.log("Error clicking element: " + e);
            }
        `);
        
        // Wait for navigation to complete if it was triggered by the click
        await navigationPromise;
        
        page.off('console', listener);
        if(!result) result="success";
        return {result: result};
    } catch (error) {
        page.off('console', listener);
        console.log("Error during click operation:", error);
        return {result: "Error: " + error.message};
    }
}

async function input(element, text){
    // Check if element is properly defined
    if (!element) {
        console.log("Error: No element specified for input");
        return {result: "Error: No element specified"};
    }
    
    try {
        // Use same approach as click function to find elements by custom numbering
        const success = await page.evaluate(`
            try {
                const el = window.numberedElements[${JSON.stringify(element)}];
                if (el) {
                    el.focus();
                    return true;
                } else {
                    console.log("Element not found: " + ${JSON.stringify(element)});
                    return false;
                }
            } catch(e) {
                console.log("Error focusing element: " + e);
                return false;
            }
        `);
        
        if (success) {
            // Type the text into the focused element
            await page.keyboard.type(text);
            return {result: "success"};
        } else {
            return {result: "Element not found or not focusable"};
        }
    } catch (error) {
        console.log("Error during input operation:", error);
        return {result: "Error: " + error.message};
    }
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
    await sleep(3000);
    //remove listener
    page.off('console', listener);

    // Get only the first MAX_ELEMENT_COUNT elements
    elements = elements.slice(0, MAX_ELEMENT_COUNT);

    const screenshotOptions = {
        encoding: 'base64',
        quality: SCREENSHOT_QUALITY, // Reduced quality to save tokens
        type: 'jpeg', // jpeg is faster than png
        fullPage: false,
        clip: null,
        timeout: 10000, // 10 seconds timeout specifically for screenshot
    };

    let screenshot = await page.screenshot(screenshotOptions);
    let contentType = screenshotOptions.type === 'png' ? 'image/png' : 'image/jpeg';
    screenshot = `data:${contentType};base64,${screenshot}`;


    const websiteTextContent = await page.evaluate((maxLength) => {
        return document.body.innerText.trim().replace(/\s+/g, ' ').substring(0, maxLength);
    }, MAX_WEBSITE_TEXT_LENGTH);

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
