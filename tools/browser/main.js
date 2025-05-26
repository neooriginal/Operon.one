const { chromium } = require('playwright');
const elementNumberingScript = require('./scriptInjector');
const ai = require('../AI/ai');
const contextManager = require('../../utils/context');


const MAX_WEBSITE_TEXT_LENGTH = 500; 
const MAX_ELEMENT_COUNT = 15; 
const SCREENSHOT_QUALITY = 50; 
const MAX_HISTORY_LENGTH = 3; 


const browserInstances = new Map();
const pageInstances = new Map();

async function initialize(userId = 'default'){
    if(browserInstances.has(userId)){
        return browserInstances.get(userId);
    }
    
    const browser = await chromium.launch({
        headless: false
    });
    
    browserInstances.set(userId, browser);
    
    let toolState = contextManager.getToolState('browser', userId) || {
        history: [],
        lastActions: [],
        sessions: [],
        activeSession: null
    };
    
    const session = {
        id: Date.now(),
        startTime: new Date().toISOString(),
        pages: []
    };
    
    toolState.sessions.push(session);
    toolState.activeSession = session.id;
    
    contextManager.setToolState('browser', toolState, userId);
    
    return browser;
}

async function taskFunction(task, data, image, websiteTextContent, userId = 'default'){
    
    let toolState = contextManager.getToolState('browser', userId);
    
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
        "element": "element to click" 
    },
    {
        "action": "input",
        "text": "text to input", 
        "element": "element to input text into" 
    },
    {
        "action": "scroll",
        "direction": "up" 
    },
    {
        "action": "close",
        "summary": \`summary of the tasks results in detail\` 
        
    }

    Try not to repeat actions and actually check that an action might have already been completed even though there is no big ui feedback.
    Last actions you did: ${toolState.lastActions.join(", ")}

    The main task is: ${task}

    Once you have enough information to confidently complete the task, respond with the "close" action. Look at previous messages for the information collected earlier and use it to summarize and finish the task.
    `

    toolState.history.push({
        role: "user", 
        content: [
            {type: "text", text: data}
        ]
    });
    
    limitHistory(toolState);
    
    contextManager.setToolState('browser', toolState, userId);

    let result = await ai.callAI(prompt, data, toolState.history, image, true, "browser", userId);

    if(!result) {
        return taskFunction(task, data, image, websiteTextContent, userId);
    }
    
    toolState.history.push({
        role: "assistant", 
        content: [
            {type: "text", text: JSON.stringify(result)}
        ]
    });
    
    limitHistory(toolState);

    toolState.lastActions.push(JSON.stringify(result));
    if (toolState.lastActions.length > 5) {
        toolState.lastActions = toolState.lastActions.slice(-5);
    }
    
    if (toolState.activeSession) {
        const sessionIndex = toolState.sessions.findIndex(s => s.id === toolState.activeSession);
        if (sessionIndex >= 0) {
            toolState.sessions[sessionIndex].actions = toolState.sessions[sessionIndex].actions || [];
            toolState.sessions[sessionIndex].actions.push({
                action: result.action,
                timestamp: Date.now(),
                details: result
            });
        }
    }
    
    contextManager.setToolState('browser', toolState, userId);
    
    if(result.action === "goToPage"){
        await goToPage(result.url, userId);
    }else if(result.action === "click"){
        await click(result.element, userId);
    }else if(result.action === "input"){
        await input(result.element, result.text, userId);
    }else if(result.action === "scroll"){
        await scroll(result.direction, userId);
    }else if(result.action === "close"){
        console.log(result.summary);
        
        if (toolState.activeSession) {
            const sessionIndex = toolState.sessions.findIndex(s => s.id === toolState.activeSession);
            if (sessionIndex >= 0) {
                toolState.sessions[sessionIndex].completed = true;
                toolState.sessions[sessionIndex].endTime = new Date().toISOString();
                toolState.sessions[sessionIndex].summary = result.summary;
            }
        }
        
        contextManager.setToolState('browser', toolState, userId);
        
        const summaryCallback = toolState.summaryCallback;
        if (summaryCallback) {
            const callbackMap = toolState.callbackMap || new Map();
            const actualCallback = callbackMap.get(summaryCallback);
            if (actualCallback) {
                actualCallback(result.summary);
            }
        }
        
        await close(userId);
        return result.summary;
    }

    let content = await getContent(userId);
    return taskFunction(task, content.elements, content.screenshot, content.websiteTextContent, userId);
}


function limitHistory(toolState) {
    if (toolState.history.length > MAX_HISTORY_LENGTH * 2) { 
        toolState.history = toolState.history.slice(-MAX_HISTORY_LENGTH * 2);
    }
}


function limitElements(elementData) {
    if (!elementData) return "";
    
    const elements = elementData.split(',').slice(0, MAX_ELEMENT_COUNT);
    return elements.join(',');
}

