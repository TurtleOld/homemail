# 🚀 Начните здесь

## Быстрый запуск в Production

### Вариант 1: Docker (Самый простой) ⭐

```bash
# 1. Создайте файл конфигурации
cp env.production.example .env.production

# 2. Отредактируйте настройки
nano .env.production

# 3. Запустите
docker-compose up -d --build

# Готово! Приложение на http://localhost:3000
```

### Вариант 2: Автоматический скрипт

```bash
./deploy.sh production
```

Скрипт автоматически:
- Проверит конфигурацию
- Установит зависимости
- Соберет приложение
- Предложит запуск через Docker или PM2

### Вариант 3: PM2 (Node.js)

```bash
npm ci
npm run build
pm2 start npm --name "mailclient" -- start
```

## Что нужно настроить

1. **Переменные окружения** (`.env.production`):
   - `STALWART_BASE_URL` - URL вашего Stalwart сервера
   - `STALWART_SMTP_HOST` - SMTP хост
   - И другие настройки (см. `env.production.example`)

2. **Nginx** (опционально, для HTTPS):
   - Используйте `nginx.conf.example` как шаблон
   - Настройте SSL через Let's Encrypt

3. **Firewall**:
   ```bash
   sudo ufw allow 80/tcp
   sudo ufw allow 443/tcp
   sudo ufw allow 22/tcp
   sudo ufw enable
   ```

## Документация

- **QUICKSTART.md** - Быстрое руководство
- **PRODUCTION.md** - Полное руководство по production
- **README.md** - Основная документация

## Проверка работы

```bash
# Health check
curl http://localhost:3000/api/health

# Должен вернуть JSON с status: "ok"
```

## Проблемы?

1. Проверьте логи: `docker-compose logs` или `pm2 logs`
2. Проверьте переменные окружения
3. Убедитесь, что порт 3000 свободен
4. См. раздел Troubleshooting в PRODUCTION.md
