# Business Onboarding (Manual)

This guide covers how to onboard a **new business** into the AI Missed Call Recovery system.

## 1) Create / Assign a Twilio Phone Number
- In Twilio Console → Phone Numbers → Buy a number.
- Configure **Voice Webhook**:
  - URL: `https://<your-vercel-domain>/api/webhook`
  - Method: `POST`
- Save the number in **E.164 format** (e.g., `+19842082787`).

## 2) Vapi Assistant Strategy (Recommended)
**Recommended: One dynamic assistant for all businesses.**
- The Vapi webhook (`/api/vapi-webhook`) dynamically returns assistant config based on the called phone number.
- You do **not** need a separate assistant per business.
- Optionally store `vapi_assistant_id` in the business record if you want to override.

**Alternative: One assistant per business**
- Create in Vapi Dashboard → Assistants.
- Store `vapi_assistant_id` for the business.

## 3) Supabase Database Setup (Required)
Run these inserts in Supabase SQL Editor.

### 3.1 Create Supabase Auth user
- Supabase Dashboard → Auth → Users → Invite User
- Copy the user UUID.

### 3.2 Create business record
```sql
insert into businesses (name, email, timezone)
values ('Dental Clinic', 'owner@mybiz.com', 'America/New_York')
returning id;
```

### 3.3 Map business phone number (must match Vapi payload)
```sql
insert into business_phone_numbers (business_id, phone_number, is_primary, active, label)
values ('<business_uuid>', '+19842082787', true, true, 'main');
```

### 3.4 Link owner user to business
```sql
insert into business_users (business_id, user_id, role)
values ('<business_uuid>', '<auth_user_uuid>', 'owner');
```

## 4) Enable Daily Digest Email (default ON)
New businesses default to `digest_enabled = true`.
To ensure it’s enabled for this business:
```sql
update businesses
set digest_enabled = true
where id = '<business_uuid>';
```

## 5) (Optional) Enable Cal.com Scheduling
Cal.com is **disabled by default** for MVP.
To enable per business:
```sql
update businesses
set calcom_enabled = true
where id = '<business_uuid>';
```

## 6) Verify End-to-End
- Call the Twilio number and confirm:
  - Vapi handles the call.
  - Call appears in Supabase `calls` and `call_transcripts`.
- Check digest logs after the next cron run.

## Notes
- The phone number must be **exactly** what Vapi sends (E.164). For Twilio bypass, Vapi sends `call.phoneNumber.twilioPhoneNumber`.
- For the dashboard, the user must be authenticated (Supabase Auth) and linked in `business_users`.
