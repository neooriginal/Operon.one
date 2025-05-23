/**
 * MCP Client Module
 * Connects to and interacts with MCP servers
 */

const { spawn } = require('child_process');
const { EventEmitter } = require('events');
const contextManager = require('../../utils/context');

/**
 * @namespace McpTypes
 * @description Type definitions and interfaces for MCP operations
 */

/**
 * @typedef {Object} McpServerConfig
 * @property {string} command - The command to execute the MCP server
 * @property {string[]} args - Arguments to pass to the server command
 * @property {Object.<string, string>} [env] - Environment variables for the server
 * @property {number} [timeout] - Connection timeout in milliseconds (default: 30000)
 * @property {boolean} [autoRestart] - Whether to automatically restart the server on failure
 * @memberof McpTypes
 */

/**
 * @typedef {Object} McpTool
 * @property {string} name - The name of the tool
 * @property {string} description - Description of what the tool does
 * @property {Object} inputSchema - JSON schema for the tool's input parameters
 * @memberof McpTypes
 */

/**
 * @typedef {Object} McpResource
 * @property {string} uri - The URI of the resource
 * @property {string} name - Human-readable name of the resource
 * @property {string} description - Description of the resource
 * @property {string} [mimeType] - MIME type of the resource
 * @memberof McpTypes
 */

/**
 * @typedef {Object} McpPrompt
 * @property {string} name - The name of the prompt template
 * @property {string} description - Description of the prompt
 * @property {Object[]} arguments - Arguments the prompt accepts
 * @memberof McpTypes
 */

/**
 * @typedef {Object} McpMessage
 * @property {string} jsonrpc - JSON-RPC version (always "2.0")
 * @property {string|number} [id] - Request ID for request/response correlation
 * @property {string} method - The method name
 * @property {Object} [params] - Method parameters
 * @property {Object} [result] - Method result (for responses)
 * @property {Object} [error] - Error object (for error responses)
 * @memberof McpTypes
 */

/**
 * @class McpClient
 * @description Main MCP client class for connecting to and interacting with MCP servers
 * @extends EventEmitter
 */
class McpClient extends EventEmitter {
    /**
     * Creates an MCP client instance
     * @param {string} serverName - Name of the MCP server
     * @param {McpTypes.McpServerConfig} config - Server configuration
     * @param {string} userId - User ID for context management
     */
    constructor(serverName, config, userId) {
        super();
        this.serverName = serverName;
        this.config = { timeout: 30000, autoRestart: false, ...config };
        this.userId = userId;
        this.serverProcess = null;
        this.isConnected = false;
        this.isInitialized = false;
        this.pendingRequests = new Map();
        this.requestId = 1;
        this.availableTools = [];
        this.availableResources = [];
        this.availablePrompts = [];
        this.serverCapabilities = {};
        this.connectionTimeout = null;
        this._setupErrorHandling();
    }

    /**
     * Sets up error handling and cleanup procedures
     * @private
     */
    _setupErrorHandling() {
        this.on('error', (error) => {
            this._logError('MCP Client Error', error);
            this._updateContext({ lastError: error.message, lastErrorTime: new Date().toISOString() });
        });

        process.on('exit', () => this.disconnect());
        process.on('SIGINT', () => this.disconnect());
        process.on('SIGTERM', () => this.disconnect());
    }

    /**
     * Connects to the MCP server
     * @async
     * @returns {Promise<boolean>} True if connection successful, false otherwise
     * @throws {Error} When connection fails or times out
     */
    async connect() {
        try {
            this._log('Connecting to MCP server:', this.serverName);
            
            if (this.isConnected) {
                this._log('Already connected to server');
                return true;
            }

            // Start the server process
            await this._startServerProcess();
            
            // Initialize the MCP protocol
            await this._initializeProtocol();
            
            // Discover available capabilities
            await this._discoverCapabilities();
            
            this.isConnected = true;
            this.isInitialized = true;
            
            this._log('Successfully connected to MCP server:', this.serverName);
            this._updateContext({ 
                isConnected: true, 
                connectedAt: new Date().toISOString(),
                availableToolsCount: this.availableTools.length,
                availableResourcesCount: this.availableResources.length,
                serverCapabilities: this.serverCapabilities
            });
            
            this.emit('connected');
            return true;
            
        } catch (error) {
            this._logError('Failed to connect to MCP server', error);
            await this.disconnect();
            throw error;
        }
    }

    /**
     * Starts the MCP server process
     * @private
     * @async
     * @throws {Error} When server process fails to start
     */
    async _startServerProcess() {
        return new Promise((resolve, reject) => {
            // Set up timeout
            this.connectionTimeout = setTimeout(() => {
                reject(new Error(`Connection timeout after ${this.config.timeout}ms`));
            }, this.config.timeout);

            try {
                // Prepare environment variables
                const env = {
                    ...process.env,
                    ...this.config.env
                };

                // Spawn the server process
                this.serverProcess = spawn(this.config.command, this.config.args, {
                    stdio: ['pipe', 'pipe', 'pipe'],
                    env: env
                });

                // Handle process events
                this.serverProcess.on('error', (error) => {
                    this._clearTimeout();
                    reject(new Error(`Failed to start server process: ${error.message}`));
                });

                this.serverProcess.on('exit', (code, signal) => {
                    this._log(`Server process exited with code ${code}, signal ${signal}`);
                    this.isConnected = false;
                    this.emit('disconnected', { code, signal });
                    
                    if (this.config.autoRestart && code !== 0) {
                        this._log('Auto-restarting server...');
                        setTimeout(() => this.connect(), 5000);
                    }
                });

                // Set up data handlers
                this.serverProcess.stdout.on('data', (data) => {
                    this._handleServerMessage(data);
                });

                this.serverProcess.stderr.on('data', (data) => {
                    this._log('Server stderr:', data.toString());
                });

                // Wait a moment for the process to stabilize
                setTimeout(() => {
                    this._clearTimeout();
                    if (this.serverProcess && !this.serverProcess.killed) {
                        resolve();
                    } else {
                        reject(new Error('Server process failed to start'));
                    }
                }, 1000);

            } catch (error) {
                this._clearTimeout();
                reject(error);
            }
        });
    }

