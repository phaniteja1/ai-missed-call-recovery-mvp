-- Backfill last_digest_sent_at to prevent duplicate sends on first deploy
update public.businesses
set last_digest_sent_at = now()
where last_digest_sent_at is null;
