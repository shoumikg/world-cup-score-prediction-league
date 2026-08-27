import { getAuthUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { AuctionLive } from './AuctionLive'
import { finalizeExpiredBid, releaseExhaustedHold } from './actions'
import { bidExpired, holdRemainingMs, type AuctionPlayer, type AuctionTeamRow, type AuctionTeamId, type AuctionEvent } from '@/lib/auction'

export const dynamic = 'force-dynamic'

// Public page — /auction is excluded from the auth wall in the middleware, so
// spectators watch without an account. Logged-in captains get bid controls,
// the admin gets the auctioneer controls; everyone shares this one link.
export default async function AuctionPage() {
  const user = await getAuthUser() // null for anonymous spectators — no redirect
  const supabase = await createClient()

  let [{ data: playersRaw }, { data: teamsRaw }, { data: eventsRaw }] = await Promise.all([
    supabase.from('auction_players').select('*').order('id'),
    supabase.from('auction_teams').select('*'),
    supabase.from('auction_events').select('*').order('id', { ascending: false }).limit(50),
  ])

  let players = (playersRaw ?? []) as AuctionPlayer[]
  let teams = (teamsRaw ?? []) as AuctionTeamRow[]
  let events = (eventsRaw ?? []) as AuctionEvent[]

  // Liveness sweep: if the page loads onto an expired clock or an exhausted
  // hold that no open tab has closed yet, settle it server-side before
  // rendering (both calls fully re-verify and are optimistic-locked, so this
  // is a no-op whenever the state is already being handled elsewhere).
  const onBlock = players.find(p => p.status === 'on_block')
  if (onBlock) {
    const now = Date.now()
    const holdRow = onBlock.hold_team ? teams.find(t => t.team === onBlock.hold_team) : null
    const holdExhausted = holdRow ? holdRemainingMs(holdRow, onBlock, now) <= 0 : false
    if (holdExhausted) await releaseExhaustedHold(onBlock.id).catch(() => {})
    else if (bidExpired(onBlock, now)) await finalizeExpiredBid(onBlock.id).catch(() => {})
    if (holdExhausted || bidExpired(onBlock, now)) {
      ;[{ data: playersRaw }, { data: teamsRaw }, { data: eventsRaw }] = await Promise.all([
        supabase.from('auction_players').select('*').order('id'),
        supabase.from('auction_teams').select('*'),
        supabase.from('auction_events').select('*').order('id', { ascending: false }).limit(50),
      ])
      players = (playersRaw ?? []) as AuctionPlayer[]
      teams = (teamsRaw ?? []) as AuctionTeamRow[]
      events = (eventsRaw ?? []) as AuctionEvent[]
    }
  }

  let isAdmin = false
  let captainOf: AuctionTeamId | null = null
  if (user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('is_admin')
      .eq('id', user.id)
      .single()
    isAdmin = !!profile?.is_admin
    captainOf = teams.find(t => t.captain_user_id === user.id)?.team ?? null
  }

  return (
    <AuctionLive
      initialPlayers={players}
      initialTeams={teams}
      initialEvents={events}
      isAdmin={isAdmin}
      captainOf={captainOf}
    />
  )
}
