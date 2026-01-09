#!/bin/bash
set -e

echo "Starting HomeMail entrypoint script..."

# Создаем необходимые директории
mkdir -p /var/lib/stalwart/data \
    /var/lib/stalwart/certs \
    /var/log/stalwart \
    /opt/stalwart/etc \
    /var/lib/nginx \
    /run/nginx \
    /app/webmail

# Устанавливаем права доступа для директорий Stalwart
chown -R root:root /var/lib/stalwart || true
chmod -R 755 /var/lib/stalwart || true

# Устанавливаем права для nginx
chown -R root:root /var/lib/nginx /run/nginx || true
chmod -R 755 /var/lib/nginx /run/nginx || true

# Устанавливаем права для webmail (если пользователь nextjs существует)
if id -u nextjs >/dev/null 2>&1; then
    chown -R nextjs:nodejs /app/webmail || true
    chmod -R 755 /app/webmail || true
fi

# Проверяем наличие конфигурации Stalwart
if [ ! -f "/opt/stalwart/etc/config.toml" ]; then
    echo "WARNING: Stalwart config.toml not found at /opt/stalwart/etc/config.toml"
    echo "Creating default config..."
    mkdir -p /opt/stalwart/etc
    cat > /opt/stalwart/etc/config.toml << 'EOF'
[server]
hostname = "localhost"

[server.listener."http"]
bind = ["0.0.0.0:8080"]
protocol = "http"

[server.listener."smtp"]
bind = ["0.0.0.0:25"]
protocol = "smtp"

[server.listener."submission"]
bind = ["0.0.0.0:587"]
protocol = "smtp"
starttls = "optional"
auth = ["plain", "login"]

[server.listener."imap"]
bind = ["0.0.0.0:143"]
protocol = "imap"
starttls = "optional"

[server.listener."imaptls"]
bind = ["0.0.0.0:993"]
protocol = "imap"
tls.implicit = true

[storage]
data = "rocksdb"
fts = "rocksdb"
blob = "rocksdb"
lookup = "rocksdb"
directory = "internal"

[store."rocksdb"]
type = "rocksdb"
path = "/var/lib/stalwart/data/"
compression = "lz4"

[directory."internal"]
type = "internal"
store = "rocksdb"

[spam]
enabled = false

[authentication.fallback-admin]
user = "admin"
secret = "plain:admin123"

[[directory."internal".users]]
name = "admin@pavlovteam.ru"
secret = "plain:admin123"
superuser = true

[tracer."stdout"]
type = "stdout"
level = "info"
ansi = false
enable = true
EOF
fi

# Проверяем наличие nginx конфигурации
if [ ! -f "/etc/nginx/conf.d/default.conf" ]; then
    echo "WARNING: Nginx config not found, using default..."
    mkdir -p /etc/nginx/conf.d
fi

# Проверяем, что nginx бинарник существует и исполняемый
NGINX_BIN=$(which nginx || echo "")
if [ -z "$NGINX_BIN" ]; then
    if [ -f "/usr/sbin/nginx" ]; then
        NGINX_BIN="/usr/sbin/nginx"
    else
        echo "ERROR: nginx binary not found"
        echo "Searching for nginx..."
        find /usr -name nginx 2>/dev/null || echo "nginx not found"
        exit 1
    fi
fi

echo "Using nginx at: $NGINX_BIN"
chmod +x "$NGINX_BIN" || true

# Проверяем конфигурацию nginx
if [ -f "/etc/nginx/conf.d/default.conf" ]; then
    echo "Testing nginx configuration..."
    nginx -t || echo "WARNING: nginx config test failed, but continuing..."
fi

# Проверяем, что Stalwart бинарник существует
if [ ! -f "/usr/local/bin/stalwart" ]; then
    echo "ERROR: Stalwart binary not found at /usr/local/bin/stalwart"
    exit 1
fi

chmod +x /usr/local/bin/stalwart || true

# Проверяем, что webmail server.js существует
if [ ! -f "/app/webmail/server.js" ]; then
    echo "WARNING: webmail server.js not found at /app/webmail/server.js"
    ls -la /app/webmail/ || echo "Directory /app/webmail does not exist"
fi

# Проверяем права на директорию данных Stalwart
if [ -d "/var/lib/stalwart/data" ]; then
    echo "Checking Stalwart data directory permissions..."
    ls -ld /var/lib/stalwart/data || true
    # Убеждаемся, что директория доступна для записи
    touch /var/lib/stalwart/data/.test 2>/dev/null && rm -f /var/lib/stalwart/data/.test && echo "Stalwart data directory is writable" || echo "WARNING: Stalwart data directory may not be writable"
fi

echo "Entrypoint initialization complete. Starting supervisor..."

# Запускаем supervisor
exec /usr/bin/supervisord -c /etc/supervisor/conf.d/supervisord.conf
