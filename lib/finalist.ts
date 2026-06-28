import type { Match, FinalistPrediction } from './types'
import { FINALIST_QUESTION_IDS } from './bonus'

// Knockout "predict the two finalists" bonus: 25 pts per team that reaches the
// final → 50 / 25 / 0. Graded automatically from the final match once both
// finalists are known; no manual admin step.

/** The teams playing in the round of 32 — the pool a finalist can be picked from. */
function r32Teams(matches: Match[]): Set<string> {
  const teams = new Set<string>()
  for (const m of matches) {
    if (m.stage !== 'r32') continue
    if (m.home_team) teams.add(m.home_team)
    if (m.away_team) teams.add(m.away_team)
  }
  return teams
}

/** Pickable teams (round of 32 participants), name-sorted. */
export function finalistOptions(matches: Match[]): string[] {
  return [...r32Teams(matches)].sort((a, b) => a.localeCompare(b))
}

type ValidationResult =
  | { teamA: string; teamB: string }
  | { error: string }

/**
 * Validates a finalist pick. Both teams must be in the round of 32 and distinct.
 * Any two different R32 teams are allowed (no bracket-half restriction).
 */
export function validateFinalistPrediction(
  rawA: string | null | undefined,
  rawB: string | null | undefined,
  matches: Match[]
): ValidationResult {
  const teamA = (rawA ?? '').trim()
  const teamB = (rawB ?? '').trim()
  if (!teamA || !teamB) return { error: 'Pick both finalists.' }
  if (teamA === teamB) return { error: 'Pick two different teams.' }

  const teams = r32Teams(matches)
  if (!teams.has(teamA)) return { error: `${teamA} is not in the knockout bracket.` }
  if (!teams.has(teamB)) return { error: `${teamB} is not in the knockout bracket.` }

  return { teamA, teamB }
}

/** The two teams in the final, or [] until both are known. */
export function finalists(matches: Match[]): string[] {
  const final = matches.find(m => m.stage === 'final')
  return final && final.home_team && final.away_team ? [final.home_team, final.away_team] : []
}

export interface FinalistGrade {
  user_id: string
  question_id: number
  is_correct: boolean
}

/**
 * Turns finalist predictions into bonus grades the leaderboard already
 * understands: two sub-grades (25 pts each) per user, correct when that picked
 * team is in the final. Before the final is set, nobody is correct (0 pts).
 */
export function computeFinalistGrades(
  predictions: FinalistPrediction[],
  matches: Match[]
): FinalistGrade[] {
  const inFinal = new Set(finalists(matches))
  const [qa, qb] = FINALIST_QUESTION_IDS
  const out: FinalistGrade[] = []
  for (const p of predictions) {
    out.push({ user_id: p.user_id, question_id: qa, is_correct: inFinal.has(p.team_a) })
    out.push({ user_id: p.user_id, question_id: qb, is_correct: inFinal.has(p.team_b) })
  }
  return out
}
