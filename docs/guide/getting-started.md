# Getting Started

This guide will help you get Operon.one up and running quickly. We'll cover both Docker deployment (recommended) and development setup.

## Prerequisites

Before you begin, ensure you have:

- **Docker & Docker Compose** (for Docker setup)
- **Node.js 18+** (for development setup)
- **OpenRouter API Key** ([Get one here](https://openrouter.ai/))

## Quick Start with Docker (Recommended)

The fastest way to get Operon.one running is with Docker:

### 1. Download Docker Compose

```bash
curl -O https://raw.githubusercontent.com/neooriginal/Operon.one/main/docker-compose.yml
```

### 2. Set Environment Variables

Create a `.env` file or set environment variables:

```bash
# Required
OPENROUTER_API_KEY="your_openrouter_api_key_here"
JWT_SECRET="your_secure_jwt_secret_here"

# Optional: Email Configuration
SMTP_HOST="your_smtp_host"
SMTP_PORT="587"
SMTP_USER="your_smtp_username"
SMTP_PASS="your_smtp_password"
SMTP_FROM="noreply@yourdomain.com"
```

### 3. Start the Service

```bash
docker-compose up -d
```

### 4. Access Your Instance

Open your browser and navigate to:

- **Main Application**: http://localhost:3000
- **Admin Panel**: http://localhost:3000/admin

## Development Setup

For development or if you prefer to run from source:

### 1. Clone the Repository

```bash
git clone https://github.com/neooriginal/Operon.one.git
cd Operon.one
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Configure Environment

Copy the example environment file:

```bash
cp .env.example .env
```

Edit `.env` with your configuration:

```env
# Core Configuration
PORT=3000
NODE_ENV=development

# AI Configuration
OPENROUTER_API_KEY=your_openrouter_api_key_here

# Security
JWT_SECRET=your_secure_jwt_secret_here

# Database
DATABASE_PATH=./data/operon.db

# Email Configuration (Optional)
SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASS=
SMTP_FROM=noreply@yourdomain.com
```

### 4. Initialize the Database

The database will be created automatically on first run.

### 5. Start the Development Server

```bash
npm start
```

## First Steps

### 1. Create Your Account

1. Navigate to http://localhost:3000
2. Click "Register" to create your account
3. If email is configured, verify your email address

### 2. Set Up Admin Access

Make your account an admin using the utility script:

```bash
# Make yourself an admin (replace with your email)
npm run admin:make your-email@example.com

# List all admin users
npm run admin:list
```

### 3. Access the Admin Panel

1. Navigate to http://localhost:3000/admin
2. Login with your admin account
3. Create redemption codes for credit management

### 4. Test the AI Tools

1. Go to the main dashboard
2. Try asking the AI to perform various tasks:
   - "Search the web for the latest news about AI"
   - "Create a simple Python script to calculate factorial"
   - "Generate an image of a sunset"

## Managing Your Instance

### Docker Commands

```bash
# Stop the service
docker-compose down

# View logs
docker-compose logs -f

# Update to latest version
docker-compose pull
docker-compose up -d

# Restart the service
docker-compose restart
```

### Development Commands

```bash
# Start development server
npm start

# Run tests
npm test

# Create admin user
npm run admin:make user@example.com

# List admin users
npm run admin:list
```

## Configuration Options

### Environment Variables

| Variable             | Description                          | Required |
| -------------------- | ------------------------------------ | -------- |
| `OPENROUTER_API_KEY` | Your OpenRouter API key              | Yes      |
| `JWT_SECRET`         | Secret for JWT token signing         | Yes      |
| `PORT`               | Server port (default: 3000)          | No       |
| `NODE_ENV`           | Environment (development/production) | No       |
| `DATABASE_PATH`      | SQLite database file path            | No       |
| `SMTP_HOST`          | SMTP server hostname                 | No       |
| `SMTP_PORT`          | SMTP server port                     | No       |
| `SMTP_USER`          | SMTP username                        | No       |
| `SMTP_PASS`          | SMTP password                        | No       |
| `SMTP_FROM`          | From email address                   | No       |

### Security Considerations

- **JWT_SECRET**: Use a strong, random secret
- **Database**: Keep your database file secure
- **API Keys**: Never expose API keys in client-side code
- **HTTPS**: Use HTTPS in production environments

## Troubleshooting

### Common Issues

#### Port Already in Use

```bash
# Find what's using port 3000
lsof -i :3000

# Kill the process
kill -9 <PID>
```

#### Database Issues

```bash
# Remove and recreate database
rm ./data/operon.db
npm start
```

#### Docker Issues

```bash
# Clean up Docker resources
docker-compose down -v
docker system prune
```

### Getting Help

- **GitHub Issues**: [Report bugs or request features](https://github.com/neooriginal/Operon.one/issues)
- **Documentation**: Check the full documentation for detailed guides
- **Community**: Join discussions on GitHub

## Next Steps

Now that you have Operon.one running:

1. **[Explore Tools](/tools/)**: Learn about available AI tools
2. **[API Documentation](/api/)**: Integrate with the API
3. **[Configuration](/guide/configuration/environment)**: Advanced configuration options
4. **[Admin Panel](/guide/configuration/admin-panel)**: Manage users and credits
