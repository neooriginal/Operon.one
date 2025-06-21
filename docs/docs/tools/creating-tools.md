# Creating Custom Tools

Learn how to extend Operon.one with your own custom AI tools.

## Overview

Operon.one's modular architecture makes it easy to create custom tools that integrate seamlessly with the platform. Tools are self-contained modules that can perform specific tasks, from simple utilities to complex AI-powered operations.

## Tool Structure

Each tool follows a standardized structure:

```
tools/myTool/
├── main.js          # Main execution logic
├── tool.json        # Tool configuration
├── prompts.js       # AI prompts (optional)
├── test.js          # Tests (optional)
└── README.md        # Documentation
```

## Getting Started

### 1. Create Tool Directory

```bash
mkdir tools/myTool
cd tools/myTool
```

### 2. Create tool.json

Define your tool's configuration:

```json
{
  "name": "myTool",
  "description": "A custom tool that does something amazing",
  "version": "1.0.0",
  "author": "Your Name",
  "category": "utility",
  "parameters": {
    "input": {
      "type": "string",
      "description": "Input text to process",
      "required": true
    },
    "options": {
      "type": "object",
      "description": "Optional configuration",
      "required": false,
      "properties": {
        "format": {
          "type": "string",
          "enum": ["json", "text"],
          "default": "text"
        }
      }
    }
  },
  "output": {
    "type": "object",
    "description": "Processed result",
    "properties": {
      "result": {
        "type": "string",
        "description": "The processed output"
      },
      "metadata": {
        "type": "object",
        "description": "Additional information"
      }
    }
  }
}
```

### 3. Create main.js

Implement the tool's execution logic:

```javascript
/**
 * Custom Tool Implementation
 *
 * @param {Object} parameters - Tool parameters from tool.json
 * @param {Object} context - Execution context
 * @returns {Object} Tool execution result
 */
async function execute(parameters, context) {
  try {
    // Validate parameters
    if (!parameters.input) {
      throw new Error("Input parameter is required");
    }

    // Tool logic here
    const result = processInput(parameters.input, parameters.options);

    // Return standardized response
    return {
      success: true,
      data: {
        result: result,
        metadata: {
          timestamp: new Date().toISOString(),
          version: "1.0.0",
        },
      },
      usage: {
        tokensUsed: 0, // If using AI
        executionTime: Date.now() - context.startTime,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: {
        message: error.message,
        code: "TOOL_EXECUTION_ERROR",
        details: {
          tool: "myTool",
          parameters: parameters,
        },
      },
    };
  }
}

function processInput(input, options = {}) {
  // Your tool logic here
  const format = options.format || "text";

  if (format === "json") {
    return JSON.stringify({ processed: input });
  }

  return `Processed: ${input}`;
}

module.exports = {
  execute,
};
```

## Tool Categories

Choose the appropriate category for your tool:

- **`ai`** - AI-powered tools (LLM integration, ML models)
- **`web`** - Web scraping, API calls, browser automation
- **`file`** - File system operations, data processing
- **`utility`** - General utility functions
- **`creative`** - Content generation, image processing
- **`communication`** - Email, messaging, notifications
- **`development`** - Code generation, testing, deployment
- **`analytics`** - Data analysis, reporting, visualization

## Parameter Types

Supported parameter types in tool.json:

```json
{
  "parameters": {
    "stringParam": {
      "type": "string",
      "description": "Text input",
      "required": true,
      "minLength": 1,
      "maxLength": 1000
    },
    "numberParam": {
      "type": "number",
      "description": "Numeric input",
      "minimum": 0,
      "maximum": 100,
      "default": 10
    },
    "booleanParam": {
      "type": "boolean",
      "description": "True/false flag",
      "default": false
    },
    "arrayParam": {
      "type": "array",
      "description": "List of items",
      "items": {
        "type": "string"
      },
      "minItems": 1
    },
    "objectParam": {
      "type": "object",
      "description": "Complex object",
      "properties": {
        "nested": {
          "type": "string"
        }
      },
      "required": ["nested"]
    },
    "enumParam": {
      "type": "string",
      "description": "One of predefined values",
      "enum": ["option1", "option2", "option3"]
    }
  }
}
```

## Context Object

The execution context provides useful information:

```javascript
async function execute(parameters, context) {
  console.log("User ID:", context.userId);
  console.log("Session ID:", context.sessionId);
  console.log("Start time:", context.startTime);
  console.log("User credits:", context.user.credits);
  console.log("Is admin:", context.user.isAdmin);

  // Access to database
  const userCount = await context.db.count("users");

  // Access to file system
  const fileContent = await context.fs.readFile("/path/to/file");

  // Make HTTP requests
  const response = await context.http.get("https://api.example.com");

  // AI model access
  const aiResponse = await context.ai.complete({
    prompt: "Process this text",
    model: "gpt-4",
  });
}
```

## Error Handling

Always implement proper error handling:

```javascript
async function execute(parameters, context) {
  try {
    // Validate inputs
    validateParameters(parameters);

    // Execute tool logic
    const result = await performTask(parameters);

    return {
      success: true,
      data: result,
    };
  } catch (error) {
    // Log error for debugging
    console.error("Tool execution failed:", error);

    return {
      success: false,
      error: {
        message: error.message,
        code: getErrorCode(error),
        details: {
          tool: "myTool",
          timestamp: new Date().toISOString(),
        },
      },
    };
  }
}

function validateParameters(parameters) {
  if (!parameters.required_field) {
    throw new Error("Required field is missing");
  }

  if (typeof parameters.required_field !== "string") {
    throw new Error("Required field must be a string");
  }
}

function getErrorCode(error) {
  if (error.message.includes("missing")) {
    return "MISSING_PARAMETER";
  }
  if (error.message.includes("invalid")) {
    return "INVALID_PARAMETER";
  }
  return "EXECUTION_ERROR";
}
```

## Testing Your Tool

Create a test file to validate your tool:

```javascript
// test.js
const { execute } = require("./main.js");

async function testTool() {
  const parameters = {
    input: "test input",
    options: { format: "json" },
  };

  const context = {
    userId: 1,
    sessionId: "test-session",
    startTime: Date.now(),
    user: { credits: 100, isAdmin: false },
  };

  try {
    const result = await execute(parameters, context);
    console.log("Test result:", result);

    if (result.success) {
      console.log("✅ Tool test passed");
    } else {
      console.log("❌ Tool test failed:", result.error);
    }
  } catch (error) {
    console.log("❌ Tool test error:", error.message);
  }
}

testTool();
```

Run the test:

```bash
node test.js
```

## Integration with AI Models

For AI-powered tools, use the context.ai interface:

```javascript
async function execute(parameters, context) {
  const prompt = `Process this text: ${parameters.input}`;

  try {
    const aiResponse = await context.ai.complete({
      prompt: prompt,
      model: "gpt-4",
      maxTokens: 500,
      temperature: 0.7,
    });

    return {
      success: true,
      data: {
        result: aiResponse.text,
        model: aiResponse.model,
      },
      usage: {
        tokensUsed: aiResponse.tokensUsed,
        cost: aiResponse.cost,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: {
        message: "AI processing failed",
        details: error.message,
      },
    };
  }
}
```

## File Operations

Access the file system through the context:

```javascript
async function execute(parameters, context) {
  try {
    // Read file
    const content = await context.fs.readFile(parameters.filePath);

    // Write file
    await context.fs.writeFile("/output/result.txt", processedContent);

    // List directory
    const files = await context.fs.listDirectory("/input");

    // Check if file exists
    const exists = await context.fs.exists(parameters.filePath);

    return {
      success: true,
      data: { files, exists },
    };
  } catch (error) {
    return {
      success: false,
      error: { message: error.message },
    };
  }
}
```

## Database Access

Query the database using the context.db interface:

```javascript
async function execute(parameters, context) {
  try {
    // Insert data
    const insertId = await context.db.insert("tool_logs", {
      tool_name: "myTool",
      user_id: context.userId,
      execution_time: new Date(),
      parameters: JSON.stringify(parameters),
    });

    // Query data
    const results = await context.db.query(
      "SELECT * FROM tool_logs WHERE user_id = ?",
      [context.userId]
    );

    // Update data
    await context.db.update(
      "users",
      { last_tool_used: "myTool" },
      { id: context.userId }
    );

    return {
      success: true,
      data: { insertId, results },
    };
  } catch (error) {
    return {
      success: false,
      error: { message: error.message },
    };
  }
}
```

## Deployment

### 1. Register Your Tool

After creating your tool, restart the Operon.one server to register it:

```bash
npm start
```

### 2. Test Integration

Test your tool through the API:

```bash
curl -X POST http://localhost:3000/api/tools/execute \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{"tool": "myTool", "parameters": {"input": "test"}}'
```

### 3. Monitor Performance

Check the tool logs for performance and errors:

```bash
tail -f logs/tools.log
```

## Best Practices

### Security

- Always validate and sanitize inputs
- Never execute user-provided code directly
- Use proper error handling to avoid information leakage
- Implement rate limiting for resource-intensive operations

### Performance

- Implement caching for expensive operations
- Use async/await for I/O operations
- Monitor memory usage for large data processing
- Set appropriate timeouts for external API calls

### Documentation

- Provide clear parameter descriptions
- Include usage examples in README.md
- Document error codes and their meanings
- Keep tool.json schema up to date

### Testing

- Write comprehensive unit tests
- Test error conditions and edge cases
- Validate with different parameter combinations
- Test integration with the platform

## Publishing Your Tool

Share your tool with the community:

1. **Create a GitHub repository** for your tool
2. **Add comprehensive documentation**
3. **Include example usage and tests**
4. **Submit to the tool registry** (coming soon)

## Examples

Check out existing tools for inspiration:

- **Web Search** (`tools/webSearch/`) - External API integration
- **File Processor** (`tools/filesystem/`) - File operations
- **Code Generator** (`tools/AI/`) - AI model integration
- **Image Creator** (`tools/imageGeneration/`) - Complex AI workflows

## Next Steps

- [**Tool Architecture**](../tools/index.md) - Understand the tool system
- **API Reference** - Integration endpoints
- **Community Tools** - Browse contributed tools
