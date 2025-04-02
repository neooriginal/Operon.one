const ai = require('./tools/AI/ai');
const browser = require('./tools/browser/main');
const fileSystem = require('./tools/filesystem/main');
const deepSearch = require('./tools/deepSearch/main');
const webSearch = require('./tools/webSearch/main');
const pythonExecute = require('./tools/pythonExecute/main');
const bash = require('./tools/bash/index');
const imageGeneration = require('./tools/imageGeneration/main');
const ascii = require('./utils/ascii');
const { improvePrompt } = require('./tools/prompting/promptImprover');
const writer = require('./tools/writer/main');
let plan = [];
let history = [];

let globalPrompt = `

You will have access to the following tools:
- webBrowser: to browse the web in a browser for complexer tasks and tasks that require actions
- fileSystem: to save and load files
- chatCompletion: to ask normal AI questions
- webSearch: quick and simple web search for basic information (using duckduckgo)
- deepResearch: deep research on a specific topic (using duckduckgo)
- execute: create and execute python files 
- bash: execute bash commands
- writer: used to write about things in detail based on the information collected previously

Implement the chatCompletion tool into the tasks so the AI can evaluate responses and continue the task. You can use the file system to write down notes or important information which you can then read at the end.

You shall provide a JSON response with the following format:
{
  step1: {
    "step": "step description",
    "action": "action to take",
    "expectedOutput": "expected output",
    "usingData": "data from specific tools to use for the step" //default: all. can be multiple tools separated by commas
  },
  ....
}

an example would be:
User: Research about the history of the internet and create a research paper.
{
  step1: {
    "step": "using the fileSystem, create a todo.md where i plan the steps to research about the history of the internet",
    "action": "fileSystem",
    "expectedOutput": "todo.md",
    "usingData": "none"
  },
  step2: {
    "step": "what is the internet?",
    "action": "chatCompletion",
    "expectedOutput": "history of the internet",
    "usingData": "none"
  },
  step3: {
    "step": "search for the history of the internet. then go to the first result and read the content. and continue till you gathered enough information",
    "action": "deepResearch",
    "expectedOutput": "history of the internet",
    "usingData": "none"
  },
  step4: {
    "step": "using the writer, write a research paper about the history of the internet based on the information gathered",
    "action": "writer",
    "expectedOutput": "research paper",
    "usingData": "deepResearch,chatCompletion"
  },
  step5: {
    "step": "using the fileSystem, save the gathered information to a file called 'internetHistory.txt'",
    "action": "fileSystem",
    "expectedOutput": "internetHistory.txt",
    "usingData": "writer"
  },
  ....
}
`

