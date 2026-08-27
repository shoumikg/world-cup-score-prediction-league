'use server'

import { createClient } from '@/lib/supabase/server'
import { getAdminClient } from '@/lib/supabase/admin'
import {
  validateBid, bidExpired, holdRemainingMs, nextAuctionPool, teamStats, maxBid,
  HOLD_BUDGET_MS, TEAM_LABELS,
  type AuctionPlayer, type AuctionTeamRow, type AuctionTeamId,
} from '@/lib/auction'

// All auction writes go through these actions with the service-role client —
// RLS grants the public SELECT only. Admin actions require is_admin; placeBid
// requires being one of the two captains.

const TEAM_IDS = ['red', 'blue'] as const

function isTeamId(v: unknown): v is AuctionTeamId {
  return v === 'red' || v === 'blue'
}

// Surface the underlying Supabase error — generic messages made real setup
// problems (wrong service key, stale schema cache) undiagnosable from the UI.
function dbError(prefix: string, error: { code?: string; message?: string }): { error: string } {
  if (error.code === 'PGRST205' || error.code === 'PGRST002')
    return { error: `${prefix}: Supabase hasn't picked up the auction tables yet — run NOTIFY pgrst, 'reload schema'; in the SQL editor.` }
  if (error.code === '42501')
    return { error: `${prefix}: blocked by row-level security — SUPABASE_SERVICE_ROLE_KEY is not the service_role key.` }
  return { error: `${prefix}: ${error.message || 'unknown error'}` }
}

async function requireAdmin(): Promise<{ error: string } | { ok: true }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not logged in.' }
  const { data: profile } = await supabase
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .single()
  if (!profile?.is_admin) return { error: 'Unauthorized.' }
  return { ok: true }
}

// ── Setup (admin) ─────────────────────────────────────────────

export async function addAuctionPlayer(rawName: string): Promise<{ error?: string }> {
  const auth = await requireAdmin()
  if ('error' in auth) return auth

  const name = (rawName ?? '').trim()
  if (name.length < 1 || name.length > 60) return { error: 'Name must be 1–60 characters.' }

  const db = getAdminClient()
  const { data: existing } = await db.from('auction_players').select('id, name')
  if ((existing ?? []).some(p => p.name.toLowerCase() === name.toLowerCase()))
    return { error: 'That player is already on the list.' }

  const { error } = await db.from('auction_players').insert({ name })
  if (error) return dbError('Failed to add player', error)
  return {}
}

export async function deleteAuctionPlayer(playerId: number): Promise<{ error?: string }> {
  const auth = await requireAdmin()
  if ('error' in auth) return auth
  if (!Number.isInteger(playerId)) return { error: 'Invalid player.' }

  const db = getAdminClient()
  const { data, error } = await db
    .from('auction_players')
    .delete()
    .eq('id', playerId)
    .eq('status', 'pending')  // only removable before being auctioned
    .select('id')
  if (error) return dbError('Failed to remove player', error)
  if (!data?.length) return { error: 'Only players still pending can be removed.' }
  return {}
}

export async function setAuctionCaptain(team: string, userId: string): Promise<{ error?: string }> {
  const auth = await requireAdmin()
  if ('error' in auth) return auth
  if (!isTeamId(team)) return { error: 'Invalid team.' }
  if (typeof userId !== 'string' || !userId) return { error: 'Invalid user.' }

  const db = getAdminClient()
  const { data: profile } = await db
    .from('profiles')
    .select('id, display_name')
    .eq('id', userId)
    .single()
  if (!profile) return { error: 'User not found.' }

  const other = TEAM_IDS.find(t => t !== team)!
  const { data: otherRow } = await db
    .from('auction_teams')
    .select('captain_user_id')
    .eq('team', other)
    .single()
  if (otherRow?.captain_user_id === userId)
    return { error: 'That user already captains the other team.' }

  const { error } = await db
    .from('auction_teams')
    .update({ captain_user_id: userId, captain_name: profile.display_name })
    .eq('team', team)
  if (error) return dbError('Failed to set captain', error)
  return {}
}

