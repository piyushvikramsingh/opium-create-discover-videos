#!/usr/bin/env bash
set -euo pipefail

if [[ -z "${SUPABASE_DB_URL:-}" || -z "${AWS_RDS_DB_URL:-}" ]]; then
  echo "Missing SUPABASE_DB_URL or AWS_RDS_DB_URL"
  exit 1
fi

OUT_DIR="${MIGRATION_OUT_DIR:-./tmp/aws-db-migration}"
mkdir -p "$OUT_DIR"

echo "[1/4] Checking Supabase connectivity..."
psql "$SUPABASE_DB_URL" -c "select version();" >/dev/null

echo "[2/4] Checking AWS RDS connectivity..."
psql "$AWS_RDS_DB_URL" -c "select version();" >/dev/null

echo "[3/4] Exporting extension and schema inventory..."
psql "$SUPABASE_DB_URL" -Atc "select extname from pg_extension order by 1;" > "$OUT_DIR/extension_list.txt"
psql "$SUPABASE_DB_URL" -Atc "select nspname from pg_namespace where nspname not like 'pg_%' and nspname <> 'information_schema' order by 1;" > "$OUT_DIR/schema_list.txt"

echo "[4/4] Inventory saved to $OUT_DIR"
