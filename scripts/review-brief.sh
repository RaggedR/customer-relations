#!/usr/bin/env bash
# Generate a pre-flight context brief for review agents.
# Extracts key information from codebase files without using an LLM.
# Output: /tmp/review-context.md
#
# Usage: ./scripts/review-brief.sh

set -euo pipefail
OUT="/tmp/review-context.md"
PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$PROJECT_ROOT"

: > "$OUT"

emit_section() {
  local title="$1" file="$2"
  echo "" >> "$OUT"
  echo "## $title" >> "$OUT"
  echo "" >> "$OUT"
  if [ -f "$file" ]; then
    cat -n "$file" >> "$OUT"
  else
    echo "_File not found: $file_" >> "$OUT"
  fi
  echo "" >> "$OUT"
}

emit_exports() {
  local title="$1" file="$2"
  echo "" >> "$OUT"
  echo "## $title (exports + key logic)" >> "$OUT"
  echo "" >> "$OUT"
  if [ -f "$file" ]; then
    # Show exports, type definitions, and function signatures with line numbers
    grep -n "^export\|^  export\|^interface \|^type \|^async function\|^function \|^const .* = async\|^class " "$file" >> "$OUT" 2>/dev/null || true
    echo "" >> "$OUT"
    echo "Full file: $(wc -l < "$file") lines" >> "$OUT"
  else
    echo "_File not found: $file_" >> "$OUT"
  fi
  echo "" >> "$OUT"
}

emit_heading() {
  echo "" >> "$OUT"
  echo "# $1" >> "$OUT"
  echo "" >> "$OUT"
}

# Header
echo "# Pre-flight Context Brief" > "$OUT"
echo "Generated: $(date -u +%Y-%m-%dT%H:%M:%SZ)" >> "$OUT"
echo "Project: $PROJECT_ROOT" >> "$OUT"

# Documentation (include full — these are already compressed human writing)
emit_heading "Documentation"
emit_section "Architecture" "docs/ARCHITECTURE.md"
emit_section "Security Design" "docs/SECURITY.md"

# Schema & Navigation (include full — these are declarations)
emit_heading "Schema & Navigation"
emit_section "Data Model" "schema.yaml"
emit_section "Navigation Graph" "navigation.yaml"

# Source files (exports + signatures only)
emit_heading "Auth & Access Control"
emit_exports "auth.ts" "src/lib/auth.ts"
emit_exports "proxy.ts" "src/proxy.ts"

emit_heading "Data Layer"
emit_exports "repository.ts" "src/lib/repository.ts"
emit_exports "audit.ts" "src/lib/audit.ts"
emit_exports "sql-safety.ts" "src/lib/sql-safety.ts"
emit_section "Prisma Schema" "prisma/schema.prisma"

emit_heading "API Endpoints"
emit_exports "AI endpoint" "src/app/api/ai/route.ts"
emit_exports "Generic CRUD" "src/app/api/[entity]/route.ts"
emit_exports "File upload" "src/app/api/attachments/upload/route.ts"
emit_exports "Backup" "src/app/api/backup/route.ts"

emit_heading "Import & Sync"
emit_exports "Import pipeline" "src/lib/import.ts"
emit_exports "Parsers" "src/lib/parsers.ts"
emit_exports "CalDAV client" "src/lib/caldav-client.ts"
emit_exports "CardDAV client" "src/lib/carddav-client.ts"
emit_exports "iCal builder" "src/lib/ical.ts"

emit_heading "Operational"
emit_exports "API helpers" "src/lib/api-helpers.ts"
emit_exports "Rate limiter" "src/lib/rate-limit.ts"
emit_section "Dockerfile" "Dockerfile"
emit_section "Docker Compose" "docker-compose.yml"
if [ -f ".github/workflows/ci.yml" ]; then
  emit_section "CI Pipeline" ".github/workflows/ci.yml"
fi
emit_section "Backup script" "scripts/backup.sh"
emit_section "Restore script" "scripts/restore.sh"

# Test coverage summary
emit_heading "Test Coverage"
echo "Test files:" >> "$OUT"
find tests -name "*.test.ts" -o -name "*.spec.ts" 2>/dev/null | sort | while read -r f; do
  # First describe/test line gives the file's purpose
  purpose=$(grep -m1 "describe\|test(" "$f" 2>/dev/null | sed "s/.*['\"]//;s/['\"].*//" || echo "")
  echo "- $f — $purpose" >> "$OUT"
done

# Stats
echo "" >> "$OUT"
lines=$(wc -l < "$OUT")
echo "---" >> "$OUT"
echo "Brief: $lines lines" >> "$OUT"

echo "Wrote $OUT ($lines lines)"
