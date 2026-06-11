-- Group stage bonus question answers.
-- Three fixed questions; deadline is 9 PM IST the night before the first
-- group stage match — same formula used for match prediction deadlines.

begin;

create table public.bonus_answers (
  user_id     uuid     not null references public.profiles(id) on delete cascade,
  question_id smallint not null check (question_id between 1 and 3),
  answer_text text,            -- player name for Q1; must be NULL for Q2/Q3
  answer_team text not null,   -- country (Q1) or team (Q2/Q3)
  updated_at  timestamptz not null default now(),
  primary key (user_id, question_id)
);

alter table public.bonus_answers enable row level security;

-- Q1 requires a player name (1–100 chars); Q2/Q3 must not have one
alter table public.bonus_answers
  add constraint bonus_answer_shape check (
    (question_id = 1
     and answer_text is not null
     and char_length(trim(answer_text)) between 1 and 100)
    or
    (question_id in (2, 3) and answer_text is null)
  );

-- answer_team must be one of the 48 qualified teams.
-- Keep in sync with lib/flags.ts — the unit test in __tests__/flags.test.ts enforces this.
alter table public.bonus_answers
  add constraint bonus_answer_team_valid check (
    answer_team in (
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

-- Deadline subquery: 9 PM IST the night before the first group stage match.
-- Same formula as 0005_deadline_policy.sql and 0006_deadline_visibility.sql.

drop policy if exists "bonus_answers: select own"            on public.bonus_answers;
drop policy if exists "bonus_answers: others after deadline" on public.bonus_answers;
drop policy if exists "bonus_answers: insert before deadline" on public.bonus_answers;
drop policy if exists "bonus_answers: update before deadline" on public.bonus_answers;

create policy "bonus_answers: select own"
  on public.bonus_answers for select
  to authenticated
  using (user_id = auth.uid());

create policy "bonus_answers: others after deadline"
  on public.bonus_answers for select
  to authenticated
  using (
    user_id != auth.uid() and
    now() >= (
      select (date_trunc('day', min(kickoff_utc) at time zone 'Asia/Kolkata')::timestamp
              - interval '3 hours') at time zone 'Asia/Kolkata'
      from public.matches
      where stage = 'group'
    )
  );

create policy "bonus_answers: insert before deadline"
  on public.bonus_answers for insert
  to authenticated
  with check (
    user_id = auth.uid() and
    now() < (
      select (date_trunc('day', min(kickoff_utc) at time zone 'Asia/Kolkata')::timestamp
              - interval '3 hours') at time zone 'Asia/Kolkata'
      from public.matches
      where stage = 'group'
    )
  );

create policy "bonus_answers: update before deadline"
  on public.bonus_answers for update
  to authenticated
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid() and
    now() < (
      select (date_trunc('day', min(kickoff_utc) at time zone 'Asia/Kolkata')::timestamp
              - interval '3 hours') at time zone 'Asia/Kolkata'
      from public.matches
      where stage = 'group'
    )
  );

commit;
