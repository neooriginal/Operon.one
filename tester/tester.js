const fs = require('fs');
const path = require('path');
const { promisify } = require('util');
const exec = promisify(require('child_process').exec);
const { v4: uuidv4 } = require('uuid');


const { centralOrchestrator } = require('../index');

const { callAI } = require('../tools/AI/ai.js');


const REPORTS_DIR = path.join(__dirname, 'test_reports');
if (!fs.existsSync(REPORTS_DIR)) {
  fs.mkdirSync(REPORTS_DIR);
}


const testPrompts = [
  "manually create some files in the output directory for testing. quick and easy.",
  "Create a comprehensive business plan for a small coffee shop including market analysis, financial projections, and marketing strategy"
];


async function evaluateTestResult(prompt, testResult, logs, outputContents, testDuration, existingContext = null) {
  console.log('Evaluating test result with AI...');
  
  
  const evaluationContext = existingContext || {
    prompt,
    executionTimeMs: testDuration,
    
    logs: logs.join('\n').substring(0, 10000), 
    outputFiles: Object.keys(outputContents),
    
    outputSamples: Object.entries(outputContents)
      .map(([file, content]) => {
        const fullSize = content.length;
        const sample = content.substring(0, 2000);
        return `${file} (${fullSize} bytes): ${sample}${fullSize > 2000 ? '... (truncated)' : ''}`;
      })
      .join('\n\n'),
    success: testResult.success,
    error: testResult.error || null
  };
  
  
  const systemMessage = `You are a critical AI system evaluator. Your task is to assess the quality, 
  correctness, and efficiency of an AI system's response to a user prompt. Be thorough, critical, 
  and specific in your evaluation. Focus on:
  1. Did the system correctly understand and address the prompt?
  2. Is the response complete, accurate, and useful?
  3. Was the execution time reasonable given the task complexity?
  4. Are there any errors or issues in the output?
  5. What could have been improved?
  6. Did the test pass or fail in your assessment?

  ALSO VERY IMPORTANT: make sure the results of the different steps are used for the final response.
  Examine the logs carefully to ensure that outputs from earlier steps are properly incorporated into
  the final result. Reject responses that calculate information but don't use it properly.
  
  Ignore [object Object] logs.
  also include what could be improved AI-wise (prompting eg.)

  Your response MUST include all of the following fields in valid JSON format:
  - passed: boolean (whether the test passed your evaluation)
  - score: number (0-10 score of the response quality)
  - feedback: string (critical assessment of the response)
  - improvements: array of strings (specific suggestions for improvement)
  - executionTimeAssessment: string (assessment of execution time)`;
  
  try {
    
    const evaluationText = await callAI(
      systemMessage,
      `Evaluate this AI system's response to the following prompt: "${prompt}"\n\nHere's the execution data:\n${JSON.stringify(evaluationContext, null, 2)}`,
      [],
      undefined,
      false, 
      "auto"
    );
    
    
    let evaluationResult;
    try {
      
      const jsonMatch = evaluationText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        evaluationResult = JSON.parse(jsonMatch[0]);
      } else {
        
        evaluationResult = {
          passed: evaluationText.toLowerCase().includes('pass') && !evaluationText.toLowerCase().includes('fail'),
          score: parseInt(evaluationText.match(/(\d+)\s*\/\s*10/) || [0, 5])[1],
          feedback: evaluationText.substring(0, 1000),
          improvements: extractImprovements(evaluationText),
          executionTimeAssessment: extractTimeAssessment(evaluationText)
        };
      }
    } catch (parseError) {
      console.error(`Error parsing evaluation result: ${parseError.message}`);
      
      evaluationResult = {
        passed: testResult.success,
        score: testResult.success ? 6 : 3,
        feedback: testResult.success 
          ? "The system appears to have executed the request successfully, but detailed evaluation failed."
          : `The system encountered an error: ${testResult.error}`,
        improvements: ["Improve evaluation parsing capability"],
        executionTimeAssessment: testDuration < 5000
          ? "Execution time appears reasonable" 
          : "Execution time seems longer than expected"
      };
    }
    
    return {
      passed: evaluationResult.passed !== undefined ? evaluationResult.passed : testResult.success,
      score: typeof evaluationResult.score === 'number' ? evaluationResult.score : (testResult.success ? 5 : 2),
      feedback: evaluationResult.feedback || "The evaluation could not determine detailed feedback",
      improvements: Array.isArray(evaluationResult.improvements) ? evaluationResult.improvements : 
        ["Improve response quality", "Enhance error handling", "Optimize execution time"],
      executionTimeAssessment: evaluationResult.executionTimeAssessment || 
        `Execution took ${testDuration}ms which is ${testDuration > 5000 ? "potentially slow" : "acceptable"} for this task`
    };
  } catch (error) {
    console.error(`Error during AI evaluation: ${error.message}`);
    
    return {
      passed: testResult.success,
      score: testResult.success ? 5 : 2,
      feedback: testResult.success 
        ? "The system executed the request successfully, but couldn't evaluate details."
        : `The system failed with error: ${testResult.error}`,
      improvements: [
        "Fix AI evaluation functionality",
        "Improve error handling",
        testResult.success ? "Enhance response quality" : "Address the root cause of failure"
      ],
      executionTimeAssessment: `Execution took ${testDuration}ms which is ${testDuration > 5000 ? "potentially slow" : "acceptable"} for this task`
    };
  }
}


