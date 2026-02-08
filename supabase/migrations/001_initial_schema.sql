-- ============================================================
-- AI Missed Call Recovery (Supabase) - v2 Clean SQL
-- - Uses pgcrypto gen_random_uuid()
-- - Multi-tenant via business_users (auth.uid())
-- - Supports multiple phone numbers per business
-- - No circular FKs (booking references call)
-- - RLS policies included
-- ============================================================

-- ---------- EXTENSIONS ----------
create extension if not exists pgcrypto;

-- ---------- HELPERS ----------
create or replace function public.update_updated_at_column()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- ---------- ENUM-LIKE CHECKS ----------
-- Keeping TEXT + CHECK for flexibility in MVP

-- ============================================================
-- BUSINESSES
-- ============================================================
create table if not exists public.businesses (
  id uuid primary key default gen_random_uuid(),
  name text not null,

  email text,
  timezone text not null default 'America/New_York',
  business_hours jsonb not null default
    '{
      "mon": {"start": "09:00", "end": "17:00"},
      "tue": {"start": "09:00", "end": "17:00"},
      "wed": {"start": "09:00", "end": "17:00"},
      "thu": {"start": "09:00", "end": "17:00"},
      "fri": {"start": "09:00", "end": "17:00"}
    }'::jsonb,

  -- Vapi config (usually safe-ish to store)
  vapi_assistant_id text,
  vapi_phone_number_id text,

  -- Feature flags / preferences
  calcom_enabled boolean not null default false,
  digest_enabled boolean not null default true,
  digest_time_local text not null default '08:00',
  digest_timezone text,

  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_businesses_active on public.businesses(active);

create trigger trg_businesses_updated_at
before update on public.businesses
for each row execute function public.update_updated_at_column();

-- ============================================================
-- BUSINESS USERS (TENANCY + ROLES)
-- ============================================================
create table if not exists public.business_users (
  business_id uuid not null references public.businesses(id) on delete cascade,
  user_id uuid not null, -- auth.users.id (no FK allowed from public schema in Supabase by default)
  role text not null check (role in ('owner', 'staff')) default 'owner',
  created_at timestamptz not null default now(),
  primary key (business_id, user_id)
);

create index if not exists idx_business_users_user_id on public.business_users(user_id);

-- ============================================================
-- BUSINESS PHONE NUMBERS (E.164 mapping)
-- ============================================================
create table if not exists public.business_phone_numbers (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,

  -- Store in E.164 format to keep UNIQUE sane: +15551234567
  phone_number text not null,
  label text, -- "main", "after-hours", "campaign-x", etc.

  -- Optional provider mapping
  twilio_phone_number_sid text,
  vapi_phone_number_id text,

  is_primary boolean not null default false,
  active boolean not null default true,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- basic E.164-ish check (not perfect, but catches obvious junk)
  constraint phone_e164_check check (phone_number ~ '^\+[1-9]\d{6,14}$')
);

-- One phone number should map to only one business
create unique index if not exists uniq_business_phone_number
on public.business_phone_numbers(phone_number);

-- Only one primary per business (optional but nice)
create unique index if not exists uniq_business_primary_phone
on public.business_phone_numbers(business_id)
where is_primary = true;

create index if not exists idx_business_phone_business_id
on public.business_phone_numbers(business_id);

create trigger trg_business_phone_updated_at
before update on public.business_phone_numbers
for each row execute function public.update_updated_at_column();

