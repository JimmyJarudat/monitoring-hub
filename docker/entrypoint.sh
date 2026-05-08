#!/bin/bash
set -e

DB_MODE=${DB_MODE:-existing}

echo ">>> Starting monitoring-hub"
echo "    DB_MODE = $DB_MODE"

case "$DB_MODE" in
  existing)
    echo ">>> Using existing database..."
    ;;
  init)
    echo ">>> Initializing database..."
    bunx prisma db push
    bun run seed
    ;;
  migrate)
    echo ">>> Running prisma migrate deploy..."
    bunx prisma migrate deploy
    ;;
  fresh)
    echo ">>> Resetting database..."
    bunx prisma db push --force-reset --accept-data-loss
    bun run seed
    ;;
  *)
    echo "Invalid DB_MODE: $DB_MODE"
    exit 1
    ;;
esac

mkdir -p /app/logs

# ลบ log ที่เกิน 90 วัน
find /app/logs -name "*.log" -mtime +90 -delete

# ตั้งชื่อ log ตามวันที่
DATE=$(date +%Y-%m-%d)

echo ">>> Starting nginx..."
nginx -g "daemon off;" \
  > >(tee /app/logs/nginx-${DATE}.log) \
  2> >(tee /app/logs/nginx-error-${DATE}.log >&2) &

echo ">>> Starting Elysia backend..."
bun src/index.ts \
  > >(tee /app/logs/backend-${DATE}.log) \
  2> >(tee /app/logs/backend-error-${DATE}.log >&2)

wait