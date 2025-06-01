const { chromium } = require('playwright');
const elementNumberingScript = require('./scriptInjector');
const ai = require('../AI/ai');
const contextManager = require('../../utils/context');

// Performance optimizations
const MAX_WEBSITE_TEXT_LENGTH = 800; // Increased for better context
const MAX_ELEMENT_COUNT = 20; // Increased for better interaction
const SCREENSHOT_QUALITY = 60; // Improved quality
const MAX_HISTORY_LENGTH = 5; // Increased history
const PAGE_LOAD_TIMEOUT = 30000; // 30 second timeout
const NAVIGATION_TIMEOUT = 10000; // 10 second navigation timeout

// Enhanced browser management
const browserInstances = new Map();
const pageInstances = new Map();
const sessionMetrics = new Map();

/**
 * Enhanced browser initialization with better configuration
 * @param {string} userId - User identifier
 * @returns {Object} Browser instance
 */
async function initialize(userId = 'default'){
    if(browserInstances.has(userId)){
        return browserInstances.get(userId);
    }
    
    try {
        const browser = await chromium.launch({
            headless: false,
            args: [
                '--no-sandbox',
                '--disable-dev-shm-usage',
                '--disable-blink-features=AutomationControlled',
                '--disable-web-security',
                '--allow-running-insecure-content',
                '--disable-features=VizDisplayCompositor'
            ],
            timeout: 30000
        });
        
        browserInstances.set(userId, browser);
        
        let toolState = contextManager.getToolState('browser', userId) || {
            history: [],
            lastActions: [],
            sessions: [],
            activeSession: null,
            performance: {
                totalSessions: 0,
                averageSessionTime: 0,
                successfulActions: 0,
                failedActions: 0
            }
        };
        
        const session = {
            id: Date.now(),
            startTime: new Date().toISOString(),
            pages: [],
            actions: [],
            performance: {
                startTime: Date.now(),
                actionCount: 0,
                errorCount: 0
            }
        };
        
        toolState.sessions.push(session);
        toolState.activeSession = session.id;
        toolState.performance.totalSessions++;
        
        contextManager.setToolState('browser', toolState, userId);
        
        console.log(`Browser initialized for user ${userId}`);
        return browser;
        
    } catch (error) {
        console.error(`Failed to initialize browser for user ${userId}:`, error.message);
        throw new Error(`Browser initialization failed: ${error.message}`);
    }
}

/**
 * Enhanced task function with improved AI prompting and error handling
 */
