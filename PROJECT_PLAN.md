# AI Missed Call Recovery MVP — Project Plan

## Milestone 1: Data Model + Gating
- Add business flags (`calcom_enabled`, `digest_enabled`, `digest_time_local`, `digest_timezone`).
- Ensure `getBusinessByPhone()` returns new flags.
- Gate Cal.com features based on `calcom_enabled` + credentials.

## Milestone 2: Daily Digest Pipeline
- Implement `POST /api/cron/daily-digest` endpoint.
- Add Resend email sending.
- Add Vercel Cron schedule (UTC).
- Add required environment variables.

## Milestone 3: Dashboard Readiness
- Confirm Supabase Auth flow for frontend.
- Validate RLS allows owner to read `businesses`, `calls`, `call_transcripts`.
- Add dashboard link in digest emails.

## Milestone 4: Verification
- Test call flow end‑to‑end.
- Confirm daily digest sends and includes expected summaries.
- Validate Cal.com remains disabled by default.

## Deliverables
- Requirements doc: `MVP_REQUIREMENTS.md`.
- Updated schema migrations.
- Digest cron endpoint.
- Cal.com gating behavior.
- Updated environment template + vercel cron.

