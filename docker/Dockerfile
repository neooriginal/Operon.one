# Use Node.js 18 on Debian for better compatibility
FROM node:18-slim

# Install essential dependencies
RUN apt-get update && apt-get install -y \
    chromium \
    docker.io \
    python3 \
    build-essential \
    sqlite3 \
    libsqlite3-dev \
    # Playwright dependencies
    libnss3 \
    libnspr4 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libcups2 \
    libdrm2 \
    libxkbcommon0 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxrandr2 \
    libgbm1 \
    libasound2 \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Add node user to docker group to allow Docker access
RUN usermod -aG docker node

# Set environment variables for Playwright
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=0
ENV PLAYWRIGHT_BROWSERS_PATH=/home/node/.cache/ms-playwright

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install --omit=dev && \
    npx playwright install chromium --with-deps && \
    npm cache clean --force

# Copy application code
COPY . .

# Create necessary directories with proper permissions
RUN mkdir -p /app/data /app/output && \
    chown -R node:node /app /app/data /app/output /home/node/.cache && \
    chmod 755 /app/data /app/output

# Switch to node user for security
USER node

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3000', (res) => process.exit(res.statusCode === 200 ? 0 : 1))"

# Start the application
CMD ["npm", "start"] 