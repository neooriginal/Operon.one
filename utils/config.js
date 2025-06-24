/**
 * @fileoverview Centralized configuration management
 * Replaces hardcoded values with environment-based configuration
 */

require('dotenv').config();

class Config {
  constructor() {
    this._validateRequired();
  }

  _validateRequired() {
    const required = ['JWT_SECRET'];
    const missing = required.filter(key => !process.env[key]);
    
    if (missing.length > 0 && process.env.NODE_ENV === 'production') {
      throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
    } else if (missing.length > 0) {
      console.warn(`Warning: Missing environment variables: ${missing.join(', ')}. Using defaults for development.`);
    }
  }

  // Server Configuration
  get server() {
    return {
      port: parseInt(process.env.PORT) || 3000,
      host: process.env.HOST || 'localhost',
      environment: process.env.NODE_ENV || 'development'
    };
  }

  // Database Configuration
  get database() {
    return {
      path: process.env.DATABASE_PATH || 'data/database.db',
      maxRetries: parseInt(process.env.DB_MAX_RETRIES) || 3,
      retryDelay: parseInt(process.env.DB_RETRY_DELAY) || 1000
    };
  }

  // Authentication Configuration
  get auth() {
    return {
      jwtSecret: process.env.JWT_SECRET || 'dev-secret-change-in-production',
      jwtExpiration: process.env.JWT_EXPIRATION || '24h',
      bcryptRounds: parseInt(process.env.BCRYPT_ROUNDS) || 12
    };
  }

  // CORS Configuration
  get cors() {
    const defaultOrigins = this.server.environment === 'production' 
      ? [] 
      : ['http://localhost:3000', 'http://localhost:3001', 'http://127.0.0.1:3000', 'http://127.0.0.1:3001'];
    
    return {
      origins: this._parseArray(process.env.CORS_ORIGINS) || defaultOrigins,
      methods: this._parseArray(process.env.CORS_METHODS) || ['GET', 'POST'],
      credentials: process.env.CORS_CREDENTIALS === 'true'
    };
  }

  // Docker Configuration
  get docker() {
    return {
      baseImage: process.env.DOCKER_BASE_IMAGE || 'python:3.9-slim',
      containerPrefix: process.env.DOCKER_CONTAINER_PREFIX || 'operon-task-',
      maxRetries: parseInt(process.env.DOCKER_MAX_RETRIES) || 3,
      timeout: parseInt(process.env.DOCKER_TIMEOUT) || 300000, // 5 minutes
      useWSL: process.env.DOCKER_USE_WSL === 'true' || process.platform === 'win32'
    };
  }

  // AI Configuration
  get ai() {
    return {
      openRouterApiKey: process.env.OPENROUTER_API_KEY,
      defaultModel: process.env.AI_DEFAULT_MODEL || 'anthropic/claude-3-sonnet',
      planningModel: process.env.AI_PLANNING_MODEL || 'anthropic/claude-3-haiku',
      maxTokens: parseInt(process.env.AI_MAX_TOKENS) || 4000,
      temperature: parseFloat(process.env.AI_TEMPERATURE) || 0.7,
      maxRetries: parseInt(process.env.AI_MAX_RETRIES) || 3
    };
  }

  // Task Configuration
  get tasks() {
    return {
      screenshotInterval: parseInt(process.env.SCREENSHOT_INTERVAL) || 5000,
      maxHistoryLength: parseInt(process.env.MAX_HISTORY_LENGTH) || 50,
      defaultTimeout: parseInt(process.env.TASK_DEFAULT_TIMEOUT) || 60000,
      maxConcurrentTasks: parseInt(process.env.MAX_CONCURRENT_TASKS) || 5
    };
  }

  // Email Configuration
  get email() {
    return {
      smtpHost: process.env.SMTP_HOST,
      smtpPort: parseInt(process.env.SMTP_PORT) || 587,
      smtpSecure: process.env.SMTP_SECURE === 'true',
      smtpUser: process.env.SMTP_USER,
      smtpPassword: process.env.SMTP_PASSWORD,
      fromAddress: process.env.EMAIL_FROM || 'noreply@operonone.com',
      fromName: process.env.EMAIL_FROM_NAME || 'OperonOne'
    };
  }

  // File Upload Configuration
  get uploads() {
    return {
      maxFileSize: parseInt(process.env.UPLOAD_MAX_FILE_SIZE) || 10 * 1024 * 1024, // 10MB
      allowedTypes: this._parseArray(process.env.UPLOAD_ALLOWED_TYPES) || [
        'image/jpeg', 'image/png', 'image/gif', 'text/plain', 'application/json'
      ],
      uploadDir: process.env.UPLOAD_DIR || 'uploads',
      tempDir: process.env.TEMP_DIR || 'uploads/temp'
    };
  }

  // Rate Limiting Configuration
  get rateLimit() {
    return {
      windowMs: parseInt(process.env.RATE_LIMIT_WINDOW) || 15 * 60 * 1000, // 15 minutes
      maxRequests: parseInt(process.env.RATE_LIMIT_MAX) || 100,
      skipSuccessfulRequests: process.env.RATE_LIMIT_SKIP_SUCCESS === 'true'
    };
  }

  // Security Configuration
  get security() {
    return {
      maxLoginAttempts: parseInt(process.env.MAX_LOGIN_ATTEMPTS) || 5,
      lockoutDuration: parseInt(process.env.LOCKOUT_DURATION) || 15 * 60 * 1000, // 15 minutes
      passwordMinLength: parseInt(process.env.PASSWORD_MIN_LENGTH) || 8,
      requireStrongPassword: process.env.REQUIRE_STRONG_PASSWORD === 'true'
    };
  }

  // Development/Debug Configuration
  get debug() {
    return {
      enabled: process.env.DEBUG === 'true' || this.server.environment === 'development',
      verboseLogging: process.env.VERBOSE_LOGGING === 'true',
      skipAuth: process.env.SKIP_AUTH === 'true' && this.server.environment === 'development'
    };
  }

  // Helper method to parse comma-separated environment variables
  _parseArray(value) {
    if (!value) return null;
    return value.split(',').map(item => item.trim()).filter(item => item.length > 0);
  }

  // Get configuration for a specific section
  getSection(sectionName) {
    if (typeof this[sectionName] === 'function') {
      return this[sectionName]();
    }
    return this[sectionName] || null;
  }

  // Check if running in production
  isProduction() {
    return this.server.environment === 'production';
  }

  // Check if running in development
  isDevelopment() {
    return this.server.environment === 'development';
  }

  // Get all configuration (excluding sensitive data in production)
  getAll(includeSensitive = false) {
    const config = {
      server: this.server,
      database: { path: this.database.path }, // Exclude connection details
      cors: this.cors,
      docker: this.docker,
      tasks: this.tasks,
      uploads: this.uploads,
      rateLimit: this.rateLimit,
      security: {
        maxLoginAttempts: this.security.maxLoginAttempts,
        passwordMinLength: this.security.passwordMinLength,
        requireStrongPassword: this.security.requireStrongPassword
      },
      debug: this.debug
    };

    if (includeSensitive && !this.isProduction()) {
      config.auth = this.auth;
      config.ai = this.ai;
      config.email = this.email;
    }

    return config;
  }
}

// Export singleton instance
const config = new Config();
module.exports = config; 