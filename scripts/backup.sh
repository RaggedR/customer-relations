#!/bin/bash
#
# Database Backup Script (encrypted)
#
# Usage: BACKUP_PASSPHRASE=<secret> SESSION_TOKEN=<jwt> ./scripts/backup.sh [output-dir]
#
# Creates two encrypted backups:
#   1. pg_dump SQL file → .sql.gpg (full fidelity, PostgreSQL-specific)
#   2. JSON export via API → .json.gpg (portable, schema-driven)
#
# Requires: gpg, BACKUP_PASSPHRASE environment variable, SESSION_TOKEN for API auth
# Default output: ./backups/

set -euo pipefail

# ── Guards ───────────────────────────────────────────────
if [ -z "${BACKUP_PASSPHRASE:-}" ]; then
  echo "Error: BACKUP_PASSPHRASE environment variable is not set." >&2
  exit 1
fi

if [ -z "${SESSION_TOKEN:-}" ]; then
  echo "Error: SESSION_TOKEN environment variable is not set (admin JWT for API auth)." >&2
  exit 1
fi

if ! command -v gpg &>/dev/null; then
  echo "Error: gpg is not installed. Install gnupg to use this script." >&2
  exit 1
fi

OUTPUT_DIR="${1:-./backups}"
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
DB_NAME="customer_relations"

mkdir -p "$OUTPUT_DIR"

echo "=== Backing up $DB_NAME (encrypted) ==="
echo "Output: $OUTPUT_DIR"
echo ""

# ── PostgreSQL dump (piped directly through gpg) ─────────
SQL_FILE="$OUTPUT_DIR/backup-${TIMESTAMP}.sql.gpg"
echo "1. pg_dump → $SQL_FILE"
if command -v pg_dump &>/dev/null; then
  pg_dump "$DB_NAME" \
    | gpg --symmetric --batch --yes \
          --passphrase "$BACKUP_PASSPHRASE" \
          --cipher-algo AES256 \
          -o "$SQL_FILE"
  echo "   $(du -h "$SQL_FILE" | cut -f1) written (encrypted)"
else
  echo "   ⚠ pg_dump not found — skipping SQL backup"
fi

# ── JSON export via API (encrypt, then shred plaintext) ──
JSON_FILE="$OUTPUT_DIR/backup-${TIMESTAMP}.json.gpg"
JSON_PLAIN=$(mktemp)
echo "2. JSON export → $JSON_FILE"
if curl -sf -H "Cookie: session=$SESSION_TOKEN" http://localhost:3000/api/backup -o "$JSON_PLAIN"; then
  gpg --symmetric --batch --yes \
      --passphrase "$BACKUP_PASSPHRASE" \
      --cipher-algo AES256 \
      -o "$JSON_FILE" "$JSON_PLAIN"
  shred -u "$JSON_PLAIN" 2>/dev/null || rm -f "$JSON_PLAIN"
  echo "   $(du -h "$JSON_FILE" | cut -f1) written (encrypted)"
else
  rm -f "$JSON_PLAIN"
  echo "   ⚠ API not reachable — skipping JSON backup"
fi

echo ""
echo "Done."
