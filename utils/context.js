/**
 * Context Manager - Unified state management for AI agent
 * Handles conversation history, step outputs, tool states, and more
 * Built for multi-user support
 */

class Context {
  constructor(userId = 'default') {
    this.contexts = new Map();
    this.initializeContext(userId);
  }

  /**
   * Initialize a new context for a user
   * @param {string} userId - User identifier
   */
  initializeContext(userId) {
    if (!this.contexts.has(userId)) {
      this.contexts.set(userId, {
        history: [],
        stepsOutput: [],
        plan: [],
        thoughtChain: [],
        currentStepIndex: 0,
        question: '',
        toolStates: new Map(),
        variables: new Map()
      });
    }
    return this.getContext(userId);
  }

  /**
   * Get context for a specific user
   * @param {string} userId - User identifier 
   */
  getContext(userId = 'default') {
    if (!this.contexts.has(userId)) {
      return this.initializeContext(userId);
    }
    return this.contexts.get(userId);
  }

  /**
   * Update context for a specific user
   * @param {string} userId - User identifier
   * @param {Object} updatedContext - Updated context object
   */
  updateContext(userId = 'default', updatedContext) {
    this.contexts.set(userId, updatedContext);
    return updatedContext;
  }

  /**
   * Reset a user's context
   * @param {string} userId - User identifier
   */
  resetContext(userId = 'default') {
    return this.initializeContext(userId);
  }

  // History management
  addToHistory(message, userId = 'default') {
    const context = this.getContext(userId);
    context.history.push(message);
    return context.history;
  }

  getHistory(userId = 'default') {
    return this.getContext(userId).history;
  }

  clearHistory(userId = 'default') {
    this.getContext(userId).history = [];
  }

  // Step output management
  addStepOutput(step, action, output, userId = 'default') {
    const context = this.getContext(userId);
    const stepOutput = { step, action, output };
    context.stepsOutput.push(stepOutput);
    return stepOutput;
  }

  getStepsOutput(userId = 'default') {
    return this.getContext(userId).stepsOutput;
  }

  getFilteredStepsOutput(filter, userId = 'default') {
    const context = this.getContext(userId);
    if (!filter || filter === 'none') return [];
    
    const requestedTools = filter.split(',').map(tool => tool.trim());
    if (requestedTools.includes('all')) {
      return context.stepsOutput;
    }
    
    return context.stepsOutput.filter(output => 
      requestedTools.includes(output.action)
    );
  }

  // Plan management
  setPlan(plan, userId = 'default') {
    this.getContext(userId).plan = plan;
  }

  getPlan(userId = 'default') {
    return this.getContext(userId).plan;
  }

  updatePlan(newPlan, userId = 'default') {
    this.getContext(userId).plan = newPlan;
    return newPlan;
  }

  // Step index management
  getCurrentStepIndex(userId = 'default') {
    return this.getContext(userId).currentStepIndex;
  }

  incrementStepIndex(userId = 'default') {
    const context = this.getContext(userId);
    context.currentStepIndex++;
    return context.currentStepIndex;
  }

  setCurrentStepIndex(index, userId = 'default') {
    const context = this.getContext(userId);
    context.currentStepIndex = index;
    return context.currentStepIndex;
  }

  // Question management
  setQuestion(question, userId = 'default') {
    this.getContext(userId).question = question;
    return question;
  }

  getQuestion(userId = 'default') {
    return this.getContext(userId).question;
  }

  // Thought chain for ReAct
  addToThoughtChain(thought, userId = 'default') {
    const context = this.getContext(userId);
    context.thoughtChain.push(thought);
    return context.thoughtChain;
  }

  getThoughtChain(userId = 'default') {
    return this.getContext(userId).thoughtChain;
  }

  updateThoughtChain(index, update, userId = 'default') {
    const context = this.getContext(userId);
    if (index >= 0 && index < context.thoughtChain.length) {
      context.thoughtChain[index] = {...context.thoughtChain[index], ...update};
    }
    return context.thoughtChain;
  }

  // Tool state management
  setToolState(toolName, state, userId = 'default') {
    const context = this.getContext(userId);
    context.toolStates.set(toolName, state);
    return state;
  }

  getToolState(toolName, userId = 'default') {
    const context = this.getContext(userId);
    return context.toolStates.get(toolName);
  }

  // Variable storage - for passing data between steps
  setVariable(key, value, userId = 'default') {
    const context = this.getContext(userId);
    context.variables.set(key, value);
    return value;
  }

  getVariable(key, userId = 'default') {
    const context = this.getContext(userId);
    return context.variables.get(key);
  }

  getAllVariables(userId = 'default') {
    const context = this.getContext(userId);
    return Object.fromEntries(context.variables);
  }

  // Get complete state (useful for debugging)
  getState(userId = 'default') {
    const context = this.getContext(userId);
    return {
      history: context.history,
      stepsOutput: context.stepsOutput,
      plan: context.plan,
      currentStepIndex: context.currentStepIndex,
      question: context.question,
      thoughtChain: context.thoughtChain,
      toolStates: Object.fromEntries(context.toolStates),
      variables: Object.fromEntries(context.variables)
    };
  }
}

// Export a singleton instance
const contextManager = new Context();
module.exports = contextManager; 