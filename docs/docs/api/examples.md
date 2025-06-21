# API Examples

Practical examples of using the Operon.one API.

## Authentication

```javascript
const response = await fetch("http://localhost:3000/api/auth/login", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    email: "user@example.com",
    password: "password",
  }),
});

const { token } = await response.json();
```

## Tool Execution

```javascript
const result = await fetch("http://localhost:3000/api/tools/execute", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    tool: "webSearch",
    parameters: { query: "AI news" },
  }),
});
```

## WebSocket Integration

```javascript
const socket = io("ws://localhost:3000", {
  auth: { token },
});

socket.emit("tool:execute", {
  tool: "webSearch",
  parameters: { query: "AI news" },
});

socket.on("tool:result", (data) => {
  console.log("Result:", data);
});
```
