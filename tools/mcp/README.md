# MCP (Model Context Protocol) Client Module

This module provides a comprehensive client implementation for connecting to and interacting with MCP (Model Context Protocol) servers. It allows the AI system to extend its capabilities by connecting to external tools and resources through the standardized MCP protocol.

## Overview

The MCP Client module enables Operon.one to:
- Connect to multiple MCP servers simultaneously
- Execute tools provided by MCP servers
- Read resources from MCP servers
- Access prompt templates from MCP servers
- Manage connections and handle errors gracefully
- Support user-specific configurations

## Architecture

### Core Components

- **McpClient**: Individual client for connecting to a single MCP server
- **McpClientManager**: Manages multiple MCP client connections for a user
- **Tool Integration**: Main entry point for the Operon.one tool system

### Features

- **Multi-server Support**: Connect to multiple MCP servers simultaneously
- **User Isolation**: Each user has their own MCP server configurations
- **Auto-discovery**: Automatically discover tools, resources, and prompts from servers
- **Error Handling**: Robust error handling with auto-restart capabilities
- **Context Management**: Integration with Operon.one's context management system
- **Database Integration**: Store and retrieve MCP configurations from the database

## Configuration

### Server Configuration Format

Each MCP server is configured using the following format:

```json
{
  "serverName": {
    "command": "command-to-run-server",
    "args": ["array", "of", "arguments"],
    "env": {
      "ENVIRONMENT_VARIABLE": "value"
    },
    "timeout": 30000,
    "autoRestart": false
  }
}
```

### Example Configurations

#### Python MCP Server
```json
{
  "weather-server": {
    "command": "python",
    "args": ["/path/to/weather-server.py"],
    "env": {
      "API_KEY": "your-weather-api-key"
    }
  }
}
```

#### Node.js MCP Server
```json
{
  "github-server": {
    "command": "node",
    "args": ["/path/to/github-server.js"],
    "env": {
      "GITHUB_TOKEN": "your-github-token"
    }
  }
}
```

#### NPX-based Server
```json
{
  "coolify": {
    "command": "npx",
    "args": ["-y", "@masonator/coolify-mcp"],
    "env": {
      "COOLIFY_ACCESS_TOKEN": "your-secret-token",
      "COOLIFY_BASE_URL": "https://your-coolify-instance.com"
    }
  }
}
```

## Usage

### Setting Up MCP Servers

1. **Through Settings UI**: Use the settings page in Operon.one to add, edit, or remove MCP servers
2. **Direct API**: Use the `/api/settings/mcpServers` endpoints to manage configurations programmatically

### Using MCP Tools in AI Tasks

The AI can interact with MCP servers through natural language commands:

#### List Available Tools
```
List tools from github-server
Show all available tools
```

#### Call a Tool
```
Call tool create-repository from github-server with args {"name": "my-new-repo", "private": true}
Use the weather tool to get forecast for San Francisco
```

#### Read Resources
```
Read resource file://README.md from filesystem-server
Get the contents of project-info from documentation-server
```

#### List Connected Servers
```
Show connected MCP servers
List all available MCP capabilities
```

### API Usage

#### Get MCP Servers
```javascript
// GET /api/settings/mcpServers
const response = await fetch('/api/settings/mcpServers', {
  headers: {
    'Authorization': `Bearer ${authToken}`
  }
});
const { mcpServers } = await response.json();
```

#### Save MCP Servers
```javascript
// POST /api/settings/mcpServers
const config = {
  "weather": {
    "command": "python",
    "args": ["weather-server.py"],
    "env": {
      "API_KEY": "your-key"
    }
  }
};

await fetch('/api/settings/mcpServers', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${authToken}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({ value: config })
});
```

## Development

### Code Structure

```
tools/mcp/
├── main.js          # Main module implementation
├── tool.json        # Tool configuration
└── README.md        # This documentation
```

### Key Classes and Methods

#### McpClient

- `connect()`: Connect to the MCP server
- `callTool(toolName, args)`: Execute a tool
- `readResource(uri)`: Read a resource
- `getPrompt(promptName, args)`: Get a prompt template
- `disconnect()`: Disconnect from the server

#### McpClientManager

- `loadServerConfigs()`: Load user's server configurations
- `connectToAllServers()`: Connect to all configured servers
- `callTool(serverName, toolName, args)`: Call tool on specific server
- `getAllAvailableTools()`: Get all tools from all servers

### Error Handling

The module includes comprehensive error handling:

- Connection timeouts
- Server process failures
- Invalid configurations
- Tool execution errors
- Network issues

### Logging

All operations are logged with appropriate prefixes:
- `[MCP-{serverName}]`: Server-specific operations
- `[MCP-Manager]`: Manager-level operations
- `[MCP-Client]`: General client operations

## Security Considerations

- **User Isolation**: Each user's MCP configurations are isolated
- **Environment Variables**: Sensitive data stored in environment variables
- **Validation**: All configurations are validated before use
- **Authentication**: All API endpoints require authentication

## Troubleshooting

### Common Issues

1. **Server Won't Start**
   - Check if the command and arguments are correct
   - Verify environment variables are set
   - Ensure the server script exists and is executable

2. **Connection Timeout**
   - Increase the timeout value in configuration
   - Check if the server is responding on stdout

3. **Tool Not Found**
   - Verify the tool exists on the server
   - Check if the server has been properly initialized

4. **Permission Errors**
   - Ensure the server process has necessary permissions
   - Check file system access rights

### Debug Mode

To enable debug logging, set the environment variable:
```bash
DEBUG=mcp:*
```

## Best Practices

1. **Configuration Management**
   - Use environment variables for sensitive data
   - Test configurations before deploying
   - Keep backup configurations

2. **Performance**
   - Use connection pooling for multiple requests
   - Implement proper timeout values
   - Monitor server resource usage

3. **Security**
   - Regularly update MCP server implementations
   - Use secure communication channels
   - Validate all inputs and outputs

## Supported MCP Servers

The client works with any standard MCP server implementation. Popular servers include:

- **Filesystem**: Access local files and directories
- **GitHub**: Interact with GitHub repositories
- **Weather**: Get weather information
- **Database**: Query databases
- **Web Search**: Perform web searches
- **API Clients**: Connect to various APIs

## Future Enhancements

- WebSocket transport support
- Server-sent events (SSE) transport
- Batch operation support
- Enhanced error recovery
- Performance monitoring
- Plugin system for custom transports

## Contributing

When contributing to the MCP client module:

1. Follow the existing code style and JSDoc conventions
2. Add appropriate error handling and logging
3. Update this documentation for any new features
4. Test with multiple MCP server implementations
5. Consider security implications of changes

## Resources

- [MCP Specification](https://modelcontextprotocol.io/)
- [MCP Client Development Guide](https://modelcontextprotocol.io/quickstart/client)
- [Available MCP Servers](https://github.com/modelcontextprotocol/servers)
- [Tool Development Guidelines](../../TOOL_DEVELOPMENT.md) 