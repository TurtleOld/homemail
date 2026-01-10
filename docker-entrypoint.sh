#!/bin/bash
set -e

log() {
    echo "[$(date -u +'%Y-%m-%dT%H:%M:%SZ')] $*"
}

log "Starting HomeMail entrypoint script..."

mkdir -p /var/lib/stalwart/data \
    /var/lib/stalwart/certs \
    /var/log/stalwart \
    /opt/stalwart/etc \
    /var/lib/nginx \
    /run/nginx \
    /app/webmail

chown -R root:root /var/lib/stalwart || true
chmod -R 755 /var/lib/stalwart || true

chown -R root:root /var/lib/nginx /run/nginx || true
chmod -R 755 /var/lib/nginx /run/nginx || true

if id -u nextjs >/dev/null 2>&1; then
    chown -R nextjs:nodejs /app/webmail || true
    chmod -R 755 /app/webmail || true
fi
if [ ! -f "/opt/stalwart/etc/config.toml" ]; then
    log "INFO: Stalwart config.toml not found at /opt/stalwart/etc/config.toml"
    log "INFO: Checking for files in /opt/stalwart/etc/..."
    ls -la /opt/stalwart/etc/ || log "INFO: Directory /opt/stalwart/etc/ does not exist or is empty"
    
    if [ -f "/opt/stalwart/etc/config.toml.default" ]; then
        log "WARNING: Stalwart config not found in volume, copying default config..."
        cp /opt/stalwart/etc/config.toml.default /opt/stalwart/etc/config.toml
        log "WARNING: Default Stalwart config copied to /opt/stalwart/etc/config.toml"
        log "WARNING: This file will be overwritten on container restart if volume mount is used!"
        log "WARNING: You should create config.toml in your mounted volume directory."
    else
        log "ERROR: Stalwart config not found and no default config in image"
        exit 1
    fi
else
    log "INFO: Found existing Stalwart config at /opt/stalwart/etc/config.toml"
fi

if [ -f "/opt/stalwart/etc/config.toml" ]; then
    if [ "${ALLOW_INSECURE_CREDENTIALS}" != "true" ]; then
        if grep -v '^\s*#' /opt/stalwart/etc/config.toml | grep -q "plain:admin123" || \
           grep -v '^\s*#' /opt/stalwart/etc/config.toml | grep -q "plain:test123"; then
            log "WARNING: Insecure default credentials (plain:admin123 or plain:test123) found in /opt/stalwart/etc/config.toml"
            log "WARNING: This is a security risk. Please replace with bcrypt hashes."
            log "WARNING: To disable this check, set ALLOW_INSECURE_CREDENTIALS=true environment variable."
            log "WARNING: Continuing anyway, but please fix your configuration!"
        fi
    fi
fi

rm -f /etc/nginx/sites-enabled/default /etc/nginx/sites-available/default 2>/dev/null || true

if [ ! -f "/etc/nginx/conf.d/default.conf" ]; then
    if [ -f "/etc/nginx/conf.d/nginx.conf" ]; then
        log "Found nginx.conf, renaming to default.conf..."
        mv /etc/nginx/conf.d/nginx.conf /etc/nginx/conf.d/default.conf
        log "nginx.conf renamed to default.conf"
    elif [ -f "/etc/nginx/conf.d/default.conf.default" ]; then
        log "Nginx config not found in volume, copying default config..."
        cp /etc/nginx/conf.d/default.conf.default /etc/nginx/conf.d/default.conf
        log "Default Nginx config copied to /etc/nginx/conf.d/default.conf"
        log "You can now edit this file on the host and restart the container."
    else
        log "WARNING: Nginx default config not found in image, creating minimal config..."
        mkdir -p /etc/nginx/conf.d
        cat > /etc/nginx/conf.d/default.conf << 'NGINX_EOF'
upstream mailclient {
    server localhost:3000;
    keepalive 64;
}

server {
    listen 80;
    server_name _;
    
    location / {
        proxy_pass http://mailclient;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
    
    location /api/health {
        proxy_pass http://mailclient;
        access_log off;
    }
}
NGINX_EOF
    fi
fi

rm -f /etc/nginx/conf.d/default.conf.bak 2>/dev/null || true
if [ -f "/etc/nginx/conf.d/nginx.conf" ] && [ -f "/etc/nginx/conf.d/default.conf" ]; then
    log "WARNING: Both nginx.conf and default.conf exist. Removing nginx.conf to avoid conflicts..."
    rm -f /etc/nginx/conf.d/nginx.conf
fi

NGINX_BIN=$(which nginx || echo "")
if [ -z "$NGINX_BIN" ]; then
    if [ -f "/usr/sbin/nginx" ]; then
        NGINX_BIN="/usr/sbin/nginx"
    else
        log "ERROR: nginx binary not found"
        log "Searching for nginx..."
        find /usr -name nginx 2>/dev/null || log "nginx not found"
        exit 1
    fi
fi

log "Using nginx at: $NGINX_BIN"
chmod +x "$NGINX_BIN" || true

if [ -f "/etc/nginx/conf.d/default.conf" ]; then
    log "Testing nginx configuration..."
    nginx -t || log "WARNING: nginx config test failed, but continuing..."
fi

if [ ! -f "/usr/local/bin/stalwart" ]; then
    log "ERROR: Stalwart binary not found at /usr/local/bin/stalwart"
    exit 1
fi

chmod +x /usr/local/bin/stalwart || true

if [ ! -f "/app/webmail/server.js" ]; then
    log "WARNING: webmail server.js not found at /app/webmail/server.js"
    ls -la /app/webmail/ || log "Directory /app/webmail does not exist"
fi

if [ -d "/var/lib/stalwart/data" ]; then
    log "Checking Stalwart data directory permissions..."
    ls -ld /var/lib/stalwart/data || true
    touch /var/lib/stalwart/data/.test 2>/dev/null && rm -f /var/lib/stalwart/data/.test && log "Stalwart data directory is writable" || log "WARNING: Stalwart data directory may not be writable"
    
    if [ ! -d "/var/lib/stalwart/data/rocksdb" ] && [ -z "$(ls -A /var/lib/stalwart/data 2>/dev/null)" ]; then
        log "Stalwart data directory is empty, initializing..."
        mkdir -p /var/lib/stalwart/data/rocksdb || true
    fi
fi

if ! id -u www-data >/dev/null 2>&1; then
    log "Creating www-data user for nginx..."
    groupadd -r www-data 2>/dev/null || true
    useradd -r -g www-data www-data 2>/dev/null || true
fi

if [ -f "/opt/stalwart/etc/config.toml" ]; then
    log "Validating Stalwart config..."
    
    if ! grep -q "^\[storage\]" /opt/stalwart/etc/config.toml; then
        log "WARNING: [storage] section not found in config.toml"
    fi
    
    if ! grep -q "^\[store" /opt/stalwart/etc/config.toml; then
        log "WARNING: [store] section not found in config.toml"
    fi
    
    log "Stalwart config validated"
fi

log "Entrypoint initialization complete. Starting supervisor..."

exec /usr/bin/supervisord -c /etc/supervisor/conf.d/supervisord.conf