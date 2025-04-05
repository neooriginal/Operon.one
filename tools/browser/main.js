const puppeteer = require('puppeteer');
const elementNumberingScript = require('./scriptInjector');
const ai = require('../AI/ai');
const contextManager = require('../../utils/context');

// Token optimization settings
const MAX_WEBSITE_TEXT_LENGTH = 500; // Reduced from 1000
const MAX_ELEMENT_COUNT = 15; // Limit number of elements
const SCREENSHOT_QUALITY = 50; // Reduced from 80
const MAX_HISTORY_LENGTH = 3; // Keep only recent interactions

// Initialize browser instance map to support multiple users
const browserInstances = new Map();
const pageInstances = new Map();

async function initialize(userId = 'default'){
    if(browserInstances.has(userId)){
        return browserInstances.get(userId);
    }
    
    const browser = await puppeteer.launch({
        headless: false,
        defaultViewport: null,
    });
    
    // Store in the browser map
    browserInstances.set(userId, browser);
    
    // Initialize tool state for this user
    let toolState = contextManager.getToolState('browser', userId) || {
        history: [],
        lastActions: [],
        sessions: [],
        activeSession: null
    };
    
    // Create a new session
    const session = {
        id: Date.now(),
        startTime: new Date().toISOString(),
        pages: []
    };
    
    toolState.sessions.push(session);
    toolState.activeSession = session.id;
    
    // Save to context
    contextManager.setToolState('browser', toolState, userId);
    
    return browser;
}