    /**
     * Initializes the MCP protocol handshake
     * @private
     * @async
     * @throws {Error} When protocol initialization fails
     */
    async _initializeProtocol() {
        try {
            // Send initialize request
            const initResponse = await this._sendRequest('initialize', {
                protocolVersion: '2024-11-05',
                capabilities: {
                    tools: {},
                    resources: {},
                    prompts: {}
                },
                clientInfo: {
                    name: 'operon-one-mcp-client',
                    version: '1.0.0'
                }
            });

            this.serverCapabilities = initResponse.capabilities || {};
            this._log('Server capabilities:', this.serverCapabilities);

            // Send initialized notification
            await this._sendNotification('initialized', {});
            
        } catch (error) {
            throw new Error(`Protocol initialization failed: ${error.message}`);
        }
    }

    /**
     * Discovers available tools, resources, and prompts from the server
     * @private
     * @async
     */
    async _discoverCapabilities() {
        try {
            // List available tools
            if (this.serverCapabilities.tools) {
                try {
                    const toolsResponse = await this._sendRequest('tools/list', {});
                    this.availableTools = toolsResponse.tools || [];
                    this._log(`Discovered ${this.availableTools.length} tools`);
                } catch (error) {
                    this._log('No tools available or failed to list tools:', error.message);
                }
            }

            // List available resources
            if (this.serverCapabilities.resources) {
                try {
                    const resourcesResponse = await this._sendRequest('resources/list', {});
                    this.availableResources = resourcesResponse.resources || [];
                    this._log(`Discovered ${this.availableResources.length} resources`);
                } catch (error) {
                    this._log('No resources available or failed to list resources:', error.message);
                }
            }

            // List available prompts
            if (this.serverCapabilities.prompts) {
                try {
                    const promptsResponse = await this._sendRequest('prompts/list', {});
                    this.availablePrompts = promptsResponse.prompts || [];
                    this._log(`Discovered ${this.availablePrompts.length} prompts`);
                } catch (error) {
                    this._log('No prompts available or failed to list prompts:', error.message);
                }
            }

        } catch (error) {
            this._log('Failed to discover some capabilities:', error.message);
            // Don't throw here - partial capability discovery is acceptable
        }
    }

    /**
     * Calls a tool on the MCP server
     * @async
     * @param {string} toolName - Name of the tool to call
     * @param {Object} [toolArgs={}] - Arguments to pass to the tool
     * @returns {Promise<Object>} Tool execution result
     * @throws {Error} When tool call fails or tool doesn't exist
     */
    async callTool(toolName, toolArgs = {}) {
        if (!this.isConnected) {
            throw new Error('Not connected to MCP server');
        }

        // Validate tool exists
        const tool = this.availableTools.find(t => t.name === toolName);
        if (!tool) {
            throw new Error(`Tool '${toolName}' not found. Available tools: ${this.availableTools.map(t => t.name).join(', ')}`);
        }

        try {
            this._log(`Calling tool: ${toolName} with arguments:`, toolArgs);
            
            const response = await this._sendRequest('tools/call', {
                name: toolName,
                arguments: toolArgs
            });

            this._log(`Tool ${toolName} completed successfully`);
            this._updateContext({ 
                lastToolCall: { 
                    name: toolName, 
                    arguments: toolArgs, 
                    result: response,
                    timestamp: new Date().toISOString() 
                } 
            });

            return response;

        } catch (error) {
            this._logError(`Tool call failed for ${toolName}`, error);
            throw error;
        }
    }

    /**
     * Reads a resource from the MCP server
     * @async
     * @param {string} uri - URI of the resource to read
     * @returns {Promise<Object>} Resource content
     * @throws {Error} When resource read fails or resource doesn't exist
     */
    async readResource(uri) {
        if (!this.isConnected) {
            throw new Error('Not connected to MCP server');
        }

        try {
            this._log(`Reading resource: ${uri}`);
            
            const response = await this._sendRequest('resources/read', {
                uri: uri
            });

            this._log(`Resource ${uri} read successfully`);
            this._updateContext({ 
                lastResourceRead: { 
                    uri, 
                    result: response,
                    timestamp: new Date().toISOString() 
                } 
            });

            return response;

        } catch (error) {
            this._logError(`Resource read failed for ${uri}`, error);
            throw error;
        }
    }

    /**
     * Gets a prompt from the MCP server
     * @async
     * @param {string} promptName - Name of the prompt to get
     * @param {Object} [promptArgs={}] - Arguments to pass to the prompt
     * @returns {Promise<Object>} Prompt result
     * @throws {Error} When prompt get fails or prompt doesn't exist
     */
    async getPrompt(promptName, promptArgs = {}) {
        if (!this.isConnected) {
            throw new Error('Not connected to MCP server');
        }

        // Validate prompt exists
        const prompt = this.availablePrompts.find(p => p.name === promptName);
        if (!prompt) {
            throw new Error(`Prompt '${promptName}' not found. Available prompts: ${this.availablePrompts.map(p => p.name).join(', ')}`);
        }

        try {
            this._log(`Getting prompt: ${promptName} with arguments:`, promptArgs);
            
            const response = await this._sendRequest('prompts/get', {
                name: promptName,
                arguments: promptArgs
            });

            this._log(`Prompt ${promptName} retrieved successfully`);
            this._updateContext({ 
                lastPromptGet: { 
                    name: promptName, 
                    arguments: promptArgs, 
                    result: response,
                    timestamp: new Date().toISOString() 
                } 
            });

            return response;

        } catch (error) {
            this._logError(`Prompt get failed for ${promptName}`, error);
            throw error;
        }
    }

