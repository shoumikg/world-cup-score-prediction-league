import { createClient } from '@/lib/supabase/server'
import { scoreOutcome, scoreColor, stageLabel, matchPoints } from '@/lib/scoring'
import { formatKickoffIST } from '@/lib/time'
import { teamDisplay, teamFlag } from '@/lib/flags'
import type { Match, Prediction } from '@/lib/types'

export const dynamic = 'force-dynamic'

export default async function ComparePage(props: {
  searchParams: Promise<{ a?: string; b?: string }>
}) {
  const { a: rawA, b } = await props.searchParams

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const [{ data: profilesRaw }, { data: matchesRaw }, { data: predsRaw }] = await Promise.all([
    supabase.from('profiles').select('id, display_name, favorite_team'),
    supabase.from('matches').select('*').order('kickoff_utc'),
    supabase.from('predictions').select('*'),
  ])

  type ProfileRow = { id: string; display_name: string; favorite_team: string | null }
  const allProfiles = (profilesRaw ?? []) as ProfileRow[]
  const allMatches  = (matchesRaw  ?? []) as Match[]
  const allPreds    = (predsRaw    ?? []) as Prediction[]

  const currentUserProfile = allProfiles.find(p => p.id === user.id)
  const a = rawA ?? currentUserProfile?.display_name

  // Player picker form shown when names aren't set
  if (!a || !b) {
    return <ComparePicker profiles={allProfiles} a={a} b={b} />
  }

  const playerA = allProfiles.find(p => p.display_name === a)
  const playerB = allProfiles.find(p => p.display_name === b)

  if (!playerA || !playerB) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-6">
        <h1 className="text-xl font-bold mb-4">Compare</h1>
        <p className="text-sm text-red-500 mb-4">
          {!playerA ? `Player "${a}" not found.` : `Player "${b}" not found.`}
        </p>
        <ComparePicker profiles={allProfiles} a={a} b={b} />
      </div>
    )
  }

  if (playerA.id === playerB.id) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-6">
        <h1 className="text-xl font-bold mb-4">Compare</h1>
        <p className="text-sm text-gray-500">Pick two different players to compare.</p>
        <ComparePicker profiles={allProfiles} a={a} b={b} />
      </div>
    )
  }

  const predA = new Map<number, Prediction>()
  const predB = new Map<number, Prediction>()
  for (const p of allPreds) {
    if (p.user_id === playerA.id) predA.set(p.match_id, p)
    if (p.user_id === playerB.id) predB.set(p.match_id, p)
  }

  // Only show scored matches (both may not have predicted every match)
  const scoredMatches = allMatches.filter(m => m.home_score !== null)

  // Group by stage in display order
  const stageOrder: Match['stage'][] = ['group', 'r32', 'r16', 'qf', 'sf', 'third', 'final']
  const byStage = new Map<string, Match[]>()
  for (const m of scoredMatches) {
    const s = byStage.get(m.stage) ?? []
    s.push(m)
    byStage.set(m.stage, s)
  }

  // Cumulative pts per player
  let ptsA = 0, ptsB = 0
  for (const m of scoredMatches) {
    const pa = predA.get(m.id)
    const pb = predB.get(m.id)
    if (pa) { const o = scoreOutcome(pa, m); if (o) ptsA += matchPoints(o, m.stage) }
    if (pb) { const o = scoreOutcome(pb, m); if (o) ptsB += matchPoints(o, m.stage) }
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold mb-4">Compare</h1>
        <div className="bg-white rounded-xl border shadow-sm p-4 flex items-center justify-around gap-4">
          <div className="text-center">
            <div className="text-sm font-medium">
              {teamFlag(playerA.favorite_team) && <span className="mr-1">{teamFlag(playerA.favorite_team)}</span>}
              {playerA.display_name}
            </div>
            <div className="text-2xl font-bold text-gray-900 mt-1">{ptsA} pts</div>
          </div>
          <div className="text-gray-300 text-lg font-light">vs</div>
          <div className="text-center">
            <div className="text-sm font-medium">
              {teamFlag(playerB.favorite_team) && <span className="mr-1">{teamFlag(playerB.favorite_team)}</span>}
              {playerB.display_name}
            </div>
            <div className="text-2xl font-bold text-gray-900 mt-1">{ptsB} pts</div>
          </div>
        </div>
      </div>

      {scoredMatches.length === 0 && (
        <p className="text-sm text-gray-400">No results in yet — check back once matches have been played.</p>
      )}

      {stageOrder.map(stage => {
        const stageMatches = byStage.get(stage)
        if (!stageMatches?.length) return null

        let stagePtsA = 0, stagePtsB = 0

        return (
          <section key={stage}>
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
              {stage === 'group' ? 'Group Stage' : stageLabel(stage)}
            </h2>
            <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-gray-50 border-b text-gray-400">
                    <th className="text-left font-medium px-3 py-2">Match</th>
                    <th className="text-center font-medium px-2 py-2 w-16">{playerA.display_name.split(' ')[0]}</th>
                    <th className="text-center font-medium px-2 py-2 w-12">Result</th>
                    <th className="text-center font-medium px-2 py-2 w-16">{playerB.display_name.split(' ')[0]}</th>
                  </tr>
                </thead>
                <tbody>
                  {stageMatches.map(m => {
                    const pa = predA.get(m.id)
                    const pb = predB.get(m.id)
                    const oa = pa ? scoreOutcome(pa, m) : null
                    const ob = pb ? scoreOutcome(pb, m) : null
                    if (oa) stagePtsA += matchPoints(oa, m.stage)
                    if (ob) stagePtsB += matchPoints(ob, m.stage)
                    const home = teamDisplay(m.home_team, m.home_source ?? '?')
                    const away = teamDisplay(m.away_team, m.away_source ?? '?')
                    return (
                      <tr key={m.id} className="border-t">
                        <td className="px-3 py-2 text-gray-600">
                          <div>{home} vs {away}</div>
                          <div className="text-gray-400">{formatKickoffIST(m.kickoff_utc)} IST</div>
                        </td>
                        <td className="text-center px-2 py-2">
                          {pa ? (
                            <span className={`px-1.5 py-0.5 rounded font-semibold ${oa ? scoreColor(pa, m) : 'bg-gray-100 text-gray-700'}`}>
                              {pa.home_pred}–{pa.away_pred}
                            </span>
                          ) : (
                            <span className="text-gray-300">–</span>
                          )}
                        </td>
                        <td className="text-center px-2 py-2 font-semibold text-gray-800">
                          {m.home_score}–{m.away_score}
                        </td>
                        <td className="text-center px-2 py-2">
                          {pb ? (
                            <span className={`px-1.5 py-0.5 rounded font-semibold ${ob ? scoreColor(pb, m) : 'bg-gray-100 text-gray-700'}`}>
                              {pb.home_pred}–{pb.away_pred}
                            </span>
                          ) : (
                            <span className="text-gray-300">–</span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t bg-gray-50">
                    <td className="px-3 py-2 text-gray-400 text-xs">Stage total</td>
                    <td className="text-center px-2 py-2 font-semibold text-gray-700">{stagePtsA} pts</td>
                    <td />
                    <td className="text-center px-2 py-2 font-semibold text-gray-700">{stagePtsB} pts</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </section>
        )
      })}

      {/* Picker to switch players */}
      <details className="text-sm">
        <summary className="text-gray-400 cursor-pointer hover:text-gray-600 select-none">Change players</summary>
        <div className="mt-3">
          <ComparePicker profiles={allProfiles} a={a} b={b} />
        </div>
      </details>
    </div>
  )
}

function ComparePicker({
  profiles,
  a,
  b,
}: {
  profiles: { id: string; display_name: string; favorite_team: string | null }[]
  a?: string
  b?: string
}) {
  const names = profiles.map(p => p.display_name).sort((x, y) => x.localeCompare(y))
  return (
    <form method="GET" action="/compare" className="flex flex-wrap items-end gap-3 mt-4">
      <div>
        <label className="block text-xs text-gray-500 mb-1">Player A</label>
        <select name="a" defaultValue={a ?? ''} className="border rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-400">
          <option value="">— pick a player —</option>
          {names.map(n => <option key={n} value={n}>{n}</option>)}
        </select>
      </div>
      <div>
        <label className="block text-xs text-gray-500 mb-1">Player B</label>
        <select name="b" defaultValue={b ?? ''} className="border rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-400">
          <option value="">— pick a player —</option>
          {names.map(n => <option key={n} value={n}>{n}</option>)}
        </select>
      </div>
      <button type="submit" className="text-sm bg-green-600 hover:bg-green-700 text-white px-3 py-1.5 rounded transition-colors">
        Compare
      </button>
    </form>
  )
}