function extractImprovements(text) {
  
  const improvementPatterns = [
    /improvements?:?([\s\S]*?)(?:\n\n|\n[A-Z]|$)/i,
    /could be improved:?([\s\S]*?)(?:\n\n|\n[A-Z]|$)/i,
    /suggestions?:?([\s\S]*?)(?:\n\n|\n[A-Z]|$)/i,
    /recommendations?:?([\s\S]*?)(?:\n\n|\n[A-Z]|$)/i
  ];
  
  for (const pattern of improvementPatterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      
      return match[1].split(/\n-|\n\d+\.|\.\s+(?=[A-Z])/)
        .map(item => item.trim())
        .filter(item => item.length > 0);
    }
  }
  
  
  const sentences = text.split(/\.\s+/);
  const improvementSentences = sentences.filter(s => 
    /improve|better|enhance|optimize|fix|missing|should|could|would/i.test(s)
  );
  
  return improvementSentences.length > 0 
    ? improvementSentences.map(s => s.trim() + (s.endsWith('.') ? '' : '.'))
    : ["Improve response quality", "Enhance error handling", "Optimize execution time"];
}

function extractTimeAssessment(text) {
  
  const timePatterns = [
    /execution time:?([\s\S]*?)(?:\n\n|\n[A-Z]|$)/i,
    /time assessment:?([\s\S]*?)(?:\n\n|\n[A-Z]|$)/i,
    /performance:?([\s\S]*?)(?:\n\n|\n[A-Z]|$)/i
  ];
  
  for (const pattern of timePatterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      return match[1].trim();
    }
  }
  
  
  const sentences = text.split(/\.\s+/);
  const timeSentences = sentences.filter(s => 
    /time|duration|performance|fast|slow|quick|speed|ms|seconds/i.test(s)
  );
  
  return timeSentences.length > 0 
    ? timeSentences[0].trim() + (timeSentences[0].endsWith('.') ? '' : '.')
    : "No specific time assessment available";
}


async function cleanWorkspace() {
  console.log('Cleaning workspace...');
  
  
  const outputDir = path.join(__dirname, 'output');
  if (fs.existsSync(outputDir)) {
    
    const files = fs.readdirSync(outputDir);
    for (const file of files) {
      const filePath = path.join(outputDir, file);
      if (fs.lstatSync(filePath).isDirectory()) {
        fs.rmSync(filePath, { recursive: true, force: true });
      } else {
        fs.unlinkSync(filePath);
      }
    }
    console.log('Output directory cleaned');
  }
  
  
  const pythonFiles = fs.readdirSync(__dirname)
    .filter(file => file.endsWith('.py') && file !== 'tester.py');
  
  for (const file of pythonFiles) {
    fs.unlinkSync(path.join(__dirname, file));
    console.log(`Removed temporary file: ${file}`);
  }
  
  
  const tempFiles = fs.readdirSync(__dirname)
    .filter(file => 
      (file.startsWith('temp_') || file.includes('_temp')) && 
      !file.includes('tester')
    );
  
  for (const file of tempFiles) {
    fs.unlinkSync(path.join(__dirname, file));
    console.log(`Removed temporary file: ${file}`);
  }
  
  console.log('Workspace cleaned successfully');
}


