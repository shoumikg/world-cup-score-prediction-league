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

-- Backfill existing rows, then lock the column down
update public.profiles set display_name = username;

alter table public.profiles
  alter column display_name set not null;

alter table public.profiles
  add constraint display_name_length check (char_length(display_name) between 1 and 30);

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
