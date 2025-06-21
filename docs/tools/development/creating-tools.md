# Creating Custom Tools

This guide will walk you through creating custom tools for Operon.one. Tools are the building blocks that give the AI its "action" capabilities.

## Tool Structure

Every tool in Operon.one follows a standardized structure defined in two files:

1. **`tool.json`** - Tool metadata and configuration
2. **`main.js`** (or `index.js`) - Tool implementation

### Basic File Structure

```
tools/
└── yourTool/
    ├── tool.json
    ├── main.js
    ├── package.json (optional)
    └── README.md (optional)
```

## Creating Your First Tool

Let's create a simple "Hello World" tool:

### 1. Create the Tool Directory

```bash
mkdir tools/helloWorld
cd tools/helloWorld
```

### 2. Create tool.json

```json
{
  "name": "helloWorld",
  "description": "A simple hello world tool that greets users",
  "version": "1.0.0",
  "author": "Your Name",
  "category": "utility",
  "parameters": {
    "name": {
      "type": "string",
      "description": "The name to greet",
      "required": true,
      "default": "World"
    },
    "greeting": {
      "type": "string",
      "description": "Custom greeting message",
      "required": false,
      "default": "Hello"
    }
  },
  "examples": [
    {
      "description": "Simple hello world",
      "parameters": {
        "name": "World"
      }
    },
    {
      "description": "Custom greeting",
      "parameters": {
        "name": "Alice",
        "greeting": "Hi"
      }
    }
  ],
  "permissions": [],
  "dependencies": [],
  "timeout": 5000
}
```

### 3. Create main.js

```javascript
async function execute(parameters, context) {
  try {
    const { name = "World", greeting = "Hello" } = parameters;

    // Validate parameters
    if (!name || typeof name !== "string") {
      throw new Error("Name parameter must be a non-empty string");
    }

    // Tool logic
    const message = `${greeting}, ${name}!`;
    const timestamp = new Date().toISOString();

    // Return result
    return {
      success: true,
      message: message,
      data: {
        greeting: message,
        timestamp: timestamp,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
    };
  }
}

module.exports = { execute };
```

## Tool Configuration (tool.json)

### Required Fields

| Field         | Type   | Description            |
| ------------- | ------ | ---------------------- |
| `name`        | string | Unique tool identifier |
| `description` | string | Brief tool description |
| `version`     | string | Tool version (semver)  |
| `parameters`  | object | Tool parameters schema |

### Optional Fields

| Field          | Type   | Description            |
| -------------- | ------ | ---------------------- |
| `author`       | string | Tool author            |
| `category`     | string | Tool category          |
| `examples`     | array  | Usage examples         |
| `permissions`  | array  | Required permissions   |
| `dependencies` | array  | External dependencies  |
| `timeout`      | number | Execution timeout (ms) |
| `icon`         | string | Tool icon URL          |
| `tags`         | array  | Tool tags              |

### Parameter Types

Parameters support various types:

```json
{
  "parameters": {
    "stringParam": {
      "type": "string",
      "description": "A string parameter",
      "required": true,
      "minLength": 1,
      "maxLength": 100,
      "pattern": "^[a-zA-Z]+$"
    },
    "numberParam": {
      "type": "number",
      "description": "A number parameter",
      "required": false,
      "min": 0,
      "max": 100,
      "default": 50
    },
    "booleanParam": {
      "type": "boolean",
      "description": "A boolean parameter",
      "default": false
    },
    "arrayParam": {
      "type": "array",
      "description": "An array parameter",
      "items": {
        "type": "string"
      },
      "minItems": 1,
      "maxItems": 10
    },
    "objectParam": {
      "type": "object",
      "description": "An object parameter",
      "properties": {
        "key1": {
          "type": "string",
          "required": true
        },
        "key2": {
          "type": "number",
          "default": 0
        }
      }
    },
    "enumParam": {
      "type": "string",
      "description": "An enum parameter",
      "enum": ["option1", "option2", "option3"],
      "default": "option1"
    }
  }
}
```

## Tool Implementation (main.js)

### Function Signature

```javascript
async function execute(parameters, context) {
  // Tool implementation
  return result;
}
```

### Parameters

