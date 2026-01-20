#!/bin/bash

# Скрипт для проверки подключения к Stalwart Mail Server
# Использование: ./test-connection.sh <email> <password>

set -e

EMAIL=${1:-"admin@pavlovteam.ru"}
PASSWORD=${2:-"admin123"}
STALWART_URL=${STALWART_BASE_URL:-"https://example.com"}

if [ -z "$1" ] || [ -z "$2" ]; then
    echo "Использование: $0 <email> <password> [stalwart_url]"
    echo "Пример: $0 admin@pavlovteam.ru admin123 https://example.com"
    exit 1
fi

if [ -n "$3" ]; then
    STALWART_URL="$3"
fi

echo "🔍 Проверка подключения к Stalwart Mail Server"
echo "URL: $STALWART_URL"
echo "Email: $EMAIL"
echo ""

# 1. Проверка JMAP Discovery
echo "1️⃣  Проверка JMAP Discovery..."
DISCOVERY_URL="${STALWART_URL}/.well-known/jmap"
DISCOVERY_RESPONSE=$(curl -s -w "\n%{http_code}" "$DISCOVERY_URL" || echo -e "\n000")

HTTP_CODE=$(echo "$DISCOVERY_RESPONSE" | tail -n1)
DISCOVERY_BODY=$(echo "$DISCOVERY_RESPONSE" | sed '$d')

if [ "$HTTP_CODE" = "200" ]; then
    echo "✅ JMAP Discovery доступен"
    echo "$DISCOVERY_BODY" | jq '.' 2>/dev/null || echo "$DISCOVERY_BODY"
else
    echo "❌ JMAP Discovery недоступен (HTTP $HTTP_CODE)"
    echo "$DISCOVERY_BODY"
    exit 1
fi

echo ""

# 2. Проверка JMAP Session
echo "2️⃣  Проверка JMAP Session..."
AUTH_HEADER=$(echo -n "$EMAIL:$PASSWORD" | base64)

SESSION_RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "${STALWART_URL}/jmap" \
    -H "Content-Type: application/json" \
    -H "Authorization: Basic $AUTH_HEADER" \
    -d '{
        "using": ["urn:ietf:params:jmap:core", "urn:ietf:params:jmap:mail"],
        "methodCalls": [["Session/get", {}, "0"]]
    }' || echo -e "\n000")

HTTP_CODE=$(echo "$SESSION_RESPONSE" | tail -n1)
SESSION_BODY=$(echo "$SESSION_RESPONSE" | sed '$d')

if [ "$HTTP_CODE" = "200" ]; then
    echo "✅ JMAP Session успешно создан"
    echo "$SESSION_BODY" | jq '.methodResponses[0][1].accounts' 2>/dev/null || echo "$SESSION_BODY"
    
    # Извлечение accountId
    ACCOUNT_ID=$(echo "$SESSION_BODY" | jq -r '.methodResponses[0][1].primaryAccounts.mail // empty' 2>/dev/null)
    if [ -n "$ACCOUNT_ID" ]; then
        echo ""
        echo "📧 Account ID: $ACCOUNT_ID"
    fi
else
    echo "❌ Ошибка создания JMAP Session (HTTP $HTTP_CODE)"
    echo "$SESSION_BODY"
    
    if [ "$HTTP_CODE" = "401" ]; then
        echo ""
        echo "💡 Возможные причины:"
        echo "   - Неверный email или пароль"
        echo "   - Пользователь не существует в Stalwart"
        echo "   - Пользователь не имеет доступа к JMAP"
    fi
    exit 1
fi

echo ""

# 3. Проверка получения папок
if [ -n "$ACCOUNT_ID" ]; then
    echo "3️⃣  Проверка получения папок (Mailbox/get)..."
    
    MAILBOX_RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "${STALWART_URL}/jmap" \
        -H "Content-Type: application/json" \
        -H "Authorization: Basic $AUTH_HEADER" \
        -d "{
            \"using\": [\"urn:ietf:params:jmap:core\", \"urn:ietf:params:jmap:mail\"],
            \"methodCalls\": [[\"Mailbox/get\", {\"accountId\": \"$ACCOUNT_ID\"}, \"0\"]]
        }" || echo -e "\n000")
    
    HTTP_CODE=$(echo "$MAILBOX_RESPONSE" | tail -n1)
    MAILBOX_BODY=$(echo "$MAILBOX_RESPONSE" | sed '$d')
    
    if [ "$HTTP_CODE" = "200" ]; then
        echo "✅ Папки успешно получены"
        MAILBOX_COUNT=$(echo "$MAILBOX_BODY" | jq '.methodResponses[0][1].list | length' 2>/dev/null || echo "0")
        echo "📁 Количество папок: $MAILBOX_COUNT"
    else
        echo "⚠️  Ошибка получения папок (HTTP $HTTP_CODE)"
    fi
fi

echo ""
echo "✅ Все проверки пройдены успешно!"
echo ""
echo "🎉 Учетные данные работают корректно!"
echo "   Email: $EMAIL"
echo "   Password: $PASSWORD"
echo ""
echo "💡 Теперь вы можете войти в webmail клиент с этими данными"
