# Docker Setup

Deploy Operon.one using Docker for production environments.

## Quick Start

### 1. Download Docker Compose

```bash
curl -O https://raw.githubusercontent.com/neooriginal/Operon.one/main/docker-compose.yml
```

### 2. Configure Environment

Create a `.env` file in the same directory:

```env
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

# Production Settings
NODE_ENV=production
PORT=3000
```

### 3. Start Services

```bash
docker-compose up -d
```

### 4. Verify Installation

```bash
# Check application health
curl http://localhost:3000/health

# View container logs
docker-compose logs -f
```

### 5. Access Your Instance

Open your browser and navigate to:

- **Main Application**: `http://localhost:3000`
- **Admin Panel**: `http://localhost:3000/admin`

## Production Configuration

### Docker Compose Override

For production, create a `docker-compose.override.yml`:

```yaml
version: "3.8"
services:
  operon:
    restart: unless-stopped
    environment:
      - NODE_ENV=production
    volumes:
      - ./data:/app/data
      - ./logs:/app/logs
    networks:
      - operon-network

networks:
  operon-network:
    driver: bridge
```

### SSL/TLS Setup

For HTTPS in production, use a reverse proxy like Nginx:

```yaml
services:
  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf
      - ./ssl:/etc/nginx/ssl
    depends_on:
      - operon
```

### Backup Configuration

```yaml
services:
  backup:
    image: alpine:latest
    volumes:
      - ./data:/backup/data:ro
    command: >
      sh -c "
        while true; do
          tar -czf /backup/operon-backup-$(date +%Y%m%d-%H%M%S).tar.gz -C /backup data
          find /backup -name '*.tar.gz' -mtime +7 -delete
          sleep 86400
        done
      "
```

## Advanced Configuration

### Environment Variables

| Variable             | Description                  | Default          |
| -------------------- | ---------------------------- | ---------------- |
| `OPENROUTER_API_KEY` | Your OpenRouter API key      | Required         |
| `JWT_SECRET`         | Secret for JWT token signing | Required         |
| `PORT`               | Server port                  | 3000             |
| `NODE_ENV`           | Environment mode             | development      |
| `DATABASE_PATH`      | SQLite database file path    | ./data/operon.db |
| `SMTP_HOST`          | SMTP server hostname         | -                |
| `SMTP_PORT`          | SMTP server port             | 587              |
| `SMTP_USER`          | SMTP username                | -                |
| `SMTP_PASS`          | SMTP password                | -                |
| `SMTP_FROM`          | From email address           | -                |

### Volume Mounts

```yaml
volumes:
  # Database and user data
  - ./data:/app/data

  # Application logs
  - ./logs:/app/logs

  # Custom tools (optional)
  - ./custom-tools:/app/tools/custom
```

## Monitoring and Maintenance

### Health Checks

```bash
# Application health
curl http://localhost:3000/health

# Container status
docker-compose ps

# Resource usage
docker stats
```

### Log Management

```bash
# View real-time logs
docker-compose logs -f

# View specific service logs
docker-compose logs -f operon

# Export logs
docker-compose logs --no-color > operon.log
```

### Updates

```bash
# Pull latest image
docker-compose pull

# Restart with new image
docker-compose up -d
```

## Scaling and High Availability

### Load Balancing

For high-traffic deployments:

```yaml
services:
  operon-1:
    image: operon:latest
    environment:
      - INSTANCE_ID=1

  operon-2:
    image: operon:latest
    environment:
      - INSTANCE_ID=2

  load-balancer:
    image: nginx:alpine
    ports:
      - "3000:80"
    depends_on:
      - operon-1
      - operon-2
```

### Database Backup

```bash
# Manual backup
docker-compose exec operon cp /app/data/operon.db /app/data/backup-$(date +%Y%m%d).db

# Automated backup script
echo "0 2 * * * docker-compose exec operon cp /app/data/operon.db /app/data/backup-\$(date +\%Y\%m\%d).db" | crontab -
```

## Troubleshooting

### Common Issues

#### Port Conflicts

```bash
# Check what's using port 3000
sudo lsof -i :3000

# Use different port
echo "PORT=3001" >> .env
docker-compose up -d
```

#### Permission Issues

```bash
# Fix data directory permissions
sudo chown -R 1000:1000 ./data
```

#### Container Won't Start

```bash
# Check container logs
docker-compose logs operon

# Restart services
docker-compose restart

# Complete rebuild
docker-compose down
docker-compose up -d --build
```

## Next Steps

- [Getting Started](./getting-started.md) - Basic configuration and first steps
- [API Reference](./api/index.md) - Integration documentation
- [Tools Overview](./tools/index.md) - Available AI tools
