# Tool Examples

Real-world examples of using Operon.one tools.

## Web Search

Search for information and get structured results:

```bash
curl -X POST http://localhost:3000/api/tools/execute \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{"tool": "webSearch", "parameters": {"query": "latest AI news"}}'
```

## Code Generation

Generate code from natural language descriptions:

```bash
curl -X POST http://localhost:3000/api/tools/execute \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{"tool": "codeGeneration", "parameters": {"language": "python", "description": "fibonacci function"}}'
```

## File Operations

Read and write files programmatically:

```bash
curl -X POST http://localhost:3000/api/tools/execute \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{"tool": "filesystem", "parameters": {"action": "read", "path": "/data/file.txt"}}'
```

## More Examples

Check out our comprehensive examples in the GitHub repository.
