const { spawn } = require('child_process');
const axios = require('axios');
const EventSource = require('eventsource');
const { v4: uuidv4 } = require('uuid');
const ai = require("../AI/ai");
const contextManager = require('../../utils/context');
const { mcpServerFunctions } = require('../../database');

// Cache of active STDIO MCP server processes
const activeStdioServers = {};

// Cache of active SSE connections
const activeSseConnections = {};

// Function to clean up stale MCP processes or connections
function cleanupStaleConnections(userId) {
  // Clean up stdio servers
  if (activeStdioServers[userId]) {
    Object.keys(activeStdioServers[userId]).forEach(serverId => {
      const serverProcess = activeStdioServers[userId][serverId];
      const lastActivity = serverProcess.lastActivity || 0;
      // Kill processes that have been inactive for more than 30 minutes
      if (Date.now() - lastActivity > 30 * 60 * 1000) {
        try {
          console.log(`Killing stale MCP server process for user ${userId}, server ${serverId}`);
          serverProcess.process.kill();
          delete activeStdioServers[userId][serverId];
        } catch (error) {
          console.error(`Error killing stale MCP server process: ${error.message}`);
        }
      }
    });
    
    // Remove the user entry if it's empty
    if (Object.keys(activeStdioServers[userId]).length === 0) {
      delete activeStdioServers[userId];
    }
  }
  
  // Close inactive SSE connections
  if (activeSseConnections[userId]) {
    Object.keys(activeSseConnections[userId]).forEach(serverId => {
      const connection = activeSseConnections[userId][serverId];
      const lastActivity = connection.lastActivity || 0;
      // Close connections that have been inactive for more than 30 minutes
      if (Date.now() - lastActivity > 30 * 60 * 1000) {
        try {
          console.log(`Closing stale MCP SSE connection for user ${userId}, server ${serverId}`);
          connection.eventSource.close();
          delete activeSseConnections[userId][serverId];
        } catch (error) {
          console.error(`Error closing stale MCP SSE connection: ${error.message}`);
        }
      }
    });
    
    // Remove the user entry if it's empty
    if (Object.keys(activeSseConnections[userId]).length === 0) {
      delete activeSseConnections[userId];
    }
  }
}