    /**
     * Lists all available tools
     * @returns {McpTypes.McpTool[]} Array of available tools
     */
    getAvailableTools() {
        return [...this.availableTools];
    }

    /**
     * Lists all available resources
     * @returns {McpTypes.McpResource[]} Array of available resources
     */
    getAvailableResources() {
        return [...this.availableResources];
    }

    /**
     * Lists all available prompts
     * @returns {McpTypes.McpPrompt[]} Array of available prompts
     */
    getAvailablePrompts() {
        return [...this.availablePrompts];
    }

    /**
     * Gets the server capabilities
     * @returns {Object} Server capabilities object
     */
    getServerCapabilities() {
        return { ...this.serverCapabilities };
    }

    /**
     * Checks if the client is connected to the server
     * @returns {boolean} True if connected, false otherwise
     */
    isServerConnected() {
        return this.isConnected && this.serverProcess && !this.serverProcess.killed;
    }

    /**
     * Sends a JSON-RPC request to the server
     * @private
     * @async
     * @param {string} method - The method name
     * @param {Object} [params={}] - Method parameters
     * @returns {Promise<Object>} Response result
     * @throws {Error} When request fails or times out
     */
    async _sendRequest(method, params = {}) {
        if (!this.serverProcess || this.serverProcess.killed) {
            throw new Error('Server process not available');
        }

        return new Promise((resolve, reject) => {
            const id = this.requestId++;
            const message = {
                jsonrpc: '2.0',
                id: id,
                method: method,
                params: params
            };

            // Set up timeout
            const timeout = setTimeout(() => {
                this.pendingRequests.delete(id);
                reject(new Error(`Request timeout for method: ${method} after ${this.config.timeout}ms`));
            }, this.config.timeout);

            // Store pending request
            this.pendingRequests.set(id, (response) => {
                clearTimeout(timeout);
                this._log(`Received response for ${method}:`, response);
                
                if (response.error) {
                    const errorMsg = response.error.message || response.error.code || 'Unknown MCP error';
                    reject(new Error(`MCP Error (${method}): ${errorMsg}`));
                } else {
                    // Ensure we return the result, even if it's null or undefined
                    resolve(response.result !== undefined ? response.result : {});
                }
            });

            // Send the message
            try {
                const messageStr = JSON.stringify(message) + '\n';
                this._log(`Sending request ${id} for ${method}:`, message);
                this.serverProcess.stdin.write(messageStr);
            } catch (error) {
                clearTimeout(timeout);
                this.pendingRequests.delete(id);
                reject(new Error(`Failed to send request: ${error.message}`));
            }
        });
    }

    /**
     * Sends a JSON-RPC notification to the server
     * @private
     * @async
     * @param {string} method - The method name
     * @param {Object} [params={}] - Method parameters
     */
    async _sendNotification(method, params = {}) {
        if (!this.serverProcess || this.serverProcess.killed) {
            throw new Error('Server process not available');
        }

        const message = {
            jsonrpc: '2.0',
            method: method,
            params: params
        };

        try {
            const messageStr = JSON.stringify(message) + '\n';
            this.serverProcess.stdin.write(messageStr);
        } catch (error) {
            this._logError('Failed to send notification', error);
            throw error;
        }
    }

    /**
     * Handles incoming messages from the server
     * @private
     * @param {Buffer} data - Raw data from server
     */
    _handleServerMessage(data) {
        try {
            const messages = data.toString().trim().split('\n').filter(line => line.trim());
            
            for (const messageStr of messages) {
                try {
                    const message = JSON.parse(messageStr);
                    
                    if (message.id && this.pendingRequests.has(message.id)) {
                        // Handle response
                        const callback = this.pendingRequests.get(message.id);
                        this.pendingRequests.delete(message.id);
                        callback(message);
                    } else if (message.method) {
                        // Handle notification or request from server
                        this._handleServerNotification(message);
                    }
                } catch (parseError) {
                    this._log('Failed to parse message:', messageStr, parseError.message);
                }
            }
        } catch (error) {
            this._logError('Failed to handle server message', error);
        }
    }

    /**
     * Handles notifications from the server
     * @private
     * @param {McpTypes.McpMessage} message - The notification message
     */
    _handleServerNotification(message) {
        this._log('Received server notification:', message.method);
        
        switch (message.method) {
            case 'notifications/resources/list_changed':
                this._log('Resources list changed, refreshing...');
                this._discoverCapabilities();
                break;
            case 'notifications/tools/list_changed':
                this._log('Tools list changed, refreshing...');
                this._discoverCapabilities();
                break;
            case 'notifications/prompts/list_changed':
                this._log('Prompts list changed, refreshing...');
                this._discoverCapabilities();
                break;
            default:
                this._log('Unknown notification:', message);
        }
    }

    /**
     * Disconnects from the MCP server
     * @async
     */
    async disconnect() {
        try {
            this._log('Disconnecting from MCP server:', this.serverName);
            
            this._clearTimeout();
            this.isConnected = false;
            this.isInitialized = false;
            
            // Clear pending requests
            for (const [id, callback] of this.pendingRequests) {
                callback({ error: { message: 'Connection closed' } });
            }
            this.pendingRequests.clear();
            
            // Close server process more forcefully
            if (this.serverProcess && !this.serverProcess.killed) {
                try {
                    // Try graceful shutdown first
                    this.serverProcess.kill('SIGTERM');
                    
                    // Wait a moment for graceful shutdown
                    await new Promise((resolve) => {
                        const timeout = setTimeout(() => {
                            // Force kill if graceful shutdown didn't work
                            if (this.serverProcess && !this.serverProcess.killed) {
                                this.serverProcess.kill('SIGKILL');
                            }
                            resolve();
                        }, 2000);
                        
                        if (this.serverProcess) {
                            this.serverProcess.on('exit', () => {
                                clearTimeout(timeout);
                                resolve();
                            });
                        } else {
                            clearTimeout(timeout);
                            resolve();
                        }
                    });
                } catch (killError) {
                    this._log('Error killing server process:', killError.message);
                }
                
                this.serverProcess = null;
            }
            
            this._updateContext({ 
                isConnected: false, 
                disconnectedAt: new Date().toISOString() 
            });
            
            this.emit('disconnected');
            this._log('Disconnected from MCP server');
            
        } catch (error) {
            this._logError('Error during disconnect', error);
        }
    }

