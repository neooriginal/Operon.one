<p align="center">
  <img src="https://github.com/user-attachments/assets/dab2bc2d-bc0d-4122-a68a-a6a770dc0b8a" alt="Operon Logo" width="150"/>
</p> 

<h2 align="center">🔥 The Next-Generation Action-AI</h2>

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
