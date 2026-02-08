# AI Missed Call Recovery MVP — Requirements

## Goals / Success Criteria
- Persist every call event: status updates, transcripts, and end‑of‑call summaries.
- Business owners can **view call history** in a dashboard (Supabase Auth + RLS).
- Business owners receive a **daily digest email** of calls (no real‑time alerts).
- Cal.com booking exists in code but is **disabled by default** per business.
- Simple onboarding: business record + phone mapping + owner user.

## Non‑Goals
- No appointment management UI in MVP.
- No customer acknowledgement messages (SMS/email).
- No immediate call notifications.

## User Roles
- **Business Owner**: authenticated user who can view business calls.
- **Staff**: optional role with read access (future).
- **Caller**: end customer calling the Twilio number (no account).

## Data Flow
1. Caller dials Twilio number.
2. Twilio calls `/api/webhook`.
3. Webhook forwards to Vapi and returns TwiML.
4. Vapi sends events to `/api/vapi-webhook`.
5. Webhook persists call data in Supabase.
6. Daily digest job sends summary email.

## MVP Features (Behavioral Requirements)
- **Call persistence**:
  - `assistant-request` creates initial call record.
  - `status-update` updates status/metadata.
  - `transcript` stores utterances.
  - `end-of-call-report` stores final summary + analysis.
- **Cal.com toggle**:
  - Booking functions only enabled when `businesses.calcom_enabled = true` and valid Cal.com credentials exist.
- **Daily digest**:
  - Cron runs once daily (UTC schedule) and sends previous local‑day summary.
  - Uses `businesses.email` or owner email as recipient.
- **Dashboard**:
  - Authenticated users see only their business data via RLS.

## External Integrations
- **Twilio**: inbound calls and telephony.
- **Vapi**: AI assistant & event webhooks.
- **Supabase**: persistence, auth, RLS.
- **Resend**: daily digest emails.
- **Vercel Cron**: scheduler.

## Security / Privacy
- Use Supabase Service Key **only** on server endpoints.
- Use Supabase Anon Key **only** in frontend.
- Protect cron endpoint with `CRON_SECRET` header.
- Do not log secrets or full transcripts unnecessarily.

## Ops & Monitoring
- Vercel logs for webhook and cron visibility.
- Resend delivery status for email validation.
- Basic failure logging per business digest.

## Future Enhancements
- Immediate call notifications (email/SMS).
- Customer acknowledgements.
- Cal.com OAuth self‑serve onboarding.
- CRM integrations.
- After‑hours flows and human handoff.

## Onboarding (Manual)
1. Create Supabase Auth user.
2. Insert business row.
3. Insert business phone mapping (E.164, must match Vapi payload).
4. Link owner user in `business_users`.

