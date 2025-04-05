const ai = require('./tools/AI/ai');
const browser = require('./tools/browser/main');
const fileSystem = require('./tools/filesystem/main');
const deepSearch = require('./tools/deepSearch/main');
const webSearch = require('./tools/webSearch/main');
const pythonExecute = require('./tools/pythonExecute/main');
const bash = require('./tools/bash/index');
const imageGeneration = require('./tools/imageGeneration/main');
const math = require('./tools/math/main');
const ascii = require('./utils/ascii');
const fs = require('fs');
const { improvePrompt } = require('./tools/prompting/promptImprover');
const writer = require('./tools/writer/main');
const react = require('./tools/react/main');
const contextManager = require('./utils/context');
const path = require('path');
// Import socket.io
const io = require('./socket');

// Screenshot interval in milliseconds
const SCREENSHOT_INTERVAL = 5000;

let globalPrompt = `


> **You are an autonomous AI agent with full access to the following tools, each of which can be invoked as needed to accomplish tasks independently and completely:**
>
> - webBrowser: for complex web browsing tasks that require interaction
> - fileSystem: for saving, loading, and writing files
> - writeFileDirectly: for writing files directly without AI rework (in case you already have the content)
> - chatCompletion: for answering questions, generating ideas, or performing logical reasoning
> - webSearch: for quick information gathering (DuckDuckGo-based)
> - deepResearch: for deep topic research (DuckDuckGo-based)
> - execute: for writing and running Python code
> - bash: for executing shell commands
> - writer: for generating detailed written content
> - math: for performing complex mathematical operations

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

---

### 📦 Output Format (JSON):

Return a JSON object structured like this:
{
  "step1": {
    "step": "Brief explanation of what the step does",
    "action": "Tool to use (e.g., chatCompletion, fileSystem, etc.)",
    "expectedOutput": "What will be produced",
    "usingData": "List of tools or data sources used (default: all)",
    "validations": "How you will validate the output for correctness" 
  },
  "step2": {
    ...
  },
  ...
}

---

### 🧾 Example Input + Output:

**User Input:**
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
    "validations": "Verify timeframe coverage and identify primary sources"
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

`

