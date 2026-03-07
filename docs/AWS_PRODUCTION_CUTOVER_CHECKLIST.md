# AWS Production Cutover Checklist

Use this checklist when switching production traffic to AWS hosting (Amplify or CloudFront).

## 1) Pre-cutover (T-24h to T-1h)

- [ ] Confirm latest production build is green locally:
  - `npm ci && npm run build`
- [ ] Confirm AWS hosting target is already deployed and reachable on its default domain.
- [ ] Set all required frontend environment variables in AWS hosting:
  - `VITE_SUPABASE_URL`
  - `VITE_SUPABASE_PUBLISHABLE_KEY`
  - `VITE_ENABLE_MUX_STREAMING`
- [ ] Confirm SPA rewrite behavior is configured:
  - `/<*>` -> `/index.html` (HTTP 200 rewrite)
- [ ] Prepare SSL certificate (ACM):
  - Amplify-managed certificate, or
  - ACM cert in `us-east-1` for CloudFront.
- [ ] Lower DNS TTL for production records (example: 60s) at least 1 hour before cutover.

## 2) Go-live window

- [ ] Freeze non-critical deployments.
- [ ] Re-check AWS deployment status is successful.
- [ ] Point DNS to AWS endpoint:
  - Amplify custom domain association, or
  - Route53 ALIAS/CNAME to CloudFront distribution domain.
- [ ] Wait for DNS propagation and certificate attachment to complete.

## 3) Post-cutover smoke tests (first 15 minutes)

Run:

```bash
APP_URL="https://your-domain.com" bash scripts/aws-hosting/smoke_test.sh
```

Manual checks:

- [ ] Home route loads.
- [ ] Deep routes load on refresh (`/discover`, `/inbox`, `/help`).
- [ ] Login works.
- [ ] Feed loads data.
- [ ] Create/upload flow still works.
- [ ] Video playback works.

## 4) Monitor (first 1-2 hours)

- [ ] 4xx/5xx rates in CloudFront/Amplify logs.
- [ ] Frontend runtime errors in browser console monitoring.
- [ ] Login and API call success rates.
- [ ] Latency and page load metrics.

## 5) Rollback plan (if incident)

Trigger rollback if critical user flows fail for more than 5-10 minutes.

1. Repoint DNS to previous stable host (old provider/previous distribution).
2. Confirm SSL still valid on rollback target.
3. Re-run smoke tests against rollback URL.
4. Announce rollback completion.
5. Keep AWS deployment up for debugging; do not delete artifacts.

## 6) Recommended command snippets

Check DNS resolution:

```bash
dig +short your-domain.com
```

Check headers:

```bash
curl -I https://your-domain.com
```

Check deep-link response code:

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://your-domain.com/discover
```

## 7) Notes for this repository

- This project is a React Router SPA, so deep-link rewrite to `index.html` is mandatory.
- This project still depends on Supabase backend services unless separately migrated.
- Hosting migration and DB/backend migration are independent tracks.
