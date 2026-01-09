# Mail Web Client

Современный веб-клиент для работы с почтой уровня mini-Gmail с полноценным BFF слоем, безопасным рендерингом HTML писем и realtime обновлениями.

## Технологии

- **Next.js 16.x** (App Router) + React 19 + TypeScript
- **Tailwind CSS** + shadcn/ui компоненты
- **TanStack Query** для кеширования и синхронизации данных
- **react-virtuoso** для виртуализации списков (поддержка 50k+ писем)
- **TipTap** для редактирования писем
- **DOMPurify** для санитизации HTML
- **Server-Sent Events (SSE)** для realtime обновлений
- **Vitest** + **Playwright** для тестирования

## Быстрый старт

### Установка

```bash
npm install
```

### Разработка

```bash
npm run dev
```

Приложение будет доступно по адресу [http://localhost:3000](http://localhost:3000)

### Сборка

```bash
npm run build
npm start
```

## Production Deployment

Для production развертывания используйте один из вариантов:

1. **Docker** (рекомендуется) - см. [PRODUCTION.md](./PRODUCTION.md)
2. **PM2** - для Node.js окружения
3. **Systemd** - для Linux сервисов

Быстрый старт:
```bash
./deploy.sh production
```

Подробная документация: [PRODUCTION.md](./PRODUCTION.md)

## Тестирование

### Unit и Component тесты

```bash
npm test
```

### E2E тесты (Playwright)

```bash
npm run test:e2e
```

С UI режимом:

```bash
npm run test:e2e:ui
```

## Архитектура

### BFF слой (Backend for Frontend)

Все запросы от UI идут только на `/api/*` внутри Next.js. BFF слой отвечает за:

- **Аутентификацию**: HTTPOnly cookies, сессии в памяти (с возможностью расширения до Redis/DB)
- **Rate limiting**: токен-бакет по IP/сессии для защиты от злоупотреблений
- **Валидацию**: все входные данные валидируются через Zod
- **Проксирование**: скрывает реальные токены доступа к почтовому серверу
- **Нормализацию**: выдает единообразные DTO для фронтенда

### Mail Provider интерфейс

Система построена на абстракции `MailProvider`, что позволяет легко переключаться между реализациями:

- **Mock Provider** (`providers/mock/`): полностью реализован, генерирует тестовые данные
- **IMAP Provider** (`providers/imap/`): заглушка с инструкциями по реализации

### Безопасность

#### HTML письма

HTML письма рендерятся через **sandboxed iframe** по следующим причинам:

1. **Изоляция**: iframe с `sandbox="allow-same-origin"` предотвращает выполнение JavaScript
2. **Санитизация**: DOMPurify удаляет опасные теги и атрибуты перед рендерингом
3. **Защита от XSS**: даже если санитизация пропустит что-то, iframe изолирует контент
4. **Remote images**: по умолчанию блокируются, можно включить для конкретного письма

#### API защита

- **CSRF**: проверка Origin/Referer для state-changing запросов
- **Rate limiting**: на login (5 запросов/15 мин) и bulk операциях (10 запросов/мин)
- **Cookie**: HttpOnly, SameSite=Lax, Secure в production
- **Валидация**: все входные данные валидируются через Zod

#### Content Security Policy (CSP)

Рекомендуемая конфигурация для production:

```
Content-Security-Policy: 
  default-src 'self';
  script-src 'self';
  style-src 'self' 'unsafe-inline';
  img-src 'self' data:;
  object-src 'none';
  frame-ancestors 'none';
  base-uri 'self';
  form-action 'self';
```

### Производительность

- **Виртуализация**: react-virtuoso для списков писем (поддержка 50k+ элементов)
- **Infinite scroll**: cursor-based pagination
- **Кеширование**: TanStack Query с настройками staleTime
- **Оптимистичные обновления**: для флагов и bulk операций

## Подключение реального почтового сервера

### Stalwart Mail Server (JMAP + SMTP)

Полная реализация для Stalwart Mail Server через JMAP и SMTP доступна в `providers/stalwart-jmap/`.

**Быстрый старт:**

1. Установите зависимости (уже включены):
```bash
npm install
```

2. Настройте переменные окружения в `.env.local`:
```env
MAIL_PROVIDER=stalwart
STALWART_BASE_URL=https://mail.pavlovteam.ru
STALWART_SMTP_HOST=mail.pavlovteam.ru
STALWART_SMTP_PORT=587
STALWART_SMTP_SECURE=false
STALWART_AUTH_MODE=basic
```

3. Проверьте соединение:
```bash
curl https://mail.pavlovteam.ru/.well-known/jmap
```

4. Войдите с реальными учетными данными - все должно работать автоматически.

**Подробная документация:** См. `providers/stalwart-jmap/README.md`

### IMAP/SMTP (альтернатива)

Для подключения через IMAP:

1. **Установите зависимости**:

```bash
npm install imap nodemailer
npm install --save-dev @types/imap
```

2. **Реализуйте IMAP Provider**:

См. `providers/imap/README.md` для детальных инструкций. Основные моменты:

- Реализуйте все методы интерфейса `MailProvider`
- Маппинг IMAP папок на `Folder` тип
- Маппинг IMAP сообщений на `MessageDetail`/`MessageListItem`
- Использование IMAP IDLE для realtime обновлений
- SMTP через nodemailer для отправки

3. **Хранение credentials**:

- Учетные данные хранятся в server session (HTTPOnly cookie)
- Никогда не логируйте credentials
- В production рассмотрите шифрование в базе данных

4. **Переключение на IMAP**:

Установите переменную окружения:

```bash
MAIL_PROVIDER=imap
```

5. **Конфигурация**:

Создайте `.env.local`:

```env
IMAP_HOST=imap.example.com
IMAP_PORT=993
IMAP_SECURE=true
SMTP_HOST=smtp.example.com
SMTP_PORT=465
SMTP_SECURE=true
```

### Маппинг сущностей

**JMAP (Stalwart):**
- **JMAP Mailbox.id** → `Folder.id`
- **JMAP Mailbox.role** → `Folder.role` (inbox/sent/drafts/trash/spam)
- **JMAP Email.id** → `MessageDetail.id`
- **JMAP Email.keywords** → `MessageFlags` ($seen → unread, $flagged → starred)
- **JMAP Blob.id** → `Attachment.id` (скачивание через downloadUrl)

**IMAP:**
- **IMAP UIDs** → `message.id` (сохраняйте в базе для стабильности)
- **IMAP folders** → `Folder` (role определяется по стандартным именам: INBOX, Sent, Drafts, Trash, Spam)
- **IMAP flags** → `MessageFlags` (\\Seen → unread, \\Flagged → starred)
- **IMAP attachments** → `Attachment` (скачивание через IMAP FETCH)

## Структура проекта

```
mailclient/
├── app/                    # Next.js App Router
│   ├── api/                # BFF Route Handlers
│   │   ├── auth/          # Аутентификация
│   │   └── mail/          # Почтовые операции
│   ├── mail/              # Приватная зона
│   └── login/             # Страница входа
├── components/            # React компоненты
│   ├── ui/               # shadcn/ui компоненты
│   ├── message-list.tsx  # Виртуализированный список
│   ├── message-viewer.tsx # Просмотр письма
│   ├── compose.tsx       # Редактор писем
│   └── sidebar.tsx       # Боковая панель
├── lib/                   # Утилиты и хелперы
│   ├── types.ts          # TypeScript типы
│   ├── sanitize.ts       # Санитизация HTML
│   ├── session.ts        # Управление сессиями
│   ├── rate-limit.ts     # Rate limiting
│   └── get-provider.ts   # Фабрика провайдеров
├── providers/             # Mail провайдеры
│   ├── mail-provider.ts  # Интерфейс
│   ├── mock/            # Mock реализация
│   └── imap/             # IMAP реализация (заглушка)
├── e2e/                  # E2E тесты
└── lib/__tests__/        # Unit тесты
```

## Горячие клавиши

- `j` / `k` - навигация по списку писем
- `Enter` / `o` - открыть выбранное письмо
- `c` - создать новое письмо
- `/` - фокус на поиске
- `r` - ответить
- `a` - ответить всем
- `f` - переслать
- `#` - удалить

## Настройки

- **Тема**: светлая/темная (сохраняется в localStorage)
- **Блокировка remote images**: по умолчанию включена
- **Автосохранение черновиков**: каждые 10 секунд

## Генерация данных

Mock provider генерирует тестовые данные:

- По умолчанию: 10,000 писем
- Для 50k: установите `NEXT_PUBLIC_SEED_SIZE=50000`
- Seed детерминированный: одинаковые данные между перезапусками

## Разработка

### Форматирование

```bash
npm run format
```

### Линтинг

```bash
npm run lint
```

## Production Deployment

Для production развертывания используйте один из вариантов:

1. **Docker** (рекомендуется) - см. [PRODUCTION.md](./PRODUCTION.md)
2. **PM2** - для Node.js окружения  
3. **Systemd** - для Linux сервисов

**Быстрый старт:**
```bash
./deploy.sh production
```

**Подробная документация:** [PRODUCTION.md](./PRODUCTION.md)

### Основные шаги:

1. Установите переменные окружения (см. `env.production.example`)
2. Настройте SSL сертификат (Let's Encrypt)
3. Настройте Nginx reverse proxy (см. `nginx.conf.example`)
4. Запустите приложение через Docker, PM2 или Systemd
5. Настройте мониторинг и логирование

## Лицензия

MIT
