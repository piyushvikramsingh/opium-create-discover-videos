#!/usr/bin/env bash
set -euo pipefail

if [[ -z "${SUPABASE_DB_URL:-}" || -z "${AWS_RDS_DB_URL:-}" ]]; then
  echo "Missing SUPABASE_DB_URL or AWS_RDS_DB_URL"
  exit 1
fi

OUT_DIR="${MIGRATION_OUT_DIR:-./tmp/aws-db-migration}"
mkdir -p "$OUT_DIR"

echo "Collecting source row counts..."
psql "$SUPABASE_DB_URL" -At <<'SQL' > "$OUT_DIR/source_counts.tsv"
select table_schema || '.' || table_name,
       (xpath('/row/cnt/text()', query_to_xml(format('select count(*) as cnt from %I.%I', table_schema, table_name), false, true, '')))[1]::text::bigint as row_count
from information_schema.tables
where table_schema = 'public' and table_type = 'BASE TABLE'
order by 1;
SQL

echo "Collecting target row counts..."
psql "$AWS_RDS_DB_URL" -At <<'SQL' > "$OUT_DIR/target_counts.tsv"
select table_schema || '.' || table_name,
       (xpath('/row/cnt/text()', query_to_xml(format('select count(*) as cnt from %I.%I', table_schema, table_name), false, true, '')))[1]::text::bigint as row_count
from information_schema.tables
where table_schema = 'public' and table_type = 'BASE TABLE'
order by 1;
SQL

echo "Diffing row counts..."
join -t $'\t' -a 1 -a 2 -e 'MISSING' -o 0,1.2,2.2 "$OUT_DIR/source_counts.tsv" "$OUT_DIR/target_counts.tsv" > "$OUT_DIR/row_count_diff.tsv" || true

echo "Validation output: $OUT_DIR/row_count_diff.tsv"
echo "Columns: table,source_count,target_count"
