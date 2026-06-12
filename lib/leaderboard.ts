import { scoreOutcome, matchPoints } from './scoring'
import { bonusPointsFor } from './bonus'
import type { Match, Prediction, BonusGrade } from './types'
import type { Outcome } from './scoring'

export interface LeaderboardRow {
  userId: string
  displayName: string
  favoriteTeam: string | null
  exact: number
  correct_gd: number
  correct: number
  wrong: number
  scored: number
  points: number         // match points only
  bonusPoints: number    // points from correctly-graded bonus answers
  total: number          // points + bonusPoints
  rank: number           // competition rank (1-indexed; same rank when all 6 tiebreakers are equal)
  recentForm: Outcome[]  // last 5 scored outcomes, oldest→newest
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
 * Rank: total pts desc, then bonusPoints desc, exact desc, correct_gd desc,
 * correct desc, wrong asc. Players equal on ALL of these share a rank;
 * display name orders fully-tied rows on screen but never affects rank.
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
      points: 0, bonusPoints: 0, total: 0, rank: 0, recentForm: [],
    })
  }

  // Scratch accumulator for recent form — not exported on the row interface
  const formAccum = new Map<string, Array<{ kickoff: string; outcome: Outcome }>>()

  for (const pred of predictions) {
    const row = rows.get(pred.user_id)
    const match = scoredMatches.get(pred.match_id)
    if (!row || !match) continue
    const outcome = scoreOutcome(pred, match)
    if (!outcome) continue
    row[outcome] += 1
    row.scored += 1
    row.points += matchPoints(outcome, match.stage)
    const fa = formAccum.get(pred.user_id) ?? []
    fa.push({ kickoff: match.kickoff_utc, outcome })
    formAccum.set(pred.user_id, fa)
  }

  for (const g of bonusGrades) {
    const row = rows.get(g.user_id)
    if (!row || !g.is_correct) continue
    row.bonusPoints += bonusPointsFor(g.question_id)
  }

  for (const row of rows.values()) {
    row.total = row.points + row.bonusPoints
    row.recentForm = (formAccum.get(row.userId) ?? [])
      .sort((a, b) => a.kickoff.localeCompare(b.kickoff))
      .slice(-5)
      .map(x => x.outcome)
  }

  // Tie-break chain after total: bonus carries the highest weight, then the
  // outcome categories best-first. The trailing localeCompare only makes the
  // on-screen order of fully-tied players deterministic — it is deliberately
  // excluded from the rank comparison below and can never split a rank.
  const sorted = [...rows.values()].sort(
    (a, b) =>
      b.total       - a.total       ||
      b.bonusPoints - a.bonusPoints ||
      b.exact       - a.exact       ||
      b.correct_gd  - a.correct_gd  ||
      b.correct     - a.correct     ||
      a.wrong       - b.wrong       ||
      a.displayName.localeCompare(b.displayName)
  )

  // Competition ranking: same rank when all six tiebreakers are equal.
  let rank = 1
  for (let i = 0; i < sorted.length; i++) {
    if (i > 0) {
      const prev = sorted[i - 1]
      const cur  = sorted[i]
      const different =
        cur.total       !== prev.total       ||
        cur.bonusPoints !== prev.bonusPoints ||
        cur.exact       !== prev.exact       ||
        cur.correct_gd  !== prev.correct_gd  ||
        cur.correct     !== prev.correct     ||
        cur.wrong       !== prev.wrong
      if (different) rank = i + 1
    }
    sorted[i].rank = rank
  }

  return sorted
}
