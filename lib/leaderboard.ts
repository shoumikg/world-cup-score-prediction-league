import { scoreOutcome, matchPoints } from './scoring'
import { bonusPointsFor } from './bonus'
import type { Match, Prediction, BonusGrade } from './types'

export interface LeaderboardRow {
  userId: string
  displayName: string
  favoriteTeam: string | null
  exact: number
  correct_gd: number
  correct: number
  wrong: number
  scored: number
  points: number      // match points only
  bonusPoints: number // points from correctly-graded bonus answers
  total: number       // points + bonusPoints
}

export interface LeaderboardProfile {
  id: string
  display_name: string
  favorite_team: string | null
}

/**
 * Tallies every player's prediction outcomes and bonus grades.
 * Players with no predictions/grades still appear (all zeros). Missed
 * predictions count as nothing — not as wrong. Ungraded bonus answers = 0.
 * Sort: total pts desc, then exact desc, correct_gd desc, correct desc,
 * wrong asc, display name A–Z.
 */
export function computeLeaderboard(
  profiles: LeaderboardProfile[],
  predictions: Prediction[],
  matches: Match[],
  bonusGrades: Pick<BonusGrade, 'user_id' | 'question_id' | 'is_correct'>[] = []
): LeaderboardRow[] {
  const scoredMatches = new Map<number, Match>()
  for (const m of matches) {
    if (m.home_score !== null && m.away_score !== null) scoredMatches.set(m.id, m)
  }

  const rows = new Map<string, LeaderboardRow>()
  for (const p of profiles) {
    rows.set(p.id, {
      userId: p.id,
      displayName: p.display_name,
      favoriteTeam: p.favorite_team,
      exact: 0, correct_gd: 0, correct: 0, wrong: 0, scored: 0,
      points: 0, bonusPoints: 0, total: 0,
    })
  }

  for (const pred of predictions) {
    const row = rows.get(pred.user_id)
    const match = scoredMatches.get(pred.match_id)
    if (!row || !match) continue
    const outcome = scoreOutcome(pred, match)
    if (!outcome) continue
    row[outcome] += 1
    row.scored += 1
    row.points += matchPoints(outcome, match.stage)
  }

  for (const g of bonusGrades) {
    const row = rows.get(g.user_id)
    if (!row || !g.is_correct) continue
    row.bonusPoints += bonusPointsFor(g.question_id)
  }

  for (const row of rows.values()) {
    row.total = row.points + row.bonusPoints
  }

  return [...rows.values()].sort(
    (a, b) =>
      b.total       - a.total       ||
      b.exact       - a.exact       ||
      b.correct_gd  - a.correct_gd  ||
      b.correct     - a.correct     ||
      a.wrong       - b.wrong       ||
      a.displayName.localeCompare(b.displayName)
  )
}
