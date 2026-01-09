# Развертывание HomeMail

## Production развертывание

### Использование готовых образов из GitHub Container Registry

```bash
docker compose -f docker-compose.production.yml up -d
```

### Образы

- `ghcr.io/turtleold/homemail:latest` - веб-клиент
- `ghcr.io/turtleold/homemail-nginx:latest` - Nginx reverse proxy
- `ghcr.io/turtleold/homemail-stalwart:latest` - Stalwart Mail Server

### Настройка

1. Скопируйте `env.production.example` в `.env.production`
2. Настройте переменные окружения
3. Настройте `stalwart/config.toml` для вашего домена
4. Запустите: `docker compose -f docker-compose.production.yml up -d`

### Обновление

```bash
docker compose -f docker-compose.production.yml pull
docker compose -f docker-compose.production.yml up -d
```

## Локальная разработка

```bash
docker compose up -d --build
```
