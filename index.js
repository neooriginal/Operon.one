/**
 * @fileoverview Main orchestration module for the AI agent system.
 * Manages tool loading, execution flow, and user interactions.
 */

const fs = require('fs');
const path = require('path');
const ascii = require('./utils/ascii');
const contextManager = require('./utils/context');

const io = require('./socket');
const sanitize = require('sanitize-filename');
const prompts = require('./tools/AI/prompts');
require('dotenv').config();

const SCREENSHOT_INTERVAL = 5000;

/**
 * Sanitizes a path by ensuring it contains only safe characters.
 * @param {string} unsafePath - The potentially unsafe path to sanitize.
 * @returns {string} A sanitized version of the path.
 */
function sanitizePath(unsafePath) {
  if (!unsafePath) return '';
  
  const isAbsolute = path.isAbsolute(unsafePath);
  
  const pathSegments = unsafePath.split(/[\/\\]/g).map(segment => sanitize(segment));
  
  let safePath = pathSegments.join(path.sep);
  
  if (isAbsolute && !path.isAbsolute(safePath)) {
    safePath = path.resolve('/', safePath);
  }
  
  return safePath;
}

/**
 * Sanitizes a file path and ensures it's within the user's output directory.
 * @param {string} unsafePath - The potentially unsafe path to sanitize.
 * @param {string} userId - The user ID to determine the output directory.
 * @returns {string} A sanitized file path within the user's directory.
 */
function sanitizeFilePath(unsafePath, userId) {
  let safePath = sanitizePath(unsafePath);
  
  if (userId && userId !== 'default') {
    const userDir = path.join('output', userId);
    
    if (!fs.existsSync(userDir)) {
      fs.mkdirSync(userDir, { recursive: true });
    }
    
    if (!safePath.startsWith(userDir)) {
      const filename = path.basename(safePath);
      safePath = path.join(userDir, filename);
    }
  }
  
  return safePath;
}

// Storage for loaded tools and their descriptions
const toolsDirectory = path.join(__dirname, 'tools');
const tools = {};
const toolDescriptions = [];

/**
 * Loads all enabled tools from the tools directory.
 * Each tool must have a valid tool.json configuration file.
 */
function loadTools() {
  const toolFolders = fs.readdirSync(toolsDirectory).filter(folder => {
    const stat = fs.statSync(path.join(toolsDirectory, folder));
    return stat.isDirectory();
  });

  toolFolders.forEach(folder => {
    const toolJsonPath = path.join(toolsDirectory, folder, 'tool.json');
    
    try {
      if (fs.existsSync(toolJsonPath)) {
        const toolConfig = JSON.parse(fs.readFileSync(toolJsonPath, 'utf8'));
        
        if (toolConfig.enabled) {
          let mainFile = toolConfig.main || 'main.js';
          if (mainFile === 'main.js' && !fs.existsSync(path.join(toolsDirectory, folder, mainFile))) {
            if (fs.existsSync(path.join(toolsDirectory, folder, 'index.js'))) {
              mainFile = 'index.js';
            } else {
              console.warn(`Warning: Main file ${mainFile} not found for tool ${folder}, skipping`);
              return;
            }
          }
          
          const toolModule = require(path.join(toolsDirectory, folder, mainFile));
          tools[toolConfig.title] = toolModule;
          
          toolDescriptions.push({
            title: toolConfig.title,
            description: toolConfig.description,
            example: toolConfig.example
          });
          
          console.log(`Loaded tool: ${toolConfig.title}`);
        }
      } else {
        console.warn(`Warning: No tool.json found in ${folder}, skipping`);
      }
    } catch (error) {
      console.error(`Error loading tool from ${folder}:`, error.message);
    }
  });
  
  // Set tool descriptions in the prompts module
  prompts.setToolDescriptions(toolDescriptions);
}

// Initialize the application
ascii.printWelcome();
loadTools();

