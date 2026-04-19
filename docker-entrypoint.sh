#!/bin/sh
# Docker entrypoint — runs schema engine before the Next.js server.
# Generates Prisma schema from schema.yaml, runs safe migrations,
# and regenerates the Prisma client.

set -e

echo "[entrypoint] Running schema engine..."
npm run schema:generate

echo "[entrypoint] Starting application..."
exec "$@"
