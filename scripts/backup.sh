#!/bin/bash
#
# Database Backup Script
#
# Usage: ./scripts/backup.sh [output-dir]
#
# Creates two backups:
#   1. pg_dump SQL file (full fidelity, PostgreSQL-specific)
#   2. JSON export via API (portable, schema-driven)
#
# Default output: ./backups/

set -euo pipefail

OUTPUT_DIR="${1:-./backups}"
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
DB_NAME="customer_relations"

mkdir -p "$OUTPUT_DIR"

echo "=== Backing up $DB_NAME ==="
echo "Output: $OUTPUT_DIR"
echo ""

# ── PostgreSQL dump ──────────────────────────────────────
SQL_FILE="$OUTPUT_DIR/backup-${TIMESTAMP}.sql"
echo "1. pg_dump → $SQL_FILE"
if command -v pg_dump &>/dev/null; then
  pg_dump "$DB_NAME" > "$SQL_FILE"
  echo "   $(du -h "$SQL_FILE" | cut -f1) written"
else
  echo "   ⚠ pg_dump not found — skipping SQL backup"
fi

# ── JSON export via API ──────────────────────────────────
JSON_FILE="$OUTPUT_DIR/backup-${TIMESTAMP}.json"
echo "2. JSON export → $JSON_FILE"
if curl -sf http://localhost:3000/api/backup -o "$JSON_FILE"; then
  echo "   $(du -h "$JSON_FILE" | cut -f1) written"
else
  echo "   ⚠ API not reachable — skipping JSON backup"
fi

echo ""
echo "Done."