    /**
     * Clears the connection timeout
     * @private
     */
    _clearTimeout() {
        if (this.connectionTimeout) {
            clearTimeout(this.connectionTimeout);
            this.connectionTimeout = null;
        }
    }

    /**
     * Updates the context manager with current state
     * @private
     * @param {Object} data - Data to update in context
     */
    _updateContext(data) {
        const toolState = contextManager.getToolState('mcpClient', this.userId) || {};
        toolState[this.serverName] = {
            ...toolState[this.serverName],
            ...data
        };
        contextManager.setToolState('mcpClient', toolState, this.userId);
    }

    /**
     * Logs a message with MCP client prefix
     * @private
     * @param {...any} args - Arguments to log
     */
    _log(...args) {
        console.log(`[MCP-${this.serverName}]`, ...args);
    }

    /**
     * Logs an error with MCP client prefix
     * @private
     * @param {string} message - Error message
     * @param {Error} error - Error object
     */
    _logError(message, error) {
        console.error(`[MCP-${this.serverName}] ${message}:`, error.message);
        if (error.stack) {
            console.error(error.stack);
        }
    }
}

/**
 * @class McpClientManager
 * @description Manages multiple MCP client connections for a user
 */
class McpClientManager {
    /**
     * Creates an MCP client manager
     * @param {string} userId - User ID for context management
     */
    constructor(userId) {
        /** @type {string} */
        this.userId = userId;
        
        /** @type {Map<string, McpClient>} */
        this.clients = new Map();
        
        /** @type {Object.<string, McpTypes.McpServerConfig>} */
        this.serverConfigs = {};
    }

    /**
     * Loads server configurations for the user
     * @async
     * @returns {Promise<void>}
     */
    async loadServerConfigs() {
        try {
            // Import the settings functions from database
            const { settingsFunctions } = require('../../database');
            
            // Get MCP servers from user settings
            const mcpServersJson = await settingsFunctions.getSetting(this.userId, 'mcpServers');
            
            if (mcpServersJson) {
                this.serverConfigs = JSON.parse(mcpServersJson);
                console.log(`[MCP-Manager] Loaded ${Object.keys(this.serverConfigs).length} server configurations`);
            } else {
                console.log('[MCP-Manager] No MCP server configurations found');
                this.serverConfigs = {};
            }
        } catch (error) {
            console.error('[MCP-Manager] Failed to load server configurations:', error.message);
            this.serverConfigs = {};
        }
    }

    /**
     * Connects to all configured MCP servers
     * @async
     * @returns {Promise<string[]>} Array of successfully connected server names
     */
    async connectToAllServers() {
        await this.loadServerConfigs();
        
        const connectedServers = [];
        const connectionPromises = [];
        
        for (const [serverName, config] of Object.entries(this.serverConfigs)) {
            const promise = this.connectToServer(serverName, config)
                .then(() => {
                    connectedServers.push(serverName);
                    return serverName;
                })
                .catch((error) => {
                    console.error(`[MCP-Manager] Failed to connect to ${serverName}:`, error.message);
                    return null;
                });
            
            connectionPromises.push(promise);
        }
        
        await Promise.allSettled(connectionPromises);
        
        console.log(`[MCP-Manager] Connected to ${connectedServers.length}/${Object.keys(this.serverConfigs).length} servers`);
        return connectedServers;
    }

    /**
     * Connects to a specific MCP server
     * @async
     * @param {string} serverName - Name of the server
     * @param {McpTypes.McpServerConfig} [config] - Server configuration (optional if already loaded)
     * @returns {Promise<McpClient>} The connected MCP client
     * @throws {Error} When connection fails
     */
    async connectToServer(serverName, config = null) {
        // Security: Only allow connection to servers configured by this user
        const serverConfig = config || this.serverConfigs[serverName];
        
        if (!serverConfig) {
            throw new Error(`No configuration found for server: ${serverName}`);
        }
        
        // Security: Verify this server belongs to the current user
        if (!config && !this.serverConfigs[serverName]) {
            throw new Error(`Access denied: Server ${serverName} not configured for user ${this.userId}`);
        }
        
        if (this.clients.has(serverName)) {
            await this.disconnectFromServer(serverName);
        }
        
        const client = new McpClient(serverName, serverConfig, this.userId);
        
        try {
            await client.connect();
            this.clients.set(serverName, client);
            console.log(`[MCP-Manager] Successfully connected to ${serverName}`);
            return client;
        } catch (error) {
            console.error(`[MCP-Manager] Failed to connect to ${serverName}:`, error.message);
            throw error;
        }
    }

    /**
     * Disconnects from a specific MCP server
     * @async
     * @param {string} serverName - Name of the server to disconnect from
     */
    async disconnectFromServer(serverName) {
        const client = this.clients.get(serverName);
        if (client) {
            await client.disconnect();
            this.clients.delete(serverName);
            console.log(`[MCP-Manager] Disconnected from ${serverName}`);
        }
    }

    /**
     * Disconnects from all MCP servers
     * @async
     */
    async disconnectFromAllServers() {
        const disconnectPromises = [];
        
        for (const [serverName, client] of this.clients) {
            disconnectPromises.push(
                client.disconnect().catch((error) => {
                    console.error(`[MCP-Manager] Error disconnecting from ${serverName}:`, error.message);
                })
            );
        }
        
        await Promise.allSettled(disconnectPromises);
        this.clients.clear();
        console.log('[MCP-Manager] Disconnected from all servers');
    }