export async function setAuctionPurse(amount: number): Promise<{ error?: string }> {
  const auth = await requireAdmin()
  if ('error' in auth) return auth
  if (!Number.isInteger(amount) || amount < 0 || amount > 1_000_000)
    return { error: 'Enter a valid purse.' }

  const db = getAdminClient()
  const { error } = await db.from('auction_teams').update({ purse: amount }).in('team', [...TEAM_IDS])
  if (error) return dbError('Failed to set purse', error)
  return {}
}

export async function resetAuction(): Promise<{ error?: string }> {
  const auth = await requireAdmin()
  if ('error' in auth) return auth

  const db = getAdminClient()
  const { error } = await db
    .from('auction_players')
    .update({ status: 'pending', team: null, price: null, current_bid: null, current_bidder: null, bid_placed_at: null, hold_team: null, hold_started_at: null, sold_at: null })
    .gte('id', 0)
  if (error) return dbError('Failed to reset auction', error)
  const { error: holdErr } = await db
    .from('auction_teams')
    .update({ hold_used_ms: 0 })
    .in('team', [...TEAM_IDS])
  if (holdErr) return dbError('Failed to reset hold budgets', holdErr)
  return {}
}

// ── Auctioneer flow (admin) ───────────────────────────────────

// Draws a random player from the remaining pool (pending first, then unsold
// for a second round) and puts them on the block with no clock running — the
// first bid starts the 10-second timer.
export async function putRandomOnBlock(): Promise<{ error?: string }> {
  const auth = await requireAdmin()
  if ('error' in auth) return auth

  const db = getAdminClient()
  const { data: playersRaw, error: readErr } = await db.from('auction_players').select('*')
  if (readErr) return dbError('Failed to load players', readErr)
  const pool = nextAuctionPool((playersRaw ?? []) as AuctionPlayer[])
  if (pool.length === 0) return { error: 'No players left to auction.' }

  const pick = pool[Math.floor(Math.random() * pool.length)]
  const { data, error } = await db
    .from('auction_players')
    .update({ status: 'on_block', current_bid: null, current_bidder: null, bid_placed_at: null, hold_team: null, hold_started_at: null })
    .eq('id', pick.id)
    .in('status', ['pending', 'unsold'])
    .select('id')
  if (error) {
    // Unique partial index: only one player on the block at a time.
    if (error.code === '23505') return { error: 'Another player is already on the block.' }
    return dbError('Failed to put player on the block', error)
  }
  if (!data?.length) return { error: 'The pool just changed — try again.' }
  return {}
}

// Manual override: put a specific player on the block (the 🎲 draw is the
// normal path; this covers corrections and special moments).
export async function putSpecificOnBlock(playerId: number): Promise<{ error?: string }> {
  const auth = await requireAdmin()
  if ('error' in auth) return auth
  if (!Number.isInteger(playerId)) return { error: 'Invalid player.' }

  const db = getAdminClient()
  const { data, error } = await db
    .from('auction_players')
    .update({ status: 'on_block', current_bid: null, current_bidder: null, bid_placed_at: null, hold_team: null, hold_started_at: null })
    .eq('id', playerId)
    .in('status', ['pending', 'unsold'])
    .select('id')
  if (error) {
    if (error.code === '23505') return { error: 'Another player is already on the block.' }
    return dbError('Failed to put player on the block', error)
  }
  if (!data?.length) return { error: 'That player cannot go on the block.' }
  return {}
}

// Manual override: send the on-block player back to the pending pool (unlike
// "Unsold", they rejoin the first-round draw), clearing bids and any hold.
export async function returnToPool(playerId: number): Promise<{ error?: string }> {
  const auth = await requireAdmin()
  if ('error' in auth) return auth
  if (!Number.isInteger(playerId)) return { error: 'Invalid player.' }

  const db = getAdminClient()
  const { data, error } = await db
    .from('auction_players')
    .update({ status: 'pending', current_bid: null, current_bidder: null, bid_placed_at: null, hold_team: null, hold_started_at: null })
    .eq('id', playerId)
    .eq('status', 'on_block')
    .select('id')
  if (error) return dbError('Failed to return player to the pool', error)
  if (!data?.length) return { error: 'That player is not on the block.' }
  return {}
}

