import { describe, it, expect } from 'vitest'
import {
  rosterCap, teamStats, maxBid, validateBid, auctionPhase, bidOptions,
  BASE_PRICE,
  type AuctionPlayer, type AuctionTeamRow, type AuctionPlayerStatus, type AuctionTeamId,
} from '../lib/auction'

let nextId = 1
function player(opts: {
  status?: AuctionPlayerStatus
  team?: AuctionTeamId
  price?: number
  bid?: number
  bidder?: AuctionTeamId
} = {}): AuctionPlayer {
  return {
    id: nextId++,
    name: `Player ${nextId}`,
    status: opts.status ?? 'pending',
    team: opts.team ?? null,
    price: opts.price ?? null,
    current_bid: opts.bid ?? null,
    current_bidder: opts.bidder ?? null,
    sold_at: null,
    created_at: '2026-07-01T00:00:00Z',
  }
}

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

  it('reserves base price for every remaining slot', () => {
    // 0 bought of 8 → after this win, 7 slots to fill → 1000 − 7×10 = 930
    expect(maxBid(teamStats(pool(0), teamRow('red')))).toBe(930)
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

  it('accepts an opening bid at base price', () => {
    const players = pool()
    expect(validateBid(players, red, blockId(players), BASE_PRICE)).toEqual({ ok: true })
  })

  it('rejects an opening bid below base price', () => {
    const players = pool()
    expect(validateBid(players, red, blockId(players), BASE_PRICE - 1)).toHaveProperty('error')
  })

  it('accepts a raise over the other team and rejects a non-raise', () => {
    const players = pool(0, 0, { bid: 50, bidder: 'blue' })
    expect(validateBid(players, red, blockId(players), 60)).toEqual({ ok: true })
    expect(validateBid(players, red, blockId(players), 50)).toHaveProperty('error')
  })

  it('rejects outbidding yourself', () => {
    const players = pool(0, 0, { bid: 50, bidder: 'red' })
    const r = validateBid(players, red, blockId(players), 60)
    expect('error' in r && r.error).toMatch(/already the highest/i)
  })

  it('rejects a bid over the reserve-rule cap', () => {
    const players = pool() // max is 930
    const r = validateBid(players, red, blockId(players), 940)
    expect('error' in r && r.error).toMatch(/max bid is 930/i)
  })

  it('rejects bids from a full team', () => {
    const players = pool(8, 50)
    const r = validateBid(players, red, blockId(players), 20)
    expect('error' in r && r.error).toMatch(/full/i)
  })

  it('the other team is unaffected by red’s spending', () => {
    const players = pool(8, 50)
    expect(validateBid(players, blue, blockId(players), 20)).toEqual({ ok: true })
  })

  it('rejects bids on a player not on the block', () => {
    const players = pool()
    const pending = players.find(p => p.status === 'pending')!
    expect(validateBid(players, red, pending.id, 20)).toHaveProperty('error')
  })

  it('rejects garbage amounts', () => {
    const players = pool()
    for (const bad of [0, -5, 1.5, NaN, 2_000_000]) {
      expect(validateBid(players, red, blockId(players), bad)).toHaveProperty('error')
    }
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

describe('bidOptions', () => {
  it('offers base-price opening bids when there are none', () => {
    expect(bidOptions(null)).toEqual([10, 20, 50])
  })
  it('offers raises over the current bid', () => {
    expect(bidOptions(100)).toEqual([110, 120, 150])
  })
})