- **`parameters`**: Object containing validated input parameters
- **`context`**: Execution context with user info, permissions, etc.

```javascript
// Context object structure
const context = {
  user: {
    id: 123,
    email: "user@example.com",
    role: "user",
    credits: 100,
  },
  permissions: ["read", "write"],
  sessionId: "session-123",
  requestId: "req-456",
  timestamp: "2024-01-01T00:00:00Z",
};
```

### Return Value

Tools must return an object with the following structure:

```javascript
// Success response
return {
  success: true,
  message: "Operation completed successfully",
  data: {
    // Tool-specific data
  },
};

// Error response
return {
  success: false,
  error: "Error message",
  details: "Optional error details",
};
```

## Advanced Examples

### File Processing Tool

```json
{
  "name": "fileProcessor",
  "description": "Process text files with various operations",
  "parameters": {
    "operation": {
      "type": "string",
      "enum": ["count", "uppercase", "lowercase", "reverse"],
      "description": "Operation to perform"
    },
    "filePath": {
      "type": "string",
      "description": "Path to the file to process"
    }
  },
  "permissions": ["filesystem:read"]
}
```

```javascript
const fs = require("fs").promises;
const path = require("path");

async function execute(parameters, context) {
  try {
    const { operation, filePath } = parameters;

    // Security check
    if (!context.permissions.includes("filesystem:read")) {
      throw new Error("Insufficient permissions");
    }

    // Validate file path
    const safePath = path.resolve(filePath);
    if (!safePath.startsWith("/allowed/directory/")) {
      throw new Error("File path not allowed");
    }

    // Read file
    const content = await fs.readFile(safePath, "utf8");

    // Process content
    let result;
    switch (operation) {
      case "count":
        result = {
          words: content.split(/\s+/).length,
          characters: content.length,
          lines: content.split("\n").length,
        };
        break;
      case "uppercase":
        result = content.toUpperCase();
        break;
      case "lowercase":
        result = content.toLowerCase();
        break;
      case "reverse":
        result = content.split("").reverse().join("");
        break;
      default:
        throw new Error("Invalid operation");
    }

    return {
      success: true,
      data: {
        operation,
        result,
        originalLength: content.length,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
    };
  }
}

module.exports = { execute };
```

### API Integration Tool

```javascript
const axios = require("axios");

async function execute(parameters, context) {
  try {
    const { endpoint, method = "GET", headers = {}, data } = parameters;

    // Rate limiting check
    if (context.user.credits < 1) {
      throw new Error("Insufficient credits");
    }

    // Make API request
    const response = await axios({
      method,
      url: endpoint,
      headers: {
        "User-Agent": "Operon.one Tool",
        ...headers,
      },
      data,
      timeout: 10000,
    });

    return {
      success: true,
      data: {
        status: response.status,
        headers: response.headers,
        data: response.data,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error.response?.data?.message || error.message,
    };
  }
}

module.exports = { execute };
```

## Best Practices

### 1. Error Handling

Always wrap your tool logic in try-catch blocks:

```javascript
async function execute(parameters, context) {
  try {
    // Tool logic here
    return { success: true, data: result };
  } catch (error) {
    console.error(`Tool error:`, error);
    return {
      success: false,
      error: error.message,
      details: process.env.NODE_ENV === "development" ? error.stack : undefined,
    };
  }
}
```

### 2. Parameter Validation

Validate all input parameters:

```javascript
function validateParameters(parameters, schema) {
  for (const [key, config] of Object.entries(schema.parameters)) {
    const value = parameters[key];

    if (config.required && (value === undefined || value === null)) {
      throw new Error(`Parameter '${key}' is required`);
    }

    if (value !== undefined) {
      if (config.type === "string" && typeof value !== "string") {
        throw new Error(`Parameter '${key}' must be a string`);
      }

      if (config.type === "number" && typeof value !== "number") {
        throw new Error(`Parameter '${key}' must be a number`);
      }

      // Add more validation as needed
    }
  }
}
```

### 3. Security Considerations

- **Validate all inputs**: Never trust user input
- **Check permissions**: Verify user has required permissions
- **Sanitize file paths**: Prevent path traversal attacks
- **Limit resource usage**: Set timeouts and limits
- **Don't expose secrets**: Never return sensitive information