    /**
     * Gets a connected MCP client by server name
     * @param {string} serverName - Name of the server
     * @returns {McpClient|null} The MCP client or null if not connected
     */
    getClient(serverName) {
        return this.clients.get(serverName) || null;
    }

    /**
     * Gets all connected server names
     * @returns {string[]} Array of connected server names
     */
    getConnectedServers() {
        return Array.from(this.clients.keys());
    }

    /**
     * Gets all available tools from all connected servers
     * @returns {Object.<string, McpTypes.McpTool[]>} Map of server names to their tools
     */
    getAllAvailableTools() {
        const allTools = {};
        
        for (const [serverName, client] of this.clients) {
            if (client.isServerConnected()) {
                allTools[serverName] = client.getAvailableTools();
            }
        }
        
        return allTools;
    }

    /**
     * Gets all available resources from all connected servers
     * @returns {Object.<string, McpTypes.McpResource[]>} Map of server names to their resources
     */
    getAllAvailableResources() {
        const allResources = {};
        
        for (const [serverName, client] of this.clients) {
            if (client.isServerConnected()) {
                allResources[serverName] = client.getAvailableResources();
            }
        }
        
        return allResources;
    }

    /**
     * Calls a tool on a specific server
     * @async
     * @param {string} serverName - Name of the server
     * @param {string} toolName - Name of the tool
     * @param {Object} [toolArgs={}] - Tool arguments
     * @returns {Promise<Object>} Tool execution result
     * @throws {Error} When server not connected or tool call fails
     */
    async callTool(serverName, toolName, toolArgs = {}) {
        const client = this.clients.get(serverName);
        
        if (!client) {
            throw new Error(`Not connected to server: ${serverName}`);
        }
        
        if (!client.isServerConnected()) {
            throw new Error(`Server ${serverName} is not connected`);
        }
        
        return await client.callTool(toolName, toolArgs);
    }

    /**
     * Reads a resource from a specific server
     * @async
     * @param {string} serverName - Name of the server
     * @param {string} uri - Resource URI
     * @returns {Promise<Object>} Resource content
     * @throws {Error} When server not connected or resource read fails
     */
    async readResource(serverName, uri) {
        const client = this.clients.get(serverName);
        
        if (!client) {
            throw new Error(`Not connected to server: ${serverName}`);
        }
        
        if (!client.isServerConnected()) {
            throw new Error(`Server ${serverName} is not connected`);
        }
        
        return await client.readResource(uri);
    }
}

// Cache for MCP client managers per user
const mcpManagers = new Map();

/**
 * Gets or creates an MCP client manager for a user
 * @param {string} userId - User ID
 * @returns {McpClientManager} The MCP client manager
 */
function getMcpManager(userId) {
    if (!mcpManagers.has(userId)) {
        mcpManagers.set(userId, new McpClientManager(userId));
    }
    return mcpManagers.get(userId);
}

/**
 * Cleans up MCP manager for a specific user
 * @param {string} userId - User ID
 */
async function cleanupMcpManager(userId) {
    if (mcpManagers.has(userId)) {
        const manager = mcpManagers.get(userId);
        try {
            await manager.disconnectFromAllServers();
            mcpManagers.delete(userId);
            console.log(`[MCP-Client] Cleaned up manager for user ${userId}`);
        } catch (error) {
            console.error(`[MCP-Client] Error cleaning up manager for user ${userId}:`, error.message);
        }
    }
}

/**
 * Gets available MCP tools for AI planning
 * @async
 * @param {string} [userId='default'] - User ID for context management
 * @returns {Promise<Object>} Available tools organized by server
 */
async function getAvailableTools(userId = 'default') {
    try {
        const mcpManager = getMcpManager(userId);
        
        // Ensure we're connected to servers
        if (mcpManager.getConnectedServers().length === 0) {
            await mcpManager.connectToAllServers();
        }
        
        const allTools = mcpManager.getAllAvailableTools();
        const toolsForAI = {};
        
        // Format tools for AI discovery
        for (const [serverName, tools] of Object.entries(allTools)) {
            toolsForAI[serverName] = tools.map(tool => ({
                name: tool.name,
                description: tool.description,
                server: serverName,
                fullName: `${serverName}.${tool.name}`,
                inputSchema: tool.inputSchema
            }));
        }
        
        return toolsForAI;
    } catch (error) {
        console.error('[MCP-Client] Failed to get available tools:', error.message);
        return {};
    }
}

/**
 * Main task runner function for the MCP client tool
 * @async
 * @param {string} taskDescription - Description of the task to perform
 * @param {string} otherAIData - Additional context from other AI tools
 * @param {Function} stepCallback - Callback function for step updates
 * @param {string} [userId='default'] - User ID for context management
 * @param {string} [chatId='1'] - Chat ID for context management
 * @returns {Promise<Object>} Task execution result
 */
