-- Auction sold-timer: each bid (re)starts a 10-second clock; when it expires
-- the highest bid wins automatically. The timestamp is written server-side on
-- every bid, all clients render the countdown from it, and a guarded server
-- action finalises the sale once expired.

begin;

alter table public.auction_players
  add column bid_placed_at timestamptz;

commit;