// Loads the on-block player and, if a hold is running, ends it fairly
// (charging actual usage) so a clock override never strands hold state.
async function loadBlockReleasingHold(
  db: ReturnType<typeof getAdminClient>,
  playerId: number
): Promise<{ error: string } | { player: AuctionPlayer }> {
  const [{ data: playerRaw }, { data: teamsRaw }] = await Promise.all([
    db.from('auction_players').select('*').eq('id', playerId).single(),
    db.from('auction_teams').select('*'),
  ])
  const player = playerRaw as AuctionPlayer | null
  if (!player || player.status !== 'on_block') return { error: 'That player is not on the block.' }

  if (player.hold_team !== null) {
    const teamRow = ((teamsRaw ?? []) as AuctionTeamRow[]).find(t => t.team === player.hold_team)
    if (teamRow) {
      const res = await endHold(db, player, teamRow, Date.now())
      if (res.error) return { error: res.error }
      player.hold_team = null
      player.hold_started_at = null
    }
  }
  return { player }
}

// Manual override: stop the sold-clock entirely (no captain budget involved).
// The current bid stands; any new bid — or Restart clock — starts a fresh 10s.
export async function stopClock(playerId: number): Promise<{ error?: string }> {
  const auth = await requireAdmin()
  if ('error' in auth) return auth
  if (!Number.isInteger(playerId)) return { error: 'Invalid player.' }

  const db = getAdminClient()
  const loaded = await loadBlockReleasingHold(db, playerId)
  if ('error' in loaded) return { error: loaded.error }
  if (loaded.player.current_bid === null) return { error: 'No clock running — there are no bids yet.' }

  const { error } = await db
    .from('auction_players')
    .update({ bid_placed_at: null })
    .eq('id', playerId)
    .eq('status', 'on_block')
  if (error) return dbError('Failed to stop the clock', error)
  return {}
}

// Manual override: (re)start a fresh 10-second clock on the standing bid.
export async function restartClock(playerId: number): Promise<{ error?: string }> {
  const auth = await requireAdmin()
  if ('error' in auth) return auth
  if (!Number.isInteger(playerId)) return { error: 'Invalid player.' }

  const db = getAdminClient()
  const loaded = await loadBlockReleasingHold(db, playerId)
  if ('error' in loaded) return { error: loaded.error }
  if (loaded.player.current_bid === null) return { error: 'There are no bids to run a clock on.' }

  const { error } = await db
    .from('auction_players')
    .update({ bid_placed_at: new Date().toISOString() })
    .eq('id', playerId)
    .eq('status', 'on_block')
  if (error) return dbError('Failed to restart the clock', error)
  return {}
}

