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
 * @property {Object} [staticTools] - Static tool definitions without needing to start the server
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
 * @typedef {Object} ExecutionStep
 * @property {string} action - The action to perform (discover, call_tool, read_resource, etc.)
 * @property {string} [serverName] - Target server name
 * @property {string} [toolName] - Tool name for tool calls
 * @property {Object} [arguments] - Arguments for the action
 * @property {string} [uri] - URI for resource operations
 * @property {string} description - Human-readable description of the step
 * @property {Object} [result] - Result from executing this step
 * @property {boolean} [completed] - Whether this step has been completed
 * @memberof McpTypes
 */

/**
 * Generates usage hints for tools to guide AI interaction
 * @param {string} toolName - Name of the tool
 * @param {string} toolDescription - Description of the tool
 * @param {Object} inputSchema - Input schema of the tool
 * @returns {string} Usage hint for the AI
 */
function generateToolUsageHint(toolName, toolDescription, inputSchema) {
    const name = toolName.toLowerCase();
    const desc = toolDescription.toLowerCase();
    
    // Generate specific hints based on tool patterns
    if (name.includes('sequential') || name.includes('thinking') || desc.includes('think') || desc.includes('analyz')) {
        return `For thinking/analysis tools, provide the full question or topic to analyze as the main parameter. Example: "Analyze the meaning of life and existence"`;
    }
    
    if (name.includes('list') || desc.includes('list')) {
        return `For listing tools, usually no specific parameters needed. Just ask to "list" or "show" what you want to see.`;
    }
    
    if (name.includes('create') || name.includes('deploy') || desc.includes('create')) {
        return `For creation tools, specify what you want to create and any configuration details. Example: "Create a new web application with Node.js"`;
    }
    
    if (name.includes('status') || name.includes('health') || desc.includes('status')) {
        return `For status tools, specify what service or system you want to check. Example: "Check the status of my web servers"`;
    }
    
    // Generate hints based on parameters
    if (inputSchema && inputSchema.properties) {
        const params = Object.keys(inputSchema.properties);
        const hasThought = params.some(p => p.toLowerCase().includes('thought'));
        const hasQuery = params.some(p => p.toLowerCase().includes('query'));
        const hasText = params.some(p => p.toLowerCase().includes('text'));
        
        if (hasThought || hasQuery || hasText) {
            return `This tool expects text input. Provide your full question or statement naturally.`;
        }
        
        if (params.some(p => p.toLowerCase().includes('name'))) {
            return `This tool expects a name parameter. Include the name of what you're working with.`;
        }
    }
    
    return `Describe what you want to accomplish with this tool in natural language.`;
}

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
        this.staticTools = config.staticTools || [];
        this.lazyLoaded = false;
        this._setupErrorHandling();
    }

    /**
     * Gets available tools without starting the server (static mode)
     * @returns {McpTypes.McpTool[]} Array of available tools
     */
    getAvailableToolsStatic() {
        return [...this.staticTools];
    }

    /**
     * Gets available tools, connecting to server only if needed
     * @async
     * @param {boolean} [forceConnect=false] - Force connection to get live tools
     * @returns {Promise<McpTypes.McpTool[]>} Array of available tools
     */
    async getAvailableToolsLazy(forceConnect = false) {
        if (!forceConnect && this.staticTools.length > 0) {
            return [...this.staticTools];
        }
        
        if (!this.isConnected) {
            await this.connect();
        }
        
        return [...this.availableTools];
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
            if (this.isConnected) {
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
                    env: env,
                    shell: true
                });

                // Handle process events
                this.serverProcess.on('error', (error) => {
                    this._clearTimeout();
                    reject(new Error(`Failed to start server process: ${error.message}`));
                });

                this.serverProcess.on('exit', (code, signal) => {
                    this.isConnected = false;
                    this.emit('disconnected', { code, signal });
                    
                    if (this.config.autoRestart && code !== 0) {
                        setTimeout(() => this.connect(), 5000);
                    }
                });

                // Set up data handlers
                this.serverProcess.stdout.on('data', (data) => {
                    this._handleServerMessage(data);
                });

                this.serverProcess.stderr.on('data', (data) => {
                    // Keep stderr output
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
                } catch (error) {
                    // Continue without tools
                }
            }

            // List available resources
            if (this.serverCapabilities.resources) {
                try {
                    const resourcesResponse = await this._sendRequest('resources/list', {});
                    this.availableResources = resourcesResponse.resources || [];
                } catch (error) {
                    // Continue without resources
                }
            }

            // List available prompts
            if (this.serverCapabilities.prompts) {
                try {
                    const promptsResponse = await this._sendRequest('prompts/list', {});
                    this.availablePrompts = promptsResponse.prompts || [];
                } catch (error) {
                    // Continue without prompts
                }
            }

        } catch (error) {
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
            const response = await this._sendRequest('tools/call', {
                name: toolName,
                arguments: toolArgs
            });

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
            const response = await this._sendRequest('resources/read', {
                uri: uri
            });

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
            const response = await this._sendRequest('prompts/get', {
                name: promptName,
                arguments: promptArgs
            });

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
                    // Skip parsing errors
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
        switch (message.method) {
            case 'notifications/resources/list_changed':
                this._discoverCapabilities();
                break;
            case 'notifications/tools/list_changed':
                this._discoverCapabilities();
                break;
            case 'notifications/prompts/list_changed':
                this._discoverCapabilities();
                break;
            default:
                // Skip unknown notifications
        }
    }

    /**
     * Disconnects from the MCP server
     * @async
     */
    async disconnect() {
        try {
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
                    // Skip kill error
                }
                
                this.serverProcess = null;
            }
            
            this._updateContext({ 
                isConnected: false, 
                disconnectedAt: new Date().toISOString() 
            });
            
            this.emit('disconnected');
            
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
 * @class DynamicMcpExecutor
 * @description Handles dynamic, step-by-step execution of MCP operations
 */
