const fs = require('fs');
const path = require('path');
const ascii = require('./utils/ascii');
const contextManager = require('./utils/context');
// Import socket.io
const io = require('./socket');

// Screenshot interval in milliseconds
const SCREENSHOT_INTERVAL = 5000;

// Dynamically load tools based on their tool.json files
const toolsDirectory = path.join(__dirname, 'tools');
const tools = {};
const toolDescriptions = [];

// Function to load tools dynamically
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
          
          // Add to tool descriptions for the prompt
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
}

ascii.printWelcome();

// Load all tools at startup
loadTools();

// Generate global prompt dynamically based on loaded tools
function generateGlobalPrompt() {
  // Sort tools by title for consistent ordering
  const sortedTools = toolDescriptions.sort((a, b) => a.title.localeCompare(b.title));
  
  const toolsList = sortedTools.map(tool => `> - ${tool.title}: ${tool.description}`).join('\n');
  
  return `


> **You are an autonomous AI agent with full access to the following tools, each of which can be invoked as needed to accomplish tasks independently and completely:**
>
${toolsList}

### ⚙️ Core Directives:

- **Do not ask the user for confirmation** at any point.
- **Do not pause execution** unless a required tool is unavailable.
- Use the chatCompletion tool to **self-evaluate**, plan tasks, and analyze intermediate results as needed.
- Always **complete tasks end-to-end**, writing full outputs to files using fileSystem.
- Save important intermediate thoughts, todos, or plans using fileSystem for reference or final review.
- Structure your execution as **a series of clear, defined steps** in JSON format (see below).
- Prioritize **fully autonomous execution**: no prompts, delays, or dependencies on user validation.
- **CRUCIAL: Focus on correctness, accuracy, and completeness over verbose explanations.**
- **When generating code, always implement error handling and validation checks.**
- **Consider edge cases and provide fallback behaviors for all functions.**
- **Always test your outputs with specific examples before submitting final solutions.**
- **For simple questions that don't require complex processing, use directAnswer to respond immediately.**
- **IMPORTANT: When providing file paths, ONLY include the actual path without any additional commentary, status messages, or instructions. Example: "/output/report.pdf" instead of "/output/report.pdf successfully created!"**

---

### 🧠 Example Tasks:

#### Website creation
- Program and fully generate a multi-file web application.
- Implement everything based on the described task.
- Use fileSystem to write **all necessary files** in the output folder.
- **Include validation and error handling for all user inputs and operations.**

#### Research
- Conduct comprehensive research on a given topic.
- Use deepResearch, webSearch, and chatCompletion for information gathering and synthesis.
- Use writer to produce a structured research paper.
- Save the final paper and any useful intermediate notes to the output folder.
- **Ensure your research is accurate, comprehensive, and properly validated.**

#### Writing
- Write a book, report, or essay on a topic.
- Structure it properly and output all documents using fileSystem.
- **Focus on quality and correctness of content rather than extensive explanations.**

#### Simple Q&A
- For straightforward questions, conversational queries, or chit-chat, use directAnswer.
- This provides an immediate response without complex planning or execution steps.

---

### 📦 Output Format (JSON):

For complex tasks, return a JSON object structured like this:
{
  "step1": {
    "step": "Brief explanation of what the step does",
    "action": "Tool to use (e.g., chatCompletion, fileSystem, etc.)",
    "expectedOutput": "What will be produced",
    "usingData": "List of tools or data sources used (default: all)",
    "validations": "How you will validate the output for correctness",
    "intensity": "Optional: For deepResearch, specify a number 1-10 to control search depth" 
  },
  "step2": {
    ...
  },
  ...
}

For simple questions or chit-chat, return:
{
  "directAnswer": true,
  "answer": "Your complete answer to the question"
}

---

### 🧾 Example Input + Output:

**User Input (Complex Task):**
> Research about the history of the internet and create a research paper.

**Expected JSON Output:**
{
  "step1": {
    "step": "Create a todo.md file planning the research approach",
    "action": "fileSystem",
    "expectedOutput": "todo.md",
    "usingData": "none",
    "validations": "Ensure plan covers all major aspects of internet history"
  },
  "step2": {
    "step": "Ask chatCompletion to explain 'What is the internet?' as a base",
    "action": "chatCompletion",
    "expectedOutput": "Brief history and function of the internet",
    "usingData": "none",
    "validations": "Check for accuracy and coverage of key concepts"
  },
  "step3": {
    "step": "Use deepResearch to collect sources on the history of the internet",
    "action": "deepResearch",
    "expectedOutput": "Detailed research content",
    "usingData": "none",
    "validations": "Verify timeframe coverage and identify primary sources",
    "intensity": 5
  },
  "step4": {
    "step": "Write a structured research paper using writer based on the gathered material",
    "action": "writer",
    "expectedOutput": "research_paper.txt",
    "usingData": "deepResearch,chatCompletion",
    "validations": "Review for factual accuracy, source citation, and completeness"
  },
  "step5": {
    "step": "Save the research paper to the output folder",
    "action": "fileSystem",
    "expectedOutput": "output/research_paper.txt",
    "usingData": "writer",
    "validations": "Verify file is written correctly with full content"
  }
}

**User Input (Simple Question):**
> What's the weather like today?

**Expected JSON Output:**
{
  "directAnswer": true,
  "answer": "I don't have access to current weather information without using a search tool. Would you like me to search for weather information for your location? If so, please provide your city or region."
}

`;
}

