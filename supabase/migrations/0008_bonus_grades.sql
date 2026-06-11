-- Manual admin grading of bonus question answers.
-- One row per graded (user, question); absence = ungraded = 0 points.
-- Points values live in code (lib/bonus.ts), never in the DB.
-- The composite FK to bonus_answers makes grading a non-answer impossible
-- at the DB level and transitively enforces question_id 1..3 + valid profile.

begin;

create table public.bonus_grades (
  user_id     uuid        not null,
  question_id smallint    not null,
  is_correct  boolean     not null,
  graded_at   timestamptz not null default now(),
  primary key (user_id, question_id),
  foreign key (user_id, question_id)
    references public.bonus_answers (user_id, question_id)
    on delete cascade
);

alter table public.bonus_grades enable row level security;

drop policy if exists "bonus_grades: authenticated read" on public.bonus_grades;
drop policy if exists "bonus_grades: admin insert"       on public.bonus_grades;
drop policy if exists "bonus_grades: admin update"       on public.bonus_grades;
drop policy if exists "bonus_grades: admin delete"       on public.bonus_grades;

create policy "bonus_grades: authenticated read"
  on public.bonus_grades for select
  to authenticated
  using (true);

create policy "bonus_grades: admin insert"
  on public.bonus_grades for insert
  to authenticated
  with check (public.is_admin());

create policy "bonus_grades: admin update"
  on public.bonus_grades for update
  to authenticated
  using  (public.is_admin())
  with check (public.is_admin());

create policy "bonus_grades: admin delete"
  on public.bonus_grades for delete
  to authenticated
  using (public.is_admin());

commit;
