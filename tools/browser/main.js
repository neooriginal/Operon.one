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

// Sidebar management
function updateBrowserSidebar(userId, page = null) {
    if (typeof global.updateSidebar === 'function' && page) {
        try {
            // Get current page info and screenshot
            Promise.all([
                page.url(),
                page.title(),
                takeScreenshot(userId)
            ]).then(([currentUrl, pageTitle, screenshot]) => {
                global.updateSidebar(userId, 'browser', {
                    currentUrl,
                    pageTitle,
                    screenshot,
                    timestamp: Date.now()
                });
            }).catch(error => {
                console.warn('Failed to update browser sidebar:', error.message);
            });
        } catch (error) {
            console.warn('Error updating browser sidebar:', error.message);
        }
    }
}

async function initialize(userId = 'default'){
    if(browserInstances.has(userId)){
        return browserInstances.get(userId);
    }
    
    const browser = await chromium.launch({
        headless: false,
        args: [
            '--disable-blink-features=AutomationControlled',
            '--no-sandbox',
            '--disable-web-security'
        ]
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
    
    // Add task timeout mechanism
    const MAX_TASK_RUNTIME = 5 * 60 * 1000; // 5 minutes
    const taskStartTime = toolState.taskStartTime || Date.now();
    
    // Store the task start time if not already set
    if (!toolState.taskStartTime) {
        toolState.taskStartTime = taskStartTime;
        contextManager.setToolState('browser', toolState, userId);
    }
    
    // Check if task has been running too long
    if (Date.now() - taskStartTime > MAX_TASK_RUNTIME) {
        console.log("Task timeout reached after 5 minutes");
        
        if (toolState.activeSession) {
            const sessionIndex = toolState.sessions.findIndex(s => s.id === toolState.activeSession);
            if (sessionIndex >= 0) {
                toolState.sessions[sessionIndex].completed = true;
                toolState.sessions[sessionIndex].endTime = new Date().toISOString();
                toolState.sessions[sessionIndex].timedOut = true;
            }
        }
        
        // Reset the task start time
        toolState.taskStartTime = null;
        contextManager.setToolState('browser', toolState, userId);
        
        await close(userId);
        return "Task timed out after 5 minutes. Please try again with a more specific task.";
    }
    
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

    // Add timeout for AI call
    const aiCallPromise = ai.callAI(prompt, data, toolState.history, image, true, "browser", userId);
    let result;
    
    try {
        result = await Promise.race([
            aiCallPromise,
            new Promise((_, reject) => 
                setTimeout(() => reject(new Error("AI call timed out after 60 seconds")), 60000)
            )
        ]);
    } catch (error) {
        console.error("AI call error or timeout:", error);
        // Reset task start time and return error
        toolState.taskStartTime = null;
        contextManager.setToolState('browser', toolState, userId);
        await close(userId);
        return "Error: " + error.message;
    }

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
        // Update sidebar after navigation
        const page = pageInstances.get(userId);
        if (page) {
            setTimeout(() => updateBrowserSidebar(userId, page), 1000); // Wait for page to load
        }
    }else if(result.action === "click"){
        await click(result.element, userId);
        // Update sidebar after interaction
        const page = pageInstances.get(userId);
        if (page) {
            setTimeout(() => updateBrowserSidebar(userId, page), 500);
        }
    }else if(result.action === "input"){
        await input(result.element, result.text, userId);
        // Update sidebar after input
        const page = pageInstances.get(userId);
        if (page) {
            setTimeout(() => updateBrowserSidebar(userId, page), 500);
        }
    }else if(result.action === "scroll"){
        await scroll(result.direction, userId);
        // Update sidebar after scroll
        const page = pageInstances.get(userId);
        if (page) {
            setTimeout(() => updateBrowserSidebar(userId, page), 500);
        }
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
        
        // Reset the task start time on successful completion
        toolState.taskStartTime = null;
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
    For now, I need a JSON response to know which page to start the task with.
    
    Please respond with the following format:
    {
        "url": "starting URL for the task",
        "explanation": "brief explanation of why this is a good starting point"
    }
    
    The task is: ${task}
    `
    
    let data = "Task: " + task;
    
    toolState.history.push({
        role: "user", 
        content: [
            {type: "text", text: data}
        ]
    });
    
    limitHistory(toolState);
    
    contextManager.setToolState('browser', toolState, userId);

    let result = await ai.callAI(prompt, data, [], null, true, "browser", userId);
    
    if(!result || !result.url) {
        // Fallback to a default search engine if URL not provided
        result = {
            url: "https://www.google.com",
            explanation: "Falling back to default search engine"
        };
    }
    
    toolState.history.push({
        role: "assistant", 
        content: [
            {type: "text", text: JSON.stringify(result)}
        ]
    });
    
    limitHistory(toolState);
    
    contextManager.setToolState('browser', toolState, userId);
    
    return result;
}


async function runTask(task, otherAIData, callback, userId = 'default') {
    let browser;
    try {
        browser = await initialize(userId);
        
        let toolState = contextManager.getToolState('browser', userId) || {
            history: [],
            lastActions: [],
            sessions: [],
            activeSession: null
        };
        
        if (callback) {
            toolState.summaryCallback = typeof callback === 'function' ? callback.toString() : callback;
            
            // Store the callback in a map if it's a function
            if (typeof callback === 'function') {
                toolState.callbackMap = toolState.callbackMap || new Map();
                const callbackId = Date.now().toString();
                toolState.callbackMap.set(callbackId, callback);
                toolState.summaryCallback = callbackId;
            }
        }
        
        contextManager.setToolState('browser', toolState, userId);
        
        let searchURLResult = await initialAI(task, userId);
        
        if (!searchURLResult || !searchURLResult.url) {
            throw new Error("Failed to determine starting URL for task");
        }
        
        await goToPage(searchURLResult.url, userId);
        
        let content = await getContent(userId);
        let summary = await taskFunction(task, content.elements, content.screenshot, content.websiteTextContent, userId);
        
        return summary;
    } catch (error) {
        console.error("Error running browser task:", error);
        
        let toolState = contextManager.getToolState('browser', userId);
        
        if (toolState.activeSession) {
            const sessionIndex = toolState.sessions.findIndex(s => s.id === toolState.activeSession);
            if (sessionIndex >= 0) {
                toolState.sessions[sessionIndex].errors = toolState.sessions[sessionIndex].errors || [];
                toolState.sessions[sessionIndex].errors.push({
                    error: error.message,
                    timestamp: Date.now(),
                    task
                });
                
                toolState.sessions[sessionIndex].completed = true;
                toolState.sessions[sessionIndex].endTime = new Date().toISOString();
                toolState.sessions[sessionIndex].success = false;
            }
        }
        
        contextManager.setToolState('browser', toolState, userId);
        
        // Don't close the browser, just the page
        if (pageInstances.has(userId)) {
            await pageInstances.get(userId).close().catch(e => console.log("Error closing page:", e));
            pageInstances.delete(userId);
        }
        
        return `Error executing web browsing task: ${error.message}`;
    }
}

async function goToPage(url, userId = 'default'){
    try {
        let browser;
        if (!browserInstances.has(userId)) {
            browser = await initialize(userId);
        } else {
            browser = browserInstances.get(userId);
        }
        
        // Close any existing page before creating a new one
        if (pageInstances.has(userId)) {
            await pageInstances.get(userId).close().catch(e => console.log("Error closing page:", e));
        }
        
        const context = await browser.newContext({
            userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.0.0 Safari/537.36',
            viewport: { width: 1280, height: 800 },
            deviceScaleFactor: 1,
            hasTouch: false
        });
        
        // Override navigator properties to prevent detection
        await context.addInitScript(() => {
            Object.defineProperty(navigator, 'webdriver', {
                get: () => false
            });
            
            // Override navigator platform property if necessary
            if (navigator.platform !== 'MacIntel') {
                Object.defineProperty(navigator, 'platform', {
                    get: () => 'MacIntel'
                });
            }
        });
        
        const page = await context.newPage();
        pageInstances.set(userId, page);
        
        // Add a delay to make behavior more human-like
        await sleep(Math.floor(Math.random() * 1000) + 500);
        
        let toolState = contextManager.getToolState('browser', userId);
        
        if (toolState.activeSession) {
            const sessionIndex = toolState.sessions.findIndex(s => s.id === toolState.activeSession);
            if (sessionIndex >= 0) {
                toolState.sessions[sessionIndex].pages.push({
                    url,
                    timestamp: Date.now()
                });
            }
        }
        
        contextManager.setToolState('browser', toolState, userId);
        
        await page.goto(url, { 
            timeout: 60000,  // 60 seconds timeout
            waitUntil: 'domcontentloaded'  // Wait until DOM is loaded, but don't wait for all resources
        });
        
        // Ensure the script injector runs to number elements
        try {
            await page.evaluate(elementNumberingScript);
        } catch (error) {
            console.warn("Script injection error:", error.message);
            // Continue anyway, don't let script injection failure stop the process
        }
        
        return {success: true};
    } catch (error) {
        console.log("Error navigating to page:", error);
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
    
    // Remove any previous event listeners to avoid memory leaks
    page.removeAllListeners('console');
    
    page.on('console', message => {
        if(message.text().startsWith('Error clicking element:')){
            result = message.text();
        }
    });
    
    try {
        // Better navigation handling with a reasonable timeout
        const navigationPromise = page.waitForNavigation({ 
            timeout: 10000,
            waitUntil: 'domcontentloaded'
        }).catch(e => {
            console.log("Navigation did not complete, but continuing:", e.message);
        });
        
        // Set a click timeout
        const clickPromise = page.evaluate(`
            try{
                window.clickElement(${JSON.stringify(element)});
                return "success";
            }catch(e){
                console.log("Error clicking element: " + e);
                return "Error: " + e.message;
            }
        `).catch(e => {
            console.error("Click evaluation error:", e);
            return "Error: " + e.message;
        });
        
        // Add timeout for click operation
        const clickResult = await Promise.race([
            clickPromise,
            new Promise((_, reject) => 
                setTimeout(() => reject(new Error("Click operation timed out after 5 seconds")), 5000)
            )
        ]).catch(e => {
            console.error("Click timed out or errored:", e);
            return "Error: " + e.message;
        });
        
        if (clickResult !== "success") {
            result = clickResult;
        }
        
        // Wait for navigation, but with a timeout
        await Promise.race([
            navigationPromise,
            new Promise(resolve => setTimeout(resolve, 5000)) // Max 5 seconds wait
        ]);
        
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
        
        // Ensure script injection is applied consistently with better error handling
        try {
            await page.evaluate(elementNumberingScript);
            // Add a short delay to allow script to complete running
            await sleep(300);
        } catch (error) {
            console.warn("Script injection error in getContent:", error.message);
            // Continue anyway
        }
        
        // Use a timeout to prevent hanging on page evaluation
        const pageDataPromise = page.evaluate(() => {
            let elementsString = '';
            
            try {
                if (window.numberedElements && typeof window.numberedElements === 'object') {
                    elementsString = Object.keys(window.numberedElements).map(key => {
                        const el = window.numberedElements[key];
                        
                        if (el) {
                          return `${key}: ${el.tagName}${el.id ? ' id=' + el.id : ''}${el.className ? ' class=' + el.className : ''}`;
                        }
                        return `${key}: Element not found`; 
                    }).join(', ');
                }
            } catch (e) {
                console.error("Error getting elements:", e);
                elementsString = "Error getting elements: " + e.message;
            }

            let textContent = "";
            try {
                textContent = document.body.innerText.substring(0, 1000);
            } catch (e) {
                console.error("Error getting text content:", e);
                textContent = "Error getting text content: " + e.message;
            }

            return {
                elements: elementsString,
                websiteTextContent: textContent
            };
        }).catch(e => {
            console.error("Error evaluating page content:", e);
            return {
                elements: "",
                websiteTextContent: "Error evaluating page: " + e.message
            };
        });
        
        // Add timeout for page evaluation
        const pageData = await Promise.race([
            pageDataPromise,
            new Promise((_, reject) => 
                setTimeout(() => reject(new Error("Page evaluation timed out after 10 seconds")), 10000)
            )
        ]).catch(e => {
            console.error("Timed out or error getting page data:", e);
            return {
                elements: "",
                websiteTextContent: "Error or timeout: " + e.message
            };
        });
        
        // Take screenshot with timeout
        let base64Screenshot = null;
        try {
            const screenshotPromise = page.screenshot({ 
                type: 'jpeg',
                quality: SCREENSHOT_QUALITY
            });
            
            const screenshot = await Promise.race([
                screenshotPromise,
                new Promise((_, reject) => 
                    setTimeout(() => reject(new Error("Screenshot timed out after 5 seconds")), 5000)
                )
            ]);
            
            base64Screenshot = screenshot.toString('base64');
        } catch (error) {
            console.error("Screenshot error:", error);
            // Continue without screenshot
        }
        
        let toolState = contextManager.getToolState('browser', userId);
        
        if (toolState.activeSession) {
            const sessionIndex = toolState.sessions.findIndex(s => s.id === toolState.activeSession);
            if (sessionIndex >= 0) {
                toolState.sessions[sessionIndex].contentSnapshots = toolState.sessions[sessionIndex].contentSnapshots || [];
                toolState.sessions[sessionIndex].contentSnapshots.push({
                    url: page.url(),
                    elementCount: Object.keys(pageData.elements || {}).length,
                    textPreview: (pageData.websiteTextContent || "").substring(0, 100) + '...',
                    timestamp: Date.now()
                });
            }
        }
        
        contextManager.setToolState('browser', toolState, userId);
        
        return {
            elements: pageData.elements || "",
            websiteTextContent: pageData.websiteTextContent || "",
            screenshot: base64Screenshot ? 'data:image/jpeg;base64,' + base64Screenshot : null
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
        
        // Only close the page, not the browser
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
    if (pageInstances.has(userId)) {
      pageInstances.delete(userId);
    }
    
    // Only close the browser if explicitly requested or during server shutdown
    if (browserInstances.has(userId)) {
      const browser = browserInstances.get(userId);
      await browser.close().catch(e => console.error(`Error closing browser for user ${userId}:`, e));
      browserInstances.delete(userId);
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