async function centralOrchestrator(question){
  await ascii.printWelcome();
  console.log("[ ] Improving prompt")
  question = await improvePrompt(question);
  console.log("[X] Improving prompt");

  let prompt = `
  You are an AI agent that can execute complex tasks. You will be given a question and you will need to plan a task to answer the question.
  ${globalPrompt}
  `
  console.log("[ ] Planning...");

  let planObject = await ai.callAI(prompt, question, history);
  // Convert the plan object into an array
  plan = Object.values(planObject).filter(item => item && typeof item === 'object');
  
  history.push({
    role: "user", 
    content: [
        {type: "text", text: question}
    ]
  });
  history.push({
  role: "assistant", 
  content: [
      {type: "text", text: JSON.stringify(planObject)}
  ]
  });
  console.log("[X] Planning...");
 
  let stepsOutput = [];
  let currentStepIndex = 0;

  

  // Continue executing steps until we've completed all steps in the plan
  while (currentStepIndex < plan.length) {
    const step = plan[currentStepIndex];
    console.log(`[ ] ${step.step} using ${step.action}`);
    
    // Filter stepsOutput based on usingData parameter
    let filteredStepsOutput = [];
    if (step.usingData && step.usingData !== "none") {
      const requestedTools = step.usingData.split(",").map(tool => tool.trim());
      
      if (requestedTools.includes("all")) {
        filteredStepsOutput = stepsOutput;
      } else {
        filteredStepsOutput = stepsOutput.filter(output => 
          requestedTools.includes(output.action)
        );
      }
    }
    
    const inputData = step.usingData === "none" ? "" : filteredStepsOutput.map(item => `${item.action}: ${item.output}`).join("; ");
    
    let summary;
    switch(step.action) {
      case "webBrowser":
        summary = await browser.runTask(
          `${step.step} Expected output: ${step.expectedOutput}`, 
          inputData, 
          (summary) => {
            console.log(`[X] ${step.step}`);
          }
        );
        stepsOutput.push({
          step: step.step,
          action: step.action,
          output: summary
        });
        break;

      case "fileSystem":
        summary = await fileSystem.runTask(
          `${step.step} Expected output: ${step.expectedOutput}`, 
          inputData, 
          (summary) => {
            console.log(`[X] ${step.step}`);
          }
        );
        stepsOutput.push({
          step: step.step,
          action: step.action,
          output: summary
        });
        break;

      case "chatCompletion":
        summary = await ai.callAI(step.step, inputData, []);
        stepsOutput.push({
          step: step.step,
          action: step.action,
          output: summary
        });
        console.log(`[X] ${step.step}`);
        history.push({
          role: "assistant", 
          content: [
            {type: "text", text: JSON.stringify(summary)}
          ]
        });
        break;

      case "deepResearch":
        summary = await deepSearch.runTask(step.step, inputData, (summary) => {
          console.log(`[X] ${step.step}`);
        });
        stepsOutput.push({
          step: step.step,
          action: step.action,
          output: summary
        });
        break;

      case "webSearch":
        summary = await webSearch.runTask(step.step, inputData, (summary) => {
          console.log(`[X] ${step.step}`);
        });
        stepsOutput.push({
          step: step.step,
          action: step.action,
          output: summary
        });
        break;

      case "execute":
        summary = await pythonExecute.runTask(step.step, inputData, (summary) => {
          console.log(`[X] ${step.step}`);
        });
        stepsOutput.push({
          step: step.step,
          action: step.action,
          output: summary
        });
        break;

      case "bash":
        summary = await bash.runTask(step.step, inputData, (summary) => {
          console.log(`[X] ${step.step}`);
        });
        stepsOutput.push({
          step: step.step,
          action: step.action,
          output: summary
        });
        break;

      case "imageGeneration":
        summary = await imageGeneration.runTask(step.step, inputData, (summary) => {
          console.log(`[X] ${step.step}`);
        });
        stepsOutput.push({
          step: step.step,
          action: step.action,
          output: summary
        });
        break;

      case "writer":
        summary = await writer.write(question, inputData);
        stepsOutput.push({
          step: step.step,
          action: step.action,
          output: summary
        });
        break;
      default:
        console.log(`Unknown action: ${step.action}`);
        break;
    }
    
    // Mark this step as completed
    currentStepIndex++;
    
    // Check progress and potentially update the plan
    const updatedPlan = await checkProgress(question, plan, stepsOutput, currentStepIndex);
    
    // If the plan was updated, use the new plan but keep our current position
    if (updatedPlan !== plan) {
      plan = updatedPlan;
    }
  }
  const finalOutput = await finalizeTask(question, stepsOutput);
  console.log(finalOutput);
}

async function checkProgress(question, steps, stepsOutput, completedSteps){
  let prompt = `
  You are an AI agent that can check the progress of a task.
  You will be given a list of steps and the steps output.
  You will need to check the progress of the task and return the progress in a JSON format. If the task is running as expected, return the exact step list as the one provided. If the task is not running as expected, edit the step list to make it more likely to succeed.
  Note: already completed steps can not be changed. ${completedSteps} steps have been completed.

  Only add steps if absolutely necessary.

  Steps: ${steps}
  Steps Output: ${stepsOutput.map(item => `${item.action}: ${item.output}`).join("; ")}

  ${globalPrompt}
  `
  const updatedPlanObject = await ai.callAI(prompt, question, history);
  // Convert the plan object to array
  const updatedPlan = Object.values(updatedPlanObject).filter(item => item && typeof item === 'object');
  
  history.push({
    role: "user", 
    content: [
        {type: "text", text: question}
    ]
  });
  history.push({
    role: "assistant", 
    content: [
      {type: "text", text: JSON.stringify(updatedPlanObject)}
  ]
});

  //compare length of updatedPlan and plan and compare added or removed steps to console log
  if(updatedPlan.length > plan.length){
    console.log(`[!] Added steps: ${updatedPlan.length - plan.length}`);
  } else if(updatedPlan.length < plan.length){
    console.log(`[!] Removed steps: ${plan.length - updatedPlan.length}`);
  }

  return updatedPlan;
}

async function finalizeTask(question, stepsOutput){
  let prompt = `
  You are an AI agent that can finalize a task.
  You will be given a question and the steps output.
  You will need to finalize the task and return the final output. This can be either pure text or locations to files etc.

  Question: ${question}
  Steps Output: ${stepsOutput.map(item => `${item.action}: ${item.output}`).join("; ")}

  `
  const finalOutput = await ai.callAI(prompt, question, history);
  return finalOutput;
}

// Export the centralOrchestrator function for the tester
module.exports = {
  centralOrchestrator
};

// Run the orchestrator if this file is executed directly
if (require.main === module) {
  centralOrchestrator("Research about the history of the internet and create a research paper.");
}
