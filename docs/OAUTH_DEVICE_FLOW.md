# OAuth 2.0 Device Authorization Grant для JMAP

## Архитектура

Реализация состоит из следующих модулей:

### 1. OAuthDiscovery (`lib/oauth-discovery.ts`)
Класс для получения OAuth endpoints через discovery механизм.

**Основные методы:**
- `discover()`: Получает discovery информацию с кешированием (TTL 1 час)

**Возвращает:**
- `issuer`: Идентификатор сервера авторизации
- `device_authorization_endpoint`: Endpoint для получения device code
- `token_endpoint`: Endpoint для получения токенов
- `authorization_endpoint`: Endpoint для авторизации (опционально)
- `grant_types_supported`: Поддерживаемые grant types
- `scopes_supported`: Поддерживаемые scopes

### 2. DeviceFlowClient (`lib/oauth-device-flow.ts`)
Класс для выполнения Device Authorization Flow (RFC 8628).

**Основные методы:**
- `requestDeviceCode()`: Запрашивает device code и user code
- `pollForToken()`: Опрашивает token endpoint до получения токена
- `authorizeDevice()`: Полный цикл авторизации с callback для прогресса

**Обрабатывает:**
- `authorization_pending`: Продолжает опрос
- `slow_down`: Увеличивает интервал опроса
- `expired_token` / `access_denied`: Останавливает процесс

### 3. OAuthTokenStore (`lib/oauth-token-store.ts`)
Безопасное хранилище OAuth токенов с шифрованием.

**Основные методы:**
- `getToken(accountId)`: Получает токен для аккаунта
- `saveToken(accountId, token)`: Сохраняет токен
- `deleteToken(accountId)`: Удаляет токен
- `hasValidToken(accountId)`: Проверяет наличие валидного токена

**Хранит:**
- `accessToken`: Access token
- `refreshToken`: Refresh token (если есть)
- `expiresAt`: Время истечения
- `tokenType`: Тип токена (обычно "Bearer")
- `scopes`: Выданные scopes

### 4. OAuthJMAPClient (`lib/oauth-jmap-client.ts`)
Интеграция OAuth с JMAP клиентом.

**Основные методы:**
- `authorize()`: Запускает процесс авторизации
- `getJMAPClient()`: Получает настроенный JMAPClient с токеном
- `refreshToken()`: Обновляет access token через refresh token
- `handleJMAPRequest()`: Выполняет JMAP запрос с автоматическим refresh при 401/403
- `logout()`: Удаляет токены и сбрасывает состояние

## Примеры использования

### Базовое использование

```typescript
import { OAuthJMAPClient } from '@/lib/oauth-jmap-client';

const oauthClient = new OAuthJMAPClient({
  discoveryUrl: 'https://mail.pavlovteam.ru/.well-known/oauth-authorization-server',
  clientId: 'your-client-id',
  scopes: ['urn:ietf:params:jmap:core', 'urn:ietf:params:jmap:mail'],
  baseUrl: 'https://mail.pavlovteam.ru',
  accountId: 'user-account-id',
});

// Авторизация
await oauthClient.authorize((status, message) => {
  if (status === 'pending') {
    console.log('Код авторизации:', message);
  } else if (status === 'authorized') {
    console.log('Авторизация успешна');
  } else if (status === 'error') {
    console.error('Ошибка:', message);
  }
});

// Использование JMAP
const jmapClient = await oauthClient.getJMAPClient();
const session = await jmapClient.getSession();
const mailboxes = await jmapClient.getMailboxes();
```

### С обработкой ошибок

```typescript
try {
  const result = await oauthClient.handleJMAPRequest(async (client) => {
    return await client.getMailboxes();
  });
} catch (error) {
  if (error.message.includes('re-authorize')) {
    // Требуется повторная авторизация
    await oauthClient.authorize();
  }
}
```

## Примеры HTTP запросов

### 1. Discovery

```bash
curl -X GET \
  'https://mail.pavlovteam.ru/.well-known/oauth-authorization-server' \
  -H 'Accept: application/json'
```

**Ответ:**
```json
{
  "issuer": "https://mail.pavlovteam.ru",
  "device_authorization_endpoint": "https://mail.pavlovteam.ru/auth/device",
  "token_endpoint": "https://mail.pavlovteam.ru/auth/token",
  "authorization_endpoint": "https://mail.pavlovteam.ru/auth/authorize",
  "grant_types_supported": [
    "urn:ietf:params:oauth:grant-type:device_code",
    "authorization_code",
    "refresh_token"
  ],
  "scopes_supported": [
    "urn:ietf:params:jmap:core",
    "urn:ietf:params:jmap:mail",
    "offline_access"
  ]
}
```

### 2. Получение Device Code

```bash
curl -X POST \
  'https://mail.pavlovteam.ru/auth/device' \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  -H 'Accept: application/json' \
  -d 'client_id=your-client-id&scope=urn:ietf:params:jmap:core urn:ietf:params:jmap:mail'
```