class DynamicMcpExecutor {
    /**
     * Creates a dynamic MCP executor
     * @param {McpClientManager} mcpManager - The MCP client manager
     * @param {Function} stepCallback - Callback for step updates
     * @param {string} userId - User ID for context management
     */
    constructor(mcpManager, stepCallback, userId) {
        this.mcpManager = mcpManager;
        this.stepCallback = stepCallback;
        this.userId = userId;
        this.executionHistory = [];
        this.discoveredCapabilities = null;
    }

    /**
     * Discovers all available MCP capabilities (lazy loading mode)
     * @async
     * @returns {Promise<Object>} Complete capability discovery results
     */
    async discoverCapabilities() {
        this.logStep('Discovering MCP capabilities...');
        
        const capabilities = {
            servers: {},
            totalTools: 0,
            totalResources: 0,
            toolCategories: new Set(),
            serverSummary: []
        };
        
        // Use lazy loading to get tools without starting servers
        const allTools = await this.mcpManager.getAllAvailableToolsLazy();
        const connectedServers = this.mcpManager.getConnectedServers();
        const configuredServers = Object.keys(this.mcpManager.serverConfigs);
        
        this.logStep(`Found ${configuredServers.length} configured servers, ${connectedServers.length} already connected`);
        
        // Process tools from all configured servers (connected or static)
        for (const [serverName, tools] of Object.entries(allTools)) {
            const client = this.mcpManager.getClient(serverName);
            const isConnected = client && client.isServerConnected();
            
            let resources = [];
            let prompts = [];
            let serverCapabilities = {};
            
            if (isConnected) {
                resources = client.getAvailableResources();
                prompts = client.getAvailablePrompts();
                serverCapabilities = client.getServerCapabilities();
            }
            
            capabilities.servers[serverName] = {
                tools: tools.map(tool => ({
                    name: tool.name,
                    description: tool.description,
                    inputSchema: tool.inputSchema,
                    fullName: `${serverName}.${tool.name}`,
                    server: serverName,
                    isStatic: !isConnected
                })),
                resources: resources.map(resource => ({
                    name: resource.name,
                    uri: resource.uri,
                    description: resource.description,
                    mimeType: resource.mimeType,
                    server: serverName
                })),
                prompts: prompts.map(prompt => ({
                    name: prompt.name,
                    description: prompt.description,
                    arguments: prompt.arguments,
                    server: serverName
                })),
                capabilities: serverCapabilities,
                connectionStatus: isConnected ? 'connected' : 'configured'
            };
            
            capabilities.totalTools += tools.length;
            capabilities.totalResources += resources.length;
            
            // Categorize tools using centralized logic
            tools.forEach(tool => {
                const category = inferToolCategory(tool.name, tool.description);
                capabilities.toolCategories.add(category);
            });
            
            capabilities.serverSummary.push({
                name: serverName,
                toolCount: tools.length,
                resourceCount: resources.length,
                promptCount: prompts.length,
                mainCapabilities: Object.keys(serverCapabilities),
                connectionStatus: isConnected ? 'connected' : 'configured'
            });
            
            this.logStep(`Discovered ${tools.length} tools, ${resources.length} resources from ${serverName} (${isConnected ? 'connected' : 'static'})`);
        }
        
        capabilities.toolCategories = Array.from(capabilities.toolCategories);
        this.discoveredCapabilities = capabilities;
        
        this.logStep(`Discovery complete: ${capabilities.totalTools} total tools across ${Object.keys(allTools).length} servers (lazy mode)`);
        
        return capabilities;
    }

    /**
     * Plans execution steps based on task description and available capabilities
     * @async
     * @param {string} taskDescription - What the user wants to accomplish
     * @param {string} otherAIData - Additional context
     * @param {Object} capabilities - Discovered MCP capabilities
     * @returns {Promise<Array<ExecutionStep>>} Planned execution steps
     */
    async planExecution(taskDescription, otherAIData, capabilities) {
        this.logStep('Analyzing task and planning execution...');
        
        const plan = [];
        const taskLower = taskDescription.toLowerCase();
        
        // Dynamic planning based on available tools and task intent
        const relevantTools = this.findRelevantTools(taskDescription, capabilities);
        
        if (relevantTools.length === 0) {
            // If no specific tools found, provide discovery information
            plan.push({
                action: 'provide_capabilities',
                description: 'Provide available MCP capabilities to help with the task',
                arguments: { capabilities }
            });
        } else {
            // Create execution steps for relevant tools
            for (const tool of relevantTools) {
                const step = {
                    action: 'call_tool',
                    serverName: tool.server,
                    toolName: tool.name,
                    description: `Execute ${tool.name} on ${tool.server}: ${tool.description}`,
                    arguments: this.inferToolArguments(tool, taskDescription, otherAIData)
                };
                plan.push(step);
            }
        }
        
        this.logStep(`Planned ${plan.length} execution steps`);
        return plan;
    }

    /**
     * Finds tools relevant to the task description
     * @param {string} taskDescription - The task to accomplish
     * @param {Object} capabilities - Available capabilities
     * @returns {Array} Array of relevant tools
     */
    findRelevantTools(taskDescription, capabilities) {
        const relevantTools = [];
        const taskLower = taskDescription.toLowerCase();
        const taskWords = taskLower.split(/\s+/);
        
        // Search through all available tools
        for (const [serverName, serverInfo] of Object.entries(capabilities.servers)) {
            for (const tool of serverInfo.tools) {
                let relevanceScore = 0;
                
                // Check for exact matches in tool name
                if (taskWords.some(word => tool.name.toLowerCase().includes(word))) {
                    relevanceScore += 10;
                }
                
                // Check for matches in tool description
                const descriptionWords = tool.description.toLowerCase().split(/\s+/);
                const commonWords = taskWords.filter(word => 
                    descriptionWords.some(descWord => descWord.includes(word) || word.includes(descWord))
                );
                relevanceScore += commonWords.length * 2;
                
                // Semantic matching for common operations
                if (this.matchesOperation(taskLower, tool)) {
                    relevanceScore += 15;
                }
                
                // If this tool has a reasonable relevance score, include it
                if (relevanceScore >= 5) {
                    relevantTools.push({
                        ...tool,
                        relevanceScore
                    });
                }
            }
        }
        
        // Sort by relevance score and return top matches
        return relevantTools
            .sort((a, b) => b.relevanceScore - a.relevanceScore)
            .slice(0, 5); // Limit to top 5 most relevant tools
    }

