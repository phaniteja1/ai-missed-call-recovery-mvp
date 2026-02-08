-- Track last digest send time to avoid duplicates
alter table public.businesses
  add column if not exists last_digest_sent_at timestamptz;
