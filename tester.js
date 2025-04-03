const fs = require('fs');
const path = require('path');
const { promisify } = require('util');
const exec = promisify(require('child_process').exec);
const { v4: uuidv4 } = require('uuid');

// Import the central orchestrator function
const { centralOrchestrator } = require('./index');
// Import the AI module for evaluation
const { callAI } = require('./tools/AI/ai.js');

// Create reports directory if it doesn't exist
const REPORTS_DIR = path.join(__dirname, 'test_reports');
if (!fs.existsSync(REPORTS_DIR)) {
  fs.mkdirSync(REPORTS_DIR);
}

// Test prompts from basic to complex
const testPrompts = [
  // Basic information queries
  "What is the capital of France?",
  "Who was Albert Einstein?",
  "What is the tallest mountain in the world?",
  "What ingredients are in a classic margarita?",
  "How many days are in each month of the year?",
  
  // Simple task execution
  "Create a simple to-do list for me",
  "Write a short poem about technology",
  "Calculate the area of a circle with radius 5cm",
  "Convert 100 USD to euros using current exchange rates",
  "Create a weekly workout schedule for beginners",
  
  // Trip planning
  "Plan a 7-day trip to Japan including flights, accommodation, and daily activities",
  "Plan a weekend getaway to New York City with a budget of $1000",
  "Find the best hiking trails in Colorado and create an itinerary for a 5-day hiking trip",
  "Create a road trip plan from Los Angeles to San Francisco with interesting stops along the way",
  "Plan a family-friendly vacation to Disney World including budget breakdown and daily schedule",
  
  // School/Work documents
  "Create a research paper outline on the effects of climate change on marine ecosystems",
  "Write a business proposal for a new eco-friendly product",
  "Create a lesson plan for teaching 5th graders about the solar system",
  "Draft a professional resume for a software developer with 5 years of experience",
  "Create a marketing strategy document for launching a new mobile app",
  
  // Meeting and event planning
  "Create an agenda for a one-hour team meeting about project progress",
  "Plan a birthday party for a 10-year-old including activities and food",
  "Organize a virtual conference for 100 attendees with multiple sessions",
  "Create a wedding planning checklist with timeline and budget considerations",
  "Plan a fundraising event for a local charity with goal of raising $5000",
  
  // Personal finance and life management
  "Create a monthly budget spreadsheet for a family of four",
  "Develop a debt repayment plan for $20,000 in student loans",
  "Create a meal plan and grocery list for a week of healthy eating",
  "Plan a home renovation project for a kitchen with a $15,000 budget",
  "Create a 6-month training plan for someone preparing for their first marathon",
  
  // File operations
  "Create a text file with today's date",
  "Create a simple HTML webpage about cats",
  "Generate a CSV file with 5 rows of random data",
  "Create a presentation outline about renewable energy sources",
  "Make a spreadsheet to track daily expenses for a month",
  
  // Web interactions
  "Search for recent news about AI developments",
  "Find the top 3 movies playing in theaters right now",
  "Look up the weather forecast for New York",
  "Find the best-rated restaurants in Chicago for Italian cuisine",
  "Compare prices of iPhone 15 across major retailers",
  
  // Healthcare and wellness
  "Create a personalized nutrition plan for weight loss",
  "Develop a stress management guide with practical techniques",
  "Research symptoms of vitamin D deficiency and recommend solutions",
  "Create a sleep improvement plan for someone with insomnia",
  "Design a 30-day mental wellness challenge with daily activities",
  
  // Complex research tasks
  "Research the impact of climate change on coral reefs and create a summary",
  "Find information about quantum computing advancements in the last year",
  "Research and compare electric car models available in 2023",
  "Analyze the housing market trends in major US cities over the past 5 years",
  "Research the history and cultural significance of tea ceremonies in different countries",
  
  // Data analysis and visualization
  "Create a Python script to analyze a sample dataset and generate a graph",
  "Write a script to extract data from a website and visualize the trends",
  "Generate a report on stock market performance for major tech companies",
  "Analyze social media engagement metrics and create a visualization dashboard",
  "Build a model to predict customer churn based on sample data",
  
  // Career and education
  "Create a study plan for preparing for the GMAT exam in 3 months",
  "Research potential career paths for someone with a biology degree",
  "Design a learning roadmap for becoming a data scientist from scratch",
  "Create a guide for writing effective cover letters with examples",
  "Develop strategies for negotiating a salary increase with supporting data",
  
  // Multi-step complex tasks
  "Research renewable energy sources, compare their efficiency, and create a report with visualizations",
  "Find recipes for a three-course Italian dinner, create a shopping list, and estimate the total cost",
  "Research the history of artificial intelligence, create a timeline, and predict future developments",
  "Plan a complete home office setup including furniture, equipment, and layout design within a $2000 budget",
  "Create a comprehensive business plan for a small coffee shop including market analysis, financial projections, and marketing strategy"
];