    /**
     * Checks if a task description matches common operations for a tool
     * Uses dynamic categorization to determine if task and tool categories match
     * @param {string} taskLower - Lowercase task description
     * @param {Object} tool - Tool information
     * @returns {boolean} Whether the task matches the tool's operation
     */
    matchesOperation(taskLower, tool) {
        // Get the tool's category using centralized logic
        const toolCategory = inferToolCategory(tool.name, tool.description);
        
        // Dynamically infer what the user wants to do from their task description
        const taskCategories = [];
        
        // Retrieval operations
        if (taskLower.includes('list') || taskLower.includes('show') || taskLower.includes('get') || 
            taskLower.includes('find') || taskLower.includes('search') || taskLower.includes('view')) {
            taskCategories.push('retrieval');
        }
        
        // Creation operations
        if (taskLower.includes('create') || taskLower.includes('deploy') || taskLower.includes('start') || 
            taskLower.includes('make') || taskLower.includes('build') || taskLower.includes('setup')) {
            taskCategories.push('creation');
        }
        
        // Modification operations
        if (taskLower.includes('update') || taskLower.includes('modify') || taskLower.includes('change') || 
            taskLower.includes('edit') || taskLower.includes('configure') || taskLower.includes('adjust')) {
            taskCategories.push('modification');
        }
        
        // Deletion operations
        if (taskLower.includes('delete') || taskLower.includes('remove') || taskLower.includes('stop') || 
            taskLower.includes('destroy') || taskLower.includes('cleanup') || taskLower.includes('clear')) {
            taskCategories.push('deletion');
        }
        
        // Monitoring operations
        if (taskLower.includes('status') || taskLower.includes('info') || taskLower.includes('health') || 
            taskLower.includes('check') || taskLower.includes('monitor') || taskLower.includes('inspect')) {
            taskCategories.push('monitoring');
        }
        
        // If no specific category detected, consider general operations
        if (taskCategories.length === 0) {
            taskCategories.push('general');
        }
        
        // Check if tool category matches any of the inferred task categories
        return taskCategories.includes(toolCategory);
    }

    /**
     * Infers arguments for a tool based on task description and schema
     * @param {Object} tool - Tool information
     * @param {string} taskDescription - Task description
     * @param {string} otherAIData - Additional context
     * @returns {Object} Inferred arguments for the tool
     */
    inferToolArguments(tool, taskDescription, otherAIData) {
        const args = {};
        
        if (!tool.inputSchema || !tool.inputSchema.properties) {
            // No schema available, try to infer basic arguments
            return this.inferBasicArguments(taskDescription, otherAIData);
        }
        
        const combinedText = `${taskDescription} ${otherAIData}`;
        
        for (const [propName, propSchema] of Object.entries(tool.inputSchema.properties)) {
            const extractedValue = this.extractArgumentValue(propName, propSchema, combinedText);
            
            if (extractedValue !== null) {
                args[propName] = extractedValue;
            } else if (propSchema.required || (tool.inputSchema.required && tool.inputSchema.required.includes(propName))) {
                // Handle required parameters that couldn't be inferred
                args[propName] = this.getDefaultValueForSchema(propSchema, propName, combinedText);
            }
        }
        
        return args;
    }

    /**
     * Infers basic arguments when no schema is available
     * @param {string} taskDescription - Task description
     * @param {string} otherAIData - Additional context
     * @returns {Object} Basic inferred arguments
     */
    inferBasicArguments(taskDescription, otherAIData) {
        const args = {};
        const combinedText = `${taskDescription} ${otherAIData}`;
        
        // Look for common patterns
        
        // Check if the entire task description should be used as a 'thought' or 'query' parameter
        if (taskDescription.length > 10) {
            // For thinking/analysis tools, use the task description as the main input
            if (taskDescription.toLowerCase().includes('analyz') || 
                taskDescription.toLowerCase().includes('think') ||
                taskDescription.toLowerCase().includes('consider') ||
                taskDescription.toLowerCase().includes('explain')) {
                args.thought = taskDescription;
                args.query = taskDescription;
                args.text = taskDescription;
                args.input = taskDescription;
            }
        }
        
        // Extract quoted strings
        const quotedMatch = combinedText.match(/"([^"]+)"/);
        if (quotedMatch) {
            args.query = quotedMatch[1];
            args.text = quotedMatch[1];
            args.thought = quotedMatch[1];
        }
        
        // Extract names/IDs
        const nameMatch = combinedText.match(/(?:name|id)[:\s]+([a-zA-Z0-9_-]+)/i);
        if (nameMatch) {
            args.name = nameMatch[1];
            args.id = nameMatch[1];
        }
        
