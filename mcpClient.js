/**
 * @fileoverview MCP (Model Context Protocol) Client Module
 * 
 * This module provides functionality to interact with MCP servers
 * that have been configured in user settings. It handles spawning
 * the MCP servers as child processes and communicating with them
 * using the MCP protocol.
 * 
 * @module mcpClient
 */

const { spawn } = require('child_process');
const { settingsFunctions } = require('./database');

/**
 * @typedef {Object} McpServerConfig
 * @property {string} command - The command to execute (e.g., 'npx', 'node')
 * @property {Array<string>} args - Arguments for the command
 * @property {Object.<string, string>} env - Environment variables to pass to the process
 */

/**
 * @typedef {Object} McpToolDescription
 * @property {string} name - Tool name
 * @property {string} description - Tool description
 * @property {Object} inputSchema - JSON Schema describing the tool's input parameters
 */

/**
 * @typedef {Object} McpToolResult
 * @property {Array<{type: string, text: string}>} content - Array of content items returned by the tool
 */

/**
 * Class representing an MCP Client that can interact with MCP servers
 */
class McpClient {
  /**
   * Create an MCP client
   */
  constructor() {
    /** @type {Map<string, {process: import('child_process').ChildProcess, tools: McpToolDescription[]}>} */
    this.serverProcesses = new Map();
    /** @type {number} Request ID counter for MCP protocol */
    this.nextRequestId = 1;
    /** @type {Object.<string, function>} Pending request callbacks */
    this.pendingRequests = {};
  }

  /**
   * Load all MCP servers for a user from the database
   * 
   * @param {string|number} userId - User ID
   * @returns {Promise<Object.<string, McpServerConfig>>} - Map of server names to configurations
   */
  async loadUserServers(userId) {
    try {
      const mcpServersStr = await settingsFunctions.getSetting(userId, 'mcpServers');
      if (!mcpServersStr) return {};
      
      return JSON.parse(mcpServersStr);
    } catch (error) {
      console.error('Error loading MCP servers:', error);
      return {};
    }
  }

  /**
   * Start an MCP server from its configuration
   * 
   * @param {string} serverName - Name of the server
   * @param {McpServerConfig} config - Server configuration
   * @returns {Promise<boolean>} - Whether the server was started successfully
   */
  async startServer(serverName, config) {
    if (this.serverProcesses.has(serverName)) {
      console.log(`MCP server "${serverName}" is already running`);
      return true;
    }

    try {
      console.log(`Starting MCP server "${serverName}"...`);
      
      // Merge environment variables
      const env = {
        ...process.env,
        ...config.env
      };
      
      // Spawn the MCP server process
      const serverProcess = spawn(config.command, config.args || [], {
        env,
        stdio: ['pipe', 'pipe', 'pipe']
      });
      
      // Set up tracking for this server
      this.serverProcesses.set(serverName, {
        process: serverProcess,
        tools: [] // Will be populated after querying the server
      });

      // Set up event handlers for the process
      serverProcess.on('error', (error) => {
        console.error(`MCP server "${serverName}" error:`, error);
        this.cleanup(serverName);
      });

      serverProcess.on('exit', (code) => {
        console.log(`MCP server "${serverName}" exited with code ${code}`);
        this.cleanup(serverName);
      });
      
      // Handle server output for the MCP protocol
      let buffer = '';
      serverProcess.stdout.on('data', (data) => {
        buffer += data.toString();
        
        // Process complete JSON messages
        let endIndex;
        while ((endIndex = buffer.indexOf('\n')) !== -1) {
          const message = buffer.substring(0, endIndex);
          buffer = buffer.substring(endIndex + 1);
          
          try {
            const response = JSON.parse(message);
            if (response.id && this.pendingRequests[response.id]) {
              const callback = this.pendingRequests[response.id];
              delete this.pendingRequests[response.id];
              callback(null, response);
            }
          } catch (error) {
            console.error(`MCP server "${serverName}" invalid JSON:`, message);
          }
        }
      });
      
      // Log stderr output
      serverProcess.stderr.on('data', (data) => {
        console.log(`MCP server "${serverName}" stderr:`, data.toString());
      });
      
      // Load available tools from the server
      await this.loadServerTools(serverName);
      
      return true;
    } catch (error) {
      console.error(`Error starting MCP server "${serverName}":`, error);
      this.cleanup(serverName);
      return false;
    }
  }
  
  /**
   * Load available tools from an MCP server
   * 
   * @param {string} serverName - Name of the server
   * @returns {Promise<McpToolDescription[]>} - List of available tools
   */
  async loadServerTools(serverName) {
    const serverInfo = this.serverProcesses.get(serverName);
    if (!serverInfo) {
      throw new Error(`MCP server "${serverName}" is not running`);
    }
    
    const response = await this.sendRequest(serverName, {
      jsonrpc: '2.0',
      method: 'mcp.list_tools',
      params: {}
    });
    
    if (response.error) {
      throw new Error(`Failed to list tools: ${response.error.message}`);
    }
    
    serverInfo.tools = response.result.tools;
    return serverInfo.tools;
  }