async function initialAI(task, userId = 'default'){
    
    let toolState = contextManager.getToolState('browser', userId) || {
        history: [],
        lastActions: [],
        sessions: [],
        activeSession: null
    };
    
    let prompt = `
    You are an AI agent that can execute complex tasks. You are ment to control a web browser and navigate through the web.
    Do your best to complete the task provided by the user. 
    Respond in a JSON format with the following format:
    {
        "action": "goToPage",
        "url": "url to go to"
    }
        `
    let result = await ai.callAI(prompt, task, toolState.history, undefined, true, "browser", userId);
    
    toolState.history.push({
        role: "user", 
        content: [
            {type: "text", text: task}
        ]
    });
    
    toolState.history.push({
        role: "assistant", 
        content: [
            {type: "text", text: JSON.stringify(result)}
        ]
    });
    
    contextManager.setToolState('browser', toolState, userId);
    
    if(result.action === "goToPage"){
        await goToPage(result.url, userId);
    }else{
        console.log("Mistake, retrying...");
        return initialAI(task, userId);
    }

    let content = await getContent(userId);
    return taskFunction(task, content.elements, content.screenshot, content.websiteTextContent, userId);
}


async function runTask(task, otherAIData, callback, userId = 'default') {
    
    let toolState = contextManager.getToolState('browser', userId) || {
        history: [],
        lastActions: [],
        sessions: [],
        activeSession: null
    };
    
    const session = {
        id: Date.now(),
        startTime: new Date().toISOString(),
        task: task,
        actions: []
    };
    
    toolState.sessions.push(session);
    toolState.activeSession = session.id;
    
    toolState.history = [];
    toolState.lastActions = [];
    
    if (otherAIData) {
        const truncatedData = otherAIData.substring(0, MAX_WEBSITE_TEXT_LENGTH);
        toolState.history.push({
            role: "user", 
            content: [
                {type: "text", text: truncatedData}
            ]
        });
    }
    
    const callbackId = Date.now();
    toolState.summaryCallback = callbackId;
    
    toolState.callbackMap = toolState.callbackMap || new Map();
    toolState.callbackMap.set(callbackId, callback);
    
    contextManager.setToolState('browser', toolState, userId);
    
    try {
        const summary = await initialAI(task, userId);
        return summary;
    } catch (error) {
        console.error("Error in browser task:", error);
        
        if (toolState.activeSession) {
            const sessionIndex = toolState.sessions.findIndex(s => s.id === toolState.activeSession);
            if (sessionIndex >= 0) {
                toolState.sessions[sessionIndex].error = error.message;
                toolState.sessions[sessionIndex].endTime = new Date().toISOString();
            }
        }
        
        contextManager.setToolState('browser', toolState, userId);
        
        const errorResult = {
            error: error.message,
            success: false
        };
        
        if (callback) {
            callback(errorResult);
        }
        
        return errorResult;
    }
}

async function goToPage(url, userId = 'default'){
    const browser = await initialize(userId);
    
    if(pageInstances.has(userId)){
        await pageInstances.get(userId).close().catch(e => console.log("Error closing page:", e));
    }
    
    const context = await browser.newContext();
    const page = await context.newPage();
    pageInstances.set(userId, page);
    
    let toolState = contextManager.getToolState('browser', userId);
    
    try {
        await page.goto(url, { 
            timeout: 60000, 
            waitUntil: 'domcontentloaded'
        });
        
        await sleep(2000);
        
        if (toolState.activeSession) {
            const sessionIndex = toolState.sessions.findIndex(s => s.id === toolState.activeSession);
            if (sessionIndex >= 0) {
                toolState.sessions[sessionIndex].pages = toolState.sessions[sessionIndex].pages || [];
                toolState.sessions[sessionIndex].pages.push({
                    url,
                    timestamp: Date.now()
                });
            }
        }
        
        contextManager.setToolState('browser', toolState, userId);
        
        await sleep(1000);
        return {success: true};
    } catch (error) {
        console.error("Error navigating to page:", error);
        
        if (toolState.activeSession) {
            const sessionIndex = toolState.sessions.findIndex(s => s.id === toolState.activeSession);
            if (sessionIndex >= 0) {
                toolState.sessions[sessionIndex].errors = toolState.sessions[sessionIndex].errors || [];
                toolState.sessions[sessionIndex].errors.push({
                    action: "goToPage",
                    url,
                    error: error.message,
                    timestamp: Date.now()
                });
            }
        }
        
        contextManager.setToolState('browser', toolState, userId);
        
        return {success: false, error: error.message};
    }
}

