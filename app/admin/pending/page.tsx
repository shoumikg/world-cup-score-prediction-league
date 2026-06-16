import { redirect } from 'next/navigation'
import { getAuthUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { getAdminClient } from '@/lib/supabase/admin'
import { istDateKey, formatKickoffIST, predictionDeadlineUTC } from '@/lib/time'
import { teamFlag } from '@/lib/flags'
import { TeamLink } from '@/app/TeamLink'
import type { Match, Prediction } from '@/lib/types'

export const dynamic = 'force-dynamic'

export default async function AdminPendingPage() {
  const user = await getAuthUser()
  if (!user) redirect('/login')
  const supabase = await createClient()

  const { data: profile } = await supabase
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .single()

  if (!profile?.is_admin) redirect('/')

  // Predictions fetched via service-role client to bypass RLS — allows
  // the admin to see who has/hasn't predicted before the deadline.
  const db = getAdminClient()
  const [{ data: matches }, { data: preds }, { data: profiles }] = await Promise.all([
    supabase.from('matches').select('*').order('kickoff_utc'),
    db.from('predictions').select('user_id, match_id, home_pred, away_pred'),
    supabase.from('profiles')
      .select('id, display_name, favorite_team')
      .eq('is_admin', false)
      .order('display_name'),
  ])

  const allMatches = (matches ?? []) as Match[]

  // Group matches by IST calendar day (= shared deadline)
  const byDeadline = new Map<string, { deadline: Date; matches: Match[] }>()
  for (const m of allMatches) {
    const key = istDateKey(m.kickoff_utc)
    if (!byDeadline.has(key)) {
      byDeadline.set(key, { deadline: predictionDeadlineUTC(m.kickoff_utc), matches: [] })
    }
    byDeadline.get(key)!.matches.push(m)
  }

  // Find the immediate next upcoming deadline; fall back to the most recently closed one
  const now = new Date()
  const sorted = [...byDeadline.values()].sort((a, b) => a.deadline.getTime() - b.deadline.getTime())
  const targetGroup = sorted.find(g => g.deadline > now) ?? sorted.at(-1) ?? null
  const targetMatches = targetGroup?.matches ?? []

  type PlayerRow = { id: string; display_name: string; favorite_team: string | null }
  const players = (profiles ?? []) as PlayerRow[]

  if (targetMatches.length === 0) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-6">
        <h1 className="text-xl font-bold mb-1">Pending Predictions</h1>
        <p className="text-sm text-gray-500">No matches found.</p>
      </div>
    )
  }

  const deadline = predictionDeadlineUTC(targetMatches[0].kickoff_utc)
  const deadlinePassed = deadline <= now

  const predMap = new Map<string, { homePred: number; awayPred: number }>()
  for (const p of (preds ?? []) as Prediction[]) {
    predMap.set(`${p.match_id}:${p.user_id}`, { homePred: p.home_pred, awayPred: p.away_pred })
  }

  const fullyPredicted = players.filter(p =>
    targetMatches.every(m => predMap.has(`${m.id}:${p.id}`))
  ).length

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
      <div>
        <h1 className="text-xl font-bold mb-1">Pending Predictions</h1>
        <p className="text-sm text-gray-500">
          {deadlinePassed ? 'Deadline closed' : `Deadline ${formatKickoffIST(deadline.toISOString())} IST`}
          {' · '}{fullyPredicted} of {players.length} players predicted all matches
        </p>
      </div>

      {targetMatches.map(m => {
        const unpredicted = players.filter(p => !predMap.has(`${m.id}:${p.id}`))

        return (
          <div key={m.id} className="bg-white rounded-xl border shadow-sm overflow-hidden">
            <div className="px-4 py-3 bg-gray-50 border-b flex items-center gap-2 flex-wrap">
              <span className="text-xs text-gray-400">#{m.id}</span>
              <span className="text-sm font-medium">
                <TeamLink team={m.home_team} fallback={m.home_source ?? 'TBD'} />
                {' '}vs{' '}
                <TeamLink team={m.away_team} fallback={m.away_source ?? 'TBD'} />
              </span>
              <span className="ml-auto text-xs text-gray-400">{formatKickoffIST(m.kickoff_utc)} IST</span>
              {unpredicted.length > 0 ? (
                <span className="text-xs font-medium text-red-500">{unpredicted.length} missing</span>
              ) : (
                <span className="text-xs font-medium text-green-600">All predicted ✓</span>
              )}
            </div>
            <div className="divide-y">
              {players.map(player => {
                const pred = predMap.get(`${m.id}:${player.id}`)
                return (
                  <div key={player.id} className="px-4 py-2.5 flex items-center gap-2">
                    <span className="text-sm flex-1 min-w-0 truncate">
                      {teamFlag(player.favorite_team) && (
                        <span className="mr-1">{teamFlag(player.favorite_team)}</span>
                      )}
                      {player.display_name}
                    </span>
                    {pred ? (
                      deadlinePassed ? (
                        <span className="text-sm font-semibold text-gray-800 shrink-0">
                          {pred.homePred}–{pred.awayPred}
                        </span>
                      ) : (
                        <span className="text-xs text-green-600 font-medium shrink-0">✓ predicted</span>
                      )
                    ) : (
                      <span className="text-xs text-red-400 font-medium shrink-0">pending</span>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}
