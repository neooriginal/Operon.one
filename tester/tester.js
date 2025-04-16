const fs = require('fs');
const path = require('path');
const { promisify } = require('util');
const exec = promisify(require('child_process').exec);
const { v4: uuidv4 } = require('uuid');

// Import the central orchestrator function
const { centralOrchestrator } = require('../index');
// Import the AI module for evaluation
const { callAI } = require('../tools/AI/ai.js');

// Create reports directory if it doesn't exist
const REPORTS_DIR = path.join(__dirname, 'test_reports');
if (!fs.existsSync(REPORTS_DIR)) {
  fs.mkdirSync(REPORTS_DIR);
}

// Test prompts from basic to complex
const testPrompts = [

  "Create a comprehensive business plan for a small coffee shop including market analysis, financial projections, and marketing strategy",
  
  // ADDED: Advanced Web Search and Deep Research Tasks
  "Research and create a detailed report on the potential health impacts of microplastics in drinking water, including the latest scientific findings, regulatory standards worldwide, and mitigation technologies",
  "Find and analyze conflicting scientific papers on low-carb versus plant-based diets, summarize their methodologies, key findings, limitations, and synthesize a balanced perspective",
  "Research current advancements in nuclear fusion technology across public and private sectors, compile technical challenges, breakthrough timelines, and investment landscape into a comprehensive report",
  "Find detailed statistics on global renewable energy adoption rates by country, analyze policy frameworks driving success, and predict future trends based on historical data patterns",
  "Research and compile a comprehensive timeline of artificial general intelligence predictions by leading experts, analyze their accuracy over time, and synthesize current consensus views",
  
  // ADDED: Complex Python Programming Tasks
  "Create a Python program that scrapes real-time weather data from multiple sources, reconciles discrepancies, and visualizes 10-day forecasts with confidence intervals based on historical accuracy",
  "Develop a Python script that analyzes a large dataset of customer transactions, identifies seasonal patterns, spending anomalies, and generates personalized recommendations with visualizations",
  "Write a Python program that implements a genetic algorithm to optimize delivery routes for 50+ locations with time windows, vehicle constraints, and traffic patterns",
  "Create a Python application that processes natural language queries against a dataset, generates SQL queries dynamically, executes them, and presents results in an interactive visualization",
  "Develop a machine learning model in Python to predict housing prices using multiple data sources, handle missing data, optimize feature selection, and explain model predictions with SHAP values",
  
  // ADDED: Complex File System Tasks
  "Create a structured documentation system with cross-linked markdown files for a complex software project, including generated diagrams based on code analysis",
  "Develop a personal knowledge management system with tagged notes, automated cross-referencing, and a custom search function",
  "Create a financial tracking system using linked spreadsheets that automatically generates monthly reports, tax summaries, and investment performance analytics",
  "Build a content management system for a blog with templates, image handling, category organization, and automated social media post generation",
  "Design a project management file structure with automated task tracking, dependency visualization, and progress reporting based on file updates",
  
  // ADDED: Math Intensive Tasks
  "Solve an optimization problem for manufacturing resource allocation across 5 facilities with 20 product lines, considering labor constraints, material costs, and shipping logistics",
  "Calculate and visualize orbital mechanics for a theoretical multi-planetary mission, including launch windows, delta-v requirements, and gravity assists",
  "Perform statistical analysis on a dataset of medical trial results, including power analysis, multiple hypothesis testing corrections, and confidence interval calculations",
  "Develop a mathematical model of a complex ecosystem with 15+ interacting species, predict population dynamics under different climate scenarios, and identify stability thresholds",
  "Calculate optimal investment portfolio allocations using modern portfolio theory, Monte Carlo simulations, and historical performance data across multiple market conditions",
  
  // ADDED: Image Generation Tasks
  "Generate a series of visually consistent data visualizations for a scientific paper on climate change impacts, following publication standards and accessible color schemes",
  "Create an architectural visualization of a sustainable home design from multiple angles, showing both exterior features and interior layout",
  "Design a brand identity package including logo variations, color palette, typography examples, and mock applications on business materials",
  "Generate step-by-step instructional images for a complex surgical procedure, ensuring medical accuracy and clear visual communication",
  "Create concept art for a science fiction environment featuring advanced biotechnology integrated with natural elements",
  
  // ADDED: Bash and System Tasks
  "Write a bash script that monitors system performance, identifies resource bottlenecks, logs abnormal patterns, and sends alerts when thresholds are exceeded",
  "Create a backup solution using bash that encrypts sensitive files, implements incremental backups, verifies integrity, and manages retention policies",
  "Develop a CI/CD pipeline script that builds, tests, and deploys a multi-container application with environment-specific configurations and rollback capabilities",
  "Write a system maintenance script that identifies and cleans unnecessary files, optimizes databases, updates software, and verifies system integrity",
  "Create a network monitoring tool that maps connected devices, tracks bandwidth usage by application, identifies unusual traffic patterns, and generates detailed reports",
  
  // ADDED: Challenging Multi-Tool Integration Tasks
  "Create a complete real estate market analysis including web research on current trends, data scraping of listings, statistical analysis of price factors, predictive modeling of future values, and an interactive visualization dashboard",
  "Develop a comprehensive personal health optimization plan based on scientific research, including custom meal plans with nutritional analysis, exercise routines with progressive overload calculations, sleep optimization protocols, and tracking tools",
  "Build a complete business intelligence solution for a retail business, including data collection scripts, automated analysis, trend detection, inventory optimization models, and an executive summary with actionable recommendations",
  "Create an end-to-end project for analyzing climate change impacts on agriculture, including data collection from multiple sources, statistical analysis of crop yields, predictive modeling, visualization of regional impacts, and adaptation strategy recommendations",
  "Develop a comprehensive competitive analysis of the electric vehicle market, including web research, data extraction, feature comparison matrices, cost analysis spreadsheets, market trend visualization, and strategic recommendation documents",
  
  // ADDED: Edge Cases and System Stress Tests
  "Create a comprehensive analysis that requires deep research from conflicting sources, process 1000+ data points, generate 10 different types of visualizations, and compile everything into an interactive dashboard with real-time data",
  "Build a system that simultaneously monitors 20 different news sources, detects sentiment around a specific topic, correlates with stock market movements, identifies leading indicators, and generates automated trading signals",
  "Develop a natural language processing pipeline that can handle 5 different languages, detect subtle emotion cues, identify cultural references, translate context-aware idioms correctly, and summarize lengthy documents while preserving key nuances",
  "Create an automated content generation system that produces 50 unique articles on related topics without repetition, ensuring factual accuracy, proper citation, engaging style variation, and SEO optimization for each piece",
  "Design a multi-agent simulation with 100+ entities having unique attributes and behaviors, model complex interactions between them, visualize emerging patterns, and predict system evolution over 1000+ time steps",
  
  // ADDED: Deliberately Ambiguous or Contradictory Tasks
  "Create a data analysis report that simultaneously shows the data supports and contradicts a specific hypothesis, presenting both perspectives with equal validity",
  "Design a visual style that combines minimalism and maximalism, is both modern and vintage, corporate and creative, using a color palette that must include blue but cannot use colors in the blue spectrum",
  "Develop a marketing strategy that targets everyone while also focusing on highly specific demographics, with messaging that is both broad enough to appeal widely and specifically tailored to niche interests",
  "Write documentation that is both comprehensive enough for beginners to understand completely and concise enough for experts to reference quickly, without any section being too detailed or too simplified",
  "Create a project plan with fixed deliverables and timelines that must also remain entirely flexible and adaptable to changing requirements without modifying the original scope or schedule",
  
  // ADDED: Resource-Intensive Processing
  "Analyze the complete works of Shakespeare, generate statistical pattern analysis of language usage across different periods of his writing, identify evolving themes, create a network visualization of character relationships for all plays combined, and develop an interactive exploration tool",
  "Process and analyze the historical weather data for all major cities globally over the past century, identify climate change patterns specific to each region, correlate with local industrial development, and create predictive models for the next 50 years with uncertainty quantification",
  "Scrape and analyze all research papers published on quantum computing in the last decade, identify emerging research clusters, map citation networks, predict future breakthrough areas, and generate a state-of-the-art review with technical depth across all subfields",
  "Create a comprehensive database of all medications and their interactions, potential side effects, efficacy studies, develop a search algorithm for compatibility checking of complex drug combinations, and generate personalized risk assessments based on patient profiles",
  "Develop a system to analyze high-resolution satellite imagery across a decade for a large geographical region, detect and classify land use changes, correlate with economic and population data, and create a causal model of development patterns",
  
  // ADDED: Cross-Domain Integration Challenges
  "Create a project that integrates economic theory, climate science, public policy analysis, and technological forecasting to develop a comprehensive transition plan for a carbon-neutral economy, including policy recommendations, investment strategies, and adaptation frameworks",
  "Develop an interdisciplinary research proposal combining genomics, artificial intelligence, ethics, and social sciences to address personalized medicine challenges, including literature review across all fields, methodology design, and impact assessment",
  "Create an educational curriculum that integrates mathematics, history, literature, and art in a cohesive framework, with detailed lesson plans showing conceptual connections, assessment strategies that measure cross-domain understanding, and adaptive learning paths",
  "Design a smart city planning framework that integrates transportation systems, energy infrastructure, public health considerations, economic development, and environmental sustainability, with detailed modeling of system interactions and tradeoff analysis",
  "Develop a comprehensive analysis of how blockchain technology could transform financial systems, governance structures, supply chain management, and digital identity, including technical architecture, transition challenges, and regulatory considerations",
  
  // ADDED: Time-Sensitive Tasks with Multiple Updates
  "Create a real-time monitoring dashboard for a fictitious global crisis that updates with new developments every minute, requires analysis of changing conditions, recommendation adjustments, and communication updates as the situation evolves",
  "Develop a trading strategy that needs to be continuously backtested and optimized as new market data becomes available every few minutes, with performance analysis, risk assessment, and strategy adjustments",
  "Create a news aggregation and analysis system that monitors breaking stories, identifies misinformation in real-time, traces information origin and spread, and provides credibility assessment as narratives evolve",
  "Build a social media campaign management system that tracks engagement metrics across platforms, detects emerging trends or sentiment shifts, and automatically adapts content strategy to maximize impact as audience reactions change",
  "Develop a complex project management simulation with unexpected challenges introduced throughout execution, requiring resource reallocation, schedule adjustments, stakeholder communication, and contingency planning in real-time",
  
  // ADDED: Error Handling and Recovery Tests
  "Create a fault-tolerant data processing pipeline that can handle corrupted inputs, network interruptions, inconsistent data formats, and service failures while maintaining data integrity and providing detailed error reporting",
  "Develop a robust machine learning system that detects when it's operating outside its training parameters, provides confidence scores with all predictions, degrades gracefully when facing novel inputs, and explains its reasoning process for unexpected results",
  "Build a distributed system simulation that experiences cascading failures, requires root cause analysis, implements recovery strategies, manages partial functionality during outages, and automatically documents the entire incident response process",
  "Create a complex data validation framework that identifies and categorizes 20+ different types of data quality issues, suggests appropriate remediation steps for each, estimates impact on downstream analytics, and provides confidence scoring for processed outputs",
  "Develop an automated troubleshooting system for a complex software environment that diagnostically reasons through multiple potential failure causes, tests hypotheses systematically, documents elimination paths, and provides recovery recommendation prioritization",
  
  // ADDED: Reasoning Under Uncertainty Tests
  "Create a risk assessment framework for a complex project with limited historical data, multiple unknown variables, interdependent risk factors, and shifting external conditions that accurately quantifies uncertainty and provides decision support despite incomplete information",
  "Develop a medical diagnostic assistant that reasons through ambiguous symptoms, considers rare conditions appropriately, identifies when additional tests are needed, explains probabilistic reasoning, and updates assessments as new information becomes available",
  "Build a strategic planning tool for a scenario with deep future uncertainty, helping identify robust strategies across multiple possible futures, quantifying known/unknown factors, and developing contingency triggers for adaptive management",
  "Create an intelligence analysis framework that evaluates reliability of conflicting information sources, identifies potential disinformation, highlights critical intelligence gaps, and provides confidence-calibrated assessments with explicit uncertainty communication",
  "Develop an agricultural planning system that optimizes crop selection and management under climate uncertainty, accounting for weather variability, evolving pest pressures, market fluctuations, and provides risk-stratified recommendations with contingency options",
  
  // ADDED: Extreme Scenario Tests
  "Create a comprehensive global pandemic response plan considering novel pathogen characteristics, healthcare system capacity limitations, supply chain disruptions, economic impacts, and coordination challenges across international boundaries",
  "Develop a detailed disaster recovery plan for a major metropolitan area facing a catastrophic earthquake, addressing immediate emergency response, infrastructure restoration, population displacement management, and long-term rebuilding strategies",
  "Build a simulation of managing a mission-critical system failure in a life-or-death scenario with severely constrained resources, extreme time pressure, incomplete information, and cascading consequences for various response options",
  "Create a strategic response plan for a critical cybersecurity breach affecting multiple vital infrastructure systems simultaneously, including incident containment, vulnerability remediation, stakeholder communication, and system restoration prioritization",
  "Develop a comprehensive strategy for managing an organization through an extreme 'black swan' event that fundamentally disrupts all normal operations, threatens organizational survival, and requires rapid adaptation to a new operational reality"
];

