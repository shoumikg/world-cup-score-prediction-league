-- ============================================================
-- FIFA World Cup 2026 Prediction League — schema
-- Paste this into Supabase SQL Editor FIRST, before 0002_seed_matches.sql
-- ============================================================

-- ── Profiles ─────────────────────────────────────────────────
create table public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  username    text not null unique
                check (username ~ '^[a-z0-9_]{3,20}$'),
  is_admin    boolean not null default false,
  created_at  timestamptz not null default now()
);
alter table public.profiles enable row level security;

-- ── Matches ──────────────────────────────────────────────────
create table public.matches (
  id           int primary key,  -- FIFA official match number 1..104
  stage        text not null
                 check (stage in ('group','r32','r16','qf','sf','third','final')),
  group_name   text,             -- 'A'..'L' for group matches, null otherwise
  kickoff_utc  timestamptz not null,
  home_team    text,             -- null until known (knockouts)
  away_team    text,
  home_source  text,             -- bracket label e.g. '1A', 'Winner M37'
  away_source  text,
  venue        text,
  home_score   int check (home_score between 0 and 99),
  away_score   int check (away_score between 0 and 99),
  check ((home_score is null) = (away_score is null))
);
create index matches_kickoff_idx on public.matches (kickoff_utc);
alter table public.matches enable row level security;

-- ── Predictions ──────────────────────────────────────────────
create table public.predictions (
  user_id     uuid not null references public.profiles(id) on delete cascade,
  match_id    int  not null references public.matches(id),
  home_pred   int  not null check (home_pred between 0 and 99),
  away_pred   int  not null check (away_pred between 0 and 99),
  updated_at  timestamptz not null default now(),
  primary key (user_id, match_id)
);
create index predictions_match_idx on public.predictions (match_id);
alter table public.predictions enable row level security;

-- ── Admin helper (security definer avoids RLS recursion) ─────
create or replace function public.is_admin()
returns boolean
language sql security definer stable
set search_path = public
as $$
  select coalesce(
    (select is_admin from public.profiles where id = auth.uid()),
    false
  )
$$;

-- ── Profile auto-creation trigger ────────────────────────────
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, username)
  values (
    new.id,
    new.raw_user_meta_data ->> 'username'
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ── RLS policies ─────────────────────────────────────────────

-- profiles: any authed user can read; only trigger can write
create policy "profiles: authenticated read"
  on public.profiles for select
  to authenticated
  using (true);

-- matches: any authed user can read; admin can update (results, knockout teams, kickoff fix)
create policy "matches: authenticated read"
  on public.matches for select
  to authenticated
  using (true);

create policy "matches: admin update"
  on public.matches for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- predictions: own rows always visible; others' rows only after kickoff (free compare UX)
create policy "predictions: own rows"
  on public.predictions for select
  to authenticated
  using (user_id = auth.uid());

create policy "predictions: others after kickoff"
  on public.predictions for select
  to authenticated
  using (
    user_id != auth.uid() and
    exists (
      select 1 from public.matches m
      where m.id = match_id and m.kickoff_utc <= now()
    )
  );

-- insert: own user_id, match not yet kicked off
create policy "predictions: insert before kickoff"
  on public.predictions for insert
  to authenticated
  with check (
    user_id = auth.uid() and
    exists (
      select 1 from public.matches m
      where m.id = match_id and m.kickoff_utc > now()
    )
  );

-- update: own user_id, match not yet kicked off
create policy "predictions: update before kickoff"
  on public.predictions for update
  to authenticated
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid() and
    exists (
      select 1 from public.matches m
      where m.id = match_id and m.kickoff_utc > now()
    )
  );