async function centralOrchestrator(question, userId = 'default', chatId = 1, isFollowUp = false){
  try {
    // Initialize context for this user and chat
    if (!isFollowUp) {
      contextManager.resetContext(userId, chatId);
    }
    
    // Emit task received event
    io.emit('task_received', { userId, chatId, task: question, isFollowUp });
    
    io.emit('status_update', { userId, chatId, status: 'Improving prompt' });

    // Store question in context
    contextManager.setQuestion(question, userId, chatId);

    let prompt = `
    You are an AI agent that can execute complex tasks. You will be given a question and you will need to plan a task to answer the question.
    ${generateGlobalPrompt()}
    `;
    io.emit('status_update', { userId, chatId, status: 'Planning task execution' });

    // Get existing history for this chat
    const history = contextManager.getHistoryWithChatId(userId, chatId);
    
    // Use the history instead of empty array
    let planObject = await tools.chatCompletion.callAI(prompt, question, history, undefined, true, "auto", userId, chatId);
    
    // Check if this is a direct answer request
    if (planObject.directAnswer === true && planObject.answer) {
      console.log("[X] Direct answer provided");
      io.emit('status_update', { userId, chatId, status: 'Direct answer provided' });
      
      // Store the response in context
      contextManager.addToHistory({
        role: "user", 
        content: [
            {type: "text", text: question}
        ]
      }, userId, chatId);
      
      // Store final answer in a clear, non-JSON format
      contextManager.addToHistory({
        role: "assistant", 
        content: [
            {type: "text", text: planObject.answer}
        ]
      }, userId, chatId);
      
      // Emit task completion event with the same format as regular tasks
      io.emit('task_completed', { 
        userId, 
        chatId,
        result: planObject.answer,
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
      
      // Clean up resources
      await cleanupUserResources(userId);
      
      return planObject.answer;
    }
    
    // Convert the plan object into an array for regular task execution
    const plan = Object.values(planObject).filter(item => item && typeof item === 'object');
    
    // Store plan in context
    contextManager.setPlan(plan, userId, chatId);
    
    // Add to history
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
    
    io.emit('steps', { userId, chatId, plan });
   
    // Start screenshot interval if browser is used in the plan
    let screenshotInterval = null;
    if (plan.some(step => step.action === "webBrowser") && tools.webBrowser) {
      screenshotInterval = setInterval(async () => {
        try {
          const screenshot = await tools.webBrowser.takeScreenshot(userId);
          if (screenshot) {
            io.emit('browser_screenshot', { userId, chatId, screenshot });
          }
        } catch (error) {
          console.error("Error taking screenshot:", error.message);
        }
      }, SCREENSHOT_INTERVAL);
    }
    
    // Continue executing steps until we've completed all steps in the plan
    while (contextManager.getCurrentStepIndex(userId, chatId) < plan.length) {
      const currentStepIndex = contextManager.getCurrentStepIndex(userId, chatId);
      const step = plan[currentStepIndex];

      io.emit('status_update', { userId, chatId, status: `Reasoning about: ${step.step}` });
      const enhancedStep = await tools.react.processStep(step, userId, chatId);

      io.emit('status_update', { userId, chatId, status: `Executing: ${enhancedStep.step} using ${enhancedStep.action}` });
      
      // Get filtered steps output from context
      const filteredStepsOutput = contextManager.getFilteredStepsOutput(enhancedStep.usingData, userId, chatId);
      
      const inputData = enhancedStep.usingData === "none" ? "" : filteredStepsOutput.map(item => `${item.action}: ${item.output}`).join("; ");
      
      let summary;
      
      // Get the appropriate tool for this action
      const tool = tools[enhancedStep.action];
      
      if (!tool) {
        console.error(`Tool '${enhancedStep.action}' not found or not enabled`);
        summary = { 
          error: `Tool '${enhancedStep.action}' not found or not enabled`, 
          success: false 
        };
      } else {
        // Different tools have different methods for execution
        if (enhancedStep.action === "chatCompletion") {
          summary = await tool.callAI(enhancedStep.step, inputData, [], undefined, true, "auto", userId, chatId);
          contextManager.addToHistory({
            role: "assistant", 
            content: [
              {type: "text", text: JSON.stringify(summary)}
            ]
          }, userId, chatId);
        } else if (["deepResearch", "webSearch"].includes(enhancedStep.action)) {
          // Handle tools that use intensity parameter
          const intensity = enhancedStep.intensity || undefined;
          summary = await tool.runTask(enhancedStep.step, inputData, (summary) => {
            io.emit('step_completed', { 
              userId, 
              chatId,
              step: enhancedStep.step, 
              action: enhancedStep.action,
              metrics: {
                stepIndex: currentStepIndex,
                stepCount: currentStepIndex + 1,
                totalSteps: plan.length,
                successCount: contextManager.getStepsOutput(userId, chatId).filter(step => 
                  step && step.output && !step.output.error && step.output.success !== false
                ).length
              }
            });
          }, userId, chatId, intensity);
        } else if (enhancedStep.action === "writer") {
          summary = await tool.write(
            `${enhancedStep.step} Expected output: ${enhancedStep.expectedOutput}`, 
            inputData,
            userId,
            chatId
          );
          
          // Validate writer output and handle errors
          if (summary && summary.error) {
            console.error(`Writer error: ${summary.error}`, summary.details || '');
            summary = { 
              error: summary.error,
              success: false,
              partial: "Writer tool failed to generate content. See logs for details."
            };
          }
        } else {
          // General case for most tools
          summary = await tool.runTask(
            `${enhancedStep.step} Expected output: ${enhancedStep.expectedOutput}`, 
            inputData, 
            (summary) => {
              io.emit('step_completed', { 
                userId, 
                chatId,
                step: enhancedStep.step, 
                action: enhancedStep.action,
                metrics: {
                  stepIndex: currentStepIndex,
                  stepCount: currentStepIndex + 1,
                  totalSteps: plan.length,
                  successCount: contextManager.getStepsOutput(userId, chatId).filter(step => 
                    step && step.output && !step.output.error && step.output.success !== false
                  ).length
                }
              });
              
              // If this is the fileSystem tool and a file was created/updated, emit file event
              if (enhancedStep.action === "fileSystem" && summary && summary.filePath) {
                io.emit('file_updated', { 
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
          
          // Handle container files for execute and bash tools
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
        }
      }
      
      io.emit('step_completed', { 
        userId, 
        chatId,
        step: enhancedStep.step, 
        action: enhancedStep.action,
        metrics: {
          stepIndex: currentStepIndex,
          stepCount: currentStepIndex + 1,
          totalSteps: plan.length,
          successCount: contextManager.getStepsOutput(userId, chatId).filter(step => 
            step && step.output && !step.output.error && step.output.success !== false
          ).length
        }
      });
      
      // Store the output of the step
      contextManager.addStepOutput({
        step: enhancedStep.step,
        action: enhancedStep.action,
        output: summary // Store the actual result
      }, userId, chatId);
      
      // ReAct: Reflect on the result after execution
      io.emit('status_update', { userId, chatId, status: `Reflecting on: ${enhancedStep.step}` });
      const reflection = await tools.react.reflectOnResult(enhancedStep, summary, userId, chatId);
      
      // Check progress and potentially update plan
      const currentPlan = contextManager.getPlan(userId, chatId);
      
      // Check if reflection suggests a plan change
      if (reflection && reflection.changePlan === true) {
        try {
          const updatedPlan = await checkProgress(question, currentPlan, contextManager.getStepsOutput(userId, chatId), contextManager.getCurrentStepIndex(userId, chatId), userId, chatId);
          if (updatedPlan !== currentPlan) {
            contextManager.updatePlan(updatedPlan, userId, chatId);
            io.emit('steps', { userId, chatId, plan: updatedPlan });
          }
        } catch (error) {
          console.error("Error updating plan based on reflection:", error.message);
          // Continue with original plan on error
        }
      }
      
      // Increment step index in context
      contextManager.incrementStepIndex(userId, chatId);
      
      // Save the thought chain periodically
      if (currentStepIndex % 3 === 0 || currentStepIndex === plan.length - 1) {
        await tools.react.saveThoughtChain(tools.fileSystem, userId, chatId);
      }
    }
    
    // Clear screenshot interval if it was set
    if (screenshotInterval) {
      clearInterval(screenshotInterval);
    }
    
    // After the loop completes, finalize the task
    let finalOutput;
    try {
      finalOutput = await finalizeTask(question, contextManager.getStepsOutput(userId, chatId), userId, chatId);

    
      // Replace the previous "Processing your task..." message with the final answer
      // First, find and remove the processing message
      const context = contextManager.getContext(userId, chatId);
      const processedHistory = context.history.filter(msg => 
        !(msg.role === "assistant" && msg.content && 
          msg.content.length > 0 && 
          msg.content[0].text === "Processing your task...")
      );
      
      // Replace history with the cleaned version
      context.history = processedHistory;
      
      // Add the final answer to history in plain text format
      contextManager.addToHistory({
        role: "assistant", 
        content: [
            {type: "text", text: finalOutput}
        ]
      }, userId, chatId);
      
      // Get task duration using the context manager
      const duration = contextManager.getTaskDuration(userId, chatId);
      
      // Get output files from the file system tool's tracked list
      const fileData = await tools.fileSystem.getWrittenFiles(userId, chatId);
      
      // Map host files correctly using properties from getWrittenFiles
      const hostFiles = fileData.hostFiles.map(file => ({
        id: file.id,
        fileName: file.fileName, // Use the fileName property from getWrittenFiles
        path: file.path,        // Use the path property from getWrittenFiles
        content: file.content   // Include the content
      })) || [];
      
      // Map container files correctly using properties from getWrittenFiles
      const containerFiles = fileData.containerFiles.map(file => {
        return {
          id: file.id,
          fileName: file.fileName, // Use the fileName property from getWrittenFiles
          path: file.path,        // Use the path property from getWrittenFiles
          content: file.content   // Include the content
        };
      }) || [];
      
      // Emit task completion event with enhanced data
      io.emit('task_completed', { 
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
      io.emit('task_error', { userId, chatId, error: error.message });
    }
    
    // Cleanup resources for this user
    await cleanupUserResources(userId);
    
    return finalOutput;
  } catch (error) {
    console.error("Critical error in orchestration:", error.message);
    
    // Emit error event
    io.emit('task_error', { userId, chatId, error: error.message });
    
    // Ensure cleanup even on error
    try {
      await cleanupUserResources(userId);
    } catch (cleanupError) {
      console.error("Error during cleanup:", cleanupError.message);
    }
    
    return `Critical error occurred during execution: ${error.message}`;
  }
}

// Add timeout handling for API calls at the end of the file before module.exports
async function withTimeout(promise, timeoutMs = 60000) {
  let timeoutId;
  
  // Create a promise that rejects after timeoutMs
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(`Operation timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });
  
  try {
    // Race the original promise against the timeout
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    // Clear the timeout to prevent memory leaks
    clearTimeout(timeoutId);
  }
}

async function checkProgress(question, plan, stepsOutput, currentStepIndex, userId = 'default', chatId = 1) {
  try {
    // Skip progress checks if we're too early in the process
    if (currentStepIndex < 2 || plan.length <= 2) {
      return plan;
    }
    
    // Only check progress periodically to avoid excessive AI calls
    if (currentStepIndex % 3 !== 0) {
      return plan;
    }
    
    // Format the steps output for better analysis
    const formattedStepsOutput = stepsOutput.map(output => {
      return {
        step: output.step,
        action: output.action,
        result: typeof output.output === 'object' ? 
          JSON.stringify(output.output).substring(0, 500) : 
          String(output.output || '').substring(0, 500)
      };
    });
    
    const prompt = `
    You are analyzing the progress of an AI agent executing a complex task.
    The original question was: ${question}
    
    The agent has completed ${currentStepIndex} steps out of ${plan.length} total steps.
    
    Based on the completed steps and their outputs, determine if the current plan needs to be modified.
    If changes are needed, return a completely new plan. Otherwise, return the string "NO_CHANGES_NEEDED".
    
    Completed steps and outputs: ${JSON.stringify(formattedStepsOutput, null, 2)}
    
    Remaining steps in the plan: ${JSON.stringify(plan.slice(currentStepIndex), null, 2)}
    `;
    
    const response = await withTimeout(
      tools.chatCompletion.callAI(prompt, "Analyze task progress and suggest plan changes", [], undefined, true, "auto", userId, chatId),
      30000 // 30-second timeout
    );
    
    if (!response || response.error || response === "NO_CHANGES_NEEDED") {
      return plan;
    }
  
    // Validate the updated plan structure
    const updatedPlan = Array.isArray(response) ? response : Object.values(response);
    
    if (!Array.isArray(updatedPlan) || updatedPlan.length === 0) {
      console.error("Invalid updated plan format");
      return plan;
    }
    
    return updatedPlan;
  } catch (error) {
    console.error("Error checking progress:", error.message);
    return plan; // On error, continue with original plan
  }
}

async function finalizeTask(question, stepsOutput, userId = 'default', chatId = 1) {
  try {
    // Format step outputs to prevent serialization issues
    const formattedStepsOutput = stepsOutput.map(output => {
      return {
        step: output.step,
        action: output.action,
        result: typeof output.output === 'object' ? 
          JSON.stringify(output.output).substring(0, 1000) : 
          String(output.output || '').substring(0, 1000)
      };
    });
    
    const prompt = `
    You are finalizing a complex task executed by an AI agent.
    The original question was: ${question}
    
    Based on the completed steps and their outputs, generate a final comprehensive response.
    
    IMPORTANT: Your response should be in plain text format. Do not use JSON or any other structured format.
    Provide a direct, conversational answer as if you're speaking directly to the user.
    
    Completed steps and outputs: ${JSON.stringify(formattedStepsOutput, null, 2)}
    `;
    
    const response = await withTimeout(
      tools.chatCompletion.callAI(prompt, "Generate final response", [], undefined, false, "auto", userId, chatId),
      60000 // 60-second timeout
    );
    
    if (!response) {
      console.error("Failed to generate final response");
      return "Task completed but final summary could not be generated.";
    }
    
    // Process the response to ensure it's not in JSON format
    let finalResponse = response;
    
    // Check if it's a JSON string and extract readable content if it is
    try {
      const parsedResponse = JSON.parse(response);
      
      // If it contains obvious text fields, use those instead
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
      // If none of these fields exist, keep the original response
    } catch (e) {
      // Not JSON, which is actually what we want
      finalResponse = response;
    }
    
    return finalResponse;
  } catch (error) {
    console.error("Error finalizing task:", error.message);
    return "Task completed but encountered an error during finalization: " + error.message;
  }
}

/**
 * Clean up resources for a specific user after task completion
 * @param {string} userId - User identifier
 */
async function cleanupUserResources(userId) {
  // Close any browser instances if the browser tool exists
  if (tools.webBrowser) {
    try {
      await tools.webBrowser.cleanupResources(userId);
    } catch (browserError) {
      console.error("Error closing browser instance:", browserError.message);
    }
  }
}

// Add utility function to clean JSON responses
function cleanJsonResponses(text) {
  if (!text || typeof text !== 'string') return text;
  
  // Check if it looks like JSON
  if (text.trim().startsWith('{') || text.trim().startsWith('[')) {
    try {
      const parsed = JSON.parse(text);
      
      // Extract specific fields in priority order
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
      
      // If no recognizable fields, return the original text
      return text;
    } catch (e) {
      // Not valid JSON
      return text;
    }
  }
  
  // Not JSON-like, return as is
  return text;
}

// Export the centralOrchestrator function for use in test-server.js
module.exports = {
  centralOrchestrator
};

// Run the orchestrator if this file is executed directly
if (require.main === module) {
  // Set up socket event listener for receiving tasks
  io.on('connection', (socket) => {
    socket.on('submit_task', async (data) => {
      const { task, userId = `socket_${Date.now()}`, chatId = 1, isFollowUp = false } = data;
      
      // Execute the task
      centralOrchestrator(task, userId, chatId, isFollowUp);
    });
    
    socket.on('load_history', async (data) => {
      const { userId = `socket_${Date.now()}`, chatId = 1 } = data;
      
      try {
        // Get history from context manager using the specific chat ID
        const history = contextManager.getHistoryWithChatId(userId, chatId);
        const context = contextManager.getContext(userId, chatId);
        
        if (history && history.length) {
          // Find the last assistant message with the final answer
          let finalAnswer = "";
          let foundFinalAnswer = false;
          
          // Search from the end to find the most recent final answer
          for (let i = history.length - 1; i >= 0; i--) {
            const message = history[i];
            if (message.role === "assistant" && message.content && message.content.length > 0) {
              const content = message.content[0].text;
              
              // Filter out processing messages and JSON responses
              if (!content.includes("Processing your task")) {
                // Clean any JSON in the content
                finalAnswer = cleanJsonResponses(content);
                foundFinalAnswer = true;
                break;
              }
            }
          }
          
          if (!foundFinalAnswer) {
            // Fallback to the original user query as context
            const userQuestion = context.question || "Previous conversation";
            finalAnswer = `I processed your request about "${userQuestion}" but couldn't find the final answer in the history.`;
          }
          
          // Get any written files from the history
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
          
          // Emit the same format as task_completed for consistency
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