async function taskFunction(task, data, image, websiteTextContent, userId = 'default'){
    let toolState = contextManager.getToolState('browser', userId);
    
    // Enhanced element data processing
    const elementData = limitElements(data);
    const truncatedWebsiteContent = websiteTextContent.substring(0, MAX_WEBSITE_TEXT_LENGTH);
    
    data = "Elements available for interaction: " + elementData + "\n\n" + "Website text content: " + truncatedWebsiteContent;
    
    // Improved AI prompt with better context and instructions
    let prompt = `
    You are an AI agent controlling a web browser. Your goal is to complete the user's task efficiently and accurately.
    
    Available actions:
    1. {"action": "goToPage", "url": "URL_HERE"} - Navigate to a specific URL
    2. {"action": "click", "element": "ELEMENT_ID"} - Click on an interactive element
    3. {"action": "input", "text": "TEXT_HERE", "element": "ELEMENT_ID"} - Type text into form fields
    4. {"action": "scroll", "direction": "up|down"} - Scroll the page
    5. {"action": "wait", "duration": 2000} - Wait for page to load (milliseconds)
    6. {"action": "close", "summary": "DETAILED_SUMMARY"} - Complete the task with summary
    
    Context from previous actions: ${toolState.lastActions.slice(-3).join(", ")}
    
    Current task: ${task}
    
    Instructions:
    - Analyze the page content carefully before acting
    - Be patient with page loads and dynamic content
    - Provide detailed summaries when closing
    - If you encounter errors, try alternative approaches
    - Confirm task completion before closing
    
    Respond with ONE action only in JSON format.
    `;

    // Update conversation history
    toolState.history.push({
        role: "user", 
        content: [
            {type: "text", text: data}
        ]
    });
    
    limitHistory(toolState);
    contextManager.setToolState('browser', toolState, userId);

    try {
        let result = await ai.callAI(prompt, data, toolState.history, image, true, "browser", userId);

        if(!result) {
            throw new Error("No response from AI");
        }
        
        // Validate and sanitize AI response
        result = validateAndSanitizeAction(result);
        
        toolState.history.push({
            role: "assistant", 
            content: [
                {type: "text", text: JSON.stringify(result)}
            ]
        });
        
        limitHistory(toolState);

        // Update action tracking
        toolState.lastActions.push(JSON.stringify(result));
        if (toolState.lastActions.length > 5) {
            toolState.lastActions = toolState.lastActions.slice(-5);
        }
        
        // Update session metrics
        if (toolState.activeSession) {
            const sessionIndex = toolState.sessions.findIndex(s => s.id === toolState.activeSession);
            if (sessionIndex >= 0) {
                toolState.sessions[sessionIndex].actions = toolState.sessions[sessionIndex].actions || [];
                toolState.sessions[sessionIndex].actions.push({
                    action: result.action,
                    timestamp: Date.now(),
                    details: result
                });
                toolState.sessions[sessionIndex].performance.actionCount++;
            }
        }
        
        contextManager.setToolState('browser', toolState, userId);
        
        // Execute the action
        const actionResult = await executeAction(result, userId, toolState);
        
        if (actionResult && actionResult.error) {
            toolState.sessions[toolState.sessions.findIndex(s => s.id === toolState.activeSession)].performance.errorCount++;
            contextManager.setToolState('browser', toolState, userId);
        }
        
        if(result.action === "close"){
            return await handleTaskCompletion(result, userId, toolState);
        }

        // Continue with next iteration
        let content = await getContent(userId);
        return taskFunction(task, content.elements, content.screenshot, content.websiteTextContent, userId);
        
    } catch (error) {
        console.error("Browser task error:", error.message);
        
        // Update error metrics
        if (toolState.activeSession) {
            const sessionIndex = toolState.sessions.findIndex(s => s.id === toolState.activeSession);
            if (sessionIndex >= 0) {
                toolState.sessions[sessionIndex].performance.errorCount++;
                toolState.sessions[sessionIndex].errors = toolState.sessions[sessionIndex].errors || [];
                toolState.sessions[sessionIndex].errors.push({
                    error: error.message,
                    timestamp: Date.now(),
                    context: { task, data: elementData }
                });
            }
        }
        
        toolState.performance.failedActions++;
        contextManager.setToolState('browser', toolState, userId);
        
        return {
            error: error.message,
            success: false,
            partial: "Browser task encountered an error. Please try again."
        };
    }
}

/**
 * Validates and sanitizes AI action responses
 * @param {Object} result - AI response
 * @returns {Object} Validated action
 */
function validateAndSanitizeAction(result) {
    if (!result || typeof result !== 'object') {
        throw new Error("Invalid AI response format");
    }
    
    const validActions = ['goToPage', 'click', 'input', 'scroll', 'wait', 'close'];
    
    if (!result.action || !validActions.includes(result.action)) {
        throw new Error(`Invalid action: ${result.action}`);
    }
    
    // Sanitize based on action type
    switch(result.action) {
        case 'goToPage':
            if (!result.url || typeof result.url !== 'string') {
                throw new Error("Invalid URL for goToPage action");
            }
            // Basic URL validation
            try {
                new URL(result.url);
            } catch {
                if (!result.url.startsWith('http')) {
                    result.url = 'https://' + result.url;
                }
            }
            break;
            
        case 'input':
            if (!result.text || !result.element) {
                throw new Error("Missing text or element for input action");
            }
            result.text = String(result.text);
            break;
            
        case 'scroll':
            if (!['up', 'down'].includes(result.direction)) {
                result.direction = 'down'; // Default
            }
            break;
            
        case 'wait':
            result.duration = Math.min(Math.max(parseInt(result.duration) || 2000, 1000), 10000);
            break;
    }
    
    return result;
}

/**
 * Executes browser actions with improved error handling
 * @param {Object} result - Action to execute
 * @param {string} userId - User ID
 * @param {Object} toolState - Current tool state
 * @returns {Object} Execution result
 */
async function executeAction(result, userId, toolState) {
    try {
        switch(result.action) {
            case "goToPage":
                return await goToPage(result.url, userId);
                
            case "click":
                return await click(result.element, userId);
                
            case "input":
                return await input(result.element, result.text, userId);
                
            case "scroll":
                return await scroll(result.direction, userId);
                
            case "wait":
                await sleep(result.duration || 2000);
                return { success: true, action: 'wait' };
                
            default:
                return { success: false, error: `Unknown action: ${result.action}` };
        }
    } catch (error) {
        console.error(`Action execution error for ${result.action}:`, error.message);
        return { success: false, error: error.message };
    }
}