        return args;
    }

    /**
     * Gets a default value for a schema when extraction fails
     * @param {Object} propSchema - Property schema
     * @param {string} propName - Property name
     * @param {string} combinedText - Combined text for context
     * @returns {*} Default value
     */
    getDefaultValueForSchema(propSchema, propName, combinedText) {
        // For string types, use intelligent defaults
        if (propSchema.type === 'string') {
            // Common parameter names that should use the full task description
            if (['thought', 'query', 'text', 'input', 'message', 'content', 'prompt'].includes(propName.toLowerCase())) {
                return combinedText.trim();
            }
            
            // For name/id parameters, try to extract or use a default
            if (['name', 'id', 'identifier'].includes(propName.toLowerCase())) {
                const extracted = this.extractSimpleValue(combinedText, propName);
                return extracted || 'default';
            }
            
            // Use the description if available, otherwise a default
            return propSchema.description ? combinedText.trim() : '';
        }
        
        // For boolean types
        if (propSchema.type === 'boolean') {
            return propSchema.default !== undefined ? propSchema.default : false;
        }
        
        // For number types
        if (propSchema.type === 'number' || propSchema.type === 'integer') {
            return propSchema.default !== undefined ? propSchema.default : 0;
        }
        
        // For arrays
        if (propSchema.type === 'array') {
            return [];
        }
        
        // For objects
        if (propSchema.type === 'object') {
            return {};
        }
        
        // Default fallback
        return propSchema.default !== undefined ? propSchema.default : null;
    }

    /**
     * Extracts argument values from combined text based on schema
     * @param {string} propName - Property name
     * @param {Object} propSchema - Property schema
     * @param {string} combinedText - Combined task description and context
     * @returns {*} Extracted value or null
     */
    extractArgumentValue(propName, propSchema, combinedText) {
        const lowerText = combinedText.toLowerCase();
        const propNameLower = propName.toLowerCase();
        
        // For string properties - most important for tools like sequentialthinking
        if (propSchema.type === 'string') {
            // Special handling for common parameter names that should get the full text
            if (['thought', 'query', 'text', 'input', 'message', 'content', 'prompt', 'question'].includes(propNameLower)) {
                // Use the original task description for these parameters
                return combinedText.trim();
            }
            
            // Look for quoted strings first
            const quotedMatch = combinedText.match(/"([^"]+)"/);
            if (quotedMatch) {
                return quotedMatch[1];
            }
            
            // Look for property-specific patterns
            if (propNameLower.includes('name')) {
                const nameMatch = combinedText.match(/(?:name|named)[:\s]+([a-zA-Z0-9_-]+)/i);
                if (nameMatch) return nameMatch[1];
            }
            
            if (propNameLower.includes('id') || propNameLower.includes('identifier')) {
                const idMatch = combinedText.match(/(?:id|identifier)[:\s]+([a-zA-Z0-9_-]+)/i);
                if (idMatch) return idMatch[1];
            }
            
            if (propNameLower.includes('type')) {
                const typeMatch = combinedText.match(/(?:type|kind)[:\s]+([a-zA-Z0-9_-]+)/i);
                if (typeMatch) return typeMatch[1];
            }
            
            // If the description mentions what this parameter should contain, use the whole text
            if (propSchema.description) {
                const desc = propSchema.description.toLowerCase();
                if (desc.includes('text') || desc.includes('content') || desc.includes('message') || 
                    desc.includes('thought') || desc.includes('analysis') || desc.includes('input')) {
                    return combinedText.trim();
                }
            }
        }
        
        // For boolean properties
        if (propSchema.type === 'boolean') {
            // Check for explicit boolean values
            if (lowerText.includes('true') || lowerText.includes('yes') || 
                lowerText.includes('enable') || lowerText.includes('on')) {
                return true;
            }
            if (lowerText.includes('false') || lowerText.includes('no') || 
                lowerText.includes('disable') || lowerText.includes('off')) {
                return false;
            }
            
            // Property-specific boolean inference
            if (propNameLower.includes('enable') || propNameLower.includes('active')) {
                return !lowerText.includes('disable') && !lowerText.includes('inactive');
            }
        }
        
        // For number properties
        if (propSchema.type === 'number' || propSchema.type === 'integer') {
            const numberMatch = combinedText.match(/\b(\d+(?:\.\d+)?)\b/);
            if (numberMatch) {
                const value = parseFloat(numberMatch[1]);
                return propSchema.type === 'integer' ? Math.floor(value) : value;
            }
            
            // Check for named numbers
            const namedNumbers = {
                'one': 1, 'two': 2, 'three': 3, 'four': 4, 'five': 5,
                'six': 6, 'seven': 7, 'eight': 8, 'nine': 9, 'ten': 10
            };
            
            for (const [word, num] of Object.entries(namedNumbers)) {
                if (lowerText.includes(word)) {
                    return num;
                }
            }
        }
        
        // For array properties
        if (propSchema.type === 'array') {
            // Look for comma-separated values
            const listMatch = combinedText.match(/\[([^\]]+)\]/);
            if (listMatch) {
                return listMatch[1].split(',').map(item => item.trim());
            }
            
            // Look for comma-separated without brackets
            if (combinedText.includes(',')) {
                const items = combinedText.split(',').map(item => item.trim()).filter(item => item.length > 0);
                if (items.length > 1) {
                    return items;
                }
            }
        }
        
        return null;
    }

    /**
     * Extracts simple values using basic pattern matching
     * @param {string} text - Text to search
     * @param {string} propName - Property name to match
     * @returns {string|null} Extracted value or null
     */
    extractSimpleValue(text, propName) {
        const patterns = [
            new RegExp(`${propName}[:\\s]+([a-zA-Z0-9_-]+)`, 'i'),
            new RegExp(`([a-zA-Z0-9_-]+)\\s+${propName}`, 'i'),
            new RegExp(`"([^"]+)"`, 'i')
        ];
        
        for (const pattern of patterns) {
            const match = text.match(pattern);
            if (match) return match[1];
        }
        
        return null;
    }

    /**
     * Executes the planned steps one by one
     * @async
     * @param {Array<ExecutionStep>} executionPlan - Steps to execute
     * @returns {Promise<Array>} Results from each step
     */
    async executeSteps(executionPlan) {
        const results = [];
        
        for (let i = 0; i < executionPlan.length; i++) {
            const step = executionPlan[i];
            
            try {
                this.logStep(`Executing step ${i + 1}/${executionPlan.length}: ${step.description}`);
                
                let stepResult;
                
                switch (step.action) {
                    case 'call_tool':
                        stepResult = await this.executeToolCall(step);
                        break;
                    case 'read_resource':
                        stepResult = await this.executeResourceRead(step);
                        break;
                    case 'provide_capabilities':
                        stepResult = this.formatCapabilitiesResponse(step.arguments.capabilities);
                        break;
                    default:
                        stepResult = `Unknown action: ${step.action}`;
                }
                
                step.result = stepResult;
                step.completed = true;
                results.push(stepResult);
                
                this.logStep(`Step ${i + 1} completed successfully`);
                
            } catch (error) {
                const errorMsg = `Step ${i + 1} failed: ${error.message}`;
                this.logStep(errorMsg);
                
                step.result = errorMsg;
                step.completed = false;
                step.error = error.message;
                results.push(errorMsg);
                
                // Continue with remaining steps instead of failing completely
            }
        }
        
        return results;
    }

    /**
     * Executes a tool call step with enhanced error handling and validation
     * @async
     * @param {ExecutionStep} step - The step to execute
     * @returns {Promise<string>} Formatted result
     */
    async executeToolCall(step) {
        this.logStep(`Calling ${step.toolName} with arguments: ${JSON.stringify(step.arguments)}`);
        
        try {
            // Validate arguments before calling
            const validatedArgs = this.validateAndFixArguments(step);
            
            const result = await this.mcpManager.callTool(step.serverName, step.toolName, validatedArgs);
            
            // Format the result for better readability
            let formattedResult = `✅ Tool ${step.toolName} on ${step.serverName} executed successfully:\n\n`;
            
            if (result && result.content) {
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
            // Enhanced error handling with retry logic
            if (error.message.includes('must be a string') || error.message.includes('Invalid')) {
                this.logStep(`Parameter validation error, attempting to fix: ${error.message}`);
                return await this.retryToolCallWithFixedArgs(step, error);
            } else {
                throw error;
            }
        }
    }

    /**
     * Validates and fixes arguments before tool execution
     * @param {ExecutionStep} step - The execution step
     * @returns {Object} Validated and fixed arguments
     */
    validateAndFixArguments(step) {
        const args = { ...step.arguments };
        
        // Get the tool information to check its schema
        const client = this.mcpManager.getClient(step.serverName);
        if (!client) {
            return args;
        }
        
        const tools = client.getAvailableTools();
        const tool = tools.find(t => t.name === step.toolName);
        
        if (!tool || !tool.inputSchema || !tool.inputSchema.properties) {
            return args;
        }
        
        // Validate each argument against the schema
        for (const [propName, propSchema] of Object.entries(tool.inputSchema.properties)) {
            if (args[propName] !== undefined) {
                args[propName] = this.coerceToCorrectType(args[propName], propSchema);
            }
        }
        
        return args;
    }

    /**
     * Coerces a value to the correct type based on schema
     * @param {*} value - The value to coerce
     * @param {Object} schema - The property schema
     * @returns {*} Coerced value
     */
    coerceToCorrectType(value, schema) {
        if (schema.type === 'string') {
            return String(value);
        }
        
        if (schema.type === 'number') {
            const num = parseFloat(value);
            return isNaN(num) ? 0 : num;
        }
        
        if (schema.type === 'integer') {
            const num = parseInt(value);
            return isNaN(num) ? 0 : num;
        }
        
        if (schema.type === 'boolean') {
            if (typeof value === 'boolean') return value;
            if (typeof value === 'string') {
                return value.toLowerCase() === 'true' || value.toLowerCase() === 'yes';
            }
            return Boolean(value);
        }
        
        if (schema.type === 'array') {
            if (Array.isArray(value)) return value;
            if (typeof value === 'string') {
                try {
                    return JSON.parse(value);
                } catch {
                    return [value];
                }
            }
            return [value];
        }
        
        if (schema.type === 'object') {
            if (typeof value === 'object' && value !== null) return value;
            if (typeof value === 'string') {
                try {
                    return JSON.parse(value);
                } catch {
                    return { value };
                }
            }
            return { value };
        }
        
        return value;
    }

    /**
     * Retries tool call with fixed arguments after parameter error
     * @async
     * @param {ExecutionStep} step - The original step
     * @param {Error} originalError - The original error
     * @returns {Promise<string>} Result or error message
     */
    async retryToolCallWithFixedArgs(step, originalError) {
        try {
            // Get tool schema to understand what went wrong
            const client = this.mcpManager.getClient(step.serverName);
            const tools = client ? client.getAvailableTools() : [];
            const tool = tools.find(t => t.name === step.toolName);
            
            if (!tool) {
                return `❌ Tool ${step.toolName} not found on server ${step.serverName}`;
            }
            
            // Create new arguments based on the task description
            const taskDescription = this.executionHistory
                .find(entry => entry.message.includes('Analyzing task'))?.message || 'Task analysis';
            
            const newArgs = this.inferToolArguments(tool, taskDescription, '');
            
            this.logStep(`Retrying with inferred arguments: ${JSON.stringify(newArgs)}`);
            
            const result = await this.mcpManager.callTool(step.serverName, step.toolName, newArgs);
            
            return `✅ Tool ${step.toolName} executed successfully on retry:\n\n${JSON.stringify(result, null, 2)}`;
            
        } catch (retryError) {
            return `❌ Tool ${step.toolName} failed: ${originalError.message}\nRetry also failed: ${retryError.message}\n\nTool schema: ${JSON.stringify(tool?.inputSchema, null, 2)}`;
        }
    }

    /**
     * Executes a resource read step
     * @async
     * @param {ExecutionStep} step - The step to execute
     * @returns {Promise<string>} Formatted result
     */
    async executeResourceRead(step) {
        const result = await this.mcpManager.readResource(step.serverName, step.uri);
        return `Resource ${step.uri} from ${step.serverName}:\n${JSON.stringify(result, null, 2)}`;
    }

    /**
     * Formats capabilities for response with detailed parameter information
     * @param {Object} capabilities - Discovered capabilities
     * @returns {string} Formatted capabilities description
     */
    formatCapabilitiesResponse(capabilities) {
        let response = `🔍 Available MCP Capabilities:\n\n`;
        
        response += `📊 Summary: ${capabilities.totalTools} tools across ${Object.keys(capabilities.servers).length} servers\n\n`;
        
        for (const [serverName, serverInfo] of Object.entries(capabilities.servers)) {
            response += `🖥️  **${serverName}**:\n`;
            
            if (serverInfo.tools.length > 0) {
                response += `  🛠️  Tools (${serverInfo.tools.length}):\n`;
                serverInfo.tools.forEach(tool => {
                    response += `    • ${tool.name}: ${tool.description}\n`;
                    
                    // Show parameter information for better AI understanding
                    if (tool.inputSchema && tool.inputSchema.properties) {
                        const params = Object.entries(tool.inputSchema.properties);
                        if (params.length > 0) {
                            response += `      Parameters:\n`;
                            params.forEach(([paramName, paramSchema]) => {
                                const required = (tool.inputSchema.required || []).includes(paramName) ? ' (required)' : '';
                                const type = paramSchema.type || 'any';
                                const desc = paramSchema.description ? ` - ${paramSchema.description}` : '';
                                response += `        - ${paramName}: ${type}${required}${desc}\n`;
                            });
                        }
                    }
                    response += '\n';
                });
            }
            
            if (serverInfo.resources.length > 0) {
                response += `  📄 Resources (${serverInfo.resources.length}):\n`;
                serverInfo.resources.forEach(resource => {
                    response += `    • ${resource.name} (${resource.uri}): ${resource.description}\n`;
                });
                response += '\n';
            }
            
            if (serverInfo.prompts.length > 0) {
                response += `  💬 Prompts (${serverInfo.prompts.length}):\n`;
                serverInfo.prompts.forEach(prompt => {
                    response += `    • ${prompt.name}: ${prompt.description}\n`;
                });
                response += '\n';
            }
        }
        
        response += `\n🎯 Usage: Simply describe what you want to accomplish in natural language!\n`;
        response += `Examples:\n`;
        response += `• "Analyze the meaning of life" → I'll find thinking/analysis tools\n`;
        response += `• "List my servers" → I'll find and use server listing tools\n`;
        response += `• "Deploy a new app" → I'll find deployment tools\n`;
        response += `• "Check system status" → I'll use monitoring tools\n\n`;
        response += `The system will automatically:\n`;
        response += `✅ Discover the best tools for your request\n`;
        response += `✅ Infer the correct parameters from your description\n`;
        response += `✅ Execute tools step-by-step with detailed logging\n`;
        response += `✅ Handle errors and retry with corrected parameters\n`;
        
        return response;
    }

    /**
     * Logs a step in the execution history
     * @param {string} message - Message to log
     */
    logStep(message) {
        const logEntry = {
            timestamp: new Date().toISOString(),
            message: message
        };
        
        this.executionHistory.push(logEntry);
        
        // Also send as step callback
        if (this.stepCallback) {
            this.stepCallback({ success: true, result: message });
        }
    }

    /**
     * Gets the execution history
     * @returns {Array} Array of execution history entries
     */
    getExecutionHistory() {
        return [...this.executionHistory];
    }

    /**
     * Generates usage hints for tools to guide AI interaction
     * @param {string} toolName - Name of the tool
     * @param {string} toolDescription - Description of the tool
     * @param {Object} inputSchema - Input schema of the tool
     * @returns {string} Usage hint for the AI
     */
    generateUsageHint(toolName, toolDescription, inputSchema) {
        return generateToolUsageHint(toolName, toolDescription, inputSchema);
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
        
        /** @type {boolean} */
        this.lazyMode = true;
        
        /** @type {Object.<string, McpTypes.McpTool[]>} */
        this.staticToolsCache = {};
    }

    /**
     * Sets lazy loading mode
     * @param {boolean} enabled - Whether to enable lazy loading
     */
    setLazyMode(enabled) {
        this.lazyMode = enabled;
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
            } else {
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
     * Gets available tools without starting servers (lazy mode)
     * @async
     * @returns {Promise<Object.<string, McpTypes.McpTool[]>>} Map of server names to their tools
     */
    async getAllAvailableToolsLazy() {
        await this.loadServerConfigs();
        
        const allTools = {};
        
        // First, get tools from already connected servers
        for (const [serverName, client] of this.clients) {
            if (client.isServerConnected()) {
                allTools[serverName] = client.getAvailableTools();
            }
        }
        
        // Then, get static tools from configured servers (without connecting)
        for (const [serverName, config] of Object.entries(this.serverConfigs)) {
            if (!allTools[serverName] && config.staticTools) {
                allTools[serverName] = config.staticTools;
                this.staticToolsCache[serverName] = config.staticTools;
            }
        }
        
        return allTools;
    }

    /**
     * Ensures a server connection exists, connecting only when needed
     * @async
     * @param {string} serverName - Name of the server
     * @returns {Promise<McpClient>} The MCP client
     */
    async ensureConnection(serverName) {
        let client = this.clients.get(serverName);
        
        if (!client || !client.isServerConnected()) {
            client = await this.connectToServer(serverName);
        }
        
        return client;
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
     * Calls a tool on a specific server (with lazy connection)
     * @async
     * @param {string} serverName - Name of the server
     * @param {string} toolName - Name of the tool
     * @param {Object} [toolArgs={}] - Tool arguments
     * @returns {Promise<Object>} Tool execution result
     * @throws {Error} When server not configured or tool call fails
     */
    async callTool(serverName, toolName, toolArgs = {}) {
        // Ensure connection exists (lazy loading)
        const client = await this.ensureConnection(serverName);
        
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
// Legacy getAvailableTools function removed - replaced by enhanced version below

/**
 * Dynamic MCP Task Executor - Works step-by-step autonomously
 * @async
 * @param {string} taskDescription - Description of the task to perform
 * @param {string} otherAIData - Additional context from other AI tools
 * @param {Function} stepCallback - Callback function for step updates
 * @param {string} [userId='default'] - User ID for context management
 * @param {string} [chatId='1'] - Chat ID for context management
 * @returns {Promise<Object>} Task execution result
 */
async function runTask(taskDescription, otherAIData, stepCallback, userId = 'default', chatId = '1') {
    try {
        const mcpManager = getMcpManager(userId);
        const executor = new DynamicMcpExecutor(mcpManager, stepCallback, userId);
        
        // Step 1: Initialize and discover capabilities
        stepCallback({ success: true, result: 'Step 1: Discovering MCP capabilities...' });
        const capabilities = await executor.discoverCapabilities();
        
        if (capabilities.totalTools === 0) {
            return {
                success: true,
                data: 'No MCP servers are connected. Please configure MCP servers in settings to access external tools.',
                steps: executor.getExecutionHistory()
            };
        }
        
        // Step 2: Plan execution based on discovered capabilities
        stepCallback({ success: true, result: `Step 2: Planning execution with ${capabilities.totalTools} available tools...` });
        const executionPlan = await executor.planExecution(taskDescription, otherAIData, capabilities);
        
        // Step 3: Execute the plan step by step
        stepCallback({ success: true, result: `Step 3: Executing ${executionPlan.length} planned steps...` });
        const results = await executor.executeSteps(executionPlan);
        
        // Update context with execution history
        const toolState = contextManager.getToolState('mcpClient', userId) || {};
        toolState.lastExecution = {
            taskDescription,
            capabilities,
            executionPlan,
            results,
            executionHistory: executor.getExecutionHistory(),
            timestamp: new Date().toISOString()
        };
        contextManager.setToolState('mcpClient', toolState, userId);
        
        stepCallback({ success: true, result: 'Task completed successfully!' });
        
        return {
            success: true,
            data: results,
            capabilities,
            executionPlan,
            executionHistory: executor.getExecutionHistory()
        };
        
    } catch (error) {
        console.error('[MCP-Dynamic] Task execution failed:', error.message);
        console.error('[MCP-Dynamic] Error stack:', error.stack);
        
        stepCallback({ success: false, error: error.message });
        
        return {
            success: false,
            error: error.message,
            taskDescription
        };
    }
}

/**
 * Enhanced getAvailableTools for AI planning - lazy loading mode
 * @async
 * @param {string} [userId='default'] - User ID for context management
 * @param {boolean} [forceConnect=false] - Force connection to all servers
 * @returns {Promise<Object>} Available tools organized by server with full metadata
 */
async function getAvailableTools(userId = 'default', forceConnect = false) {
    try {
        const mcpManager = getMcpManager(userId);
        
        if (forceConnect) {
            // Old behavior: connect to all servers
            const executor = new DynamicMcpExecutor(mcpManager, () => {}, userId);
            const capabilities = await executor.discoverCapabilities();
            
            // Format for AI planning with enhanced metadata
            const toolsForAI = {};
            
            for (const [serverName, serverInfo] of Object.entries(capabilities.servers)) {
                toolsForAI[serverName] = serverInfo.tools.map(tool => ({
                    name: tool.name,
                    description: tool.description,
                    server: serverName,
                    fullName: tool.fullName,
                    inputSchema: tool.inputSchema,
                    callFormat: `Use MCP tool: ${tool.description}`,
                    category: inferToolCategory(tool.name, tool.description),
                    isStatic: tool.isStatic
                }));
            }
            
            return {
                tools: toolsForAI,
                summary: `${capabilities.totalTools} MCP tools available across ${Object.keys(capabilities.servers).length} servers`,
                capabilities: capabilities,
                totalTools: capabilities.totalTools,
                connectedServers: Object.keys(capabilities.servers),
                lazyMode: false
            };
        } else {
            // New behavior: lazy loading
            const allTools = await mcpManager.getAllAvailableToolsLazy();
            const toolsForAI = {};
            let totalTools = 0;
            
            for (const [serverName, tools] of Object.entries(allTools)) {
                toolsForAI[serverName] = tools.map(tool => ({
                    name: tool.name,
                    description: tool.description,
                    server: serverName,
                    fullName: `${serverName}.${tool.name}`,
                    inputSchema: tool.inputSchema,
                    callFormat: `Use MCP tool: ${tool.description}`,
                    category: inferToolCategory(tool.name, tool.description),
                    isStatic: !mcpManager.clients.has(serverName)
                }));
                totalTools += tools.length;
            }
            
            return {
                tools: toolsForAI,
                summary: `${totalTools} MCP tools available across ${Object.keys(allTools).length} servers (lazy mode)`,
                totalTools: totalTools,
                connectedServers: mcpManager.getConnectedServers(),
                configuredServers: Object.keys(allTools),
                lazyMode: true
            };
        }
        
    } catch (error) {
        console.error('[MCP-Lazy] Failed to get available tools:', error.message);
        return {
            tools: {},
            summary: 'Failed to retrieve MCP tools: ' + error.message,
            totalTools: 0,
            error: error.message,
            lazyMode: true
        };
    }
}

/**
 * Infers the category of a tool based on its name and description
 * @param {string} toolName - The tool name
 * @param {string} toolDescription - The tool description
 * @returns {string} Inferred category
 */
function inferToolCategory(toolName, toolDescription) {
    const name = toolName.toLowerCase();
    const desc = toolDescription.toLowerCase();
    
    if (name.includes('list') || name.includes('get') || desc.includes('list') || desc.includes('retrieve')) {
        return 'retrieval';
    }
    if (name.includes('create') || name.includes('deploy') || name.includes('start') || desc.includes('create') || desc.includes('deploy')) {
        return 'creation';
    }
    if (name.includes('update') || name.includes('modify') || name.includes('edit') || desc.includes('update') || desc.includes('modify')) {
        return 'modification';
    }
    if (name.includes('delete') || name.includes('remove') || name.includes('stop') || desc.includes('delete') || desc.includes('remove')) {
        return 'deletion';
    }
    if (name.includes('status') || name.includes('health') || name.includes('info') || desc.includes('status') || desc.includes('monitor')) {
        return 'monitoring';
    }
    
    return 'general';
}

/**
 * Enhanced capability discovery for AI planning
 * This returns MCP tools in a format that can be used directly by the AI planning system
 * @async
 * @param {string} userId - User ID
 * @returns {Promise<Object>} Enhanced MCP tools description for AI planning
 */
async function getMcpToolsForAI(userId = 'default', forceConnect = false) {
    try {
        const mcpManager = getMcpManager(userId);
        
        // Use lazy loading by default
        const allTools = await mcpManager.getAllAvailableToolsLazy();
        
        if (Object.keys(allTools).length === 0) {
            return {
                availableTools: {},
                summary: 'No MCP servers are currently configured. Configure MCP servers in settings to access external tools.',
                toolCount: 0,
                lazyMode: true
            };
        }
        
        const enhancedTools = {};
        let totalTools = 0;
        
        for (const [serverName, tools] of Object.entries(allTools)) {
            enhancedTools[serverName] = tools.map(tool => {
                // Create a detailed parameter guide for the AI
                let parameterGuide = '';
                let requiredParams = [];
                
                if (tool.inputSchema && tool.inputSchema.properties) {
                    const params = Object.entries(tool.inputSchema.properties);
                    parameterGuide = params.map(([name, schema]) => {
                        const required = (tool.inputSchema.required || []).includes(name);
                        if (required) requiredParams.push(name);
                        
                        const type = schema.type || 'any';
                        const desc = schema.description || 'No description';
                        return `${name} (${type}${required ? ', required' : ''}): ${desc}`;
                    }).join('; ');
                }
                
                return {
                    name: tool.name,
                    description: tool.description,
                    server: serverName,
                    callFormat: `To use this tool, describe your task naturally. The system will automatically extract the right parameters.`,
                    inputSchema: tool.inputSchema,
                    fullIdentifier: `${serverName}.${tool.name}`,
                    category: inferToolCategory(tool.name, tool.description),
                    parameterGuide: parameterGuide,
                    requiredParameters: requiredParams,
                    usageHint: generateToolUsageHint(tool.name, tool.description, tool.inputSchema),
                    isStatic: !mcpManager.clients.has(serverName)
                };
            });
            totalTools += tools.length;
        }
        
        const connectedServers = mcpManager.getConnectedServers();
        const configuredServers = Object.keys(allTools);
        
        return {
            availableTools: enhancedTools,
            summary: `${totalTools} MCP tools available across ${configuredServers.length} servers: ${configuredServers.join(', ')} (${connectedServers.length} connected, ${configuredServers.length - connectedServers.length} configured only)`,
            toolCount: totalTools,
            connectedServers: connectedServers,
            configuredServers: configuredServers,
            lazyMode: true
        };
        
    } catch (error) {
        console.error('[MCP-Lazy] Failed to get MCP tools for AI:', error.message);
        return {
            availableTools: {},
            summary: 'Failed to retrieve MCP tools: ' + error.message,
            toolCount: 0,
            error: error.message,
            lazyMode: true
        };
    }
}

// All legacy handler functions and hardcoded patterns removed
// MCP tool now operates dynamically through DynamicMcpExecutor

/**
 * LAZY-LOADING MCP TOOL ARCHITECTURE
 * ==================================
 * 
 * This tool now operates with lazy loading for optimal performance and resource management:
 * 
 * 1. LAZY DISCOVERY PHASE: Discovers tools from static configs without starting servers
 * 2. ON-DEMAND CONNECTION: Only connects to MCP servers when tools are actually called
 * 3. PLANNING PHASE: Uses semantic matching to find relevant tools for user requests  
 * 4. EXECUTION PHASE: Executes tools step-by-step, connecting servers as needed
 * 5. AUTONOMOUS OPERATION: Can chain multiple tools together to accomplish complex tasks
 * 
 * Key Features:
 * - **LAZY LOADING**: Servers only start when tools are actually called
 * - **STATIC TOOL DISCOVERY**: Functions can be retrieved without starting servers
 * - No hardcoded task parsing patterns
 * - Dynamic tool discovery and execution
 * - Step-by-step execution with detailed logging
 * - Intelligent parameter inference from natural language
 * - Automatic type coercion and validation
 * - Error handling with automatic retry and parameter fixing
 * - Fault-tolerant execution (continues on errors)
 * - Full execution history tracking
 * - Schema-aware parameter mapping
 * 
 * LAZY LOADING MODES:
 * - **Static Mode**: Tools retrieved from configuration without server startup
 * - **Connected Mode**: Live tools from already connected servers
 * - **On-Demand Mode**: Servers start only when specific tools are called
 * 
 * PARAMETER HANDLING:
 * - Automatically detects parameter types from tool schemas
 * - Infers arguments from natural language descriptions
 * - Special handling for common parameters (thought, query, text, etc.)
 * - Type coercion ensures correct data types (string, number, boolean, array, object)
 * - Automatic retry with corrected parameters on validation errors
 * - Detailed parameter guides for AI interaction
 * 
 * Usage: Simply describe what you want to accomplish and the tool will:
 * - Discover available MCP capabilities from static configs (no server startup)
 * - Plan the best approach using available tools
 * - Start servers only when tools are actually needed
 * - Automatically infer correct parameters from your description
 * - Execute tools with proper type validation
 * - Retry with corrected parameters if validation fails
 * - Provide detailed results and execution history
 */

// Export the main function and classes for use by the tool system
module.exports = {
    runTask,
    getAvailableTools,
    getMcpToolsForAI,
    McpClient,
    McpClientManager,
    DynamicMcpExecutor,
    getMcpManager,
    cleanupMcpManager,
    generateToolUsageHint,
    inferToolCategory
}; 