# Quick Start Guide

Быстрое руководство по запуску Mail Web Client.

## Development

```bash
# 1. Установите зависимости
npm install

# 2. Запустите dev сервер
npm run dev

# 3. Откройте http://localhost:3000
```

## Production с Docker (Рекомендуется)

```bash
# 1. Создайте файл с переменными окружения
cp env.production.example .env.production

# 2. Отредактируйте .env.production
nano .env.production

# 3. Запустите через Docker Compose
docker-compose up -d --build

# 4. Проверьте статус
docker-compose ps
docker-compose logs -f
```

## Production с PM2

```bash
# 1. Установите PM2 глобально
npm install -g pm2

# 2. Создайте .env.production
cp env.production.example .env.production
nano .env.production

# 3. Соберите приложение
npm ci
npm run build

# 4. Запустите с PM2
pm2 start npm --name "mailclient" -- start

# 5. Сохраните конфигурацию
pm2 save
pm2 startup
```

## Production с Systemd

```bash
# 1. Скопируйте проект
sudo cp -r /path/to/mailclient /opt/mailclient

# 2. Установите зависимости
cd /opt/mailclient
sudo npm ci --production=false

# 3. Создайте .env.production
sudo cp env.production.example .env.production
sudo nano .env.production

# 4. Соберите приложение
sudo npm run build

# 5. Установите systemd service
sudo cp mailclient.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable mailclient
sudo systemctl start mailclient

# 6. Проверьте статус
sudo systemctl status mailclient
```

## Настройка Nginx

```bash
# 1. Скопируйте конфигурацию
sudo cp nginx.conf.example /etc/nginx/sites-available/mailclient

# 2. Отредактируйте (замените your-domain.com)
sudo nano /etc/nginx/sites-available/mailclient

# 3. Активируйте сайт
sudo ln -s /etc/nginx/sites-available/mailclient /etc/nginx/sites-enabled/

# 4. Проверьте конфигурацию
sudo nginx -t

# 5. Перезагрузите Nginx
sudo systemctl reload nginx
```

## SSL сертификат (Let's Encrypt)

```bash
# 1. Установите Certbot
sudo apt install certbot python3-certbot-nginx

# 2. Получите сертификат
sudo certbot --nginx -d your-domain.com

# Сертификат будет автоматически обновляться
```

## Переменные окружения

Минимальная конфигурация для `.env.production`:

```env
MAIL_PROVIDER=stalwart
STALWART_BASE_URL=https://example.com
STALWART_SMTP_HOST=example.com
STALWART_SMTP_PORT=587
STALWART_SMTP_SECURE=false
STALWART_AUTH_MODE=basic
NODE_ENV=production
PORT=3000
NEXT_PUBLIC_APP_URL=https://your-domain.com
```

## Проверка работы

```bash
# Health check
curl http://localhost:3000/api/health

# Должен вернуть:
# {"status":"ok","timestamp":"...","uptime":...,"environment":"production"}
```

## Troubleshooting

### Порт занят
```bash
# Проверьте, что использует порт 3000
lsof -i :3000

# Или измените PORT в .env.production
```

### Ошибки сборки
```bash
# Очистите кеш и пересоберите
rm -rf .next node_modules
npm ci
npm run build
```

### Проблемы с Docker
```bash
# Пересоберите образ
docker-compose down
docker-compose build --no-cache
docker-compose up -d
```

## Настройка администратора HomeMail

Эта настройка один раз назначает вам роль администратора внутри HomeMail — по вашему email, а не автоматически первому вошедшему пользователю. Почтовые ящики для членов семьи пока по-прежнему создаются вручную в Stalwart Web Admin; создание их прямо из HomeMail появится в одном из следующих обновлений.

### Шаг 1. Получите данные fallback-администратора Stalwart

При первом запуске Stalwart сам создаёт временную учётную запись администратора и один раз печатает её в свои логи:

```bash
docker logs <имя_контейнера_stalwart> 2>&1 | grep -i "administrator account"
```

Вы увидите строку вида `🔑 Your administrator account is 'admin' with password '...'`. Сохраните пароль — повторно он в логах не появится. Если Stalwart уже работал какое-то время, эта строка может быть далеко в истории логов; при необходимости уберите ограничение по времени у `docker logs` или найдите её в сохранённых логах, но не перезапускайте и не пересоздавайте контейнер Stalwart ради этого — данные придётся восстанавливать заново.

Под этой учётной записью вы уже заходите в Stalwart Web Admin для настройки самого почтового сервера.

### Шаг 2. Задайте переменные окружения

Добавьте в `.env.production`:

```env
HOMEMAIL_FEATURE_FAMILY_IDENTITY=true
HOMEMAIL_BOOTSTRAP_ADMIN_EMAIL=<ваш email для входа в HomeMail>
```

Передеплойте HomeMail с этими переменными.

### Шаг 3. Войдите в HomeMail

Войдите обычным способом, тем же email, что указали в `HOMEMAIL_BOOTSTRAP_ADMIN_EMAIL`. При первом успешном входе с этим email HomeMail назначит вам роль администратора внутри приложения.

### Откат

Верните `HOMEMAIL_FEATURE_FAMILY_IDENTITY=false` — HomeMail вернётся к обычному входу без роли администратора, без потери данных.

## Дополнительная документация

- Полное руководство: [PRODUCTION.md](./PRODUCTION.md)
- Основной README: [README.md](./README.md)