async function runTask(taskDescription, otherAIData, stepCallback, userId = 'default', chatId = '1') {
    let taskIntent; // Declare outside try block for error logging
    
    try {
        console.log('[MCP-Client] Starting MCP task:', taskDescription);
        
        // Get or create MCP manager for the user
        const mcpManager = getMcpManager(userId);
        
        // Parse the task to understand what MCP action is needed
        taskIntent = await parseTaskIntent(taskDescription, otherAIData);
        
        console.log('[MCP-Client] Parsed task intent:', JSON.stringify(taskIntent, null, 2));
        
        // Connect to servers if not already connected
        if (mcpManager.getConnectedServers().length === 0) {
            stepCallback({ success: true, result: 'Connecting to MCP servers...' });
            await mcpManager.connectToAllServers();
        }
        
        let result;
        
        console.log('[MCP-Client] Executing action:', taskIntent.action);
        
        switch (taskIntent.action) {
            case 'list_tools':
                console.log('[MCP-Client] Executing list_tools for server:', taskIntent.serverName);
                result = await handleListTools(mcpManager, taskIntent.serverName);
                break;
            case 'list_resources':
                console.log('[MCP-Client] Executing list_resources for server:', taskIntent.serverName);
                result = await handleListResources(mcpManager, taskIntent.serverName);
                break;
            case 'call_tool':
                console.log('[MCP-Client] Executing call_tool:', taskIntent.serverName, taskIntent.toolName);
                result = await handleCallTool(mcpManager, taskIntent.serverName, taskIntent.toolName, taskIntent.toolArguments);
                break;
            case 'read_resource':
                console.log('[MCP-Client] Executing read_resource:', taskIntent.serverName, taskIntent.uri);
                result = await handleReadResource(mcpManager, taskIntent.serverName, taskIntent.uri);
                break;
            case 'list_servers':
                console.log('[MCP-Client] Executing list_servers');
                result = await handleListServers(mcpManager);
                break;
            case 'get_available_tools':
                console.log('[MCP-Client] Executing get_available_tools');
                result = await getAvailableTools(userId);
                stepCallback({ success: true, result: 'Retrieved available MCP tools for AI planning' });
                return { success: true, data: result };
            default:
                console.log('[MCP-Client] Executing generic task handling');
                result = await handleGenericMcpTask(mcpManager, taskDescription, otherAIData);
        }
        
        // Update context with task result
        const toolState = contextManager.getToolState('mcpClient', userId) || {};
        toolState.lastTask = {
            description: taskDescription,
            intent: taskIntent,
            result: result,
            timestamp: new Date().toISOString()
        };
        contextManager.setToolState('mcpClient', toolState, userId);
        
        console.log('[MCP-Client] Task result:', JSON.stringify(result, null, 2));
        
        stepCallback({ success: true, result: result });
        
        console.log('[MCP-Client] Task completed successfully, returning:', { success: true, data: result });
        return { success: true, data: result };
        
    } catch (error) {
        console.error('[MCP-Client] Task failed:', error.message);
        console.error('[MCP-Client] Error stack:', error.stack);
        console.error('[MCP-Client] Task description was:', taskDescription);
        console.error('[MCP-Client] Task intent was:', JSON.stringify(taskIntent, null, 2));
        
        stepCallback({ success: false, error: error.message });
        
        return {
            success: false,
            error: error.message
        };
    }
}

/**
 * Parses the task description to understand the intended MCP action
 * @async
 * @param {string} taskDescription - The task description
 * @param {string} otherAIData - Additional context
 * @returns {Promise<Object>} Parsed task intent
 */
async function parseTaskIntent(taskDescription, otherAIData) {
    const description = taskDescription.toLowerCase();
    
    console.log('[MCP-Client] Parsing task description:', taskDescription);
    
    // Enhanced pattern matching for better detection
    
    // Check for listing available MCP tools
    if (description.includes('list tools') || description.includes('show tools') || 
        description.includes('available tools') || description.includes('what tools')) {
        const serverName = extractServerName(taskDescription);
        console.log('[MCP-Client] Detected list_tools action for server:', serverName);
        return { action: 'list_tools', serverName: serverName };
    }
    
    // Check for listing MCP resources
    if (description.includes('list resources') || description.includes('show resources') || 
        description.includes('available resources')) {
        const serverName = extractServerName(taskDescription);
        console.log('[MCP-Client] Detected list_resources action for server:', serverName);
        return { action: 'list_resources', serverName: serverName };
    }
    
    // Check for direct tool call patterns
    if (description.includes('call tool') || description.includes('use tool') || 
        description.includes('execute tool') || description.includes('run tool')) {
        const serverName = extractServerName(taskDescription);
        const toolName = extractToolName(taskDescription);
        const toolArguments = extractArguments(taskDescription);
        
        console.log('[MCP-Client] Detected call_tool action:', { serverName, toolName, toolArguments });
        return {
            action: 'call_tool',
            serverName: serverName,
            toolName: toolName,
            toolArguments: toolArguments
        };
    }
    
    // Check for resource reading patterns
    if (description.includes('read resource') || description.includes('get resource')) {
        const serverName = extractServerName(taskDescription);
        const uri = extractResourceUri(taskDescription);
        
        console.log('[MCP-Client] Detected read_resource action:', { serverName, uri });
        return {
            action: 'read_resource',
            serverName: serverName,
            uri: uri
        };
    }
    
    // Enhanced pattern: Detect when user wants to use a specific MCP server to perform an action
    // This handles cases like "List all Coolify servers" which should call the list-servers tool
    const serverPattern = /\b(\w+)\s+servers?\b/i;
    const serverMatch = taskDescription.match(serverPattern);
    
    if (serverMatch && (description.includes('list') || description.includes('show') || description.includes('get'))) {
        const potentialServerName = serverMatch[1].toLowerCase();
        
        // Don't treat generic words as server names
        if (!['mcp', 'connected', 'available', 'all'].includes(potentialServerName)) {
            console.log('[MCP-Client] Detected tool call pattern for server action:', potentialServerName);
            
            // Try to infer the tool name based on the action
            let toolName = 'list-servers'; // default assumption
            if (description.includes('status') || description.includes('statuses')) {
                toolName = 'list-servers'; // most servers use this for status info
            }
            
            return {
                action: 'call_tool',
                serverName: potentialServerName,
                toolName: toolName,
                toolArguments: {}
            };
        }
    }
    
    // Check for listing connected MCP servers (not the servers managed by those servers)
    if ((description.includes('list') && description.includes('mcp') && description.includes('servers')) ||
        (description.includes('show') && description.includes('connected') && description.includes('servers')) ||
        description.includes('connected mcp servers')) {
        console.log('[MCP-Client] Detected list_servers action (MCP servers)');
        return { action: 'list_servers' };
    }
    
    // Default to generic task handling
    console.log('[MCP-Client] No specific action detected, using generic handling');
    return {
        action: 'generic',
        description: taskDescription,
        context: otherAIData
    };
}

