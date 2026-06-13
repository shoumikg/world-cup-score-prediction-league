begin;

create table public.whats_new_reads (
  user_id    uuid        primary key references auth.users(id) on delete cascade,
  seen_id    smallint    not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.whats_new_reads enable row level security;

drop policy if exists "whats_new_reads: select own" on public.whats_new_reads;
drop policy if exists "whats_new_reads: insert own" on public.whats_new_reads;
drop policy if exists "whats_new_reads: update own" on public.whats_new_reads;

create policy "whats_new_reads: select own"
  on public.whats_new_reads for select
  to authenticated
  using (user_id = auth.uid());

create policy "whats_new_reads: insert own"
  on public.whats_new_reads for insert
  to authenticated
  with check (user_id = auth.uid());

create policy "whats_new_reads: update own"
  on public.whats_new_reads for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

commit;
