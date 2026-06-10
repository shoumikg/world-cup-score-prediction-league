-- ============================================================
-- Feedback table — run after 0002_seed_matches.sql
-- ============================================================

create table public.feedback (
  id          bigint generated always as identity primary key,
  username    text not null default 'guest',
  message     text not null check (char_length(message) between 1 and 1000),
  created_at  timestamptz not null default now()
);
alter table public.feedback enable row level security;

-- Anyone may submit, including users who haven't logged in yet
create policy "feedback: anyone can insert"
  on public.feedback for insert
  to anon, authenticated
  with check (char_length(message) between 1 and 1000);

-- Only admins can read (the app reads it nowhere yet; use the dashboard)
create policy "feedback: admin read"
  on public.feedback for select
  to authenticated
  using (public.is_admin());
