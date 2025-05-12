# Tool Development Guide

This guide explains how to add new tools to the OperonOne system. The system is designed to dynamically load tools based on their configuration, making it easy to extend without modifying the core code.

## Tool Structure

Each tool in the system follows this structure:

```
tools/
└── myTool/
    ├── tool.json          # Tool configuration and metadata
    └── main.js            # Tool implementation (or index.js)
```

## Creating a New Tool

To add a new tool to the system:

1. Create a new directory in the `tools/` folder with your tool name
2. Create a `tool.json` file in that directory
3. Implement the tool's functionality in `main.js` or `index.js`

## Tool Configuration (tool.json)

The `tool.json` file defines your tool's metadata and how it's presented to the AI agent:

```json
{
  "title": "toolName",
  "description": "Brief description of what this tool does",
  "example": "toolName: Example of how to use this tool",
  "enabled": true,
  "main": "main.js"
}
```

### Fields Explained:

- **title**: The name the AI uses to invoke your tool (should be camelCase)
- **description**: A concise explanation of what your tool does (appears in the AI's prompt)
- **example**: A short example of how to use the tool (helps the AI understand usage)
- **enabled**: Boolean to enable/disable the tool without removing it
- **main**: The main JavaScript file that implements your tool (defaults to "main.js")

## Tool Implementation

Your tool's main file should export at least one method that can be called by the orchestrator. The standard pattern is to export a `runTask` function:

```javascript
// main.js

async function runTask(
  taskDescription,
  inputData,
  stepCallback,
  userId,
  chatId
) {
  // Process the task
  // Use inputData from previous steps if needed

  // Call the stepCallback when task is completed
  stepCallback({
    success: true,
    result: "Task result data",
  });

  // Return data for subsequent steps
  return {
    success: true,
    data: "Result data",
  };
}

module.exports = {
  runTask,
};
```

### Special Tool Types:

Some tools may implement different interfaces:

1. **AI tools** (like chatCompletion) should export a `callAI` method
2. **Content generation tools** (like writer) should export a `write` method
3. **Resource management tools** should implement proper cleanup methods

## Example: Creating a Simple Calculator Tool

Here's a complete example of implementing a calculator tool:

1. Create tool directory and configuration:

```
mkdir -p tools/calculator
```

2. Create `tool.json`:

```json
{
  "title": "calculator",
  "description": "For performing basic mathematical calculations",
  "example": "calculator: Calculate 25 * 4 + 10",
  "enabled": true,
  "main": "main.js"
}
```

3. Implement `main.js`:

```javascript
// tools/calculator/main.js

async function runTask(
  taskDescription,
  inputData,
  stepCallback,
  userId,
  chatId
) {
  try {
    // Extract the calculation from the task description
    const calculationMatch = taskDescription.match(/Calculate\s+(.+)/i);

    if (!calculationMatch || !calculationMatch[1]) {
      return {
        success: false,
        error: "No calculation provided",
      };
    }

    // Get the calculation expression
    const calculation = calculationMatch[1].trim();

    // Use Function to safely evaluate the expression
    // Note: This approach has limitations but is safer than eval()
    const calculateFunction = new Function(`return ${calculation}`);
    const result = calculateFunction();

    // Call the callback with the result
    stepCallback({
      success: true,
      result: result,
    });

    // Return the result
    return {
      success: true,
      result: result,
    };
  } catch (error) {
    return {
      success: false,
      error: `Calculation error: ${error.message}`,
    };
  }
}

module.exports = {
  runTask,
};
```

## Testing Your Tool

To test your tool:

1. Place your tool in the `tools/` directory
2. Ensure `tool.json` is properly configured
3. Start the application
4. The tool will be automatically loaded if `enabled` is set to `true`
5. Check the console logs for any loading errors
6. Test the tool by asking the AI to use it

## Best Practices

- Keep tools focused on a single responsibility
- Implement proper error handling
- Include appropriate validation for inputs
- Use async/await for asynchronous operations
- Provide meaningful error messages
- Document your tool's usage and limitations

## Model Context Protocol (MCP) Preparation

The tool system is designed to support MCP integration. When implementing tools, consider:

- Clean separation of concerns
- Proper error reporting
- Standardized response formats
- Consistent parameter naming

## Troubleshooting

If your tool isn't loading properly:

1. Check for syntax errors in your JavaScript files
2. Verify your `tool.json` has all required fields
3. Make sure the main file specified in `tool.json` exists
4. Check console logs for specific error messages
5. Confirm your tool is exporting the expected methods
