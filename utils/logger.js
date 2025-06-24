/**
 * @fileoverview Structured logging utility for production environments
 * Replaces console.log/console.error with proper logging levels and formatting
 */

const fs = require('fs');
const path = require('path');

class Logger {
  constructor() {
    this.logLevel = this._getLogLevel();
    this.logToFile = process.env.LOG_TO_FILE === 'true';
    this.logDir = process.env.LOG_DIR || 'logs';
    this.maxFileSize = parseInt(process.env.LOG_MAX_FILE_SIZE) || 10 * 1024 * 1024; // 10MB
    this.maxFiles = parseInt(process.env.LOG_MAX_FILES) || 5;
    
    this._ensureLogDirectory();
  }

  _getLogLevel() {
    const level = process.env.LOG_LEVEL || 'info';
    const levels = ['debug', 'info', 'warn', 'error'];
    return levels.includes(level) ? level : 'info';
  }

  _ensureLogDirectory() {
    if (this.logToFile && !fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }
  }

  _shouldLog(level) {
    const levels = { debug: 0, info: 1, warn: 2, error: 3 };
    return levels[level] >= levels[this.logLevel];
  }

  _formatMessage(level, message, metadata = {}) {
    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      level: level.toUpperCase(),
      message,
      ...metadata
    };

    if (process.env.NODE_ENV === 'production') {
      return JSON.stringify(logEntry);
    } else {
      return `[${timestamp}] ${level.toUpperCase()}: ${message}${
        Object.keys(metadata).length > 0 ? ` | ${JSON.stringify(metadata)}` : ''
      }`;
    }
  }

  _writeToFile(formattedMessage) {
    if (!this.logToFile) return;

    const logFile = path.join(this.logDir, `app-${new Date().toISOString().split('T')[0]}.log`);
    
    try {
      // Check file size and rotate if needed
      if (fs.existsSync(logFile)) {
        const stats = fs.statSync(logFile);
        if (stats.size > this.maxFileSize) {
          this._rotateLogFile(logFile);
        }
      }
      
      fs.appendFileSync(logFile, formattedMessage + '\n');
    } catch (error) {
      // Fallback to console if file writing fails
      console.error('Failed to write to log file:', error.message);
    }
  }

  _rotateLogFile(currentFile) {
    try {
      const base = currentFile.replace('.log', '');
      
      // Remove oldest log file if max files reached
      const oldestFile = `${base}-${this.maxFiles}.log`;
      if (fs.existsSync(oldestFile)) {
        fs.unlinkSync(oldestFile);
      }
      
      // Rotate existing files
      for (let i = this.maxFiles - 1; i >= 1; i--) {
        const oldFile = i === 1 ? currentFile : `${base}-${i}.log`;
        const newFile = `${base}-${i + 1}.log`;
        
        if (fs.existsSync(oldFile)) {
          fs.renameSync(oldFile, newFile);
        }
      }
    } catch (error) {
      console.error('Failed to rotate log file:', error.message);
    }
  }

  _log(level, message, metadata = {}) {
    if (!this._shouldLog(level)) return;

    const formattedMessage = this._formatMessage(level, message, metadata);
    
    // Write to console
    if (level === 'error') {
      console.error(formattedMessage);
    } else if (level === 'warn') {
      console.warn(formattedMessage);
    } else {
      console.log(formattedMessage);
    }
    
    // Write to file if enabled
    this._writeToFile(formattedMessage);
  }

  debug(message, metadata = {}) {
    this._log('debug', message, metadata);
  }

  info(message, metadata = {}) {
    this._log('info', message, metadata);
  }

  warn(message, metadata = {}) {
    this._log('warn', message, metadata);
  }

  error(message, metadata = {}) {
    this._log('error', message, metadata);
  }

  // Specialized logging methods for common use cases
  database(message, metadata = {}) {
    this.debug(`[DATABASE] ${message}`, metadata);
  }

  auth(message, metadata = {}) {
    this.info(`[AUTH] ${message}`, metadata);
  }

  tool(toolName, message, metadata = {}) {
    this.debug(`[TOOL:${toolName.toUpperCase()}] ${message}`, metadata);
  }

  task(userId, chatId, message, metadata = {}) {
    this.info(`[TASK] ${message}`, { userId, chatId, ...metadata });
  }

  security(message, metadata = {}) {
    this.warn(`[SECURITY] ${message}`, metadata);
  }
}

// Export singleton instance
const logger = new Logger();
module.exports = logger; 