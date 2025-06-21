# Docker Setup

Docker is the recommended way to run Operon.one. This guide covers everything you need to know about deploying and managing Operon.one with Docker.

## Prerequisites

- **Docker**: Version 20.10 or higher
- **Docker Compose**: Version 2.0 or higher
- **System Requirements**: 2GB RAM, 10GB disk space minimum

## Quick Setup

### 1. Download Docker Compose

```bash
curl -O https://raw.githubusercontent.com/neooriginal/Operon.one/main/docker-compose.yml
```

### 2. Create Environment File

Create a `.env` file in the same directory:

```env
# Required Configuration
OPENROUTER_API_KEY=your_openrouter_api_key_here
JWT_SECRET=your_secure_jwt_secret_here

# Optional Configuration
PORT=3000
NODE_ENV=production

# Database
DATABASE_PATH=/app/data/operon.db

# Email Configuration (Optional)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
SMTP_FROM=noreply@yourdomain.com

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX=100
```

### 3. Start the Application

```bash
docker-compose up -d
```

### 4. Verify Installation

```bash
# Check if containers are running
docker-compose ps

# View application logs
docker-compose logs -f operon

# Check health status
curl http://localhost:3000/health
```

## Docker Compose Configuration

Here's the complete `docker-compose.yml` file:

```yaml
version: "3.8"

services:
  operon:
    image: neooriginal/operon.one:latest
    container_name: operon-app
    ports:
      - "${PORT:-3000}:3000"
    environment:
      - NODE_ENV=${NODE_ENV:-production}
      - PORT=3000
      - OPENROUTER_API_KEY=${OPENROUTER_API_KEY}
      - JWT_SECRET=${JWT_SECRET}
      - DATABASE_PATH=/app/data/operon.db
      - SMTP_HOST=${SMTP_HOST}
      - SMTP_PORT=${SMTP_PORT}
      - SMTP_USER=${SMTP_USER}
      - SMTP_PASS=${SMTP_PASS}
      - SMTP_FROM=${SMTP_FROM}
      - RATE_LIMIT_WINDOW_MS=${RATE_LIMIT_WINDOW_MS:-900000}
      - RATE_LIMIT_MAX=${RATE_LIMIT_MAX:-100}
    volumes:
      - operon_data:/app/data
      - operon_logs:/app/logs
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s

volumes:
  operon_data:
    driver: local
  operon_logs:
    driver: local

networks:
  default:
    name: operon-network
```

## Management Commands

### Starting and Stopping

```bash
# Start services
docker-compose up -d

# Stop services
docker-compose down

# Restart services
docker-compose restart

# Stop and remove everything (including volumes)
docker-compose down -v
```

### Viewing Logs

```bash
# View all logs
docker-compose logs

# Follow logs in real-time
docker-compose logs -f

# View logs for specific service
docker-compose logs operon

# View last 100 lines
docker-compose logs --tail=100 operon
```

### Updates

```bash
# Pull latest image
docker-compose pull

# Restart with new image
docker-compose up -d

# Remove old images
docker image prune -f
```

## Advanced Configuration

### Custom Network

```yaml
networks:
  operon-network:
    driver: bridge
    ipam:
      config:
        - subnet: 172.20.0.0/16
```

### Resource Limits

```yaml
services:
  operon:
    # ... other configuration
    deploy:
      resources:
        limits:
          memory: 2G
          cpus: "1.0"
        reservations:
          memory: 512M
          cpus: "0.25"
```

### Health Checks

```yaml
healthcheck:
  test: ["CMD", "curl", "-f", "http://localhost:3000/health"]
  interval: 30s
  timeout: 10s
  retries: 3
  start_period: 40s
```

## SSL/TLS with Reverse Proxy

### Using Nginx

Create `nginx.conf`:

```nginx
server {
    listen 80;
    server_name your-domain.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name your-domain.com;

    ssl_certificate /etc/ssl/certs/your-cert.pem;
    ssl_certificate_key /etc/ssl/private/your-key.pem;

    location / {
        proxy_pass http://operon:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

Update `docker-compose.yml`:

```yaml
services:
  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/conf.d/default.conf
      - ./ssl:/etc/ssl
    depends_on:
      - operon

  operon:
    # Remove ports section since nginx handles it
    expose:
      - "3000"
    # ... rest of configuration
```

### Using Traefik

```yaml
version: "3.8"

