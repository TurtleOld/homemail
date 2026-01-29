# Stalwart JMAP Provider

Реализация MailProvider для подключения к Stalwart Mail Server через JMAP (чтение) и SMTP (отправка).

## Конфигурация

### Переменные окружения

Добавьте в `.env.local`:

```env
MAIL_PROVIDER=stalwart
STALWART_BASE_URL=https://example.com
STALWART_SMTP_HOST=example.com
STALWART_SMTP_PORT=587
STALWART_SMTP_SECURE=false
STALWART_AUTH_MODE=basic
```

### Описание переменных

- `MAIL_PROVIDER=stalwart` - включает использование Stalwart provider
- `STALWART_BASE_URL` - базовый URL сервера (https://example.com)
- `STALWART_SMTP_HOST` - хост SMTP сервера (example.com)
- `STALWART_SMTP_PORT` - порт SMTP (587 для STARTTLS)
- `STALWART_SMTP_SECURE` - `false` для STARTTLS, `true` для SMTPS
- `STALWART_AUTH_MODE` - режим аутентификации (`basic` или `oauth`)

## Проверка соединения

### 1. Проверка JMAP Discovery

```bash
curl https://example.com/.well-known/jmap
```

Ожидаемый ответ:
```json
{
  "apiUrl": "https://example.com/jmap",
  "downloadUrl": "https://example.com/download/{accountId}/{blobId}/{name}",
  "uploadUrl": "https://example.com/upload/{accountId}",
  "eventSourceUrl": "https://example.com/events/{types}/{closeAfter}/{ping}"
}
```

### 2. Проверка JMAP Session

```bash
curl -X POST https://example.com/jmap \
  -H "Content-Type: application/json" \
  -H "Authorization: Basic $(echo -n 'user@example.com:password' | base64)" \
  -d '{
    "using": ["urn:ietf:params:jmap:core", "urn:ietf:params:jmap:mail"],
    "methodCalls": [["Session/get", {}, "0"]]
  }'
```

### 3. Проверка SMTP (STARTTLS на порту 587)

```bash
telnet example.com 587
```

Или используйте `openssl`:
```bash
openssl s_client -connect example.com:587 -starttls smtp
```

## Создание первого администратора

⚠️ **ВАЖНО:** Файл `config.toml` в этом репозитории - это **пример конфигурации**. 
Его нужно скопировать на сервер Stalwart и применить там!

Подробная инструкция: [ADMIN_SETUP.md](./ADMIN_SETUP.md)

### Быстрый способ (автоматический)

```bash
# На сервере Stalwart
./providers/stalwart-jmap/create-admin.sh admin@example.com ваш_пароль
sudo systemctl restart stalwart
./providers/stalwart-jmap/test-connection.sh admin@example.com ваш_пароль
```

### Ручной способ

### Быстрый старт

1. **Скопируйте пример конфигурации**:
   - Файл `stalwart-config-example.toml` содержит пример настройки с тестовым админом
   - Скопируйте его в `/etc/stalwart/config.toml` (или путь к вашей конфигурации)
   - Адаптируйте под вашу среду

2. **Тестовый администратор** (для быстрого старта):
   ```toml
   [[directory."local".users]]
   name = "admin@example.com"
   secret = "plain:admin123"  # Пароль: admin123 (ВРЕМЕННО! Только для тестирования)
   type = "individual"
   superuser = true
   ```
   
   **Важно**: После применения конфигурации используйте:
   - Email: `admin@example.com`
   - Password: `admin123`

3. **Для production** - сгенерируйте bcrypt хеш:
   ```bash
   # Используйте скрипт setup-admin.sh
   chmod +x providers/stalwart-jmap/setup-admin.sh
   ./providers/stalwart-jmap/setup-admin.sh your_secure_password
   
   # Или через Python
   python3 -c "import bcrypt; print('bcrypt:' + bcrypt.hashpw(b'your_password', bcrypt.gensalt()).decode())"
   ```
   
   Затем замените в config.toml:
   ```toml
   secret = "bcrypt:$2b$10$..."  # Вставьте сгенерированный хеш
   ```

4. **Перезапустите Stalwart**:
   ```bash
   systemctl restart stalwart
   # или
   ./stalwart restart
   ```

5. **Проверьте доступ**:
   - Веб-интерфейс: `https://example.com`
   - JMAP: используйте учетные данные `admin@example.com` / `admin123`

### Создание обычных пользователей

После входа в веб-интерфейс администратора:
- Перейдите: `Management` → `Directory` → `Accounts`
- Нажмите `Create a new account`
- Заполните email и пароль
- Сохраните

Или добавьте в `config.toml`:
```toml
[[directory."local".users]]
name = "user@example.com"
secret = "bcrypt:$2b$10$..."  # Используйте bcrypt для production
type = "individual"
superuser = false
```

## Настройка TLS/ACME на Stalwart

### 1. Конфигурация TLS в Stalwart

Убедитесь, что в `config.toml` Stalwart настроен TLS:

```toml
[server]
hostname = "example.com"

[server.listener."https"]
bind = ["0.0.0.0:443"]
protocol = "https"
tls = "default"

[tls."default"]
implicit = true
certificate = "default"

[acme]
enabled = true
contact = ["mailto:admin@example.com"]
```

### 2. Проверка доступности HTTPS

```bash
curl -I https://example.com/.well-known/jmap
```

Должен вернуть `200 OK` с валидным SSL сертификатом.

### 3. Проверка JMAP endpoint

```bash
curl https://example.com/jmap
```

Должен вернуть JSON ответ (может требовать аутентификацию).

## Безопасность

### Хранение учетных данных

- Учетные данные пользователя (email/password) хранятся **только на сервере** в памяти сессии
- Никогда не передаются на клиент
- Используются только для JMAP и SMTP аутентификации
- Очищаются при выходе из сессии

### Логирование

- Содержимое писем не логируется
- Пароли не логируются
- Логируются только ошибки соединения (без чувствительных данных)

## Архитектура

### JMAP Client

`jmap-client.ts` реализует:
- Discovery и Session management с кешированием (5 минут)
- Базовые JMAP методы: Mailbox/get, Email/query, Email/get, Email/set
- Автоматическая обработка ошибок

### Stalwart Provider

`stalwart-provider.ts` реализует интерфейс `MailProvider`:
- Маппинг JMAP Mailbox → Folder
- Маппинг JMAP Email → MessageDetail/MessageListItem
- Управление флагами через keywords ($seen, $flagged)
- Bulk операции через Email/set
- Отправка через SMTP (nodemailer)
- Скачивание вложений через JMAP blob download
- Realtime через polling (15 секунд)

## Отладка

### Включение детального логирования

В development режиме ошибки логируются в консоль. Для production:

```env
NODE_ENV=production
```

### Проверка работы provider

1. Войдите в систему с реальными учетными данными
2. Проверьте `/api/mail/folders` - должны вернуться папки из Stalwart
3. Проверьте `/api/mail/messages?folderId=inbox` - должны вернуться письма
4. Откройте письмо - должно загрузиться содержимое
5. Попробуйте отправить письмо - должно уйти через SMTP

## Известные ограничения

1. **Realtime**: Сейчас используется polling каждые 15 секунд. В будущем можно перейти на WebSocket push через JMAP eventSourceUrl.

2. **Drafts**: Черновики сохраняются через JMAP Email/set в папку Drafts. Может потребоваться доработка для сложных случаев.

3. **Attachments**: Вложения скачиваются через JMAP blob download URL. Убедитесь, что URL template корректно настроен в Stalwart.

4. **SMTP**: Используется STARTTLS на порту 587. Для production рекомендуется настроить валидацию сертификата.

## Troubleshooting

### Ошибка "JMAP discovery failed"

- Проверьте доступность `https://example.com/.well-known/jmap`
- Убедитесь, что TLS настроен корректно
- Проверьте firewall правила

### Ошибка "JMAP session failed"

- Проверьте учетные данные пользователя
- Убедитесь, что пользователь существует в Stalwart
- Проверьте логи Stalwart сервера

### Ошибка "SMTP send failed"

- Проверьте доступность `example.com:587`
- Убедитесь, что STARTTLS работает
- Проверьте учетные данные для SMTP auth
- Проверьте, что порт 587 не заблокирован firewall

### Письма не отображаются

- Проверьте, что папки правильно маппятся (role inbox/sent/drafts)
- Проверьте JMAP Email/query фильтры
- Убедитесь, что письма есть в Stalwart (проверьте через другой клиент)