// Function to evaluate a test result using AI
async function evaluateTestResult(prompt, testResult, logs, outputContents, testDuration, existingContext = null) {
  console.log('Evaluating test result with AI...');
  
  // Use existing context if provided, otherwise create a new one
  const evaluationContext = existingContext || {
    prompt,
    executionTimeMs: testDuration,
    // Increase log size limit significantly
    logs: logs.join('\n').substring(0, 10000), 
    outputFiles: Object.keys(outputContents),
    // Include more content from each file and provide file sizes
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
          feedback: evaluationText.substring(0, 1000),
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

// New function to validate the actual outputs after execution
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
  
  // Check each output file
  for (const [filename, content] of Object.entries(outputContents)) {
    try {
      // Check if the file exists on disk
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
      
      // Basic content validation
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
      
      // Check image URLs in content
      const imageUrlMatches = fileContent.match(/(https?:\/\/[^\s"'<>]+\.(jpg|jpeg|png|gif|webp|svg))/g);
      if (imageUrlMatches && imageUrlMatches.length > 0) {
        validationResults.imageUrlsFound += imageUrlMatches.length;
        // We don't actually verify URLs here to avoid excessive API calls
      }
      
      // File passed validation
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
  
  // Define evaluationContext at this scope so it's available throughout the function
  let evaluationContext = null;
  
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
      // Get all files recursively
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
      
      // Read contents of each output file
      for (const relativePath of outputFiles) {
        const filePath = path.join(outputDir, relativePath);
        try {
          const stats = fs.statSync(filePath);
          // Only read text files and limit size
          if (stats.size < 1000000 && !isLikelyBinaryFile(filePath)) {
            const content = fs.readFileSync(filePath, 'utf8');
            outputContents[relativePath] = content;
          } else {
            // Just provide metadata for large or binary files
            outputContents[relativePath] = `[File size: ${stats.size} bytes, Modified: ${stats.mtime}]`;
          }
        } catch (error) {
          outputContents[relativePath] = `Error reading file: ${error.message}`;
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
    
    // Add validation of artifacts
    const validationResults = await validateOutputArtifacts(outputDir, outputContents);
    console.log(`Validation results: ${validationResults.verifiedArtifacts}/${validationResults.totalArtifacts} artifacts verified`);
    
    // Create evaluationContext here for success case
    evaluationContext = {
      prompt,
      executionTimeMs: testDuration,
      // Increase log size limit significantly
      logs: logs.join('\n').substring(0, 10000), 
      outputFiles: Object.keys(outputContents),
      // Include more content from each file and provide file sizes
      outputSamples: Object.entries(outputContents)
        .map(([file, content]) => {
          const fullSize = content.length;
          const sample = content.substring(0, 2000);
          return `${file} (${fullSize} bytes): ${sample}${fullSize > 2000 ? '... (truncated)' : ''}`;
        })
        .join('\n\n'),
      success: true,
      error: null,
      validation: validationResults
    };
    
    // Evaluate the test result using AI
    const aiEvaluation = await evaluateTestResult(prompt, { success: true }, logs, outputContents, testDuration, evaluationContext);
    
    // Helper function to ensure arrays are stringified properly
    const safeStringify = (item) => {
      if (Array.isArray(item)) {
        return item.length > 0 ? item.join('\n') : '(empty array)';
      }
      return item;
    };
    
    // Write complete test report with AI evaluation
    fs.writeFileSync(
      logFile,
      `Test #${index+1} [${testId}]\n` +
      `Prompt: "${prompt}"\n` +
      `Start Time: ${testStart.toISOString()}\n` +
      `Duration: ${testDuration}ms\n\n` +
      `New Files Created:\n${safeStringify(newFiles)}\n\n` +
      `Output Files (${outputFiles.length}):\n${safeStringify(outputFiles)}\n\n` +
      `Output File Contents:\n` +
      Object.entries(outputContents)
        .map(([filename, content]) => {
          // Handle very large files
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
    let outputFiles = [];
    let outputContents = {};
    
    if (fs.existsSync(outputDir)) {
      // Get all files recursively
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
      
      // Read contents of each output file
      for (const relativePath of outputFiles) {
        const filePath = path.join(outputDir, relativePath);
        try {
          const stats = fs.statSync(filePath);
          // Only read text files and limit size
          if (stats.size < 1000000 && !isLikelyBinaryFile(filePath)) {
            const content = fs.readFileSync(filePath, 'utf8');
            outputContents[relativePath] = content;
          } else {
            // Just provide metadata for large or binary files
            outputContents[relativePath] = `[File size: ${stats.size} bytes, Modified: ${stats.mtime}]`;
          }
        } catch (err) {
          outputContents[relativePath] = `Error reading file: ${err.message}`;
        }
      }
    }
    
    // Create evaluationContext here for error case
    evaluationContext = {
      prompt,
      executionTimeMs: Date.now() - testStart,
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
    
    // Evaluate the failed test result using AI
    const aiEvaluation = await evaluateTestResult(prompt, { success: false, error: error.message }, logs, outputContents, Date.now() - testStart, evaluationContext);
    
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

// Helper function to determine if a file is likely binary
function isLikelyBinaryFile(filePath) {
  const binaryExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.ico', '.pdf', '.zip', '.exe', '.dll'];
  const ext = path.extname(filePath).toLowerCase();
  return binaryExtensions.includes(ext);
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