-- Add business feature flags and digest preferences
alter table public.businesses
  add column if not exists calcom_enabled boolean not null default false,
  add column if not exists digest_enabled boolean not null default true,
  add column if not exists digest_time_local text not null default '08:00',
  add column if not exists digest_timezone text;

-- Backfill digest_timezone to business timezone if present
update public.businesses
set digest_timezone = timezone
where digest_timezone is null;
