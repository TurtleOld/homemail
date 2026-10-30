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

Пользовательские коллекции (контакты, группы, метки, шаблоны) хранятся в JSON-файлах в `DATA_DIR`, а параллельные изменения сериализуются блокировочными файлами `<имя>.json.lock` в том же каталоге. Это рассчитано на один экземпляр HomeMail с одним общим томом `DATA_DIR`, внутри которого работает любое число процессов Next.js и cron-скриптов. Блокировка снимается завершившимся запросом; если процесс упал, оставшийся `.json.lock` удаляет оператор, предварительно убедившись, что владелец больше не работает. Автоматического снятия по возрасту или PID нет: живой процесс может задержаться на файловых операциях, а PID переиспользуется. Развертывание на нескольких хостах с независимыми каталогами данных не поддерживается: блокировки между такими хостами не согласуются.