```javascript
// Example security checks
function securityChecks(parameters, context) {
  // Check user permissions
  if (!context.permissions.includes("required:permission")) {
    throw new Error("Insufficient permissions");
  }

  // Validate file paths
  if (parameters.filePath) {
    const safePath = path.resolve(parameters.filePath);
    const allowedDir = path.resolve("/app/data/user-files");
    if (!safePath.startsWith(allowedDir)) {
      throw new Error("File path not allowed");
    }
  }

  // Check rate limits
  if (context.user.credits < getCost(parameters)) {
    throw new Error("Insufficient credits");
  }
}
```

### 4. Performance Optimization

- **Use timeouts**: Prevent hanging operations
- **Cache results**: Cache expensive operations
- **Streaming**: Use streaming for large data
- **Resource cleanup**: Clean up resources properly

```javascript
async function execute(parameters, context) {
  const timeoutPromise = new Promise((_, reject) =>
    setTimeout(() => reject(new Error("Timeout")), 30000)
  );

  const workPromise = async () => {
    // Your tool logic here
  };

  try {
    const result = await Promise.race([workPromise(), timeoutPromise]);
    return { success: true, data: result };
  } catch (error) {
    return { success: false, error: error.message };
  }
}
```

## Testing Tools

### Unit Testing

Create `test.js`:

```javascript
const { execute } = require("./main.js");

async function runTests() {
  console.log("Testing helloWorld tool...");

  // Test 1: Basic functionality
  const result1 = await execute(
    { name: "Alice" },
    { user: { id: 1 }, permissions: [] }
  );
  console.assert(result1.success === true);
  console.assert(result1.data.greeting === "Hello, Alice!");

  // Test 2: Custom greeting
  const result2 = await execute(
    { name: "Bob", greeting: "Hi" },
    { user: { id: 1 }, permissions: [] }
  );
  console.assert(result2.success === true);
  console.assert(result2.data.greeting === "Hi, Bob!");

  // Test 3: Error handling
  const result3 = await execute(
    { name: "" },
    { user: { id: 1 }, permissions: [] }
  );
  console.assert(result3.success === false);

  console.log("All tests passed!");
}

runTests().catch(console.error);
```

### Integration Testing

```bash
# Test tool via API
curl -X POST http://localhost:3000/api/tools/execute \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "tool": "helloWorld",
    "parameters": {
      "name": "Test User"
    }
  }'
```

## Deployment

### 1. Add to Tools Directory

Place your tool in the `tools/` directory:

```
tools/
├── yourTool/
│   ├── tool.json
│   ├── main.js
│   └── package.json
```

### 2. Install Dependencies

If your tool has dependencies, create `package.json`:

```json
{
  "name": "your-tool",
  "version": "1.0.0",
  "dependencies": {
    "axios": "^1.0.0",
    "lodash": "^4.17.21"
  }
}
```

### 3. Register Tool

Tools are automatically discovered and loaded on server start. No manual registration required.

### 4. Test in Production

Use the admin panel or API to test your tool in production.

## Tool Management

### Listing Tools

```bash
# Via API
curl http://localhost:3000/api/tools

# Via admin panel
# Navigate to /admin/tools
```

### Monitoring Tool Usage

```javascript
// Tool usage is automatically logged
// Check logs for tool execution metrics
{
  "timestamp": "2024-01-01T00:00:00Z",
  "tool": "yourTool",
  "user": "user@example.com",
  "parameters": {...},
  "result": "success",
  "duration": 1234
}
```

## Troubleshooting

### Common Issues

1. **Tool not loading**: Check `tool.json` syntax
2. **Permission errors**: Verify required permissions
3. **Timeout errors**: Optimize tool performance
4. **Memory issues**: Clean up resources properly

### Debug Mode

Enable debug logging:

```javascript
const DEBUG = process.env.DEBUG === "true";

function debugLog(message, data) {
  if (DEBUG) {
    console.log(`[${new Date().toISOString()}] ${message}`, data);
  }
}
```

## Next Steps

- [Tool Structure Reference](/tools/development/structure)
- [Testing Tools](/tools/development/testing)
- [Publishing Tools](/tools/development/publishing)
- [Contributing to Core Tools](/contributing/tools)
