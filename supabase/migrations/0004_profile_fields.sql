-- ============================================================
-- Profile fields for leaderboard display — run after 0003_feedback.sql
-- ============================================================

alter table public.profiles
  add column display_name text,
  add column favorite_team text;

-- Replace the trigger BEFORE adding NOT NULL so any signup that races
-- with this migration sets display_name correctly and doesn't violate
-- the constraint added below.
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, username, display_name)
  values (
    new.id,
    new.raw_user_meta_data ->> 'username',
    new.raw_user_meta_data ->> 'username'
  );
  return new;
end;
$$;

-- Backfill only rows that need it — idempotent, can never overwrite a
-- user-chosen display name if this migration is ever re-run
update public.profiles set display_name = username where display_name is null;

alter table public.profiles
  alter column display_name set not null;

alter table public.profiles
  add constraint display_name_length check (char_length(display_name) between 1 and 30);

-- favorite_team must be one of the 48 qualified teams (or null).
-- Keep in sync with lib/flags.ts — a unit test enforces this.
alter table public.profiles
  add constraint favorite_team_valid check (
    favorite_team is null or favorite_team in (
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

-- Users may update ONLY display_name and favorite_team on their own row.
-- Column-level grants prevent self-escalation via is_admin or username
-- changes; RLS restricts which row.
revoke update on table public.profiles from anon, authenticated;
grant update (display_name, favorite_team) on table public.profiles to authenticated;

create policy "profiles: update own"
  on public.profiles for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());
