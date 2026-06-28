import type { Match, Prediction, Stage } from '@/lib/types'

const STAGE_LABELS: Record<string, string> = {
  r32: 'R32', r16: 'R16', qf: 'QF', sf: 'SF', third: '3rd', final: 'Final',
}

export function stageLabel(stage: Stage | string): string {
  return STAGE_LABELS[stage] ?? stage.toUpperCase()
}

export type Outcome = 'exact' | 'correct_gd' | 'correct' | 'wrong'

export const MATCH_POINTS: Record<'group' | 'knockout', Record<Outcome, number>> = {
  group:    { exact: 10, correct_gd: 5, correct: 3, wrong: 0 },
  knockout: { exact: 15, correct_gd: 8, correct: 5, wrong: 0 },
}

/** Points earned for a graded prediction. All non-group stages are knockout. */
export function matchPoints(outcome: Outcome, stage: Stage): number {
  return MATCH_POINTS[stage === 'group' ? 'group' : 'knockout'][outcome]
}

/**
 * The scoreline a prediction is graded against. Knockout matches are graded on
 * the 90-minute (regulation) score, before extra time / penalties:
 *   - once recorded, the regulation score is authoritative;
 *   - while the match is still in regular time (live, ≤ 90'), the running score
 *     IS the regulation score, so live provisional points keep working;
 *   - in extra time / penalties (or finished there) we wait for the recorded
 *     90-minute score rather than trust the ET-inclusive running total.
 * Group matches have no extra time, so the result is the regulation score.
 * Returns null when there is nothing to grade against yet.
 */
export function scoringScore(m: Match): { home: number; away: number } | null {
  // Loose != null so a missing field behaves like an absent (null) one.
  if (m.stage !== 'group') {
    if (m.reg_home_score != null && m.reg_away_score != null)
      return { home: m.reg_home_score, away: m.reg_away_score }
    if (
      m.status === 'live' &&
      (m.live_minute == null || m.live_minute <= 90) &&
      m.home_score != null && m.away_score != null
    )
      return { home: m.home_score, away: m.away_score }
    return null
  }
  if (m.home_score != null && m.away_score != null)
    return { home: m.home_score, away: m.away_score }
  return null
}

/**
 * The scoreline to display for a match. Settled knockout matches show the
 * 90-minute score they were graded on (with an AET/PEN badge alongside);
 * live and group matches show the running/actual score.
 */
export function displayScore(m: Match): { home: number | null; away: number | null } {
  if (
    m.stage !== 'group' && m.status !== 'live' &&
    m.reg_home_score != null && m.reg_away_score != null
  )
    return { home: m.reg_home_score, away: m.reg_away_score }
  return { home: m.home_score, away: m.away_score }
}

/** Grades a prediction against the match result; null when no result yet. */
export function scoreOutcome(p: Prediction, m: Match): Outcome | null {
  const s = scoringScore(m)
  if (!s) return null
  if (p.home_pred === s.home && p.away_pred === s.away) return 'exact'
  const actualDir = Math.sign(s.home - s.away)
  const predDir   = Math.sign(p.home_pred - p.away_pred)
  if (actualDir !== predDir) return 'wrong'
  const actualGD = Math.abs(s.home - s.away)
  const predGD   = Math.abs(p.home_pred - p.away_pred)
  return predGD === actualGD ? 'correct_gd' : 'correct'
}

export const OUTCOME_CLASSES: Record<Outcome, string> = {
  exact:      'bg-green-700 text-white',
  correct_gd: 'bg-green-100 text-green-800',
  correct:    'bg-yellow-100 text-yellow-800',
  wrong:      'bg-red-100 text-red-700',
}

export function scoreColor(p: Prediction, m: Match): string {
  const outcome = scoreOutcome(p, m)
  return outcome ? OUTCOME_CLASSES[outcome] : 'bg-gray-100 text-gray-700'
}
