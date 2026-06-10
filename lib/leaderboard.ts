import { scoreOutcome } from './scoring'
import type { Match, Prediction } from './types'

export interface LeaderboardRow {
  userId: string
  displayName: string
  favoriteTeam: string | null
  exact: number
  correct: number
  wrong: number
  scored: number
}

export interface LeaderboardProfile {
  id: string
  display_name: string
  favorite_team: string | null
}

/**
 * Tallies every player's prediction outcomes over matches with results.
 * Players with no scored predictions still appear (all zeros). A missed
 * prediction counts as nothing — not as wrong.
 * Sort: exact desc, correct desc, wrong asc, display name A–Z.
 */
export function computeLeaderboard(
  profiles: LeaderboardProfile[],
  predictions: Prediction[],
  matches: Match[]
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
      exact: 0,
      correct: 0,
      wrong: 0,
      scored: 0,
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
  }

  return [...rows.values()].sort(
    (a, b) =>
      b.exact - a.exact ||
      b.correct - a.correct ||
      a.wrong - b.wrong ||
      a.displayName.localeCompare(b.displayName)
  )
}
