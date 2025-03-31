const ai = require('./tools/AI/ai');
const browser = require('./tools/browser/main');
const fileSystem = require('./tools/filesystem/main');
const deepSearch = require('./tools/deepSearch/main');
const webSearch = require('./tools/webSearch/main');
const ascii = require('./utils/ascii');



async function centralOrchestrator(question){
    await ascii.printWelcome();
  let prompt = `
  You are an AI agent that can execute complex tasks. You will be given a question and you will need to plan a task to answer the question.

  You will have access to the following tools:
  - webBrowser: to browse the web in a browser for complexer tasks
  - fileSystem: to save and load files
  - chatCompletion: to ask normal AI questions

  - webSearch: quick and simple web search for basic information
  - deepResearch: deep research on a specific topic
  - execute: create and execute python files 
  - bash: execute bash commands

  Implement the chatCompletion tool into the tasks so the AI can evaluate responses and continue the task.

  You shall provide a JSON response with the following format:
  {
    step1: {
      "step": "step description",
      "action": "action to take",
      "expectedOutput": "expected output"
    },
    ....
  }

  an example would be:
  User: Research about the history of the internet and create a research paper.
  {
    step1: {
      "step": "using the fileSystem, create a todo.md where i plan the steps to research about the history of the internet",
      "action": "fileSystem",
      "expectedOutput": "todo.md"
    },
    step2: {
      "step": "using the browser, open google and search for the history of the internet. then go to the first result and read the content. and continue till you gathered enough information",
      "action": "webBrowser",
      "expectedOutput": "history of the internet"
    },
    step3: {
      "step": "using the fileSystem, save the gathered information to a file called 'internetHistory.txt'",
      "action": "fileSystem",
      "expectedOutput": "internetHistory.txt"
    },
    ....
  }
  
  Keep the JSON response as detailed as possible so the AI can work on it with no misunderstandings.
  `
  console.log("[ ] Planning...");

  let plan = await ai.callAI(prompt, question, []);
  console.log("[X] Planning...");
 
  let stepsOutput = [];

  for(let stepKey in plan) {
    const step = plan[stepKey];
    console.log(`[ ] ${step.step}`);
    
    if(step.action === "webBrowser") {
      const summary = await browser.runTask(
        `${step.step} Expected output: ${step.expectedOutput}`, 
        stepsOutput.join("; "), 
        (summary) => {
          console.log(`[X] ${step.step}`);
        }
      );
      stepsOutput.push(`Used the webBrowser to ${summary}`);
    } else if(step.action === "fileSystem") {
      const summary = await fileSystem.runTask(
        `${step.step} Expected output: ${step.expectedOutput}`, 
        stepsOutput.join("; "), 
        (summary) => {
          console.log(`[X] ${step.step}`);
        }
      );
      stepsOutput.push(`Used the fileSystem to ${summary}`);
    }else if(step.action === "chatCompletion"){
      const summary = await ai.callAI(step.step, stepsOutput.join("; "), []);
      stepsOutput.push(`Used the chatCompletion to ${summary}`);
    }else if(step.action === "deepResearch"){
      const summary = await deepSearch.runTask(step.step, stepsOutput.join("; "), (summary) => {
        console.log(`[X] ${step.step}`);
      });
      stepsOutput.push(`Used the deepResearch to ${summary}`);
    } else if(step.action === "webSearch"){
      const summary = await webSearch.runTask(step.step, stepsOutput.join("; "), (summary) => {
        console.log(`[X] ${step.step}`);
      });
      stepsOutput.push(`Used the webSearch to ${summary}`);
    }
  }
}

centralOrchestrator("Research about the history of the internet and create a research paper.");
