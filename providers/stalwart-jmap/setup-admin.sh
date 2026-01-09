#!/bin/bash

# Скрипт для создания bcrypt хеша пароля для Stalwart
# Использование: ./setup-admin.sh your_password

if [ -z "$1" ]; then
    echo "Использование: $0 <password>"
    echo "Пример: $0 admin123"
    exit 1
fi

PASSWORD="$1"

# Проверяем наличие Python
if command -v python3 &> /dev/null; then
    echo "Генерация bcrypt хеша для пароля..."
    python3 -c "
import bcrypt
import sys

password = sys.argv[1].encode('utf-8')
hashed = bcrypt.hashpw(password, bcrypt.gensalt())
print('bcrypt:' + hashed.decode())
" "$PASSWORD"
else
    echo "Python3 не найден. Установите Python3 для генерации bcrypt хеша."
    echo ""
    echo "Или используйте онлайн генератор (только для тестирования!):"
    echo "https://bcrypt-generator.com/"
    echo ""
    echo "Для тестирования можно временно использовать plain пароль:"
    echo "secret = \"plain:$PASSWORD\""
fi
