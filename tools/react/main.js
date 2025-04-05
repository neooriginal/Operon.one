const ai = require('../AI/ai');
const contextManager = require('../../utils/context');

/**
 * ReAct module - implements the Reasoning + Acting pattern
 * 
 * This enables a cycle of:
 * 1. Reasoning - Think about the current state and what to do
 * 2. Acting - Execute actions
 * 3. Observing - Process the results
 * 4. Repeat
 */

/**
 * Process a step using the ReAct pattern before execution
 * @param {Object} step - The step to process
 * @param {String} userId - User identifier for multi-user support
 * @returns {Object} Enhanced step with reasoning
 */
async function processStep(step, userId = 'default') {
  const context = contextManager.getContext(userId);
  const stepsOutput = context.stepsOutput;
  const plan = context.plan;
  const currentStepIndex = context.currentStepIndex;
  const question = context.question;
  
  // Create a reasoning prompt that asks the AI to think about this step
  const prompt = `
You are an autonomous AI agent using the ReAct (Reasoning + Acting) framework.

TASK: ${question}

CURRENT STATE:
- You are at step ${currentStepIndex + 1} of ${plan.length}
- The next step to execute is: ${step.step} using ${step.action}

PREVIOUS RESULTS:
${stepsOutput.map(output => 
  `- ${output.step}: ${typeof output.output === 'object' ? 
    JSON.stringify(output.output).substring(0, 200) + '...' : 
    String(output.output || '').substring(0, 200) + '...'}`
).join('\n')}

I want you to REASON about this step before executing it:
1. What information do you already have that's relevant?
2. What is the purpose of this specific step?
3. How should you approach this step to get the best results?
4. What potential issues might arise and how would you handle them?

Return your reasoning in this JSON format:
{
  "reasoning": "Your step-by-step thought process",
  "approach": "How you will execute this step",
  "expectedOutcome": "What you expect to achieve",
  "fallbackPlan": "What to do if something goes wrong",
  "enhancedPrompt": "An improved prompt for this step that includes your reasoning"
}
`;

  // Get the AI reasoning
  const reasoning = await ai.callAI(prompt, "", []);
  
  // Store in thought chain using context manager
  contextManager.addToThoughtChain({
    step: currentStepIndex + 1,
    reasoning: reasoning
  }, userId);
  
  // Enhance the step with reasoning
  const enhancedStep = {
    ...step,
    reasoning: reasoning,
    originalPrompt: step.step,
    step: reasoning.enhancedPrompt || step.step
  };
  
  return enhancedStep;
}

/**
 * Reflect on the results of a step after execution
 * @param {Object} step - The executed step
 * @param {Object} result - The step result
 * @param {String} userId - User identifier for multi-user support
 * @returns {Object} Reflection with potential plan adjustments
 */
async function reflectOnResult(step, result, userId = 'default') {
  const context = contextManager.getContext(userId);
  const stepsOutput = context.stepsOutput;
  const plan = context.plan;
  const currentStepIndex = context.currentStepIndex;
  const question = context.question;
  const thoughtChain = context.thoughtChain;
  
  // Create a reflection prompt
  const prompt = `
You are an autonomous AI agent using the ReAct (Reasoning + Acting) framework.

TASK: ${question}

STEP JUST EXECUTED:
- Step ${currentStepIndex} of ${plan.length}: ${step.step} using ${step.action}

RESULT OBTAINED:
${typeof result === 'object' ? 
  JSON.stringify(result).substring(0, 500) : 
  String(result || '').substring(0, 500)}

PREVIOUS REASONING:
${thoughtChain[thoughtChain.length - 1]?.reasoning?.reasoning || 'No previous reasoning'}

I want you to REFLECT on this result:
1. Was the outcome what you expected? Why or why not?
2. What did you learn from this step?
3. Does this result change your understanding of the task?
4. Should the plan be adjusted based on this result?

Return your reflection in this JSON format:
{
  "reflection": "Your detailed thoughts on the result",
  "successful": true/false,
  "learnings": "Key insights from this step",
  "changePlan": true/false,
  "explanation": "Why the plan should/shouldn't change",
  "nextSteps": "Recommendations for moving forward"
}
`;

  // Get the AI reflection
  const reflection = await ai.callAI(prompt, "", []);
  
  // Store in thought chain using context manager
  const lastThoughtIndex = thoughtChain.length - 1;
  contextManager.updateThoughtChain(lastThoughtIndex, { reflection }, userId);
  
  return reflection;
}

/**
 * Save the thought chain to a file using the filesystem tool
 * @param {Object} fileSystem - The filesystem tool
 * @param {String} userId - User identifier for multi-user support
 */
async function saveThoughtChain(fileSystem, userId = 'default') {
  try {
    const thoughtChain = contextManager.getThoughtChain(userId);
    const thoughtChainJSON = JSON.stringify(thoughtChain, null, 2);
    
    // Use the runTask method of fileSystem
    await fileSystem.runTask(
      `Save the ReAct thought chain to output/thought_chain_${userId}.json. Expected output: output/thought_chain_${userId}.json`,
      thoughtChainJSON
    );
    
    return { success: true };
  } catch (error) {
    console.error("Error saving thought chain:", error);
    return { success: false, error: error.message };
  }
}

module.exports = {
  processStep,
  reflectOnResult,
  saveThoughtChain
}; 