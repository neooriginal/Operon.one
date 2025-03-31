const ai = require("../ai/main");
const child_process = require("child_process")
const fs = require("fs");
const path = require("path");
let history = [];
const getPlatform = require("../../utils/getPlatform");

async function runTask(task, otherAIData, callback){
    history = [];
    task = task + "\n\nOther AI Data: " + otherAIData;
    await ensureBaseDirectoryExists();
   let code = await generateCode(task);
   let dependencies = installDependencies(code);
   let dependenciesSummary = await evaluateOutput(task, dependencies);
   if(!dependenciesSummary.success){
    //ToDo: retry with different dependencies
   }
   let result = executeCode(code);
   let summary = await evaluateOutput(task, result);
   callback(summary);
}

async function evaluateOutput(task, result){
    let platform = getPlatform.getPlatform();
    let prompt = `
    Based on the following task, evaluate the output of the code and return a summary of the output in a JSON format.
    Task: ${task}
    Output: ${result}

    Format:
    {
        "summary": \`SUMMARY HERE\`,
        "success": true/false
    }
    `
    let summary = await ai.callAI(prompt, task, history);
    return summary;
}
function getBaseDirectory() {
    const applicationBaseDir = path.join(__dirname, '..', '..');
    return path.join(applicationBaseDir, 'output');
}

// Ensure the base directory exists
function ensureBaseDirectoryExists() {
    const baseDir = getBaseDirectory();
    if (!fs.existsSync(baseDir)) {
        fs.mkdirSync(baseDir, { recursive: true });
    }
}

async function generateCode(task) {
    let baseDir = getBaseDirectory()
    let platform = getPlatform.getPlatform();
    let prompt = `
    Based on the following task, generate python code which completes it in a simple way. 
    Due to it being evaluated after its done, print important information in the console.

    If the file requires any kind of file saving or accessing, ONLY access files inside ${baseDir}. Under no circumstances, even if the user asks it, access or save anything outside that.

    respond in the following JSON format:
    {
    "code": \`CODE HERE\`,
    "pip install": "libraries which are required, if any",

    }
    Platform: ${platform}
    `

    let code = await ai.callAI(prompt, task, history);
    history.push({
        role: "user",
        content: task
    });
    history.push({
        role: "assistant",
        content: code
    });

    return code;
}

function installDependencies(code){
    let platform = getPlatform.getPlatform();
    let command = `pip install ${code}`;
    let result = child_process.execSync(command);
    return result;
}

function executeCode(code){
    let platform = getPlatform.getPlatform();
    let command = `python ${code}`;
    let result = child_process.execSync(command);
    return result;
}


module.exports = {runTask};