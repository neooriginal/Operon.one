# Use Node.js 18 Alpine as base image for smaller size
FROM node:18-alpine

# Install build dependencies, Docker CLI and dependencies needed for Playwright
RUN apk add --no-cache \
    docker \
    chromium \
    python3 \
    make \
    g++ \
    sqlite \
    sqlite-dev \
    # Add additional dependencies for bcrypt
    curl \
    gnupg \
    build-base

# Set working directory
WORKDIR /app

# Add node user to docker group
RUN addgroup node docker

# Copy package files
COPY package*.json ./

# Install dependencies with proper native module compilation
# Ensure bcrypt is rebuilt for Alpine
RUN npm install --omit=dev && \
    npm rebuild bcrypt --build-from-source && \
    npm cache clean --force

# Copy application code
COPY . .

# Create necessary directories and set permissions
RUN mkdir -p /app/data /app/output && \
    chown -R node:node /app

# Install Playwright manually for Alpine (use system chromium)
RUN npx playwright install-deps || true && \
    PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npx playwright install chromium || true

# Set environment variable to use system chromium
ENV PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium-browser

# Switch to node user
USER node

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3000', (res) => process.exit(res.statusCode === 200 ? 0 : 1))"

# Start the application
CMD ["npm", "start"] 