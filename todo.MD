Urgent:
- cancelling tasks
- AI asking follow up questions to a task

chore:
### **🔴 CRITICAL ISSUES**

#### **1. Excessive Console Logging (Production Risk)**
- **50+ console.log statements** across files should be replaced with proper logging
- **50+ console.error statements** need structured logging
- Key files with excessive logging:
  - `public/dashboard/script.js`: 25+ console.log statements
  - `index.js`: 15+ console.log statements
  - `socket.js`: 10+ console.log statements
  - `database.js`: 10+ console.log statements

#### **2. Overly Large Files (Maintainability Risk)**
- `index.js`: **1,055 lines** - central orchestrator doing too much
- `database.js`: **1,581 lines** - should be split into modules
- `public/dashboard/script.js`: **2,290 lines** - massive frontend file
- `socket.js`: **761 lines** - mixing HTTP and WebSocket concerns

#### **3. Hard-coded Values (Configuration Risk)**
- **Localhost URLs hardcoded in 8+ locations**:
  ```javascript
  // socket.js line 81
  origin: ["http://localhost:3001", "http://127.0.0.1:3001", "http://localhost:3000", "http://127.0.0.1:3000"]
  ```
- **Docker image hardcoded**: `python:3.9-slim` in `tools/docker.js`
- **Magic numbers**: `SCREENSHOT_INTERVAL = 5000`, `MAX_HISTORY_LENGTH`

### **🟡 SECURITY CONCERNS**

#### **4. Environment Variable Issues**
- `JWT_SECRET` used without validation in multiple files
- Missing defaults for critical env vars: `OPENROUTER_API_KEY`, `SMTP_*`
- Potential security risk if env vars are undefined

#### **5. File Path Security**
- Direct file path manipulation in `tools/docker.js` without sufficient validation
- Path normalization that could be vulnerable to traversal attacks

### **🟠 CODE STRUCTURE ISSUES**

#### **6. Function Complexity**
- `centralOrchestrator()` in `index.js`: **250+ lines**, too many responsibilities
- Multiple functions with 10+ parameters
- Deep nesting levels (4-5 levels in some functions)

#### **7. Error Handling Problems**
- **Complex JSON parsing fallbacks** in `database.js` lines 1365-1427:
  ```javascript
  function tryParseJSON(str, defaultValue) {
    // 60+ lines of fallback parsing logic
  }
  ```
- Inconsistent error message formats across the codebase

#### **8. Mixed Responsibilities**
- `socket.js` handles both HTTP routes and WebSocket events
- `database.js` contains both data access and utility functions
- Frontend files mix UI logic with API calls

### **🔵 CODE QUALITY ISSUES**

#### **9. Inconsistent Coding Patterns**
- Mixed arrow functions and regular functions
- Inconsistent variable naming (camelCase vs snake_case)
- Some files use semicolons, others don't

#### **10. Missing Documentation**
- Limited JSDoc comments on public functions
- No inline documentation for complex logic
- Missing README sections for tool development

#### **11. Frontend Code Issues**
- **Global function pollution** in `public/dashboard/script.js`
- Mixed concerns: DOM manipulation + API calls + state management
- No proper state management pattern


Nice to have:
- voice mode
- API


Brain:
- implement brain visualization from Project Epsilon
- real-life context system (api for feeding in real-life transcripts)
- Personality Engine
- memory system for storing info