async function centralOrchestrator(question, userId = 'default'){
  try {
    // Initialize context for this user
    contextManager.resetContext(userId);
    
    // Emit task received event
    io.emit('task_received', { userId, task: question });
    
    await ascii.printWelcome();
    console.log("[ ] Cleaning workspace");
    
    // Create a user-specific output directory
    const outputDir = path.join(__dirname, 'output');
    const userOutputDir = path.join(outputDir, userId.replace(/[^a-zA-Z0-9_-]/g, '_'));
    
    // Ensure main output dir exists
    if(!fs.existsSync(outputDir)){
      fs.mkdirSync(outputDir, { recursive: true });
    }
    
    // Clean up user directory if it exists
    if(fs.existsSync(userOutputDir)){
      fs.rmdirSync(userOutputDir, {recursive: true});
    }
    
    // Create fresh user directory
    fs.mkdirSync(userOutputDir, { recursive: true });
    
    console.log("[X] Cleaning workspace");
    io.emit('status_update', { userId, status: 'Improving prompt' });
    console.log("[ ] Improving prompt")
    question = await improvePrompt(question);
    console.log("[X] Improving prompt");

    // Store question in context
    contextManager.setQuestion(question, userId);

    let prompt = `
    You are an AI agent that can execute complex tasks. You will be given a question and you will need to plan a task to answer the question.
    ${globalPrompt}
    `
    console.log("[ ] Planning...");
    io.emit('status_update', { userId, status: 'Planning task execution' });

    let planObject = await ai.callAI(prompt, question, [], undefined, true, "auto", userId);
    // Convert the plan object into an array
    const plan = Object.values(planObject).filter(item => item && typeof item === 'object');
    
    // Store plan in context
    contextManager.setPlan(plan, userId);
    
    // Add to history
    contextManager.addToHistory({
      role: "user", 
      content: [
          {type: "text", text: question}
      ]
    }, userId);
    
    contextManager.addToHistory({
      role: "assistant", 
      content: [
          {type: "text", text: JSON.stringify(planObject)}
      ]
    }, userId);
    
    console.log("[X] Planning...");
    io.emit('steps', { userId, plan });
   
    // Start screenshot interval if browser is used in the plan
    let screenshotInterval = null;
    if (plan.some(step => step.action === "webBrowser")) {
      screenshotInterval = setInterval(async () => {
        try {
          const screenshot = await browser.takeScreenshot(userId);
          if (screenshot) {
            io.emit('browser_screenshot', { userId, screenshot });
          }
        } catch (error) {
          console.error("Error taking screenshot:", error.message);
        }
      }, SCREENSHOT_INTERVAL);
    }
    
    // Continue executing steps until we've completed all steps in the plan
    while (contextManager.getCurrentStepIndex(userId) < plan.length) {
      const currentStepIndex = contextManager.getCurrentStepIndex(userId);
      const step = plan[currentStepIndex];
      
      // ReAct: Process step with reasoning before execution
      console.log(`[ ] Reasoning about step: ${step.step} using ${step.action}`);
      io.emit('status_update', { userId, status: `Reasoning about: ${step.step}` });
      const enhancedStep = await react.processStep(step, userId);
      console.log(`[X] Reasoning complete`);
      
      console.log(`[ ] ${enhancedStep.step} using ${enhancedStep.action}`);
      io.emit('status_update', { userId, status: `Executing: ${enhancedStep.step} using ${enhancedStep.action}` });
      
      // Get filtered steps output from context
      const filteredStepsOutput = contextManager.getFilteredStepsOutput(enhancedStep.usingData, userId);
      
      const inputData = enhancedStep.usingData === "none" ? "" : filteredStepsOutput.map(item => `${item.action}: ${item.output}`).join("; ");
      
      let summary;
      switch(enhancedStep.action) {
        case "webBrowser":
          summary = await browser.runTask(
            `${enhancedStep.step} Expected output: ${enhancedStep.expectedOutput}`, 
            inputData, 
            (summary) => {
              console.log(`[X] ${enhancedStep.step}`);
              io.emit('step_completed', { 
                userId, 
                step: enhancedStep.step, 
                action: enhancedStep.action,
                metrics: {
                  stepIndex: currentStepIndex,
                  stepCount: currentStepIndex + 1,
                  totalSteps: plan.length,
                  successCount: contextManager.getStepsOutput(userId).filter(step => 
                    step && step.output && !step.output.error && step.output.success !== false
                  ).length
                }
              });
            },
            userId
          );
          break;

        case "fileSystem":
          summary = await fileSystem.runTask(
            `${enhancedStep.step} Expected output: ${enhancedStep.expectedOutput}`, 
            inputData, 
            (summary) => {
              console.log(`[X] ${enhancedStep.step}`);
              io.emit('step_completed', { 
                userId, 
                step: enhancedStep.step, 
                action: enhancedStep.action,
                metrics: {
                  stepIndex: currentStepIndex,
                  stepCount: currentStepIndex + 1,
                  totalSteps: plan.length,
                  successCount: contextManager.getStepsOutput(userId).filter(step => 
                    step && step.output && !step.output.error && step.output.success !== false
                  ).length
                }
              });
              // If a file is created or updated, emit file event
              if (summary && summary.filePath) {
                io.emit('file_updated', { 
                  userId, 
                  filePath: summary.filePath, 
                  content: summary.content || 'File created/updated'
                });
              }
            },
            userId
          );
          break;

        case "writeFileDirectly":
          summary = await fileSystem.writeFileDirectly(
            `${enhancedStep.step} Expected output: ${enhancedStep.expectedOutput}`, 
            inputData, 
            (summary) => {
              console.log(`[X] ${enhancedStep.step}`);
              io.emit('step_completed', { 
                userId, 
                step: enhancedStep.step, 
                action: enhancedStep.action,
                metrics: {
                  stepIndex: currentStepIndex,
                  stepCount: currentStepIndex + 1,
                  totalSteps: plan.length,
                  successCount: contextManager.getStepsOutput(userId).filter(step => 
                    step && step.output && !step.output.error && step.output.success !== false
                  ).length
                }
              });
              // If a file is created or updated, emit file event
              if (summary && summary.filePath) {
                io.emit('file_updated', { 
                  userId, 
                  filePath: summary.filePath, 
                  content: summary.content || 'File created/updated'
                });
              }
            },
            userId
          );
          break;

        case "chatCompletion":
          summary = await ai.callAI(enhancedStep.step, inputData, [], undefined, true, "auto", userId);
          console.log(`[X] ${enhancedStep.step}`);
          io.emit('step_completed', { 
            userId, 
            step: enhancedStep.step, 
            action: enhancedStep.action,
            metrics: {
              stepIndex: currentStepIndex,
              stepCount: currentStepIndex + 1,
              totalSteps: plan.length,
              successCount: contextManager.getStepsOutput(userId).filter(step => 
                step && step.output && !step.output.error && step.output.success !== false
              ).length
            }
          });
          contextManager.addToHistory({
            role: "assistant", 
            content: [
              {type: "text", text: JSON.stringify(summary)}
            ]
          }, userId);
          break;

        case "deepResearch":
          summary = await deepSearch.runTask(enhancedStep.step, inputData, (summary) => {
            console.log(`[X] ${enhancedStep.step}`);
            io.emit('step_completed', { 
              userId, 
              step: enhancedStep.step, 
              action: enhancedStep.action,
              metrics: {
                stepIndex: currentStepIndex,
                stepCount: currentStepIndex + 1,
                totalSteps: plan.length,
                successCount: contextManager.getStepsOutput(userId).filter(step => 
                  step && step.output && !step.output.error && step.output.success !== false
                ).length
              }
            });
          }, userId);
          break;

        case "webSearch":
          summary = await webSearch.runTask(enhancedStep.step, inputData, (summary) => {
            console.log(`[X] ${enhancedStep.step}`);
            io.emit('step_completed', { 
              userId, 
              step: enhancedStep.step, 
              action: enhancedStep.action,
              metrics: {
                stepIndex: currentStepIndex,
                stepCount: currentStepIndex + 1,
                totalSteps: plan.length,
                successCount: contextManager.getStepsOutput(userId).filter(step => 
                  step && step.output && !step.output.error && step.output.success !== false
                ).length
              }
            });
          }, userId);
          break;

        case "execute":
          summary = await pythonExecute.runTask(enhancedStep.step, inputData, (summary) => {
            console.log(`[X] ${enhancedStep.step}`);
            io.emit('step_completed', { 
              userId, 
              step: enhancedStep.step, 
              action: enhancedStep.action,
              metrics: {
                stepIndex: currentStepIndex,
                stepCount: currentStepIndex + 1,
                totalSteps: plan.length,
                successCount: contextManager.getStepsOutput(userId).filter(step => 
                  step && step.output && !step.output.error && step.output.success !== false
                ).length
              }
            });
          }, userId);
          break;

        case "bash":
          summary = await bash.runTask(enhancedStep.step, inputData, (summary) => {
            console.log(`[X] ${enhancedStep.step}`);
            io.emit('step_completed', { 
              userId, 
              step: enhancedStep.step, 
              action: enhancedStep.action,
              metrics: {
                stepIndex: currentStepIndex,
                stepCount: currentStepIndex + 1,
                totalSteps: plan.length,
                successCount: contextManager.getStepsOutput(userId).filter(step => 
                  step && step.output && !step.output.error && step.output.success !== false
                ).length
              }
            });
          }, userId);
          break;

        case "imageGeneration":
          summary = await imageGeneration.runTask(enhancedStep.step, inputData, (summary) => {
            console.log(`[X] ${enhancedStep.step}`);
            io.emit('step_completed', { 
              userId, 
              step: enhancedStep.step, 
              action: enhancedStep.action,
              metrics: {
                stepIndex: currentStepIndex,
                stepCount: currentStepIndex + 1,
                totalSteps: plan.length,
                successCount: contextManager.getStepsOutput(userId).filter(step => 
                  step && step.output && !step.output.error && step.output.success !== false
                ).length
              }
            });
          }, userId);
          break;

        case "math":
          summary = await math.runTask(enhancedStep.step, inputData, (summary) => {
            console.log(`[X] ${enhancedStep.step}`);
            io.emit('step_completed', { 
              userId, 
              step: enhancedStep.step, 
              action: enhancedStep.action,
              metrics: {
                stepIndex: currentStepIndex,
                stepCount: currentStepIndex + 1,
                totalSteps: plan.length,
                successCount: contextManager.getStepsOutput(userId).filter(step => 
                  step && step.output && !step.output.error && step.output.success !== false
                ).length
              }
            });
          }, userId);
          break;

        case "writer":
          summary = await writer.write(
            `${enhancedStep.step} Expected output: ${enhancedStep.expectedOutput}`, 
            inputData,
            userId
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
          
          console.log(`[X] ${enhancedStep.step}`);
          io.emit('step_completed', { 
            userId, 
            step: enhancedStep.step, 
            action: enhancedStep.action,
            metrics: {
              stepIndex: currentStepIndex,
              stepCount: currentStepIndex + 1,
              totalSteps: plan.length,
              successCount: contextManager.getStepsOutput(userId).filter(step => 
                step && step.output && !step.output.error && step.output.success !== false
              ).length
            }
          });
          break;
        
        default:
          console.log(`Unknown action: ${enhancedStep.action}`);
          break;
      }
      
      // Add to stepsOutput after execution using context manager
      contextManager.addStepOutput(enhancedStep.step, enhancedStep.action, summary, userId);
      
      // ReAct: Reflect on result after execution
      console.log(`[ ] Reflecting on result of step ${currentStepIndex + 1}`);
      io.emit('status_update', { userId, status: `Reflecting on result of step ${currentStepIndex + 1}` });
      const reflection = await react.reflectOnResult(enhancedStep, summary, userId);
      console.log(`[X] Reflection complete`);
      
      // Increment step index in context
      contextManager.incrementStepIndex(userId);
      
      // Check if reflection suggests a plan change
      if (reflection && reflection.changePlan === true) {
        console.log(`[ ] Reflection suggests changing plan: ${reflection.explanation}`);
        try {
          const updatedPlan = await checkProgress(question, plan, contextManager.getStepsOutput(userId), contextManager.getCurrentStepIndex(userId), userId);
          
          // If the plan was updated, update it in context
          if (updatedPlan !== plan) {
            console.log("Plan was updated based on reflection");
            contextManager.updatePlan(updatedPlan, userId);
            io.emit('steps', { userId, plan: updatedPlan });
          }
        } catch (error) {
          console.error("Error updating plan based on reflection:", error.message);
          // Continue with original plan on error
        }
      }
      
      // Save the thought chain periodically
      if (currentStepIndex % 3 === 0 || currentStepIndex === plan.length - 1) {
        await react.saveThoughtChain(fileSystem, userId);
      }
    }
    
    // Clear screenshot interval if it was set
    if (screenshotInterval) {
      clearInterval(screenshotInterval);
    }
    
    // After the loop completes, finalize the task
    let finalOutput;
    try {
      finalOutput = await finalizeTask(question, contextManager.getStepsOutput(userId), userId);
      console.log(JSON.stringify({
        status: "completed",
        stepCount: contextManager.getStepsOutput(userId).length,
        successCount: contextManager.getStepsOutput(userId).filter(step => 
          step && step.output && !step.output.error && step.output.success !== false
        ).length
      }, null, 2));
      console.log(finalOutput);
      
      // Get task duration using the context manager
      const duration = contextManager.getTaskDuration(userId);
      
      // Get output files if they exist
      const outputFiles = [];
      try {
        const outputDir = path.join(__dirname, 'output', userId.replace(/[^a-zA-Z0-9_-]/g, '_'));
        if (fs.existsSync(outputDir)) {
          const files = fs.readdirSync(outputDir);
          files.forEach(file => {
            outputFiles.push({
              fileName: file,
              path: path.join('output', userId.replace(/[^a-zA-Z0-9_-]/g, '_'), file)
            });
          });
        }
      } catch (error) {
        console.error("Error getting output files:", error.message);
      }
      
      // Emit task completion event with enhanced data
      io.emit('task_completed', { 
        userId, 
        result: finalOutput,
        duration: duration,
        completedAt: new Date().toISOString(),
        outputFiles: outputFiles,
        metrics: {
          stepCount: contextManager.getStepsOutput(userId).length,
          successCount: contextManager.getStepsOutput(userId).filter(step => 
            step && step.output && !step.output.error && step.output.success !== false
          ).length,
          totalSteps: plan.length,
          durationSeconds: Math.round(duration / 1000),
          averageStepTime: Math.round(duration / contextManager.getStepsOutput(userId).length / 1000)
        }
      });
      
    } catch (error) {
      console.error("Error finalizing task:", error.message);
      finalOutput = "Task completed but could not be finalized: " + error.message;
      io.emit('task_error', { userId, error: error.message });
    }
    
    // Cleanup resources for this user
    await cleanupUserResources(userId);
    
    return finalOutput;
  } catch (error) {
    console.error("Critical error in orchestration:", error.message);
    
    // Emit error event
    io.emit('task_error', { userId, error: error.message });
    
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

async function checkProgress(question, plan, stepsOutput, currentStepIndex, userId = 'default') {
  try {
    // Skip progress checks if we're too early in the process
    if (currentStepIndex < 2 || plan.length <= 2) {
      return plan;
    }
    
    // Only check progress periodically to avoid excessive AI calls
    if (currentStepIndex % 3 !== 0) {
      return plan;
    }
    
    console.log("[ ] Checking progress");
    
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
      ai.callAI(prompt, "Analyze task progress and suggest plan changes", [], undefined, true, "auto", userId),
      30000 // 30-second timeout
    );
    
    if (!response || response.error || response === "NO_CHANGES_NEEDED") {
      console.log("[X] No plan changes needed");
      return plan;
    }
    
    console.log("[!] Plan updated based on progress");
    
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

async function finalizeTask(question, stepsOutput, userId = 'default') {
  try {
    console.log("[ ] Finalizing task");
    
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
    
    Completed steps and outputs: ${JSON.stringify(formattedStepsOutput, null, 2)}
    `;
    
    const response = await withTimeout(
      ai.callAI(prompt, "Generate final response", [], undefined, false, "auto", userId),
      60000 // 60-second timeout
    );
    
    if (!response) {
      console.error("Failed to generate final response");
      return "Task completed but final summary could not be generated.";
    }
    
    console.log("[X] Task finalized");
    return response;
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
  try {
    console.log(`[ ] Cleaning up resources for user: ${userId}`);
    
    // Close any browser instances using the browser module
    try {
      await browser.cleanupResources(userId);
    } catch (browserError) {
      console.error("Error closing browser instance:", browserError.message);
    }
    
    // Save the thought chain one final time
    try {
      await react.saveThoughtChain(fileSystem, userId);
    } catch (error) {
      console.error("Error saving final thought chain:", error.message);
    }
    
    // Create a final report of the session
    const context = contextManager.getContext(userId);
    const finalReport = {
      userId,
      completedAt: new Date().toISOString(),
      question: context.question,
      stepsCompleted: context.stepsOutput.length,
      planSize: context.plan.length,
    };
    
    // Save the final report to a file in user-specific directory
    try {
      await fileSystem.runTask(
        `Save session report to session_report.json`,
        JSON.stringify(finalReport, null, 2),
        null,
        userId
      );
    } catch (error) {
      console.error("Error saving session report:", error.message);
    }
    
    console.log(`[X] Resources cleaned up for user: ${userId}`);
    return true;
  } catch (error) {
    console.error(`Error cleaning up resources for user ${userId}:`, error.message);
    return false;
  }
}

// Export the centralOrchestrator function for use in test-server.js
module.exports = {
  centralOrchestrator
};

// Run the orchestrator if this file is executed directly
if (require.main === module) {
  // Set up socket event listener for receiving tasks
  io.on('connection', (socket) => {
    console.log('Client connected');
    
    socket.on('submit_task', async (data) => {
      const { task, userId = `socket_${Date.now()}` } = data;
      console.log(`Received task from socket for user ${userId}: ${task}`);
      
      // Execute the task
      centralOrchestrator(task, userId);
    });
    
    socket.on('disconnect', () => {
      console.log('Client disconnected');
    });
  });
  
  // Generate a timestamp-based userId for direct execution
  const directUserId = `direct_${Date.now()}`;
  centralOrchestrator("make a super clean, modern and highly animated homepage for my new project 'operon.one'. basically an ai that can do stuff for you (eg browsing the web, editing files, research, complete actions on the web and so much more). all of that automated and in a nice dashboard. so create the homepage / landingpage for it and make it extremly animated with world class top notch animations like never seen before. has to make a good first impression and be impressive to anyone. it should be written in html,css,js.", directUserId);
}
