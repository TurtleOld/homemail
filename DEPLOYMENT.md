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

## Ограничения хранения

Пользовательские коллекции (контакты, группы, метки, шаблоны) хранятся в JSON-файлах в `DATA_DIR`, а параллельные изменения сериализуются блокировочными файлами в том же каталоге. Это рассчитано на один экземпляр HomeMail с одним общим томом `DATA_DIR`, внутри которого работает любое число процессов Next.js и cron-скриптов в одном пространстве PID-ов. Блокировка снимается автоматически только когда процесс-владелец завершился; по возрасту файла она не удаляется. Развертывание на нескольких хостах или в контейнерах с раздельными пространствами PID-ов, использующих один `DATA_DIR`, не поддерживается: liveness владельца и блокировки между такими процессами не согласуются.