-- ============================================================
-- CALLS
-- ============================================================
create table if not exists public.calls (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,

  -- Provider IDs
  vapi_call_id text unique,

  -- Telephony
  direction text not null check (direction in ('inbound', 'outbound')) default 'inbound',
  from_phone text not null,
  to_phone text not null,
  customer_phone text not null, -- for inbound: usually from_phone, but store explicitly for quick queries

  -- Lifecycle
  status text not null check (status in ('queued','ringing','in-progress','completed','failed','busy','no-answer')) default 'queued',
  started_at timestamptz,
  ended_at timestamptz,
  duration_seconds integer,
  ended_reason text,

  constraint calls_time_order check (
    ended_at is null or started_at is null or ended_at >= started_at
  ),

  -- Media & Content
  recording_url text,
  full_transcript text,

  -- AI outputs
  summary text,
  intent text, -- 'booking','pricing','hours','complaint', etc.
  sentiment text check (sentiment in ('positive','neutral','negative')),

  -- Outcomes
  missed boolean not null default false,
  ai_handled boolean not null default false,
  escalation_required boolean not null default false,

  -- Provider payloads
  metadata jsonb not null default '{}'::jsonb,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_calls_business_created_at
on public.calls(business_id, created_at desc);

create index if not exists idx_calls_business_status
on public.calls(business_id, status);

create index if not exists idx_calls_customer_phone
on public.calls(customer_phone);

create index if not exists idx_calls_intent
on public.calls(intent);

create trigger trg_calls_updated_at
before update on public.calls
for each row execute function public.update_updated_at_column();

-- ============================================================
-- CALL TRANSCRIPTS (REAL-TIME UTTERANCES)
-- ============================================================
create table if not exists public.call_transcripts (
  id uuid primary key default gen_random_uuid(),
  call_id uuid not null references public.calls(id) on delete cascade,

  role text not null check (role in ('user','assistant','system')),
  text text not null,

  spoken_at timestamptz not null default now(),
  confidence double precision,
  sequence_number integer not null,

  created_at timestamptz not null default now()
);

create unique index if not exists uniq_call_transcripts_sequence
on public.call_transcripts(call_id, sequence_number);

create index if not exists idx_call_transcripts_call_spoken
on public.call_transcripts(call_id, spoken_at);

-- ============================================================
-- BOOKINGS (CAL.COM / APPOINTMENTS)
-- ============================================================
create table if not exists public.bookings (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,

  -- If you want 1 booking per call, keep UNIQUE(call_id). If not, remove the unique.
  call_id uuid references public.calls(id) on delete set null,
  constraint uniq_booking_per_call unique (call_id),

  -- Cal.com integration identifiers
  calcom_booking_id bigint unique,
  calcom_uid text unique,
  calcom_event_type_id integer, -- allow null at creation if you don’t know yet

  -- Customer details (email can be unknown at call-time)
  customer_name text,
  customer_email text,
  customer_phone text,

  scheduled_at timestamptz not null,
  duration_minutes integer not null default 30,

  status text not null check (status in ('pending','confirmed','cancelled','completed','no-show')) default 'pending',

  notes text,
  metadata jsonb not null default '{}'::jsonb,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  cancelled_at timestamptz
);

create index if not exists idx_bookings_business_scheduled
on public.bookings(business_id, scheduled_at desc);

create index if not exists idx_bookings_status
on public.bookings(business_id, status);

create index if not exists idx_bookings_customer_email
on public.bookings(customer_email);

create trigger trg_bookings_updated_at
before update on public.bookings
for each row execute function public.update_updated_at_column();

-- ============================================================
-- OPTIONAL: INTEGRATIONS (STORE TOKENS OUTSIDE BUSINESSES)
-- IMPORTANT: Consider using Supabase Vault or encrypting tokens.
-- ============================================================
create table if not exists public.business_integrations (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,

  provider text not null check (provider in ('calcom')),
  access_token text,
  refresh_token text,
  token_expires_at timestamptz,

  config jsonb not null default '{}'::jsonb,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_integrations_business_provider
on public.business_integrations(business_id, provider);

create trigger trg_integrations_updated_at
before update on public.business_integrations
for each row execute function public.update_updated_at_column();

-- ============================================================
-- RLS (ROW LEVEL SECURITY)
-- - Client access controlled by auth.uid() + business_users mapping
-- - Backend webhooks should use service_role key (bypasses RLS)
-- ============================================================

alter table public.businesses enable row level security;
alter table public.business_users enable row level security;
alter table public.business_phone_numbers enable row level security;
alter table public.calls enable row level security;
alter table public.call_transcripts enable row level security;
alter table public.bookings enable row level security;
alter table public.business_integrations enable row level security;

-- Helper: check membership
create or replace function public.is_business_member(bid uuid)
returns boolean as $$
  select exists (
    select 1
    from public.business_users bu
    where bu.business_id = bid
      and bu.user_id = auth.uid()
  );
$$ language sql stable;

-- Helper: check owner
create or replace function public.is_business_owner(bid uuid)
returns boolean as $$
  select exists (
    select 1
    from public.business_users bu
    where bu.business_id = bid
      and bu.user_id = auth.uid()
      and bu.role = 'owner'
  );
$$ language sql stable;

-- --------- businesses ---------
create policy "businesses: select if member"
on public.businesses
for select
using (public.is_business_member(id));

create policy "businesses: update if owner"
on public.businesses
for update
using (public.is_business_owner(id));

-- --------- business_users ---------
-- Members can view who is in their business
create policy "business_users: select if member"
on public.business_users
for select
using (public.is_business_member(business_id));

-- Only owners can manage membership (insert/update/delete)
create policy "business_users: insert if owner"
on public.business_users
for insert
with check (public.is_business_owner(business_id));

create policy "business_users: update if owner"
on public.business_users
for update
using (public.is_business_owner(business_id));

create policy "business_users: delete if owner"
on public.business_users
for delete
using (public.is_business_owner(business_id));

-- --------- business_phone_numbers ---------
create policy "phones: select if member"
on public.business_phone_numbers
for select
using (public.is_business_member(business_id));

create policy "phones: write if owner"
on public.business_phone_numbers
for all
using (public.is_business_owner(business_id))
with check (public.is_business_owner(business_id));

-- --------- calls ---------
create policy "calls: select if member"
on public.calls
for select
using (public.is_business_member(business_id));

create policy "calls: insert if member"
on public.calls
for insert
with check (public.is_business_member(business_id));

create policy "calls: update if member"
on public.calls
for update
using (public.is_business_member(business_id));

-- --------- call_transcripts ---------
create policy "transcripts: select if member"
on public.call_transcripts
for select
using (
  exists (
    select 1
    from public.calls c
    where c.id = call_transcripts.call_id
      and public.is_business_member(c.business_id)
  )
);

create policy "transcripts: insert if member"
on public.call_transcripts
for insert
with check (
  exists (
    select 1
    from public.calls c
    where c.id = call_transcripts.call_id
      and public.is_business_member(c.business_id)
  )
);

-- --------- bookings ---------
create policy "bookings: select if member"
on public.bookings
for select
using (public.is_business_member(business_id));

create policy "bookings: insert if member"
on public.bookings
for insert
with check (public.is_business_member(business_id));

create policy "bookings: update if member"
on public.bookings
for update
using (public.is_business_member(business_id));

-- --------- integrations ---------
-- Usually you want ONLY owners to read/write integration tokens from the client.
-- Many teams lock this down further (or service-role only).
create policy "integrations: select if owner"
on public.business_integrations
for select
using (public.is_business_owner(business_id));

create policy "integrations: write if owner"
on public.business_integrations
for all
using (public.is_business_owner(business_id))
with check (public.is_business_owner(business_id));

-- ============================================================
-- OPTIONAL ANALYTICS VIEW
-- (Views don’t automatically enforce RLS the same way; in Supabase,
-- query underlying tables directly from client, or wrap in RPC with security definer.)
-- ============================================================
create or replace view public.call_analytics as
select
  c.business_id,
  date_trunc('day', c.created_at) as date,
  count(*) as total_calls,
  count(*) filter (where c.status = 'completed') as completed_calls,
  count(*) filter (where c.missed = true) as missed_calls,
  count(*) filter (where c.ai_handled = true) as ai_handled_calls,
  avg(c.duration_seconds) as avg_duration_seconds,
  count(distinct c.customer_phone) as unique_callers,
  count(*) filter (where c.sentiment = 'positive') as positive_sentiment_count,
  count(*) filter (where c.sentiment = 'negative') as negative_sentiment_count
from public.calls c
group by c.business_id, date_trunc('day', c.created_at);

-- ============================================================
-- DEV SEED (REMOVE IN PROD)
-- NOTE: You cannot seed auth.users here.
-- Create a business, then insert into business_users using a real auth.uid().
-- ============================================================
insert into public.businesses (name, email, timezone, active)
values ('Acme Auto Repair', 'info@acmeauto.com', 'America/New_York', true)
on conflict do nothing;

-- Example phone for that business (will need the actual business_id if re-run)
-- insert into public.business_phone_numbers (business_id, phone_number, label, is_primary)
-- values (<BUSINESS_UUID>, '+15551234567', 'main', true);
