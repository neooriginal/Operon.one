
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
        chatId: chatId,
        isTaskRunning: false,
        taskStartTime: null,
        lastTaskId: null
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
  resetContext(userId = 'default', chatId = 1) {
    const contextKey = `${userId}_${chatId}`;
    if (this.contexts.has(contextKey)) {
      this.contexts.delete(contextKey);
    }
    return this.initializeContext(userId, chatId);
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

  
  addStepOutput(stepParam, actionParam, outputParam, userId = 'default', chatId = 1) {
    let stepOutput;
    let actualUserId = userId;
    let actualChatId = chatId;
    
    
    if (typeof stepParam === 'object' && stepParam !== null) {
      // When called with object as first param: addStepOutput(stepObject, userId, chatId)
      // The second and third params are actually userId and chatId
      if (typeof actionParam === 'string') {
        actualUserId = actionParam;
      }
      if (typeof outputParam === 'number') {
        actualChatId = outputParam;
      }
      
      stepOutput = {
        step: stepParam.step,
        action: stepParam.action,
        output: stepParam.output,
        success: stepParam.success !== false, 
        error: stepParam.error || null
      };
    } else {
      // When called with individual params: addStepOutput(step, action, output, userId, chatId)
      stepOutput = { 
        step: stepParam, 
        action: actionParam, 
        output: outputParam,
        success: outputParam && outputParam.error === undefined,
        error: outputParam && outputParam.error ? outputParam.error : null
      };
    }
    
    const context = this.getContext(actualUserId, actualChatId);
    context.stepsOutput.push(stepOutput);
    return stepOutput;
  }

  getStepsOutput(userId = 'default', chatId = 1) {
    return this.getContext(userId, chatId).stepsOutput;
  }

  getFilteredStepsOutput(filter, userId = 'default', chatId = 1) {
    const context = this.getContext(userId, chatId);
    
    // Handle cases where filter is not a string
    if (!filter || filter === 'none' || typeof filter !== 'string') {
      return [];
    }
    
    const requestedTools = filter.split(',').map(tool => tool.trim());
    if (requestedTools.includes('all')) {
      return context.stepsOutput;
    }
    
    return context.stepsOutput.filter(output => 
      requestedTools.includes(output.action)
    );
  }

  
  setPlan(plan, userId = 'default', chatId = 1) {
    this.getContext(userId, chatId).plan = plan;
  }

  getPlan(userId = 'default', chatId = 1) {
    return this.getContext(userId, chatId).plan;
  }

  updatePlan(newPlan, userId = 'default', chatId = 1) {
    this.getContext(userId, chatId).plan = newPlan;
    return newPlan;
  }

  
  getCurrentStepIndex(userId = 'default', chatId = 1) {
    return this.getContext(userId, chatId).currentStepIndex;
  }

  incrementStepIndex(userId = 'default', chatId = 1) {
    const context = this.getContext(userId, chatId);
    context.currentStepIndex++;
    return context.currentStepIndex;
  }

  setCurrentStepIndex(index, userId = 'default', chatId = 1) {
    const context = this.getContext(userId, chatId);
    context.currentStepIndex = index;
    return context.currentStepIndex;
  }

  
  setQuestion(question, userId = 'default', chatId = 1) {
    this.getContext(userId, chatId).question = question;
    return question;
  }

  getQuestion(userId = 'default', chatId = 1) {
    return this.getContext(userId, chatId).question;
  }

  
  addToThoughtChain(thought, userId = 'default', chatId = 1) {
    const context = this.getContext(userId, chatId);
    context.thoughtChain.push(thought);
    return context.thoughtChain;
  }

  getThoughtChain(userId = 'default', chatId = 1) {
    return this.getContext(userId, chatId).thoughtChain;
  }

  updateThoughtChain(index, update, userId = 'default', chatId = 1) {
    const context = this.getContext(userId, chatId);
    if (index >= 0 && index < context.thoughtChain.length) {
      context.thoughtChain[index] = {...context.thoughtChain[index], ...update};
    }
    return context.thoughtChain;
  }

  
  setToolState(toolName, state, userId = 'default', chatId = 1) {
    const context = this.getContext(userId, chatId);
    context.toolStates.set(toolName, state);
    return state;
  }

  getToolState(toolName, userId = 'default', chatId = 1) {
    const context = this.getContext(userId, chatId);
    return context.toolStates.get(toolName);
  }

  
  setVariable(key, value, userId = 'default', chatId = 1) {
    const context = this.getContext(userId, chatId);
    context.variables.set(key, value);
    return value;
  }

  getVariable(key, userId = 'default', chatId = 1) {
    const context = this.getContext(userId, chatId);
    return context.variables.get(key);
  }

  getAllVariables(userId = 'default', chatId = 1) {
    const context = this.getContext(userId, chatId);
    return Object.fromEntries(context.variables);
  }

  
  getState(userId = 'default', chatId = 1) {
    const context = this.getContext(userId, chatId);
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

  
  getStartTime(userId = 'default', chatId = 1) {
    return this.getContext(userId, chatId).startTime;
  }
  
  setStartTime(time = Date.now(), userId = 'default', chatId = 1) {
    this.getContext(userId, chatId).startTime = time;
    return time;
  }
  
  getTaskDuration(userId = 'default', chatId = 1) {
    const startTime = this.getStartTime(userId, chatId);
    return Date.now() - startTime;
  }

  /**
   * Check if a task is currently running for a user
   * @param {string} userId - User identifier
   * @param {number} chatId - Chat identifier
   */
  isTaskRunning(userId = 'default', chatId = 1) {
    return this.getContext(userId, chatId).isTaskRunning;
  }

  /**
   * Set task running state
   * @param {boolean} running - Whether task is running
   * @param {string} userId - User identifier
   * @param {number} chatId - Chat identifier
   */
  setTaskRunning(running, userId = 'default', chatId = 1) {
    const context = this.getContext(userId, chatId);
    context.isTaskRunning = running;
    if (running) {
      context.taskStartTime = Date.now();
      context.lastTaskId = `${userId}_${chatId}_${Date.now()}`;
    } else {
      context.taskStartTime = null;
    }
    return context.isTaskRunning;
  }

  /**
   * Get the last task ID
   * @param {string} userId - User identifier
   * @param {number} chatId - Chat identifier
   */
  getLastTaskId(userId = 'default', chatId = 1) {
    return this.getContext(userId, chatId).lastTaskId;
  }

  /**
   * Set cancellation token for task cancellation support
   * @param {AbortController} abortController - AbortController instance for cancellation
   * @param {string} userId - User identifier (default: 'default')
   * @param {number} chatId - Chat identifier (default: 1)
   */
  setCancellationToken(abortController, userId = 'default', chatId = 1) {
    const context = this.getContext(userId, chatId);
    context.cancellationToken = abortController;
    return abortController;
  }

  /**
   * Get cancellation token for task cancellation
   * @param {string} userId - User identifier (default: 'default')
   * @param {number} chatId - Chat identifier (default: 1)
   */
  getCancellationToken(userId = 'default', chatId = 1) {
    const context = this.getContext(userId, chatId);
    return context.cancellationToken;
  }

  /**
   * Cancel current task
   * @param {string} userId - User identifier (default: 'default')
   * @param {number} chatId - Chat identifier (default: 1)
   */
  cancelTask(userId = 'default', chatId = 1) {
    const context = this.getContext(userId, chatId);
    if (context.cancellationToken && !context.cancellationToken.signal.aborted) {
      context.cancellationToken.abort('Task cancelled by user');
      context.taskCancelledAt = Date.now();
      context.taskCancelledBy = 'user';
      return true;
    }
    return false;
  }

  /**
   * Check if task is cancelled
   * @param {string} userId - User identifier (default: 'default')
   * @param {number} chatId - Chat identifier (default: 1)
   */
  isTaskCancelled(userId = 'default', chatId = 1) {
    const context = this.getContext(userId, chatId);
    return context.cancellationToken && context.cancellationToken.signal.aborted;
  }

  /**
   * Clear cancellation token
   * @param {string} userId - User identifier (default: 'default')
   * @param {number} chatId - Chat identifier (default: 1)
   */
  clearCancellationToken(userId = 'default', chatId = 1) {
    const context = this.getContext(userId, chatId);
    context.cancellationToken = null;
  }

  /**
   * Check if task was recently cancelled
   * @param {string} userId - User identifier (default: 'default')
   * @param {number} chatId - Chat identifier (default: 1)
   * @param {number} withinMinutes - Check within last N minutes (default: 10)
   */
  wasTaskRecentlyCancelled(userId = 'default', chatId = 1, withinMinutes = 10) {
    const context = this.getContext(userId, chatId);
    if (!context.taskCancelledAt) return false;
    
    const now = Date.now();
    const cancelledAt = context.taskCancelledAt;
    const timeLimit = withinMinutes * 60 * 1000; // Convert to milliseconds
    
    return (now - cancelledAt) <= timeLimit;
  }

  /**
   * Get cancellation info
   * @param {string} userId - User identifier (default: 'default')
   * @param {number} chatId - Chat identifier (default: 1)
   */
  getCancellationInfo(userId = 'default', chatId = 1) {
    const context = this.getContext(userId, chatId);
    return {
      cancelledAt: context.taskCancelledAt,
      cancelledBy: context.taskCancelledBy,
      wasCancelled: !!context.taskCancelledAt
    };
  }

  /**
   * Clear cancellation history
   * @param {string} userId - User identifier (default: 'default')
   * @param {number} chatId - Chat identifier (default: 1)
   */
  clearCancellationHistory(userId = 'default', chatId = 1) {
    const context = this.getContext(userId, chatId);
    context.taskCancelledAt = null;
    context.taskCancelledBy = null;
  }
}


const contextManager = new Context();
module.exports = contextManager; 