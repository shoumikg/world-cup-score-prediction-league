import { scoreOutcome, matchPoints, OUTCOME_CLASSES, type Outcome } from '@/lib/scoring'
import type { Match, PickEntry, Prediction } from '@/lib/types'

const ORDER: Outcome[] = ['exact', 'correct_gd', 'correct', 'wrong']
const LABEL: Record<Outcome, string> = {
  exact: 'Exact', correct_gd: 'GD', correct: 'Result', wrong: 'Wrong',
}

// Live, provisional grading of everyone's picks against the current score of a
// match in progress. Reuses scoreOutcome/matchPoints so it stays in lock-step
// with the real leaderboard. Renders nothing until the match has a score.
export function LivePickGrades({ match, picks }: { match: Match; picks: PickEntry[] }) {
  if (match.home_score === null || match.away_score === null) return null

  const fake = (h: number, a: number): Prediction =>
    ({ user_id: '', match_id: match.id, home_pred: h, away_pred: a, updated_at: '' })

  const counts: Record<Outcome, number> = { exact: 0, correct_gd: 0, correct: 0, wrong: 0 }
  let own: { outcome: Outcome; pts: number } | null = null
  for (const p of picks) {
    if (!p.prediction) continue
    const outcome = scoreOutcome(fake(p.prediction.homePred, p.prediction.awayPred), match)
    if (!outcome) continue
    counts[outcome] += 1
    if (p.isSelf) own = { outcome, pts: matchPoints(outcome, match.stage) }
  }

  const graded = ORDER.reduce((s, o) => s + counts[o], 0)
  if (graded === 0) return null

  return (
    <div className="mt-2 mb-1 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs">
      <span className="text-amber-600 font-medium whitespace-nowrap">⚡ If it ends now</span>
      <span className="flex flex-wrap gap-1.5">
        {ORDER.filter(o => counts[o] > 0).map(o => (
          <span key={o} className={`px-1.5 py-0.5 rounded font-medium ${OUTCOME_CLASSES[o]}`}>
            {LABEL[o]} <span className="font-semibold">{counts[o]}</span>
          </span>
        ))}
      </span>
      {own && (
        <span className="ml-auto whitespace-nowrap text-gray-500">
          You:{' '}
          <span className={`px-1.5 py-0.5 rounded font-semibold ${OUTCOME_CLASSES[own.outcome]}`}>
            {own.pts > 0 ? `+${own.pts}` : '0'} pts
          </span>
        </span>
      )}
    </div>
  )
}
