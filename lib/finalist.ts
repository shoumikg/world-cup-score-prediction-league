import type { Match, FinalistPrediction } from './types'
import { bracketHalves } from './knockout'
import { FINALIST_QUESTION_IDS } from './bonus'

// Knockout "predict the two finalists" bonus: 25 pts per team that reaches the
// final → 50 / 25 / 0. Graded automatically from the final match once both
// finalists are known; no manual admin step.

export interface FinalistOption {
  team: string
  half: 'A' | 'B'
}

/** Teams that can be picked, each tagged with its half of the draw, name-sorted. */
export function finalistOptions(matches: Match[]): FinalistOption[] {
  return [...bracketHalves(matches).entries()]
    .map(([team, half]) => ({ team, half }))
    .sort((a, b) => a.team.localeCompare(b.team))
}

type ValidationResult =
  | { teamA: string; teamB: string }
  | { error: string }

/**
 * Validates a finalist pick against the live bracket. Both teams must be placed
 * in the round of 32, distinct, and from opposite halves of the draw (else they
 * would meet before the final and couldn't both be finalists).
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

  const halves = bracketHalves(matches)
  const ha = halves.get(teamA)
  const hb = halves.get(teamB)
  if (!ha) return { error: `${teamA} is not in the knockout bracket.` }
  if (!hb) return { error: `${teamB} is not in the knockout bracket.` }
  if (ha === hb) return { error: 'Those two teams are in the same half and would meet before the final.' }

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
