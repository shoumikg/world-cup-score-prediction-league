begin;

-- Single-row table that tracks when the live-score sync last ran.
-- Only the service-role key writes here (bypasses RLS). Admins can read it.
create table public.sync_state (
  id             bool primary key default true,
  last_synced_at timestamptz not null default '1970-01-01T00:00:00Z',
  constraint sync_state_single_row check (id = true)
);

alter table public.sync_state enable row level security;

insert into public.sync_state (id) values (true);

drop policy if exists "sync_state: admin read" on public.sync_state;
create policy "sync_state: admin read"
  on public.sync_state for select
  using (public.is_admin());

commit;
