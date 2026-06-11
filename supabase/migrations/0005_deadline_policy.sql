-- Replace kickoff-based write policies with 9 PM IST previous-day deadline.
-- All matches on a given IST calendar day share one deadline: 9 PM IST on the
-- preceding calendar day.
--
-- Formula: midnight IST of the match day  minus 3 hours  interpreted as IST.
-- Example: matches on 12 Jun IST → deadline 11 Jun 21:00 IST = 11 Jun 15:30 UTC.

drop policy "predictions: insert before kickoff" on public.predictions;
drop policy "predictions: update before kickoff" on public.predictions;

create policy "predictions: insert before deadline"
  on public.predictions for insert
  to authenticated
  with check (
    user_id = auth.uid() and
    exists (
      select 1 from public.matches m
      where m.id = match_id
        and (
          date_trunc('day', m.kickoff_utc at time zone 'Asia/Kolkata')::timestamp
          - interval '3 hours'
        ) at time zone 'Asia/Kolkata' > now()
    )
  );

create policy "predictions: update before deadline"
  on public.predictions for update
  to authenticated
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid() and
    exists (
      select 1 from public.matches m
      where m.id = match_id
        and (
          date_trunc('day', m.kickoff_utc at time zone 'Asia/Kolkata')::timestamp
          - interval '3 hours'
        ) at time zone 'Asia/Kolkata' > now()
    )
  );
