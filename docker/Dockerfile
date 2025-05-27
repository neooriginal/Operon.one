# Use Node.js 18 Alpine as base image for smaller size
FROM node:18-alpine

# Install Docker CLI
RUN apk add --no-cache docker

# Set working directory
WORKDIR /app

# Create a non-root user for security
RUN addgroup -g 1000 appgroup && \
    adduser -D -s /bin/sh -u 1000 -G appgroup appuser && \
    addgroup appuser docker

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production && \
    npm cache clean --force

# Copy application code
COPY . .

# Create necessary directories and set permissions
RUN mkdir -p /app/data /app/output && \
    chown -R appuser:appgroup /app

# Install Playwright dependencies and browsers
RUN npx playwright install-deps && \
    npx playwright install chromium

# Switch to non-root user
USER appuser

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3000', (res) => process.exit(res.statusCode === 200 ? 0 : 1))"

# Start the application
CMD ["npm", "start"] 