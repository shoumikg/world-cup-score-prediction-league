import { createClient } from '@/lib/supabase/server'
import { istDateKey, formatDateIST, formatKickoffIST, isKickedOff } from '@/lib/time'
import { MatchRow } from '@/app/MatchRow'
import type { Match, Prediction } from '@/lib/types'

export const dynamic = 'force-dynamic'

export default async function SchedulePage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null // middleware will redirect

  const [{ data: matches }, { data: preds }] = await Promise.all([
    supabase.from('matches').select('*').order('kickoff_utc'),
    supabase.from('predictions').select('*').eq('user_id', user.id),
  ])

  const predMap = new Map<number, Prediction>()
  for (const p of (preds ?? [])) predMap.set(p.match_id, p)

  // Group matches by IST calendar date
  const groups = new Map<string, Match[]>()
  for (const m of (matches ?? []) as Match[]) {
    const key = istDateKey(m.kickoff_utc)
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(m)
  }

  // Find next upcoming match for the anchor
  const nextMatch = (matches as Match[] | null)?.find(
    m => !isKickedOff(m.kickoff_utc)
  )

  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold">Schedule & Predictions</h1>
        {nextMatch && (
          <a
            href={`#match-${nextMatch.id}`}
            className="text-sm text-green-600 hover:underline"
          >
            Jump to next match →
          </a>
        )}
      </div>

      <div className="mb-4 text-xs text-gray-400 flex gap-4 flex-wrap">
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-3 rounded bg-green-100 border border-green-300"></span> Exact score
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-3 rounded bg-yellow-100 border border-yellow-300"></span> Correct result
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-3 rounded bg-red-100 border border-red-300"></span> Wrong
        </span>
      </div>

      {Array.from(groups.entries()).map(([dateKey, dayMatches]) => (
        <section key={dateKey} className="mb-8">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3 sticky top-0 bg-gray-50 py-1 z-10">
            {formatDateIST(dayMatches[0].kickoff_utc)}
          </h2>
          <div className="bg-white rounded-xl border shadow-sm px-4">
            {dayMatches.map(m => (
              <div key={m.id} id={`match-${m.id}`} className="scroll-mt-16">
                <div className="text-xs text-gray-400 pt-3 pb-1">
                  {formatKickoffIST(m.kickoff_utc)} IST
                </div>
                <MatchRow
                  match={m}
                  prediction={predMap.get(m.id)}
                  isLocked={isKickedOff(m.kickoff_utc)}
                />
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}
