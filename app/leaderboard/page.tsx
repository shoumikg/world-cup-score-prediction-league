import { createClient } from '@/lib/supabase/server'
import { computeLeaderboard } from '@/lib/leaderboard'
import { teamFlag } from '@/lib/flags'
import type { Match, Prediction, BonusGrade } from '@/lib/types'
import type { LeaderboardProfile } from '@/lib/leaderboard'

export const dynamic = 'force-dynamic'

export default async function LeaderboardPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null // middleware will redirect

  // profiles: only safe columns — usernames must never reach this page
  const [{ data: profiles }, { data: matches }, { data: preds }, { data: grades }] = await Promise.all([
    supabase.from('profiles').select('id, display_name, favorite_team'),
    supabase.from('matches').select('*').not('home_score', 'is', null),
    supabase.from('predictions').select('*'),
    supabase.from('bonus_grades').select('*'),
  ])

  const rows = computeLeaderboard(
    (profiles ?? []) as LeaderboardProfile[],
    (preds ?? []) as Prediction[],
    (matches ?? []) as Match[],
    (grades ?? []) as BonusGrade[]
  )

  const anyScored = rows.some(r => r.scored > 0 || r.bonusPoints > 0)

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <h1 className="text-xl font-bold mb-1">Leaderboard</h1>
      <p className="text-sm text-gray-500 mb-6">
        {anyScored
          ? 'How everyone is doing so far.'
          : 'Everyone in the league. Tallies appear once results come in.'}
      </p>

      <div className="bg-white rounded-xl border shadow-sm overflow-x-auto">
        <table className="min-w-[480px] w-full text-sm">
          <thead>
            <tr className="text-xs text-gray-400 bg-gray-50 border-b">
              <th className="text-left font-medium pl-3 py-2 w-8 sticky left-0 bg-gray-50 z-10">#</th>
              <th className="text-left font-medium py-2 sticky left-8 bg-gray-50 z-10 pr-2">Player</th>
              <th className="font-medium w-14 py-2">Exact</th>
              <th className="font-medium w-14 py-2">GD</th>
              <th className="font-medium w-14 py-2">Result</th>
              <th className="font-medium w-14 py-2">Wrong</th>
              <th className="font-medium w-14 py-2">Bonus</th>
              <th className="font-medium w-14 pr-3 py-2">Pts</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.userId} className="border-t first:border-0">
                <td className="pl-3 py-2.5 text-gray-400 text-xs sticky left-0 bg-white z-10">{i + 1}</td>
                <td className="py-2.5 font-medium sticky left-8 bg-white z-10 pr-2">
                  <span className="mr-1.5">{teamFlag(r.favoriteTeam) ?? '🇮🇳'}</span>
                  {r.displayName}
                </td>
                <td className="text-center py-2.5">
                  <span className="inline-block w-8 px-1 py-0.5 rounded bg-green-100 text-green-800 font-semibold text-xs">
                    {r.exact}
                  </span>
                </td>
                <td className="text-center py-2.5">
                  <span className="inline-block w-8 px-1 py-0.5 rounded bg-orange-100 text-orange-700 font-semibold text-xs">
                    {r.correct_gd}
                  </span>
                </td>
                <td className="text-center py-2.5">
                  <span className="inline-block w-8 px-1 py-0.5 rounded bg-yellow-100 text-yellow-800 font-semibold text-xs">
                    {r.correct}
                  </span>
                </td>
                <td className="text-center py-2.5">
                  <span className="inline-block w-8 px-1 py-0.5 rounded bg-red-100 text-red-700 font-semibold text-xs">
                    {r.wrong}
                  </span>
                </td>
                <td className="text-center py-2.5">
                  <span className="inline-block w-8 px-1 py-0.5 rounded bg-purple-100 text-purple-700 font-semibold text-xs">
                    {r.bonusPoints}
                  </span>
                </td>
                <td className="text-center py-2.5 pr-3">
                  <span className="font-bold text-gray-900 text-sm">{r.total}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-gray-400 mt-3">
        Exact/GD/Result = 10/5/3 group · 15/8/5 knockout pts · Bonus = graded bonus question pts ·
        Missed predictions don't count against you.
      </p>
    </div>
  )
}