**Ответ:**
```json
{
  "device_code": "abc123def456...",
  "user_code": "ABCD-EFGH",
  "verification_uri": "https://mail.pavlovteam.ru/auth/verify",
  "verification_uri_complete": "https://mail.pavlovteam.ru/auth/verify?user_code=ABCD-EFGH",
  "expires_in": 600,
  "interval": 5
}
```

### 3. Polling токена

```bash
curl -X POST \
  'https://mail.pavlovteam.ru/auth/token' \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  -H 'Accept: application/json' \
  -d 'grant_type=urn:ietf:params:oauth:grant-type:device_code&device_code=abc123def456...&client_id=your-client-id'
```

**Успешный ответ:**
```json
{
  "access_token": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...",
  "token_type": "Bearer",
  "expires_in": 3600,
  "refresh_token": "def789ghi012...",
  "scope": "urn:ietf:params:jmap:core urn:ietf:params:jmap:mail"
}
```

**Ошибка (authorization_pending):**
```json
{
  "error": "authorization_pending",
  "error_description": "The authorization request is still pending"
}
```

**Ошибка (slow_down):**
```json
{
  "error": "slow_down",
  "error_description": "The polling interval has been increased"
}
```

**Ошибка (expired_token):**
```json
{
  "error": "expired_token",
  "error_description": "The device code has expired"
}
```

**Ошибка (access_denied):**
```json
{
  "error": "access_denied",
  "error_description": "The user denied the authorization request"
}
```

### 4. JMAP Session

```bash
curl -X GET \
  'https://mail.pavlovteam.ru/.well-known/jmap' \
  -H 'Authorization: Bearer eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...' \
  -H 'Accept: application/json'
```

**Ответ:**
```json
{
  "apiUrl": "https://mail.pavlovteam.ru/jmap",
  "downloadUrl": "https://mail.pavlovteam.ru/download/{accountId}/{blobId}/{name}",
  "uploadUrl": "https://mail.pavlovteam.ru/upload/{accountId}",
  "eventSourceUrl": "https://mail.pavlovteam.ru/events",
  "accounts": {
    "account-id-1": {
      "id": "account-id-1",
      "name": "user@example.com",
      "isPersonal": true,
      "isReadOnly": false
    }
  },
  "primaryAccounts": {
    "mail": "account-id-1"
  },
  "capabilities": {
    "urn:ietf:params:jmap:mail": {
      "maxMailboxesPerEmail": 10
    },
    "urn:ietf:params:jmap:core": {
      "maxObjectsInGet": 500
    }
  }
}
```

### 5. JMAP Request

```bash
curl -X POST \
  'https://mail.pavlovteam.ru/jmap' \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...' \
  -d '{
    "using": ["urn:ietf:params:jmap:core", "urn:ietf:params:jmap:mail"],
    "methodCalls": [
      ["Mailbox/get", {"accountId": "account-id-1"}, "0"]
    ]
  }'
```

## Типовые ошибки и их обработка

### 1. Network errors

**Ошибка:** `Network error during OAuth discovery`
**Причина:** Не удалось подключиться к discovery endpoint
**Решение:** Проверить доступность сервера, TLS сертификаты, сетевые настройки

**Ошибка:** `Network error during device code request`
**Причина:** Не удалось подключиться к device_authorization_endpoint
**Решение:** Проверить доступность endpoint, правильность URL

### 2. Discovery errors

**Ошибка:** `Missing issuer in discovery response`
**Причина:** Сервер не вернул обязательное поле `issuer`
**Решение:** Проверить конфигурацию OAuth сервера

**Ошибка:** `Missing device_authorization_endpoint in discovery response`
**Причина:** Сервер не поддерживает Device Authorization Grant
**Решение:** Убедиться, что сервер поддерживает RFC 8628

### 3. Device code errors

**Ошибка:** `Device code request failed: 400 Bad Request`
**Причина:** Неверный `client_id` или формат запроса
**Решение:** Проверить `client_id`, убедиться что используется `application/x-www-form-urlencoded`

**Ошибка:** `Invalid device code response: missing required fields`
**Причина:** Сервер вернул неполный ответ
**Решение:** Проверить логи сервера, убедиться что сервер корректно реализует RFC 8628

### 4. Token polling errors

**Ошибка:** `authorization_pending` (продолжается опрос)
**Причина:** Пользователь ещё не авторизовал устройство
**Решение:** Показать пользователю `user_code` и `verification_uri`, дождаться авторизации

**Ошибка:** `slow_down` (интервал увеличен)
**Причина:** Слишком частые запросы
**Решение:** Автоматически увеличить интервал опроса (реализовано в коде)

**Ошибка:** `expired_token`
**Причина:** Device code истёк (обычно через 10 минут)
**Решение:** Показать ошибку пользователю, предложить начать процесс заново

