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
IS_STALWART_MOUNT=false
STALWART_MOUNT_TARGET=$(findmnt -T /opt/stalwart/etc -o TARGET -n 2>/dev/null || echo "/")
if [ "$STALWART_MOUNT_TARGET" != "/" ]; then
    IS_STALWART_MOUNT=true
fi

STALWART_CONFIG="/opt/stalwart/etc/config.toml"
STALWART_CONFIG_EXAMPLE="/opt/stalwart/etc/config.toml.example"
STALWART_RUNTIME_CONFIG="/var/lib/stalwart/config.toml"
STALWART_CONFIG_HASH_FILE="/var/lib/stalwart/.config_hash"

if [ -f "$STALWART_CONFIG" ]; then
    log "INFO: Found Stalwart config at $STALWART_CONFIG"
    
    CURRENT_HASH=$(md5sum "$STALWART_CONFIG" 2>/dev/null | cut -d' ' -f1 || echo "none")
    SAVED_HASH=$(cat "$STALWART_CONFIG_HASH_FILE" 2>/dev/null || echo "")
    
    if [ -f "$STALWART_RUNTIME_CONFIG" ] && [ "$CURRENT_HASH" = "$SAVED_HASH" ]; then
        RUNTIME_HASH=$(md5sum "$STALWART_RUNTIME_CONFIG" 2>/dev/null | cut -d' ' -f1 || echo "runtime")
        if [ "$CURRENT_HASH" != "$RUNTIME_HASH" ]; then
            log "WARNING: Runtime config differs from mounted config (Stalwart may have modified it)"
            log "INFO: Restoring original mounted config to runtime location"
        fi
    fi
    
    log "INFO: Copying config to runtime location (protected from Stalwart auto-save)"
    cp "$STALWART_CONFIG" "$STALWART_RUNTIME_CONFIG"
    echo "$CURRENT_HASH" > "$STALWART_CONFIG_HASH_FILE"
    log "INFO: Runtime config created at $STALWART_RUNTIME_CONFIG"
    
elif [ -f "$STALWART_CONFIG_EXAMPLE" ]; then
    log "WARNING: config.toml not found, but config.toml.example exists"
    log "WARNING: Copying example config - PLEASE CUSTOMIZE IT!"
    cp "$STALWART_CONFIG_EXAMPLE" "$STALWART_CONFIG"
    cp "$STALWART_CONFIG" "$STALWART_RUNTIME_CONFIG"
    md5sum "$STALWART_CONFIG" 2>/dev/null | cut -d' ' -f1 > "$STALWART_CONFIG_HASH_FILE"
    log "WARNING: Example config copied. Edit $STALWART_CONFIG with your settings!"
    
else
    log "INFO: Stalwart config.toml not found at $STALWART_CONFIG"
    ls -la /opt/stalwart/etc/ 2>/dev/null || log "INFO: Directory /opt/stalwart/etc/ is empty"

    if [ "$IS_STALWART_MOUNT" = "true" ]; then
        log "ERROR: /opt/stalwart/etc is mounted but config.toml is missing"
        log "ERROR: Please create config.toml in your mounted volume directory"
        log "ERROR: You can copy from config.toml.example as a starting point"
        exit 1
    elif [ -f "/opt/stalwart/etc/config.toml.default" ]; then
        log "WARNING: Using default config from image"
        cp /opt/stalwart/etc/config.toml.default "$STALWART_CONFIG"
        cp "$STALWART_CONFIG" "$STALWART_RUNTIME_CONFIG"
        md5sum "$STALWART_CONFIG" 2>/dev/null | cut -d' ' -f1 > "$STALWART_CONFIG_HASH_FILE"
    else
        log "ERROR: Stalwart config not found and no default/example config available"
        exit 1
    fi
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

IS_NGINX_MOUNT_POINT=false
if mountpoint -q /etc/nginx/conf.d 2>/dev/null; then
    IS_NGINX_MOUNT_POINT=true
fi

if [ -f "/etc/nginx/conf.d/default.conf" ]; then
    log "INFO: Found existing Nginx config at /etc/nginx/conf.d/default.conf"
else
    log "INFO: Nginx default.conf not found at /etc/nginx/conf.d/default.conf"
    log "INFO: Checking for files in /etc/nginx/conf.d/..."
    ls -la /etc/nginx/conf.d/ || log "INFO: Directory /etc/nginx/conf.d/ does not exist or is empty"

    if [ "$IS_NGINX_MOUNT_POINT" = "true" ]; then
        log "WARNING: /etc/nginx/conf.d is a mount point, but default.conf is missing"
        log "WARNING: Please create default.conf in your mounted volume directory"
    elif [ -f "/etc/nginx/conf.d/nginx.conf" ]; then
        log "Found nginx.conf, renaming to default.conf"
        mv /etc/nginx/conf.d/nginx.conf /etc/nginx/conf.d/default.conf
        log "nginx.conf renamed to default.conf"
    elif [ -f "/etc/nginx/conf.d/default.conf.default" ]; then
        log "WARNING: Nginx config not found, copying default config"
        cp /etc/nginx/conf.d/default.conf.default /etc/nginx/conf.d/default.conf
        log "WARNING: Default Nginx config copied to /etc/nginx/conf.d/default.conf"
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