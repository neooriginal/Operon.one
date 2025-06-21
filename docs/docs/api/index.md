# API Reference

Operon.one provides a comprehensive REST API for integrating with external applications and services.

## Base URL

```
http://localhost:3000/api
```

## Authentication

All API requests require authentication using JWT tokens.

### Obtaining a Token

```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "user@example.com", "password": "password"}'
```

Response:

```json
{
  "success": true,
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": 1,
    "email": "user@example.com",
    "name": "User Name"
  }
}
```

### Using the Token

Include the token in the Authorization header:

```bash
curl -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  http://localhost:3000/api/tools
```

## Endpoints

### Authentication

#### POST /api/auth/register

Register a new user account.

**Request:**

```json
{
  "email": "user@example.com",
  "password": "securepassword",
  "name": "User Name"
}
```

**Response:**

```json
{
  "success": true,
  "message": "User registered successfully",
  "user": {
    "id": 1,
    "email": "user@example.com",
    "name": "User Name"
  }
}
```

#### POST /api/auth/login

Authenticate and obtain a JWT token.

#### POST /api/auth/logout

Invalidate the current session.

### Tools

#### GET /api/tools

List all available tools.

**Response:**

```json
{
  "success": true,
  "tools": [
    {
      "name": "webSearch",
      "description": "Search the web for information",
      "parameters": {
        "query": {
          "type": "string",
          "description": "Search query"
        }
      }
    }
  ]
}
```

#### POST /api/tools/execute

Execute a specific tool.

**Request:**

```json
{
  "tool": "webSearch",
  "parameters": {
    "query": "latest AI news"
  }
}
```

**Response:**

```json
{
  "success": true,
  "data": {
    "results": [
      {
        "title": "Latest AI News",
        "url": "https://example.com",
        "snippet": "Recent developments in AI..."
      }
    ]
  },
  "usage": {
    "tokens": 150,
    "cost": 0.02
  }
}
```

### User Management

#### GET /api/user/profile

Get current user profile.

#### PUT /api/user/profile

Update user profile.

#### GET /api/user/usage

Get user usage statistics.

### Admin Endpoints

#### GET /api/admin/users

List all users (admin only).

#### POST /api/admin/codes

Create redemption codes (admin only).

#### GET /api/admin/analytics

Get system analytics (admin only).

## WebSocket API

Operon.one supports real-time communication via WebSockets.

### Connection

```javascript
const socket = io("ws://localhost:3000", {
  auth: {
    token: "YOUR_JWT_TOKEN",
  },
});
```

### Events

#### tool:execute

Execute a tool in real-time.

```javascript
socket.emit("tool:execute", {
  tool: "webSearch",
  parameters: { query: "AI news" },
});
```

#### tool:result

Receive tool execution results.

```javascript
socket.on("tool:result", (data) => {
  console.log("Tool result:", data);
});
```

#### tool:progress

Receive progress updates during tool execution.

```javascript
socket.on("tool:progress", (data) => {
  console.log("Progress:", data.progress);
});
```

## Rate Limiting

API requests are rate-limited to prevent abuse:

- **Authenticated users**: 1000 requests per hour
- **Anonymous requests**: 100 requests per hour
- **Tool executions**: 50 per hour (varies by user tier)

## Error Handling

All API responses follow a consistent error format:

```json
{
  "success": false,
  "error": {
    "code": "TOOL_NOT_FOUND",
    "message": "The specified tool was not found",
    "details": {
      "tool": "invalidTool"
    }
  }
}
```

### Common Error Codes

| Code                    | Description                       |
| ----------------------- | --------------------------------- |
| `UNAUTHORIZED`          | Invalid or missing authentication |
| `FORBIDDEN`             | Insufficient permissions          |
| `TOOL_NOT_FOUND`        | Specified tool does not exist     |
| `INVALID_PARAMETERS`    | Tool parameters are invalid       |
| `RATE_LIMIT_EXCEEDED`   | Too many requests                 |
| `TOOL_EXECUTION_FAILED` | Tool execution error              |

## SDKs

### JavaScript/Node.js

```javascript
const OperonClient = require("@operon/client");

const client = new OperonClient({
  baseUrl: "http://localhost:3000",
  apiKey: "YOUR_API_KEY",
});

// Execute a tool
const result = await client.tools.execute("webSearch", {
  query: "AI developments",
});
```

### Python

```python
from operon import OperonClient

client = OperonClient(
    base_url='http://localhost:3000',
    api_key='YOUR_API_KEY'
)

# Execute a tool
result = client.tools.execute('webSearch', {
    'query': 'AI developments'
})
```

### cURL Examples

#### Search the Web

```bash
curl -X POST http://localhost:3000/api/tools/execute \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{"tool": "webSearch", "parameters": {"query": "AI news"}}'
```

#### Generate Code

```bash
curl -X POST http://localhost:3000/api/tools/execute \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{"tool": "codeGeneration", "parameters": {"language": "python", "description": "fibonacci function"}}'
```

## Webhooks

Configure webhooks to receive notifications about tool executions and system events.

### Configuration

```json
{
  "url": "https://your-app.com/webhook",
  "events": ["tool.completed", "tool.failed"],
  "secret": "webhook_secret"
}
```

### Payload

```json
{
  "event": "tool.completed",
  "timestamp": "2024-01-15T10:30:00Z",
  "data": {
    "tool": "webSearch",
    "user": "user@example.com",
    "result": {...}
  }
}
```

## Next Steps

- [**Getting Started**](../getting-started.md) - Set up your development environment
- [**Tool Development**](../tools/creating-tools.md) - Create custom tools
- [**Examples**](examples) - Real-world API usage examples
