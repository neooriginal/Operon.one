# 🚀 Operon.one

## 🔥 The Next-Generation Platform for Automated Operations

Operon.one is a powerful, next generation, generative action-ai to interact with multiple platforms

### ✨ Key Features

- **Advanced Automation**: Leverage AI and machine learning to automate complex decision-making processes
- **Seamless Integration**: Connect with existing tools and services through our comprehensive API
- **Real-time Collaboration**: Work together with your team in real-time with WebSocket communication
- **Enterprise-grade Security**: Robust authentication and authorization mechanisms to keep your data safe
- **Extensible Architecture**: Build custom plugins and extensions to meet your specific needs

### 🛠️ Built With

- Node.js and Express for the backend API
- Socket.io for real-time communication
- OpenAI integration for intelligent automation
- SQLite for reliable data persistence
- JWT-based authentication for security

### ⚡ Getting Started

```bash
# Clone the repository
git clone https://github.com/neooriginal/Operon.one.git

# Install dependencies
npm install

# Configure environment variables
cp .env.example .env
# Edit .env file to set your configuration including EMAIL_WHITELIST

# Start the server
npm start
```

## 🔒 Access Control

Operon.one uses an email whitelist system to control access during the beta phase. To configure allowed users:

1. Create a `.env` file in the root directory
2. Add the `EMAIL_WHITELIST` variable with a comma-separated list of allowed email addresses:
   ```
   EMAIL_WHITELIST=user1@example.com,user2@example.com,user3@example.com
   ```
3. Only users with email addresses in this list will be able to register for access

## 🚧 Work in Progress

**Note:** Operon.one is currently under active development and available by invitation only. Core features are functional, but we're constantly improving and adding new capabilities. Expect frequent updates and occasional breaking changes as we work toward a stable release.

### 🗺️ Roadmap

- Enhanced dashboard
- Mobile application for on-the-go management
- Extended plugin ecosystem
- Cloud deployment options
- General performance improvements and better handling

## 📜 License

This project is proprietary software. See the [LICENSE](LICENSE) file for details.

---

Made with ❤️ by the Operon.one Team 