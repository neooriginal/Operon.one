const fs = require('fs');
const path = require('path');
const { promisify } = require('util');
const exec = promisify(require('child_process').exec);
const rimraf = require('rimraf');
const { v4: uuidv4 } = require('uuid');

// Import the central orchestrator function
const { centralOrchestrator } = require('./index');

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

// Function to clean the workspace
async function cleanWorkspace() {
  console.log('Cleaning workspace...');
  
  // Remove output directory contents
  const outputDir = path.join(__dirname, 'output');
  if (fs.existsSync(outputDir)) {
    await rimraf(outputDir + '/*');
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
    // Take note of files that exist before the test
    const beforeFiles = fs.readdirSync(__dirname);
    
    // Run the test
    const startTime = Date.now();
    await centralOrchestrator(prompt);
    const endTime = Date.now();
    const testDuration = endTime - startTime;
    
    // Take note of files created during the test
    const afterFiles = fs.readdirSync(__dirname);
    const newFiles = afterFiles.filter(file => !beforeFiles.includes(file));
    
    // Collect output files
    const outputDir = path.join(__dirname, 'output');
    let outputFiles = [];
    if (fs.existsSync(outputDir)) {
      outputFiles = fs.readdirSync(outputDir);
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
    
    // Write test report
    fs.writeFileSync(
      logFile,
      `Test #${index+1} [${testId}]\n` +
      `Prompt: "${prompt}"\n` +
      `Start Time: ${testStart.toISOString()}\n` +
      `Duration: ${testDuration}ms\n\n` +
      `New Files Created:\n${newFiles.join('\n')}\n\n` +
      `Output Files:\n${outputFiles.join('\n')}\n\n` +
      `Console Output:\n${logs.join('\n')}\n`
    );
    
    console.log = originalConsoleLog;
    console.log(`\nTest completed in ${testDuration}ms`);
    console.log(`Report saved to: ${logFile}`);
    
    return {
      success: true,
      duration: testDuration,
      reportPath: logFile
    };
  } catch (error) {
    console.log = originalConsoleLog;
    console.error(`Test failed: ${error.message}`);
    
    // Write error report
    fs.writeFileSync(
      logFile,
      `Test #${index+1} [${testId}]\n` +
      `Prompt: "${prompt}"\n` +
      `Start Time: ${testStart.toISOString()}\n` +
      `Error: ${error.message}\n\n` +
      `Stack Trace:\n${error.stack}\n\n` +
      `Console Output:\n${logs.join('\n')}\n`
    );
    
    console.log(`Error report saved to: ${logFile}`);
    
    return {
      success: false,
      error: error.message,
      reportPath: logFile
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
  
  // Write summary report
  fs.writeFileSync(
    summaryFile,
    JSON.stringify({
      totalTests: testPrompts.length,
      successfulTests: results.filter(r => r.success).length,
      failedTests: results.filter(r => !r.success).length,
      averageDuration: results.filter(r => r.success)
        .reduce((acc, r) => acc + r.duration, 0) / results.filter(r => r.success).length,
      tests: results
    }, null, 2)
  );
  
  console.log(`\n---------------------------------------------`);
  console.log(`Test suite completed`);
  console.log(`Successful tests: ${results.filter(r => r.success).length}/${testPrompts.length}`);
  console.log(`Summary saved to: ${summaryFile}`);
  console.log(`---------------------------------------------`);
}

// Run the tests
if (require.main === module) {
  // Update the package.json to add rimraf as a dependency if not already present
  const packageJsonPath = path.join(__dirname, 'package.json');
  const packageJson = require(packageJsonPath);
  
  if (!packageJson.dependencies.rimraf) {
    console.log('Installing rimraf dependency...');
    exec('npm install --save rimraf')
      .then(() => {
        console.log('rimraf installed successfully');
        runAllTests();
      })
      .catch(error => {
        console.error(`Error installing rimraf: ${error.message}`);
        console.log('Please run: npm install --save rimraf');
      });
  } else {
    runAllTests();
  }
} else {
  module.exports = {
    runTest,
    runAllTests,
    cleanWorkspace,
    testPrompts
  };
} 