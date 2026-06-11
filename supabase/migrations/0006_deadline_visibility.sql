-- Replace kickoff-based read visibility with deadline-based.
-- After the 9 PM IST prediction deadline passes, everyone can see each
-- other's picks for those matches. Previously picks were hidden until
-- kickoff (which could be 12–24 h after the deadline).
--
-- Safety: wrapped in a transaction, all drops use IF EXISTS for safe re-runs.

begin;

drop policy if exists "predictions: others after kickoff"  on public.predictions;
drop policy if exists "predictions: others after deadline" on public.predictions;

create policy "predictions: others after deadline"
  on public.predictions for select
  to authenticated
  using (
    user_id != auth.uid() and
    exists (
      select 1 from public.matches m
      where m.id = match_id
        and (
          date_trunc('day', m.kickoff_utc at time zone 'Asia/Kolkata')::timestamp
          - interval '3 hours'
        ) at time zone 'Asia/Kolkata' <= now()
    )
  );

commit;