/**
 * Main orchestrator for processing user requests.
 * @param {string} question - The user's question or request.
 * @param {string} userId - The user ID (default: 'default').
 * @param {number} chatId - The chat ID (default: 1).
 * @param {boolean} isFollowUp - Whether this is a follow-up request (default: false).
 * @returns {string} The final response to the user.
 */
async function centralOrchestrator(question, userId = 'default', chatId = 1, isFollowUp = false) {
  try {
    // Validate inputs
    if (!question || typeof question !== 'string') {
      throw new Error('Invalid question format');
    }
    
    if (!userId || userId === 'default') {
      throw new Error('Authentication required: valid user ID is mandatory for production use');
    }
    
    chatId = parseInt(chatId, 10);
    if (isNaN(chatId) || chatId < 1) {
      chatId = 1; 
    }
    
    // Initialize or continue context
    if (!isFollowUp) {
      contextManager.resetContext(userId, chatId);
    }
    
    // Notify user that task is received
    io.to(`user:${userId}`).emit('task_received', { userId, chatId, task: question, isFollowUp });
    io.to(`user:${userId}`).emit('status_update', { userId, chatId, status: 'Improving prompt' });
    
    // Set the question in context
    contextManager.setQuestion(question, userId, chatId);

    // Generate planning prompt
    const history = contextManager.getHistoryWithChatId(userId, chatId);
    const prompt = prompts.generatePlanningPrompt(question, history);
    
    io.to(`user:${userId}`).emit('status_update', { userId, chatId, status: 'Planning task execution' });
    
    // Get plan from AI
    let planObject = await tools.chatCompletion.callAI(prompt, question, history, undefined, true, "auto", userId, chatId);
    
    // Handle direct answers without complex planning
    if (planObject.directAnswer === true && planObject.answer) {
      return await handleDirectAnswer(planObject, question, userId, chatId);
    }
    
    // Process complex tasks with multi-step plan
    return await executeTaskPlan(planObject, question, userId, chatId, isFollowUp);
    
  } catch (error) {
    console.error("Critical error in orchestration:", error.message);
    
    io.to(`user:${userId}`).emit('task_error', { userId, chatId, error: error.message });
    
    try {
      await cleanupUserResources(userId);
    } catch (cleanupError) {
      console.error("Error during cleanup:", cleanupError.message);
    }
    
    return `Critical error occurred during execution: ${error.message}`;
  }
}

/**
 * Handles direct answers without complex planning.
 * @param {Object} planObject - The plan object with directAnswer property.
 * @param {string} question - The user's question.
 * @param {string} userId - The user ID.
 * @param {number} chatId - The chat ID.
 * @returns {string} The direct answer.
 */
async function handleDirectAnswer(planObject, question, userId, chatId) {
  io.to(`user:${userId}`).emit('status_update', { userId, chatId, status: 'Direct answer provided' });
  
  const directAnswer = typeof planObject.answer === 'string' 
    ? planObject.answer 
    : JSON.stringify(planObject.answer);
  
  // Add to conversation history
  contextManager.addToHistory({
    role: "user", 
    content: [
      {type: "text", text: question}
    ]
  }, userId, chatId);
  
  contextManager.addToHistory({
    role: "assistant", 
    content: [
      {type: "text", text: directAnswer}
    ]
  }, userId, chatId);
  
  // Emit completion event
  io.to(`user:${userId}`).emit('task_completed', { 
    userId, 
    chatId,
    result: directAnswer,
    duration: 0,
    completedAt: new Date().toISOString(),
    outputFiles: {
      host: [],
      container: []
    },
    metrics: {
      stepCount: 1,
      successCount: 1,
      totalSteps: 1,
      durationSeconds: 0,
      averageStepTime: 0
    }
  });
  
  await cleanupUserResources(userId);
  
  return directAnswer;
}

/**
 * Executes a multi-step task plan.
 * @param {Object} planObject - The plan object from the AI.
 * @param {string} question - The user's question.
 * @param {string} userId - The user ID.
 * @param {number} chatId - The chat ID.
 * @param {boolean} isFollowUp - Whether this is a follow-up request.
 * @returns {string} The final response after task execution.
 */
