begin;

alter table public.matches
  add column live_minute smallint;

-- Current match minute from the live-score feed; only meaningful while
-- status = 'live'. Cleared (null) when the match finishes or hasn't started.

commit;