// Manual override: set the current bid outright (fix a fat-fingered amount or
// wrong team). Validated against the team's reserve-rule cap so the override
// can never create an unpayable price; restarts a fresh 10-second clock.
export async function adminSetBid(
  playerId: number,
  team: string,
  amount: number
): Promise<{ error?: string }> {
  const auth = await requireAdmin()
  if ('error' in auth) return auth
  if (!Number.isInteger(playerId)) return { error: 'Invalid player.' }
  if (!isTeamId(team)) return { error: 'Invalid team.' }
  if (!Number.isInteger(amount) || amount < 1 || amount > 1_000_000)
    return { error: 'Enter a valid amount.' }

  const db = getAdminClient()
  const [{ data: teamsRaw }, { data: playersRaw }] = await Promise.all([
    db.from('auction_teams').select('*'),
    db.from('auction_players').select('*'),
  ])
  const teams = (teamsRaw ?? []) as AuctionTeamRow[]
  const players = (playersRaw ?? []) as AuctionPlayer[]
  const player = players.find(p => p.id === playerId)
  const teamRow = teams.find(t => t.team === team)
  if (!player || player.status !== 'on_block') return { error: 'That player is not on the block.' }
  if (!teamRow) return { error: 'Team not found.' }

  const stats = teamStats(players, teamRow)
  const cap = maxBid(stats)
  if (cap < 1) return { error: `${TEAM_LABELS[team]} cannot buy this player (squad full or purse spent).` }
  if (amount > cap) return { error: `${TEAM_LABELS[team]}’s max is ${cap} (purse reserve rule).` }

  if (player.hold_team !== null) {
    const holdRow = teams.find(t => t.team === player.hold_team)
    if (holdRow) {
      const res = await endHold(db, player, holdRow, Date.now())
      if (res.error) return { error: res.error }
    }
  }

  const { data, error } = await db
    .from('auction_players')
    .update({
      current_bid: amount,
      current_bidder: team,
      bid_placed_at: new Date().toISOString(),
      hold_team: null,
      hold_started_at: null,
    })
    .eq('id', playerId)
    .eq('status', 'on_block')
    .select('id')
  if (error) return dbError('Failed to set the bid', error)
  if (!data?.length) return { error: 'The state just changed — try again.' }
  return {}
}

// Manual override: end whichever hold is active right now (charged for the
// time actually used, clamped at the holder's budget).
export async function forceReleaseHold(playerId: number): Promise<{ error?: string }> {
  const auth = await requireAdmin()
  if ('error' in auth) return auth
  if (!Number.isInteger(playerId)) return { error: 'Invalid player.' }

  const db = getAdminClient()
  const [{ data: playerRaw }, { data: teamsRaw }] = await Promise.all([
    db.from('auction_players').select('*').eq('id', playerId).single(),
    db.from('auction_teams').select('*'),
  ])
  const player = playerRaw as AuctionPlayer | null
  if (!player || player.status !== 'on_block' || player.hold_team === null)
    return { error: 'No hold is active.' }
  const teamRow = ((teamsRaw ?? []) as AuctionTeamRow[]).find(t => t.team === player.hold_team)
  if (!teamRow) return { error: 'Team not found.' }

  const res = await endHold(db, player, teamRow, Date.now())
  if (res.error) return { error: res.error }
  return {}
}

// Manual override: set how much hold time a team has left (0 up to the full
// 10-minute budget) — for restoring time after a dispute or granting a redo.
export async function setHoldRemaining(team: string, secondsLeft: number): Promise<{ error?: string }> {
  const auth = await requireAdmin()
  if ('error' in auth) return auth
  if (!isTeamId(team)) return { error: 'Invalid team.' }
  if (!Number.isInteger(secondsLeft) || secondsLeft < 0 || secondsLeft * 1000 > HOLD_BUDGET_MS)
    return { error: `Enter 0–${HOLD_BUDGET_MS / 60_000} minutes (in seconds).` }

  const db = getAdminClient()
  const { error } = await db
    .from('auction_teams')
    .update({ hold_used_ms: HOLD_BUDGET_MS - secondsLeft * 1000 })
    .eq('team', team)
  if (error) return dbError('Failed to set hold time', error)
  return {}
}

// Hammer: optimistic-locked on the exact bid the admin saw, so a bid landing
// at the same moment makes the hammer miss (0 rows) instead of selling at a
// stale price.
export async function hammerSold(
  playerId: number,
  seenBid: number,
  seenBidder: string
): Promise<{ error?: string }> {
  const auth = await requireAdmin()
  if ('error' in auth) return auth
  if (!Number.isInteger(playerId) || !Number.isInteger(seenBid) || !isTeamId(seenBidder))
    return { error: 'Invalid sale.' }

  const db = getAdminClient()
  const { data, error } = await db
    .from('auction_players')
    .update({ status: 'sold', team: seenBidder, price: seenBid, sold_at: new Date().toISOString(), hold_team: null, hold_started_at: null })
    .eq('id', playerId)
    .eq('status', 'on_block')
    .eq('current_bid', seenBid)
    .eq('current_bidder', seenBidder)
    .select('id')
  if (error) return dbError('Failed to record the sale', error)
  if (!data?.length) return { error: 'The bid changed just now — check the price and hammer again.' }
  return {}
}