async function executeTaskPlan(planObject, question, userId, chatId, isFollowUp) {
  // Extract plan steps
  const plan = Object.values(planObject).filter(item => item && typeof item === 'object');
  
  // Store plan in context
  contextManager.setPlan(plan, userId, chatId);
  
  // Add to conversation history
  contextManager.addToHistory({
    role: "user", 
    content: [
      {type: "text", text: question}
    ]
  }, userId, chatId);
  
  contextManager.addToHistory({
    role: "assistant", 
    content: [
      {type: "text", text: isFollowUp ? 
        JSON.stringify(planObject) : 
        (planObject.directAnswer === true ? planObject.answer : "Processing your task...")}
    ]
  }, userId, chatId);
  
  // Emit steps to client
  io.to(`user:${userId}`).emit('steps', { userId, chatId, plan });
  
  // Setup screenshot interval if using browser
  let screenshotInterval = setupScreenshotInterval(plan, userId, chatId);
  
  // Execute each step in the plan
  await executeSteps(plan, question, userId, chatId);
  
  // Clear screenshot interval if set
  if (screenshotInterval) {
    clearInterval(screenshotInterval);
  }
  
  // Finalize and return results
  return await finalizeAndReturn(question, plan, userId, chatId);
}

/**
 * Sets up screenshot interval for browser-based tools.
 * @param {Array} plan - The execution plan.
 * @param {string} userId - The user ID.
 * @param {number} chatId - The chat ID.
 * @returns {number|null} The interval ID or null if not using browser.
 */
function setupScreenshotInterval(plan, userId, chatId) {
  if (plan.some(step => step.action === "webBrowser") && tools.webBrowser) {
    return setInterval(async () => {
      try {
        const screenshot = await tools.webBrowser.takeScreenshot(userId);
        if (screenshot) {
          io.to(`user:${userId}`).emit('browser_screenshot', { userId, chatId, screenshot });
        }
      } catch (error) {
        console.error("Error taking screenshot:", error.message);
      }
    }, SCREENSHOT_INTERVAL);
  }
  return null;
}

/**
 * Executes all steps in the plan sequentially.
 * @param {Array} plan - The execution plan.
 * @param {string} question - The user's question.
 * @param {string} userId - The user ID.
 * @param {number} chatId - The chat ID.
 */
async function executeSteps(plan, question, userId, chatId) {
  while (contextManager.getCurrentStepIndex(userId, chatId) < plan.length) {
    const currentStepIndex = contextManager.getCurrentStepIndex(userId, chatId);
    const step = plan[currentStepIndex];

    // Reason about the step
    io.to(`user:${userId}`).emit('status_update', { userId, chatId, status: `Reasoning about: ${step.step}` });
    const enhancedStep = await tools.react.processStep(step, userId, chatId);

    // Execute the step
    io.to(`user:${userId}`).emit('status_update', { userId, chatId, status: `Executing: ${enhancedStep.step} using ${enhancedStep.action}` });
    
    // Get filtered step outputs based on data dependencies
    const filteredStepsOutput = contextManager.getFilteredStepsOutput(enhancedStep.usingData, userId, chatId);
    const inputData = enhancedStep.usingData === "none" ? "" : filteredStepsOutput.map(item => `${item.action}: ${item.output}`).join("; ");
    
    // Execute the appropriate tool
    const summary = await executeToolAction(enhancedStep, inputData, currentStepIndex, plan, userId, chatId);
    
    // Emit step completion
    emitStepCompletion(enhancedStep, currentStepIndex, plan, userId, chatId);
    
    // Store step output
    contextManager.addStepOutput({
      step: enhancedStep.step,
      action: enhancedStep.action,
      output: summary 
    }, userId, chatId);
    
    // Reflect on result
    io.to(`user:${userId}`).emit('status_update', { userId, chatId, status: `Reflecting on: ${enhancedStep.step}` });
    const reflection = await tools.react.reflectOnResult(enhancedStep, summary, userId, chatId);
    
    // Check if plan needs to be updated
    if (reflection && reflection.changePlan === true) {
      await updatePlanIfNeeded(question, userId, chatId);
    }
    
    // Move to next step
    contextManager.incrementStepIndex(userId, chatId);
    
    // Periodically save thought chain
    if (currentStepIndex % 3 === 0 || currentStepIndex === plan.length - 1) {
      await tools.react.saveThoughtChain(tools.fileSystem, userId, chatId);
    }
  }
}

