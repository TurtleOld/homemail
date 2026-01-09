# Multi-stage build для единого образа с webmail, nginx и stalwart

# ============================================
# Stage 1: Webmail (Next.js)
# ============================================
FROM node:20-alpine AS webmail-base

RUN apk add --no-cache libc6-compat
WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci

FROM webmail-base AS webmail-builder
COPY . .
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM webmail-base AS webmail-runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

COPY --from=webmail-builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=webmail-builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# ============================================
# Stage 2: Nginx
# ============================================
FROM nginx:alpine AS nginx-base
RUN rm -f /etc/nginx/conf.d/default.conf
COPY nginx/nginx.conf /etc/nginx/conf.d/default.conf

# ============================================
# Final: Объединенный образ на базе Stalwart
# ============================================
FROM stalwartlabs/stalwart:latest

# Устанавливаем Node.js, nginx и supervisor
RUN apt-get update && apt-get install -y \
    curl \
    wget \
    nginx \
    supervisor \
    ca-certificates \
    && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y nodejs \
    && rm -rf /var/lib/apt/lists/*

# Создаем пользователя www-data для nginx (если его нет)
RUN id -u www-data >/dev/null 2>&1 || \
    (groupadd -r www-data && useradd -r -g www-data www-data) || true

# Копируем webmail
COPY --from=webmail-runner /app /app/webmail
COPY --from=webmail-runner /etc/passwd /etc/passwd
COPY --from=webmail-runner /etc/group /etc/group

# Копируем конфигурации в образ (как дефолтные)
# Удаляем дефолтный конфиг nginx из Debian образа
RUN rm -f /etc/nginx/sites-enabled/default /etc/nginx/sites-available/default || true
# Nginx конфигурация (дефолтная) - копируем наш кастомный конфиг
COPY nginx/nginx.conf /etc/nginx/conf.d/default.conf.default
# Stalwart конфигурация (дефолтная)
COPY stalwart/config.toml /opt/stalwart/etc/config.toml.default
RUN mkdir -p /var/lib/nginx /run/nginx /var/cache/nginx /var/log/nginx /etc/nginx/conf.d

# Создаем директории для Stalwart (если их нет)
RUN mkdir -p /var/lib/stalwart/data \
    /var/lib/stalwart/certs \
    /var/log/stalwart \
    /opt/stalwart/etc

# Создаем скрипты запуска
RUN echo '#!/bin/bash' > /usr/local/bin/start-webmail.sh && \
    echo 'cd /app/webmail' >> /usr/local/bin/start-webmail.sh && \
    echo 'export PORT=3000' >> /usr/local/bin/start-webmail.sh && \
    echo 'export HOSTNAME="0.0.0.0"' >> /usr/local/bin/start-webmail.sh && \
    echo 'exec node server.js' >> /usr/local/bin/start-webmail.sh && \
    chmod +x /usr/local/bin/start-webmail.sh

RUN echo '#!/bin/bash' > /usr/local/bin/start-nginx.sh && \
    echo 'nginx -t' >> /usr/local/bin/start-nginx.sh && \
    echo 'exec nginx -g "daemon off;"' >> /usr/local/bin/start-nginx.sh && \
    chmod +x /usr/local/bin/start-nginx.sh

RUN echo '#!/bin/bash' > /usr/local/bin/start-stalwart.sh && \
    echo 'exec stalwart --config /opt/stalwart/etc/config.toml' >> /usr/local/bin/start-stalwart.sh && \
    chmod +x /usr/local/bin/start-stalwart.sh

# Копируем entrypoint скрипт
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

# Supervisor конфигурация
RUN mkdir -p /etc/supervisor/conf.d && \
    echo '[supervisord]' > /etc/supervisor/conf.d/supervisord.conf && \
    echo 'nodaemon=true' >> /etc/supervisor/conf.d/supervisord.conf && \
    echo 'user=root' >> /etc/supervisor/conf.d/supervisord.conf && \
    echo 'logfile=/dev/stdout' >> /etc/supervisor/conf.d/supervisord.conf && \
    echo 'logfile_maxbytes=0' >> /etc/supervisor/conf.d/supervisord.conf && \
    echo '' >> /etc/supervisor/conf.d/supervisord.conf && \
    echo '[program:stalwart]' >> /etc/supervisor/conf.d/supervisord.conf && \
    echo 'command=/usr/local/bin/start-stalwart.sh' >> /etc/supervisor/conf.d/supervisord.conf && \
    echo 'autorestart=true' >> /etc/supervisor/conf.d/supervisord.conf && \
    echo 'startsecs=3' >> /etc/supervisor/conf.d/supervisord.conf && \
    echo 'startretries=3' >> /etc/supervisor/conf.d/supervisord.conf && \
    echo 'stdout_logfile=/dev/stdout' >> /etc/supervisor/conf.d/supervisord.conf && \
    echo 'stdout_logfile_maxbytes=0' >> /etc/supervisor/conf.d/supervisord.conf && \
    echo 'stderr_logfile=/dev/stderr' >> /etc/supervisor/conf.d/supervisord.conf && \
    echo 'stderr_logfile_maxbytes=0' >> /etc/supervisor/conf.d/supervisord.conf && \
    echo '' >> /etc/supervisor/conf.d/supervisord.conf && \
    echo '[program:webmail]' >> /etc/supervisor/conf.d/supervisord.conf && \
    echo 'command=/usr/local/bin/start-webmail.sh' >> /etc/supervisor/conf.d/supervisord.conf && \
    echo 'user=nextjs' >> /etc/supervisor/conf.d/supervisord.conf && \
    echo 'autorestart=true' >> /etc/supervisor/conf.d/supervisord.conf && \
    echo 'startsecs=3' >> /etc/supervisor/conf.d/supervisord.conf && \
    echo 'startretries=3' >> /etc/supervisor/conf.d/supervisord.conf && \
    echo 'stdout_logfile=/dev/stdout' >> /etc/supervisor/conf.d/supervisord.conf && \
    echo 'stdout_logfile_maxbytes=0' >> /etc/supervisor/conf.d/supervisord.conf && \
    echo 'stderr_logfile=/dev/stderr' >> /etc/supervisor/conf.d/supervisord.conf && \
    echo 'stderr_logfile_maxbytes=0' >> /etc/supervisor/conf.d/supervisord.conf && \
    echo '' >> /etc/supervisor/conf.d/supervisord.conf && \
    echo '[program:nginx]' >> /etc/supervisor/conf.d/supervisord.conf && \
    echo 'command=/usr/local/bin/start-nginx.sh' >> /etc/supervisor/conf.d/supervisord.conf && \
    echo 'autorestart=true' >> /etc/supervisor/conf.d/supervisord.conf && \
    echo 'startsecs=2' >> /etc/supervisor/conf.d/supervisord.conf && \
    echo 'startretries=3' >> /etc/supervisor/conf.d/supervisord.conf && \
    echo 'stdout_logfile=/dev/stdout' >> /etc/supervisor/conf.d/supervisord.conf && \
    echo 'stdout_logfile_maxbytes=0' >> /etc/supervisor/conf.d/supervisord.conf && \
    echo 'stderr_logfile=/dev/stderr' >> /etc/supervisor/conf.d/supervisord.conf && \
    echo 'stderr_logfile_maxbytes=0' >> /etc/supervisor/conf.d/supervisord.conf

EXPOSE 25 80 143 443 587 8080 993 3000

# Используем entrypoint для инициализации
ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