export async function markUnsold(playerId: number): Promise<{ error?: string }> {
  const auth = await requireAdmin()
  if ('error' in auth) return auth
  if (!Number.isInteger(playerId)) return { error: 'Invalid player.' }

  const db = getAdminClient()
  const { data, error } = await db
    .from('auction_players')
    .update({ status: 'unsold', current_bid: null, current_bidder: null, bid_placed_at: null, hold_team: null, hold_started_at: null })
    .eq('id', playerId)
    .eq('status', 'on_block')
    .select('id')
  if (error) return dbError('Failed to mark unsold', error)
  if (!data?.length) return { error: 'That player is not on the block.' }
  return {}
}

export async function clearAuctionBids(playerId: number): Promise<{ error?: string }> {
  const auth = await requireAdmin()
  if ('error' in auth) return auth
  if (!Number.isInteger(playerId)) return { error: 'Invalid player.' }

  const db = getAdminClient()
  const { data, error } = await db
    .from('auction_players')
    .update({ current_bid: null, current_bidder: null, bid_placed_at: null, hold_team: null, hold_started_at: null })
    .eq('id', playerId)
    .eq('status', 'on_block')
    .select('id')
  if (error) return dbError('Failed to clear bids', error)
  if (!data?.length) return { error: 'That player is not on the block.' }
  return {}
}

// Puts a mistakenly-sold player back on the block with the winning bid still
// standing (their price returns to the buying team automatically — purses are
// derived from sold rows, never stored).
export async function undoSold(playerId: number): Promise<{ error?: string }> {
  const auth = await requireAdmin()
  if ('error' in auth) return auth
  if (!Number.isInteger(playerId)) return { error: 'Invalid player.' }

  const db = getAdminClient()
  const { data, error } = await db
    .from('auction_players')
    .update({ status: 'on_block', team: null, price: null, sold_at: null, bid_placed_at: null, hold_team: null, hold_started_at: null })
    .eq('id', playerId)
    .eq('status', 'sold')
    .select('id')
  if (error) {
    if (error.code === '23505') return { error: 'Another player is on the block — finish them first.' }
    return dbError('Failed to undo the sale', error)
  }
  if (!data?.length) return { error: 'That player is not sold.' }
  return {}
}

// ── Bidding (captains) ────────────────────────────────────────

export async function placeBid(playerId: number, amount: number): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not logged in.' }

  const db = getAdminClient()
  const [{ data: teamsRaw }, { data: playersRaw }] = await Promise.all([
    db.from('auction_teams').select('*'),
    db.from('auction_players').select('*'),
  ])
  const teams = (teamsRaw ?? []) as AuctionTeamRow[]
  const players = (playersRaw ?? []) as AuctionPlayer[]

  const myTeam = teams.find(t => t.captain_user_id === user.id)
  if (!myTeam) return { error: 'Only the two captains can bid.' }

  const result = validateBid(players, myTeam, playerId, amount, Date.now())
  if ('error' in result) return result

  // Optimistic lock: the bid only lands if the price the captain saw is still
  // the current price. Simultaneous bids resolve to exactly one winner. A bid
  // also releases the captain's own hold (an opponent's hold stays active and
  // keeps the fresh clock frozen).
  const player = players.find(p => p.id === playerId)!
  const releasesOwnHold = player.hold_team === myTeam.team && player.hold_started_at !== null
  const update: Record<string, number | string | null> = {
    current_bid: amount,
    current_bidder: myTeam.team,
    bid_placed_at: new Date().toISOString(),
  }
  if (releasesOwnHold) {
    update.hold_team = null
    update.hold_started_at = null
  }
  let query = db
    .from('auction_players')
    .update(update)
    .eq('id', playerId)
    .eq('status', 'on_block')
  query = player.current_bid === null
    ? query.is('current_bid', null)
    : query.eq('current_bid', player.current_bid)
  // When clearing a hold, also lock on it so we can never wipe a hold that
  // changed hands between our read and this write.
  if (releasesOwnHold) query = query.eq('hold_team', myTeam.team)

  const { data, error } = await query.select('id')
  if (error) return dbError('Failed to place bid', error)
  if (!data?.length) return { error: 'Outbid — the price just moved. Check the new bid.' }

  // Charge the released hold (best-effort: a failure here grants free hold
  // time rather than ever blocking a live bid).
  if (releasesOwnHold) {
    const span = Math.max(0, Date.now() - Date.parse(player.hold_started_at!))
    const charge = Math.min(span, Math.max(0, HOLD_BUDGET_MS - myTeam.hold_used_ms))
    await db
      .from('auction_teams')
      .update({ hold_used_ms: myTeam.hold_used_ms + charge })
      .eq('team', myTeam.team)
  }
  return {}
}

