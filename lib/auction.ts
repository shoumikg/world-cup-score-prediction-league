// Pure auction rules — no DB access, fully unit-testable.
//
// Two captained teams (red & blue) bid on players from a fixed purse. The
// roster cap is derived from the player-list size (16 players → 8 each), and a
// reserve rule stops a team bidding itself into being unable to fill its
// remaining slots at base price.

export type AuctionTeamId = 'red' | 'blue'
export type AuctionPlayerStatus = 'pending' | 'on_block' | 'sold' | 'unsold'

export interface AuctionPlayer {
  id: number
  name: string
  status: AuctionPlayerStatus
  team: AuctionTeamId | null
  price: number | null
  current_bid: number | null
  current_bidder: AuctionTeamId | null
  sold_at: string | null
  created_at: string
}

export interface AuctionTeamRow {
  team: AuctionTeamId
  captain_user_id: string | null
  captain_name: string | null
  purse: number
}

export const BASE_PRICE = 10
export const BID_INCREMENTS = [10, 20, 50] as const

export const TEAM_LABELS: Record<AuctionTeamId, string> = { red: 'Red', blue: 'Blue' }

/** Each team may buy at most half the player pool (ceil for odd pools). */
export function rosterCap(totalPlayers: number): number {
  return Math.ceil(totalPlayers / 2)
}

export interface TeamStats {
  team: AuctionTeamId
  purse: number
  spent: number
  remaining: number
  rosterCount: number
  cap: number
}

export function teamStats(
  players: AuctionPlayer[],
  teamRow: AuctionTeamRow
): TeamStats {
  const bought = players.filter(p => p.status === 'sold' && p.team === teamRow.team)
  const spent = bought.reduce((s, p) => s + (p.price ?? 0), 0)
  return {
    team: teamRow.team,
    purse: teamRow.purse,
    spent,
    remaining: teamRow.purse - spent,
    rosterCount: bought.length,
    cap: rosterCap(players.length),
  }
}

/**
 * The most a team may bid right now. Reserve rule: after winning this player
 * the team must still afford BASE_PRICE for every remaining slot it has to
 * fill. A full team can't bid at all (returns 0 — every valid bid is > 0).
 */
export function maxBid(stats: TeamStats): number {
  if (stats.rosterCount >= stats.cap) return 0
  const slotsAfterThis = stats.cap - stats.rosterCount - 1
  return Math.max(0, stats.remaining - BASE_PRICE * slotsAfterThis)
}

/**
 * Validates a captain's bid against the current auction state.
 * Amount semantics: the captain bids an absolute price (computed client-side
 * from the bid they saw + an increment); the caller separately guards against
 * stale state with an optimistic-locked DB update.
 */
export function validateBid(
  players: AuctionPlayer[],
  teamRow: AuctionTeamRow,
  playerId: number,
  amount: number
): { ok: true } | { error: string } {
  if (!Number.isInteger(amount) || amount <= 0 || amount > 1_000_000)
    return { error: 'Invalid bid amount.' }

  const player = players.find(p => p.id === playerId)
  if (!player || player.status !== 'on_block')
    return { error: 'That player is not on the block.' }

  if (player.current_bidder === teamRow.team)
    return { error: 'You are already the highest bidder.' }

  const minBid = player.current_bid === null ? BASE_PRICE : player.current_bid + 1
  if (amount < minBid)
    return { error: `Bid must be at least ${minBid}.` }

  const stats = teamStats(players, teamRow)
  const cap = maxBid(stats)
  if (stats.rosterCount >= stats.cap)
    return { error: 'Your team is full.' }
  if (amount > cap)
    return { error: `Your max bid is ${cap} (you must keep enough to fill your remaining slots).` }

  return { ok: true }
}

export type AuctionPhase = 'not_ready' | 'ready' | 'live' | 'between' | 'complete'

export function auctionPhase(players: AuctionPlayer[]): AuctionPhase {
  if (players.length === 0) return 'not_ready'
  if (players.some(p => p.status === 'on_block')) return 'live'
  if (players.every(p => p.status === 'sold' || p.status === 'unsold')) return 'complete'
  if (players.some(p => p.status === 'sold' || p.status === 'unsold')) return 'between'
  return 'ready'
}

/** Raise options for the bid buttons: current bid (or 0) + each increment. */
export function bidOptions(currentBid: number | null): number[] {
  const base = currentBid ?? 0
  return BID_INCREMENTS.map(inc => base + inc)
}
