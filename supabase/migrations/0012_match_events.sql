begin;

create table public.match_events (
  id          bigserial primary key,
  match_id    integer not null references public.matches(id) on delete cascade,
  minute      smallint,
  extra_time  smallint,
  type        text not null check (type in ('goal', 'own_goal', 'penalty')),
  team        text not null check (team in ('home', 'away')),
  player_name text not null,
  assist_name text
);

create index match_events_match_id_idx on public.match_events(match_id);

alter table public.match_events enable row level security;

drop policy if exists "match_events: authenticated read" on public.match_events;
create policy "match_events: authenticated read"
  on public.match_events for select
  using (true);

-- Writes go through the service-role client (sync/backfill), which bypasses RLS.
-- These policies protect against accidental RLS-unaware writes via the anon key.
drop policy if exists "match_events: admin insert" on public.match_events;
create policy "match_events: admin insert"
  on public.match_events for insert
  with check (public.is_admin());

drop policy if exists "match_events: admin delete" on public.match_events;
create policy "match_events: admin delete"
  on public.match_events for delete
  using (public.is_admin());

commit;
