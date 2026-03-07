# AWS DB Migration Runbook

This runbook migrates the **PostgreSQL database** from Supabase-hosted Postgres to AWS RDS/Aurora PostgreSQL with minimal downtime.

## Important scope

This project currently uses:
- Supabase Auth (`supabase.auth.*`)
- Supabase Storage (`supabase.storage.*`)
- Supabase Realtime (`supabase.channel(...)`)
- Supabase Edge Functions (`supabase.functions.invoke(...)`)
- Supabase Postgres (tables, RPC, RLS)

Moving only the DB to AWS does **not** migrate Auth/Storage/Realtime/Edge Functions by itself.

## Recommended migration paths

### Path A (fastest, lowest rewrite)
Keep app on Supabase for Auth/Storage/Realtime and move analytics/reporting workloads to AWS read replicas/data warehouse.

### Path B (full AWS ownership)
Move Postgres to AWS + replace Supabase services:
- Auth -> Amazon Cognito (or Auth0)
- Storage -> S3 (+ CloudFront signed URLs)
- Realtime -> AppSync/WebSockets/EventBridge
- Edge Functions -> Lambda/API Gateway

This runbook covers the DB move mechanics used by either path.

---

## 1) Prerequisites

- `pg_dump`, `pg_restore`, `psql` installed locally.
- AWS RDS/Aurora PostgreSQL instance ready.
- Network access from your machine to both source and target DB.
- A maintenance/cutover window.

Environment variables used by scripts:

```bash
export SUPABASE_DB_URL='postgresql://...'
export AWS_RDS_DB_URL='postgresql://...'
```

Optional:

```bash
export MIGRATION_OUT_DIR='./tmp/aws-db-migration'
```

---

## 2) Run pre-migration inventory

```bash
bash scripts/aws-db/precheck.sh
```

This checks connectivity and captures extension/schema metadata snapshots.

---

## 3) Export from Supabase

```bash
bash scripts/aws-db/export_supabase.sh
```

Outputs:
- `schema.dump` (custom format)
- `data.dump` (custom format)
- `globals.sql` (roles/settings where available)

---

## 4) Prepare AWS Postgres target

1. Create target DB/user.
2. Enable required extensions (see `extension_list.txt` from precheck output).
3. Ensure parameter group is compatible with used features.

---

## 5) Import into AWS

```bash
bash scripts/aws-db/import_to_aws_rds.sh
```

This restores schema first, then data, then analyzes tables.

---

## 6) Validate row counts and critical objects

```bash
bash scripts/aws-db/validate_migration.sh
```

This compares row counts for all public tables and checks function/view presence.

---

## 7) Cutover strategy (minimal downtime)

1. Put app in maintenance mode (short window).
2. Stop write traffic.
3. Run final delta export/import:
   - Re-run export/import scripts.
4. Run validation script.
5. Update app backend connection/env for DB layer.
6. Re-enable traffic.
7. Monitor error rates and query latency.

---

## 8) App-layer work required after DB move

Because this app is deeply coupled to Supabase APIs, plan these replacements before full AWS cutover:

- `src/hooks/useAuth.tsx`, `src/pages/Auth.tsx`, `src/pages/Settings.tsx`:
  replace Supabase Auth calls with Cognito/Auth provider SDK.
- `src/pages/Create.tsx`, `src/components/ChatView.tsx`, `src/pages/Profile.tsx`:
  replace Supabase Storage uploads/public URLs with S3 upload + signed URL flow.
- `src/hooks/useMessages.ts`, `src/components/ChatView.tsx`, `src/hooks/useData.ts`:
  replace Supabase Realtime channels with AWS realtime transport.
- `supabase/functions/*` and `supabase/migrations/*` RPC calls:
  port to Lambda/API or DB procedures invoked by your API tier.

---

## 9) Rollback plan

If cutover fails:
1. Switch app connection back to original Supabase DB-backed backend.
2. Re-enable traffic.
3. Keep AWS target for forensic diff and retry.

---

## 10) Notes for this repository

- There are many Supabase SQL migrations in `supabase/migrations`.
- RPC functions and RLS policies must be preserved if you keep direct SQL behavior.
- Validate all mission-critical paths: Auth, feed fetch, create/upload, inbox/chat, notifications.
