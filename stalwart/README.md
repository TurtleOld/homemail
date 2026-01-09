# Stalwart Mail Server в Docker

Stalwart Mail Server запускается как отдельный сервис в Docker Compose.

## Конфигурация

Конфигурация находится в `stalwart/config.toml`. По умолчанию настроены:

- **Администратор**: `admin@pavlovteam.ru` / `admin123`
- **Тестовый пользователь**: `test@pavlovteam.ru` / `test123`

## Порты

Stalwart доступен на следующих портах (маппинг для избежания конфликтов):

- **1025** → SMTP (25)
- **1143** → IMAP (143)
- **1443** → JMAP/HTTPS (443)
- **1587** → SMTP Submission (587)
- **1993** → IMAPS (993)

## Создание пользователей

### Через редактирование config.toml

1. Отредактируйте `stalwart/config.toml`:
   ```toml
   [[directory."local".users]]
   name = "user@pavlovteam.ru"
   secret = "plain:password123"
   type = "individual"
   superuser = false
   ```

2. Перезапустите Stalwart:
   ```bash
   docker compose restart stalwart
   ```

### Через скрипт (на хосте)

```bash
# Используйте скрипт для создания пользователя
./providers/stalwart-jmap/create-admin.sh user@pavlovteam.ru password123

# Затем скопируйте изменения в Docker volume
docker compose restart stalwart
```

## Доступ к Stalwart из webmail

Webmail автоматически подключается к Stalwart через внутреннюю Docker сеть:
- JMAP: `https://stalwart:443`
- SMTP: `stalwart:587`

## Проверка работы

```bash
# Проверка JMAP Discovery (из контейнера webmail)
docker compose exec webmail wget -qO- --no-check-certificate https://stalwart:443/.well-known/jmap

# Проверка логов
docker compose logs stalwart

# Проверка статуса
docker compose ps stalwart
```

## Данные

Данные Stalwart хранятся в Docker volumes:
- `stalwart-data` - письма и данные
- `stalwart-certs` - сертификаты
- `stalwart-logs` - логи

Для очистки данных:
```bash
docker compose down -v
```

## Обновление конфигурации

После изменения `stalwart/config.toml`:

```bash
docker compose restart stalwart
```

## Troubleshooting

### Stalwart не запускается

1. Проверьте логи:
   ```bash
   docker compose logs stalwart
   ```

2. Проверьте синтаксис config.toml:
   ```bash
   docker compose exec stalwart stalwart --config /etc/stalwart/config.toml --test
   ```

### Не могу подключиться к Stalwart

1. Убедитесь, что Stalwart запущен:
   ```bash
   docker compose ps stalwart
   ```

2. Проверьте health check:
   ```bash
   docker compose exec stalwart wget -qO- --no-check-certificate https://localhost:443/.well-known/jmap
   ```

3. Проверьте сеть:
   ```bash
   docker compose exec webmail ping stalwart
   ```