/**
 * Executes a specific tool action for a step.
 * @param {Object} enhancedStep - The enhanced step details.
 * @param {string} inputData - Input data for the tool.
 * @param {number} currentStepIndex - Current step index.
 * @param {Array} plan - The execution plan.
 * @param {string} userId - The user ID.
 * @param {number} chatId - The chat ID.
 * @returns {Object} The result of the tool execution.
 */
async function executeToolAction(enhancedStep, inputData, currentStepIndex, plan, userId, chatId) {
  const tool = tools[enhancedStep.action];
  
  if (!tool) {
    console.error(`Tool '${enhancedStep.action}' not found or not enabled`);
    return { 
      error: `Tool '${enhancedStep.action}' not found or not enabled`, 
      success: false 
    };
  }
  
  // Handle chat completion tool
  if (enhancedStep.action === "chatCompletion") {
    const updatedHistory = contextManager.getHistoryWithChatId(userId, chatId);
    const summary = await tool.callAI(enhancedStep.step, inputData, updatedHistory, undefined, true, "auto", userId, chatId);
    contextManager.addToHistory({
      role: "assistant", 
      content: [
        {type: "text", text: JSON.stringify(summary)}
      ]
    }, userId, chatId);
    return summary;
  } 
  
  // Handle research tools
  if (["deepResearch", "webSearch"].includes(enhancedStep.action)) {
    const intensity = enhancedStep.intensity || undefined;
    return await tool.runTask(enhancedStep.step, inputData, (summary) => {
      emitStepCompletion(enhancedStep, currentStepIndex, plan, userId, chatId);
    }, userId, chatId, intensity);
  } 
  
  // Handle writer tool
  if (enhancedStep.action === "writer") {
    const summary = await tool.write(
      `${enhancedStep.step} Expected output: ${enhancedStep.expectedOutput}`, 
      inputData,
      userId,
      chatId
    );
    
    if (summary && summary.error) {
      console.error(`Writer error: ${summary.error}`, summary.details || '');
      return { 
        error: summary.error,
        success: false,
        partial: "Writer tool failed to generate content. See logs for details."
      };
    }
    
    return summary;
  } 
  
  // Handle other tools
  const summary = await tool.runTask(
    `${enhancedStep.step} Expected output: ${enhancedStep.expectedOutput}`, 
    inputData, 
    (summary) => {
      emitStepCompletion(enhancedStep, currentStepIndex, plan, userId, chatId);
      
      // Handle file system updates
      if (enhancedStep.action === "fileSystem" && summary && summary.filePath) {
        io.to(`user:${userId}`).emit('file_updated', { 
          userId, 
          chatId,
          filePath: summary.filePath, 
          content: summary.content || 'File created/updated'
        });
      }
    },
    userId,
    chatId
  );
  
  // Track container files if needed
  if (["execute", "bash"].includes(enhancedStep.action) && 
      summary && Array.isArray(summary.createdContainerFiles) && 
      tools.fileSystem) {
    for (const containerPath of summary.createdContainerFiles) {
      try {
        await tools.fileSystem.trackContainerFile(userId, containerPath, chatId);
      } catch (trackingError) {
        console.warn(`Failed to track container file ${containerPath}: ${trackingError.message}`);
      }
    }
  }
  
  return summary;
}

