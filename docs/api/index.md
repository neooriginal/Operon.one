# API Reference

The Operon.one API provides programmatic access to all platform features, allowing you to integrate AI capabilities into your applications, automate workflows, and build custom solutions.

## Base URL

```
https://your-operon-instance.com/api
```

For local development:

```
http://localhost:3000/api
```

## Authentication

Operon.one uses JWT-based authentication. All API requests (except authentication endpoints) require a valid JWT token.

### Getting a Token

```http
POST /api/auth/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "your_password"
}
```

**Response:**

```json
{
  "success": true,
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": 1,
    "email": "user@example.com",
    "role": "user",
    "credits": 100
  }
}
```

### Using the Token

Include the token in the Authorization header:

```http
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

## API Endpoints

### Authentication

| Method | Endpoint                    | Description            |
| ------ | --------------------------- | ---------------------- |
| POST   | `/api/auth/register`        | Register new user      |
| POST   | `/api/auth/login`           | User login             |
| POST   | `/api/auth/logout`          | User logout            |
| POST   | `/api/auth/refresh`         | Refresh token          |
| POST   | `/api/auth/forgot-password` | Request password reset |
| POST   | `/api/auth/reset-password`  | Reset password         |

### User Management

| Method | Endpoint             | Description         |
| ------ | -------------------- | ------------------- |
| GET    | `/api/users/profile` | Get user profile    |
| PUT    | `/api/users/profile` | Update user profile |
| GET    | `/api/users/credits` | Get user credits    |
| POST   | `/api/users/redeem`  | Redeem credit code  |

### Tools

| Method | Endpoint             | Description           |
| ------ | -------------------- | --------------------- |
| GET    | `/api/tools`         | List available tools  |
| GET    | `/api/tools/:name`   | Get tool details      |
| POST   | `/api/tools/execute` | Execute a tool        |
| GET    | `/api/tools/history` | Get execution history |

### AI Chat

| Method | Endpoint            | Description          |
| ------ | ------------------- | -------------------- |
| POST   | `/api/chat`         | Send chat message    |
| GET    | `/api/chat/history` | Get chat history     |
| DELETE | `/api/chat/history` | Clear chat history   |
| POST   | `/api/chat/stream`  | Stream chat response |

### Admin (Admin only)

| Method | Endpoint               | Description            |
| ------ | ---------------------- | ---------------------- |
| GET    | `/api/admin/users`     | List all users         |
| PUT    | `/api/admin/users/:id` | Update user            |
| DELETE | `/api/admin/users/:id` | Delete user            |
| GET    | `/api/admin/codes`     | List redemption codes  |
| POST   | `/api/admin/codes`     | Create redemption code |
| DELETE | `/api/admin/codes/:id` | Delete redemption code |
| GET    | `/api/admin/stats`     | Get system statistics  |

## Request/Response Format

### Standard Response Format

All API responses follow this format:

```json
{
  "success": true,
  "data": {
    // Response data
  },
  "message": "Optional message",
  "timestamp": "2024-01-01T00:00:00Z"
}
```

### Error Response Format

```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human readable error message",
    "details": "Optional additional details"
  },
  "timestamp": "2024-01-01T00:00:00Z"
}
```

## Examples

### User Registration

```javascript
const response = await fetch("/api/auth/register", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    email: "user@example.com",
    password: "securepassword",
    name: "John Doe",
  }),
});

const data = await response.json();
```

### Execute a Tool

```javascript
const response = await fetch("/api/tools/execute", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  },
  body: JSON.stringify({
    tool: "webSearch",
    parameters: {
      query: "artificial intelligence news",
      limit: 5,
    },
  }),
});

const result = await response.json();
```

### Send Chat Message

```javascript
const response = await fetch("/api/chat", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  },
  body: JSON.stringify({
    message: "Search for the latest AI developments and summarize them",
    stream: false,
  }),
});

const chatResponse = await response.json();
```

### Stream Chat Response

```javascript
const response = await fetch("/api/chat/stream", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  },
  body: JSON.stringify({
    message: "Generate a Python script for data analysis",
  }),
});

const reader = response.body.getReader();
const decoder = new TextDecoder();

while (true) {
  const { done, value } = await reader.read();
  if (done) break;

  const chunk = decoder.decode(value);
  const lines = chunk.split("\n");

  for (const line of lines) {
    if (line.startsWith("data: ")) {
      const data = JSON.parse(line.slice(6));
      console.log(data);
    }
  }
}
```

## Rate Limiting

The API implements rate limiting to ensure fair usage:

- **Authentication**: 10 requests per minute
- **Chat**: 20 requests per minute
- **Tools**: 30 requests per minute
- **General**: 100 requests per minute

Rate limit headers are included in responses:

```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1640995200
```

## Error Codes

| Code                   | Description                  |
| ---------------------- | ---------------------------- |
| `INVALID_CREDENTIALS`  | Invalid email or password    |
| `USER_NOT_FOUND`       | User does not exist          |
| `INSUFFICIENT_CREDITS` | Not enough credits           |
| `TOOL_NOT_FOUND`       | Requested tool not available |
| `VALIDATION_ERROR`     | Request validation failed    |
| `RATE_LIMITED`         | Rate limit exceeded          |
| `UNAUTHORIZED`         | Invalid or missing token     |
| `FORBIDDEN`            | Insufficient permissions     |
| `INTERNAL_ERROR`       | Server error                 |

## WebSocket API

For real-time communication, Operon.one also provides a WebSocket API:

### Connection

```javascript
const socket = io("ws://localhost:3000", {
  auth: {
    token: "your-jwt-token",
  },
});
```

### Events

| Event            | Direction       | Description           |
| ---------------- | --------------- | --------------------- |
| `chat:message`   | Client → Server | Send chat message     |
| `chat:response`  | Server → Client | Receive chat response |
| `tool:execute`   | Client → Server | Execute tool          |
| `tool:result`    | Server → Client | Tool execution result |
| `credits:update` | Server → Client | Credit balance update |

### Example Usage

```javascript
// Send a chat message
socket.emit("chat:message", {
  message: "What is the weather like today?",
});

// Listen for responses
socket.on("chat:response", (data) => {
  console.log("AI Response:", data.message);
});

// Execute a tool
socket.emit("tool:execute", {
  tool: "webSearch",
  parameters: {
    query: "weather forecast",
  },
});

// Listen for tool results
socket.on("tool:result", (data) => {
  console.log("Tool Result:", data.result);
});
```

## SDK and Libraries

### JavaScript SDK

```bash
npm install @operon/sdk
```

```javascript
import { OperonClient } from "@operon/sdk";

const client = new OperonClient({
  baseUrl: "http://localhost:3000",
  apiKey: "your-api-key",
});

// Send a chat message
const response = await client.chat.send("Hello, world!");

// Execute a tool
const result = await client.tools.execute("webSearch", {
  query: "artificial intelligence",
});
```

### Python SDK

```bash
pip install operon-sdk
```

```python
from operon import OperonClient

client = OperonClient(
    base_url='http://localhost:3000',
    api_key='your-api-key'
)

# Send a chat message
response = client.chat.send('Hello, world!')

# Execute a tool
result = client.tools.execute('webSearch', {
    'query': 'artificial intelligence'
})
```

## Need Help?

- **API Documentation**: Detailed endpoint documentation
- **GitHub Issues**: Report bugs or request features
- **Community**: Join discussions and get help
- **Support**: Contact support for assistance