/**
 * Handles task completion with improved session management
 */
async function handleTaskCompletion(result, userId, toolState) {
    console.log("Task completed:", result.summary);
    
    if (toolState.activeSession) {
        const sessionIndex = toolState.sessions.findIndex(s => s.id === toolState.activeSession);
        if (sessionIndex >= 0) {
            const session = toolState.sessions[sessionIndex];
            session.completed = true;
            session.endTime = new Date().toISOString();
            session.summary = result.summary;
            session.performance.duration = Date.now() - session.performance.startTime;
            
            // Update overall performance metrics
            toolState.performance.successfulActions++;
            const sessionDuration = session.performance.duration;
            toolState.performance.averageSessionTime = 
                (toolState.performance.averageSessionTime * (toolState.performance.totalSessions - 1) + sessionDuration) / 
                toolState.performance.totalSessions;
        }
    }
    
    contextManager.setToolState('browser', toolState, userId);
    
    // Trigger callback if available
    const summaryCallback = toolState.summaryCallback;
    if (summaryCallback) {
        const callbackMap = toolState.callbackMap || new Map();
        const actualCallback = callbackMap.get(summaryCallback);
        if (actualCallback) {
            actualCallback(result.summary);
        }
    }
    
    // Clean up but don't immediately close browser for potential follow-up tasks
    setTimeout(() => {
        close(userId).catch(console.error);
    }, 5000);
    
    return result.summary;
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

/**
 * Enhanced page navigation with better error handling and timeout management
 */
async function goToPage(url, userId = 'default'){
    const browser = await initialize(userId);
    
    try {
        // Close existing page if it exists
        if(pageInstances.has(userId)){
            await pageInstances.get(userId).close().catch(e => console.log("Error closing page:", e));
        }
        
        const context = await browser.newContext({
            viewport: { width: 1920, height: 1080 },
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        });
        
        const page = await context.newPage();
        pageInstances.set(userId, page);
        
        // Enhanced page setup with better element detection
        await page.addInitScript(() => {
            // Improved element detection and interaction
            window.numberedElements = [];
            window.elementMap = new Map();
            
            window.setupElementDetection = () => {
                const interactiveElements = document.querySelectorAll(
                    'button, a, input, select, textarea, [onclick], [role="button"], [tabindex]'
                );
                
                interactiveElements.forEach((el, index) => {
                    if (el.offsetParent !== null && !el.disabled) { // Only visible, enabled elements
                        window.numberedElements[index] = el;
                        window.elementMap.set(el, index);
                        el.setAttribute('data-element-id', index);
                    }
                });
            };
            
            // Auto-setup when DOM changes
            const observer = new MutationObserver(() => {
                setTimeout(window.setupElementDetection, 100);
            });
            
            observer.observe(document.body, { childList: true, subtree: true });
            
            if (document.readyState === 'complete') {
                window.setupElementDetection();
            } else {
                document.addEventListener('DOMContentLoaded', window.setupElementDetection);
                window.addEventListener('load', window.setupElementDetection);
            }
        });
        
        let toolState = contextManager.getToolState('browser', userId);
        
        console.log(`Navigating to: ${url}`);
        
        await page.goto(url, { 
            timeout: PAGE_LOAD_TIMEOUT,
            waitUntil: 'domcontentloaded'
        });
        
        // Wait for page to stabilize
        await sleep(3000);
        
        // Setup element detection
        await page.evaluate(() => {
            if (window.setupElementDetection) {
                window.setupElementDetection();
            }
        });
        
        // Update session tracking
        if (toolState.activeSession) {
            const sessionIndex = toolState.sessions.findIndex(s => s.id === toolState.activeSession);
            if (sessionIndex >= 0) {
                toolState.sessions[sessionIndex].pages = toolState.sessions[sessionIndex].pages || [];
                toolState.sessions[sessionIndex].pages.push({
                    url,
                    timestamp: Date.now(),
                    title: await page.title().catch(() => 'Unknown')
                });
            }
        }
        
        contextManager.setToolState('browser', toolState, userId);
        
        console.log(`Successfully navigated to: ${url}`);
        return {success: true, url: url};
        
    } catch (error) {
        console.error("Navigation error:", error.message);
        
        let toolState = contextManager.getToolState('browser', userId);
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
