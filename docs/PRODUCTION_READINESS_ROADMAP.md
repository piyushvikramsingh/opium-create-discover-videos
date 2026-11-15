# Opium Production Readiness Roadmap

## Objective

Turn Opium into a reliable, secure, mobile-first video social platform that can be used by real creators and viewers. A feature is complete only when its full user journey works against the configured backend and is covered by a repeatable test.

## Operating principles

- Work on `opium/production-readiness`; keep `main` as the production baseline until review and verification pass.
- Do not invent credentials or silently change live Supabase data.
- Keep Supabase migrations, Edge Functions, and schema types versioned.
- Never commit environment files or privileged keys.
- Prefer small, reversible changes with tests and documented deployment steps.
- Treat UI controls backed by placeholder data as incomplete.

## Release gates

A release is not production-ready until all of these pass:

1. Clean dependency install, lint, unit tests, and production build.
2. Authentication and session recovery work with configured Supabase credentials.
3. Row Level Security is verified for every user-owned table and storage bucket.
4. Video upload, processing, playback, deletion, and retry paths work.
5. Core social interactions persist correctly and respect privacy settings.
6. Messaging is restricted to conversation participants and works in real time.
7. Admin actions are role-gated and auditable.
8. Mobile viewport, keyboard, upload, and playback behavior are tested.
9. Error monitoring, abuse reporting, rate limits, and recovery procedures are documented.
10. Vercel production environment variables and deployment are verified without exposing secrets.

## Workstream 0 — Repository and delivery hygiene

- [x] Create an isolated production-readiness branch.
- [x] Ignore local environment files.
- [x] Keep Supabase migrations and functions tracked by Git.
- [x] Remove the committed local `.env` file from the working branch.
- [ ] Diagnose and fix the existing CI failure.
- [ ] Add automated security and dependency checks.
- [ ] Verify Vercel environment variables and production deployment settings.

## Workstream 1 — Backend and security

- [ ] Inventory all tables, views, RPCs, triggers, storage buckets, and Edge Functions.
- [ ] Review RLS policies for read, insert, update, and delete access.
- [ ] Verify that users cannot modify another user's profile, posts, messages, settings, or monetization records.
- [ ] Verify admin authorization is enforced server-side, not only in the UI.
- [ ] Review upload MIME types, size limits, ownership, and signed URL behavior.
- [ ] Add rate limits and abuse controls to high-risk operations.
- [ ] Review secret handling and Edge Function authorization.

## Workstream 2 — Identity and profiles

- [ ] Test registration, email verification, login, logout, password reset, and session refresh.
- [ ] Test profile creation and editing, avatars, privacy, blocking, and follow requests.
- [ ] Ensure private-account content is never exposed by feed, search, direct URLs, or RPCs.

## Workstream 3 — Video and feed

- [ ] Verify video upload on desktop and mobile, including large files and interrupted uploads.
- [ ] Verify storage persistence, processing status, thumbnails, playback, and deletion.
- [ ] Verify feed pagination, ranking, duplicate suppression, and visibility filters.
- [ ] Verify likes, comments, saves, shares, views, and counters remain consistent.
- [ ] Verify scheduled posts and audience restrictions.

## Workstream 4 — Community

- [ ] Verify stories, story expiry, viewers, highlights, and close-friends access.
- [ ] Verify direct messages, group conversations, requests, attachments, read states, and realtime updates.
- [ ] Verify notifications are permission-aware, deduplicated, and not spammy.
- [ ] Verify search and discovery respect blocked users and private accounts.

## Workstream 5 — Creator, live, and monetization

- [ ] Verify creator analytics use authoritative backend data.
- [ ] Verify live-stream signaling, reconnects, cleanup, and TURN/STUN requirements.
- [ ] Verify subscriptions, tips, gifts, and entitlements only after payment-provider integration and webhook verification.
- [ ] Do not represent simulated payments or demo analytics as real earnings.

## Workstream 6 — Quality and launch

- [ ] Add unit and integration tests for the core flows.
- [ ] Add browser-level smoke tests for auth, feed, create, inbox, and profile.
- [ ] Test mobile Safari and Android Chrome layouts and media permissions.
- [ ] Measure feed response, upload success, playback startup, and crash/error rates.
- [ ] Prepare rollback instructions and a production smoke-test checklist.

## Current evidence and known risks

- The repository has a React + TypeScript + Vite frontend, Supabase integration, SQL migrations, Edge Functions, and a separate React Native/Expo scaffold.
- The project checklist marks story reliability, publishing reliability, inbox reliability, profile consistency, security hardening, privacy enforcement, and instrumentation as incomplete.
- The most recent visible GitHub Actions CI run on the inspected main commit concluded `failure`; its job logs are no longer available through the connected GitHub API. Re-run CI on this branch to identify the current failing step.
- A local `.env` file was tracked. The inspected variables were Supabase project URL, project ID, and publishable client key; no service-role key was identified in those entries. The file is removed from this branch and ignored going forward. Review repository history and confirm no privileged secret was ever committed.
- The existing `.gitignore` ignored the entire `supabase` directory, which could prevent future migrations and Edge Functions from being committed. This has been narrowed to local Supabase runtime artifacts.

## Definition of done

Opium is ready for a controlled public beta when all release gates pass, core flows work for at least two independent test accounts, privacy boundaries are verified, and the team can observe and recover from failed uploads, backend errors, and abusive activity.