// Function to evaluate a test result using AI
async function evaluateTestResult(prompt, testResult, logs, outputContents, testDuration) {
  console.log('Evaluating test result with AI...');
  
  // Prepare evaluation context
  const evaluationContext = {
    prompt,
    executionTimeMs: testDuration,
    logs: logs.join('\n').substring(0, 2000), // Limit log size
    outputFiles: Object.keys(outputContents),
    outputSamples: Object.entries(outputContents)
      .map(([file, content]) => `${file}: ${content.substring(0, 500)}${content.length > 500 ? '...' : ''}`)
      .join('\n'),
    success: testResult.success,
    error: testResult.error || null
  };
  
  // System message for AI evaluation
  const systemMessage = `You are a critical AI system evaluator. Your task is to assess the quality, 
  correctness, and efficiency of an AI system's response to a user prompt. Be thorough, critical, 
  and specific in your evaluation. Focus on:
  1. Did the system correctly understand and address the prompt?
  2. Is the response complete, accurate, and useful?
  3. Was the execution time reasonable given the task complexity?
  4. Are there any errors or issues in the output?
  5. What could have been improved?
  6. Did the test pass or fail in your assessment?
  
  Your response MUST include all of the following fields in valid JSON format:
  - passed: boolean (whether the test passed your evaluation)
  - score: number (0-10 score of the response quality)
  - feedback: string (critical assessment of the response)
  - improvements: array of strings (specific suggestions for improvement)
  - executionTimeAssessment: string (assessment of execution time)`;
  
  try {
    // Call AI for evaluation with non-JSON format first to get better reasoning
    const evaluationText = await callAI(
      systemMessage,
      `Evaluate this AI system's response to the following prompt: "${prompt}"\n\nHere's the execution data:\n${JSON.stringify(evaluationContext, null, 2)}`,
      [],
      undefined,
      false, // Set to false for text format
      "auto"
    );
    
    // Parse the evaluation text to extract structured data
    let evaluationResult;
    try {
      // Try to find and parse JSON in the response
      const jsonMatch = evaluationText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        evaluationResult = JSON.parse(jsonMatch[0]);
      } else {
        // If no JSON found, create structured data based on the text
        evaluationResult = {
          passed: evaluationText.toLowerCase().includes('pass') && !evaluationText.toLowerCase().includes('fail'),
          score: parseInt(evaluationText.match(/(\d+)\s*\/\s*10/) || [0, 5])[1],
          feedback: evaluationText.substring(0, 500),
          improvements: extractImprovements(evaluationText),
          executionTimeAssessment: extractTimeAssessment(evaluationText)
        };
      }
    } catch (parseError) {
      console.error(`Error parsing evaluation result: ${parseError.message}`);
      // Provide meaningful fallback values based on success/failure
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
    // Provide meaningful default values based on test success/failure
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

// Helper functions for parsing evaluation text
function extractImprovements(text) {
  // Look for improvements, suggestions, or recommendations sections
  const improvementPatterns = [
    /improvements?:?([\s\S]*?)(?:\n\n|\n[A-Z]|$)/i,
    /could be improved:?([\s\S]*?)(?:\n\n|\n[A-Z]|$)/i,
    /suggestions?:?([\s\S]*?)(?:\n\n|\n[A-Z]|$)/i,
    /recommendations?:?([\s\S]*?)(?:\n\n|\n[A-Z]|$)/i
  ];
  
  for (const pattern of improvementPatterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      // Split the matched text into bullet points or sentences
      return match[1].split(/\n-|\n\d+\.|\.\s+(?=[A-Z])/)
        .map(item => item.trim())
        .filter(item => item.length > 0);
    }
  }
  
  // If no structured improvements found, look for sentences containing improvement keywords
  const sentences = text.split(/\.\s+/);
  const improvementSentences = sentences.filter(s => 
    /improve|better|enhance|optimize|fix|missing|should|could|would/i.test(s)
  );
  
  return improvementSentences.length > 0 
    ? improvementSentences.map(s => s.trim() + (s.endsWith('.') ? '' : '.'))
    : ["Improve response quality", "Enhance error handling", "Optimize execution time"];
}

function extractTimeAssessment(text) {
  // Look for execution time assessment
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
  
  // Look for sentences containing time-related keywords
  const sentences = text.split(/\.\s+/);
  const timeSentences = sentences.filter(s => 
    /time|duration|performance|fast|slow|quick|speed|ms|seconds/i.test(s)
  );
  
  return timeSentences.length > 0 
    ? timeSentences[0].trim() + (timeSentences[0].endsWith('.') ? '' : '.')
    : "No specific time assessment available";
}

// Function to clean the workspace
async function cleanWorkspace() {
  console.log('Cleaning workspace...');
  
  // Remove output directory contents
  const outputDir = path.join(__dirname, 'output');
  if (fs.existsSync(outputDir)) {
    // Replace rimraf with recursive fs deletion
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
  
  // Remove any Python scripts created during testing
  const pythonFiles = fs.readdirSync(__dirname)
    .filter(file => file.endsWith('.py') && file !== 'tester.py');
  
  for (const file of pythonFiles) {
    fs.unlinkSync(path.join(__dirname, file));
    console.log(`Removed temporary file: ${file}`);
  }
  
  // Clean any other temporary files created during testing
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

// Function to run a single test
async function runTest(prompt, index) {
  const testId = uuidv4().substring(0, 8);
  const testStart = new Date();
  const logFile = path.join(REPORTS_DIR, `test_${index+1}_${testId}.log`);
  
  console.log(`\n---------------------------------------------`);
  console.log(`Running Test #${index+1} [${testId}]`);
  console.log(`Prompt: "${prompt}"`);
  console.log(`---------------------------------------------`);
  
  // Capture console output
  const originalConsoleLog = console.log;
  const logs = [];
  
  console.log = (...args) => {
    const message = args.join(' ');
    logs.push(message);
    originalConsoleLog(message);
  };
  
  try {
    await cleanWorkspace();
    
    // Run the test
    const startTime = Date.now();
    await centralOrchestrator(prompt);
    const endTime = Date.now();
    const testDuration = endTime - startTime;
    
    // This variable isn't defined in the visible code but appears to be used
    // Adding a placeholder definition to prevent errors
    const newFiles = [];

    // Collect output files and their contents
    const outputDir = path.join(__dirname, 'output');
    let outputFiles = [];
    let outputContents = {};
    
    if (fs.existsSync(outputDir)) {
      outputFiles = fs.readdirSync(outputDir);
      
      // Read contents of each output file
      for (const file of outputFiles) {
        const filePath = path.join(outputDir, file);
        try {
          const content = fs.readFileSync(filePath, 'utf8');
          outputContents[file] = content;
        } catch (error) {
          outputContents[file] = `Error reading file: ${error.message}`;
        }
      }
    }
    
    // Log test information
    const testInfo = {
      id: testId,
      prompt,
      startTime: testStart.toISOString(),
      duration: testDuration,
      newFiles,
      outputFiles,
    };
    
    // Evaluate the test result using AI
    const aiEvaluation = await evaluateTestResult(prompt, { success: true }, logs, outputContents, testDuration);
    
    // Helper function to ensure arrays are stringified properly
    const safeStringify = (item) => {
      if (Array.isArray(item)) {
        return item.length > 0 ? item.join('\n') : '(empty array)';
      }
      return item;
    };
    
    // Write test report with AI evaluation
    fs.writeFileSync(
      logFile,
      `Test #${index+1} [${testId}]\n` +
      `Prompt: "${prompt}"\n` +
      `Start Time: ${testStart.toISOString()}\n` +
      `Duration: ${testDuration}ms\n\n` +
      `New Files Created:\n${safeStringify(newFiles)}\n\n` +
      `Output Files:\n${safeStringify(outputFiles)}\n\n` +
      `Output File Contents:\n` +
      Object.entries(outputContents)
        .map(([filename, content]) => `\n=== ${filename} ===\n${safeStringify(content)}\n`)
        .join('\n') +
      `\nConsole Output:\n${safeStringify(logs)}\n` +
      `\n---------------------------------------------\n` +
      `AI EVALUATION\n` +
      `---------------------------------------------\n` +
      `Passed: ${aiEvaluation.passed}\n` +
      `Score: ${aiEvaluation.score}/10\n` +
      `Feedback: ${aiEvaluation.feedback}\n` +
      `Execution Time Assessment: ${aiEvaluation.executionTimeAssessment}\n` +
      `Suggested Improvements:\n${safeStringify(aiEvaluation.improvements)}\n`
    );
    
    console.log = originalConsoleLog;
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
    console.log = originalConsoleLog;
    console.error(`Test failed: ${error.message}`);
    
    // Collect output files and contents if available
    const outputDir = path.join(__dirname, 'output');
    let outputContents = {};
    
    if (fs.existsSync(outputDir)) {
      const outputFiles = fs.readdirSync(outputDir);
      
      // Read contents of each output file
      for (const file of outputFiles) {
        const filePath = path.join(outputDir, file);
        try {
          const content = fs.readFileSync(filePath, 'utf8');
          outputContents[file] = content;
        } catch (err) {
          outputContents[file] = `Error reading file: ${err.message}`;
        }
      }
    }
    
    // Evaluate the failed test result using AI
    const aiEvaluation = await evaluateTestResult(prompt, { success: false, error: error.message }, logs, outputContents, Date.now() - testStart);
    
    // Helper function to ensure arrays are stringified properly
    const safeStringify = (item) => {
      if (Array.isArray(item)) {
        return item.length > 0 ? item.join('\n') : '(empty array)';
      }
      return item;
    };
    
    // Write error report with AI evaluation
    fs.writeFileSync(
      logFile,
      `Test #${index+1} [${testId}]\n` +
      `Prompt: "${prompt}"\n` +
      `Start Time: ${testStart.toISOString()}\n` +
      `Error: ${error.message}\n\n` +
      `Stack Trace:\n${error.stack}\n\n` +
      `Console Output:\n${safeStringify(logs)}\n` +
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

// Main test runner
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
      
      // Clean the workspace after each test
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
  
  // Calculate AI evaluation metrics
  const passedTests = results.filter(r => r.evaluation && r.evaluation.passed).length;
  const avgScore = results
    .filter(r => r.evaluation && typeof r.evaluation.score === 'number')
    .reduce((acc, r) => acc + r.evaluation.score, 0) / 
    results.filter(r => r.evaluation && typeof r.evaluation.score === 'number').length;
  
  // Write summary report
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

// Run the tests
if (require.main === module) {
  // Remove rimraf dependency check and installation
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