// Create or get an STDIO server process
async function getStdioServerProcess(userId, serverId) {
  // Initialize user's server map if not exists
  if (!activeStdioServers[userId]) {
    activeStdioServers[userId] = {};
  }
  
  // If already exists and is running, return it
  if (activeStdioServers[userId][serverId] && 
      activeStdioServers[userId][serverId].process &&
      !activeStdioServers[userId][serverId].process.killed) {
    
    // Update last activity timestamp
    activeStdioServers[userId][serverId].lastActivity = Date.now();
    return activeStdioServers[userId][serverId];
  }
  
  // Get server config from the database
  const server = await mcpServerFunctions.getMCPServerById(userId, serverId);
  
  if (!server || !server.enabled) {
    throw new Error(`MCP server not found or disabled: ${serverId}`);
  }
  
  if (server.type !== 'stdio') {
    throw new Error(`Server ${serverId} is not an STDIO server`);
  }
  
  // Validate command
  if (!server.command) {
    throw new Error(`STDIO server ${serverId} has no command`);
  }
  
  // Parse args if they're a string
  const args = Array.isArray(server.args) ? server.args : 
               (server.args ? JSON.parse(server.args) : []);
  
  // Parse environment variables
  const envVars = typeof server.envVars === 'object' ? server.envVars : 
                 (server.envVars ? JSON.parse(server.envVars) : {});
  
  // Combine environment variables with process.env
  const env = { ...process.env, ...envVars };
  
  // Spawn the process
  console.log(`Starting MCP STDIO server: ${server.command} ${args.join(' ')}`);
  const process = spawn(server.command, args, { 
    env,
    shell: true
  });
  
  // Create a queue for pending operations
  const operationQueue = [];
  let currentOperation = null;
  let buffer = '';
  
  // Store process info
  activeStdioServers[userId][serverId] = {
    process,
    lastActivity: Date.now(),
    operationQueue,
    currentOperation,
    buffer,
    server
  };
  
  // Set up event handlers
  process.stdout.on('data', (data) => {
    // Update last activity
    activeStdioServers[userId][serverId].lastActivity = Date.now();
    
    // Add to buffer
    buffer += data.toString();
    
    // Check if it's a complete JSON response
    if (buffer.includes('\n')) {
      const lines = buffer.split('\n');
      // Last line might be incomplete
      buffer = lines.pop();
      
      // Process each complete line
      for (const line of lines) {
        if (!line.trim()) continue;
        
        try {
          const response = JSON.parse(line);
          
          // If we have a current operation and it matches the id
          if (currentOperation && response.id === currentOperation.id) {
            if (response.error) {
              currentOperation.reject(new Error(response.error));
            } else {
              currentOperation.resolve(response);
            }
            
            // Move to next operation in queue
            currentOperation = operationQueue.shift() || null;
            if (currentOperation) {
              process.stdin.write(JSON.stringify(currentOperation.request) + '\n');
            }
          }
        } catch (error) {
          console.error(`Error parsing MCP server response: ${error.message}`);
          console.error(`Raw response: ${line}`);
          
          // If we have a current operation, reject it
          if (currentOperation) {
            currentOperation.reject(new Error(`Invalid JSON response from MCP server: ${error.message}`));
            currentOperation = operationQueue.shift() || null;
            if (currentOperation) {
              process.stdin.write(JSON.stringify(currentOperation.request) + '\n');
            }
          }
        }
      }
    }
  });
  
  process.stderr.on('data', (data) => {
    console.error(`MCP server stderr: ${data.toString()}`);
  });
  
  process.on('close', (code) => {
    console.log(`MCP server process exited with code ${code}`);
    
    // Reject any pending operations
    if (currentOperation) {
      currentOperation.reject(new Error(`MCP server process exited with code ${code}`));
    }
    
    for (const operation of operationQueue) {
      operation.reject(new Error(`MCP server process exited with code ${code}`));
    }
    
    // Remove from active servers
    delete activeStdioServers[userId][serverId];
    if (Object.keys(activeStdioServers[userId]).length === 0) {
      delete activeStdioServers[userId];
    }
  });
  
  process.on('error', (error) => {
    console.error(`MCP server process error: ${error.message}`);
    
    // Reject any pending operations
    if (currentOperation) {
      currentOperation.reject(error);
    }
    
    for (const operation of operationQueue) {
      operation.reject(error);
    }
  });
  
  // Wait for the server to initialize
  await new Promise((resolve, reject) => {
    // Set a timeout to avoid waiting forever
    const timeout = setTimeout(() => {
      reject(new Error('Timeout waiting for MCP server to initialize'));
    }, 10000);
    
    process.stdout.once('data', () => {
      clearTimeout(timeout);
      resolve();
    });
    
    process.on('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    
    process.on('close', (code) => {
      clearTimeout(timeout);
      if (code !== 0) {
        reject(new Error(`MCP server process exited with code ${code}`));
      } else {
        resolve();
      }
    });
  });
  
  return activeStdioServers[userId][serverId];
}

// Send a request to an STDIO server
async function sendStdioRequest(userId, serverId, request) {
  const serverProcess = await getStdioServerProcess(userId, serverId);
  
  // Create a unique ID for this request
  const id = uuidv4();
  request.id = id;
  
  return new Promise((resolve, reject) => {
    const operation = { id, request, resolve, reject };
    
    // If no operation is currently in progress, send this one
    if (!serverProcess.currentOperation) {
      serverProcess.currentOperation = operation;
      serverProcess.process.stdin.write(JSON.stringify(request) + '\n');
    } else {
      // Otherwise, add to queue
      serverProcess.operationQueue.push(operation);
    }
    
    // Set a timeout to avoid waiting forever
    const timeout = setTimeout(() => {
      // Remove from queue if still there
      const queueIndex = serverProcess.operationQueue.findIndex(op => op.id === id);
      if (queueIndex !== -1) {
        serverProcess.operationQueue.splice(queueIndex, 1);
      }
      
      // If it's the current operation, set to next in queue
      if (serverProcess.currentOperation && serverProcess.currentOperation.id === id) {
        serverProcess.currentOperation = serverProcess.operationQueue.shift() || null;
        if (serverProcess.currentOperation) {
          serverProcess.process.stdin.write(JSON.stringify(serverProcess.currentOperation.request) + '\n');
        }
      }
      
      reject(new Error('Timeout waiting for MCP server response'));
    }, 30000); // 30 second timeout
    
    // Modify the resolve to clear the timeout
    const originalResolve = operation.resolve;
    operation.resolve = (result) => {
      clearTimeout(timeout);
      originalResolve(result);
    };
    
    // Modify the reject to clear the timeout
    const originalReject = operation.reject;
    operation.reject = (error) => {
      clearTimeout(timeout);
      originalReject(error);
    };
  });
}

// Create or get an SSE connection
async function getSseConnection(userId, serverId) {
  // Initialize user's server map if not exists
  if (!activeSseConnections[userId]) {
    activeSseConnections[userId] = {};
  }
  
  // If already exists, return it
  if (activeSseConnections[userId][serverId] && 
      activeSseConnections[userId][serverId].eventSource &&
      activeSseConnections[userId][serverId].eventSource.readyState === EventSource.OPEN) {
    
    // Update last activity timestamp
    activeSseConnections[userId][serverId].lastActivity = Date.now();
    return activeSseConnections[userId][serverId];
  }
  
  // Get server config from the database
  const server = await mcpServerFunctions.getMCPServerById(userId, serverId);
  
  if (!server || !server.enabled) {
    throw new Error(`MCP server not found or disabled: ${serverId}`);
  }
  
  if (server.type !== 'sse') {
    throw new Error(`Server ${serverId} is not an SSE server`);
  }
  
  // Create event source for SSE
  const eventSource = new EventSource(server.endpoint);
  
  // Create a map to store pending requests
  const pendingRequests = new Map();
  
  // Set up event handlers
  eventSource.onmessage = (event) => {
    // Update last activity
    if (activeSseConnections[userId] && activeSseConnections[userId][serverId]) {
      activeSseConnections[userId][serverId].lastActivity = Date.now();
    }
    
    try {
      const response = JSON.parse(event.data);
      
      // If we have a pending request with this ID
      if (response.id && pendingRequests.has(response.id)) {
        const { resolve, reject, timeout } = pendingRequests.get(response.id);
        clearTimeout(timeout);
        
        if (response.error) {
          reject(new Error(response.error));
        } else {
          resolve(response);
        }
        
        pendingRequests.delete(response.id);
      }
    } catch (error) {
      console.error(`Error parsing SSE message: ${error.message}`);
    }
  };
  
  eventSource.onerror = (error) => {
    console.error(`SSE connection error: ${error.message || 'Unknown error'}`);
    
    // Reject all pending requests
    for (const [id, { reject, timeout }] of pendingRequests.entries()) {
      clearTimeout(timeout);
      reject(new Error(`SSE connection error: ${error.message || 'Unknown error'}`));
      pendingRequests.delete(id);
    }
    
    // Remove from active connections
    if (activeSseConnections[userId] && activeSseConnections[userId][serverId]) {
      delete activeSseConnections[userId][serverId];
      
      if (Object.keys(activeSseConnections[userId]).length === 0) {
        delete activeSseConnections[userId];
      }
    }
  };
  
  // Wait for connection to open
  await new Promise((resolve, reject) => {
    const openHandler = () => {
      eventSource.removeEventListener('open', openHandler);
      eventSource.removeEventListener('error', errorHandler);
      resolve();
    };
    
    const errorHandler = (error) => {
      eventSource.removeEventListener('open', openHandler);
      eventSource.removeEventListener('error', errorHandler);
      reject(new Error(`Failed to connect to SSE server: ${error.message || 'Unknown error'}`));
    };
    
    eventSource.addEventListener('open', openHandler);
    eventSource.addEventListener('error', errorHandler);
    
    // Set a timeout
    setTimeout(() => {
      eventSource.removeEventListener('open', openHandler);
      eventSource.removeEventListener('error', errorHandler);
      reject(new Error('Timeout connecting to SSE server'));
    }, 10000);
  });
  
  // Store connection
  activeSseConnections[userId][serverId] = {
    eventSource,
    pendingRequests,
    lastActivity: Date.now(),
    server
  };
  
  return activeSseConnections[userId][serverId];
}

// Send a request to an SSE server
async function sendSseRequest(userId, serverId, request) {
  const connection = await getSseConnection(userId, serverId);
  
  // Create a unique ID for this request
  const id = uuidv4();
  request.id = id;
  
  return new Promise((resolve, reject) => {
    // Set a timeout to avoid waiting forever
    const timeout = setTimeout(() => {
      if (connection.pendingRequests.has(id)) {
        connection.pendingRequests.delete(id);
        reject(new Error('Timeout waiting for SSE server response'));
      }
    }, 30000); // 30 second timeout
    
    // Store this request
    connection.pendingRequests.set(id, { resolve, reject, timeout });
    
    // Send the request
    axios.post(connection.server.endpoint, request)
      .catch(error => {
        if (connection.pendingRequests.has(id)) {
          clearTimeout(connection.pendingRequests.get(id).timeout);
          connection.pendingRequests.delete(id);
          reject(new Error(`Failed to send request to SSE server: ${error.message}`));
        }
      });
  });
}

// Get available tools from an MCP server
async function getServerTools(userId, serverId) {
  try {
    const server = await mcpServerFunctions.getMCPServerById(userId, serverId);
    
    if (!server || !server.enabled) {
      throw new Error(`MCP server not found or disabled: ${serverId}`);
    }
    
    const request = {
      type: 'listTools'
    };
    
    let response;
    if (server.type === 'stdio') {
      response = await sendStdioRequest(userId, serverId, request);
    } else if (server.type === 'sse') {
      response = await sendSseRequest(userId, serverId, request);
    } else {
      throw new Error(`Unknown server type: ${server.type}`);
    }
    
    return response.tools || [];
    
  } catch (error) {
    console.error(`Error getting tools from MCP server: ${error.message}`);
    throw error;
  }
}

// Call a tool on an MCP server
async function callServerTool(userId, serverId, toolName, params) {
  try {
    const server = await mcpServerFunctions.getMCPServerById(userId, serverId);
    
    if (!server || !server.enabled) {
      throw new Error(`MCP server not found or disabled: ${serverId}`);
    }
    
    const request = {
      type: 'toolCall',
      tool: toolName,
      params
    };
    
    let response;
    if (server.type === 'stdio') {
      response = await sendStdioRequest(userId, serverId, request);
    } else if (server.type === 'sse') {
      response = await sendSseRequest(userId, serverId, request);
    } else {
      throw new Error(`Unknown server type: ${server.type}`);
    }
    
    return response.result;
    
  } catch (error) {
    console.error(`Error calling tool on MCP server: ${error.message}`);
    throw error;
  }
}

// Main function to run the MCP task
async function runTask(taskDescription, inputData, callback, userId = 'default', chatId = 1) {
  try {
    // Initialize tool state
    let toolState = contextManager.getToolState('mcp', userId) || {
      history: [],
      servers: {},
      lastResults: null
    };
    
    // Store task in context
    toolState.currentTask = taskDescription;
    contextManager.setToolState('mcp', toolState, userId);
    
    // Clean up stale connections
    cleanupStaleConnections(userId);
    
    // Get all available MCP servers for the user
    const servers = await mcpServerFunctions.getMCPServers(userId);
    const enabledServers = servers.filter(server => server.enabled);
    
    if (enabledServers.length === 0) {
      const noServersResult = {
        success: false,
        error: "No enabled MCP servers found. Please add and enable MCP servers in your settings."
      };
      
      if (callback) callback(noServersResult);
      return noServersResult;
    }
    
    // Now let's have AI decide which server and tool to use based on the task
    const promptForAI = `
You are assisting with Model Context Protocol (MCP) server selection and tool usage. The user has the following task they want to accomplish:

Task: ${taskDescription}

Additional context/data from previous steps: ${inputData || 'None'}

The user has the following MCP servers available:
${enabledServers.map(server => 
`- Server ID: ${server.id}
  Name: ${server.name}
  Type: ${server.type}
  Description: ${server.description || 'No description provided'}`
).join('\n\n')}

Please determine:
1. Which MCP server would be most appropriate for this task
2. What tool and parameters to use

Output as JSON:
{
  "serverId": "ID of the selected server",
  "serverName": "Name of the selected server",
  "toolName": "Name of the tool to use",
  "parameters": {
    // Parameters to pass to the tool
  },
  "reasoning": "Brief explanation of your choice"
}
`;

    // Get AI recommendation
    const aiResponse = await ai.callAI(promptForAI, "", toolState.history || []);
    
    let serverId, toolName, parameters;
    
    try {
      // Extract information from AI response
      serverId = aiResponse.serverId;
      toolName = aiResponse.toolName;
      parameters = aiResponse.parameters || {};
      
      // Store AI reasoning in tool state
      toolState.lastRecommendation = {
        serverId,
        serverName: aiResponse.serverName,
        toolName,
        reasoning: aiResponse.reasoning
      };
      contextManager.setToolState('mcp', toolState, userId);
      
      console.log(`AI recommended using server ${serverId} with tool ${toolName}`);
      
    } catch (error) {
      // AI didn't return valid JSON, try to handle it gracefully
      console.error(`Error parsing AI recommendation: ${error.message}`);
      
      // If we have at least one server, use the first one
      if (enabledServers.length > 0) {
        serverId = enabledServers[0].id;
        
        // Get available tools for this server
        const tools = await getServerTools(userId, serverId);
        
        if (tools && tools.length > 0) {
          toolName = tools[0].name;
          parameters = {};
          
          console.log(`Using fallback server ${serverId} with tool ${toolName}`);
        } else {
          const noToolsResult = {
            success: false,
            error: `No tools available for server ${serverId}`
          };
          
          if (callback) callback(noToolsResult);
          return noToolsResult;
        }
      } else {
        const noServersResult = {
          success: false,
          error: "No enabled MCP servers found. Please add and enable MCP servers in your settings."
        };
        
        if (callback) callback(noServersResult);
        return noServersResult;
      }
    }
    
    // Call the tool on the selected server
    try {
      const result = await callServerTool(userId, serverId, toolName, parameters);
      
      // Store result in tool state
      toolState.lastResults = result;
      contextManager.setToolState('mcp', toolState, userId);
      
      // AI summary of the result
      const summaryPrompt = `
I need you to analyze and summarize the results from an MCP tool.

Task that was performed: ${taskDescription}

Tool used: ${toolName}
Server used: ${servers.find(s => s.id == serverId)?.name || serverId}

Raw result:
${JSON.stringify(result, null, 2)}

Please provide:
1. A clear summary of the results
2. Any key insights or findings
3. How well this addresses the original task

Format your response as a JSON object:
{
  "summary": "Summary of the results",
  "insights": "Any key insights or findings",
  "taskCompletion": "Assessment of how well this addresses the original task",
  "success": true
}
`;

      const aiSummary = await ai.callAI(summaryPrompt, "", []);
      
      // Save the AI summary to tool state
      toolState.lastSummary = aiSummary;
      contextManager.setToolState('mcp', toolState, userId);
      
      // Make sure it has a success flag
      aiSummary.success = true;
      
      if (callback) callback(aiSummary);
      return aiSummary;
      
    } catch (error) {
      console.error(`Error calling tool ${toolName} on server ${serverId}: ${error.message}`);
      
      const errorResult = {
        success: false,
        error: `Error calling tool: ${error.message}`
      };
      
      if (callback) callback(errorResult);
      return errorResult;
    }
    
  } catch (error) {
    console.error(`Error in MCP runTask: ${error.message}`);
    
    const errorResult = {
      success: false,
      error: `Error in MCP processing: ${error.message}`
    };
    
    if (callback) callback(errorResult);
    return errorResult;
  }
}

// Function to clean up resources when a user session ends
function cleanupUserResources(userId) {
  // Clean up stdio servers
  if (activeStdioServers[userId]) {
    Object.keys(activeStdioServers[userId]).forEach(serverId => {
      try {
        const serverProcess = activeStdioServers[userId][serverId];
        if (serverProcess && serverProcess.process) {
          serverProcess.process.kill();
        }
      } catch (error) {
        console.error(`Error killing MCP server process: ${error.message}`);
      }
    });
    
    delete activeStdioServers[userId];
  }
  
  // Clean up SSE connections
  if (activeSseConnections[userId]) {
    Object.keys(activeSseConnections[userId]).forEach(serverId => {
      try {
        const connection = activeSseConnections[userId][serverId];
        if (connection && connection.eventSource) {
          connection.eventSource.close();
        }
      } catch (error) {
        console.error(`Error closing MCP SSE connection: ${error.message}`);
      }
    });
    
    delete activeSseConnections[userId];
  }
}

module.exports = {
  runTask,
  cleanupUserResources,
  getServerTools,
  callServerTool
}; 