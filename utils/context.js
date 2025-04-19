/**
 * Context Manager - Unified state management for AI agent
 * Handles conversation history, step outputs, tool states, and more
 * Built for multi-user support
 */

const { chatFunctions } = require('../database');

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
        variables: new Map(),
        startTime: Date.now()
      });
      
      // Load chat history from database (asynchronously)
      this.loadHistoryFromDb(userId).catch(err => {
        console.error('Error loading history from database:', err.message);
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

  /**
   * Load chat history from database
   * @param {string} userId - User identifier
   */
  async loadHistoryFromDb(userId = 'default') {
    try {
      if (!userId || userId === 'default') return; // Skip for anonymous/default users
      
      const messages = await chatFunctions.getChatHistory(userId);
      const context = this.getContext(userId);
      
      // Transform DB format to context format
      context.history = messages.map(msg => ({
        role: msg.role,
        content: msg.content
      }));
      
      return context.history;
    } catch (error) {
      console.error('Error loading history from database:', error.message);
      return [];
    }
  }

  // History management
  async addToHistory(message, userId = 'default') {
    const context = this.getContext(userId);
    context.history.push(message);
    
    // Persist to database if it's a valid user
    if (userId && userId !== 'default') {
      try {
        await chatFunctions.addChatMessage(
          userId,
          message.role,
          message.content
        );
      } catch (error) {
        console.error('Error saving message to database:', error.message);
      }
    }
    
    return context.history;
  }

  getHistory(userId = 'default') {
    return this.getContext(userId).history;
  }

  async clearHistory(userId = 'default') {
    this.getContext(userId).history = [];
    
    // Clear history in database if it's a valid user
    if (userId && userId !== 'default') {
      try {
        await chatFunctions.clearChatHistory(userId);
      } catch (error) {
        console.error('Error clearing history in database:', error.message);
      }
    }
  }

  // Step output management
  addStepOutput(stepParam, actionParam, outputParam, userId = 'default') {
    const context = this.getContext(userId);
    let stepOutput;
    
    // Handle both old format (separate parameters) and new object format
    if (typeof stepParam === 'object' && stepParam !== null) {
      // New format: passed an object with all properties
      stepOutput = {
        step: stepParam.step,
        action: stepParam.action,
        output: stepParam.output,
        success: stepParam.success !== false, // Default to true if not specified
        error: stepParam.error || null
      };
    } else {
      // Old format: separate parameters
      stepOutput = { 
        step: stepParam, 
        action: actionParam, 
        output: outputParam,
        success: outputParam && outputParam.error === undefined,
        error: outputParam && outputParam.error ? outputParam.error : null
      };
    }
    
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
      variables: Object.fromEntries(context.variables),
      startTime: context.startTime
    };
  }

  // Time tracking
  getStartTime(userId = 'default') {
    return this.getContext(userId).startTime;
  }
  
  setStartTime(time = Date.now(), userId = 'default') {
    this.getContext(userId).startTime = time;
    return time;
  }
  
  getTaskDuration(userId = 'default') {
    const startTime = this.getStartTime(userId);
    return Date.now() - startTime;
  }
}

// Export a singleton instance
const contextManager = new Context();
module.exports = contextManager; 