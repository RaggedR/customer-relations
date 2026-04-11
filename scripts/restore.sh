#!/bin/bash
#
# Database Restore Script
#
# Usage: ./scripts/restore.sh <backup-file>
#
# Accepts:
#   - .sql file (pg_dump output) → restores with psql
#   - .json file (API backup) → restores via import API
#
# Safety: prompts for confirmation before restoring.

set -euo pipefail

if [ $# -lt 1 ]; then
  echo "Usage: $0 <backup-file.sql|backup-file.json>"
  exit 1
fi

BACKUP_FILE="$1"
DB_NAME="customer_relations"

if [ ! -f "$BACKUP_FILE" ]; then
  echo "Error: file not found: $BACKUP_FILE"
  exit 1
fi

EXT="${BACKUP_FILE##*.}"

echo "=== Restore from $BACKUP_FILE ==="
echo ""

case "$EXT" in
  sql)
    echo "This will restore the PostgreSQL database '$DB_NAME'."
    echo "WARNING: This will overwrite all existing data."
    echo ""
    read -p "Continue? (yes/no): " CONFIRM
    if [ "$CONFIRM" != "yes" ]; then
      echo "Aborted."
      exit 0
    fi
    echo ""
    echo "Restoring..."
    psql "$DB_NAME" < "$BACKUP_FILE"
    echo "Done."
    ;;

  json)
    echo "This will import entities from the JSON backup via the API."
    echo "Existing records matching upsert keys will be updated."
    echo ""
    read -p "Continue? (yes/no): " CONFIRM
    if [ "$CONFIRM" != "yes" ]; then
      echo "Aborted."
      exit 0
    fi
    echo ""

    # Read import order from backup
    IMPORT_ORDER=$(python3 -c "
import json, sys
with open('$BACKUP_FILE') as f:
    data = json.load(f)
order = data.get('import_order', list(data.get('entities', {}).keys()))
print(' '.join(order))
")

    for ENTITY in $IMPORT_ORDER; do
      # Extract entity data and POST to import endpoint
      SLUG=$(echo "$ENTITY" | tr '_' '-')
      COUNT=$(python3 -c "
import json
with open('$BACKUP_FILE') as f:
    data = json.load(f)
entities = data.get('entities', {}).get('$ENTITY', [])
print(len(entities))
")

      if [ "$COUNT" = "0" ]; then
        echo "  $ENTITY: 0 records — skipping"
        continue
      fi

      # Write entity data to temp file
      TEMP_FILE=$(mktemp /tmp/restore-XXXX.json)
      python3 -c "
import json
with open('$BACKUP_FILE') as f:
    data = json.load(f)
entities = data.get('entities', {}).get('$ENTITY', [])
with open('$TEMP_FILE', 'w') as out:
    json.dump(entities, out)
"

      RESULT=$(curl -sf -X POST "http://localhost:3000/api/$SLUG/import" \
        -F "file=@$TEMP_FILE;filename=restore.json" 2>/dev/null || echo '{"error":"API call failed"}')

      CREATED=$(echo "$RESULT" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('created',0))" 2>/dev/null || echo "?")
      UPDATED=$(echo "$RESULT" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('updated',0))" 2>/dev/null || echo "?")
      ERRORS=$(echo "$RESULT" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('skipped',0))" 2>/dev/null || echo "?")

      echo "  $ENTITY: $COUNT records → created=$CREATED updated=$UPDATED skipped=$ERRORS"

      rm -f "$TEMP_FILE"
    done

    echo ""
    echo "Done."
    ;;

  *)
    echo "Error: unsupported file type '.$EXT'. Use .sql or .json"
    exit 1
    ;;
esac
