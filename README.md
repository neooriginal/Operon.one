<p align="center">
  <img src="https://github.com/user-attachments/assets/dab2bc2d-bc0d-4122-a68a-a6a770dc0b8a" alt="Operon Logo" width="150"/>
</p>

<h2 align="center">🔥 The Next-Generation Action-AI</h2>

<p align="center">
  <em>The AI agent that doesn't just think—it acts, adapts, and accelerates across every platform you use.</em>
</p>

<p align="center">
  <strong>Operon.one</strong> is a powerful, next-generation generative Action-AI to interact with multiple platforms including MCP.
</p>

<p align="center">
  <strong>Your Personal AI Agent for:</strong>
</p>

<p align="center">
  🔍 <strong>Research & Analysis</strong> - Gather and synthesize information automatically<br>
  💻 <strong>Code Generation</strong> - Create code snippets and applications from descriptions<br>
  📝 <strong>Content Creation</strong> - Draft emails, reports, and articles effortlessly<br>
  🔄 <strong>Workflow Automation</strong> - Automate repetitive tasks across platforms<br>
  📊 <strong>Data Management</strong> - Organize files and handle complex data operations
</p>

<p align="center">
  <img src="https://github.com/user-attachments/assets/c5b1cb77-f0f6-4eed-8116-b9fe64b48cc1" alt="Operon UI Preview" width="800"/>
  <img src="https://github.com/user-attachments/assets/ee6169f5-85b5-431c-942d-0e669f2824ff" alt="Operon UI Preview #2" width="800"/>
</p>

---

## 🚧 Work in Progress

> **Note:** Operon.one is currently under active development.
> Core features are functional, but we're continuously improving and expanding functionality.
> Expect **frequent updates** and **occasional breaking changes** as we move toward a stable release.

---

## 🚀 Quick Start with Docker (Recommended)

The easiest way to get Operon.one running is with Docker:

### Prerequisites

- Docker and Docker Compose installed
- An [OpenRouter API key](https://openrouter.ai/) for AI functionality

#### 1. Download the Docker Compose file

```bash
curl -O https://raw.githubusercontent.com/neooriginal/Operon.one/main/docker-compose.yml
```

#### 2. Set your environment variables

```bash
OPENROUTER_API_KEY="your_openrouter_api_key_here"
JWT_SECRET="your_secure_jwt_secret_here"
```

#### Optional: Email Verification Setup

```bash
# Add these to enable email verification for user registration
SMTP_HOST="your_smtp_host"
SMTP_PORT="your_smtp_port"
SMTP_USER="your_smtp_username"
SMTP_PASS="your_smtp_password"
SMTP_FROM="noreply@yourdomain.com"
```

#### 3. Start Operon.one

```bash
docker-compose up -d
```

#### 4. Access the application

Open your browser and navigate to: `http://localhost:3000`

That's it! 🎉 Operon.one is now running and ready to use.

### Managing the service

```bash
# Stop the service
docker-compose down

# View logs
docker-compose logs -f

# Update to latest version
docker-compose pull && docker-compose up -d
```

---

## ⚡ Development Setup

For development or if you prefer to run from source:

```bash
# Clone the repository
git clone https://github.com/neooriginal/Operon.one.git
cd Operon.one

# Install dependencies
npm install

# Set up environment variables
cp .env.example .env
# Edit .env with your API keys and configuration

# Start the development server
npm start
```

## 👑 Admin Panel Setup

Operon.one includes a comprehensive admin panel for managing redemption codes and user credits. The admin system provides secure access to:

- **Redemption Code Management**: Create, view, and delete credit codes
- **Usage Analytics**: Track code usage and credit distribution
- **User Administration**: Manage admin privileges

Here's how to set it up:

#### Option 1: Using the Admin Utility Script (Recommended)

We've included a convenient utility script to manage admin users:

```bash
# Make a user admin (replace with actual email)
node utils/makeAdmin.js user@example.com
# OR using npm scripts:
npm run admin:make user@example.com

# List all current admin users
node utils/makeAdmin.js list
# OR using npm scripts:
npm run admin:list

# Show help
node utils/makeAdmin.js help
```

**Example usage:**

```bash
$ node utils/makeAdmin.js john@company.com

🔧 Operon.one Admin Setup Utility

Target user: john@company.com

🔍 Looking up user...

❓ Make "john@company.com" an admin? (y/N): y

⚡ Granting admin privileges...
✅ Successfully granted admin privileges to "john@company.com"

📋 Admin Panel Access:
   🌐 URL: http://localhost:3001/admin
   📧 Login with: john@company.com

🔐 Admin Capabilities:
   • Create and manage redemption codes
   • View usage statistics
   • Delete unused codes
```

### Accessing the Admin Panel

Once you have admin privileges:

1. **Login** to your Operon.one account normally
2. **Navigate** to the admin panel: `http://localhost:3000/admin`
3. **Manage** redemption codes, view statistics, and more

---

## 🗺️ Roadmap

Planned functionality includes:

[ToDo](todo.MD)

---

## 🤝 Contributing

We welcome contributions! Please feel free to submit issues and pull requests.

---

## 📜 License

This project is **proprietary software**.
See the [LICENSE](LICENSE) file for more information.

---

<p align="center">
  Made with ❤️ by the <strong>Operon.one</strong> Team
</p>
