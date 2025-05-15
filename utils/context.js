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
   * @param {number} chatId - Chat identifier (default: 1)
   */
  initializeContext(userId, chatId = 1) {
    const contextKey = `${userId}_${chatId}`;
    if (!this.contexts.has(contextKey)) {
      this.contexts.set(contextKey, {
        history: [],
        stepsOutput: [],
        plan: [],
        thoughtChain: [],
        currentStepIndex: 0,
        question: '',
        toolStates: new Map(),
        variables: new Map(),
        startTime: Date.now(),
        chatId: chatId
      });
      
      
      this.loadHistoryFromDb(userId, chatId).catch(err => {
        console.error('Error loading history from database:', err.message);
      });
    }
    return this.getContext(userId, chatId);
  }

  /**
   * Get context for user or initialize if doesn't exist
   * @param {string} userId - User identifier
   * @param {number} chatId - Chat identifier (default: 1)
   */
  getContext(userId, chatId = 1) {
    const contextKey = `${userId}_${chatId}`;
    if (!this.contexts.has(contextKey)) {
      return this.initializeContext(userId, chatId);
    }
    return this.contexts.get(contextKey);
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
   * @param {number} chatId - Chat identifier (default: 1)
   */
  async loadHistoryFromDb(userId = 'default', chatId = 1) {
    try {
      if (!userId || userId === 'default') return; 
      
      const messages = await chatFunctions.getChatHistory(userId, chatId);
      const context = this.getContext(userId, chatId);
      
      
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

  
  async addToHistory(message, userId = 'default', chatId = 1) {
    const context = this.getContext(userId, chatId);
    context.history.push(message);
    
    
    if (userId && userId !== 'default') {
      try {
        await chatFunctions.addChatMessage(
          userId,
          message.role,
          message.content,
          chatId
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

  /**
   * Get history for a specific chat
   * @param {string} userId - User identifier
   * @param {number} chatId - Chat identifier
   */
  getHistoryWithChatId(userId = 'default', chatId = 1) {
    return this.getContext(userId, chatId).history;
  }

  async clearHistory(userId = 'default', chatId = 1) {
    this.getContext(userId, chatId).history = [];
    
    
    if (userId && userId !== 'default') {
      try {
        await chatFunctions.clearChatHistory(userId, chatId);
      } catch (error) {
        console.error('Error clearing history in database:', error.message);
      }
    }
  }

  
  addStepOutput(stepParam, actionParam, outputParam, userId = 'default') {
    const context = this.getContext(userId);
    let stepOutput;
    
    
    if (typeof stepParam === 'object' && stepParam !== null) {
      
      stepOutput = {
        step: stepParam.step,
        action: stepParam.action,
        output: stepParam.output,
        success: stepParam.success !== false, 
        error: stepParam.error || null
      };
    } else {
      
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

  
  setQuestion(question, userId = 'default') {
    this.getContext(userId).question = question;
    return question;
  }

  getQuestion(userId = 'default') {
    return this.getContext(userId).question;
  }

  
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

  
  setToolState(toolName, state, userId = 'default') {
    const context = this.getContext(userId);
    context.toolStates.set(toolName, state);
    return state;
  }

  getToolState(toolName, userId = 'default') {
    const context = this.getContext(userId);
    return context.toolStates.get(toolName);
  }

  
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


const contextManager = new Context();
module.exports = contextManager; 