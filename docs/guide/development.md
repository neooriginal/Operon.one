# Development Setup

This guide covers setting up Operon.one for development, including local development environment, debugging, and contributing to the project.

## Prerequisites

- **Node.js**: Version 18 or higher
- **npm**: Version 8 or higher
- **Git**: Latest version
- **OpenRouter API Key**: For AI functionality

## Local Development

### 1. Clone the Repository

```bash
git clone https://github.com/neooriginal/Operon.one.git
cd Operon.one
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Environment Configuration

Create a `.env` file in the root directory:

```env
# Core Configuration
PORT=3000
NODE_ENV=development

# AI Configuration
OPENROUTER_API_KEY=your_openrouter_api_key_here

# Security
JWT_SECRET=development_jwt_secret_change_in_production

# Database
DATABASE_PATH=./data/operon.db

# Email Configuration (Optional for development)
SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASS=
SMTP_FROM=dev@localhost

# Development Settings
DEBUG=true
LOG_LEVEL=debug
```

### 4. Start Development Server

```bash
npm start
```

The application will be available at `http://localhost:3000`.

## Development Features

### Hot Reloading

The development server includes hot reloading for:

- Server-side code changes
- Frontend assets
- Tool modifications

### Debug Mode

Enable debug mode for detailed logging:

```env
DEBUG=true
LOG_LEVEL=debug
```

### Development Database

In development, the SQLite database is created automatically in `./data/operon.db`.

## Project Structure

```
Operon.one/
├── index.js              # Main server entry point
├── package.json          # Dependencies and scripts
├── database.js           # Database configuration
├── socket.js             # WebSocket handler
├── authRoutes.js         # Authentication routes
├── adminRoutes.js        # Admin panel routes
├── public/               # Static files
│   ├── dashboard/        # Main web interface
│   └── admin/           # Admin panel interface
├── tools/               # AI tools directory
│   ├── AI/              # AI tools
│   ├── browser/         # Browser automation
│   ├── filesystem/      # File operations
│   └── ...              # Other tools
├── utils/               # Utility functions
├── data/                # Database and data files
└── docs/                # Documentation
```

## Creating Tools

### Tool Development Workflow

1. **Create Tool Directory**:

   ```bash
   mkdir tools/myTool
   cd tools/myTool
   ```

2. **Create tool.json**:

   ```json
   {
     "name": "myTool",
     "description": "My custom tool",
     "parameters": {
       "input": {
         "type": "string",
         "description": "Input parameter"
       }
     }
   }
   ```

3. **Create main.js**:

   ```javascript
   async function execute(parameters, context) {
     return {
       success: true,
       data: { result: "Tool output" },
     };
   }

   module.exports = { execute };
   ```

4. **Test Your Tool**:
   ```bash
   # Restart server to load new tool
   npm start
   ```

### Tool Testing

Test tools through the web interface or API:

```bash
curl -X POST http://localhost:3000/api/tools/execute \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{"tool": "myTool", "parameters": {"input": "test"}}'
```

## Database Development

### Database Schema

The SQLite database includes these tables:

- `users` - User accounts and profiles
- `sessions` - User sessions
- `redemption_codes` - Credit redemption codes
- `tool_usage` - Tool usage logs

### Database Utilities

```bash
# View database structure
sqlite3 data/operon.db ".schema"

# Make user admin
npm run admin:make user@example.com

# List admin users
npm run admin:list
```

## Frontend Development

### Web Interface

The main interface is in `public/dashboard/`:

- `index.html` - Main chat interface
- `login.html` - Login page
- `register.html` - Registration page
- `settings.html` - User settings
- `script.js` - Main application logic
- `style.css` - Styles

### Admin Panel

The admin interface is in `public/admin/index.html`.

### CSS Framework

The project uses custom CSS with modern features:

- CSS Grid and Flexbox
- CSS Variables
- Responsive design
- Dark/light themes

## API Development

### Adding New Endpoints

1. **Add Route Handler**:

   ```javascript
   // In appropriate route file
   app.get("/api/new-endpoint", (req, res) => {
     res.json({ message: "New endpoint" });
   });
   ```

2. **Test Endpoint**:
   ```bash
   curl http://localhost:3000/api/new-endpoint
   ```

### API Documentation

Update API documentation in `docs/api/` when adding new endpoints.

## Testing

### Manual Testing

1. **User Registration/Login**
2. **Tool Execution**
3. **Admin Panel Functions**
4. **WebSocket Communication**

### Automated Testing

```bash
# Run tests
npm test

# Test specific tool
node tools/myTool/test.js
```

## Debugging

### Server Debugging

1. **Enable Debug Logging**:

   ```env
   DEBUG=true
   LOG_LEVEL=debug
   ```

2. **View Logs**:

   ```bash
   tail -f logs/app.log
   ```

3. **Database Debugging**:
   ```bash
   sqlite3 data/operon.db
   .tables
   SELECT * FROM users;
   ```

### Tool Debugging

Add debug statements to tools:

```javascript
async function execute(parameters, context) {
  console.log("Tool parameters:", parameters);
  console.log("User context:", context.user);

  // Tool logic

  console.log("Tool result:", result);
  return result;
}
```

## Performance Optimization

### Monitoring

- Monitor memory usage: `node --inspect index.js`
- Profile performance with Chrome DevTools
- Track database query performance

### Optimization Tips

- Cache frequently used data
- Optimize database queries
- Implement request rate limiting
- Use efficient algorithms in tools

## Contributing

### Code Style

- Use consistent indentation (2 spaces)
- Follow JavaScript best practices
- Add comments for complex logic
- Use meaningful variable names

### Git Workflow

1. **Create Feature Branch**:

   ```bash
   git checkout -b feature/my-feature
   ```

2. **Make Changes and Commit**:

   ```bash
   git add .
   git commit -m "Add new feature"
   ```

3. **Push and Create PR**:
   ```bash
   git push origin feature/my-feature
   ```

### Pull Request Guidelines

- Describe changes clearly
- Include tests for new features
- Update documentation
- Ensure all tests pass

## Deployment

### Building for Production

```bash
# Set production environment
NODE_ENV=production

# Install production dependencies only
npm ci --production

# Start production server
npm start
```

### Docker Development

```bash
# Build development image
docker build -t operon-dev .

# Run development container
docker run -p 3000:3000 -v $(pwd):/app operon-dev
```

## Troubleshooting

### Common Development Issues

1. **Port Already in Use**:

   ```bash
   lsof -i :3000
   kill -9 <PID>
   ```

2. **Database Lock Errors**:

   ```bash
   rm data/operon.db
   npm start
   ```

3. **Tool Not Loading**:

   - Check `tool.json` syntax
   - Restart server
   - Check console for errors

4. **Permission Errors**:
   ```bash
   chmod +x scripts/*
   chown -R $USER:$USER .
   ```

### Getting Help

- Check the [GitHub Issues](https://github.com/neooriginal/Operon.one/issues)
- Review the [API Documentation](/api/)
- Join community discussions

## Next Steps

- [Creating Custom Tools](/tools/development/creating-tools)
- [API Reference](/api/)
- [Deployment Guide](/guide/docker-setup)
