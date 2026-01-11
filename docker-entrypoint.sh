#!/bin/sh
set -e

if [ "$(id -u)" = "0" ]; then
  if [ -d /app/data ]; then
    chown -R nextjs:nodejs /app/data || true
    chmod -R 755 /app/data || true
  fi
  exec su-exec nextjs "$@"
else
  exec "$@"
fi