async function sleep(ms){
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function scroll(direction, userId = 'default'){
    if (!pageInstances.has(userId)) {
        console.log("No page available for scrolling");
        return {success: false, error: "No page available"};
    }
    
    const page = pageInstances.get(userId);
    
    try {
        if(direction === "up"){
            await page.evaluate(`window.scrollTo(0, -1000);`);
        }else if(direction === "down"){
            await page.evaluate(`window.scrollTo(0, 1000);`);
        }
        
        let toolState = contextManager.getToolState('browser', userId);
        
        if (toolState.activeSession) {
            const sessionIndex = toolState.sessions.findIndex(s => s.id === toolState.activeSession);
            if (sessionIndex >= 0) {
                toolState.sessions[sessionIndex].scrolls = toolState.sessions[sessionIndex].scrolls || [];
                toolState.sessions[sessionIndex].scrolls.push({
                    direction,
                    timestamp: Date.now()
                });
            }
        }
        
        contextManager.setToolState('browser', toolState, userId);
        
        return {success: true};
    } catch (error) {
        console.error("Error scrolling:", error);
        return {success: false, error: error.message};
    }
}

async function click(element, userId = 'default'){
    if (!pageInstances.has(userId)) {
        console.log("No page available for clicking");
        return {success: false, error: "No page available"};
    }
    
    const page = pageInstances.get(userId);
    let result = undefined;
    
    page.on('console', message => {
        if(message.text().startsWith('Error clicking element:')){
            result = message.text();
        }
    });
    
    try {
        const navigationPromise = page.waitForNavigation({ timeout: 5000 }).catch(() => {});
        
        await page.evaluate(`
            try{
                window.clickElement(${JSON.stringify(element)});
            }catch(e){
                console.log("Error clicking element: " + e);
            }
        `);
        
        await navigationPromise;
        
        if(!result) result="success";
        
        let toolState = contextManager.getToolState('browser', userId);
        
        if (toolState.activeSession) {
            const sessionIndex = toolState.sessions.findIndex(s => s.id === toolState.activeSession);
            if (sessionIndex >= 0) {
                toolState.sessions[sessionIndex].clicks = toolState.sessions[sessionIndex].clicks || [];
                toolState.sessions[sessionIndex].clicks.push({
                    element,
                    result,
                    timestamp: Date.now()
                });
            }
        }
        
        contextManager.setToolState('browser', toolState, userId);
        
        return {result: result};
    } catch (error) {
        console.log("Error during click operation:", error);
        
        let toolState = contextManager.getToolState('browser', userId);
        
        if (toolState.activeSession) {
            const sessionIndex = toolState.sessions.findIndex(s => s.id === toolState.activeSession);
            if (sessionIndex >= 0) {
                toolState.sessions[sessionIndex].errors = toolState.sessions[sessionIndex].errors || [];
                toolState.sessions[sessionIndex].errors.push({
                    action: "click",
                    element,
                    error: error.message,
                    timestamp: Date.now()
                });
            }
        }
        
        contextManager.setToolState('browser', toolState, userId);
        
        return {result: "Error: " + error.message};
    }
}

async function input(element, text, userId = 'default'){
    if (!pageInstances.has(userId)) {
        console.log("No page available for input");
        return {success: false, error: "No page available"};
    }
    
    const page = pageInstances.get(userId);
    
    if (!element) {
        console.log("Error: No element specified for input");
        return {result: "Error: No element specified"};
    }
    
    try {
        const success = await page.evaluate((elementId, inputText) => {
            try {
                const el = window.numberedElements[elementId];
                if (el) {
                    el.focus();
                    el.value = inputText;
                    return true;
                }
                return false;
            } catch(e) {
                console.error("Input error:", e);
                return false;
            }
        }, element, text);
        
        let toolState = contextManager.getToolState('browser', userId);
        
        if (toolState.activeSession) {
            const sessionIndex = toolState.sessions.findIndex(s => s.id === toolState.activeSession);
            if (sessionIndex >= 0) {
                toolState.sessions[sessionIndex].inputs = toolState.sessions[sessionIndex].inputs || [];
                toolState.sessions[sessionIndex].inputs.push({
                    element,
                    text: text.substring(0, 50) + (text.length > 50 ? '...' : ''),
                    success,
                    timestamp: Date.now()
                });
            }
        }
        
        contextManager.setToolState('browser', toolState, userId);
        
        if (success) {
            return {result: "Input successful"};
        } else {
            return {result: "Failed to input text - element not found"};
        }
    } catch (error) {
        console.log("Error during input operation:", error);
        
        let toolState = contextManager.getToolState('browser', userId);
        
        if (toolState.activeSession) {
            const sessionIndex = toolState.sessions.findIndex(s => s.id === toolState.activeSession);
            if (sessionIndex >= 0) {
                toolState.sessions[sessionIndex].errors = toolState.sessions[sessionIndex].errors || [];
                toolState.sessions[sessionIndex].errors.push({
                    action: "input",
                    element,
                    text: text.substring(0, 50) + (text.length > 50 ? '...' : ''),
                    error: error.message,
                    timestamp: Date.now()
                });
            }
        }
        
        contextManager.setToolState('browser', toolState, userId);
        
        return {result: "Error: " + error.message};
    }
}

async function getContent(userId = 'default') {
    if (!pageInstances.has(userId)) {
        console.log("No page available for getting content");
        return {
            elements: "",
            websiteTextContent: "No page loaded",
            screenshot: null
        };
    }
    
    const page = pageInstances.get(userId);
    
    try {
        await sleep(500);
        
        await page.evaluate(elementNumberingScript);
        
        const pageData = await page.evaluate(() => {
            let elementsString = '';
            
            if (window.numberedElements && typeof window.numberedElements === 'object') {
                elementsString = Object.keys(window.numberedElements).map(key => {
                    const el = window.numberedElements[key];
                    
                    if (el) {
                      return `${key}: ${el.tagName}${el.id ? ' id=' + el.id : ''}${el.className ? ' class=' + el.className : ''}`;
                    }
                    return `${key}: Element not found`; 
                }).join(', ');
            } else {
                 elementsString = ''; 
            }

            const textContent = document.body.innerText.substring(0, 1000); 

            return {
                elements: elementsString,
                websiteTextContent: textContent
            };
        });
        
        const screenshot = await page.screenshot({ 
            type: 'jpeg',
            quality: SCREENSHOT_QUALITY
        });
        
        const base64Screenshot = screenshot.toString('base64');
        
        let toolState = contextManager.getToolState('browser', userId);
        
        if (toolState.activeSession) {
            const sessionIndex = toolState.sessions.findIndex(s => s.id === toolState.activeSession);
            if (sessionIndex >= 0) {
                toolState.sessions[sessionIndex].contentSnapshots = toolState.sessions[sessionIndex].contentSnapshots || [];
                toolState.sessions[sessionIndex].contentSnapshots.push({
                    url: page.url(),
                    elementCount: Object.keys(pageData.elements).length,
                    textPreview: pageData.websiteTextContent.substring(0, 100) + '...',
                    timestamp: Date.now()
                });
            }
        }
        
        contextManager.setToolState('browser', toolState, userId);
        
        return {
            elements: pageData.elements,
            websiteTextContent: pageData.websiteTextContent,
            screenshot: 'data:image/jpeg;base64,' + base64Screenshot
        };
    } catch (error) {
        console.error("Error getting page content:", error);
        return {
            elements: "",
            websiteTextContent: `Error getting content: ${error.message}`,
            screenshot: null
        };
    }
}

async function close(userId = 'default'){
    try {
        let toolState = contextManager.getToolState('browser', userId);
        
        if (toolState.activeSession) {
            const sessionIndex = toolState.sessions.findIndex(s => s.id === toolState.activeSession);
            if (sessionIndex >= 0) {
                toolState.sessions[sessionIndex].endTime = new Date().toISOString();
                toolState.sessions[sessionIndex].closed = true;
            }
        }
        
        toolState.activeSession = null;
        
        contextManager.setToolState('browser', toolState, userId);
        
        if (pageInstances.has(userId)) {
            await pageInstances.get(userId).close().catch(e => console.log("Error closing page:", e));
            pageInstances.delete(userId);
        }
        
        return {success: true};
    } catch (error) {
        console.error("Error closing browser:", error);
        return {success: false, error: error.message};
    }
}

/**
 * Takes a screenshot of the current browser page for real-time updates
 * @param {string} userId - The user identifier
 * @returns {Promise<string|null>} - Base64 encoded screenshot or null if browser not available
 */
async function takeScreenshot(userId = 'default') {
    try {
        if (!pageInstances.has(userId)) {
            return null;
        }
        
        const page = pageInstances.get(userId);
        
        const screenshot = await page.screenshot({ 
            type: 'jpeg', 
            quality: SCREENSHOT_QUALITY
        });
        
        return screenshot.toString('base64');
    } catch (error) {
        console.error(`Error taking screenshot for user ${userId}:`, error.message);
        return null;
    }
}

/**
 * Clean up browser resources for a specific user
 * @param {string} userId - User identifier
 * @returns {Promise<boolean>} - Success status
 */
async function cleanupResources(userId = 'default') {
  try {
    if (browserInstances.has(userId)) {
      const browser = browserInstances.get(userId);
      await browser.close().catch(e => console.error(`Error closing browser for user ${userId}:`, e));
      browserInstances.delete(userId);
    }
    
    if (pageInstances.has(userId)) {
      pageInstances.delete(userId);
    }
    
    return true;
  } catch (error) {
    console.error(`Error cleaning up browser resources for user ${userId}:`, error);
    return false;
  }
}

module.exports = {
    runTask,
    close,
    initialize,
    cleanupResources,
    takeScreenshot
};
