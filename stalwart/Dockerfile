FROM stalwartlabs/stalwart:latest

# Устанавливаем curl для healthcheck
RUN apt-get update && apt-get install -y curl && rm -rf /var/lib/apt/lists/*

# Создаем необходимые директории
RUN mkdir -p /var/lib/stalwart/data \
    /var/lib/stalwart/certs \
    /var/log/stalwart \
    /opt/stalwart/etc

EXPOSE 25 143 443 587 8080 993

# Конфигурация монтируется через volume в docker-compose.yml
CMD ["stalwart", "--config", "/opt/stalwart/etc/config.toml"]
