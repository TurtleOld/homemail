#!/bin/bash

# Скрипт для создания администратора в Stalwart Mail Server
# Использование: ./create-admin.sh <email> <password>

set -e

EMAIL=${1:-"admin@example.com"}
PASSWORD=${2:-"admin123"}

if [ -z "$1" ] || [ -z "$2" ]; then
    echo "Использование: $0 <email> <password>"
    echo "Пример: $0 admin@example.com admin123"
    exit 1
fi

STALWART_CONFIG=${STALWART_CONFIG:-"/etc/stalwart/config.toml"}
STALWART_CONFIG_BACKUP="${STALWART_CONFIG}.backup.$(date +%Y%m%d_%H%M%S)"

echo "🔧 Создание администратора в Stalwart Mail Server"
echo "Email: $EMAIL"
echo "Config: $STALWART_CONFIG"
echo ""

# Проверка существования конфигурации
if [ ! -f "$STALWART_CONFIG" ]; then
    echo "❌ Файл конфигурации не найден: $STALWART_CONFIG"
    echo "💡 Создайте конфигурацию на основе примера:"
    echo "   cp providers/stalwart-jmap/config.toml $STALWART_CONFIG"
    exit 1
fi

# Создание резервной копии
echo "📋 Создание резервной копии конфигурации..."
cp "$STALWART_CONFIG" "$STALWART_CONFIG_BACKUP"
echo "✅ Резервная копия: $STALWART_CONFIG_BACKUP"

# Генерация bcrypt хеша пароля
echo "🔐 Генерация bcrypt хеша пароля..."

if command -v python3 &> /dev/null; then
    BCRYPT_HASH=$(python3 -c "
import bcrypt
import sys

password = sys.argv[1].encode('utf-8')
hashed = bcrypt.hashpw(password, bcrypt.gensalt())
print('bcrypt:' + hashed.decode())
" "$PASSWORD")
else
    echo "⚠️  Python3 не найден. Используется plain пароль (НЕ БЕЗОПАСНО для production!)"
    BCRYPT_HASH="plain:$PASSWORD"
fi

echo "✅ Хеш пароля: ${BCRYPT_HASH:0:20}..."

# Проверка существования пользователя
if grep -q "name = \"$EMAIL\"" "$STALWART_CONFIG"; then
    echo "⚠️  Пользователь $EMAIL уже существует в конфигурации"
    read -p "Заменить существующего пользователя? (y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "❌ Отменено"
        exit 1
    fi
    
    # Удаление старого пользователя
    echo "🗑️  Удаление старого пользователя..."
    sed -i "/\[\[directory\."local"\.users\]\]/,/^$/ { /name = \"$EMAIL\"/,/^$/d; }" "$STALWART_CONFIG"
fi

# Добавление нового администратора
echo "➕ Добавление администратора в конфигурацию..."

# Находим последнюю строку секции directory."local".users и добавляем после неё
if ! grep -q "\[\[directory\."local"\.users\]\]" "$STALWART_CONFIG"; then
    # Если секции нет, добавляем после [directory."local"]
    sed -i "/^\[directory\."local"\]/a\\
\\
[[directory.\"local\".users]]\\
name = \"$EMAIL\"\\
secret = \"$BCRYPT_HASH\"\\
type = \"individual\"\\
superuser = true
" "$STALWART_CONFIG"
else
    # Добавляем в конец секции
    cat >> "$STALWART_CONFIG" << EOF

[[directory."local".users]]
name = "$EMAIL"
secret = "$BCRYPT_HASH"
type = "individual"
superuser = true
EOF
fi

echo "✅ Администратор добавлен в конфигурацию"

# Проверка синтаксиса TOML (если установлен toml-cli)
if command -v toml-cli &> /dev/null; then
    echo "🔍 Проверка синтаксиса TOML..."
    if toml-cli validate "$STALWART_CONFIG"; then
        echo "✅ Синтаксис TOML корректен"
    else
        echo "❌ Ошибка синтаксиса TOML!"
        echo "💡 Восстановление из резервной копии..."
        cp "$STALWART_CONFIG_BACKUP" "$STALWART_CONFIG"
        exit 1
    fi
fi

echo ""
echo "✅ Администратор успешно создан!"
echo ""
echo "📋 Следующие шаги:"
echo "1. Перезапустите Stalwart Mail Server:"
echo "   sudo systemctl restart stalwart"
echo "   # или"
echo "   ./stalwart restart"
echo ""
echo "2. Проверьте подключение:"
echo "   curl -X POST https://example.com/jmap \\"
echo "     -H 'Content-Type: application/json' \\"
echo "     -H \"Authorization: Basic $(echo -n '$EMAIL:$PASSWORD' | base64)\" \\"
echo "     -d '{\"using\": [\"urn:ietf:params:jmap:core\"], \"methodCalls\": [[\"Session/get\", {}, \"0\"]]}'"
echo ""
echo "3. Войдите в webmail клиент с учетными данными:"
echo "   Email: $EMAIL"
echo "   Password: $PASSWORD"
echo ""