**Ошибка:** `access_denied`
**Причина:** Пользователь отклонил авторизацию
**Решение:** Показать сообщение об отказе, предложить повторить попытку

**Ошибка:** `invalid_grant`
**Причина:** Неверный device_code
**Решение:** Начать процесс заново с новым device code

**Ошибка:** `invalid_client`
**Причина:** Неверный client_id
**Решение:** Проверить конфигурацию client_id

### 5. JMAP errors

**Ошибка:** `JMAP discovery failed: 401 Unauthorized`
**Причина:** Access token истёк или неверен
**Решение:** Выполнить refresh token (если есть), иначе начать device flow заново

**Ошибка:** `JMAP discovery failed: 403 Forbidden`
**Причина:** Недостаточно прав у токена
**Решение:** Проверить scopes, убедиться что запрошены `urn:ietf:params:jmap:core` и `urn:ietf:params:jmap:mail`

**Ошибка:** `No accounts found in JMAP session`
**Причина:** У пользователя нет доступа к почте
**Решение:** Проверить настройки аккаунта на сервере

### 6. Token storage errors

**Ошибка:** `No valid OAuth token found`
**Причина:** Токен не был сохранён или истёк
**Решение:** Выполнить `authorize()` для получения нового токена

**Ошибка:** `Token expired and refresh failed`
**Причина:** Refresh token недействителен или истёк
**Решение:** Начать device flow заново

## Безопасность

### Рекомендации

1. **Не логировать токены**: Access token и refresh token никогда не должны попадать в логи
2. **Использовать TLS**: Все запросы должны идти через HTTPS
3. **Безопасное хранилище**: Токены хранятся в зашифрованном виде
4. **Короткий срок жизни**: Access token имеет ограниченный срок жизни
5. **Refresh token**: Хранится только в безопасном хранилище, не в памяти
6. **Отмена процесса**: Предусмотрена возможность отмены polling при необходимости

### Хранение токенов

- Access token: в памяти (кеш JMAPClient) и зашифрованном хранилище
- Refresh token: только в зашифрованном хранилище
- Device code: только в памяти во время процесса авторизации
- User code: показывается пользователю, не сохраняется

## Интеграция с существующим кодом

### Обновление StalwartProvider

Для использования OAuth вместо Basic Auth в `StalwartJMAPProvider`:

```typescript
import { OAuthJMAPClient } from '@/lib/oauth-jmap-client';

// В методе getClient
const oauthClient = new OAuthJMAPClient({
  discoveryUrl: 'https://mail.pavlovteam.ru/.well-known/oauth-authorization-server',
  clientId: process.env.OAUTH_CLIENT_ID || '',
  scopes: ['urn:ietf:params:jmap:core', 'urn:ietf:params:jmap:mail'],
  baseUrl: config.baseUrl,
  accountId: accountId,
});

if (!(await oauthClient.hasValidToken())) {
  throw new Error('OAuth token required. Please authorize first.');
}

const jmapClient = await oauthClient.getJMAPClient();
return jmapClient;
```

## Конфигурация

### Переменные окружения

```bash
# OAuth
OAUTH_CLIENT_ID=your-client-id
OAUTH_DISCOVERY_URL=https://mail.pavlovteam.ru/.well-known/oauth-authorization-server

# Stalwart
STALWART_BASE_URL=https://mail.pavlovteam.ru
STALWART_AUTH_MODE=oauth  # или 'basic' для обратной совместимости
```

## UX рекомендации

1. **Показ user_code**: Отображать код крупным шрифтом, с форматированием (например, `ABCD-EFGH`)
2. **Кнопка "Открыть"**: Использовать `verification_uri_complete` если доступен, иначе `verification_uri`
3. **Таймер**: Показывать обратный отсчёт до истечения `expires_in`
4. **Системный браузер**: В мобильных/десктопных приложениях открывать системный браузер, не webview
5. **Прогресс**: Показывать статус "Ожидание авторизации..." во время polling
6. **Ошибки**: Понятные сообщения на русском языке для пользователя
7. **Повтор**: Возможность отменить и начать заново при ошибках

## Тестирование

### Ручное тестирование

1. Запустить discovery запрос
2. Получить device code
3. Открыть verification_uri в браузере
4. Авторизовать устройство
5. Проверить получение токена
6. Использовать токен для JMAP запросов

### Автоматическое тестирование

```typescript
describe('OAuth Device Flow', () => {
  it('should discover OAuth endpoints', async () => {
    const discovery = new OAuthDiscovery(discoveryUrl);
    const result = await discovery.discover();
    expect(result.device_authorization_endpoint).toBeDefined();
  });

  it('should request device code', async () => {
    const client = new DeviceFlowClient(discoveryUrl, clientId);
    const code = await client.requestDeviceCode();
    expect(code.user_code).toBeDefined();
  });
});
```