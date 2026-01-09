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
# Final: Объединенный образ на базе Debian (для Stalwart)
# ============================================
FROM debian:bookworm-slim

RUN apt-get update && apt-get install -y \
    nodejs \
    npm \
    nginx \
    curl \
    wget \
    supervisor \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Устанавливаем Stalwart
COPY --from=stalwartlabs/stalwart:latest /usr/local/bin/stalwart /usr/local/bin/stalwart
RUN chmod +x /usr/local/bin/stalwart

# Копируем webmail
COPY --from=webmail-runner /app /app/webmail
COPY --from=webmail-runner /etc/passwd /etc/passwd
COPY --from=webmail-runner /etc/group /etc/group

# Копируем nginx конфигурацию
COPY --from=nginx-base /etc/nginx /etc/nginx
COPY --from=nginx-base /usr/sbin/nginx /usr/sbin/nginx
COPY --from=nginx-base /var/cache/nginx /var/cache/nginx
COPY --from=nginx-base /var/log/nginx /var/log/nginx
RUN mkdir -p /var/lib/nginx /run/nginx

# Создаем директории для Stalwart
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
    echo 'exec nginx -g "daemon off;"' >> /usr/local/bin/start-nginx.sh && \
    chmod +x /usr/local/bin/start-nginx.sh

RUN echo '#!/bin/bash' > /usr/local/bin/start-stalwart.sh && \
    echo 'exec stalwart --config /opt/stalwart/etc/config.toml' >> /usr/local/bin/start-stalwart.sh && \
    chmod +x /usr/local/bin/start-stalwart.sh

# Supervisor конфигурация
RUN mkdir -p /etc/supervisor/conf.d && \
    echo '[supervisord]' > /etc/supervisor/conf.d/supervisord.conf && \
    echo 'nodaemon=true' >> /etc/supervisor/conf.d/supervisord.conf && \
    echo 'logfile=/dev/stdout' >> /etc/supervisor/conf.d/supervisord.conf && \
    echo 'logfile_maxbytes=0' >> /etc/supervisor/conf.d/supervisord.conf && \
    echo '' >> /etc/supervisor/conf.d/supervisord.conf && \
    echo '[program:webmail]' >> /etc/supervisor/conf.d/supervisord.conf && \
    echo 'command=/usr/local/bin/start-webmail.sh' >> /etc/supervisor/conf.d/supervisord.conf && \
    echo 'user=nextjs' >> /etc/supervisor/conf.d/supervisord.conf && \
    echo 'autorestart=true' >> /etc/supervisor/conf.d/supervisord.conf && \
    echo 'stdout_logfile=/dev/stdout' >> /etc/supervisor/conf.d/supervisord.conf && \
    echo 'stdout_logfile_maxbytes=0' >> /etc/supervisor/conf.d/supervisord.conf && \
    echo 'stderr_logfile=/dev/stderr' >> /etc/supervisor/conf.d/supervisord.conf && \
    echo 'stderr_logfile_maxbytes=0' >> /etc/supervisor/conf.d/supervisord.conf && \
    echo '' >> /etc/supervisor/conf.d/supervisord.conf && \
    echo '[program:nginx]' >> /etc/supervisor/conf.d/supervisord.conf && \
    echo 'command=/usr/local/bin/start-nginx.sh' >> /etc/supervisor/conf.d/supervisord.conf && \
    echo 'autorestart=true' >> /etc/supervisor/conf.d/supervisord.conf && \
    echo 'stdout_logfile=/dev/stdout' >> /etc/supervisor/conf.d/supervisord.conf && \
    echo 'stdout_logfile_maxbytes=0' >> /etc/supervisor/conf.d/supervisord.conf && \
    echo 'stderr_logfile=/dev/stderr' >> /etc/supervisor/conf.d/supervisord.conf && \
    echo 'stderr_logfile_maxbytes=0' >> /etc/supervisor/conf.d/supervisord.conf && \
    echo '' >> /etc/supervisor/conf.d/supervisord.conf && \
    echo '[program:stalwart]' >> /etc/supervisor/conf.d/supervisord.conf && \
    echo 'command=/usr/local/bin/start-stalwart.sh' >> /etc/supervisor/conf.d/supervisord.conf && \
    echo 'autorestart=true' >> /etc/supervisor/conf.d/supervisord.conf && \
    echo 'stdout_logfile=/dev/stdout' >> /etc/supervisor/conf.d/supervisord.conf && \
    echo 'stdout_logfile_maxbytes=0' >> /etc/supervisor/conf.d/supervisord.conf && \
    echo 'stderr_logfile=/dev/stderr' >> /etc/supervisor/conf.d/supervisord.conf && \
    echo 'stderr_logfile_maxbytes=0' >> /etc/supervisor/conf.d/supervisord.conf

EXPOSE 25 80 143 443 587 8080 993 3000

# По умолчанию запускаем все сервисы через supervisor
CMD ["/usr/bin/supervisord", "-c", "/etc/supervisor/conf.d/supervisord.conf"]
