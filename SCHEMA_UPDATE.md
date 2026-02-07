# Schema Update - Multi-Tenant Architecture

## Overview
Updated from single-tenant to full multi-tenant architecture with proper phone number mapping and RLS (Row Level Security).

## Key Changes

### 1. **Business Phone Numbers Table**
**Before:** Phone number stored directly on `businesses` table
**After:** Separate `business_phone_numbers` table with E.164 validation

```sql
create table business_phone_numbers (
  id uuid primary key,
  business_id uuid references businesses(id),
  phone_number text not null,  -- E.164 format: +15551234567
  label text,                   -- "main", "after-hours", etc.
  is_primary boolean,
  active boolean,
  -- Unique constraint: one phone = one business
  unique(phone_number)
);
```

**Why:** 
- Businesses can have multiple phone numbers
- E.164 format enforcement prevents duplicate/invalid numbers
- Better support for multiple Twilio/Vapi numbers per business

### 2. **Cal.com Credentials Moved**
**Before:** Stored on `businesses` table
**After:** Moved to `business_integrations` table

```sql
create table business_integrations (
  id uuid primary key,
  business_id uuid references businesses(id),
  provider text check (provider in ('calcom')),
  access_token text,
  refresh_token text,
  token_expires_at timestamptz,
  config jsonb  -- Stores event_type_id and other settings
);
```

**Why:**
- Separation of concerns (business info vs. integration secrets)
- Easier to add more integrations (Calendly, Zapier, etc.)
- Better security (can encrypt tokens separately)

### 3. **Business Users & Tenancy**
**New table:** `business_users` for access control

```sql
create table business_users (
  business_id uuid references businesses(id),
  user_id uuid,  -- auth.users.id
  role text check (role in ('owner', 'staff')),
  primary key (business_id, user_id)
);
```

**Why:**
- Multi-user support (owners and staff)
- RLS policies enforce data isolation
- Foundation for team collaboration features

### 4. **Calls Table Updates**
**Added required fields:**
- `from_phone` - Caller's phone number
- `to_phone` - Business phone number called
- `customer_phone` - Normalized customer phone (for quick queries)

**Why:**
- Supports both inbound and outbound calls
- Makes analytics queries faster
- Required for proper call routing

### 5. **Call Transcripts**
**Changed:** `timestamp` → `spoken_at`

Aligns with schema naming convention (all timestamp fields end in `_at`).

## Code Changes Required

### ✅ Updated Files:
1. **lib/supabase.js**
   - `getBusinessByPhone()` now queries `business_phone_numbers` table
   - `getCalcomCredentials()` reads from `business_integrations`
   - `updateCalcomCredentials()` uses update-or-insert pattern
   - `insertTranscript()` uses `spoken_at` instead of `timestamp`

2. **api/vapi-webhook.js**
   - All `upsertCall()` calls now include `from_phone` and `to_phone`
   - Checks Cal.com via `business_integrations` table
   - Properly handles multi-phone-number lookups

## Migration Path

### For Existing Deployments:
1. Run the new migration: `supabase/migrations/001_initial_schema.sql`
2. Migrate existing data:
   ```sql
   -- Move phone numbers to new table
   INSERT INTO business_phone_numbers (business_id, phone_number, is_primary, active)
   SELECT id, phone_number, true, active
   FROM businesses
   WHERE phone_number IS NOT NULL;
   
   -- Move Cal.com credentials
   INSERT INTO business_integrations (business_id, provider, access_token, refresh_token, token_expires_at, config)
   SELECT 
     id,
     'calcom',
     calcom_access_token,
     calcom_refresh_token,
     calcom_token_expires_at,
     jsonb_build_object('event_type_id', calcom_event_type_id)
   FROM businesses
   WHERE calcom_access_token IS NOT NULL;
   ```

### For New Deployments:
1. Run `supabase/migrations/001_initial_schema.sql`
2. Create your first business via Supabase dashboard
3. Create a user and link via `business_users` table
4. Add phone number via `business_phone_numbers` table

## Testing Checklist

- [ ] Phone number lookup works via `getBusinessByPhone()`
- [ ] Webhook creates calls with proper `from_phone`/`to_phone`
- [ ] Cal.com credentials stored in `business_integrations`
- [ ] Transcripts use `spoken_at` field
- [ ] RLS policies enforce business isolation
- [ ] Multiple phone numbers per business work correctly

## Security Notes

1. **RLS is ENABLED** - Service role key bypasses RLS (for webhooks)
2. **Tokens in `business_integrations`** - Consider using Supabase Vault for encryption
3. **E.164 validation** - Enforced at database level with CHECK constraint
4. **Unique phone constraint** - Prevents phone number conflicts

## Next Steps

- Consider encrypting `access_token` and `refresh_token` fields
- Add index on `business_phone_numbers.phone_number` for faster lookups (already exists)
- Implement token refresh logic for Cal.com OAuth
- Add audit logging for sensitive operations
