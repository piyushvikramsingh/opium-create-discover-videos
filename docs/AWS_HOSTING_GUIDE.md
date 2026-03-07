# AWS Hosting Guide (React + Vite)

This project is a static React/Vite app, so the simplest AWS hosting options are:

1. **AWS Amplify Hosting** (recommended for fastest setup)
2. **S3 + CloudFront** (more manual, more control)

---

## Option 1: AWS Amplify Hosting (recommended)

### 1) Connect repository

1. Open AWS Console -> Amplify -> **Host web app**.
2. Connect your Git provider and select this repo/branch.
3. Amplify will detect `amplify.yml` in the root.

### 2) Set environment variables

In Amplify App settings -> Environment variables, add:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`
- `VITE_ENABLE_MUX_STREAMING` (`true` or `false`)

### 3) Add SPA rewrite rule

In Amplify -> Rewrites and redirects, add:

- Source address: `/<*>`
- Target address: `/index.html`
- Type: `200 (Rewrite)`

This is required for React Router deep links.

### 4) Deploy

- Trigger a build from Amplify UI or push to your connected branch.
- Amplify builds with `npm ci` + `npm run build` and serves `dist/`.

---

## Option 2: S3 + CloudFront

Use this when you want full control over caching/CDN behavior.

### 1) Build

```bash
npm ci
npm run build
```

### 2) Create and configure S3 bucket (private recommended)

- Upload `dist/` contents to S3.
- Keep bucket private and use CloudFront Origin Access Control (OAC).

### 3) Create CloudFront distribution

- Origin: S3 bucket
- Default root object: `index.html`
- Custom error responses for SPA:
  - `403` -> `/index.html` with `200`
  - `404` -> `/index.html` with `200`

### 4) Cache policy

- `index.html`: short TTL (or no-cache)
- hashed assets under `dist/assets/*`: long TTL

### 5) Domain + SSL

- Create ACM cert in `us-east-1`.
- Attach cert to CloudFront.
- Point Route53 (or external DNS) CNAME/ALIAS to CloudFront domain.

---

## Required runtime env values

Your frontend requires these values at build time:

```dotenv
VITE_SUPABASE_PROJECT_ID="cjxhrnajkaqhwxccfflk"
VITE_SUPABASE_URL="https://cjxhrnajkaqhwxccfflk.supabase.co"
VITE_SUPABASE_PUBLISHABLE_KEY="your-supabase-anon-key"
VITE_ENABLE_MUX_STREAMING="false"
```

---

## Post-deploy checks

1. Home page loads successfully.
2. Refresh on nested routes works (no 404).
3. Auth works (Supabase URL/key correctly injected).
4. Upload/playback paths work for videos.

---

## Notes for your current architecture

- Hosting frontend on AWS does **not** move your backend services.
- You can host frontend on Amplify/CloudFront now and migrate DB/backend separately using:
  - `docs/AWS_DB_MIGRATION_RUNBOOK.md`
  - `scripts/aws-db/`
