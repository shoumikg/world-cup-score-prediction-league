import { createClient } from '@/lib/supabase/server'
import { stageLabel, scoreColor, scoreOutcome } from '@/lib/scoring'
import { formatKickoffIST } from '@/lib/time'
import { teamDisplay } from '@/lib/flags'
import type { Match, Prediction } from '@/lib/types'

export const dynamic = 'force-dynamic'

const STAGE_ORDER: Match['stage'][] = ['r32', 'r16', 'qf', 'sf', 'third', 'final']
const STAGE_LABEL: Record<string, string> = {
  r32: 'Round of 32', r16: 'Round of 16', qf: 'Quarter-finals',
  sf: 'Semi-finals', third: 'Third place', final: 'Final',
}

export default async function BracketPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const [{ data: matchesRaw }, { data: predsRaw }] = await Promise.all([
    supabase.from('matches').select('*').neq('stage', 'group').order('kickoff_utc'),
    supabase.from('predictions').select('*'),
  ])

  const matches   = (matchesRaw ?? []) as Match[]
  const allPreds  = (predsRaw   ?? []) as Prediction[]

  const predMap = new Map<number, Prediction>()
  for (const p of allPreds) {
    if (p.user_id === user.id) predMap.set(p.match_id, p)
  }

  const byStage = new Map<string, Match[]>()
  for (const m of matches) {
    const s = byStage.get(m.stage) ?? []
    s.push(m)
    byStage.set(m.stage, s)
  }

  const hasAnyKnockout = matches.length > 0
  const anyTeamFilled = matches.some(m => m.home_team)

  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      <h1 className="text-xl font-bold mb-1">Knockout Bracket</h1>
      <p className="text-sm text-gray-500 mb-6">
        {!hasAnyKnockout
          ? 'Knockout fixtures are not seeded yet.'
          : !anyTeamFilled
          ? 'Teams will appear here once the group stage is complete.'
          : 'Your prediction chip appears next to each match. Colours apply once results are in.'}
      </p>

      <div className="space-y-8">
        {STAGE_ORDER.map(stage => {
          const stageMatches = byStage.get(stage)
          if (!stageMatches?.length) return null

          return (
            <section key={stage}>
              <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">
                {STAGE_LABEL[stage] ?? stageLabel(stage)}
              </h2>
              <div className={`grid gap-3 ${
                stageMatches.length >= 8
                  ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4'
                  : stageMatches.length >= 4
                  ? 'grid-cols-1 sm:grid-cols-2'
                  : 'grid-cols-1 sm:grid-cols-2'
              }`}>
                {stageMatches.map(m => {
                  const pred = predMap.get(m.id)
                  const hasResult = m.home_score !== null
                  const home = teamDisplay(m.home_team, m.home_source ?? '?')
                  const away = teamDisplay(m.away_team, m.away_source ?? '?')
                  const isPlaceholder = !m.home_team

                  return (
                    <div key={m.id} className="bg-white rounded-xl border shadow-sm p-3">
                      <div className="text-xs text-gray-400 mb-2">
                        #{m.id} · {formatKickoffIST(m.kickoff_utc)} IST
                      </div>

                      {/* Teams + result */}
                      <div className="space-y-1 mb-2">
                        <div className="flex items-center justify-between gap-2">
                          <span className={`text-sm font-medium truncate ${isPlaceholder ? 'text-gray-400 italic' : ''}`}>
                            {home}
                          </span>
                          {hasResult && (
                            <span className="text-sm font-bold text-gray-800 shrink-0 w-4 text-right">
                              {m.home_score}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center justify-between gap-2">
                          <span className={`text-sm font-medium truncate ${isPlaceholder ? 'text-gray-400 italic' : ''}`}>
                            {away}
                          </span>
                          {hasResult && (
                            <span className="text-sm font-bold text-gray-800 shrink-0 w-4 text-right">
                              {m.away_score}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Own prediction chip */}
                      {pred ? (
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs text-gray-400">Your pick:</span>
                          <span className={`text-xs font-semibold px-1.5 py-0.5 rounded ${
                            hasResult ? scoreColor(pred, m) : 'bg-gray-100 text-gray-700'
                          }`}>
                            {pred.home_pred}–{pred.away_pred}
                          </span>
                        </div>
                      ) : (
                        <span className="text-xs text-gray-300 italic">no pick</span>
                      )}
                    </div>
                  )
                })}
              </div>
            </section>
          )
        })}
      </div>
    </div>
  )
}
