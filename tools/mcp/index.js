/**
 * @module mcpClient
 * @description A client module for interacting with Model Context Protocol (MCP) servers
 * This module allows AI to access external data sources and tools via MCP servers
 * configured in the user settings.
 */

const { spawn } = require('child_process');
const { v4: uuidv4 } = require('uuid');
const { settingsFunctions } = require('../../database');

/**
 * Represents a communication channel with an MCP server
 */
class MCPConnection {
  /**
   * Creates a new MCP connection
   * @param {string} serverName - Name of the MCP server to connect to
   * @param {Object} config - Configuration for the MCP server
   * @param {string} config.command - Command to start the MCP server
   * @param {string[]} config.args - Arguments for the command
   * @param {Object} config.env - Environment variables for the MCP server process
   */
  constructor(serverName, config) {
    this.serverName = serverName;
    this.config = config;
    this.process = null;
    this.messageCallbacks = new Map();
    this.connected = false;
    this.connectionPromise = null;
  }

  /**
   * Connects to the MCP server
   * @returns {Promise<boolean>} A promise that resolves when connected
   */
  connect() {
    if (this.connected) {
      return Promise.resolve(true);
    }

    if (this.connectionPromise) {
      return this.connectionPromise;
    }

    this.connectionPromise = new Promise((resolve, reject) => {
      try {
        // Create environment variables by merging with existing process.env
        const env = {
          ...process.env,
          ...(this.config.env || {})
        };

        // Spawn the MCP server process
        this.process = spawn(this.config.command, this.config.args || [], {
          env,
          stdio: ['pipe', 'pipe', 'pipe']
        });

        // Handle stdout for receiving messages
        this.process.stdout.on('data', (data) => {
          try {
            const lines = data.toString().trim().split('\n');
            for (const line of lines) {
              if (!line.trim()) continue;
              
              const message = JSON.parse(line);
              
              // Handle response messages
              if (message.id && this.messageCallbacks.has(message.id)) {
                const { resolve, reject } = this.messageCallbacks.get(message.id);
                this.messageCallbacks.delete(message.id);
                
                if (message.error) {
                  reject(new Error(message.error.message || 'Unknown MCP error'));
                } else {
                  resolve(message.result);
                }
              }
            }
          } catch (error) {
            console.error(`Error processing MCP server output: ${error.message}`);
          }
        });

        // Handle stderr for debugging
        this.process.stderr.on('data', (data) => {
          console.error(`MCP Server (${this.serverName}) stderr: ${data.toString()}`);
        });

        // Handle process exit
        this.process.on('close', (code) => {
          console.log(`MCP Server (${this.serverName}) process exited with code ${code}`);
          this.connected = false;
          this.process = null;
          
          // Reject any pending requests
          for (const { reject } of this.messageCallbacks.values()) {
            reject(new Error(`MCP server (${this.serverName}) process exited`));
          }
          this.messageCallbacks.clear();
        });

        // Handle process errors
        this.process.on('error', (error) => {
          console.error(`MCP Server (${this.serverName}) process error: ${error.message}`);
          reject(error);
        });

        // Check if the process has started successfully
        setTimeout(() => {
          if (this.process && !this.process.killed) {
            this.connected = true;
            resolve(true);
          } else {
            reject(new Error(`Failed to start MCP server (${this.serverName})`));
          }
        }, 1000);
      } catch (error) {
        console.error(`Error starting MCP server (${this.serverName}): ${error.message}`);
        reject(error);
      }
    });

    return this.connectionPromise;
  }