/**
 * Extracts server name from task description
 * @param {string} taskDescription - The task description
 * @returns {string|null} Server name or null if not found
 */
function extractServerName(taskDescription) {
    const serverMatch = taskDescription.match(/(?:server|from)\s+([a-zA-Z0-9_-]+)/i);
    return serverMatch ? serverMatch[1] : null;
}

/**
 * Extracts tool name from task description
 * @param {string} taskDescription - The task description
 * @returns {string|null} Tool name or null if not found
 */
function extractToolName(taskDescription) {
    const toolMatch = taskDescription.match(/(?:tool|use|call)\s+([a-zA-Z0-9_-]+)/i);
    return toolMatch ? toolMatch[1] : null;
}

/**
 * Extracts arguments from task description (simplified)
 * @param {string} taskDescription - The task description
 * @returns {Object} Extracted arguments
 */
function extractArguments(taskDescription) {
    // This is a simplified extraction - in practice, you might want more sophisticated parsing
    const argsMatch = taskDescription.match(/with\s+args?\s*[:\s]*(\{.*\})/i);
    if (argsMatch) {
        try {
            return JSON.parse(argsMatch[1]);
        } catch (error) {
            console.log('[MCP-Client] Failed to parse arguments as JSON:', argsMatch[1]);
        }
    }
    return {};
}

/**
 * Extracts resource URI from task description
 * @param {string} taskDescription - The task description
 * @returns {string|null} Resource URI or null if not found
 */
function extractResourceUri(taskDescription) {
    const uriMatch = taskDescription.match(/(?:resource|uri)\s+([^\s]+)/i);
    return uriMatch ? uriMatch[1] : null;
}

/**
 * Handles listing tools from servers
 * @async
 * @param {McpClientManager} mcpManager - The MCP manager
 * @param {string|null} serverName - Specific server name or null for all
 * @returns {Promise<string>} Formatted tools list
 */
async function handleListTools(mcpManager, serverName = null) {
    const allTools = mcpManager.getAllAvailableTools();
    
    if (Object.keys(allTools).length === 0) {
        return 'No MCP servers connected or no tools available.';
    }
    
    let result = 'Available MCP Tools:\n\n';
    
    for (const [server, tools] of Object.entries(allTools)) {
        if (serverName && server !== serverName) continue;
        
        result += `Server: ${server}\n`;
        if (tools.length === 0) {
            result += '  No tools available\n';
        } else {
            tools.forEach(tool => {
                result += `  - ${tool.name}: ${tool.description}\n`;
            });
        }
        result += '\n';
    }
    
    return result.trim();
}

/**
 * Handles listing resources from servers
 * @async
 * @param {McpClientManager} mcpManager - The MCP manager
 * @param {string|null} serverName - Specific server name or null for all
 * @returns {Promise<string>} Formatted resources list
 */
async function handleListResources(mcpManager, serverName = null) {
    const allResources = mcpManager.getAllAvailableResources();
    
    if (Object.keys(allResources).length === 0) {
        return 'No MCP servers connected or no resources available.';
    }
    
    let result = 'Available MCP Resources:\n\n';
    
    for (const [server, resources] of Object.entries(allResources)) {
        if (serverName && server !== serverName) continue;
        
        result += `Server: ${server}\n`;
        if (resources.length === 0) {
            result += '  No resources available\n';
        } else {
            resources.forEach(resource => {
                result += `  - ${resource.name} (${resource.uri}): ${resource.description}\n`;
            });
        }
        result += '\n';
    }
    
    return result.trim();
}

/**
 * Handles calling a tool on an MCP server
 * @async
 * @param {McpClientManager} mcpManager - The MCP manager
 * @param {string|null} serverName - Server name
 * @param {string|null} toolName - Tool name
 * @param {Object} toolArguments - Tool arguments
 * @returns {Promise<string>} Tool execution result
 */
async function handleCallTool(mcpManager, serverName, toolName, toolArguments) {
    if (!serverName || !toolName) {
        throw new Error('Server name and tool name are required for tool calls');
    }
    
    try {
        console.log(`[MCP-Client] Calling tool ${toolName} on server ${serverName} with args:`, toolArguments);
        
        // Try the original tool name first
        let result;
        try {
            result = await mcpManager.callTool(serverName, toolName, toolArguments);
        } catch (error) {
            // If tool not found, try alternative naming conventions
            if (error.message.includes('not found')) {
                let alternativeToolName;
                
                // Try converting between underscore and hyphen
                if (toolName.includes('-')) {
                    alternativeToolName = toolName.replace(/-/g, '_');
                } else if (toolName.includes('_')) {
                    alternativeToolName = toolName.replace(/_/g, '-');
                }
                
                if (alternativeToolName) {
                    console.log(`[MCP-Client] Tool ${toolName} not found, trying alternative: ${alternativeToolName}`);
                    try {
                        result = await mcpManager.callTool(serverName, alternativeToolName, toolArguments);
                        toolName = alternativeToolName; // Update for logging
                    } catch (altError) {
                        throw error; // Throw original error if alternative also fails
                    }
                } else {
                    throw error; // No alternative to try
                }
            } else {
                throw error; // Different error, re-throw
            }
        }
        
        console.log(`[MCP-Client] Tool ${toolName} returned:`, result);
        
        // Format the result for better readability
        let formattedResult = `Tool ${toolName} on server ${serverName} executed successfully:\n\n`;
        
        if (result && result.content) {
            // Handle MCP content format
            if (Array.isArray(result.content)) {
                result.content.forEach((item, index) => {
                    if (item.type === 'text') {
                        formattedResult += item.text + '\n';
                    } else {
                        formattedResult += `Content ${index + 1}: ${JSON.stringify(item, null, 2)}\n`;
                    }
                });
            } else {
                formattedResult += JSON.stringify(result.content, null, 2);
            }
        } else if (result && typeof result === 'object') {
            formattedResult += JSON.stringify(result, null, 2);
        } else if (result) {
            formattedResult += String(result);
        } else {
            formattedResult += 'Tool executed successfully (no return data)';
        }
        
        return formattedResult;
        
    } catch (error) {
        console.error(`[MCP-Client] Tool call failed:`, error);
        throw new Error(`Failed to call tool ${toolName} on server ${serverName}: ${error.message}`);
    }
}