// ── Sold-timer finalisation ───────────────────────────────────

// Sells the on-block player to the highest bidder once the 10-second clock has
// run out. Any logged-in viewer's client calls this when its countdown hits
// zero, so the sale never depends on one particular device being awake. The
// expiry is re-verified server-side (both timestamps come from server clocks)
// and the write is optimistic-locked on the exact bid seen — concurrent
// finalise calls resolve to one winner, and a bid that landed in the meantime
// (restarting the clock) makes this a silent no-op.
export async function finalizeExpiredBid(playerId: number): Promise<{ error?: string; sold?: boolean }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not logged in.' }
  if (!Number.isInteger(playerId)) return { error: 'Invalid player.' }

  const db = getAdminClient()
  const { data: playerRaw } = await db
    .from('auction_players')
    .select('*')
    .eq('id', playerId)
    .single()
  const player = playerRaw as AuctionPlayer | null

  if (
    !player ||
    player.status !== 'on_block' ||
    player.current_bid === null ||
    player.current_bidder === null ||
    !bidExpired(player, Date.now())
  ) {
    return { sold: false } // nothing to do — clock reset, already sold, or not expired yet
  }

  const { data, error } = await db
    .from('auction_players')
    .update({
      status: 'sold',
      team: player.current_bidder,
      price: player.current_bid,
      sold_at: new Date().toISOString(),
      hold_team: null,
      hold_started_at: null,
    })
    .eq('id', playerId)
    .eq('status', 'on_block')
    .eq('current_bid', player.current_bid)
    .eq('current_bidder', player.current_bidder)
    .select('id')
  if (error) return dbError('Failed to close the sale', error)
  return { sold: (data?.length ?? 0) > 0 }
}

// ── Captain hold time ─────────────────────────────────────────

// Ends the active hold on `player` (held by `teamRow`), charging the budget
// and shifting the bid clock forward by exactly the time it was frozen. The
// pause is clamped at the budget boundary: time held beyond exhaustion counts
// against the bid clock, never as free pause. Optimistic-locked on the hold's
// start timestamp so concurrent releases resolve to one.
async function endHold(
  db: ReturnType<typeof getAdminClient>,
  player: AuctionPlayer,
  teamRow: AuctionTeamRow,
  endMs: number
): Promise<{ error?: string; released?: boolean }> {
  const holdStartMs = Date.parse(player.hold_started_at!)
  const budgetLeft = Math.max(0, HOLD_BUDGET_MS - teamRow.hold_used_ms)
  const effectiveEndMs = Math.min(endMs, holdStartMs + budgetLeft)
  const charge = Math.max(0, Math.min(endMs - holdStartMs, budgetLeft))

  const update: Record<string, string | null> = { hold_team: null, hold_started_at: null }
  if (player.bid_placed_at !== null) {
    const placedMs = Date.parse(player.bid_placed_at)
    const shift = Math.max(0, effectiveEndMs - Math.max(holdStartMs, placedMs))
    update.bid_placed_at = new Date(placedMs + shift).toISOString()
  }

  const { data, error } = await db
    .from('auction_players')
    .update(update)
    .eq('id', player.id)
    .eq('status', 'on_block')
    .eq('hold_team', teamRow.team)
    .eq('hold_started_at', player.hold_started_at!)
    .select('id')
  if (error) return dbError('Failed to release the hold', error)
  if (!data?.length) return { released: false } // already released or superseded

  // Charge after the release lands (a failure grants free hold time rather
  // than double-charging a retried release).
  const { error: chargeErr } = await db
    .from('auction_teams')
    .update({ hold_used_ms: teamRow.hold_used_ms + charge })
    .eq('team', teamRow.team)
  if (chargeErr) return dbError('Failed to record hold time', chargeErr)
  return { released: true }
}