  /**
   * Send a request to an MCP server
   * 
   * @param {string} serverName - Name of the server
   * @param {Object} request - Request object (without ID)
   * @returns {Promise<Object>} - Response from the server
   */
  sendRequest(serverName, request) {
    const serverInfo = this.serverProcesses.get(serverName);
    if (!serverInfo) {
      return Promise.reject(new Error(`MCP server "${serverName}" is not running`));
    }
    
    return new Promise((resolve, reject) => {
      const id = this.nextRequestId++;
      const fullRequest = {
        ...request,
        id
      };
      
      this.pendingRequests[id] = (error, response) => {
        if (error) reject(error);
        else resolve(response);
      };
      
      try {
        serverInfo.process.stdin.write(JSON.stringify(fullRequest) + '\n');
      } catch (error) {
        delete this.pendingRequests[id];
        reject(error);
      }
    });
  }

  /**
   * Call a tool on an MCP server
   * 
   * @param {string} serverName - Name of the server
   * @param {string} toolName - Name of the tool to call
   * @param {Object} params - Parameters to pass to the tool
   * @returns {Promise<McpToolResult>} - Result of the tool call
   */
  async callTool(serverName, toolName, params) {
    // Check if the server is running
    const serverInfo = this.serverProcesses.get(serverName);
    if (!serverInfo) {
      // Try to start the server
      throw new Error(`MCP server "${serverName}" is not running`);
    }
    
    // Check if the tool exists
    const tool = serverInfo.tools.find(t => t.name === toolName);
    if (!tool) {
      throw new Error(`Tool "${toolName}" not found on server "${serverName}"`);
    }
    
    // Call the tool
    const response = await this.sendRequest(serverName, {
      jsonrpc: '2.0',
      method: 'mcp.call_tool',
      params: {
        name: toolName,
        arguments: params
      }
    });
    
    if (response.error) {
      throw new Error(`Tool "${toolName}" failed: ${response.error.message}`);
    }
    
    return response.result;
  }

  /**
   * Get available tools for an MCP server
   * 
   * @param {string} serverName - Name of the server
   * @returns {Promise<McpToolDescription[]>} - List of available tools
   */
  async getServerTools(serverName) {
    const serverInfo = this.serverProcesses.get(serverName);
    if (!serverInfo) {
      throw new Error(`MCP server "${serverName}" is not running`);
    }
    
    return [...serverInfo.tools];
  }

  /**
   * Get available tools across all running MCP servers
   * 
   * @returns {Object.<string, McpToolDescription[]>} - Map of server names to tool lists
   */
  getAllServerTools() {
    const tools = {};
    
    for (const [serverName, serverInfo] of this.serverProcesses.entries()) {
      tools[serverName] = [...serverInfo.tools];
    }
    
    return tools;
  }

  /**
   * Stop an MCP server
   * 
   * @param {string} serverName - Name of the server to stop
   */
  stopServer(serverName) {
    const serverInfo = this.serverProcesses.get(serverName);
    if (!serverInfo) return;
    
    try {
      // Send SIGTERM to gracefully terminate
      serverInfo.process.kill('SIGTERM');
      
      // Remove from tracked processes after a delay
      setTimeout(() => {
        this.cleanup(serverName);
      }, 1000);
    } catch (error) {
      console.error(`Error stopping MCP server "${serverName}":`, error);
      this.cleanup(serverName);
    }
  }

  /**
   * Stop all running MCP servers
   */
  stopAllServers() {
    for (const serverName of this.serverProcesses.keys()) {
      this.stopServer(serverName);
    }
  }

  /**
   * Start all MCP servers for a user
   * 
   * @param {string|number} userId - User ID 
   * @returns {Promise<Object.<string, boolean>>} - Map of server names to success status
   */
  async startAllServers(userId) {
    const servers = await this.loadUserServers(userId);
    const results = {};
    
    for (const [serverName, config] of Object.entries(servers)) {
      results[serverName] = await this.startServer(serverName, config);
    }
    
    return results;
  }

  /**
   * Clean up resources for a server
   * 
   * @private
   * @param {string} serverName - Name of the server
   */
  cleanup(serverName) {
    // Cancel all pending requests for this server
    const serverInfo = this.serverProcesses.get(serverName);
    if (!serverInfo) return;
    
    for (const [id, callback] of Object.entries(this.pendingRequests)) {
      callback(new Error(`MCP server "${serverName}" closed`));
      delete this.pendingRequests[id];
    }
    
    this.serverProcesses.delete(serverName);
  }
}

// Create a singleton instance
const mcpClient = new McpClient();

/**
 * Get the MCP client instance
 * 
 * @returns {McpClient} The MCP client singleton
 */
function getMcpClient() {
  return mcpClient;
}

module.exports = {
  getMcpClient,
  McpClient
}; 