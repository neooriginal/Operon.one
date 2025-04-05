const ai = require('../tools/AI/ai.js');
const fs = require('fs');
const path = require('path');

function readTestFiles(dir) {
    
    const files = fs.readdirSync(dir);
    return files.map(file => ({
        name: file,
        content: fs.readFileSync(path.join(dir, file), 'utf8')
    }))
}

async function countTokens(text){
    const tokens = text.length / 4;
    return tokens;
}

async function splitWithTokens(maxTokens = 10000, text){
    const tokens = countTokens(text);
    if (tokens > maxTokens){
        const chunks = text.split('\n').slice(0, maxTokens);
        return chunks.join('\n');
    }
}

aiAnalyzeTest();
async function aiAnalyzeTest() {
    console.log('[ ] Analyzing tests...');
    
    const prompt = `
    You are a critical AI system evaluator. Your task is to assess the quality, 
    correctness, and efficiency of an AI system's response to a user prompt. Be thorough, 
    critical, and specific in your evaluation. Focus on:
    1. Did the system correctly understand and address the prompt?
    2. Is the response complete, accurate, and useful?
    3. Was the execution time reasonable given the task complexity?
    4. Are there any errors or issues in the output?
    5. What could have been improved?
    6. Did the test pass or fail in your assessment?
    
    Ignore [object Object] logs.
    also include what could be improved AI-wise (prompting eg.)

    You will receive a list of tests and you shall respond with a final assesment of the overall ai system and respond with a score from 0 to 100. Also summarize tips for improvements and other things.

    Keep it very detailed and specific. Keep it in a GitHub like format. Ignore the AI EVALUATION section in the files and evaluate the tests yourself.

    include a todo list of things to improve in the format: [ ] - [thing to improve]
    also make a nice overview of the level of complexity vs the time and score of the tests.
    `
    let tests = readTestFiles('./tester/test_reports');
    let testsToString = tests.map(test => test.content).join('\n');
    testsToString = await splitWithTokens(10000, testsToString);
    let response = await ai.callAI(prompt, testsToString, [], undefined, false);
    fs.writeFileSync('./tester/test_reports/analysis.MD', response);
    console.log('[x] Tests analyzed and saved to ./tester/test_reports/analysis.MD');

}