// Captain's Hold button: starts a hold (freezing the sold-clock on their
// budget) or releases their own active hold.
export async function toggleHold(playerId: number): Promise<{ error?: string; holding?: boolean }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not logged in.' }
  if (!Number.isInteger(playerId)) return { error: 'Invalid player.' }

  const db = getAdminClient()
  const [{ data: teamsRaw }, { data: playerRaw }] = await Promise.all([
    db.from('auction_teams').select('*'),
    db.from('auction_players').select('*').eq('id', playerId).single(),
  ])
  const teams = (teamsRaw ?? []) as AuctionTeamRow[]
  const player = playerRaw as AuctionPlayer | null

  const myTeam = teams.find(t => t.captain_user_id === user.id)
  if (!myTeam) return { error: 'Only the two captains can hold.' }
  if (!player || player.status !== 'on_block') return { error: 'That player is not on the block.' }

  const now = Date.now()

  // Release my own hold.
  if (player.hold_team === myTeam.team) {
    const res = await endHold(db, player, myTeam, now)
    if (res.error) return { error: res.error }
    return { holding: false }
  }

  if (player.hold_team !== null)
    return { error: `${TEAM_LABELS[player.hold_team]} is already holding.` }

  // Start a hold.
  if (player.current_bid === null)
    return { error: 'No clock to hold yet — it starts with the first bid.' }
  if (player.bid_placed_at === null)
    return { error: 'The clock is stopped — nothing to hold.' }
  if (bidExpired(player, now))
    return { error: 'Time’s up — this sale is closing.' }
  if (holdRemainingMs(myTeam, player, now) < 1000)
    return { error: 'No hold time left.' }

  const { data, error } = await db
    .from('auction_players')
    .update({ hold_team: myTeam.team, hold_started_at: new Date().toISOString() })
    .eq('id', playerId)
    .eq('status', 'on_block')
    .is('hold_team', null)
    .eq('current_bid', player.current_bid)
    .select('id')
  if (error) return dbError('Failed to start the hold', error)
  if (!data?.length) return { error: 'The state just changed — check the block and try again.' }
  return { holding: true }
}

// Releases a hold whose budget has run out. Any logged-in viewer's client
// calls this; the server re-verifies exhaustion, so it cannot end a hold
// early, and endHold's clamping means overrun never becomes free pause.
export async function releaseExhaustedHold(playerId: number): Promise<{ error?: string; released?: boolean }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not logged in.' }
  if (!Number.isInteger(playerId)) return { error: 'Invalid player.' }

  const db = getAdminClient()
  const [{ data: teamsRaw }, { data: playerRaw }] = await Promise.all([
    db.from('auction_teams').select('*'),
    db.from('auction_players').select('*').eq('id', playerId).single(),
  ])
  const teams = (teamsRaw ?? []) as AuctionTeamRow[]
  const player = playerRaw as AuctionPlayer | null

  if (!player || player.status !== 'on_block' || player.hold_team === null)
    return { released: false }
  const holdingTeam = teams.find(t => t.team === player.hold_team)
  if (!holdingTeam) return { released: false }
  if (holdRemainingMs(holdingTeam, player, Date.now()) > 0)
    return { released: false } // not exhausted yet

  return endHold(db, player, holdingTeam, Date.now())
}
