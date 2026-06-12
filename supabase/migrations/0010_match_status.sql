begin;

alter table public.matches
  add column status text
  check (status in ('live', 'ft', 'aet', 'pen'));

-- null  = not yet started (or pre-migration admin-entered score — treated as 'ft' in UI)
-- live  = match in progress
-- ft    = full time (90 min)
-- aet   = after extra time
-- pen   = decided on penalties

commit;
