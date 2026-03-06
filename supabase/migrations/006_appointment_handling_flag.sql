-- Add explicit appointment handling toggle for AI call flows.
alter table public.businesses
  add column if not exists appointment_handling_enabled boolean not null default false;

-- Backfill existing businesses.
-- Current production assumption: existing businesses should allow appointment handling.
update public.businesses
set appointment_handling_enabled = true
where appointment_handling_enabled = false;
