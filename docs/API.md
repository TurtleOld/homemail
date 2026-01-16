# API Документация

## Обзор

HomeMail предоставляет RESTful API для управления почтовыми сообщениями, настройками и аккаунтами. Все запросы требуют аутентификации через сессионные cookies.

## Базовый URL

```
/api
```

## Аутентификация

Все API запросы (кроме `/api/auth/login`) требуют валидной сессии. Сессия создается при успешном входе и хранится в HTTP-only cookie.

## Коды ответов

- `200` - Успешный запрос
- `400` - Некорректные данные запроса
- `401` - Не авторизован
- `403` - Доступ запрещен
- `404` - Ресурс не найден
- `429` - Превышен лимит запросов
- `500` - Внутренняя ошибка сервера

## Эндпоинты

### Аутентификация

#### POST /api/auth/login

Вход в систему.

**Тело запроса:**
```json
{
  "email": "user@example.com",
  "password": "password"
}
```

**Ответ:**
```json
{
  "success": true,
  "account": {
    "id": "user@example.com",
    "email": "user@example.com",
    "displayName": "User Name"
  }
}
```

#### POST /api/auth/logout

Выход из системы.

**Ответ:**
```json
{
  "success": true
}
```

#### GET /api/auth/me

Получение информации о текущем пользователе.

**Ответ:**
```json
{
  "id": "user@example.com",
  "email": "user@example.com",
  "displayName": "User Name"
}
```

### Сообщения

#### GET /api/mail/messages

Получение списка сообщений.

**Параметры запроса:**
- `folderId` (string, обязательный) - ID папки
- `cursor` (string, опциональный) - Курсор для пагинации
- `limit` (number, опциональный) - Количество сообщений (10-100)
- `q` (string, опциональный) - Поисковый запрос
- `filter` (string, опциональный) - Быстрый фильтр (unread, starred, attachments)
- `messageFilter` (string, опциональный) - JSON фильтр сообщений

**Ответ:**
```json
{
  "messages": [
    {
      "id": "msg123",
      "threadId": "thread123",
      "from": {
        "email": "sender@example.com",
        "name": "Sender Name"
      },
      "subject": "Тема письма",
      "snippet": "Краткое содержание...",
      "date": "2024-12-20T12:00:00Z",
      "flags": {
        "unread": true,
        "starred": false,
        "important": false,
        "hasAttachments": false
      },
      "size": 1024
    }
  ],
  "nextCursor": "cursor123"
}
```

#### GET /api/mail/messages/:id

Получение детальной информации о сообщении.

**Ответ:**
```json
{
  "id": "msg123",
  "threadId": "thread123",
  "headers": {},
  "from": {
    "email": "sender@example.com",
    "name": "Sender Name"
  },
  "to": [
    {
      "email": "recipient@example.com",
      "name": "Recipient Name"
    }
  ],
  "subject": "Тема письма",
  "date": "2024-12-20T12:00:00Z",
  "body": {
    "text": "Текст письма",
    "html": "<p>Текст письма</p>"
  },
  "attachments": [],
  "flags": {
    "unread": true,
    "starred": false,
    "important": false,
    "hasAttachments": false
  }
}
```

#### POST /api/mail/send

Отправка сообщения.

**Тело запроса:**
```json
{
  "to": ["recipient@example.com"],
  "cc": ["cc@example.com"],
  "bcc": ["bcc@example.com"],
  "subject": "Тема письма",
  "html": "<p>Содержимое письма</p>",
  "draftId": "draft123",
  "scheduledSend": {
    "enabled": true,
    "sendAt": "2024-12-21T10:00:00Z"
  },
  "attachments": [
    {
      "filename": "file.pdf",
      "mime": "application/pdf",
      "data": "base64encodeddata"
    }
  ]
}
```

**Ответ:**
```json
{
  "success": true,
  "messageId": "msg123",
  "scheduled": false
}
```

Или для отложенной отправки:
```json
{
  "success": true,
  "scheduled": true,
  "scheduledId": "scheduled123",
  "sendAt": "2024-12-21T10:00:00Z"
}
```

### Настройки

#### GET /api/settings

Получение настроек пользователя.

**Ответ:**
```json
{
  "signature": "Подпись письма",
  "signatures": [
    {
      "id": "sig1",
      "name": "Рабочая подпись",
      "content": "Содержимое подписи",
      "isDefault": true,
      "context": "work"
    }
  ],
  "theme": "light",
  "autoReply": {
    "enabled": false,
    "subject": "",
    "message": "",
    "schedule": {
      "enabled": false,
      "startDate": "",
      "endDate": "",
      "startTime": "",
      "endTime": ""
    }
  },
  "ui": {
    "density": "comfortable",
    "messagesPerPage": 50,
    "sortBy": "date",
    "sortOrder": "desc",
    "groupBy": "none"
  },
  "locale": {
    "language": "ru",
    "dateFormat": "DD.MM.YYYY",
    "timeFormat": "24h",
    "timezone": "Europe/Moscow"
  }
}
```

#### POST /api/settings

Сохранение настроек пользователя.

**Тело запроса:** (все поля опциональны)
```json
{
  "signature": "Новая подпись",
  "signatures": [
    {
      "id": "sig1",
      "name": "Рабочая подпись",
      "content": "Содержимое",
      "isDefault": true,
      "context": "work"
    }
  ],
  "theme": "dark",
  "ui": {
    "density": "compact",
    "messagesPerPage": 25
  }
}
```

### Аккаунты

#### GET /api/accounts

Получение списка аккаунтов пользователя.

**Ответ:**
```json
{
  "accounts": [
    {
      "id": "account1@example.com",
      "email": "account1@example.com",
      "displayName": "Account 1",
      "isActive": true
    }
  ]
}
```

#### POST /api/accounts

Добавление нового аккаунта.

**Тело запроса:**
```json
{
  "email": "newaccount@example.com",
  "password": "password"
}
```

#### DELETE /api/accounts?accountId=account@example.com

Удаление аккаунта.

#### POST /api/accounts/switch

Переключение между аккаунтами.

**Тело запроса:**
```json
{
  "accountId": "account@example.com"
}
```

## Обработка ошибок

Все ошибки возвращаются в следующем формате:

```json
{
  "error": "Описание ошибки",
  "details": "Дополнительная информация (опционально)"
}
```

## Rate Limiting

API защищен от злоупотреблений через rate limiting. При превышении лимита возвращается код `429` с информацией о времени сброса:

```json
{
  "error": "Too many requests",
  "resetAt": 1234567890
}
```

## CSRF Protection

Все POST/PUT/DELETE запросы защищены от CSRF атак через проверку Origin заголовка.
