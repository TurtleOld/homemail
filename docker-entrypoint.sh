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

# Инициализация конфигураций в mount volumes
# Если конфиги не существуют в mount point, копируем дефолтные из образа

# Stalwart конфигурация
if [ ! -f "/opt/stalwart/etc/config.toml" ]; then
    if [ -f "/opt/stalwart/etc/config.toml.default" ]; then
        echo "Stalwart config not found in volume, copying default config..."
        cp /opt/stalwart/etc/config.toml.default /opt/stalwart/etc/config.toml
        echo "Default Stalwart config copied to /opt/stalwart/etc/config.toml"
        echo "You can now edit this file on the host and restart the container."
    else
        echo "WARNING: Stalwart default config not found in image, creating minimal config..."
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
spam = "rocksdb"

[store."rocksdb"]
type = "rocksdb"
path = "/var/lib/stalwart/data/"
compression = "lz4"

[directory."internal"]
type = "internal"
store = "rocksdb"

[spam]
enabled = false
store = "rocksdb"

[authentication.fallback-admin]
user = "admin"
secret = "plain:admin123"

[[directory."internal".users]]
name = "admin@example.com"
secret = "plain:admin123"
superuser = true

[tracer."stdout"]
type = "stdout"
level = "info"
ansi = false
enable = true
EOF
    fi
fi

# Nginx конфигурация
# Удаляем дефолтные конфиги nginx, если они есть
rm -f /etc/nginx/sites-enabled/default /etc/nginx/sites-available/default 2>/dev/null || true

# Проверяем наличие конфигов nginx
if [ ! -f "/etc/nginx/conf.d/default.conf" ]; then
    # Если есть nginx.conf, переименовываем его в default.conf
    if [ -f "/etc/nginx/conf.d/nginx.conf" ]; then
        echo "Found nginx.conf, renaming to default.conf..."
        mv /etc/nginx/conf.d/nginx.conf /etc/nginx/conf.d/default.conf
        echo "nginx.conf renamed to default.conf"
    # Если есть дефолтный конфиг в образе, копируем его
    elif [ -f "/etc/nginx/conf.d/default.conf.default" ]; then
        echo "Nginx config not found in volume, copying default config..."
        cp /etc/nginx/conf.d/default.conf.default /etc/nginx/conf.d/default.conf
        echo "Default Nginx config copied to /etc/nginx/conf.d/default.conf"
        echo "You can now edit this file on the host and restart the container."
    # Если нет никаких конфигов, создаем минимальный
    else
        echo "WARNING: Nginx default config not found in image, creating minimal config..."
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

# Убеждаемся, что наш конфиг используется (удаляем другие дефолтные конфиги и дубликаты)
rm -f /etc/nginx/conf.d/default.conf.bak 2>/dev/null || true
# Удаляем nginx.conf, если он остался (чтобы избежать конфликтов)
if [ -f "/etc/nginx/conf.d/nginx.conf" ] && [ -f "/etc/nginx/conf.d/default.conf" ]; then
    echo "WARNING: Both nginx.conf and default.conf exist. Removing nginx.conf to avoid conflicts..."
    rm -f /etc/nginx/conf.d/nginx.conf
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
    
    # Если директория пуста или повреждена, создаем базовую структуру
    if [ ! -d "/var/lib/stalwart/data/rocksdb" ] && [ -z "$(ls -A /var/lib/stalwart/data 2>/dev/null)" ]; then
        echo "Stalwart data directory is empty, initializing..."
        mkdir -p /var/lib/stalwart/data/rocksdb || true
    fi
fi

# Убеждаемся, что пользователь www-data существует для nginx
if ! id -u www-data >/dev/null 2>&1; then
    echo "Creating www-data user for nginx..."
    groupadd -r www-data 2>/dev/null || true
    useradd -r -g www-data www-data 2>/dev/null || true
fi

# Валидируем конфигурацию Stalwart (добавляем spam секцию, если её нет или она неполная)
if [ -f "/opt/stalwart/etc/config.toml" ]; then
    echo "Validating Stalwart config..."
    
    # Проверяем наличие секции spam
    HAS_SPAM_SECTION=$(grep -c "^\[spam\]" /opt/stalwart/etc/config.toml 2>/dev/null || echo "0")
    HAS_SPAM_STORE=$(grep -A 3 "^\[spam\]" /opt/stalwart/etc/config.toml 2>/dev/null | grep -c "store" || echo "0")
    
    if [ "$HAS_SPAM_SECTION" -eq 0 ] || [ "$HAS_SPAM_STORE" -eq 0 ]; then
        echo "Adding/updating spam filter configuration..."
        
        # Удаляем старую секцию spam полностью
        sed -i '/^\[spam\]/,/^\[/{ /^\[spam\]/d; /^\[/!d; }' /opt/stalwart/etc/config.toml 2>/dev/null || true
        sed -i '/^enabled = false$/d; /^store = "rocksdb"$/d' /opt/stalwart/etc/config.toml 2>/dev/null || true
        
        # Находим место для вставки
        if grep -q "^\[tracer" /opt/stalwart/etc/config.toml; then
            sed -i '/^\[tracer/i[spam]\nenabled = false\nstore = "rocksdb"\n' /opt/stalwart/etc/config.toml
        elif grep -q "^\[authentication" /opt/stalwart/etc/config.toml; then
            sed -i '/^\[authentication/i[spam]\nenabled = false\nstore = "rocksdb"\n' /opt/stalwart/etc/config.toml
        else
            echo "" >> /opt/stalwart/etc/config.toml
            echo "[spam]" >> /opt/stalwart/etc/config.toml
            echo "enabled = false" >> /opt/stalwart/etc/config.toml
            echo "store = \"rocksdb\"" >> /opt/stalwart/etc/config.toml
        fi
        
        echo "Spam filter configuration added/updated"
    fi
    
    # Проверяем наличие spam в секции storage
    if ! grep -q "^spam = " /opt/stalwart/etc/config.toml; then
        echo "Adding spam to storage section..."
        if grep -q "^directory = " /opt/stalwart/etc/config.toml; then
            sed -i '/^directory = /a spam = "rocksdb"' /opt/stalwart/etc/config.toml
        else
            sed -i '/^\[storage\]/a spam = "rocksdb"' /opt/stalwart/etc/config.toml
        fi
    fi
    
    echo "Stalwart config validated and ready"
fi

echo "Entrypoint initialization complete. Starting supervisor..."

# Запускаем supervisor
exec /usr/bin/supervisord -c /etc/supervisor/conf.d/supervisord.conf