async function validateOutputArtifacts(testDir, outputContents) {
  const validationResults = {
    totalArtifacts: Object.keys(outputContents).length,
    verifiedArtifacts: 0,
    failedArtifacts: 0,
    missingArtifacts: 0,
    imageUrlsFound: 0,
    imageUrlsVerified: 0,
    details: []
  };
  
  
  for (const [filename, content] of Object.entries(outputContents)) {
    try {
      
      const fullPath = path.join(testDir, filename);
      const exists = fs.existsSync(fullPath);
      
      if (!exists) {
        validationResults.missingArtifacts++;
        validationResults.details.push({
          filename,
          status: 'missing',
          error: 'File listed in outputs but not found on disk'
        });
        continue;
      }
      
      
      const fileContent = fs.readFileSync(fullPath, 'utf8');
      if (fileContent.length === 0) {
        validationResults.failedArtifacts++;
        validationResults.details.push({
          filename,
          status: 'empty',
          error: 'File exists but is empty'
        });
        continue;
      }
      
      
      const imageUrlMatches = fileContent.match(/(https?:\/\/[^\s"'<>]+\.(jpg|jpeg|png|gif|webp|svg))/g);
      if (imageUrlMatches && imageUrlMatches.length > 0) {
        validationResults.imageUrlsFound += imageUrlMatches.length;
        
      }
      
      
      validationResults.verifiedArtifacts++;
      validationResults.details.push({
        filename,
        status: 'verified',
        size: fileContent.length,
        imageReferences: imageUrlMatches ? imageUrlMatches.length : 0
      });
    } catch (error) {
      validationResults.failedArtifacts++;
      validationResults.details.push({
        filename,
        status: 'error',
        error: error.message
      });
    }
  }
  
  return validationResults;
}


async function runTest(prompt, index) {
  console.log(`\n---------------------------------------------`);
  console.log(`Running Test #${index + 1} [${uuidv4().substring(0, 8)}]`);
  console.log(`Prompt: "${prompt}"`);
  console.log(`---------------------------------------------`);
  
  await cleanWorkspace();
  
  const startTime = Date.now();
  let testResult;
  let logs = [];
  let outputContents = {};
  
  try {
    const result = await centralOrchestrator(prompt, "test-user", 1, false);
    testResult = { success: true, result };
  } catch (error) {
    testResult = { success: false, error: error.message };
  }
  
  const testDuration = Date.now() - startTime;
  
  const newFiles = [];

  const outputDir = path.join(__dirname, 'output');
  let outputFiles = [];
  
  if (fs.existsSync(outputDir)) {
    
    const getAllFiles = (dir) => {
      let results = [];
      const list = fs.readdirSync(dir);
      list.forEach(file => {
        const filePath = path.join(dir, file);
        const stat = fs.statSync(filePath);
        if (stat && stat.isDirectory()) {
          results = results.concat(getAllFiles(filePath));
        } else {
          results.push(filePath);
        }
      });
      return results;
    };
    
    const allOutputFiles = getAllFiles(outputDir);
    outputFiles = allOutputFiles.map(file => path.relative(outputDir, file));
    
    
    for (const relativePath of outputFiles) {
      const filePath = path.join(outputDir, relativePath);
      try {
        const stats = fs.statSync(filePath);
        
        if (stats.size < 1000000 && !isLikelyBinaryFile(filePath)) {
          const content = fs.readFileSync(filePath, 'utf8');
          outputContents[relativePath] = content;
        } else {
          
          outputContents[relativePath] = `[File size: ${stats.size} bytes, Modified: ${stats.mtime}]`;
        }
      } catch (error) {
        outputContents[relativePath] = `Error reading file: ${error.message}`;
      }
    }
  }
  
  const testInfo = {
    id: uuidv4().substring(0, 8),
    prompt,
    startTime: new Date(startTime).toISOString(),
    duration: testDuration,
    newFiles,
    outputFiles,
  };
  
  const validationResults = await validateOutputArtifacts(outputDir, outputContents);
  console.log(`Validation results: ${validationResults.verifiedArtifacts}/${validationResults.totalArtifacts} artifacts verified`);
  
  let evaluationContext = null;
  
  try {
    evaluationContext = {
      prompt,
      executionTimeMs: testDuration,
      
      logs: logs.join('\n').substring(0, 10000), 
      outputFiles: Object.keys(outputContents),
      
      outputSamples: Object.entries(outputContents)
        .map(([file, content]) => {
          const fullSize = content.length;
          const sample = content.substring(0, 2000);
          return `${file} (${fullSize} bytes): ${sample}${fullSize > 2000 ? '... (truncated)' : ''}`;
        })
        .join('\n\n'),
      success: testResult.success,
      error: testResult.error || null,
      validation: validationResults
    };
    
    const aiEvaluation = await evaluateTestResult(prompt, testResult, logs, outputContents, testDuration, evaluationContext);
    
    const safeStringify = (item) => {
      if (Array.isArray(item)) {
        return item.length > 0 ? item.join('\n') : '(empty array)';
      }
      return item;
    };
    
    const logFile = path.join(REPORTS_DIR, `test_${index+1}_${uuidv4().substring(0, 8)}.log`);
    
    fs.writeFileSync(
      logFile,
      `Test #${index+1} [${uuidv4().substring(0, 8)}]\n` +
      `Prompt: "${prompt}"\n` +
      `Start Time: ${new Date(startTime).toISOString()}\n` +
      `Duration: ${testDuration}ms\n\n` +
      `New Files Created:\n${safeStringify(newFiles)}\n\n` +
      `Output Files (${outputFiles.length}):\n${safeStringify(outputFiles)}\n\n` +
      `Output File Contents:\n` +
      Object.entries(outputContents)
        .map(([filename, content]) => {
          
          const contentStr = typeof content === 'string' 
            ? (content.length > 5000 
                ? content.substring(0, 5000) + `\n\n... (${content.length - 5000} more bytes) ...` 
                : content)
            : content;
          return `\n=== ${filename} ===\n${safeStringify(contentStr)}\n`;
        })
        .join('\n') +
      `\nConsole Output (${logs.length} lines):\n${safeStringify(logs)}\n` +
      `\n---------------------------------------------\n` +
      `AI EVALUATION\n` +
      `---------------------------------------------\n` +
      `Passed: ${aiEvaluation.passed}\n` +
      `Score: ${aiEvaluation.score}/10\n` +
      `Feedback: ${aiEvaluation.feedback}\n` +
      `Execution Time Assessment: ${aiEvaluation.executionTimeAssessment}\n` +
      `Suggested Improvements:\n${safeStringify(aiEvaluation.improvements)}\n`
    );
    
    console.log(`\nTest completed in ${testDuration}ms`);
    console.log(`AI Evaluation: ${aiEvaluation.passed ? 'PASSED' : 'FAILED'} - Score: ${aiEvaluation.score}/10`);
    console.log(`Report saved to: ${logFile}`);
    
    return {
      success: true,
      duration: testDuration,
      reportPath: logFile,
      evaluation: aiEvaluation
    };
  } catch (error) {
    console.error(`Test failed: ${error.message}`);
    
    evaluationContext = {
      prompt,
      executionTimeMs: Date.now() - startTime,
      logs: logs.join('\n').substring(0, 10000),
      outputFiles: Object.keys(outputContents),
      outputSamples: Object.entries(outputContents)
        .map(([file, content]) => {
          const fullSize = content.length;
          const sample = content.substring(0, 2000);
          return `${file} (${fullSize} bytes): ${sample}${fullSize > 2000 ? '... (truncated)' : ''}`;
        })
        .join('\n\n'),
      success: false,
      error: error.message
    };
    
    const aiEvaluation = await evaluateTestResult(prompt, { success: false, error: error.message }, logs, outputContents, Date.now() - startTime, evaluationContext);
    
    const safeStringify = (item) => {
      if (Array.isArray(item)) {
        return item.length > 0 ? item.join('\n') : '(empty array)';
      }
      return item;
    };
    
    const logFile = path.join(REPORTS_DIR, `test_${index+1}_${uuidv4().substring(0, 8)}.log`);
    
    fs.writeFileSync(
      logFile,
      `Test #${index+1} [${uuidv4().substring(0, 8)}]\n` +
      `Prompt: "${prompt}"\n` +
      `Start Time: ${new Date(startTime).toISOString()}\n` +
      `Error: ${error.message}\n\n` +
      `Stack Trace:\n${error.stack}\n\n` +
      `Console Output (${logs.length} lines):\n${safeStringify(logs)}\n` +
      `\n---------------------------------------------\n` +
      `AI EVALUATION\n` +
      `---------------------------------------------\n` +
      `Passed: ${aiEvaluation.passed}\n` +
      `Score: ${aiEvaluation.score}/10\n` +
      `Feedback: ${aiEvaluation.feedback}\n` +
      `Execution Time Assessment: ${aiEvaluation.executionTimeAssessment}\n` +
      `Suggested Improvements:\n${safeStringify(aiEvaluation.improvements)}\n`
    );
    
    console.log(`Error report saved to: ${logFile}`);
    
    return {
      success: false,
      error: error.message,
      reportPath: logFile,
      evaluation: aiEvaluation
    };
  }
}


function isLikelyBinaryFile(filePath) {
  const binaryExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.ico', '.pdf', '.zip', '.exe', '.dll'];
  const ext = path.extname(filePath).toLowerCase();
  return binaryExtensions.includes(ext);
}


async function runAllTests() {
  console.log(`Starting test suite with ${testPrompts.length} prompts`);
  console.log(`Reports will be saved to: ${REPORTS_DIR}`);
  
  const summaryFile = path.join(REPORTS_DIR, `summary_${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  const results = [];
  
  for (let i = 0; i < testPrompts.length; i++) {
    const prompt = testPrompts[i];
    
    try {
      const result = await runTest(prompt, i);
      results.push({
        prompt,
        ...result
      });
      
      
      await cleanWorkspace();
      
    } catch (error) {
      console.error(`Error running test: ${error.message}`);
      results.push({
        prompt,
        success: false,
        error: error.message
      });
    }
  }
  
  
  const passedTests = results.filter(r => r.evaluation && r.evaluation.passed).length;
  const avgScore = results
    .filter(r => r.evaluation && typeof r.evaluation.score === 'number')
    .reduce((acc, r) => acc + r.evaluation.score, 0) / 
    results.filter(r => r.evaluation && typeof r.evaluation.score === 'number').length;
  
  
  fs.writeFileSync(
    summaryFile,
    JSON.stringify({
      totalTests: testPrompts.length,
      successfulTests: results.filter(r => r.success).length,
      failedTests: results.filter(r => !r.success).length,
      aiPassedTests: passedTests,
      averageAiScore: avgScore.toFixed(2),
      averageDuration: results.filter(r => r.success)
        .reduce((acc, r) => acc + r.duration, 0) / results.filter(r => r.success).length,
      tests: results
    }, null, 2)
  );
  
  console.log(`\n---------------------------------------------`);
  console.log(`Test suite completed`);
  console.log(`Successful tests: ${results.filter(r => r.success).length}/${testPrompts.length}`);
  console.log(`AI-passed tests: ${passedTests}/${testPrompts.length} (Avg score: ${avgScore.toFixed(2)}/10)`);
  console.log(`Summary saved to: ${summaryFile}`);
  console.log(`---------------------------------------------`);
}


if (require.main === module) {
  
  runAllTests();
} else {
  module.exports = {
    runTest,
    runAllTests,
    cleanWorkspace,
    testPrompts,
    evaluateTestResult
  };
} 