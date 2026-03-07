#!/usr/bin/env bash
set -euo pipefail

if [[ -z "${SUPABASE_DB_URL:-}" ]]; then
  echo "Missing SUPABASE_DB_URL"
  exit 1
fi

OUT_DIR="${MIGRATION_OUT_DIR:-./tmp/aws-db-migration}"
mkdir -p "$OUT_DIR"

echo "Exporting globals (best effort)..."
pg_dumpall --globals-only --dbname="$SUPABASE_DB_URL" > "$OUT_DIR/globals.sql" || true

echo "Exporting schema..."
pg_dump \
  --format=custom \
  --no-owner \
  --no-privileges \
  --schema-only \
  --dbname="$SUPABASE_DB_URL" \
  --file="$OUT_DIR/schema.dump"

echo "Exporting data..."
pg_dump \
  --format=custom \
  --no-owner \
  --no-privileges \
  --data-only \
  --dbname="$SUPABASE_DB_URL" \
  --file="$OUT_DIR/data.dump"

echo "Export complete: $OUT_DIR"
