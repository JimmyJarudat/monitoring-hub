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

echo ">>> Starting nginx..."
nginx -g "daemon off;" 2>&1 | tee /app/logs/nginx.log &

echo ">>> Starting Elysia backend..."
bun src/index.ts 2>&1 | tee /app/logs/backend.log
wait