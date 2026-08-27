-- Auction live feed: a log of everything that happens (draws, bids, holds,
-- sales, auctioneer overrides) so spectators can follow the story. Written by
-- the server actions (service role) as each state change lands; publicly
-- readable like the rest of the auction.

begin;

create table public.auction_events (
  id          bigserial primary key,
  created_at  timestamptz not null default now(),
  type        text not null check (type in (
    'on_block','bid','bid_set','hold_start','hold_end','hold_exhausted',
    'sold','unsold','undo','back_to_pool','clear_bids','clock_stopped','clock_restarted'
  )),
  player_name text,
  team        text check (team in ('red','blue')),
  amount      int check (amount >= 0)
);

create index auction_events_id_desc on public.auction_events (id desc);

alter table public.auction_events enable row level security;

create policy "auction_events: public read"
  on public.auction_events for select
  to anon, authenticated
  using (true);

commit;
