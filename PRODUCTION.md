# Production Deployment Guide

Полное руководство по развертыванию Mail Web Client в production окружении.

## Требования

- Node.js 20+ или Docker
- Nginx (рекомендуется) или другой reverse proxy
- SSL сертификат (Let's Encrypt)
- Доступ к Stalwart Mail Server (если используется)

## Варианты развертывания

### 1. Docker (Рекомендуется)

Самый простой способ для production.

#### Шаги:

1. **Подготовка конфигурации:**
   ```bash
   cp .env.production.example .env.production
   # Отредактируйте .env.production с вашими настройками
   ```

2. **Сборка и запуск:**
   ```bash
   docker-compose up -d --build
   ```

3. **Проверка статуса:**
   ```bash
   docker-compose ps
   docker-compose logs -f
   ```

4. **Остановка:**
   ```bash
   docker-compose down
   ```

#### Обновление:

```bash
git pull
docker-compose up -d --build
```

### 2. PM2 (Node.js Process Manager)

Для production без Docker.

#### Установка PM2:

```bash
npm install -g pm2
```

#### Развертывание:

```bash
# 1. Установите зависимости
npm ci --production=false

# 2. Соберите приложение
NODE_ENV=production npm run build

# 3. Запустите с PM2
pm2 start npm --name "mailclient" -- start

# 4. Сохраните конфигурацию PM2
pm2 save

# 5. Настройте автозапуск
pm2 startup
```

#### Управление:

```bash
pm2 status              # Статус
pm2 logs mailclient      # Логи
pm2 restart mailclient   # Перезапуск
pm2 stop mailclient      # Остановка
pm2 delete mailclient    # Удаление
```

### 3. Systemd Service (Linux)

Для системного сервиса на Linux.

#### Установка:

1. **Скопируйте файлы:**
   ```bash
   sudo cp -r /path/to/mailclient /opt/mailclient
   sudo cp mailclient.service /etc/systemd/system/
   ```

2. **Настройте права:**
   ```bash
   sudo chown -R www-data:www-data /opt/mailclient
   sudo chmod +x /opt/mailclient/deploy.sh
   ```

3. **Настройте .env.production:**
   ```bash
   sudo nano /opt/mailclient/.env.production
   ```

4. **Установите зависимости и соберите:**
   ```bash
   cd /opt/mailclient
   sudo -u www-data npm ci --production=false
   sudo -u www-data npm run build
   ```

5. **Запустите сервис:**
   ```bash
   sudo systemctl daemon-reload
   sudo systemctl enable mailclient
   sudo systemctl start mailclient
   ```

#### Управление:

```bash
sudo systemctl status mailclient    # Статус
sudo systemctl restart mailclient  # Перезапуск
sudo journalctl -u mailclient -f   # Логи
```

## Настройка Nginx

1. **Установите Nginx:**
   ```bash
   sudo apt update
   sudo apt install nginx
   ```

2. **Скопируйте конфигурацию:**
   ```bash
   sudo cp nginx.conf.example /etc/nginx/sites-available/mailclient
   sudo nano /etc/nginx/sites-available/mailclient
   # Отредактируйте server_name и пути к SSL сертификатам
   ```

3. **Активируйте сайт:**
   ```bash
   sudo ln -s /etc/nginx/sites-available/mailclient /etc/nginx/sites-enabled/
   sudo nginx -t  # Проверка конфигурации
   sudo systemctl reload nginx
   ```

## SSL сертификат (Let's Encrypt)

1. **Установите Certbot:**
   ```bash
   sudo apt install certbot python3-certbot-nginx
   ```

2. **Получите сертификат:**
   ```bash
   sudo certbot --nginx -d your-domain.com -d www.your-domain.com
   ```

3. **Автообновление:**
   Certbot автоматически настроит cron для обновления сертификатов.

## Переменные окружения

Создайте `.env.production` на основе `.env.production.example`:

```env
# Mail Provider
MAIL_PROVIDER=stalwart

# Stalwart Configuration
STALWART_BASE_URL=https://mail.pavlovteam.ru
STALWART_SMTP_HOST=mail.pavlovteam.ru
STALWART_SMTP_PORT=587
STALWART_SMTP_SECURE=false
STALWART_AUTH_MODE=oauth

# OAuth Configuration (требуется если STALWART_AUTH_MODE=oauth)
OAUTH_DISCOVERY_URL=https://mail.pavlovteam.ru/.well-known/oauth-authorization-server
OAUTH_CLIENT_ID=your-oauth-client-id

# Application
NODE_ENV=production
PORT=3000
NEXT_PUBLIC_APP_URL=https://your-domain.com
```

## Мониторинг

### Health Check

Приложение предоставляет endpoint для проверки здоровья:

```bash
curl http://localhost:3000/api/health
```

Ответ:
```json
{
  "status": "ok",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "uptime": 3600,
  "environment": "production"
}
```

### Логи

- **Docker:** `docker-compose logs -f`
- **PM2:** `pm2 logs mailclient`
- **Systemd:** `sudo journalctl -u mailclient -f`
- **Nginx:** `/var/log/nginx/mailclient-*.log`

## Безопасность

### Рекомендации:

1. **Firewall:**
   ```bash
   sudo ufw allow 22/tcp    # SSH
   sudo ufw allow 80/tcp     # HTTP
   sudo ufw allow 443/tcp    # HTTPS
   sudo ufw enable
   ```

2. **Обновления:**
   Регулярно обновляйте систему и зависимости:
   ```bash
   npm audit fix
   npm update
   ```

3. **Резервное копирование:**
   Настройте автоматическое резервное копирование конфигурации и данных.

4. **Rate Limiting:**
   Убедитесь, что rate limiting включен (включен по умолчанию).

## Масштабирование

### Горизонтальное масштабирование

Для масштабирования используйте несколько инстансов за load balancer:

1. Запустите несколько инстансов на разных портах
2. Настройте Nginx для балансировки нагрузки
3. Используйте Redis для shared session storage (требует доработки)

### Вертикальное масштабирование

Увеличьте ресурсы сервера:
- CPU: минимум 2 ядра
- RAM: минимум 2GB (рекомендуется 4GB+)
- Disk: SSD рекомендуется

## Troubleshooting

### Приложение не запускается

1. Проверьте логи: `docker-compose logs` или `pm2 logs`
2. Убедитесь, что порт 3000 свободен: `lsof -i :3000`
3. Проверьте переменные окружения: `cat .env.production`

### Ошибки подключения к Stalwart

1. Проверьте доступность: `curl https://example.com/.well-known/jmap`
2. Проверьте учетные данные в Stalwart
3. Проверьте firewall правила

### Проблемы с SSL

1. Проверьте сертификаты: `sudo certbot certificates`
2. Обновите сертификат: `sudo certbot renew`
3. Проверьте конфигурацию Nginx: `sudo nginx -t`

## Обновление

### Docker:

```bash
git pull
docker-compose down
docker-compose up -d --build
```

### PM2:

```bash
git pull
npm ci --production=false
npm run build
pm2 restart mailclient
```

### Systemd:

```bash
cd /opt/mailclient
sudo -u www-data git pull
sudo -u www-data npm ci --production=false
sudo -u www-data npm run build
sudo systemctl restart mailclient
```

## Поддержка

При возникновении проблем:

1. Проверьте логи
2. Проверьте health check endpoint
3. Убедитесь, что все переменные окружения установлены
4. Проверьте документацию в README.md