services:
  traefik:
    image: traefik:v2.10
    command:
      - --api.dashboard=true
      - --providers.docker=true
      - --entrypoints.web.address=:80
      - --entrypoints.websecure.address=:443
      - --certificatesresolvers.letsencrypt.acme.email=your-email@domain.com
      - --certificatesresolvers.letsencrypt.acme.storage=/letsencrypt/acme.json
      - --certificatesresolvers.letsencrypt.acme.httpchallenge.entrypoint=web
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
      - letsencrypt:/letsencrypt
    labels:
      - traefik.http.routers.api.rule=Host(`traefik.your-domain.com`)
      - traefik.http.routers.api.tls.certresolver=letsencrypt

  operon:
    image: neooriginal/operon.one:latest
    labels:
      - traefik.http.routers.operon.rule=Host(`your-domain.com`)
      - traefik.http.routers.operon.tls.certresolver=letsencrypt
      - traefik.http.services.operon.loadbalancer.server.port=3000
    # ... rest of configuration

volumes:
  letsencrypt:
```

## Monitoring and Logging

### Prometheus Metrics

Add to `docker-compose.yml`:

```yaml
services:
  prometheus:
    image: prom/prometheus
    ports:
      - "9090:9090"
    volumes:
      - ./prometheus.yml:/etc/prometheus/prometheus.yml
      - prometheus_data:/prometheus

  grafana:
    image: grafana/grafana
    ports:
      - "3001:3000"
    environment:
      - GF_SECURITY_ADMIN_PASSWORD=admin
    volumes:
      - grafana_data:/var/lib/grafana

volumes:
  prometheus_data:
  grafana_data:
```

### Log Aggregation

```yaml
services:
  elasticsearch:
    image: docker.elastic.co/elasticsearch/elasticsearch:8.8.0
    environment:
      - discovery.type=single-node
      - "ES_JAVA_OPTS=-Xms512m -Xmx512m"

  logstash:
    image: docker.elastic.co/logstash/logstash:8.8.0
    volumes:
      - ./logstash.conf:/usr/share/logstash/pipeline/logstash.conf

  kibana:
    image: docker.elastic.co/kibana/kibana:8.8.0
    ports:
      - "5601:5601"
```

## Backup and Recovery

### Database Backup

```bash
# Create backup
docker-compose exec operon cp /app/data/operon.db /app/data/backup-$(date +%Y%m%d).db

# Copy backup to host
docker cp operon-app:/app/data/backup-$(date +%Y%m%d).db ./backups/

# Automated backup script
#!/bin/bash
BACKUP_DIR="./backups"
CONTAINER_NAME="operon-app"
DB_PATH="/app/data/operon.db"

mkdir -p $BACKUP_DIR
BACKUP_FILE="$BACKUP_DIR/operon-backup-$(date +%Y%m%d-%H%M%S).db"

docker exec $CONTAINER_NAME cp $DB_PATH /tmp/backup.db
docker cp $CONTAINER_NAME:/tmp/backup.db $BACKUP_FILE

# Keep only last 7 days of backups
find $BACKUP_DIR -name "operon-backup-*.db" -mtime +7 -delete
```

### Volume Backup

```bash
# Backup volumes
docker run --rm -v operon_data:/data -v $(pwd):/backup alpine tar czf /backup/operon-data-backup.tar.gz -C /data .

# Restore volumes
docker run --rm -v operon_data:/data -v $(pwd):/backup alpine tar xzf /backup/operon-data-backup.tar.gz -C /data
```

## Troubleshooting

### Common Issues

#### Container Won't Start

```bash
# Check logs
docker-compose logs operon

# Check resource usage
docker stats

# Verify environment variables
docker-compose config
```

#### Port Conflicts

```bash
# Find what's using the port
netstat -tulpn | grep :3000

# Change port in .env file
echo "PORT=3001" >> .env
docker-compose up -d
```

#### Permission Issues

```bash
# Fix volume permissions
docker-compose exec operon chown -R app:app /app/data
```

### Performance Tuning

```yaml
services:
  operon:
    # ... other configuration
    environment:
      - NODE_OPTIONS=--max-old-space-size=2048
    ulimits:
      nofile:
        soft: 65536
        hard: 65536
```

## Production Considerations

1. **Security**: Use secrets management, not environment variables
2. **Monitoring**: Set up proper monitoring and alerting
3. **Backups**: Implement automated backup strategies
4. **Updates**: Plan for zero-downtime updates
5. **Scaling**: Consider load balancing for high traffic
6. **Logging**: Centralize log collection and analysis

## Next Steps

- [Environment Configuration](/guide/configuration/environment)
- [Admin Panel Setup](/guide/configuration/admin-panel)
- [API Documentation](/api/)
- [Monitoring Setup](/guide/monitoring/)