  /**
   * Sends a request to the MCP server
   * @param {string} method - The JSON-RPC method to call
   * @param {Object} params - The parameters for the method
   * @returns {Promise<any>} A promise that resolves with the server's response
   */
  async sendRequest(method, params = {}) {
    await this.connect();

    return new Promise((resolve, reject) => {
      try {
        const id = uuidv4();
        const request = {
          jsonrpc: '2.0',
          id,
          method,
          params
        };
        
        // Store callbacks for this request ID
        this.messageCallbacks.set(id, { resolve, reject });
        
        // Send the request to the server
        this.process.stdin.write(JSON.stringify(request) + '\n');
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Disconnects from the MCP server
   */
  disconnect() {
    if (this.process) {
      this.process.kill();
      this.process = null;
    }
    this.connected = false;
    this.connectionPromise = null;
  }
}

/**
 * Manages multiple MCP server connections
 */
class MCPManager {
  constructor() {
    this.connections = new Map();
  }

  /**
   * Gets an MCP server connection, creating it if necessary
   * @param {string} userId - User ID to get server configurations for
   * @param {string} serverName - Name of the MCP server
   * @returns {Promise<MCPConnection>} MCP server connection
   */
  async getConnection(userId, serverName) {
    const connectionKey = `${userId}:${serverName}`;
    
    if (this.connections.has(connectionKey)) {
      return this.connections.get(connectionKey);
    }
    
    // Get server config from user settings
    try {
      const mcpServersValue = await settingsFunctions.getSetting(userId, 'mcpServers');
      if (!mcpServersValue) {
        throw new Error(`No MCP servers configured for user ${userId}`);
      }
      
      const mcpServers = JSON.parse(mcpServersValue);
      const serverConfig = mcpServers[serverName];
      
      if (!serverConfig) {
        throw new Error(`MCP server "${serverName}" not found in user settings`);
      }
      
      // Create and store the connection
      const connection = new MCPConnection(serverName, serverConfig);
      this.connections.set(connectionKey, connection);
      
      return connection;
    } catch (error) {
      throw new Error(`Failed to get MCP server configuration: ${error.message}`);
    }
  }

  /**
   * Gets a list of all available MCP servers for a user
   * @param {string} userId - User ID to get server configurations for
   * @returns {Promise<Object>} Map of server names to their configurations
   */
  async getAvailableServers(userId) {
    try {
      const mcpServersValue = await settingsFunctions.getSetting(userId, 'mcpServers');
      if (!mcpServersValue) {
        return {};
      }
      
      return JSON.parse(mcpServersValue);
    } catch (error) {
      console.error(`Error getting available MCP servers: ${error.message}`);
      return {};
    }
  }

  /**
   * Closes all connections
   */
  closeAllConnections() {
    for (const connection of this.connections.values()) {
      connection.disconnect();
    }
    this.connections.clear();
  }
}

// Create a singleton manager instance
const mcpManager = new MCPManager();

/**
 * Main MCP client module for interacting with MCP servers
 */
const mcpClient = {
  /**
   * Runs an MCP task
   * @param {string} taskDescription - Description of the task from the AI
   * @param {Object} inputData - Input data from previous steps
   * @param {Function} stepCallback - Callback for updating task progress
   * @param {string} userId - User ID
   * @param {string} chatId - Chat ID
   * @returns {Promise<Object>} Task result
   */
  async runTask(taskDescription, inputData, stepCallback, userId, chatId) {
    try {
      // Extract server name and task from description
      // Format expected: "Get X from Y server" or "Use X server to do Y"
      const serverPattern = /(?:(?:from|using|with|through|via|on)\s+(?:the\s+)?)([a-zA-Z0-9_-]+)\s+(?:server|mcp|service|api)/i;
      const serverMatch = taskDescription.match(serverPattern);
      
      if (!serverMatch) {
        return {
          success: false,
          error: "No MCP server specified in the task. Please specify which MCP server to use."
        };
      }
      
      const serverName = serverMatch[1].toLowerCase();
      
      // Get available servers for user
      const availableServers = await mcpManager.getAvailableServers(userId);
      if (!Object.keys(availableServers).some(name => 
        name.toLowerCase() === serverName.toLowerCase())) {
        return {
          success: false,
          error: `MCP server "${serverName}" not found. Available servers: ${Object.keys(availableServers).join(', ')}`
        };
      }
      
      // Get the connection
      const connection = await mcpManager.getConnection(userId, serverName);
      
      // List available tools
      const tools = await connection.sendRequest('list_tools');
      
      // Progress update - connected to server
      stepCallback({
        success: true,
        result: `Connected to MCP server "${serverName}". Available tools: ${tools.tools.map(t => t.name).join(', ')}`,
      });
      
      // Analyze task to determine which tool to use
      const toolName = determineToolToUse(taskDescription, tools.tools);
      
      if (!toolName) {
        return {
          success: false,
          error: `Could not determine which tool to use for this task. Available tools: ${tools.tools.map(t => t.name).join(', ')}`
        };
      }
      
      // Extract parameters for the tool from the task description
      const toolParams = extractToolParameters(taskDescription, toolName, tools.tools.find(t => t.name === toolName));
      
      // Progress update - calling tool
      stepCallback({
        success: true,
        result: `Using tool "${toolName}" with parameters: ${JSON.stringify(toolParams)}`,
      });
      
      // Call the tool
      const toolResult = await connection.sendRequest('call_tool', {
        name: toolName,
        arguments: toolParams
      });
      
      // Process the result
      const resultText = processToolResult(toolResult);
      
      // Final success callback
      stepCallback({
        success: true,
        result: resultText,
      });
      
      return {
        success: true,
        result: resultText,
        data: toolResult
      };
    } catch (error) {
      console.error(`MCP task error: ${error.message}`);
      
      stepCallback({
        success: false,
        result: `Error: ${error.message}`,
      });
      
      return {
        success: false,
        error: error.message
      };
    }
  },
  
  /**
   * Lists all available MCP servers for a user
   * @param {string} userId - User ID
   * @returns {Promise<Object>} Map of server names to their configurations
   */
  async listServers(userId) {
    return mcpManager.getAvailableServers(userId);
  },
  
  /**
   * Gets information about available tools for a specific MCP server
   * @param {string} userId - User ID
   * @param {string} serverName - Name of the MCP server
   * @returns {Promise<Object[]>} List of available tools
   */
  async getServerTools(userId, serverName) {
    try {
      const connection = await mcpManager.getConnection(userId, serverName);
      const tools = await connection.sendRequest('list_tools');
      return tools.tools;
    } catch (error) {
      console.error(`Error getting MCP server tools: ${error.message}`);
      throw error;
    }
  },
  
  /**
   * Calls a specific tool on an MCP server
   * @param {string} userId - User ID
   * @param {string} serverName - Name of the MCP server
   * @param {string} toolName - Name of the tool to call
   * @param {Object} params - Parameters for the tool
   * @returns {Promise<Object>} Tool result
   */
  async callTool(userId, serverName, toolName, params) {
    try {
      const connection = await mcpManager.getConnection(userId, serverName);
      return connection.sendRequest('call_tool', {
        name: toolName,
        arguments: params
      });
    } catch (error) {
      console.error(`Error calling MCP tool: ${error.message}`);
      throw error;
    }
  },
  
  /**
   * Cleans up all MCP connections
   */
  cleanup() {
    mcpManager.closeAllConnections();
  }
};

/**
 * Determines which tool to use based on the task description
 * @param {string} taskDescription - Description of the task
 * @param {Object[]} availableTools - List of available tools
 * @returns {string|null} Name of the tool to use, or null if couldn't determine
 * @private
 */
function determineToolToUse(taskDescription, availableTools) {
  // First check if tool is explicitly mentioned
  for (const tool of availableTools) {
    const toolPattern = new RegExp(`(?:use|call|with|through|via)\\s+(?:the\\s+)?${tool.name}\\b`, 'i');
    if (toolPattern.test(taskDescription)) {
      return tool.name;
    }
  }
  
  // If no explicit tool mentioned, try to infer from description
  // This is a simple heuristic that could be improved with NLP
  for (const tool of availableTools) {
    // Split the description into words and check for keyword matches
    const words = tool.description.toLowerCase().split(/\s+/);
    const keywordMatches = words.filter(word => 
      word.length > 3 && // Only consider words with more than 3 chars
      taskDescription.toLowerCase().includes(word)
    );
    
    if (keywordMatches.length > 1) {
      return tool.name;
    }
  }
  
  // If only one tool is available, use it
  if (availableTools.length === 1) {
    return availableTools[0].name;
  }
  
  return null;
}

/**
 * Extracts parameters for a tool from the task description
 * @param {string} taskDescription - Description of the task
 * @param {string} toolName - Name of the tool
 * @param {Object} toolInfo - Tool information including inputSchema
 * @returns {Object} Parameter object for the tool
 * @private
 */
function extractToolParameters(taskDescription, toolName, toolInfo) {
  const params = {};
  
  // If no schema provided, try to extract common parameters
  if (!toolInfo.inputSchema) {
    // Extract key-value pairs like "param: value" or "param=value"
    const paramPattern = /([a-zA-Z0-9_]+)\s*[:=]\s*([^,]+)(?:,|$)/g;
    let match;
    
    while ((match = paramPattern.exec(taskDescription)) !== null) {
      const [, key, value] = match;
      params[key.trim()] = value.trim();
    }
    
    return params;
  }
  
  // If schema is provided, extract parameters based on schema
  const schema = toolInfo.inputSchema;
  
  if (schema.type === 'object' && schema.properties) {
    for (const [propName, propSchema] of Object.entries(schema.properties)) {
      // Try to find the property in the task description
      let paramValue = null;
      
      // Check for explicit parameter assignments like "param: value"
      const explicitPattern = new RegExp(`${propName}\\s*[:=]\\s*([^,]+)(?:,|$)`, 'i');
      const explicitMatch = taskDescription.match(explicitPattern);
      
      if (explicitMatch) {
        paramValue = explicitMatch[1].trim();
      } else if (propSchema.description) {
        // Try to extract based on the parameter description
        const descWords = propSchema.description.toLowerCase().split(/\s+/);
        
        // Create a pattern based on description
        for (const word of descWords) {
          if (word.length > 3) {
            const contextPattern = new RegExp(`${word}\\s+(?:is|for|of|as|to)?\\s+([^,.]+)`, 'i');
            const contextMatch = taskDescription.match(contextPattern);
            
            if (contextMatch) {
              paramValue = contextMatch[1].trim();
              break;
            }
          }
        }
      }
      
      // If we found a value, add it to params object
      if (paramValue !== null) {
        // Convert to appropriate type based on schema
        switch (propSchema.type) {
          case 'number':
          case 'integer':
            params[propName] = Number(paramValue);
            break;
          case 'boolean':
            params[propName] = ['true', 'yes', 'on', '1'].includes(paramValue.toLowerCase());
            break;
          case 'array':
            params[propName] = paramValue.split(/\s*,\s*/);
            break;
          default:
            params[propName] = paramValue;
        }
      }
    }
  }
  
  return params;
}

/**
 * Processes the result from an MCP tool call
 * @param {Object} toolResult - Result from the tool call
 * @returns {string} Processed result text
 * @private
 */
function processToolResult(toolResult) {
  if (!toolResult || !toolResult.content) {
    return "No result returned from the tool.";
  }
  
  // Process text content items
  const textItems = toolResult.content.filter(item => item.type === 'text');
  if (textItems.length > 0) {
    return textItems.map(item => item.text).join('\n\n');
  }
  
  // If no text items, stringify the whole result
  return JSON.stringify(toolResult, null, 2);
}

module.exports = mcpClient; 