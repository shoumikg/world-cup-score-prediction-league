-- Captain hold time: each captain has a 10-minute budget of "thinking time"
-- for the whole auction. An active hold freezes the 10-second sold-clock and
-- burns the holder's budget until released (button toggle, their next bid, or
-- budget exhaustion).
--
-- The active hold lives on the on-block player row — one row, so at most one
-- hold can be active at a time. The budget spent lives on the team row.

begin;

alter table public.auction_teams
  add column hold_used_ms int not null default 0 check (hold_used_ms >= 0);

alter table public.auction_players
  add column hold_team text check (hold_team in ('red','blue')),
  add column hold_started_at timestamptz,
  add constraint auction_players_hold_pairing
    check ((hold_team is null) = (hold_started_at is null));

commit;
