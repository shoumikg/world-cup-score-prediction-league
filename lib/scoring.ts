import type { Match, Prediction, Stage } from '@/lib/types'

const STAGE_LABELS: Record<string, string> = {
  r32: 'R32', r16: 'R16', qf: 'QF', sf: 'SF', third: '3rd', final: 'Final',
}

export function stageLabel(stage: Stage | string): string {
  return STAGE_LABELS[stage] ?? stage.toUpperCase()
}

export type Outcome = 'exact' | 'correct_gd' | 'correct' | 'wrong'

/** Grades a prediction against the match result; null when no result yet. */
export function scoreOutcome(p: Prediction, m: Match): Outcome | null {
  if (m.home_score === null || m.away_score === null) return null
  if (p.home_pred === m.home_score && p.away_pred === m.away_score) return 'exact'
  const actualDir = Math.sign(m.home_score - m.away_score)
  const predDir   = Math.sign(p.home_pred  - p.away_pred)
  if (actualDir !== predDir) return 'wrong'
  const actualGD = Math.abs(m.home_score - m.away_score)
  const predGD   = Math.abs(p.home_pred  - p.away_pred)
  return predGD === actualGD ? 'correct_gd' : 'correct'
}

const OUTCOME_CLASSES: Record<Outcome, string> = {
  exact:      'bg-green-100 text-green-800',
  correct_gd: 'bg-orange-100 text-orange-700',
  correct:    'bg-yellow-100 text-yellow-800',
  wrong:      'bg-red-100 text-red-700',
}

export function scoreColor(p: Prediction, m: Match): string {
  const outcome = scoreOutcome(p, m)
  return outcome ? OUTCOME_CLASSES[outcome] : 'bg-gray-100 text-gray-700'
}
