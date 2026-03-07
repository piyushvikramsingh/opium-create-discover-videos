#!/usr/bin/env bash
set -euo pipefail

if [[ -z "${AWS_RDS_DB_URL:-}" ]]; then
  echo "Missing AWS_RDS_DB_URL"
  exit 1
fi

OUT_DIR="${MIGRATION_OUT_DIR:-./tmp/aws-db-migration}"
SCHEMA_DUMP="$OUT_DIR/schema.dump"
DATA_DUMP="$OUT_DIR/data.dump"

if [[ ! -f "$SCHEMA_DUMP" || ! -f "$DATA_DUMP" ]]; then
  echo "Missing dump files in $OUT_DIR. Run export_supabase.sh first."
  exit 1
fi

echo "Restoring schema to AWS..."
pg_restore \
  --no-owner \
  --no-privileges \
  --clean \
  --if-exists \
  --dbname="$AWS_RDS_DB_URL" \
  "$SCHEMA_DUMP"

echo "Restoring data to AWS..."
pg_restore \
  --no-owner \
  --no-privileges \
  --data-only \
  --disable-triggers \
  --dbname="$AWS_RDS_DB_URL" \
  "$DATA_DUMP"

echo "Running ANALYZE..."
psql "$AWS_RDS_DB_URL" -c "ANALYZE;"

echo "Import complete"