/**
 * Emits step completion status to the client.
 * @param {Object} step - The step that completed.
 * @param {number} currentStepIndex - Current step index.
 * @param {Array} plan - The execution plan.
 * @param {string} userId - The user ID.
 * @param {number} chatId - The chat ID.
 */
function emitStepCompletion(step, currentStepIndex, plan, userId, chatId) {
  io.to(`user:${userId}`).emit('step_completed', { 
    userId, 
    chatId,
    step: step.step, 
    action: step.action,
    metrics: {
      stepIndex: currentStepIndex,
      stepCount: currentStepIndex + 1,
      totalSteps: plan.length,
      successCount: contextManager.getStepsOutput(userId, chatId).filter(step => 
        step && step.output && !step.output.error && step.output.success !== false
      ).length
    }
  });
}

/**
 * Updates the plan if needed based on reflection.
 * @param {string} question - The user's question.
 * @param {string} userId - The user ID.
 * @param {number} chatId - The chat ID.
 */
async function updatePlanIfNeeded(question, userId, chatId) {
  try {
    const currentPlan = contextManager.getPlan(userId, chatId);
    const currentStepIndex = contextManager.getCurrentStepIndex(userId, chatId);
    const stepsOutput = contextManager.getStepsOutput(userId, chatId);
    
    const updatedPlan = await checkProgress(question, currentPlan, stepsOutput, currentStepIndex, userId, chatId);
    if (updatedPlan !== currentPlan) {
      contextManager.updatePlan(updatedPlan, userId, chatId);
      io.to(`user:${userId}`).emit('steps', { userId, chatId, plan: updatedPlan });
    }
  } catch (error) {
    console.error("Error updating plan based on reflection:", error.message);
  }
}

/**
 * Finalizes task execution and returns results to the user.
 * @param {string} question - The user's question.
 * @param {Array} plan - The execution plan.
 * @param {string} userId - The user ID.
 * @param {number} chatId - The chat ID.
 * @returns {string} The final response.
 */
async function finalizeAndReturn(question, plan, userId, chatId) {
  let finalOutput;
  
  try {
    const stepsOutput = contextManager.getStepsOutput(userId, chatId);
    finalOutput = await finalizeTask(question, stepsOutput, userId, chatId);
    
    // Clean up conversation history
    const context = contextManager.getContext(userId, chatId);
    const processedHistory = context.history.filter(msg => 
      !(msg.role === "assistant" && msg.content && 
        msg.content.length > 0 && 
        msg.content[0].text === "Processing your task...")
    );
    
    context.history = processedHistory;
    
    // Add final response to history
    contextManager.addToHistory({
      role: "assistant", 
      content: [
        {type: "text", text: finalOutput}
      ]
    }, userId, chatId);
    
    // Get task metrics
    const duration = contextManager.getTaskDuration(userId, chatId);
    const fileData = await tools.fileSystem.getWrittenFiles(userId, chatId);
    
    // Process host files
    const hostFiles = fileData.hostFiles.map(file => ({
      id: file.id,
      fileName: file.fileName, 
      path: file.path,        
      content: file.content   
    })) || [];
    
    // Process container files
    const containerFiles = fileData.containerFiles.map(file => ({
      id: file.id,
      fileName: file.fileName, 
      path: file.path,        
      content: file.content   
    })) || [];
    
    // Emit task completion
    io.to(`user:${userId}`).emit('task_completed', { 
      userId, 
      chatId,
      result: cleanJsonResponses(finalOutput),
      duration: duration,
      completedAt: new Date().toISOString(),
      outputFiles: {
        host: hostFiles,
        container: containerFiles
      },
      metrics: {
        stepCount: contextManager.getStepsOutput(userId, chatId).length,
        successCount: contextManager.getStepsOutput(userId, chatId).filter(step => 
          step && step.output && !step.output.error && step.output.success !== false
        ).length,
        totalSteps: plan.length,
        durationSeconds: Math.round(duration / 1000),
        averageStepTime: Math.round(duration / contextManager.getStepsOutput(userId, chatId).length / 1000)
      }
    });
    
  } catch (error) {
    console.error("Error finalizing task:", error.message);
    finalOutput = "Task completed but could not be finalized: " + error.message;
    io.to(`user:${userId}`).emit('task_error', { userId, chatId, error: error.message });
  }
  
  await cleanupUserResources(userId);
  return finalOutput;
}

