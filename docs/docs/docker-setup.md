# Docker Setup

Deploy Operon.one using Docker for production environments.

## Quick Start

### 1. Download Docker Compose

```bash
curl -O https://raw.githubusercontent.com/neooriginal/Operon.one/main/docker-compose.yml
```

### 2. Configure Environment

Create a `.env` file:

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
```

### 3. Start Services

```bash
docker-compose up -d
```

### 4. Verify Installation

```bash
curl http://localhost:3000/health
```

## Advanced Configuration

### Custom Networks

```yaml
networks:
  operon-network:
    driver: bridge
```

### Volume Mounts

```yaml
volumes:
  - ./data:/app/data
  - ./logs:/app/logs
```

### Environment Variables

See [Getting Started](./getting-started.md) for full environment variable reference.

## Monitoring

Monitor your Operon.one deployment with built-in health checks and logging.

### Health Checks

```bash
# Check application health
curl http://localhost:3000/health

# View container logs
docker-compose logs -f
```

### Performance Monitoring

Access logs and metrics through the admin panel at `http://localhost:3000/admin`.

## Scaling

For high-traffic deployments, consider using Docker Swarm or Kubernetes.

## Next Steps

- [Getting Started](./getting-started.md) - Basic setup and configuration
- [API Reference](./api/index.md) - Integration documentation
