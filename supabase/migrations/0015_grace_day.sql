begin;

-- One-time grace option per player, per tournament.
-- null = unused; YYYY-MM-DD IST date key = used on that day.
alter table public.profiles
  add column if not exists grace_day text;

commit;
