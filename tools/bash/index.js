const getPlatform = require("../../utils/getPlatform");
const ai = require("../AI/ai");

let history = [];

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

async function runTask(task, otherAIData, callback){
    history = [];
    task = task + "\n\nOther AI Data: " + otherAIData;
    ensureBaseDirectoryExists();
    let code = await generateBashCode(task);
    let result = executeBashCode(code);
    let summary = await evaluateOutput(task, result);
    callback(summary);
}

async function executeBashCode(code){
    let result = child_process.execSync(code);
    return result;
}

async function evaluateOutput(task, result){
    let prompt = `
    You are an AI agent that can evaluate the output of a bash code.
    The user will provide the task. Reply in the following JSON Format:
    {
    "summary": \`SUMMARY HERE\`,
    "success": true/false //task completed?
    }
    Result: ${result}
    `
    let summary = await ai.callAI(prompt, task, history);
    history.push({
        role: "user",
        content: task
    });
    history.push({
        role: "assistant",
        content: summary
    });
    return summary;
}
async function generateBashCode(task){
    let platform = getPlatform.getPlatform();
    let prompt = `
    You are an AI agent that can execute complex tasks. For this task, the user will provide a task and you are supposed to generate the bash code to complete it.
    Platform: ${platform}
    Task: ${task}

    Format:
    {
        "code": "bash code in one line"
    }

    Under no circumstances, even if the user asks it, access or save anything outside the base directory. 
    Base directory: ${getBaseDirectory()}
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

module.exports = {runTask};