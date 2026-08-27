-- Reunion football auction: players are auctioned to two captained teams
-- (red & blue) bidding from fixed purses, publicly watchable at /auction
-- without logging in.
--
-- All writes happen through server actions using the service role (admin =
-- auctioneer setup/hammer, captains = bids), so RLS grants SELECT only — to
-- everyone, including anonymous spectators. There are deliberately no
-- insert/update/delete policies.

begin;

create table public.auction_players (
  id             serial primary key,
  name           text not null check (char_length(trim(name)) between 1 and 60),
  status         text not null default 'pending'
                   check (status in ('pending','on_block','sold','unsold')),
  team           text check (team in ('red','blue')),  -- winning team when sold
  price          int  check (price >= 0),              -- winning price when sold
  current_bid    int  check (current_bid >= 0),        -- live bid while on the block
  current_bidder text check (current_bidder in ('red','blue')),
  sold_at        timestamptz,                          -- when the hammer fell
  created_at     timestamptz not null default now(),
  check (status != 'sold' or (team is not null and price is not null))
);

-- At most one player on the block at any moment.
create unique index auction_players_one_on_block
  on public.auction_players ((true)) where status = 'on_block';

create table public.auction_teams (
  team            text primary key check (team in ('red','blue')),
  captain_user_id uuid references public.profiles(id) on delete set null,
  captain_name    text,  -- denormalised so the public page never reads profiles
  purse           int not null default 1000 check (purse >= 0)
);

insert into public.auction_teams (team) values ('red'), ('blue');

alter table public.auction_players enable row level security;
alter table public.auction_teams   enable row level security;

create policy "auction_players: public read"
  on public.auction_players for select
  to anon, authenticated
  using (true);

create policy "auction_teams: public read"
  on public.auction_teams for select
  to anon, authenticated
  using (true);

commit;
