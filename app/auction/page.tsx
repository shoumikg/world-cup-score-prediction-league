import { getAuthUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { AuctionLive } from './AuctionLive'
import type { AuctionPlayer, AuctionTeamRow, AuctionTeamId } from '@/lib/auction'

export const dynamic = 'force-dynamic'

// Public page — /auction is excluded from the auth wall in the middleware, so
// spectators watch without an account. Logged-in captains get bid controls,
// the admin gets the auctioneer controls; everyone shares this one link.
export default async function AuctionPage() {
  const user = await getAuthUser() // null for anonymous spectators — no redirect
  const supabase = await createClient()

  const [{ data: playersRaw }, { data: teamsRaw }] = await Promise.all([
    supabase.from('auction_players').select('*').order('id'),
    supabase.from('auction_teams').select('*'),
  ])

  const players = (playersRaw ?? []) as AuctionPlayer[]
  const teams = (teamsRaw ?? []) as AuctionTeamRow[]

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
      isAdmin={isAdmin}
      captainOf={captainOf}
      isLoggedIn={!!user}
    />
  )
}