async function taskFunction(task, data, image, websiteTextContent, userId = 'default'){
    // Get tool state
    let toolState = contextManager.getToolState('browser', userId);
    
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
    Last actions you did: ${toolState.lastActions.join(", ")}

    The main task is: ${task}

    Once you have enough information to confidently complete the task, respond with the "close" action. Look at previous messages for the information collected earlier and use it to summarize and finish the task.
    `

    // Manage history - add user's most recent input 
    toolState.history.push({
        role: "user", 
        content: [
            {type: "text", text: data}
        ]
    });
    
    // Keep history limited to prevent token growth
    limitHistory(toolState);
    
    // Save updated state
    contextManager.setToolState('browser', toolState, userId);

    let result = await ai.callAI(prompt, data, toolState.history, image, true, "browser", userId);

    if(!result) {
        return taskFunction(task, data, image, websiteTextContent, userId);
    }
    
    // Add AI response to history
    toolState.history.push({
        role: "assistant", 
        content: [
            {type: "text", text: JSON.stringify(result)}
        ]
    });
    
    // Keep history limited again after adding response
    limitHistory(toolState);

    toolState.lastActions.push(JSON.stringify(result));
    if (toolState.lastActions.length > 5) {
        toolState.lastActions = toolState.lastActions.slice(-5);
    }
    
    // Save action in active session
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
    
    // Save state before action execution
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
        
        // Update session with completion
        if (toolState.activeSession) {
            const sessionIndex = toolState.sessions.findIndex(s => s.id === toolState.activeSession);
            if (sessionIndex >= 0) {
                toolState.sessions[sessionIndex].completed = true;
                toolState.sessions[sessionIndex].endTime = new Date().toISOString();
                toolState.sessions[sessionIndex].summary = result.summary;
            }
        }
        
        // Store final state
        contextManager.setToolState('browser', toolState, userId);
        
        // Get callback from state
        const summaryCallback = toolState.summaryCallback;
        if (summaryCallback) {
            // We can't store the actual callback function in the state,
            // so retrieve it from a temporary map
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

// Helper function to limit history length
function limitHistory(toolState) {
    if (toolState.history.length > MAX_HISTORY_LENGTH * 2) { // *2 to account for pairs of user/assistant messages
        // Keep only the most recent interactions
        toolState.history = toolState.history.slice(-MAX_HISTORY_LENGTH * 2);
    }
}

// Helper function to limit elements data
function limitElements(elementData) {
    if (!elementData) return "";
    
    // Split by elements and take only top elements
    const elements = elementData.split(',').slice(0, MAX_ELEMENT_COUNT);
    return elements.join(',');
}

async function initialAI(task, userId = 'default'){
    // Initialize tool state
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
    
    // Track this interaction
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
    
    // Save state
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

// Add function to run task from external files
async function runTask(task, otherAIData, callback, userId = 'default') {
    // Initialize or reset tool state for this user
    let toolState = contextManager.getToolState('browser', userId) || {
        history: [],
        lastActions: [],
        sessions: [],
        activeSession: null
    };
    
    // Create a new session for this task
    const session = {
        id: Date.now(),
        startTime: new Date().toISOString(),
        task: task,
        actions: []
    };
    
    toolState.sessions.push(session);
    toolState.activeSession = session.id;
    
    // Reset history and actions for new task
    toolState.history = [];
    toolState.lastActions = [];
    
    // Only add other AI data if it exists and isn't too large
    if (otherAIData) {
        const truncatedData = otherAIData.substring(0, MAX_WEBSITE_TEXT_LENGTH);
        toolState.history.push({
            role: "user", 
            content: [
                {type: "text", text: truncatedData}
            ]
        });
    }
    
    // Use a temporary callbackId to reference the actual callback function
    // (we can't store functions in the context)
    const callbackId = Date.now();
    toolState.summaryCallback = callbackId;
    
    // Create or get callback map and store the reference
    toolState.callbackMap = toolState.callbackMap || new Map();
    toolState.callbackMap.set(callbackId, callback);
    
    // Save initial state
    contextManager.setToolState('browser', toolState, userId);
    
    try {
        const summary = await initialAI(task, userId);
        return summary;
    } catch (error) {
        console.error("Error in browser task:", error);
        
        // Update session with error
        if (toolState.activeSession) {
            const sessionIndex = toolState.sessions.findIndex(s => s.id === toolState.activeSession);
            if (sessionIndex >= 0) {
                toolState.sessions[sessionIndex].error = error.message;
                toolState.sessions[sessionIndex].endTime = new Date().toISOString();
            }
        }
        
        // Save error state
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
    
    // Close existing page if present
    if(pageInstances.has(userId)){
        await pageInstances.get(userId).close().catch(e => console.log("Error closing page:", e));
    }
    
    // Create new page
    const page = await browser.newPage();
    pageInstances.set(userId, page);
    
    // Get tool state
    let toolState = contextManager.getToolState('browser', userId);
    
    try {
        await page.goto(url);
        
        // Record page in active session
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
        
        // Save updated state
        contextManager.setToolState('browser', toolState, userId);
        
        await sleep(1000);
        return {success: true};
    } catch (error) {
        console.error("Error navigating to page:", error);
        
        // Record error in session
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
        
        // Save error state
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
        
        // Get tool state and record action
        let toolState = contextManager.getToolState('browser', userId);
        
        // Record in active session
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
        
        // Save updated state
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
        
        // Get tool state and record action
        let toolState = contextManager.getToolState('browser', userId);
        
        // Record in active session
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
        
        // Save updated state
        contextManager.setToolState('browser', toolState, userId);
        
        return {result: result};
    } catch (error) {
        page.off('console', listener);
        console.log("Error during click operation:", error);
        
        // Get tool state and record error
        let toolState = contextManager.getToolState('browser', userId);
        
        // Record error in session
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
        
        // Save error state
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
    
    // Check if element is properly defined
    if (!element) {
        console.log("Error: No element specified for input");
        return {result: "Error: No element specified"};
    }
    
    try {
        // Changed from string-based evaluate to function-based evaluate
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
        
        // Get tool state and record action
        let toolState = contextManager.getToolState('browser', userId);
        
        // Record in active session
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
        
        // Save updated state
        contextManager.setToolState('browser', toolState, userId);
        
        if (success) {
            return {result: "Input successful"};
        } else {
            return {result: "Failed to input text - element not found"};
        }
    } catch (error) {
        console.log("Error during input operation:", error);
        
        // Get tool state and record error
        let toolState = contextManager.getToolState('browser', userId);
        
        // Record error in session
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
        
        // Save error state
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
        // Inject our custom element numbering script
        await page.evaluate(elementNumberingScript);
        
        // Get numbered elements
        const elements = await page.evaluate(() => {
            return Object.keys(window.numberedElements).map(key => {
                const el = window.numberedElements[key];
                return `${key}: ${el.tagName}${el.id ? ' id=' + el.id : ''}${el.className ? ' class=' + el.className : ''}`;
            }).join(', ');
        });
        
        // Get text content with reduced tokens
        const websiteTextContent = await page.evaluate(() => {
            return document.body.innerText.substring(0, 1000);  // Limit text extraction
        });
        
        // Take screenshot with lower quality
        const screenshot = await page.screenshot({ 
            encoding: 'base64',
            quality: SCREENSHOT_QUALITY,
            type: 'jpeg'
        });
        
        // Get tool state and record page content snapshot
        let toolState = contextManager.getToolState('browser', userId);
        
        // Record content snapshot in active session
        if (toolState.activeSession) {
            const sessionIndex = toolState.sessions.findIndex(s => s.id === toolState.activeSession);
            if (sessionIndex >= 0) {
                toolState.sessions[sessionIndex].contentSnapshots = toolState.sessions[sessionIndex].contentSnapshots || [];
                toolState.sessions[sessionIndex].contentSnapshots.push({
                    url: page.url(),
                    elementCount: Object.keys(elements).length,
                    textPreview: websiteTextContent.substring(0, 100) + '...',
                    timestamp: Date.now()
                });
            }
        }
        
        // Save updated state
        contextManager.setToolState('browser', toolState, userId);
        
        return {
            elements,
            websiteTextContent,
            screenshot: 'data:image/jpeg;base64,' + screenshot
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
        // Get tool state
        let toolState = contextManager.getToolState('browser', userId);
        
        // Mark as closed in tool state
        if (toolState.activeSession) {
            const sessionIndex = toolState.sessions.findIndex(s => s.id === toolState.activeSession);
            if (sessionIndex >= 0) {
                toolState.sessions[sessionIndex].endTime = new Date().toISOString();
                toolState.sessions[sessionIndex].closed = true;
            }
        }
        
        // Reset active session
        toolState.activeSession = null;
        
        // Save updated state
        contextManager.setToolState('browser', toolState, userId);
        
        // Close page if it exists
        if (pageInstances.has(userId)) {
            await pageInstances.get(userId).close().catch(e => console.log("Error closing page:", e));
            pageInstances.delete(userId);
        }
        
        // Don't close browser to allow reuse
        return {success: true};
    } catch (error) {
        console.error("Error closing browser:", error);
        return {success: false, error: error.message};
    }
}

/**
 * Clean up browser resources for a specific user
 * @param {string} userId - User identifier
 * @returns {Promise<boolean>} - Success status
 */
async function cleanupResources(userId = 'default') {
  try {
    // Close the browser instance if it exists
    if (browserInstances.has(userId)) {
      const browser = browserInstances.get(userId);
      await browser.close().catch(e => console.error(`Error closing browser for user ${userId}:`, e));
      browserInstances.delete(userId);
    }
    
    // Clear page reference as well
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
    cleanupResources
};
