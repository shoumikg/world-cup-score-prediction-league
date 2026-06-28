-- Knockout bonus: predict the two finalists.
-- One row per user (two team picks). Scored 25 pts per team that actually
-- reaches the final → 50 / 25 / 0. Deadline is 9 PM IST the night before the
-- first knockout match — same formula as every other deadline in the app.
--
-- A separate table (rather than new bonus_answers rows) keeps the working
-- group-stage bonus constraints and RLS untouched.

begin;

create table public.finalist_predictions (
  user_id    uuid not null references public.profiles(id) on delete cascade,
  team_a     text not null,
  team_b     text not null,
  updated_at timestamptz not null default now(),
  primary key (user_id),
  constraint finalist_distinct check (team_a <> team_b)
);

alter table public.finalist_predictions enable row level security;

-- Both picks must be qualified teams. Keep in sync with lib/flags.ts
-- (enforced by __tests__/flags.test.ts), mirroring bonus_answers.
alter table public.finalist_predictions
  add constraint finalist_teams_valid check (
    team_a in (
      'Algeria','Argentina','Australia','Austria','Belgium','Bosnia-Herzegovina',
      'Brazil','Canada','Cape Verde','Colombia','Congo DR','Croatia','Curaçao',
      'Czechia','Ecuador','Egypt','England','France','Germany','Ghana','Haiti',
      'Iran','Iraq','Ivory Coast','Japan','Jordan','Mexico','Morocco',
      'Netherlands','New Zealand','Norway','Panama','Paraguay','Portugal',
      'Qatar','Saudi Arabia','Scotland','Senegal','South Africa','South Korea',
      'Spain','Sweden','Switzerland','Tunisia','Türkiye','USA','Uruguay',
      'Uzbekistan'
    )
    and team_b in (
      'Algeria','Argentina','Australia','Austria','Belgium','Bosnia-Herzegovina',
      'Brazil','Canada','Cape Verde','Colombia','Congo DR','Croatia','Curaçao',
      'Czechia','Ecuador','Egypt','England','France','Germany','Ghana','Haiti',
      'Iran','Iraq','Ivory Coast','Japan','Jordan','Mexico','Morocco',
      'Netherlands','New Zealand','Norway','Panama','Paraguay','Portugal',
      'Qatar','Saudi Arabia','Scotland','Senegal','South Africa','South Korea',
      'Spain','Sweden','Switzerland','Tunisia','Türkiye','USA','Uruguay',
      'Uzbekistan'
    )
  );

-- Deadline: 9 PM IST the night before the first knockout match.
-- (date_trunc to the IST calendar day of the earliest non-group kickoff, minus
-- 3 hours, interpreted as IST — identical shape to the bonus_answers policy.)
drop policy if exists "finalist: select own"             on public.finalist_predictions;
drop policy if exists "finalist: others after deadline"  on public.finalist_predictions;
drop policy if exists "finalist: insert before deadline" on public.finalist_predictions;
drop policy if exists "finalist: update before deadline" on public.finalist_predictions;

create policy "finalist: select own"
  on public.finalist_predictions for select
  to authenticated
  using (user_id = auth.uid());

create policy "finalist: others after deadline"
  on public.finalist_predictions for select
  to authenticated
  using (
    user_id != auth.uid() and
    now() >= (
      select (date_trunc('day', min(kickoff_utc) at time zone 'Asia/Kolkata')::timestamp
              - interval '3 hours') at time zone 'Asia/Kolkata'
      from public.matches
      where stage != 'group'
    )
  );

create policy "finalist: insert before deadline"
  on public.finalist_predictions for insert
  to authenticated
  with check (
    user_id = auth.uid() and
    now() < (
      select (date_trunc('day', min(kickoff_utc) at time zone 'Asia/Kolkata')::timestamp
              - interval '3 hours') at time zone 'Asia/Kolkata'
      from public.matches
      where stage != 'group'
    )
  );

create policy "finalist: update before deadline"
  on public.finalist_predictions for update
  to authenticated
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid() and
    now() < (
      select (date_trunc('day', min(kickoff_utc) at time zone 'Asia/Kolkata')::timestamp
              - interval '3 hours') at time zone 'Asia/Kolkata'
      from public.matches
      where stage != 'group'
    )
  );

commit;