/**
 * Handles reading a resource from an MCP server
 * @async
 * @param {McpClientManager} mcpManager - The MCP manager
 * @param {string|null} serverName - Server name
 * @param {string|null} uri - Resource URI
 * @returns {Promise<string>} Resource content
 */
async function handleReadResource(mcpManager, serverName, uri) {
    if (!serverName || !uri) {
        throw new Error('Server name and resource URI are required for resource reads');
    }
    
    const result = await mcpManager.readResource(serverName, uri);
    
    return `Resource ${uri} from server ${serverName}:\n${JSON.stringify(result, null, 2)}`;
}

/**
 * Handles listing connected servers
 * @async
 * @param {McpClientManager} mcpManager - The MCP manager
 * @returns {Promise<string>} Connected servers list
 */
async function handleListServers(mcpManager) {
    const connectedServers = mcpManager.getConnectedServers();
    
    if (connectedServers.length === 0) {
        return 'No MCP servers currently connected.';
    }
    
    let result = 'Connected MCP Servers:\n\n';
    
    for (const serverName of connectedServers) {
        const client = mcpManager.getClient(serverName);
        const tools = client.getAvailableTools();
        const resources = client.getAvailableResources();
        const capabilities = client.getServerCapabilities();
        
        result += `Server: ${serverName}\n`;
        result += `  Tools: ${tools.length}\n`;
        result += `  Resources: ${resources.length}\n`;
        result += `  Capabilities: ${Object.keys(capabilities).join(', ')}\n\n`;
    }
    
    return result.trim();
}

/**
 * Enhanced capability discovery for AI planning
 * This returns MCP tools in a format that can be used directly by the AI planning system
 * @async
 * @param {string} userId - User ID
 * @returns {Promise<Object>} Enhanced MCP tools description for AI planning
 */
async function getMcpToolsForAI(userId = 'default') {
    try {
        const mcpManager = getMcpManager(userId);
        
        // Ensure we're connected to servers
        if (mcpManager.getConnectedServers().length === 0) {
            await mcpManager.connectToAllServers();
        }
        
        const allTools = mcpManager.getAllAvailableTools();
        const connectedServers = mcpManager.getConnectedServers();
        
        if (connectedServers.length === 0) {
            return {
                availableTools: {},
                summary: 'No MCP servers are currently connected. Configure MCP servers in settings to access external tools.',
                toolCount: 0
            };
        }
        
        const enhancedTools = {};
        let totalToolCount = 0;
        
        for (const [serverName, tools] of Object.entries(allTools)) {
            enhancedTools[serverName] = tools.map(tool => ({
                name: tool.name,
                description: tool.description,
                server: serverName,
                callFormat: `mcpClient: Call tool ${tool.name} from ${serverName} with args {...}`,
                inputSchema: tool.inputSchema,
                fullIdentifier: `${serverName}.${tool.name}`
            }));
            totalToolCount += tools.length;
        }
        
        return {
            availableTools: enhancedTools,
            summary: `${totalToolCount} MCP tools available across ${connectedServers.length} servers: ${connectedServers.join(', ')}`,
            toolCount: totalToolCount,
            connectedServers: connectedServers
        };
        
    } catch (error) {
        console.error('[MCP-Client] Failed to get MCP tools for AI:', error.message);
        return {
            availableTools: {},
            summary: 'Failed to retrieve MCP tools: ' + error.message,
            toolCount: 0,
            error: error.message
        };
    }
}

/**
 * Handles generic MCP tasks using AI to determine the best approach
 * @async
 * @param {McpClientManager} mcpManager - The MCP manager
 * @param {string} taskDescription - The task description
 * @param {string} otherAIData - Additional context
 * @returns {Promise<string>} Task result
 */
async function handleGenericMcpTask(mcpManager, taskDescription, otherAIData) {
    const connectedServers = mcpManager.getConnectedServers();
    
    if (connectedServers.length === 0) {
        return 'No MCP servers are currently connected. Please configure MCP servers in settings first.';
    }
    
    let result = `I can help you work with the following MCP servers and their capabilities:\n\n`;
    
    for (const serverName of connectedServers) {
        const client = mcpManager.getClient(serverName);
        const tools = client.getAvailableTools();
        const resources = client.getAvailableResources();
        
        result += `**${serverName}**:\n`;
        
        if (tools.length > 0) {
            result += `  Tools: ${tools.map(t => `${t.name} (${t.description})`).join(', ')}\n`;
        }
        
        if (resources.length > 0) {
            result += `  Resources: ${resources.length} available\n`;
        }
        
        result += '\n';
    }
    
    result += 'To use specific MCP functionality, you can ask me to:\n';
    result += '- List tools: "List tools from [server]"\n';
    result += '- Call tools: "Call tool [toolname] from [server] with args {...}"\n';
    result += '- Read resources: "Read resource [uri] from [server]"\n';
    result += '- List resources: "List resources from [server]"\n';
    
    return result;
}

// Export the main function and classes for use by the tool system
module.exports = {
    runTask,
    getAvailableTools,
    getMcpToolsForAI,
    McpClient,
    McpClientManager,
    getMcpManager,
    cleanupMcpManager
}; 