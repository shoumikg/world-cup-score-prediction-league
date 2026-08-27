// Pure auction rules — no DB access, fully unit-testable.
//
// Two captained teams (red & blue) bid on players from a fixed purse. There is
// no bid step — any integer raise of at least 1 wins the lead — and each bid
// (re)starts a 10-second clock after which the highest bid wins automatically.
// Each captain also has a 10-minute hold budget: an active hold freezes the
// clock while burning the holder's budget (released by toggle, their next bid,
// or exhaustion). The roster cap is derived from the player-list size (16
// players → 8 each), and a reserve rule stops a team bidding itself into being
// unable to fill its remaining slots at the minimum price.

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
  bid_placed_at: string | null
  hold_team: AuctionTeamId | null
  hold_started_at: string | null
  sold_at: string | null
  created_at: string
}

export type AuctionEventType =
  | 'on_block' | 'bid' | 'bid_set' | 'hold_start' | 'hold_end' | 'hold_exhausted'
  | 'sold' | 'unsold' | 'undo' | 'back_to_pool' | 'clear_bids'
  | 'clock_stopped' | 'clock_restarted'

export interface AuctionEvent {
  id: number
  created_at: string
  type: AuctionEventType
  player_name: string | null
  team: AuctionTeamId | null
  amount: number | null
}

export interface AuctionTeamRow {
  team: AuctionTeamId
  captain_user_id: string | null
  captain_name: string | null
  purse: number
  hold_used_ms: number
}

export const MIN_BID = 1
export const BID_INCREMENTS = [5, 10, 20] as const
export const BID_TIMEOUT_MS = 10_000
export const HOLD_BUDGET_MS = 10 * 60_000

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
 * the team must still afford MIN_BID for every remaining slot it has to fill.
 * A full team can't bid at all (returns 0 — every valid bid is > 0).
 */
export function maxBid(stats: TeamStats): number {
  if (stats.rosterCount >= stats.cap) return 0
  const slotsAfterThis = stats.cap - stats.rosterCount - 1
  return Math.max(0, stats.remaining - MIN_BID * slotsAfterThis)
}

/**
 * Milliseconds until the current bid wins; null when no clock is running.
 * While a hold is active the elapsed time freezes at the moment the hold
 * began (a bid placed during a hold starts fully frozen at 10s).
 */
export function bidRemainingMs(player: AuctionPlayer, nowMs: number): number | null {
  if (player.status !== 'on_block') return null
  if (player.current_bid === null || player.bid_placed_at === null) return null
  const placedMs = Date.parse(player.bid_placed_at)
  const elapsed = player.hold_started_at !== null
    ? Math.max(0, Date.parse(player.hold_started_at) - placedMs)
    : nowMs - placedMs
  return BID_TIMEOUT_MS - elapsed
}

/**
 * A team's unspent hold budget, net of the hold it is running right now.
 * Never negative — an over-running active hold reads as 0 (release due).
 */
export function holdRemainingMs(
  teamRow: AuctionTeamRow,
  onBlock: AuctionPlayer | null,
  nowMs: number
): number {
  const activeSpan =
    onBlock && onBlock.hold_team === teamRow.team && onBlock.hold_started_at !== null
      ? Math.max(0, nowMs - Date.parse(onBlock.hold_started_at))
      : 0
  return Math.max(0, HOLD_BUDGET_MS - teamRow.hold_used_ms - activeSpan)
}

/** True once the sold-timer on the current bid has run out. */
export function bidExpired(player: AuctionPlayer, nowMs: number): boolean {
  const remaining = bidRemainingMs(player, nowMs)
  return remaining !== null && remaining <= 0
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
  amount: number,
  nowMs: number = Date.now()
): { ok: true } | { error: string } {
  if (!Number.isInteger(amount) || amount <= 0 || amount > 1_000_000)
    return { error: 'Invalid bid amount.' }

  const player = players.find(p => p.id === playerId)
  if (!player || player.status !== 'on_block')
    return { error: 'That player is not on the block.' }

  if (bidExpired(player, nowMs))
    return { error: 'Time’s up — this sale is closing.' }

  if (player.current_bidder === teamRow.team)
    return { error: 'You are already the highest bidder.' }

  const minBid = player.current_bid === null ? MIN_BID : player.current_bid + 1
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

/**
 * Pool the next random player is drawn from: everyone still pending, falling
 * back to the unsold (skipped) players for a second round once the pending
 * list is empty.
 */
export function nextAuctionPool(players: AuctionPlayer[]): AuctionPlayer[] {
  const pending = players.filter(p => p.status === 'pending')
  if (pending.length > 0) return pending
  return players.filter(p => p.status === 'unsold')
}

export type AuctionPhase = 'not_ready' | 'ready' | 'live' | 'between' | 'complete'

export function auctionPhase(players: AuctionPlayer[]): AuctionPhase {
  if (players.length === 0) return 'not_ready'
  if (players.some(p => p.status === 'on_block')) return 'live'
  if (players.every(p => p.status === 'sold' || p.status === 'unsold')) return 'complete'
  if (players.some(p => p.status === 'sold' || p.status === 'unsold')) return 'between'
  return 'ready'
}

