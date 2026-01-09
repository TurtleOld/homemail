# Создание администратора в Stalwart Mail Server

## Проблема

Данные из `config.toml` не подходят для входа, потому что это **пример конфигурации**, который нужно применить на самом сервере Stalwart.

## Решение

### Вариант 1: Через конфигурационный файл (Рекомендуется)

#### Шаг 1: Найдите конфигурацию Stalwart на сервере

Обычно конфигурация находится в:
- `/etc/stalwart/config.toml`
- `/opt/stalwart/config.toml`
- Или путь, указанный при запуске Stalwart

#### Шаг 2: Используйте скрипт для создания админа

```bash
# На сервере Stalwart
cd /path/to/mailclient
./providers/stalwart-jmap/create-admin.sh admin@pavlovteam.ru your_secure_password
```

Скрипт автоматически:
- Создаст резервную копию конфигурации
- Сгенерирует bcrypt хеш пароля
- Добавит администратора в конфигурацию
- Проверит синтаксис TOML

#### Шаг 3: Перезапустите Stalwart

```bash
sudo systemctl restart stalwart
# или
./stalwart restart
```

#### Шаг 4: Проверьте подключение

```bash
./providers/stalwart-jmap/test-connection.sh admin@pavlovteam.ru your_secure_password
```

### Вариант 2: Ручное редактирование config.toml

1. **Откройте конфигурацию Stalwart:**
   ```bash
   sudo nano /etc/stalwart/config.toml
   ```

2. **Найдите секцию `[directory."local"]`** и добавьте администратора:

   ```toml
   [[directory."local".users]]
   name = "admin@pavlovteam.ru"
   secret = "bcrypt:$2b$12$..."  # Сгенерируйте через скрипт setup-admin.sh
   type = "individual"
   superuser = true
   ```

3. **Сгенерируйте bcrypt хеш:**
   ```bash
   ./providers/stalwart-jmap/setup-admin.sh your_secure_password
   ```

4. **Замените `plain:admin123` на сгенерированный bcrypt хеш**

5. **Перезапустите Stalwart**

### Вариант 3: Через веб-интерфейс Stalwart (если доступен)

1. Откройте `https://mail.pavlovteam.ru` (или ваш домен)
2. Если есть начальная настройка, создайте первого администратора
3. Войдите и создайте пользователей через веб-интерфейс

## Проверка работы

### Тест 1: Проверка JMAP Discovery

```bash
curl https://mail.pavlovteam.ru/.well-known/jmap
```

Должен вернуть JSON с `apiUrl`, `downloadUrl`, и т.д.

### Тест 2: Проверка JMAP Session

```bash
curl -X POST https://mail.pavlovteam.ru/jmap \
  -H "Content-Type: application/json" \
  -H "Authorization: Basic $(echo -n 'admin@pavlovteam.ru:your_password' | base64)" \
  -d '{
    "using": ["urn:ietf:params:jmap:core", "urn:ietf:params:jmap:mail"],
    "methodCalls": [["Session/get", {}, "0"]]
  }'
```

Должен вернуть JSON с `accounts` и `primaryAccounts`.

### Тест 3: Использование скрипта

```bash
./providers/stalwart-jmap/test-connection.sh admin@pavlovteam.ru your_password
```

## Создание обычных пользователей

После входа администратором в webmail клиент:

1. Войдите с учетными данными администратора
2. Перейдите в раздел управления пользователями (если доступен)
3. Или создайте пользователей через конфигурацию:

```toml
[[directory."local".users]]
name = "user@pavlovteam.ru"
secret = "bcrypt:$2b$12$..."  # Сгенерируйте хеш
type = "individual"
superuser = false
```

## Troubleshooting

### Ошибка "Invalid credentials"

1. **Проверьте, что пользователь существует:**
   ```bash
   grep "admin@pavlovteam.ru" /etc/stalwart/config.toml
   ```

2. **Проверьте формат пароля:**
   - Для тестирования: `secret = "plain:admin123"`
   - Для production: `secret = "bcrypt:$2b$12$..."`

3. **Проверьте, что Stalwart перезапущен:**
   ```bash
   sudo systemctl status stalwart
   ```

### Ошибка "JMAP session failed"

1. **Проверьте доступность сервера:**
   ```bash
   curl -I https://mail.pavlovteam.ru/.well-known/jmap
   ```

2. **Проверьте TLS сертификат:**
   ```bash
   openssl s_client -connect mail.pavlovteam.ru:443 -servername mail.pavlovteam.ru
   ```

3. **Проверьте логи Stalwart:**
   ```bash
   sudo journalctl -u stalwart -f
   # или
   tail -f /var/log/stalwart/stalwart.log
   ```

### Пользователь не может войти в webmail

1. Убедитесь, что `.env.production` содержит правильные настройки:
   ```env
   MAIL_PROVIDER=stalwart
   STALWART_BASE_URL=https://mail.pavlovteam.ru
   ```

2. Проверьте логи webmail:
   ```bash
   docker compose logs webmail
   ```

3. Проверьте подключение через test-connection.sh

## Безопасность

⚠️ **Важно для production:**

1. **Никогда не используйте `plain:` пароли в production**
2. **Всегда используйте `bcrypt:` хеши**
3. **Храните конфигурацию Stalwart в безопасном месте**
4. **Ограничьте доступ к `/etc/stalwart/config.toml`**

## Быстрая команда

```bash
# Создать админа и проверить подключение одной командой
./providers/stalwart-jmap/create-admin.sh admin@pavlovteam.ru secure_password && \
sudo systemctl restart stalwart && \
sleep 2 && \
./providers/stalwart-jmap/test-connection.sh admin@pavlovteam.ru secure_password
```
