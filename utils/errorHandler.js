/**
 * @fileoverview Error handling utilities for production environments
 * Simplifies complex error handling patterns found throughout the codebase
 */

const logger = require('./logger');

/**
 * Safely parse JSON string with fallback mechanism
 * @param {string|Object} input - String to parse or object to return as-is
 * @param {*} defaultValue - Default value to return if parsing fails
 * @returns {*} Parsed object or default value
 */
function safeJsonParse(input, defaultValue = null) {
  // If already an object, return as-is
  if (typeof input === 'object' && input !== null) {
    return input;
  }
  
  // If not a string, return default
  if (typeof input !== 'string' || !input) {
    return defaultValue;
  }
  
  try {
    return JSON.parse(input);
  } catch (error) {
    logger.debug('Failed to parse JSON, attempting cleanup', { 
      input: input.substring(0, 100) + '...', 
      error: error.message 
    });
    
    try {
      // Remove trailing commas
      const cleaned = input.replace(/,\s*([\]}])/g, '$1');
      return JSON.parse(cleaned);
    } catch (cleanupError) {
      logger.debug('JSON cleanup failed, returning safe fallback', { 
        error: cleanupError.message,
        defaultValue,
        inputType: typeof input
      });
      return defaultValue !== undefined ? defaultValue : null;
    }
  }
}

/**
 * Handle database errors consistently
 * @param {Error} error - The database error
 * @param {string} operation - The operation that failed
 * @param {Object} context - Additional context for debugging
 * @returns {Object} Standardized error response
 */
function handleDatabaseError(error, operation, context = {}) {
  const errorInfo = {
    operation,
    error: error.message,
    context
  };
  
  logger.error('Database operation failed', errorInfo);
  
  return {
    success: false,
    error: error.message,
    operation,
    timestamp: new Date().toISOString()
  };
}

/**
 * Validate required parameters for database operations
 * @param {Object} params - Parameters to validate
 * @param {Array} required - Array of required parameter names
 * @throws {Error} If required parameters are missing
 */
function validateParams(params, required) {
  const missing = required.filter(param => {
    const value = params[param];
    return value === undefined || value === null || value === '';
  });
  
  if (missing.length > 0) {
    throw new Error(`Missing required parameters: ${missing.join(', ')}`);
  }
}

/**
 * Retry a database operation with exponential backoff
 * @param {Function} operation - The operation to retry
 * @param {number} maxRetries - Maximum number of retries
 * @param {number} baseDelay - Base delay in milliseconds
 * @returns {Promise} Result of the operation
 */
async function retryOperation(operation, maxRetries = 3, baseDelay = 1000) {
  let lastError;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      
      if (attempt === maxRetries) {
        break;
      }
      
      const delay = baseDelay * Math.pow(2, attempt - 1);
      logger.debug('Operation failed, retrying', { 
        attempt, 
        maxRetries, 
        delay, 
        error: error.message 
      });
      
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  throw lastError;
}

/**
 * Create a standardized success response
 * @param {*} data - Response data
 * @param {string} message - Success message
 * @returns {Object} Standardized success response
 */
function createSuccessResponse(data, message = 'Operation completed successfully') {
  return {
    success: true,
    message,
    data,
    timestamp: new Date().toISOString()
  };
}

/**
 * Create a standardized error response
 * @param {string|Error} error - Error message or Error object
 * @param {string} operation - The operation that failed
 * @param {number} statusCode - HTTP status code
 * @returns {Object} Standardized error response
 */
function createErrorResponse(error, operation = 'unknown', statusCode = 500) {
  const errorMessage = error instanceof Error ? error.message : error;
  
  return {
    success: false,
    error: errorMessage,
    operation,
    statusCode,
    timestamp: new Date().toISOString()
  };
}

module.exports = {
  safeJsonParse,
  handleDatabaseError,
  validateParams,
  retryOperation,
  createSuccessResponse,
  createErrorResponse
}; 