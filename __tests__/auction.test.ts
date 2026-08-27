import { describe, it, expect } from 'vitest'
import {
  rosterCap, teamStats, maxBid, validateBid, auctionPhase, bidRemainingMs, bidExpired,
  MIN_BID, BID_TIMEOUT_MS,
  type AuctionPlayer, type AuctionTeamRow, type AuctionPlayerStatus, type AuctionTeamId,
} from '../lib/auction'

let nextId = 1
function player(opts: {
  status?: AuctionPlayerStatus
  team?: AuctionTeamId
  price?: number
  bid?: number
  bidder?: AuctionTeamId
  placedAt?: string
} = {}): AuctionPlayer {
  return {
    id: nextId++,
    name: `Player ${nextId}`,
    status: opts.status ?? 'pending',
    team: opts.team ?? null,
    price: opts.price ?? null,
    current_bid: opts.bid ?? null,
    current_bidder: opts.bidder ?? null,
    bid_placed_at: opts.placedAt ?? (opts.bid !== undefined ? '2026-07-01T12:00:00Z' : null),
    sold_at: null,
    created_at: '2026-07-01T00:00:00Z',
  }
}

// A "now" safely inside the 10s window of the default placedAt above.
const NOW = Date.parse('2026-07-01T12:00:05Z')

function teamRow(team: AuctionTeamId, purse = 1000): AuctionTeamRow {
  return { team, captain_user_id: `${team}-captain`, captain_name: `${team} cap`, purse }
}

/** 16-player pool: n sold to red at `priceEach`, one on the block, rest pending. */
function pool(soldToRed = 0, priceEach = 100, blockOpts: Parameters<typeof player>[0] = {}): AuctionPlayer[] {
  const players: AuctionPlayer[] = []
  for (let i = 0; i < soldToRed; i++) players.push(player({ status: 'sold', team: 'red', price: priceEach }))
  players.push(player({ status: 'on_block', ...blockOpts }))
  while (players.length < 16) players.push(player())
  return players
}

describe('rosterCap', () => {
  it('halves the pool, ceiling for odd sizes', () => {
    expect(rosterCap(16)).toBe(8)
    expect(rosterCap(15)).toBe(8)
    expect(rosterCap(2)).toBe(1)
  })
})

describe('teamStats / maxBid', () => {
  it('derives spend and remaining purse from sold rows', () => {
    const players = pool(3, 100)
    const s = teamStats(players, teamRow('red'))
    expect(s).toMatchObject({ spent: 300, remaining: 700, rosterCount: 3, cap: 8 })
  })

  it('reserves the minimum bid for every remaining slot', () => {
    // 0 bought of 8 → after this win, 7 slots to fill → 1000 − 7×1 = 993
    expect(maxBid(teamStats(pool(0), teamRow('red')))).toBe(993)
    // 7 bought → this is the last slot → full remaining purse available
    expect(maxBid(teamStats(pool(7, 100), teamRow('red')))).toBe(300)
  })

  it('is 0 for a full team', () => {
    expect(maxBid(teamStats(pool(8, 100), teamRow('red')))).toBe(0)
  })
})

describe('validateBid', () => {
  const red = teamRow('red')
  const blue = teamRow('blue')
  const blockId = (players: AuctionPlayer[]) => players.find(p => p.status === 'on_block')!.id

  it('accepts an opening bid at the minimum (1)', () => {
    const players = pool()
    expect(validateBid(players, red, blockId(players), MIN_BID, NOW)).toEqual({ ok: true })
  })

  it('accepts any raise of at least 1 — no step', () => {
    const players = pool(0, 0, { bid: 50, bidder: 'blue' })
    expect(validateBid(players, red, blockId(players), 51, NOW)).toEqual({ ok: true })
  })

  it('rejects a non-raise', () => {
    const players = pool(0, 0, { bid: 50, bidder: 'blue' })
    expect(validateBid(players, red, blockId(players), 50, NOW)).toHaveProperty('error')
  })

  it('rejects a bid after the 10-second clock has run out', () => {
    const players = pool(0, 0, { bid: 50, bidder: 'blue' })
    const after = Date.parse('2026-07-01T12:00:00Z') + BID_TIMEOUT_MS + 1
    const r = validateBid(players, red, blockId(players), 60, after)
    expect('error' in r && r.error).toMatch(/time/i)
  })

  it('rejects outbidding yourself', () => {
    const players = pool(0, 0, { bid: 50, bidder: 'red' })
    const r = validateBid(players, red, blockId(players), 60, NOW)
    expect('error' in r && r.error).toMatch(/already the highest/i)
  })

  it('rejects a bid over the reserve-rule cap', () => {
    const players = pool() // max is 993
    const r = validateBid(players, red, blockId(players), 994, NOW)
    expect('error' in r && r.error).toMatch(/max bid is 993/i)
  })

  it('rejects bids from a full team', () => {
    const players = pool(8, 50)
    const r = validateBid(players, red, blockId(players), 20, NOW)
    expect('error' in r && r.error).toMatch(/full/i)
  })

  it('the other team is unaffected by red’s spending', () => {
    const players = pool(8, 50)
    expect(validateBid(players, blue, blockId(players), 20, NOW)).toEqual({ ok: true })
  })

  it('rejects bids on a player not on the block', () => {
    const players = pool()
    const pending = players.find(p => p.status === 'pending')!
    expect(validateBid(players, red, pending.id, 20, NOW)).toHaveProperty('error')
  })

  it('rejects garbage amounts', () => {
    const players = pool()
    for (const bad of [0, -5, 1.5, NaN, 2_000_000]) {
      expect(validateBid(players, red, blockId(players), bad, NOW)).toHaveProperty('error')
    }
  })
})

describe('sold-timer', () => {
  const placed = '2026-07-01T12:00:00Z'
  const at = (offsetMs: number) => Date.parse(placed) + offsetMs

  it('counts down from the bid timestamp', () => {
    const p = player({ status: 'on_block', bid: 50, bidder: 'red', placedAt: placed })
    expect(bidRemainingMs(p, at(4_000))).toBe(6_000)
    expect(bidExpired(p, at(4_000))).toBe(false)
    expect(bidExpired(p, at(BID_TIMEOUT_MS))).toBe(true)
  })

  it('has no clock without a bid or off the block', () => {
    expect(bidRemainingMs(player({ status: 'on_block' }), at(0))).toBeNull()
    expect(bidExpired(player({ status: 'on_block' }), at(99_000))).toBe(false)
    const sold = player({ status: 'sold', team: 'red', price: 50, bid: 50, bidder: 'red', placedAt: placed })
    expect(bidRemainingMs(sold, at(99_000))).toBeNull()
  })
})

describe('auctionPhase', () => {
  it('walks through the lifecycle', () => {
    expect(auctionPhase([])).toBe('not_ready')
    expect(auctionPhase([player(), player()])).toBe('ready')
    expect(auctionPhase([player({ status: 'on_block' }), player()])).toBe('live')
    expect(auctionPhase([player({ status: 'sold', team: 'red', price: 10 }), player()])).toBe('between')
    expect(auctionPhase([
      player({ status: 'sold', team: 'red', price: 10 }),
      player({ status: 'unsold' }),
    ])).toBe('complete')
  })
})

