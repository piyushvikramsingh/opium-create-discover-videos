# Feature Execution Checklist (Opium)

This checklist maps the product blueprint to implementation tracks in the current app.

## Priority Legend
- P0: Core retention and reliability
- P1: Strong growth / creator leverage
- P2: Expansion and optimization

## Track A — Core Product Surfaces
- [x] P0 Home feed ranking and anti-repeat tuning
- [ ] P0 Story reliability and transitions
- [x] P0 Explore quality: trending + search + category relevance (anti-repeat diversity integrated)
- [ ] P0 Create publish reliability (draft -> upload -> process)
- [ ] P0 Inbox performance and conversation reliability
- [ ] P0 Profile consistency and analytics cards

## Track B — Engagement and Social Loops
- [ ] P0 Comment quality controls and moderation hooks
- [ ] P1 Polls/Q&A standardization across creation and feed
- [ ] P1 Save collections management UX
- [ ] P1 Topic follow/subscription model

## Track C — Creator and Monetization
- [ ] P1 Tiered subscriptions UX and entitlement checks
- [ ] P1 Tip and gifting funnel polish
- [ ] P1 Creator marketplace scaffolding
- [ ] P2 Affiliate tagging and conversion tracking

## Track D — Trust, Safety, and Settings
- [ ] P0 Security hardening (2FA, login/device activity, alerts)
- [ ] P0 Privacy controls enforcement checks
- [ ] P0 Notification channel preferences parity (push/email/SMS)
- [ ] P1 Data export + cache/storage controls
- [ ] P1 Help/report/support routing and SLAs

## Track E — Platform Intelligence
- [ ] P0 Event instrumentation audit for key funnel points
- [ ] P1 Feed explainability (Why this post?)
- [ ] P1 Recommendation reset and interest graph maintenance
- [ ] P2 Ranking experimentation framework (A/B)

## Suggested Delivery Sequence
1. Stabilize P0 trust + core surfaces
2. Tighten feed/explore ranking loops
3. Expand creator monetization and collaboration tools
4. Add advanced personalization and experimentation controls

## Current App Route Anchors
- Home: `src/pages/HomeTan.tsx`
- Explore: `src/pages/Discover.tsx`
- Create: `src/pages/Create.tsx`
- Messages: `src/pages/Inbox.tsx`, `src/components/ChatView.tsx`
- Profile: `src/pages/Profile.tsx`
- Notifications: `src/pages/Notifications.tsx`
- Settings: `src/pages/Settings.tsx`
- Creator support pages: `src/pages/Engagement.tsx`, `src/pages/LiveStreaming.tsx`, `src/pages/Monetization.tsx`
