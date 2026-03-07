# AWS DB migration scripts

These scripts migrate PostgreSQL data from Supabase DB to AWS RDS/Aurora PostgreSQL.

## Required env vars

```bash
export SUPABASE_DB_URL='postgresql://...'
export AWS_RDS_DB_URL='postgresql://...'
```

Optional:

```bash
export MIGRATION_OUT_DIR='./tmp/aws-db-migration'
```

## Execution order

```bash
bash scripts/aws-db/precheck.sh
bash scripts/aws-db/export_supabase.sh
bash scripts/aws-db/import_to_aws_rds.sh
bash scripts/aws-db/validate_migration.sh
```

See full runbook in `docs/AWS_DB_MIGRATION_RUNBOOK.md`.