/**
 * Executes a promise with a timeout.
 * @param {Promise} promise - The promise to execute.
 * @param {number} timeoutMs - Timeout in milliseconds (default: 60000).
 * @returns {Promise} The result of the promise or a timeout error.
 */
async function withTimeout(promise, timeoutMs = 60000) {
  let timeoutId;
  
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(`Operation timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });
  
  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Analyzes task progress and potentially updates the execution plan.
 * @param {string} question - The original user question.
 * @param {Array} plan - The current execution plan.
 * @param {Array} stepsOutput - The output from steps executed so far.
 * @param {number} currentStepIndex - The current step index.
 * @param {string} userId - The user ID.
 * @param {number} chatId - The chat ID.
 * @returns {Array} The original or updated plan.
 */
async function checkProgress(question, plan, stepsOutput, currentStepIndex, userId = 'default', chatId = 1) {
  try {
    // Skip if too early in execution or plan is too short
    if (currentStepIndex < 2 || plan.length <= 2) {
      return plan;
    }
    
    // Only check every 3 steps to avoid excessive replanning
    if (currentStepIndex % 3 !== 0) {
      return plan;
    }
    
    const prompt = prompts.generateProgressAnalysisPrompt(question, plan, stepsOutput, currentStepIndex);
    
    const history = contextManager.getHistoryWithChatId(userId, chatId);
    
    const response = await withTimeout(
      tools.chatCompletion.callAI(prompt, "Analyze task progress and suggest plan changes", history, undefined, true, "auto", userId, chatId),
      30000 
    );
    
    if (!response || response.error || response === "NO_CHANGES_NEEDED") {
      return plan;
    }
  
    const updatedPlan = Array.isArray(response) ? response : Object.values(response);
    
    if (!Array.isArray(updatedPlan) || updatedPlan.length === 0) {
      console.error("Invalid updated plan format");
      return plan;
    }
    
    return updatedPlan;
  } catch (error) {
    console.error("Error checking progress:", error.message);
    return plan; 
  }
}

/**
 * Generates a final response after task completion.
 * @param {string} question - The original user question.
 * @param {Array} stepsOutput - The output from all executed steps.
 * @param {string} userId - The user ID.
 * @param {number} chatId - The chat ID.
 * @returns {string} The final response to the user.
 */
async function finalizeTask(question, stepsOutput, userId = 'default', chatId = 1) {
  try {
    const prompt = prompts.generateFinalizationPrompt(question, stepsOutput);
    
    const history = contextManager.getHistoryWithChatId(userId, chatId);
    
    const response = await withTimeout(
      tools.chatCompletion.callAI(prompt, "Generate final response", history, undefined, false, "auto", userId, chatId),
      60000 
    );
    
    if (!response) {
      console.error("Failed to generate final response");
      return "Task completed but final summary could not be generated.";
    }
    
    let finalResponse = response;
    
    try {
      const parsedResponse = JSON.parse(response);
      
      if (parsedResponse.answer) {
        finalResponse = parsedResponse.answer;
      } else if (parsedResponse.explanation) {
        finalResponse = parsedResponse.explanation;
      } else if (parsedResponse.result) {
        finalResponse = parsedResponse.result;
      } else if (parsedResponse.response) {
        finalResponse = parsedResponse.response;
      } else if (parsedResponse.text) {
        finalResponse = parsedResponse.text;
      } else if (parsedResponse.output) {
        finalResponse = parsedResponse.output;
      }
      
    } catch (e) {
      finalResponse = response;
    }
    
    return finalResponse;
  } catch (error) {
    console.error("Error finalizing task:", error.message);
    return "Task completed but encountered an error during finalization: " + error.message;
  }
}

/**
 * Clean up resources for a specific user after task completion.
 * @param {string} userId - User identifier.
 */
async function cleanupUserResources(userId) {
  if (tools.webBrowser) {
    try {
      await tools.webBrowser.cleanupResources(userId);
    } catch (browserError) {
      console.error("Error closing browser instance:", browserError.message);
    }
  }
}

/**
 * Cleans JSON responses by extracting useful information.
 * @param {string} text - The response text potentially containing JSON.
 * @returns {string} Cleaned response text.
 */
function cleanJsonResponses(text) {
  if (!text || typeof text !== 'string') return text;
  
  if (text.trim().startsWith('{') || text.trim().startsWith('[')) {
    try {
      const parsed = JSON.parse(text);
      
      if (parsed.directAnswer === true && parsed.answer) {
        return parsed.answer;
      } else if (parsed.explanation) {
        return parsed.explanation;
      } else if (parsed.answer) {
        return parsed.answer;
      } else if (parsed.result) {
        return parsed.result;
      } else if (parsed.response) {
        return parsed.response;
      } else if (parsed.output) {
        return parsed.output;
      } else if (parsed.text) {
        return parsed.text;
      }
      
      return text;
    } catch (e) {
      return text;
    }
  }
  
  return text;
}

/**
 * Module exports for external use.
 */
module.exports = {
  centralOrchestrator,
  cleanupUserResources,
  sanitizeFilePath
};

/**
 * Main entry point when run directly.
 * Sets up socket event handlers for real-time communication.
 */
if (require.main === module) {
  io.on('connection', (socket) => {
    /**
     * Handle submission of a new task.
     */
    socket.on('submit_task', async (data) => {
      const { task, userId = `socket_${Date.now()}`, chatId = 1, isFollowUp = false } = data;
      centralOrchestrator(task, userId, chatId, isFollowUp);
    });
    
    /**
     * Handle request to load conversation history.
     */
    socket.on('load_history', async (data) => {
      const { userId = `socket_${Date.now()}`, chatId = 1 } = data;
      
      try {
        const history = contextManager.getHistoryWithChatId(userId, chatId);
        const context = contextManager.getContext(userId, chatId);
        
        if (history && history.length) {
          let finalAnswer = "";
          let foundFinalAnswer = false;
          
          // Search for the final answer in history
          for (let i = history.length - 1; i >= 0; i--) {
            const message = history[i];
            if (message.role === "assistant" && message.content && message.content.length > 0) {
              const content = message.content[0].text;
              
              if (!content.includes("Processing your task")) {
                finalAnswer = cleanJsonResponses(content);
                foundFinalAnswer = true;
                break;
              }
            }
          }
          
          if (!foundFinalAnswer) {
            const userQuestion = context.question || "Previous conversation";
            finalAnswer = `I processed your request about "${userQuestion}" but couldn't find the final answer in the history.`;
          }
          
          // Get files associated with the conversation
          const filesData = { host: [], container: [] };
          try {
            if (tools.fileSystem) {
              const files = await tools.fileSystem.getWrittenFiles(userId, chatId);
              if (files) {
                filesData.host = files.hostFiles || [];
                filesData.container = files.containerFiles || [];
              }
            }
          } catch (fileError) {
            console.error('Error getting files from history:', fileError);
          }
          
          // Emit task completion with history data
          socket.emit('task_completed', {
            userId,
            chatId,
            result: finalAnswer,
            loadedFromHistory: true,
            completedAt: new Date().toISOString(),
            outputFiles: filesData
          });
        } else {
          socket.emit('history_error', { error: 'No history found for this conversation' });
        }
      } catch (error) {
        console.error(`Error loading history: ${error.message}`);
        socket.emit('history_error', { error: error.message });
      }
    });
  });
}