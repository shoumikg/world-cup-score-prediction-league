'use server'

import { createClient } from '@/lib/supabase/server'
import { getAdminClient } from '@/lib/supabase/admin'
import { validateBid, bidExpired, type AuctionPlayer, type AuctionTeamRow, type AuctionTeamId } from '@/lib/auction'

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
    .update({ status: 'pending', team: null, price: null, current_bid: null, current_bidder: null, bid_placed_at: null, sold_at: null })
    .gte('id', 0)
  if (error) return dbError('Failed to reset auction', error)
  return {}
}

// ── Auctioneer flow (admin) ───────────────────────────────────

export async function putOnBlock(playerId: number): Promise<{ error?: string }> {
  const auth = await requireAdmin()
  if ('error' in auth) return auth
  if (!Number.isInteger(playerId)) return { error: 'Invalid player.' }

  const db = getAdminClient()
  const { data, error } = await db
    .from('auction_players')
    .update({ status: 'on_block', current_bid: null, current_bidder: null, bid_placed_at: null })
    .eq('id', playerId)
    .in('status', ['pending', 'unsold'])
    .select('id')
  if (error) {
    // Unique partial index: only one player on the block at a time.
    if (error.code === '23505') return { error: 'Another player is already on the block.' }
    return dbError('Failed to put player on the block', error)
  }
  if (!data?.length) return { error: 'That player cannot go on the block.' }
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
    .update({ status: 'sold', team: seenBidder, price: seenBid, sold_at: new Date().toISOString() })
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
    .update({ status: 'unsold', current_bid: null, current_bidder: null, bid_placed_at: null })
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
    .update({ current_bid: null, current_bidder: null, bid_placed_at: null })
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
    .update({ status: 'on_block', team: null, price: null, sold_at: null, bid_placed_at: new Date().toISOString() })
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
  // the current price. Simultaneous bids resolve to exactly one winner.
  const player = players.find(p => p.id === playerId)!
  let query = db
    .from('auction_players')
    .update({ current_bid: amount, current_bidder: myTeam.team, bid_placed_at: new Date().toISOString() })
    .eq('id', playerId)
    .eq('status', 'on_block')
  query = player.current_bid === null
    ? query.is('current_bid', null)
    : query.eq('current_bid', player.current_bid)

  const { data, error } = await query.select('id')
  if (error) return dbError('Failed to place bid', error)
  if (!data?.length) return { error: 'Outbid — the price just moved. Check the new bid.' }
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
    })
    .eq('id', playerId)
    .eq('status', 'on_block')
    .eq('current_bid', player.current_bid)
    .eq('current_bidder', player.current_bidder)
    .select('id')
  if (error) return dbError('Failed to close the sale', error)
  return { sold: (data?.length ?? 0) > 0 }
}
